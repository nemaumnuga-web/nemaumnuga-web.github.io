"""Shared feature extraction + Korean jamo tokenizer.

The browser (chat/asr.js) re-implements exactly the same log-mel + CMVN and
jamo composition, so keep both in sync.
"""
import numpy as np

SR = 16000
WIN = 400      # 25 ms
HOP = 160      # 10 ms
NFFT = 512
NMEL = 80
FMIN, FMAX = 20.0, 7600.0


def _hz2mel(f):
    return 2595.0 * np.log10(1.0 + f / 700.0)


def _mel2hz(m):
    return 700.0 * (10.0 ** (m / 2595.0) - 1.0)


def mel_filters():
    nb = NFFT // 2 + 1
    freqs = np.arange(nb) * SR / NFFT
    m = np.linspace(_hz2mel(FMIN), _hz2mel(FMAX), NMEL + 2)
    hz = _mel2hz(m)
    fb = np.zeros((NMEL, nb), np.float32)
    for i in range(NMEL):
        l, c, r = hz[i], hz[i + 1], hz[i + 2]
        up = (freqs - l) / (c - l)
        dn = (r - freqs) / (r - c)
        fb[i] = np.maximum(0, np.minimum(up, dn))
    return fb


MEL = mel_filters()
WINDOW = (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(WIN) / WIN)).astype(np.float32)  # periodic hann


def logmel(x):
    """x: float32 mono 16 kHz in [-1,1] -> (T, 80) float32, per-utterance CMVN."""
    x = np.asarray(x, np.float32)
    if len(x) < WIN:
        x = np.pad(x, (0, WIN - len(x)))
    n = 1 + (len(x) - WIN) // HOP
    idx = np.arange(WIN)[None, :] + HOP * np.arange(n)[:, None]
    frames = x[idx] * WINDOW
    spec = np.fft.rfft(frames, n=NFFT)
    power = (spec.real ** 2 + spec.imag ** 2).astype(np.float32)
    feat = np.log(np.maximum(power @ MEL.T, 1e-10))
    feat = (feat - feat.mean(0)) / (feat.std(0) + 1e-5)
    return feat.astype(np.float32)


# ---- jamo tokenizer: 0 blank, 1 space, 2..20 초성, 21..41 중성, 42..68 종성 ----
N_CHO, N_JUNG, N_JONG = 19, 21, 28
CHO0, JUNG0, JONG0 = 2, 2 + N_CHO, 2 + N_CHO + N_JUNG - 1  # jong index 1..27 -> JONG0+idx
VOCAB = 2 + N_CHO + N_JUNG + (N_JONG - 1)  # 69


def encode(text):
    out = []
    for ch in text:
        o = ord(ch)
        if 0xAC00 <= o <= 0xD7A3:
            s = o - 0xAC00
            cho, jung, jong = s // 588, (s % 588) // 28, s % 28
            out += [CHO0 + cho, JUNG0 + jung]
            if jong:
                out.append(JONG0 + jong)
        elif ch.isspace():
            if out and out[-1] != 1:
                out.append(1)
        # other chars dropped
    while out and out[-1] == 1:
        out.pop()
    return out


def decode(ids):
    """ids: already CTC-collapsed token ids (no blanks) -> Hangul string."""
    s, cho, jung = [], None, None

    def flush(jong=0):
        nonlocal cho, jung
        if cho is not None and jung is not None:
            s.append(chr(0xAC00 + cho * 588 + jung * 28 + jong))
        cho, jung = None, None

    for t in ids:
        if t == 1:
            flush(); s.append(" ")
        elif CHO0 <= t < JUNG0:
            flush(); cho = t - CHO0
        elif JUNG0 <= t < JUNG0 + N_JUNG:
            if cho is None:
                cho = 11  # ㅇ
            if jung is not None:
                flush(); cho = 11
            jung = t - JUNG0
        elif t > JONG0:
            flush(t - JONG0) if jung is not None else None
    flush()
    return "".join(s).strip()


def ctc_greedy(logits_argmax):
    out, prev = [], -1
    for t in logits_argmax:
        t = int(t)
        if t != prev and t != 0:
            out.append(t)
        prev = t
    return out


def cer(ref, hyp):
    r, h = ref.replace(" ", ""), hyp.replace(" ", "")
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        p, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (r[i - 1] != h[j - 1]))
    return d[len(h)], max(1, len(r))
