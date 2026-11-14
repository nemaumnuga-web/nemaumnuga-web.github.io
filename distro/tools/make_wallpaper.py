#!/usr/bin/env python3
"""Generate Nuri OS's default wallpaper "Silk" (light + dark) - original artwork.

    python3 tools/make_wallpaper.py        # needs numpy and Pillow

Flowing ribbons of light over a soft gradient: each ribbon is a wavy curve
with a wide glow, a bright core and a faint silk sheen, coloured along its
length through the Nuri palette. Deterministic, rendered at 4K.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "system_files/usr/share/wallpapers/Nuri/contents"
W, H = 3840, 2160

PALETTE = np.array([
    (0.36, 0.42, 1.00),   # indigo
    (0.56, 0.36, 0.96),   # violet
    (0.89, 0.44, 0.70),   # pink
    (0.35, 0.72, 1.00),   # sky
], dtype=np.float32)

# (centre, wave amplitudes, frequencies, phases, width, colour offset, strength)
RIBBONS = [
    (0.58, (0.10, 0.035), (0.55, 1.7), (0.10, 0.62), 0.085, 0.00, 1.00),
    (0.64, (0.12, 0.030), (0.48, 1.4), (0.32, 0.15), 0.060, 0.30, 0.85),
    (0.50, (0.08, 0.040), (0.62, 2.1), (0.71, 0.40), 0.045, 0.55, 0.70),
    (0.72, (0.07, 0.025), (0.40, 1.2), (0.05, 0.85), 0.110, 0.80, 0.55),
]

THEMES = {
    "images": dict(top=(0.93, 0.94, 1.00), bottom=(0.99, 0.95, 0.98), mode="mix", gain=0.85, vignette=0.0),
    "images_dark": dict(top=(0.05, 0.06, 0.14), bottom=(0.08, 0.04, 0.12), mode="screen", gain=0.95, vignette=0.35),
}


def palette_at(t):
    """Smooth cyclic interpolation through PALETTE for t in [0, 1)."""
    n = len(PALETTE)
    x = (t % 1.0) * n
    i = np.floor(x).astype(int) % n
    f = (x - np.floor(x))[..., None]
    f = f * f * (3 - 2 * f)  # smoothstep
    return PALETTE[i] * (1 - f) + PALETTE[(i + 1) % n] * f


def render(theme, w=W, h=H):
    u = np.linspace(0, 1, w, dtype=np.float32)[None, :]
    v = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    top, bottom = (np.array(theme[k], np.float32) for k in ("top", "bottom"))
    t = np.clip(0.65 * v + 0.35 * u, 0, 1)[..., None]
    img = top * (1 - t) + bottom * t

    aspect = h / w
    for centre, amps, freqs, phases, width, coff, strength in RIBBONS:
        c = (centre + amps[0] * np.sin(2 * np.pi * (freqs[0] * u + phases[0]))
             + amps[1] * np.sin(2 * np.pi * (freqs[1] * u + phases[1])))
        # gentle diagonal drift, thicker in the middle of the screen
        c = c - 0.18 * (u - 0.5)
        wid = width * (0.7 + 0.5 * np.sin(np.pi * u) ** 2)
        d = (v - c) / (wid / aspect * 0.6)
        glow = np.exp(-d * d)
        core = np.exp(-(d / 0.16) ** 2)
        sheen = 0.5 + 0.5 * np.cos(d * 9.0)
        a = (0.55 * glow * (0.8 + 0.2 * sheen) + 0.35 * core) * strength * theme["gain"]
        col = palette_at(u * 0.9 + coff)  # (1, w, 3)
        a = a[..., None]
        if theme["mode"] == "screen":
            img = 1 - (1 - img) * (1 - col * a)
        else:
            a = np.clip(a * 0.85, 0, 1)
            img = img * (1 - a) + col * a

    if theme["vignette"]:
        r = np.sqrt(((u - 0.5) * 1.2) ** 2 + ((v - 0.5)) ** 2)
        img = img * (1 - theme["vignette"] * np.clip(r - 0.25, 0, 1)[..., None])

    rng = np.random.default_rng(7)
    img = img + rng.normal(0, 0.6 / 255, img.shape).astype(np.float32)  # hides banding
    return Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")


def main():
    for old in OUT.glob("images*/*.png"):
        old.unlink()
    for folder, theme in THEMES.items():
        d = OUT / folder
        d.mkdir(parents=True, exist_ok=True)
        img = render(theme)
        img.save(d / ("%dx%d.jpg" % (W, H)), quality=93, subsampling=0, optimize=True)
        img.resize((1920, 1080), Image.Resampling.LANCZOS).save(
            d / "1920x1080.jpg", quality=93, subsampling=0, optimize=True)
        print("wrote", d)
    render(THEMES["images"], 800, 450).save(OUT / "screenshot.png")


if __name__ == "__main__":
    main()
