"""Stroke -> outline geometry.

Every glyph is described as a list of *strokes* (centre-lines).  A stroke is
turned into overlapping rectangles whose point count never depends on the
stroke width, so masters with different widths are point-compatible and can
be interpolated into a variable font.
"""
import math

# ---------------------------------------------------------------- strokes
def P(pts, closed=False, cap=0.0, k=1.0):
    """Poly-line stroke.  cap: how far (in half-widths) open ends overshoot."""
    return ("p", [(float(x), float(y)) for x, y in pts], closed, cap, k)


def D(x, y, r=1.0, k=1.0):
    """Round-ish dot (octagon) of radius r half-widths."""
    return ("d", float(x), float(y), r, k)


def F(pts):
    """Fixed filled polygon (does not depend on weight)."""
    return ("f", [(float(x), float(y)) for x, y in pts])


def H(pts):
    """Fixed hole (counter-clockwise polygon) cut out of overlapping fills."""
    return ("h", [(float(x), float(y)) for x, y in pts])


def arc(cx, cy, rx, ry, a0, a1, step=15.0):
    """Points on an elliptical arc from a0 to a1 degrees (either direction)."""
    n = max(2, int(math.ceil(abs(a1 - a0) / step)))
    out = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        out.append((cx + rx * math.cos(a), cy + ry * math.sin(a)))
    return out


def ring(cx, cy, rx, ry, n=28, rot=90.0):
    return [(cx + rx * math.cos(math.radians(rot + 360.0 * i / n)),
             cy + ry * math.sin(math.radians(rot + 360.0 * i / n))) for i in range(n)]


# ------------------------------------------------- squarish curves (house style)
ROUND_N = 2.5   # superellipse exponent: 2 = ellipse, larger = closer to a rounded rectangle


def _se(t, n):
    c, s = math.cos(t), math.sin(t)
    return (math.copysign(abs(c) ** (2.0 / n), c), math.copysign(abs(s) ** (2.0 / n), s))


def sarc(cx, cy, rx, ry, a0, a1, step=10.0, n=None):
    """Like arc() but on a superellipse: the squarish bowls of the letters."""
    n = n or ROUND_N
    k = max(2, int(math.ceil(abs(a1 - a0) / step)))
    out = []
    for i in range(k + 1):
        x, y = _se(math.radians(a0 + (a1 - a0) * i / k), n)
        out.append((cx + rx * x, cy + ry * y))
    return out


def sring(cx, cy, rx, ry, n=32, rot=90.0, e=None):
    e = e or ROUND_N
    out = []
    for i in range(n):
        x, y = _se(math.radians(rot + 360.0 * i / n), e)
        out.append((cx + rx * x, cy + ry * y))
    return out


def line(a, b, cap=0.0, k=1.0):
    return P([a, b], False, cap, k)


# ---------------------------------------------------------------- render
MAX_MITER = 1.0
ROUND = False  # round style: every stroke is a capsule (round ends and joins)
ROUND_K = 5    # points per half circle of a round end
HCON = 0.9     # horizontal strokes are this much thinner than vertical ones (optical contrast)
WSCALE = 1.0   # horizontal scale of centre-lines (wdth axis); stroke widths are unaffected


def _rect(p0, p1, e0, e1, h, cut0=False, cut1=False):
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dx, dy)
    if L < 1e-6:
        return None
    ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    a = (p0[0] - ux * e0, p0[1] - uy * e0)
    b = (p1[0] + ux * e1, p1[1] + uy * e1)
    pts = [(a[0] + nx * h, a[1] + ny * h), (b[0] + nx * h, b[1] + ny * h),
           (b[0] - nx * h, b[1] - ny * h), (a[0] - nx * h, a[1] - ny * h)]
    diag = min(abs(ux), abs(uy)) > 0.08
    if diag and (cut0 or cut1):
        def flat(c, ref):
            # slide the corner along the stroke until it is level with the stroke end:
            # steep strokes are cut horizontally, shallow ones vertically
            if abs(uy) >= abs(ux):
                t = (ref[1] - c[1]) / uy
            else:
                t = (ref[0] - c[0]) / ux
            return (c[0] + ux * t, c[1] + uy * t)
        if cut0:
            pts[0], pts[3] = flat(pts[0], a), flat(pts[3], a)
        if cut1:
            pts[1], pts[2] = flat(pts[1], b), flat(pts[2], b)
    return pts


