"""python dump_logits.py CKPT TAG name1 name2 ...  -> logits_<TAG>_<name>.npz (CTC log-probs per utterance)"""
import json, sys, os, numpy as np, torch
from common import NMEL
from model import ASR, out_len

D = os.path.dirname(os.path.abspath(__file__))
ck, tag = sys.argv[1], sys.argv[2]
torch.set_num_threads(int(os.environ.get("THREADS", "2")))
m = ASR(); sd = torch.load(f"{D}/{ck}", weights_only=False); m.load_state_dict(sd["model"] if "model" in sd else sd); m.eval()
for name in sys.argv[3:]:
    idx = json.load(open(f"{D}/index_{name}.json"))
    mm = np.memmap(f"{D}/feats_{name}.bin", dtype=np.float16, mode="r")
    lps, texts = [], []
    with torch.no_grad():
        for it in idx:
            x = torch.from_numpy(np.asarray(mm[it["off"]: it["off"] + it["T"] * NMEL], np.float32).reshape(1, it["T"], NMEL))
            lps.append(m(x)[0].log_softmax(-1).numpy().astype(np.float16)); texts.append(it["text"])
    np.savez(f"{D}/logits_{tag}_{name}.npz", lp=np.array(lps, dtype=object), text=np.array(texts, dtype=object))
    print(name, len(lps), flush=True)
