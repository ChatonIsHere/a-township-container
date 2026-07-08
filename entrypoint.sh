#!/bin/bash
set -e

cd /game

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
