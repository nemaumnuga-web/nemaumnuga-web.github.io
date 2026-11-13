# Local LLM library (prototype)

Metadata-only catalog of local (GGUF) LLMs + per-language, per-hardware
recommendations labelled A, B, C ... Nothing is downloaded or redistributed here;
the OS fetches a model from its source only when the user picks it.

    python3 sync_catalog.py sync --limit 600            # rebuild catalog.json from Hugging Face
    python3 sync_catalog.py pick --lang ko --tier 8     # A/B/C picks for an 8 GB machine
    python3 sync_catalog.py pick --lang en --all-licenses   # include non-commercial models

Layers
- `catalog.json`        auto-collected, everything (license class, params, est. RAM, languages, trust)
- `curated.json`        hand-verified families, shown first with a star; edit this to change recommendations
- `language_hints.json` family -> language hints (HF tags are incomplete)

Trust levels: official > trusted-quant (unsloth, bartowski, ...) > repackaged
(official weights, unknown uploader: verify) > community (fine-tunes/merges, hidden by default).

Known limits: license class is a heuristic - read the LICENSE file before shipping;
download/like counts do not measure quality, so the curated layer decides the top picks;
RAM is an estimate (Q4_K_M ~0.6 GB per B params + headroom, 3 GB reserved for OS/desktop).
