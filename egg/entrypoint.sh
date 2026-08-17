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

ROAMING="$WINEPREFIX/drive_c/users/$WINE_USER/AppData/Roaming"

# the compose setup exposes the saves and the TavernLib config as their own mounts, which a panel
# can't do - and panel file managers can refuse to follow symlinks (Wings flat-out errors on
# them), so a link at the root pointing into the prefix can render as a broken-looking file.
# Instead the real directories live at the top of the server root where they're browsable, and
# the prefix paths the game writes to are the symlinks, pointing back out at them - wine follows
# symlinks fine, it's only the file managers that won't
link_into_prefix() {
    top="/home/container/$1"
    roam="$ROAMING/$2"
    # earlier versions linked the other way round: a symlink at the top, the real directory in
    # the prefix. Anything at the top that isn't a real directory - that old link, or a stray
    # file left by an archive round-trip that materialised it - has to go BEFORE the prefix
    # directory is touched, or the migration below would resolve through the old link and copy
    # the directory into itself
    { [ -d "$top" ] && [ ! -L "$top" ]; } || rm -rf "$top"
    mkdir -p "$ROAMING"
    if [ -d "$roam" ] && [ ! -L "$roam" ]; then
        # move what the game already wrote (world saves included) out to the browsable spot: a
        # rename when the top is empty, so migrating never needs spare disk a quota'd server
        # might not have; the copy fallback only runs when both sides hold data (an old-layout
        # .wine backup restored over an already-migrated install), where the restored files win
        if [ ! -e "$top" ]; then
            mv "$roam" "$top"
        else
            cp -a "$roam/." "$top/"
            rm -rf "$roam"
        fi
    fi
    mkdir -p "$top"
    # derived rather than hardcoded so it survives a WINEPREFIX override, and relative so it
    # still resolves when the volume is inspected or restored outside the container
    ln -sfn "$(realpath --relative-to="$ROAMING" "$top")" "$roam"
}
link_into_prefix server-data "A Township Tale"
link_into_prefix tavern-config TheModdingTavern

# TavernLib generates its JSON configs in here on first launch - the game finds them through the
# prefix symlink, so the real directory can be used directly
TAVERN_CONFIG_DIR="/home/container/tavern-config"

TAVERN_SERVER_JSON="$TAVERN_CONFIG_DIR/tavern_server.json"
[ -f "$TAVERN_SERVER_JSON" ] || echo '{}' > "$TAVERN_SERVER_JSON"
tmp=$(mktemp)
jq --argjson port "${SERVER_PORT:-1757}" '.server_port = $port' "$TAVERN_SERVER_JSON" > "$tmp" && mv "$tmp" "$TAVERN_SERVER_JSON"

# desired mod set for TavernLib's boot-time reconciler; empty means "manage nothing"
MODSLIST_JSON="$TAVERN_CONFIG_DIR/modslist.json"
[ -f "$MODSLIST_JSON" ] || echo '{"schema":1,"repos":[],"mods":[]}' > "$MODSLIST_JSON"

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

# TavernLib closes the game's own remote console and serves its own over a websocket on the RCON
# port, so bridge that onto stdin/stdout: typed commands from the panel console go in, console
# output comes out alongside the MelonLoader log. TavernLib writes the token itself when headless.
export TAVERN_CONSOLE_TOKEN_FILE="$TAVERN_CONFIG_DIR/console_token.txt"
export RCON_PORT="${RCON_PORT:-1760}"
# a background command in a non-interactive shell gets /dev/null on stdin, which would leave the
# bridge reading EOF and no typed command ever reaching the game, so hand it the real one
exec 3<&0
python3 /console-bridge.py <&3 &
CONSOLE_PID=$!

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

    kill "$XVFB_PID" "$TAIL_PID" "$CONSOLE_PID" 2>/dev/null || true
    wait 2>/dev/null || true
    echo "Server stopped"
    exit 0
}
trap shutdown TERM INT

# stdin belongs to the console bridge, so keep the game off it rather than have them compete
eval "${MODIFIED_STARTUP}" < /dev/null &
GAME_PID=$!

# the first wait gets interrupted by the trap; if the game exits on its own the second one is a no-op
wait "$GAME_PID" 2>/dev/null || true
wait "$GAME_PID" 2>/dev/null || true

kill "$XVFB_PID" "$TAIL_PID" "$CONSOLE_PID" 2>/dev/null || true
