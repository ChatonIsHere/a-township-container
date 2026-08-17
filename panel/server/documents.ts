import { promises as fs } from "node:fs";
import path from "node:path";

// per-file promise chain so concurrent requests never interleave a read-modify-write
const locks = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(key) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    locks.set(key, run.catch(() => undefined));
    return run;
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
    try {
        return JSON.parse(await fs.readFile(file, "utf8")) as T;
    } catch {
        return fallback;
    }
}

// temp file in the same directory then rename, so TavernLib never sees a half-written file
export async function writeJson(file: string, data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, file);
}

export async function updateJson<T>(file: string, fallback: T, mutate: (doc: T) => void): Promise<T> {
    return withLock(file, async () => {
        const doc = await readJson(file, fallback);
        mutate(doc);
        await writeJson(file, doc);
        return doc;
    });
}

// shapes shared with TavernLib and TavernLauncher, keep field names exact

export interface UserEntry {
    user_id: number;
    token: string;
    registered_from?: string;
    roles?: string[];
}

export interface UsersDoc {
    users: Record<string, UserEntry>;
    whitelist: { usernames: string[]; ips: string[] };
    blacklist: { usernames: string[]; user_ids: number[]; ips: string[] };
}

export function emptyUsersDoc(): UsersDoc {
    return {
        users: {},
        whitelist: { usernames: [], ips: [] },
        blacklist: { usernames: [], user_ids: [], ips: [] },
    };
}

// TavernLib rewrites users.json from this exact model on every join, so any
// section a partial file is missing gets normalised in before we edit it
export function normaliseUsersDoc(doc: Partial<UsersDoc>): asserts doc is UsersDoc {
    doc.users ??= {};
    doc.whitelist ??= { usernames: [], ips: [] };
    doc.whitelist.usernames ??= [];
    doc.whitelist.ips ??= [];
    doc.blacklist ??= { usernames: [], user_ids: [], ips: [] };
    doc.blacklist.usernames ??= [];
    doc.blacklist.user_ids ??= [];
    doc.blacklist.ips ??= [];
}

export interface WhitelistRequest {
    username: string;
    ip: string;
    applied_at: string;
}

export interface ModsList {
    schema: number;
    repos: string[];
    mods: string[];
}

export interface ServerSettings {
    name: string;
    max_players: number;
    whitelist_enabled: boolean;
    enforce_ip_limit: boolean;
    community_listed: boolean;
    quest_scene: boolean;
    region: string;
    password_hash: string;
    public_hostname: string;
    auto_reboot_enabled: boolean;
    auto_reboot_mode: "time" | "interval";
    auto_reboot_hour: number;
    auto_reboot_minute: number;
    auto_reboot_interval: number;
}

export const VALID_REGIONS = ["EU", "NA", "SA", "Asia", "Oceania", "Africa"];

const NAME_RE = /^[A-Za-z0-9 _-]+$/;
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

// same validation TavernLauncher applies on every load, so a bad value never
// reaches the ping response other players see
export function normaliseSettings(raw: Partial<ServerSettings>): ServerSettings {
    const name = String(raw.name ?? "").trim();
    const maxPlayers = Number(raw.max_players);
    const region = VALID_REGIONS.find(r => r.toLowerCase() === String(raw.region ?? "").trim().toLowerCase()) ?? "unknown";
    const pwHash = String(raw.password_hash ?? "");
    let hostname = String(raw.public_hostname ?? "").trim().toLowerCase().replace(/\.+$/, "");
    if (hostname && !HOSTNAME_RE.test(hostname)) hostname = "";
    return {
        name: name && name.length <= 32 && NAME_RE.test(name) ? name : "My Tavern Server",
        max_players: Number.isFinite(maxPlayers) ? Math.min(999, Math.max(1, Math.trunc(maxPlayers))) : 24,
        whitelist_enabled: Boolean(raw.whitelist_enabled),
        enforce_ip_limit: raw.enforce_ip_limit !== false,
        community_listed: Boolean(raw.community_listed),
        quest_scene: Boolean(raw.quest_scene),
        region,
        password_hash: /^[0-9a-f]{64}$/.test(pwHash) ? pwHash : "",
        public_hostname: hostname,
        auto_reboot_enabled: Boolean(raw.auto_reboot_enabled),
        auto_reboot_mode: raw.auto_reboot_mode === "interval" ? "interval" : "time",
        auto_reboot_hour: clampInt(raw.auto_reboot_hour, 0, 23, 4),
        auto_reboot_minute: clampInt(raw.auto_reboot_minute, 0, 59, 0),
        auto_reboot_interval: clampInt(raw.auto_reboot_interval, 1, 720, 6),
    };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
