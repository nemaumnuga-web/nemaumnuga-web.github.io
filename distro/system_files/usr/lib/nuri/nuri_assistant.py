"""Nuri Assistant - the graphical side of Nuri OS's on-device AI.

* A Spotlight-style chat panel (Meta+Space toggles it).
* A model library: per-language picks for this PC, licence and trust
  warnings, one-click verified install.
* File actions from Dolphin's right-click menu (summarise / explain / translate).

All inference goes to the local llama.cpp server on 127.0.0.1; chats are saved
by nuri_ai under ~/.local/share/nuri.
"""
import argparse
import html
import json
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nuri_ai as core  # noqa: E402

from PyQt6.QtCore import QObject, Qt, QThread, QTimer, pyqtSignal  # noqa: E402
from PyQt6.QtGui import QGuiApplication, QIcon, QKeySequence, QShortcut  # noqa: E402
from PyQt6.QtNetwork import QLocalServer, QLocalSocket  # noqa: E402
from PyQt6.QtWidgets import (  # noqa: E402
    QApplication, QCheckBox, QComboBox, QDialog, QFrame, QHBoxLayout, QLabel,
    QLineEdit, QMessageBox, QProgressBar, QPushButton, QScrollArea,
    QVBoxLayout, QWidget,
)

APP_ID = "nuri-assistant"
MAX_FILE_CHARS = 12000
LANGS = [("ko", "한국어"), ("en", "English"), ("ja", "日本語"), ("zh", "中文"),
         ("fr", "Français"), ("de", "Deutsch"), ("es", "Español"), ("it", "Italiano")]

TXT = {
    "ko": {
        "title": "누리 AI", "placeholder": "무엇이든 물어보세요", "private": "🔒 이 PC 안에서만 처리돼요",
        "models": "모델", "new": "새 대화", "send": "보내기", "no_model": "모델 없음",
        "starting": "AI를 준비하고 있어요…", "no_server": "AI 서버를 시작하지 못했어요. 모델이 설치됐는지 확인해 주세요.",
        "pick_first": "먼저 사용할 AI 모델을 골라 주세요.",
        "lib_title": "AI 모델 라이브러리", "lib_sub": "이 PC: RAM %.1f GB · 모두 이 PC 안에서 실행돼요",
        "lang": "언어", "show_all": "이 PC에서 안 돌아가는 모델도 보기", "rec": "✨ 추천",
        "install": "설치", "use": "사용", "in_use": "사용 중", "installing": "받는 중…",
        "nc": "비상업 전용", "unofficial": "⚠ 비공식 변환본", "too_big": "메모리 부족",
        "license_q": "<b>%s</b><br><br>라이선스: <a href='%s'>%s</a><br>%s<br><br>이 라이선스에 동의하고 내려받을까요? (%.1f GB)",
        "verify_fail": "무결성 검사에 실패해서 파일을 지웠어요. 다시 시도해 주세요.",
        "net_fail": "내려받기에 실패했어요(네트워크). 다시 누르면 이어서 받아요.",
        "summarize": "다음 파일의 핵심을 5줄 이내로 요약해 줘.",
        "explain": "다음 파일이 무엇인지, 핵심 내용을 쉽게 설명해 줘.",
        "translate": "다음 내용을 자연스러운 한국어로 번역해 줘. 이미 한국어라면 영어로 번역해 줘.",
        "binary": "텍스트 파일만 읽을 수 있어요: %s", "truncated": "(파일이 길어서 앞부분 %d자만 보냈어요)",
        "you": "나", "ai": "누리",
    },
    "en": {
        "title": "Nuri AI", "placeholder": "Ask anything", "private": "🔒 Processed on this PC only",
        "models": "Models", "new": "New chat", "send": "Send", "no_model": "no model",
        "starting": "Starting the AI…", "no_server": "Could not start the AI server. Is a model installed?",
        "pick_first": "Pick an AI model first.",
        "lib_title": "AI model library", "lib_sub": "This PC: %.1f GB RAM · everything runs on this PC",
        "lang": "Language", "show_all": "Also show models too big for this PC", "rec": "✨ Recommended",
        "install": "Install", "use": "Use", "in_use": "In use", "installing": "Downloading…",
        "nc": "non-commercial only", "unofficial": "⚠ unofficial conversion", "too_big": "not enough RAM",
        "license_q": "<b>%s</b><br><br>License: <a href='%s'>%s</a><br>%s<br><br>Accept this license and download? (%.1f GB)",
        "verify_fail": "Integrity check failed; the file was deleted. Please try again.",
        "net_fail": "Download failed (network). Click again to resume.",
        "summarize": "Summarise the key points of this file in at most 5 lines.",
        "explain": "Explain what this file is and its main content in plain words.",
        "translate": "Translate this into natural English. If it is already English, translate it into Korean.",
        "binary": "Only text files can be read: %s", "truncated": "(file is long; sent the first %d characters)",
        "you": "You", "ai": "Nuri",
    },
}


