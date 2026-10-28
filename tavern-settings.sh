# Shared by entrypoint.sh, egg/entrypoint.sh and amp/att-launch.sh.

# Panel file managers unzip uploads without Unix permissions, and wine won't start an exe that
# isn't executable. Never fatal: a file we can't chmod keeps the bits it has.
ensure_exe_runnable() {
    chmod +x "$1" 2>/dev/null || true
}

# The server runs the scene from its launch args (/tutorialScene, /questScene). The quest_scene and
# tutorial_scene keys in server_settings.json only change what TavernLib tells clients and the
# community list, so this turns them into the arg. Tutorial wins, as in TavernLib and the
# launcher. Prints nothing for the normal scene or an unreadable file.
scene_arg() {
    [ -s "$1" ] || return 0
    jq -r 'if type != "object" then empty
           elif .tutorial_scene == true then "/tutorialScene"
           elif .quest_scene == true then "/questScene"
           else empty end' "$1" 2>/dev/null || true
}

# SCENE=normal|quest|tutorial sets both keys and keeps the rest. Unset leaves the file alone.
apply_scene_env() {
    local settings="$1" tmp
    case "${SCENE:-}" in
        "") return 0 ;;
        normal|quest|tutorial) ;;
        *)
            echo "SCENE='${SCENE}' isn't one of normal, quest or tutorial - leaving the scene settings alone"
            return 0
            ;;
    esac
    tmp=$(mktemp)
    if [ ! -s "$settings" ]; then
        echo '{}' > "$tmp"
    elif jq -e 'type == "object"' "$settings" > /dev/null 2>&1; then
        cp "$settings" "$tmp"
    else
        echo "server_settings.json isn't valid JSON - not applying SCENE=${SCENE} to it"
        rm -f "$tmp"
        return 0
    fi
    jq --arg s "$SCENE" '.quest_scene = ($s == "quest") | .tutorial_scene = ($s == "tutorial")' \
        "$tmp" > "$tmp.new" && mv "$tmp.new" "$settings"
    rm -f "$tmp"
}

# Wine starts the game through start.exe, so a stop signal never reaches the game, and signalling
# the game itself kills it without saving. Save and quit through the console instead (quit runs
# the game's own shutdown, which saves again). Only kill it if that doesn't work. The worst case
# (30 s to log in, 190 s for the save, 60 s to quit) fits in the 5 minutes the compose files and AMP allow.
stop_game() {
    if python3 /console-bridge.py run "save now"; then
        python3 /console-bridge.py run quit >/dev/null 2>&1 || true
        for _ in $(seq 1 60); do
            pgrep -f "A Township Tale.exe" >/dev/null || return 0
            sleep 1
        done
        echo "The server saved but didn't close, stopping it"
    else
        echo "Couldn't save through the console, stopping the server without saving"
    fi
    pkill -TERM -f "A Township Tale.exe" 2>/dev/null || true
    for _ in $(seq 1 5); do
        pgrep -f "A Township Tale.exe" >/dev/null || return 0
        sleep 1
    done
    wineserver -k 2>/dev/null || true
}
