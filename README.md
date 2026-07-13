# A Township Container

[![Build Status](https://github.com/ChatonIsHere/a-township-container/actions/workflows/publish.yml/badge.svg)](https://github.com/ChatonIsHere/a-township-container/actions/workflows/publish.yml)

A Township Tale server container using The Modding Tavern's server implementation.

> **Note:** Authentication for the headless server workflow hasn't been implemented yet. Until it is, servers run through this container won't show up in the in-game community server list, they're reachable by IP only.

## Running the server

You can grab the published image instead of building it yourself. Create a folder with a `docker-compose.yml` like this:

```yaml
services:
    a-township-container:
        image: ghcr.io/chatonishere/a-township-container:latest
        container_name: a-township-container
        restart: unless-stopped
        # cpus: 2
        # mem_limit: 4g
        cap_add:
            - SYS_PTRACE
        security_opt:
            - seccomp:unconfined
        volumes:
            - ./game-source:/game-files
            - ./server-data:/root/.wine/drive_c/users/root/AppData/Roaming/A Township Tale
            - wine-prefix:/root/.wine
        ports:
            # gameserver
            - '${SERVER_PORT:-1757}:${SERVER_PORT:-1757}/udp'
            - '${SERVER_PORT:-1757}:${SERVER_PORT:-1757}/tcp'
            # rcon
            - '${RCON_PORT:-1758}:${RCON_PORT:-1758}/udp'
            - '${RCON_PORT:-1758}:${RCON_PORT:-1758}/tcp'
            # forest
            - '${FOREST_PORT:-1761}:${FOREST_PORT:-1761}/udp'
            - '${FOREST_PORT:-1761}:${FOREST_PORT:-1761}/tcp'
            # authentication
            - '${AUTH_PORT:-1762}:${AUTH_PORT:-1762}/udp'
            - '${AUTH_PORT:-1762}:${AUTH_PORT:-1762}/tcp'
        environment:
            SERVER_PORT: ${SERVER_PORT:-1757}
            ATT_ACCESS_TOKEN: ${ATT_ACCESS_TOKEN:-}
            ATT_REFRESH_TOKEN: ${ATT_REFRESH_TOKEN:-}
            ATT_IDENTITY_TOKEN: ${ATT_IDENTITY_TOKEN:-}

volumes:
    wine-prefix:
```

Then create a folder called `game-source` in the same folder as your `docker-compose.yml` and upload your patched server files to it. `version.dll`, `A Township Tale.exe`, and the `MelonLoader` and `Plugins` folders should all be sitting directly at the root of `game-source`. If any of them aren't, something went wrong. See [docs/patching-installation.md](docs/patching-installation.md) for more detailed information.

You can then run `docker compose up -d` to start the server.

On first start, the container will write a default `server-config.yml` into `game-source` if one isn't already there, so you can edit it in place and restart to apply changes. Right now, only `name` and `ports` actually do anything; the rest of the fields exist for future use but aren't read yet. `listing-token` is randomly generated at write time, but the generation is not cryptographic in nature.

The AppData/settings path within wine is mapped to its own `server-data` folder, so it's persisted and accessible to you lovely people. This is where your saves and server configuration will live.

Setting this up on a rented VPS? There's a full beginner walkthrough in [docs/vps-setup.md](docs/vps-setup.md) covering renting the box, securing it, and getting the container running.

## Building your own image

Clone this repo and run `docker compose up -d --build` instead of pulling the published image. Pushing to `main` rebuilds and republishes the `latest` tag automatically via GitHub Actions. Pushing a version tag (format `YY.MM.PATCH-TAVERNLAUNCHERVERSION`, e.g. `26.7.1-1.0.0`) publishes that as its own tag instead.

## Note

I'm not affiliated with ALTA in any way, this is just an experimental repo to get The Modding Tavern's server stuff working in a docker container.

Thanks to the team at The Modding Tavern for their work, hopefully we'll get to keep our game!
