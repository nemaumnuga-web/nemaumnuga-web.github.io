#!/usr/bin/env python3
"""Generate Nuri OS's default wallpaper (light + dark) - original artwork.

    python3 tools/make_wallpaper.py        # needs Pillow

Soft aurora-like colour fields: a few large blurred blobs on a gradient,
rendered small and upscaled so it is fast and band-free. Deterministic.
"""
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "system_files/usr/share/wallpapers/Nuri/contents"
W, H = 3840, 2160
SMALL = (384, 216)

THEMES = {
    "images": {
        "top": (236, 240, 255), "bottom": (250, 236, 246),
        "blobs": [((96, 116, 255), 0.55), ((166, 120, 255), 0.5), ((255, 150, 200), 0.45),
                  ((110, 205, 255), 0.45)],
    },
    "images_dark": {
        "top": (14, 16, 34), "bottom": (30, 14, 38),
        "blobs": [((70, 82, 230), 0.6), ((132, 72, 230), 0.55), ((214, 82, 160), 0.45),
                  ((40, 140, 220), 0.4)],
    },
}


def render(theme, seed=7):
    rnd = random.Random(seed)
    w, h = SMALL
    img = Image.new("RGB", SMALL)
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        c = tuple(int(a + (b - a) * t) for a, b in zip(theme["top"], theme["bottom"]))
        for x in range(w):
            px[x, y] = c
    for color, alpha in theme["blobs"]:
        layer = Image.new("RGBA", SMALL, color + (0,))
        d = ImageDraw.Draw(layer)
        cx, cy = rnd.uniform(0.1, 0.9) * w, rnd.uniform(0.15, 0.85) * h
        rx, ry = rnd.uniform(0.25, 0.45) * w, rnd.uniform(0.25, 0.5) * h
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color + (int(255 * alpha),))
        layer = layer.filter(ImageFilter.GaussianBlur(radius=38))
        img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")
    img = img.filter(ImageFilter.GaussianBlur(radius=6))
    big = img.resize((W, H), Image.Resampling.BICUBIC)
    # A whisper of noise hides 8-bit banding on large displays.
    noise = Image.effect_noise((W, H), 6).convert("RGB")
    return Image.blend(big, noise, 0.025)


def main():
    for folder, theme in THEMES.items():
        d = OUT / folder
        d.mkdir(parents=True, exist_ok=True)
        img = render(theme)
        img.save(d / ("%dx%d.png" % (W, H)), optimize=True)
        img.resize((1920, 1080), Image.Resampling.LANCZOS).save(d / "1920x1080.png", optimize=True)
        print("wrote", d)
    render(THEMES["images"]).resize((400, 225)).save(OUT / "screenshot.png")


if __name__ == "__main__":
    main()
