#!/bin/bash
# AMP runs this as the server executable, from the instance directory, with settings passed as
# environment variables
set -e

# a stop before the game is running just ends the script
trap 'exit 0' TERM INT

. /tavern-settings.sh

# the game gets its own folder so it isn't mixed in with the wine prefix
INSTANCE_DIR="$(pwd)"
GAME_DIR="$INSTANCE_DIR/game-source"
export GAME_DIR
export WINEPREFIX="$INSTANCE_DIR/.wine"

# also set in the image, but AMP may not pass them on. Without version=n,b wine skips
# MelonLoader's proxy version.dll and the game boots unmodded with no error
export WINEARCH="${WINEARCH:-win64}"
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

# the instance starts empty, so copy in the prefix built into the image
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

# The saves and TavernLib config live in real folders at the top of the instance, where the file
# manager can browse them (panel file managers may not follow symlinks). The paths inside the
# prefix are symlinks back out to them, which wine follows fine.
link_into_prefix() {
    top="$INSTANCE_DIR/$1"
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

TAVERN_CONFIG_DIR="$INSTANCE_DIR/tavern-config"

TAVERN_SERVER_JSON="$TAVERN_CONFIG_DIR/tavern_server.json"
[ -f "$TAVERN_SERVER_JSON" ] || echo '{}' > "$TAVERN_SERVER_JSON"
tmp=$(mktemp)
jq --argjson port "${SERVER_PORT:-1757}" '.server_port = $port' "$TAVERN_SERVER_JSON" > "$tmp" && mv "$tmp" "$TAVERN_SERVER_JSON"

# TavernLib only adds new keys when it regenerates the whole file, so an older file can lack ones
# AMP's settings page maps. Add any that are missing at TavernLib's defaults. Before the first
# launch there's no file, and TavernLib writes a complete one
SERVER_SETTINGS_JSON="$TAVERN_CONFIG_DIR/server_settings.json"
if [ -s "$SERVER_SETTINGS_JSON" ] && jq -e 'type == "object"' "$SERVER_SETTINGS_JSON" > /dev/null 2>&1; then
    tmp=$(mktemp)
    jq '{tutorial_scene: false, garbage_collection_timer: 30} + .' "$SERVER_SETTINGS_JSON" > "$tmp" \
        && mv "$tmp" "$SERVER_SETTINGS_JSON"
fi

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

# i don't have a mouse in AMP's console either
wine reg add "HKEY_CURRENT_USER\Software\Wine\WineDbg" /v ShowCrashDialog /t REG_DWORD /d 0 /f

# the game has to run from the directory its own files are in
cd "$GAME_DIR"

# MelonLoader's log goes to AMP's console, which watches it for the ready line. -n 0 so a restart
# doesn't replay the previous run's log
mkdir -p MelonLoader
touch MelonLoader/Latest.log
tail -n 0 -F MelonLoader/Latest.log &
TAIL_PID=$!

# connects AMP's console to TavernLib's websocket console. A background job would otherwise get
# /dev/null as stdin, so it's handed the real one
export TAVERN_CONSOLE_TOKEN_FILE="$TAVERN_CONFIG_DIR/console_token.txt"
export RCON_PORT="${RCON_PORT:-1760}"
exec 3<&0
python3 /console-bridge.py <&3 &
CONSOLE_PID=$!

GAME_ARGS=(
    -batchmode
    -nographics
    /start_server -1 false "${SERVER_PORT:-1757}"
    /force_offline
    /fly
    --melonloader.hideconsole
    /access_token "${ATT_ACCESS_TOKEN:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJVc2VySWQiOiIwIiwiVXNlcm5hbWUiOiJTZXJ2ZXIiLCJyb2xlIjoiQWNjZXNzIiwiaXNfdmVyaWZpZWQiOiJUcnVlIiwiaXNfbWVtYmVyIjoiVHJ1ZSIsIlBvbGljeSI6WyJvZmZsaW5lIiwicGxheV9vZmZsaW5lIiwic2VydmVyX2FjY2Vzc19wcmVfYWxwaGEiLCJnYW1lX2FjY2Vzc19wdWJsaWMiLCJzZXJ2ZXJfb3duZXIiLCJkZWJ1Z19mZWF0dXJlcyIsImRhdGFiYXNlX2FkbWluIiwicmV1c2VfcmVmcmVzaF90b2tlbnMiXSwiZXhwIjo5OTk5OTk5OTk5LCJpc3MiOiJBbHRhV2ViQVBJIiwiYXVkIjoiQWx0YUNsaWVudCJ9.wLKduc-OVFM0jgi_aeHwzazy70AO8KXyT5-YVkpPm4g}"
    /refresh_token "${ATT_REFRESH_TOKEN:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJVc2VySWQiOiIwIiwicm9sZSI6IlJlZnJlc2giLCJleHAiOjk5OTk5OTk5OTksImlzcyI6IkFsdGFXZWJBUEkiLCJhdWQiOiJBbHRhQ2xpZW50In0.nN1uSeWMrpK3qT-vySb6ynkvm4Eq23lHgD1xIKOCaxc}"
    /identity_token "${ATT_IDENTITY_TOKEN:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJVc2VySWQiOiIwIiwiVXNlcm5hbWUiOiJTZXJ2ZXIiLCJyb2xlIjoiSWRlbnRpdHkiLCJpc19tZW1iZXIiOiJUcnVlIiwiaXNfZGV2IjoiVHJ1ZSIsImV4cCI6OTk5OTk5OTk5OSwiaXNzIjoiQWx0YVdlYkFQSSIsImF1ZCI6IkFsdGFDbGllbnQifQ.DL8u_uiiZbKAwBCNoiwlEz2ba6J5Z0WoAPpq4JPQ9tg}"
)
[ "${DEBUG:-false}" = "true" ] && GAME_ARGS+=(/debug_helper)
SCENE_ARG=$(scene_arg "$SERVER_SETTINGS_JSON")
[ -n "$SCENE_ARG" ] && GAME_ARGS+=("$SCENE_ARG")
read -ra MODLIST_ARGS <<< "$(modlist_arg "$TAVERN_CONFIG_DIR")"
GAME_ARGS+=("${MODLIST_ARGS[@]}")

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
wine "A Township Tale.exe" "${GAME_ARGS[@]}" < /dev/null &
WINE_PID=$!

# the trap interrupts the first wait; if the game exits by itself the second returns at once
wait "$WINE_PID" 2>/dev/null || true
wait "$WINE_PID" 2>/dev/null || true

# don't let Xvfb keep the container up once the game has gone
kill "$XVFB_PID" "$TAIL_PID" "$CONSOLE_PID" 2>/dev/null || true
