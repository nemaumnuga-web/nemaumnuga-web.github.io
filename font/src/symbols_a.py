"""Box drawing, block elements, braille, geometric shapes, arrows, hearts/stars, math ..."""
import math, unicodedata
from geom import P as PS, D, F, H, line, arc, ring, render, xform, bounds

CX, CY = 500.0, 380.0
TOP, BOT = 880.0, -120.0


def R(strokes, adv=1000, k=1.0):
    def f(P):
        return render(strokes, P.hw * k), adv
    return f


def RP(fn, adv=1000):
    def f(P):
        return render(fn(P), P.hw), adv
    return f


def disc(cx, cy, rx, ry=None, n=36):
    ry = rx if ry is None else ry
    return F(ring(cx, cy, rx, ry, n))


def circ(cx, cy, rx, ry=None, n=36):
    ry = rx if ry is None else ry
    return PS(ring(cx, cy, rx, ry, n), True)


def poly(pts, closed=True):
    return PS(pts, closed)


# ============================================================ box drawing
STY = {"LIGHT": "L", "SINGLE": "L", "HEAVY": "H", "DOUBLE": "D"}
DIRS = {"UP": "u", "DOWN": "d", "LEFT": "l", "RIGHT": "r", "VERTICAL": "ud", "HORIZONTAL": "lr"}


def _box_arms(toks):
    arms, cur, pend = {}, None, []
    for t in toks:
        if t in STY:
            s = STY[t]
            if pend:
                for a in pend:
                    arms[a] = s
                pend = []
            else:
                cur = s
        elif t in DIRS:
            for a in DIRS[t]:
                if cur:
                    arms[a] = cur
                else:
                    pend.append(a)
    return arms


def box_recipe(cp):
    name = unicodedata.name(chr(cp))[len("BOX DRAWINGS "):]
    toks = name.split()
    if "DIAGONAL" in toks:
        a = [(0, BOT), (1000, TOP)]
        b = [(0, TOP), (1000, BOT)]
        if "CROSS" in toks:
            return R([PS(a), PS(b)], 1000, 0.8)
        if "UPPER" in toks and "RIGHT" in toks and toks.index("UPPER") < toks.index("RIGHT") and toks[-1] == "LEFT":
            return R([PS(a)], 1000, 0.8)
        return R([PS(b)], 1000, 0.8)
    if "DASH" in toks:
        heavy = "HEAVY" in toks
        n = {"DOUBLE": 2, "TRIPLE": 3, "QUADRUPLE": 4}[[t for t in toks if t in ("DOUBLE", "TRIPLE", "QUADRUPLE")][0]]
        horiz = "HORIZONTAL" in toks

        def f(P):
            h = P.hw * 0.8 * (2.2 if heavy else 1.0)
            st = []
            L = 1000.0 if horiz else TOP - BOT
            p = L / n
            for i in range(n):
                a, b = i * p + 0.19 * p, i * p + 0.81 * p
                if horiz:
                    st.append(PS([(a, CY), (b, CY)]))
                else:
                    st.append(PS([(CX, BOT + a), (CX, BOT + b)]))
            return render(st, h), 1000
        return f
    arc_ = "ARC" in toks
    arms = _box_arms(toks)

    def f(P):
        hl = max(P.hw * 0.8, 5.0)
        hh = hl * 2.2
        hd = hl * 0.75
        o = 55 + 1.3 * hl
        out = []
        hwid = {"L": hl, "H": hh, "D": hd}
        if arc_:
            r = 170.0
            u = "u" in arms
            d_ = "d" in arms
            l_ = "l" in arms
            rr = "r" in arms
            if d_ and rr:
                pts = [(CX, BOT), (CX, CY - r)] + arc(CX + r, CY - r, r, r, 180, 90, 10)[1:] + [(1000, CY)]
            elif d_ and l_:
                pts = [(CX, BOT), (CX, CY - r)] + arc(CX - r, CY - r, r, r, 0, 90, 10)[1:] + [(0, CY)]
            elif u and rr:
                pts = [(CX, TOP), (CX, CY + r)] + arc(CX + r, CY + r, r, r, 180, 270, 10)[1:] + [(1000, CY)]
            else:
                pts = [(CX, TOP), (CX, CY + r)] + arc(CX - r, CY + r, r, r, 0, -90, 10)[1:] + [(0, CY)]
            return render([PS(pts)], hl), 1000
        ends = {"r": (1000, CY), "l": (0, CY), "u": (CX, TOP), "d": (CX, BOT)}
        horiz = {k for k in arms if k in "lr"}
        vert = {k for k in arms if k in "ud"}
        all_double = arms and all(s == "D" for s in arms.values())
        if all_double:
            ud = "u" in arms
            dd = "d" in arms
            ld = "l" in arms
            rd = "r" in arms
            segs = []  # (x0,y0,x1,y1)
            for sgn, has in ((1, ud), (-1, dd)):  # horizontal lines
                y = CY + sgn * o
                if has:
                    if ld:
                        segs.append((0, y, CX - o, y))
                    if rd:
                        segs.append((CX + o, y, 1000, y))
                else:
                    a = 0 if ld else CX - o
                    b = 1000 if rd else CX + o
                    if (ld or rd):
                        segs.append((a, y, b, y))
            for sgn, has in ((-1, ld), (1, rd)):  # vertical lines
                x = CX + sgn * o
                if has:
                    if ud:
                        segs.append((x, CY + o, x, TOP))
                    if dd:
                        segs.append((x, BOT, x, CY - o))
                else:
                    a = BOT if dd else CY - o
                    b = TOP if ud else CY + o
                    if (ud or dd):
                        segs.append((x, a, x, b))
            return render([PS([(a, b), (c, d)]) for a, b, c, d in segs if (a, b) != (c, d)], hd), 1000
        for a, s in arms.items():
            perp = vert if a in "lr" else horiz
            bk = 0.0
            for q in perp:
                bk = max(bk, o + hd if arms[q] == "D" else hwid[arms[q]])
            ex, ey = ends[a]
            if a == "r":
                p0 = (CX - bk, CY)
            elif a == "l":
                p0 = (CX + bk, CY)
            elif a == "u":
                p0 = (CX, CY - bk)
            else:
                p0 = (CX, CY + bk)
            if s == "D":
                for sg in (-1, 1):
                    if a in "lr":
                        out.append((PS([(p0[0], CY + sg * o), (ex, CY + sg * o)]), hd))
                    else:
                        out.append((PS([(CX + sg * o, p0[1]), (CX + sg * o, ey)]), hd))
            else:
                out.append((PS([p0, (ex, ey)]), hwid[s]))
        res = []
        for st, h in out:
            res += render([st], h)
        return res, 1000
    return f


