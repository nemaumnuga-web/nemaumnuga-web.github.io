"""Nuri Welcome: the first-login setup guide (replaces Fedora's Plasma Welcome).

Pages: hello, AI model for your language, appearance (light/dark, accent colour),
comfort (window-button side, single/double click), Windows apps, Korean input,
privacy & updates, and a shortcut cheat sheet. Every choice is applied right
away with Plasma's own tools and can be changed later in System Settings.

    nuri-welcome               show the guide
    nuri-welcome --first-run   show it only if it has not been finished yet (autostart)
"""
import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

from PyQt6.QtCore import QObject, QTimer, QUrl, pyqtProperty, pyqtSignal, pyqtSlot
from PyQt6.QtGui import QGuiApplication, QIcon
from PyQt6.QtQml import QQmlApplicationEngine
from PyQt6.QtQuick import QQuickWindow, QSGRendererInterface

import nuri_ai as core
from nuri_assistant import LANGS, system_dark

APP_ID = "nuri-welcome"
QML = Path(os.environ.get("NURI_QML_DIR", Path(__file__).resolve().parent / "qml")) / "Welcome.qml"
ICONS = Path(__file__).resolve().parents[2] / "share/icons/Nuri/scalable"
DONE = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "nuri-welcome-done"

ACCENTS = ["#6366f1", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#22c55e", "#64748b"]

TXT = {
    "ko": {
        "title": "누리에 오신 것을 환영해요", "next": "계속", "back": "뒤로", "skip": "건너뛰기", "start": "시작하기",
        "finish": "누리 시작하기",
        "hello_sub": "몇 가지만 고르면 바로 쓸 수 있어요. 모든 설정은 나중에 시스템 설정에서 바꿀 수 있어요.",
        "ai_title": "AI 비서의 언어", "ai_sub": "고른 언어로 대화를 잘하는 모델을 추천해요. 모델은 이 컴퓨터 안에서만 돌아가요.",
        "ai_ram": "이 컴퓨터 메모리: %s GB", "ai_get": "모델 고르고 받기", "ai_later": "나중에 받아도 돼요. Meta+Space로 AI 창을 열 수 있어요.",
        "ai_none": "이 컴퓨터에 맞는 추천 모델이 없어요. 모델 보관함에서 직접 골라 주세요.",
        "look_title": "모양", "look_sub": "밝게 또는 어둡게. 배경화면과 창 테두리도 함께 바뀌어요.",
        "light": "밝게", "dark": "어둡게", "accent": "강조 색",
        "comfort_title": "편하게 쓰기", "comfort_sub": "맥이나 윈도우에서 쓰던 방식으로 맞출 수 있어요.",
        "btn_side": "창 버튼 위치", "btn_left": "왼쪽 (맥처럼)", "btn_right": "오른쪽 (윈도우처럼)",
        "click": "파일 열기", "click_double": "두 번 클릭", "click_single": "한 번 클릭",
        "win_title": "Windows 앱", "win_sub": "많은 Windows 프로그램을 누리에서 그대로 실행할 수 있어요.",
        "win_exe": ".exe 파일을 두 번 클릭하면 Wine으로 바로 실행돼요.",
        "win_bottles": "Bottles는 게임·프로그램마다 따로 환경을 만들어 더 안정적으로 실행해요.",
        "win_steam": "Steam 게임은 Proton으로 실행돼요.",
        "win_get": "Bottles 설치하기",
        "input_title": "한글 입력", "input_sub": "한글과 영어는 이렇게 바꿔요.",
        "input_keys": "한/영 키 또는 Ctrl+Space", "input_more": "위쪽 막대의 한 / A 표시로 지금 상태를 볼 수 있어요.",
        "input_cfg": "입력기 설정",
        "priv_title": "개인정보와 업데이트",
        "priv_ai": "AI 대화는 이 컴퓨터에만 저장돼요. 인터넷으로 보내지 않아요.",
        "priv_upd": "업데이트는 뒤에서 조용히 받아 두고, 다음에 켤 때 적용돼요. 문제가 생기면 이전 버전으로 되돌릴 수 있어요.",
        "priv_check": "지금 업데이트 확인",
        "done_title": "준비됐어요", "done_sub": "자주 쓰는 단축키예요.",
        "k_ai": "AI 비서 열기", "k_menu": "앱 찾기", "k_files": "파일", "k_term": "터미널",
        "k_shot": "화면 캡처", "k_lock": "화면 잠그기", "k_switch": "창 전환", "k_overview": "모든 창 보기",
        "unavailable": "이 기능을 지금 실행할 수 없어요.",
    },
    "en": {
        "title": "Welcome to Nuri", "next": "Continue", "back": "Back", "skip": "Skip", "start": "Get started",
        "finish": "Start using Nuri",
        "hello_sub": "Pick a few things and you are ready. You can change all of it later in System Settings.",
        "ai_title": "Your assistant's language", "ai_sub": "We suggest models that speak it well. They run only on this computer.",
        "ai_ram": "Memory in this computer: %s GB", "ai_get": "Choose and download a model",
        "ai_later": "You can do this later. Meta+Space opens the AI panel.",
        "ai_none": "No suggested model fits this computer. Pick one in the model library.",
        "look_title": "Appearance", "look_sub": "Light or dark. The wallpaper and window frames follow.",
        "light": "Light", "dark": "Dark", "accent": "Accent colour",
        "comfort_title": "Make it yours", "comfort_sub": "Work the way you did on a Mac or on Windows.",
        "btn_side": "Window buttons", "btn_left": "Left (like a Mac)", "btn_right": "Right (like Windows)",
        "click": "Open files with", "click_double": "Double-click", "click_single": "Single click",
        "win_title": "Windows apps", "win_sub": "Many Windows programs run on Nuri as they are.",
        "win_exe": "Double-click an .exe file to run it with Wine.",
        "win_bottles": "Bottles gives each game or program its own environment for better results.",
        "win_steam": "Steam games run through Proton.",
        "win_get": "Install Bottles",
        "input_title": "Typing in other languages", "input_sub": "Switch input languages with",
        "input_keys": "the Hangul key or Ctrl+Space", "input_more": "The top bar shows the current one.",
        "input_cfg": "Input method settings",
        "priv_title": "Privacy and updates",
        "priv_ai": "AI chats are stored only on this computer and never sent online.",
        "priv_upd": "Updates download quietly and apply at the next start. You can always roll back.",
        "priv_check": "Check for updates now",
        "done_title": "You're all set", "done_sub": "Shortcuts worth knowing.",
        "k_ai": "AI assistant", "k_menu": "Find apps", "k_files": "Files", "k_term": "Terminal",
        "k_shot": "Screenshot", "k_lock": "Lock screen", "k_switch": "Switch windows", "k_overview": "All windows",
        "unavailable": "This can't be started right now.",
    },
}

HELLO = ["안녕하세요", "Hello", "こんにちは", "你好", "Bonjour", "Hola", "Hallo", "Ciao"]


def lang_key():
    return core.ui_lang() if core.ui_lang() in TXT else "en"


class Bridge(QObject):
    noteChanged = pyqtSignal()
    appearanceChanged = pyqtSignal()

    def __init__(self, dark, dry_run=False):
        super().__init__()
        self._dark = dark
        self._note = ""
        self.dry = dry_run
        self.log = []          # what would run (dry run) or ran
        try:
            self.reg = core.load_registry()
        except SystemExit:
            self.reg = {"models": []}
        self.ram = core.total_ram_gb()

    # ---------------------------------------------------------- properties
    @pyqtProperty(bool, notify=appearanceChanged)
    def dark(self):
        return self._dark

    @pyqtProperty("QVariantMap", constant=True)
    def t(self):
        return TXT[lang_key()]

    @pyqtProperty(str, constant=True)
    def lang(self):
        return core.ui_lang()

    @pyqtProperty("QVariantList", constant=True)
    def languages(self):
        return [{"code": c, "name": n} for c, n in LANGS]

    @pyqtProperty("QVariantList", constant=True)
    def hello(self):
        return HELLO

    @pyqtProperty("QVariantList", constant=True)
    def accents(self):
        return ACCENTS

    @pyqtProperty(str, constant=True)
    def ramText(self):
        return "%.0f" % self.ram

    @pyqtProperty(str, constant=True)
    def iconDir(self):
        """file URL of the Nuri icon theme (works installed and from the source tree)"""
        return QUrl.fromLocalFile(str(ICONS)).toString()

    @pyqtProperty(str, notify=noteChanged)
    def note(self):
        return self._note

    # ---------------------------------------------------------- models
    @pyqtSlot(str, result="QVariantList")
    def picks(self, lang):
        out = []
        for m in core.recommendations(self.reg, lang, self.ram)[:3]:
            out.append({"id": m["id"], "name": m["name"],
                        "star": bool(m.get("recommend", {}).get(lang)),
                        "size": "%.1f GB" % (m.get("size", 0) / 1e9),
                        "params": "%gB" % m["params_b"]})
        return out

    # ---------------------------------------------------------- actions
    def _run(self, *cmds):
        """Run each command (argv lists) in the background; False if a tool is missing."""
        for argv in cmds:
            self.log.append(" ".join(argv))
            if self.dry:
                continue
            if not shutil.which(argv[0]):
                self._set_note(TXT[lang_key()]["unavailable"])
                return False
            subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, start_new_session=True)
        return True

    def _set_note(self, v):
        self._note = v
        self.noteChanged.emit()

    def _kwin(self, key, value):
        return ["kwriteconfig6", "--file", "kwinrc", "--group", "org.kde.kdecoration2", "--key", key, value]

    def _reload_kwin(self):
        return ["dbus-send", "--session", "--type=signal", "/KWin", "org.kde.KWin.reloadConfig"]

    @pyqtSlot(bool)
    def setDark(self, dark):
        if dark != self._dark:
            self._dark = dark
            self.appearanceChanged.emit()
        scheme, deco = ("NuriDark", "__aurorae__svg__NuriDark") if dark else ("Nuri", "__aurorae__svg__Nuri")
        self._run(["plasma-apply-colorscheme", scheme],
                  self._kwin("library", "org.kde.kwin.aurorae"), self._kwin("theme", deco),
                  self._reload_kwin())

    @pyqtSlot(str)
    def setAccent(self, color):
        if color in ACCENTS:
            self._run(["plasma-apply-colorscheme", "--accent-color", color])

    @pyqtSlot(bool)
    def setButtonsLeft(self, left):
        self._run(self._kwin("ButtonsOnLeft", "XIA" if left else ""),
                  self._kwin("ButtonsOnRight", "" if left else "IAX"),
                  self._reload_kwin())

    @pyqtSlot(bool)
    def setSingleClick(self, single):
        self._run(["kwriteconfig6", "--file", "kdeglobals", "--group", "KDE", "--key", "SingleClick",
                   "true" if single else "false"])

    @pyqtSlot(str)
    def open(self, what):
        cmd = {
            "library": ["nuri-assistant", "--library"],
            "bottles": ["plasma-discover", "appstream://com.usebottles.bottles"],
            "input": ["fcitx5-configtool"],
            "updates": ["plasma-discover", "--mode", "Update"],
        }.get(what)
        if cmd:
            self._run(cmd)

    @pyqtSlot()
    def finish(self):
        if not self.dry:
            DONE.parent.mkdir(parents=True, exist_ok=True)
            DONE.write_text("1\n")
        QGuiApplication.quit()


