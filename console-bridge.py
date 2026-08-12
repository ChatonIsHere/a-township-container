#!/usr/bin/env python3
"""
Bridges TavernLib's WebSocket console onto stdin/stdout so a game panel's console can drive it.

TavernLib closes the game's built-in remote console and serves its own WebSocket one on the RCON
port instead, authenticated with the console token it writes next to its configs. The panels only
speak stdin/stdout, so this reads typed commands from stdin and prints console output to stdout,
where it lands in the panel console alongside the MelonLoader log tail.

Deliberately stdlib-only: the images would otherwise need websocket-client from pip, which is
awkward on the Debian base the AMP image builds on.
"""

import base64
import json
import os
import socket
import struct
import sys
import threading
import time

HOST = os.environ.get("TAVERN_CONSOLE_HOST", "127.0.0.1")
PORT = int(os.environ.get("RCON_PORT", "1760"))
TOKEN_FILE = os.environ.get("TAVERN_CONSOLE_TOKEN_FILE", "")
# the game takes minutes to boot, and the console port only opens near the end of that
CONNECT_TIMEOUT = int(os.environ.get("TAVERN_CONSOLE_TIMEOUT", "900"))

OP_TEXT, OP_BINARY, OP_CLOSE, OP_PING, OP_PONG = 0x1, 0x2, 0x8, 0x9, 0xA


def log(msg):
    print(f"[console] {msg}", flush=True)