def tr(key):
    return TXT.get(core.ui_lang(), TXT["en"])[key]


def is_dark():
    try:
        return QGuiApplication.styleHints().colorScheme() == Qt.ColorScheme.Dark
    except AttributeError:
        return False


def palette():
    if is_dark():
        return dict(card="rgba(30,31,38,0.97)", text="#ececf1", sub="#a0a3b1", border="rgba(255,255,255,0.10)",
                    user="#4f5bd5", user_text="#ffffff", ai="rgba(255,255,255,0.07)", input="rgba(255,255,255,0.06)",
                    accent="#7c86ff", chip="rgba(124,134,255,0.18)", warn="#f0b44c", item="rgba(255,255,255,0.04)")
    return dict(card="rgba(250,250,252,0.97)", text="#1d1d24", sub="#6b6e7c", border="rgba(0,0,0,0.08)",
                user="#5b67f1", user_text="#ffffff", ai="#eef0f6", input="#ffffff",
                accent="#5b67f1", chip="rgba(91,103,241,0.12)", warn="#b26a00", item="#ffffff")


def stylesheet():
    c = palette()
    return """
    #card { background: %(card)s; border: 1px solid %(border)s; border-radius: 18px; }
    QLabel { color: %(text)s; }
    QLabel#sub, QLabel#private { color: %(sub)s; }
    QLabel#title { font-size: 15px; font-weight: 600; }
    QLabel#chip { background: %(chip)s; color: %(accent)s; border-radius: 9px; padding: 2px 9px; }
    QLabel#warn { color: %(warn)s; }
    QLineEdit { background: %(input)s; border: 1px solid %(border)s; border-radius: 12px;
                padding: 9px 12px; color: %(text)s; font-size: 14px; }
    QLineEdit:focus { border: 1px solid %(accent)s; }
    QPushButton { background: transparent; border: 1px solid %(border)s; border-radius: 10px;
                  padding: 6px 12px; color: %(text)s; }
    QPushButton:hover { border-color: %(accent)s; }
    QPushButton#primary { background: %(accent)s; color: white; border: none; }
    QPushButton#primary:disabled { background: %(chip)s; color: %(sub)s; }
    QFrame#item { background: %(item)s; border: 1px solid %(border)s; border-radius: 12px; }
    QProgressBar { border: none; background: %(chip)s; border-radius: 3px; max-height: 6px; }
    QProgressBar::chunk { background: %(accent)s; border-radius: 3px; }
    QScrollArea, QScrollArea > QWidget > QWidget#list { background: transparent; border: none; }
    QLabel#user { background: %(user)s; color: %(user_text)s; border-radius: 14px; padding: 9px 13px; font-size: 14px; }
    QLabel#ai { background: %(ai)s; color: %(text)s; border-radius: 14px; padding: 9px 13px; font-size: 14px; }
    QLabel#note { color: %(warn)s; padding: 4px 2px; }
    QLabel#hint { color: %(sub)s; padding: 4px 2px; font-size: 14px; }
    """ % c


# ------------------------------------------------------------------ workers

class _Emitter:
    """File-like object that forwards streamed text to a Qt signal."""
    def __init__(self, signal):
        self.signal = signal

    def write(self, s):
        if s:
            self.signal.emit(s)

    def flush(self):
        pass


