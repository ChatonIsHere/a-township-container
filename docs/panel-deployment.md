# Running under a game panel

For Pterodactyl, Pelican and Calagopus (one egg covers all three) and CubeCoders AMP (its own template). If you're running Docker Compose on a VPS you don't need this, see [the VPS guide](vps-setup.md).

Written in August 2026. Panels change a lot and I can't test every version, so if a button has moved, have a quick search before pinging me!

## The images

| Image | For |
| --- | --- |
| `ghcr.io/chatonishere/a-township-container:latest` | Docker Compose |
| `ghcr.io/chatonishere/a-township-container:latest-egg` | Pterodactyl, Pelican and Calagopus |
| `ghcr.io/chatonishere/a-township-container:latest-amp` | CubeCoders AMP |

They run and patch the game the same way. The panel images keep everything in the one directory a panel gives each server, rather than in three mounts.

## Before you start

You provide the game files: your `game-source` folder from [the patching guide](patching-installation.md#making-the-game-source-folder), with `A Township Tale.exe` and `A Township Tale_Data` directly inside it. The container won't start if they're missing or nested in another folder, and says so in the console.

The server needs these ports:

| Port | Protocol | For |
| --- | --- | --- |
| 1757 (the game port, can be changed) | UDP | Players |
| 1760 | TCP | The console, used by TavernLauncher's Remote Console |
| 1761 | TCP | The game's web server |
| 1762 | TCP | TavernLib's login |

Only the game port can be changed. The others are fixed in the game and TavernLib.

## Pterodactyl, Pelican and Calagopus

### Importing the egg

1. Download [`egg/egg-a-township-tale.json`](../egg/egg-a-township-tale.json)
2. In the admin area, go to `Nests` (Pterodactyl) or `Eggs` (Pelican, Calagopus) and click `Import Egg`
3. Pick the file and a nest or category for it

### Creating the server

- **Allocations.** The primary allocation is the game port (`1757` by default). Add `1760`, `1761` and `1762` as well
- **Resources.** 2 CPU cores and 4GB of RAM is a good start. For disk, allow the game (~4.4GB) plus a couple of GB

The install script doesn't download anything (there's nothing it legally can). It just reminds you what to upload.

### Uploading the game files

Upload the contents of your `game-source` folder into the server's `game-source` directory (it's created on the first start if it isn't there). Thousands of files over SFTP is painfully slow, so zip the contents, upload the zip, use the file manager's `Unarchive`, then delete the zip.

The file manager unzips without Unix permissions, so `A Township Tale.exe` loses its execute bit. The container puts it back on every start.

### First start

The first start copies the wine prefix into place and downloads MelonLoader, TavernLib and the patch, so it needs internet access. The panel shows the server as online once TavernLib logs `Starting auth listening cycle`. Later starts only download what's out of date.

