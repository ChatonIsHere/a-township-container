# Tavern Panel

An optional web admin panel for the containerized server: a browser version of TavernLauncher's server administration. It is off by default and nothing else in this repo depends on it.

It covers:

- **Dashboard** - online state, player count, uptime, save-and-restart button
- **Console** - the same unified console the egg and amp containers get: the MelonLoader log (TavernLib messages, mod reconcile results, and with `DEBUG=true` the full game logs) interleaved with live console output, plus the launcher's command autocomplete
- **Players** - the player database from `users.json`: roles, user IDs, token resets, kick and ban
- **Access** - whitelist, blacklist, and in-game whitelist applications with approve/deny
- **Settings** - server name, max players, join password, region, community listing, auto reboot
- **Mods** - the community mod manager (see below)
- **Tickets** - intentionally empty for now (see below)

## Enabling it

The panel ships as a separate compose service behind a profile, so a normal `docker compose up -d` never starts it. To run it:

1. Set a panel password in `.env`:

   ```
   PANEL_PASSWORD=pick-something-long
   ```

2. Start with the profile:

   ```
   docker compose --profile panel up -d
   ```

3. Open `http://your-host:8080` (change with `PANEL_PORT` in `.env`).

The panel mounts `tavern-config`, plus `game-source` read only so it can tail the MelonLoader log into its console. It never writes game files; every change it makes goes through `tavern-config` or the game's console port over the compose network.

## Security

- A panel session is full admin over the server, treat the password accordingly. Logins are rate limited, and the console token never leaves the backend.
- The panel serves plain HTTP. If you expose it beyond your LAN, put a TLS reverse proxy (caddy, traefik, nginx) in front of it.
- With the panel running you no longer need port 1760 published for yourself. It stays published by default so TavernLauncher's Remote Console and TavernKeeper keep working against the server; remove the mapping from `docker-compose.yml` if nobody uses those.

## How mod management works

TavernLib (1.5.0 or newer) has a native mod manager for headless servers, and the container now enables it: the game is started with `/modlist modslist.json`, and on every boot, before mods load, TavernLib reconciles the `Mods/` folder against that file - installing, updating, re-enabling and disabling (never deleting) to match, dependencies included. The panel builds on that split:

- **Desired mods** live in `tavern-config/modslist.json` (`Author.Mod` tracks latest, `Author.Mod@1.2.0` pins a version). The panel edits this file; changes apply on the next restart. The file format is the same one TavernLauncher exports as a modlist, so a launcher-exported modpack drops straight in.
- **Live state and toggles** go through TavernLib's `modmanager` console commands (`list`, `enable`/`disable` for untracked mods, `cleanup`, `addrepo`/`removerepo`/`listrepos`), which the panel drives over the console connection.
- **Pull sources** live in `tavern-config/mod_repos.json`, the allow-list the reconciler pulls from. The panel adds repos through `modmanager addrepo` while the server is up (TavernLib validates the index itself), and falls back to editing the file with the same validation while it is down. A modlist merely naming a repo never authorizes pulls from it.
- **Browsing** fetches each repo's `repository.json` index directly, so search works even while the server is down.

The panel never writes into `Mods/` itself. One installer owns the disk, and it is TavernLib.

Older TavernLib releases without the reconciler ignore `/modlist`; the Mods page then still edits the desired list but nothing applies it. To run the current build before it is released, drop `TavernLib.dll` from the TavernLib repo's build output into `game-source/Plugins/` and start with `AUTO_PATCH=false` so the patcher does not replace it.

## Why the Tickets page is empty

Tickets were a TavernLauncher feature: the launcher process itself answered `ticket_action` requests on the auth port and stored them in `tickets.json`. On a headless server TavernLib answers that port instead, and its AuthManager does not implement `ticket_action` yet, so player ticket requests currently go unanswered and there is nothing to display.

What it needs:

1. **TavernLib**: implement `ticket_action` (`create`, `list_mine`, `respond`, `close`) in `AuthManager`, storing `tickets.json` in the launcher's shape with the same credential check, per-user limit, and cooldown. The Python reference is `_handle_ticket_request` and friends in TavernLauncher's `server/core/data_store.py` (about 140 lines).
2. **Panel**: a page over `tickets.json` - open ticket list, thread view, owner reply, resolve. Small, once the file exists.

## Development

```
cd panel
npm install
npm run dev        # backend on :8080, expects TAVERN_CONFIG_DIR and PANEL_PASSWORD
npm run dev:web    # vite dev server with /api and /ws proxied to :8080
npm run check      # typecheck
npm run build      # production build (dist/ + dist-server/)
```

The stack is Fastify + ws on the backend and React + Tailwind with shadcn-style components on the frontend, themed to TavernLauncher's palette. The published image is `ghcr.io/chatonishere/a-township-container:latest-panel`.
