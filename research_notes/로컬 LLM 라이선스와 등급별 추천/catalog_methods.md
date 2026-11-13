# Methods for Building and Maintaining a Worldwide Local-LLM Catalog

Research date: 2026-11-13. Budget: about 13 tool calls, so coverage is partial. Items marked **[verified]** were read from the cited page. **[secondary]** came from search snippets only. **[inferred]** is my reasoning, not a source claim. **[gap]** means no reliable source was found.

## 1. Hugging Face Hub API: fields, rate limits, pagination

### Takeaway
The Hub's own docs now point to an OpenAPI spec as the authoritative endpoint reference. The model-listing parameters and response fields could not be confirmed in this session, so build the collector against the live spec and `huggingface_hub`, not against remembered field names.

### Cited Findings
- The endpoint reference moved to an OpenAPI Playground. The spec is at https://huggingface.co/.well-known/openapi.json, with a Markdown version at https://huggingface.co/.well-known/openapi.md. **[verified]** — [HF Hub API docs](https://huggingface.co/docs/hub/api)
- The Hub's GGUF docs say the Hub has a built-in GGUF viewer for metadata and tensor info, a GGUF tag filter (`hf.co/models?library=gguf`), and a JavaScript parser `@huggingface/gguf` that reads remote files. **[verified]** — [HF GGUF docs](https://huggingface.co/docs/hub/gguf)
- The Hub's GGUF docs include a quantization-type table (F16, BF16, Q8_0, Q4_K, Q5_K, IQ* families, MXFP4, and others) with bits-per-weight notes for several types. Their own text says it may contain inaccuracies and points to a GitHub file for corrections. **[verified]** — [HF GGUF docs](https://huggingface.co/docs/hub/gguf)
- The model card metadata (YAML front matter) supports: `license`; `license_name` and `license_link` when `license: other`; `base_model` (single ID or list) with optional `base_model_relation` (`adapter`, `merge`, `quantized`, `finetune`); `library_name` (recommended explicit value); `pipeline_tag`; `datasets`; `new_version`; and a `not-for-all-audiences` tag. **[verified]** — [HF model cards docs](https://huggingface.co/docs/hub/model-cards)
- The docs state that `library_name` should be set explicitly and that automatic detection is discouraged. For repos created after August 2024, `config.json` alone no longer implies `transformers`. **[verified]** — [HF model cards docs](https://huggingface.co/docs/hub/model-cards)
- Rate limits use fixed 5-minute windows and three buckets: Hub APIs, Resolvers (any `/resolve/` URL used for downloads), and Pages. The published table is dated September 2025: Anonymous per IP 500 API / 3,000 resolver / 100 pages; Free 1,000 / 5,000 / 200; PRO 2,500 / 12,000 / 400; Team org 3,000 / 20,000 / 400; Enterprise 6,000 / 50,000 / 600. Anonymous and Free figures may change. Limits apply per member for organizations. **[verified]** — [HF rate limits docs](https://huggingface.co/docs/hub/rate-limits)
- The rate-limit page says a 429 response is returned when a limit is exceeded. It uses the IETF `RateLimit` and `RateLimit-Policy` headers (draft v9). `huggingface_hub` 1.2.0+ parses `RateLimit` and waits before retrying. The page advises passing `HF_TOKEN` and preferring the Resolver path for file retrieval. **[verified]** — [HF rate limits docs](https://huggingface.co/docs/hub/rate-limits)
- Some third-party pages describe per-minute or per-hour limits. These do not match the official page, so do not use them. **[secondary]** — [search results, not fetched](https://huggingface.co/docs/hub/en/rate-limits)

### Inferences
- A collector should use `huggingface_hub` for listing and downloading. Its built-in 429 handling is documented, and the Hub recommends it.
- Enumerating the whole `library=gguf` set through the API uses the Hub API bucket, which is the tightest one. Metadata for the catalog should come from resolver reads of GGUF headers where possible, and from API calls only for listing.
- Treat Hub `gguf` metadata (architecture, context length, parameter count) as something to verify by reading the GGUF header yourself. The Hub viewer and parser exist, but I could not confirm the exact key names from the docs in this session.

### Gaps
- **[gap]** The `GET /api/models` query parameters (`filter`, `sort`, `full`, `expand[]`), the model response fields (`gated`, `siblings`, `safetensors`, `gguf`, `usedStorage`, `cardData`), and the pagination method for this endpoint were not confirmed. The OpenAPI markdown fetch was cut off before the models section. Re-fetch `https://huggingface.co/.well-known/openapi.md` with offset to read the rest.
- **[gap]** GGUF header key names (for example `general.architecture`, `*.context_length`) were not checked against the GGUF spec in this session. The spec is in the ggml repository (`docs/gguf.md`) and should be read directly.
- **[gap]** Whether gated status is returned on list responses or only on single-repo reads was not verified.

---

## 2. Quantizer publishers and verifying conversions

### Takeaway
I found no reliable source that compares quantizer publishers (unsloth, bartowski, ggml-org, lmstudio-community, mradermacher and others) on quality, nor a documented standard for verifying a conversion. A catalog should verify conversions mechanically, using metadata links and hashes, and should not rank publishers by reputation.

### Cited Findings
- The Hub's GGUF docs list `ggml-org/gguf-my-repo` as a conversion and quantization tool, and they show a third-party conversion repo as an example. **[verified]** — [HF GGUF docs](https://huggingface.co/docs/hub/gguf)
- A search on structural and provenance checks found one article arguing that a checksum alone says nothing about whether a file is a valid LLM artifact. It suggests structural checks, such as tensor layout versus claimed parameter count, and build-time manifests. **[secondary]** — [search results, not fetched](https://tech-insider.org/gguf-model-quantization-2026/)
- The same search found an open-source audit tool that compares fingerprints between a source safetensors file and its derived GGUF. Its wiki says this is not proof of conversion history. **[secondary]** — [search results, not fetched](https://github.com/ExileAI/model-audit/wiki)
- Calibration (imatrix) data is a trust-sensitive input. Some publishers ship imatrix files alongside quants. **[secondary]** — [search results, not fetched](https://huggingface.co/FantasiaFoundry/GGUF-Quantization-Script/discussions/11)

### Inferences
- A conversion can be checked against its source in layers:
  1. The GGUF's own `base_model` card field should point to the official source repo. The Hub docs define this field as `quantized` relation. **[verified field]**
  2. Confirm the source repo owner matches a known official org (for example the model vendor's HF org).
  3. Record hashes of the source safetensors and the derived GGUF. Compare tensor count and shapes with the source config where possible. **[inferred method]**
  4. Record whether the quant includes an imatrix and, if so, its calibration source. **[inferred]**
  5. Mark any quant that fails one of these as "unverified" instead of excluding it.
- Reliability should be recorded per file (verified or not), not per publisher name.

### Gaps
- **[gap]** No primary source found on the quality or reliability difference between named quantizer publishers. Any ranking by publisher would be my opinion and is not supported here.
- **[gap]** No source found showing that GGUF `base_model` metadata is checked by the Hub or by any standard tool.
- **[gap]** Hash formats and standard practice for matching GGUF to source weights were not verified.

---

## 3. License categories and classifying custom licenses

### Takeaway
The safe method is to classify from the license text linked on each model page, using a fixed set of categories that includes "unknown". Custom licenses such as Llama and Gemma are commercially usable under conditions. EXAONE's NC license restricts commercial use. Do not infer commercial status from the license name or from a tag alone.

### Cited Findings
- **Llama 3.1 Community License** (`meta-llama/Llama-3.1-8B-Instruct`): the grant is a non-exclusive, worldwide, non-transferable, royalty-free license. It requires a copy of the agreement to accompany Llama Materials. Derivative model names must begin with "Llama". Products must prominently display "Built with Llama". The license is incorporated with the Acceptable Use Policy. It applies a 700 million monthly active users threshold. The document is titled as a community license and is not described as open source. **[verified]** — [Llama 3.1 LICENSE](https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct/blob/main/LICENSE)
- **Gemma Terms of Use**: the terms require that use restrictions be included as an enforceable provision in downstream terms, and that a copy of the agreement be given to all third-party recipients. The Gemma Prohibited Use Policy is incorporated. Google may update Gemma and may restrict usage remotely if it believes the terms are violated. The page says Gemma 4 is governed by a separate license. The page does not state a commercial-use rule. **[verified]** — [Gemma Terms](https://ai.google.dev/gemma/terms)
- **EXAONE AI Model License 1.1 NC and 1.2 NC** (per scancode-licensedb and search summaries): research and education use only. Commercial use requires a separate written license. Outputs may not be used to develop other models. The licensor may change terms. **[secondary]** — [scancode-licensedb 1.1 NC](https://scancode-licensedb.aboutcode.org/exaone-ai-model-1.1-nc.html), [scancode-licensedb 1.2 NC](https://scancode-licensedb.aboutcode.org/exaone-ai-model-1.2-nc.html). The license text itself was not fetched.
- Model cards define a custom license with `license: other` plus `license_name` and `license_link`. If no link exists, the card may link to a LICENSE file in the repo. **[verified]** — [HF model cards docs](https://huggingface.co/docs/hub/model-cards)
- A 2026 blog claims K-EXAONE 1.0 used a custom license restricting commercial use, and K-EXAONE 2.0 moved to Apache 2.0. **[secondary, unconfirmed]** — [ai2.work blog](https://ai2.work/blog/k-exaone-2-0-lg-s-750b-sovereign-ai-model-goes-fully-open-source). Verify against the LG model pages before using.

### Inferences
- Suggested classification (a method, not a legal opinion):
  - `permissive` (MIT, Apache-2.0, BSD): standard SPDX identifiers.
  - `open-weight-custom-conditional`: Llama, Gemma and similar. Record the specific conditions (MAU threshold, naming, attribution, AUP, pass-through copy) as structured flags.
  - `non-commercial`: EXAONE NC, CC-BY-NC, and similar. Commercial use must be flagged as "not permitted without separate agreement".
  - `research-only` (may be a subset of non-commercial).
  - `unknown`: no license file or unreadable license. Never default to permissive.
- Separate the hosted-API terms from the weights license. The 2026 blog on K-EXAONE hosted access says API access has its own platform terms. **[secondary]** — [search results](https://rohitai.com/blog/lg-k-exaone-2-5-free-api-access)
- Use a per-model field for "commercial use: yes / no / conditional / unknown", with a link to the license clause that supports the value.

### Gaps
- **[gap]** No SPDX mapping was checked for Llama, Gemma or EXAONE. Llama and Gemma are not SPDX identifiers as far as I know, but I did not verify this.
- **[gap]** The EXAONE NC license text itself, and its current version, were not read. Only summaries were.
- **[gap]** No legal commentary was checked for whether each category permits hosting versus linking.

---

## 4. Redistribution: hosting versus linking

### Takeaway
Verified terms show that Llama and Gemma both require passing the license along with the weights. Neither says in the pages I read whether a third party may host copies. The NC licenses restrict commercial use, and hosting would likely count as external distribution. Default to linking to the upstream source, and host only where the license text is read and clearly allows it.

### Cited Findings
- Llama 3.1 requires providing a copy of the agreement with any Llama Materials, which applies to redistribution. **[verified]** — [Llama 3.1 LICENSE](https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct/blob/main/LICENSE)
- Gemma requires passing the use restrictions and a copy of the agreement to third-party recipients. **[verified]** — [Gemma Terms](https://ai.google.dev/gemma/terms)
- EXAONE 1.x NC states that external distribution beyond the license scope is prohibited unless agreed in writing. **[secondary]** — [search summary of scancode-licensedb 1.1 NC](https://scancode-licensedb.aboutcode.org/exaone-ai-model-1.1-nc.html)

### Inferences
- A catalog that only links to the official Hub repo avoids most redistribution questions, since the user downloads from the licensor's page and accepts its terms.
- Hosting or mirroring GGUF files should be treated as redistribution. GGUF is a conversion of the weights, so it is generally a derivative under these licenses. This is an inference, not a verified legal conclusion.
- Gated models (requiring acceptance on HF) should never be mirrored, because the gate is part of the license acceptance.

### Gaps
- **[gap]** No primary legal source found on whether GGUF conversions are "derivatives" under each license.
- **[gap]** Not checked: whether Apache-2.0 or MIT GGUF files can be mirrored (they can, as far as I know, but I did not verify with a source).

---

## 5. Ranking and grouping: existing tools and signals

### Takeaway
Not researched in this session. I did not fetch the LM Studio catalog, Ollama library, llama.cpp model lists or any leaderboard, so I cannot say how they rank models or which signals they consider credible.

### Gaps
- **[gap]** LM Studio, Ollama and llama.cpp catalog grouping rules were not checked.
- **[gap]** Open LLM Leaderboard successors and their status in 2026 were not checked. The HF model-card docs do describe `model-index` eval results and the newer simpler eval-results format, which the Hub parses for display. **[verified]** — [HF model cards docs](https://huggingface.co/docs/hub/model-cards)
- **[inferred]** Credible ranking signals are usually self-reported or third-party eval results with a stated source, reproducible settings, and a date. Download counts and likes are popularity signals, not quality signals. This is a common view, not a sourced finding here.

---

## 6. Memory estimation for CPU-only inference

### Takeaway
No official llama.cpp memory calculator was found. Third-party calculators disagree on assumptions. The method I would use is: compute weights from the GGUF file size, add KV cache from the model's layer and head counts at the target context, add a runtime overhead margin, and check against llama.cpp's own load log.

### Cited Findings
- Search results found only third-party VRAM calculators. They read architecture from GGUF headers by range request in some cases. Their overhead assumptions range from about 10% to 20%. One claims about ±10% error against nvidia-smi. **[secondary]** — [search results, not fetched](https://richystrong-vram-caclulator.hf.space/)
- One source says KV cache is always FP16 in llama.cpp. Another guide describes quantized KV cache options (`--cache-type-k q8_0`, `--cache-type-v q8_0`). The FP16-only claim is likely outdated. **[secondary, conflicting]** — [search results](https://d-central.tech/local-llm-vram-calculator/)
- Several calculators do not model concurrent requests well. **[secondary]**

### Inferences
- Weights: approximately the GGUF file size, since GGUF stores quantized tensors. Metadata and tokenizer add a small amount. **[inferred]**
- KV cache: approximately `2 × n_layers × n_kv_heads × head_dim × context × bytes_per_element`, using the model's KV head count (not attention head count), and the chosen cache type. Check the exact formula against llama.cpp source before relying on it. **[inferred]**
- For CPU inference, the usable check is llama.cpp's load-time memory log, which reports the buffer sizes it allocates. This is more reliable than a third-party calculator.
- Catalog entries should store the inputs (layers, KV heads, head dim, file size) and the context used, so estimates can be recomputed.

### Gaps
- **[gap]** The exact llama.cpp KV formula and buffer accounting were not read from primary source. Check `src/llama.cpp` and the llama.cpp docs in the repository.
- **[gap]** No validated comparison of calculators against measured CPU RSS was found.

---

## Summary of what is solid versus open

Solid, from primary pages:
- HF rate-limit tiers (Sept 2025 snapshot) and the 5-minute window rule.
- HF model-card metadata fields for license, base model, and library.
- Llama 3.1 and Gemma redistribution and restriction clauses.

Open, needs follow-up:
- HF model-list endpoint parameters and response fields (read the OpenAPI markdown past the cut-off).
- GGUF header key names (read the ggml `gguf.md` spec).
- EXAONE NC full license text and K-EXAONE current license.
- Quantizer publisher verification practice, leaderboard and catalog ranking practice, and llama.cpp memory accounting.
