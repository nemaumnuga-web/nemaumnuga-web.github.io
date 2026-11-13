# Korean-Language Benchmarks for Small/Mid Local LLMs (as of late 2026)

Scope: models runnable locally at about 1B–4B (8 GB CPU) and 7B–32B (16–32 GB). Research run on 2026-11-13. Search coverage was limited (about 14 tool calls), so several requested models have no sourced Korean numbers. Those are marked as gaps.

Labels used below:
- **[VENDOR]** = score published by the model's developer on its own model card or blog, with the developer's own eval setup.
- **[INDEPENDENT]** = score from a third party or academic paper not affiliated with the model developer. None was found for the specific models in this table.

---

## 1. Which Korean benchmarks exist and are active in 2026?

### Takeaway
KMMLU (and its LG-maintained successors KMMLU-Redux and KMMLU-Pro) is the benchmark most model cards report in 2026. Open Ko-LLM Leaderboard is documented in a 2024 paper and a Leaderboard2 follow-up, but I found no 2026 evidence that the official leaderboard is actively updated. Human-preference arenas for Korean chat small models were not found as active. HAE-RAE and KoMT-Bench still appear in 2026 Kakao cards.

### Cited Findings
- KMMLU: 35,030 expert-level multiple-choice questions across 45 subjects, drawn from Korean exams. In the original paper, the best publicly available model scored 50.54% against 62.6% average human performance; GPT-4 scored 59.95%. [KMMLU paper](https://arxiv.org/pdf/2402.11548)
- KMMLU-Redux and KMMLU-Pro are LG AI Research follow-ups. KMMLU-Pro uses 2,822 problems from Korean professional-license exams. The original paper's authors note that "KMMLU-REDUX" and "KMMLU-PRO" correct errors in the original. [KMMLU paper](https://arxiv.org/pdf/2402.11548); [LG EXAONE 4.0 model card](https://huggingface.co/LGAI-EXAONE/EXAONE-4.0-1.2B) (names both variants)
- Open Ko-LLM Leaderboard was introduced in an ACL 2024 paper. A follow-up, "Open Ko-LLM Leaderboard2," exists. A longitudinal study tracked 1,769 models over eleven months. [ACL 2024 paper](https://preview.aclanthology.org/setup/2024.acl-long.177); [Leaderboard2 review](https://www.themoonlight.io/review/open-ko-llm-leaderboard2-bridging-foundational-and-practical-evaluation-for-korean-llms)
- Benchmarklist.com shows Open Ko-LLM scores dated May 6, 2026, but these are secondhand aggregator snapshots and cover mostly older Llama-3-era Korean fine-tunes. [Benchmarklist snapshot](https://benchmarklist.com/benchmarks/open_ko_llm_leaderboard/)
- HAE-RAE Bench and KoMT-Bench are still reported in 2026 Kakao model cards (Kanana-2). KoMT-Bench is judged by gpt-4o-2024-08-06. [Kanana-2 3B Instruct card](https://huggingface.co/kakaocorp/kanana-2-3b-base) (base card covers HAE-RAE; instruct card covers KoMT-Bench)
- KoBALT is a Korean linguistics benchmark that validates scores against a 95-annotator human preference study. [KoBALT](https://arxiv.org/html/2505.16125v1)
- KUDGE is a Korean LLM-as-judge benchmark with 5,012 human annotations. [Search result lead, not fetched](https://huggingface.co/blog/amphora/navigating-ko-llm-research-2)
- Ko-Chatbot-Arena is no longer active, but its preference data remains on Hugging Face. [Search result lead](https://arxiv.org/pdf/2403.04132)

### Inferences
- In 2026, KMMLU family plus KoMT-Bench (LLM-judge) appear to be the de facto Korean benchmark set in vendor cards. Open Ko-LLM is not visibly used by 2026 model cards.
- No current human-preference arena for small Korean chat models was found.

### Gaps
- Whether the official Open Ko-LLM leaderboard is still updated in 2026. The Hugging Face space was not fetched.
- A current, active Korean human-preference arena. Only defunct or research-only resources were found.
- KoBEST and Ko-MT-Bench (the original) were not searched for 2026 status.

---

## 2. Model scores and source type

### Takeaway
The only Korean-benchmark numbers retrieved with enough detail are from vendor model cards. There are no independent 2026 Korean scores for the requested models at this size in what I could find. The EXAONE 4.0 1.2B and 32B figures and the Kanana-2 3B/1.3B figures are the most usable.

### Table: Korean benchmark results retrieved

| Model (size) | Benchmark | Score | Source type | Source |
|---|---|---|---|---|
| EXAONE 4.0 32B (reasoning) | KMMLU-Pro | 67.7 | [VENDOR] LG AI Research | [EXAONE 4.0 1.2B card](https://huggingface.co/LGAI-EXAONE/EXAONE-4.0-1.2B) (table: 32B Reasoning) |
| EXAONE 4.0 32B (reasoning) | KMMLU-Redux | 72.7 | [VENDOR] | same |
| EXAONE 4.0 32B (reasoning) | KSM | 87.6 | [VENDOR] | same |
| EXAONE 4.0 32B (non-reasoning) | KMMLU-Pro | 60.0 | [VENDOR] | same (table: 32B Non-Reasoning) |
| EXAONE 4.0 32B (non-reasoning) | KMMLU-Redux | 64.8 | [VENDOR] | same |
| EXAONE 4.0 32B (non-reasoning) | KSM | 59.8 | [VENDOR] | same |
| EXAONE 4.0 32B (non-reasoning) | Ko-LongBench | 76.9 | [VENDOR] | same |
| EXAONE 4.0 1.2B (reasoning) | KMMLU-Pro | 42.7 | [VENDOR] | same (table: 1.2B Reasoning) |
| EXAONE 4.0 1.2B (reasoning) | KMMLU-Redux | 46.9 | [VENDOR] | same |
| EXAONE 4.0 1.2B (reasoning) | KSM | 60.6 | [VENDOR] | same |
| EXAONE 4.0 1.2B (non-reasoning) | KMMLU-Pro | 37.5 | [VENDOR] | same (table: 1.2B Non-Reasoning) |
| EXAONE 4.0 1.2B (non-reasoning) | KMMLU-Redux | 40.4 | [VENDOR] | same |
| EXAONE 4.0 1.2B (non-reasoning) | KSM | 26.3 | [VENDOR] | same |
| EXAONE 4.0 1.2B (non-reasoning) | Ko-LongBench | 69.8 | [VENDOR] | same |
| Kanana-2 3B Base | KMMLU (5-shot) | 47.92 | [VENDOR] Kakao | [Kanana-2 3B Base card](https://huggingface.co/kakaocorp/kanana-2-3b-base) |
| Kanana-2 3B Base | HAE-RAE Bench v1.0 (5-shot) | 80.66 | [VENDOR] | same |
| Kanana-2 3B Base | KoSimpleQA (5-shot, 10-option MCQA) | 32.50 | [VENDOR] | same |
| Kanana-2 3B Base | MATH-Ko (4-shot) | 31.54 | [VENDOR] | same |
| Kanana-2 3B Base | MBPP-Ko (3-shot) | 44.55 | [VENDOR] | same |
| Kanana-2 1.3B Base | KMMLU (5-shot) | 44.17 | [VENDOR] | same |
| Kanana-2 1.3B Base | HAE-RAE Bench v1.0 (5-shot) | 75.34 | [VENDOR] | same |
| Kanana-2 1.3B Base | KoSimpleQA | 28.50 | [VENDOR] | same |
| Kanana-2 1.3B Base | MATH-Ko | 24.75 | [VENDOR] | same |
| Kanana-2 1.3B Base | MBPP-Ko | 39.38 | [VENDOR] | same |
| Kanana-2 3B Instruct | KoMT-Bench (gpt-4o judge) | 6.92 | [VENDOR] | [Kanana-2 3B Base page](https://huggingface.co/kakaocorp/kanana-2-3b-base) (instruct tables on the same page) |
| Kanana-2 3B Instruct | KMMLU-CoT | 43.32 | [VENDOR] | same |
| Kanana-2 3B Instruct | HAERAE-Bench v1.0-CoT | 43.75 | [VENDOR] | same |
| Kanana-2 3B Instruct | KoSimpleQA | 22.29 | [VENDOR] | same |
| Kanana-2 1.3B Instruct | KoMT-Bench | 6.54 | [VENDOR] | same |
| Kanana-2 1.3B Instruct | KMMLU-CoT | 42.79 | [VENDOR] | same |
| Kanana-2 1.3B Instruct | HAERAE-Bench v1.0-CoT | 44.89 | [VENDOR] | same |
| Kanana-2 1.3B Instruct | KoSimpleQA | 17.81 | [VENDOR] | same |
| Qwen3-1.7B-Base (comparison in Kanana card) | KMMLU (5-shot) | 43.08 | [VENDOR] as reproduced by Kakao | Kanana-2 3B Base card |
| Qwen3-1.7B-Base (comparison) | HAE-RAE v1.0 (5-shot) | 55.54 | [VENDOR] as reproduced by Kakao | same |
| Qwen3-1.7B (comparison) | KoMT-Bench | 5.29 | [VENDOR] as reproduced by Kakao | Kanana-2 instruct card |
| Qwen3.5-2B (comparison) | KoMT-Bench | 5.21 | [VENDOR] as reproduced by Kakao | Kanana-2 instruct card |
| Qwen3.5-2B (comparison) | KMMLU-CoT | 41.75 | [VENDOR] as reproduced by Kakao | same |
| Qwen3.5-2B (comparison) | HAERAE-Bench CoT | 27.84 | [VENDOR] as reproduced by Kakao | same |
| HyperCLOVA X SEED 1.5B | KMMLU, HAE-RAE, CLiCK, KoBEST | "higher than Qwen2.5-1.5B-Instruct and Gemma 3 1B-IT on all four" (no per-benchmark numbers retrieved) | [VENDOR] Naver | [Naver Clova blog, Apr 2025](https://clova.ai/en/tech-blog/sowing-the-seeds-in-the-ai-ecosystem-introducing-hyperclova-x-seed-a-commercial-open-source-ai) |
| HyperCLOVA X SEED 3B (VLM) | Average of nine Korean/English-vision benchmarks | 59.54 | [VENDOR] Naver | same |
| Trillion-7B | KMMLU | 48.09 | [VENDOR] Trillion Labs (own technical report) | [Trillion 7B report](https://arxiv.org/pdf/2504.15431) |
| Trillion-7B (same table) | KMMLU, comparison | Qwen2.5 50.15; EXAONE-3.5 45.39 | [VENDOR] Trillion Labs | same |

Notes on the table:
- EXAONE 4.0 figures: an earlier search gave conflicting numbers (72.7 vs. 64.8, and 67.7 vs. 60.0). The card resolves this. The higher values are the **reasoning** variant and the lower values are the **non-reasoning** variant, at 32B and at 1.2B.
- A search listing of "EXAONE 4.0 32B KMMLU 75.2" from Wizwand is undated and has no stated method. I did not use it.
- Kanana-2 3B: Kakao's own model card lists base and instruct results. The card does not show 0.9B results. The 0.9B model is named in the series, but the search snippets said only 3B and 1.3B are publicly released. The base card's "0.9B" column is "Not in card."
- The Trillion-7B table (KMMLU 48.09) is from the 7B technical report. The Trida-7B model card gives 50.28 or 46.35 for a different (diffusion) model derived from Tri-7B, and it is not a Tri-7B score. Not used in the table.

### Inferences
- The EXAONE 4.0 1.2B non-reasoning KMMLU-Redux (40.4) and the Kanana-2 1.3B base KMMLU (44.17) are close to each other, but they use different setups (reasoning or CoT vs. 5-shot base). These numbers are not directly comparable.
- Every row above is vendor-reported. Comparison rows (e.g., Qwen3-1.7B) were reproduced by the vendor under the vendor's harness, so they are not independent either.

### Gaps
- **Qwen3.5 2B/4B:** No Korean scores found. The Qwen3.5-4B Hugging Face "Eval Results" tab was not successfully read. Search only found mirrors and quantizations. [Qwen3.5-2B search result](https://deepinfra.com/Qwen/Qwen3.5-2B)
- **Qwen3.5 7B–32B, Gemma 4 (all sizes), Ministral 3, SmolLM3, Granite:** not searched. No Korean benchmark numbers retrieved.
- **Solar (Upstage):** not searched. No numbers.
- **Trillion Tri-7B (2026 release):** No official KMMLU found. The official model card was not fetched.
- **HyperCLOVA X SEED 4B (June 2026):** Naver's blog says it shows "large gains on Korean benchmarks," but no numbers were retrieved. [Naver blog, Jun 2026](https://clova.ai/en/tech-blog/seeing-and-hearing-the-field-for-ourselves-building-our-own-encoders-and-hyperclova-x-seed-4b)
- **Kanana-2 HAE-RAE and KMMLU vs. Gemma/Qwen at 3B:** no Gemma comparison was retrieved.

---

## 3. Gap between Korean-specialized and multilingual models at the same size?

### Takeaway
No independent 2026 evaluation was found that isolates this comparison. Vendor cards show Korean-specialized models ahead of multilingual rivals on Korean benchmarks at about the same size, but the comparisons are chosen and run by the vendor. The earliest independent evidence (KMMLU, 2024) found that Korean-tailored models of that era performed far worse than the best public multilingual model.

### Cited Findings
- KMMLU (2024, independent authors): the best public model at the time was trained primarily on English and Chinese, not Korean. Korean-tailored models such as Polyglot-Ko "perform far worse." [KMMLU paper](https://arxiv.org/pdf/2402.11548)
- HyperCLOVA X SEED 1.5B [VENDOR] beat Qwen2.5-1.5B-Instruct and Gemma 3 1B-IT on KMMLU, HAE-RAE, CLiCK and KoBEST. [Naver blog](https://clova.ai/en/tech-blog/sowing-the-seeds-in-the-ai-ecosystem-introducing-hyperclova-x-seed-a-commercial-open-source-ai)
- Kanana-2 3B Base [VENDOR] scores 47.92 KMMLU and 80.66 HAE-RAE, versus Qwen3-1.7B-Base at 43.08 and 55.54 (reproduced by Kakao). [Kanana-2 3B Base card](https://huggingface.co/kakaocorp/kanana-2-3b-base)
- Elice (June 2025) compared six Korean lightweight LLMs with lm-evaluation-harness. It is not a human-preference arena, and its independence is unclear. [Elice report lead](https://elice.io/resources/blog/llm-benchmark-korea-elice) (not fetched)

### Inferences
- The vendor evidence points to a Korean advantage at 1–3B on KMMLU and HAE-RAE, but this could reflect harness choices, prompt formats, or cherry-picked comparison models.
- For EXAONE 4.0, the vendor does not compare against Qwen3.5 in the retrieved text, so no head-to-head vs. the current multilingual generation is available.

### Gaps
- No independent 2026 head-to-head at matched size (1–4B or 7–32B).
- No current Gemma 4 / Qwen3.5 / Ministral 3 Korean numbers to compare against.

---

## 4. Korean tokenizer efficiency

### Takeaway
Published Korean token-efficiency measurements exist, but they are old, use different corpora, and do not cover the 2026 model tokenizers. The Kakao claim of a 30%+ improvement is vendor-reported and not reproduced by a third party. No per-character table across current tokenizers was found.

### Cited Findings
- EEVE-Korean (2024): on a 6.7 GB Korean corpus, SOLAR's tokenizer needed 3.1B tokens, the expanded Korean tokenizer needed 1.6B (about half), and Phi-2 needed 5.6B. Authors' own measurement on their corpus. [EEVE-Korean arXiv](https://arxiv.org/pdf/2402.14714)
- Thunder-Tok (2025): reports about 10% fewer tokens per word than BPE, without hurting downstream results. The metric is tokens per word (fertility), not per character. [Thunder-Tok arXiv](https://arxiv.org/abs/2506.15138)
- "Korean Penalty of Large Language Models Derived by the Tokenizer" (ICICPE 2024): defines a Korean-to-English token ratio on FLORES-200 parallel text and finds the disadvantage grows with the character-length ratio. [ICICPE 2024 PDF](https://hiai.korea.ac.kr/wp-content/uploads/2024/12/Korean-Penalty-of-Large-Language-Models-Derived-by-the-Tokenizer_ICICPE_2024.pdf)
- OpenAI community forum (2023, anecdotal): Korean needed about 3–5× as many tokens as English under older BPE tokenizers, roughly one token per Hangul character on the GPT-3.5/4 tokenizer. [OpenAI forum](https://community.openai.com/t/need-more-efficient-tokenizer-for-korean/286682)
- Kanana-2 model card [VENDOR]: "Improves Korean tokenization efficiency by over 30% compared to the previous generation." No per-model figures. [Kanana-2 3B Base card](https://huggingface.co/kakaocorp/kanana-2-3b-base)

### Inferences
- Korean-specific vocabulary expansion roughly halves token counts in the one controlled measurement found (EEVE).
- Multilingual tokenizers without Korean vocabulary are materially less efficient on Korean. The size of that penalty for 2026 tokenizers is not measured in what I found.

### Gaps
- **Tokens per Hangul character or per sentence for Qwen3.5, Gemma 4, Ministral 3, SmolLM3, Granite, EXAONE 4.0, HyperCLOVA X SEED, Solar, Trillion: no published measurement retrieved.** Direct measurement with each model's tokenizer on a fixed Korean corpus would be needed.

---

## 5. Do Korean-specialized small models beat multilingual ones on real Korean chat tasks?

### Takeaway
Only vendor evidence was found. Kakao's Kanana-2 3B Instruct reports a KoMT-Bench score of 6.92 against 5.21 (Qwen3.5-2B) and 5.29 (Qwen3-1.7B), with gpt-4o as judge. That is a single LLM-judge benchmark, run by the vendor, with no human preference study. No independent Korean chat arena result for these small models was found.

### Cited Findings
- Kanana-2 3B Instruct KoMT-Bench 6.92; Qwen3.5-2B 5.21; Qwen3-1.7B 5.29; judge gpt-4o-2024-08-06. [Kanana-2 card](https://huggingface.co/kakaocorp/kanana-2-3b-base)
- Kakao also reports a Korean safety evaluation (Assur AI) with both Kanana-2 models ranked first against comparable global models. Vendor-run. [Kakao press release](https://www.kakaocorp.com/page/detail/12102) (also reported by [Herald](https://biz.heraldcorp.com/article/10843689))
- KoBALT ties its scores to a 95-annotator human preference study, but it is a linguistics benchmark, not a chat-arena result for small Korean models. [KoBALT](https://arxiv.org/html/2505.16125v1)

### Inferences
- The strongest current claim (Kanana-2 3B > Qwen3.5-2B on KoMT-Bench) is vendor-reported on a single LLM-judge benchmark. It should not be treated as proof of better Korean chat quality.

### Gaps
- No independent human-preference or arena result for 2026 Korean-specialized small models.
- No independent replication of KoMT-Bench for Kanana-2.

---

## Source-type summary

- Independent sources: KMMLU paper (2024), Open Ko-LLM Leaderboard paper (2024), KoBALT (2025), EEVE-Korean (2024), Thunder-Tok (2025), ICICPE 2024 Korean Penalty paper, OpenAI forum (anecdotal, 2023).
- Vendor-reported: all EXAONE 4.0, Kanana-2, HyperCLOVA X SEED, and Trillion-7B scores above, including the comparison rows reproduced by the vendor.
- Aggregator or unverified: Benchmarklist.com snapshots (dated May 2026, secondhand); Wizwand EXAONE 75.2 (unexplained); Trida-7B card KMMLU values (different model).
