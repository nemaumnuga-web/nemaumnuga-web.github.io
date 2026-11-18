"""Syllable-level n-gram LM (interpolated Kneser-Ney, backoff form) -> compact binary for the browser.

usage: python lm_build.py OUT.bin [max_wiki_syllables_millions] [min counts for orders 2,3,4]

Binary layout (little endian), see chat/asr.js:
  "RLM1" | N(u8) | V(u16) | nsyl(u16) | syl code units u16[nsyl]            (ids 0,1,2 = BOS,EOS,SPACE; id 3+i = syl[i])
  order 1: prob u8[V], bow u8[V], off u32[V+1]            (dense, index = token id)
  order n=2..N: cnt u32 | word u16[cnt] | prob u8[cnt] | (n<N) bow u8[cnt], off u32[cnt+1]
  prob/bow are round(-ln(x)*16) clipped to 0..255
"""
import glob, io, re, struct, sys, os, json, array
import numpy as np, pyarrow.parquet as pq

D = os.path.dirname(os.path.abspath(__file__))
SH = 12
BOS, EOS, SPC = 0, 1, 2
N = 4
NVOCAB_SYL = 3000
SCALE = 16.0


def segments(text):
    text = re.sub(r"[.?!。]+", "|", text)
    text = re.sub(r"[0-9A-Za-z]+", "|", text)
    text = re.sub(r"[^가-힣 \n|]", " ", text)
    for seg in re.split(r"[|\n]+", text):
        seg = re.sub(r"\s+", " ", seg).strip()
        if len(seg.replace(" ", "")) >= 2:
            yield seg


def wiki_texts(limit_syl):
    n = 0
    for f in sorted(glob.glob(f"{D}/wiki/w*.parquet")):
        pf = pq.ParquetFile(f)
        for rg in range(pf.num_row_groups):
            for t in pf.read_row_group(rg, columns=["text"]).column("text").to_pylist():
                yield t
                n += len(t)
                if n > limit_syl * 1.6:     # 한글 비율 보정(대략)
                    return


def spoken_texts():
    """학습에 쓴 음성의 정답 문장(테스트셋 제외). 말투가 비슷해서 여러 번 반복해 가중치를 준다."""
    out = []
    for name in ["index_train.json", "index_fl_train.json"]:
        out += [i["text"] for i in json.load(open(f"{D}/{name}"))]
    return out