def ensure_server(timeout=90):
    if core.server_ok():
        return True
    subprocess.run(["systemctl", "--user", "start", "nuri-ai.service"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    end = time.time() + timeout
    while time.time() < end:
        if core.server_ok():
            return True
        time.sleep(1)
    return False


class AskWorker(QThread):
    chunk = pyqtSignal(str)
    finished_ok = pyqtSignal(str)
    failed = pyqtSignal(str)

    def __init__(self, session, text):
        super().__init__()
        self.session, self.text = session, text

    def run(self):
        if not ensure_server():
            self.failed.emit(tr("no_server"))
            return
        try:
            answer = core.turn(self.session, self.text, _Emitter(self.chunk))
            self.finished_ok.emit(answer)
        except SystemExit:
            self.failed.emit(tr("no_server"))
        except Exception as e:  # keep the UI alive whatever happens
            self.failed.emit(str(e))


class InstallWorker(QThread):
    progress = pyqtSignal(int)
    done = pyqtSignal(str)
    failed = pyqtSignal(str)

    def __init__(self, model):
        super().__init__()
        self.model = model

    def run(self):
        try:
            core.install_model(self.model, progress=lambda have, total: self.progress.emit(
                int(100 * have / total) if total else 0), activate=True)
            self.done.emit(self.model["id"])
        except SystemExit:
            self.failed.emit(tr("verify_fail"))
        except Exception:
            self.failed.emit(tr("net_fail"))


# ------------------------------------------------------------------ chat panel

class Panel(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(tr("title"))
        self.setWindowIcon(QIcon.fromTheme(APP_ID))
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.resize(720, 540)
        self.session = core.Session("assistant")
        self.streaming = ""
        self.worker = None
        self.after_answer = None  # hook for --screenshot

        outer = QVBoxLayout(self)
        outer.setContentsMargins(10, 10, 10, 10)
        card = QFrame(objectName="card")
        outer.addWidget(card)
        lay = QVBoxLayout(card)
        lay.setContentsMargins(18, 14, 18, 14)
        lay.setSpacing(10)

        head = QHBoxLayout()
        title = QLabel("✦  " + tr("title"), objectName="title")
        self.model_chip = QLabel(objectName="chip")
        head.addWidget(title)
        head.addWidget(self.model_chip)
        head.addStretch()
        b_models = QPushButton(tr("models"))
        b_models.clicked.connect(self.open_library)
        b_new = QPushButton(tr("new"))
        b_new.clicked.connect(self.new_chat)
        head.addWidget(b_models)
        head.addWidget(b_new)
        lay.addLayout(head)

        self.scroll = QScrollArea(widgetResizable=True)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.list = QWidget(objectName="list")
        self.list_lay = QVBoxLayout(self.list)
        self.list_lay.setContentsMargins(0, 4, 4, 4)
        self.list_lay.setSpacing(8)
        self.scroll.setWidget(self.list)
        self.stream_label = None
        lay.addWidget(self.scroll, 1)

        row = QHBoxLayout()
        self.input = QLineEdit(placeholderText=tr("placeholder"))
        self.input.returnPressed.connect(self.send)
        self.send_btn = QPushButton(tr("send"), objectName="primary")
        self.send_btn.clicked.connect(self.send)
        row.addWidget(self.input, 1)
        row.addWidget(self.send_btn)
        lay.addLayout(row)
        lay.addWidget(QLabel(tr("private"), objectName="private"))

        QShortcut(QKeySequence("Escape"), self, activated=self.hide)
        self.refresh_model()
        self.render()

    # -- display
    def refresh_model(self):
        act = core.active_id()
        name = act
        try:
            reg = core.load_registry()
            name = next((m["name"] for m in reg["models"] if m["id"] == act), act)
        except SystemExit:
            pass
        self.model_chip.setText(name or tr("no_model"))

    def bubble(self, role, text):
        label = QLabel(text, objectName="user" if role == "user" else "ai")
        label.setWordWrap(True)
        label.setTextFormat(Qt.TextFormat.PlainText)
        label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        label.setMaximumWidth(int(self.width() * 0.74))
        row = QHBoxLayout()
        if role == "user":
            row.addStretch()
        row.addWidget(label)
        if role != "user":
            row.addStretch()
        self.list_lay.addLayout(row)
        return label

    def clear_list(self):
        def wipe(layout):
            while layout.count():
                item = layout.takeAt(0)
                if item.widget():
                    item.widget().deleteLater()
                elif item.layout():
                    wipe(item.layout())
        wipe(self.list_lay)

    def render(self, extra_note=None):
        """Rebuild the conversation (cheap: at most the last 40 messages)."""
        self.clear_list()
        self.list_lay.addStretch()  # keep messages at the bottom, like a chat app
        msgs = list(self.session.data["recent"])[-40:]
        if not msgs and not extra_note and not self.streaming:
            hint = QLabel(tr("placeholder") + " …", objectName="hint")
            self.list_lay.addWidget(hint)
        for m in msgs:
            self.bubble(m["role"], m["content"])
        self.stream_label = self.bubble("assistant", self.streaming) if self.streaming else None
        if extra_note:
            note = QLabel(extra_note, objectName="note")
            note.setWordWrap(True)
            self.list_lay.addWidget(note)
        QTimer.singleShot(0, self.scroll_to_end)

    def scroll_to_end(self):
        sb = self.scroll.verticalScrollBar()
        sb.setValue(sb.maximum())

    # -- actions
    def toggle(self):
        if self.isVisible() and self.isActiveWindow():
            self.hide()
        else:
            self.show_centered()

    def show_centered(self):
        screen = QGuiApplication.primaryScreen()
        if screen:
            g = screen.availableGeometry()
            self.move(g.x() + (g.width() - self.width()) // 2, g.y() + int(g.height() * 0.18))
        self.show()
        self.raise_()
        self.activateWindow()
        self.input.setFocus()

    def new_chat(self):
        if self.worker and self.worker.isRunning():
            return
        self.session = core.Session("assistant-%d" % int(time.time()))
        self.render()

    def open_library(self):
        Library(self).exec()
        self.refresh_model()

    def send(self, text=None):
        text = (text if isinstance(text, str) else self.input.text()).strip()
        if not text or (self.worker and self.worker.isRunning()):
            return
        if core.active_id() is None:
            self.render(tr("pick_first"))
            self.open_library()
            if core.active_id() is None:
                return
        self.input.clear()
        self.send_btn.setEnabled(False)
        self.streaming = ""
        # show the question right away; core.turn() records it in the session
        self.session.data["recent"].append({"role": "user", "content": text})
        self.render(None if core.server_ok() else tr("starting"))
        self.session.data["recent"].pop()
        self.worker = AskWorker(self.session, text)
        self.worker.chunk.connect(self.on_chunk)
        self.worker.finished_ok.connect(self.on_done)
        self.worker.failed.connect(self.on_fail)
        self.worker.start()

    def on_chunk(self, s):
        first = not self.streaming
        self.streaming += s
        if first or self.stream_label is None:
            self.render()
        else:
            self.stream_label.setText(self.streaming)
            QTimer.singleShot(0, self.scroll_to_end)

    def on_done(self, _answer):
        self.streaming = ""
        self.send_btn.setEnabled(True)
        self.render()
        if self.after_answer:
            QTimer.singleShot(300, self.after_answer)

    def on_fail(self, msg):
        self.streaming = ""
        self.send_btn.setEnabled(True)
        self.render(msg)
        if self.after_answer:
            QTimer.singleShot(300, self.after_answer)

    def file_error(self, msg):
        self.show_centered()
        self.render(msg)
        if self.after_answer:
            QTimer.singleShot(300, self.after_answer)

    def run_file_task(self, path, task):
        p = Path(path)
        try:
            raw = p.read_bytes()
        except OSError as e:
            return self.file_error(str(e))
        if b"\x00" in raw[:4096]:
            return self.file_error(tr("binary") % p.name)
        text = raw.decode("utf-8", "replace")
        note = ""
        if len(text) > MAX_FILE_CHARS:
            text, note = text[:MAX_FILE_CHARS], "\n" + tr("truncated") % MAX_FILE_CHARS
        self.session = core.Session("files")
        self.show_centered()
        self.send("%s\n\n[%s]%s\n---\n%s" % (tr(task), p.name, note, text))


# ------------------------------------------------------------------ model library

class Library(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle(tr("lib_title"))
        self.setWindowIcon(QIcon.fromTheme(APP_ID))
        self.resize(760, 640)
        self.setStyleSheet(stylesheet() + "QDialog { background: %s; }" % palette()["card"].replace("0.97", "1"))
        self.reg = core.load_registry()
        self.ram = core.total_ram_gb()
        self.workers = []

        lay = QVBoxLayout(self)
        lay.setContentsMargins(22, 18, 22, 18)
        lay.addWidget(QLabel(tr("lib_title"), objectName="title"))
        lay.addWidget(QLabel(tr("lib_sub") % self.ram, objectName="sub"))
        bar = QHBoxLayout()
        bar.addWidget(QLabel(tr("lang")))
        self.lang = QComboBox()
        for code, name in LANGS:
            self.lang.addItem(name, code)
        idx = max(0, [c for c, _ in LANGS].index(core.ui_lang()) if core.ui_lang() in dict(LANGS) else 1)
        self.lang.setCurrentIndex(idx)
        self.lang.currentIndexChanged.connect(self.fill)
        self.all = QCheckBox(tr("show_all"))
        self.all.toggled.connect(self.fill)
        bar.addWidget(self.lang)
        bar.addStretch()
        bar.addWidget(self.all)
        lay.addLayout(bar)

        self.scroll = QScrollArea(widgetResizable=True)
        lay.addWidget(self.scroll, 1)
        self.fill()

    def fill(self):
        lang = self.lang.currentData()
        models = core.recommendations(self.reg, lang, self.ram, self.all.isChecked())
        inst, act = core.installed_ids(), core.active_id()
        box = QWidget(objectName="list")
        v = QVBoxLayout(box)
        v.setSpacing(8)
        for label, m in zip(core.LABELS, models):
            v.addWidget(self.card(label, m, lang, inst, act))
        v.addStretch()
        self.scroll.setWidget(box)

    def card(self, label, m, lang, inst, act):
        f = QFrame(objectName="item")
        h = QHBoxLayout(f)
        h.setContentsMargins(14, 10, 14, 10)
        letter = QLabel(label, objectName="title")
        letter.setFixedWidth(22)
        h.addWidget(letter)
        col = QVBoxLayout()
        top = QHBoxLayout()
        top.addWidget(QLabel("<b>%s</b>" % html.escape(m["name"])))
        if m.get("recommend", {}).get(lang):
            top.addWidget(QLabel(tr("rec"), objectName="chip"))
        top.addStretch()
        col.addLayout(top)
        size = (m.get("size") or 0) / 1e9
        col.addWidget(QLabel("%.1fB · %.1f GB · %s · RAM %d GB+" % (
            m["params_b"], size, m["license"], m["min_ram_gb"]), objectName="sub"))
        warns = []
        if m.get("commercial") == "no":
            warns.append(tr("nc"))
        if m.get("trust") == "repackaged":
            warns.append(tr("unofficial"))
        if not core.fits(m, self.ram):
            warns.append(tr("too_big"))
        if warns:
            col.addWidget(QLabel(" · ".join(warns), objectName="warn"))
        bar = QProgressBar()
        bar.setTextVisible(False)
        bar.hide()
        col.addWidget(bar)
        h.addLayout(col, 1)

        btn = QPushButton(objectName="primary")
        if m["id"] == act:
            btn.setText(tr("in_use"))
            btn.setEnabled(False)
        elif m["id"] in inst:
            btn.setText(tr("use"))
            btn.clicked.connect(lambda: self.use(m))
        else:
            btn.setText(tr("install"))
            btn.setEnabled(core.fits(m, self.ram))
            btn.clicked.connect(lambda: self.install(m, btn, bar))
        h.addWidget(btn)
        return f

    def use(self, m):
        core.set_active(m["id"], m["file"])
        self.fill()

    def install(self, m, btn, bar):
        extra = []
        if m.get("commercial") == "no":
            extra.append(tr("nc"))
        if m.get("trust") == "repackaged":
            extra.append(tr("unofficial"))
        if m.get("notes"):
            extra.append(html.escape(m["notes"]))
        q = QMessageBox(self)
        q.setWindowTitle(tr("lib_title"))
        q.setTextFormat(Qt.TextFormat.RichText)
        q.setText(tr("license_q") % (html.escape(m["name"]), m.get("license_url", ""), m["license"],
                                     "<br>".join(extra), (m.get("size") or 0) / 1e9))
        q.setStandardButtons(QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if q.exec() != QMessageBox.StandardButton.Yes:
            return
        btn.setEnabled(False)
        btn.setText(tr("installing"))
        bar.show()
        w = InstallWorker(m)
        w.progress.connect(bar.setValue)
        w.done.connect(lambda _id: self.fill())
        w.failed.connect(lambda msg: (QMessageBox.warning(self, tr("lib_title"), msg), self.fill()))
        self.workers.append(w)
        w.start()


# ------------------------------------------------------------------ single instance

def socket_name():
    return "%s-%d" % (APP_ID, os.getuid())


def forward_to_running(request):
    """If an instance is already running, hand it the request and return True."""
    sock = QLocalSocket()
    sock.connectToServer(socket_name())
    if not sock.waitForConnected(300):
        return False
    sock.write(json.dumps(request).encode())
    sock.flush()
    sock.waitForBytesWritten(500)
    sock.disconnectFromServer()
    return True


class Server(QObject):
    def __init__(self, panel):
        super().__init__()
        self.panel = panel
        QLocalServer.removeServer(socket_name())
        self.srv = QLocalServer()
        self.srv.newConnection.connect(self.accept)
        self.srv.listen(socket_name())

    def accept(self):
        conn = self.srv.nextPendingConnection()
        conn.waitForReadyRead(500)
        try:
            handle(self.panel, json.loads(bytes(conn.readAll()).decode() or "{}"))
        except ValueError:
            pass
        conn.disconnectFromServer()


def handle(panel, req):
    if req.get("file"):
        panel.run_file_task(req["file"], req.get("task", "summarize"))
    elif req.get("library"):
        panel.show_centered()
        panel.open_library()
    elif req.get("ask"):
        panel.show_centered()
        panel.send(req["ask"])
    else:
        panel.toggle()


def main(argv=None):
    ap = argparse.ArgumentParser(prog=APP_ID)
    ap.add_argument("--library", action="store_true", help="open the model library")
    ap.add_argument("--file", help="file to work on (used by the Dolphin menu)")
    ap.add_argument("--task", choices=["summarize", "explain", "translate"], default="summarize")
    ap.add_argument("--ask", help="send this question right away")
    ap.add_argument("--screenshot", metavar="PNG",
                    help="for docs/tests: save the window after the answer (or library) and quit")
    args = ap.parse_args(argv)
    req = {"library": args.library, "ask": args.ask,
           "file": str(Path(args.file).resolve()) if args.file else None, "task": args.task}

    app = QApplication(sys.argv[:1])
    app.setApplicationName(APP_ID)
    app.setDesktopFileName(APP_ID)
    app.setQuitOnLastWindowClosed(False)
    if not args.screenshot and forward_to_running(req):
        return 0
    app.setStyleSheet(stylesheet())
    panel = Panel()

    if args.screenshot:
        def shoot(widget):
            widget.grab().save(args.screenshot)
            app.quit()
        if args.library:
            lib = Library(panel)
            lib.show()
            QTimer.singleShot(800, lambda: shoot(lib))
        else:
            panel.after_answer = lambda: shoot(panel)
            panel.show_centered()
            if not (args.ask or args.file):
                QTimer.singleShot(800, lambda: shoot(panel))
    else:
        Server(panel)
    if args.screenshot and args.library:
        pass  # the library window above is the whole screenshot
    elif any(req.get(k) for k in ("library", "ask", "file")):
        QTimer.singleShot(0, lambda: handle(panel, req))
    elif not args.screenshot:
        panel.show_centered()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