def main(argv=None):
    ap = argparse.ArgumentParser(prog=APP_ID)
    ap.add_argument("--first-run", action="store_true", help="only show if not finished before")
    ap.add_argument("--theme", choices=["auto", "light", "dark"], default=os.environ.get("NURI_THEME", "auto"))
    ap.add_argument("--page", type=int, default=0, help=argparse.SUPPRESS)       # docs/tests
    ap.add_argument("--screenshot", metavar="PNG", help=argparse.SUPPRESS)       # docs/tests
    args = ap.parse_args(argv)
    if args.first_run and DONE.exists():
        return 0

    if args.screenshot or os.environ.get("QT_QPA_PLATFORM") == "offscreen":
        QQuickWindow.setGraphicsApi(QSGRendererInterface.GraphicsApi.Software)
    app = QGuiApplication(sys.argv[:1])
    app.setApplicationName(APP_ID)
    app.setDesktopFileName(APP_ID)
    app.setWindowIcon(QIcon.fromTheme(APP_ID))

    dark = system_dark() if args.theme == "auto" else args.theme == "dark"
    bridge = Bridge(dark, dry_run=bool(args.screenshot) or os.environ.get("NURI_WELCOME_DRY") == "1")
    engine = QQmlApplicationEngine()
    engine.rootContext().setContextProperty("bridge", bridge)
    engine.load(QUrl.fromLocalFile(str(QML)))
    if not engine.rootObjects():
        print("failed to load " + str(QML), file=sys.stderr)
        return 1
    win = engine.rootObjects()[0]
    win.setProperty("page", args.page)
    win.show()
    if args.screenshot:
        def shoot():
            if not win.grabWindow().save(args.screenshot):
                print("could not save " + args.screenshot, file=sys.stderr)
            app.quit()
        QTimer.singleShot(int(os.environ.get("NURI_SHOT_DELAY", "1200")), shoot)
    ret = app.exec()
    del engine
    return ret
