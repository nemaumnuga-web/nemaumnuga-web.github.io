"""Smoke tests for the graphical assistant, rendered off-screen.

Skipped when PyQt6 is not installed. Each case runs the real app in a child
process (Qt allows one QApplication per process) against a fake local AI
server, and checks the screenshot it saves.

Set NURI_SHOTS=/some/dir to keep the screenshots for a visual check.
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_nuri_ai import BLOB, FakeHub  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")  # for the in-process SVG checks
APP = ROOT / "system_files/usr/bin/nuri-assistant"
REGISTRY = ROOT / "system_files/usr/share/nuri/models.json"

try:
    import PyQt6  # noqa: F401
    HAVE_QT = True
except ImportError:
    HAVE_QT = False


@unittest.skipUnless(HAVE_QT, "PyQt6 not installed")
class AssistantGuiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), FakeHub)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.url = "http://127.0.0.1:%d" % cls.srv.server_port

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.shots = Path(os.environ.get("NURI_SHOTS") or self.dir)
        self.shots.mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        self.tmp.cleanup()

    def run_app(self, *args, registry=REGISTRY, lang="ko_KR.UTF-8"):
        env = dict(os.environ, QT_QPA_PLATFORM="offscreen", LANG=lang, LC_ALL=lang,
                   NURI_REGISTRY=str(registry), NURI_DATA=str(self.dir / "data"),
                   NURI_CONFIG=str(self.dir / "cfg"), NURI_HF_ENDPOINT=self.url, NURI_AI_URL=self.url)
        p = subprocess.run([sys.executable, str(APP), *args], env=env, capture_output=True,
                           text=True, timeout=60)
        self.assertEqual(p.returncode, 0, p.stderr[-2000:])
        return p

    def install_fake_model(self):
        reg = {"version": 1, "models": [{
            "id": "tiny", "name": "Tiny Test", "params_b": 1.0, "min_ram_gb": 8, "repo": "org/model",
            "revision": "abc", "file": "tiny.gguf", "sha256": hashlib.sha256(BLOB).hexdigest(),
            "size": len(BLOB), "langs": ["ko", "en"], "recommend": {"ko": 1},
            "license": "apache-2.0", "commercial": "unverified", "trust": "official"}]}
        path = self.dir / "reg.json"
        path.write_text(json.dumps(reg))
        d = self.dir / "data/models/tiny"
        d.mkdir(parents=True)
        (d / "tiny.gguf").write_bytes(BLOB)
        (d / "meta.json").write_text("{}")
        (self.dir / "data/models/current.gguf").symlink_to(Path("tiny") / "tiny.gguf")
        return path

    def assert_png(self, path, min_w, min_h):
        data = path.read_bytes()
        self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
        w, h = int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
        self.assertGreaterEqual(w, min_w)
        self.assertGreaterEqual(h, min_h)

    QML_ERRORS = ("TypeError", "ReferenceError", "is not defined", "Cannot assign", "Unable to assign", "qt.svg",
                  "failed to load", "Type error", "Binding loop", ".qml:")

    def assert_clean(self, proc):
        bad = [l for l in proc.stderr.splitlines() if any(k in l for k in self.QML_ERRORS)]
        self.assertEqual(bad, [], "QML warnings:\n" + "\n".join(bad[:10]))

    def test_every_screen_loads_without_qml_errors(self):
        reg = self.install_fake_model()
        for theme in ("light", "dark"):
            for args in ([], ["--library"], ["--confirm", "tiny"], ["--ask", "hi"]):
                with self.subTest(theme=theme, args=args):
                    shot = self.shots / ("%s-%s.png" % (theme, "-".join(args).strip("-") or "empty"))
                    p = self.run_app("--theme", theme, *args, "--screenshot", str(shot), registry=reg)
                    self.assert_clean(p)
                    self.assert_png(shot, 600, 400)

    def test_library_renders_shipped_registry(self):
        shot = self.shots / "library.png"
        self.run_app("--library", "--screenshot", str(shot))
        self.assert_png(shot, 600, 500)

    def test_chat_round_trip_is_rendered_and_saved(self):
        reg = self.install_fake_model()
        shot = self.shots / "chat.png"
        self.run_app("--ask", "안녕하세요", "--screenshot", str(shot), registry=reg)
        self.assert_png(shot, 600, 400)
        saved = json.loads((self.dir / "data/chats/assistant.json").read_text())
        self.assertEqual([m["content"] for m in saved["recent"]], ["안녕하세요", "ok"])

    def test_file_action_reads_text_and_refuses_binary(self):
        reg = self.install_fake_model()
        note = self.dir / "note.txt"
        note.write_text("회의 메모: 다음 주 화요일 출시.", encoding="utf-8")
        self.run_app("--file", str(note), "--task", "summarize", "--screenshot",
                     str(self.shots / "file.png"), registry=reg)
        saved = json.loads((self.dir / "data/chats/files.json").read_text())
        self.assertIn("회의 메모", saved["recent"][0]["content"])
        blob = self.dir / "photo.bin"
        blob.write_bytes(b"\x00\x01binary")
        self.run_app("--file", str(blob), "--screenshot", str(self.shots / "binary.png"), registry=reg)
        self.assertFalse((self.dir / "data/chats/files.json").read_text().count("binary"))


@unittest.skipUnless(HAVE_QT, "PyQt6 not installed")
class WelcomeTest(unittest.TestCase):
    APP = ROOT / "system_files/usr/bin/nuri-welcome"

    def run_welcome(self, *args, home):
        env = dict(os.environ, QT_QPA_PLATFORM="offscreen", LANG="ko_KR.UTF-8", LC_ALL="ko_KR.UTF-8",
                   NURI_REGISTRY=str(REGISTRY), XDG_CONFIG_HOME=str(home), NURI_SHOT_DELAY="400")
        return subprocess.run([sys.executable, str(self.APP), *args], env=env, capture_output=True,
                              text=True, timeout=60)

    def test_every_page_renders_without_qml_errors(self):
        with tempfile.TemporaryDirectory() as d:
            for theme in ("light", "dark"):
                for page in range(8):
                    with self.subTest(theme=theme, page=page):
                        shot = Path(d) / ("w-%s-%d.png" % (theme, page))
                        p = self.run_welcome("--theme", theme, "--page", str(page), "--screenshot", str(shot),
                                             home=Path(d))
                        self.assertEqual(p.returncode, 0, p.stderr[-2000:])
                        bad = [l for l in p.stderr.splitlines() if any(k in l for k in AssistantGuiTest.QML_ERRORS)]
                        self.assertEqual(bad, [], "\n".join(bad[:10]))
                        self.assertTrue(shot.read_bytes().startswith(b"\x89PNG"))
            # screenshots are dry runs: nothing marked as finished
            self.assertFalse((Path(d) / "nuri-welcome-done").exists())

    def test_first_run_exits_once_finished(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "nuri-welcome-done").write_text("1\n")
            p = self.run_welcome("--first-run", home=Path(d))
            self.assertEqual(p.returncode, 0, p.stderr)

    def test_settings_commands(self):
        sys.path.insert(0, str(ROOT / "system_files/usr/lib/nuri"))
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        os.environ["NURI_REGISTRY"] = str(REGISTRY)
        import nuri_welcome
        b = nuri_welcome.Bridge(False, dry_run=True)
        b.setDark(True)
        b.setButtonsLeft(False)
        b.setAccent("#22c55e")
        b.setAccent("red; rm -rf /")      # not in the palette: ignored
        log = "\n".join(b.log)
        self.assertIn("plasma-apply-colorscheme NuriDark", log)
        self.assertIn("--key theme __aurorae__svg__NuriDark", log)
        self.assertIn("--key ButtonsOnRight IAX", log)
        self.assertIn("--accent-color #22c55e", log)
        self.assertNotIn("rm -rf", log)


@unittest.skipUnless(HAVE_QT, "PyQt6 not installed")
class ThemeArtTest(unittest.TestCase):
    LNF = ROOT / "system_files/usr/share/plasma/look-and-feel/org.nuri.desktop/contents"

    def test_splash_renders_without_qml_errors(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "splash.png"
            p = subprocess.run([sys.executable, str(ROOT / "tools/render_qml.py"),
                                str(self.LNF / "splash/Splash.qml"), str(out), "960x540",
                                "--prop", "stage=3", "--wait", "500"],
                               capture_output=True, text=True, timeout=60,
                               env=dict(os.environ, QT_QPA_PLATFORM="offscreen"))
            self.assertEqual(p.returncode, 0, p.stderr)
            bad = [l for l in p.stderr.splitlines() if ".qml:" in l or "Error" in l]
            self.assertEqual(bad, [])
            self.assertTrue(out.read_bytes().startswith(b"\x89PNG"))

    def test_theme_files_reference_existing_assets(self):
        defaults = (self.LNF / "defaults").read_text()
        self.assertIn("ColorScheme=Nuri", defaults)
        self.assertIn("Theme=org.nuri.desktop", defaults)
        for scheme in ("Nuri", "NuriDark"):
            self.assertTrue((ROOT / ("system_files/usr/share/color-schemes/%s.colors" % scheme)).is_file())
        layout = (self.LNF / "layouts/org.kde.plasma.desktop-layout.js").read_text()
        wall = layout.split('"file://')[1].split('"')[0]
        self.assertTrue((ROOT / "system_files" / wall.lstrip("/")).is_file(), wall)
        for name in ("preview.png", "splash.png", "fullscreenpreview.jpg"):
            self.assertTrue((self.LNF / "previews" / name).is_file(), name)

    def svg(self, path):
        from PyQt6.QtSvg import QSvgRenderer
        r = QSvgRenderer(str(path))
        self.assertTrue(r.isValid(), path)
        return r

    def assert_frame(self, r, prefix, path):
        for part in ("topleft", "top", "topright", "left", "center", "right", "bottomleft", "bottom", "bottomright"):
            el = (prefix + "-" + part) if prefix else part
            self.assertTrue(r.elementExists(el), "%s: %s" % (path.name, el))

    def test_window_decoration(self):
        from PyQt6.QtGui import QGuiApplication
        app = QGuiApplication.instance() or QGuiApplication([])  # noqa: F841
        for theme in ("Nuri", "NuriDark"):
            d = ROOT / "system_files/usr/share/aurorae/themes" / theme
            r = self.svg(d / "decoration.svg")
            for prefix in ("decoration", "decoration-inactive", "decoration-maximized",
                           "decoration-maximized-inactive"):
                self.assert_frame(r, prefix, d / "decoration.svg")
            # the corner slice must be as tall as padding + title bar from the rc file
            rc = dict(l.split("=", 1) for l in (d / (theme + "rc")).read_text().splitlines() if "=" in l)
            self.assertEqual(r.boundsOnElement("decoration-topleft").height(),
                             int(rc["PaddingTop"]) + int(rc["TitleHeight"]))
            for b in ("close", "minimize", "maximize", "restore"):
                rb = self.svg(d / (b + ".svg"))
                for state in ("active", "hover", "pressed", "inactive", "deactivated"):
                    self.assertTrue(rb.elementExists(state + "-center"), (theme, b, state))
            self.assertIn("X-KDE-PluginInfo-Name=" + theme, (d / "metadata.desktop").read_text())
        self.assertIn("theme=__aurorae__svg__Nuri", (ROOT / "system_files/etc/xdg/kwinrc").read_text())

    def test_plasma_style(self):
        from PyQt6.QtGui import QGuiApplication
        app = QGuiApplication.instance() or QGuiApplication([])  # noqa: F841
        base = ROOT / "system_files/usr/share/plasma/desktoptheme/Nuri"
        self.assertEqual(json.loads((base / "metadata.json").read_text())["KPlugin"]["Id"], "Nuri")
        for f in ("widgets/panel-background.svg", "translucent/widgets/panel-background.svg"):
            r = self.svg(base / f)
            for prefix in ("", "mask", "shadow"):
                self.assert_frame(r, prefix, base / f)
            for side in ("top", "bottom", "left", "right"):
                self.assertTrue(r.elementExists("hint-%s-margin" % side))
            # corners hold the rounded edge exactly (a stray stroke would shift the frame)
            self.assertEqual(r.boundsOnElement("topleft").width(), r.boundsOnElement("left").width())
        r = self.svg(base / "widgets/tasks.svg")
        for state in ("normal", "focus", "hover", "attention", "minimized"):
            self.assert_frame(r, state, base / "widgets/tasks.svg")
            self.assertTrue(r.elementExists(state + "-hint-bottom-margin"))

    def test_icon_theme(self):
        from PyQt6.QtGui import QGuiApplication
        app = QGuiApplication.instance() or QGuiApplication([])  # noqa: F841
        base = ROOT / "system_files/usr/share/icons/Nuri"
        index = (base / "index.theme").read_text()
        self.assertIn("Inherits=breeze,hicolor", index)
        icons = list(base.rglob("*.svg"))
        self.assertGreater(len(icons), 60)
        for f in icons:
            self.svg(f)
        # every launcher in the default dock has a Nuri icon
        for name in ("system-file-manager", "nuri-assistant", "utilities-terminal", "plasma-discover",
                     "preferences-system", "user-trash", "folder", "start-here-kde"):
            self.assertTrue(list(base.rglob(name + ".svg")), name)


if __name__ == "__main__":
    unittest.main()
