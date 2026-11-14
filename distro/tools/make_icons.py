#!/usr/bin/env python3
"""Generate the "Nuri" icon theme: rounded-square ("squircle") app icons with
soft gradients, a top gloss and a drop shadow, plus folders and drives.

    python3 tools/make_icons.py            # writes system_files/usr/share/icons/Nuri

Every icon is original geometry drawn here (no third-party icon set).
Anything not drawn here falls back to Breeze through index.theme `Inherits`.
"""
import math
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "system_files/usr/share/icons/Nuri"

# ------------------------------------------------------------------ helpers

def squircle(x, y, w, h, n=5.0, steps=96):
    """Superellipse |x|^n + |y|^n = 1 as a closed path (smooth at every size)."""
    cx, cy, a, b = x + w / 2, y + h / 2, w / 2, h / 2
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        px = cx + a * math.copysign(abs(c) ** (2 / n), c)
        py = cy + b * math.copysign(abs(s) ** (2 / n), s)
        pts.append("%.2f %.2f" % (px, py))
    return "M" + " L".join(pts) + "Z"


TILE = squircle(10, 8, 108, 108)
TILE_SH1 = squircle(10, 11, 108, 108)
TILE_SH2 = squircle(9, 9.5, 110, 110)


def lg(gid, c1, c2, x1=0, y1=0, x2=0, y2=1, o1=1, o2=1, mid=None):
    stops = '<stop offset="0" stop-color="%s" stop-opacity="%s"/>' % (c1, o1)
    if mid:
        stops += '<stop offset="%s" stop-color="%s"/>' % mid
    stops += '<stop offset="1" stop-color="%s" stop-opacity="%s"/>' % (c2, o2)
    return ('<linearGradient id="%s" x1="%s" y1="%s" x2="%s" y2="%s">%s</linearGradient>'
            % (gid, x1, y1, x2, y2, stops))


def svg(defs, body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">'
            "<defs>%s</defs>%s</svg>\n" % (defs, body))


def app(c1, c2, glyph, extra_defs="", mid=None):
    """A squircle tile: shadow, gradient fill, gloss, rim light, then the glyph."""
    defs = (lg("bg", c1, c2, mid=mid)
            + lg("gloss", "#ffffff", "#ffffff", o1=0.30, o2=0)
            + lg("rim", "#ffffff", "#ffffff", o1=0.55, o2=0.05)
            + extra_defs)
    body = ('<path d="%s" fill="#0b1020" fill-opacity="0.10"/>' % TILE_SH2
            + '<path d="%s" fill="#0b1020" fill-opacity="0.16"/>' % TILE_SH1
            + '<path d="%s" fill="url(#bg)"/>' % TILE
            + '<path d="%s" fill="url(#gloss)" transform="translate(0 0) scale(1 0.55) translate(0 6.5)"/>'
            % TILE
            + '<path d="%s" fill="none" stroke="url(#rim)" stroke-width="1.2" stroke-opacity="0.6"/>' % TILE
            + glyph)
    return svg(defs, body)


def gear(cx, cy, r_out, r_in, teeth, hole):
    pts = []
    for i in range(teeth * 4):
        a = 2 * math.pi * i / (teeth * 4) - math.pi / 2
        r = r_out if i % 4 in (1, 2) else r_in
        pts.append("%.2f %.2f" % (cx + r * math.cos(a), cy + r * math.sin(a)))
    ring = ("M%.2f %.2f a%s %s 0 1 0 %s 0 a%s %s 0 1 0 -%s 0z"
            % (cx - hole, cy, hole, hole, 2 * hole, hole, hole, 2 * hole))
    return "M" + " L".join(pts) + "Z " + ring


# ------------------------------------------------------------------ app icons
W = "#ffffff"
ICONS = {}

ICONS["files"] = (["system-file-manager", "org.kde.dolphin"], app(
    "#5cb8ff", "#1f6fe5",
    '<path d="M30 42a5 5 0 0 1 5-5h18c1.6 0 2.9.7 3.9 1.9l3.6 4.1H93a5 5 0 0 1 5 5v40a5 5 0 0 1-5 5H35a5 5 0 0 1-5-5z" fill="#cfe4ff"/>'
    '<path d="M27 56a5 5 0 0 1 5-5h64a5 5 0 0 1 5 5v33a7 7 0 0 1-7 7H34a7 7 0 0 1-7-7z" fill="url(#fr)"/>'
    '<path d="M50 72c4 5 24 5 28 0" fill="none" stroke="#2f7fe8" stroke-width="4.5" stroke-linecap="round" stroke-opacity=".55"/>',
    lg("fr", "#ffffff", "#e3efff")))

