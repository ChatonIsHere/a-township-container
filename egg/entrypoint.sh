#!/bin/bash
# Wings owns the container lifecycle: it mounts the server's data directory over /home/container,
# hands us the startup command in $STARTUP with {{VARIABLE}} placeholders, and reads stdout as the console
set -e

cd /home/container

# the game files get their own folder rather than sitting loose in the server root, so they aren't
# tangled up with the wine prefix, mirroring the layout the compose setup mounts
export GAME_DIR=/home/container/game-source

# these are set in the image too, but don't rely on that surviving however the panel spawns us:
# MelonLoader hooks the game through a proxy version.dll, and wine only loads it when told to
# prefer the native one. Without the override the game boots vanilla, TavernLib never loads, and
# the only symptom is an empty MelonLoader log while Unity happily starts
export WINEARCH="${WINEARCH:-win64}"
export WINEPREFIX="${WINEPREFIX:-/home/container/.wine}"
export WINEDLLOVERRIDES="${WINEDLLOVERRIDES:-mscoree=d;mshtml=d;version=n,b}"
export WINEDEBUG="${WINEDEBUG:-err+all}"

# create it up front so it's there to upload into, even on a start that's about to fail the check
mkdir -p "$GAME_DIR"

# the game files can't ship with the image, so check the upload actually landed in the right place
if [ ! -f "$GAME_DIR/A Township Tale.exe" ] || [ ! -d "$GAME_DIR/A Township Tale_Data" ]; then
    echo "A Township Tale.exe and/or the A Township Tale_Data folder are missing from game-source"
    echo "Upload the contents of your prepared game-source folder into the game-source directory"
    echo "so both sit directly inside it (not nested inside another folder), then start again"
    exit 1
fi

# the panel's data directory starts empty, so copy the baked wine prefix template into place on first boot
if [ ! -f "$WINEPREFIX/system.reg" ]; then
    echo "First start - copying the wine prefix into place (this only happens once)"
    mkdir -p "$WINEPREFIX"
    cp -a /opt/wine-template/. "$WINEPREFIX/"
fi

if [ "${AUTO_PATCH:-true}" != "false" ]; then
    /patcher.sh
else
    echo "AUTO_PATCH=false - skipping patch checks"
fi

# wine names the profile folder after the running user, falling back to the bare uid when it has no
# /etc/passwd entry (which is what happens if the panel is set to run as some other uid) - mirror
# that exactly, or the config gets written somewhere the game never looks
WINE_USER="$(id -un 2>/dev/null || id -u)"

# TavernLib generates its JSON configs in here on first launch, but doesn't create the folder itself
TAVERN_CONFIG_DIR="$WINEPREFIX/drive_c/users/$WINE_USER/AppData/Roaming/TheModdingTavern"
mkdir -p "$TAVERN_CONFIG_DIR"

TAVERN_SERVER_JSON="$TAVERN_CONFIG_DIR/tavern_server.json"
[ -f "$TAVERN_SERVER_JSON" ] || echo '{}' > "$TAVERN_SERVER_JSON"
tmp=$(mktemp)
jq --argjson port "${SERVER_PORT:-1757}" '.server_port = $port' "$TAVERN_SERVER_JSON" > "$tmp" && mv "$tmp" "$TAVERN_SERVER_JSON"

# the compose setup exposes the saves and the TavernLib config as their own mounts, which a panel
# can't do - link them to the top of the server directory instead so they're one click from the file
# manager root rather than buried six levels deep in the prefix
SAVE_DIR="$WINEPREFIX/drive_c/users/$WINE_USER/AppData/Roaming/A Township Tale"
mkdir -p "$SAVE_DIR"
ln -sfn "$SAVE_DIR" /home/container/server-data
ln -sfn "$TAVERN_CONFIG_DIR" /home/container/tavern-config

export DISPLAY=:1

# both of these are created in the image already, so don't let a permission quirk kill the start
rm -f /tmp/.X1-lock /tmp/.X11-unix/X1 2>/dev/null || true
mkdir -p "$XDG_RUNTIME_DIR" 2>/dev/null || true

# the game still needs a display to exist even with -batchmode -nographics, or wine dies as soon as it tries to create a window
Xvfb "$DISPLAY" -screen 0 1024x768x24 &
XVFB_PID=$!

# Xvfb is slow so we gotta wait :)
for i in $(seq 1 20); do
    [ -e /tmp/.X11-unix/X1 ] && break
    sleep 0.5
done

# i don't have a mouse in a panel console either
wine reg add "HKEY_CURRENT_USER\Software\Wine\WineDbg" /v ShowCrashDialog /t REG_DWORD /d 0 /f

# the game has to run from the directory its own files are in
cd "$GAME_DIR"

# MelonLoader writes its logs here, so now that goes to the panel console (and is where the ready-detection line comes from)
mkdir -p MelonLoader
touch MelonLoader/Latest.log
# -n 0 so a stop/start doesn't replay the tail of the previous run before MelonLoader truncates it
tail -n 0 -F MelonLoader/Latest.log &
TAIL_PID=$!

# swap Wings' {{VAR}} placeholders for shell expansions, same as the yolks images do
MODIFIED_STARTUP=$(echo "${STARTUP}" | sed -e 's/{{/${/g' -e 's/}}/}/g')
[ "${DEBUG:-false}" = "true" ] && MODIFIED_STARTUP="${MODIFIED_STARTUP} /debug_helper"

# exec'ing wine here doesn't get the signal where it needs to go: wine launches the game through
# start.exe, so a stop lands on that and the game carries on running. Signal the game process
# itself, then tear the whole wine session down if it won't go quietly.
shutdown() {
    trap - TERM INT
    echo "Stop requested, asking the server to close"
    pkill -TERM -f "A Township Tale.exe" 2>/dev/null || true

    # give it time to save the world before resorting to anything harsher
    for _ in $(seq 1 20); do
        pgrep -f "A Township Tale.exe" >/dev/null 2>&1 || break
        sleep 1
    done

    if pgrep -f "A Township Tale.exe" >/dev/null 2>&1; then
        echo "Server is still running, terminating the wine session"
        wineserver -k 2>/dev/null || true
    fi

    kill "$XVFB_PID" "$TAIL_PID" 2>/dev/null || true
    wait 2>/dev/null || true
    echo "Server stopped"
    exit 0
}
trap shutdown TERM INT

eval "${MODIFIED_STARTUP}" &
GAME_PID=$!

# the first wait gets interrupted by the trap; if the game exits on its own the second one is a no-op
wait "$GAME_PID" 2>/dev/null || true
wait "$GAME_PID" 2>/dev/null || true

kill "$XVFB_PID" "$TAIL_PID" 2>/dev/null || true