# ============================================================ blocks
def block_recipes():
    G = {}
    W, Hh = 1000.0, TOP - BOT

    def rect(x0, y0, x1, y1):
        return F([(x0, y0), (x0, y1), (x1, y1), (x1, y0)])
    G[0x2580] = R([rect(0, BOT + Hh / 2, W, TOP)])
    for i in range(1, 9):
        G[0x2580 + i] = R([rect(0, BOT, W, BOT + Hh * i / 8)])
    for i in range(1, 8):
        G[0x2588 + i] = R([rect(0, BOT, W * (8 - i) / 8, TOP)])
    G[0x2590] = R([rect(W / 2, BOT, W, TOP)])
    # shades
    def shade(kind):
        def f(P):
            st = []
            if kind == 1:
                for i in range(5):
                    for j in range(5):
                        st.append(rect(i * 200 + 55, BOT + j * 200 + 55, i * 200 + 145, BOT + j * 200 + 145))
            elif kind == 2:
                for i in range(10):
                    for j in range(10):
                        if (i + j) % 2 == 0:
                            st.append(rect(i * 100, BOT + j * 100, i * 100 + 100, BOT + j * 100 + 100))
            else:
                st.append(rect(0, BOT, W, TOP))
                for i in range(5):
                    for j in range(5):
                        st.append(H([(i * 200 + 55, BOT + j * 200 + 55), (i * 200 + 145, BOT + j * 200 + 55),
                                     (i * 200 + 145, BOT + j * 200 + 145), (i * 200 + 55, BOT + j * 200 + 145)]))
            return render(st, 1), 1000
        return f
    G[0x2591], G[0x2592], G[0x2593] = shade(1), shade(2), shade(3)
    G[0x2594] = R([rect(0, TOP - Hh / 8, W, TOP)])
    G[0x2595] = R([rect(W * 7 / 8, BOT, W, TOP)])
    q = {"ul": rect(0, BOT + Hh / 2, W / 2, TOP), "ur": rect(W / 2, BOT + Hh / 2, W, TOP),
         "ll": rect(0, BOT, W / 2, BOT + Hh / 2), "lr": rect(W / 2, BOT, W, BOT + Hh / 2)}
    for cp, keys in ((0x2596, ["ll"]), (0x2597, ["lr"]), (0x2598, ["ul"]), (0x2599, ["ul", "ll", "lr"]),
                     (0x259A, ["ul", "lr"]), (0x259B, ["ul", "ur", "ll"]), (0x259C, ["ul", "ur", "lr"]),
                     (0x259D, ["ur"]), (0x259E, ["ur", "ll"]), (0x259F, ["ur", "ll", "lr"])):
        G[cp] = R([q[k] for k in keys])
    return G


