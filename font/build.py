#!/usr/bin/env python3
"""Build the Nemaum font family: variable TTF + static TTF/OTF/WOFF/WOFF2 + web subsets.

usage:  python3 build.py [--sample] [--no-static] [--out dist]
"""
import argparse, os, sys, time, shutil
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "src"))

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.designspaceLib import (DesignSpaceDocument, AxisDescriptor,
                                      SourceDescriptor, InstanceDescriptor)
from fontTools import varLib
from fontTools.varLib import instancer
from fontTools.ttLib import TTFont, newTable

import config as C
import glyphset
import geom
import latin as lt
from geom import render, P as PS

STYLES = {100: "Thin", 300: "Light", 400: "Regular", 700: "Bold", 900: "Black"}


def gname(cp):
    return "uni%04X" % cp if cp <= 0xFFFF else "u%05X" % cp


def notdef(P):
    st = [PS([(30, 0), (30, 730), (470, 730), (470, 0)], True)]
    return render(st, P.hw * 0.7), 560


def build_master(wght, wdth, opsz, path, recipes, names):
    hw, t = C.hw_for(wght, opsz)
    f = wdth / 100.0
    geom.WSCALE = f
    P = SimpleNamespace(hw=hw, t=t, wght=wght, opsz=opsz, wdth=wdth, f=f)
    order = [".notdef"]
    cmap = {}
    glyphs, metrics = {}, {}

    def add(name, contours, adv):
        pen = TTGlyphPen(None)
        xs = []
        for c in contours:
            pts = [(int(round(x)), int(round(y))) for x, y in c]
            pen.moveTo(pts[0])
            for p in pts[1:]:
                pen.lineTo(p)
            pen.closePath()
            xs += [p[0] for p in pts]
        g = pen.glyph()
        if g.numberOfContours > 0:
            g.flags[0] |= 0x40  # OVERLAP_SIMPLE
        glyphs[name] = g
        metrics[name] = (int(round(adv)), min(xs) if xs else 0)

    c, a = notdef(P)
    add(".notdef", c, a * f)
    for cp in sorted(k for k in recipes if isinstance(k, int)):
        n = gname(cp)
        order.append(n)
        cmap[cp] = n
        c, a = recipes[cp](P)
        add(n, c, a * f)
    for n in sorted(k for k in recipes if isinstance(k, str)):  # alternates without a cmap entry
        order.append(n)
        c, a = recipes[n](P)
        add(n, c, a * f)
    geom.WSCALE = 1.0

    fb = FontBuilder(C.UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=C.ASCENDER, descent=C.DESCENDER, lineGap=C.LINEGAP)
    setup_common(fb, names, wght)
    fb.save(path)


def setup_common(fb, names, wght):
    fb.setupNameTable(names)
    fb.setupOS2(version=4, sTypoAscender=C.ASCENDER, sTypoDescender=C.DESCENDER, sTypoLineGap=C.LINEGAP,
                usWinAscent=1000, usWinDescent=300, usWeightClass=int(wght),
                sxHeight=int(lt.XH * lt.SY), sCapHeight=int(lt.CAP * lt.SY), achVendID="NEMA",
                fsSelection=(1 << 6) | (1 << 7))
    fb.setupPost(keepGlyphNames=False)
    gasp = newTable("gasp")
    gasp.version = 1
    gasp.gaspRange = {0xFFFF: 0x000F}
    fb.font["gasp"] = gasp
    fb.font["head"].fontRevision = float(C.VERSION.rsplit(".", 1)[0])


def family_names(style, family=None):
    fam = family or C.FAMILY
    return {"familyName": fam, "styleName": style,
            "uniqueFontIdentifier": "%s-%s;%s" % (fam, style, C.VERSION),
            "fullName": "%s %s" % (fam, style), "psName": "%s-%s" % (fam.replace(" ", ""), style),
            "version": "Version " + C.VERSION}


