"""Extra data: FLEURS-ko (Hangul-only sentences) + speed perturbation (0.9x / 1.1x) for all training data.

Outputs feats_<name>.bin / index_<name>.json (same format as prep.py), one pair per (source, speed).
"""
import io, json, os, re, sys, tarfile, glob
import numpy as np, soundfile as sf, pyarrow.parquet as pq
from multiprocessing import Pool
from scipy.signal import resample_poly
from common import logmel, encode, SR

D = os.path.dirname(os.path.abspath(__file__))
SPEEDS = {"": None, "_s09": (10, 9), "_s11": (10, 11)}   # up/down for resample_poly (faster = fewer samples)


def work(args):
    b, text, speeds = args
    x, sr = sf.read(io.BytesIO(b), dtype="float32")
    if x.ndim > 1:
        x = x.mean(1)
    if sr != SR:
        g = np.gcd(sr, SR); x = resample_poly(x, SR // g, sr // g).astype(np.float32)
    ids = encode(text)
    out = {}
    for tag in speeds:
        y = x if SPEEDS[tag] is None else resample_poly(x, *SPEEDS[tag]).astype(np.float32)
        out[tag] = logmel(y).astype(np.float16)
    return out, ids, text


class Writer:
    def __init__(self, name):
        self.name, self.f, self.idx, self.off = name, open(f"{D}/feats_{name}.bin", "wb"), [], 0

    def add(self, feat, ids, text):
        self.f.write(feat.tobytes())
        self.idx.append({"off": self.off, "T": feat.shape[0], "ids": ids, "text": text})
        self.off += feat.size

    def close(self):
        self.f.close()
        json.dump(self.idx, open(f"{D}/index_{self.name}.json", "w"), ensure_ascii=False)
        print(self.name, len(self.idx), "utts", round(sum(i["T"] for i in self.idx) / 360000, 1), "h", flush=True)


def run(jobs_iter, prefix, speeds):
    ws = {t: Writer(prefix + t) for t in speeds}
    with Pool(4) as pool:
        for out, ids, text in pool.imap(work, jobs_iter, chunksize=8):
            if not ids:
                continue
            for t in speeds:
                ws[t].add(out[t], ids, text)
    for w in ws.values():
        w.close()


def zeroth_jobs(speeds):
    for f in sorted(glob.glob(f"{D}/pq/train-*.parquet")):
        pf = pq.ParquetFile(f)
        for rg in range(pf.num_row_groups):
            for r in pf.read_row_group(rg).to_pylist():
                yield (r["audio"]["bytes"], r["text"], speeds)
        print("zeroth", f[-30:], flush=True)


def fleurs_jobs(split, speeds):
    rows = {}
    for l in open(f"{D}/fleurs/{split}.tsv", encoding="utf8"):
        c = l.rstrip("\n").split("\t")
        if re.fullmatch(r"[가-힣 ]+", c[3].strip()):
            rows[c[1]] = c[3].strip()
    with tarfile.open(f"{D}/fleurs/{split}.tar.gz") as tf:
        for m in tf:
            name = os.path.basename(m.name)
            if name in rows:
                yield (tf.extractfile(m).read(), rows[name], speeds)


if __name__ == "__main__":
    what = sys.argv[1]
    if what == "fleurs":
        run(fleurs_jobs("test", [""]), "fl_test", [""])
        run(fleurs_jobs("dev", [""]), "fl_dev", [""])           # 하이퍼파라미터 튜닝용(학습에는 안 씀)
        run(fleurs_jobs("train", list(SPEEDS)), "fl_train", list(SPEEDS))
    elif what == "zeroth":
        run(zeroth_jobs(["_s09", "_s11"]), "train", ["_s09", "_s11"])
