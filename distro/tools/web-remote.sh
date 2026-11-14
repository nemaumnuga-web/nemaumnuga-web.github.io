#!/usr/bin/bash
# Remote-control a Nuri OS container from a web browser (noVNC), without a GPU.
#
# KWin/Plasma 6.8 cannot start without a GPU render node, so this session runs
# the OS's apps (Nuri AI, Nuri Welcome, Dolphin, Konsole, ...) on a small
# compositor instead of the Plasma shell:
#   Xvfb (virtual screen) -> labwc (pixman) + waybar menu bar and dock -> apps
#   x11vnc -> websockify + noVNC (http://127.0.0.1:6080/vnc.html)
# labwc gets the Nuri look from tools/web-remote/ (traffic-light buttons,
# rounded corners, shadows, top menu bar, floating dock with running dots).
# Without labwc it falls back to Weston's desktop shell.
# Put it on your tailnet with `tailscale serve 6080` (see README).
#
#   podman run -d --name nuri-remote --network host IMAGE sleep infinity
#   podman cp tools nuri-remote:/src/tools
#   podman exec nuri-remote dnf5 -y install xorg-x11-server-Xvfb x11vnc novnc python3-websockify \
#       dbus-daemon labwc waybar swaybg wlr-randr  # (or weston instead of the last four)
#   podman exec -e NURI_VNC_PASSWORD=... nuri-remote bash /src/tools/web-remote.sh
#
# Env: NURI_VNC_PASSWORD (required: anyone with the link and this can use the
# session, including a terminal), W/H (screen size), WEB_PORT (default 6080),
# NURI_REMOTE_SHELL=labwc|weston (default: labwc when installed).
set -euo pipefail

