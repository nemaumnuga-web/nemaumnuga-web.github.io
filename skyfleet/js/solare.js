// 솔라레 — 함선 AI 비서 (가상)
// · 음성 출력(Web Speech TTS) · 음성 입력(Web Speech STT)
// · 질문 분류: 명령(cmd) / 정보 조회(query) / 잡담(chat)
// · 잡담은 브라우저 안의 Qwen3-0.6B(워커)가 답하고, 모델이 없으면 규칙 기반 답변
// · 권한 단계 0~3: 관찰 → 제안 → 임무 자율 → 완전 자율
import { $, pick, rand } from './core.js';
import { save, persist, STRATEGIES } from './data.js';

const now = () => performance.now() / 1000;
let ctx = null, typing = null, hideT = 0, queue = [], lastSaid = {};
const LINES = {
  launch: ['출항 준비 완료. 좋은 비행 되세요, 캡틴!', '엔진 정상, 방어막 정상. 가볼까요?', '오늘 하늘은 우리 편이에요.'],
  night: ['밤이 됐어요. 착륙장 불빛을 따라 돌아오세요.'],
  dock: ['도킹 완료. 화물은 창고에 안전하게 옮겼어요.', '수고하셨어요, 캡틴. 정비는 제가 해 둘게요.'],
  lowHull: ['선체 손상 심각! 포트로 후퇴를 권장해요!', '캡틴, 이대로면 위험해요. 거리를 벌리세요!'],
  shieldBreak: ['방어막 붕괴! 재충전까지 버텨야 해요!', '방어막이 깨졌어요! 회피 기동!'],
  shieldRestore: ['방어막 복구 완료. 다시 초록불이에요.', '방어막 재가동! 휴, 다행이다.'],
  missile: ['미사일 접근! C로 플레어를!', '유도탄 경보! 플레어 쓰세요, 캡틴!'],
  cargoFull: ['화물칸이 꽉 찼어요. 포트로 돌아가 보관해요.', '더는 못 실어요! 귀항할까요?'],
  rare: ['와, 희귀 광맥이에요! 놓치지 마세요.', '센서에 귀한 반응! 바로 아래예요.'],
  storm: ['모래폭풍이에요. 레이더가 흐려지니 조심하세요.'],
  boss: ['고르곤 신호 포착! 혼자서는 무리하지 마세요.', '해적 기함이에요… 큰 보상이 걸려 있어요.'],
  bossDown: ['고르곤 격추! 믿을 수가 없어요, 캡틴!', '해냈어요! 하늘이 조금 더 안전해졌어요.'],
  kill: ['격추 확인!', '명중! 해적 한 척 정리.', '좋아요, 그 기세예요!'],
  rank: ['평판이 올랐어요! 조선소에 새 함선이 열렸을지도요.'],
  newShip: ['새 함선이라니! 제 코어 이전 완료했어요.'],
  wreck: ['난파선 묘지예요… 대붕괴 때의 함대가 잠들어 있어요.'],
  island: ['부유 군도예요. 섬 위에 귀한 결정이 많대요.'],
  death: ['…시스템 재부팅. 캡틴, 다친 데 없죠? 포트에서 다시 시작해요.'],
  agentOn: ['알겠어요, 임무를 대신 진행할게요. 조작하시면 잠시 비켜 드릴게요.'],
  agentDone: ['임무 진행 중 — 다음 목표를 찾고 있어요.'],
  autoSold: ['시장에 광석을 모두 팔았어요.'],
  autoEquip: ['보유한 모듈을 장착했어요.'],
  autoBuy: ['새 모듈을 구매했어요. 장착까지 완료!'],
  autoLaunch: ['정비 끝! 다시 출격할게요.'],
  retreat: ['위험해요! 가장 가까운 포트로 후퇴할게요.'],
  idle: ['레이더의 다이아몬드는 광맥, 빨간 점은 해적이에요.', '말을 걸어 주시면 대화할 수 있어요. V 키 또는 솔라레 버튼!'],
};
const PERM_NAMES = ['관찰', '제안', '임무 자율', '완전 자율'];
const PERM_DESC = [
  '말로만 알려 드려요. 함선은 직접 움직이지 않아요.',
  '다음 행동을 제안해요. "응"이라고 답하면 실행해요.',
  '현재 임무를 알아서 진행하고, 위험하면 포트로 후퇴해요.',
  '임무·정비·구매·출격까지 스스로 해요. 조작하면 잠시 비켜 줘요.',
];

