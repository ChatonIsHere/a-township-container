# Running under a game panel

This guide covers running the server under a hosting panel instead of plain Docker Compose: Pterodactyl, Pelican, and Calagopus (which all share one egg), and CubeCoders AMP (which has its own template). If you're just running the container on a VPS with Docker Compose, you don't need any of this, [the VPS guide](vps-setup.md) has you covered.

Disclaimer: This information is as accurate as I could get as of the time of writing, August 2026. Panels change constantly and I can't test every version of every panel, so if a button isn't quite where I say it is, give it a quick search before pinging me!

## The images

The container gets published in three flavours, all from the same repo and all patched the same way on startup:

| Image | For |
| --- | --- |
| `ghcr.io/chatonishere/a-township-container:latest` | Plain Docker Compose (the README setup, unchanged) |
| `ghcr.io/chatonishere/a-township-container:latest-egg` | Pterodactyl, Pelican, and Calagopus |
| `ghcr.io/chatonishere/a-township-container:latest-amp` | CubeCoders AMP |

The panel images fold everything into the single directory panels give each server, instead of the three separate mounts the compose setup uses. Same game, same patcher, different plumbing.

## Before you start

Whichever panel you use, you always provide the game files yourself. They can't be distributed with the images, and the game can't be re-downloaded anymore, so you need your prepared `game-source` folder from [docs/patching-installation.md](patching-installation.md#preparing-the-game-source-zip): the base game files with `A Township Tale.exe` and the `A Township Tale_Data` folder sitting directly at the top level, not nested inside another folder.

The container checks for both of those files before starting and refuses to launch with a clear message if they're missing or nested wrong, so if your server won't start, read the console first.

## Pterodactyl, Pelican, and Calagopus

All three panels speak the same egg format (Pelican and Calagopus both import Pterodactyl eggs), so this is one egg: [`egg/egg-a-township-tale.json`](../egg/egg-a-township-tale.json).

### Importing the egg

1. Download `egg-a-township-tale.json` from the `egg` folder of this repo
2. In the admin area, go to `Nests` (Pterodactyl) or `Eggs` (Pelican/Calagopus) and use the `Import Egg` button
3. Pick the downloaded file, and a nest/category for it to live in

### Creating the server

Create a server from the egg as normal, with two things to watch:

- **Allocations.** The game uses four ports. The primary allocation is the game port itself (default `1757`), and on top of that the server needs allocations on `1760` (rcon), `1761` (forest), and `1762` (authentication). Port `1762` is hardcoded in TavernLib and can't be moved, so that allocation isn't optional. Keeping all four at their defaults is the path of least resistance
- **Resources.** Start with 2 CPU cores and 4GB of RAM, same as the VPS guide recommends. The wine prefix and patcher metadata live inside the server directory, so give it disk for the game (~4.4GB) plus a couple of GB of headroom

The install script doesn't download anything (there's nothing it legally can), it just prints a reminder of what to upload.

### Uploading the game files

Upload the contents of your prepared `game-source` folder into the server's `game-source` directory, so `A Township Tale.exe` and `A Township Tale_Data` sit directly inside it. That folder is created for you on the first start attempt if it isn't there yet. Uploading ~4.4GB as thousands of files over SFTP is painfully slow, so zip it first (contents, not the folder itself), upload the single zip, and use the panel file manager's `Unarchive` option on it. Delete the zip afterwards to get your space back.

### First start

Hit start and watch the console. The first boot copies the wine prefix into place, downloads MelonLoader, TavernLib, and the TavernDefaults core patch (so the machine needs outbound internet on first start), and then launches the game. The panel marks the server as online when TavernLib's `Starting auth listening cycle` line appears. Later starts skip the prefix copy and only re-download mods when they're outdated, exactly like the compose image.

A few things that moved compared to the compose setup:

- The server directory holds `game-source` (the game files you uploaded), `.wine` (the prefix), and two shortcuts: `server-data` and `tavern-config`, named after the folders the compose setup mounts. Those two are symlinks, created on every start, pointing at your world saves and at TavernLib's config (`server_settings.json`, `users.json`) inside the prefix. They're there so you don't have to dig, the real locations are `.wine/drive_c/users/container/AppData/Roaming/A Township Tale` and `.../Roaming/TheModdingTavern`
- Back both of those up, and do not delete the `.wine` folder thinking it's disposable, your saves are inside it. If your panel is configured to run containers as a uid other than the default, that `container` folder is named after the uid number instead, so check what's actually there before assuming
- `tavern_server.json`'s `server_port` is kept in sync with your primary allocation automatically
- To force a full re-patch, delete `.att-patch-meta.json` from the server's root directory and restart. To skip patching entirely, set the `Auto patch` variable to `false`