# ============================================================ braille
def braille(cp):
    bits = cp - 0x2800
    pos = {0: (0, 0), 1: (0, 1), 2: (0, 2), 3: (1, 0), 4: (1, 1), 5: (1, 2), 6: (0, 3), 7: (1, 3)}

    def f(P):
        st = []
        for b, (c, r) in pos.items():
            if bits >> b & 1:
                st.append(D(170 + c * 260, 690 - r * 200, 1.5))
        return render(st, P.hw), 600
    return f


# ============================================================ shapes
def shapes():
    G = {}
    S = 310.0
    sq = lambda: [(CX - S, CY - S), (CX - S, CY + S), (CX + S, CY + S), (CX + S, CY - S)]
    G[0x25A0] = R([F(sq())])
    G[0x25A1] = R([PS(sq(), True)])
    G[0x25A2] = R([PS(sq(), True)])
    G[0x25A3] = R([PS(sq(), True), F([(CX - 170, CY - 170), (CX - 170, CY + 170), (CX + 170, CY + 170), (CX + 170, CY - 170)])])
    hat = lambda kind: R([PS(sq(), True)] + _hatch(kind))
    for i, cp in enumerate(range(0x25A4, 0x25AA)):
        G[cp] = hat(i)
    G[0x25AA] = R([F([(CX - 150, CY - 150), (CX - 150, CY + 150), (CX + 150, CY + 150), (CX + 150, CY - 150)])])
    G[0x25AB] = R([PS([(CX - 150, CY - 150), (CX - 150, CY + 150), (CX + 150, CY + 150), (CX + 150, CY - 150)], True)])
    wide = [(CX - 400, CY - 170), (CX - 400, CY + 170), (CX + 400, CY + 170), (CX + 400, CY - 170)]
    tall = [(CX - 170, CY - 400), (CX - 170, CY + 400), (CX + 170, CY + 400), (CX + 170, CY - 400)]
    G[0x25AC], G[0x25AD], G[0x25AE], G[0x25AF] = R([F(wide)]), R([PS(wide, True)]), R([F(tall)]), R([PS(tall, True)])
    # triangles
    def tri(d, s=330.0):
        a = {"u": [(CX, CY + s), (CX - s * 1.0, CY - s * 0.75), (CX + s * 1.0, CY - s * 0.75)],
             "d": [(CX, CY - s), (CX - s * 1.0, CY + s * 0.75), (CX + s * 1.0, CY + s * 0.75)],
             "l": [(CX - s, CY), (CX + s * 0.75, CY - s * 1.0), (CX + s * 0.75, CY + s * 1.0)],
             "r": [(CX + s, CY), (CX - s * 0.75, CY - s * 1.0), (CX - s * 0.75, CY + s * 1.0)]}[d]
        return a
    for cp, d, filled, s in ((0x25B2, "u", 1, 330), (0x25B3, "u", 0, 330), (0x25B4, "u", 1, 180), (0x25B5, "u", 0, 180),
                             (0x25B6, "r", 1, 330), (0x25B7, "r", 0, 330), (0x25B8, "r", 1, 180), (0x25B9, "r", 0, 180),
                             (0x25BA, "r", 1, 330), (0x25BB, "r", 0, 330),
                             (0x25BC, "d", 1, 330), (0x25BD, "d", 0, 330), (0x25BE, "d", 1, 180), (0x25BF, "d", 0, 180),
                             (0x25C0, "l", 1, 330), (0x25C1, "l", 0, 330), (0x25C2, "l", 1, 180), (0x25C3, "l", 0, 180),
                             (0x25C4, "l", 1, 330), (0x25C5, "l", 0, 330)):
        t = tri(d, s)
        G[cp] = R([F(t)] if filled else [PS(t, True)])
    dia = lambda s, w=1.0: [(CX, CY + s), (CX - s * w, CY), (CX, CY - s), (CX + s * w, CY)]
    G[0x25C6] = R([F(dia(360))])
    G[0x25C7] = R([PS(dia(360), True)])
    G[0x25C8] = R([PS(dia(360), True), F(dia(150))])
    G[0x25CA] = R([PS(dia(380, 0.62), True)])
    G[0x2666] = R([F(dia(360, 0.75))])
    G[0x2662] = R([PS(dia(360, 0.75), True)])
    # circles
    G[0x25CB] = R([circ(CX, CY, 300)])
    G[0x25CF] = R([disc(CX, CY, 330)])
    G[0x25CE] = R([circ(CX, CY, 300), circ(CX, CY, 150)])
    G[0x25C9] = R([circ(CX, CY, 300), disc(CX, CY, 170)])
    G[0x25EF] = R([circ(CX, CY, 400)])
    G[0x2B24] = R([disc(CX, CY, 400)])
    G[0x25E6] = R([circ(CX, CY, 110)])
    G[0x2022] = R([disc(CX, CY, 140)], 600)
    G[0x2219] = R([disc(CX, CY, 70)], 500)
    G[0x26AA] = R([circ(CX, CY, 220)])
    G[0x26AB] = R([disc(CX, CY, 250)])
    G[0x25CC] = R([D(CX + 300 * math.cos(math.radians(a)), CY + 300 * math.sin(math.radians(a)), 0.9) for a in range(0, 360, 30)])
    G[0x25CD] = R([circ(CX, CY, 300), PS([(CX - 150, CY + 250), (CX + 200, CY - 220)])])

    def half(cp, which):
        pts = {"l": arc(CX, CY, 330, 330, 90, 270, 10), "r": arc(CX, CY, 330, 330, -90, 90, 10),
               "b": arc(CX, CY, 330, 330, 180, 360, 10), "t": arc(CX, CY, 330, 330, 0, 180, 10)}[which]
        G[cp] = R([circ(CX, CY, 300), F(pts)])
    half(0x25D0, "l"); half(0x25D1, "r"); half(0x25D2, "b"); half(0x25D3, "t")
    G[0x25D6] = R([F(arc(CX, CY, 330, 330, 90, 270, 10))])
    G[0x25D7] = R([F(arc(CX, CY, 330, 330, -90, 90, 10))])

    def pie(cp, a0, a1):
        pts = [(CX, CY)] + arc(CX, CY, 300, 300, a0, a1, 10)
        G[cp] = R([circ(CX, CY, 300), F(pts)])
    pie(0x25D4, 90, 0 )  # quarter, upper right
    G[0x25D4] = R([circ(CX, CY, 300), F([(CX, CY)] + arc(CX, CY, 300, 300, 90, 0, 10))])
    G[0x25D5] = R([circ(CX, CY, 300), F([(CX, CY)] + arc(CX, CY, 300, 300, 90, -180, 10))])
    # arcs / smiles
    G[0x25E0] = R([PS(arc(CX, CY - 80, 300, 300, 180, 0, 10))])
    G[0x25E1] = R([PS(arc(CX, CY + 80, 300, 300, 180, 360, 10))])
    G[0x2312] = R([PS(arc(CX, CY - 160, 300, 260, 160, 20, 10))])
    G[0x25DC] = R([PS(arc(CX, CY, 300, 300, 180, 90, 10))])
    G[0x25DD] = R([PS(arc(CX, CY, 300, 300, 90, 0, 10))])
    G[0x25DE] = R([PS(arc(CX, CY, 300, 300, 0, -90, 10))])
    G[0x25DF] = R([PS(arc(CX, CY, 300, 300, -90, -180, 10))])
    # right triangles in cell corners
    G[0x25E2] = R([F([(CX + S, CY - S), (CX + S, CY + S), (CX - S, CY - S)])])
    G[0x25E3] = R([F([(CX - S, CY - S), (CX - S, CY + S), (CX + S, CY - S)])])
    G[0x25E4] = R([F([(CX - S, CY + S), (CX + S, CY + S), (CX - S, CY - S)])])
    G[0x25E5] = R([F([(CX - S, CY + S), (CX + S, CY + S), (CX + S, CY - S)])])
    G[0x25E7] = R([PS(sq(), True), F([(CX - S, CY - S), (CX - S, CY + S), (CX, CY + S), (CX, CY - S)])])
    G[0x25E8] = R([PS(sq(), True), F([(CX, CY - S), (CX, CY + S), (CX + S, CY + S), (CX + S, CY - S)])])
    G[0x25E9] = R([PS(sq(), True), F([(CX - S, CY + S), (CX + S, CY + S), (CX - S, CY - S)])])
    G[0x25EA] = R([PS(sq(), True), F([(CX + S, CY - S), (CX - S, CY - S), (CX + S, CY + S)])])
    return G


