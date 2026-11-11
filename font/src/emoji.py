"""Nemaum Emoji: a small colour (COLR v0 / CPAL) emoji font drawn procedurally.

Vector colour layers, so the emoji stay sharp at every size.  Each emoji is a list
of (contours, palette index) layers; the base glyph also carries all contours so
renderers without colour support still show a monochrome shape.
"""
import math
import geom
from geom import render, F, P, line, arc, ring

CX, CY, R = 500.0, 380.0, 430.0   # face circle

PALETTE = {
    "face": "#FFCF3F", "face_d": "#E8A21C", "dark": "#3A2614", "white": "#FFFFFF",
    "red": "#F03E52", "pink": "#FF8DA6", "blush": "#FF9E8A", "blue": "#4AA8FF", "blue_d": "#2F7FD6",
    "orange": "#FF8A1F", "yellow": "#FFD43B", "green": "#3CC36B", "purple": "#9A5BE8", "black": "#2B2B2B",
    "brown": "#8A5A3C", "gray": "#9AA4B2", "cloud": "#F4F7FB", "angry": "#F26B3A", "angry_d": "#C9431F",
    "gold": "#FFC21A", "gold_d": "#E39A00", "tongue": "#F2617A", "cyan": "#66D9FF", "leaf": "#2FAE57",
}
NAMES = list(PALETTE)


def rgba(hexs):
    h = hexs.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)) + (1.0,)


def fill(pts):
    return render([F(pts)], 1)


def strokes(st, hw):
    return render(st, hw)


def ellipse(cx, cy, rx, ry, n=40):
    return fill(ring(cx, cy, rx, ry, n))


def heart_pts(cx, cy, s, n=48):
    out = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        out.append((cx + x * s, cy + y * s))
    return out


def star_pts(cx, cy, r1, r2, n=5, rot=90.0):
    return [(cx + (r1 if i % 2 == 0 else r2) * math.cos(math.radians(rot + 180.0 * i / n)),
             cy + (r1 if i % 2 == 0 else r2) * math.sin(math.radians(rot + 180.0 * i / n))) for i in range(2 * n)]


def sparkle(cx, cy, r):
    k = r * 0.22
    return fill([(cx, cy + r), (cx + k, cy + k), (cx + r, cy), (cx + k, cy - k), (cx, cy - r),
                 (cx - k, cy - k), (cx - r, cy), (cx - k, cy + k)])


def drop(cx, cy, r):
    return fill([(cx, cy + 2.1 * r)] + arc(cx, cy, r, r, 28, -208, 10))


# ------------------------------------------------------------------ face parts
def face(color="face", rim="face_d"):
    return [(ellipse(CX, CY, R, R, 64), color), (strokes([P(ring(CX, CY, R - 12, R - 12, 64), True)], 13), rim)]


def eyes_dot(dy=0, ry=62):
    return [(ellipse(CX - 145, CY + 95 + dy, 44, ry), "dark"), (ellipse(CX + 145, CY + 95 + dy, 44, ry), "dark")]


def eye_arc(cx, cy, up=True, w=72, hw=24):
    a = arc(cx, cy - 25, w, 55, 20, 160, 12) if up else arc(cx, cy + 30, w, 45, 200, 340, 12)
    return strokes([P(a)], hw)


def eyes_happy():
    return [(eye_arc(CX - 145, CY + 110) + eye_arc(CX + 145, CY + 110), "dark")]


def eyes_closed_smile():
    return [(eye_arc(CX - 145, CY + 90, False) + eye_arc(CX + 145, CY + 90, False), "dark")]


def eyes_squeeze():  # > <
    st = [P([(CX - 210, CY + 150), (CX - 110, CY + 100), (CX - 210, CY + 50)]),
          P([(CX + 210, CY + 150), (CX + 110, CY + 100), (CX + 210, CY + 50)])]
    return [(strokes(st, 24), "dark")]


def eyes_heart():
    return [(fill(heart_pts(CX - 150, CY + 100, 6.2)), "red"), (fill(heart_pts(CX + 150, CY + 100, 6.2)), "red")]


def eyes_wink():
    return [(ellipse(CX - 145, CY + 95, 44, 62), "dark"), (eye_arc(CX + 145, CY + 100), "dark")]


