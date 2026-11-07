// 게임 데이터 + 저장
import { rand, pick, clamp } from './core.js';

export const WORLD = 3400;   // 전장 반경 (m)

/* ---------- 함선 (9종) ----------
   TIERS[id] 는 함선 클래스. tier 는 등급(0=T1 … 4=T5).
   model: 파라메트릭 모델 설정 (ships.js) */
export const TIERS = [
  { id: 0, tier: 0, t: 'T1', nm: '드리프터', en: 'DRIFTER', role: '입문', cost: 0, rank: 0, hp: 150, shield: 80, cargo: 650, speed: 95, accel: 58, turn: 1.55, turrets: 2, slots: 2, scale: 1,
    ds: '포트 앤톤에서 물려받은 낡은 채굴선. 가볍고 다루기 쉽다.', model: { len: 26, wid: 1, bridge: 1, nac: [[8, -0.3]], wing: 27, pods: null } },
  { id: 1, tier: 1, t: 'T2', nm: '스트라이더', en: 'STRIDER', role: '전투', cost: 2600, rank: 1, hp: 230, shield: 140, cargo: 800, speed: 104, accel: 64, turn: 1.5, turrets: 2, slots: 3, scale: 1.1,
    ds: '미사일 포드를 단 다목적 전투함. 첫 전투함으로 인기.', model: { len: 28, wid: 1, bridge: 1, nac: [[8, -0.3]], wing: 29, pods: 'missile', spine: true } },
  { id: 2, tier: 1, t: 'T2', nm: '머큐리', en: 'MERCURY', role: '화물', cost: 2400, rank: 1, hp: 270, shield: 110, cargo: 1500, speed: 88, accel: 46, turn: 1.25, turrets: 2, slots: 3, scale: 1.15,
    ds: '측면 화물 컨테이너를 매단 상선. 채굴·교역에 최적.', model: { len: 30, wid: 1.15, bridge: 1, nac: [[8.6, -0.3]], wing: 25, pods: 'cargo' } },
  { id: 3, tier: 1, t: 'T2', nm: '스패로', en: 'SPARROW', role: '정찰', cost: 2800, rank: 1, hp: 175, shield: 130, cargo: 550, speed: 128, accel: 84, turn: 1.85, turrets: 2, slots: 3, scale: 0.95,
    ds: '날렵한 고속 정찰선. 가장 빠르지만 장갑이 얇다.', model: { len: 30, wid: 0.8, bridge: 1, nac: [[7, -0.3]], wing: 32, pods: null, ram: true, slim: true } },
  { id: 4, tier: 2, t: 'T3', nm: '바스티온', en: 'BASTION', role: '탱커', cost: 8500, rank: 2, hp: 430, shield: 240, cargo: 1400, speed: 90, accel: 48, turn: 1.15, turrets: 3, slots: 4, scale: 1.3,
    ds: '두꺼운 장갑과 측면 포탑을 단 호위함. 쉽게 쓰러지지 않는다.', model: { len: 28, wid: 1.2, bridge: 2, nac: [[8.4, -0.3]], wing: 27, pods: 'missile', sponson: true } },
  { id: 5, tier: 2, t: 'T3', nm: '바이퍼', en: 'VIPER', role: '돌격', cost: 9000, rank: 2, hp: 310, shield: 210, cargo: 900, speed: 120, accel: 76, turn: 1.65, turrets: 3, slots: 4, scale: 1.2,
    ds: '충각과 3연 포탑을 단 돌격함. 빠르게 파고들어 몰아친다.', model: { len: 32, wid: 0.95, bridge: 1, nac: [[8, -0.3]], wing: 31, pods: 'missile', ram: true, spine: true, sponsonR: true } },
  { id: 6, tier: 3, t: 'T4', nm: '리바이어던', en: 'LEVIATHAN', role: '전함', cost: 24000, rank: 3, hp: 680, shield: 340, cargo: 2600, speed: 86, accel: 40, turn: 1.0, turrets: 4, slots: 5, scale: 1.55,
    ds: '포탑 4문과 거대한 화물칸을 가진 전함. 하늘의 요새.', model: { len: 30, wid: 1.25, bridge: 2, nac: [[8, -0.3], [11.5, -2.4]], wing: 27, pods: 'missile', sponson: true } },
  { id: 7, tier: 3, t: 'T4', nm: '세라프', en: 'SERAPH', role: '요격', cost: 26000, rank: 3, hp: 500, shield: 420, cargo: 1500, speed: 112, accel: 62, turn: 1.4, turrets: 4, slots: 5, scale: 1.45,
    ds: '강력한 방어막 발생기를 품은 요격 순양함. 빛나는 날개가 특징.', model: { len: 32, wid: 1, bridge: 2, nac: [[8, -0.3], [12.5, 0.4]], wing: 36, pods: 'missile', spine: true, sponson: true, halo: true } },
  { id: 8, tier: 4, t: 'T5', nm: '아크라이트', en: 'ARCLIGHT', role: '기함', cost: 60000, rank: 4, hp: 950, shield: 560, cargo: 3500, speed: 96, accel: 46, turn: 1.0, turrets: 5, slots: 6, scale: 1.85,
    ds: '전설로만 전해지던 에테르 기함. 하늘의 주인이 되는 배.', model: { len: 34, wid: 1.25, bridge: 3, nac: [[8, -0.3], [12, -2.4], [12, 1.8]], wing: 34, pods: 'missile', spine: true, sponson: true, ram: true, halo: true } },
];

