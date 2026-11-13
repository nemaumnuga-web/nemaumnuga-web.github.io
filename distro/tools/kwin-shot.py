#!/usr/bin/python3
"""Test helper for headless Plasma sessions (used by desktop-screenshot.sh).

    kwin-shot.py shot OUT.png     save the whole workspace via KWin's ScreenShot2
    kwin-shot.py panels           print each panel's settings and widgets

KWin must run with KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1 for `shot`, since
this script is not a desktop app KWin would otherwise authorise.
"""
import os
import sys

import dbus
from PyQt6.QtGui import QImage

PANEL_SCRIPT = r"""
var ps = panels();
for (var i = 0; i < ps.length; ++i) {
    var p = ps[i];
    var ws = p.widgets();
    var names = [];
    for (var j = 0; j < ws.length; ++j) names.push(ws[j].type);
    print("panel location=" + p.location + " height=" + p.height + " floating=" + p.floating
          + " lengthMode=" + p.lengthMode + " alignment=" + p.alignment + " hiding=" + p.hiding
          + " widgets=" + names.join(","));
}
var ds = desktops();
for (var k = 0; k < ds.length; ++k) {
    ds[k].currentConfigGroup = ["Wallpaper", "org.kde.image", "General"];
    print("wallpaper=" + ds[k].readConfig("Image"));
}
"""


def shot(path):
    bus = dbus.SessionBus()
    iface = dbus.Interface(bus.get_object("org.kde.KWin", "/org/kde/KWin/ScreenShot2"),
                           "org.kde.KWin.ScreenShot2")
    r, w = os.pipe()
    meta = iface.CaptureWorkspace({"include-cursor": False, "native-resolution": True},
                                  dbus.types.UnixFd(w))
    os.close(w)
    chunks = []
    with os.fdopen(r, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            chunks.append(chunk)
    data = b"".join(chunks)
    img = QImage(data, int(meta["width"]), int(meta["height"]), int(meta["stride"]),
                 QImage.Format(int(meta["format"])))
    if not img.copy().save(path):
        sys.exit("could not save " + path)
    print("saved", path, meta["width"], "x", meta["height"])


def panels():
    bus = dbus.SessionBus()
    shell = dbus.Interface(bus.get_object("org.kde.plasmashell", "/PlasmaShell"),
                           "org.kde.PlasmaShell")
    print(shell.evaluateScript(PANEL_SCRIPT))


if __name__ == "__main__":
    if sys.argv[1:2] == ["shot"]:
        shot(sys.argv[2])
    elif sys.argv[1:2] == ["panels"]:
        panels()
    else:
        sys.exit(__doc__)
