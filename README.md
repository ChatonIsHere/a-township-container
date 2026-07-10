# A Township Container

A Township Tale server container using The Modding Tavern's server implementation

## Running the server

Setting this up on a rented VPS? There's a full beginner walkthrough in [docs/vps-setup.md](docs/vps-setup.md) covering renting the box, securing it, and getting the container running. The short version for people who already have a Docker host is below.

There's a [browser-based encode/decode tool](https://chatonishere.github.io/a-township-container/) for encoding and decoding the Custom Servers connection files.

Grab the published image instead of building it yourself. Create a folder with a `docker-compose.yml` like this:

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
            - '${SERVER_PORT:-1757}:${SERVER_PORT:-1757}/udp'
            - '${SERVER_PORT:-1757}:${SERVER_PORT:-1757}/tcp'
            - '${SERVER_PORT_2:-1761}:${SERVER_PORT_2:-1761}/udp'
            - '${SERVER_PORT_2:-1761}:${SERVER_PORT_2:-1761}/tcp'
        environment:
            SERVER_PORT: ${SERVER_PORT:-1757}
            ATT_ACCESS_TOKEN: ${ATT_ACCESS_TOKEN}
            ATT_REFRESH_TOKEN: ${ATT_REFRESH_TOKEN}
            ATT_IDENTITY_TOKEN: ${ATT_IDENTITY_TOKEN}

volumes:
    wine-prefix:
```

Next to it, add a `.env` file with the access, refresh, and identity tokens. You can get these from the server.bat

```
ATT_ACCESS_TOKEN=
ATT_REFRESH_TOKEN=
ATT_IDENTITY_TOKEN=
```

Then set up the `game-source` folder (see below) and run `docker compose up -d`

## Setting up the game-source folder

1. Copy a clean A Township Tale installation into `game-source`
2. Extract the client package into the same folder
3. Extract the server package into the same folder

If `startServer.bat`, `version.dll`, and `A Township Tale.exe` aren't sitting at the root of `game-source`, something went wrong

The AppData/settings path within wine is mapped to its own `server-data` folder, so it's persisted and accessible to you lovely people

If the client and server zip files ever end up in github releases for TavernLib, we should be able to automatically pull those and only require the manual upload of the base game files

## Updating game files or mods

Stop the server, drop the new files into `game-source`, and start it again:

```
docker compose stop
docker compose up -d
```

## Building your own image

Clone this repo and run `docker compose up -d --build` instead of pulling the published image. Pushing to `main` (or a `v*` tag, which I swear I will eventually use) rebuilds and republishes the image automatically via GitHub Actions

## Note

I'm not affiliated with ALTA in any way, this is just an experimental repo to get The Modding Tavern's server stuff working in a docker container

Thanks to the team at The Modding Tavern for their work, hopefully we'll get to keep our game!