/* ---------- 업그레이드 (함선별 레벨) ---------- */
export const MODS = {
  guns:    { ic: '🔫', nm: '포탑 (주포)', max: 5, base: 220, ds: l => `발당 피해 ${(2.2 + 0.9 * l).toFixed(1)} · 포탑당 연사 ${(2.4 + 0.6 * l).toFixed(1)}/s` },
  missile: { ic: '🚀', nm: '유도 미사일', max: 5, base: 380, ds: l => l ? `피해 ${40 + 15 * l} · 재장전 ${Math.max(2.5, 6 - 0.6 * l).toFixed(1)}s` : '미보유 — 잠금 후 발사하는 유도탄' },
  armor:   { ic: '🛡️', nm: '장갑판', max: 5, base: 200, ds: l => `선체 +${l * 22}%` },
  engine:  { ic: '🔥', nm: '엔진', max: 5, base: 200, ds: l => `속도 +${l * 6}% · 선회 +${l * 5}%` },
  cargo:   { ic: '📦', nm: '화물칸 확장', max: 5, base: 180, ds: l => `적재량 +${l * 20}%` },
  drill:   { ic: '⛏️', nm: '채굴 레이저', max: 5, base: 160, ds: l => `채굴 속도 ×${(1 + l * 0.5).toFixed(1)}` },
};
export const modCost = (k, lv, cls) => Math.round(MODS[k].base * (lv + 1) * (1 + (TIERS[cls] ? TIERS[cls].tier : 0) * 0.6));

export const WEAPONS = {
  cannon: { nm: '기관포', ic: '🔫', cost: 0, dmg: 1, rate: 1, speed: 720, spread: 1, life: 1.1, pellets: 1, barrels: 2, err: 0.25, ds: '균형 잡힌 연사형 주포 · 사거리 790m' },
  flak:   { nm: '플랙포', ic: '💥', cost: 1800, dmg: 0.45, rate: 0.55, speed: 560, spread: 5, life: 0.7, pellets: 4, barrels: 2, err: 0.35, ds: '근거리 산탄 · 가까울수록 강력 · 사거리 390m' },
  rail:   { nm: '레일건', ic: '⚡', cost: 4500, dmg: 9, rate: 0.2, speed: 1500, spread: 0.15, life: 0.75, pellets: 1, barrels: 1, err: 0.12, ds: '초고속 정밀탄 · 한 방이 강력 · 사거리 1,100m' },
};

