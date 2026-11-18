"""학습 전(기본 Gemma 3 270M)과 학습 후 모델의 한국어 답변과 속도를 비교한다.

  python3 llm/compare.py out/raon-pico > llm/RESULTS_samples.md
"""
import sys, time, torch
from transformers import AutoTokenizer, AutoModelForCausalLM

BASE = "unsloth/gemma-3-270m-it"
TUNED = sys.argv[1] if len(sys.argv) > 1 else "out/raon-pico"
SYS = "당신은 한국어로 정확하고 간결하게 답하는 AI 어시스턴트입니다."
QS = [
    "김치찌개 맛있게 끓이는 방법 알려줘",
    "광합성이 뭐야?",
    "잠이 잘 안 올 때 어떻게 하면 좋아?",
    "서울에서 부산까지 KTX로 얼마나 걸려?",
    "파이썬에서 리스트와 튜플의 차이는?",
    "비 오는 날 할 만한 실내 활동 추천해줘",
]
torch.set_num_threads(4); torch.manual_seed(0)

def run(path):
    tok = AutoTokenizer.from_pretrained(path)
    m = AutoModelForCausalLM.from_pretrained(path, dtype=torch.float32).eval()
    outs, ntok, secs = [], 0, 0.0
    for q in QS:
        msgs = [{"role": "system", "content": SYS}, {"role": "user", "content": q}]
        ids = tok.apply_chat_template(msgs, add_generation_prompt=True, return_tensors="pt", return_dict=True)
        t = time.time()
        with torch.no_grad():
            g = m.generate(**ids, max_new_tokens=160, do_sample=False, repetition_penalty=1.15)
        secs += time.time() - t
        new = g[0, ids["input_ids"].shape[1]:]
        ntok += len(new)
        outs.append(tok.decode(new, skip_special_tokens=True).strip())
    return outs, ntok / secs

b, bs = run(BASE)
t, ts = run(TUNED)
print(f"# 답변 비교\n\n생성 속도 (PyTorch fp32, CPU 4코어): 기본 {bs:.1f} 토큰/초 · 학습 후 {ts:.1f} 토큰/초\n")
for q, x, y in zip(QS, b, t):
    print(f"## {q}\n\n**기본 Gemma 3 270M**\n\n> " + x.replace("\n", "\n> ") + "\n\n**학습 후 (라온 피코)**\n\n> " + y.replace("\n", "\n> ") + "\n")
