// 게임 데이터 + 저장
import { rand, pick, clamp } from './core.js';

export const WORLD = 2600;   // 전장 반경 (m)

export const TIERS = [
  { id: 0, t: 'T1', nm: '드리프터', en: 'DRIFTER', cost: 0, rank: 0, hp: 140, cargo: 650, speed: 62, accel: 26, turn: 1.0, turrets: 2, scale: 1, ds: '가볍고 민첩한 입문용 채굴 비행선' },
  { id: 1, t: 'T2', nm: '스트라이더', en: 'STRIDER', cost: 2600, rank: 1, hp: 230, cargo: 1000, speed: 66, accel: 28, turn: 0.95, turrets: 2, scale: 1.12, ds: '미사일 포드를 기본 장착한 다목적 함선' },
  { id: 2, t: 'T3', nm: '바스티온', en: 'BASTION', cost: 8500, rank: 2, hp: 380, cargo: 1600, speed: 60, accel: 24, turn: 0.82, turrets: 3, scale: 1.3, ds: '측면 포탑이 추가된 중장갑 호위함' },
  { id: 3, t: 'T4', nm: '리바이어던', en: 'LEVIATHAN', cost: 24000, rank: 3, hp: 600, cargo: 2600, speed: 57, accel: 20, turn: 0.7, turrets: 4, scale: 1.55, ds: '포탑 4문과 거대한 화물칸을 가진 전함' },
];

export const MODS = {
  guns:    { ic: '🔫', nm: '포탑 (기관포)', max: 5, base: 220, ds: l => `발당 피해 ${(2.2 + 0.9 * l).toFixed(1)} · 포탑당 연사 ${(2.4 + 0.6 * l).toFixed(1)}/s` },
  missile: { ic: '🚀', nm: '유도 미사일', max: 5, base: 380, ds: l => l ? `피해 ${40 + 15 * l} · 재장전 ${Math.max(2.5, 6 - 0.6 * l).toFixed(1)}s` : '미보유 — 잠금 후 발사하는 유도탄' },
  armor:   { ic: '🛡️', nm: '장갑판', max: 5, base: 200, ds: l => `선체 +${l * 22}%` },
  engine:  { ic: '🔥', nm: '엔진', max: 5, base: 200, ds: l => `속도 +${l * 7}% · 선회 +${l * 6}%` },
  cargo:   { ic: '📦', nm: '화물칸 확장', max: 5, base: 180, ds: l => `적재량 +${l * 20}%` },
  drill:   { ic: '⛏️', nm: '채굴 레이저', max: 5, base: 160, ds: l => `채굴 속도 ×${(1 + l * 0.5).toFixed(1)}` },
};
export const modCost = (k, lv, tier) => Math.round(MODS[k].base * (lv + 1) * (1 + tier * 0.6));

export const ORES = {
  copper: { nm: '구리', rar: '흔함', kg: 7, cr: 18, col: 0xd9783a, glow: 0 },
  iron:   { nm: '철', rar: '흔함', kg: 9, cr: 14, col: 0x8f8f96, glow: 0 },
  silver: { nm: '은', rar: '드묾', kg: 6, cr: 42, col: 0xdfe6ee, glow: 0.2 },
  gold:   { nm: '금', rar: '희귀', kg: 8, cr: 110, col: 0xf2c14e, glow: 0.5 },
  aether: { nm: '에테르 결정', rar: '전설', kg: 4, cr: 320, col: 0x39e6ff, glow: 2.5 },
};
export const ORE_WEIGHTS = [['copper', 34], ['iron', 30], ['silver', 18], ['gold', 12], ['aether', 6]];
export function rollOre() { let r = Math.random() * 100; for (const [k, w] of ORE_WEIGHTS) { if ((r -= w) < 0) return k; } return 'copper'; }
export const RAR_COL = { '흔함': '#c9b79a', '드묾': '#7fd3ff', '희귀': '#ffcc55', '전설': '#4ff0ff' };

export const RANKS = [
  { nm: '드리프터', xp: 0 }, { nm: '항해사', xp: 150 }, { nm: '용병', xp: 450 }, { nm: '함장', xp: 1000 }, { nm: '제독', xp: 2200 },
];
export function rankOf(xp) { let i = 0; while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++; return i; }

export const PAINTS = [
  { id: 'sand', nm: '사막', c: [1, 1, 1] }, { id: 'mint', nm: '민트', c: [0.86, 1.08, 0.8] }, { id: 'olive', nm: '올리브', c: [0.72, 0.82, 0.55] },
  { id: 'steel', nm: '강철', c: [0.74, 0.78, 0.82] }, { id: 'navy', nm: '해군', c: [0.45, 0.55, 0.78] }, { id: 'crimson', nm: '진홍', c: [0.95, 0.5, 0.45] },
  { id: 'night', nm: '야간', c: [0.35, 0.35, 0.38] }, { id: 'ivory', nm: '아이보리', c: [1.15, 1.12, 1.05] },
];

