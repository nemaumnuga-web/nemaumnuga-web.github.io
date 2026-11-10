"""Glyphs built from other glyphs: accents, fullwidth, enclosed, super/subscripts, squares ..."""
import math, unicodedata
from geom import P as PS, D, F, line, arc, ring, render, xform, bounds
import latin as lt
import hangul as hg

LATIN = {}
_L = lt.build_latin()
_P = lt.build_punct()
for _k, _v in {**_L, **_P}.items():
    LATIN[ord(_k)] = _v
CX, CY = 500.0, 380.0
CAP, XH, ASC = lt.CAP, lt.XH, lt.ASC


def kscale(strokes, f):
    out = []
    for s in strokes:
        if s[0] == "p":
            out.append(("p", s[1], s[2], s[3], s[4] * f))
        elif s[0] == "d":
            out.append(("d", s[1], s[2], s[3], s[4] * f))
        else:
            out.append(s)
    return out


def hangul_strokes(cp, P):
    """Hangul syllable strokes inside a 860x880 box starting at x=0, y=-70."""
    L, V, T = hg.split_syllable(cp)
    st = hg.syllable(L, V, T, 860, 880, P.hw * hg.hw_mult(L, V, T), 44)
    return xform(st, 1, 1, 0, -70), 860


def base(cp, P):
    """(strokes, content width) for a character we already know how to draw, else None."""
    if cp in LATIN:
        return LATIN[cp]
    if 0xAC00 <= cp <= 0xD7A3:
        return hangul_strokes(cp, P)
    ch = None
    if 0x1100 <= cp <= 0x1112:
        ch = hg.CHO[cp - 0x1100]
    elif 0x1161 <= cp <= 0x1175:
        ch = hg.JUNG[cp - 0x1161]
    elif 0x11A8 <= cp <= 0x11C2:
        ch = hg.JONG[1:][cp - 0x11A8]
    elif 0x3131 <= cp <= 0x3163:
        ch = ("ㄱㄲㄳㄴㄵㄶㄷㄸㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅃㅄㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ")[cp - 0x3131]
    if ch:
        return xform(hg.lone_jamo(ch, 860, 880, P.hw, 44), 1, 1, 0, -70), 860
    return None


def text_strokes(cps, P, scale=1.0, spacing=70.0, kk=0.8):
    """Lay out several characters left to right (content coordinates)."""
    x = 0.0
    out = []
    for cp in cps:
        b = base(cp, P)
        if b is None:
            return None
        st, w = b
        if scale != 1.0:
            st = kscale(xform(st, scale), kk)
        out += xform(st, 1, 1, x, 0)
        x += w * scale + spacing
    return out, x - spacing


def fit(strokes, box, keep_aspect=True):
    """Scale strokes (centre-lines) to fit into box = (x0,y0,x1,y1)."""
    b = bounds(strokes)
    bw, bh = max(b[2] - b[0], 1.0), max(b[3] - b[1], 1.0)
    tw, th = box[2] - box[0], box[3] - box[1]
    s = min(tw / bw, th / bh) if keep_aspect else 1.0
    st = xform(strokes, s, s, 0, 0)
    b2 = bounds(st)
    dx = (box[0] + box[2]) / 2.0 - (b2[0] + b2[2]) / 2.0
    dy = (box[1] + box[3]) / 2.0 - (b2[1] + b2[3]) / 2.0
    return kscale(xform(st, 1, 1, dx, dy), 0.78 if s < 0.8 else 1.0)


# ------------------------------------------------------------------ marks
def mark_strokes(m, cx, y, hw):
    """Accent drawn above (y = baseline of mark) or below the base, centred on cx."""
    if m == 0x0300:
        return [line((cx - 70, y + 120), (cx + 40, y + 20))]
    if m == 0x0301:
        return [line((cx - 40, y + 20), (cx + 70, y + 120))]
    if m == 0x0302:
        return [PS([(cx - 80, y + 25), (cx, y + 120), (cx + 80, y + 25)])]
    if m == 0x030C:
        return [PS([(cx - 80, y + 120), (cx, y + 25), (cx + 80, y + 120)])]
    if m == 0x0303:
        return [PS([(cx - 90, y + 50), (cx - 45, y + 105), (cx + 5, y + 75), (cx + 50, y + 45), (cx + 95, y + 100)])]
    if m == 0x0304:
        return [line((cx - 80, y + 70), (cx + 80, y + 70))]
    if m == 0x0306:
        return [PS(arc(cx, y + 130, 85, 90, 200, 340, 12))]
    if m == 0x0307:
        return [D(cx, y + 70, 1.0)]
    if m == 0x0308:
        return [D(cx - 62, y + 70, 1.0), D(cx + 62, y + 70, 1.0)]
    if m == 0x0309:
        return [PS(arc(cx, y + 95, 40, 35, 270, 30, 12) + [(cx + 20, y + 75)][:0])]
    if m == 0x030A:
        return [PS(ring(cx, y + 75, 42, 42, 14), True)]
    if m == 0x030B:
        return [line((cx - 110, y + 20), (cx - 25, y + 120)), line((cx + 10, y + 20), (cx + 95, y + 120))]
    if m == 0x031B:
        return [line((cx + 120, y + 250), (cx + 170, y + 330))]
    return None


