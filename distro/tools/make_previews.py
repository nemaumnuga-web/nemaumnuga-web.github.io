#!/usr/bin/env python3
"""Splash thumbnail for the "Nuri" global theme (System Settings > Global Theme).

    python3 tools/make_previews.py      # needs Pillow and PyQt6

* previews/splash.png - real render of splash/Splash.qml

The desktop thumbnails (previews/preview.png, fullscreenpreview.jpg) need KDE's
KSvg and are made inside the image: `make previews` (tools/make_desktop_previews.py).
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LNF = ROOT / "system_files/usr/share/plasma/look-and-feel/org.nuri.desktop/contents"


def main():
    (LNF / "previews").mkdir(parents=True, exist_ok=True)
    big = LNF / "previews/splash-full.png"
    subprocess.run([sys.executable, str(ROOT / "tools/render_qml.py"), str(LNF / "splash/Splash.qml"),
                    str(big), "1920x1080", "--prop", "stage=4", "--wait", "1500"], check=True)
    Image.open(big).convert("RGB").resize((600, 338), Image.Resampling.LANCZOS).save(LNF / "previews/splash.png")
    big.unlink()
    print("wrote", LNF / "previews/splash.png")


if __name__ == "__main__":
    main()
