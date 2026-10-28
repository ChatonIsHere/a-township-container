# Pterodactyl/Pelican/Calagopus variant, published as :latest-egg
# Wings mounts one empty data directory over /home/container and runs the container as its own uid,
# so everything the standalone image keeps in three mounts lives together in /home/container here
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive \
    HOME=/home/container \
    WINEARCH=win64 \
    WINEPREFIX=/home/container/.wine \
    # wine is loud asf
    WINEDEBUG=err+all \
    WINEDLLOVERRIDES="mscoree=d;mshtml=d;version=n,b" \
    XDG_RUNTIME_DIR=/tmp/xdg-runtime \
    # where patcher.sh finds the game (entrypoint.sh sets it too)
    GAME_DIR=/home/container/game-source

RUN dpkg --add-architecture i386 && \
    apt-get update && \
    # python3 runs console-bridge.py; python3-minimal lacks modules it needs, json included
    apt-get install -y --no-install-recommends curl jq ca-certificates procps unzip xvfb python3 && \
    mkdir -pm755 /etc/apt/keyrings && \
    curl -fsSLo /etc/apt/keyrings/winehq-archive.key https://dl.winehq.org/wine-builds/winehq.key && \
    curl -fsSLo /etc/apt/sources.list.d/winehq-jammy.sources https://dl.winehq.org/wine-builds/ubuntu/dists/jammy/winehq-jammy.sources && \
    apt-get update && \
    # pinned so rebuilds are reproducible; apt needs every wine package pinned to resolve a non-latest version
    apt-get install -y --no-install-recommends \
        winehq-stable=10.0.0.0~jammy-1 \
        wine-stable=10.0.0.0~jammy-1 \
        wine-stable-amd64=10.0.0.0~jammy-1 \
        wine-stable-i386:i386=10.0.0.0~jammy-1 && \
    rm -rf /var/lib/apt/lists/*

# no sound card in the container, so route ALSA to a null device instead of erroring/crashing on audio init
RUN printf 'pcm.!default {\n    type null\n}\nctl.!default {\n    type null\n}\n' > /etc/asound.conf

# Wings runs containers as uid 988 by default, so give wine a matching user
RUN useradd -m -u 988 -d /home/container -s /bin/bash container

# made here because Xvfb and wine can't create them as a non-root user. The prefix is built in
# /opt (Wings mounts over /home/container) and copied into place on first start
RUN mkdir -p /tmp/.X11-unix "$XDG_RUNTIME_DIR" /opt/wine-template && \
    chmod 1777 /tmp/.X11-unix "$XDG_RUNTIME_DIR" && \
    chown container:container /opt/wine-template

USER container
# readable by whatever uid the panel runs the server as
RUN export WINEPREFIX=/opt/wine-template && wineboot --init && wineserver --wait && \
    chmod -R a+rX /opt/wine-template

USER root
COPY --chmod=755 egg/entrypoint.sh patcher.sh console-bridge.py /
COPY tavern-settings.sh /tavern-settings.sh

USER container
WORKDIR /home/container

# Wings images use CMD rather than ENTRYPOINT by convention
CMD ["/bin/bash", "/entrypoint.sh"]
