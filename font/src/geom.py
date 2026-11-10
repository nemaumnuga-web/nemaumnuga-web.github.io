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


def line(a, b, cap=0.0, k=1.0):
    return P([a, b], False, cap, k)


# ---------------------------------------------------------------- render
MAX_MITER = 1.0


def _rect(p0, p1, e0, e1, h):
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dx, dy)
    if L < 1e-6:
        return None
    ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    a = (p0[0] - ux * e0, p0[1] - uy * e0)
    b = (p1[0] + ux * e1, p1[1] + uy * e1)
    return [(a[0] + nx * h, a[1] + ny * h), (b[0] + nx * h, b[1] + ny * h),
            (b[0] - nx * h, b[1] - ny * h), (a[0] - nx * h, a[1] - ny * h)]


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
    return h * min(math.tan(phi / 2.0), MAX_MITER) if phi > 1e-3 else 0.0


def render(strokes, hw):
    """-> list of contours (list of (x, y)), clockwise, overlaps allowed."""
    out = []
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
            for i in range(segs):
                a, b = q[i], q[(i + 1) % n]
                if closed:
                    e0 = _turn_ext(q[(i - 1) % n], a, b, h)
                    e1 = _turn_ext(a, b, q[(i + 2) % n], h)
                else:
                    e0 = h * cap if i == 0 else _turn_ext(q[i - 1], a, b, h)
                    e1 = h * cap if i == segs - 1 else _turn_ext(a, b, q[i + 2], h)
                r = _rect(a, b, e0, e1, h)
                if r:
                    out.append(r)
        elif t == "d":
            _, x, y, r, k = s
            R = hw * k * r
            c = 0.4142135623730951 * R  # regular octagon with circumradius ~ R*1.082
            R2 = R * 1.0
            pts = [(x - c, y + R2), (x + c, y + R2), (x + R2, y + c), (x + R2, y - c),
                   (x + c, y - R2), (x - c, y - R2), (x - R2, y - c), (x - R2, y + c)]
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
