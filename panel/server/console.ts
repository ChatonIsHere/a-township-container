import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import WebSocket from "ws";
import { config } from "./config.js";

// TavernLib serves the game console over a websocket on the RCON port and
// writes its token into tavern-config. This keeps one authenticated connection
// open for the whole panel: page consoles fan in here, commands go out with an
// id, and CommandResult replies are matched back by commandId.

interface Capture {
    resolve: (msg: ConsoleResult) => void;
    timer: NodeJS.Timeout;
}

export interface ConsoleResult {
    ok: boolean;
    text: string;
    result?: unknown;
}

const HISTORY_LIMIT = 500;

export class GameConsole extends EventEmitter {
    connected = false;
    lastBootAt: number | null = null;
    history: string[] = [];
    private ws: WebSocket | null = null;
    private cmdId = 0;
    private pending = new Map<number, Capture>();
    private stopped = false;

    start() {
        void this.connectLoop();
    }

    stop() {
        this.stopped = true;
        this.ws?.close();
    }

    private async connectLoop() {
        while (!this.stopped) {
            try {
                await this.connectOnce();
            } catch {
                // fall through to retry
            }
            this.setConnected(false);
            await sleep(5000);
        }
    }

    private connectOnce(): Promise<void> {
        return new Promise((resolve, reject) => {
            void (async () => {
                let token: string;
                try {
                    token = (await fs.readFile(config.files.consoleToken, "utf8")).trim();
                } catch {
                    return reject(new Error("no console token yet"));
                }
                const ws = new WebSocket(`ws://${config.gameHost}:${config.rconPort}`);
                this.ws = ws;
                let authed = false;
                ws.on("open", () => ws.send(token));
                ws.on("message", raw => {
                    const text = raw.toString();
                    if (!authed) {
                        if (text.includes("Connection Succeeded")) {
                            authed = true;
                            this.setConnected(true);
                            this.pushLine("[console connected]");
                        } else {
                            this.pushLine(`[console rejected: ${text}]`);
                            ws.close();
                        }
                        return;
                    }
                    this.handleMessage(text);
                });
                ws.on("error", () => {});
                ws.on("close", () => {
                    if (authed) this.pushLine("[console disconnected]");
                    for (const [, cap] of this.pending) {
                        clearTimeout(cap.timer);
                        cap.resolve({ ok: false, text: "Console disconnected" });
                    }
                    this.pending.clear();
                    resolve();
                });
            })();
        });
    }

    private setConnected(value: boolean) {
        if (value && !this.connected) this.lastBootAt = Date.now();
        if (this.connected !== value) {
            this.connected = value;
            this.emit("status", value);
        }
    }

    private pushLine(text: string) {
        for (const line of text.split("\n")) {
            this.history.push(line);
        }
        if (this.history.length > HISTORY_LIMIT) {
            this.history.splice(0, this.history.length - HISTORY_LIMIT);
        }
        this.emit("line", text);
    }

    private handleMessage(raw: string) {
        let msg: any;
        try {
            msg = JSON.parse(raw);
        } catch {
            this.pushLine(raw);
            return;
        }
        if (msg?.type === "CommandResult") {
            const rendered = renderCommandResult(msg.data);
            if (rendered) this.pushLine(rendered);
            const cap = this.pending.get(msg.commandId);
            if (cap) {
                this.pending.delete(msg.commandId);
                clearTimeout(cap.timer);
                cap.resolve({
                    ok: !msg.data?.Exception,
                    text: rendered,
                    result: msg.data?.Result,
                });
            }
        } else if (msg?.type === "SystemMessage") {
            this.pushLine(`[${msg.data}]`);
        } else {
            this.pushLine(raw);
        }
    }

    // game log lines from the tailer join the same stream and history
    logLine(text: string) {
        this.pushLine(text);
    }

    // fire and forget, echoed into the shared scrollback for every viewer
    send(content: string) {
        if (!this.connected || !this.ws) return;
        this.cmdId += 1;
        this.pushLine(`> ${content}`);
        this.ws.send(JSON.stringify({ id: this.cmdId, content }));
    }

    // send and wait for the matching CommandResult
    capture(content: string, timeoutMs = 20000): Promise<ConsoleResult> {
        if (!this.connected || !this.ws) {
            return Promise.resolve({ ok: false, text: "Console not connected" });
        }
        this.cmdId += 1;
        const id = this.cmdId;
        this.ws.send(JSON.stringify({ id, content }));
        return new Promise(resolve => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                resolve({ ok: false, text: "Command timed out" });
            }, timeoutMs);
            this.pending.set(id, { resolve, timer });
        });
    }
}

function sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms));
}

// rendering ported from console-bridge.py so output reads the same everywhere

// a .NET type name, which is all ResultString holds when nobody wrote a ToString
const TYPE_NAME = /^[A-Za-z_][\w`+]*(\.[\w`+]+)+(\[.*\])?$/;

function scalar(value: unknown): string {
    if (typeof value === "boolean") return value ? "true" : "false";
    return value == null ? "" : String(value);
}

function isTable(value: unknown): value is Record<string, unknown>[] {
    if (!Array.isArray(value) || value.length === 0) return false;
    if (!value.every(row => row && typeof row === "object" && !Array.isArray(row))) return false;
    const keys = JSON.stringify(Object.keys(value[0]));
    return value.every(
        row => JSON.stringify(Object.keys(row)) === keys &&
            Object.values(row).every(cell => typeof cell !== "object" || cell === null),
    );
}

function renderTable(rows: Record<string, unknown>[]): string {
    const columns = Object.keys(rows[0]);
    const cells = rows.map(row => columns.map(c => scalar(row[c])));
    const widths = columns.map((c, i) => Math.max(c.length, ...cells.map(r => r[i].length)));
    return [columns, ...cells]
        .map(line => line.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd())
        .join("\n");
}

function renderValue(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "string") return value.replace(/\n+$/, "");
    if (typeof value !== "object") return scalar(value);
    if (Array.isArray(value) && value.length === 0) return "(none)";
    if (isTable(value)) return renderTable(value);
    return JSON.stringify(value, null, 2);
}

function renderCommandResult(data: any): string {
    if (data == null || typeof data !== "object") return renderValue(data);
    const exception = data.Exception;
    if (exception) {
        if (exception && typeof exception === "object") {
            const described = [exception.ClassName, exception.Message].filter(p => typeof p === "string" && p).join(": ");
            if (described) return `[error] ${described}`;
        }
        return `[error] ${renderValue(exception)}`;
    }
    const rs = data.ResultString;
    if (typeof rs === "string" && rs.trim() && !TYPE_NAME.test(rs.trim())) {
        return rs.replace(/\n+$/, "");
    }
    if ("Result" in data) {
        const rendered = renderValue(data.Result);
        if (rendered) return rendered;
    }
    return scalar(rs).replace(/\n+$/, "");
}

export const gameConsole = new GameConsole();