: "${NURI_VNC_PASSWORD:?set NURI_VNC_PASSWORD (at least 8 characters)}"
[ ${#NURI_VNC_PASSWORD} -ge 8 ] || { echo "NURI_VNC_PASSWORD: use at least 8 characters" >&2; exit 1; }
W="${W:-1600}" H="${H:-1000}" WEB_PORT="${WEB_PORT:-6080}" VNC_PORT="${VNC_PORT:-5905}"
USER_NAME=nuri
DISPLAY_NUM=:5
HERE=$(cd "$(dirname "$0")" && pwd)
SHELL_KIND=${NURI_REMOTE_SHELL:-$(command -v labwc >/dev/null && command -v waybar >/dev/null && echo labwc || echo weston)}

id "$USER_NAME" >/dev/null 2>&1 || useradd -m "$USER_NAME"
HOME_DIR=$(getent passwd "$USER_NAME" | cut -d: -f6)
RUN=/tmp/nuri-remote
mkdir -p "$RUN" && chown "$USER_NAME" "$RUN"
WALL=/usr/share/wallpapers/Nuri/contents/images/1920x1080.jpg

# Dock icons as PNG (Weston and waybar's image module want bitmaps; the Nuri theme is SVG).
# Rendered at 2x with a little transparent margin so neighbours never touch.
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
                  ("org.kde.gwenview", "apps"), ("nuri-control", "apps"), ("nuri-about", "apps"),
                  ("user-trash", "places")):
    r = QSvgRenderer(base + ctx + "/" + name + ".svg")
    if not r.isValid():
        continue
    for size, pad, suffix in ((40, 4, "-small"), (100, 2, "")):
        img = QImage(size, size, QImage.Format.Format_ARGB32_Premultiplied)
        img.fill(0)
        p = QPainter(img); p.setRenderHint(QPainter.RenderHint.Antialiasing)
        r.render(p, QRectF(pad, pad, size - 2 * pad, size - 2 * pad)); p.end()
        img.save(os.path.join(sys.argv[1], name + suffix + ".png"))
PY

if [ "$SHELL_KIND" = labwc ]; then
    CONF="$HOME_DIR/.config"
    mkdir -p "$CONF/labwc" "$CONF/nuri-remote/waybar" "$HOME_DIR/.local/share/themes/Nuri"
    cp "$HERE/web-remote/labwc/"* "$CONF/labwc/"
    cp -r "$HERE/web-remote/theme/openbox-3" "$HOME_DIR/.local/share/themes/Nuri/"
    cp "$HERE/web-remote/waybar/style.css" "$CONF/nuri-remote/waybar/"
    sed "s#@ICONS@#$ICONS#g" "$HERE/web-remote/waybar/config.jsonc" > "$RUN/waybar.jsonc"
    chown -R "$USER_NAME" "$CONF" "$HOME_DIR/.local" "$RUN"
    START_SHELL="DISPLAY=$DISPLAY_NUM WLR_BACKENDS=x11 WLR_RENDERER=pixman WLR_X11_OUTPUTS=1 \\
    NURI_RUN=$RUN NURI_WALL=$WALL labwc > $RUN/labwc.log 2>&1 &
for i in \$(seq 50); do ls \$XDG_RUNTIME_DIR/wayland-? >/dev/null 2>&1 && break; sleep 0.2; done
export WAYLAND_DISPLAY=\$(basename \$(ls \$XDG_RUNTIME_DIR/wayland-? | head -1))
# the X11 output starts at 1024x768: grow it to the whole virtual screen
for i in \$(seq 20); do wlr-randr --output X11-1 --custom-mode ${W}x${H} 2>/dev/null && break; sleep 0.3; done"
else
    launcher() {  # icon-name tooltip command...
        [ -f "$ICONS/$1-small.png" ] || return 0
        command -v "${3%% *}" >/dev/null || return 0
        printf '\n[launcher]\nicon=%s\ndisplayname=%s\npath=%s\n' "$ICONS/$1-small.png" "$2" "$3"
    }
    {
        printf '[core]\nshell=desktop\nidle-time=0\n\n'
        printf '[shell]\nbackground-image=%s\nbackground-type=scale-crop\n' "$WALL"
        printf 'panel-position=bottom\npanel-color=0xb8f4f5fa\nclock-format=minutes\nlocking=false\nanimation=zoom\n'
        launcher system-file-manager "파일 (Files)" "/usr/bin/dolphin"
        launcher nuri-assistant "누리 AI" "/usr/bin/nuri-assistant"
        launcher utilities-terminal "터미널 (Terminal)" "/usr/bin/konsole"
        launcher accessories-text-editor "텍스트 편집기 (Editor)" "/usr/bin/kwrite"
        launcher org.kde.gwenview "사진 (Photos)" "/usr/bin/gwenview"
        launcher nuri-control "제어 센터 (Control Center)" "/usr/bin/nuri-control"
        launcher nuri-about "이 컴퓨터에 관하여 (About)" "/usr/bin/nuri-about"
        launcher nuri-welcome "누리 환영 (Welcome)" "/usr/bin/nuri-welcome"
        launcher preferences-system "시스템 설정 (Settings)" "/usr/bin/systemsettings"
        # no on-screen keyboard: it popped up over every text field in the browser view
        printf '\n[input-method]\npath=\n'
    } > "$RUN/weston.ini"
    chown "$USER_NAME" "$RUN/weston.ini"
    START_SHELL="DISPLAY=$DISPLAY_NUM weston --backend=x11 --renderer=pixman --width=$W --height=$H \\
    --config=$RUN/weston.ini --socket=wayland-nuri > $RUN/weston.log 2>&1 &
sleep 3
export WAYLAND_DISPLAY=wayland-nuri
nuri-welcome > $RUN/welcome.log 2>&1 &"
fi

# VNC password file (x11vnc's own format), readable by the session user only
x11vnc -storepasswd "$NURI_VNC_PASSWORD" "$RUN/passwd" >/dev/null 2>&1
chown "$USER_NAME" "$RUN/passwd"
chmod 600 "$RUN/passwd"

cat > "$RUN/session.sh" <<EOF
#!/usr/bin/bash
export XDG_RUNTIME_DIR=$RUN/xdg; mkdir -p -m 700 \$XDG_RUNTIME_DIR
export LANG=\${LANG:-ko_KR.UTF-8} LC_ALL=\${LANG:-ko_KR.UTF-8}
export XDG_CURRENT_DESKTOP=KDE KDE_FULL_SESSION=true QT_QUICK_BACKEND=software LIBGL_ALWAYS_SOFTWARE=1
export QT_QPA_PLATFORMTHEME=kde QT_QPA_PLATFORM=wayland
# a container restart leaves the old X lock behind and Xvfb then refuses to start
pgrep -x Xvfb >/dev/null || rm -f /tmp/.X${DISPLAY_NUM#:}-lock /tmp/.X11-unix/X${DISPLAY_NUM#:}
Xvfb $DISPLAY_NUM -screen 0 ${W}x${H}x24 -nolisten tcp > $RUN/xvfb.log 2>&1 &
sleep 2
$START_SHELL
dbus-update-activation-environment --all 2>/dev/null || true
# restarted if it ever exits, so a dropped viewer never leaves the page unable to connect
(while true; do
    x11vnc -display $DISPLAY_NUM -rfbauth $RUN/passwd -rfbport $VNC_PORT -localhost -forever -shared \\
        -noxdamage -o $RUN/x11vnc.log > /dev/null 2>&1
    sleep 1
done) &
websockify --web /usr/share/novnc 127.0.0.1:$WEB_PORT 127.0.0.1:$VNC_PORT > $RUN/websockify.log 2>&1 &
wait
EOF
chmod 755 "$RUN/session.sh"
chown "$USER_NAME" "$RUN/session.sh"
echo "starting ($SHELL_KIND): open http://127.0.0.1:$WEB_PORT/vnc.html (or your tailnet URL + /vnc.html)"
exec su "$USER_NAME" -c "cd ~ && dbus-run-session -- $RUN/session.sh"
