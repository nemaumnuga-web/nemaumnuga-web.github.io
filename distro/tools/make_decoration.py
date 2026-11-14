#!/usr/bin/env python3
"""Generate the "Nuri" and "NuriDark" window decorations (KWin Aurorae themes).

    python3 tools/make_decoration.py      # needs Pillow

Unified title bar in the window colour, rounded top corners, a soft two-layer
shadow, and close / minimise / maximise as red, yellow and green dots that show
their symbol on hover (grey while the window is inactive). All geometry is
original; the frame is drawn with Pillow (so the shadow can be a real blur) and
embedded in the SVG as PNG slices, the buttons are plain vector SVG.

Aurorae paints `decoration.svg` as a 9-slice frame over the whole decoration,
padding included; the client window covers the middle.
"""
import base64
import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "system_files/usr/share/aurorae/themes"

S = 2                      # slices are rendered at 2x for HiDPI screens
PAD_L = PAD_R = 24         # shadow room around the window
PAD_T, PAD_B = 16, 32
TITLE = 34                 # title bar height
RADIUS = 11
EDGE_L = EDGE_R = PAD_L + RADIUS + 2   # corner slices must hold the rounded corner
EDGE_T = PAD_T + TITLE
EDGE_B = PAD_B + 4
MID = 16                   # width/height of the stretchable middle slices

THEMES = {
    "Nuri": dict(
        title=(244, 245, 250), title_in=(246, 247, 251), line=(0, 0, 0, 38), line_in=(0, 0, 0, 26),
        hi=(255, 255, 255, 200), shadow=0.30, shadow_in=0.16,
        text="38,40,52", text_in="150,152,166",
        grey="#d3d4db", grey_line="#bcbdc7", label="Nuri"),
    "NuriDark": dict(
        title=(22, 23, 33), title_in=(24, 25, 35), line=(0, 0, 0, 170), line_in=(0, 0, 0, 140),
        hi=(255, 255, 255, 22), shadow=0.55, shadow_in=0.35,
        text="236,236,244", text_in="130,133,152",
        grey="#45475a", grey_line="#565868", label="Nuri Dark"),
}

BUTTONS = {  # fill, ring, glyph colour
    "close": ("#fb5f57", "#e1463f", "#7d140e"),
    "minimize": ("#fdbc2f", "#e09f1c", "#8a520a"),
    "maximize": ("#2ac840", "#1aa82c", "#0a5a14"),
    "restore": ("#2ac840", "#1aa82c", "#0a5a14"),
}
GLYPH = {
    "close": '<path d="M6.3 6.3l5.4 5.4M11.7 6.3l-5.4 5.4" stroke="{c}" stroke-width="1.35" stroke-linecap="round"/>',
    "minimize": '<path d="M5.6 9h6.8" stroke="{c}" stroke-width="1.5" stroke-linecap="round"/>',
    "maximize": '<path d="M9 5.6v6.8M5.6 9h6.8" stroke="{c}" stroke-width="1.5" stroke-linecap="round"/>',
    # two small triangles pointing at each other: "shrink back"
    "restore": '<path d="M5.4 8.4h3v-3zM12.6 9.6h-3v3z" fill="{c}" stroke="{c}" stroke-width=".8" stroke-linejoin="round"/>',
}


def rounded_top(draw, box, r, fill):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, r, fill=fill, corners=(True, True, False, False))


def frame(t, active, maximized):
    """Full master image of a small window (2x), plus its slice geometry (1x)."""
    if maximized:
        w, h = 2 + MID, TITLE + MID + 1
        img = Image.new("RGBA", (w * S, h * S), t["title"] + (255,))
        cuts = (1, 1, TITLE, 1)            # left, right, top, bottom slice sizes
        return img, cuts
    ww, wh = 2 * RADIUS + 4 + MID, TITLE + MID + 8      # window body (1x)
    w, h = PAD_L + ww + PAD_R, PAD_T + wh + PAD_B
    img = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    box = [PAD_L * S, PAD_T * S, (PAD_L + ww) * S - 1, (PAD_T + wh) * S - 1]

    def shadow(alpha, blur, dy, grow):
        sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
        b = [box[0] - grow * S, box[1] - grow * S + dy * S, box[2] + grow * S, box[3] + grow * S + dy * S]
        ImageDraw.Draw(sh).rounded_rectangle(b, (RADIUS + grow) * S, fill=(8, 10, 24, int(255 * alpha)))
        return sh.filter(ImageFilter.GaussianBlur(blur * S))

    a = t["shadow"] if active else t["shadow_in"]
    img.alpha_composite(shadow(a, 13 if active else 10, 9 if active else 5, -1))
    img.alpha_composite(shadow(a * 0.55, 2.2, 1, 0))
    d = ImageDraw.Draw(img)
    title = t["title"] if active else t["title_in"]
    # hairline outline, then the body (square bottom: the client covers it)
    line = t["line"] if active else t["line_in"]
    outline = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(outline).rounded_rectangle([box[0] - S, box[1] - S, box[2] + S, box[3] + S],
                                              (RADIUS + 1) * S, fill=line,
                                              corners=(True, True, False, False))
    img.alpha_composite(outline)
    rounded_top(d, box, RADIUS * S, title + (255,))
    # top inner highlight
    hl = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(hl).rounded_rectangle([box[0], box[1], box[2], box[1] + 3 * S], RADIUS * S,
                                         outline=t["hi"], width=S, corners=(True, True, False, False))
    hl = hl.crop((0, 0, img.width, box[1] + 2 * S))
    img.alpha_composite(hl, (0, 0))
    return img, (EDGE_L, EDGE_R, EDGE_T, EDGE_B)