ICONS["terminal"] = (["utilities-terminal", "org.kde.konsole", "konsole"], app(
    "#454857", "#14151b",
    '<path d="M24 36a6 6 0 0 1 6-6h68a6 6 0 0 1 6 6v6H24z" fill="#ffffff" fill-opacity=".08"/>'
    '<path d="M38 52l15 13-15 13" fill="none" stroke="#eef0f7" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'
    '<path d="M60 82h26" stroke="#5eead4" stroke-width="7" stroke-linecap="round"/>'))

ICONS["settings"] = (["preferences-system", "systemsettings", "preferences-system-windows"], app(
    "#c4c8d4", "#7a8193",
    '<path d="%s" fill="#3d4352" fill-opacity=".25" transform="translate(0 2.5)" fill-rule="evenodd"/>'
    % gear(64, 62, 37, 30, 12, 13)
    + '<path d="%s" fill="url(#gr)" fill-rule="evenodd"/>' % gear(64, 62, 37, 30, 12, 13)
    + '<circle cx="64" cy="62" r="20" fill="none" stroke="#7a8193" stroke-width="3" stroke-opacity=".5"/>',
    lg("gr", "#ffffff", "#d7dbe5")))

ICONS["store"] = (["plasma-discover", "org.kde.discover", "system-software-install"], app(
    "#4cc9f8", "#2a5cf0",
    '<path d="M50 52v-6a14 14 0 0 1 28 0v6" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>'
    '<path d="M36 50h56l-4 40a7 7 0 0 1-7 6H47a7 7 0 0 1-7-6z" fill="url(#bag)"/>'
    '<path d="M64 60c.9 7 3.3 9.4 10.4 10.3-7.1.9-9.5 3.3-10.4 10.4-.9-7.1-3.3-9.5-10.4-10.4 7.1-.9 9.5-3.3 10.4-10.3z" fill="#3b6ff0"/>',
    lg("bag", "#ffffff", "#e2ebff")))

ICONS["update"] = (["system-software-update", "update-none", "org.kde.discover.notifier"], app(
    "#5be38f", "#14a24a",
    '<path d="M42 58a23 23 0 0 1 40-11" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/>'
    '<path d="M86 34v16H70z" fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>'
    '<path d="M86 70a23 23 0 0 1-40 11" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/>'
    '<path d="M42 94V78h16z" fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>'))

ICONS["editor"] = (["accessories-text-editor", "org.kde.kate", "org.kde.kwrite", "kate", "kwrite"], app(
    "#ffffff", "#e8eaf2",
    '<path d="M34 40h52M34 54h60M34 68h44M34 82h30" stroke="#c2c7d6" stroke-width="5" stroke-linecap="round"/>'
    '<g transform="rotate(45 78 76)">'
    '<rect x="70" y="40" width="16" height="44" rx="2" fill="#f7a823"/>'
    '<rect x="70" y="40" width="8" height="44" rx="2" fill="#ffc24d"/>'
    '<rect x="70" y="34" width="16" height="9" rx="3" fill="#f2849b"/>'
    '<path d="M70 84h16l-8 14z" fill="#f6dcb0"/><path d="M75.5 93.5h5L78 98z" fill="#3b3f4c"/></g>'))

ICONS["viewer"] = (["okular", "org.kde.okular", "application-pdf-viewer"], app(
    "#ff7d91", "#df1f4a",
    '<path d="M40 30h32l18 18v48a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6V36a6 6 0 0 1 6-6z" fill="#ffffff"/>'
    '<path d="M72 30v12a6 6 0 0 0 6 6h12z" fill="#ffd2da"/>'
    '<path d="M44 62h34M44 72h34M44 82h22" stroke="#ff9aab" stroke-width="5" stroke-linecap="round"/>'))

ICONS["photos"] = (["org.kde.gwenview", "gwenview", "multimedia-photo-viewer", "image-viewer"], app(
    "#7cc8ff", "#9b7cf6",
    '<circle cx="84" cy="44" r="10" fill="#ffe066"/>'
    '<path d="M16 102 48 62l16 20 12-14 34 34z" fill="#e3e8ff" fill-opacity=".85"/>'
    '<path d="M22 112 52 76l14 16 10-8 30 28z" fill="#ffffff"/>'))

