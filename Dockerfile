FROM ubuntu:22.04

# USER names the wine profile folder, so it stays "root" to keep the mount paths from when the
# image ran as root. The game itself runs unprivileged, see entrypoint.sh
ENV DEBIAN_FRONTEND=noninteractive \
    HOME=/root \
    USER=root \
    WINEARCH=win64 \
    WINEPREFIX=/root/.wine \
    # wine is loud asf
    WINEDEBUG=err+all \
    WINEDLLOVERRIDES="mscoree=d;mshtml=d;version=n,b" \
    XDG_RUNTIME_DIR=/tmp/xdg-runtime

RUN dpkg --add-architecture i386 && \
    apt-get update && \
    # python3 runs console-bridge.py, which saves the world on stop
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

# the prefix is built once here, owned by uid 1000 (the usual first user on a Linux host) so most
# installs never need it chowned at start
RUN mkdir -p /tmp/.X11-unix "$XDG_RUNTIME_DIR" && chmod 1777 /tmp/.X11-unix && \
    chmod 700 "$XDG_RUNTIME_DIR" && chown 1000:1000 /root "$XDG_RUNTIME_DIR"
USER 1000:1000
RUN wineboot --init && wineserver --wait
USER root

WORKDIR /game-files

COPY --chmod=755 entrypoint.sh patcher.sh console-bridge.py /
COPY tavern-settings.sh /tavern-settings.sh

ENTRYPOINT ["/entrypoint.sh"]