def below_strokes(m, cx, hw):
    if m == 0x0323:
        return [D(cx, -75, 1.0)]
    if m == 0x0327:
        return [PS([(cx - 20, 0), (cx + 20, -60), (cx + 55, -100), (cx + 20, -150), (cx - 40, -140)])]
    if m == 0x0328:
        return [PS([(cx + 40, 0), (cx + 10, -60), (cx + 40, -120), (cx + 90, -110)])]
    if m == 0x0326:
        return [line((cx + 10, -40), (cx - 30, -130))]
    if m == 0x0331:
        return [line((cx - 80, -90), (cx + 80, -90))]
    return None


ABOVE = {0x0300, 0x0301, 0x0302, 0x0303, 0x0304, 0x0306, 0x0307, 0x0308, 0x0309, 0x030A, 0x030B, 0x030C, 0x031B}
BELOW = {0x0323, 0x0326, 0x0327, 0x0328, 0x0331}
TALL = set(map(ord, "bdfhklt"))


def accent_recipe(cp):
    dec = unicodedata.decomposition(chr(cp))
    if not dec or dec.startswith("<"):
        return None
    parts = [int(p, 16) for p in dec.split()]
    if len(parts) < 2 or parts[0] not in LATIN or any(m not in ABOVE | BELOW for m in parts[1:]):
        return None
    b = parts[0]
    bst, bw = LATIN[b]
    upper = chr(b).isupper()
    if any(m in ABOVE for m in parts[1:]) and b in (0x69, 0x6A):
        bst = [s for s in bst if s[0] != "d"]  # drop the dot
    top = CAP if upper else (ASC if b in TALL else XH)
    if b in (0x69, 0x6A):
        top = XH
    gap = 30.0
    if b in TALL and not upper:
        gap = 20.0

    def f(P):
        sb = 45 - 20 * P.t
        dx = sb + P.hw
        cxm = max(bw, 1) / 2.0 if bw > 0 else 0.0
        if b == 0x69 or b == 0x6A or b == 0x6C:
            cxm = 0.0
        st = list(bst)
        y = top + gap
        for m in parts[1:]:
            if m in ABOVE:
                st += mark_strokes(m, cxm, y, P.hw)
                y += 110 if m in (0x0308, 0x0307) else 150
            else:
                st += below_strokes(m, cxm, P.hw)
        st = xform(st, lt.SX, lt.SY, dx, 0)
        return render(st, P.hw), bw * lt.SX + 2 * dx
    return f


def special_latin(cp):
    """Letters with strokes through them, dotless i ... built from the base letters."""
    spec = {0x0131: ("i-", None), 0x00F8: ("o", ((60, 40), (460, 480))), 0x00D8: ("O", ((60, 20), (600, 710))),
            0x0142: ("l", ((-110, 200), (110, 340))), 0x0141: ("L", ((-100, 190), (330, 420))),
            0x0111: ("d", ((380, 560), (620, 560))), 0x0110: ("D", ((-110, 365), (160, 365))),
            0x0127: ("h", ((-110, 560), (110, 560))), 0x0126: ("H", ((-110, 580), (690, 580)))}
    if cp not in spec:
        return None
    ch, bar = spec[cp]
    bst, bw = LATIN[ord(ch[0])]
    if cp == 0x0131:
        bst = [s for s in bst if s[0] != "d"]
        bar = None
    elif cp in (0x00F8, 0x00D8):
        bar = [(bar[0][0], bar[0][1]), (bar[1][0], bar[1][1])]
        bar = (bar[0], bar[1])
    extra = []
    if bar:
        extra = [PS([bar[0], bar[1]])]
    if cp in (0x0142, 0x0141):
        extra = [PS([bar[0], bar[1]])]

    def f(P):
        sb = 45 - 20 * P.t
        dx = sb + P.hw
        st = xform(list(bst) + extra, lt.SX, lt.SY, dx, 0)
        return render(st, P.hw), bw * lt.SX + 2 * dx
    return f


