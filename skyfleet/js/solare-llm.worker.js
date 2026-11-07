// 솔라레 대화 엔진 — Qwen3-0.6B (transformers.js, 브라우저 안에서 실행)
// 메인 스레드와 분리된 워커. 모델은 처음 켤 때만 내려받고 브라우저 캐시에 저장됩니다.
import { pipeline, env, TextStreamer } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/dist/transformers.min.js';

env.allowLocalModels = false;
// 모델 목록: 작은 쪽(gemma, 약 275MB) / 똑똑한 쪽(qwen3, 약 570MB)
const MODELS = {
  qwen3: { id: 'onnx-community/Qwen3-0.6B-ONNX', gpu: 'q4f16', cpu: 'q8', thinking: false },
  gemma: { id: 'onnx-community/gemma-3-270m-it-ONNX', gpu: 'q4f16', cpu: 'q4', thinking: false },
};
let gen = null, loading = null, curModel = null;

async function load(key = 'qwen3') {
  if (gen && curModel === key) return gen;
  if (loading && curModel === key) return loading;
  const M = MODELS[key] || MODELS.qwen3; curModel = key; gen = null;
  const webgpu = !!(self.navigator && navigator.gpu);
  loading = pipeline('text-generation', M.id, {
    device: webgpu ? 'webgpu' : 'wasm',
    dtype: webgpu ? M.gpu : M.cpu,
    progress_callback: p => { if (p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, pct: Math.round(p.progress || 0) }); },
  }).then(g => { gen = g; self.postMessage({ type: 'ready', device: webgpu ? 'webgpu' : 'wasm' }); return g; })
    .catch(e => { loading = null; self.postMessage({ type: 'error', message: String(e && e.message || e) }); throw e; });
  return loading;
}

self.onmessage = async e => {
  const m = e.data;
  if (m.type === 'load') { try { await load(m.model); } catch (_) {} return; }
  if (m.type === 'chat') {
    try {
      const g = await load(m.model);
      const tok = g.tokenizer;
      // Qwen3: 생각(thinking) 모드를 끄고 바로 답하게 함 (다른 모델은 이 옵션을 무시)
      const prompt = tok.apply_chat_template(m.messages, { tokenize: false, add_generation_prompt: true, enable_thinking: false });
      let out = '';
      const streamer = new TextStreamer(tok, {
        skip_prompt: true, skip_special_tokens: true,
        callback_function: t => { out += t; self.postMessage({ type: 'delta', id: m.id, text: t }); },
      });
      await g(prompt, { max_new_tokens: 120, do_sample: true, temperature: 0.6, top_p: 0.9, repetition_penalty: 1.1, streamer });
      self.postMessage({ type: 'done', id: m.id, text: out.replace(/<think>[\s\S]*?<\/think>/g, '').trim() });
    } catch (err) {
      self.postMessage({ type: 'fail', id: m.id, message: String(err && err.message || err) });
    }
  }
};