/* ---------- 장착 모듈 (슬롯) ---------- */
export const MODULES = {
  shield1:  { ic: '🔰', nm: '방어막 발생기 Mk.I', cost: 600, cat: '방어', ds: '방어막 용량 +25%', fx: { shield: 0.25 } },
  shield2:  { ic: '🔰', nm: '방어막 발생기 Mk.II', cost: 1900, cat: '방어', ds: '방어막 용량 +50%', fx: { shield: 0.5 } },
  shield3:  { ic: '🔰', nm: '방어막 발생기 Mk.III', cost: 5200, cat: '방어', ds: '방어막 용량 +90%', fx: { shield: 0.9 } },
  recharge: { ic: '♻️', nm: '방어막 재충전기', cost: 1500, cat: '방어', ds: '방어막 회복 +60% · 붕괴 시간 -35%', fx: { shRegen: 0.6, shBreak: -0.35 } },
  reactive: { ic: '🧱', nm: '반응 장갑', cost: 1400, cat: '방어', ds: '선체가 받는 피해 -15%', fx: { hullDR: 0.15 } },
  nanobot:  { ic: '🦠', nm: '나노 수리봇', cost: 2200, cat: '방어', ds: '5초간 안 맞으면 선체 초당 2% 수리', fx: { nano: 0.02 } },
  turbo:    { ic: '💨', nm: '터보 차저', cost: 1200, cat: '기동', ds: '부스트 소모 -35% · 충전 +40%', fx: { boostEff: 0.35, boostRegen: 0.4 } },
  stabil:   { ic: '🎯', nm: '추진 안정기', cost: 1000, cat: '기동', ds: '선회 +18% · 가속 +15%', fx: { turn: 0.18, accel: 0.15 } },
  thruster: { ic: '🚀', nm: '고출력 추진기', cost: 2000, cat: '기동', ds: '최고 속도 +12%', fx: { speed: 0.12 } },
  rack:     { ic: '🎆', nm: '이중 미사일 랙', cost: 2600, cat: '공격', ds: '미사일 2발 동시 발사', fx: { misCount: 1 } },
  accel:    { ic: '⚙️', nm: '탄속 가속기', cost: 1600, cat: '공격', ds: '탄속·사거리 +25%', fx: { bulletSpd: 0.25 } },
  aimcomp:  { ic: '🖥️', nm: '조준 컴퓨터', cost: 1300, cat: '공격', ds: '탄 퍼짐 -45% · 잠금 거리 +40%', fx: { spread: -0.45, lockRange: 0.4 } },
  loader:   { ic: '🔩', nm: '고속 장전기', cost: 2400, cat: '공격', ds: '포탑 연사 +15%', fx: { rate: 0.15 } },
  drone:    { ic: '🛸', nm: '채굴 드론', cost: 1100, cat: '유틸', ds: '채굴 속도 +50% · 채굴 거리 +60%', fx: { drill: 0.5, mineRange: 0.6 } },
  compress: { ic: '🗜️', nm: '화물 압축기', cost: 1500, cat: '유틸', ds: '적재량 +25%', fx: { cargo: 0.25 } },
  scanner:  { ic: '📡', nm: '광역 스캐너', cost: 900, cat: '유틸', ds: '레이더 범위 +60%', fx: { radar: 0.6 } },
  flares:   { ic: '✨', nm: '플레어 디스펜서', cost: 800, cat: '유틸', ds: '플레어 재사용 -45%', fx: { flareCd: -0.45 } },
  magnet:   { ic: '🧲', nm: '회수 자석', cost: 700, cat: '유틸', ds: '전리품 회수 거리 ×3 · 현상금 +10%', fx: { magnet: 2, bounty: 0.1 } },
};
export function modFx(ids) {
  const f = {};
  for (const id of ids || []) { const m = MODULES[id]; if (!m) continue; for (const k in m.fx) f[k] = (f[k] || 0) + m.fx[k]; }
  return f;
}

