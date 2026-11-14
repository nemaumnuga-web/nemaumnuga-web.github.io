#!/usr/bin/env python3
"""Write Nuri's KDE colour schemes (Nuri, Nuri Dark) from a small palette.

    python3 tools/make_color_schemes.py

The values are Nuri's own: cool, slightly blue-violet neutrals and the
indigo accent used across the AI panel, splash and wallpaper.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "system_files/usr/share/color-schemes"

ACCENT = (99, 102, 241)       # indigo
ACCENT_HOVER = (129, 140, 248)
LINK = (79, 70, 229)
VISITED = (147, 51, 234)
POS, NEU, NEG = (22, 163, 74), (217, 119, 6), (220, 38, 38)

SCHEMES = {
    "Nuri": {
        "name": "Nuri", "name_ko": "누리",
        "window": (244, 245, 250), "window_alt": (236, 238, 246),
        "view": (255, 255, 255), "view_alt": (246, 247, 252),
        "button": (250, 250, 253), "button_alt": (236, 238, 246),
        "header": (237, 238, 247), "header_inactive": (244, 245, 250),
        "tooltip": (250, 250, 253),
        "text": (24, 25, 34), "inactive": (106, 109, 128),
        "complementary": (24, 25, 38), "complementary_text": (236, 236, 244),
        "contrast": 4, "link": LINK,
    },
    "NuriDark": {
        "name": "Nuri Dark", "name_ko": "누리 어둡게",
        "window": (22, 23, 33), "window_alt": (28, 30, 42),
        "view": (17, 18, 27), "view_alt": (24, 26, 37),
        "button": (34, 36, 50), "button_alt": (28, 30, 42),
        "header": (27, 28, 41), "header_inactive": (22, 23, 33),
        "tooltip": (30, 32, 45),
        "text": (236, 236, 244), "inactive": (150, 153, 173),
        "complementary": (14, 15, 24), "complementary_text": (236, 236, 244),
        "contrast": 4, "link": (165, 180, 252),
    },
}


def rgb(c):
    return "%d,%d,%d" % c


def group(bg, bg_alt, fg, inactive, link):
    return {
        "BackgroundAlternate": rgb(bg_alt), "BackgroundNormal": rgb(bg),
        "DecorationFocus": rgb(ACCENT), "DecorationHover": rgb(ACCENT_HOVER),
        "ForegroundActive": rgb(ACCENT), "ForegroundInactive": rgb(inactive),
        "ForegroundLink": rgb(link), "ForegroundNegative": rgb(NEG),
        "ForegroundNeutral": rgb(NEU), "ForegroundNormal": rgb(fg),
        "ForegroundPositive": rgb(POS), "ForegroundVisited": rgb(VISITED),
    }


def scheme(key, s):
    sections = {
        "ColorEffects:Disabled": {"Color": "56,56,56", "ColorAmount": "0", "ColorEffect": "0",
                                  "ContrastAmount": "0.65", "ContrastEffect": "1",
                                  "IntensityAmount": "0.1", "IntensityEffect": "2"},
        "ColorEffects:Inactive": {"ChangeSelectionColor": "true", "Color": "112,111,110",
                                  "ColorAmount": "0.025", "ColorEffect": "2", "ContrastAmount": "0.1",
                                  "ContrastEffect": "2", "Enable": "false", "IntensityAmount": "0",
                                  "IntensityEffect": "0"},
        "Colors:Button": group(s["button"], s["button_alt"], s["text"], s["inactive"], s["link"]),
        "Colors:Complementary": group(s["complementary"], s["complementary"], s["complementary_text"],
                                      (150, 153, 173), (165, 180, 252)),
        "Colors:Header": group(s["header"], s["header_inactive"], s["text"], s["inactive"], s["link"]),
        "Colors:Header][Inactive": group(s["header_inactive"], s["header"], s["text"], s["inactive"], s["link"]),
        "Colors:Selection": group(ACCENT, (79, 70, 229), (255, 255, 255), (224, 225, 255), (255, 255, 255)),
        "Colors:Tooltip": group(s["tooltip"], s["window_alt"], s["text"], s["inactive"], s["link"]),
        "Colors:View": group(s["view"], s["view_alt"], s["text"], s["inactive"], s["link"]),
        "Colors:Window": group(s["window"], s["window_alt"], s["text"], s["inactive"], s["link"]),
        "General": {"ColorScheme": key, "Name": s["name"], "Name[ko]": s["name_ko"],
                    "shadeSortColumn": "true"},
        "KDE": {"contrast": str(s["contrast"])},
        "WM": {"activeBackground": rgb(s["header"]), "activeBlend": rgb(s["header"]),
               "activeForeground": rgb(s["text"]), "inactiveBackground": rgb(s["header_inactive"]),
               "inactiveBlend": rgb(s["header_inactive"]), "inactiveForeground": rgb(s["inactive"])},
    }
    lines = []
    for name, keys in sections.items():
        lines.append("[%s]" % name)
        lines += ["%s=%s" % kv for kv in keys.items()]
        lines.append("")
    return "\n".join(lines)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for key, s in SCHEMES.items():
        (OUT / (key + ".colors")).write_text(scheme(key, s), encoding="utf-8")
        print("wrote", OUT / (key + ".colors"))


if __name__ == "__main__":
    main()
