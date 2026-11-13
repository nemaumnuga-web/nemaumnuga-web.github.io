#!/usr/bin/env python3
"""Local-LLM library builder.

Collects GGUF text-generation models from the Hugging Face API into one
catalog (metadata only - nothing is downloaded or redistributed), then builds
per-language, per-hardware-tier recommendation lists labelled A, B, C ...

    python3 sync_catalog.py sync --limit 600     # build catalog.json
    python3 sync_catalog.py pick --lang ko       # print A/B/C picks per tier
    python3 sync_catalog.py pick --lang en --tier 8 --all-licenses
"""
import argparse, json, math, os, re, sys, time
import urllib.request, urllib.parse
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
CATALOG = os.path.join(HERE, "catalog.json")
HINTS = os.path.join(HERE, "language_hints.json")
API = "https://huggingface.co/api/models"

# Hardware tiers: name -> max RAM (GB) the user has. 8 GB CPU-only is the floor.
TIERS = [8, 16, 32, 64]
LABELS = "ABCDEFGH"

PERMISSIVE = {"apache-2.0", "mit", "bsd-3-clause", "bsd-2-clause", "cc0-1.0",
              "unlicense", "isc", "openrail++"}
NONCOMMERCIAL = {"cc-by-nc-4.0", "cc-by-nc-sa-4.0", "cc-by-nc-nd-4.0",
                 "cc-by-nc-3.0", "cc-by-nc-2.0", "cc-by-nc-sa-3.0"}
COPYLEFT = {"gpl-3.0", "agpl-3.0", "lgpl-3.0", "cc-by-sa-4.0", "cc-by-4.0",
            "cc-by-3.0"}


def license_class(lic, name):
    if lic in PERMISSIVE:
        return "permissive"
    if lic in COPYLEFT:
        return "open-conditions"
    if lic in NONCOMMERCIAL or "-nc" in name.lower():
        return "non-commercial"
    if lic.startswith("llama") or lic in ("gemma",):
        return "custom-terms"
    if lic in ("other", ""):
        return "custom-terms"  # read LICENSE file; never assume
    return "custom-terms"


OFFICIAL = {"qwen", "google", "mistralai", "kakaocorp", "naver-hyperclovax",
            "lgai-exaone", "meta-llama", "microsoft", "ibm-granite", "huggingfacetb",
            "openbmb", "liquidai", "deepseek-ai", "openai", "upstage", "coherelabs",
            "nvidia", "allenai", "tencent", "zai-org", "moonshotai", "01-ai",
            "stabilityai", "internlm", "skt", "trillionlabs", "snunlp"}
TRUSTED_QUANT = {"unsloth", "bartowski", "ggml-org", "lmstudio-community"}
HYPE = re.compile(r"neo-max|brilliance|\d+x\b|uncensored|abliterat|nsfw|erp|roleplay|merge|heretic|crack|distill", re.I)
NOISE = re.compile(r"ocr|dspark|draft|mtp|embed|rerank|guard|-asr|tts|-base-", re.I)  # not chat models


def trust_of(repo_id, base):
    """official > trusted-quant (of an official base) > community."""
    base_org = base.split("/")[0].lower() if "/" in base else ""
    repo_org = repo_id.split("/")[0].lower()
    if base_org in OFFICIAL and (repo_org in OFFICIAL or repo_org in TRUSTED_QUANT):
        return "official"
    if repo_org in OFFICIAL:
        return "official"
    if repo_org in TRUSTED_QUANT:
        return "trusted-quant"
    if base_org in OFFICIAL:
        return "repackaged"      # official weights, unverified third-party GGUF
    return "community"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "model-library-sync/0.1"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r), r.headers.get("Link", "")
        except Exception as e:  # network hiccup / rate limit
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def collect(limit, pipeline):
    params = [("filter", "gguf"), ("pipeline_tag", pipeline), ("sort", "downloads"),
              ("direction", "-1"), ("limit", "100")]
    for f in ("gguf", "downloads", "likes", "tags", "lastModified", "createdAt", "gated", "pipeline_tag"):
        params.append(("expand[]", f))
    url = API + "?" + urllib.parse.urlencode(params)
    out = []
    while url and len(out) < limit:
        data, link = fetch(url)
        out += data
        m = re.search(r'<([^>]+)>;\s*rel="next"', link)
        url = m.group(1) if m else None
    return out[:limit]


