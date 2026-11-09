import { AURAS, AURA_BY_ID, AVATAR_PRESETS, RARITY_COLORS } from './data.js';
import { AudioEngine } from './audio.js';

const KEY = 'aura-rng-3d-v3';
const LUCK_MAX = 15;
const CUTSCENE_TIER = 3;

// ---------------------------------------------------------------------------
// State + persistence
// ---------------------------------------------------------------------------
const defaults = () => ({
  rolls: 0, coins: 0, luck: 0, counts: {}, best: -1, equipped: null,
  avatar: { ...AVATAR_PRESETS[0] },
  settings: { master: 0.7, amb: 0.45, muted: false, autoRotate: true, low: false, cutscene: true, quick: false },
});
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s === 'object') {
      const d = defaults();
      return { ...d, ...s, avatar: { ...d.avatar, ...s.avatar }, settings: { ...d.settings, ...s.settings } };
    }
  } catch (e) { /* storage unavailable */ }
  return defaults();
}
let state = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };

// ---------------------------------------------------------------------------
// Odds, Sol's-RNG style: test auras from rarest to most common, each with its
// own independent "1 in N / luck" chance; the first hit wins, Breeze is the
// fallback. Luck helps rarer tiers more: mult_i = 1 + luck * 0.2 * i.
// ---------------------------------------------------------------------------
const mult = i => 1 + state.luck * 0.2 * i;
function rand01() {
  if (window.crypto?.getRandomValues) {
    const u = new Uint32Array(2);
    crypto.getRandomValues(u);
    return (u[0] * 2 ** 21 + (u[1] >>> 11)) / 2 ** 53;   // 53-bit uniform float
  }
  return Math.random();
}
function pickIndex() {
  for (let i = AURAS.length - 1; i >= 1; i--) {
    if (rand01() < mult(i) / AURAS[i].odds) return i;
  }
  return 0;
}
const oneIn = i => Math.max(1, AURAS[i].odds / mult(i));
const fmt = n => Math.round(n).toLocaleString('ko-KR');
const oddsText = i => (i === 0 ? '기본' : `1 / ${fmt(oneIn(i))}`);
const luckCost = () => Math.floor(30 * Math.pow(1.75, state.luck));

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------
const $ = s => document.querySelector(s);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
function toast(msg) {
  const d = el('div', null, msg);
  $('#toast').append(d);
  setTimeout(() => d.remove(), 2700);
}
const setRarityColor = (node, hex) => node.style.setProperty('--rc', hex);

// ---------------------------------------------------------------------------
// Audio + 3D
// ---------------------------------------------------------------------------
const audio = new AudioEngine();
audio.masterLevel = state.settings.master;
audio.ambientLevel = state.settings.amb;
audio.muted = state.settings.muted;

let stage = null;
try {
  const { Stage } = await import('./scene.js');
  stage = new Stage($('#view'), { avatarColors: state.avatar, onBolt: s => audio.zap(s) });
  stage.rig.autoRotate = state.settings.autoRotate;
  if (state.settings.low) stage.setQuality('low');
} catch (e) {
  console.warn('3D disabled:', e);
  $('#nogl').hidden = false;
}

let shown = null;        // aura currently displayed on the avatar (equipped or preview)
let previewId = null;
function showAura(def) {
  shown = def;
  stage?.setAura(def);
  if (audio.ctx) def ? audio.startAmbient(def) : audio.stopAmbient();
}

// Audio needs a user gesture: start the ambient loop on the first interaction.
const unlock = () => {
  if (!audio.ensure()) return;
  if (shown) audio.startAmbient(shown);
  removeEventListener('pointerdown', unlock);
  removeEventListener('keydown', unlock);
};
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);

// ---------------------------------------------------------------------------
// Rendering of HUD pieces
// ---------------------------------------------------------------------------
function renderChips() {
  const found = Object.keys(state.counts).length;
  const best = state.best >= 0 ? AURAS[state.best] : null;
  const items = [
    ['굴림', fmt(state.rolls)],
    ['코인', fmt(state.coins) + ' 🪙'],
    ['행운', `Lv.${state.luck}`],
    ['도감', `${found}/${AURAS.length}`],
    ['최고', best ? best.rarity : '-'],
  ];
  const box = $('#chips');
  box.replaceChildren(...items.map(([k, v]) => {
    const c = el('span', 'chip');
    c.append(el('b', null, k), document.createTextNode(v));
    return c;
  }));
}

