#!/usr/bin/env python3
"""Thumbnails for the "Nuri" global theme (System Settings > Global Theme).

    python3 tools/make_previews.py      # needs Pillow and PyQt6

* previews/splash.png      - real render of splash/Splash.qml
* previews/preview.png,    - an *illustration* of the default layout (wallpaper,
  fullscreenpreview.jpg      top bar, dock) drawn here, not a desktop capture
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
LNF = ROOT / "system_files/usr/share/plasma/look-and-feel/org.nuri.desktop/contents"
WALL = ROOT / "system_files/usr/share/wallpapers/Nuri/contents/images/3840x2160.jpg"
LOGO = ROOT / "system_files/usr/share/pixmaps/nuri-logo.png"
DOCK = [("#3b82f6", "folder"), ("#f97316", "web"), (None, "nuri"), ("#1f2937", "term"),
        ("#22c55e", "store"), ("#64748b", "gear")]


def font(size):
    """A font that has Hangul (via fontconfig), falling back to Pillow's default."""
    try:
        path = subprocess.run(["fc-match", "-f", "%{file}", "sans:lang=ko"],
                              capture_output=True, text=True, check=True).stdout.strip()
        return ImageFont.truetype(path, size)
    except (OSError, subprocess.CalledProcessError, FileNotFoundError):
        return ImageFont.load_default(size)


def illustration(w, h):
    s = w / 1920
    img = Image.open(WALL).convert("RGBA").resize((w, h), Image.Resampling.LANCZOS)
    over = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    bar = int(30 * s)
    d.rectangle((0, 0, w, bar), fill=(255, 255, 255, 150))
    logo = Image.open(LOGO).convert("RGBA").resize((int(20 * s),) * 2, Image.Resampling.LANCZOS)
    over.alpha_composite(logo, (int(14 * s), (bar - logo.height) // 2))
    f = font(max(9, int(14 * s)))
    d.text((int(46 * s), bar // 2), "Files   Edit   View   Go", font=f, fill=(30, 30, 40, 230), anchor="lm")
    d.text((w - int(16 * s), bar // 2), "Thu 14  10:24", font=f, fill=(30, 30, 40, 230), anchor="rm")
    d.text((w - int(140 * s), bar // 2), "한", font=f, fill=(79, 70, 229, 255), anchor="mm")

    # dock: soft shadow, frosted pill, icons
    n, ic, gap = len(DOCK), int(52 * s), int(14 * s)
    dw, dh = n * ic + (n + 1) * gap + int(36 * s), ic + 2 * gap
    x0, y0 = (w - dw) // 2, h - dh - int(16 * s)
    sh = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((x0, y0 + int(6 * s), x0 + dw, y0 + dh + int(6 * s)),
                                         radius=int(24 * s), fill=(20, 20, 60, 70))
    over.alpha_composite(sh.filter(ImageFilter.GaussianBlur(int(12 * s) or 1)))
    d.rounded_rectangle((x0, y0, x0 + dw, y0 + dh), radius=int(24 * s), fill=(255, 255, 255, 165),
                        outline=(255, 255, 255, 200), width=max(1, int(s)))
    x = x0 + gap
    for i, (color, kind) in enumerate(DOCK):
        if i == n - 1:
            x += int(18 * s)
            d.line((x - int(9 * s), y0 + gap, x - int(9 * s), y0 + dh - gap), fill=(0, 0, 0, 40), width=max(1, int(s)))
        if kind == "nuri":
            over.alpha_composite(Image.open(LOGO).convert("RGBA").resize((ic, ic), Image.Resampling.LANCZOS), (x, y0 + gap))
        else:
            d.rounded_rectangle((x, y0 + gap, x + ic, y0 + gap + ic), radius=int(13 * s), fill=color)
        x += ic + gap
    img.alpha_composite(over)
    return img.convert("RGB")


def main():
    (LNF / "previews").mkdir(parents=True, exist_ok=True)
    illustration(1920, 1080).save(LNF / "previews/fullscreenpreview.jpg", quality=90)
    illustration(600, 338).save(LNF / "previews/preview.png")
    big = LNF / "previews/splash-full.png"
    subprocess.run([sys.executable, str(ROOT / "tools/render_qml.py"), str(LNF / "splash/Splash.qml"),
                    str(big), "1920x1080", "--prop", "stage=4", "--wait", "1500"], check=True)
    Image.open(big).convert("RGB").resize((600, 338), Image.Resampling.LANCZOS).save(LNF / "previews/splash.png")
    big.unlink()
    print("wrote", LNF / "previews")


if __name__ == "__main__":
    main()