ICONS["calculator"] = (["accessories-calculator", "org.kde.kcalc", "kcalc"], app(
    "#4a4a54", "#17171b",
    "".join('<circle cx="%d" cy="%d" r="7.2" fill="%s"/>'
            % (38 + 17.3 * c, 40 + 16 * r,
               "#ff9f1a" if c == 3 else ("#b4b4bd" if r == 0 else "#5d5d68"))
            for r in range(5) for c in range(4))))

ICONS["archive"] = (["org.kde.ark", "ark", "utilities-file-archiver", "package-x-generic"], app(
    "#e0b47a", "#9a5b13",
    '<path d="M32 50h64v38a7 7 0 0 1-7 7H39a7 7 0 0 1-7-7z" fill="#fff4dc"/>'
    '<rect x="28" y="36" width="72" height="16" rx="5" fill="#fffaf0"/>'
    + "".join('<rect x="60" y="%d" width="8" height="4" rx="1" fill="#9a5b13" fill-opacity=".75"/>' % y
              for y in range(38, 78, 7))
    + '<rect x="58" y="76" width="12" height="12" rx="3" fill="#9a5b13" fill-opacity=".8"/>'))

ICONS["screenshot"] = (["org.kde.spectacle", "spectacle", "applets-screenshooter", "accessories-screenshot"], app(
    "#9aa8bd", "#3f4b60",
    '<path d="M30 46V38a8 8 0 0 1 8-8h8M82 30h8a8 8 0 0 1 8 8v8M98 78v8a8 8 0 0 1-8 8h-8M46 94h-8a8 8 0 0 1-8-8v-8" '
    'fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>'
    '<circle cx="64" cy="62" r="15" fill="none" stroke="#fff" stroke-width="6"/>'
    '<circle cx="64" cy="62" r="5" fill="#fff"/>'))

ICONS["monitor"] = (["org.kde.plasma-systemmonitor", "utilities-system-monitor", "ksysguard"], app(
    "#26324a", "#0b111d",
    '<path d="M24 46h80M24 62h80M24 78h80" stroke="#ffffff" stroke-opacity=".07" stroke-width="2"/>'
    '<path d="M22 84 38 74l12 10 14-30 12 18 12-24 18 14V98H22z" fill="url(#gfill)"/>'
    '<path d="M22 84 38 74l12 10 14-30 12 18 12-24 18 14" fill="none" stroke="#3ee6a6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
    lg("gfill", "#3ee6a6", "#3ee6a6", o1=0.35, o2=0)))

ICONS["help"] = (["help-browser", "org.kde.khelpcenter", "khelpcenter", "help-contents"], app(
    "#69b0ff", "#4b45e0",
    '<path d="M51 50a13 13 0 1 1 20 11c-4.5 3-7 5.5-7 11v2" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>'
    '<circle cx="64" cy="88" r="5.5" fill="#fff"/>'))

ICONS["info"] = (["org.kde.kinfocenter", "kinfocenter", "hwinfo", "dialog-information-app"], app(
    "#a9b8ff", "#5a5ce8",
    '<circle cx="64" cy="40" r="7" fill="#fff"/><rect x="57" y="54" width="14" height="40" rx="7" fill="#fff"/>'))

SPARK = ('<path d="M64 30c3 22 12 31 34 34-22 3-31 12-34 34-3-22-12-31-34-34 22-3 31-12 34-34z" fill="#fff"/>'
         '<path d="M92 26c1 6.4 3.6 9 10 10-6.4 1-9 3.6-10 10-1-6.4-3.6-9-10-10 6.4-1 9-3.6 10-10z" fill="#fff" fill-opacity=".85"/>')
NURI = ("#6d7bff", "#e46fb3", ("0.55", "#8f5cf6"))

ICONS["nuri"] = (["nuri-assistant", "start-here", "start-here-kde", "start-here-kde-plasma"],
                 app(NURI[0], NURI[1], SPARK, mid=NURI[2]))

ICONS["welcome"] = (["nuri-welcome", "org.kde.plasma-welcome"], app(
    "#ffb36b", "#f0568a",
    '<path d="M64 98s-30-17-30-38a16 16 0 0 1 30-8 16 16 0 0 1 30 8c0 21-30 38-30 38z" fill="#fff"/>'
    '<path d="M64 52c1.4 9 5 12.6 14 14-9 1.4-12.6 5-14 14-1.4-9-5-12.6-14-14 9-1.4 12.6-5 14-14z" fill="#f47a7e"/>'))