def eyes_big():
    out = []
    for sx in (-1, 1):
        x = CX + sx * 150
        out += [(ellipse(x, CY + 90, 95, 110), "white"), (ellipse(x, CY + 70, 70, 82), "dark"),
                (ellipse(x - 25, CY + 110, 24, 28), "white"), (ellipse(x + 22, CY + 45, 12, 14), "white")]
    out.append((strokes([P(arc(CX - 150, CY + 200, 80, 40, 30, 150, 12)), P(arc(CX + 150, CY + 200, 80, 40, 30, 150, 12))], 15), "dark"))
    return out


def eyes_white_small():
    out = []
    for sx in (-1, 1):
        x = CX + sx * 145
        out += [(ellipse(x, CY + 95, 75, 85), "white"), (ellipse(x, CY + 95, 26, 30), "dark")]
    return out


def eyes_roll():
    out = []
    for sx in (-1, 1):
        x = CX + sx * 145
        out += [(ellipse(x, CY + 95, 75, 80), "white"), (ellipse(x, CY + 135, 32, 34), "dark")]
    return out


def sunglasses():
    lens = lambda x: fill([(x - 120, CY + 170), (x + 120, CY + 170), (x + 105, CY + 40), (x - 105, CY + 40)])
    return [(lens(CX - 150) + lens(CX + 150) + strokes([line((CX - 40, CY + 150), (CX + 40, CY + 150)),
             line((CX - 270, CY + 160), (CX - 380, CY + 200)), line((CX + 270, CY + 160), (CX + 380, CY + 200))], 18), "black"),
            (fill([(CX - 220, CY + 150), (CX - 170, CY + 150), (CX - 210, CY + 80)]), "gray")]


def mouth_smile(w=190, depth=130, hw=24, y=330):
    return [(strokes([P(arc(CX, y, w, depth, 200, 340, 10))], hw), "dark")]


def mouth_grin(open_=True, teeth=True, tongue=True, y=300, w=230, depth=200):
    pts = [(CX - w, y), (CX + w, y)] + arc(CX, y, w, depth, 0, -180, 8)[1:-1]
    out = [(fill(pts), "dark")]
    if teeth:
        out.append((fill([(CX - w + 25, y - 8), (CX + w - 25, y - 8), (CX + w - 45, y - 62), (CX - w + 45, y - 62)]), "white"))
    if tongue:
        out.append((ellipse(CX, y - depth + 55, w * 0.45, 50), "tongue"))
    return out


def mouth_o(rx=70, ry=90, y=210):
    return [(ellipse(CX, y, rx, ry), "dark")]


def mouth_flat(y=250, w=130):
    return [(strokes([line((CX - w, y), (CX + w, y))], 22), "dark")]


def mouth_frown():
    return [(strokes([P(arc(CX, 140, 160, 100, 25, 155, 10))], 24), "dark")]


def blush():
    return [(ellipse(CX - 255, CY - 20, 70, 38), "blush"), (ellipse(CX + 255, CY - 20, 70, 38), "blush")]


