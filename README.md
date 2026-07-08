# atownshipcontainer

A Township Tale server container using The Modding Tavern's server implementation

## Getting it running

1. Copy `.env.example` to `.env` and fill in the access, refresh, and identity tokens from the server.bat
2. Set up the `server` volume (see below)
3. Run `docker compose up -d --build`

## Setting up the server folder

1. Copy a clean A Township Tale installation into `server`
2. Extract the client package into the same folder
3. Extract the server package into the same folder

If `startServer.bat`, `version.dll`, and `A Township Tale.exe` aren't sitting at the root of your server volume, something went wrong

The AppData/settings path within wine is mapped to the `ServerData` folder in the `server` volume, so it's persisted and accessible to you lovely people

If the client and server zip files ever end up in github releases for TavernLib, we might be able to automatically pull those. We'll still need the A Township Tale installation though

## Note

I'm not affiliated with ALTA in any way, this is just an experimental repo to get The Modding Tavern's server stuff working in a docker container

Thanks to the team at The Modding Tavern for their work, hopefully we'll get to keep our game!
