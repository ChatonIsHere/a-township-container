# CubeCoders AMP variant, published as :latest-amp
# AMP mounts the instance into the container and runs att-launch.sh as the server executable, so the
# game, wine prefix and configs all live in the instance. The base image already has wine 10 pinned
FROM cubecoders/ampbase:wine-10-stable

ENV DEBIAN_FRONTEND=noninteractive \
    WINEARCH=win64 \
    # wine is loud asf
    WINEDEBUG=err+all \
    WINEDLLOVERRIDES="mscoree=d;mshtml=d;version=n,b" \
    XDG_RUNTIME_DIR=/tmp/xdg-runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl jq ca-certificates procps unzip xvfb && \
    rm -rf /var/lib/apt/lists/*

# no sound card in the container, so route ALSA to a null device instead of erroring/crashing on audio init
RUN printf 'pcm.!default {\n    type null\n}\nctl.!default {\n    type null\n}\n' > /etc/asound.conf

# AMP runs the container as its own non-root user, which can't create these itself
RUN mkdir -p /tmp/.X11-unix "$XDG_RUNTIME_DIR" && chmod 1777 /tmp/.X11-unix "$XDG_RUNTIME_DIR"

# built once here and copied into the instance on first start; readable by whatever user AMP uses
RUN export WINEPREFIX=/opt/wine-template && wineboot --init && wineserver --wait && \
    chmod -R a+rX /opt/wine-template

COPY --chmod=755 patcher.sh amp/att-launch.sh console-bridge.py /
COPY tavern-settings.sh /tavern-settings.sh
