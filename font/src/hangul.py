"""Procedural Hangul: jamo skeletons in the unit square + syllable layout."""
from geom import P, D, line, arc, into_box, xform, bounds, sring as ring

CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
JONG = [""] + list("ㄱㄲ") + ["ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ",
                               "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"]

# ------------------------------------------------------------ consonants
def _c(name):
    S = {}
    S["ㄱ"] = [P([(0, 1), (1, 1), (1, 0)])]
    S["ㄴ"] = [P([(0, 1), (0, 0), (1, 0)])]
    S["ㄷ"] = [P([(1, 1), (0, 1), (0, 0), (1, 0)])]
    S["ㄹ"] = [P([(0, 1), (1, 1), (1, .5), (0, .5), (0, 0), (1, 0)])]
    S["ㅁ"] = [P([(0, 1), (1, 1), (1, 0), (0, 0)], True)]
    S["ㅂ"] = [P([(0, 1), (0, 0), (1, 0), (1, 1)]), line((0, .48), (1, .48))]
    S["ㅅ"] = [line((.5, 1), (0, 0)), line((.5, .62), (1, 0))]
    S["ㅇ"] = [P(ring(.5, .5, .5, .5, 32), True)]
    S["ㅈ"] = [line((0, 1), (1, 1)), line((.5, 1), (0, 0)), line((.5, .55), (1, 0))]
    S["ㅊ"] = [line((.34, 1), (.66, 1)), line((0, .74), (1, .74)),
              line((.5, .74), (0, 0)), line((.5, .4), (1, 0))]
    S["ㅋ"] = [P([(0, 1), (1, 1), (1, 0)]), line((0, .5), (1, .5))]
    S["ㅌ"] = [P([(1, 1), (0, 1), (0, 0), (1, 0)]), line((0, .5), (1, .5))]
    S["ㅍ"] = [line((0, 1), (1, 1)), line((0, 0), (1, 0)), line((.25, 1), (.25, 0)), line((.75, 1), (.75, 0))]
    S["ㅎ"] = [line((.3, 1), (.7, 1)), line((0, .76), (1, .76)),
              P(ring(.5, .3, .3, .3, 28), True)]
    return S[name]


_CONS = {n: _c(n) for n in "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ"}

# a double consonant = two single ones side by side
_DOUBLE = {"ㄲ": "ㄱㄱ", "ㄸ": "ㄷㄷ", "ㅃ": "ㅂㅂ", "ㅆ": "ㅅㅅ", "ㅉ": "ㅈㅈ",
           "ㄳ": "ㄱㅅ", "ㄵ": "ㄴㅈ", "ㄶ": "ㄴㅎ", "ㄺ": "ㄹㄱ", "ㄻ": "ㄹㅁ", "ㄼ": "ㄹㅂ",
           "ㄽ": "ㄹㅅ", "ㄾ": "ㄹㅌ", "ㄿ": "ㄹㅍ", "ㅀ": "ㄹㅎ", "ㅄ": "ㅂㅅ"}

# number of horizontal bars stacked in each consonant / horizontal vowel: used to share the
# height of a syllable so that every bar gets the same spacing (a uniform rhythm)
HBARS = {"ㄱ": 1, "ㄴ": 1, "ㄷ": 2, "ㄹ": 3, "ㅁ": 2, "ㅂ": 2, "ㅅ": 1, "ㅇ": 2, "ㅈ": 1.5,
         "ㅊ": 2.5, "ㅋ": 2, "ㅌ": 3, "ㅍ": 2, "ㅎ": 3}
VBARS = {"ㅗ": 1.5, "ㅛ": 1.5, "ㅜ": 1.5, "ㅠ": 1.5, "ㅡ": 0.6}


def hbars(c):
    if c in _DOUBLE:
        return max(HBARS[x] for x in _DOUBLE[c])
    return HBARS[c]


CPLX = {"ㄱ": 1, "ㄴ": 1, "ㄷ": 1.6, "ㄹ": 2.6, "ㅁ": 2.0, "ㅂ": 2.6, "ㅅ": 1.6, "ㅇ": 1.4, "ㅈ": 2.2,
        "ㅊ": 3.0, "ㅋ": 2.0, "ㅌ": 2.6, "ㅍ": 3.0, "ㅎ": 3.0}


