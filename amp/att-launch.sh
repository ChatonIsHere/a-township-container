#!/bin/bash
# AMP launches this as the "server executable" from the instance's game directory, with the
# instance datastore mounted into the container and settings handed over as environment variables
set -e

# wherever AMP put us is where the game lives; the patcher and wine prefix follow it
GAME_DIR="$(pwd)"
export GAME_DIR
export WINEPREFIX="$GAME_DIR/.wine"

# the game files can't ship with the image, so check the upload actually landed in the right place
if [ ! -f "A Township Tale.exe" ] || [ ! -d "A Township Tale_Data" ]; then
    echo "A Township Tale.exe and/or the A Township Tale_Data folder are missing from the game directory"
    echo "Upload the contents of your prepared game-source folder so both sit at the top level"
    echo "(not nested inside another folder), then start the server again"
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
ln -sfn "$SAVE_DIR" "$GAME_DIR/server-data"
ln -sfn "$TAVERN_CONFIG_DIR" "$GAME_DIR/tavern-config"

export DISPLAY=:1

# both of these are created in the image already, so don't let a permission quirk kill the start
rm -f /tmp/.X1-lock /tmp/.X11-unix/X1 2>/dev/null || true
mkdir -p "$XDG_RUNTIME_DIR" 2>/dev/null || true

# the game still needs a display to exist even with -batchmode -nographics, or wine dies as soon as it tries to create a window
Xvfb "$DISPLAY" -screen 0 1024x768x24 &

# Xvfb is slow so we gotta wait :)
for i in $(seq 1 20); do
    [ -e /tmp/.X11-unix/X1 ] && break
    sleep 0.5
done

# i don't have a mouse in AMP's console either
wine reg add "HKEY_CURRENT_USER\Software\Wine\WineDbg" /v ShowCrashDialog /t REG_DWORD /d 0 /f

# MelonLoader writes its logs here, so now that goes to AMP's console (and is where the ready-detection line comes from)
mkdir -p MelonLoader
touch MelonLoader/Latest.log
tail -F MelonLoader/Latest.log &

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

# exec replaces the shell with wine so it receives AMP's stop signal directly instead of it being swallowed by bash
exec wine "A Township Tale.exe" "${GAME_ARGS[@]}"