def _hatch(kind):
    S = 310
    xs = [CX - S + i * 2 * S / 4 for i in range(1, 4)]
    if kind == 0:
        return [PS([(CX - S, y), (CX + S, y)]) for y in [CY - S + i * 2 * S / 4 for i in range(1, 4)]]
    if kind == 1:
        return [PS([(x, CY - S), (x, CY + S)]) for x in xs]
    if kind == 2:
        return [PS([(CX - S, y), (CX + S, y)]) for y in [CY - S + i * 2 * S / 4 for i in range(1, 4)]] + \
               [PS([(x, CY - S), (x, CY + S)]) for x in xs]
    if kind == 3:
        return [PS([(CX - S, CY - S + o), (CX + S - o, CY + S)]) for o in (0, 2 * S / 3, 4 * S / 3)][1:] + \
               [PS([(CX - S + o, CY - S), (CX + S, CY + S - o)]) for o in (0, 2 * S / 3, 4 * S / 3)][1:]
    if kind == 4:
        return [PS([(CX - S, CY + S - o), (CX + S - o, CY - S)]) for o in (0, 2 * S / 3, 4 * S / 3)][1:] + \
               [PS([(CX - S + o, CY + S), (CX + S, CY - S + o)]) for o in (0, 2 * S / 3, 4 * S / 3)][1:]
    return [PS([(CX - S, CY - S), (CX + S, CY + S)]), PS([(CX - S, CY + S), (CX + S, CY - S)])]


