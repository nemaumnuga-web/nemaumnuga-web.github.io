#!/usr/bin/env python3
"""Generate the "Nuri" Plasma style (desktop theme): frosted-glass panels and
dock, and running-app dots under the dock icons.

    python3 tools/make_plasma_theme.py     # needs Pillow

Only two files are themed; Plasma takes every other element from Breeze
("default"), so widgets, dialogs and tooltips keep their well-tested look.

* widgets/panel-background.svg (+ translucent/ variant): glass in the colour
  scheme's background colour (so light and dark both work), 18 px rounded
  corners, a light rim, a soft drop shadow for the floating dock and blur masks.
* widgets/tasks.svg: the task manager's state frames. A running app gets a short
  dot under its icon, the focused app a longer accent bar, an app asking for
  attention an orange bar; hovering shows a soft rounded highlight.
  The indicator is built from the frame's corner slices, so it stays round at
  any dock size; it only lengthens when the icon slot is wide.
"""
import base64
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "system_files/usr/share/plasma/desktoptheme/Nuri"

STYLE = """<style type="text/css" id="current-color-scheme">
.ColorScheme-Text { color:#16171f; stop-color:#16171f; }
.ColorScheme-Background { color:#f4f5fa; stop-color:#f4f5fa; }
.ColorScheme-Highlight { color:#6366f1; stop-color:#6366f1; }
.ColorScheme-NeutralText { color:#f59e0b; stop-color:#f59e0b; }
</style>"""

R = 18           # panel corner radius
SH = 18          # shadow extent around a floating panel
S = 2            # shadow slices at 2x


def head(w, h, extra=""):
    return ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            'width="%d" height="%d" viewBox="0 0 %d %d"><defs>%s%s</defs>\n' % (w, h, w, h, STYLE, extra))


def hint(name, x, y, w, h):
    return '<rect id="%s" x="%s" y="%s" width="%s" height="%s" fill="#ff00ff" fill-opacity="0"/>\n' % (name, x, y, w, h)


def glass(alpha, rim):
    """9-slice glass frame: base in ColorScheme-Background, rim, inner gloss."""
    cs = 'class="ColorScheme-Background" fill="currentColor"'
    tx = 'class="ColorScheme-Text" fill="currentColor"'
    a = alpha
    out = []
    W = 32  # middle slice size
    # positions: corners R x R, edges stretch; laid out at origin (0, 0)
    geo = {
        "topleft": (0, 0, R, R), "top": (R, 0, W, R), "topright": (R + W, 0, R, R),
        "left": (0, R, R, W), "center": (R, R, W, W), "right": (R + W, R, R, W),
        "bottomleft": (0, R + W, R, R), "bottom": (R, R + W, W, R), "bottomright": (R + W, R + W, R, R),
    }
    arcs = {
        "topleft": "M{x} {y2} A{r} {r} 0 0 1 {x2} {y} H{x3} V{y3} H{x} Z",
        "topright": "M{x} {y} A{r} {r} 0 0 1 {x3} {y2} V{y3} H{x} Z",
        "bottomleft": "M{x} {y} H{x3} V{y3} A{r} {r} 0 0 1 {x} {y} Z",
        "bottomright": "M{x} {y} H{x3} A{r} {r} 0 0 1 {x} {y3} Z",
    }
    for name, (x, y, w, h) in geo.items():
        g = ['<g id="%s">' % name]
        if name in arcs:
            d = arcs[name].format(x=x, y=y, x2=x + R, y2=y + R, x3=x + w, y3=y + h, r=R)
            # bottom-left: start at top-left, go right, down, arc back to start-column bottom
            if name == "bottomleft":
                d = "M{x} {y} H{x3} V{y3} A{r} {r} 0 0 1 {x} {y} Z".format(x=x, y=y, x3=x + w, y3=y + h, r=R)
            g.append('<path d="%s" %s opacity="%s"/>' % (d, cs, a))
        else:
            g.append('<rect x="%s" y="%s" width="%s" height="%s" %s opacity="%s"/>' % (x, y, w, h, cs, a))
        # rim: a bright hairline on the outer edge, a faint dark one on the bottom
        if name == "top":
            g.append('<rect x="%s" y="%s" width="%s" height="1" fill="#ffffff" opacity="%s"/>' % (x, y, w, rim))
        if name == "bottom":
            g.append('<rect x="%s" y="%s" width="%s" height="1" %s opacity="0.10"/>' % (x, y + h - 1, w, tx))
        if name in ("left", "right"):
            xx = x if name == "left" else x + w - 1
            g.append('<rect x="%s" y="%s" width="1" height="%s" fill="#ffffff" opacity="%s"/>' % (xx, y, h, rim * 0.6))
        if name in ("topleft", "topright"):
            # rim arc kept 0.5 px inside the slice so the element stays exactly R x R
            if name == "topleft":
                sweep = "M%s %s A%s %s 0 0 1 %s %s" % (x + 0.5, y + R - 0.5, R - 1, R - 1, x + R - 0.5, y + 0.5)
            else:
                sweep = "M%s %s A%s %s 0 0 1 %s %s" % (x + 0.5, y + 0.5, R - 1, R - 1, x + R - 0.5, y + R - 0.5)
            g.append('<path d="%s" fill="none" stroke="#ffffff" stroke-width="1" opacity="%s"/>' % (sweep, rim))
        g.append("</g>")
        out.append("".join(g))
    return out, geo