/* ---------- 설정 ---------- */
export function cfg() { save.solare = Object.assign({ llm: false, model: 'qwen3', perm: 0, mic: true }, save.solare || {}); return save.solare; }
export const permName = () => `${cfg().perm} · ${PERM_NAMES[cfg().perm]}`;
export const permDesc = p => PERM_DESC[p];
export { PERM_NAMES };

/* ---------- 음성 출력 ---------- */
// 목소리 출력은 사용하지 않음 (글자로만 답함)
export function speak() {}

/* ---------- 음성 입력 ---------- */
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
let rec = null;
export function micSupported() { return !!SR; }
export function listen() {
  if (!SR) { reply('이 브라우저에서는 음성 인식을 쓸 수 없어요. Chrome이나 Safari에서 열어 보세요.', 'alert'); return; }
  if (rec) { try { rec.stop(); } catch (e) {} return; }
  rec = new SR(); rec.lang = 'ko-KR'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let finalTxt = '';
  rec.onresult = e => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; $('solIn').value = t; if (e.results[e.results.length - 1].isFinal) finalTxt = t; };
  rec.onerror = e => { if (e.error !== 'no-speech' && e.error !== 'aborted') reply(`음성 인식 오류 (${e.error}). 마이크 권한을 확인해 주세요.`, 'alert'); };
  rec.onend = () => { rec = null; setMic(false); const t = (finalTxt || $('solIn').value || '').trim(); $('solIn').value = ''; if (t) submit(t); };
  try { rec.start(); setMic(true); } catch (e) { rec = null; setMic(false); }
}
function setMic(on) { const b = $('solMic'); if (b) b.classList.toggle('rec', on); }

/* ---------- 대화 엔진 (Qwen3-0.6B 워커) ---------- */
let worker = null, llm = { state: 'off', device: '', pct: 0, file: '' }, reqId = 0;
const pending = new Map();
export function llmStatus() { return llm; }
function ensureWorker() {
  if (worker) return;
  try {
    worker = new Worker(new URL('./solare-llm.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => {
      const m = e.data;
      if (m.type === 'progress') { llm.state = 'loading'; llm.pct = m.pct; llm.file = m.file; emitStatus(); }
      else if (m.type === 'ready') { llm.state = 'ready'; llm.device = m.device; emitStatus(); }
      else if (m.type === 'error') { llm.state = 'error'; llm.err = m.message; emitStatus(); }
      else if (m.type === 'delta') { const p = pending.get(m.id); if (p) p.onDelta(m.text); }
      else if (m.type === 'done') { const p = pending.get(m.id); if (p) { pending.delete(m.id); p.resolve(m.text); } }
      else if (m.type === 'fail') { const p = pending.get(m.id); if (p) { pending.delete(m.id); p.reject(new Error(m.message)); } }
    };
  } catch (e) { llm.state = 'error'; llm.err = String(e); worker = null; }
}
function emitStatus() { const el = $('solLLMStat'); if (el) el.textContent = llmText(); }
export function llmText() {
  if (!cfg().llm) return 'AI 대화 꺼짐 (규칙 기반 답변)';
  if (llm.state === 'ready') return `${MODEL_NAMES[cfg().model] || cfg().model} 준비됨 · ${llm.device === 'webgpu' ? 'GPU' : 'CPU'}`;
  if (llm.state === 'loading') return `모델 내려받는 중… ${llm.pct}%`;
  if (llm.state === 'error') return `모델 실패: ${llm.err || ''} — 규칙 기반으로 답해요`;
  return '켜짐 — 첫 대화 때 모델(약 570MB)을 내려받아요';
}
export const MODEL_NAMES = { qwen3: 'Qwen3 0.6B (똑똑함, 약 570MB)', gemma: 'Gemma 3 270M (가벼움, 약 275MB)' };
export function setLLM(on) { cfg().llm = !!on; persist(); if (on) { ensureWorker(); worker && worker.postMessage({ type: 'load', model: cfg().model }); } emitStatus(); }
export function setModel(key) { cfg().model = MODEL_NAMES[key] ? key : 'qwen3'; llm.state = 'off'; persist(); if (cfg().llm) { ensureWorker(); worker && worker.postMessage({ type: 'load', model: cfg().model }); } emitStatus(); }
function askLLM(messages, onDelta) {
  return new Promise((resolve, reject) => {
    if (!worker) ensureWorker();
    if (!worker) return reject(new Error('no worker'));
    const id = ++reqId; pending.set(id, { resolve, reject, onDelta });
    worker.postMessage({ type: 'chat', id, messages, model: cfg().model });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout')); } }, 60000);
  });
}

/* ---------- 말풍선 / 대사 ---------- */
export function say(text, mood = 'calm', prio = 1) {
  if (typing && prio < typing.prio) { queue.push([text, mood, prio]); return; }
  const box = $('solare'); box.classList.add('on'); box.dataset.mood = mood;
  const el = $('solText'); let i = 0; clearInterval(typing?.iv);
  typing = { prio, iv: setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) { clearInterval(typing.iv); typing = null; hideT = 4.5 + text.length * 0.05; } }, 26) };
  hideT = 99; speak(text);
  if ($('solChat').classList.contains('on')) botLine(text);
}
export function event(key, prio = 1, cooldown = 25) {
  const t = now(); if (lastSaid[key] && t - lastSaid[key] < cooldown) return;
  lastSaid[key] = t; const mood = ['lowHull', 'shieldBreak', 'missile', 'boss', 'retreat'].includes(key) ? 'alert' : ['kill', 'bossDown', 'rank', 'newShip', 'shieldRestore', 'autoSold', 'autoBuy', 'autoLaunch'].includes(key) ? 'happy' : 'calm';
  say(pick(LINES[key] || ['…']), mood, prio);
}
export function tickSolare(dt) {
  if (hideT < 99) { hideT -= dt; if (hideT <= 0) { $('solare').classList.remove('on'); hideT = 99; if (queue.length) say(...queue.shift()); } }
}
export function toggleChat(on) {
  const c = $('solChat'); const v = on === undefined ? !c.classList.contains('on') : on;
  c.classList.toggle('on', v);
  if (v) { if (!c.dataset.init) { c.dataset.init = 1; botLine('부르셨어요, 캡틴? 말씀하시거나 🎙 버튼을 눌러 주세요. 명령, 상태 질문, 잡담 모두 괜찮아요.'); } setTimeout(() => $('solIn').focus(), 50); ctx.onChat && ctx.onChat(true); }
  else ctx.onChat && ctx.onChat(false);
}
export function chatOpen() { return $('solChat').classList.contains('on'); }