function renderButtons() {
  $('#rollBtn').disabled = rolling;
  $('#autoBtn').classList.toggle('on', auto);
  $('#autoBtn').textContent = auto ? '자동: 켬' : '자동: 끔';
  $('#quickBtn').classList.toggle('on', state.settings.quick);
  const lb = $('#luckBtn');
  if (state.luck >= LUCK_MAX) { lb.textContent = '행운 MAX'; lb.disabled = true; }
  else {
    lb.textContent = `행운 Lv.${state.luck + 1} · ${fmt(luckCost())}🪙`;
    lb.disabled = rolling || state.coins < luckCost();
  }
}

function renderGrid() {
  const grid = $('#grid');
  grid.replaceChildren(...AURAS.map((a, i) => {
    const n = state.counts[a.id] || 0;
    const card = el('div', 'card' + (n ? '' : ' locked') + (state.equipped === a.id ? ' equipped' : '') + (previewId === a.id ? ' previewing' : ''));
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${n ? a.name : '미발견 아우라'} ${a.rarity} 미리보기`);
    card.style.setProperty('--c1', a.colors.a);
    card.style.setProperty('--c2', a.colors.b);
    const bottom = el('div', 'cc');
    if (state.equipped === a.id) bottom.append(el('span', 'tag', '장착 중'));
    else if (n) {
      const eq = el('button', null, '장착');
      eq.style.cssText = 'padding:3px 10px;font-size:11px;border-radius:999px';
      eq.addEventListener('click', ev => { ev.stopPropagation(); equip(a.id); });
      bottom.append(eq);
    } else bottom.append(el('span', null, '미발견'));
    bottom.append(el('span', null, n ? `×${fmt(n)}` : ''));
    card.append(
      el('span', 'dot'),
      el('div', 'rr', a.rarity),
      el('div', 'nn', n ? a.name : '???'),
      el('div', 'oo', oddsText(i)),
      bottom,
    );
    const go = () => preview(a.id);
    card.addEventListener('click', go);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    return card;
  }));
}

function renderPreviewBanner() {
  const b = $('#previewBanner');
  if (!previewId) { b.hidden = true; return; }
  const a = AURA_BY_ID[previewId];
  const owned = !!state.counts[a.id];
  $('#previewText').textContent = `예시 장착: ${owned ? a.name : '??? (' + a.rarity + ')'}`;
  b.hidden = false;
}

function renderAll() {
  renderChips();
  renderButtons();
  renderGrid();
  renderPreviewBanner();
}

// ---------------------------------------------------------------------------
// Equip / preview
// ---------------------------------------------------------------------------
function equip(id) {
  if (!state.counts[id]) return;
  previewId = null;
  state.equipped = id;
  const def = AURA_BY_ID[id];
  showAura(def);
  audio.equip(def);
  stage?.avatar.play('wave');
  save();
  renderAll();
  toast(`${def.name} 장착!`);
}

function preview(id) {
  if (id === state.equipped && !previewId) return;
  if (id === state.equipped) return exitPreview();
  previewId = id;
  const def = AURA_BY_ID[id];
  showAura(def);
  audio.click();
  renderAll();
}

function exitPreview() {
  previewId = null;
  showAura(state.equipped ? AURA_BY_ID[state.equipped] : null);
  renderAll();
}

// ---------------------------------------------------------------------------
// Rolling
// ---------------------------------------------------------------------------
let rolling = false, auto = false, autoTimer = null, lastResult = null;
const history = [];

async function cycleNames(ms) {
  const name = $('#rName'), rar = $('#rRarity'), res = $('#result');
  name.classList.add('cycling');
  const t0 = performance.now();
  for (;;) {
    const p = (performance.now() - t0) / ms;
    if (p >= 1) break;
    const a = AURAS[Math.floor(Math.random() * AURAS.length)];
    name.textContent = a.name;
    rar.textContent = a.rarity;
    setRarityColor(res, a.colors.a);
    audio.rollTick(p);
    await sleep(40 + p * p * 220);       // decelerate toward the reveal
  }
  name.classList.remove('cycling');
}

/** Full-screen build-up + reveal for rare tiers. Click skips each phase. */
async function cutscene(a, odds) {
  const cs = $('#cutscene');
  let skip = null;
  const wait = ms => new Promise(r => { skip = r; setTimeout(r, ms); });
  const onClick = () => skip && skip();
  cs.addEventListener('click', onClick);

  setRarityColor(cs, a.colors.a);
  $('#csRarity').textContent = '';
  $('#csName').textContent = '???';
  $('#csOdds').textContent = '';
  cs.className = 'building';
  cs.hidden = false;
  const len = audio.buildUp(a.tier) || 1.6;
  await wait(len * 1000);

  cs.className = 'revealed';
  $('#csRarity').textContent = a.rarity;
  $('#csName').textContent = a.name;
  $('#csOdds').textContent = odds;
  audio.reveal(a);
  stage?.impact(a);
  await wait(2600);

  cs.removeEventListener('click', onClick);
  cs.hidden = true;
}

async function roll() {
  if (rolling) return;
  rolling = true;
  audio.ensure();
  renderButtons();
  $('#rActions').hidden = true;

  const idx = pickIndex();                 // result is decided up front
  const a = AURAS[idx];
  const odds = oddsText(idx);
  await cycleNames(state.settings.quick ? 450 : 1500);

  const big = a.tier >= CUTSCENE_TIER && state.settings.cutscene;
  if (big) await cutscene(a, odds);
  else { audio.reveal(a); stage?.impact(a); }

  // Commit
  state.rolls++;
  state.coins += 1 + idx * 2;
  state.counts[a.id] = (state.counts[a.id] || 0) + 1;
  const isNew = state.counts[a.id] === 1;
  if (idx > state.best) state.best = idx;
  lastResult = a.id;

  const res = $('#result');
  setRarityColor(res, a.colors.a);
  $('#rRarity').textContent = a.rarity;
  $('#rName').textContent = a.name;
  $('#rOdds').textContent = `${odds} · ${a.lore}`;
  $('#rNew').hidden = !isNew;
  $('#rActions').hidden = false;
  $('#equipBtn').disabled = state.equipped === a.id;
  $('#equipBtn').textContent = state.equipped === a.id ? '장착 중' : '장착 (E)';

  history.unshift({ a, odds });
  history.length = Math.min(history.length, 10);
  $('#history').replaceChildren(...history.map(h => {
    const li = el('li');
    li.style.setProperty('--c', h.a.colors.a);
    li.append(el('span', null, h.a.name), el('i', null, `${h.a.rarity} · ${h.odds}`));
    return li;
  }));

  if (isNew) toast(`✦ 새 아우라 발견: ${a.name}`);
  if (!state.equipped) equip(a.id);       // first aura auto-equips

  save();
  rolling = false;
  renderAll();

  if (auto) autoTimer = setTimeout(() => auto && roll(), state.settings.quick ? 250 : 650);
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
$('#rollBtn').addEventListener('click', roll);
$('#equipBtn').addEventListener('click', () => lastResult && equip(lastResult));
$('#previewExit').addEventListener('click', exitPreview);

function toggleAuto() {
  auto = !auto;
  if (!auto) clearTimeout(autoTimer); else if (!rolling) roll();
  renderButtons();
}
$('#autoBtn').addEventListener('click', toggleAuto);

function toggleQuick() {
  state.settings.quick = !state.settings.quick;
  save();
  renderButtons();
  toast(state.settings.quick ? '빠른 굴리기 켬' : '빠른 굴리기 끔');
}
$('#quickBtn').addEventListener('click', toggleQuick);

$('#luckBtn').addEventListener('click', () => {
  const c = luckCost();
  if (rolling || state.luck >= LUCK_MAX || state.coins < c) return;
  state.coins -= c;
  state.luck++;
  audio.ensure();
  audio.equip(AURAS[Math.min(state.luck, AURAS.length - 1)]);
  save();
  renderAll();
  toast(`행운 Lv.${state.luck} — 희귀 아우라 확률 상승`);
});

// top tools
$('#camBtn').addEventListener('click', () => stage?.rig.reset());
function shot() {
  if (!stage) return;
  const a = document.createElement('a');
  a.href = stage.screenshot();
  a.download = `aura-rng-${Date.now()}.png`;
  a.click();
  toast('스크린샷 저장됨');
}
$('#shotBtn').addEventListener('click', shot);
function toggleHud() {
  const hud = $('#hud');
  hud.classList.toggle('hidden');
  if (hud.classList.contains('hidden')) toast('H 키나 화면 더블탭으로 UI 다시 보기');
  updateInsets();
}
$('#hideBtn').addEventListener('click', toggleHud);
$('#view').addEventListener('dblclick', () => { $('#hud').classList.remove('hidden'); updateInsets(); });

const drawer = $('#drawer');
if (innerWidth <= 860) drawer.classList.add('closed');
// Keep the avatar centered in the space the HUD leaves free.
function updateInsets() {
  if (!stage) return;
  const wide = innerWidth > 860;
  const right = wide && !drawer.classList.contains('closed') && !$('#hud').classList.contains('hidden') ? drawer.offsetWidth + 16 : 0;
  const bottom = $('#hud').classList.contains('hidden') ? 0 : Math.min(innerHeight * 0.3, $('.rollbar').offsetHeight * 0.6);
  stage.setInsets(right, bottom);
}
$('#drawerBtn').addEventListener('click', () => { drawer.classList.toggle('closed'); updateInsets(); });
addEventListener('resize', updateInsets);

// tabs
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = p.dataset.panel !== b.dataset.tab; });
}));

// avatar customization
const colorInputs = { head: $('#cHead'), torso: $('#cTorso'), legs: $('#cLegs') };
function syncAvatarInputs() { for (const k in colorInputs) colorInputs[k].value = state.avatar[k]; }
for (const [k, input] of Object.entries(colorInputs)) {
  input.addEventListener('input', () => {
    state.avatar[k] = input.value;
    stage?.avatar.setColors(state.avatar);
    save();
  });
}
$('#presets').replaceChildren(...AVATAR_PRESETS.map(p => {
  const b = el('button');
  const sw = el('span', 'swatch');
  for (const c of [p.head, p.torso, p.legs]) { const i = el('i'); i.style.background = c; sw.append(i); }
  b.append(sw, document.createTextNode(p.name));
  b.addEventListener('click', () => {
    state.avatar = { head: p.head, torso: p.torso, legs: p.legs };
    stage?.avatar.setColors(state.avatar);
    syncAvatarInputs();
    save();
  });
  return b;
}));
document.querySelectorAll('[data-pose]').forEach(b => b.addEventListener('click', () => {
  if (!stage) return;
  const pose = b.dataset.pose;
  stage.avatar.play(pose === 'dance' && stage.avatar.pose === 'dance' ? 'idle' : pose);
}));

// settings
const S = state.settings;
$('#vMaster').value = S.master;
$('#vAmb').value = S.amb;
$('#muteChk').checked = S.muted;
$('#rotChk').checked = S.autoRotate;
$('#lowChk').checked = S.low;
$('#cutChk').checked = S.cutscene;
$('#vMaster').addEventListener('input', e => { S.master = +e.target.value; audio.setMaster(S.master); save(); });
$('#vAmb').addEventListener('input', e => { S.amb = +e.target.value; audio.setAmbient(S.amb); save(); });
function setMuted(m) { S.muted = m; $('#muteChk').checked = m; audio.setMuted(m); save(); }
$('#muteChk').addEventListener('change', e => setMuted(e.target.checked));
$('#rotChk').addEventListener('change', e => { S.autoRotate = e.target.checked; if (stage) stage.rig.autoRotate = S.autoRotate; save(); });
$('#lowChk').addEventListener('change', e => { S.low = e.target.checked; stage?.setQuality(S.low ? 'low' : 'high'); save(); });
$('#cutChk').addEventListener('change', e => { S.cutscene = e.target.checked; save(); });
$('#resetBtn').addEventListener('click', () => {
  if (!confirm('굴림 기록, 코인, 행운, 도감, 아바타 설정을 모두 초기화할까요?')) return;
  auto = false; clearTimeout(autoTimer);
  state = defaults();
  save();
  location.reload();
});

// keyboard
addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea')) return;
  // a focused button already reacts to Space/Enter itself
  if ((e.code === 'Space' || e.code === 'Enter') && e.target.closest?.('button, [role=button]')) return;
  if (e.repeat) return;
  switch (e.code) {
    case 'Space': e.preventDefault(); roll(); break;
    case 'KeyA': toggleAuto(); break;
    case 'KeyQ': toggleQuick(); break;
    case 'KeyE': if (lastResult) equip(lastResult); break;
    case 'KeyR': stage?.rig.reset(); break;
    case 'KeyP': shot(); break;
    case 'KeyH': toggleHud(); break;
    case 'KeyM': setMuted(!S.muted); toast(S.muted ? '음소거' : '소리 켬'); break;
    case 'Escape': if (previewId) exitPreview(); break;
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
syncAvatarInputs();
setRarityColor($('#result'), RARITY_COLORS.Epic);
if (state.equipped && AURA_BY_ID[state.equipped]) showAura(AURA_BY_ID[state.equipped]);
renderAll();
updateInsets();

// Exposed for debugging / automated checks.
window.__aura = { state: () => state, preview, equip, roll, stage };
