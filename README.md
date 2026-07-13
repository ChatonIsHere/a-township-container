# A Township Container

A Township Tale server container using The Modding Tavern's server implementation.

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

Then create a folder called `game-source` in the same folder as your `docker-compose.yml` and upload your patched server files to it. If `version.dll` and `A Township Tale.exe` aren't sitting at the root of `game-source`, something went wrong.

You can then run `docker compose up -d` to start the server.

The AppData/settings path within wine is mapped to its own `server-data` folder, so it's persisted and accessible to you lovely people. This is where your saves and server configuration will live.

Setting this up on a rented VPS? There's a full beginner walkthrough in [docs/vps-setup.md](docs/vps-setup.md) covering renting the box, securing it, and getting the container running.

## Building your own image

Clone this repo and run `docker compose up -d --build` instead of pulling the published image. Pushing to `main` rebuilds and republishes the `latest` tag automatically via GitHub Actions. Pushing a version tag (format `YY.MM.PATCH-TAVERNLAUNCHERVERSION`, e.g. `26.7.1-1.0.0`) publishes that as its own tag instead.

## Note

I'm not affiliated with ALTA in any way, this is just an experimental repo to get The Modding Tavern's server stuff working in a docker container.

Thanks to the team at The Modding Tavern for their work, hopefully we'll get to keep our game!
