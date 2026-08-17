import { config } from "./config.js";
import { gameConsole } from "./console.js";
import { normaliseSettings, readJson, type ServerSettings } from "./documents.js";

// runs the auto reboot settings the launcher stored in server_settings.json:
// save then quit, and the container restart policy boots the server back up

let lastFiredAt = 0;

async function restartServer() {
    lastFiredAt = Date.now();
    await gameConsole.capture("save", 60000);
    gameConsole.send("quit");
}

async function tick() {
    if (!gameConsole.connected) return;
    const settings = normaliseSettings(await readJson<Partial<ServerSettings>>(config.files.settings, {}));
    if (!settings.auto_reboot_enabled) return;
    if (Date.now() - lastFiredAt < 120000) return;

    if (settings.auto_reboot_mode === "interval") {
        const bootedAt = gameConsole.lastBootAt;
        if (bootedAt && Date.now() - bootedAt >= settings.auto_reboot_interval * 3600000) {
            await restartServer();
        }
    } else {
        const now = new Date();
        if (now.getHours() === settings.auto_reboot_hour && now.getMinutes() === settings.auto_reboot_minute) {
            await restartServer();
        }
    }
}

export function startScheduler() {
    setInterval(() => {
        tick().catch(() => undefined);
    }, 30000);
}
