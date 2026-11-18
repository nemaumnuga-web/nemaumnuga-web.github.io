"""CTC prefix beam search with a syllable n-gram LM (reference implementation; chat/asr.js mirrors it).

Score of a hypothesis = log P_ctc + alpha * log P_lm + beta * (#syllables)
The LM sees a syllable only once it is complete (when the next syllable / space starts, or at the end).
"""
import math, sys, json, os
import numpy as np
from common import decode as jamo_decode, ctc_greedy, cer, NMEL
from lmref import LM, BOS, EOS, SPC

NEG = -1e30
CHO0, JUNG0, JONG0 = 2, 21, 41
UNK_PEN = -10.0
lae = np.logaddexp


class Decoder:
    def __init__(self, lm, alpha=0.5, beta=1.0, beam=16, topk=6, pmin=-9.0):
        self.lm, self.alpha, self.beta, self.beam, self.topk, self.pmin = lm, alpha, beta, beam, topk, pmin

    # --- LM bookkeeping for one appended token -------------------------------------------------
    def _complete(self, st):
        """finish the pending syllable of state st=(lm, units, pending, nsyl); returns new state"""
        lm, units, pending, nsyl = st
        if not pending:
            return st
        ch = jamo_decode(list(pending))
        sid = self.lm.sid.get(ch) if len(ch) == 1 else None
        if sid is None:
            return (lm + UNK_PEN, (BOS,), (), nsyl + 1)
        return (lm + self.lm.logp(units, sid), (units + (sid,))[-3:], (), nsyl + 1)

    def advance(self, st, t):
        lm, units, pending, nsyl = st
        if t == 1:
            st = self._complete(st)
            lm, units, pending, nsyl = st
            if units and units[-1] != SPC:
                lm += self.lm.logp(units, SPC); units = (units + (SPC,))[-3:]
            return (lm, units, (), nsyl)
        if CHO0 <= t < JUNG0:
            st = self._complete(st)
            return (st[0], st[1], (t,), st[3])
        if JUNG0 <= t < JUNG0 + 21:
            if pending and any(JUNG0 <= x < JUNG0 + 21 for x in pending):
                st = self._complete(st); lm, units, pending, nsyl = st
            if not pending:
                pending = (13,)
            return (lm, units, pending + (t,), nsyl)
        if t > JONG0:
            if len(pending) == 2 and JUNG0 <= pending[1] < JUNG0 + 21:
                return (lm, units, pending + (t,), nsyl)
            return st
        return st

    def final_lm(self, st):
        st = self._complete(st)
        lm, units = st[0], st[1]
        if units and units[-1] == SPC:
            units = units[:-1] or (BOS,)
        return lm + self.lm.logp(units, EOS), st[3]

    # --- search --------------------------------------------------------------------------------
    def decode(self, lp):                       # lp: (T, V) log-probs
        T, V = lp.shape
        init = (0.0, (BOS,), (), 0)
        beams = {(): [0.0, NEG, init]}          # prefix -> [pb, pnb, lmstate]
        for t in range(T):
            row = lp[t]
            if row[0] > -0.0005 and t > 0:      # 거의 확실한 공백 프레임은 건너뛴다
                for e in beams.values():
                    e[0] = lae(e[0], e[1]) + row[0]; e[1] = NEG
                continue
            cands = [c for c in np.argsort(-row)[: self.topk + 1] if c != 0 and row[c] > self.pmin][: self.topk]
            new = {}

            def slot(pre, st):
                s = new.get(pre)
                if s is None:
                    s = new[pre] = [NEG, NEG, st]
                return s
            for pre, (pb, pnb, st) in beams.items():
                ptot = lae(pb, pnb)
                s = slot(pre, st)
                s[0] = lae(s[0], ptot + row[0])
                last = pre[-1] if pre else -1
                if last > 0:
                    s[1] = lae(s[1], pnb + row[last])
                for c in cands:
                    if c == 1 and not pre:
                        continue
                    ext = pre + (c,)
                    e = new.get(ext)
                    if e is None:
                        e = new[ext] = [NEG, NEG, self.advance(st, c)]
                    e[1] = lae(e[1], (pb if c == last else ptot) + row[c])
            sc = lambda kv: lae(kv[1][0], kv[1][1]) + self.alpha * kv[1][2][0] + self.beta * kv[1][2][3]
            beams = dict(sorted(new.items(), key=sc, reverse=True)[: self.beam])
        best, bs = (), NEG
        for pre, (pb, pnb, st) in beams.items():
            lmv, ns = self.final_lm(st)
            s = lae(pb, pnb) + self.alpha * lmv + self.beta * ns
            if s > bs: best, bs = pre, s
        return jamo_decode(list(best))


def load_logits(path):
    z = np.load(path, allow_pickle=True)
    return list(z["lp"]), list(z["text"])


def evaluate(dec, lps, texts, n=None):
    E = N = 0
    for lp, tx in list(zip(lps, texts))[:n]:
        e, m = cer(tx, dec.decode(lp.astype(np.float32))); E += e; N += m
    return E / N
