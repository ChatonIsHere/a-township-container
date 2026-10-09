# Sourced by all three launch scripts (entrypoint.sh, egg/entrypoint.sh and
# amp/att-launch.sh), so the rules below can't drift between them.

# The game exe can arrive without its execute bit: panel file managers
# (Pelican's, AMP's) extract uploaded zips without Unix permissions, and Wine
# then fails to start it. Fixing it here rather than in a startup command means
# it applies to every install, including servers created before this existed
# and ones with a customised startup. Never fatal - a read-only mount or a file
# owned by someone else just keeps whatever bits it has.
ensure_exe_runnable() {
    chmod +x "$1" 2>/dev/null || true
}

# TavernLib picks the server's own scene from its launch args alone
# (/tutorialScene, /questScene). The quest_scene and tutorial_scene keys in
# server_settings.json only decide what it tells joining clients and the
# community listing, so a scene set there without the arg has clients loading
# one scene while the server runs another. This turns the settings into the
# arg. Tutorial wins over quest, as it does in TavernLib and the launcher.
# Prints nothing for the normal scene, or when the file is missing or unreadable.
scene_arg() {
    [ -s "$1" ] || return 0
    jq -r 'if type != "object" then empty
           elif .tutorial_scene == true then "/tutorialScene"
           elif .quest_scene == true then "/questScene"
           else empty end' "$1" 2>/dev/null || true
}

# SCENE=normal|quest|tutorial sets both keys, keeping every other key, so the
# arg above and what TavernLib tells clients agree. Unset leaves the file alone,
# so a scene chosen some other way survives a restart.
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
