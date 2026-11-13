#!/usr/bin/env python3
"""Pin every registry entry to an exact GGUF file, git revision and SHA-256.

    python3 tools/pin_models.py [registry/models.src.json] [out.json]

For each model it reads the repo's file tree from the Hugging Face API, picks
the first single-file GGUF that matches the preferred quantisations, and
records the commit hash plus the LFS SHA-256 so `nuri-ai install` can verify
exactly what it downloads. Entries that cannot be resolved are reported and
left out, so a broken upstream repo never ships in an image.
"""
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "registry/models.src.json"
OUT = ROOT / "system_files/usr/share/nuri/models.json"
API = "https://huggingface.co/api/models/"
SKIP = re.compile(r"mmproj|-of-\d+|imatrix", re.I)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "nuri-pin/0.1"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def pick_file(files, quants):
    ggufs = [f for f in files if f["type"] == "file" and f["path"].lower().endswith(".gguf")
             and not SKIP.search(f["path"]) and f.get("lfs")]
    for q in quants:
        hits = [f for f in ggufs if q.lower() in f["path"].lower()]
        # Prefer files at the repo root, then the smallest match.
        hits.sort(key=lambda f: (f["path"].count("/"), f["size"]))
        if hits:
            return hits[0]
    return None


def pin(m):
    info = get(API + urllib.parse.quote(m["repo"], safe="/"))
    rev = info["sha"]
    if info.get("gated"):
        raise RuntimeError("gated repo (needs a login)")
    tree = get(API + urllib.parse.quote(m["repo"], safe="/") + "/tree/" + rev + "?recursive=true")
    f = pick_file(tree, m["quant"])
    if not f:
        raise RuntimeError("no single-file GGUF matching %s" % m["quant"])
    return dict(m, revision=rev, file=f["path"], sha256=f["lfs"]["oid"], size=f["lfs"]["size"])


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SRC
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else OUT
    reg = json.loads(src.read_text(encoding="utf-8"))
    pinned, failed = [], []
    for m in reg["models"]:
        try:
            p = pin(m)
            pinned.append(p)
            print("ok   %-18s %s  %.2f GB" % (m["id"], p["file"], p["size"] / 1e9))
        except Exception as e:  # report and continue with the rest
            failed.append(m["id"])
            print("FAIL %-18s %s" % (m["id"], e), file=sys.stderr)
    reg = {k: v for k, v in reg.items() if k != "_doc"}
    reg["models"] = pinned
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(reg, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("\n%d pinned, %d failed -> %s" % (len(pinned), len(failed), out))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
