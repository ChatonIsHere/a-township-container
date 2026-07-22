FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive \
    HOME=/root \
    WINEARCH=win64 \
    WINEPREFIX=/root/.wine \
    # wine is loud asf
    WINEDEBUG=err+all \
    WINEDLLOVERRIDES="mscoree=d;mshtml=d;version=n,b" \
    XDG_RUNTIME_DIR=/tmp/xdg-runtime

RUN dpkg --add-architecture i386 && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        wget curl jq gnupg2 ca-certificates xvfb \
        cabextract unzip p7zip-full winetricks xdg-user-dirs dbus-x11 && \
    mkdir -pm755 /etc/apt/keyrings && \
    wget -O /etc/apt/keyrings/winehq-archive.key https://dl.winehq.org/wine-builds/winehq.key && \
    wget -NP /etc/apt/sources.list.d/ https://dl.winehq.org/wine-builds/ubuntu/dists/jammy/winehq-jammy.sources && \
    apt-get update && \
    # wine is pinned so rebuilds are reproducible; apt needs every wine package pinned to resolve a non-latest version
    apt-get install -y --no-install-recommends \
        winehq-stable=10.0.0.0~jammy-1 \
        wine-stable=10.0.0.0~jammy-1 \
        wine-stable-amd64=10.0.0.0~jammy-1 \
        wine-stable-i386:i386=10.0.0.0~jammy-1 && \
    rm -rf /var/lib/apt/lists/*

# no sound card in the container, so route ALSA to a null device instead of erroring/crashing on audio init
RUN printf 'pcm.!default {\n    type null\n}\nctl.!default {\n    type null\n}\n' > /etc/asound.conf

# create the wine prefix once at build time so containers start faster and don't repeat first-run setup
RUN mkdir -p "$XDG_RUNTIME_DIR" && chmod 700 "$XDG_RUNTIME_DIR" && \
    wineboot --init && wineserver --wait

# the game files and client/server zips end up here
WORKDIR /game-files

COPY entrypoint.sh /entrypoint.sh
COPY patcher.sh /patcher.sh
RUN chmod +x /entrypoint.sh /patcher.sh

ENTRYPOINT ["/entrypoint.sh"]