export const ORES = {
  copper: { nm: '구리', rar: '흔함', kg: 7, cr: 18, col: 0xd9783a, glow: 0 },
  iron:   { nm: '철', rar: '흔함', kg: 9, cr: 14, col: 0x8f8f96, glow: 0 },
  silver: { nm: '은', rar: '드묾', kg: 6, cr: 42, col: 0xdfe6ee, glow: 0.2 },
  gold:   { nm: '금', rar: '희귀', kg: 8, cr: 110, col: 0xf2c14e, glow: 0.5 },
  aether: { nm: '에테르 결정', rar: '전설', kg: 4, cr: 320, col: 0x39e6ff, glow: 2.5 },
};
export const ORE_WEIGHTS = [['copper', 34], ['iron', 30], ['silver', 18], ['gold', 12], ['aether', 6]];
export function rollOre(rich) { let r = Math.random() * 100 - (rich ? 35 : 0); for (const [k, w] of ORE_WEIGHTS) { if ((r -= w) < 0) return k; } return 'aether'; }
export const RAR_COL = { '흔함': '#c9b79a', '드묾': '#7fd3ff', '희귀': '#ffcc55', '전설': '#4ff0ff' };

export const RANKS = [
  { nm: '드리프터', xp: 0 }, { nm: '항해사', xp: 150 }, { nm: '용병', xp: 450 }, { nm: '함장', xp: 1000 }, { nm: '제독', xp: 2200 }, { nm: '하늘의 주인', xp: 4200 },
];
export function rankOf(xp) { let i = 0; while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++; return i; }

export const PAINTS = [
  { id: 'sand', nm: '사막', c: [1, 1, 1] }, { id: 'mint', nm: '민트', c: [0.86, 1.08, 0.8] }, { id: 'olive', nm: '올리브', c: [0.72, 0.82, 0.55] },
  { id: 'steel', nm: '강철', c: [0.74, 0.78, 0.82] }, { id: 'navy', nm: '해군', c: [0.45, 0.55, 0.78] }, { id: 'crimson', nm: '진홍', c: [0.95, 0.5, 0.45] },
  { id: 'night', nm: '야간', c: [0.35, 0.35, 0.38] }, { id: 'ivory', nm: '아이보리', c: [1.15, 1.12, 1.05] },
  { id: 'gold', nm: '황금', c: [1.2, 0.95, 0.5] }, { id: 'violet', nm: '보라', c: [0.7, 0.55, 0.95] },
];

export const PORT_DEFS = [
  { id: 'anton', nm: '포트 앤톤', x: -1600, z: 350, price: 1.0 },
  { id: 'mesa', nm: '메사 기지', x: 1500, z: -1550, price: 1.12 },
  { id: 'red', nm: '레드캐년 정거장', x: 1250, z: 1700, price: 0.94 },
  { id: 'oasis', nm: '오아시스 교역소', x: -1300, z: -1900, price: 1.06 },
  { id: 'grave', nm: '난파선 전초기지', x: 2500, z: 200, price: 1.18 },
];

/* 지역 이름 (지도 표시) */
export const REGIONS = [
  { nm: '붉은 협곡', x: -400, z: 600 }, { nm: '부유 군도', x: 300, z: -500 }, { nm: '난파선 묘지', x: 2350, z: -350 },
  { nm: '유리 사막', x: -2300, z: -900 }, { nm: '은빛 강', x: 400, z: 2300 }, { nm: '해골 고원', x: -2400, z: 2200 },
];

export const CAPTAIN_NAMES = ['ARAKI', 'as2410q', 'coocoo', 'HA_SEIDA', 'Halfmoonbear', 'Heyo', 'rhdiddlQhfl', 'ttnbb22qm', 'Nimbus77', 'Kestrel', 'sora_pilot', 'DUSTY', 'minjun_k', 'Vega', 'orbit_ace', 'Mocha', 'Zeal', 'pixelhawk', 'Juno', 'Tangerine', 'ghostwing', 'Lumen', 'yuna_88', 'Brass', 'Copperhead'];
export const PIRATE_NAMES = ['붉은 까마귀', '모래 독사', '협곡 늑대', '검은 돛', '녹슨 갈고리', '사막 하이에나', '불꽃 해골', '폭풍 약탈자', '쇠갈퀴', '먼지 유령', '해골 깃발', '독수리 발톱'];