ICONS["windows-apps"] = (["nuri-windows-apps"], app(
    "#7dd3fc", "#2563eb",
    '<rect x="30" y="32" width="68" height="54" rx="8" fill="#fff"/>'
    '<rect x="30" y="32" width="68" height="12" rx="6" fill="#dbeafe"/>'
    '<rect x="38" y="52" width="13" height="12" rx="2" fill="#3b82f6"/><rect x="54" y="52" width="13" height="12" rx="2" fill="#3b82f6"/>'
    '<rect x="38" y="67" width="13" height="12" rx="2" fill="#3b82f6"/><rect x="54" y="67" width="13" height="12" rx="2" fill="#3b82f6"/>'
    '<path d="M76 58h14M76 66h14M76 74h9" stroke="#93c5fd" stroke-width="4" stroke-linecap="round"/>'
    '<path d="M56 94h16" stroke="#fff" stroke-width="5" stroke-linecap="round"/>'))

# Trash: a frosted glass bin (no tile), like a real object on the dock.
def trash(full):
    ribs = "".join('<path d="M%d 50l%s 50" stroke="#8b93a7" stroke-opacity=".45" stroke-width="2.4" stroke-linecap="round"/>'
                   % (x, d) for x, d in ((48, "1.6"), (64, "0"), (80, "-1.6")))
    papers = ('<path d="M44 46c-3-10 6-18 14-14 5-8 17-6 18 2 9-2 14 8 8 14z" fill="#ffffff" stroke="#c9cfdb" stroke-width="1.5"/>'
              '<path d="M54 42l10-4M64 44l10-3" stroke="#c9cfdb" stroke-width="1.5"/>') if full else ""
    return svg(lg("bin", "#ffffff", "#d9dee9", o1=0.95, o2=0.9) + lg("lid", "#ffffff", "#e3e7ef"),
               '<ellipse cx="64" cy="112" rx="32" ry="5" fill="#0b1020" fill-opacity=".14"/>'
               '<path d="M32 46h64l-6 58a8 8 0 0 1-8 7H46a8 8 0 0 1-8-7z" fill="url(#bin)" stroke="#9aa2b5" stroke-width="1.5"/>'
               + ribs + papers
               + '<rect x="26" y="38" width="76" height="11" rx="5.5" fill="url(#lid)" stroke="#9aa2b5" stroke-width="1.5"/>')

TRASH = {"user-trash": trash(False), "user-trash-full": trash(True)}

# ------------------------------------------------------------------ folders
FOLDER_BACK = "M16 28a6 6 0 0 1 6-6h26c2 0 3.6.8 4.8 2.3l4.6 5.7H106a6 6 0 0 1 6 6v62a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6z"
FOLDER_FRONT = "M12 46a6 6 0 0 1 6-6h92a6 6 0 0 1 6 6v50a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8z"
EMB = 'fill="none" stroke="#2f86dc" stroke-opacity=".55" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"'
EMB_F = 'fill="#2f86dc" fill-opacity=".55"'

EMBLEMS = {
    "folder": ["folder", "folder-blue", "inode-directory", "folder-open", "folder-blue-open"],
    "doc": ["folder-documents", "folder-text"],
    "down": ["folder-download", "folder-downloads"],
    "pic": ["folder-pictures", "folder-images", "folder-image"],
    "music": ["folder-music", "folder-sound"],
    "video": ["folder-videos", "folder-video"],
    "desktop": ["folder-desktop", "user-desktop"],
    "home": ["user-home", "folder-home"],
    "tmpl": ["folder-templates"],
    "public": ["folder-public", "folder-publicshare"],
    "cloud": ["folder-cloud"],
}
GLYPHS = {
    "folder": "",
    "doc": '<path d="M54 60h14l8 8v20H54z" %s/>' % EMB,
    "down": '<path d="M64 58v26M54 76l10 10 10-10" %s/>' % EMB,
    "pic": '<rect x="48" y="60" width="32" height="26" rx="4" %s/><path d="M50 84l10-10 8 8 4-4 8 6" %s/>' % (EMB, EMB),
    "music": '<path d="M58 86V62l20-4v24" %s/><circle cx="54" cy="86" r="5" %s/><circle cx="74" cy="82" r="5" %s/>' % (EMB, EMB_F, EMB_F),
    "video": '<rect x="46" y="62" width="36" height="24" rx="4" %s/><path d="M60 68v12l10-6z" %s/>' % (EMB, EMB_F),
    "desktop": '<rect x="46" y="60" width="36" height="22" rx="3" %s/><path d="M58 90h12" %s/>' % (EMB, EMB),
    "home": '<path d="M48 72l16-13 16 13M52 70v18h24V70" %s/>' % EMB,
    "tmpl": '<rect x="50" y="60" width="28" height="28" rx="3" %s/><path d="M56 68h16M56 76h16M56 84h8" %s/>' % (EMB, EMB),
    "public": '<circle cx="64" cy="66" r="6" %s/><path d="M52 90c0-7 5-11 12-11s12 4 12 11" %s/>' % (EMB, EMB),
    "cloud": '<path d="M54 86h22a8 8 0 0 0 0-16 11 11 0 0 0-21-2 9 9 0 0 0-1 18z" %s/>' % EMB,
}


