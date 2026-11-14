"""Nuri menu: a macOS-style pop-up menu for the desktop and the logo in the menu bar.

    nuri-menu            desktop menu (right click on the wallpaper): ask the AI,
                         open apps, Control Center, settings, about
    nuri-menu --logo     the "Nuri" menu under the logo: about, settings, updates,
                         welcome guide, lock

Rounded, with an icon per item, shortcut hints, and rows tall enough to tap on
a phone or tablet. It closes when an item is picked, on Esc, or when it loses
focus. Items only start commands from nuri_settings.LAUNCH.

The window manager places it: the desktop menu is centred on the cursor, so the
visible menu sits in the bottom-right quarter of a transparent window, which
puts its top-left corner at the pointer, as on a Mac.
"""
import argparse
import os
import sys
from pathlib import Path

from PyQt6.QtCore import QObject, QTimer, QUrl, pyqtProperty, pyqtSlot
from PyQt6.QtGui import QGuiApplication, QIcon
from PyQt6.QtQml import QQmlApplicationEngine
from PyQt6.QtQuick import QQuickWindow, QSGRendererInterface

import nuri_settings as S
from nuri_assistant import system_dark

QML = Path(os.environ.get("NURI_QML_DIR", Path(__file__).resolve().parent / "qml")) / "Menu.qml"
ICON_DIR = "/usr/share/icons/Nuri/scalable"

TXT = {
    "ko": {"ask": "누리 AI에게 묻기", "files": "파일", "terminal": "터미널", "editor": "텍스트 편집기",
           "photos": "사진", "control": "제어 센터", "settings": "시스템 설정", "welcome": "누리 시작 안내",
           "about": "이 컴퓨터에 관하여", "updates": "업데이트 확인…", "lock": "화면 잠그기", "trash": "휴지통 열기"},
    "en": {"ask": "Ask Nuri AI", "files": "Files", "terminal": "Terminal", "editor": "Text Editor",
           "photos": "Photos", "control": "Control Center", "settings": "System Settings",
           "welcome": "Nuri Welcome", "about": "About This Computer", "updates": "Check for Updates…",
           "lock": "Lock Screen", "trash": "Open Trash"},
}

# (launch key, text key, icon, shortcut); None is a separator
DESKTOP = [("assistant", "ask", "apps/nuri-assistant", "Meta+Space"), None,
           ("files", "files", "apps/system-file-manager", "Meta+E"),
           ("terminal", "terminal", "apps/utilities-terminal", "Ctrl+Alt+T"),
           ("editor", "editor", "apps/accessories-text-editor", ""),
           ("photos", "photos", "apps/org.kde.gwenview", ""), None,
           ("control", "control", "apps/nuri-control", "Meta+C"),
           ("settings", "settings", "apps/preferences-system", ""),
           ("trash", "trash", "places/user-trash", ""), None,
           ("welcome", "welcome", "apps/nuri-welcome", ""),
           ("about", "about", "apps/nuri-about", "")]
LOGO = [("about", "about", "apps/nuri-about", ""), None,
        ("settings", "settings", "apps/preferences-system", ""),
        ("control", "control", "apps/nuri-control", "Meta+C"),
        ("updates", "updates", "apps/system-software-update", ""), None,
        ("welcome", "welcome", "apps/nuri-welcome", ""),
        ("assistant", "ask", "apps/nuri-assistant", "Meta+Space"), None,
        ("lock", "lock", "apps/preferences-security", "Meta+L")]


def lang_key():
    lang = os.environ.get("LC_ALL") or os.environ.get("LC_MESSAGES") or os.environ.get("LANG") or ""
    return "ko" if lang.startswith("ko") else "en"


class Bridge(QObject):
    def __init__(self, dark, logo, dry_run=False):
        super().__init__()
        self._dark = dark
        self._logo = logo
        self.runner = S.Runner(dry=dry_run)
        tr = TXT[lang_key()]
        self._items = [{"sep": True} if it is None else
                       {"sep": False, "key": it[0], "text": tr[it[1]], "shortcut": it[3],
                        "icon": "file://%s/%s.svg" % (ICON_DIR, it[2])}
                       for it in (LOGO if logo else DESKTOP)]

    @pyqtProperty(bool, constant=True)
    def dark(self):
        return self._dark

    @pyqtProperty(bool, constant=True)
    def logo(self):
        return self._logo

    @pyqtProperty("QVariantList", constant=True)
    def items(self):
        return self._items

    @pyqtSlot(str)
    def pick(self, key):
        if key in S.LAUNCH:
            self.runner.run([S.LAUNCH[key]])
        if not self.runner.dry:
            QTimer.singleShot(0, QGuiApplication.quit)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="nuri-menu")
    ap.add_argument("--logo", action="store_true", help="the menu under the logo in the menu bar")
    ap.add_argument("--theme", choices=["auto", "light", "dark"], default=os.environ.get("NURI_THEME", "auto"))
    ap.add_argument("--screenshot", metavar="PNG", help=argparse.SUPPRESS)
    ap.add_argument("--hover", type=int, default=-1, help=argparse.SUPPRESS)   # docs/tests
    args = ap.parse_args(argv)
    if args.screenshot or os.environ.get("QT_QPA_PLATFORM") == "offscreen":
        QQuickWindow.setGraphicsApi(QSGRendererInterface.GraphicsApi.Software)
    app = QGuiApplication(sys.argv[:1])
    app_id = "nuri-menu-logo" if args.logo else "nuri-menu"
    app.setApplicationName(app_id)
    app.setDesktopFileName(app_id)
    app.setWindowIcon(QIcon.fromTheme("start-here"))
    dark = system_dark() if args.theme == "auto" else args.theme == "dark"
    bridge = Bridge(dark, args.logo, dry_run=bool(args.screenshot) or os.environ.get("NURI_MENU_DRY") == "1")
    engine = QQmlApplicationEngine()
    engine.rootContext().setContextProperty("bridge", bridge)
    engine.load(QUrl.fromLocalFile(str(QML)))
    if not engine.rootObjects():
        print("failed to load " + str(QML), file=sys.stderr)
        return 1
    win = engine.rootObjects()[0]
    win.setProperty("hovered", args.hover)
    win.setProperty("closeOnBlur", not args.screenshot)
    win.show()
    if args.screenshot:
        def shoot():
            if not win.grabWindow().save(args.screenshot):
                print("could not save " + args.screenshot, file=sys.stderr)
            app.quit()
        QTimer.singleShot(int(os.environ.get("NURI_SHOT_DELAY", "700")), shoot)
    ret = app.exec()
    del engine
    return ret
