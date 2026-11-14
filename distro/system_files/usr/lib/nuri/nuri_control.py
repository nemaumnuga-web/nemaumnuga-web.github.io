"""Nuri Control Center and "About this computer".

    nuri-control     quick settings: Wi-Fi, Bluetooth, nearby sharing, dark mode,
                     do not disturb, night light, power mode, brightness, volume,
                     quick actions, live CPU / memory / battery / AI status
    nuri-about       this computer: OS, CPU, memory, graphics, storage, AI model

Settings go through nuri_settings (Plasma's own tools). The toggles remember the
last state chosen here; the system may still change it elsewhere.
"""
import argparse
import json
import os
import sys
from pathlib import Path

from PyQt6.QtCore import QObject, QTimer, QUrl, pyqtProperty, pyqtSignal, pyqtSlot
from PyQt6.QtGui import QGuiApplication, QIcon
from PyQt6.QtQml import QQmlApplicationEngine
from PyQt6.QtQuick import QQuickWindow, QSGRendererInterface

import nuri_ai as core
import nuri_settings as S
from nuri_assistant import system_dark

QML_DIR = Path(os.environ.get("NURI_QML_DIR", Path(__file__).resolve().parent / "qml"))
STATE = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "nuri/control.json"

TXT = {
    "ko": {
        "title": "제어 센터", "about_title": "이 컴퓨터에 관하여",
        "wifi": "Wi-Fi", "bluetooth": "블루투스", "share": "근처 공유", "dark": "어둡게", "dnd": "방해 금지",
        "night": "야간 모드", "on": "켬", "off": "끔", "power": "전원 모드",
        "saver": "절전", "balanced": "균형", "performance": "성능",
        "display": "디스플레이", "sound": "사운드",
        "ai": "AI 비서", "shot": "화면 캡처", "lock": "잠그기", "settings": "설정",
        "cpu": "CPU", "memory": "메모리", "battery": "배터리", "charging": "충전 중",
        "model": "AI 모델", "no_model": "아직 없음", "local": "이 PC 안에서만",
        "chip": "프로세서", "graphics": "그래픽", "storage": "저장 공간", "base": "기반",
        "cores": "%d코어", "used": "%s 사용 중", "free": "%s 남음",
        "more": "시스템 정보…", "update": "업데이트 확인", "license": "오픈소스 · 비상업 배포 · Apache-2.0",
        "uptime": "켜진 지 %s시간",
    },
    "en": {
        "title": "Control Center", "about_title": "About this computer",
        "wifi": "Wi-Fi", "bluetooth": "Bluetooth", "share": "Nearby share", "dark": "Dark", "dnd": "Do Not Disturb",
        "night": "Night light", "on": "On", "off": "Off", "power": "Power mode",
        "saver": "Saver", "balanced": "Balanced", "performance": "Performance",
        "display": "Display", "sound": "Sound",
        "ai": "Assistant", "shot": "Screenshot", "lock": "Lock", "settings": "Settings",
        "cpu": "CPU", "memory": "Memory", "battery": "Battery", "charging": "Charging",
        "model": "AI model", "no_model": "None yet", "local": "On this PC only",
        "chip": "Processor", "graphics": "Graphics", "storage": "Storage", "base": "Based on",
        "cores": "%d cores", "used": "%s used", "free": "%s free",
        "more": "System details…", "update": "Check for updates", "license": "Open source · non-commercial · Apache-2.0",
        "uptime": "Up %s h",
    },
}
TOGGLES = {"wifi": S.wifi, "bluetooth": S.bluetooth, "dark": S.appearance, "dnd": S.do_not_disturb,
           "night": S.night_light}


def lang_key():
    return core.ui_lang() if core.ui_lang() in TXT else "en"


def gb(v):
    return ("%.0f GB" % v) if v >= 10 else ("%.1f GB" % v)


