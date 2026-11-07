// 솔라레 — 함선 AI 비서 (가상). 상황 대사 + 대화 명령(규칙 기반)
import { $, pick } from './core.js';

let ctx = null, typing = null, hideT = 0, lastSaid = {}, queue = [];
const LINES = {
  launch: ['출항 준비 완료. 좋은 비행 되세요, 캡틴!', '엔진 정상, 방어막 정상. 가볼까요?', '오늘 하늘은 우리 편이에요.'],
  dock: ['도킹 완료. 화물은 창고에 안전하게 옮겼어요.', '수고하셨어요, 캡틴. 정비는 제가 해 둘게요.'],
  lowHull: ['선체 손상 심각! 포트로 후퇴를 권장해요!', '캡틴, 이대로면 위험해요. 거리를 벌리세요!'],
  shieldBreak: ['방어막 붕괴! 재충전까지 버텨야 해요!', '방어막이 깨졌어요! 회피 기동!'],
  shieldRestore: ['방어막 복구 완료. 다시 초록불이에요.', '방어막 재가동! 휴, 다행이다.'],
  missile: ['미사일 접근! C로 플레어를!', '유도탄 경보! 플레어 쓰세요, 캡틴!'],
  cargoFull: ['화물칸이 꽉 찼어요. 포트로 돌아가 보관해요.', '더는 못 실어요! 귀항할까요?'],
  rare: ['와, 희귀 광맥이에요! 놓치지 마세요.', '센서에 귀한 반응! 바로 아래예요.'],
  storm: ['모래폭풍이에요. 레이더가 흐려지니 조심하세요.', '바람이 세져요. 고도를 유지하세요.'],
  boss: ['고르곤 신호 포착! 혼자서는 무리하지 마세요.', '해적 기함이에요… 큰 보상이 걸려 있어요.'],
  bossDown: ['고르곤 격추! 믿을 수가 없어요, 캡틴!', '해냈어요! 하늘이 조금 더 안전해졌어요.'],
  kill: ['격추 확인!', '명중! 해적 한 척 정리.', '좋아요, 그 기세예요!'],
  rank: ['평판이 올랐어요! 조선소에 새 함선이 열렸을지도요.'],
  newShip: ['새 함선이라니! 제 코어 이전 완료했어요.'],
  night: ['밤이 됐어요. 착륙장 불빛을 따라 돌아오세요.'],
  wreck: ['난파선 묘지예요… 대붕괴 때의 함대가 잠들어 있어요.'],
  island: ['부유 군도예요. 섬 위에 귀한 결정이 많대요.'],
  death: ['…시스템 재부팅. 캡틴, 다친 데 없죠? 포트에서 다시 시작해요.'],
  idle: ['레이더의 다이아몬드는 광맥, 빨간 점은 해적이에요.', '솔라레 버튼을 누르면 저랑 이야기할 수 있어요.', '모듈 탭에서 배를 개조해 보세요!'],
};
export function initSolare(c) {
  ctx = c;
  $('solBtn').onclick = () => toggleChat();
  $('solClose').onclick = () => toggleChat(false);
  $('solForm').onsubmit = e => { e.preventDefault(); const v = $('solIn').value.trim(); if (!v) return; $('solIn').value = ''; userSay(v); answer(v); };
  document.querySelectorAll('#solQuick button').forEach(b => b.onclick = () => { userSay(b.textContent); answer(b.dataset.q || b.textContent); });
}
export function say(text, mood = 'calm', prio = 1) {
  if (typing && prio < typing.prio) { queue.push([text, mood, prio]); return; }
  const box = $('solare'); box.classList.add('on'); box.dataset.mood = mood;
  const el = $('solText'); let i = 0; clearInterval(typing?.iv);
  typing = { prio, iv: setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) { clearInterval(typing.iv); typing = null; hideT = 4.5 + text.length * 0.04; } }, 28) };
  hideT = 99;
  if ($('solChat').classList.contains('on')) botSay(text);
}
export function event(key, prio = 1, cooldown = 25) {
  const now = performance.now() / 1000; if (lastSaid[key] && now - lastSaid[key] < cooldown) return;
  lastSaid[key] = now; const mood = ['lowHull', 'shieldBreak', 'missile', 'boss'].includes(key) ? 'alert' : ['kill', 'bossDown', 'rank', 'newShip', 'shieldRestore'].includes(key) ? 'happy' : 'calm';
  say(pick(LINES[key] || ['…']), mood, prio);
}
export function tickSolare(dt) {
  if (hideT < 99) { hideT -= dt; if (hideT <= 0) { $('solare').classList.remove('on'); hideT = 99; if (queue.length) say(...queue.shift()); } }
}
function toggleChat(on) { const c = $('solChat'); const v = on === undefined ? !c.classList.contains('on') : on; c.classList.toggle('on', v); if (v) { if (!c.dataset.init) { c.dataset.init = 1; botSay('부르셨어요, 캡틴? 상태 보고, 자동 비행, 광맥 안내, 시세… 무엇이든 말씀하세요.'); } setTimeout(() => $('solIn').focus(), 50); ctx.onChat && ctx.onChat(true); } else ctx.onChat && ctx.onChat(false); }
export function chatOpen() { return $('solChat').classList.contains('on'); }
export { toggleChat };
function userSay(t) { const d = document.createElement('div'); d.className = 'me'; d.textContent = t; $('solLog').appendChild(d); $('solLog').scrollTop = 1e9; }
function botSay(t) { const d = document.createElement('div'); d.className = 'bot'; d.textContent = t; $('solLog').appendChild(d); $('solLog').scrollTop = 1e9; }
function reply(t, mood = 'calm') { botSay(t); const box = $('solare'); box.classList.add('on'); box.dataset.mood = mood; $('solText').textContent = t; hideT = 6; }
const has = (s, ...w) => w.some(k => s.includes(k));
function answer(q) {
  const s = q.toLowerCase().replace(/\s+/g, '');
  const c = ctx;
  if (has(s, '취소', '멈춰', '정지', '그만', '수동')) { c.cancelAuto(); return reply('자동 비행 해제. 조종권을 돌려드려요.'); }
  if (has(s, '포트', '귀환', '귀항', '집', '돌아가', '도킹')) { const r = c.autoPort(); return reply(r ? `${r} 방향으로 자동 비행을 시작할게요. 조작하면 언제든 해제돼요.` : '지금은 비행 중이 아니에요. 출격 후에 말씀해 주세요.'); }
  const oreKey = has(s, '에테르', '결정') ? 'aether' : has(s, '금') ? 'gold' : has(s, '은') ? 'silver' : has(s, '구리') ? 'copper' : has(s, '철') ? 'iron' : null;
  if (has(s, '광맥', '광석', '채굴', '캐') || oreKey) { const r = c.autoOre(oreKey); return reply(r || '근처에서 해당 광맥을 찾지 못했어요. 시간이 지나면 새로 생겨요.'); }
  if (has(s, '보스', '고르곤', '기함', '이벤트')) return reply(c.bossInfo());
  if (has(s, '시세', '가격', '팔', '판매', '돈')) return reply(c.priceInfo());
  if (has(s, '상태', '보고', '체력', '선체', '방어막', '어때')) return reply(c.status());
  if (has(s, '해적', '적', '위협', '전투')) return reply(c.threatInfo());
  if (has(s, '임무', '스토리', '퀘스트', '뭐해', '할일', '목표')) return reply(c.missionInfo());
  if (has(s, '조작', '도움', '방법', '키', '어떻게')) return reply('W/S 전진·후진, 마우스로 방향(클릭해서 고정), Space/Shift 상승·하강, X 부스트, C 플레어, R 잠금, F 미사일, E 채굴이에요.');
  if (has(s, '모듈', '개조', '추천', '업그레이드')) return reply(c.adviceInfo());
  if (has(s, '안녕', '하이', 'hi', 'hello')) return reply('안녕하세요, 캡틴! 오늘도 함께 날아요.', 'happy');
  if (has(s, '이름', '누구', '정체')) return reply('저는 솔라레. 이 함선의 전술·항법 보조 AI예요. 아버님이 직접 조율하셨대요.');
  if (has(s, '고마', '감사', '최고', '좋아')) return reply('헤헤, 캡틴이 최고죠!', 'happy');
  if (has(s, '심심', '농담', '재밌')) return reply(pick(['해적이 에테르를 못 쓰는 이유요? …연료가 아까워서 "깃발"만 펄럭이거든요. 미안해요.', '제 꿈은 모래폭풍 없는 하루예요.']), 'happy');
  return reply(pick(['음… 잘 모르겠어요. "상태", "가까운 포트", "금 광맥", "시세", "보스" 같은 말을 써 보세요.', '그 명령은 아직 못 배웠어요. 아래 버튼을 눌러 보세요!']));
}