class WebSocket:
    """Minimal client: text frames, masking, ping/pong, close. No extensions, no fragmentation."""

    def __init__(self, sock):
        self.sock = sock
        self.buf = b""
        self._send_lock = threading.Lock()

    @classmethod
    def connect(cls, host, port, timeout=10):
        sock = socket.create_connection((host, port), timeout=timeout)
        sock.settimeout(timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        handshake = (
            f"GET / HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n"
            f"\r\n"
        )
        sock.sendall(handshake.encode())

        # read just the headers, keeping anything the server sent immediately after them
        data = b""
        while b"\r\n\r\n" not in data:
            chunk = sock.recv(4096)
            if not chunk:
                raise ConnectionError("server closed during handshake")
            data += chunk
        head, _, rest = data.partition(b"\r\n\r\n")
        status = head.split(b"\r\n", 1)[0].decode(errors="replace")
        if "101" not in status:
            raise ConnectionError(f"handshake rejected: {status}")

        ws = cls(sock)
        ws.buf = rest
        return ws

    def _recv_exact(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("connection closed")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def recv(self):
        """Returns a text payload, or None when the peer closes."""
        while True:
            b1, b2 = self._recv_exact(2)
            opcode = b1 & 0x0F
            length = b2 & 0x7F
            if length == 126:
                length = struct.unpack(">H", self._recv_exact(2))[0]
            elif length == 127:
                length = struct.unpack(">Q", self._recv_exact(8))[0]
            # servers must not mask, but tolerate it rather than desync the stream
            mask = self._recv_exact(4) if b2 & 0x80 else None
            payload = self._recv_exact(length) if length else b""
            if mask:
                payload = bytes(c ^ mask[i % 4] for i, c in enumerate(payload))

            if opcode == OP_CLOSE:
                return None
            if opcode == OP_PING:
                self._send_frame(OP_PONG, payload)
                continue
            if opcode == OP_PONG:
                continue
            if opcode in (OP_TEXT, OP_BINARY):
                return payload.decode("utf-8", errors="replace")
            # anything else (continuation frames included) isn't something the console sends

    def _send_frame(self, opcode, payload):
        mask = os.urandom(4)
        masked = bytes(c ^ mask[i % 4] for i, c in enumerate(payload))
        header = bytes([0x80 | opcode])
        n = len(payload)
        if n < 126:
            header += bytes([0x80 | n])
        elif n < 65536:
            header += bytes([0x80 | 126]) + struct.pack(">H", n)
        else:
            header += bytes([0x80 | 127]) + struct.pack(">Q", n)
        with self._send_lock:
            self.sock.sendall(header + mask + masked)

    def send_text(self, text):
        self._send_frame(OP_TEXT, text.encode())

    def close(self):
        try:
            self._send_frame(OP_CLOSE, b"")
        except OSError:
            pass
        try:
            self.sock.close()
        except OSError:
            pass


def read_token(path, deadline):
    """TavernLib writes this during startup, so it won't exist when we first look."""
    while time.time() < deadline:
        try:
            token = open(path, encoding="utf-8").read().strip()
            if token:
                return token
        except OSError:
            pass
        time.sleep(2)
    return None


def scalar(value):
    """JSON's true/false read as Python's True/False otherwise, which isn't what the game said."""
    if isinstance(value, bool):
        return "true" if value else "false"
    return "" if value is None else str(value)


def is_table(value):
    """A list of flat records sharing one set of keys - what the list commands return."""
    if not isinstance(value, list) or not value:
        return False
    if not all(isinstance(row, dict) and row for row in value):
        return False
    keys = list(value[0].keys())
    if any(list(row.keys()) != keys for row in value):
        return False
    return all(not isinstance(cell, (dict, list)) for row in value for cell in row.values())


def render_table(rows):
    """The game logs these as a table for its own console, so match that rather than dumping JSON."""
    columns = list(rows[0].keys())
    cells = [[scalar(row[column]) for column in columns] for row in rows]
    widths = [max(len(column), *(len(row[i]) for row in cells)) for i, column in enumerate(columns)]
    lines = [columns] + cells
    return "\n".join(
        "  ".join(cell.ljust(width) for cell, width in zip(line, widths)).rstrip() for line in lines
    )


def render_value(value):
    """Render a deserialised Result by its shape - it can be anything a command chose to return."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value.rstrip("\n")
    if isinstance(value, (bool, int, float)):
        return scalar(value)
    if isinstance(value, list) and not value:
        return "(none)"
    if is_table(value):
        return render_table(value)
    try:
        return json.dumps(value, indent=2)
    except (TypeError, ValueError):
        return str(value)


def render_exception(exception):
    """A command that threw carries the failure here and leaves ResultString empty."""
    if isinstance(exception, dict):
        # Newtonsoft serialises exceptions through ISerializable, hence the ClassName spelling
        described = ": ".join(
            part
            for part in (exception.get("ClassName"), exception.get("Message"))
            if isinstance(part, str) and part
        )
        if described:
            return described
        try:
            return json.dumps(exception, indent=2)
        except (TypeError, ValueError):
            pass
    return str(exception)


def format_message(raw):
    """Render console traffic the way the launcher's console does, so output reads the same."""
    try:
        msg = json.loads(raw)
    except ValueError:
        return raw.rstrip("\n")
    if not isinstance(msg, dict):
        return raw.rstrip("\n")

    kind = msg.get("type", "")
    data = msg.get("data")

    if kind == "CommandResult":
        if not isinstance(data, dict):
            return "" if data is None else str(data).rstrip("\n")

        exception = data.get("Exception")
        if exception:
            return f"[error] {render_exception(exception)}"

        # a command returning a value answers with CommandResult<T>, whose ResultString is only
        # Result.ToString() - a bare type name for anything that isn't already a string, which is
        # where System.Collections.Generic.List`1[System.Object] came from. The real payload is
        # serialised alongside it in Result, so render that instead and only fall back to
        # ResultString for the plain CommandResult, which has no Result field at all
        if "Result" in data:
            rendered = render_value(data.get("Result"))
            if rendered:
                return rendered
        return str(data.get("ResultString") or "").rstrip("\n")

    if kind == "SystemMessage":
        return f"[console] {data}"
    if data is not None:
        return f"[{kind}] {data}" if kind else str(data)
    return raw.rstrip("\n")


def pump_stdin(ws):
    """Panel console input arrives on stdin, one command per line."""
    cmd_id = 0
    for line in sys.stdin:
        cmd = line.strip()
        if not cmd:
            continue
        cmd_id += 1
        # neither panel echoes what was typed, so without this the console shows replies with no
        # sign of the command that produced them - print before sending so it stays in order
        print(f"> {cmd}", flush=True)
        try:
            ws.send_text(json.dumps({"id": cmd_id, "content": cmd}))
        except OSError as exc:
            log(f"could not send command: {exc}")
            return
    # stdin closing means the panel is done with us, not that the server should stop


def main():
    if not TOKEN_FILE:
        log("TAVERN_CONSOLE_TOKEN_FILE is not set, console input is unavailable")
        return 1

    deadline = time.time() + CONNECT_TIMEOUT

    token = read_token(TOKEN_FILE, deadline)
    if not token:
        log(f"no console token appeared at {TOKEN_FILE}, console input is unavailable")
        return 1

    ws = None
    while time.time() < deadline and ws is None:
        try:
            ws = WebSocket.connect(HOST, PORT)
        except (OSError, ConnectionError):
            time.sleep(3)
    if ws is None:
        log(f"console did not open on port {PORT}, console input is unavailable")
        return 1

    try:
        ws.send_text(token)
        reply = ws.recv()
        if reply is None:
            log("console closed the connection during authentication")
            return 1
        rendered = format_message(reply)
        if "Connection Succeeded" not in reply:
            log(f"console rejected the token: {rendered}")
            return 1
        log(f"connected, type commands into the panel console ({rendered})")

        threading.Thread(target=pump_stdin, args=(ws,), daemon=True).start()

        # the socket has no timeout for streaming, output arrives whenever it arrives
        ws.sock.settimeout(None)
        while True:
            raw = ws.recv()
            if raw is None:
                log("console disconnected")
                return 0
            text = format_message(raw)
            if text:
                print(text, flush=True)
    except (OSError, ConnectionError) as exc:
        log(f"console connection lost: {exc}")
        return 0
    finally:
        ws.close()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)