# ------------------------------------------------------------------ emoji table
def build_table():
    E = {}
    E[0x1F600] = face() + eyes_dot() + mouth_grin()                                       # 😀
    E[0x1F603] = face() + eyes_dot(ry=75) + mouth_grin(depth=230)                         # 😃
    E[0x1F604] = face() + eyes_happy() + mouth_grin(depth=230)                            # 😄
    E[0x1F601] = face() + eyes_happy() + mouth_grin(tongue=False, depth=120)              # 😁
    E[0x1F606] = face() + eyes_squeeze() + mouth_grin(depth=230)                          # 😆
    E[0x1F605] = face() + eyes_happy() + mouth_grin(depth=230) + [(drop(CX + 330, CY + 260, 45), "cyan")]   # 😅
    tears = [(drop(CX - 290, CY + 20, 50), "cyan"), (drop(CX + 290, CY + 20, 50), "cyan")]
    E[0x1F602] = face() + eyes_happy() + mouth_grin(depth=210) + tears                    # 😂
    E[0x1F923] = face() + eyes_squeeze() + mouth_grin(depth=230) + tears                  # 🤣
    E[0x1F60A] = face() + eyes_closed_smile() + blush() + mouth_smile()                   # 😊
    E[0x1F607] = [(strokes([P(ring(CX, CY + 420, 230, 60, 40), True)], 22), "cyan")] + face() + eyes_closed_smile() + mouth_smile()  # 😇
    E[0x1F642] = face() + eyes_dot() + mouth_smile(w=160, depth=90)                       # 🙂
    E[0x1F643] = [(c_flip(l), col) for l, col in face() + eyes_dot() + mouth_smile(w=160, depth=90)]  # 🙃
    E[0x1F609] = face() + eyes_wink() + mouth_smile()                                     # 😉
    E[0x1F60D] = face() + eyes_heart() + mouth_grin(depth=200)                            # 😍
    E[0x1F970] = face() + eyes_closed_smile() + blush() + mouth_smile() + \
        [(fill(heart_pts(CX + 330, CY + 330, 4.4)), "red"), (fill(heart_pts(CX - 360, CY + 220, 3.6)), "red"),
         (fill(heart_pts(CX + 380, CY - 120, 3.2)), "red")]                               # 🥰
    E[0x1F618] = face() + eyes_wink() + [(strokes([P([(CX - 20, 300), (CX + 40, 260), (CX - 10, 225), (CX + 40, 190), (CX - 20, 150)])], 22), "dark"),
                                         (fill(heart_pts(CX + 190, 210, 4.0)), "red")]    # 😘
    E[0x1F60B] = face() + eyes_happy() + mouth_smile() + [(ellipse(CX + 70, 190, 70, 60), "tongue")]   # 😋
    E[0x1F61B] = face() + eyes_dot() + mouth_flat(y=260, w=150) + [(fill([(CX - 80, 260)] + arc(CX, 200, 80, 90, 180, 360, 10) + [(CX + 80, 260)]), "tongue")]  # 😛
    E[0x1F61C] = face() + eyes_wink() + mouth_flat(y=260, w=150) + [(fill([(CX - 80, 260)] + arc(CX, 200, 80, 90, 180, 360, 10) + [(CX + 80, 260)]), "tongue")]  # 😜
    E[0x1F60E] = face() + sunglasses() + mouth_smile(w=150, depth=80)                     # 😎
    E[0x1F610] = face() + eyes_dot() + mouth_flat()                                       # 😐
    E[0x1F611] = face() + [(strokes([line((CX - 210, CY + 95), (CX - 80, CY + 95)), line((CX + 80, CY + 95), (CX + 210, CY + 95))], 22), "dark")] + mouth_flat()  # 😑
    E[0x1F636] = face() + eyes_dot()                                                      # 😶
    E[0x1F644] = face() + eyes_roll() + mouth_flat(w=110)                                 # 🙄
    E[0x1F60F] = face() + [(strokes([line((CX - 210, CY + 95), (CX - 80, CY + 95)), line((CX + 80, CY + 95), (CX + 210, CY + 95))], 22), "dark"),
                           (strokes([P([(CX - 130, 250), (CX + 60, 260), (CX + 170, 330)])], 22), "dark")]   # 😏
    zz = [(strokes([P([(CX + 230, 760), (CX + 330, 760), (CX + 230, 660), (CX + 330, 660)]),
                    P([(CX + 350, 880), (CX + 420, 880), (CX + 350, 810), (CX + 420, 810)])], 15), "blue")]
    E[0x1F634] = face() + eyes_closed_smile() + mouth_o(50, 60, 220) + zz                 # 😴
    E[0x1F622] = face() + eyes_dot() + mouth_frown() + [(drop(CX + 175, CY - 40, 42), "cyan")]   # 😢
    E[0x1F62D] = face() + eyes_closed_smile() + mouth_grin(teeth=False, tongue=False, y=230, w=150, depth=120) + \
        [(fill([(CX - 190, CY + 60), (CX - 110, CY + 60), (CX - 110, CY - 420), (CX - 190, CY - 420)]), "cyan"),
         (fill([(CX + 110, CY + 60), (CX + 190, CY + 60), (CX + 190, CY - 420), (CX + 110, CY - 420)]), "cyan")]   # 😭
    brows = [(strokes([line((CX - 230, CY + 220), (CX - 80, CY + 160)), line((CX + 230, CY + 220), (CX + 80, CY + 160))], 22), "dark")]
    E[0x1F621] = face("angry", "angry_d") + brows + eyes_dot(dy=-10, ry=48) + mouth_frown()  # 😡
    E[0x1F620] = face() + brows + eyes_dot(dy=-10, ry=48) + mouth_frown()                    # 😠
    E[0x1F631] = face() + [(fill(arc(CX, CY, R - 2, R - 2, 20, 160, 6) + [(CX - 405, CY + 130), (CX + 405, CY + 130)][::-1]), "blue")] + \
        eyes_white_small() + mouth_o(65, 130, 170)                                         # 😱
    E[0x1F633] = face() + eyes_white_small() + [(ellipse(CX - 255, CY - 40, 80, 45), "red"), (ellipse(CX + 255, CY - 40, 80, 45), "red")] + mouth_o(45, 40, 200)  # 😳
    E[0x1F97A] = face() + eyes_big() + [(strokes([P(arc(CX, 150, 110, 60, 30, 150, 10))], 20), "dark")]   # 🥺
    E[0x1F62E] = face() + eyes_dot() + mouth_o()                                           # 😮
    E[0x1F632] = face() + eyes_white_small() + mouth_o(80, 110, 190)                       # 😲
    E[0x1F972] = face() + eyes_closed_smile() + mouth_smile() + [(drop(CX + 210, CY - 20, 42), "cyan")]   # 🥲
    E[0x1F624] = face() + brows + eyes_closed_smile() + mouth_frown() + \
        [(ellipse(CX - 300, 120, 80, 60), "white"), (ellipse(CX + 300, 120, 80, 60), "white")]   # 😤
    # hearts
    for cp, col in ((0x2764, "red"), (0x1F9E1, "orange"), (0x1F49B, "yellow"), (0x1F49A, "green"), (0x1F499, "blue"),
                    (0x1F49C, "purple"), (0x1F5A4, "black"), (0x1F90D, "white"), (0x1F90E, "brown")):
        layers = [(fill(heart_pts(CX, CY + 20, 26)), col), (ellipse(CX - 210, CY + 230, 55, 35), "white")]
        if col == "white":
            layers.insert(1, (strokes([P(heart_pts(CX, CY + 20, 25.2), True)], 12), "gray"))
        E[cp] = layers
    E[0x1F495] = [(fill(heart_pts(CX + 120, CY + 140, 15)), "pink"), (fill(heart_pts(CX - 140, CY - 90, 13)), "red")]   # 💕
    E[0x1F496] = [(fill(heart_pts(CX, CY + 20, 24)), "pink"), (sparkle(CX + 330, CY + 330, 90), "yellow"),
                  (sparkle(CX - 340, CY - 250, 70), "yellow"), (sparkle(CX - 120, CY + 140, 60), "white")]   # 💖
    E[0x1F497] = [(fill(heart_pts(CX, CY + 20, 26)), "pink"), (fill(heart_pts(CX, CY + 30, 16)), "red"), (fill(heart_pts(CX, CY + 35, 8)), "pink")]  # 💗
    zig = [(CX + 20, CY + 330), (CX - 40, CY + 150), (CX + 50, CY + 30), (CX - 30, CY - 120), (CX + 10, CY - 420)]
    hp = heart_pts(CX, CY + 20, 26)
    E[0x1F494] = [(fill([p for p in hp if p[0] <= CX] + zig[::-1]), "red"),
                  (render([F([p for p in hp if p[0] > CX] + [(x + 45, y) for x, y in zig])], 1), "red")]   # 💔
    # sky, nature, symbols
    E[0x2B50] = [(fill(star_pts(CX, CY + 20, 440, 185)), "gold"), (fill(star_pts(CX, CY + 20, 330, 140)), "yellow")]  # ⭐
    E[0x1F31F] = [(fill(star_pts(CX, CY + 20, 330, 140)), "gold")] + [(sparkle(CX + 360 * math.cos(a), CY + 20 + 360 * math.sin(a), 70), "yellow")
                                                                      for a in (0.6, 2.2, 4.0, 5.4)]   # 🌟
    E[0x2728] = [(sparkle(CX - 110, CY - 60, 300), "yellow"), (sparkle(CX + 260, CY + 300, 150), "gold"), (sparkle(CX + 290, CY - 230, 110), "yellow")]  # ✨
    flame = [(CX, CY + 460), (CX + 160, CY + 220), (CX + 310, CY + 60)] + arc(CX, CY - 120, 330, 300, 30, -210, 10)[1:] + [(CX - 300, CY + 120), (CX - 120, CY + 140), (CX - 60, CY + 330)]
    inner = [(CX + 20, CY + 180), (CX + 170, CY - 40)] + arc(CX, CY - 190, 190, 190, 20, -200, 10)[1:] + [(CX - 120, CY - 10)]
    E[0x1F525] = [(fill(flame), "orange"), (fill(inner), "yellow")]                       # 🔥
    E[0x1F389] = [(fill([(CX - 400, CY - 420), (CX - 80, CY + 170), (CX + 120, CY - 220)]), "gold"),
                  (fill([(CX - 300, CY - 230), (CX - 230, CY - 100), (CX + 10, CY - 230), (CX - 20, CY - 330)]), "red")] + \
        [(fill([(x - 30, y - 30), (x + 30, y - 30), (x + 30, y + 30), (x - 30, y + 30)]), c) for x, y, c in
         ((CX + 120, CY + 300, "blue"), (CX + 300, CY + 160, "green"), (CX - 40, CY + 380, "pink"), (CX + 330, CY + 420, "purple"), (CX + 250, CY - 40, "yellow"))]   # 🎉
    E[0x2600] = [(ellipse(CX, CY, 210, 210), "gold")] + [(strokes([line((CX + 270 * math.cos(math.radians(a)), CY + 270 * math.sin(math.radians(a))),
                                                                        (CX + 410 * math.cos(math.radians(a)), CY + 410 * math.sin(math.radians(a))))], 30), "orange")
                                                         for a in range(0, 360, 45)]   # ☀
    cloud = [(CX - 330, CY - 120, 170), (CX - 60, CY + 60, 250), (CX + 240, CY - 60, 200), (CX + 30, CY - 170, 180)]
    E[0x2601] = [(sum((ellipse(x, y, r + 22, r + 22) for x, y, r in cloud), []), "gray"), (sum((ellipse(x, y, r, r) for x, y, r in cloud), []), "cloud")]   # ☁
    E[0x1F308] = [(strokes([P(arc(CX, CY - 250, 420 - i * 62, 420 - i * 62, 180, 0, 6))], 31), c)
                  for i, c in enumerate(("red", "orange", "yellow", "green", "blue", "purple"))]   # 🌈
    E[0x1F4A7] = [(drop(CX, CY - 160, 260), "blue"), (ellipse(CX - 90, CY - 160, 50, 80), "cyan")]   # 💧
    E[0x1F4A6] = [(drop(CX - 200, CY - 100, 130), "blue"), (drop(CX + 150, CY + 80, 110), "blue"), (drop(CX + 250, CY - 300, 80), "cyan")]   # 💦
    petals = sum((ellipse(CX + 230 * math.cos(math.radians(90 + 72 * i)), CY + 230 * math.sin(math.radians(90 + 72 * i)), 190, 190) for i in range(5)), [])
    E[0x1F338] = [(petals, "pink"), (ellipse(CX, CY, 110, 110), "yellow")]               # 🌸
    clover = sum((fill([(CX + (x - CX) * math.cos(math.radians(a)) - (y - CY) * math.sin(math.radians(a)),
                         CY + (x - CX) * math.sin(math.radians(a)) + (y - CY) * math.cos(math.radians(a))) for x, y in heart_pts(CX, CY + 190, 11)])
                  for a in (0, 90, 180, 270)), [])
    E[0x1F340] = [(clover, "leaf"), (strokes([P([(CX, CY), (CX + 60, CY - 250), (CX + 160, CY - 420)])], 26), "leaf")]   # 🍀
    E[0x2705] = [(fill([(CX - 400, CY - 400), (CX + 400, CY - 400), (CX + 400, CY + 400), (CX - 400, CY + 400)]), "green"),
                 (strokes([P([(CX - 230, CY), (CX - 60, CY - 170), (CX + 250, CY + 200)])], 55), "white")]   # ✅
    E[0x274C] = [(strokes([line((CX - 330, CY + 330), (CX + 330, CY - 330)), line((CX + 330, CY + 330), (CX - 330, CY - 330))], 75), "red")]   # ❌
    E[0x2757] = [(fill([(CX - 90, CY + 420), (CX + 90, CY + 420), (CX + 55, CY - 160), (CX - 55, CY - 160)]), "red"), (ellipse(CX, CY - 340, 85, 85), "red")]   # ❗
    q = [P(arc(CX, CY + 190, 230, 200, 160, -40, 10) + [(CX + 60, CY - 30), (CX, CY - 90), (CX, CY - 170)])]
    E[0x2753] = [(strokes(q, 70), "red"), (ellipse(CX, CY - 350, 80, 80), "red")]        # ❓
    E[0x1F4A4] = [(strokes([P([(CX - 330, CY + 80), (CX - 30, CY + 80), (CX - 330, CY - 220), (CX - 30, CY - 220)]),
                            P([(CX + 50, CY + 400), (CX + 290, CY + 400), (CX + 50, CY + 160), (CX + 290, CY + 160)])], 34), "blue")]   # 💤
    E[0x1F3B5] = [(ellipse(CX - 120, CY - 260, 150, 110), "dark"), (strokes([line((CX + 15, CY - 250), (CX + 15, CY + 400)), P([(CX + 15, CY + 400), (CX + 260, CY + 250)])], 32), "dark")]   # 🎵
    E[0x1F319] = [(fill(arc(CX, CY, 400, 400, 60, 300, 8) + arc(CX + 160, CY, 300, 330, 260, 100, 8)), "yellow")]   # 🌙
    return E