- The server directory holds `game-source`, `.wine` (the prefix), `server-data` (world saves) and `tavern-config` (TavernLib's `server_settings.json` and `users.json`). Back up the last two
- On older versions of this image the saves and config lived inside `.wine`. The first start on the current version moves them out
- `tavern_server.json`'s `server_port` follows the primary allocation
- `Auto patch` set to `false` skips patching. To force a full re-patch, delete `.att-patch-meta.json` and restart
- `Scene` picks the scene: `normal`, `quest` or `tutorial` (needs TavernLib 1.5.3 or newer). Empty keeps whatever `server_settings.json` says
- To keep mods installed, put a `modlist.json` exported from TavernLauncher's Mod Manager in `tavern-config`. Every start installs and updates what it lists and disables other installed mods. Needs a TavernLib with the mod manager, which isn't released yet

## CubeCoders AMP

This is the newest and least tested part of the repo. If something doesn't line up, please open an issue with your AMP version and what the console said.

The node running the instance needs Docker, since the server runs in the `latest-amp` image. That means AMP installed on the host, not in a container. With a Controller/Target setup it's the target that needs it.

### Adding the template

In AMP, go to `Configuration` → `Instance Deployment`, add the configuration repository `ChatonIsHere/a-township-container:amp-templates`, click `Fetch`, and refresh the page. That branch holds the files from [`amp`](../amp/) and is kept in sync with `main`:

- `atownshiptale.kvp`: the template
- `atownshiptaleconfig.json`: the settings in AMP's configuration UI
- `atownshiptalemetaconfig.json`: points AMP at the game's and TavernLib's config files
- `manifest.json`: describes the repository

With Controller/Target, every target that hosts an instance needs the repository too. Templates aren't copied from the controller, and a target without them creates the instance but leaves settings missing.

### Creating the instance

1. Create an instance and pick `A Township Tale`
2. Keep the default ports. Only the game port can be changed. Set a memory limit (4GB is a good start); AMP's memory gauge measures against it, and against the host's whole RAM without one
3. Upload the contents of your `game-source` folder into the instance's `game-source` directory (created on the first start if missing). Zip it and unzip it there rather than uploading ~4.4GB of loose files
4. Start it. The first start copies the wine prefix and downloads the mods and patch, so it needs internet access. AMP marks it running once TavernLib logs `Starting auth listening cycle`

`Auto patch`, `Debug helper` and the three token fields are the compose setup's `AUTO_PATCH`, `DEBUG` and `ATT_*_TOKEN`. Leave the tokens empty for the offline server tokens.

The rest of the `A Township Tale` settings edit the server's own config files. `Listing` and `Access` (name, password, player limit, region, whitelist, Quest and Tutorial scene) and `Garbage collection interval` are TavernLib's `server_settings.json`; `Saving` through `Performance` are the game's `ServerConfiguration.json`. Both files are written on the first successful start, so the values show up after that. Scene and garbage collection changes apply on the next restart, and Tutorial wins if both scenes are ticked.

You can type commands into AMP's console. They go to TavernLib's websocket console, and replies show up alongside the log once the server has started. If it can't connect it prints one line and the server carries on.

The instance directory has the same layout as the egg's: `game-source`, `.wine`, `server-data` and `tavern-config`. Back up the last two. Older versions kept them inside `.wine`; the first start on the current version moves them out. A `modlist.json` in `tavern-config` works as it does for the egg.

## Building the panel images

Both need the repo root as the build context:

```bash
docker build -f egg/Dockerfile -t a-township-container:egg .
docker build -f amp/Dockerfile -t a-township-container:amp .
```

Pushing to `main` publishes all three images. Version tags get the same `-egg` and `-amp` suffixes.

## Troubleshooting

**`A Township Tale.exe and/or the A Township Tale_Data folder are missing`.**
The game files aren't directly inside `game-source`, usually because the zip held the folder rather than its contents (`game-source/game-source/A Township Tale.exe`). Opening `game-source` should show the exe and the data folder.

**A `PATCHER:` error about GitHub being unreachable.**
The first start downloads the mods and patch from GitHub. Once they're installed, later starts work offline.

**The server runs but the panel never shows it online.**
The panel waits for TavernLib's `Starting auth listening cycle` line. If players can connect but the panel disagrees, TavernLib's logging has probably changed, so please open an issue with the last few console lines.

**AMP doesn't list `A Township Tale`.**
Check the repository is `ChatonIsHere/a-township-container:amp-templates`, click `Fetch` again and refresh. With Controller/Target, check the target has it too.

**Nobody can connect.**
The ports in the table above need allocations or bindings in the panel, and need to be open in any firewall in front of the node.

**Wine complains about the prefix, or the server misbehaves after working before.**
Stop the server, delete `.wine` and start again; a fresh prefix is copied in and your saves and config are relinked. If the server last ran on an older image that kept them inside `.wine`, start it once on the current image first, or back up `.wine/drive_c/users/<user>/AppData/Roaming/` before deleting.