def folder(kind):
    defs = (lg("back", "#5eaaf2", "#3a8de0") + lg("front", "#a6d6fd", "#6bb4f4")
            + lg("edge", "#ffffff", "#ffffff", o1=0.75, o2=0))
    body = ('<path d="%s" fill="#0b1020" fill-opacity=".12" transform="translate(0 2.5)"/>' % FOLDER_FRONT
            + '<path d="%s" fill="url(#back)"/>' % FOLDER_BACK
            + '<rect x="20" y="34" width="88" height="20" rx="3" fill="#ffffff" fill-opacity=".9"/>'
            + '<path d="%s" fill="url(#front)"/>' % FOLDER_FRONT
            + '<path d="M18 41h92" stroke="url(#edge)" stroke-width="2" stroke-linecap="round"/>'
            + GLYPHS[kind])
    return svg(defs, body)


def drive(usb):
    accent = "#f59e0b" if usb else "#34d399"
    return svg(lg("al", "#f4f5f8", "#b9bec9") + lg("face", "#ffffff", "#dfe2e9"),
               '<rect x="16" y="40" width="96" height="54" rx="12" fill="#0b1020" fill-opacity=".14" transform="translate(0 3)"/>'
               '<rect x="16" y="40" width="96" height="54" rx="12" fill="url(#al)"/>'
               '<rect x="20" y="44" width="88" height="30" rx="9" fill="url(#face)"/>'
               + "".join('<rect x="%d" y="80" width="5" height="8" rx="2.5" fill="#8a91a2" fill-opacity=".55"/>' % x
                         for x in range(28, 84, 9))
               + '<circle cx="96" cy="84" r="4" fill="%s"/>' % accent
               + ('<path d="M58 52h12v12H58z" fill="none" stroke="#8a91a2" stroke-width="3"/>' if usb else ""))


DEVICES = {"drive-harddisk": drive(False), "drive-removable-media": drive(True),
           "drive-removable-media-usb": drive(True), "drive-removable-media-usb-pendrive": drive(True)}

INDEX = """[Icon Theme]
Name=Nuri
Comment=Nuri OS icons: rounded app tiles and folders (falls back to Breeze)
Inherits=breeze,hicolor
Example=folder
DisplayDepth=32
Directories=scalable/apps,scalable/places,scalable/devices

[scalable/apps]
Size=128
MinSize=8
MaxSize=512
Type=Scalable
Context=Applications

[scalable/places]
Size=128
MinSize=8
MaxSize=512
Type=Scalable
Context=Places

[scalable/devices]
Size=128
MinSize=8
MaxSize=512
Type=Scalable
Context=Devices
"""


def write(sub, names, data):
    d = OUT / "scalable" / sub
    d.mkdir(parents=True, exist_ok=True)
    first = d / (names[0] + ".svg")
    first.write_text(data)
    for n in names[1:]:
        # aliases are real copies: symlinks can be lost when the tree is copied around
        shutil.copyfile(first, d / (n + ".svg"))


def all_icons():
    """(context dir, [names], svg) for every icon, in contact-sheet order."""
    out = [("apps", names, data) for names, data in ICONS.values()]
    out += [("places", [n], d) for n, d in TRASH.items()]
    out += [("places", names, folder(k)) for k, names in EMBLEMS.items()]
    out += [("devices", [n], d) for n, d in DEVICES.items()]
    return out


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    (OUT / "index.theme").write_text(INDEX)
    n = 0
    for sub, names, data in all_icons():
        write(sub, names, data)
        n += len(names)
    print("wrote %d icon files to %s" % (n, OUT))


if __name__ == "__main__":
    main()