def c_flip(contours):
    return [[(x, 2 * CY - y) for x, y in reversed(c)] for c in contours]


def build(path_ttf, family="Nemaum Emoji", version="0.1.0"):
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    saved = geom.ROUND
    geom.ROUND = True   # round caps and joins for the emoji drawings
    try:
        E = build_table()
    finally:
        geom.ROUND = saved
    order, cmap, glyphs, metrics, layers = [".notdef", "space", "uniFE0F", "uni200D"], {0x20: "space", 0xFE0F: "uniFE0F", 0x200D: "uni200D"}, {}, {}, {}

    def put(name, contours, adv=1000):
        pen = TTGlyphPen(None)
        xs = []
        for c in contours:
            pts = [(int(round(x)), int(round(y))) for x, y in c]
            pen.moveTo(pts[0])
            for p in pts[1:]:
                pen.lineTo(p)
            pen.closePath()
            xs += [p[0] for p in pts]
        glyphs[name] = pen.glyph()
        metrics[name] = (adv, min(xs) if xs else 0)
    put(".notdef", [])
    put("space", [], 270)
    put("uniFE0F", [], 0)
    put("uni200D", [], 0)
    for cp in sorted(E):
        base = "u%05X" % cp if cp > 0xFFFF else "uni%04X" % cp
        order.append(base)
        cmap[cp] = base
        allc, lay = [], []
        for i, (cs, col) in enumerate(E[cp]):
            ln = "%s.l%d" % (base, i)
            order.append(ln)
            put(ln, cs)
            allc += cs
            lay.append((ln, NAMES.index(col)))
        put(base, allc)
        layers[base] = lay
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=1100, descent=-300, lineGap=0)
    fb.setupNameTable({"familyName": family, "styleName": "Regular", "fullName": family + " Regular",
                       "psName": family.replace(" ", "") + "-Regular", "version": "Version " + version,
                       "uniqueFontIdentifier": family.replace(" ", "") + ";" + version})
    fb.setupOS2(version=4, sTypoAscender=1100, sTypoDescender=-300, sTypoLineGap=0, usWinAscent=1100,
                usWinDescent=320, usWeightClass=400, achVendID="NEMA", fsSelection=(1 << 6) | (1 << 7))
    fb.setupPost(keepGlyphNames=False)
    fb.setupCOLR(layers, version=0)
    fb.setupCPAL([[rgba(PALETTE[n]) for n in NAMES]])
    fb.save(path_ttf)
    return sorted(E)
