"""Collects every glyph recipe: codepoint -> function(params) -> (contours, advance)."""
import unicodedata
from geom import render, xform, F, D, P as PS, line, arc, ring, bounds
import hangul as hg
import latin as lt
import symbols_a as sa
import symbols_b as sb
import compose as cm

SPACES = {
    0x0020: 270, 0x00A0: 270, 0x1680: 270, 0x2000: 500, 0x2001: 1000, 0x2002: 500, 0x2003: 1000,
    0x2004: 333, 0x2005: 250, 0x2006: 167, 0x2007: 520, 0x2008: 270, 0x2009: 200, 0x200A: 100,
    0x202F: 200, 0x205F: 222, 0x3000: 1000, 0x3164: 1000, 0x115F: 1000, 0x1160: 0, 0x2800: 600,
    0x200B: 0, 0x200C: 0, 0x200D: 0, 0x200E: 0, 0x200F: 0, 0x2060: 0, 0xFEFF: 0, 0x00AD: 0,
    0x034F: 0, 0x061C: 0, 0x180E: 0, 0x2061: 0, 0x2062: 0, 0x2063: 0, 0x2064: 0, 0x3165: 0,
}
for c in range(0xFE00, 0xFE10):
    SPACES[c] = 0
for c in range(0xE0100, 0xE01F0):
    SPACES[c] = 0


def hangul_box(P):
    """Centre-line box of a syllable.  The ink stays inside about 0.88 x 0.92 em so
    neighbouring syllables (and lines) keep a clear gap even at heavy weights."""
    t = P.t
    W = 840 - 40 * t - P.hw * 1.2
    H = 920 - 40 * t - P.hw * 2.0
    x0 = (1000 - W) / 2.0
    y0 = -80 + 20 * t + P.hw
    return W, H, x0, y0


def make_syllable(cp):
    L, V, T = hg.split_syllable(cp)
    m = hg.hw_mult(L, V, T)

    def f(P):
        W, H, x0, y0 = hangul_box(P)
        e = hg.stroke(P.hw, m)
        st = hg.syllable(L, V, T, W, H, e, 44)
        st = xform(st, 1, 1, x0, y0)
        return render(st, e), 1000
    return f


def make_jamo(ch):
    def f(P):
        W, H, x0, y0 = hangul_box(P)
        st = hg.lone_jamo(ch, W, H, P.hw, 44)
        st = xform(st, 1, 1, x0, y0)
        return render(st, P.hw), 1000
    return f


def make_latin(strokes_w, k=1.0):
    """Proportional glyph: side bearings measured from the real stroke extents,
    so every letter gets the same space on both sides."""
    strokes, w = strokes_w
    b = bounds(strokes) if strokes else (0, 0, 0, 0)
    minx, maxx = b[0], b[2]
    if not strokes:
        minx, maxx = 0.0, w

    def f(P):
        sb = 60 - 25 * P.t
        dx = sb + P.hw
        st = xform(strokes, lt.SX, lt.SY, dx - minx * lt.SX, 0)
        return render(st, P.hw * k), (maxx - minx) * lt.SX + 2 * dx
    return f


TAB_ADV = 560 * 1.3 + 150   # widest digit at the Latin scale + side bearings


def make_tabular(strokes_w):
    strokes, w = strokes_w
    b = bounds(strokes)

    def f(P):
        cw = (b[2] - b[0]) * lt.SX
        dx = (TAB_ADV - cw) / 2.0 - b[0] * lt.SX
        return render(xform(strokes, lt.SX, lt.SY, dx, 0), P.hw), TAB_ADV
    return f


def make_space(adv):
    return lambda P: ([], adv)


def collect():
    G = {}
    for cp, adv in SPACES.items():
        G[cp] = make_space(adv)
    for cp in range(0xAC00, 0xD7A4):
        G[cp] = make_syllable(cp)
    # compatibility jamo
    comp = "ㄱㄲㄳㄴㄵㄶㄷㄸㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅃㅄㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
    for ch in comp:
        G[ord(ch)] = make_jamo(ch)
    # conjoining jamo (modern)
    for i, ch in enumerate(hg.CHO):
        G[0x1100 + i] = make_jamo(ch)
    for i, ch in enumerate(hg.JUNG):
        G[0x1161 + i] = make_jamo(ch)
    for i, ch in enumerate(hg.JONG[1:]):
        G[0x11A8 + i] = make_jamo(ch)
    # ASCII
    L = lt.build_latin()
    Pn = lt.build_punct()
    for ch, g in {**L, **Pn}.items():
        G[ord(ch)] = make_latin(g)
    # composed glyphs (lowest priority; hand-drawn ones below replace them)
    cm.LATIN.update(sb.greek_cyrillic())
    cm.LATIN.update(sb.kaomoji())
    ranges = (list(range(0x2100, 0x2150)) + list(range(0xFFE0, 0xFFE7)) + list(range(0xA0, 0x250)) + list(range(0x1E00, 0x1F00)) + list(range(0x2070, 0x20A0)) +
              list(range(0x2150, 0x2190)) + list(range(0x2460, 0x24EB)) + list(range(0x3200, 0x3400)) +
              list(range(0xFF01, 0xFF5F)))
    for cp in ranges:
        if cp not in G:
            r = cm.accent_and_specials(cp)
            if r:
                G[cp] = r
    for m in (0x300, 0x301, 0x302, 0x303, 0x304, 0x306, 0x307, 0x308, 0x309, 0x30A, 0x30B, 0x30C, 0x31B,
              0x323, 0x324, 0x326, 0x327, 0x328, 0x330, 0x331, 0x332, 0x334, 0x335, 0x336, 0x337, 0x338,
              0x345, 0x346, 0x348, 0x359, 0x35C, 0x361):
        G[m] = cm.combining_recipe(m)
    # symbols (part A)
    for cp in range(0x2500, 0x2580):
        G[cp] = sa.box_recipe(cp)
    G.update(sa.block_recipes())
    for cp in range(0x2801, 0x2900):
        G[cp] = sa.braille(cp)
    G.update(sa.shapes())
    G.update(sa.arrows())
    G.update(sa.misc())
    G.update(sb.all_recipes())
    G.update(sb.bridges())
    for d in "0123456789":
        G["uni%04X.tf" % ord(d)] = make_tabular(L[d])
    return G
