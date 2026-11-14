"""Nuri Assistant - the graphical side of Nuri OS's on-device AI.

* A Spotlight-style chat panel (Meta+Space toggles it), drawn in Qt Quick
  (qml/Main.qml): streamed answers with Markdown, typing indicator,
  suggestion cards, light and dark themes.
* A model library: per-language picks for this PC, RAM fit meter, licence
  and trust warnings, licence confirmation, verified install with progress.
* File actions from Dolphin's right-click menu (summarise / explain / translate).

All inference goes to the local llama.cpp server on 127.0.0.1; chats are saved
by nuri_ai under ~/.local/share/nuri.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nuri_ai as core  # noqa: E402

from PyQt6.QtCore import (  # noqa: E402
    QObject, Qt, QThread, QTimer, QUrl, pyqtProperty, pyqtSignal, pyqtSlot,
)
from PyQt6.QtGui import QDesktopServices, QGuiApplication, QIcon, QTextDocument  # noqa: E402
from PyQt6.QtNetwork import QLocalServer, QLocalSocket  # noqa: E402
from PyQt6.QtQml import QQmlApplicationEngine  # noqa: E402
from PyQt6.QtQuick import QQuickWindow, QSGRendererInterface  # noqa: E402

APP_ID = "nuri-assistant"
QML_MAIN = Path(os.environ.get("NURI_QML") or Path(__file__).resolve().parent / "qml" / "Main.qml")
MAX_FILE_CHARS = 12000
LANGS = [("ko", "한국어"), ("en", "English"), ("ja", "日本語"), ("zh", "中文"),
         ("fr", "Français"), ("de", "Deutsch"), ("es", "Español"), ("it", "Italiano")]

TXT = {
    "ko": {
        "title": "누리 AI", "placeholder": "무엇이든 물어보세요", "private": "이 PC 안에서만 처리돼요",
        "hotkey": "Meta+Space로 열기 · Esc로 닫기", "no_model": "모델을 골라 주세요",
        "greeting": "무엇을 도와드릴까요?", "greeting_sub": "인터넷 없이, 이 컴퓨터 안에서만 답해요",
        "starting": "AI를 준비하고 있어요…", "no_server": "AI 서버를 시작하지 못했어요. 모델이 설치됐는지 확인해 주세요.",
        "pick_first": "먼저 사용할 AI 모델을 골라 주세요.",
        "lib_title": "AI 모델 라이브러리", "lib_sub": "모두 이 PC 안에서 실행돼요", "this_pc": "이 PC",
        "search": "모델 이름, 라이선스로 찾기", "show_all": "모든 모델", "rec": "추천",
        "install": "설치", "use": "사용하기", "in_use": "사용 중", "installing": "받는 중",
        "nc": "비상업 전용", "unofficial": "비공식 변환본", "too_big": "메모리 부족",
        "nofit": "조건에 맞는 모델이 없어요",
        "download_size": "내려받기 %1 GB", "license_label": "라이선스:",
        "license_q": "이 라이선스를 확인했고, 동의하고 내려받을까요?",
        "cancel": "취소", "agree_install": "동의하고 설치", "copy": "복사", "copied": "복사됨",
        "verify_fail": "무결성 검사에 실패해서 파일을 지웠어요. 다시 시도해 주세요.",
        "net_fail": "내려받기에 실패했어요(네트워크). 다시 누르면 이어서 받아요.",
        "summarize": "다음 파일의 핵심을 5줄 이내로 요약해 줘.",
        "explain": "다음 파일이 무엇인지, 핵심 내용을 쉽게 설명해 줘.",
        "translate": "다음 내용을 자연스러운 한국어로 번역해 줘. 이미 한국어라면 영어로 번역해 줘.",
        "binary": "텍스트 파일만 읽을 수 있어요: %s", "truncated": "(파일이 길어서 앞부분 %d자만 보냈어요)",
    },
    "en": {
        "title": "Nuri AI", "placeholder": "Ask anything", "private": "Processed on this PC only",
        "hotkey": "Meta+Space to open · Esc to close", "no_model": "Pick a model",
        "greeting": "How can I help?", "greeting_sub": "No internet needed - answers stay on this computer",
        "starting": "Starting the AI…", "no_server": "Could not start the AI server. Is a model installed?",
        "pick_first": "Pick an AI model first.",
        "lib_title": "AI model library", "lib_sub": "Everything runs on this PC", "this_pc": "This PC",
        "search": "Search by name or licence", "show_all": "All models", "rec": "Recommended",
        "install": "Install", "use": "Use", "in_use": "In use", "installing": "Downloading",
        "nc": "non-commercial only", "unofficial": "unofficial conversion", "too_big": "Not enough RAM",
        "nofit": "No model matches",
        "download_size": "%1 GB download", "license_label": "License:",
        "license_q": "Have you read this licence, and do you accept it and download?",
        "cancel": "Cancel", "agree_install": "Accept & install", "copy": "Copy", "copied": "Copied",
        "verify_fail": "Integrity check failed; the file was deleted. Please try again.",
        "net_fail": "Download failed (network). Click again to resume.",
        "summarize": "Summarise the key points of this file in at most 5 lines.",
        "explain": "Explain what this file is and its main content in plain words.",
        "translate": "Translate this into natural English. If it is already English, translate it into Korean.",
        "binary": "Only text files can be read: %s", "truncated": "(file is long; sent the first %d characters)",
    },
}

SUGGESTIONS = {
    "ko": [
        ("window", "#6366f1", "윈도우 프로그램을 이 PC에서 쓰는 방법", "리눅스에서 윈도우 프로그램을 쓰려면 어떻게 해야 해? Wine과 Bottles 중심으로 쉽게 알려줘."),
        ("doc", "#0ea5e9", "회의록 양식 만들어 줘", "깔끔한 회의록 양식을 마크다운으로 만들어 줘. 안건, 결정 사항, 할 일 칸을 넣어 줘."),
        ("globe", "#ec4899", "자연스러운 영어로 번역", "다음 문장을 자연스러운 영어로 번역해 줘: 다음 주 화요일 오후 세 시에 회의가 있어요."),
        ("bolt", "#f59e0b", "8GB 노트북 빠르게 쓰는 팁", "RAM 8GB 노트북을 더 빠르게 쓰는 실용적인 팁을 5개만 알려줘."),
    ],
    "en": [
        ("window", "#6366f1", "Run Windows apps on this PC", "How do I run Windows programs on Linux? Explain simply, focusing on Wine and Bottles."),
        ("doc", "#0ea5e9", "Draft a meeting-notes template", "Make a clean meeting-notes template in Markdown with agenda, decisions and action items."),
        ("globe", "#ec4899", "Translate into natural Korean", "Translate into natural Korean: The meeting is next Tuesday at 3 pm."),
        ("bolt", "#f59e0b", "Speed tips for an 8 GB laptop", "Give me 5 practical tips to make an 8 GB RAM laptop feel faster."),
    ],
}


def markdown_html(text):
    """Markdown -> HTML body for a QML TextEdit, with readable paragraph and
    list spacing (Qt's own conversion uses zero margins) and no font override
    so the QML font and colour apply."""
    doc = QTextDocument()
    doc.setMarkdown(text, QTextDocument.MarkdownFeature.MarkdownDialectGitHub)
    m = re.search(r"<body[^>]*>(.*)</body>", doc.toHtml(), re.S)
    body = m.group(1) if m else ""
    # Drop the document's default font (QML sets it) but keep monospace for code.
    body = re.sub(r"font-family:'(?![^']*[Mm]ono)[^']*';?", "", body)
    body = re.sub(r"font-size:[^;\"]*;?", "", body)
    # Readable rhythm: space between paragraphs and lists, tight list items.
    body = re.sub(r"(<p [^>]*?)margin-top:\d+px; margin-bottom:\d+px", r"\1margin-top:0px; margin-bottom:10px", body)
    body = re.sub(r"(<li [^>]*?)margin-top:\d+px; margin-bottom:\d+px", r"\1margin-top:2px; margin-bottom:2px", body)
    body = re.sub(r"(<(?:ul|ol) [^>]*?)margin-top: ?\d+px; margin-bottom: ?\d+px", r"\1margin-top:0px; margin-bottom:10px", body)
    # No trailing gap after the last block (it would pad the bubble).
    i = body.rfind("margin-bottom:10px")
    if i != -1:
        body = body[:i] + "margin-bottom:0px" + body[i + len("margin-bottom:10px"):]
    return body.strip()


def lang_key():
    return core.ui_lang() if core.ui_lang() in TXT else "en"


def tr(key):
    return TXT[lang_key()][key]


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
            self.finished_ok.emit(core.turn(self.session, self.text, _Emitter(self.chunk)))
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
        last = [-1]

        def report(have, total):
            pct = int(100 * have / total) if total else 0
            if pct != last[0]:
                last[0] = pct
                self.progress.emit(pct)
        try:
            core.install_model(self.model, progress=report, activate=True)
            self.done.emit(self.model["id"])
        except SystemExit:
            self.failed.emit(tr("verify_fail"))
        except Exception:
            self.failed.emit(tr("net_fail"))


# ------------------------------------------------------------------ QML bridge

class Bridge(QObject):
    messageAppended = pyqtSignal(str, str, arguments=["role", "text"])
    streamText = pyqtSignal(str, arguments=["text"])
    streamDone = pyqtSignal(bool, arguments=["ok"])
    reset = pyqtSignal()
    busyChanged = pyqtSignal()
    noteChanged = pyqtSignal()
    modelChanged = pyqtSignal()
    libraryChanged = pyqtSignal()
    installProgress = pyqtSignal(str, int, arguments=["id", "pct"])
    openLibraryRequested = pyqtSignal()
    installDialogRequested = pyqtSignal(str, arguments=["id"])
    settled = pyqtSignal()  # an answer or error finished (used by --screenshot)

    def __init__(self, dark):
        super().__init__()
        self._dark = dark
        self._busy = False
        self._note = ""
        self._stream = ""
        self.session = core.Session("assistant")
        self.workers = []
        self.installing = {}
        try:
            self.reg = core.load_registry()
        except SystemExit:
            self.reg = {"models": []}
        self.ram = core.total_ram_gb()

    # -- properties
    @pyqtProperty(bool, constant=True)
    def dark(self):
        return self._dark

    @pyqtProperty("QVariantMap", constant=True)
    def t(self):
        return TXT[lang_key()]

    @pyqtProperty(bool, constant=True)
    def softwareRender(self):
        """True without GPU rendering: the UI then fades instead of sliding
        (the software renderer leaves trails when vector shapes move)."""
        return QQuickWindow.sceneGraphBackend() == "software" or os.environ.get("QT_QUICK_BACKEND") == "software"

    @pyqtProperty(str, constant=True)
    def lang(self):
        return core.ui_lang()

    @pyqtProperty(float, constant=True)
    def ramGb(self):
        return self.ram

    @pyqtProperty("QVariantList", constant=True)
    def languages(self):
        return [{"code": c, "name": n} for c, n in LANGS]

    @pyqtProperty("QVariantList", constant=True)
    def suggestions(self):
        return [{"icon": i, "tint": c, "label": label, "prompt": p}
                for i, c, label, p in SUGGESTIONS[lang_key()]]

    @pyqtProperty(bool, notify=busyChanged)
    def busy(self):
        return self._busy

    @pyqtProperty(str, notify=noteChanged)
    def note(self):
        return self._note

    @pyqtProperty(bool, notify=modelChanged)
    def hasModel(self):
        return core.active_id() is not None

    @pyqtProperty(str, notify=modelChanged)
    def modelName(self):
        act = core.active_id()
        return next((m["name"] for m in self.reg["models"] if m["id"] == act), act or "")

    def _set_busy(self, v):
        if v != self._busy:
            self._busy = v
            self.busyChanged.emit()

    def _set_note(self, v):
        if v != self._note:
            self._note = v
            self.noteChanged.emit()

    # -- chat
    @pyqtSlot(result="QVariantList")
    def history(self):
        return [{"role": m["role"], "text": m["content"]} for m in self.session.data["recent"][-60:]]

    @pyqtSlot(str)
    def send(self, text):
        text = text.strip()
        if not text or self._busy:
            return
        if core.active_id() is None:
            self._set_note(tr("pick_first"))
            self.openLibraryRequested.emit()
            self.settled.emit()
            return
        self._set_note("" if core.server_ok() else tr("starting"))
        self._stream = ""
        self.messageAppended.emit("user", text)
        self._set_busy(True)
        w = AskWorker(self.session, text)
        w.chunk.connect(self._on_chunk)
        w.finished_ok.connect(self._on_done)
        w.failed.connect(self._on_fail)
        self.workers.append(w)
        w.start()

    def _on_chunk(self, s):
        if self._note == tr("starting"):
            self._set_note("")
        self._stream += s
        self.streamText.emit(self._stream)

    def _on_done(self, answer):
        if not self._stream and answer:
            self.streamText.emit(answer)
        self._finish(True, "")

    def _on_fail(self, msg):
        self._finish(False, msg)

    def _finish(self, ok, note):
        self.streamDone.emit(ok)
        self._set_busy(False)
        self._set_note(note)
        self.workers = [w for w in self.workers if w.isRunning()]
        self.settled.emit()

    @pyqtSlot()
    def newChat(self):
        if self._busy:
            return
        self.session = core.Session("assistant-%d" % int(time.time()))
        self._set_note("")
        self.reset.emit()

    def run_file(self, path, task):
        p = Path(path)
        try:
            raw = p.read_bytes()
        except OSError as e:
            return self._file_error(str(e))
        if b"\x00" in raw[:4096]:
            return self._file_error(tr("binary") % p.name)
        text = raw.decode("utf-8", "replace")
        note = ""
        if len(text) > MAX_FILE_CHARS:
            text, note = text[:MAX_FILE_CHARS], "\n" + tr("truncated") % MAX_FILE_CHARS
        self.session = core.Session("files")
        self.reset.emit()
        self.send("%s\n\n[%s]%s\n---\n%s" % (tr(task), p.name, note, text))

    def _file_error(self, msg):
        self._set_note(msg)
        self.settled.emit()

    # -- library
    @pyqtSlot(str, bool, str, result="QVariantList")
    def libraryModels(self, lang, show_all, query):
        models = core.recommendations(self.reg, lang, self.ram, show_all)
        q = query.strip().lower()
        if q:
            models = [m for m in models
                      if q in m["name"].lower() or q in m["id"] or q in m["license"].lower()]
        inst, act = core.installed_ids(), core.active_id()
        out = []
        for label, m in zip(core.LABELS, models):
            fits = core.fits(m, self.ram)
            if m["id"] == act:
                state = "active"
            elif m["id"] in inst:
                state = "installed"
            elif m["id"] in self.installing:
                state = "installing"
            else:
                state = "install" if fits else "toobig"
            out.append({
                "id": m["id"], "letter": label, "name": m["name"], "params": float(m["params_b"]),
                "sizeGb": (m.get("size") or 0) / 1e9, "license": m["license"],
                "minRam": m["min_ram_gb"], "fits": fits,
                "ratio": m["min_ram_gb"] / max(self.ram, 1.0),
                "recommended": bool(m.get("recommend", {}).get(lang)),
                "warnings": self._warnings(m), "state": state,
                "progress": self.installing.get(m["id"], 0),
            })
        return out

    def _warnings(self, m):
        w = []
        if m.get("commercial") == "no":
            w.append(tr("nc"))
        if m.get("trust") == "repackaged":
            w.append(tr("unofficial"))
        return w

    @pyqtSlot(str, result="QVariantMap")
    def modelInfo(self, model_id):
        m = next((m for m in self.reg["models"] if m["id"] == model_id), None)
        if not m:
            return {}
        return {"id": m["id"], "name": m["name"], "license": m["license"],
                "licenseUrl": m.get("license_url", ""), "sizeGb": (m.get("size") or 0) / 1e9,
                "warnings": self._warnings(m), "notes": m.get("notes", "")}

    @pyqtSlot(str)
    def useModel(self, model_id):
        m = next((m for m in self.reg["models"] if m["id"] == model_id), None)
        if m and model_id in core.installed_ids():
            core.set_active(m["id"], m["file"])
            self._set_note("")
            self.modelChanged.emit()
            self.libraryChanged.emit()

    @pyqtSlot(str)
    def installModel(self, model_id):
        m = next((m for m in self.reg["models"] if m["id"] == model_id), None)
        if not m or model_id in self.installing:
            return
        self.installing[model_id] = 0
        self._set_note("")
        self.libraryChanged.emit()
        w = InstallWorker(m)
        w.progress.connect(lambda pct, i=model_id: self._on_progress(i, pct))
        w.done.connect(self._on_installed)
        w.failed.connect(lambda msg, i=model_id: self._on_install_failed(i, msg))
        self.workers.append(w)
        w.start()

    def _on_progress(self, model_id, pct):
        self.installing[model_id] = pct
        self.installProgress.emit(model_id, pct)

    def _on_installed(self, model_id):
        self.installing.pop(model_id, None)
        self.modelChanged.emit()
        self.libraryChanged.emit()

    def _on_install_failed(self, model_id, msg):
        self.installing.pop(model_id, None)
        self._set_note(msg)
        self.libraryChanged.emit()

    @pyqtSlot(str, result=str)
    def md(self, text):
        return markdown_html(text)

    @pyqtSlot(str)
    def copy(self, text):
        QGuiApplication.clipboard().setText(text)

    @pyqtSlot(str)
    def openUrl(self, url):
        if url.startswith("https://"):
            QDesktopServices.openUrl(QUrl(url))


# ------------------------------------------------------------------ window control

class Controller:
    def __init__(self, win, bridge):
        self.win, self.bridge = win, bridge

    def show(self):
        screen = self.win.screen() or QGuiApplication.primaryScreen()
        if screen:  # honoured on X11; on Wayland the KWin rule centres the window
            g = screen.availableGeometry()
            self.win.setPosition(g.x() + (g.width() - self.win.width()) // 2,
                                 g.y() + int(g.height() * 0.14))
        self.win.show()
        self.win.raise_()
        self.win.requestActivate()

    def toggle(self):
        if self.win.isVisible() and self.win.isActive():
            self.win.hide()
        else:
            self.show()

    def handle(self, req):
        if req.get("file"):
            self.show()
            self.bridge.run_file(req["file"], req.get("task") or "summarize")
        elif req.get("library"):
            self.show()
            self.bridge.openLibraryRequested.emit()
        elif req.get("ask"):
            self.show()
            self.bridge.send(req["ask"])
        else:
            self.toggle()


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
    def __init__(self, controller):
        super().__init__()
        self.controller = controller
        QLocalServer.removeServer(socket_name())
        self.srv = QLocalServer()
        self.srv.newConnection.connect(self.accept)
        self.srv.listen(socket_name())

    def accept(self):
        conn = self.srv.nextPendingConnection()
        conn.waitForReadyRead(500)
        try:
            self.controller.handle(json.loads(bytes(conn.readAll()).decode() or "{}"))
        except ValueError:
            pass
        conn.disconnectFromServer()


def system_dark():
    try:
        return QGuiApplication.styleHints().colorScheme() == Qt.ColorScheme.Dark
    except AttributeError:
        return False


def main(argv=None):
    ap = argparse.ArgumentParser(prog=APP_ID)
    ap.add_argument("--library", action="store_true", help="open the model library")
    ap.add_argument("--file", help="file to work on (used by the Dolphin menu)")
    ap.add_argument("--task", choices=["summarize", "explain", "translate"], default="summarize")
    ap.add_argument("--ask", help="send this question right away")
    ap.add_argument("--theme", choices=["auto", "light", "dark"],
                    default=os.environ.get("NURI_THEME", "auto"))
    ap.add_argument("--screenshot", metavar="PNG",
                    help="for docs/tests: save the window once it settles, then quit")
    ap.add_argument("--confirm", metavar="MODEL_ID", help=argparse.SUPPRESS)  # docs: licence dialog
    args = ap.parse_args(argv)
    req = {"library": args.library, "ask": args.ask,
           "file": str(Path(args.file).resolve()) if args.file else None, "task": args.task}

    if args.screenshot or os.environ.get("QT_QPA_PLATFORM") == "offscreen":
        QQuickWindow.setGraphicsApi(QSGRendererInterface.GraphicsApi.Software)
    app = QGuiApplication(sys.argv[:1])
    app.setApplicationName(APP_ID)
    app.setDesktopFileName(APP_ID)
    app.setWindowIcon(QIcon.fromTheme(APP_ID))
    app.setQuitOnLastWindowClosed(False)
    if not args.screenshot and forward_to_running(req):
        return 0

    dark = system_dark() if args.theme == "auto" else args.theme == "dark"
    bridge = Bridge(dark)
    engine = QQmlApplicationEngine()
    engine.rootContext().setContextProperty("bridge", bridge)
    engine.load(QUrl.fromLocalFile(str(QML_MAIN)))
    if not engine.rootObjects():
        print("failed to load " + str(QML_MAIN), file=sys.stderr)
        return 1
    win = engine.rootObjects()[0]
    ctl = Controller(win, bridge)

    if args.screenshot:
        def shoot():
            img = win.grabWindow()
            if not img.save(args.screenshot):
                print("could not save " + args.screenshot, file=sys.stderr)
            app.quit()
        ctl.show()
        delay = int(os.environ.get("NURI_SHOT_DELAY", "900"))
        if args.confirm:
            bridge.installDialogRequested.emit(args.confirm)
            QTimer.singleShot(delay, shoot)
        elif args.library:
            bridge.openLibraryRequested.emit()
            QTimer.singleShot(delay, shoot)
        elif args.ask or args.file:
            bridge.settled.connect(lambda: QTimer.singleShot(700, shoot))
            QTimer.singleShot(0, lambda: ctl.handle(req))
        else:
            QTimer.singleShot(delay, shoot)
    else:
        server = Server(ctl)  # noqa: F841  (kept alive by the event loop)
        QTimer.singleShot(0, lambda: ctl.handle(req) if any(req.get(k) for k in ("library", "ask", "file"))
                          else ctl.show())
    ret = app.exec()
    del engine  # tear down QML before the bridge it binds to
    return ret


if __name__ == "__main__":
    sys.exit(main())
