# A Township Container

A Township Tale server container using The Modding Tavern's server implementation

## Getting it running

1. Copy `.env.example` to `.env` and fill in the access, refresh, and identity tokens from the server.bat
2. Set up the `game-source` folder (see below)
3. Run `docker compose up -d --build`

The first start can take a few minutes as we copy the game (~4.4 GB) from our nice and accessible `game-source` folder into the `game-files` Docker volume before launching, since mapped volumes on Windows seem to cause some issues for the chonky `UnityPlayer.dll` that the game files usually have. Further starts skip the copy entirely

## Setting up the game-source folder

1. Copy a clean A Township Tale installation into `game-source`
2. Extract the client package into the same folder
3. Extract the server package into the same folder

If `startServer.bat`, `version.dll`, and `A Township Tale.exe` aren't sitting at the root of `game-source`, something went wrong

The AppData/settings path within wine is mapped to its own `server-data` folder, so it's persisted and accessible to you lovely people

If the client and server zip files ever end up in github releases for TavernLib, we should be able to automatically pull those and only require the manual upload of the base game files

## Updating game files or mods

1. Drop the new files into `game-source`
2. Re-sync and restart:

```
docker compose stop
docker compose run --rm a-township-container sync
docker compose up -d
```

The sync is a mirror, so the `game-files` volume ends up an exact copy of `game-source`, deletions included. `server-data` lives in its own folder outside of `game-source`, so it's never touched by the sync and your saves and settings are perfectly safe

### Saving disk space

Since the game only runs from the `game-files` volume after the first sync, you can delete the game files out of `game-source` to avoid keeping two copies on disk. `server-data` is unaffected either way since it's a separate folder. The sync command refuses to run if `game-source` doesn't contain a game install, so an emptied folder can't wipe the volume. Put the game files back whenever you next want to update, or just leave them there if you've got the space

## Note

I'm not affiliated with ALTA in any way, this is just an experimental repo to get The Modding Tavern's server stuff working in a docker container

Thanks to the team at The Modding Tavern for their work, hopefully we'll get to keep our game!
