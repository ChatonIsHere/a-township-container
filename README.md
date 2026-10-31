# A Township Container

[![Build Status](https://github.com/ChatonIsHere/a-township-container/actions/workflows/publish.yml/badge.svg)](https://github.com/ChatonIsHere/a-township-container/actions/workflows/publish.yml)

An A Township Tale server in Docker, running The Modding Tavern's server mods. You bring the game files and the container patches them.

## Running the server

Make a folder with this `docker-compose.yml`:

```yaml
services:
    a-township-container:
        image: ghcr.io/chatonishere/a-township-container:latest
        container_name: a-township-container
        restart: unless-stopped
        # time to save the world when stopping
        stop_grace_period: 5m
        # cpus: 4
        # mem_limit: 4g
        volumes:
            - ./game-source:/game-files
            - ./server-data:/root/.wine/drive_c/users/root/AppData/Roaming/A Township Tale
            - ./tavern-config:/root/.wine/drive_c/users/root/AppData/Roaming/TheModdingTavern
            - wine-prefix:/root/.wine
        ports:
            - '${SERVER_PORT:-1757}:${SERVER_PORT:-1757}/udp' # game
            - '1760:1760/tcp' # console, for TavernLauncher's Remote Console
            - '1761:1761/tcp' # the game's web server
            - '1762:1762/tcp' # TavernLib's login
        environment:
            SERVER_PORT: ${SERVER_PORT:-1757}
            AUTO_PATCH: ${AUTO_PATCH:-true}
            DEBUG: ${DEBUG:-false}
            SCENE: ${SCENE:-}
            MODLIST: ${MODLIST:-}
            ATT_ACCESS_TOKEN: ${ATT_ACCESS_TOKEN:-}
            ATT_REFRESH_TOKEN: ${ATT_REFRESH_TOKEN:-}
            ATT_IDENTITY_TOKEN: ${ATT_IDENTITY_TOKEN:-}

volumes:
    wine-prefix:
```

Put the game files in a `game-source` folder next to it, with `A Township Tale.exe` and `A Township Tale_Data` directly inside. [docs/patching-installation.md](docs/patching-installation.md) covers getting them. Then `docker compose up -d`.

A new world spends its first few minutes after starting up generating the forest, using all the CPU it can. Anyone who joins before that finishes gets a broken forest.

On every start the container installs or updates MelonLoader, TavernLib and the TavernDefaults patch, the same as TavernLauncher does on Windows. Files you already patched with TavernLauncher work too.

Your data ends up in two folders next to the compose file:

- `server-data`: the game's own folder, with your world saves
- `tavern-config`: TavernLib's `server_settings.json` and `users.json`

The server runs as whoever owns `game-source` (uid 1000 if that's root), so these stay editable without `sudo`. Set `PUID` and `PGID` to pick a different user. Files left root-owned by older versions of the image are handed over on the next start.

Renting a VPS for it? [docs/vps-setup.md](docs/vps-setup.md) is a beginner's walkthrough. Hosting panels (Pterodactyl, Pelican, Calagopus, AMP) are covered in [docs/panel-deployment.md](docs/panel-deployment.md).

## Settings

Set these in a `.env` file next to the compose file.

| Setting | |
| --- | --- |
| `SERVER_PORT` | Game port, default `1757` |
| `AUTO_PATCH` | `false` skips patching and update checks |
| `SCENE` | `normal`, `quest` or `tutorial` (`tutorial` needs TavernLib 1.5.3 or newer). Written to `server_settings.json` and passed to the server on every start. Unset keeps what `server_settings.json` says |
| `MODLIST` | Mods to keep installed, comma-separated, as `Author.Mod` (its latest) or `Author.Mod@1.2.0`. Written to `tavern-config/modlist.json`; every start installs and updates what it lists and disables other installed mods. Unset keeps the file, so a modlist exported from TavernLauncher's Mod Manager can go there instead. Needs a TavernLib with the mod manager, which isn't released yet |
| `DEBUG` | `true` launches with `/debug_helper` |
| `PUID`, `PGID` | User and group the server runs as. Add them to `environment` to use them |
| `ATT_ACCESS_TOKEN`, `ATT_REFRESH_TOKEN`, `ATT_IDENTITY_TOKEN` | Default to the offline server tokens |

Stopping the container saves the world first: it saves and quits through the game's console, and `stop_grace_period` gives it up to 5 minutes. Saves usually take seconds, but can take minutes while a new world is still generating its forest. If the console can't be reached, the server is stopped without saving.

## Updating

The image: `docker compose pull`, then `docker compose up -d`.

The mods and patch update themselves on start. To force a re-patch at the latest releases, stop the server with `docker compose down`, then run `docker compose run --rm a-township-container update`.

## Building it yourself

Clone the repo and run `docker compose up -d --build`. Pushing to `main` publishes `latest`, and a version tag like `26.8.2-1.8.3` (`YY.MM.PATCH-TAVERNLAUNCHERVERSION`) publishes that tag.

## Note

I'm not affiliated with ALTA in any way, this is just an experimental repo to get The Modding Tavern's server stuff working in a docker container.

Thanks to the team at The Modding Tavern for their work, hopefully we'll get to keep our game!
