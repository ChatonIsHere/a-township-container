import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { config } from "./config.js";
import { gameConsole } from "./console.js";
import { startLogTail } from "./logtail.js";
import { registerRoutes } from "./routes.js";
import { startScheduler } from "./scheduler.js";

if (!config.password) {
    console.error("PANEL_PASSWORD is not set, refusing to start");
    process.exit(1);
}

const app = Fastify({ logger: true });

// sessions die with the process, which is fine for a single admin panel
const cookieSecret = process.env.PANEL_SECRET ?? randomBytes(32).toString("hex");
const SESSION_MAX_AGE_S = 7 * 24 * 3600;

await app.register(fastifyCookie, { secret: cookieSecret });
await app.register(fastifyWebsocket);

const passwordDigest = createHash("sha256").update(config.password).digest();

function passwordMatches(attempt: string): boolean {
    const digest = createHash("sha256").update(attempt).digest();
    return timingSafeEqual(digest, passwordDigest);
}

// mirror the launcher's login throttle: 8 attempts per minute per address
const attempts = new Map<string, { count: number; at: number }>();

function throttled(ip: string): boolean {
    const now = Date.now();
    const entry = attempts.get(ip);
    if (!entry || now - entry.at > 60000) {
        attempts.set(ip, { count: 1, at: now });
        return false;
    }
    entry.count += 1;
    return entry.count > 8;
}

app.post<{ Body: { password?: string } }>("/api/login", async (req, reply) => {
    if (throttled(req.ip)) {
        return reply.code(429).send({ error: "Too many attempts, wait a minute" });
    }
    if (!passwordMatches(String(req.body?.password ?? ""))) {
        return reply.code(401).send({ error: "Wrong password" });
    }
    reply.setCookie("session", String(Date.now()), {
        signed: true,
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: SESSION_MAX_AGE_S,
    });
    return { ok: true };
});

app.post("/api/logout", async (_req, reply) => {
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
});

function hasValidSession(cookies: Record<string, string | undefined>): boolean {
    const raw = cookies.session;
    if (!raw) return false;
    const unsigned = app.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return false;
    const issued = Number(unsigned.value);
    return Number.isFinite(issued) && Date.now() - issued < SESSION_MAX_AGE_S * 1000;
}

// everything under /api and /ws needs a session, except login itself
app.addHook("onRequest", async (req, reply) => {
    const url = req.url.split("?")[0];
    if (!url.startsWith("/api/") && !url.startsWith("/ws/")) return;
    if (url === "/api/login") return;
    if (!hasValidSession(req.cookies)) {
        return reply.code(401).send({ error: "Not logged in" });
    }
});

registerRoutes(app);

// live console: history on connect, then a shared line stream; incoming
// messages are commands typed into the page console
app.get("/ws/console", { websocket: true }, socket => {
    socket.send(JSON.stringify({ type: "history", lines: gameConsole.history, connected: gameConsole.connected }));
    const onLine = (text: string) => socket.send(JSON.stringify({ type: "line", text }));
    const onStatus = (connected: boolean) => socket.send(JSON.stringify({ type: "status", connected }));
    gameConsole.on("line", onLine);
    gameConsole.on("status", onStatus);
    socket.on("message", raw => {
        try {
            const msg = JSON.parse(raw.toString());
            if (typeof msg?.content === "string" && msg.content.trim()) {
                gameConsole.send(msg.content.trim());
            }
        } catch {
            // ignore malformed frames
        }
    });
    socket.on("close", () => {
        gameConsole.off("line", onLine);
        gameConsole.off("status", onStatus);
    });
});

// built frontend, served in the container image; in dev vite serves it instead
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
if (existsSync(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
        if (req.url.startsWith("/api/") || req.url.startsWith("/ws/")) {
            return reply.code(404).send({ error: "Not found" });
        }
        return reply.sendFile("index.html");
    });
}

gameConsole.start();
startScheduler();
if (config.gameLogFile) startLogTail(config.gameLogFile);

app.listen({ port: config.port, host: "0.0.0.0" }).catch(err => {
    app.log.error(err);
    process.exit(1);
});
