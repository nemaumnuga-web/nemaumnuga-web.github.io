"""Procedural Hangul: jamo skeletons in the unit square + syllable layout."""
from geom import P, D, line, arc, into_box, xform, bounds, ink_bounds, sring as ring

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


# ------------------------------------------------------------------ square-frame layout
# Every syllable fills the same ink frame (W x H).  All distances below are measured on
# the *ink* (the filled outline), not on centre-lines, so the gap between any two jamo is
# exactly one constant G and every syllable has the same outer edges.
FINAL_H = 0.37    # final consonant row height, share of the frame height
TICK = 0.13       # ㅏ ㅓ ticks beyond the stem ink, share of the frame width
TICK2 = 0.10      # left tick of ㅔ ㅖ
PAIR = 0.10       # counter between the two stems of ㅐ ㅒ ㅔ ㅖ (at least ~1.1 G)
VTICK = 0.11      # ㅗ ㅜ ticks, share of the frame height
HCONTRAST = None  # resolved from geom.HCON


def _hh(hw):
    import geom
    return hw * geom.HCON  # half thickness of a horizontal stroke


def fit_ink(make, box, hw, iters=4, tol=0.25):
    """Draw make(centre_box) so that its *ink* fills box, to within tol units.

    The spill of the ink beyond the centre-lines depends on the stroke and on the
    geometry (joins, diagonals, rings), so the centre box is corrected iteratively."""
    x0, y0, x1, y1 = box
    cb = box
    st = make(cb)
    for _ in range(iters):
        b = ink_bounds(st, hw)
        if b is None:
            return st
        d = (x0 - b[0], y0 - b[1], b[2] - x1, b[3] - y1)   # how far the ink is off the target
        if max(abs(v) for v in d) <= tol:
            break
        cb = (cb[0] + d[0], cb[1] + d[1], cb[2] - d[2], cb[3] - d[3])
        if cb[2] - cb[0] < 1.0:
            m = (cb[0] + cb[2]) / 2.0
            cb = (m - 0.5, cb[1], m + 0.5, cb[3])
        if cb[3] - cb[1] < 1.0:
            m = (cb[1] + cb[3]) / 2.0
            cb = (cb[0], m - 0.5, cb[2], m + 0.5)
        st = make(cb)
    return st


def cons_ink(name, box, hw, G):
    """Consonant (single or double) whose ink fills box; doubles are split by one gap G."""
    x0, y0, x1, y1 = box
    if name in _DOUBLE:
        a, b = _DOUBLE[name]
        mid = (x0 + x1) / 2.0
        return cons_ink(a, (x0, y0, mid - G / 2.0, y1), hw, G) + cons_ink(b, (mid + G / 2.0, y0, x1, y1), hw, G)
    return fit_ink(lambda cb: into_box(_CONS[name], cb), box, hw)


def vvowel(v, W, y0, y1, hw, G):
    """Right-hand vowel with weight-independent outer edges.

    The outer ink edges are fixed at their Regular positions (right edge = frame edge W,
    left edge = where the Regular design puts it); a heavier stroke grows *inwards*
    (into the tick or the counter between two stems), so the initial next to it keeps
    its box.  Returns (strokes, x of the vowel's leftmost ink)."""
    r = REF_HW
    ym = lambda f: y0 + (y1 - y0) * f
    fs = [0.5] if v in "ㅏㅓㅐㅔ" else [0.64, 0.36]
    tk, tk2 = TICK * W, TICK2 * W
    dk = max(PAIR * W, 1.1 * G)
    stem = lambda a: line((a + hw, y0), (a + hw, y1))      # a = left ink edge of the stem
    if v == "ㅣ":
        a = W - 2 * hw                                     # right edge = frame edge (columns line up)
        return [stem(a)], a
    if v in "ㅏㅑ":
        a = W - tk - 2 * r                                 # stem's left edge fixed; grows into the tick
        return [stem(a)] + [line((a + hw, ym(f)), (W, ym(f))) for f in fs], a
    if v in "ㅓㅕ":
        a = W - 2 * hw                                     # right edge = frame edge
        left = W - 2 * r - tk                              # tick start fixed
        return [stem(a)] + [line((left, ym(f)), (a + hw, ym(f))) for f in fs], left
    a2 = W - 2 * hw                                        # right stem: right edge = frame edge
    a1 = W - 4 * r - dk                                    # left stem: left edge fixed
    minc = 0.6 * G                                         # keep a counter between the stems
    if a2 - (a1 + 2 * hw) < minc:
        a1 = a2 - minc - 2 * hw
    st = [stem(a1), stem(a2)]
    if v in "ㅐㅒ":
        return st + [line((a1 + hw, ym(f)), (a2 + hw, ym(f))) for f in fs], a1
    left = min(a1, W - 4 * r - dk) - tk2                   # ㅔ ㅖ: left tick end fixed
    return st + [line((left, ym(f)), (a1 + hw, ym(f))) for f in fs], left


