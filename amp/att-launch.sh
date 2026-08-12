#!/bin/bash
# AMP launches this as the "server executable" from the instance's game directory, with the
# instance datastore mounted into the container and settings handed over as environment variables
set -e

# AMP starts us in the instance's app directory; the game files get their own folder inside it so
# they aren't tangled up with the wine prefix, mirroring the layout the compose setup mounts
INSTANCE_DIR="$(pwd)"
GAME_DIR="$INSTANCE_DIR/game-source"
export GAME_DIR
export WINEPREFIX="$INSTANCE_DIR/.wine"

# these are set in the image too, but don't rely on that surviving however the panel spawns us:
# MelonLoader hooks the game through a proxy version.dll, and wine only loads it when told to
# prefer the native one. Without the override the game boots vanilla, TavernLib never loads, and
# the only symptom is an empty MelonLoader log while Unity happily starts
export WINEARCH="${WINEARCH:-win64}"
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

# the instance datastore starts empty, so copy the baked wine prefix template into place on first boot
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
# /etc/passwd entry - mirror that exactly, or the config gets written somewhere the game never looks
WINE_USER="$(id -un 2>/dev/null || id -u)"

# TavernLib generates its JSON configs in here on first launch, but doesn't create the folder itself
TAVERN_CONFIG_DIR="$WINEPREFIX/drive_c/users/$WINE_USER/AppData/Roaming/TheModdingTavern"
mkdir -p "$TAVERN_CONFIG_DIR"

TAVERN_SERVER_JSON="$TAVERN_CONFIG_DIR/tavern_server.json"
[ -f "$TAVERN_SERVER_JSON" ] || echo '{}' > "$TAVERN_SERVER_JSON"
tmp=$(mktemp)
jq --argjson port "${SERVER_PORT:-1757}" '.server_port = $port' "$TAVERN_SERVER_JSON" > "$tmp" && mv "$tmp" "$TAVERN_SERVER_JSON"

# the compose setup exposes the saves and the TavernLib config as their own mounts, which a panel
# can't do - link them to the top of the game directory instead so they're one click from the file
# manager root rather than buried six levels deep in the prefix
SAVE_DIR="$WINEPREFIX/drive_c/users/$WINE_USER/AppData/Roaming/A Township Tale"
mkdir -p "$SAVE_DIR"
ln -sfn "$SAVE_DIR" "$INSTANCE_DIR/server-data"
ln -sfn "$TAVERN_CONFIG_DIR" "$INSTANCE_DIR/tavern-config"

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

# i don't have a mouse in AMP's console either
wine reg add "HKEY_CURRENT_USER\Software\Wine\WineDbg" /v ShowCrashDialog /t REG_DWORD /d 0 /f

# the game has to run from the directory its own files are in
cd "$GAME_DIR"

# MelonLoader writes its logs here, so now that goes to AMP's console (and is where the ready-detection line comes from)
mkdir -p MelonLoader
touch MelonLoader/Latest.log
# -n 0 so a stop/start doesn't replay the tail of the previous run before MelonLoader truncates it
tail -n 0 -F MelonLoader/Latest.log &
TAIL_PID=$!

# TavernLib closes the game's own remote console and serves its own over a websocket on the RCON
# port, so bridge that onto stdin/stdout: typed commands from AMP's console go in, console output
# comes out alongside the MelonLoader log. TavernLib writes the token itself for a headless server.
export TAVERN_CONSOLE_TOKEN_FILE="$TAVERN_CONFIG_DIR/console_token.txt"
export RCON_PORT="${RCON_PORT:-1760}"
# a background command in a non-interactive shell gets /dev/null on stdin, which would leave the
# bridge reading EOF and no typed command ever reaching the game, so hand it the real one
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

# AMP sends its stop signal to this script, and exec'ing wine here doesn't help: wine launches the
# game through start.exe, so the signal lands on that and the game carries on running. Signal the
# game process itself, then tear the whole wine session down if it won't go quietly. Without this
# the game, Xvfb and the log tail all survive a stop and the container has to be killed by hand.
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

    kill "$XVFB_PID" "$TAIL_PID" "$CONSOLE_PID" 2>/dev/null || true
    wait 2>/dev/null || true
    echo "Server stopped"
    exit 0
}
trap shutdown TERM INT

# stdin belongs to the console bridge, so keep the game off it rather than have them compete
wine "A Township Tale.exe" "${GAME_ARGS[@]}" < /dev/null &
WINE_PID=$!

# the first wait gets interrupted by the trap; if the game exits on its own the second one is a no-op
wait "$WINE_PID" 2>/dev/null || true
wait "$WINE_PID" 2>/dev/null || true

# the game exiting by itself should take the container down too, rather than leaving Xvfb holding it open
kill "$XVFB_PID" "$TAIL_PID" "$CONSOLE_PID" 2>/dev/null || true
