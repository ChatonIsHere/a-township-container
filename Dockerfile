FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive \
    HOME=/root \
    WINEARCH=win64 \
    WINEPREFIX=/root/.wine \
    # wine is loud asf
    WINEDEBUG=err+all \
    WINEDLLOVERRIDES="mscoree=d;mshtml=d;d3d9,d3d10core,d3d11,dxgi=n;version=n,b" \
    # container has no GPU, this is a workaround, we might not need this going forward
    LIBGL_ALWAYS_SOFTWARE=1 \
    XDG_RUNTIME_DIR=/tmp/xdg-runtime \
    VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.x86_64.json

RUN dpkg --add-architecture i386 && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        wget gnupg2 ca-certificates xvfb x11vnc novnc websockify \
        cabextract unzip p7zip-full winetricks xdg-user-dirs dbus-x11 \
        libgl1-mesa-dri libglx-mesa0 mesa-utils \
        mesa-vulkan-drivers libvulkan1 vulkan-tools && \
    mkdir -pm755 /etc/apt/keyrings && \
    wget -O /etc/apt/keyrings/winehq-archive.key https://dl.winehq.org/wine-builds/winehq.key && \
    wget -NP /etc/apt/sources.list.d/ https://dl.winehq.org/wine-builds/ubuntu/dists/jammy/winehq-jammy.sources && \
    apt-get update && \
    apt-get install -y --install-recommends winehq-stable && \
    rm -rf /var/lib/apt/lists/*

# no sound card in the container, so route ALSA to a null device instead of erroring/crashing on audio init
RUN printf 'pcm.!default {\n    type null\n}\nctl.!default {\n    type null\n}\n' > /etc/asound.conf

# create the wine prefix once at build time so containers start faster and don't repeat first-run setup
RUN mkdir -p "$XDG_RUNTIME_DIR" && chmod 700 "$XDG_RUNTIME_DIR" && \
    wineboot --init && wineserver --wait

ENV DXVK_VERSION=1.10.3

# wine doesn't like directx very much so we're using a translation layer, again we might be able to get rid of this with -nographics
RUN wget -O /tmp/dxvk.tar.gz "https://github.com/doitsujin/dxvk/releases/download/v${DXVK_VERSION}/dxvk-${DXVK_VERSION}.tar.gz" && \
    mkdir -p /opt/dxvk && tar -xzf /tmp/dxvk.tar.gz -C /opt/dxvk --strip-components=1 && \
    rm -f /tmp/dxvk.tar.gz

# the game files and client/server zips end up here
WORKDIR /game

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