export const PORT_DEFS = [
  { id: 'anton', nm: '포트 앤톤', x: -1500, z: 300, price: 1.0 },
  { id: 'mesa', nm: '메사 기지', x: 1300, z: -1400, price: 1.12 },
  { id: 'red', nm: '레드캐년 정거장', x: 1100, z: 1550, price: 0.94 },
];

export const CAPTAIN_NAMES = ['ARAKI', 'as2410q', 'coocoo', 'HA_SEIDA', 'Halfmoonbear', 'Heyo', 'rhdiddlQhfl', 'ttnbb22qm', 'Nimbus77', 'Kestrel', 'sora_pilot', 'DUSTY', 'minjun_k', 'Vega', 'orbit_ace', 'Mocha', 'Zeal', 'pixelhawk', 'Juno', 'Tangerine', 'ghostwing', 'Lumen', 'yuna_88', 'Brass', 'Copperhead'];
export const PIRATE_NAMES = ['붉은 까마귀', '모래 독사', '협곡 늑대', '검은 돛', '녹슨 갈고리', '사막 하이에나', '불꽃 해골', '폭풍 약탈자', '쇠갈퀴', '먼지 유령', '해골 깃발', '독수리 발톱'];

export const TIPS = [
  '조선소에서 다음 등급 함선을 연구하세요. 평판이 오르면 더 큰 함선이 열립니다.',
  '화물은 포트에 도킹해야 안전하게 보관됩니다. 격추되면 화물을 잃어요.',
  '에테르 결정은 밤에 더 밝게 빛납니다. 전설 등급이라 값이 비쌉니다.',
  '포트마다 광석 시세가 다릅니다. 비싼 곳에서 파세요.',
  '잠금(R)으로 적을 고정하면 포탑이 자동으로 조준합니다.',
  'PvP 모드를 켜면 다른 캡틴과도 싸울 수 있지만, 그들도 당신을 노립니다.',
  '화물이 무거울수록 함선이 느려집니다.',
];

/* ---------- 저장 ---------- */
const KEY = 'skyfleet_save_v2';
function freshShip(tier) { return { tier, lv: { guns: 0, missile: tier >= 1 ? 1 : 0, armor: 0, engine: 0, cargo: 0, drill: 0 } }; }
export function defaultSave() {
  return { credits: 300, xp: 0, ships: [freshShip(0)], active: 0, paint: 'sand', pvp: false, storage: {}, prices: {}, quests: [], stats: { kills: 0, mined: 0, deaths: 0 }, skyrunBest: 0 };
}
export let save = defaultSave();
export function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.ships) save = Object.assign(defaultSave(), s); } catch (e) {}
  if (!save.quests || save.quests.length < 3) refillQuests();
  return save;
}
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }
export const activeShip = () => save.ships[save.active] || save.ships[0];
export function ownsTier(t) { return save.ships.some(s => s.tier === t); }
export function buyTier(t) { if (ownsTier(t)) return; save.ships.push(freshShip(t)); save.active = save.ships.length - 1; }

/* ---------- 퀘스트 ---------- */
let qid = Date.now() % 100000;
export function makeQuest() {
  const tier = activeShip().tier, k = Math.random();
  if (k < 0.38) { const n = 2 + Math.floor(Math.random() * 3) + tier; return { id: qid++, type: 'kill', nm: `해적 ${n}척 격추`, need: n, have: 0, cr: 160 * n, xp: 22 * n }; }
  if (k < 0.72) { const n = (400 + Math.floor(Math.random() * 5) * 100) * (1 + tier * 0.5); return { id: qid++, type: 'mine', nm: `광석 ${n}kg 채굴`, need: n, have: 0, cr: Math.round(n * 0.9), xp: Math.round(n / 12) }; }
  const ore = pick(['copper', 'iron', 'silver', 'gold']); const n = ore === 'gold' ? 4 : ore === 'silver' ? 8 : 15;
  return { id: qid++, type: 'deliver', ore, nm: `${ORES[ore].nm} ${n}개 납품`, need: n, have: 0, cr: Math.round(ORES[ore].cr * n * 1.8), xp: 40 + n * 2 };
}
export function refillQuests() { save.quests = save.quests || []; while (save.quests.length < 3) save.quests.push(makeQuest()); }
export function questProgress(type, amt) {
  for (const q of save.quests) if (q.type === type && q.have < q.need) q.have = Math.min(q.need, q.have + amt);
}

/* ---------- 시세 ---------- */
export function priceOf(ore, port) {
  const base = ORES[ore].cr * (port ? port.price : 1);
  const drift = (save.prices[ore] ?? 1);
  return Math.max(1, Math.round(base * drift));
}
export function driftPrices() { for (const k in ORES) save.prices[k] = clamp((save.prices[k] ?? 1) * rand(0.94, 1.06), 0.7, 1.4); }