def masks(geo, ox):
    out = []
    for name, (x, y, w, h) in geo.items():
        x += ox
        if name == "topleft":
            d = "M%s %s A%s %s 0 0 1 %s %s H%s V%s H%s Z" % (x, y + h, R, R, x + R, y, x + w, y + h, x)
        elif name == "topright":
            d = "M%s %s A%s %s 0 0 1 %s %s V%s H%s Z" % (x, y, R, R, x + w, y + R, y + h, x)
        elif name == "bottomleft":
            d = "M%s %s H%s V%s A%s %s 0 0 1 %s %s Z" % (x, y, x + w, y + h, R, R, x, y)
        elif name == "bottomright":
            d = "M%s %s H%s A%s %s 0 0 1 %s %s Z" % (x, y, x + w, R, R, x, y + h)
        else:
            d = "M%s %s h%s v%s h-%s z" % (x, y, w, h, w)
        out.append('<path id="mask-%s" d="%s"/>' % (name, d))
    return out


def shadow_slices(oy):
    """Blurred drop shadow frame around a rounded panel, as PNG slices."""
    W = 40
    inner = 2 * R + W
    size = inner + 2 * SH
    img = Image.new("RGBA", (size * S, size * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([SH * S, (SH + 4) * S, (SH + inner) * S, (SH + inner + 4) * S], R * S,
                        fill=(10, 12, 30, 70))
    img = img.filter(ImageFilter.GaussianBlur(9 * S))
    tight = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(tight).rounded_rectangle([SH * S, (SH + 1) * S, (SH + inner) * S, (SH + inner + 1) * S],
                                            R * S, fill=(10, 12, 30, 40))
    img.alpha_composite(tight.filter(ImageFilter.GaussianBlur(1.5 * S)))
    # nothing under the panel itself: it is translucent, the shadow must stay outside
    hole = Image.new("L", img.size, 255)
    ImageDraw.Draw(hole).rounded_rectangle([SH * S, SH * S, (SH + inner) * S - 1, (SH + inner) * S - 1],
                                           R * S, fill=0)
    alpha = img.getchannel("A")
    img.putalpha(Image.composite(alpha, Image.new("L", img.size, 0), hole))
    c = SH + R  # corner slice size
    xs = [(0, c), (c, size - c), (size - c, size)]
    names = [["topleft", "top", "topright"], ["left", "center", "right"], ["bottomleft", "bottom", "bottomright"]]
    out = []
    for j, (y0, y1) in enumerate(xs):
        for i, (x0, x1) in enumerate(xs):
            if names[j][i] == "center":
                out.append('<rect id="shadow-center" x="%d" y="%d" width="%d" height="%d" fill="#000" fill-opacity="0"/>'
                           % (x0, oy + y0, x1 - x0, y1 - y0))
                continue
            part = img.crop((x0 * S, y0 * S, x1 * S, y1 * S))
            buf = io.BytesIO()
            part.save(buf, "PNG", optimize=True)
            out.append('<g id="shadow-%s"><image x="%d" y="%d" width="%d" height="%d" preserveAspectRatio="none" '
                       'xlink:href="data:image/png;base64,%s"/></g>'
                       % (names[j][i], x0, oy + y0, x1 - x0, y1 - y0, base64.b64encode(buf.getvalue()).decode()))
    # how far the shadow reaches past the panel, per side (the corner slices also cover R)
    for side in ("top", "bottom", "left", "right"):
        out.append(hint("shadow-hint-%s-margin" % side, size + 10, oy, SH, SH))
    return out


def panel(alpha, rim):
    parts, geo = glass(alpha, rim)
    body = parts
    body += masks(geo, 200)
    # content padding inside the panel / dock
    for side in ("top", "bottom", "left", "right"):
        body.append(hint("hint-%s-margin" % side, 120, 0, 4, 4))
        body.append(hint("thick-hint-%s-margin" % side, 130, 0, 8, 8))
        z = "0.00000001"
        body.append(hint("hint-%s-inset" % side, 140, 0, z if side in ("left", "right") else 4,
                         z if side in ("top", "bottom") else 4))
    body.append('<rect id="thick-center" x="150" y="0" width="8" height="8" fill="#000" fill-opacity="0"/>')
    body += shadow_slices(120)
    return head(320, 320) + "\n".join(body) + "\n</svg>\n"


# ------------------------------------------------------------------ tasks.svg
def task_states():
    """(prefix, corner width, bar colour class, bar opacity) for the indicators."""
    return [
        ("normal", 26, "ColorScheme-Text", 0.55),
        ("minimized", 26, "ColorScheme-Text", 0.28),
        ("focus", 21, "ColorScheme-Highlight", 1.0),
        ("attention", 21, "ColorScheme-NeutralText", 1.0),
        ("progress", 21, "ColorScheme-Highlight", 0.7),
    ]


T, B, MIDW, MIDH = 2, 7, 4, 10   # top row, bottom row (holds the bar), middle slices
BAR_H, BAR_Y = 4, 1              # bar height and its offset inside the bottom row


def indicator_frame(prefix, L, cls, op, oy):
    """9-slice where the bar is: right cap in bottom-left, stretched middle in bottom,
    left cap in bottom-right. Everything else is transparent."""
    clear = 'fill="#000" fill-opacity="0"'
    paint = 'class="%s" fill="currentColor" opacity="%s"' % (cls, op)
    r = BAR_H / 2
    cols = [(0, L), (L, MIDW), (L + MIDW, L)]
    rows = [(0, T), (T, MIDH), (T + MIDH, B)]
    names = [["topleft", "top", "topright"], ["left", "center", "right"], ["bottomleft", "bottom", "bottomright"]]
    out = []
    for j, (y, h) in enumerate(rows):
        for i, (x, w) in enumerate(cols):
            n = "%s-%s" % (prefix, names[j][i])
            y0 = oy + y
            g = '<g id="%s"><rect x="%s" y="%s" width="%s" height="%s" %s/>' % (n, x, y0, w, h, clear)
            if j == 2:
                by = y0 + BAR_Y
                if i == 0:   # right half-cap on the inner edge
                    g += '<path d="M%s %s a%s %s 0 0 0 0 %s z" %s/>' % (x + w, by, r, r, BAR_H, paint)
                elif i == 1:
                    g += '<rect x="%s" y="%s" width="%s" height="%s" %s/>' % (x, by, w, BAR_H, paint)
                else:        # left half-cap
                    g += '<path d="M%s %s a%s %s 0 0 1 0 %s z" %s/>' % (x, by, r, r, BAR_H, paint)
            out.append(g + "</g>")
    return out


def hover_frame(oy):
    rr = 10
    cs = 'class="ColorScheme-Text" fill="currentColor" opacity="0.10"'
    clear = 'fill="#000" fill-opacity="0"'
    out = []
    W = 12
    geo = [("topleft", 0, 0, rr, rr), ("top", rr, 0, W, rr), ("topright", rr + W, 0, rr, rr),
           ("left", 0, rr, rr, W), ("center", rr, rr, W, W), ("right", rr + W, rr, rr, W),
           ("bottomleft", 0, rr + W, rr, rr), ("bottom", rr, rr + W, W, rr), ("bottomright", rr + W, rr + W, rr, rr)]
    for name, x, y, w, h in geo:
        y += oy
        if name == "topleft":
            d = "M%s %s A%s %s 0 0 1 %s %s V%s Z" % (x, y + h, rr, rr, x + w, y, y + h)
        elif name == "topright":
            d = "M%s %s A%s %s 0 0 1 %s %s H%s Z" % (x, y, rr, rr, x + w, y + h, x)
        elif name == "bottomleft":
            d = "M%s %s H%s V%s A%s %s 0 0 1 %s %s Z" % (x, y, x + w, y + h, rr, rr, x, y)
        elif name == "bottomright":
            d = "M%s %s H%s A%s %s 0 0 1 %s %s Z" % (x, y, x + w, rr, rr, x, y + h)
        else:
            d = "M%s %s h%s v%s h-%s z" % (x, y, w, h, w)
        out.append('<g id="hover-%s"><rect x="%s" y="%s" width="%s" height="%s" %s/><path d="%s" %s/></g>'
                   % (name, x, y, w, h, clear, d, cs))
    return out


def tasks():
    body, oy = [], 0
    for prefix, L, cls, op in task_states():
        body += indicator_frame(prefix, L, cls, op, oy)
        oy += T + MIDH + B + 4
    body += hover_frame(oy)
    oy += 40
    # content margins: keep the icon where Breeze puts it and leave room for the bar
    for prefix in [s[0] for s in task_states()] + ["hover"]:
        for side, size in (("top", 3), ("bottom", 8), ("left", 3), ("right", 3)):
            body.append(hint("%s-hint-%s-margin" % (prefix, side), 300, 0, size, size))
    return head(320, oy + 20) + "\n".join(body) + "\n</svg>\n"


METADATA = {
    "KPlugin": {
        "Authors": [{"Name": "Nuri OS contributors"}],
        "Category": "",
        "Description": "Nuri OS: frosted-glass panels and a dock with running-app dots",
        "EnabledByDefault": True,
        "Id": "Nuri",
        "License": "CC-BY-4.0",
        "Name": "Nuri",
        "Version": "1.0",
    },
    "X-Plasma-API": "5.0",
}

PLASMARC = """[AdaptiveTransparency]
enabled=true
"""


def main():
    (OUT / "widgets").mkdir(parents=True, exist_ok=True)
    (OUT / "translucent/widgets").mkdir(parents=True, exist_ok=True)
    (OUT / "metadata.json").write_text(json.dumps(METADATA, indent=4) + "\n")
    (OUT / "plasmarc").write_text(PLASMARC)
    (OUT / "widgets/panel-background.svg").write_text(panel(0.94, 0.55))
    (OUT / "translucent/widgets/panel-background.svg").write_text(panel(0.62, 0.65))
    (OUT / "widgets/tasks.svg").write_text(tasks())
    print("wrote", OUT)


if __name__ == "__main__":
    main()
