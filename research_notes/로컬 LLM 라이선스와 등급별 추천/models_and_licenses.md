# Local (GGUF / on-device) LLM landscape, late 2026: catalog method, licenses, GGUF availability, Korean data

Research date: 2026-11-13. Coverage is partial (about 15 tool calls). Items marked **UNVERIFIED** were not checked against a primary source in this pass. Items marked **SECONDARY** come only from aggregators or blogs.

## Q1. How to systematically collect local LLMs (catalog method)

### Takeaway
A catalog can be built from the Hugging Face Hub by combining (a) a GGUF filter, (b) a fixed list of trusted publishers (official vendor orgs plus known quantizers), and (c) the license field and LICENSE file of each source repo. Quantizer repos are not licensed on their own. They inherit the license of the base model, so the catalog must record both the base-model license and the GGUF repo's publisher.

### Cited Findings
- Official vendor GGUF repos observed in this pass: `google/gemma-4-12B-it-qat-q4_0-gguf` (Gemma 4 QAT builds; the card lists one Q4_0 file, 6.98 GB) — [Source](https://huggingface.co/google/gemma-4-12B-it-qat-q4_0-gguf); `LGAI-EXAONE/EXAONE-4.0-32B-GGUF` — [Source](https://huggingface.co/LGAI-EXAONE/EXAONE-4.0-32B-GGUF); `mistralai/Ministral-3-14B-Instruct-2512-GGUF` — [Source](https://huggingface.co/mistralai/Ministral-3-14B-Instruct-2512-GGUF); `CohereLabs/tiny-aya-{global,earth,water}-GGUF` (reported by aggregators, availability partly unconfirmed) — [SECONDARY](https://huggingbay.xyz/artifact/hf-model-coherelabs-tiny-aya-global-gguf).
- Third-party quantizers observed hosting current Qwen3.5 GGUFs: `unsloth/Qwen3.5-{0.8B,2B,4B}-GGUF` ([collection](https://huggingface.co/collections/unsloth/qwen35)), `bartowski/Qwen_Qwen3.5-2B-GGUF` ([Source](https://huggingface.co/bartowski/Qwen_Qwen3.5-2B-GGUF)), `lmstudio-community/Qwen3.5-0.8B-GGUF` ([Source](https://huggingface.co/lmstudio-community/Qwen3.5-0.8B-GGUF)). Unsloth's cards note these use a hybrid Gated DeltaNet + gated attention architecture, so the llama.cpp build must support it.
- Kakao's HF org (`kakaocorp`) lists 31 repos. The page showed no GGUF file for the Kanana-2 text models — [Source](https://huggingface.co/kakaocorp).
- Qwen's GitHub release notice (dated 2026-03-02) says Qwen3.5 0.8B/2B/4B/9B are on HF Hub and ModelScope and points to repos ending in "GGUF"; I did not confirm an official `Qwen/Qwen3.5-*-GGUF` repo exists — [Source](https://github.com/QwenLM/Qwen3.8) — **UNVERIFIED** for the official GGUF repo names.
- Hugging Face model-card YAML `license:` tags were read directly for: Qwen3.5-9B `apache-2.0`; gpt-oss-20b `apache-2.0`; SmolLM3-3B `apache-2.0`; Gemma 4 12B QAT `apache-2.0`; Kanana 1.3B `kanana-open-license`; EXAONE and HyperCLOVA cards point to custom LICENSE files.

Suggested pipeline (method, not verified against current API docs in this pass):
1. Enumerate candidates with `huggingface_hub.HfApi().list_models(filter="gguf", author=<org>, sort="downloads")` for each trusted org (publisher orgs plus quantizers `unsloth`, `bartowski`, `lmstudio-community`, `ggml-org`). **UNVERIFIED** API details.
2. For each repo, read `cardData.license` and the LICENSE file. Store the verbatim license name and SHA of the file, since licenses change (Naver and LG both changed terms across versions).
3. Tag each record with: base model, publisher type (official / quantizer), file list and sizes, quantization types, context length from the card.
4. Flag any record where the card license and the LICENSE file disagree, or where the license is custom.

### Inferences
- Commercial-use filtering should key off the LICENSE file, not the YAML tag. Several vendors (Naver, LG, Kakao) use custom license tags.
- Quantizer GGUFs for a commercially restricted base model are themselves restricted. Redistribution is also covered by the base license (see Q2).

### Gaps
- Did not verify the current HF API parameters or rate limits.
- Did not check ggml-org or lmstudio-community coverage for each model in the requested list.

---

## Q2. Current small and mid-size models: license, commercial use, redistribution, attribution

### Takeaway
Among the requested models, the clean options for commercial use are Apache 2.0 (Qwen3.5, Gemma 4 core, Ministral 3, gpt-oss-20b, SmolLM3). Kakao's Kanana Open License allows building and running your own service, but requires a separate license for API/cloud resale, SI/on-prem, or on-device embedding. Naver's HyperCLOVA X SEED and LG's EXAONE 4.0 have restrictive terms (attribution and naming for Naver; non-commercial for LG). Cohere's Tiny Aya is CC-BY-NC-4.0 (non-commercial).

### Cited Findings

**Kakao Kanana (1.3B / 3B / 30B-A3B)**
- Kanana Open License Agreement (release date July 17, 2025), Kakao Corp. Grant: "non-exclusive, worldwide, non-transferrable, royalty-free limited license" to use, copy, distribute, modify, and make derivative works (Sec. 2.1). Applies only to the specific version it ships with (Sec. 2.4) — [Source](https://huggingface.co/kakaocorp/kanana-2-1.3b-instruct/blob/main/LICENSE) (read via summarizing fetch; quotes are close paraphrase of fetched text, not a verbatim copy).
- Commercial terms (Sec. 4): own-service use does not need a commercial license (Sec. 4.2). A separate commercial license from KAKAO is required to offer or resell access via API, cloud or other remote access; in SI or on-premise deployments; or embedded in on-device products. Commercial licenses are granted at KAKAO's "sole discretion" (Sec. 4.3). The text contains no MAU or revenue threshold.
- Attribution (Sec. 3.1): include a Notice file ("Kanana is licensed in accordance with the Kanana Open License Agreement"); display "Powered by Kanana" prominently; AI models created or distributed using Kanana outputs must use "Kanana" as a name prefix.
- Redistribution: pass use restrictions downstream, give recipients a copy of the Agreement, mark modified files, comply with KAKAO's Guidelines for Responsible AI. Sec. 9.4: no extracting, copying, distributing, modifying, or training new models from the weights unless the Agreement permits it. Outputs: KAKAO claims no rights (Sec. 5). Governing law: Republic of Korea; arbitration seated in Seoul (Sec. 11).
- The 1.3B and 3B model cards name the license as `kanana-open-license` / "KananaOpenLicense" — [Source](https://huggingface.co/kakaocorp/kanana-2-1.3b-instruct).
- **Conflict / unclear:** The 30B-A3B cards (base/instruct/thinking) say "Kanana License," not "Kanana Open License." I did not open those LICENSE files. Treat the 30B-A3B license as **UNVERIFIED** until read. A third-party summary (SECONDARY, not checked against the text) says a separate license is needed for API resale, on-device embedding, and more than 10M MAU. The Agreement text I read has no MAU threshold, so that summary may describe a different license version.
- Official GGUF: none seen for Kanana-2 text models on the Kakao org page — [Source](https://huggingface.co/kakaocorp). **UNVERIFIED** for 3B and 30B-A3B.

**Naver HyperCLOVA X SEED (14B Think checked; 0.5B / 1.5B / 32B not checked)**
- HyperCLOVA X SEED 14B Think Model License Agreement (release July 22, 2025), NAVER Corp. (IP holder) and NAVER Cloud Corp. (operator). Grant: non-exclusive, worldwide, non-transferable, revocable, royalty-free (Sec. 2.2) — [Source](https://huggingface.co/naver-hyperclovax/HyperCLOVAX-SEED-Think-14B/blob/main/LICENSE).
- Commercial conditions (Sec. 4): a license request to NAVER is required if (a) products have more than 10 million monthly active users in the preceding calendar month, or (b) you offer a product substantially similar to or directly competing with a NAVER product. NAVER may grant at its sole discretion; no rights until granted.
- Attribution (Sec. 3.1): "prominently display" the text "Powered by HyperCLOVA X" on related websites, UIs, blog posts, about pages or docs. Distributed copies need a Notice file. If the model or its outputs are used to create, train, fine-tune or improve a distributed AI model, the name must begin with "HyperCLOVA X."
- Redistribution: enforce the Prohibited Use Policy downstream, give recipients a copy of the Agreement, mark modified files. Sec. 3.2 allows adding your own terms to your modifications if they don't conflict. Derivative Models include distillation or synthetic data from the model (Sec. 1.2). NAVER may amend the Agreement at any time (Sec. 12). Governing law: Korea; Korean Commercial Arbitration Board, Seoul (Sec. 11).
- Note: the older HF discussion FAQ (about 1.5 years old, SECONDARY) describes the SEED models as commercial-free. This conflicts with the license text above. Use the LICENSE file.
- Official GGUF: none seen from Naver. The 14B/32B card lists safetensors and points to third-party quantizations — [Source](https://huggingface.co/naver-hyperclovax/HyperCLOVAX-SEED-Think-14B).

**LG EXAONE 4.0 (1.2B and 32B checked)**
- EXAONE AI Model License Agreement 1.2 - NC (Version 1.2, non-commercial) — [Source](https://huggingface.co/LGAI-EXAONE/EXAONE-4.0-32B/blob/main/LICENSE).
- Permitted: "solely for research and educational purposes" (Sec. 2.1(a)). Commercial use prohibited: "expressly prohibited from using the Model, Derivatives, or Output for any commercial purposes" (Sec. 3.1). Commercial exploitation needs a separate license from LG.
- Redistribution: only with a copy of the Agreement (Sec. 2.1(d)). Modified versions' names must begin with "EXAONE" (Sec. 2.1(c)).
- Attribution: publications or presentations must credit the Licensor and cite model name and version (Sec. 4.3).
- Restriction: may not use the Model, Derivatives, or Output to develop or improve models that compete with LG's models (Sec. 3.1).
- Governing law: Korea; KCAB arbitration, Seoul, in English (Sec. 8).
- Official GGUF: yes, `LGAI-EXAONE/EXAONE-4.0-32B-GGUF` — [Source](https://huggingface.co/LGAI-EXAONE/EXAONE-4.0-32B-GGUF). A `LGAI-EXAONE/EXAONE-4.0-1.2B-GGUF` repo also appears in listings (SECONDARY) — [Source](https://socket.dev/huggingface/package/lgai-exaone/exaone-4.0-1.2b-gguf?type=model). llama.cpp support per the EXAONE GitHub page requires build b5932 or later (SECONDARY, from search snippet).
- A ResearchGate listing says "CC BY-NC-ND 4.0." This conflicts with LG's license text. Use the LICENSE file.
- Commercial route: LG says it partnered with FriendliAI for a commercial API (SECONDARY).

**Google Gemma 4 (E2B / E4B / 12B / 26B-A4B / 31B)**
- The HF card tag is `apache-2.0` and links to Google's Gemma 4 license page — [Source](https://huggingface.co/google/gemma-4-12B-it-qat-q4_0-gguf). Google's blog says Gemma 4 is the first Gemmaverse release under OSI-approved Apache 2.0 — [Source](https://opensource.googleblog.com/2026/03/gemma-4-expanding-the-gemmaverse-with-apache-20.html).
- **Scope caveat (from secondary sources):** Apache 2.0 applies to the Gemma 4 core models. Earlier Gemma versions remain under the Gemma Terms of Use. I did not read the LICENSE file itself.
- Official GGUF: QAT Q4_0 GGUFs for E2B, E4B, 12B, 26B-A4B and 31B reported by search results; the 12B card confirmed one Q4_0 file of 6.98 GB and a 256K context window (1024-token sliding window) — [Source](https://huggingface.co/google/gemma-4-12B-it-qat-q4_0-gguf).

**Alibaba Qwen3.5 (0.8B / 2B / 4B / 9B)**
- Qwen3.5-9B card tag: `apache-2.0` — [Source](https://huggingface.co/Qwen/Qwen3.5-9B). Smaller sizes were not card-checked; **assume Apache 2.0 UNVERIFIED** for 0.8B/2B/4B.
- Official GGUF: not confirmed under the Qwen org (see Q1).

**Mistral Ministral 3 (3B / 8B / 14B)**
- Mistral's launch post says base, instruct and reasoning variants for each size are released under Apache 2.0 — [Source](https://mistral.ai/news/mistral-3/).
- The 14B GGUF card lists Apache 2.0 and adds a clause that the model must not be used in ways that infringe third-party rights, including IP — [Source](https://huggingface.co/mistralai/Ministral-3-14B-Instruct-2512-GGUF). Read this as an extra term on top of Apache 2.0, not a replacement for it.
- 8B license is from a SECONDARY aggregator (localmodel.run) saying Apache-2.0. Ministral 3 3B: **UNVERIFIED**.
- Official GGUF: yes for 14B and reportedly 8B/3B (Mistral collection page, SECONDARY).

**OpenAI gpt-oss-20b**
- Card tag `apache-2.0` — [Source](https://huggingface.co/openai/gpt-oss-20b). MoE weights are MXFP4; the card says it runs "within 16GB of memory." No on-disk size given.
- Official GGUF: not named on the card. "Browse Quantizations" lists 265 community builds. **UNVERIFIED** whether openai or ggml-org publishes the GGUF.

**HuggingFace SmolLM3-3B**
- Card tag `apache-2.0` — [Source](https://huggingface.co/HuggingFaceTB/SmolLM3-3B). Official quantized checkpoints in a HuggingFaceTB collection cover llama.cpp, ONNX, MLX; the page does not say "GGUF" explicitly — **UNVERIFIED** GGUF format.
- Languages: six natively supported (English, French, Spanish, German, Italian, Portuguese). Korean is not listed. This matters for Korean use.

**Cohere Tiny Aya (3.35B, global / earth / water variants)**
- CC-BY-NC-4.0 per Cohere's model overview and the Kaggle card, which says commercial inquiries go to Cohere Sales — [Source](https://cohere.com/models-overview). Acceptable-use policy also applies. Cohere calls it "open-weight," not open source.
- Official GGUFs: `CohereLabs/tiny-aya-{global,earth,water}-GGUF` reported with CC-BY-NC-4.0 (SECONDARY). One aggregator reported the global GGUF page as temporarily unavailable. Check HF directly.

**Not checked in this pass (gaps):** IBM Granite 4.x license and GGUF (expected Apache 2.0 — **UNVERIFIED**); Microsoft Phi-4-mini (MIT expected — **UNVERIFIED**); Kanana-2 3B and 30B-A3B LICENSE text; HyperCLOVA X SEED 0.5B, 1.5B, 32B LICENSE text (the 14B Think agreement is assumed to apply across the family — **UNVERIFIED**); EXAONE 4.0 1.2B LICENSE file (the GGUF card reportedly shares the NC license — SECONDARY).

### Inferences
- Commercial-friendly shortlist by license (verified or card-level): Qwen3.5 (Apache 2.0, card-verified for 9B only), Gemma 4 core (Apache 2.0 card + Google blog), Ministral 3 (Apache 2.0 with an extra non-infringement clause on 14B), gpt-oss-20b (Apache 2.0), SmolLM3 (Apache 2.0, but no Korean).
- Commercial with conditions: Kanana (own-service ok; API/on-device/SI need license; "Powered by Kanana"), HyperCLOVA X SEED (display "Powered by HyperCLOVA X"; 10M MAU or competitor clause).
- Non-commercial: EXAONE 4.0 (any commercial use needs an LG license); Tiny Aya (CC-BY-NC).
- Redistributing a quantized GGUF inherits all of the above, including attribution and copy-of-license obligations.

### Gaps
- Exact LICENSE text for Gemma 4, Qwen3.5 (smaller sizes), Kanana-2 3B and 30B-A3B, HyperCLOVA SEED 0.5B/1.5B/32B, and Ministral 3 3B/8B were not read directly.
- No verification of the "Kanana License" name variation for 30B-A3B.

---

## Q3. Official GGUF vs. third-party conversions (summary table)

| Model | Official publisher GGUF seen? | Source | Notes |
|---|---|---|---|
| Gemma 4 (12B QAT) | Yes (Q4_0, 6.98 GB) | [HF](https://huggingface.co/google/gemma-4-12B-it-qat-q4_0-gguf) | Other sizes reported (SECONDARY) |
| EXAONE 4.0 32B / 1.2B | Yes (32B confirmed) | [HF](https://huggingface.co/LGAI-EXAONE/EXAONE-4.0-32B-GGUF) | 1.2B reported (SECONDARY) |
| Ministral 3 14B | Yes | [HF](https://huggingface.co/mistralai/Ministral-3-14B-Instruct-2512-GGUF) | 8B/3B reported (SECONDARY) |
| Tiny Aya | Yes, reported | [SECONDARY](https://huggingbay.xyz/artifact/hf-model-coherelabs-tiny-aya-global-gguf) | Availability unconfirmed |
| Qwen3.5 0.8B–9B | Not confirmed; quantizers (unsloth, bartowski, lmstudio-community) confirmed | [unsloth](https://huggingface.co/collections/unsloth/qwen35) | Qwen GitHub implies official GGUF repos exist — UNVERIFIED |
| gpt-oss-20b | Not confirmed | [HF](https://huggingface.co/openai/gpt-oss-20b) | 265 community quantizations listed |
| SmolLM3-3B | Not confirmed | [HF](https://huggingface.co/HuggingFaceTB/SmolLM3-3B) | Format unclear on card |
| Kanana-2 (text) | No GGUF seen | [HF](https://huggingface.co/kakaocorp) | UNVERIFIED for all sizes |
| HyperCLOVA X SEED | No Naver GGUF seen; third-party quantizations exist | [HF](https://huggingface.co/naver-hyperclovax/HyperCLOVAX-SEED-Think-14B) | |
| Granite 4.x, Phi-4-mini | Not checked | — | Gap |

---

## Q4. Real measured Korean-language performance

### Takeaway
Real Korean numbers exist, but almost all of them are vendor-reported on vendor-chosen settings. The only KMMLU/HAE-RAE rows I could check come from Kakao, Naver and LG model cards. No independent small-model Korean leaderboard was found in this pass. For a decision, run a fixed harness locally.

### Cited Findings

**Kakao Kanana-2 1.3B** (vendor model card; eval source is the card itself, so vendor-reported) — [Source](https://huggingface.co/kakaocorp/kanana-2-1.3b-instruct)
- Instruct: KoMT-Bench 6.54 (judge gpt-4o-2024-08-06); KMMLU-CoT acc 42.79; HAERAE-Bench v1.0 CoT acc 44.89; KoSimpleQA acc 17.81. Greedy decoding, max 4096 tokens.
- Base (5-shot unless noted): KMMLU acc 44.17; HAE-RAE Bench v1.0 acc 75.34; KoSimpleQA 28.50 (10-option MCQA); MATH-Ko 24.75 (4-shot); MBPP-Ko 39.38 (3-shot, internally translated).
- A BenchLM aggregator lists Kanana-2 3B Instruct at 43.3% and 1.3B Instruct at 42.8% on KMMLU, described as self-reported (SECONDARY) — [Source](https://benchlm.ai/leaderboards/korean-benchmarks). Note: the 1.3B instruct KMMLU-CoT value (42.79) matches this aggregator closely. The aggregator's values were not checked against the card.

**Naver HyperCLOVA X SEED 14B Think** (vendor-reported, no eval method described) — [Source](https://huggingface.co/naver-hyperclovax/HyperCLOVAX-SEED-Think-14B)
- Non-think Korean suite: CLIcK 0.7208, HAERAE-Bench 0.8506, KOBEST 0.8570, KorMedMCQA 0.6411, KMMLU 0.5428, KoBigBench 0.7482, KoCommonGEN-v2 0.6682. Compared with Qwen3-8B (KMMLU 0.5543) and Qwen3-14B (KMMLU 0.5864).
- Think-mode Korean suite: KMMLU 0.6649, CSAT-ko-2025 0.7516, KorMedMCQA 0.6933, KoBALT 0.4500, HAERAE 0.8537, CLIcK 0.7280, KoBigBench 0.7974, LogicKor 8.74. Qwen3-8B LogicKor 8.92; Qwen3-14B 9.15.
- **Internal inconsistency flagged:** the Qwen3-14B KMMLU value differs between the non-think table (0.5864) and the think table (0.4930) on the same card. Treat the comparisons with caution.

**LG EXAONE 4.0** (developer-reported, no eval method on the card) — [Source](https://huggingface.co/LGAI-EXAONE/EXAONE-4.0-32B)
- 32B reasoning: KMMLU-Pro 67.7, KMMLU-Redux 72.7, KSM 87.6 (Qwen3 32B: 61.4 / 67.5 / 82.8; Qwen3 235B: 68.1 / 74.5 / 86.2).
- 32B non-reasoning: KMMLU-Pro 60.0, KMMLU-Redux 64.8, KSM 59.8, Ko-LongBench 76.9 (Qwen3 32B: 58.3 / 64.4 / 41.3 / 73.9).
- 1.2B reasoning: KMMLU-Pro 42.7, KMMLU-Redux 46.9, KSM 60.6. 1.2B non-reasoning: KMMLU-Pro 37.5, KMMLU-Redux 40.4, KSM 26.3, Ko-LongBench 69.8. Comparators: Qwen3 1.7B reasoning KMMLU-Pro 38.3, SmolLM3 3B 30.5; non-reasoning Qwen3 1.7B 29.5, SmolLM3 3B 27.6.
- Context length stated on the 32B card: 131,072 tokens.

**Qwen3.5-9B, Gemma 4 12B, gpt-oss-20b, SmolLM3-3B**
- No Korean-specific benchmark found on their cards. Qwen3.5-9B's multilingual figures (not Korean-specific): MMMLU 81.2, MMLU-ProX 76.3 (29-language average), INCLUDE 75.6, WMT24++ 72.6 (55-language average) — [Source](https://huggingface.co/Qwen/Qwen3.5-9B). Gemma 4 12B card: MMMLU and audio benchmarks only, no Korean breakout — [Source](https://huggingface.co/google/gemma-4-12B-it-qat-q4_0-gguf). gpt-oss-20b card lists GPQA and SWE-bench (more benchmarks collapsed; not fully checked) — [Source](https://huggingface.co/openai/gpt-oss-20b).

**Independent / aggregated boards**
- BenchLM (self-reported aggregator, Oct 2026 snapshot): KMMLU listing shows only 2 models with published results for small Kanana-2 variants — [Source](https://benchlm.ai/leaderboards/korean-benchmarks). Not independent.
- W&B `llm-leaderboard-korean` (older snapshot; GPT-5.1 top on KMMLU at 83.65% 0-shot; mostly proprietary large models) — [Source](https://github.com/wandb/llm-leaderboard-korean). Not a small-model comparison.
- `daekeun-ml/evaluate-llm-on-korean-dataset` runs KMMLU, CLIcK, HAE-RAE, HRM8K, KoBALT, KorMedMCQA with a fixed harness — [Source](https://github.com/daekeun-ml/evaluate-llm-on-korean-dataset). Usable for local runs.
- KMMLU paper (45 categories, 35,030 instances) — [Source](https://arxiv.org/html/2402.11548v2).

### Inferences
- On the vendor numbers, EXAONE 4.0 1.2B and Kanana-2 1.3B are both in the 40–47% KMMLU range (different harnesses and metrics: KMMLU-Pro/Redux for EXAONE, KMMLU-CoT/base for Kanana), so they are not directly comparable.
- The vendor-reported gap between a native-Korean model and a general small model is large on KMMLU-Pro/Redux and Ko-LongBench (EXAONE 1.2B 69.8 vs SmolLM3 3B 15.7; Qwen3 1.7B 57.1 on Ko-LongBench). SmolLM3 has no Korean support per its card, which fits this.
- HyperCLOVA X SEED 14B's own claims on HAERAE and KOBEST are high, but its KMMLU numbers are close to Qwen3-8B and Qwen3-14B, so its Korean advantage is mostly in cultural/HAERAE-style suites.

### Gaps
- No independent, same-harness Korean comparison for sub-4B models was found in this pass.
- Open Ko-LLM leaderboard (Upstage/Hugging Face) was not checked in this pass. **UNVERIFIED** whether it is current.
- Horangi framework was mentioned in one search result (KMMLU, KMMLU-Pro, HAE-RAE bundle). **UNVERIFIED**.

---

## Q5. RAM at Q4_K_M, 4k and 16k context, CPU-only

### Takeaway
No measured llama.cpp CPU RAM table for the requested models was found. Estimates below are formula-based and must be measured before use. The main determinants are the GGUF file size (weights) and the KV cache, which scales with context length and layer/head counts.

### Cited Findings
- KV cache (FP16) at 16k for an 8B Llama-3.1-class model is about 2 GB (8 KV heads × 128 dims × K and V × 2 bytes × 32 layers ≈ 128 KB per token). Source: estimates from [SitePoint](https://www.sitepoint.com/kv-cache-survival-guide-local-llms/) and [CanRun](https://canrunllm.com/guides/kv-cache-context) (SECONDARY). CanRun's table also lists 9.0 GB at 16k for f16, which conflicts by about 4× and is probably a labeling error.
- Q4_K_M weight size for 8B-class: roughly 4.6–4.9 GB across sources (SECONDARY).
- Gemma 4 12B QAT Q4_0 file: 6.98 GB on disk ([HF card](https://huggingface.co/google/gemma-4-12B-it-qat-q4_0-gguf)). This is Q4_0 QAT, not Q4_K_M, so do not compare directly.
- gpt-oss-20b: MXFP4 MoE weights, card claims "within 16GB of memory" ([HF card](https://huggingface.co/openai/gpt-oss-20b)).

### Inferences (method, not measurement)
- Peak RSS ≈ GGUF file size + KV cache (2 × layers × kv_heads × head_dim × bytes × context) + compute buffers and runtime overhead (several hundred MB to ~1 GB on CPU; **estimate, UNVERIFIED**).
- Context at 4k is about one quarter of the 16k KV cost. For 16k with FP16 cache, KV cost is roughly 2 GB for an 8B-class dense model with GQA; smaller models (0.8B–4B) have fewer layers and KV heads, so they need less, but the exact value depends on each model's config.json, which I did not read.
- Measurement method: run `llama-cli` or `llama-server` with `-c 4096` and `-c 16384` on the CPU build, read `llama_kv_cache` and `model buffer size` lines from the startup log, then check process RSS. This is the method the notes recommend. Caveat: the search found only a DeepSeek R1 Mac Metal log, which is not comparable.

### Gaps
- No measured Q4_K_M RAM figures for any model in the requested list.
- The layer/head counts for each model (from config.json) were not read, so per-model KV estimates are not given.

---

## Q6. Tools and methods to compare models for a language

### Cited Findings
- BenchLM Korean boards (self-reported; not independent) — [Source](https://benchlm.ai/leaderboards/korean-benchmarks), [Source](https://benchlm.ai/best/korean-llm).
- W&B `llm-leaderboard-korean` — [Source](https://github.com/wandb/llm-leaderboard-korean). Older snapshot.
- `evaluate-llm-on-korean-dataset` (KMMLU, CLIcK, HAE-RAE, HRM8K, KoBALT, KorMedMCQA) — [Source](https://github.com/daekeun-ml/evaluate-llm-on-korean-dataset).
- KMMLU paper and dataset — [Source](https://arxiv.org/html/2402.11548v2).
- Per-card vendor tables (Kanana, HyperCLOVA SEED, EXAONE, Qwen3.5) as listed in Q4.

### Inferences
- Use a single local harness with fixed settings (same prompt template, few-shot count, temperature, max tokens, and quant level). Vendor tables mix CoT, few-shot, reasoning and non-reasoning modes, so they cannot be ranked against each other.
- Quantization changes Korean scores. Test the exact GGUF you will ship, not the BF16 card number. Korean tokenization also changes effective context: check the tokens-per-character ratio in the target model's tokenizer.

### Gaps
- Open Ko-LLM leaderboard status not verified.
- No public per-quant Korean result for these models was found.

---

## Recommendation scaffold by tier (provisional; not a final recommendation)

Based only on what was verified above. Edit once the gaps are closed.

- **Commercial-safe, general multilingual, small (≤ 4B):** Qwen3.5 0.8B/2B/4B (Apache 2.0 for 9B verified; smaller sizes UNVERIFIED; official GGUF unconfirmed, quantizers available), Ministral 3 3B (UNVERIFIED license, GGUF unconfirmed). Korean quality: no independent data; test locally.
- **Commercial-safe, mid (8B–14B):** Gemma 4 12B QAT GGUF (Apache 2.0 card; official Q4_0 6.98 GB), Ministral 3 8B/14B (Apache 2.0 with an extra IP clause on 14B; official GGUF on 14B).
- **Korean-first with commercial conditions:** Kanana-2 1.3B (own-service commercial allowed; "Powered by Kanana"; API/on-device/SI need license; vendor KMMLU-CoT 42.79). HyperCLOVA X SEED 14B Think (commercial with "Powered by HyperCLOVA X" and 10M MAU/competitor clauses; vendor KMMLU-Think 0.6649 and HAERAE 0.8537; no official Naver GGUF).
- **Korean-first, non-commercial only:** EXAONE 4.0 1.2B and 32B (official GGUF; NC license; vendor KMMLU-Redux 40.4 for 1.2B non-reasoning and 72.7 for 32B reasoning). Use only for research or education, or buy a commercial license from LG.
- **Not commercial:** Tiny Aya (CC-BY-NC-4.0).

## Overall gaps and confidence
- High confidence: the license texts for Kanana (1.3B), HyperCLOVA SEED 14B Think, and EXAONE 4.0 32B (read directly). Their Korean benchmark tables (vendor-reported).
- Medium: Gemma 4 and Qwen3.5-9B licenses (card tags and vendor posts, not LICENSE files). Official GGUF status for Qwen3.5 and gpt-oss.
- Low: Granite 4.x, Phi-4-mini, Ministral 3 3B, Kanana 3B/30B-A3B license text, HyperCLOVA SEED small sizes, all RAM measurements, and independent Korean benchmarks for small models.
- Sources that are SECONDARY (blogs, aggregators, search snippets) are marked inline. Do not cite them as primary.
