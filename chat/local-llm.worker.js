// 이 기기에서 실행 — 브라우저 안에서 도는 작은 언어 모델 (transformers.js)
// 메인 화면과 분리된 워커입니다. 모델 파일은 처음 한 번만 내려받고 브라우저 캐시에 저장돼서,
// 그다음부터는 인터넷 없이도 돌아갑니다. 대화 내용은 이 워커 밖(서버)으로 나가지 않습니다.
// WebGPU가 있으면 GPU로(빠름), 없으면 WASM(CPU)으로 실행합니다.
// (LFM2·Gemma 3 양자화본은 WASM에 없는 GatherBlockQuantized 연산을 써서 WebGPU에서만 돌아요.)
import { AutoTokenizer, AutoModelForCausalLM, TextStreamer, InterruptableStoppingCriteria, env }
  from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';

env.allowLocalModels = false;

let tok = null, model = null, cur = '', loading = null, device = '';
const stops = {};
const cancelled = new Set();     // 차례를 기다리다 취소된 요청
let queue = Promise.resolve();          // 한 번에 하나씩 생성 (같은 모델을 동시에 돌리지 않음)

async function pickDevice(spec) {
  if (self.navigator && navigator.gpu) {
    try {
      const ad = await navigator.gpu.requestAdapter();
      if (ad) return { device: 'webgpu', dtype: ad.features.has('shader-f16') ? spec.gpu : (spec.gpu32 || spec.gpu) };
    } catch (_) { /* WebGPU를 못 쓰면 CPU로 */ }
  }
  if (!spec.cpu) throw new Error('이 모델은 WebGPU가 필요해요. 이 브라우저에서는 Qwen3 모델을 고르세요.');
  return { device: 'wasm', dtype: spec.cpu };
}

function load(spec) {
  if (model && cur === spec.repo) return Promise.resolve();
  if (loading && cur === spec.repo) return loading;
  cur = spec.repo; model = null; tok = null;
  const files = {};
  const progress_callback = p => {
    if (p.status !== 'progress' || !p.file) return;
    files[p.file] = { l: p.loaded || 0, t: p.total || 0 };
    let L = 0, T = 0;
    for (const k in files) { L += files[k].l; T += files[k].t; }
    self.postMessage({ type: 'progress', pct: T ? Math.floor(L / T * 100) : 0, loaded: L, total: T });
  };
  loading = (async () => {
    let d = await pickDevice(spec);
    tok = await AutoTokenizer.from_pretrained(spec.repo, { progress_callback });
    try {
      model = await AutoModelForCausalLM.from_pretrained(spec.repo, { dtype: d.dtype, device: d.device, progress_callback });
    } catch (e) {
      if (d.device === 'wasm' || !spec.cpu) throw e;
      d = { device: 'wasm', dtype: spec.cpu };          // GPU에서 실패하면 CPU로 다시
      model = await AutoModelForCausalLM.from_pretrained(spec.repo, { dtype: d.dtype, device: 'wasm', progress_callback });
    }
    device = d.device;
    self.postMessage({ type: 'ready', model: spec.repo, device, dtype: d.dtype });
  })().catch(e => {
    loading = null; cur = ''; model = null;
    self.postMessage({ type: 'error', message: String(e && e.message || e) });
    throw e;
  });
  return loading;
}

async function chat(m) {
  if (cancelled.delete(m.id)) { self.postMessage({ type: 'done', id: m.id }); return; }
  try {
    await load(m.spec);
    const inputs = tok.apply_chat_template(m.messages, { add_generation_prompt: true, return_dict: true, enable_thinking: !!m.think });
    const stopper = new InterruptableStoppingCriteria();
    stops[m.id] = stopper;
    const streamer = new TextStreamer(tok, {
      skip_prompt: true, skip_special_tokens: true,
      callback_function: t => self.postMessage({ type: 'delta', id: m.id, text: t }),
    });
    const opts = { ...inputs, max_new_tokens: m.max_tokens || 1024, streamer, stopping_criteria: stopper, repetition_penalty: 1.1 };
    if (m.temperature > 0) { opts.do_sample = true; opts.temperature = m.temperature; opts.top_p = 0.9; }
    else opts.do_sample = false;
    await model.generate(opts);
    self.postMessage({ type: 'done', id: m.id });
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String(err && err.message || err) });
  } finally {
    delete stops[m.id];
  }
}

self.onmessage = e => {
  const m = e.data;
  if (m.type === 'load') { load(m.spec).catch(() => {}); return; }
  if (m.type === 'stop') { const s = stops[m.id]; if (s) s.interrupt(); else cancelled.add(m.id); return; }
  if (m.type === 'chat') { queue = queue.then(() => chat(m)); }
};
