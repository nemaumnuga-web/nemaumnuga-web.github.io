"""best.pt -> ONNX (fp32) -> int8 dynamic quantization, then CER check with onnxruntime."""
import json, sys, os, numpy as np, torch, onnxruntime as ort
from onnxruntime.quantization import quantize_dynamic, QuantType
from common import NMEL, ctc_greedy, decode, cer
from model import ASR

D = os.path.dirname(os.path.abspath(__file__))
ck = sys.argv[1] if len(sys.argv) > 1 else f"{D}/best.pt"
torch.set_num_threads(1)
m = ASR(); sd = torch.load(ck, weights_only=False); m.load_state_dict(sd["model"] if "model" in sd else sd); m.eval()
x = torch.randn(1, 500, NMEL)
torch.onnx.export(m, (x,), f"{D}/asr.onnx", input_names=["feats"], output_names=["logits"],
                  dynamic_axes={"feats": {1: "T"}, "logits": {1: "T4"}}, opset_version=17, dynamo=False)
quantize_dynamic(f"{D}/asr.onnx", f"{D}/asr-ko.onnx", weight_type=QuantType.QInt8)
for f in ["asr.onnx", "asr-ko.onnx"]:
    print(f, round(os.path.getsize(f"{D}/{f}") / 1e6, 2), "MB")

idx = json.load(open(f"{D}/index_test.json"))
mm = np.memmap(f"{D}/feats_test.bin", dtype=np.float16, mode="r")
n = int(sys.argv[2]) if len(sys.argv) > 2 else len(idx)
for f in ["asr.onnx", "asr-ko.onnx"]:
    s = ort.InferenceSession(f"{D}/{f}", providers=["CPUExecutionProvider"])
    E = N = 0
    for it in idx[:n]:
        ft = np.asarray(mm[it["off"]: it["off"] + it["T"] * NMEL], np.float32).reshape(1, it["T"], NMEL)
        lg = s.run(None, {"feats": ft})[0][0]
        e, k = cer(it["text"], decode(ctc_greedy(lg.argmax(-1)))); E += e; N += k
    print(f, "CER", round(100 * E / N, 2), "%")