def consonant(name, box, hw, gap):
    """Strokes of a (possibly double) consonant fitted into box."""
    x0, y0, x1, y1 = box
    if name in _DOUBLE:
        a, b = _DOUBLE[name]
        mid = (x0 + x1) / 2.0
        g = gap / 2.0
        return consonant(a, (x0, y0, mid - g, y1), hw, gap) + consonant(b, (mid + g, y0, x1, y1), hw, gap)
    return into_box(_CONS[name], box)


def cons_cplx(name):
    if name in _DOUBLE:
        a, b = _DOUBLE[name]
        return (CPLX[a] + CPLX[b]) * 1.0
    return CPLX.get(name, 1)


# ---------------------------------------------------------------- vowels
def _v(name):
    S = {}
    S["ㅏ"] = [line((.28, 0), (.28, 1)), line((.28, .5), (1, .5))]
    S["ㅑ"] = [line((.28, 0), (.28, 1)), line((.28, .66), (1, .66)), line((.28, .34), (1, .34))]
    S["ㅓ"] = [line((.72, 0), (.72, 1)), line((0, .5), (.72, .5))]
    S["ㅕ"] = [line((.72, 0), (.72, 1)), line((0, .66), (.72, .66)), line((0, .34), (.72, .34))]
    S["ㅐ"] = [line((.12, 0), (.12, 1)), line((.78, 0), (.78, 1)), line((.12, .5), (.78, .5))]
    S["ㅒ"] = [line((.12, 0), (.12, 1)), line((.78, 0), (.78, 1)), line((.12, .66), (.78, .66)),
              line((.12, .34), (.78, .34))]
    S["ㅔ"] = [line((.5, 0), (.5, 1)), line((.9, 0), (.9, 1)), line((0, .5), (.5, .5))]
    S["ㅖ"] = [line((.5, 0), (.5, 1)), line((.9, 0), (.9, 1)), line((0, .66), (.5, .66)),
              line((0, .34), (.5, .34))]
    S["ㅣ"] = [line((.5, 0), (.5, 1))]
    S["ㅗ"] = [line((0, 0), (1, 0)), line((.5, 0), (.5, 1))]
    S["ㅛ"] = [line((0, 0), (1, 0)), line((.28, 0), (.28, 1)), line((.72, 0), (.72, 1))]
    S["ㅜ"] = [line((0, 1), (1, 1)), line((.5, 1), (.5, 0))]
    S["ㅠ"] = [line((0, 1), (1, 1)), line((.28, 1), (.28, 0)), line((.72, 1), (.72, 0))]
    S["ㅡ"] = [line((0, .5), (1, .5))]
    return S[name]


_VOW = {n: _v(n) for n in "ㅏㅑㅓㅕㅐㅒㅔㅖㅣㅗㅛㅜㅠㅡ"}
VERT = set("ㅏㅐㅑㅒㅓㅔㅕㅖㅣ")
HORZ = set("ㅗㅛㅜㅠㅡ")
MIXED = {"ㅘ": ("ㅗ", "ㅏ"), "ㅙ": ("ㅗ", "ㅐ"), "ㅚ": ("ㅗ", "ㅣ"), "ㅝ": ("ㅜ", "ㅓ"),
         "ㅞ": ("ㅜ", "ㅔ"), "ㅟ": ("ㅜ", "ㅣ"), "ㅢ": ("ㅡ", "ㅣ")}
VCPLX = {"ㅏ": 1.5, "ㅑ": 2.0, "ㅓ": 1.5, "ㅕ": 2.0, "ㅐ": 2.4, "ㅒ": 3.0, "ㅔ": 2.4, "ㅖ": 3.0, "ㅣ": 1.0,
         "ㅗ": 1.5, "ㅛ": 2.0, "ㅜ": 1.5, "ㅠ": 2.0, "ㅡ": 1.0}