def png_b64(im):
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


def slices(img, cuts, prefix, oy):
    """Cut the master into the 9 Aurorae elements, stacked from y=oy."""
    l, r, t, b = cuts
    w, h = img.width // S, img.height // S
    xs = [(0, l), (l, w - r), (w - r, w)]
    ys = [(0, t), (t, h - b), (h - b, h)]
    names = [["topleft", "top", "topright"], ["left", "center", "right"],
             ["bottomleft", "bottom", "bottomright"]]
    out = []
    for j, (y0, y1) in enumerate(ys):
        for i, (x0, x1) in enumerate(xs):
            part = img.crop((x0 * S, y0 * S, x1 * S, y1 * S))
            out.append('<g id="%s-%s"><image x="%d" y="%d" width="%d" height="%d" '
                       'preserveAspectRatio="none" xlink:href="data:image/png;base64,%s"/></g>'
                       % (prefix, names[j][i], x0, oy + y0, x1 - x0, y1 - y0, png_b64(part)))
    return out, h


def decoration_svg(t):
    parts, oy = [], 0
    for prefix, active, maxed in (("decoration", True, False), ("decoration-inactive", False, False),
                                  ("decoration-maximized", True, True),
                                  ("decoration-maximized-inactive", False, True)):
        img, cuts = frame(t, active, maxed)
        p, h = slices(img, cuts, prefix, oy)
        parts += p
        oy += h + 10
    width = PAD_L + 2 * RADIUS + 4 + MID + PAD_R
    return ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            'width="%d" height="%d">\n%s\n</svg>\n' % (width, oy, "\n".join(parts)))


def button_svg(kind, t):
    fill, ring, glyph_c = BUTTONS[kind]
    glyph = GLYPH[kind].format(c=glyph_c)
    states = {
        "active": (fill, ring, ""), "hover": (fill, ring, glyph), "pressed": ("{p}", ring, glyph),
        "inactive": (t["grey"], t["grey_line"], ""), "hover-inactive": (fill, ring, glyph),
        "pressed-inactive": ("{p}", ring, glyph), "deactivated": (t["grey"], t["grey_line"], ""),
        "deactivated-inactive": (t["grey"], t["grey_line"], ""),
    }
    out = []
    for n, (state, (f, rg, g)) in enumerate(states.items()):
        if f == "{p}":
            f = ring                     # pressed: one shade darker
        out.append('<g id="%s-center" transform="translate(%d 0)">'
                   '<rect width="18" height="18" fill="#000" fill-opacity="0"/>'
                   '<circle cx="9" cy="9" r="6.3" fill="%s" stroke="%s" stroke-width=".7"/>%s</g>'
                   % (state, n * 20, f, rg, g))
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="18">%s</svg>\n'
            % (len(states) * 20, "".join(out)))


def rc(t):
    return """[General]
ActiveTextColor={text}
InactiveTextColor={text_in}
TitleAlignment=Center
TitleVerticalAlignment=Center
Animation=140
UseTextShadow=false
Shadow=true
DecorationPosition=0

[Layout]
BorderLeft=1
BorderRight=1
BorderBottom=1
TitleEdgeTop=0
TitleEdgeBottom=0
TitleEdgeLeft=12
TitleEdgeRight=12
TitleEdgeTopMaximized=0
TitleEdgeBottomMaximized=0
TitleEdgeLeftMaximized=10
TitleEdgeRightMaximized=10
TitleBorderLeft=10
TitleBorderRight=10
TitleHeight={title}
TitleHeightMaximized={title}
ButtonWidth=18
ButtonHeight=18
ButtonSpacing=3
ButtonMarginTop={bmt}
ButtonMarginTopMaximized={bmt}
ExplicitButtonSpacer=10
PaddingTop={pt}
PaddingBottom={pb}
PaddingLeft={pl}
PaddingRight={pr}
""".format(text=t["text"], text_in=t["text_in"], title=TITLE, bmt=(TITLE - 18) // 2,
           pt=PAD_T, pb=PAD_B, pl=PAD_L, pr=PAD_R)


def metadata(name, t):
    return """[Desktop Entry]
Name={label}
Comment=Nuri OS window decoration: unified title bar with traffic-light buttons
X-KDE-PluginInfo-Author=Nuri OS contributors
X-KDE-PluginInfo-Name={name}
X-KDE-PluginInfo-Version=1.0
X-KDE-PluginInfo-License=CC-BY-4.0
X-KDE-PluginInfo-EnabledByDefault=true
""".format(label=t["label"], name=name)


def main():
    for name, t in THEMES.items():
        d = OUT / name
        d.mkdir(parents=True, exist_ok=True)
        (d / "decoration.svg").write_text(decoration_svg(t))
        for kind in BUTTONS:
            (d / (kind + ".svg")).write_text(button_svg(kind, t))
        (d / (name + "rc")).write_text(rc(t))
        (d / "metadata.desktop").write_text(metadata(name, t))
        print("wrote", d)


if __name__ == "__main__":
    main()
