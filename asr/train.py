"""CPU training loop: CTC on jamo, SpecAugment, length-bucketed batches."""
import json, os, sys, time, random, math, argparse
import numpy as np, torch, torch.nn.functional as F
from common import NMEL, ctc_greedy, decode, cer
from model import ASR, out_len

D = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("--epochs", type=int, default=20)
ap.add_argument("--frames", type=int, default=24000)   # input frames per batch
ap.add_argument("--lr", type=float, default=2e-3)
ap.add_argument("--warmup", type=int, default=1500)
ap.add_argument("--bench", type=int, default=0)
ap.add_argument("--resume", default="")
ap.add_argument("--hours", type=float, default=1e9)    # wall-clock budget
args = ap.parse_args()
torch.set_num_threads(4)
torch.manual_seed(0); random.seed(0)


def load(split):
    idx = json.load(open(f"{D}/index_{split}.json"))
    mm = np.memmap(f"{D}/feats_{split}.bin", dtype=np.float16, mode="r")
    return idx, mm


def feat(mm, it):
    return np.asarray(mm[it["off"]: it["off"] + it["T"] * NMEL], np.float32).reshape(it["T"], NMEL)


def specaug(x):
    T = x.shape[0]
    for _ in range(2):
        f = random.randint(0, 15); f0 = random.randint(0, NMEL - f); x[:, f0:f0 + f] = 0
    for _ in range(max(1, T // 250)):
        t = random.randint(0, min(40, T // 5)); t0 = random.randint(0, max(0, T - t)); x[t0:t0 + t] = 0
    return x


def batches(idx, frames, shuffle=True):
    order = sorted(range(len(idx)), key=lambda i: idx[i]["T"] + random.random() * 30)
    bs, cur, mx = [], [], 0
    for i in order:
        T = idx[i]["T"]
        if cur and max(mx, T) * (len(cur) + 1) > frames:
            bs.append(cur); cur, mx = [], 0
        cur.append(i); mx = max(mx, T)
    if cur: bs.append(cur)
    if shuffle: random.shuffle(bs)
    return bs


def collate(idx, mm, b, aug):
    xs = [feat(mm, idx[i]) for i in b]
    if aug: xs = [specaug(x) for x in xs]
    lens = torch.tensor([x.shape[0] for x in xs])
    X = torch.zeros(len(xs), int(lens.max()), NMEL)
    for j, x in enumerate(xs): X[j, : len(x)] = torch.from_numpy(x)
    ys = [torch.tensor(idx[i]["ids"]) for i in b]
    ylens = torch.tensor([len(y) for y in ys])
    return X, lens, torch.cat(ys), ylens


@torch.no_grad()
def evaluate(model, idx, mm, n=None, show=3):
    model.eval(); E = N = 0
    items = idx if n is None else idx[:n]
    for k, b in enumerate(batches(items, 60000, shuffle=False)):
        X, lens, _, _ = collate(items, mm, b, False)
        lg = model(X, lens); ol = out_len(lens)
        for j, i in enumerate(b):
            hyp = decode(ctc_greedy(lg[j, : ol[j]].argmax(-1)))
            e, m = cer(items[i]["text"], hyp); E += e; N += m
            if show and k == 0 and j < show: print("  REF", items[i]["text"], "\n  HYP", hyp, flush=True)
    model.train()
    return E / N


def main():
    tr, trm = load("train"); te, tem = load("test")
    tr = [it for it in tr if out_len(it["T"]) > len(it["ids"]) and it["T"] <= 2000]
    print("train utts", len(tr), flush=True)
    model = ASR()
    print("params", sum(p.numel() for p in model.parameters()) / 1e6, "M", flush=True)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, betas=(0.9, 0.98), weight_decay=1e-3)
    step, ep0, best = 0, 0, 9.0
    if args.resume:
        ck = torch.load(args.resume, weights_only=False)
        model.load_state_dict(ck["model"]); opt.load_state_dict(ck["opt"]); step, ep0, best = ck["step"], ck["epoch"] + 1, ck.get("best", 9.0)
    nb = len(batches(tr, args.frames)); total = nb * args.epochs
    sched = lambda s: min(1.0, s / args.warmup) * 0.5 * (1 + math.cos(math.pi * min(1.0, s / total)))
    t_start = time.time()
    for ep in range(ep0, args.epochs):
        t0 = time.time(); tl = 0.0; cnt = 0
        for k, b in enumerate(batches(tr, args.frames)):
            for g in opt.param_groups: g["lr"] = args.lr * max(0.02, sched(step))
            X, lens, y, ylens = collate(tr, trm, b, True)
            lg = model(X, lens)
            loss = F.ctc_loss(lg.log_softmax(-1).transpose(0, 1), y, out_len(lens), ylens, zero_infinity=True)
            opt.zero_grad(); loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0); opt.step()
            step += 1; tl += loss.item(); cnt += 1
            if args.bench and k + 1 >= args.bench:
                dt = (time.time() - t0) / cnt
                print(f"bench: {dt:.2f}s/batch, {nb} batches/epoch -> {dt*nb/60:.1f} min/epoch", flush=True); return
            if step % 100 == 0:
                print(f"ep{ep} {k+1}/{nb} step{step} loss {tl/cnt:.3f} lr {opt.param_groups[0]['lr']:.2e} {(time.time()-t0)/60:.1f}min", flush=True)
                tl = cnt = 0
            if (time.time() - t_start) / 3600 > args.hours: break
        c = evaluate(model, te, tem)
        print(f"== epoch {ep} test CER {c*100:.2f}% ({(time.time()-t0)/60:.1f} min)", flush=True)
        ck = {"model": model.state_dict(), "opt": opt.state_dict(), "step": step, "epoch": ep, "best": min(best, c)}
        torch.save(ck, f"{D}/last.pt")
        if c < best:
            best = c; torch.save(model.state_dict(), f"{D}/best.pt"); print("   saved best", flush=True)
        if (time.time() - t_start) / 3600 > args.hours: break


if __name__ == "__main__":
    main()
