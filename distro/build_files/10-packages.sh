#!/usr/bin/bash
# System packages layered on top of Fedora Kinoite.
set -euxo pipefail

PACKAGES=(
    # On-device AI engine (llama.cpp: llama-server, CPU first, GPU when present)
    llama-cpp
    python3

    # Windows app compatibility (Bottles/Steam come as Flatpaks at first boot)
    wine
    winetricks

    # Windows/Mac file & network interop
    ntfs-3g
    exfatprogs
    samba-client
    cifs-utils
)

dnf5 -y install --setopt=install_weak_deps=False "${PACKAGES[@]}"