export const TIPS = [
  '조선소에서 다음 등급 함선을 구매하세요. 각 등급마다 전투·화물·정찰 등 여러 갈래가 있습니다.',
  '방어막은 맞을수록 초록→노랑→빨강으로 변하고, 깨지면 잠시 후 회복됩니다.',
  '화물은 포트에 도킹해야 안전하게 보관됩니다. 격추되면 화물을 잃어요.',
  '에테르 결정은 부유섬 위에서 더 자주 발견됩니다.',
  '솔라레에게 "가까운 포트로" 라고 말하면 자동 비행으로 데려다 줍니다.',
  '모듈 탭에서 방어막 발생기, 터보 차저 같은 장비를 슬롯에 장착하세요.',
  '마우스를 고정하면 함선이 카메라가 보는 방향으로 날아갑니다.',
];

/* ---------- 스토리 ---------- */
export const INTRO = [
  { t: '300년 전', s: '「대붕괴」가 하늘을 갈랐다. 대지는 갈라져 끝없는 붉은 협곡이 되었고, 바다는 말라 은빛 강줄기만 남았다.' },
  { t: '에테르의 시대', s: '살아남은 사람들은 에테르 결정으로 움직이는 부유 기관을 만들어 하늘로 올라갔다. 결정은 연료이자, 화폐이자, 생명이었다.' },
  { t: '붉은 깃발', s: '그러나 결정이 있는 곳엔 약탈자가 있었다. 해적 연합 「붉은 깃발」과 그들의 기함 「고르곤」이 항로를 피로 물들이고 있다.' },
  { t: '포트 앤톤', s: '당신은 돌아가신 아버지에게서 낡은 채굴선 「드리프터」 한 척을 물려받은 신참 캡틴이다.' },
  { t: '솔라레', s: '선교의 오래된 단말기에 불이 들어온다. "…시스템 재부팅 완료. 안녕하세요, 캡틴. 저는 이 함선의 AI, 솔라레입니다."', solare: true },
];
export const CHAPTERS = [
  { id: 'launch', nm: '1장 · 첫 출항', goal: '격납고에서 「항구를 떠나기」로 출격하기', need: 1, cr: 100, xp: 10, solare: '좋아요, 캡틴! 하늘이 우리를 기다리고 있어요. W로 전진, 마우스로 방향을 잡아 보세요.' },
  { id: 'mine', nm: '2장 · 광부의 길', goal: '광석 60kg 채굴하기 (광맥 위에서 E)', need: 60, cr: 200, xp: 20, solare: '레이더의 다이아몬드 표시가 광맥이에요. 가까이 가서 E를 길게 누르세요.' },
  { id: 'dock', nm: '3장 · 안전한 귀항', goal: '포트 착륙장에 도킹해 화물 보관하기', need: 1, cr: 200, xp: 20, solare: '화물은 도킹해야 안전해요. 착륙장 원 위로 천천히 내려가세요.' },
  { id: 'sell', nm: '4장 · 첫 거래', goal: '시장에서 광석 판매하기', need: 1, cr: 250, xp: 25, solare: '시장 탭에서 광석을 팔 수 있어요. 포트마다 시세가 달라요!' },
  { id: 'kill', nm: '5장 · 모래 위의 피', goal: '해적 3척 격추하기', need: 3, cr: 600, xp: 60, solare: '붉은 깃발 놈들이에요. R로 잠그면 포탑이 알아서 조준해요. 방어막 색을 잘 보세요!' },
  { id: 'module', nm: '6장 · 개조', goal: '모듈 탭에서 모듈 1개 장착하기', need: 1, cr: 300, xp: 30, solare: '모듈을 달면 이 배가 훨씬 강해져요. 방어막 발생기부터 추천해요.' },
  { id: 'island', nm: '7장 · 부유 군도', goal: '부유섬 위 광맥에서 채굴하기', need: 1, cr: 500, xp: 50, solare: '하늘에 떠 있는 섬들, 보이세요? 그 위엔 귀한 결정이 많대요.' },
  { id: 'ship', nm: '8장 · 더 큰 날개', goal: '조선소에서 T2 이상 함선 구매하기', need: 1, cr: 800, xp: 80, solare: '새 배라니, 설레요! 제 코어는 그대로 옮겨 탈게요.' },
  { id: 'wreck', nm: '9장 · 난파선의 비밀', goal: '난파선 묘지 방문하기 (지도 동쪽)', need: 1, cr: 900, xp: 90, solare: '대붕괴 때 추락한 옛 함대예요… 이상한 신호가 잡혀요. 가 볼까요?' },
  { id: 'boss', nm: '10장 · 고르곤', goal: '해적 기함 「고르곤」 격추에 참여하기', need: 1, cr: 3000, xp: 250, solare: '고르곤이 나타나면 레이더에 큰 빨간 점이 떠요. 무리하진 마세요, 캡틴.' },
  { id: 'arc', nm: '최종장 · 하늘의 주인', goal: 'T5 기함 「아크라이트」 손에 넣기', need: 1, cr: 10000, xp: 500, solare: '아크라이트… 전설의 배예요. 캡틴이라면 할 수 있어요.' },
];
export const ENDING = '아크라이트의 에테르 기관이 깨어나자, 붉은 협곡 위로 새벽빛이 번졌다. 해적들은 더 이상 이 하늘을 함부로 넘보지 못한다. "캡틴, 이제 우리 하늘이에요." — 솔라레';

