#!/usr/bin/bash
# System packages layered on top of Fedora Kinoite.
set -euxo pipefail

PACKAGES=(
    # On-device AI: llama-server is built in the Containerfile's llama stage
    python3
    # Graphical AI panel and model library
    python3-pyqt6

    # Korean input (Hangul key / Ctrl+Space); CJK fonts already ship in Kinoite
    fcitx5
    fcitx5-hangul
    fcitx5-qt
    fcitx5-gtk
    # kcm-fcitx5 is uninstallable in Fedora 45 right now (needs libPlasma.so.7);
    # the standalone settings tool works instead.
    fcitx5-configtool

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