## CubeCoders AMP

Heads up before you invest time here: the AMP template is the newest and least battle-tested part of this repo. The image builds and the launch script is the same logic as the other variants, but AMP's Generic Module has a lot of knobs and I haven't been able to iterate against every AMP version. If something doesn't line up, please open an issue with your AMP version and what the console said.

**The node hosting the instance has to be able to create Docker containers.** The server runs inside this repo's image, so that node needs a working Docker daemon, which means AMP installed on the host rather than inside a container itself. On a Controller/Target setup this applies to the target actually running the instance; the controller doesn't run the game. If the node you're deploying to can't do that, use the standalone Compose setup there instead.

AMP uses a Generic Module template instead of an egg, which is the files in the [`amp`](../amp/) folder:

- `atownshiptale.kvp` - the template itself
- `atownshiptaleconfig.json` - the settings that show up in AMP's configuration UI
- `atownshiptalemetaconfig.json` - metadata manifest (empty, but AMP expects it alongside the other two)
- `manifest.json` - only needed if you serve these as a configuration repository, see below

### Installing the template

The supported way to install the template is as a configuration repository, covered below. If you just want to try it without setting a repository up, you can drop `atownshiptale.kvp`, `atownshiptaleconfig.json`, and `atownshiptalemetaconfig.json` in alongside the stock templates:

```
<your AMP data directory>/instances/ADS01/Plugins/ADSModule/DeploymentTemplates/CubeCoders-AMPTemplates-main/
```

Note that's `DeploymentTemplates`, not the `GenericTemplates` folder sitting next to it, and that AMP keeps one subfolder per configuration repository, named after the repository. If you're unsure where it lives on your install, `find ~/.ampdata -name "valheim.kvp"` will point at it. Your ADS instance may also be named `Main` rather than `ADS01`. Restart the ADS instance afterwards, templates are only picked up on startup.

Hand-placed files in that folder are on borrowed time: AMP re-syncs its configuration repositories periodically, so treat this as a way to test the template rather than a way to run it.