def build_variable(recipes, work):
    doc = DesignSpaceDocument()
    for tag, name, rng in (("wght", "Weight", C.WGHT), ("wdth", "Width", C.WDTH), ("opsz", "Optical Size", C.OPSZ)):
        ax = AxisDescriptor()
        ax.tag, ax.name = tag, name.lower().replace(" ", "")
        ax.minimum, ax.default, ax.maximum = rng
        doc.addAxis(ax)
    masters = [(w, d, o) for w in (100, 400, 900) for d in (80, 100, 125) for o in (12, 72)]  # full grid: the width/weight/size terms interact
    for w, d, o in masters:
        p = os.path.join(work, "master-%d-%d-%d.ttf" % (w, d, o))
        t0 = time.time()
        build_master(w, d, o, p, recipes, family_names("Master %d %d %d" % (w, d, o)))
        print("  master wght=%d wdth=%d opsz=%d  (%.1fs)" % (w, d, o, time.time() - t0), flush=True)
        s = SourceDescriptor()
        s.path = p
        s.location = {"weight": w, "width": d, "opticalsize": o}
        s.familyName, s.styleName = C.FAMILY, "Master"
        doc.addSource(s)
    for w, name in STYLES.items():
        i = InstanceDescriptor()
        i.familyName, i.styleName = C.FAMILY, name
        i.location = {"weight": w, "width": 100, "opticalsize": 12}
        doc.addInstance(i)
    dsp = os.path.join(work, "Nemaum.designspace")
    doc.write(dsp)
    t0 = time.time()
    vf, _, _ = varLib.build(dsp, master_finder=lambda s: s)
    print("  varLib merged (%.1fs)" % (time.time() - t0), flush=True)
    # OpenType features: tabular figures
    from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
    order = vf.getGlyphOrder()
    cmap_ = vf.getBestCmap()
    tf_names = order[-10:]  # the ten uniXXXX.tf alternates are always the last glyphs
    digits = "0123456789"
    fea = ("languagesystem DFLT dflt;\nlanguagesystem latn dflt;\nlanguagesystem hang dflt;\n"
           "feature tnum {\n" + "\n".join("  sub %s by %s;" % (cmap_[ord(d)], tf_names[i]) for i, d in enumerate(digits)) + "\n} tnum;\n")
    addOpenTypeFeaturesFromString(vf, fea)
    # naming of the variable font
    nm = vf["name"]
    for nid, val in ((1, C.FAMILY), (2, "Regular"), (4, C.FAMILY + " Variable"), (6, C.FAMILY + "-VF"),
                     (3, C.FAMILY + "-VF;" + C.VERSION), (5, "Version " + C.VERSION)):
        nm.setName(val, nid, 3, 1, 0x409)
        nm.setName(val, nid, 1, 0, 0)
    return vf


def make_static(vf, wght, opsz, family, wdth=100):
    style = STYLES.get(wght, str(wght))
    f = instancer.instantiateVariableFont(vf, {"wght": wght, "wdth": wdth, "opsz": opsz}, inplace=False,
                                          overlap=instancer.OverlapMode.REMOVE)
    nm = f["name"]
    nm.names = [n for n in nm.names if n.nameID not in (16, 17, 25) and n.nameID < 256]
    fam_style = "Regular"
    for nid, val in ((1, family if style in ("Regular", "Bold") else "%s %s" % (family, style)),
                     (2, style if style in ("Regular", "Bold") else "Regular"),
                     (4, "%s %s" % (family, style)), (6, "%s-%s" % (family.replace(" ", ""), style)),
                     (3, "%s-%s;%s" % (family.replace(" ", ""), style, C.VERSION)),
                     (16, family), (17, style)):
        nm.setName(val, nid, 3, 1, 0x409)
        nm.setName(val, nid, 1, 0, 0)
    os2 = f["OS/2"]
    os2.usWeightClass = int(wght)
    sel = os2.fsSelection & ~((1 << 0) | (1 << 5) | (1 << 6))
    if style == "Bold":
        sel |= 1 << 5
        f["head"].macStyle |= 1
    elif style == "Regular":
        sel |= 1 << 6
    os2.fsSelection = sel | (1 << 7)
    return f


