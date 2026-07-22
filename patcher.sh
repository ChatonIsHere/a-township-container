#!/bin/bash
set -e

GAME_DIR="/game-files"
META="$GAME_DIR/.att-patch-meta.json"
MANAGED_DIR="$GAME_DIR/A Township Tale_Data/Managed"
FORCE="${1:-}"

MELONLOADER_URL="https://github.com/LavaGang/MelonLoader/releases/latest/download/MelonLoader.x64.zip"
TAVERNLIB_URL="https://github.com/ModdingTavern/TavernLib/releases/latest/download/TavernLib.dll"
LAUNCHER_LATEST_URL="https://github.com/ModdingTavern/TavernLauncher/releases/latest"

if [ ! -d "$MANAGED_DIR" ]; then
    echo "PATCHER: $MANAGED_DIR not found, game-source must contain the base game files" >&2
    exit 1
fi

[ -f "$META" ] || echo '{}' > "$META"

meta_get() { jq -r --arg k "$1" '.[$k] // empty' "$META" 2>/dev/null; }
meta_set() {
    local tmp
    tmp=$(mktemp)
    jq --arg k "$1" --arg v "$2" '.[$k] = $v' "$META" > "$tmp" && mv "$tmp" "$META"
}

redirect_of() { curl -sfI -o /dev/null -w '%{redirect_url}' "$1"; }

melonloader_latest_tag() { redirect_of "$MELONLOADER_URL" | sed -n 's|.*/releases/download/\([^/]*\)/.*|\1|p'; }
launcher_latest_tag() { redirect_of "$LAUNCHER_LATEST_URL" | sed 's|.*/||'; }

tavernlib_fingerprint() {
    curl -sfIL "$TAVERNLIB_URL" | tr -d '\r' | awk '
        tolower($1) == "etag:" { e = $2 }
        tolower($1) == "last-modified:" { sub(/^[^ ]+ /, ""); l = $0 }
        END { print (e != "" ? e : l) }'
}

up_to_date() {
    local installed="$1" key="$2" latest="$3"
    [ "$FORCE" = "force" ] && return 1
    [ "$installed" = "yes" ] || return 1
    [ -z "$latest" ] && return 0
    [ "$(meta_get "$key")" = "$latest" ]
}

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

installed="no"
[ -d "$GAME_DIR/MelonLoader" ] && [ -f "$GAME_DIR/version.dll" ] && installed="yes"
latest=$(melonloader_latest_tag || true)
if up_to_date "$installed" melonloader_tag "$latest"; then
    echo "PATCHER: MelonLoader is current ($(meta_get melonloader_tag))"
else
    if [ -z "$latest" ] && [ "$installed" = "no" ]; then
        echo "PATCHER: MelonLoader is not installed and GitHub is unreachable" >&2
        exit 1
    fi
    echo "PATCHER: installing MelonLoader $latest"
    curl -sfL -o "$TMP_DIR/MelonLoader.zip" "$MELONLOADER_URL"
    unzip -q -o "$TMP_DIR/MelonLoader.zip" -d "$GAME_DIR"
    meta_set melonloader_tag "$latest"
fi

installed="no"
[ -f "$GAME_DIR/Plugins/TavernLib.dll" ] && installed="yes"
latest=$(tavernlib_fingerprint || true)
if up_to_date "$installed" tavernlib_fingerprint "$latest"; then
    echo "PATCHER: TavernLib is current"
else
    if [ -z "$latest" ] && [ "$installed" = "no" ]; then
        echo "PATCHER: TavernLib is not installed and GitHub is unreachable" >&2
        exit 1
    fi
    echo "PATCHER: installing latest TavernLib"
    mkdir -p "$GAME_DIR/Plugins"
    curl -sfL -o "$TMP_DIR/TavernLib.dll" "$TAVERNLIB_URL"
    mv "$TMP_DIR/TavernLib.dll" "$GAME_DIR/Plugins/TavernLib.dll"
    meta_set tavernlib_fingerprint "$latest"
fi

installed="no"
[ -f "$MANAGED_DIR/Root.Township.dll" ] && [ -n "$(meta_get launcher_tag)" ] && installed="yes"
latest=$(launcher_latest_tag || true)
if up_to_date "$installed" launcher_tag "$latest"; then
    echo "PATCHER: core patch is current (TavernLauncher $(meta_get launcher_tag))"
else
    if [ -z "$latest" ] && [ "$installed" = "no" ]; then
        echo "PATCHER: core patch is not applied and GitHub is unreachable" >&2
        exit 1
    fi
    echo "PATCHER: applying core patch from TavernLauncher $latest"
    curl -sfL -o "$TMP_DIR/launcher.zip" \
        "https://github.com/ModdingTavern/TavernLauncher/releases/latest/download/TavernLauncher-Server-$latest.zip"
    unzip -q -j -o "$TMP_DIR/launcher.zip" "*/Patch/themoddingtavern.dll" -d "$TMP_DIR"
    cp "$TMP_DIR/themoddingtavern.dll" "$MANAGED_DIR/Root.Township.dll"
    meta_set launcher_tag "$latest"
fi

echo "PATCHER: done"
