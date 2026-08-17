import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import type { FastifyInstance } from "fastify";
import { config } from "./config.js";
import { gameConsole } from "./console.js";
import {
    emptyUsersDoc, normaliseSettings, normaliseUsersDoc, readJson, updateJson,
    type ModsList, type ServerSettings, type UsersDoc, type WhitelistRequest,
} from "./documents.js";
import {
    fetchIndex, listInstalled, listRepos, repoShorthand, validateModEntry, validateRepoIndex,
} from "./mods.js";
import commands from "./commands.json";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function equalsIgnoreCase(list: string[], value: string) {
    return list.some(v => v.toLowerCase() === value.toLowerCase());
}

async function readRequests(): Promise<WhitelistRequest[]> {
    const doc = await readJson<{ requests?: WhitelistRequest[] }>(config.files.requests, {});
    return Array.isArray(doc.requests) ? doc.requests : [];
}

export function registerRoutes(app: FastifyInstance) {
    // dashboard summary
    app.get("/api/status", async () => {
        const settings = normaliseSettings(await readJson<Partial<ServerSettings>>(config.files.settings, {}));
        let playerCount: number | null = null;
        let playerLimit: number | null = null;
        try {
            const stat = await fs.stat(config.files.playerStatus);
            if (Date.now() - stat.mtimeMs < 60000) {
                const status = await readJson<{ player_count?: number; player_limit?: number }>(config.files.playerStatus, {});
                if (typeof status.player_count === "number") playerCount = status.player_count;
                if (typeof status.player_limit === "number") playerLimit = status.player_limit;
            }
        } catch {
            // status file missing means the server is not up yet
        }
        return {
            online: gameConsole.connected,
            serverName: settings.name,
            playerCount,
            playerLimit,
            bootedAt: gameConsole.lastBootAt,
            pendingApplications: (await readRequests()).length,
        };
    });

    // saves the world first, then quits; the container restart policy boots it back up
    app.post("/api/server/restart", async (_req, reply) => {
        if (!gameConsole.connected) {
            return reply.code(409).send({ error: "Server console is not connected" });
        }
        await gameConsole.capture("save", 60000);
        gameConsole.send("quit");
        return { ok: true };
    });

    app.get("/api/commands", async () => commands);

    // players

    app.get("/api/players", async () => {
        const doc = await readJson<UsersDoc>(config.files.users, emptyUsersDoc());
        normaliseUsersDoc(doc);
        return Object.entries(doc.users).map(([username, entry]) => ({
            username,
            user_id: entry.user_id,
            registered_from: entry.registered_from ?? "",
            roles: entry.roles ?? [],
            has_token: Boolean(entry.token),
        }));
    });

    app.post<{ Params: { name: string }; Body: { ban?: boolean } }>("/api/players/:name/kick", async (req, reply) => {
        const name = req.params.name;
        if (req.body?.ban) {
            await updateJson(config.files.users, emptyUsersDoc(), doc => {
                normaliseUsersDoc(doc);
                if (!equalsIgnoreCase(doc.blacklist.usernames, name)) doc.blacklist.usernames.push(name);
            });
        }
        if (!gameConsole.connected) {
            return reply.code(req.body?.ban ? 200 : 409).send({
                ok: Boolean(req.body?.ban),
                text: req.body?.ban ? "Added to blacklist. Server offline, no live kick sent." : "Server console is not connected",
            });
        }
        const res = await gameConsole.capture(`player ${req.body?.ban ? "ban" : "kick"} "${name}"`);
        return { ok: res.ok, text: res.text };
    });

    app.put<{ Params: { name: string }; Body: { user_id?: number; roles?: string[]; reset_token?: boolean } }>(
        "/api/players/:name",
        async (req, reply) => {
            const name = req.params.name.toLowerCase();
            let found = false;
            await updateJson(config.files.users, emptyUsersDoc(), doc => {
                normaliseUsersDoc(doc);
                const entry = doc.users[name];
                if (!entry) return;
                found = true;
                if (typeof req.body.user_id === "number") entry.user_id = Math.trunc(req.body.user_id);
                if (Array.isArray(req.body.roles)) {
                    entry.roles = req.body.roles.map(r => String(r).trim()).filter(Boolean);
                }
                if (req.body.reset_token) entry.token = "";
            });
            if (!found) return reply.code(404).send({ error: "No such player" });
            return { ok: true };
        },
    );

    app.post("/api/players/reset-tokens", async () => {
        let count = 0;
        await updateJson(config.files.users, emptyUsersDoc(), doc => {
            normaliseUsersDoc(doc);
            for (const entry of Object.values(doc.users)) {
                entry.token = "";
                count += 1;
            }
        });
        return { ok: true, count };
    });

    // whitelist and blacklist

    app.get("/api/access", async () => {
        const doc = await readJson<UsersDoc>(config.files.users, emptyUsersDoc());
        normaliseUsersDoc(doc);
        const comments = await readJson<Record<string, string>>(config.files.comments, {});
        return { whitelist: doc.whitelist, blacklist: doc.blacklist, comments };
    });

    app.post<{ Body: { list: "whitelist" | "blacklist"; kind: "username" | "ip"; value: string } }>(
        "/api/access/entries",
        async (req, reply) => {
            const { list, kind, value } = req.body ?? {};
            const trimmed = String(value ?? "").trim();
            if (!trimmed || (list !== "whitelist" && list !== "blacklist") || (kind !== "username" && kind !== "ip")) {
                return reply.code(400).send({ error: "Bad entry" });
            }
            await updateJson(config.files.users, emptyUsersDoc(), doc => {
                normaliseUsersDoc(doc);
                const target = kind === "username" ? doc[list].usernames : doc[list].ips;
                if (kind === "username" ? !equalsIgnoreCase(target, trimmed) : !target.includes(trimmed)) {
                    target.push(trimmed);
                }
            });
            return { ok: true };
        },
    );

    app.post<{ Body: { list: "whitelist" | "blacklist"; kind: "username" | "ip"; value: string } }>(
        "/api/access/remove",
        async (req, reply) => {
            const { list, kind, value } = req.body ?? {};
            if ((list !== "whitelist" && list !== "blacklist") || (kind !== "username" && kind !== "ip")) {
                return reply.code(400).send({ error: "Bad entry" });
            }
            await updateJson(config.files.users, emptyUsersDoc(), doc => {
                normaliseUsersDoc(doc);
                if (kind === "username") {
                    doc[list].usernames = doc[list].usernames.filter(v => v.toLowerCase() !== value.toLowerCase());
                } else {
                    doc[list].ips = doc[list].ips.filter(v => v !== value);
                }
            });
            if (list === "whitelist") {
                await updateJson<Record<string, string>>(config.files.comments, {}, doc => {
                    delete doc[value];
                });
            }
            return { ok: true };
        },
    );

    app.post<{ Body: { value: string; comment: string } }>("/api/access/comment", async req => {
        const { value, comment } = req.body ?? {};
        await updateJson<Record<string, string>>(config.files.comments, {}, doc => {
            if (comment) doc[value] = comment;
            else delete doc[value];
        });
        return { ok: true };
    });

    // whitelist applications, written by TavernLib when players apply in game

    app.get("/api/applications", async () => readRequests());

    app.post<{ Body: { index: number; approve: boolean } }>("/api/applications/resolve", async (req, reply) => {
        const { index, approve } = req.body ?? {};
        const requests = await readRequests();
        if (typeof index !== "number" || index < 0 || index >= requests.length) {
            return reply.code(400).send({ error: "Bad application index" });
        }
        const request = requests[index];
        requests.splice(index, 1);
        if (approve) {
            await updateJson(config.files.users, emptyUsersDoc(), doc => {
                normaliseUsersDoc(doc);
                if (request.username && !equalsIgnoreCase(doc.whitelist.usernames, request.username)) {
                    doc.whitelist.usernames.push(request.username);
                }
                if (request.ip && !doc.whitelist.ips.includes(request.ip)) {
                    doc.whitelist.ips.push(request.ip);
                }
            });
            if (request.ip && request.username) {
                await updateJson<Record<string, string>>(config.files.comments, {}, doc => {
                    doc[request.ip] = request.username;
                });
            }
        }
        await updateJson<{ requests: WhitelistRequest[] }>(config.files.requests, { requests: [] }, doc => {
            doc.requests = requests;
        });
        return { ok: true };
    });

    // server settings

    app.get("/api/settings", async () => {
        const settings = normaliseSettings(await readJson<Partial<ServerSettings>>(config.files.settings, {}));
        return { ...settings, password_set: Boolean(settings.password_hash), password_hash: undefined };
    });

    app.put<{ Body: Partial<ServerSettings> & { password?: string; clear_password?: boolean } }>(
        "/api/settings",
        async req => {
            const body = req.body ?? {};
            let saved: ServerSettings | null = null;
            await updateJson<Partial<ServerSettings>>(config.files.settings, {}, doc => {
                const next = normaliseSettings({ ...doc, ...body, password_hash: doc.password_hash });
                // clients send sha256(password), the file stores sha256 of that hex
                if (body.clear_password) next.password_hash = "";
                else if (body.password) next.password_hash = sha256(sha256(body.password));
                Object.assign(doc, next);
            });
            saved = normaliseSettings(await readJson<Partial<ServerSettings>>(config.files.settings, {}));
            return { ...saved, password_set: Boolean(saved.password_hash), password_hash: undefined };
        },
    );

    // mods

    app.get("/api/mods", async () => {
        const modslist = await readJson<ModsList>(config.files.modslist, { schema: 1, repos: [], mods: [] });
        return {
            modslist,
            repos: await listRepos(),
            installed: await listInstalled(),
            online: gameConsole.connected,
        };
    });

    app.put<{ Body: { mods: string[] } }>("/api/mods/list", async (req, reply) => {
        const mods = req.body?.mods;
        if (!Array.isArray(mods) || mods.some(m => !validateModEntry(String(m)))) {
            return reply.code(400).send({ error: "Entries must look like Author.Mod or Author.Mod@1.2.0" });
        }
        const repos = await listRepos();
        await updateJson<ModsList>(config.files.modslist, { schema: 1, repos: [], mods: [] }, doc => {
            doc.schema = 1;
            doc.repos = repos.map(r => r.shorthand);
            doc.mods = [...new Set(mods.map(String))];
        });
        return { ok: true };
    });

    app.get<{ Querystring: { force?: string } }>("/api/mods/index", async req => {
        return fetchIndex(req.query.force === "1");
    });

    app.post<{ Body: { url: string } }>("/api/mods/repos", async (req, reply) => {
        const url = String(req.body?.url ?? "").trim().replace(/\/+$/, "");
        if (!/^https?:\/\//.test(url)) {
            return reply.code(400).send({ error: "A repository URL must start with http:// or https://" });
        }
        // prefer the live command so TavernLib stays the writer of its own allow-list
        if (gameConsole.connected) {
            const res = await gameConsole.capture(`modmanager addrepo ${url}`);
            return { ok: res.ok && res.text.startsWith("Added"), text: res.text };
        }
        try {
            await validateRepoIndex(url);
        } catch (e) {
            return reply.code(400).send({ error: `Could not add repo: ${(e as Error).message}` });
        }
        const shorthand = repoShorthand(url);
        let conflict = "";
        await updateJson<{ repos: Record<string, string> }>(config.files.modRepos, { repos: {} }, doc => {
            doc.repos ??= {};
            const existing = doc.repos[shorthand];
            if (existing && existing.replace(/\/+$/, "") !== url) {
                conflict = `'${shorthand}' already points at ${existing}; remove it first`;
                return;
            }
            doc.repos[shorthand] = url;
        });
        if (conflict) return reply.code(400).send({ error: conflict });
        return { ok: true, text: `Added '${shorthand}' (${url})` };
    });

    app.post<{ Body: { reference: string } }>("/api/mods/repos/remove", async (req, reply) => {
        const reference = String(req.body?.reference ?? "").trim();
        if (!reference) return reply.code(400).send({ error: "Missing repo reference" });
        if (gameConsole.connected) {
            const res = await gameConsole.capture(`modmanager removerepo ${reference}`);
            return { ok: res.ok && res.text.startsWith("Removed"), text: res.text };
        }
        await updateJson<{ repos: Record<string, string> }>(config.files.modRepos, { repos: {} }, doc => {
            doc.repos ??= {};
            for (const [key, value] of Object.entries(doc.repos)) {
                if (key === reference || value.replace(/\/+$/, "") === reference.replace(/\/+$/, "")) {
                    delete doc.repos[key];
                }
            }
        });
        return { ok: true, text: `Removed ${reference}` };
    });

    app.post<{ Body: { name: string; enable: boolean } }>("/api/mods/toggle", async (req, reply) => {
        if (!gameConsole.connected) return reply.code(409).send({ error: "Server console is not connected" });
        const verb = req.body?.enable ? "enable" : "disable";
        const res = await gameConsole.capture(`modmanager ${verb} "${req.body?.name ?? ""}"`);
        return { ok: res.ok, text: res.text };
    });

    app.post("/api/mods/cleanup", async (_req, reply) => {
        if (!gameConsole.connected) return reply.code(409).send({ error: "Server console is not connected" });
        const res = await gameConsole.capture("modmanager cleanup", 60000);
        return { ok: res.ok, text: res.text };
    });
}
