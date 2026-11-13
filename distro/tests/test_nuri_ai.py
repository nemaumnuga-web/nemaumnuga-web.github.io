"""Tests for nuri-ai. Run: python3 -m unittest discover -s tests -v

Everything is local: a throwaway HTTP server stands in for Hugging Face and
for llama-server, and all data goes to a temp directory.
"""
import hashlib
import importlib.machinery
import importlib.util
import io
import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLI = ROOT / "system_files/usr/lib/nuri/nuri_ai.py"
REGISTRY = ROOT / "system_files/usr/share/nuri/models.json"

BLOB = os.urandom(300_000)
CHAT_LOG = []  # requests seen by the fake llama-server


class FakeHub(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path == "/health":
            return self._json({"status": "ok"})
        if self.path.startswith("/org/model/resolve/"):
            start = 0
            rng = self.headers.get("Range")
            if rng:
                start = int(rng.split("=")[1].rstrip("-"))
                self.send_response(206)
            else:
                self.send_response(200)
            body = BLOB[start:]
            if "corrupt" in self.path:
                body = b"x" * len(body)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404)

    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        CHAT_LOG.append(req)
        prompt = req["messages"][-1]["content"]
        reply = "SUMMARY(%d)" % len(CHAT_LOG) if prompt.startswith("Rewrite the notes") else "ok"
        if req.get("stream"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            for part in (reply[:1], reply[1:]):
                chunk = {"choices": [{"delta": {"content": part}}]}
                self.wfile.write(b"data: " + json.dumps(chunk).encode() + b"\n\n")
            self.wfile.write(b"data: [DONE]\n\n")
        else:
            self._json({"choices": [{"message": {"content": reply}}]})

    def _json(self, obj):
        body = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def load_cli(env):
    os.environ.update(env)
    loader = importlib.machinery.SourceFileLoader("nuri_ai", str(CLI))
    spec = importlib.util.spec_from_loader("nuri_ai", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


class NuriAiTest(unittest.TestCase):
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
        tmp = Path(self.tmp.name)
        reg = {"version": 1, "models": [
            {"id": "tiny", "name": "Tiny", "params_b": 1.0, "min_ram_gb": 8, "repo": "org/model",
             "revision": "abc", "file": "tiny.gguf", "sha256": hashlib.sha256(BLOB).hexdigest(),
             "size": len(BLOB), "langs": ["ko", "en"], "recommend": {"ko": 1},
             "license": "apache-2.0", "commercial": "unverified", "trust": "official"},
            {"id": "bad", "name": "Bad", "params_b": 1.0, "min_ram_gb": 8, "repo": "org/model",
             "revision": "corrupt", "file": "bad.gguf", "sha256": hashlib.sha256(BLOB).hexdigest(),
             "size": len(BLOB), "langs": ["en"], "license": "mit", "trust": "official"},
        ]}
        (tmp / "models.json").write_text(json.dumps(reg))
        self.cli = load_cli({
            "NURI_REGISTRY": str(tmp / "models.json"), "NURI_DATA": str(tmp / "data"),
            "NURI_CONFIG": str(tmp / "cfg"), "NURI_HF_ENDPOINT": self.url,
            "NURI_AI_URL": self.url, "LANG": "en_US.UTF-8",
        })
        self.data = tmp / "data"
        CHAT_LOG.clear()

    def tearDown(self):
        self.tmp.cleanup()

    # -- registry / recommendations -------------------------------------

    def test_shipped_registry_is_pinned_and_consistent(self):
        reg = json.loads(REGISTRY.read_text(encoding="utf-8"))
        ids = [m["id"] for m in reg["models"]]
        self.assertEqual(len(ids), len(set(ids)), "duplicate ids")
        for m in reg["models"]:
            with self.subTest(m["id"]):
                self.assertRegex(m["sha256"], r"^[0-9a-f]{64}$")
                self.assertRegex(m["revision"], r"^[0-9a-f]{40}$")
                self.assertTrue(m["file"].endswith(".gguf"))
                self.assertIn(m["commercial"], ("yes", "no", "unverified"))
                self.assertIn(m["trust"], ("official", "trusted-quant", "repackaged"))
                # weights + ~3 GB for OS/desktop must fit the stated minimum
                self.assertLessEqual(m["size"] / 1e9 + 3.0, m["min_ram_gb"],
                                     "min_ram_gb too low for the file size")

    def test_every_language_has_an_8gb_recommendation(self):
        reg = json.loads(REGISTRY.read_text(encoding="utf-8"))
        for lang in ("ko", "en", "ja", "zh", "fr", "de"):
            with self.subTest(lang):
                recs = self.cli.recommendations(reg, lang, 7.6)
                self.assertTrue(recs, "nothing fits 8 GB for " + lang)
                self.assertTrue(recs[0].get("recommend", {}).get(lang), "top pick not starred")

    def test_korean_8gb_prefers_korean_models_and_bigger_machines_get_more(self):
        reg = json.loads(REGISTRY.read_text(encoding="utf-8"))
        small = [m["id"] for m in self.cli.recommendations(reg, "ko", 7.6)]
        self.assertEqual(small[0], "exaone-4.0-1.2b")
        self.assertNotIn("qwen3.5-9b", small)
        mid = [m["id"] for m in self.cli.recommendations(reg, "ko", 15.6)]
        self.assertEqual(mid[0], "qwen3.5-9b", "16 GB should start with a 12 GB-class model")
        big = [m["id"] for m in self.cli.recommendations(reg, "ko", 64)]
        self.assertEqual(big[0], "exaone-4.0-32b")

    # -- install / integrity ----------------------------------------------

    def test_install_verifies_hash_and_activates(self):
        self.cli.main(["install", "tiny", "--accept-license"])
        f = self.data / "models/tiny/tiny.gguf"
        self.assertEqual(f.read_bytes(), BLOB)
        self.assertEqual(self.cli.active_id(), "tiny")
        self.assertEqual((self.data / "models/current.gguf").resolve(), f.resolve())

    def test_corrupt_download_is_rejected_and_deleted(self):
        with self.assertRaises(SystemExit):
            self.cli.main(["install", "bad", "--accept-license"])
        self.assertFalse((self.data / "models/bad/bad.gguf").exists())
        self.assertFalse((self.data / "models/bad/bad.gguf.part").exists())
        self.assertIsNone(self.cli.active_id())

    def test_partial_download_resumes(self):
        d = self.data / "models/tiny"
        d.mkdir(parents=True)
        (d / "tiny.gguf.part").write_bytes(BLOB[:100_000])
        self.cli.main(["install", "tiny", "--accept-license"])
        self.assertEqual((d / "tiny.gguf").read_bytes(), BLOB)

    def test_install_requires_license_acceptance_without_tty(self):
        import sys
        old = sys.stdin
        sys.stdin = io.StringIO("")
        try:
            with self.assertRaises(SystemExit):
                self.cli.main(["install", "tiny"])
        finally:
            sys.stdin = old
        self.assertFalse((self.data / "models/tiny/tiny.gguf").exists())

    def test_remove_active_model_clears_current(self):
        self.cli.main(["install", "tiny", "--accept-license"])
        self.cli.main(["remove", "tiny"])
        self.assertIsNone(self.cli.active_id())
        self.assertFalse((self.data / "models/tiny").exists())

    # -- chat / long-conversation memory ------------------------------------

    def test_chat_saves_locally_and_folds_old_turns_into_summary(self):
        s = self.cli.Session("t", ctx_tokens=300)  # tiny budget forces compaction
        out = io.StringIO()
        for i in range(12):
            self.assertEqual(self.cli.turn(s, "question %d " % i + "x" * 60, out), "ok")
        saved = json.loads((self.data / "chats/t.json").read_text())
        self.assertEqual(len(saved["log"]), 24, "full transcript must be kept on disk")
        self.assertTrue(saved["summary"].startswith("SUMMARY"))
        self.assertLess(len(saved["recent"]), 24)
        self.assertLessEqual(s.size(), s.budget + 200)
        self.assertEqual(saved["recent"][0]["role"], "user", "turn pairs must stay aligned")
        sent = CHAT_LOG[-1]["messages"]
        self.assertIn(self.cli.MEMORY_HEADER["en"], sent[0]["content"])

    def test_answer_is_saved_even_if_output_pipe_closes(self):
        class Closed(io.StringIO):
            def write(self, _):
                raise BrokenPipeError
        s = self.cli.Session("p")
        self.assertEqual(self.cli.turn(s, "hi", Closed()), "ok")
        saved = json.loads((self.data / "chats/p.json").read_text())
        self.assertEqual(saved["recent"][-1], {"role": "assistant", "content": "ok"})

    def test_session_resumes_from_disk(self):
        out = io.StringIO()
        self.cli.turn(self.cli.Session("r"), "hello", out)
        s2 = self.cli.Session("r")
        self.assertEqual([m["role"] for m in s2.data["recent"]], ["user", "assistant"])


if __name__ == "__main__":
    unittest.main()
