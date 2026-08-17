import path from "node:path";

// everything the panel touches lives in the tavern-config volume or behind the console port
const dataDir = process.env.TAVERN_CONFIG_DIR ?? "/data/tavern-config";

export const config = {
    dataDir,
    gameHost: process.env.GAME_HOST ?? "127.0.0.1",
    rconPort: Number(process.env.RCON_PORT ?? 1760),
    port: Number(process.env.PANEL_PORT ?? 8080),
    password: process.env.PANEL_PASSWORD ?? "",
    // MelonLoader log for the unified console; empty disables the tail
    gameLogFile: process.env.GAME_LOG_FILE ?? "/game-files/MelonLoader/Latest.log",
    files: {
        users: path.join(dataDir, "users.json"),
        settings: path.join(dataDir, "server_settings.json"),
        requests: path.join(dataDir, "whitelist_requests.json"),
        comments: path.join(dataDir, "whitelist_comments.json"),
        modslist: path.join(dataDir, "modslist.json"),
        modRepos: path.join(dataDir, "mod_repos.json"),
        playerStatus: path.join(dataDir, "tavern_player_status.json"),
        consoleToken: path.join(dataDir, "console_token.txt"),
    },
};
