"""Reference reader for the RLM1 binary (same trie walk as chat/asr.js)."""
import struct, numpy as np

BOS, EOS, SPC = 0, 1, 2
SCALE = 16.0


class LM:
    def __init__(self, path):
        b = open(path, "rb").read()
        assert b[:4] == b"RLM1"
        self.N, self.V, nsyl = struct.unpack_from("<BHH", b, 4)
        p = 9
        self.syl = "".join(map(chr, np.frombuffer(b, "<u2", nsyl, p))); p += 2 * nsyl
        self.sid = {c: 3 + i for i, c in enumerate(self.syl)}
        V, N = self.V, self.N
        self.prob, self.bow, self.off, self.word = {}, {}, {}, {}
        self.prob[1] = np.frombuffer(b, np.uint8, V, p); p += V
        self.bow[1] = np.frombuffer(b, np.uint8, V, p); p += V
        self.off[1] = np.frombuffer(b, "<u4", V + 1, p); p += 4 * (V + 1)
        for n in range(2, N + 1):
            (cnt,) = struct.unpack_from("<I", b, p); p += 4
            self.word[n] = np.frombuffer(b, "<u2", cnt, p); p += 2 * cnt
            self.prob[n] = np.frombuffer(b, np.uint8, cnt, p); p += cnt
            if n < N:
                self.bow[n] = np.frombuffer(b, np.uint8, cnt, p); p += cnt
                self.off[n] = np.frombuffer(b, "<u4", cnt + 1, p); p += 4 * (cnt + 1)
        assert p == len(b), (p, len(b))
        self.cache = {}

    def _child(self, n, parent, w):          # table n entry index of child w under parent (index in table n-1), or -1
        lo, hi = int(self.off[n - 1][parent]), int(self.off[n - 1][parent + 1])
        ws = self.word[n]
        i = lo + int(np.searchsorted(ws[lo:hi], w))
        return i if i < hi and ws[i] == w else -1

    def _node(self, toks):
        idx = toks[0]
        for k in range(1, len(toks)):
            if k + 1 > self.N: return -1
            idx = self._child(k + 1, idx, toks[k])
            if idx < 0: return -1
        return idx

    def logp(self, hist, w):
        """ln p(w | last N-1 tokens of hist)"""
        hist = tuple(hist[-(self.N - 1):])
        key = (hist, w)
        r = self.cache.get(key)
        if r is not None: return r
        total = 0.0
        for start in range(0, len(hist) + 1):
            ctx = list(hist[start:])
            nd = self._node(ctx + [w])
            if nd >= 0:
                r = total - self.prob[len(ctx) + 1][nd] / SCALE
                self.cache[key] = r
                return r
            if ctx:
                nc = self._node(ctx)
                if nc >= 0 and len(ctx) < self.N:
                    total -= self.bow[len(ctx)][nc] / SCALE
        raise RuntimeError("unreachable")

    def sentence_logp(self, text):
        ids = [BOS]
        for wi, w in enumerate(text.split(" ")):
            if wi: ids.append(SPC)
            ids += [self.sid.get(c, 3) for c in w]
        ids.append(EOS)
        return sum(self.logp(ids[:i], ids[i]) for i in range(1, len(ids)))