def _capsule(p0, p1, h):
    """Segment with round ends; clockwise; fixed point count (interpolation-safe)."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dx, dy)
    if L < 1e-6:
        return None
    th = math.atan2(dx, -dy)  # angle of the left normal n = (-uy, ux)
    pts = []
    for k in range(ROUND_K + 1):   # around p1, from +n through +u to -n
        a = th - math.pi * k / ROUND_K
        pts.append((p1[0] + h * math.cos(a), p1[1] + h * math.sin(a)))
    for k in range(ROUND_K + 1):   # around p0, from -n through -u to +n
        a = th - math.pi - math.pi * k / ROUND_K
        pts.append((p0[0] + h * math.cos(a), p0[1] + h * math.sin(a)))
    return pts


def _turn_ext(pa, pb, pc, h):
    """Extension needed so that the corners of two rects meeting at pb meet."""
    v1 = (pb[0] - pa[0], pb[1] - pa[1])
    v2 = (pc[0] - pb[0], pc[1] - pb[1])
    l1, l2 = math.hypot(*v1), math.hypot(*v2)
    if l1 < 1e-6 or l2 < 1e-6:
        return 0.0
    c = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)
    c = max(-1.0, min(1.0, c))
    phi = math.acos(c)  # turning angle
    if phi > math.radians(100):
        return 0.0  # sharp turn (N, V, W, ㅅ apex): no extension, so no spike pokes out
    return h * min(math.tan(phi / 2.0), MAX_MITER) if phi > 1e-3 else 0.0


def render(strokes, hw):
    """-> list of contours (list of (x, y)), clockwise, overlaps allowed."""
    out = []
    if WSCALE != 1.0:
        strokes = xform(strokes, WSCALE, 1.0)
    for s in strokes:
        t = s[0]
        if t == "p":
            _, pts, closed, cap, k = s
            h = hw * k
            # drop consecutive duplicates (geometry only, weight independent)
            q = [pts[0]]
            for p in pts[1:]:
                if abs(p[0] - q[-1][0]) > 1e-6 or abs(p[1] - q[-1][1]) > 1e-6:
                    q.append(p)
            if closed and len(q) > 1 and abs(q[0][0] - q[-1][0]) < 1e-6 and abs(q[0][1] - q[-1][1]) < 1e-6:
                q.pop()
            n = len(q)
            if n < 2:
                continue
            segs = n if closed else n - 1

            def heff(i):
                a, b = q[i % n], q[(i + 1) % n]
                L = math.hypot(b[0] - a[0], b[1] - a[1])
                uy = abs(b[1] - a[1]) / L if L > 1e-9 else 1.0
                return h * (HCON + (1.0 - HCON) * uy)
            for i in range(segs):
                a, b = q[i], q[(i + 1) % n]
                hi = heff(i)
                # a join is extended by the half-thickness of the *neighbouring* stroke
                if closed:
                    e0 = _turn_ext(q[(i - 1) % n], a, b, heff(i - 1))
                    e1 = _turn_ext(a, b, q[(i + 2) % n], heff(i + 1))
                else:
                    e0 = hi * cap if i == 0 else _turn_ext(q[i - 1], a, b, heff(i - 1))
                    e1 = hi * cap if i == segs - 1 else _turn_ext(a, b, q[i + 2], heff(i + 1))
                if ROUND:
                    r = _capsule(a, b, hi)
                else:
                    r = _rect(a, b, e0, e1, hi, (not closed) and i == 0 and cap == 0.0,
                              (not closed) and i == segs - 1 and cap == 0.0)
                if r:
                    out.append(r)
        elif t == "d":
            _, x, y, r, k = s
            R = hw * k * r
            if ROUND:
                pts = [(x + R * math.cos(-2 * math.pi * i / 12 + math.pi / 2),
                        y + R * math.sin(-2 * math.pi * i / 12 + math.pi / 2)) for i in range(12)]
            else:
                pts = [(x - R, y + R), (x + R, y + R), (x + R, y - R), (x - R, y - R)]  # square dot
            out.append(pts)
        elif t in ("f", "h"):
            pts = s[1]
            a = 0.0
            for i in range(len(pts)):
                x0, y0 = pts[i]
                x1, y1 = pts[(i + 1) % len(pts)]
                a += x0 * y1 - x1 * y0
            cw = a < 0  # negative signed area == clockwise
            want_cw = (t == "f")
            out.append(list(pts) if cw == want_cw else list(reversed(pts)))
    return out


# ---------------------------------------------------------------- utils
def xform(strokes, fx, fy=None, dx=0.0, dy=0.0):
    """Scale (about the origin) then translate every stroke."""
    fy = fx if fy is None else fy
    res = []
    for s in strokes:
        if s[0] == "p":
            res.append(("p", [(x * fx + dx, y * fy + dy) for x, y in s[1]], s[2], s[3], s[4]))
        elif s[0] == "d":
            res.append(("d", s[1] * fx + dx, s[2] * fy + dy, s[3], s[4]))
        else:
            res.append((s[0], [(x * fx + dx, y * fy + dy) for x, y in s[1]]))
    return res


def bounds(strokes):
    xs, ys = [], []
    for s in strokes:
        if s[0] == "p":
            for x, y in s[1]:
                xs.append(x); ys.append(y)
        elif s[0] == "d":
            xs.append(s[1]); ys.append(s[2])
        else:
            for x, y in s[1]:
                xs.append(x); ys.append(y)
    if not xs:
        return (0, 0, 0, 0)
    return (min(xs), min(ys), max(xs), max(ys))


def into_box(strokes, box):
    """Map strokes drawn in the unit square into box=(x0,y0,x1,y1)."""
    x0, y0, x1, y1 = box
    return xform(strokes, x1 - x0, y1 - y0, x0, y0)


def ink_bounds(strokes, hw):
    """Bounds of the filled outline (not the centre-lines), ignoring the wdth scale."""
    global WSCALE
    saved, WSCALE = WSCALE, 1.0
    try:
        cs = render(strokes, hw)
    finally:
        WSCALE = saved
    xs = [x for c in cs for x, y in c]
    ys = [y for c in cs for x, y in c]
    if not xs:
        return None
    return (min(xs), min(ys), max(xs), max(ys))
