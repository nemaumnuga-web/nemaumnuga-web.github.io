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


if __name__ == "__main__":
    unittest.main()
