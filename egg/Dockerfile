# Pterodactyl/Pelican/Calagopus variant - published as :latest-egg
# Wings bind-mounts a single (initially empty) data directory over /home/container and runs the
# container as its own uid regardless of what this image says, so everything the standalone image
# spreads over three mounts lives together in /home/container here instead
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive \
    HOME=/home/container \
    WINEARCH=win64 \
    WINEPREFIX=/home/container/.wine \
    # wine is loud asf
    WINEDEBUG=err+all \
    WINEDLLOVERRIDES="mscoree=d;mshtml=d;version=n,b" \
    XDG_RUNTIME_DIR=/tmp/xdg-runtime \
    # patcher.sh patches the game where Wings mounts it instead of /game-files
    # (entrypoint.sh re-exports this, it's here so the value is visible in docker inspect)
    GAME_DIR=/home/container/game-source

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

# Wings runs server containers as uid 988 by default, so bake in a matching user for wine to resolve
RUN useradd -m -u 988 -d /home/container -s /bin/bash container

# Xvfb can't create this itself when the container runs as a non-root uid, so make it up front
RUN mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

# the wine prefix template is still created once at build time, but it can't live in /home/container
# (Wings mounts over it), so it's baked to /opt/wine-template and copied into place on first boot
RUN mkdir -p "$XDG_RUNTIME_DIR" /opt/wine-template && \
    chmod 1777 "$XDG_RUNTIME_DIR" && \
    chown container:container /opt/wine-template

USER container
RUN export WINEPREFIX=/opt/wine-template && wineboot --init && wineserver --wait && \
    # the prefix must be readable by whatever uid the panel ends up running as
    chmod -R a+rX /opt/wine-template

USER root
COPY egg/entrypoint.sh /entrypoint.sh
COPY patcher.sh /patcher.sh
RUN chmod +x /entrypoint.sh /patcher.sh

USER container
WORKDIR /home/container

# Wings images use CMD rather than ENTRYPOINT by convention
CMD ["/bin/bash", "/entrypoint.sh"]
