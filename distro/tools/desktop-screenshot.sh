#!/usr/bin/bash
# Boot a first-login Plasma session on a virtual display inside the image,
# report the panels Plasma actually created, and save screenshots.
# For docs and for checking the default layout/theme without real hardware.
#
#   podman run --rm --device /dev/dri -v "$PWD/shots:/out" -v "$PWD/tools:/tools:ro" \
#       --entrypoint bash IMAGE -c 'dnf5 -y install dbus-daemon && /tools/desktop-screenshot.sh'
#
# Writes /out/desktop.png, /out/desktop-apps.png (Dolphin + Nuri AI open),
# /out/panels.txt and the session logs.
set -euo pipefail

OUT="${OUT:-/out}"
W="${W:-1920}" H="${H:-1080}"
LANG_CODE="${SHOT_LANG:-ko_KR.UTF-8}"
TOOLS="$(dirname "$(readlink -f "$0")")"

# KWin 6.8 needs a DRM render node even for its virtual backend (no software
# fallback). Run on a machine/VM with a GPU and pass --device /dev/dri.
if ! ls /dev/dri/renderD* >/dev/null 2>&1; then
    echo "needs a GPU render node: run the container with --device /dev/dri" >&2
    exit 1
fi

# A booted system gets a session bus from systemd; a bare container does not.
if ! command -v dbus-run-session >/dev/null; then
    echo "needs dbus-run-session (dnf5 install dbus-daemon) in this test container" >&2
    exit 1
fi

id tester >/dev/null 2>&1 || useradd -m tester
mkdir -p "$OUT" && chmod 777 "$OUT"

cat > /tmp/session.sh <<EOF
#!/usr/bin/bash
set -u
export XDG_RUNTIME_DIR=/tmp/xdg-tester; mkdir -p -m 700 "\$XDG_RUNTIME_DIR"
export LANG=$LANG_CODE LC_ALL=$LANG_CODE
export XDG_SESSION_TYPE=wayland XDG_CURRENT_DESKTOP=KDE KDE_FULL_SESSION=true
export QT_QPA_PLATFORM=wayland
# KDE_DEBUG: no crash dialogs in a headless session.
export KDE_DEBUG=1
export KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1 QT_FORCE_STDERR_LOGGING=1
kwin_wayland --virtual --width $W --height $H --socket wayland-shot --no-lockscreen \\
    > /tmp/kwin.log 2>&1 < /dev/null &
for i in \$(seq 1 60); do [ -S "\$XDG_RUNTIME_DIR/wayland-shot" ] && break; sleep 0.5; done
export WAYLAND_DISPLAY=wayland-shot
# D-Bus-activated services must see the display too (systemd does this on a real login).
dbus-update-activation-environment --all 2>/dev/null || true
/usr/libexec/kactivitymanagerd > /tmp/kactivitymanagerd.log 2>&1 < /dev/null &
kded6 > /tmp/kded.log 2>&1 < /dev/null &
plasmashell > /tmp/plasmashell.log 2>&1 < /dev/null &
sleep 30
python3 "$TOOLS/kwin-shot.py" panels > "$OUT/panels.txt" 2>&1 || echo "panel query failed"
python3 "$TOOLS/kwin-shot.py" shot "$OUT/desktop.png" || echo "screenshot failed"
dolphin --new-window "\$HOME" > /tmp/dolphin.log 2>&1 < /dev/null &
sleep 8
nuri-assistant > /tmp/assistant.log 2>&1 < /dev/null &
sleep 8
python3 "$TOOLS/kwin-shot.py" shot "$OUT/desktop-apps.png" || echo "screenshot failed"
cp /tmp/*.log "$OUT"/ 2>/dev/null || true
EOF
chmod 755 /tmp/session.sh
su tester -c "dbus-run-session -- /tmp/session.sh" < /dev/null
ls -la "$OUT"