REF_HW = 38.0     # Regular half-stroke: element boxes are designed at this weight and
                  # stay fixed at every other weight (only the stroke thickness changes)


def hvowel_height(v, H, hw):
    """Height of the box of a horizontal vowel.  ㅗ ㅛ ㅜ ㅠ: fixed (the bar grows into the
    tick).  ㅡ is a single bar, so its box is the bar itself."""
    if v == "ㅡ":
        return 2 * _hh(hw)
    return 2 * _hh(REF_HW) + VTICK * H


def hvowel(v, xa, xb, yb, H, hw):
    """Horizontal vowel whose ink fills x in [xa, xb], y in [yb, yb + height] exactly."""
    hh = _hh(hw)
    vh = hvowel_height(v, H, hw)
    xs = [(xa + xb) / 2.0] if v in "ㅗㅜ" else [xa + (xb - xa) * 0.3, xa + (xb - xa) * 0.7]
    if v == "ㅡ":
        return [line((xa, yb + hh), (xb, yb + hh))]
    if v in "ㅗㅛ":   # bar on the bottom edge, ticks up to the top edge
        return [line((xa, yb + hh), (xb, yb + hh))] + [line((x, yb + hh), (x, yb + vh)) for x in xs]
    # ㅜ ㅠ: bar on the top edge, ticks down to the bottom edge
    return [line((xa, yb + vh - hh), (xb, yb + vh - hh))] + [line((x, yb + vh - hh), (x, yb)) for x in xs]


def syllable_parts(L, V, T, W, H, hw, gap):
    """Same as syllable() but returns [(role, strokes), ...] (role: L, V, T)."""
    parts = []
    _syllable(L, V, T, W, H, hw, gap, parts)
    return parts


def syllable(L, V, T, W, H, hw, gap):
    out = []
    for _, st in syllable_parts(L, V, T, W, H, hw, gap):
        out += st
    return out


def _syllable(L, V, T, W, H, hw, gap, parts):
    """Strokes of one syllable.  (W, H) is the ink frame, gap the constant jamo gap G.

    The ink of every syllable fills the frame exactly; any two neighbouring jamo are
    separated by G; the final always takes FINAL_H of the height and the full width.
    """
    G = gap
    has_t = bool(T)
    FT = FINAL_H * H
    ybot = FT + G if has_t else 0.0
    if V in VERT:
        vst, left = vvowel(V, W, ybot, H, hw, G)
        parts.append(("L", cons_ink(L, (0.0, ybot, left - G, H), hw, G)))
        parts.append(("V", vst))
    elif V in HORZ:
        vh = hvowel_height(V, H, hw)
        parts.append(("L", cons_ink(L, (0.0, ybot + vh + G, W, H), hw, G)))
        parts.append(("V", hvowel(V, 0.0, W, ybot, H, hw)))
    else:  # mixed: vertical part on the right, horizontal part under the initial
        hpart, vpart = MIXED[V]
        vst, left = vvowel(vpart, W, ybot, H, hw, G)
        vh = hvowel_height(hpart, H, hw)
        parts.append(("L", cons_ink(L, (0.0, ybot + vh + G, left - G, H), hw, G)))
        parts.append(("V", hvowel(hpart, 0.0, left - G, ybot, H, hw) + vst))
    if has_t:
        parts.append(("T", cons_ink(T, (0.0, 0.0, W, FT), hw, G)))


def syllable_cplx(L, V, T):
    c = cons_cplx(L) + vowel_cplx(V) + (cons_cplx(T) * 1.1 if T else 0)
    return c


def hw_mult(L, V, T):
    """Dense syllables get a slightly lighter stroke so counters stay open."""
    c = syllable_cplx(L, V, T)
    return max(0.6, min(1.0, 1.0 - 0.05 * (c - 4.0)))


def stroke(hw, m):
    """Every syllable uses exactly the same stroke at a given weight (no per-syllable
    thinning), so changing the weight never changes the design of a glyph."""
    return hw


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