# ============================================================ arrows
def arrow_strokes(dx, dy, double=False, head=170.0, length=360.0):
    """Arrow pointing in direction (dx,dy) centred on the cell."""
    n = math.hypot(dx, dy)
    ux, uy = dx / n, dy / n
    px, py = -uy, ux
    tip = (CX + ux * length, CY + uy * length)
    tail = (CX - ux * length, CY - uy * length)
    st = []
    if double:
        for s in (-1, 1):
            o = 55 * s
            st.append(PS([(tail[0] + px * o, tail[1] + py * o), (tip[0] + px * o - ux * 60, tip[1] + py * o - uy * 60)]))
    else:
        st.append(PS([tail, tip]))
    b = (tip[0] - ux * head, tip[1] - uy * head)
    st.append(PS([(b[0] + px * head * 0.9, b[1] + py * head * 0.9), tip, (b[0] - px * head * 0.9, b[1] - py * head * 0.9)]))
    return st


def arrows():
    G = {}
    for cp, d in ((0x2190, (-1, 0)), (0x2191, (0, 1)), (0x2192, (1, 0)), (0x2193, (0, -1)),
                  (0x2196, (-1, 1)), (0x2197, (1, 1)), (0x2198, (1, -1)), (0x2199, (-1, -1))):
        G[cp] = R(arrow_strokes(*d, length=380 if d[0] * d[1] == 0 else 300), 1000)
    for cp, d in ((0x21D0, (-1, 0)), (0x21D1, (0, 1)), (0x21D2, (1, 0)), (0x21D3, (0, -1))):
        G[cp] = R(arrow_strokes(*d, double=True), 1000)
    G[0x2194] = R(arrow_strokes(-1, 0, length=380) + arrow_strokes(1, 0, length=380))
    G[0x2195] = R(arrow_strokes(0, 1, length=380) + arrow_strokes(0, -1, length=380))
    G[0x21D4] = R(arrow_strokes(-1, 0, True) + arrow_strokes(1, 0, True))
    G[0x21D5] = R(arrow_strokes(0, 1, True) + arrow_strokes(0, -1, True))
    for cp, d in ((0x2B05, (-1, 0)), (0x2B06, (0, 1)), (0x27A1, (1, 0)), (0x2B07, (0, -1)), (0x2794, (1, 0)),
                  (0x279C, (1, 0)), (0x27A4, (1, 0))):
        G[cp] = R(arrow_strokes(*d, length=380, head=210))
    # turning arrows
    G[0x21A9] = R([PS([(CX + 330, CY + 120), (CX + 330, CY + 120)] if False else
                      [(CX + 330, CY + 150), (CX, CY + 150)] + arc(CX, CY, 150, 150, 90, 270, 15)[1:] + [(CX + 330, CY - 150)][:0]
                      + [(CX - 350, CY - 150)]),
                   PS([(CX - 210, CY - 20), (CX - 350, CY - 150), (CX - 210, CY - 280)])])
    G[0x21AA] = R([PS([(CX - 330, CY + 150), (CX, CY + 150)] + arc(CX, CY, 150, 150, 90, -90, 15)[1:] + [(CX + 350, CY - 150)]),
                   PS([(CX + 210, CY - 20), (CX + 350, CY - 150), (CX + 210, CY - 280)])])
    for cp, sgn in ((0x21BB, 1), (0x21BA, -1)):
        pts = arc(CX, CY, 290, 290, 100, 100 - sgn * 300, 12)
        e = pts[-1]
        tang = math.radians(100 - sgn * 300 + sgn * 90)
        G[cp] = R([PS(pts), PS([(e[0] + 120 * math.cos(tang + 2.5 * sgn), e[1] + 120 * math.sin(tang + 2.5 * sgn)), e,
                               (e[0] + 120 * math.cos(tang - 0.7 * sgn), e[1] + 120 * math.sin(tang - 0.7 * sgn))])])
    return G


