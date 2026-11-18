"""Continue training on more data (Zeroth + FLEURS, each at 0.9x/1.0x/1.1x speed).

- starts from a trained checkpoint (weights only, fresh optimizer / schedule)
- a "round" is 1/3 of one pass over the data, so checkpoints + evals come every ~30 min
- deterministic per-round batch order -> safe to resume after a container restart
- reports CER on Zeroth test and FLEURS test; keeps the best by their mean
"""
import json, os, time, random, math, argparse
import numpy as np, torch, torch.nn.functional as F
from common import NMEL, ctc_greedy, decode, cer
from model import ASR, out_len

D = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("--init", default="best.pt")
ap.add_argument("--rounds", type=int, default=12)
ap.add_argument("--frames", type=int, default=24000)
ap.add_argument("--lr", type=float, default=1e-3)
ap.add_argument("--warmup", type=int, default=300)
ap.add_argument("--threads", type=int, default=4)
ap.add_argument("--bench", type=int, default=0)
ap.add_argument("--resume", action="store_true")
ap.add_argument("--sources", default="train,train_s09,train_s11,fl_train,fl_train_s09,fl_train_s11")
args = ap.parse_args()
torch.set_num_threads(args.threads)
torch.manual_seed(1)


def load(name):
    idx = json.load(open(f"{D}/index_{name}.json"))
    return idx, np.memmap(f"{D}/feats_{name}.bin", dtype=np.float16, mode="r")


def feat(mm, it):
    return np.asarray(mm[it["off"]: it["off"] + it["T"] * NMEL], np.float32).reshape(it["T"], NMEL)


def specaug(x):
    T = x.shape[0]
    for _ in range(2):
        f = random.randint(0, 15); f0 = random.randint(0, NMEL - f); x[:, f0:f0 + f] = 0
    for _ in range(max(1, T // 250)):
        t = random.randint(0, min(40, T // 5)); t0 = random.randint(0, max(0, T - t)); x[t0:t0 + t] = 0
    return x


def make_batches(items, frames, shuffle):
    order = sorted(range(len(items)), key=lambda i: items[i]["T"] + random.random() * 30)
    bs, cur, mx = [], [], 0
    for i in order:
        T = items[i]["T"]
        if cur and max(mx, T) * (len(cur) + 1) > frames:
            bs.append(cur); cur, mx = [], 0
        cur.append(i); mx = max(mx, T)
    if cur: bs.append(cur)
    if shuffle: random.shuffle(bs)
    return bs


def collate(items, mms, b, aug):
    xs = [feat(mms[items[i]["s"]], items[i]) for i in b]
    if aug: xs = [specaug(x) for x in xs]
    lens = torch.tensor([x.shape[0] for x in xs])
    X = torch.zeros(len(xs), int(lens.max()), NMEL)
    for j, x in enumerate(xs): X[j, : len(x)] = torch.from_numpy(x)
    ys = [torch.tensor(items[i]["ids"]) for i in b]
    return X, lens, torch.cat(ys), torch.tensor([len(y) for y in ys])


@torch.no_grad()
def evaluate(model, name, show=0):
    idx, mm = load(name)
    items = [dict(it, s=0) for it in idx]
    model.eval(); E = N = 0
    for k, b in enumerate(make_batches(items, 60000, False)):
        X, lens, _, _ = collate(items, [mm], b, False)
        lg = model(X, lens); ol = out_len(lens)
        for j, i in enumerate(b):
            hyp = decode(ctc_greedy(lg[j, : ol[j]].argmax(-1)))
            e, m = cer(items[i]["text"], hyp); E += e; N += m
            if show and k == 0 and j < show: print("  REF", items[i]["text"], "\n  HYP", hyp, flush=True)
    model.train()
    return E / N


def main():
    names = args.sources.split(",")
    tr, mms = [], []
    for s, n in enumerate(names):
        idx, mm = load(n); mms.append(mm)
        tr += [dict(it, s=s) for it in idx if out_len(it["T"]) > len(it["ids"]) and it["T"] <= 2200]
    hours = sum(i["T"] for i in tr) / 360000
    print(f"train utts {len(tr)} ({hours:.0f} h)", flush=True)
    model = ASR()
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, betas=(0.9, 0.98), weight_decay=1e-3)
    step, r0, best = 0, 0, 9.0
    if args.resume and os.path.exists(f"{D}/ft_last.pt"):
        ck = torch.load(f"{D}/ft_last.pt", weights_only=False)
        model.load_state_dict(ck["model"]); opt.load_state_dict(ck["opt"]); step, r0, best = ck["step"], ck["round"] + 1, ck["best"]
        print("resumed after round", ck["round"], flush=True)
    else:
        sd = torch.load(f"{D}/{args.init}", weights_only=False); model.load_state_dict(sd["model"] if "model" in sd else sd)
        print("init from", args.init, "| zeroth", f"{evaluate(model, 'test')*100:.2f}%", "fleurs", f"{evaluate(model, 'fl_test')*100:.2f}%", flush=True)
    per_pass = 3
    nb_round = None
    for r in range(r0, args.rounds):
        p, k3 = divmod(r, per_pass)
        random.seed(1000 + p)                       # 같은 pass의 세 라운드는 같은 섞기 순서를 나눠 가짐
        allb = make_batches(tr, args.frames, True)
        lo, hi = len(allb) * k3 // per_pass, len(allb) * (k3 + 1) // per_pass
        mine = allb[lo:hi]
        total = (len(allb) // per_pass) * args.rounds
        random.seed(5000 + r)
        sched = lambda s: min(1.0, s / args.warmup) * 0.5 * (1 + math.cos(math.pi * min(1.0, s / total)))
        t0 = time.time(); tl = 0.0; cnt = 0
        for k, b in enumerate(mine):
            for g in opt.param_groups: g["lr"] = args.lr * max(0.02, sched(step))
            X, lens, y, ylens = collate(tr, mms, b, True)
            lg = model(X, lens)
            loss = F.ctc_loss(lg.log_softmax(-1).transpose(0, 1), y, out_len(lens), ylens, zero_infinity=True)
            opt.zero_grad(); loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0); opt.step()
            step += 1; tl += loss.item(); cnt += 1
            if args.bench and k + 1 >= args.bench:
                dt = (time.time() - t0) / cnt
                print(f"bench: {dt:.2f}s/batch, {len(mine)} batches/round -> {dt*len(mine)/60:.1f} min/round", flush=True); return
            if step % 100 == 0:
                print(f"round{r} {k+1}/{len(mine)} step{step} loss {tl/cnt:.3f} lr {opt.param_groups[0]['lr']:.2e} {(time.time()-t0)/60:.1f}min", flush=True)
                tl = cnt = 0
        cz, cf = evaluate(model, "test"), evaluate(model, "fl_test", show=2)
        m = (cz + cf) / 2
        print(f"== round {r} (pass {p}) CER zeroth {cz*100:.2f}% | fleurs {cf*100:.2f}% | mean {m*100:.2f}% ({(time.time()-t0)/60:.1f} min)", flush=True)
        if m < best:
            best = m; torch.save(model.state_dict(), f"{D}/ft_best.pt"); print("   saved best", flush=True)
        torch.save({"model": model.state_dict(), "opt": opt.state_dict(), "step": step, "round": r, "best": best}, f"{D}/ft_last.pt")


if __name__ == "__main__":
    main()