def main():
    outp = sys.argv[1]
    lim = float(sys.argv[2]) * 1e6 if len(sys.argv) > 2 else 60e6
    cfgs = [[1] + [int(x) for x in c.split(",")] for c in (sys.argv[3] if len(sys.argv) > 3 else "2,2,3").split(";")]
    wiki = [s for t in wiki_texts(lim) for s in segments(t)]
    spoken = [s for t in spoken_texts() for s in segments(t)]
    print("wiki segs", len(wiki), "spoken segs", len(spoken), flush=True)
    from collections import Counter
    cnt = Counter()
    for s in wiki:
        cnt.update(s.replace(" ", ""))
    for s in spoken:
        cnt.update({k: v * 5 for k, v in Counter(s.replace(" ", "")).items()})
    syl = [c for c, _ in cnt.most_common(NVOCAB_SYL)]
    cover = sum(cnt[c] for c in syl) / sum(cnt.values())
    print("syllable vocab", len(syl), "coverage", round(cover, 5), flush=True)
    sid = {c: 3 + i for i, c in enumerate(syl)}
    V = 3 + len(syl)

    toks = array.array('i')
    def add(seg, rep):
        words = seg.split(" ")
        ids = [BOS]
        for wi, w in enumerate(words):
            if wi: ids.append(SPC)
            ids += [sid.get(c, -1) for c in w]
        ids.append(EOS)
        # 어휘 밖 음절이 있으면 그 자리에서 문장을 끊는다
        cur = []
        for t in ids:
            if t == -1:
                if len(cur) > 2: toks.extend((cur + [EOS]) * rep)
                cur = [BOS]
            else:
                cur.append(t)
        if len(cur) > 2: toks.extend(cur * rep)
    for s in wiki: add(s, 1)
    for s in spoken: add(s, 5)
    tok = np.frombuffer(toks, dtype=np.int32).astype(np.int64)
    del toks, wiki, spoken
    print("tokens", len(tok), flush=True)

    # ---- raw counts per order
    raw = {}
    for n in range(1, N + 1):
        L = len(tok) - n + 1
        key = np.zeros(L, np.int64)
        for j in range(n):
            key = (key << SH) | tok[j: j + L]
        valid = np.ones(L, bool)
        for j in range(n - 1):
            valid &= tok[j: j + L] != EOS
        for j in range(1, n):
            valid &= tok[j: j + L] != BOS
        k, c = np.unique(key[valid], return_counts=True)
        raw[n] = (k, c)
        print("order", n, "unique", len(k), flush=True)
        del key, valid

    # ---- Kneser-Ney adjusted counts for orders < N (continuation counts)
    adj = {N: raw[N][1].astype(np.float64)}
    for n in range(N - 1, 0, -1):
        hk, _ = raw[n + 1]
        suf = hk & ((1 << (SH * n)) - 1)
        uk, uc = np.unique(suf, return_counts=True)       # 서로 다른 앞 토큰 수
        keys_n, raw_c = raw[n]
        a = raw_c.astype(np.float64)                      # BOS로 시작하는 n-gram은 앞 토큰이 없어 원래 횟수 유지
        starts_bos = (keys_n >> (SH * (n - 1))) == BOS
        pos = np.searchsorted(keys_n, uk)
        tmp = np.zeros_like(a); tmp[pos] = uc
        a = np.where(starts_bos, a, np.maximum(tmp, 1))
        adj[n] = a

    for ci, mins in enumerate(cfgs):
        outp_i = outp if len(cfgs) == 1 else outp.replace('.bin', f'.{ci}.bin')
        # ---- prune by raw count, build tables
        tab = {}
        for n in range(1, N + 1):
            k, rc = raw[n]
            keep = rc >= mins[n - 1] if n > 1 else np.ones(len(k), bool)
            tab[n] = {"key": k[keep], "c": adj[n][keep]}
            print("order", n, "kept", int(keep.sum()), flush=True)
        # unigram table dense
        uni_c = np.zeros(V); kk = tab[1]["key"]; uni_c[kk] = tab[1]["c"]
        tab[1] = {"key": np.arange(V, dtype=np.int64), "c": uni_c}

        def disc(c):
            n1, n2 = (c == 1).sum(), (c == 2).sum()
            return n1 / (n1 + 2 * n2) if n1 + 2 * n2 > 0 else 0.75

        Dn = {n: disc(adj[n]) for n in tab}                  # 가지치기 전 전체 횟수로 추정
        print("discounts", {n: round(float(d), 3) for n, d in Dn.items()}, flush=True)

        def lookup(n, keys):                      # -> (found, idx)
            tk = tab[n]["key"]
            idx = np.minimum(np.searchsorted(tk, keys), len(tk) - 1)
            return tk[idx] == keys, idx

        def full_prob(n, keys):                   # p(w_n | w_1..w_{n-1}) for packed n-gram keys, backoff form
            if n == 1:
                return tab[1]["p"][keys]
            found, idx = lookup(n, keys)
            res = np.where(found, tab[n]["p"][idx], 0.0)
            miss = ~found
            if miss.any():
                kk = keys[miss]
                hist = kk >> SH; suf = kk & ((1 << (SH * (n - 1))) - 1)
                if n - 1 == 1:
                    b = tab[1]["bow"][hist]
                else:
                    fh, ih = lookup(n - 1, hist)
                    b = np.where(fh, tab[n - 1]["bow"][ih], 1.0)
                res[miss] = b * full_prob(n - 1, suf)
            return res

        # order 1 (dense, uniform interpolation)
        c1 = tab[1]["c"]; tot = c1.sum(); present = c1 > 0
        p1 = np.where(present, np.maximum(c1 - Dn[1], 0) / tot, 0) + Dn[1] * present.sum() / tot / V
        p1[BOS] = 1e-7
        tab[1]["p"] = np.maximum(p1, 1e-7)
        for n in range(2, N + 1):
            ck, cc = tab[n]["key"], tab[n]["c"]
            hist = ck >> SH; suf = ck & ((1 << (SH * (n - 1))) - 1)
            fh, ih = lookup(n - 1, hist); assert fh.all(), "prefix closure violated"
            m = len(tab[n - 1]["key"])
            cnt_h = np.bincount(ih, weights=cc, minlength=m)
            n1h = np.bincount(ih, minlength=m).astype(np.float64)
            gam = np.where(cnt_h > 0, Dn[n] * n1h / np.maximum(cnt_h, 1e-9), 1.0)   # (n-1)-gram history의 backoff 가중치
            p = np.maximum(cc - Dn[n], 0) / cnt_h[ih] + gam[ih] * full_prob(n - 1, suf)
            tab[n]["p"] = np.minimum(p, 1.0)
            tab[n - 1]["bow"] = gam
        tab[N]["bow"] = np.ones(len(tab[N]["key"]))

        # ---- sanity: probabilities over a context sum to ~1
        q = lambda x: np.clip(np.round(-np.log(np.maximum(x, 1e-9)) * SCALE), 0, 255).astype(np.uint8)
        # ---- write
        with open(outp_i, "wb") as f:
            f.write(b"RLM1" + struct.pack("<BHH", N, V, len(syl)))
            f.write(np.array([ord(c) for c in syl], "<u2").tobytes())
            for n in range(1, N + 1):
                t = tab[n]
                if n == 1:
                    f.write(q(t["p"]).tobytes()); f.write(q(t["bow"]).tobytes())
                    off = np.searchsorted(tab[2]["key"] >> SH, np.arange(V + 1))
                    f.write(off.astype("<u4").tobytes())
                else:
                    f.write(struct.pack("<I", len(t["key"])))
                    f.write((t["key"] & ((1 << SH) - 1)).astype("<u2").tobytes())
                    f.write(q(t["p"]).tobytes())
                    if n < N:
                        f.write(q(t["bow"]).tobytes())
                        parent = tab[n + 1]["key"] >> SH
                        pi = np.searchsorted(t["key"], parent)
                        off = np.searchsorted(pi, np.arange(len(t["key"]) + 1))
                        f.write(off.astype("<u4").tobytes())
        print(outp_i, mins, round(os.path.getsize(outp_i) / 1e6, 2), "MB", {n: len(tab[n]["key"]) for n in tab}, flush=True)


if __name__ == "__main__":
    main()