class Bridge(QObject):
    statsChanged = pyqtSignal()
    stateChanged = pyqtSignal()

    def __init__(self, dark, dry_run=False):
        super().__init__()
        self._dark = dark
        self.runner = S.Runner(dry_run)
        self.dry = dry_run
        try:
            self._state = json.loads(STATE.read_text())
        except (OSError, ValueError):
            self._state = {}
        self._state.setdefault("wifi", True)
        self._state.setdefault("bluetooth", True)
        self._state.setdefault("share", False)
        self._state.setdefault("dark", dark)
        self._state.setdefault("dnd", False)
        self._state.setdefault("night", False)
        self._state.setdefault("power", "balanced")
        self._state.setdefault("brightness", 80)
        self._state.setdefault("volume", 60)
        self._stats = {}
        S.cpu_percent()
        self.refresh()
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.refresh)
        self.timer.start(2000)

    @property
    def log(self):
        return self.runner.log

    # ---------------------------------------------------------- properties
    @pyqtProperty(bool, constant=True)
    def dark(self):
        return self._dark

    @pyqtProperty("QVariantMap", constant=True)
    def t(self):
        return TXT[lang_key()]

    @pyqtProperty("QVariantMap", notify=stateChanged)
    def state(self):
        return self._state

    @pyqtProperty("QVariantMap", notify=statsChanged)
    def stats(self):
        return self._stats

    @pyqtProperty("QVariantMap", constant=True)
    def info(self):
        tr = TXT[lang_key()]
        osi = S.os_info()
        total, used = S.disk()
        mt, _ = S.mem()
        return {
            "name": osi["name"] or "Nuri OS", "version": osi["version"], "base": osi["base"],
            "cpu": S.cpu_model(), "cores": tr["cores"] % S.cpu_count(),
            "memory": gb(mt), "gpu": S.gpu() or "-",
            "disk_total": gb(total), "disk_used": tr["used"] % gb(used),
            "disk_free": tr["free"] % gb(max(0.0, total - used)),
            "disk_frac": (used / total) if total else 0.0,
            "uptime": tr["uptime"] % ("%.0f" % S.uptime_hours()),
        }

    # ---------------------------------------------------------- live stats
    def refresh(self):
        total, used = S.mem()
        bat = S.battery()
        try:
            reg = core.load_registry()
        except SystemExit:
            reg = {"models": []}
        act = core.active_id()
        model = next((m["name"] for m in reg["models"] if m["id"] == act), act or "")
        self._stats = {
            "cpu": round(S.cpu_percent()), "ram_used": round(used, 1), "ram_total": round(total, 1),
            "ram_frac": (used / total) if total else 0.0,
            "battery": bat[0] if bat else -1, "charging": bool(bat and bat[1]),
            "model": model,
        }
        self.statsChanged.emit()

    # ---------------------------------------------------------- actions
    def _save(self):
        self.stateChanged.emit()
        if self.dry:
            return
        try:
            STATE.parent.mkdir(parents=True, exist_ok=True)
            STATE.write_text(json.dumps(self._state))
        except OSError:
            pass

    @pyqtSlot(str, bool)
    def toggle(self, name, on):
        if name == "share":
            if on:
                self.runner.run([S.LAUNCH["localsend"]])
        elif name in TOGGLES:
            self.runner.run(TOGGLES[name](on))
        else:
            return
        self._state[name] = on
        self._save()

    @pyqtSlot(str)
    def setPower(self, name):
        if name in S.POWER_PROFILES:
            self.runner.run(S.power_profile(name))
            self._state["power"] = name
            self._save()

    @pyqtSlot(int)
    def setBrightness(self, pct):
        self.runner.run(S.brightness(pct))
        self._state["brightness"] = int(pct)
        self._save()

    @pyqtSlot(int)
    def setVolume(self, pct):
        self.runner.run(S.volume(pct))
        self._state["volume"] = int(pct)
        self._save()

    @pyqtSlot(str)
    def launch(self, what):
        if what in S.LAUNCH:
            self.runner.run([S.LAUNCH[what]])


def main(argv=None, mode="control"):
    ap = argparse.ArgumentParser(prog="nuri-" + mode)
    ap.add_argument("--theme", choices=["auto", "light", "dark"], default=os.environ.get("NURI_THEME", "auto"))
    ap.add_argument("--screenshot", metavar="PNG", help=argparse.SUPPRESS)
    args = ap.parse_args(argv)
    if args.screenshot or os.environ.get("QT_QPA_PLATFORM") == "offscreen":
        QQuickWindow.setGraphicsApi(QSGRendererInterface.GraphicsApi.Software)
    app = QGuiApplication(sys.argv[:1])
    app.setApplicationName("nuri-" + mode)
    app.setDesktopFileName("nuri-" + mode)
    app.setWindowIcon(QIcon.fromTheme("nuri-" + mode))
    dark = system_dark() if args.theme == "auto" else args.theme == "dark"
    bridge = Bridge(dark, dry_run=bool(args.screenshot) or os.environ.get("NURI_CONTROL_DRY") == "1")
    engine = QQmlApplicationEngine()
    engine.rootContext().setContextProperty("bridge", bridge)
    qml = QML_DIR / ("Control.qml" if mode == "control" else "About.qml")
    engine.load(QUrl.fromLocalFile(str(qml)))
    if not engine.rootObjects():
        print("failed to load " + str(qml), file=sys.stderr)
        return 1
    win = engine.rootObjects()[0]
    win.show()
    if args.screenshot:
        def shoot():
            if not win.grabWindow().save(args.screenshot):
                print("could not save " + args.screenshot, file=sys.stderr)
            app.quit()
        QTimer.singleShot(int(os.environ.get("NURI_SHOT_DELAY", "900")), shoot)
    ret = app.exec()
    del engine
    return ret