def ttf_to_otf(ttf, path_psname):
    """glyf (line-only, overlaps removed) -> CFF OpenType."""
    from fontTools.pens.t2CharStringPen import T2CharStringPen
    from fontTools.pens.reverseContourPen import ReverseContourPen
    from fontTools.pens.boundsPen import BoundsPen
    gs = ttf.getGlyphSet()
    order = ttf.getGlyphOrder()
    cs, metrics = {}, {}
    for n in order:
        adv = ttf["hmtx"][n][0]
        pen = T2CharStringPen(adv, gs)
        gs[n].draw(ReverseContourPen(pen))
        cs[n] = pen.getCharString()
        bp = BoundsPen(gs)
        gs[n].draw(bp)
        metrics[n] = (adv, int(bp.bounds[0]) if bp.bounds else 0)
    fb = FontBuilder(C.UPM, isTTF=False)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(ttf.getBestCmap())
    fb.setupCFF(path_psname, {"FullName": path_psname, "FamilyName": path_psname.split("-")[0]}, cs, {})
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=C.ASCENDER, descent=C.DESCENDER, lineGap=C.LINEGAP)
    names = {}
    nm = ttf["name"]
    keymap = {1: "familyName", 2: "styleName", 3: "uniqueFontIdentifier", 4: "fullName", 6: "psName",
              5: "version", 16: "typographicFamily", 17: "typographicSubfamily"}
    for n in nm.names:
        if n.platformID == 3 and n.nameID in keymap:
            names[keymap[n.nameID]] = n.toUnicode()
    fb.setupNameTable(names)
    o = ttf["OS/2"]
    fb.setupOS2(version=4, sTypoAscender=C.ASCENDER, sTypoDescender=C.DESCENDER, sTypoLineGap=C.LINEGAP,
                usWinAscent=1000, usWinDescent=300, usWeightClass=o.usWeightClass,
                sxHeight=int(lt.XH * lt.SY), sCapHeight=int(lt.CAP * lt.SY), achVendID="NEMA", fsSelection=o.fsSelection)
    fb.setupPost(keepGlyphNames=False)
    fb.font["head"].macStyle = ttf["head"].macStyle
    if "GSUB" in ttf:
        fb.font["GSUB"] = ttf["GSUB"]
    return fb.font


def save(font, path, flavor=None):
    font.flavor = flavor
    font.save(path)
    print("  %-52s %6.2f MB" % (os.path.relpath(path), os.path.getsize(path) / 1e6), flush=True)


def ks_hangul():
    out = set()
    for hi in range(0xB0, 0xC9):
        for lo in range(0xA1, 0xFF):
            try:
                out.add(ord(bytes([hi, lo]).decode("euc_kr")))
            except UnicodeDecodeError:
                pass
    return out


