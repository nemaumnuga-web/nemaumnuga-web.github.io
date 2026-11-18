"""작은 한국어 채팅 모델 학습 (CPU 전용).

Gemma 3 270M(instruct)을 KoAlpaca v1.1a 한국어 질문·답변으로 전체 파인튜닝한다.
답변 토큰에만 손실을 걸고, 길이가 비슷한 샘플끼리 묶어 패딩 낭비를 줄인다.

  python3 llm/train.py --steps 600 --out out/raon-pico
"""
import argparse, math, random, time, json, os
import torch
from datasets import load_dataset
from transformers import AutoTokenizer, AutoModelForCausalLM

p = argparse.ArgumentParser()
p.add_argument("--base", default="unsloth/gemma-3-270m-it")
p.add_argument("--steps", type=int, default=600)
p.add_argument("--bs", type=int, default=8)
p.add_argument("--maxlen", type=int, default=320)
p.add_argument("--lr", type=float, default=5e-5)
p.add_argument("--eval_n", type=int, default=200)
p.add_argument("--out", default="out/raon-pico")
p.add_argument("--threads", type=int, default=os.cpu_count())
a = p.parse_args()
torch.set_num_threads(a.threads)
torch.manual_seed(0); random.seed(0)

tok = AutoTokenizer.from_pretrained(a.base)
model = AutoModelForCausalLM.from_pretrained(a.base, dtype=torch.float32, attn_implementation="eager")

SYS = "당신은 한국어로 정확하고 간결하게 답하는 AI 어시스턴트입니다."

def encode(q, ans):
    msgs = [{"role": "system", "content": SYS}, {"role": "user", "content": q.strip()}]
    prompt = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    p_ids = tok(prompt, add_special_tokens=False).input_ids
    a_ids = tok(ans.strip() + "<end_of_turn>\n", add_special_tokens=False).input_ids
    ids = (p_ids + a_ids)[: a.maxlen]
    labels = ([-100] * len(p_ids) + a_ids)[: a.maxlen]
    return ids, labels

ds = load_dataset("beomi/KoAlpaca-v1.1a", split="train").shuffle(seed=0)
rows = [encode(r["instruction"], r["output"]) for r in ds]
rows = [r for r in rows if any(l != -100 for l in r[1])]
evalset, train = rows[: a.eval_n], rows[a.eval_n :]
print(f"train {len(train)}  eval {len(evalset)}")

def batches(data, bs):
    # 길이순으로 정렬한 덩어리에서 배치를 뽑아 패딩을 줄인다
    while True:
        idx = list(range(len(data))); random.shuffle(idx)
        for i in range(0, len(idx), bs * 50):
            chunk = sorted(idx[i : i + bs * 50], key=lambda j: len(data[j][0]))
            bl = [chunk[k : k + bs] for k in range(0, len(chunk), bs)]
            random.shuffle(bl)
            for b in bl:
                yield [data[j] for j in b]

def collate(b):
    n = max(len(x[0]) for x in b)
    pad = tok.pad_token_id
    ids = torch.tensor([x[0] + [pad] * (n - len(x[0])) for x in b])
    lab = torch.tensor([x[1] + [-100] * (n - len(x[1])) for x in b])
    att = torch.tensor([[1] * len(x[0]) + [0] * (n - len(x[0])) for x in b])
    return ids, lab, att

import torch.nn.functional as F
from torch.utils.checkpoint import checkpoint

def lm_loss(ids, lab, att, sum_=False):
    # 262k 어휘 로짓을 모든 위치에서 만들면 메모리가 수 GB라서,
    # 답변 위치만 골라 512개씩 나눠 계산한다 (역전파 때 다시 계산)
    h = model.model(input_ids=ids, attention_mask=att).last_hidden_state
    tgt = lab[:, 1:]; m = tgt != -100
    h = h[:, :-1][m]; tgt = tgt[m]
    W = model.lm_head.weight
    tot = h.new_zeros(())
    for i in range(0, h.shape[0], 512):
        f = lambda x, t: F.cross_entropy(x @ W.T, t, reduction="sum")
        hi, ti = h[i:i+512], tgt[i:i+512]
        tot = tot + (checkpoint(f, hi, ti, use_reentrant=False) if torch.is_grad_enabled() else f(hi, ti))
    return (tot, tgt.numel()) if sum_ else tot / tgt.numel()

@torch.no_grad()
def evaluate():
    model.eval(); tot, cnt = 0.0, 0
    for i in range(0, len(evalset), a.bs):
        ids, lab, att = collate(evalset[i : i + a.bs])
        l, k = lm_loss(ids, lab, att, sum_=True)
        tot += l.item(); cnt += k
    model.train()
    return tot / cnt

base_loss = evaluate()
print(f"[base] eval loss {base_loss:.3f}  ppl {math.exp(base_loss):.1f}", flush=True)

# 임베딩(262k 어휘, 파라미터의 약 60%)은 얼리고 트랜스포머 층만 학습: 메모리·시간 절약
for n, prm in model.named_parameters():
    prm.requires_grad = "embed_tokens" not in n
model.model.gradient_checkpointing_enable() if hasattr(model.model, "gradient_checkpointing_enable") else model.gradient_checkpointing_enable()
model.config.use_cache = False
trainable = [p_ for p_ in model.parameters() if p_.requires_grad]
print(f"trainable {sum(p_.numel() for p_ in trainable)/1e6:.1f}M / {sum(p_.numel() for p_ in model.parameters())/1e6:.1f}M")
opt = torch.optim.AdamW(trainable, lr=a.lr, weight_decay=0.0)
warm = max(1, a.steps // 20)
sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / warm) * 0.5 * (1 + math.cos(math.pi * min(s, a.steps) / a.steps)))

log = {"base_eval_loss": base_loss, "steps": []}
it = batches(train, a.bs); t0 = time.time(); model.train()
for step in range(1, a.steps + 1):
    ids, lab, att = collate(next(it))
    loss = lm_loss(ids, lab, att)
    loss.backward()
    torch.nn.utils.clip_grad_norm_(trainable, 1.0)
    opt.step(); sched.step(); opt.zero_grad(set_to_none=True)
    if step % 20 == 0 or step == 1:
        el = time.time() - t0
        print(f"step {step}/{a.steps} loss {loss.item():.3f} {el/step:.2f}s/step eta {el/step*(a.steps-step)/60:.0f}m", flush=True)
    if step % 200 == 0 or step == a.steps:
        ev = evaluate(); print(f"  eval loss {ev:.3f} ppl {math.exp(ev):.1f}", flush=True)
        log["steps"].append({"step": step, "eval_loss": ev})

os.makedirs(a.out, exist_ok=True)
model.save_pretrained(a.out); tok.save_pretrained(a.out)
log["train_minutes"] = (time.time() - t0) / 60
json.dump(log, open(os.path.join(a.out, "train_log.json"), "w"), ensure_ascii=False, indent=1)
print("saved", a.out)
