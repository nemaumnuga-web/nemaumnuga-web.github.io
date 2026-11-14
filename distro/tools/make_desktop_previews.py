#!/usr/bin/env python3
"""Render the composed desktop previews (light and dark) with KDE's KSvg.

Run inside the OS image, which has org.kde.ksvg (the host usually does not):

    podman run --rm -v "$PWD:/src" -w /src --entrypoint python3 localhost/nuri:dev \\
        tools/make_desktop_previews.py

Writes docs/screenshots/desktop-{light,dark}.png and the Global Theme thumbnails
(previews/fullscreenpreview.jpg, previews/preview.png). These are compositions of
the real theme art (see tools/desktop_preview.qml), not captures of a session.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARE = ROOT / "system_files/usr/share"
SHOTS = ROOT / "docs/screenshots"
LNF = SHARE / "plasma/look-and-feel/org.nuri.desktop/contents/previews"


def scheme_colors(name):
    """ColorScheme-* colours for the Plasma SVG stylesheet, from a .colors file."""
    text = (SHARE / "color-schemes" / (name + ".colors")).read_text()

    def get(group, key):
        block = text.split("[%s]" % group, 1)[1].split("\n[", 1)[0]
        r, g, b = (int(v) for v in re.search(r"^%s=(.*)$" % key, block, re.M).group(1).split(",")[:3])
        return "#%02x%02x%02x" % (r, g, b)
    return {"Background": get("Colors:Window", "BackgroundNormal"),
            "Text": get("Colors:Window", "ForegroundNormal")}


def coloured_theme(tmp, scheme):
    """Copy the Plasma style with `scheme`'s colours baked in. Inside a session
    Plasma colours the SVGs from the active colour scheme itself."""
    dst = Path(tmp) / scheme
    shutil.copytree(SHARE / "plasma/desktoptheme/Nuri", dst)
    cols = scheme_colors(scheme)
    for svg in dst.rglob("*.svg"):
        s = svg.read_text()
        for cls, col in cols.items():
            # KSvg recolours anything with a ColorScheme class from the session palette,
            # so bake the colour in instead
            s = s.replace('class="ColorScheme-%s" fill="currentColor"' % cls, 'fill="%s"' % col)
        svg.write_text(s)
    return dst


def render(out, dark, plasma_dir):
    env = dict(os.environ, QT_QUICK_BACKEND="software", QT_QPA_PLATFORM="offscreen")
    subprocess.run([sys.executable, str(ROOT / "tools/render_qml.py"), str(ROOT / "tools/desktop_preview.qml"),
                    str(out), "1920x1080", "--prop", "base=%s" % SHARE, "--prop", "dark=%d" % dark,
                    "--prop", "plasmaDir=%s" % plasma_dir, "--wait", "2500"], check=True, env=env)


def main():
    from PyQt6.QtCore import Qt
    from PyQt6.QtGui import QImage
    SHOTS.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for dark, scheme in ((0, "Nuri"), (1, "NuriDark")):
            out = SHOTS / ("desktop-%s.png" % ("dark" if dark else "light"))
            render(out, dark, coloured_theme(tmp, scheme))
    img = QImage(str(SHOTS / "desktop-light.png"))
    img.save(str(LNF / "fullscreenpreview.jpg"), "JPG", 90)
    img.scaled(600, 338, Qt.AspectRatioMode.IgnoreAspectRatio,
               Qt.TransformationMode.SmoothTransformation).save(str(LNF / "preview.png"))
    print("wrote", SHOTS / "desktop-light.png", SHOTS / "desktop-dark.png", LNF)


if __name__ == "__main__":
    main()
