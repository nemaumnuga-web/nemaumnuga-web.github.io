FAMILY = "Nemaum"            # working name (ASCII, used for file/PS names)
FAMILY_KO = "네마음체"
VERSION = "0.1.0"
UPM = 1000
ASCENDER, DESCENDER, LINEGAP = 1100, -300, 0   # default line height 1.4 em

# variable-axis ranges
WGHT = (100, 400, 900)       # min, default, max
OPSZ = (12, 12, 72)
WDTH = (80, 100, 125)

# half stroke width at the extremes
HW_MIN, HW_MAX = 11.0, 54.0


def hw_for(wght, opsz):
    base = HW_MIN + (wght - WGHT[0]) * (HW_MAX - HW_MIN) / (WGHT[2] - WGHT[0])
    t = (opsz - OPSZ[0]) / float(OPSZ[2] - OPSZ[0])
    return base * (1.0 - 0.12 * t), t
