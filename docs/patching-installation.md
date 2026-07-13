# Patching and installing the game

This guide walks you through backing up your A Township Tale install, patching it with The Modding Tavern's client and server tools, and packaging the result into the `game-source` folder that [the README](../README.md) and [the VPS guide](vps-setup.md) both expect.

Disclaimer: This information is as accurate as I could get as of the time of writing, July 2026. TavernLauncher changes over time, so if a button isn't quite where I say it is, give it a quick search before pinging me!

## Prerequisites

- A fresh/clean installation of A Township Tale. If you're not sure where it lives, open the Alta launcher, click the small `Installation Options` text with the cog icon, then click `Open Installation Folder`
- A way to zip files. Windows can do this natively (used below), but [7-Zip](https://www.7-zip.org/) works too if you already have it (and is my tool of choice!)

## Backing up your installation

You will not be able to re-download the game after the 20th of July 2026, so back up your clean installation before you touch anything else. Keep this backup somewhere safe and don't patch it directly, you'll be extracting a fresh copy of it later when it's time to build the server.

1. Open your A Township Tale installation folder (see [Prerequisites](#prerequisites) if you don't know where that is)
2. Select everything inside it with `Ctrl+A`
3. Right-click the selection, hover over `Send to`, and click `Compressed (zip) folder`. Give it a few minutes, the game is a few GB
4. Rename the zip to something you'll recognise later, like `ATownshipTale.zip`, and move it somewhere you won't accidentally delete it, such as a separate drive or cloud storage

## Downloading TavernLauncher

1. Grab the latest [TavernLauncher release](https://github.com/ModdingTavern/TavernLauncher/releases/latest)
2. Extract the `TavernLauncher - vX.X.X` folder somewhere you'll remember, like your Documents folder. Don't leave it sitting in your Downloads, you'll need to come back to it for this guide and likely in the future when Mods need to be updated

## Patching the client

1. In the TavernLauncher folder, open the `Client` folder and run `TavernLauncher - Client`
2. If your Game Executable isn't automatically detected, or it's wrong, click `Browse` and select the `A Township Tale` executable in the installation folder you looked up in the prerequisites
3. Click `Patch`. You should see a message similar to "Root.Township.dll has been replaced with the Tavern patch." Click `OK`
4. Click `Mods` to open the secondary menu. For each mod, click `Install` (or `Reinstall` if you've patched before) and wait until the circle turns green and the text says "Up to date"
5. Once all 3 mods show as installed, close the Mods menu. Your client is now patched

Joining servers isn't covered in this guide, but it's worth knowing that usernames are registered per server and are what identifies your saves. Pick something unique that's unlikely to already be taken, otherwise you may end up needing more than one across different servers.

## Patching the server

The server is built from a separate, unpatched copy of the game, not the client install you just patched. That's what the backup from earlier is for, among other things.

1. Extract your backup zip to a new folder of your choice, this is what we'll turn into the server installation
2. In the TavernLauncher folder, open the `Server` folder and run `TavernLauncher - Server`
3. Under "Game Executable", click `Browse` and select the `A Township Tale` executable inside the server folder you just extracted
4. Ignore "Game Port" and "Server Name". You shouldn't need to change the port, and the server name is configured later, not here
5. Click `Patch`. You should see the same "Root.Township.dll has been replaced with the Tavern patch." message. Click `OK`
6. Click `Mods` and repeat the same install/reinstall process as the client, waiting for all 3 mods to go green and show "Up to date"
7. Once all 3 mods are installed, close the Mods menu. Your server files are now patched

## Preparing the game-source zip

The container expects a folder called `game-source` with `A Township Tale.exe`, `version.dll`, and the `MelonLoader` and `Plugins` folders all sitting directly at its root, not nested inside another folder. Getting this wrong is the single most common setup mistake, so follow these steps carefully.

1. Open your now-patched server installation folder
2. Select everything inside it with `Ctrl+A`
3. Right-click the selection, hover over `Send to`, and click `Compressed (zip) folder`. Zip the contents, not the folder itself, so the files end up directly at the root of the zip
4. Rename the resulting zip to `game-source.zip` for ease later
5. Open the zip and confirm `A Township Tale.exe`, `version.dll`, `MelonLoader`, and `Plugins` are all sitting directly inside it, not inside a nested folder

If you see a nested folder instead, you selected and zipped the folder itself rather than its contents. Delete the zip and repeat step 3, making sure you select the files inside the folder before zipping, not the folder icon.

The image writes a default `server-config.yml` into `game-source` on its first start if it doesn't find one already there. See [the README](../README.md#running-the-server) for what's actually configurable in it right now.

## Troubleshooting

**TavernLauncher doesn't detect my Game Executable, or picks the wrong one.**
Click `Browse` and point it at the `A Township Tale` executable yourself, using the folder you found via `Open Installation Folder` (client) or the one you extracted your backup into (server).

**A mod won't turn green / stays stuck installing.**
Check your internet connection, then click `Reinstall`. TavernLauncher downloads each mod fresh, so a flaky connection is the usual cause. Failing this, you can try the `Wipe Cache` button at the bottom right of the TavernLauncher menu, but make sure to read the warning that pops up!

**`A Township Tale.exe`, `version.dll`, `MelonLoader`, or `Plugins` isn't at the root of my `game-source` zip.**
You likely zipped the server folder itself instead of the files inside it, or zipped one of the folders within it. See the note at the end of [Preparing the game-source zip](#preparing-the-game-source-zip).

**Files sometimes fail to download / Authentication error when attempting to join the server.**
TavernLauncher's downloads can be flaky from time to time. If something's not working and you can't pin down why, close both patchers, re-run `TavernLauncher - Client` and `TavernLauncher - Server` as Administrator, and redo the `Patch` and mod install/reinstall steps for both. Running as Admin clears up a surprising number of otherwise-unexplained issues.