/* ---------- 질문 분류 ---------- */
const has = (s, ...w) => w.some(k => s.includes(k));
export function classify(raw) {
  const s = raw.toLowerCase().replace(/\s+/g, '');
  if (s.length <= 6 && has(s, '예', '응', '네', '그래', '좋아', '실행', '맞아', '그렇게', '오케이', 'ok')) return { k: 'yes' };
  if (s.length <= 6 && has(s, '아니', '싫', '됐어', '노')) return { k: 'no' };
  if (has(s, '권한')) {
    const m = s.match(/([0-3])/); if (m) return { k: 'perm', to: +m[1] };
    if (has(s, '올려', '높여', '늘려', '승격', '더')) return { k: 'perm', to: 'up' };
    if (has(s, '내려', '낮춰', '줄여')) return { k: 'perm', to: 'down' };
    return { k: 'query', id: 'perm' };
  }
  if (has(s, '목소리', '말하지마')) return { k: 'cmd', id: 'noVoice' };
  if (has(s, '멈춰', '정지', '그만', '취소', '수동', '직접할게', '내가할게')) return { k: 'cmd', id: 'cancel' };
  if (has(s, '자율', '알아서', '임무수행', '임무해', '임무진행', '대신해', '자동으로')) { if (has(s, '꺼', '끄', '멈')) return { k: 'cmd', id: 'agentOff' }; return { k: 'cmd', id: 'agentOn' }; }
  if (has(s, '판매', '팔아', '팔줘', '매각')) return { k: 'cmd', id: 'sell' };
  if (has(s, '장착', '모듈달', '모듈사', '모듈사줘')) return { k: 'cmd', id: 'equip' };
  if (has(s, '궁극', '필살', '얼티')) return { k: 'cmd', id: 'ult' };
  if (has(s, '플레어', '미사일회피', '회피')) return { k: 'cmd', id: 'flare' };
  if (has(s, '포트', '귀환', '귀항', '집으로', '돌아가', '도킹')) return { k: 'cmd', id: 'port' };
  if (has(s, '보스', '고르곤', '기함') && has(s, '잡', '공격', '싸워', '치러', '가줘', '덤벼')) return { k: 'cmd', id: 'boss' };
  if (has(s, '광맥', '광석', '채굴', '캐러', '캐줘', '에테르', '결정', '금광', '은광', '구리', '철광')) {
    const k = has(s, '에테르', '결정') ? 'aether' : has(s, '금') ? 'gold' : has(s, '은') ? 'silver' : has(s, '구리') ? 'copper' : has(s, '철') ? 'iron' : null;
    return { k: 'cmd', id: 'ore', ore: k };
  }
  if (has(s, '기지', '전초')) return { k: 'cmd', id: 'outpost' };
  if (has(s, '섬', '부유섬', '군도')) return { k: 'cmd', id: 'island' };
  if (has(s, '난파', '묘지')) return { k: 'cmd', id: 'wreck' };
  if (has(s, '임무', '스토리', '퀘스트', '할일', '목표', '뭐해야')) return { k: 'query', id: 'mission' };
  if (has(s, '보스', '고르곤', '기함', '이벤트')) return { k: 'query', id: 'boss' };
  if (has(s, '시세', '가격', '얼마', '비싸')) return { k: 'query', id: 'price' };
  if (has(s, '상태', '보고', '체력', '선체', '방어막', '수리')) return { k: 'query', id: 'status' };
  if (has(s, '해적', '위협', '적이어디', '적어디', '적있', '주변적', '적은')) return { k: 'query', id: 'threat' };
  if (has(s, '조작', '키', '어떻게', '방법', '도움', '사용법')) return { k: 'query', id: 'help' };
  if (has(s, '모듈', '개조', '추천', '업그레이드')) return { k: 'query', id: 'advice' };
  return { k: 'chat' };
}