def vowel_cplx(v):
    if v in MIXED:
        a, b = MIXED[v]
        return VCPLX[a] + VCPLX[b]
    return VCPLX[v]


# ---------------------------------------------------------------- layout
def _shrink(box, l=0.0, b=0.0, r=0.0, t=0.0):
    x0, y0, x1, y1 = box
    return (x0 + l, y0 + b, x1 - r, y1 - t)


# columns shared by every syllable (fractions of the centre-line box width)
COL_STEM = 0.86   # main vertical stem of every right-hand vowel sits on this column
COL_TICK = 0.14   # length of the short ticks of ㅏ ㅑ ㅓ ㅕ ㅔ ㅖ
COL_PAIR = 0.18   # distance between the two stems of ㅐ ㅒ ㅔ ㅖ


def vert_vowel(v, y0, y1, W):
    """Right-hand vowel drawn on the shared stem column.

    Returns (strokes, x of its leftmost part) so the initial can be fitted
    to the left of it with a constant gap.
    """
    R, t, d = COL_STEM * W, COL_TICK * W, COL_PAIR * W
    ym = lambda f: y0 + (y1 - y0) * f
    one = [0.5]
    two = [0.66, 0.34]
    st = [line((R, y0), (R, y1))]
    if v == "ㅣ":
        return st, R
    if v in "ㅏㅑ":
        return st + [line((R, ym(f)), (R + t, ym(f))) for f in (one if v == "ㅏ" else two)], R
    if v in "ㅓㅕ":
        return st + [line((R - t, ym(f)), (R, ym(f))) for f in (one if v == "ㅓ" else two)], R - t
    st.append(line((R - d, y0), (R - d, y1)))
    if v in "ㅐㅒ":
        return st + [line((R - d, ym(f)), (R, ym(f))) for f in (one if v == "ㅐ" else two)], R - d
    # ㅔ ㅖ
    return st + [line((R - d - t, ym(f)), (R - d, ym(f))) for f in (one if v == "ㅔ" else two)], R - d - t


def syllable(L, V, T, W, H, hw, gap):
    """Strokes of one syllable inside a W x H centre-line box at the origin.

    L, V, T are jamo characters (T may be '').  hw is the *effective* half
    stroke (used to keep neighbouring jamo apart as the weight grows).
    Every syllable shares the same columns (left edge, vowel stem) and rows
    (top line, bottom line), so text lines up in a grid.
    """
    s = hw * 1.15 + 6.0       # spacing unit between neighbouring jamo (grows with weight)
    gx = 0.12 * W + 1.8 * s   # horizontal gap between initial and vowel
    out = []
    has_t = bool(T)
    cl = T in _DOUBLE  # cluster final: give the bottom row more room
    if V in VERT:
        y0 = (((0.52 if cl else 0.44) * H + s) if has_t else 0.0)
        vst, left = vert_vowel(V, y0, H, W)
        Lb = (0.0, y0, left - gx, H)
        Tb = (0.0, 0.0, W, (0.40 if cl else 0.30) * H) if has_t else None
        out += consonant(L, Lb, hw, gap)
        out += vst
    elif V in HORZ:
        if has_t:
            wl, wv, wt = hbars(L) + 0.6, VBARS[V], hbars(T)
            g1 = 0.06 * H + 1.6 * s   # initial -> vowel
            g2 = 0.09 * H + 1.8 * s   # vowel -> final (kept wider so the two never touch)
            avail = H - g1 - g2
            tot = wl + wv + wt
            hT, hV = avail * wt / tot, avail * wv / tot
            Tb = (0.02 * W, 0.0, 0.98 * W, hT)
            Vb = (0.0, hT + g2, W, hT + g2 + hV)
            Lb = (0.07 * W, hT + g2 + hV + g1, 0.93 * W, H)
        else:
            Lb = (0.07 * W, 0.46 * H + s, 0.93 * W, H)
            # ㅡ sits on the bottom line like the bars of ㅗ ㅛ
            Vb = (0.0, -0.16 * H, W, 0.16 * H) if V == "ㅡ" else (0.0, 0.0, W, 0.32 * H)
            Tb = None
        out += consonant(L, Lb, hw, gap)
        out += into_box(_VOW[V], Vb)
    else:  # mixed: horizontal part under the initial, vertical part on the stem column
        h, v = MIXED[V]
        if has_t:
            if cl:
                ytop_l, hb, vy0 = 0.72 * H + s, (0.46 * H + s * 0.5, 0.60 * H - s * 0.3), 0.42 * H + s
                Tb = (0.0, 0.0, W, 0.34 * H)
            else:
                ytop_l, hb, vy0 = 0.62 * H + s, (0.32 * H + s * 0.5, 0.50 * H - s * 0.3), 0.30 * H + s
                Tb = (0.02 * W, 0.0, 0.98 * W, 0.22 * H)
        else:
            ytop_l, hb, vy0 = 0.46 * H + s, (0.0, 0.32 * H), 0.0
            Tb = None
        vst, left = vert_vowel(v, vy0, H, W)
        Lb = (0.02 * W, ytop_l, min(0.50 * W - s, left - gx), H)
        Hb = (0.0, hb[0], left - gx, hb[1])
        if h == "ㅡ" and not has_t:
            Hb = (0.0, -0.16 * H, left - gx, 0.16 * H)
        out += consonant(L, Lb, hw, gap)
        out += into_box(_VOW[h], Hb)
        out += vst
    if has_t:
        # align the final with the columns of the part above it: it never sticks out
        # past the initial on the left or the vowel stem / tick on the right
        b = bounds(out)
        Tb = (max(Tb[0], b[0]), Tb[1], min(Tb[2], b[2]), Tb[3])
        out += consonant(T, Tb, hw, gap)
    return out