# ============================================================ hearts, stars, misc
def heart_pts(s=21.0, n=40):
    out = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        out.append((CX + x * s, CY + 10 + y * s))
    return out


def star_pts(R_=340.0, r=140.0, n=5, rot=90.0):
    out = []
    for i in range(2 * n):
        a = math.radians(rot + 180.0 * i / n)
        rr = R_ if i % 2 == 0 else r
        out.append((CX + rr * math.cos(a), CY + 20 + rr * math.sin(a)))
    return out


def misc():
    G = {}
    G[0x2665] = R([F(heart_pts())])
    G[0x2661] = R([PS(heart_pts(), True)])
    G[0x2764] = R([F(heart_pts())])
    G[0x2765] = R([F(heart_pts(18))])
    G[0x2763] = R([PS(heart_pts(14), True), PS([(CX + 250, CY + 330), (CX + 250, CY + 80)])])
    G[0x2605] = R([F(star_pts())])
    G[0x2606] = R([PS(star_pts(), True)])
    G[0x2729] = R([PS(star_pts(), True)])
    G[0x272A] = R([circ(CX, CY, 330), F(star_pts(250, 105))])
    G[0x272D] = R([F(star_pts())])
    G[0x2726] = R([F([(CX, CY + 380), (CX + 90, CY + 90), (CX + 380, CY), (CX + 90, CY - 90), (CX, CY - 380),
                      (CX - 90, CY - 90), (CX - 380, CY), (CX - 90, CY + 90)])])
    G[0x2727] = R([PS([(CX, CY + 380), (CX + 90, CY + 90), (CX + 380, CY), (CX + 90, CY - 90), (CX, CY - 380),
                       (CX - 90, CY - 90), (CX - 380, CY), (CX - 90, CY + 90)], True)])
    G[0x2736] = R([F(star_pts(360, 160, 6))])
    G[0x2734] = R([F(star_pts(360, 150, 8, 90))])
    G[0x2733] = R([PS([(CX, CY + 340), (CX, CY - 340)]), PS([(CX - 300, CY + 170), (CX + 300, CY - 170)]),
                   PS([(CX - 300, CY - 170), (CX + 300, CY + 170)])])
    G[0x2731] = G[0x2733]
    G[0x2217] = R([PS([(CX, CY + 160), (CX, CY - 160)]), PS([(CX - 140, CY + 80), (CX + 140, CY - 80)]),
                   PS([(CX - 140, CY - 80), (CX + 140, CY + 80)])], 600)
    # spades / clubs
    flip = lambda pts: [(x, 2 * CY + 20 - y) for x, y in pts]
    stem = lambda: PS([(CX, CY - 40), (CX, CY - 330)], False, 0.0, 1.0)
    G[0x2660] = R([F(flip(heart_pts(19))), F([(CX - 130, CY - 330), (CX, CY - 40), (CX + 130, CY - 330)])])
    G[0x2664] = R([PS(flip(heart_pts(19)), True), stem()])
    cl = lambda: [(CX, CY + 150, 140), (CX - 170, CY - 110, 140), (CX + 170, CY - 110, 140)]
    G[0x2663] = R([disc(x, y, r) for x, y, r in cl()] + [F([(CX - 90, CY - 340), (CX, CY - 60), (CX + 90, CY - 340)])])
    G[0x2667] = R([circ(x, y, r) for x, y, r in cl()] + [stem()])
    # notes
    note = lambda x, y: F(ring(x, y, 125, 90, 20))
    G[0x266A] = R([note(CX - 80, CY - 230), PS([(CX + 35, CY - 210), (CX + 35, CY + 330)]),
                   PS([(CX + 35, CY + 330), (CX + 210, CY + 190)])], 800)
    G[0x2669] = R([note(CX - 80, CY - 230), PS([(CX + 35, CY - 210), (CX + 35, CY + 330)])], 800)
    G[0x266B] = R([note(CX - 200, CY - 230), note(CX + 140, CY - 230), PS([(CX - 85, CY - 210), (CX - 85, CY + 320)]),
                   PS([(CX + 255, CY - 210), (CX + 255, CY + 320)]), PS([(CX - 85, CY + 320), (CX + 255, CY + 320)])])
    G[0x266C] = R([note(CX - 200, CY - 230), note(CX + 140, CY - 230), PS([(CX - 85, CY - 210), (CX - 85, CY + 320)]),
                   PS([(CX + 255, CY - 210), (CX + 255, CY + 320)]), PS([(CX - 85, CY + 320), (CX + 255, CY + 320)]),
                   PS([(CX - 85, CY + 210), (CX + 255, CY + 210)])])
    # faces
    smile = PS(arc(CX, CY - 30, 190, 170, 200, 340, 10))
    eyes = [D(CX - 120, CY + 90, 1.0), D(CX + 120, CY + 90, 1.0)]
    G[0x263A] = R([circ(CX, CY, 330), smile] + eyes)
    G[0x2639] = R([circ(CX, CY, 330), PS(arc(CX, CY - 200, 190, 150, 20, 160, 10))] + eyes)
    G[0x263B] = R([disc(CX, CY, 340), H(arc(CX, CY - 30, 190, 170, 200, 340, 10) + arc(CX, CY - 30, 190, 170, 340, 200, 10)[:0]
                                          if False else ring(CX - 120, CY + 90, 40, 40, 12)),
                   H(ring(CX + 120, CY + 90, 40, 40, 12))])
    # weather / misc
    G[0x2600] = R([circ(CX, CY, 150)] + [PS([(CX + 230 * math.cos(math.radians(a)), CY + 230 * math.sin(math.radians(a))),
                                           (CX + 340 * math.cos(math.radians(a)), CY + 340 * math.sin(math.radians(a)))])
                                         for a in range(0, 360, 45)])
    G[0x263C] = G[0x2600]
    G[0x2601] = R([PS([(CX - 250, CY - 150)] + arc(CX - 250, CY - 20, 130, 130, 270, 90, 15)[0:1] + arc(CX - 120, CY + 30, 140, 140, 180, 30, 15) + arc(CX + 150, CY - 20, 130, 130, 90, -90, 15)[1:] + [(CX + 150, CY - 150), (CX - 250, CY - 150)])])
    G[0x2602] = R([PS(arc(CX, CY + 40, 340, 280, 180, 0, 12)), PS([(CX, CY + 40), (CX, CY - 260)] + arc(CX - 80, CY - 260, 80, 80, 0, -180, 15)[1:])])
    G[0x2603] = R([circ(CX, CY + 190, 140), circ(CX, CY - 130, 190), D(CX - 45, CY + 220, 0.8), D(CX + 45, CY + 220, 0.8)])
    G[0x2744] = R([PS([(CX + 340 * math.cos(math.radians(a)), CY + 340 * math.sin(math.radians(a))),
                       (CX - 340 * math.cos(math.radians(a)), CY - 340 * math.sin(math.radians(a)))]) for a in (0, 60, 120)])
    G[0x26A1] = R([F([(CX + 60, CY + 380), (CX - 180, CY - 40), (CX - 10, CY - 40), (CX - 70, CY - 380), (CX + 190, CY + 70), (CX + 20, CY + 70)])])
    G[0x263E] = R([PS(arc(CX, CY, 300, 300, 80, 280, 12) + arc(CX - 100, CY, 230, 300, 280, 80, 12)[1:], True)])
    G[0x263D] = R([PS(arc(CX, CY, 300, 300, 100, -100, 12) + arc(CX + 100, CY, 230, 300, -100, 100, 12)[1:], True)])
    # flowers
    petals = lambda n, pr, rr_: [circ(CX + rr_ * math.cos(math.radians(90 + 360.0 * i / n)),
                                      CY + rr_ * math.sin(math.radians(90 + 360.0 * i / n)), pr, pr, 16) for i in range(n)]
    G[0x273F] = R(petals(5, 120, 190) + [disc(CX, CY, 70)])
    G[0x2740] = R(petals(5, 120, 190) + [circ(CX, CY, 70)])
    G[0x2741] = R(petals(8, 90, 230) + [circ(CX, CY, 70)])
    G[0x2742] = R(petals(8, 90, 230) + [disc(CX, CY, 70)])
    G[0x2743] = R(petals(4, 130, 190) + [disc(CX, CY, 60)])
    G[0x2765] = G[0x2764]
    # check / cross
    G[0x2713] = R([PS([(CX - 250, CY - 20), (CX - 90, CY - 210), (CX + 280, CY + 270)])])
    G[0x2714] = R([PS([(CX - 250, CY - 20), (CX - 90, CY - 210), (CX + 280, CY + 270)])], 1000, 1.5)
    G[0x2717] = R([PS([(CX - 230, CY + 270), (CX + 230, CY - 270)]), PS([(CX + 230, CY + 270), (CX - 230, CY - 270)])])
    G[0x2718] = R([PS([(CX - 230, CY + 270), (CX + 230, CY - 270)]), PS([(CX + 230, CY + 270), (CX - 230, CY - 270)])], 1000, 1.5)
    G[0x2715] = G[0x2717]
    G[0x2716] = G[0x2718]
    G[0x271A] = R([PS([(CX, CY - 280), (CX, CY + 280)]), PS([(CX - 280, CY), (CX + 280, CY)])], 1000, 1.7)
    G[0x2720] = R([PS([(CX, CY - 300), (CX, CY + 300)]), PS([(CX - 300, CY), (CX + 300, CY)]),
                   PS([(CX - 210, CY + 210), (CX + 210, CY - 210)]), PS([(CX - 210, CY - 210), (CX + 210, CY + 210)])])
    # reference mark etc.
    G[0x203B] = R([PS([(CX - 230, CY + 230), (CX + 230, CY - 230)]), PS([(CX + 230, CY + 230), (CX - 230, CY - 230)]),
                   D(CX, CY + 250, 0.9), D(CX, CY - 250, 0.9), D(CX - 280, CY, 0.9), D(CX + 280, CY, 0.9)])
    G[0x2640] = R([circ(CX, CY + 80, 190), PS([(CX, CY - 110), (CX, CY - 340)]), PS([(CX - 130, CY - 230), (CX + 130, CY - 230)])])
    G[0x2642] = R([circ(CX - 40, CY - 40, 190), PS([(CX + 95, CY + 95), (CX + 280, CY + 280)]),
                   PS([(CX + 120, CY + 290), (CX + 290, CY + 290), (CX + 290, CY + 120)])])
    G[0x221E] = R([PS(arc(CX - 150, CY, 150, 120, -90, 270, 15)[:-1] + arc(CX + 150, CY, 150, 120, 270, -90, 15)), ] if False else
                  [PS(arc(CX - 140, CY, 140, 130, 0, 360, 15), True), PS(arc(CX + 140, CY, 140, 130, 180, -180, 15), True)])
    # tick marks / bullets
    G[0x2020] = R([PS([(CX, CY + 330), (CX, CY - 330)]), PS([(CX - 160, CY + 150), (CX + 160, CY + 150)])], 700)
    G[0x2021] = R([PS([(CX, CY + 330), (CX, CY - 330)]), PS([(CX - 160, CY + 190), (CX + 160, CY + 190)]),
                   PS([(CX - 160, CY - 130), (CX + 160, CY - 130)])], 700)
    G[0x00B6] = R([PS([(CX + 140, CY + 340), (CX + 140, CY - 340)]), PS([(CX - 40, CY + 340), (CX - 40, CY - 340)]),
                   PS([(CX + 140, CY + 340), (CX - 120, CY + 340)] + arc(CX - 120, CY + 195, 0, 145, 270, 90)[0:0]) ], 700) \
        if False else R([PS([(CX + 140, CY + 330), (CX + 140, CY - 330)]), PS([(CX - 20, CY + 330), (CX - 20, CY - 330)]),
                        PS([(CX + 140, CY + 330), (CX - 60, CY + 330)] + arc(-60 + CX - CX + 0, CY + 330, 0, 0, 0, 0)[0:0]),
                        circ(CX - 60, CY + 190, 140, 140, 16)], 700)
    G[0x00A7] = R([PS(arc(CX, CY + 160, 160, 130, 20, 270, 12) + arc(CX, CY - 110, 160, 130, 90, -160, 12)[1:])], 700)
    return G
