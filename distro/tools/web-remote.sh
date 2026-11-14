#!/usr/bin/bash
# Remote-control a Nuri OS container from a web browser (noVNC), without a GPU.
#
# KWin/Plasma 6.8 cannot start without a GPU render node, so this session runs
# the OS's apps (Nuri AI, Nuri Welcome, Dolphin, Konsole, ...) on Weston instead
# of the Plasma shell:
#   Xvfb (virtual screen) -> Weston (pixman, desktop shell) -> apps
#   x11vnc -> websockify + noVNC (http://127.0.0.1:6080/vnc.html)
# Put it on the internet with e.g. `tailscale funnel 6080` (see README).
#
#   podman run -d --name nuri-remote --network host IMAGE sleep infinity
#   podman exec nuri-remote dnf5 -y install xorg-x11-server-Xvfb weston x11vnc novnc python3-websockify dbus-daemon
#   podman exec -e NURI_VNC_PASSWORD=... nuri-remote bash /src/tools/web-remote.sh
#
# Env: NURI_VNC_PASSWORD (required: anyone with the link and this can use the
# session, including a terminal), W/H (screen size), WEB_PORT (default 6080).
set -euo pipefail

: "${NURI_VNC_PASSWORD:?set NURI_VNC_PASSWORD (at least 8 characters)}"
[ ${#NURI_VNC_PASSWORD} -ge 8 ] || { echo "NURI_VNC_PASSWORD: use at least 8 characters" >&2; exit 1; }
W="${W:-1600}" H="${H:-1000}" WEB_PORT="${WEB_PORT:-6080}" VNC_PORT="${VNC_PORT:-5905}"
USER_NAME=nuri
DISPLAY_NUM=:5

id "$USER_NAME" >/dev/null 2>&1 || useradd -m "$USER_NAME"
HOME_DIR=$(getent passwd "$USER_NAME" | cut -d: -f6)
RUN=/tmp/nuri-remote
mkdir -p "$RUN" && chown "$USER_NAME" "$RUN"

# Dock launcher icons: Weston wants PNGs, the Nuri theme is SVG.
ICONS="$RUN/icons"
mkdir -p "$ICONS"
python3 - "$ICONS" <<'PY'
import os, sys
os.environ["QT_QPA_PLATFORM"] = "offscreen"
from PyQt6.QtCore import QRectF
from PyQt6.QtGui import QGuiApplication, QImage, QPainter
from PyQt6.QtSvg import QSvgRenderer
app = QGuiApplication([])
base = "/usr/share/icons/Nuri/scalable/"
for name, ctx in (("system-file-manager", "apps"), ("nuri-assistant", "apps"), ("utilities-terminal", "apps"),
                  ("nuri-welcome", "apps"), ("accessories-text-editor", "apps"), ("preferences-system", "apps"),
                  ("org.kde.gwenview", "apps"), ("nuri-control", "apps"), ("nuri-about", "apps")):
    r = QSvgRenderer(base + ctx + "/" + name + ".svg")
    if not r.isValid():
        continue
    img = QImage(48, 48, QImage.Format.Format_ARGB32_Premultiplied)
    img.fill(0)
    p = QPainter(img); p.setRenderHint(QPainter.RenderHint.Antialiasing)
    r.render(p, QRectF(0, 0, 48, 48)); p.end()
    img.save(os.path.join(sys.argv[1], name + ".png"))
PY

launcher() {  # icon-name command...
    [ -f "$ICONS/$1.png" ] || return 0
    command -v "${2%% *}" >/dev/null || return 0
    printf '\n[launcher]\nicon=%s\npath=%s\n' "$ICONS/$1.png" "$2"
}
WALL=/usr/share/wallpapers/Nuri/contents/images/1920x1080.jpg
{
    printf '[core]\nshell=desktop\nidle-time=0\n\n'
    printf '[shell]\nbackground-image=%s\nbackground-type=scale-crop\n' "$WALL"
    printf 'panel-position=bottom\npanel-color=0xccf4f5fa\nclock-format=minutes\nlocking=false\nanimation=zoom\n'
    launcher system-file-manager "/usr/bin/dolphin"
    launcher nuri-assistant "/usr/bin/nuri-assistant"
    launcher utilities-terminal "/usr/bin/konsole"
    launcher accessories-text-editor "/usr/bin/kwrite"
    launcher org.kde.gwenview "/usr/bin/gwenview"
    launcher nuri-control "/usr/bin/nuri-control"
    launcher nuri-about "/usr/bin/nuri-about"
    launcher nuri-welcome "/usr/bin/nuri-welcome"
    launcher preferences-system "/usr/bin/systemsettings"
} > "$RUN/weston.ini"

# VNC password file (x11vnc's own format), readable by the session user only
x11vnc -storepasswd "$NURI_VNC_PASSWORD" "$RUN/passwd" >/dev/null 2>&1
chown "$USER_NAME" "$RUN/passwd" "$RUN/weston.ini"
chmod 600 "$RUN/passwd"

cat > "$RUN/session.sh" <<EOF
#!/usr/bin/bash
export XDG_RUNTIME_DIR=$RUN/xdg; mkdir -p -m 700 \$XDG_RUNTIME_DIR
export LANG=\${LANG:-ko_KR.UTF-8} LC_ALL=\${LANG:-ko_KR.UTF-8}
export XDG_CURRENT_DESKTOP=KDE KDE_FULL_SESSION=true QT_QUICK_BACKEND=software LIBGL_ALWAYS_SOFTWARE=1
export QT_QPA_PLATFORMTHEME=kde
Xvfb $DISPLAY_NUM -screen 0 ${W}x${H}x24 -nolisten tcp > $RUN/xvfb.log 2>&1 &
sleep 2
DISPLAY=$DISPLAY_NUM weston --backend=x11 --renderer=pixman --width=$W --height=$H \\
    --config=$RUN/weston.ini --socket=wayland-nuri > $RUN/weston.log 2>&1 &
sleep 3
export WAYLAND_DISPLAY=wayland-nuri QT_QPA_PLATFORM=wayland
dbus-update-activation-environment --all 2>/dev/null || true
x11vnc -display $DISPLAY_NUM -rfbauth $RUN/passwd -rfbport $VNC_PORT -localhost -forever -shared \\
    -noxdamage -quiet > $RUN/x11vnc.log 2>&1 &
websockify --web /usr/share/novnc 127.0.0.1:$WEB_PORT 127.0.0.1:$VNC_PORT > $RUN/websockify.log 2>&1 &
sleep 2
nuri-welcome > $RUN/welcome.log 2>&1 &
wait
EOF
chmod 755 "$RUN/session.sh"
echo "starting: open http://127.0.0.1:$WEB_PORT/vnc.html (or your funnel URL + /vnc.html)"
exec su "$USER_NAME" -c "cd ~ && dbus-run-session -- $RUN/session.sh"
