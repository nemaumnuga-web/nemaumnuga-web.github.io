"""Small Conformer-CTC acoustic model, trained from scratch on Korean jamo."""
import math
import torch, torch.nn as nn, torch.nn.functional as F
from common import NMEL, VOCAB


class Subsample(nn.Module):  # (B,T,80) -> (B,T/4,d)
    def __init__(self, d, ch=64):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(1, ch, 3, 2), nn.SiLU(),
            nn.Conv2d(ch, ch, 3, 2), nn.SiLU())
        f = ((NMEL - 1) // 2 - 1) // 2
        self.out = nn.Linear(ch * f, d)

    def forward(self, x):
        x = self.conv(x.unsqueeze(1))          # B,C,T',F'
        b, c, t, f = x.shape
        return self.out(x.permute(0, 2, 1, 3).reshape(b, t, c * f))


def out_len(T):
    return ((T - 1) // 2 - 1) // 2


class FF(nn.Module):
    def __init__(self, d, mult=4, p=0.1):
        super().__init__()
        self.net = nn.Sequential(nn.LayerNorm(d), nn.Linear(d, d * mult), nn.SiLU(),
                                 nn.Dropout(p), nn.Linear(d * mult, d), nn.Dropout(p))

    def forward(self, x):
        return self.net(x)


class MHSA(nn.Module):
    """Self-attention with learned relative position bias (clipped), ONNX-friendly."""
    def __init__(self, d, h, p=0.1, maxrel=64):
        super().__init__()
        self.h, self.dk, self.maxrel = h, d // h, maxrel
        self.ln = nn.LayerNorm(d)
        self.qkv = nn.Linear(d, 3 * d)
        self.o = nn.Linear(d, d)
        self.rel = nn.Embedding(2 * maxrel + 1, h)
        self.drop = nn.Dropout(p)

    def forward(self, x, mask=None):  # mask: B,T True=pad
        b, t, d = x.shape
        q, k, v = self.qkv(self.ln(x)).view(b, t, 3, self.h, self.dk).permute(2, 0, 3, 1, 4)
        att = (q @ k.transpose(-1, -2)) / math.sqrt(self.dk)
        pos = torch.arange(t, device=x.device)
        rel = (pos[None, :] - pos[:, None]).clamp(-self.maxrel, self.maxrel) + self.maxrel
        att = att + self.rel(rel).permute(2, 0, 1).unsqueeze(0)
        if mask is not None:
            att = att.masked_fill(mask[:, None, None, :], -1e4)
        att = self.drop(att.softmax(-1))
        y = (att @ v).transpose(1, 2).reshape(b, t, d)
        return self.drop(self.o(y))


class ConvMod(nn.Module):
    def __init__(self, d, k=15, p=0.1):
        super().__init__()
        self.ln = nn.LayerNorm(d)
        self.pw1 = nn.Linear(d, 2 * d)
        self.dw = nn.Conv1d(d, d, k, padding=k // 2, groups=d)
        self.norm = nn.LayerNorm(d)
        self.pw2 = nn.Linear(d, d)
        self.drop = nn.Dropout(p)

    def forward(self, x, mask=None):
        y = F.glu(self.pw1(self.ln(x)), -1)
        if mask is not None:
            y = y.masked_fill(mask[..., None], 0.0)
        y = self.dw(y.transpose(1, 2)).transpose(1, 2)
        y = self.pw2(F.silu(self.norm(y)))
        return self.drop(y)


class Block(nn.Module):
    def __init__(self, d, h):
        super().__init__()
        self.ff1, self.att, self.conv, self.ff2 = FF(d), MHSA(d, h), ConvMod(d), FF(d)
        self.ln = nn.LayerNorm(d)

    def forward(self, x, mask=None):
        x = x + 0.5 * self.ff1(x)
        x = x + self.att(x, mask)
        x = x + self.conv(x, mask)
        x = x + 0.5 * self.ff2(x)
        return self.ln(x)


class ASR(nn.Module):
    def __init__(self, d=144, layers=8, heads=4):
        super().__init__()
        self.sub = Subsample(d)
        self.blocks = nn.ModuleList([Block(d, heads) for _ in range(layers)])
        self.head = nn.Linear(d, VOCAB)

    def forward(self, x, lens=None):
        x = self.sub(x)
        mask = None
        if lens is not None:
            ol = out_len(lens)
            mask = torch.arange(x.shape[1], device=x.device)[None, :] >= ol[:, None]
        for b in self.blocks:
            x = b(x, mask)
        return self.head(x)  # B,T',V logits
