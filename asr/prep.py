"""Decode parquet FLAC -> log-mel features, stored as one fp16 blob per split."""
import io, json, sys, glob, os
import numpy as np, soundfile as sf, pyarrow.parquet as pq
from multiprocessing import Pool
from common import logmel, encode, SR

D = os.path.dirname(os.path.abspath(__file__))


def work(args):
    b, text = args
    x, sr = sf.read(io.BytesIO(b), dtype="float32")
    if x.ndim > 1:
        x = x.mean(1)
    assert sr == SR, sr
    return logmel(x).astype(np.float16), encode(text), text


def run(split):
    files = sorted(glob.glob(f"{D}/pq/{split}-*.parquet"))
    out = open(f"{D}/feats_{split}.bin", "wb")
    index, off = [], 0
    with Pool(4) as pool:
        for f in files:
            pf = pq.ParquetFile(f)
            for rg in range(pf.num_row_groups):
                t = pf.read_row_group(rg).to_pylist()
                jobs = [(r["audio"]["bytes"], r["text"]) for r in t]
                for feat, ids, text in pool.imap(work, jobs, chunksize=8):
                    if not ids:
                        continue
                    out.write(feat.tobytes())
                    index.append({"off": off, "T": feat.shape[0], "ids": ids, "text": text})
                    off += feat.size
            print(split, f, len(index), flush=True)
    out.close()
    json.dump(index, open(f"{D}/index_{split}.json", "w"), ensure_ascii=False)
    hrs = sum(i["T"] for i in index) / 100 / 3600
    print(split, len(index), "utts", round(hrs, 1), "h", flush=True)


if __name__ == "__main__":
    for s in sys.argv[1:]:
        run(s)