/* ---------- 응답 ---------- */
function botLine(t) { const d = document.createElement('div'); d.className = 'bot'; d.textContent = t; $('solLog').appendChild(d); $('solLog').scrollTop = 1e9; return d; }
function userLine(t) { const d = document.createElement('div'); d.className = 'me'; d.textContent = t; $('solLog').appendChild(d); $('solLog').scrollTop = 1e9; }
function reply(t, mood = 'calm') {
  const box = $('solare'); box.classList.add('on'); box.dataset.mood = mood; $('solText').textContent = t; hideT = 6 + t.length * 0.05;
  botLine(t); speak(t);
}
let pendingConfirm = null;
export function submit(text) {
  const q = text.trim(); if (!q) return;
  userLine(q);
  if (pendingConfirm) {
    const c = classify(q);
    if (c.k === 'yes') { const f = pendingConfirm; pendingConfirm = null; return f(true); }
    if (c.k === 'no') { pendingConfirm = null; return reply('알겠어요. 그대로 둘게요.'); }
    pendingConfirm = null;
  }
  const c = classify(q);
  if (c.k === 'yes') return reply(agentState().on ? '네, 계속 진행할게요.' : '네, 알겠어요! 무엇을 해 드릴까요?', 'happy');
  if (c.k === 'no') return reply('알겠어요.');
  if (c.k === 'perm') return setPermByVoice(c);
  if (c.k === 'cmd') return runCmd(c.id, c);
  if (c.k === 'query') return reply(queryAnswer(c.id));
  // 잡담 → AI (없으면 규칙 기반)
  return chatAnswer(q);
}
function runCmd(id, c) {
  const x = ctx;
  switch (id) {
    case 'cancel': x.cancelAuto(); agentOff(false); return reply('조종권을 돌려 드릴게요.');
    case 'noVoice': return reply('저는 목소리 없이 글자로만 답해 드려요. 말씀은 🎙 버튼으로 하실 수 있어요.');
    case 'agentOn': if (cfg().perm < 2) return askPerm(2, '임무를 대신하려면 권한이 필요해요. 임무 자율(2단계)로 올릴까요?'); agentOn(); return reply('임무를 대신 진행할게요.', 'happy');
    case 'agentOff': agentOff(true); return reply('자율 임무를 멈췄어요.');
    case 'port': { const r = x.autoPort(); return reply(r ? `${r}으로 자동 비행할게요. 조작하면 잠시 비켜 드려요.` : '출격한 뒤에 말씀해 주세요.'); }
    case 'ore': { const r = x.autoOre(c.ore); return reply(r || '근처에 그 광맥은 없어요. 시간이 지나면 새로 생겨요.'); }
    case 'island': return reply(x.gotoIsland() || '부유섬을 찾지 못했어요.');
    case 'outpost': return reply(x.gotoOutpost() || '비행 중일 때 기지로 안내할 수 있어요.');
    case 'wreck': return reply(x.gotoWreck() || '난파선을 찾지 못했어요.');
    case 'boss': { const r = x.fightBoss(); return reply(r || '지금은 고르곤 신호가 없어요.'); }
    case 'ult': return reply(x.ult ? x.ult() : '지금은 쓸 수 없어요.');
    case 'flare': return reply(x.flare() ? '플레어 발사!' : '플레어는 아직 재장전 중이에요.');
    case 'sell': { if (x.mode() !== 'hangar') return reply('시장은 포트에 도킹한 뒤 쓸 수 있어요.'); return reply(x.sellAll()); }
    case 'equip': { if (x.mode() !== 'hangar') return reply('장착은 포트에서 할 수 있어요.'); return reply(x.equipBest()); }
  }
  return reply('그 명령은 아직 잘 모르겠어요.');
}
function askPerm(to, msg) {
  pendingConfirm = yes => {
    if (!yes) return reply('알겠어요. 권한은 그대로예요.');
    if (to === 3) { pendingConfirm = yes2 => { if (!yes2) return reply('완전 자율은 취소했어요.'); setPerm(3); reply('완전 자율 켜짐. 정비와 출격까지 제가 맡을게요.', 'happy'); }; return reply('완전 자율은 제가 함선을 직접 움직이고 구매도 해요. 정말 올릴까요? 예/아니오'); }
    setPerm(to); reply(`권한 ${to}단계 · ${PERM_NAMES[to]} — ${PERM_DESC[to]}`, 'happy');
  };
  reply(msg + ' (예/아니오)', 'calm');
}
function setPerm(p) { cfg().perm = p; persist(); if (p >= 2) agentOn(true); else agentOff(false); }
function setPermByVoice(c) {
  const cur = cfg().perm;
  let to = typeof c.to === 'number' ? c.to : c.to === 'up' ? Math.min(3, cur + 1) : c.to === 'down' ? Math.max(0, cur - 1) : cur;
  if (to === cur) return reply(`지금은 ${cur}단계 · ${PERM_NAMES[cur]}예요. ${PERM_DESC[cur]}`);
  if (to < cur) { setPerm(to); return reply(`권한을 ${to}단계 · ${PERM_NAMES[to]}로 낮췄어요.`); }
  return askPerm(to, `권한을 ${to}단계 · ${PERM_NAMES[to]}로 올릴까요? ${PERM_DESC[to]}`);
}

