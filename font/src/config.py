FAMILY = "Nemaum"            # working name (ASCII, used for file/PS names)
FAMILY_KO = "네마음체"
VERSION = "0.1.0"
UPM = 1000
GLOBAL_SCALE = 0.90   # every glyph (outline and advance) is drawn at this size within the em
ASCENDER, DESCENDER, LINEGAP = 1100, -300, 0   # default line height 1.4 em

# variable-axis ranges
WGHT = (100, 400, 900)       # min, default, max
OPSZ = (12, 12, 72)
WDTH = (80, 100, 125)

# half stroke width at the extremes
HW_MIN, HW_MAX = 11.0, 54.0


# half stroke width at the three weight masters (100 / 400 / 900); between them the
# variable font interpolates linearly, so Regular can be fuller than a straight line
HW_AT = ((100, 12.0), (400, 38.0), (900, 66.0))


def hw_for(wght, opsz):
    (w0, h0), (w1, h1), (w2, h2) = HW_AT
    if wght <= w1:
        base = h0 + (wght - w0) * (h1 - h0) / (w1 - w0)
    else:
        base = h1 + (wght - w1) * (h2 - h1) / (w2 - w1)
    t = (opsz - OPSZ[0]) / float(OPSZ[2] - OPSZ[0])
    return base * (1.0 - 0.12 * t), t