If you're running a single machine, that's the whole job. If you're running AMP's Controller/Target setup, the template files have to be on **every target node** that will host an A Township Tale instance, in that node's own ADS instance directory. Templates don't get copied from the controller to its targets (that's a long-standing feature request, not current behaviour), and a target that's missing them will misbehave in an annoying-to-diagnose way: the instance creates, but not all of the configuration options show up.

If you'd rather pull them in as a configuration repository (`Configuration` → `Instance Deployment` → add repository), that works too, but AMP expects the template files and `manifest.json` at the *root* of the repository. That's what `manifest.json` in the `amp` folder is for: copy the four files into a repo of their own and point AMP at that. On a multi-node setup this is the less tedious option by a mile, since each node points at the same repo and you maintain one copy of the template rather than hand-copying files onto every target.

### Creating the instance

1. Create a new instance and pick `A Township Tale` as the application. It requires Docker, since the server runs inside `ghcr.io/chatonishere/a-township-container:latest-amp` which carries the wine setup and patcher
2. Port defaults match the other setups: `1757` game, `1760` rcon, `1761` forest, and `1762` authentication (fixed, TavernLib hardcodes it)
3. Upload the contents of your prepared `game-source` folder into the instance's `game-source` directory via AMP's file manager or SFTP, so `A Township Tale.exe` and `A Township Tale_Data` sit directly inside it. That folder is created for you on the first start attempt if it isn't there yet. Zip it first and unzip it there, uploading ~4.4GB as individual files is miserable
4. Start the instance. The first start copies the wine prefix into place and downloads the mods and patch, so it needs outbound internet and a little patience. AMP marks the instance as running once TavernLib's `Starting auth listening cycle` line appears in the console

The `Auto patch` and `Debug helper` settings and the three token fields in AMP's configuration UI map to the same `AUTO_PATCH`, `DEBUG`, and `ATT_*_TOKEN` values the compose setup uses. Leave the tokens empty to use the offline server tokens.

The template also surfaces TavernLib's own configuration in AMP, under `Server` (from `server_settings.json`: name, password, player limit, listing, whitelist) and `World` (from `ServerConfiguration.json`: saving, time, PVP, experience multipliers, physics). Both files only exist once the server has started and generated them, so the values appear after the first successful boot rather than before it. Editing them in AMP writes to the same files you'd otherwise edit by hand.

You can type commands into AMP's console too. TavernLib closes the game's built-in remote console and serves its own over a websocket on the RCON port, so the image bridges that onto the console: whatever you type is sent to the server, and console output appears alongside the log. It connects once the server finishes starting, and prints a single line if it can't (the server still runs normally).

The instance's app directory holds `game-source` (the game files), `.wine` (the prefix), and `server-data` and `tavern-config` shortcuts pointing at your saves and TavernLib's config inside the prefix, named after the folders the compose setup mounts. Those two are symlinks recreated on every start, so deleting one costs nothing.

Same warning as the egg setup: your world saves live *inside* `.wine`, under `drive_c/users/<user>/AppData/Roaming/A Township Tale` (with TavernLib's config next door in `.../Roaming/TheModdingTavern`). Those are the folders to back up, and the `.wine` folder is not disposable.

## Building the panel images yourself

Both panel Dockerfiles need the repo root as build context (they share `patcher.sh` with the main image):

```bash
docker build -f egg/Dockerfile -t a-township-container:egg .
docker build -f amp/Dockerfile -t a-township-container:amp .
```

Pushing to `main` builds and publishes all three images automatically, with version tags getting the same `-egg`/`-amp` suffixes.

## Troubleshooting

**The console says `A Township Tale.exe and/or the A Township Tale_Data folder are missing`.**
The game files aren't directly inside the `game-source` directory, which is almost always the nested-folder problem: you zipped the `game-source` folder itself instead of its contents, so you've ended up with `game-source/game-source/A Township Tale.exe`. Opening `game-source` in the file manager needs to show `A Township Tale.exe` and `A Township Tale_Data` themselves, not another folder containing them.

**A `PATCHER:` error about GitHub being unreachable.**
The first start has to download the patch and mods from GitHub, so the node running the container needs outbound internet access at that point. Once everything is installed, later starts work offline, the update check just gets skipped.

**The server runs but the panel never marks it as online.**
The panels watch for TavernLib's `Starting auth listening cycle` console line. If the game is genuinely up (players can connect) but the panel disagrees, TavernLib's logging likely changed, so please open an issue and mention the last few console lines.

**AMP doesn't list `A Township Tale` when creating an instance.**
Check the files are in the right folder first, it's `Plugins/ADSModule/DeploymentTemplates/CubeCoders-AMPTemplates-main/`, not the `GenericTemplates` folder beside it. `find ~/.ampdata -name "valheim.kvp"` finds it on any install: whatever directory the stock templates are in is the one AMP reads.

Templates are only read when ADS starts, so restart the ADS instance after copying the files in. Check they landed in `ADS01/Plugins/ADSModule/GenericTemplates/` (your ADS instance may be called `Main`), that all three files are there, and that the filenames are still fully lower-case. If you went the configuration repository route instead, the files and `manifest.json` need to be at the root of that repository, not in a subfolder.

**The instance creates, but some of the settings are missing from the configuration UI.**
Classic Controller/Target symptom: the template is on the controller but not on the target node actually hosting the instance. Copy the template files onto that target's own ADS instance and restart it, or point the target at the same configuration repository.

**The server starts but nobody can connect.**
Same checklist as the VPS guide: all four ports (`1757`, `1760`, `1761`, `1762` by default) need allocations/port bindings in the panel and need to be open in any host-level firewall in front of the node. Remember `1762` can't be moved.

**Wine complains about the prefix, or the server behaves strangely after working before.**
The wine prefix can be rebuilt, but your saves live inside it, so don't just delete it. Stop the server, back up `.wine/drive_c/users/container/AppData/Roaming/A Township Tale` (your saves!) and `.../Roaming/TheModdingTavern` (your config), delete the `.wine` folder, start the server once so a fresh prefix gets copied in, then put both folders back and restart.
