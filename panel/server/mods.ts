import { config } from "./config.js";
import { readJson } from "./documents.js";
import { gameConsole } from "./console.js";

// Mod management is split across three owners and the panel respects all of them:
// - modslist.json is the desired set TavernLib's reconciler applies at boot
// - mod_repos.json is the pull allow-list, normally edited via modmanager addrepo
// - Mods/ on disk belongs to TavernLib alone, the panel only reads state via
//   "modmanager list" over the console

export const DEFAULT_REPO = "https://raw.githubusercontent.com/ChatonIsHere/CommunityMods/main";

// matches the id checks in TavernLauncher's pins.py: Author.Repo plus optional exact version
const MOD_ENTRY_RE = /^[^@\s/\\:]+\.[^@\s/\\:]+(@\d+\.\d+\.\d+)?$/;

export function validateModEntry(entry: string): boolean {
    return MOD_ENTRY_RE.test(entry);
}

interface ModReposDoc {
    repos: Record<string, string>;
}

export function repoShorthand(url: string): string {
    const path = new URL(url).pathname.replace(/^\/+|\/+$/g, "").split("/");
    return path.length >= 2 ? `${path[0]}/${path[1]}` : url.replace(/\/+$/, "");
}

export async function listRepos(): Promise<{ shorthand: string; url: string; removable: boolean }[]> {
    const doc = await readJson<ModReposDoc>(config.files.modRepos, { repos: {} });
    const out = [{ shorthand: repoShorthand(DEFAULT_REPO), url: DEFAULT_REPO, removable: false }];
    for (const [shorthand, url] of Object.entries(doc.repos ?? {})) {
        if (url.replace(/\/+$/, "") === DEFAULT_REPO) continue;
        out.push({ shorthand, url, removable: true });
    }
    return out;
}

// validation for offline repo edits, mirroring modmanager addrepo's live check
export async function validateRepoIndex(url: string): Promise<void> {
    const res = await fetch(`${url}/repository.json`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`repository.json returned HTTP ${res.status}`);
    const index = (await res.json()) as any;
    if (!index || typeof index.mods !== "object") {
        throw new Error("that URL does not serve a valid mod index");
    }
}

export interface ModSummary {
    id: string;
    name: string;
    author: string;
    description: string;
    client_side: boolean;
    server_side: boolean;
    parity_required: boolean;
    versions: string[];
    source: string;
}

let indexCache: { at: number; mods: ModSummary[] } | null = null;
const INDEX_TTL_MS = 5 * 60 * 1000;

function parseVersion(v: string): number[] {
    return v.split(".").map(n => Number(n) || 0);
}

function compareVersions(a: string, b: string): number {
    const [pa, pb] = [parseVersion(a), parseVersion(b)];
    for (let i = 0; i < 3; i++) {
        if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
    }
    return 0;
}

export function highestVersion(versions: string[]): string {
    return [...versions].sort(compareVersions).at(-1) ?? "";
}

// merged repository.json summaries from every configured repo. One row per mod
// id, default repo entries win on collision, otherwise the highest version wins
export async function fetchIndex(force = false): Promise<ModSummary[]> {
    if (!force && indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) {
        return indexCache.mods;
    }
    const repos = await listRepos();
    const byId = new Map<string, { summary: ModSummary; fromDefault: boolean }>();
    for (const repo of repos) {
        const fromDefault = repo.url === DEFAULT_REPO;
        let index: any;
        try {
            const res = await fetch(`${repo.url}/repository.json`, { signal: AbortSignal.timeout(15000) });
            if (!res.ok) continue;
            index = await res.json();
        } catch {
            continue;
        }
        if (index?.index_version !== 1 || typeof index.mods !== "object") continue;
        for (const [id, byMajor] of Object.entries<any>(index.mods)) {
            if (!byMajor || typeof byMajor !== "object") continue;
            for (const entry of Object.values<any>(byMajor)) {
                if (!Array.isArray(entry?.versions) || entry.versions.length === 0) continue;
                if (typeof entry.parity_required !== "boolean") continue;
                const summary: ModSummary = {
                    id,
                    name: String(entry.name ?? id),
                    author: String(entry.author ?? id.split(".")[0]),
                    description: String(entry.description ?? ""),
                    client_side: Boolean(entry.client_side),
                    server_side: Boolean(entry.server_side),
                    parity_required: entry.parity_required,
                    versions: entry.versions.map(String),
                    source: repo.shorthand,
                };
                const current = byId.get(id);
                const better =
                    !current ||
                    (fromDefault && !current.fromDefault) ||
                    (fromDefault === current.fromDefault &&
                        compareVersions(highestVersion(summary.versions), highestVersion(current.summary.versions)) > 0);
                if (current && current.fromDefault && !fromDefault) continue;
                if (better) byId.set(id, { summary, fromDefault });
                else if (current && fromDefault === current.fromDefault) {
                    // same repo priority, different major: merge version lists so pinning older majors works
                    current.summary.versions = [...new Set([...current.summary.versions, ...summary.versions])];
                }
            }
        }
    }
    const mods = [...byId.values()].map(v => v.summary).sort((a, b) => a.name.localeCompare(b.name));
    indexCache = { at: Date.now(), mods };
    return mods;
}

export interface InstalledMod {
    name: string;
    version: string | null;
    enabled: boolean;
    untracked: boolean;
    kind: string | null;
}

// parses "modmanager list" output:
//   Author.Mod 1.2.0 - enabled
//   SomeLoose.dll - disabled [untracked file]
export async function listInstalled(): Promise<InstalledMod[] | null> {
    if (!gameConsole.connected) return null;
    const res = await gameConsole.capture("modmanager list");
    if (!res.ok) return null;
    if (res.text.includes("No community mods installed")) return [];
    const out: InstalledMod[] = [];
    for (const line of res.text.split("\n")) {
        const untracked = line.match(/^(.+) - (enabled|disabled) \[untracked (file|folder)\]$/);
        if (untracked) {
            out.push({
                name: untracked[1],
                version: null,
                enabled: untracked[2] === "enabled",
                untracked: true,
                kind: untracked[3],
            });
            continue;
        }
        const managed = line.match(/^(\S+) (\S+) - (enabled|disabled)$/);
        if (managed) {
            out.push({
                name: managed[1],
                version: managed[2],
                enabled: managed[3] === "enabled",
                untracked: false,
                kind: null,
            });
        }
    }
    return out;
}
