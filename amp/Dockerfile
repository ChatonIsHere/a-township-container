# CubeCoders AMP variant - published as :latest-amp
# AMP mounts the whole instance datastore into the container and launches att-launch.sh as the
# "server executable", so the game files, wine prefix, and configs all live inside the instance
# CubeCoders already publish wine-pinned base images, so build on one instead of redoing the WineHQ repo setup
FROM cubecoders/ampbase:wine-10-stable

ENV DEBIAN_FRONTEND=noninteractive \
    WINEARCH=win64 \
    # wine is loud asf
    WINEDEBUG=err+all \
    WINEDLLOVERRIDES="mscoree=d;mshtml=d;version=n,b" \
    XDG_RUNTIME_DIR=/tmp/xdg-runtime

# ampbase is Debian trixie, which has no winetricks package - nothing here calls it anyway
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        wget curl jq ca-certificates xvfb \
        cabextract unzip p7zip-full xdg-user-dirs dbus-x11 && \
    rm -rf /var/lib/apt/lists/*

# no sound card in the container, so route ALSA to a null device instead of erroring/crashing on audio init
RUN printf 'pcm.!default {\n    type null\n}\nctl.!default {\n    type null\n}\n' > /etc/asound.conf

# AMP runs the container as its own non-root user, so both of these need to be world-writable:
# Xvfb can't create its socket directory itself, and the runtime dir is made at build time as root
RUN mkdir -p /tmp/.X11-unix "$XDG_RUNTIME_DIR" && chmod 1777 /tmp/.X11-unix "$XDG_RUNTIME_DIR"

# the wine prefix template is created once at build time and copied into the instance datastore
# on first boot by att-launch.sh, so first starts skip wine's slow first-run setup
RUN export WINEPREFIX=/opt/wine-template && wineboot --init && wineserver --wait && \
    # the prefix must be readable by whatever user AMP runs the container as
    chmod -R a+rX /opt/wine-template

COPY patcher.sh /patcher.sh
COPY amp/att-launch.sh /att-launch.sh
# bridges TavernLib's websocket console onto stdin/stdout, stdlib only so there's nothing to pip install
COPY console-bridge.py /console-bridge.py
RUN chmod +x /patcher.sh /att-launch.sh /console-bridge.py