# ------------------------------------------------------------------ marks as characters
def combining_recipe(m):
    """Stand-alone combining mark: zero advance, drawn over the preceding letter."""
    cx = -270.0

    def f(P):
        st = None
        if m in ABOVE:
            st = mark_strokes(m, cx, XH + 30, P.hw)
        elif m in BELOW:
            st = below_strokes(m, cx, P.hw)
        elif m == 0x0335:
            st = [line((cx - 70, CY - 60), (cx + 70, CY - 60))]
        elif m == 0x0336:
            st = [line((cx - 250, CY - 40), (cx + 250, CY - 40))]
        elif m == 0x0338:
            st = [line((cx - 120, -60), (cx + 120, 560))]
        elif m == 0x0361:
            st = [PS(arc(cx + 0, XH - 150, 300, 330, 150, 30, 12))]
        elif m == 0x035C:
            st = [PS(arc(cx, -20, 300, 150, 210, 330, 12))]
        elif m == 0x0348:
            st = [line((cx - 40, -40), (cx - 40, -150)), line((cx + 40, -40), (cx + 40, -150))]
        elif m == 0x0324:
            st = [D(cx - 62, -75, 1.0), D(cx + 62, -75, 1.0)]
        elif m == 0x0330:
            st = [PS([(cx - 90, -100), (cx - 45, -50), (cx + 5, -80), (cx + 50, -110), (cx + 95, -55)])]
        elif m == 0x0332:
            st = [line((cx - 120, -100), (cx + 120, -100))]
        elif m == 0x0334:
            st = [PS([(cx - 120, CY - 80), (cx - 60, CY - 20), (cx, CY - 60), (cx + 60, CY - 100), (cx + 120, CY - 40)])]
        elif m == 0x0337:
            st = [line((cx - 100, CY - 140), (cx + 100, CY + 120))]
        elif m == 0x0345:
            st = [PS([(cx, -30), (cx, -110)])]
        elif m == 0x034A or m == 0x0346:
            st = [PS([(cx - 60, XH + 90), (cx - 60, XH + 40), (cx + 60, XH + 40), (cx + 60, XH + 90)])]
        elif m == 0x0359:
            st = [line((cx - 40, -80), (cx + 40, -120)), line((cx - 40, -120), (cx + 40, -80))]
        if st is None:
            return [], 0
        return render(xform(st, lt.SX, lt.SY), P.hw), 0
    return f


# ------------------------------------------------------------------ decomposition driven
def decomp_recipe(cp):
    dec = unicodedata.decomposition(chr(cp))
    if not dec:
        return None
    parts = dec.split()
    tag = None
    if parts[0].startswith("<"):
        tag = parts[0]
        parts = parts[1:]
    cps = [int(p, 16) for p in parts]
    if tag is None:
        return accent_recipe(cp)
    if tag == "<wide>" and len(cps) == 1 and cps[0] in LATIN:
        def f(P):
            st, w = LATIN[cps[0]]
            st = xform(st, lt.SX, lt.SY, (1000 - w * lt.SX) / 2.0, 0)
            return render(st, P.hw), 1000
        return f
    if tag in ("<super>", "<sub>") and all(c in LATIN for c in cps):
        up = tag == "<super>"

        def f(P):
            r = text_strokes(cps, P, 0.58, 40, 0.72)
            st, w = r
            sb = 45
            st = xform(st, lt.SX, lt.SY, sb + P.hw, 330 * lt.SY if up else -150)
            return render(st, P.hw * 0.72), w * lt.SX + 2 * (sb + P.hw)
        return f
    if tag == "<fraction>" and len(cps) == 3:
        n, sl, d = cps
        if n in LATIN and d in LATIN:
            def f(P):
                a = text_strokes([n], P, 0.5, 0, 0.75)
                b = text_strokes([d], P, 0.5, 0, 0.75)
                wa, wb = a[1], b[1]
                st = xform(a[0], lt.SX, lt.SY, 40, 300 * lt.SY) + [line((20 + wa + 20, 20), (wa + 20 + 160, 600 * lt.SY))] + \
                    xform(b[0], lt.SX, lt.SY, wa + 20 + 130, 0)
                return render(st, P.hw * 0.75), (wa + wb) * lt.SX + 400
            return f
    if tag == "<circle>" and all(base(c, type("Q", (), {"hw": 30, "t": 0})) for c in cps):
        def f(P):
            r = text_strokes(cps, P, 1.0, 50)
            inner = fit(r[0], (CX - 190, CY - 215, CX + 190, CY + 215))
            return render([PS(ring(CX, CY, 330, 330, 36), True)] + inner, P.hw), 1000
        return f
    if tag in ("<square>", "<compat>") and all(base(c, type("Q", (), {"hw": 30, "t": 0})) for c in cps) and len(cps) <= 6:
        if tag == "<compat>" and any(c > 0x7F and not 0xAC00 <= c <= 0xD7A3 and c not in (0x1100,) for c in cps) is False:
            pass

        def f(P):
            r = text_strokes(cps, P, 1.0, 60)
            inner = fit(r[0], (60, CY - 230, 940, CY + 230))
            return render(inner, P.hw * 0.85), 1000
        return f
    return None


def accent_and_specials(cp):
    return special_latin(cp) or decomp_recipe(cp)