/* ---------- 정보 조회 (규칙 기반, 항상 정확) ---------- */
function queryAnswer(id) {
  const x = ctx;
  switch (id) {
    case 'status': return x.status();
    case 'price': return x.priceInfo();
    case 'boss': return x.bossInfo();
    case 'mission': return x.missionInfo();
    case 'threat': return x.threatInfo();
    case 'advice': return x.adviceInfo();
    case 'perm': return `지금은 권한 ${cfg().perm}단계 · ${PERM_NAMES[cfg().perm]}예요. ${PERM_DESC[cfg().perm]} "권한 올려"라고 하면 올릴 수 있어요.`;
    case 'help': return '조작: W/S 전후진 · 마우스로 방향(클릭해 고정) · Space/Shift 상하 · 클릭 사격 · X 부스트 · C 플레어 · R 잠금 · F 미사일 · E 채굴 · M 지도. 말로도 "포트로 가", "금 광맥", "임무 해줘"처럼 명령할 수 있어요.';
  }
  return '잘 모르겠어요.';
}

/* ---------- 잡담: AI 또는 규칙 기반 ---------- */
let history = [];
async function chatAnswer(q) {
  const cfgOn = cfg().llm;
  const fallback = () => {
    const s = q.toLowerCase();
    if (has(s, '안녕', '하이', 'hi', 'hello')) return '안녕하세요, 캡틴! 오늘도 함께 날아요.';
    if (has(s, '이름', '누구')) return '저는 솔라레예요. 이 함선의 전술·항법 보조 AI예요.';
    if (has(s, '고마', '감사')) return '헤헤, 캡틴이 최고죠!';
    if (has(s, '심심', '농담')) return '제 꿈은 모래폭풍 없는 하루예요.';
    return cfgOn ? 'AI가 아직 준비 중이에요. 잠시 후 다시 말씀해 주세요. 명령이나 상태 질문은 지금도 바로 답해 드려요.' : '잡담은 설정에서 AI 대화를 켜면 더 잘 답해 드려요. 명령이나 상태 질문은 지금도 돼요!';
  };
  if (!cfgOn) return reply(fallback());
  ensureWorker(); if (llm.state !== 'ready') worker && worker.postMessage({ type: 'load', model: cfg().model });
  if (llm.state !== 'ready') return reply(llm.state === 'loading' ? `모델을 내려받는 중이에요 (${llm.pct}%). 조금만 기다려 주세요.` : fallback());
  const bubble = botLine('…');
  const sys = `너는 우주 비행선 게임 「하늘함대」의 함선 AI 「솔라레」다. 캡틴에게 한국어 존댓말로 짧게(두 문장 이내) 답한다. 모르는 것은 지어내지 않는다. 현재 상태: ${ctx.brief()}`;
  const msgs = [{ role: 'system', content: sys }, ...history.slice(-4), { role: 'user', content: q }];
  try {
    const text = await askLLM(msgs, d => { bubble.textContent = (bubble.textContent === '…' ? '' : bubble.textContent) + d; $('solLog').scrollTop = 1e9; });
    const out = (text || '').trim() || fallback();
    bubble.textContent = out; history.push({ role: 'user', content: q }, { role: 'assistant', content: out }); history = history.slice(-8);
    const box = $('solare'); box.classList.add('on'); $('solText').textContent = out; hideT = 6 + out.length * 0.05; speak(out);
  } catch (e) {
    bubble.textContent = fallback(); speak(bubble.textContent);
  }
}

