import { promises as fs } from "node:fs";
import { gameConsole } from "./console.js";

// Tails MelonLoader's Latest.log into the shared console stream, the same
// unified console the egg and amp containers get: game log lines interleaved
// with console output. The mount is read only and optional; without it this
// polls a missing file forever and stays silent.

const POLL_MS = 500;
const MAX_CHUNK = 256 * 1024;

export function startLogTail(file: string) {
    let pos: number | null = null;
    let remainder = "";

    async function poll() {
        let size: number;
        try {
            size = (await fs.stat(file)).size;
        } catch {
            pos = null;
            remainder = "";
            return;
        }
        if (pos === null) {
            // first sighting: start at the end rather than replaying an old boot
            pos = size;
            return;
        }
        if (size < pos) {
            // MelonLoader truncates on restart, replay the fresh boot from the top
            pos = 0;
            remainder = "";
        }
        if (size === pos) return;

        const handle = await fs.open(file, "r");
        try {
            const length = Math.min(size - pos, MAX_CHUNK);
            const { bytesRead, buffer } = await handle.read(Buffer.alloc(length), 0, length, pos);
            pos += bytesRead;
            remainder += buffer.toString("utf8", 0, bytesRead);
        } finally {
            await handle.close();
        }

        const lines = remainder.split("\n");
        remainder = lines.pop() ?? "";
        for (const line of lines) {
            const text = line.replace(/\r$/, "");
            if (text) gameConsole.logLine(text);
        }
    }

    setInterval(() => {
        poll().catch(() => undefined);
    }, POLL_MS);
}
