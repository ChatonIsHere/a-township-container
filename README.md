# atownshipcontainer

A Township Tale server container using The Modding Tavern's server implementation

## Getting it running

1. Copy `.env.example` to `.env` and fill in the access, refresh, and identity tokens from the server.bat
2. Set up the `server` folder (see below)
3. Run `docker compose up -d --build`

The first start can take a few minutes as we copy the game (~4.4 GB) from our nice and accessible `server` volume into a Docker volume before launching, since mapped volumes on Windows seem to cause some issues for the chonky `UnityPlayer.dll` that the game files usually have. Further starts skip the copy entirely — see below for how to re-sync after changing files

## Setting up the server folder

1. Copy a clean A Township Tale installation into `server`
2. Extract the client package into the same folder
3. Extract the server package into the same folder

If `startServer.bat`, `version.dll`, and `A Township Tale.exe` aren't sitting at the root of your server volume, something went wrong

The AppData/settings path within wine is mapped to the `ServerData` folder in the `server` volume, so it's persisted and accessible to you lovely people

If the client and server zip files ever end up in github releases for TavernLib, we might be able to automatically pull those. We'll still need the A Township Tale installation though

## Updating game files or mods

1. Drop the new files into `server`
2. Re-sync and restart:

```
docker compose stop
docker compose run --rm a-township-container sync
docker compose up -d
```

The sync is a mirror (rsync with `--delete`), so the game volume ends up an exact copy of `server`, deletions included. `ServerData` is never part of the sync so your saves and settings are perfectly safe

### Saving disk space

Since the game only runs from the Docker volume after the first sync, you can delete the game files out of `server` to avoid keeping two copies on disk — just leave `ServerData` where it is. The sync command refuses to run if `server` doesn't contain a game install, so an emptied folder can't wipe the volume. Put the game files back whenever you next want to update

## Note

I'm not affiliated with ALTA in any way, this is just an experimental repo to get The Modding Tavern's server stuff working in a docker container

Thanks to the team at The Modding Tavern for their work, hopefully we'll get to keep our game!
