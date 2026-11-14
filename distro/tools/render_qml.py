#!/usr/bin/env python3
"""Render a QML file to PNG off-screen (no GPU or display needed).

    python3 tools/render_qml.py Splash.qml out.png 1920x1080 [--prop stage=4] [--wait 1500]
    python3 tools/render_qml.py Logo.qml logo.png 256x256 --prop size=256 --transparent

Used for the splash preview, logo PNGs and tests. Needs PyQt6.
"""
import argparse
import os
import sys

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PyQt6.QtCore import QSize, QTimer, QUrl  # noqa: E402
from PyQt6.QtGui import QColor, QGuiApplication  # noqa: E402
from PyQt6.QtQuick import QQuickView, QQuickWindow, QSGRendererInterface  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("qml")
    ap.add_argument("out")
    ap.add_argument("size", help="WIDTHxHEIGHT")
    ap.add_argument("--prop", action="append", default=[], help="name=value set on the root item")
    ap.add_argument("--wait", type=int, default=1200, help="ms to let animations settle")
    ap.add_argument("--transparent", action="store_true")
    a = ap.parse_args()

    QQuickWindow.setGraphicsApi(QSGRendererInterface.GraphicsApi.Software)
    app = QGuiApplication(sys.argv[:1])
    view = QQuickView()
    if a.transparent:
        view.setColor(QColor(0, 0, 0, 0))
    view.setResizeMode(QQuickView.ResizeMode.SizeRootObjectToView)
    w, h = (int(v) for v in a.size.lower().split("x"))
    view.resize(QSize(w, h))
    view.setSource(QUrl.fromLocalFile(os.path.abspath(a.qml)))
    if view.status() != QQuickView.Status.Ready:
        for e in view.errors():
            print(e.toString(), file=sys.stderr)
        return 1
    root = view.rootObject()
    for p in a.prop:
        k, v = p.split("=", 1)
        root.setProperty(k, float(v) if v.replace(".", "", 1).isdigit() else v)
    view.show()

    def shoot():
        img = view.grabWindow()
        ok = img.save(a.out)
        print(("saved " if ok else "FAILED ") + a.out)
        app.exit(0 if ok else 1)
    QTimer.singleShot(a.wait, shoot)
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
