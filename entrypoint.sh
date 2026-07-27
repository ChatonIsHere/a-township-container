#!/bin/bash
set -e

# server-data is mounted into the wine prefix separately
if [ ! -f "/game-files/A Township Tale.exe" ]; then
    echo "A Township Tale.exe is missing from /game-files"
    exit 1
fi

cd /game-files

if [ "${1:-}" = "update" ]; then
    /patcher.sh force
    echo "Update complete, start the server normally to use it"
    exit 0
fi

if [ "${AUTO_PATCH:-true}" != "false" ]; then
    /patcher.sh
else
    echo "AUTO_PATCH=false - skipping patch checks"
fi

# TavernLib generates its JSON configs in here on first launch, but doesn't create the folder itself
TAVERN_CONFIG_DIR="/root/.wine/drive_c/users/root/AppData/Roaming/TheModdingTavern"
mkdir -p "$TAVERN_CONFIG_DIR"

TAVERN_SERVER_JSON="$TAVERN_CONFIG_DIR/tavern_server.json"
[ -f "$TAVERN_SERVER_JSON" ] || echo '{}' > "$TAVERN_SERVER_JSON"
tmp=$(mktemp)
jq --argjson port "${SERVER_PORT:-1757}" '.server_port = $port' "$TAVERN_SERVER_JSON" > "$tmp" && mv "$tmp" "$TAVERN_SERVER_JSON"

export DISPLAY=:1

rm -f /tmp/.X1-lock /tmp/.X11-unix/X1

# the game still needs a display to exist even with -batchmode -nographics, or wine dies as soon as it tries to create a window
Xvfb "$DISPLAY" -screen 0 1024x768x24 &

# Xvfb is slow so we gotta wait :)
for i in $(seq 1 20); do
    [ -e /tmp/.X11-unix/X1 ] && break
    sleep 0.5
done

# i don't have a mouse in terminal
wine reg add "HKEY_CURRENT_USER\Software\Wine\WineDbg" /v ShowCrashDialog /t REG_DWORD /d 0 /f

# MelonLoader writes its logs here, so now that goes to docker logs
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

# exec replaces the shell with wine so it receives docker stop's signal directly instead of it being swallowed by bash
exec wine "A Township Tale.exe" "${GAME_ARGS[@]}"