/* ---------- 자율 임무 에이전트 ---------- */
const AG = { on: false, pausedUntil: 0, t: 0, goal: null, warned: false, lastNote: 0, pending: null, doneCount: 0 };
export function agentState() { return { on: AG.on, goal: AG.goal ? { kind: AG.goal.kind, why: AG.goal.why } : null, paused: now() < AG.pausedUntil }; }
export function agentOn(silent) {
  AG.on = true; AG.goal = null; if (!silent) event('agentOn', 2, 1);
}
export function agentOff(silent) { AG.on = false; AG.goal = null; if (!silent) reply('자율 모드를 껐어요.'); ctx && ctx.cancelAuto && ctx.cancelAuto(); }
/* 조작 중에는 잠시 자율을 멈춤 (조작을 멈추면 자동으로 이어감) */
export function agentPause(sec = 6) { AG.pausedUntil = Math.max(AG.pausedUntil, now() + sec); AG.goal = null; }
/* 목표가 사라졌을 때(격추·고갈) 다음 틱에 새 목표를 고르게 함 */
export function agentReset() { AG.goal = null; }
export function setPermUI(p) { setPerm(p); }
/* 매 프레임 호출: s = 상태 요약 (main.js 가 만든다) */
export function agentUpdate(dt, s) {
  AG.t -= dt; if (AG.t > 0) return; AG.t = 0.7;
  const perm = cfg().perm;
  if (perm >= 2 && !AG.on) AG.on = true;          // 저장값이 로드된 뒤에도 권한이 반영되도록
  if (perm < 2 && AG.on) AG.on = false;
  if (s.mode === 'hangar') { AG.goal = null; if (perm >= 2 && AG.on) hangarAuto(s, perm); return; }
  if (!s.alive) { AG.goal = null; return; }
  // 위험 경고 (모든 단계)
  const danger = s.hpPct < 0.35 || (s.shBroken && s.hpPct < 0.6);
  if (danger && !AG.warned) { AG.warned = true; event('lowHull', 3, 12); }
  if (!danger) AG.warned = false;
  if (perm < 2 || !AG.on) { suggest(s, perm); return; }
  if (now() < AG.pausedUntil) return;
  // 1) 생존
  if (danger) { if (AG.goal?.kind !== 'port') { event('retreat', 3, 20); } return setGoal({ kind: 'port', why: '후퇴' }); }
  if (s.incomingMissile && s.incomingMissile < 380 && s.flareReady && perm >= 2) { ctx.flare(); }
  else if (s.incomingMissile && s.incomingMissile < 260 && !s.flareReady && perm >= 2) { ctx.evade && ctx.evade(); }
  // 2) 화물이 찼으면 판매를 위해 귀항
  if (s.cargoPct > 0.85) return setGoal({ kind: 'port', why: '화물이 가득 찼어요' });
  // 3) 임무 진행: 행동마다 점수를 매겨 가장 이득인 것을 고른다
  const pick = chooseGoal(s);
  return setGoal(pick);
}
/* 기억: 격추된 장소는 위험 지역으로 기억해 다음 행동에서 피한다 */
export function rememberDeath(x, z) { cfg().deaths = [...(cfg().deaths || []), { x, z, t: Date.now() }].slice(-12); persist(); }
function dangerAt(x, z) {
  let d = 0; for (const k of cfg().deaths || []) { const dd = Math.hypot(k.x - x, k.z - z); if (dd < 500) d += 0.5 * (1 - dd / 500); } return Math.min(1, d);
}
/* 목표 점수 계산 (0 이상, 높을수록 좋음) */
function chooseGoal(s) {
  const strat = save.strategy || 'balanced', W = (STRATEGIES[strat] || STRATEGIES.balanced).w;
  const m = s.mission ? s.mission.id : null, cands = [];
  const hostile = s.hostile ? s.hostile : null;
  // 전투: 내 체력·방어막이 상대보다 충분하면 공격 가치가 높다
  const reach = 1200 + (W.fight > 1.3 ? 2400 : 0);   // 소탕·방어 전략은 더 멀리서도 적을 찾아간다
  if (hostile && hostile.dist < reach) {
    const mine = s.hpPct * 0.6 + s.shieldPct * 0.4, theirs = hostile.hpPct * 0.6 + hostile.shieldPct * 0.4;
    const edge = mine - theirs;
    let sc = 0.25 + 0.35 * (1 - hostile.hpPct) + Math.max(-0.4, edge) * 0.6 + (hostile.tier || 0) * 0.04;
    if (m === 'kill') sc += 0.45;
    if (m === 'launch' || m === 'arc' || m === 'ship') sc += 0.1;
    if (s.hpPct < 0.5) sc -= 0.25;
    if (W.fight < 0.7) sc -= 0.25;     // 채굴·탐험 전략은 위협이 아니면 싸움을 피한다
    if (hostile.dist > 900) sc -= 0.2 * Math.min(1, 2 / W.fight);
    cands.push([Math.max(0.05, sc) * W.fight, { kind: 'fight', target: hostile.ship, why: `${hostile.name}와 교전` }]);
  }
  // 광맥: 가치 / 거리 / 위험
  if (s.bestOre) {
    const o = s.bestOre, v = Math.min(1, o.value / 320);
    let sc = 0.2 + 0.45 * v - 0.00012 * o.dist - dangerAt(o.x, o.z) * 0.8;
    if (W.ore > 1.3) sc += 0.35;        // 채굴 전략: 광맥이 멀어도 기꺼이 간다
    if (m === 'mine') sc += 0.5;
    if (m === 'sell' && s.storageKg < 1) sc += 0.1;
    if (s.cargoPct > 0.6) sc -= 0.2;
    cands.push([Math.max(0.05, sc) * W.ore, { kind: 'ore', node: o.node, why: `${o.nm} 광맥 (${o.rarity})` }]);
  }
  // 포트: 필요성에 따라
  {
    let sc = 0.1 + Math.max(0, s.cargoPct - 0.5) * 1.2 + (s.storageKg > 0 ? 0.15 : 0) + (s.ownedUnequipped ? 0.1 : 0) - 0.0002 * s.portDist;
    if (m === 'dock') sc += 0.7; if (m === 'sell' && s.storageKg > 0) sc += 0.5; if (m === 'module' && s.ownedUnequipped) sc += 0.5;
    if (s.hpPct < 0.7) sc += 0.2;
    cands.push([sc * W.port, { kind: 'port', why: '정비·판매' }]);
  }
  // 보스: 체력이 충분할 때만
  if (s.boss && s.hpPct > 0.7) { let sc = 0.3 + (m === 'boss' ? 0.6 : 0); cands.push([sc * W.boss, { kind: 'fight', target: s.boss, why: '고르곤 격추' }]); }
  // 탐험 목표 (임무 전용 가중치)
  if (m === 'island') cands.push([0.9, { kind: 'island', why: '부유섬 임무' }]);
  if (m === 'wreck') cands.push([0.9, { kind: 'wreck', why: '난파선 임무' }]);
  // 전략: 탐험 · 기지 방어
  if (strat === 'explore' && !m) { const k = (Math.floor(now() / 60) % 3); cands.push([0.55 * W.explore, [{ kind: 'island', why: '부유섬 탐험' }, { kind: 'wreck', why: '난파선 탐험' }, { kind: 'outpost', why: '기지 순찰' }][k]]); }
  if (strat === 'defend' && s.ownBase) cands.push([0.7 * W.fight + (s.raid ? 1.2 : 0), { kind: 'outpost', why: s.raid ? `${s.ownBase.nm} 방어` : `${s.ownBase.nm} 경계` }]);
  if (s.raid && s.ownBase) cands.push([1.3, { kind: 'outpost', why: `${s.ownBase.nm} 습격 대응` }]);
  if (!cands.some(c => c[1].kind !== 'port') && s.hpPct > 0.8 && s.cargoPct < 0.5 && s.storageKg <= 0) cands.push([0.3, { kind: 'patrol', why: '순찰' }]);
  cands.sort((a, b) => b[0] - a[0]);
  AG.dbg = cands.map(c => c[1].kind + ':' + c[0].toFixed(2) + (c[1].why ? '(' + c[1].why + ')' : '')).join(' | ');
  // 끈기: 지금 목표가 충분히 나쁘지 않으면 바꾸지 않는다 (잦은 방향 전환 방지)
  const cur = AG.goal && cands.find(c => c[1].kind === AG.goal.kind && (c[1].kind !== 'fight' || c[1].target === AG.goal.target));
  if (cur && cur[0] > cands[0][0] - 0.15) return Object.assign({}, cur[1]);
  return cands.length ? cands[0][1] : { kind: 'ore', why: '광맥 찾기' };
}
function setGoal(g) {
  if (!AG.on) return;
  const key = g.kind + (g.target ? (g.target._id || g.target.name) : '');
  if (!AG.goal || AG.goal.key !== key) { AG.goal = Object.assign({}, g, { key }); ctx.goal(AG.goal); if (now() - AG.lastNote > 10) { AG.lastNote = now(); if (g.why) say(`${g.why}(으)로 이동할게요.`, 'calm', 0); } }
}
function hangarAuto(s, perm) {
  // 2단계: 판매·장착 / 3단계: 구매까지, 그리고 자동 출격
  if (perm < 2 || AG.hangarBusy) return;
  AG.hangarBusy = true;
  setTimeout(() => {
    AG.hangarBusy = false;
    if (ctx.mode() !== 'hangar') return;
    if (s.storageKg > 0) { const r = ctx.sellAll(); event('autoSold', 1, 2); void r; }
    const eq = ctx.equipBest(true); if (eq) event('autoEquip', 1, 2);
    if (perm >= 3) {
      const b = ctx.buyBest(); if (b) event('autoBuy', 1, 2);
      setTimeout(() => { if (ctx.mode() === 'hangar' && agentState().on) { event('autoLaunch', 2, 2); ctx.launch(); } }, 1800);
    }
  }, 900);
}
/* 자율이 꺼져 있을 때도 제안만 한다 */
function suggest(s, perm) {
  if (perm < 1 || s.mode !== 'fly') return;
  if (s.cargoPct > 0.85 && !AG.sug1) { AG.sug1 = true; reply('화물이 거의 찼어요. 포트로 가서 판매할까요? "포트로 가"라고 말씀해 주세요.'); setTimeout(() => AG.sug1 = false, 60000); }
  if (s.hostile && s.hostile.dist < 700 && s.missionKill && !AG.sug2) { AG.sug2 = true; reply('가까이 해적이 있어요. 격추 임무를 진행할까요? "임무 해줘"라고 말씀해 주세요.'); setTimeout(() => AG.sug2 = false, 40000); }
}

/* ---------- 초기화 ---------- */
export function refreshSolUI() { const el = $('solPerm'); if (el) el.textContent = `권한 ${permName()}`; }
export function initSolare(c) {
  ctx = c; cfg();
  $('solBtn').onclick = () => toggleChat();
  $('solClose').onclick = () => toggleChat(false);
  $('solForm').onsubmit = e => { e.preventDefault(); const v = $('solIn').value.trim(); if (!v) return; $('solIn').value = ''; submit(v); };
  $('solMic').onclick = () => listen();
  document.querySelectorAll('#solQuick button').forEach(b => b.onclick = () => submit(b.dataset.q || b.textContent));
  if (!SR) $('solMic').disabled = true;
  if (cfg().llm) { ensureWorker(); } emitStatus();
  if (cfg().perm >= 2) AG.on = true;
  window.__solare = { classify, submit, agentState, cfg, chooseGoal, AG };   // 테스트 훅
}
