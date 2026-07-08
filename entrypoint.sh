#!/bin/bash
set -e

# mirror the game into the container-side volume
# server-data is bind-mounted into the # wine prefix separately so it stays out of the sync entirely
sync_game() {
    if [ ! -f "/game-source/A Township Tale.exe" ]; then
        echo "A Township Tale.exe executable is missing, preventing sync"
        exit 1
    fi
    echo "Syncing game files, this might take a few minutes"
    rsync -a --delete /game-source/ /game-files/
    echo "Game files synced."
}

# manual re-sync: docker compose run --rm a-township-container sync
if [ "$1" = "sync" ]; then
    sync_game
    exit 0
fi

# only sync automatically on first run, when the volume is still empty
if [ ! -f "/game-files/A Township Tale.exe" ]; then
    sync_game
fi

cd /game-files

export DISPLAY=:1

rm -f /tmp/.X1-lock /tmp/.X11-unix/X1

# att seems to need a display even though it's headless so now we have a virtual framebuffer server
Xvfb "$DISPLAY" -screen 0 1024x768x24 &

# Xvfb is slow so we gotta wait :)
for i in $(seq 1 20); do
    [ -e /tmp/.X11-unix/X1 ] && break
    sleep 0.5
done

cp /opt/dxvk/x64/*.dll "$WINEPREFIX/drive_c/windows/system32/"

# i don't have a mouse in terminal
wine reg add "HKEY_CURRENT_USER\Software\Wine\WineDbg" /v ShowCrashDialog /t REG_DWORD /d 0 /f

# MelonLoader writes its logs here, so now that goes to docker logs
mkdir -p MelonLoader
touch MelonLoader/Latest.log
tail -F MelonLoader/Latest.log &

# exec replaces the shell with wine so it receives docker stop's signal directly instead of it being swallowed by bash
exec wine "A Township Tale.exe" \
    -batchmode \
    -nographics \
    /start_server -1 false "${SERVER_PORT:-1757}" \
    /debug_helper \
    /force_offline \
    --melonloader.hideconsole \
    /access_token "${ATT_ACCESS_TOKEN}" \
    /refresh_token "${ATT_REFRESH_TOKEN}" \
    /identity_token "${ATT_IDENTITY_TOKEN}"
