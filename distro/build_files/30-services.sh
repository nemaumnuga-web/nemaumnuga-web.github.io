#!/usr/bin/bash
# Enable services shipped in system_files/.
set -euxo pipefail

chmod 0755 /usr/bin/nuri-ai /usr/bin/nuri-assistant /usr/bin/nuri-welcome /usr/libexec/nuri/*

# llama.cpp server (built in the llama stage, see build-llama.sh)
ln -sf /usr/libexec/nuri-llama/llama-server /usr/bin/llama-server

# Refresh caches for the new icon and desktop entry.
gtk-update-icon-cache -qf /usr/share/icons/hicolor || true
gtk-update-icon-cache -qf /usr/share/icons/Nuri || true
update-desktop-database -q /usr/share/applications || true

# First boot: install the default Flatpak apps (needs network, runs once).
systemctl enable nuri-flatpak-setup.service

# Download OS updates in the background and stage them; they apply on the
# next reboot. Nothing reboots the machine behind the user's back.
systemctl enable rpm-ostreed-automatic.timer

# The local AI server is a per-user service so models and chats stay in $HOME.
systemctl --global enable nuri-ai.service