def collect_named(names, per_name=25):
    """Official repos are often safetensors-only; their GGUFs live under quantizers.
    Search by family name so those models are not missed by the download ranking."""
    out = []
    for n in names:
        params = [("filter", "gguf"), ("search", n), ("sort", "downloads"),
                  ("direction", "-1"), ("limit", str(per_name))]
        for f in ("gguf", "downloads", "likes", "tags", "lastModified", "createdAt", "gated", "pipeline_tag"):
            params.append(("expand[]", f))
        try:
            data, _ = fetch(API + "?" + urllib.parse.urlencode(params))
            out += [d for d in data if d.get("pipeline_tag") in ("text-generation", "image-text-to-text")]
        except Exception as e:
            print("search failed:", n, e, file=sys.stderr)
    return out


def load_hints():
    try:
        with open(HINTS, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def normalise(raw, hints):
    gg = raw.get("gguf") or {}
    tags = raw.get("tags", [])
    lic = next((t[8:] for t in tags if t.startswith("license:")), "")
    base = next((t.split(":", 2)[2] for t in tags if t.startswith("base_model:quantized:")), None)
    if base is None:
        base = next((t.split(":", 1)[1] for t in tags if t.startswith("base_model:")
                     and t.count(":") == 1), raw["id"])
    langs = sorted({t for t in tags if re.fullmatch(r"[a-z]{2,3}", t)
                    and t not in ("gguf", "mlx", "cpp", "en_", "pt_")} & set(hints.get("iso", [])))
    low = raw["id"].lower()
    for key, hl in hints.get("by_name", {}).items():
        if key in low:
            langs = sorted(set(langs) | set(hl))
    if "multilingual" in tags:
        langs = sorted(set(langs) | {"*"})
    params = gg.get("total")
    size = gg.get("totalFileSize")
    bpp = (size / params) if params and size else None     # bytes per param
    sane = bpp is not None and 0.35 <= bpp <= 2.6 and not HYPE.search(raw["id"]) and not NOISE.search(raw["id"])
    return {
        "trust": trust_of(raw["id"], base), "sane": sane,
        "id": raw["id"], "base": base,
        "params_b": round(params / 1e9, 2) if params else None,
        "file_gb": round(size / 1e9, 2) if size else None,
        # repo "file size" is one arbitrary quant (often BF16), so estimate a Q4_K_M
        # download instead (~0.6 GB per B params) + KV/runtime headroom.
        # The desktop/OS needs its own ~3 GB on top (handled in pick()).
        "q4_gb": round(params / 1e9 * 0.6, 2) if params else None,
        "min_ram_gb": round(params / 1e9 * 0.6 * 1.2 + 0.8, 1) if params else None,
        "arch": gg.get("architecture"), "context": gg.get("context_length"),
        "license": lic or "unknown", "license_class": license_class(lic, raw["id"]),
        "gated": bool(raw.get("gated")), "langs": langs,
        "downloads": raw.get("downloads", 0), "likes": raw.get("likes", 0),
        "updated": raw.get("lastModified"), "created": raw.get("createdAt"),
        "url": "https://huggingface.co/" + raw["id"],
    }


def dedupe(models):
    """One entry per base model: the most-downloaded quantized repo wins."""
    best, alts = {}, {}
    for m in models:
        k = m["base"]
        alts.setdefault(k, []).append(m["id"])
        if k not in best or m["downloads"] > best[k]["downloads"]:
            best[k] = m
    for k, m in best.items():
        m["alt_repos"] = [a for a in alts[k] if a != m["id"]][:5]
    return list(best.values())


def sync(args):
    hints = load_hints()
    raw = []
    for pipe in ("text-generation", "image-text-to-text"):
        raw += collect(args.limit, pipe)
    raw += collect_named(list(hints.get("by_name", {}).keys()) + hints.get("extra_search", []))
    seen, uniq = set(), []
    for r in raw:
        if r["id"] not in seen:
            seen.add(r["id"]); uniq.append(r)
    models = dedupe([normalise(r, hints) for r in uniq])
    models = [m for m in models if m["file_gb"] and m["sane"]]
    with open(CATALOG, "w", encoding="utf-8") as f:
        json.dump({"generated": datetime.now(timezone.utc).isoformat(),
                   "source": "huggingface.co/api (metadata only)",
                   "count": len(models), "models": models}, f, ensure_ascii=False, indent=1)
    print(f"{len(models)} models -> {CATALOG}")


def score(m):
    age_days = 365
    if m["updated"]:
        dt = datetime.fromisoformat(m["updated"].replace("Z", "+00:00"))
        age_days = max(0, (datetime.now(timezone.utc) - dt).days)
    recency = 1.0 / (1 + age_days / 180)       # halves after ~6 months
    popularity = math.log10(1 + m["downloads"]) + math.log10(1 + m["likes"])
    return popularity * (0.5 + recency)


def family(m):
    name = m["base"].split("/")[-1].lower()
    return re.sub(r"[-_ ]?\d.*", "", name) or name


def age_days(m):
    ts = m.get("created") or m.get("updated")
    if not ts:
        return 9999
    return max(0, (datetime.now(timezone.utc) - datetime.fromisoformat(ts.replace("Z", "+00:00"))).days)


def rank(m, usable_gb):
    """Capability proxy: bigger-that-fits + newer + popular + provenance."""
    fit = math.log2(max(m["params_b"] or 0.3, 0.3)) / math.log2(max(usable_gb * 2, 2))
    prov = {"official": 1.0, "trusted-quant": 0.8, "repackaged": 0.3, "community": 0.0}[m["trust"]]
    fresh = max(0.0, 1 - age_days(m) / 540)          # linear decay over ~18 months
    return 2.0 * fit + 0.3 * score(m) / 10 + 1.0 * prov + 3.0 * fresh


def diversify(pool, top, per_family=2):
    out, count = [], {}
    for m in pool:
        f = family(m)
        if count.get(f, 0) >= per_family:
            continue
        count[f] = count.get(f, 0) + 1
        out.append(m)
    return out


def curated_picks(cat, lang, tier, usable, allowed, trusts):
    """Resolve hand-verified family patterns to the best repo in the catalog."""
    try:
        with open(os.path.join(HERE, "curated.json"), encoding="utf-8") as f:
            cur = json.load(f)
    except FileNotFoundError:
        return []
    pats = list(cur.get(lang, {}).get(str(tier), [])) + list(cur["default"].get(str(tier), []))
    out, seen = [], set()
    for pat in pats:
        hits = [m for m in cat if pat in m["base"].lower().replace("_", "-")]
        hits = [m for m in hits if m["min_ram_gb"] and m["min_ram_gb"] <= usable
                and m["license_class"] in allowed and not m["gated"] and m["trust"] in trusts]
        hits.sort(key=lambda m: ({"official": 3, "trusted-quant": 2, "repackaged": 1}.get(m["trust"], 0),
                                 m["downloads"]), reverse=True)
        if hits and hits[0]["id"] not in seen:
            seen.add(hits[0]["id"]); out.append(hits[0])
    return out


def pick(args):
    with open(CATALOG, encoding="utf-8") as f:
        cat = json.load(f)["models"]
    allowed = {"permissive", "open-conditions", "custom-terms"}
    if args.all_licenses:
        allowed.add("non-commercial")
    trusts = {"official", "trusted-quant", "repackaged"} | ({"community"} if args.community else set())
    tiers = [args.tier] if args.tier else TIERS
    for t in tiers:
        usable = t - 3.0                           # leave room for OS + desktop
        pool = [m for m in cat
                if m["min_ram_gb"] and m["min_ram_gb"] <= usable
                and m["license_class"] in allowed and not m["gated"]
                and m["trust"] in trusts
                and (args.old or age_days(m) <= 540)
                and (args.lang in m["langs"] or ("*" in m["langs"]))]
        # language-specific models outrank generic multilingual ones
        def focused(m):  # genuinely about this language, not just listing it
            real = [l for l in m["langs"] if l != "*"]
            return args.lang in real and len(real) <= 3 and "*" not in m["langs"]
        pool.sort(key=lambda m: (focused(m) and args.lang != "en", rank(m, usable)), reverse=True)
        pool = diversify(pool, args.top)
        starred = curated_picks(cat, args.lang, t, usable, allowed, trusts)
        star_ids = {m["id"] for m in starred}
        pool = starred + [m for m in pool if m["id"] not in star_ids]
        print(f"\n== {t} GB machine, language={args.lang} ==")
        if not pool:
            print("  (no model matched - add hints or loosen filters)")
        for label, m in zip(LABELS, pool[: args.top]):
            tag = "lang-focused" if focused(m) else "multilingual"
            star = "★ " if m["id"] in star_ids else "  "
            warn = "  [!] third-party GGUF - verify" if m["trust"] == "repackaged" else ""
            print(f" {star}{label}. {m['id']}  {m['params_b']}B  ~{m['q4_gb']}GB(Q4)  "
                  f"{m['license']} ({m['license_class']})  {tag}{warn}")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sync"); s.add_argument("--limit", type=int, default=600)
    p = sub.add_parser("pick"); p.add_argument("--lang", required=True)
    p.add_argument("--tier", type=int, choices=TIERS); p.add_argument("--top", type=int, default=5)
    p.add_argument("--old", action="store_true", help="include models older than ~18 months")
    p.add_argument("--community", action="store_true",
                   help="also show unvetted community fine-tunes/merges")
    p.add_argument("--all-licenses", action="store_true",
                   help="include non-commercial models (ok for a non-commercial distro)")
    a = ap.parse_args()
    {"sync": sync, "pick": pick}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
