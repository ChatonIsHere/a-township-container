export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
    if (!res.ok) {
        let message = res.statusText;
        try {
            const body = await res.json();
            message = body.error ?? body.text ?? message;
        } catch {
            // keep the status text
        }
        throw new ApiError(message, res.status);
    }
    return res.json() as Promise<T>;
}

export const api = {
    get: <T>(url: string) => request<T>(url),
    post: <T>(url: string, body?: unknown) =>
        request<T>(url, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
    put: <T>(url: string, body: unknown) => request<T>(url, { method: "PUT", body: JSON.stringify(body) }),
};

export interface Status {
    online: boolean;
    serverName: string;
    playerCount: number | null;
    playerLimit: number | null;
    bootedAt: number | null;
    pendingApplications: number;
}

export interface Player {
    username: string;
    user_id: number;
    registered_from: string;
    roles: string[];
    has_token: boolean;
}

export interface AccessLists {
    whitelist: { usernames: string[]; ips: string[] };
    blacklist: { usernames: string[]; user_ids: number[]; ips: string[] };
    comments: Record<string, string>;
}

export interface Application {
    username: string;
    ip: string;
    applied_at: string;
}

export interface Settings {
    name: string;
    max_players: number;
    whitelist_enabled: boolean;
    enforce_ip_limit: boolean;
    community_listed: boolean;
    quest_scene: boolean;
    region: string;
    public_hostname: string;
    password_set: boolean;
    auto_reboot_enabled: boolean;
    auto_reboot_mode: "time" | "interval";
    auto_reboot_hour: number;
    auto_reboot_minute: number;
    auto_reboot_interval: number;
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

export interface InstalledMod {
    name: string;
    version: string | null;
    enabled: boolean;
    untracked: boolean;
    kind: string | null;
}

export interface ModsResponse {
    modslist: { schema: number; repos: string[]; mods: string[] };
    repos: { shorthand: string; url: string; removable: boolean }[];
    installed: InstalledMod[] | null;
    online: boolean;
}

export type CommandTable = Record<string, string[]>;