def syllable_cplx(L, V, T):
    c = cons_cplx(L) + vowel_cplx(V) + (cons_cplx(T) * 1.1 if T else 0)
    return c


def hw_mult(L, V, T):
    """Dense syllables get a slightly lighter stroke so counters stay open."""
    c = syllable_cplx(L, V, T)
    return max(0.6, min(1.0, 1.0 - 0.05 * (c - 4.0)))


def stroke(hw, m):
    """Effective half-stroke: uniform at light/regular weights; only heavy weights
    thin the dense syllables (so counters stay open)."""
    r = max(0.0, min(1.0, (hw - 24.0) / 40.0))
    return hw * (1.0 - (1.0 - m) * r)


def split_syllable(cp):
    i = cp - 0xAC00
    t = i % 28
    v = (i // 28) % 21
    l = i // (28 * 21)
    return CHO[l], JUNG[v], JONG[t]


def lone_jamo(ch, W, H, hw, gap):
    """Stand-alone jamo (compatibility / conjoining) drawn centred in the em."""
    if ch in CHO or ch in _DOUBLE or ch in _CONS:
        s = 0.9 * hw
        bw, bh = 0.74 * W, 0.62 * H
        if ch in ("ㅡ",):
            pass
        box = ((W - bw) / 2.0, (H - bh) / 2.0, (W + bw) / 2.0, (H + bh) / 2.0)
        return consonant(ch, box, hw, gap)
    if ch in _VOW:
        if ch in VERT:
            box = (0.30 * W, 0.0, 0.70 * W, H) if ch in "ㅣㅏㅓㅑㅕ" else (0.18 * W, 0.0, 0.82 * W, H)
            if ch == "ㅣ":
                box = (0.40 * W, 0.0, 0.60 * W, H)
            return into_box(_VOW[ch], box)
        box = (0.12 * W, 0.20 * H, 0.88 * W, 0.80 * H)
        if ch == "ㅡ":
            box = (0.12 * W, 0.2 * H, 0.88 * W, 0.8 * H)
        return into_box(_VOW[ch], box)
    if ch in MIXED:
        h, v = MIXED[ch]
        out = into_box(_VOW[h], (0.0, 0.18 * H, 0.60 * W - 0.9 * hw, 0.58 * H))
        out += into_box(_VOW[v], (0.66 * W + 0.9 * hw, 0.0, W, H))
        return out
    return []
