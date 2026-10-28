# Getting the game files

How to back up A Township Tale, patch your own client so you can join, and make the `game-source` folder the server runs from.

You don't patch the server's copy. The container does that itself on every start.

Written in July 2026 and checked against TavernLauncher 1.8.5. If a button has moved, have a quick search before pinging me!

## What you need

- A clean install of A Township Tale. To find it, open the Alta launcher, click `Installation Options` (the cog), then `Open Installation Folder`
- A way to make zips. Windows can do it (used below), or [7-Zip](https://www.7-zip.org/) (my tool of choice!)

## Backing up the game

The game can't be downloaded any more, so keep a clean copy before you touch anything. Don't patch the backup; the server gets its own copy of it later.

1. Open the installation folder
2. Select everything inside it with `Ctrl+A`
3. Right-click, `Send to`, `Compressed (zip) folder`. The game is a few GB, so give it a few minutes
4. Rename the zip to something like `ATownshipTale.zip` and keep it somewhere safe, like another drive or cloud storage

## Patching your client

1. Download the latest [TavernLauncher release](https://github.com/ModdingTavern/TavernLauncher/releases/latest) and extract it somewhere you'll find again (not Downloads, you'll be back when mods need updating)
2. Run `TavernLauncher - Client`
3. If the path to `A Township Tale.exe` is empty or wrong, click `Browse` and pick it from your installation folder
4. Click `Patch`, then `OK` on the `Patch applied` message
5. Click `Mods`. Install `MelonLoader` first, then `TavernLib`, and wait for each to turn green and say "Up to date". `CircuitsVoiceChat` and `TavernEssentials` are optional

Usernames are registered per server and are what your saves are tied to, so pick one that's unlikely to be taken.

## Making the game-source folder

The server runs from a fresh copy of your backup. The container expects `A Township Tale.exe` and the `A Township Tale_Data` folder directly inside `game-source`, not in a folder within it. Getting this wrong is the most common setup mistake.

1. Copy your backup zip and name the copy `game-source.zip`
2. Open it and check `A Township Tale.exe` and `A Township Tale_Data` are right there, not inside another folder

If there's a folder in the way, you zipped the folder rather than what's in it. Extract it, open the folder, select everything inside and zip that instead.

Files you already patched with `TavernLauncher - Server` work too. The container only installs what's missing or out of date.

## Troubleshooting

**TavernLauncher doesn't find the game, or finds the wrong one.**
Click `Browse` and point it at `A Township Tale.exe` yourself.

**A mod won't turn green.**
Check your connection and click `Reinstall`. If it keeps failing, try `Wipe Cache` at the bottom right of the launcher (read the warning first), or run the launcher as Administrator, which fixes a surprising number of unexplained problems.

**`A Township Tale.exe` or `A Township Tale_Data` isn't at the top of the zip.**
See the note at the end of [Making the game-source folder](#making-the-game-source-folder).

**The container stops with a `PATCHER:` error about GitHub being unreachable.**
The first start downloads MelonLoader, TavernLib and the patch from GitHub, so it needs internet access. Once they're installed, later starts work offline.
