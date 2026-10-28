#!/bin/bash
# Wings mounts the server's directory over /home/container, passes the startup command in $STARTUP
# with {{VARIABLE}} placeholders, and uses stdin/stdout as the console
set -e

# a stop before the game is running just ends the script (as PID 1, bash would ignore it)
trap 'exit 0' TERM INT

. /tavern-settings.sh

cd /home/container

# the game gets its own folder so it isn't mixed in with the wine prefix
export GAME_DIR=/home/container/game-source

# also set in the image, but the panel may not pass them on. Without version=n,b wine skips
# MelonLoader's proxy version.dll and the game boots unmodded with no error
export WINEARCH="${WINEARCH:-win64}"
export WINEPREFIX="${WINEPREFIX:-/home/container/.wine}"
export WINEDLLOVERRIDES="${WINEDLLOVERRIDES:-mscoree=d;mshtml=d;version=n,b}"
export WINEDEBUG="${WINEDEBUG:-err+all}"

# created first so there's somewhere to upload to, even on a start that fails the check below
mkdir -p "$GAME_DIR"

if [ ! -f "$GAME_DIR/A Township Tale.exe" ] || [ ! -d "$GAME_DIR/A Township Tale_Data" ]; then
    echo "A Township Tale.exe and/or the A Township Tale_Data folder are missing from game-source"
    echo "Upload the contents of your prepared game-source folder into the game-source directory"
    echo "so both sit directly inside it (not nested inside another folder), then start again"
    exit 1
fi
ensure_exe_runnable "$GAME_DIR/A Township Tale.exe"

# the server directory starts empty, so copy in the prefix built into the image
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

# wine names the profile folder after $USER, which the panel may not set. A uid with no passwd
# entry gets a fixed name (id -un prints the bare uid there, but still fails)
WINE_USER=$(id -un 2>/dev/null) || WINE_USER=container
export USER="$WINE_USER"

ROAMING="$WINEPREFIX/drive_c/users/$WINE_USER/AppData/Roaming"

# The saves and TavernLib config live in real folders at the top of the server directory, where
# the panel's file manager can browse them (Wings won't follow symlinks). The paths inside the
# prefix are symlinks back out to them, which wine follows fine.
link_into_prefix() {
    top="/home/container/$1"
    roam="$ROAMING/$2"
    # older versions linked the other way round. Clear whatever isn't a real folder at the top
    # first, or the move below would follow the old link and copy the folder into itself
    { [ -d "$top" ] && [ ! -L "$top" ]; } || rm -rf "$top"
    mkdir -p "$ROAMING"
    if [ -d "$roam" ] && [ ! -L "$roam" ]; then
        # a rename needs no spare disk. Both sides only hold data when an old-layout .wine backup
        # was restored over a migrated install, and then the restored files win
        if [ ! -e "$top" ]; then
            mv "$roam" "$top"
        else
            cp -a "$roam/." "$top/"
            rm -rf "$roam"
        fi
    fi
    mkdir -p "$top"
    # relative, so it still resolves outside the container or under another WINEPREFIX
    ln -sfn "$(realpath --relative-to="$ROAMING" "$top")" "$roam"
}
link_into_prefix server-data "A Township Tale"
link_into_prefix tavern-config TheModdingTavern

TAVERN_CONFIG_DIR="/home/container/tavern-config"

TAVERN_SERVER_JSON="$TAVERN_CONFIG_DIR/tavern_server.json"
[ -f "$TAVERN_SERVER_JSON" ] || echo '{}' > "$TAVERN_SERVER_JSON"
tmp=$(mktemp)
jq --argjson port "${SERVER_PORT:-1757}" '.server_port = $port' "$TAVERN_SERVER_JSON" > "$tmp" && mv "$tmp" "$TAVERN_SERVER_JSON"

export DISPLAY=:1

# both exist in the image already, so a permission quirk here mustn't stop the start
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

# MelonLoader's log goes to the panel console, which watches it for the ready line. -n 0 so a
# restart doesn't replay the previous run's log
mkdir -p MelonLoader
touch MelonLoader/Latest.log
tail -n 0 -F MelonLoader/Latest.log &
TAIL_PID=$!

# connects the panel console to TavernLib's websocket console. A background job would otherwise
# get /dev/null as stdin, so it's handed the real one
export TAVERN_CONSOLE_TOKEN_FILE="$TAVERN_CONFIG_DIR/console_token.txt"
export RCON_PORT="${RCON_PORT:-1760}"
exec 3<&0
python3 /console-bridge.py <&3 &
CONSOLE_PID=$!

# turn Wings' {{VAR}} placeholders into shell expansions, as the yolks images do
MODIFIED_STARTUP=$(echo "${STARTUP}" | sed -e 's/{{/${/g' -e 's/}}/}/g')
[ "${DEBUG:-false}" = "true" ] && MODIFIED_STARTUP="${MODIFIED_STARTUP} /debug_helper"
# added here rather than in the egg's startup string, so existing and customised servers get it too
SERVER_SETTINGS_JSON="$TAVERN_CONFIG_DIR/server_settings.json"
apply_scene_env "$SERVER_SETTINGS_JSON"
SCENE_ARG=$(scene_arg "$SERVER_SETTINGS_JSON")
[ -n "$SCENE_ARG" ] && MODIFIED_STARTUP="${MODIFIED_STARTUP} ${SCENE_ARG}"

shutdown() {
    trap - TERM INT
    echo "Stop requested, saving and closing the server"
    stop_game
    kill "$XVFB_PID" "$TAIL_PID" "$CONSOLE_PID" 2>/dev/null || true
    wait 2>/dev/null || true
    echo "Server stopped"
    exit 0
}
trap shutdown TERM INT

# stdin belongs to the console bridge
eval "${MODIFIED_STARTUP}" < /dev/null &
GAME_PID=$!

# the trap interrupts the first wait; if the game exits by itself the second returns at once
wait "$GAME_PID" 2>/dev/null || true
wait "$GAME_PID" 2>/dev/null || true

kill "$XVFB_PID" "$TAIL_PID" "$CONSOLE_PID" 2>/dev/null || true