/* ---------- 저장 ---------- */
const KEY = 'skyfleet_save_v2';
function freshShip(cls) { return { tier: cls, lv: { guns: 0, missile: TIERS[cls].tier >= 1 ? 1 : 0, armor: 0, engine: 0, cargo: 0, drill: 0 }, weapon: 'cannon', mods: [] }; }
export function defaultSave() {
  return { ver: 3, credits: 300, xp: 0, ships: [freshShip(0)], active: 0, paint: 'sand', pvp: false, storage: {}, prices: {}, quests: [], stats: { kills: 0, mined: 0, deaths: 0, bosses: 0 }, skyrunBest: 0, weapons: ['cannon'], modules: [], mute: false, solare: { voice: true, llm: false, perm: 0, mic: true }, story: { ch: 0, have: 0, intro: false, done: false }, camSteer: true };
}
export let save = defaultSave();
export function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.ships) save = Object.assign(defaultSave(), s); } catch (e) {}
  if (!save.ver || save.ver < 3) {   // v2 → v3: 함선 클래스 재배치
    const map = [0, 1, 4, 6];
    for (const sh of save.ships) { sh.tier = map[sh.tier] ?? 0; sh.mods = sh.mods || []; sh.weapon = sh.weapon || 'cannon'; }
    save.modules = save.modules || []; save.story = save.story || { ch: 0, have: 0, intro: true, done: false }; save.ver = 3;
  }
  for (const sh of save.ships) { sh.mods = sh.mods || []; sh.weapon = sh.weapon || 'cannon'; }
  if (!save.quests || save.quests.length < 3) refillQuests();
  return save;
}
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }
export const activeShip = () => save.ships[save.active] || save.ships[0];
export function ownsTier(cls) { return save.ships.some(s => s.tier === cls); }
export function ownsLevel(tier) { return save.ships.some(s => TIERS[s.tier].tier >= tier); }
export function buyTier(cls) { if (ownsTier(cls)) return; save.ships.push(freshShip(cls)); save.active = save.ships.length - 1; }

/* ---------- 퀘스트 ---------- */
let qid = Date.now() % 100000;
export function makeQuest() {
  const tier = TIERS[activeShip().tier].tier, k = Math.random();
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