def web_subsets(vf_path, outdir):
    """Split the variable font into woff2 pieces + a css with unicode-range (loads only what a page uses)."""
    from fontTools import subset
    os.makedirs(outdir, exist_ok=True)
    cm = TTFont(vf_path).getBestCmap()
    hangul = {c for c in cm if 0xAC00 <= c <= 0xD7A3}
    common = ks_hangul() & hangul
    groups = (("symbols", set(cm) - hangul), ("hangul-common", common), ("hangul-rare", hangul - common))

    def rng(cps):
        cps = sorted(cps)
        parts, i = [], 0
        while i < len(cps):
            j = i
            while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
                j += 1
            parts.append("U+%04X" % cps[i] if i == j else "U+%04X-%04X" % (cps[i], cps[j]))
            i = j + 1
        return ", ".join(parts)

    css = ["/* Nemaum variable font, split by unicode-range. */"]
    for name, cps in groups:
        opts = subset.Options()
        opts.layout_features = ["*"]
        opts.notdef_outline = True
        opts.name_IDs = ["*"]
        opts.flavor = "woff2"
        f = TTFont(vf_path)
        ss = subset.Subsetter(opts)
        ss.populate(unicodes=cps)
        ss.subset(f)
        f.flavor = "woff2"
        p = os.path.join(outdir, "Nemaum-VF-%s.woff2" % name)
        f.save(p)
        print("  %-52s %6.2f MB" % (os.path.relpath(p), os.path.getsize(p) / 1e6), flush=True)
        css.append("@font-face {\n  font-family: \"Nemaum VF\";\n  src: url(\"Nemaum-VF-%s.woff2\") format(\"woff2\");\n"
                   "  font-weight: 100 900;\n  font-display: swap;\n  unicode-range: %s;\n}" % (name, rng(cps)))
    with open(os.path.join(outdir, "nemaum.css"), "w") as fh:
        fh.write("\n".join(css) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", action="store_true", help="only every 40th Hangul syllable (fast)")
    ap.add_argument("--no-static", action="store_true")
    ap.add_argument("--out", default="dist")
    a = ap.parse_args()
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, a.out)
    work = os.path.join(here, "_work")
    for d in (out, work):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d)
    recipes = glyphset.collect()
    if a.sample:
        recipes = {cp: f for cp, f in recipes.items()
                   if isinstance(cp, str) or not (0xAC00 <= cp <= 0xD7A3) or (cp - 0xAC00) % 40 == 0}
    print("glyphs:", len(recipes) + 1)
    print("building masters")
    vf = build_variable(recipes, work)
    os.makedirs(os.path.join(out, "variable"))
    save(vf, os.path.join(out, "variable", "Nemaum-VF.ttf"))
    save(TTFont(os.path.join(out, "variable", "Nemaum-VF.ttf")), os.path.join(out, "variable", "Nemaum-VF.woff2"), "woff2")
    print("web subsets")
    web_subsets(os.path.join(out, "variable", "Nemaum-VF.ttf"), os.path.join(out, "web"))
    if a.no_static:
        return
    print("static instances")
    for fam, opsz, folder in ((C.FAMILY, 12, "text"), (C.FAMILY + " Display", 72, "display")):
        for sub in ("ttf", "otf", "woff2", "woff"):
            os.makedirs(os.path.join(out, folder, sub), exist_ok=True)
        for w in (300, 400, 700):
            st = make_static(vf, w, opsz, fam)
            base = "%s-%s" % (fam.replace(" ", ""), STYLES[w])
            save(st, os.path.join(out, folder, "ttf", base + ".ttf"))
            ps = st["name"].getDebugName(6)
            ot = ttf_to_otf(st, ps)
            save(ot, os.path.join(out, folder, "otf", base + ".otf"))
            for fl in ("woff2", "woff"):
                save(TTFont(os.path.join(out, folder, "ttf", base + ".ttf")),
                     os.path.join(out, folder, fl, base + "." + fl), fl)
    for fam, wd, folder in ((C.FAMILY + " Narrow", 80, "narrow"), (C.FAMILY + " Wide", 125, "wide")):
        for sub in ("ttf", "otf", "woff2"):
            os.makedirs(os.path.join(out, folder, sub), exist_ok=True)
        for w in (400, 700):
            st = make_static(vf, w, 12, fam, wd)
            base = "%s-%s" % (fam.replace(" ", ""), STYLES[w])
            save(st, os.path.join(out, folder, "ttf", base + ".ttf"))
            ot = ttf_to_otf(st, st["name"].getDebugName(6))
            save(ot, os.path.join(out, folder, "otf", base + ".otf"))
            save(TTFont(os.path.join(out, folder, "ttf", base + ".ttf")),
                 os.path.join(out, folder, "woff2", base + ".woff2"), "woff2")
    shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
