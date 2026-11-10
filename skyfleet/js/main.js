// 하늘함대 — 메인: 로딩, 비행, 전투, 채굴, 도킹, 항구 UI
import { THREE, $, rand, pick, clamp, lerp, wrap, fmt, isTouch, SAFE, QUALITY, camera, render, frameYield, sleep, sfx, COL, engineSound, setMute, FXS } from './core.js';
import { TIERS, MODS, modCost, ORES, RAR_COL, RANKS, rankOf, PAINTS, TIPS, CAPTAIN_NAMES, PIRATE_NAMES, WORLD, save, loadSave, persist, activeShip, ownsTier, buyTier, refillQuests, makeQuest, questProgress, priceOf, driftPrices, WEAPONS, MODULES, CHAPTERS, INTRO, ENDING, REGIONS, ownsLevel } from './data.js';
import { scene, buildWorld, updateWorld, terrainH, groundAt, ports, ores, depleteOre, nearestPort, homePort, DAY, FIRE, SMOKE, WEATHER, islands, islandAt, WRECKS, surfaceBelow } from './world.js';
import { Ship, blinkNav, makeShipModel, setShipNight, STYLES, STYLE_KEYS } from './ships.js';
import { rememberDeath as solRemember, initSolare, say as solSay, event as solEvent, tickSolare, chatOpen, toggleChat, agentUpdate, agentPause, agentReset, agentOn, agentState, setPermUI, refreshSolUI, cfg as solCfg, setLLM, setModel, MODEL_NAMES, llmText, permName, permDesc, PERM_NAMES } from './solare.js';
import { S, updateShock, morphFx, explode, fireTurrets, fireMissile, updateBullets, updateMissiles, spawnDebris, updateDebris, dropCrate, updateCrates, mineBeam, shipFx, clearFx, dropFlares, incoming, updateFlares, shieldFx } from './fx.js';
import { runAI } from './ai.js';
import { hscene, hcam, buildHangar, setHangarShip, updateHangar, setPortScene, hangarRepair, hangarInstall, refreshHangarMods } from './hangar.js';
import { startSkyRun } from './skyrun.js';
import { castUlt, ultGain, ultReady, updateUlt, hooks as ultHooks, ULT_NAMES, isCasting } from './ult.js';
import { bscene, bcam, enterBridge, exitBridge, updateBridge, interact as bridgeInteract, bhooks, bridgeInput, __teleport, __state } from './bridge.js';
import { initOutposts, updateOutposts, outposts, sites, hooks as opHooks, buildOutpost, nearestOutpost, openBasePanel, closeBasePanel, basePanelOpen, renderBasePanel, isBuilt } from './outposts.js';
import { outpostCost, UNIT_DEFS, ELEMENTS as ELEMS, lvCap, slotCount, ELEM_COST, elemSlots, isFounder, activateFounder, deactivateFounder, sha256, FOUNDER_HASH, CREW, crewLevel, crewUpCost, STRATEGIES } from './data.js';

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), aimPt = new THREE.Vector3();
let mode = 'loading', dockPort = null, player = null, docking = 0, launchT = 0, priceT = 60, mineSoundT = 0, aiDirty = false;
const setMode = m => { mode = m; document.body.dataset.mode = m; if (m !== 'fly' && document.pointerLockElement) document.exitPointerLock(); };
if (isTouch) document.body.classList.add('touch');

/* ================= 토스트 / 배너 / 피드 ================= */
function toast(msg) { const d = document.createElement('div'); d.innerHTML = msg; $('toast').appendChild(d); setTimeout(() => d.remove(), 3200); }
let bannerT = 0;
function banner(title, sub, dur = 3, prog = null) {
  $('banner').style.display = 'block'; $('bnT').textContent = title; $('bnS').textContent = sub; bannerT = dur;
  $('bnP').parentElement.style.display = prog === null ? 'none' : 'block'; if (prog !== null) $('bnP').style.width = (prog * 100) + '%';
}
function feed(html) { const d = document.createElement('div'); d.innerHTML = html; $('feed').appendChild(d); setTimeout(() => d.remove(), 6000); while ($('feed').children.length > 6) $('feed').firstChild.remove(); }
const FC = { player: '#22d3d3', captain: '#9fc3ff', pirate: '#ff6a55' };

/* ================= 로딩 ================= */
const STEPS = ['INITIALIZING RENDERER', 'LOADING PILOT PROFILE', 'STREAMING ASSETS', 'GENERATING TERRAIN', 'BUILDING PORTS', 'ASSEMBLING SHIP', 'ENTERING RED CANYON'];
$('ldSteps').innerHTML = STEPS.map(s => `<li>${s}</li>`).join('');
$('ldBar').innerHTML = '<i></i>'.repeat(48);
let tipI = Math.floor(Math.random() * TIPS.length); $('ldTip').textContent = TIPS[tipI];
const tipTimer = setInterval(() => { tipI = (tipI + 1) % TIPS.length; $('ldTip').textContent = TIPS[tipI]; }, 5000);
let srCredits = 0;
const skyrun = startSkyRun($('skyrun'), () => { srCredits += 2; $('srCr').textContent = `+${srCredits} CR`; sfx('coin'); });
let shownPct = 0, targetPct = 0;
function progress(label, pct) {
  const i = STEPS.indexOf(label); targetPct = pct;
  [...$('ldSteps').children].forEach((li, k) => { li.className = k < i ? 'done' : k === i ? 'cur' : ''; });
  $('ldPhase').textContent = label === 'ASSEMBLING SHIP' ? 'ASSEMBLING SHIP' : label;
}
function tickLoading() {
  shownPct = lerp(shownPct, targetPct, 0.08); const p = Math.round(shownPct * 100);
  $('ldPct').textContent = p + '%'; const bars = $('ldBar').children, on = Math.round(shownPct * bars.length);
  for (let i = 0; i < bars.length; i++) bars[i].classList.toggle('on', i < on);
}
async function boot() {
  progress('INITIALIZING RENDERER', 0.06); await frameYield(); await sleep(250);
  progress('LOADING PILOT PROFILE', 0.14); loadSave(); setMute(!!save.mute); refreshSolUI(); $('ldRoster').innerHTML = CAPTAIN_NAMES.slice(0, 12).map(n => `<li>${n}</li>`).join(''); await sleep(250);
  await buildWorld(progress);
  progress('ASSEMBLING SHIP', 0.78); await frameYield();
  buildHangar(); setHangarShip(activeShip().tier, save.paint, activeShip().mods); buildMapImage(); await frameYield();
  buildWrecks(); initOutposts(); makePlayer(); spawnAll(); renderObjective(); await sleep(200);
  progress('ENTERING RED CANYON', 1); await sleep(500);
  [...$('ldSteps').children].forEach(li => li.className = 'done');
  $('ldPhase').textContent = 'READY'; $('ldGo').hidden = false;
}
$('ldGo').onclick = () => {
  const best = skyrun.stop(); clearInterval(tipTimer);
  if (srCredits) { save.credits += srCredits; toast(`SKY RUN 보너스 <b>+${srCredits} CR</b>`); }
  save.skyrunBest = Math.max(save.skyrunBest || 0, best); persist();
  const go = () => { enterHangar(homePort()); setTimeout(() => solSay(save.story.ch === 0 ? '안녕하세요, 캡틴. 첫 임무는 출항이에요. 아래 「항구를 떠나기」를 눌러 주세요!' : `다시 오셨네요, 캡틴! ${CHAPTERS[save.story.ch] ? '현재 임무: ' + CHAPTERS[save.story.ch].nm : ''}`, 'happy', 2), 600); };
  const go2 = () => { go(); if (!save.style) setTimeout(() => openStylePicker(true), 400); };
  if (!save.story.intro) playIntro(go2); else go2();
};

/* ================= 함선 생성 ================= */
function makePlayer() {
  const a = activeShip();
  if (player) scene.remove(player.mesh);
  player = new Ship({ name: '나', faction: 'player', tier: a.tier, paint: save.paint, lv: a.lv, isPlayer: true, weapon: a.weapon || 'cannon', mods: a.mods || [], elems: a.elems || [] });
  player.look = player.baseLook = save.style || 'ship'; player.build(scene);
  scene.add(player.mesh); S.player = player;
  S.ships = S.ships.filter(s => !s.isPlayer); S.ships.unshift(player);
}
function aiCount() { return clamp(save.aiCount || 20, 20, 80); }
/* AI 레벨: 내 함선 레벨의 85% 근처 (거의 대등) */
function rollLv(cls) { const a = activeShip(), base = Math.max(2, ['guns', 'armor', 'engine', 'missile'].reduce((t, k) => t + (a.lv[k] || 0), 0) / 4) * 0.85; const r = () => Math.max(1, Math.round(base + rand(-1.5, 1.5))); return { guns: r(), missile: r(), armor: r(), engine: r(), cargo: 1, drill: 1 }; }
function spawnAI(s) {
  if (s.faction === 'pirate') {
    for (let k = 0; k < 50; k++) {
      const x = rand(-WORLD * 0.85, WORLD * 0.85), z = rand(-WORLD * 0.85, WORLD * 0.85);
      if (ports.some(p => Math.hypot(p.x - x, p.z - z) < 650)) continue;
      if (player && player.alive && Math.hypot(player.pos.x - x, player.pos.z - z) < 700) continue;
      s.spawnAt(x, groundAt(x, z) + rand(160, 300), z, rand(-3, 3)); return;
    }
  }
  const p = pick(ports), a = rand(0, 6.28);
  s.spawnAt(p.x + Math.cos(a) * 120, p.deck + rand(50, 120), p.z + Math.sin(a) * 120, rand(-3, 3));
}
function spawnAll() {
  for (const s of S.ships) if (!s.isPlayer) scene.remove(s.mesh);
  S.ships = player ? [player] : [];
  const n = aiCount(), nPir = Math.round(n * 0.4);
  const capNames = [...CAPTAIN_NAMES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < n; i++) {
    const pirate = i < nPir;
    const tier = 8;   // 모든 AI 함선은 T5 아크라이트
    const s = new Ship({ name: pirate ? PIRATE_NAMES[i % PIRATE_NAMES.length] : capNames[i % capNames.length], faction: pirate ? 'pirate' : 'captain', tier, paint: pirate ? pick(['night', 'crimson', 'steel']) : pick(PAINTS).id, lv: rollLv(tier), pvp: true, weapon: pick(['cannon', 'flak', 'rail']), elems: [] });
    s.ai.skill = rand(0.85, 1.05); scene.add(s.mesh); S.ships.push(s); spawnAI(s);
  }
  aiDirty = false;
}

/* ================= 전투 규칙 ================= */
S.hooks.flare = s => dropFlares(s);
S.hooks.hostile = (a, b) => {
  if (!a || !b || a === b) return false;
  if (a.temp && b.temp) return false;
  if (a.isUnit || b.isUnit) { const o = a.isUnit ? b : a; return o.faction === 'pirate' || (o.faction === 'captain' && o.pvp); }
  return true;
};
let hitT = 0;
export const SAFE_R = 420;
const inSafe = s => ports.some(p => Math.hypot(p.x - s.pos.x, p.z - s.pos.z) < SAFE_R);
S.hooks.safe = inSafe;
S.hooks.damage = (t, amt, by, at) => {
  if (!t.alive) return;
  if (by && by.faction === 'pirate' && inSafe(t)) return;   // 포트 보호 구역
  if (t.isPlayer && by && !by.isPlayer) amt *= 0.8;           // 난이도 보정 (거의 대등)
  if (t.isPlayer && t.form === 'tank') amt *= 0.65;           // 전차: 피해 -35%
  if (by && S.hooks.hostile(t, by)) { t.ai.attacker = by; t.ai.attackT = 12; }
  if (by && by.isPlayer) { ultGain(by, amt * 0.12); hitT = 0.12; dmgNum(t, amt, at, t.shield > 0 && t.shBroken <= 0); if (t.isBoss) EV.playerDmg += amt; }
  const hull = by ? t.absorb(amt, at || (by && by.pos)) : amt;   // 방어막이 먼저 흡수 (추락 피해는 직접)
  if (t.isPlayer) { if (hull > 0) { $('vign').style.opacity = 1; setTimeout(() => $('vign').style.opacity = 0, 160); } S.shake = Math.max(S.shake, hull > 0 ? 0.2 : 0.06); }
  if (hull <= 0) return;
  t.hp -= hull;
  if (t.isPlayer && t.hp < t.maxHp * 0.3) solEvent('lowHull', 3, 20);
  if (t.hp > 0) return;
  t.alive = false; t.mesh.visible = false; t.respawn = 12;
  if (t.isBoss) { bossDown(t, by); }
  explode(t.pos, 55 * t.scale); spawnDebris(t.pos, t.scale);
  const loot = t.faction === 'pirate' ? Math.round(rand(50, 140) * (TIERS[t.tier].tier + 1)) : 0;
  dropCrate(tmp.copy(t.pos), loot, t.cargo);
  t.cargo = {}; t.cargoKg = 0;
  if (by && by !== t) {
    by.kills++; if (by.isPlayer) ultGain(by, 18);
    feed(`<span style="color:${FC[by.faction]}">${by.name}</span> ▸ <span style="color:${FC[t.faction]}">${t.name}</span>`);
    if (by.isPlayer) {
      const lv = TIERS[t.tier].tier, bounty = Math.round((t.faction === 'pirate' ? 90 * (lv + 1) : 60 * (lv + 1)) * (by.bountyMul || 1)), xp = t.faction === 'pirate' ? 15 * (lv + 1) : 10;
      if (t.faction === 'pirate') story('kill', 1); solEvent('kill', 1, 8);
      save.credits += bounty; gainXp(xp); save.stats.kills++; if (t.faction === 'pirate') questProgress('kill', 1);
      toast(`격추! 현상금 <b>+${bounty} CR</b> · 평판 +${xp}`); persist();
    }
  } else feed(`<span style="color:${FC[t.faction]}">${t.name}</span> 추락`);
  if (t.isPlayer) { solRemember(t.pos.x, t.pos.z); onPlayerDeath(); }
};
S.hooks.mine = (s, node, dt) => {
  if (!node.alive) return;
  s.mineAcc = (s.mineAcc || 0) + s.drill * dt;
  while (s.mineAcc >= 1) {
    s.mineAcc -= 1; const o = ORES[node.type];
    if (s.cargoKg + o.kg > s.cargoCap) { if (s.isPlayer) { hintMsg = '화물칸 가득 참 — 포트로 귀환해 보관하세요'; solEvent('cargoFull', 1, 40); } s.mineAcc = 0; return; }
    s.cargo[node.type] = (s.cargo[node.type] || 0) + 1; s.cargoKg += o.kg; node.amount--;
    if (s.isPlayer) { questProgress('mine', o.kg); story('mine', o.kg); if (node.island) story('island', 1); save.stats.mined += o.kg; if (Math.random() < 0.25) gainXp(1); if (mineSoundT <= 0) { sfx('coin', 0.5); mineSoundT = 0.25; } }
    if (node.amount <= 0) { explode(tmp.set(node.x, node.y + 6, node.z), 10, 'hit'); depleteOre(node); if (s.isPlayer) toast('광맥이 고갈되었습니다'); return; }
  }
};
S.hooks.pickup = (s, c) => {
  let got = [];
  for (const [k, n] of Object.entries(c.cargo)) { const kg = ORES[k].kg, fit = Math.min(n, Math.floor((s.cargoCap - s.cargoKg) / kg)); if (fit > 0) { s.cargo[k] = (s.cargo[k] || 0) + fit; s.cargoKg += fit * kg; got.push(`${ORES[k].nm} ${fit}`); } }
  if (s.isPlayer) { if (c.credits) save.credits += c.credits; sfx('coin'); toast(`전리품 회수 ${c.credits ? `<b>+${c.credits} CR</b> ` : ''}${got.join(', ')}`); persist(); }
};
function onImpact(s, vy) { S.hooks.damage(s, (vy - 14) * 2.2, null); SMOKE.emit(s.pos.x, s.pos.y - 6, s.pos.z, 0, 8, 0, 1.5, 8, 26, COL.dust, COL.dustE, 0.6); }
function gainXp(n) { const r0 = rankOf(save.xp); save.xp += n; const r1 = rankOf(save.xp); if (r1 > r0) { toast(`평판 상승! <b>${RANKS[r1].nm}</b> — 조선소에 새 함선이 열렸을 수 있습니다`); solEvent('rank', 2, 1); } }
function onPlayerDeath() {
  save.stats.deaths++; persist();
  setTimeout(() => {
    if (player.alive) return;
    setMode('dead'); $('dead').classList.add('on'); solEvent('death', 3, 1);
    $('deadInfo').textContent = '화물은 추락 지점에 떨어졌습니다. 다시 회수할 수 있어요.';
  }, 1800);
}
$('deadGo').onclick = () => { $('dead').classList.remove('on'); enterHangar(homePort()); };

/* ================= 입력 ================= */
const key = {}, inp = { fire: false, mine: false, up: false, dn: false, jx: 0, jy: 0 };
const cam = { yaw: 0, pitch: 0.22, dist: 1, last: 0 };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const k = e.key.toLowerCase(); key[k] = true;
  if ((k === 'enter' || k === 'v') && (mode === 'fly' || mode === 'hangar' || mode === 'bridge')) { e.preventDefault(); if (document.pointerLockElement) document.exitPointerLock(); toggleChat(true); return; }
  if (introOn && (k === ' ' || k === 'enter')) { introNext(); return; }
  if (k === ' ' || k === 'tab') e.preventDefault();
  if (mode !== 'fly') return;
  if (k === 'b') baseAction();
  if (k === 't') toggleForm();
  if (k === 'u') doUlt();
  if (k === 'r') cycleLock(); if (k === 'f') fireMissile(player, player.lock); if (k === 'g') dropCargo(); if (k === 'm') openMap();
  if (k === 'c' && player.alive) { if (dropFlares(player)) toast('플레어 발사!'); }
  if (k === 'tab') $('board').classList.add('on');
});
addEventListener('keyup', e => { const k = e.key.toLowerCase(); key[k] = false; if (k === 'tab') $('board').classList.remove('on'); });
addEventListener('blur', () => { for (const k in key) key[k] = false; inp.fire = false; });
const cv = $('view');
cv.addEventListener('mousedown', e => {
  if (mode !== 'fly' || isTouch) return;
  if (!document.pointerLockElement) { try { cv.requestPointerLock(); } catch (er) {} return; }
  if (e.button === 0) inp.fire = true; if (e.button === 2) fireMissile(player, player.lock);
});
addEventListener('mouseup', e => { if (e.button === 0) inp.fire = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (mode === 'fly' && document.pointerLockElement === cv) { cam.yaw -= e.movementX * 0.0026; cam.pitch = clamp(cam.pitch + e.movementY * 0.002, -0.25, 1.1); cam.last = performance.now(); }
});
addEventListener('wheel', e => { if (e.ctrlKey) return; if (mode === 'fly') cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.1 : 0.9), 0.55, 2.2); }, { passive: true });
/* 화면 고정: iOS Safari 핀치 확대·더블탭 확대·트랙패드 핀치를 막는다. 스크롤 가능한 패널만 예외 */
const SCROLLABLE = '#solLog, #ppanel, #board, #loading, .card, #mapOv';
const isScrollArea = t => !!(t && t.closest && t.closest(SCROLLABLE));
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1 || !isScrollArea(e.target)) e.preventDefault(); }, { passive: false });
document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastTouchEnd < 350 && !isScrollArea(e.target)) e.preventDefault(); lastTouchEnd = n; }, { passive: false });
document.addEventListener('dblclick', e => { if (!isScrollArea(e.target)) e.preventDefault(); });
// 터치: 조이스틱 + 화면 드래그로 시점
{
  const joy = $('joy'), knob = $('joyk'); let jid = null, lookId = null, lx = 0, ly = 0;
  const setJ = e => { const r = joy.getBoundingClientRect(), R = r.width / 2; let dx = (e.clientX - r.left - R) / R, dy = (e.clientY - r.top - R) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } inp.jx = dx; inp.jy = dy; knob.style.transform = `translate(${dx * R * 0.55}px,${dy * R * 0.55}px)`; };
  joy.addEventListener('pointerdown', e => { jid = e.pointerId; joy.setPointerCapture(jid); setJ(e); });
  joy.addEventListener('pointermove', e => { if (e.pointerId === jid) setJ(e); });
  const endJ = e => { if (e.pointerId === jid) { jid = null; inp.jx = inp.jy = 0; knob.style.transform = ''; } };
  joy.addEventListener('pointerup', endJ); joy.addEventListener('pointercancel', endJ);
  cv.addEventListener('pointerdown', e => { if (mode === 'fly' && e.pointerType === 'touch') { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; } });
  addEventListener('pointermove', e => { if (e.pointerId === lookId) { cam.yaw -= (e.clientX - lx) * 0.006; cam.pitch = clamp(cam.pitch + (e.clientY - ly) * 0.004, -0.25, 1.1); lx = e.clientX; ly = e.clientY; cam.last = performance.now(); } });
  addEventListener('pointerup', e => { if (e.pointerId === lookId) lookId = null; });
  const hold = (id, k) => { const el = $(id); el.addEventListener('pointerdown', e => { e.stopPropagation(); inp[k] = true; el.classList.add('on'); el.setPointerCapture(e.pointerId); }); const up = () => { inp[k] = false; el.classList.remove('on'); }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); };
  hold('tUp', 'up'); hold('tDn', 'dn'); hold('tAct', 'act'); hold('tBoost', 'boost');
  $('tFlare').onpointerdown = e => { e.stopPropagation(); if (player.alive && dropFlares(player)) toast('플레어 발사!'); };
  $('tBoard').onpointerdown = e => { e.stopPropagation(); $('board').classList.toggle('on'); };
  $('tLock').onpointerdown = e => { e.stopPropagation(); cycleLock(); };
  $('tMis').onpointerdown = e => { e.stopPropagation(); fireMissile(player, player.lock); };
  $('tDrop').onpointerdown = e => { e.stopPropagation(); dropCargo(); };
  $('tMap').onpointerdown = e => { e.stopPropagation(); openMap(); };
  $('tBase').onpointerdown = e => { e.stopPropagation(); baseAction(); };
  $('tMorph').onpointerdown = e => { e.stopPropagation(); toggleForm(); };
  $('tUlt').onpointerdown = e => { e.stopPropagation(); doUlt(); };
}

function cycleLock() {
  const list = S.ships.filter(s => s.alive && S.hooks.hostile(player, s) && s.pos.distanceTo(player.pos) < 1000);
  if (!list.length) { player.lock = null; toast('잠글 수 있는 적대 함선이 없습니다'); return; }
  camera.getWorldDirection(tmp2);
  list.sort((a, b) => tmp.copy(a.pos).sub(camera.position).normalize().dot(tmp2) < tmp.copy(b.pos).sub(camera.position).normalize().dot(tmp2) ? 1 : -1);
  const i = list.indexOf(player.lock); player.lock = list[(i + 1) % list.length]; sfx('ui');
}
function doUlt() {
  if (mode !== 'fly' || !player.alive) return;
  if (!player.elems || !player.elems.length) { toast('원소 코어를 먼저 장착하세요 (모듈 탭)'); return; }
  if (!ultReady(player)) { toast(`궁극기 충전 중 · ${Math.floor(player.ult || 0)}%`); return; }
  castUlt(player);
}
ultHooks.banner = (t, s) => banner(t, s, 3);
function toggleForm() {
  if (mode !== 'fly' || !player.alive) return;
  if (!player.canMorph) { toast('변형 코어(모듈 탭)가 필요해요'); return; }
  if (isFounder() ? player.nextForm() : player.setForm(player.form === 'ship' ? 'tank' : 'base')) toast(player.form === 'tank' ? '🛡 <b>전차 모드</b> — 피해 -35% · 포 피해 +35% · 지상 이동' : `${STYLES[player.look].ic} <b>${STYLES[player.look].nm}</b>`);;
}
function dropCargo() {
  if (!player.cargoKg) { toast('투하할 화물이 없습니다'); return; }
  player.world(0, -8, 14, tmp); dropCrate(tmp, 0, player.cargo); player.cargo = {}; player.cargoKg = 0; toast('화물을 투하했습니다');
}

/* ================= 조준 ================= */
function computeAim() {
  camera.getWorldDirection(tmp2); const o = camera.position;
  let best = null, bt = 1e9;
  for (const s of S.ships) {
    if (!s.alive || s === player) continue;
    tmp.copy(s.pos).sub(o); const t = tmp.dot(tmp2); if (t < 0 || t > 1200) continue;
    const perp2 = tmp.lengthSq() - t * t; if (perp2 < (s.radius * 1.3) ** 2 && t < bt) { bt = t; best = s; }
  }
  if (best) { aimPt.copy(best.pos); return best; }
  for (let d = 60; d < 1000; d += 20) { tmp.copy(o).addScaledVector(tmp2, d); if (tmp.y < groundAt(tmp.x, tmp.z)) { aimPt.copy(tmp); return null; } }
  aimPt.copy(o).addScaledVector(tmp2, 900); return null;
}

/* ================= 비행 업데이트 ================= */
let hintMsg = '', nearNode = null;
function updatePlayer(dt) {
  const p = player; if (!p.alive) return;
  const kx = (key.d ? 1 : 0) - (key.a ? 1 : 0), ky = (key.w ? 1 : 0) - (key.s ? 1 : 0);
  p.inTurn = clamp(-kx - inp.jx * 1.1, -1, 1);
  p.inThrust = clamp(ky - inp.jy * 1.1, -1, 1);
  p.inLift = ((key[' '] || inp.up) ? 1 : 0) - ((key.shift || key.q || inp.dn) ? 1 : 0);
  const manual = kx || ky || p.inLift || Math.abs(inp.jx) > 0.15 || Math.abs(inp.jy) > 0.15;
  if (AP.on && manual) { if (AP.src === 'user') { AP.on = false; solSay('수동 조종으로 전환했어요.'); } else { AP.on = false; agentPause(6); } }
  // 카메라 방향 조종: 함선이 카메라가 보는 쪽으로 선회하고, 시선 높이로 고도를 맞춤
  if (camSteerOn() && !kx && Math.abs(inp.jx) < 0.25 && (Math.abs(p.inThrust) > 0.05 || p.speed > 12)) {
    p.inTurn = clamp(wrap(cam.yaw - p.yaw) * 2.6, -1, 1);
    if (!p.inLift && p.inThrust > 0.05) p.inLift = clamp((0.24 - cam.pitch) * 2.4, -1, 1);
  }
  if (AP.on) autopilot(p, dt);
  if (launchT > 0) { launchT -= dt; p.inLift = Math.max(p.inLift, launchT > 1.2 ? 1 : 0.4); }
  p.boosting = !!(key.x || inp.boost);
  ultGain(p, dt * 0.8);
  if (p.evadeT > 0) { p.evadeT -= dt; p.boosting = p.energy > 5; p.inTurn = Math.sign(Math.sin(p.evadeT * 9)) * 1; p.inLift = 0.6; }
  applyWind(p, dt);
  p.physics(dt, onImpact);
  // 근처 광맥
  nearNode = null; let nd = 1e9;
  for (const o of ores) { if (!o.alive) continue; const d = Math.hypot(o.x - p.pos.x, o.z - p.pos.z); if (d < 70 * p.scale * p.mineRange && p.pos.y - o.y < 110 * p.mineRange && p.pos.y > o.y - 10 && d < nd) { nd = d; nearNode = o; } }
  if (nearNode && ORES[nearNode.type].glow >= 0.5) solEvent('rare', 1, 60);
  if (WRECKS.some(w => Math.hypot(w.x - p.pos.x, w.z - p.pos.z) < 380)) { story('wreck', 1); solEvent('wreck', 1, 300); }
  if (islands.some(I => Math.hypot(I.x - p.pos.x, I.z - p.pos.z) < I.r + 200)) solEvent('island', 1, 400);
  const inc = incoming(p); if (inc && inc < 800) solEvent('missile', 2, 15);
  const act = inp.act, wantMine = (key.e || (act && nearNode)) && nearNode;   // AP 채굴은 autopilot()에서 처리
  hintMsg = '';
  if (nearNode) {
    const o = ORES[nearNode.type];
    hintMsg = `${isTouch ? '광산 버튼' : 'E'} 길게 눌러 채굴 · <b style="color:${RAR_COL[o.rar]}">${o.nm}</b> (${o.rar}) · 남은 ${nearNode.amount}`;
    if (wantMine) { S.hooks.mine(p, nearNode, dt); mineBeam(p, nearNode); }
  }
  $('tAct').firstChild.textContent = nearNode ? '광산' : '사격';
  // 조준·사격
  const rayHit = computeAim();
  let tgtPt = aimPt;
  if (p.lock && (!p.lock.alive || p.lock.pos.distanceTo(p.pos) > p.lockRange * 1.3 || !S.hooks.hostile(p, p.lock))) p.lock = null;
  const firing = inp.fire || (act && !nearNode);
  if (p.lock && !firing) { const d = p.lock.pos.distanceTo(p.pos); tgtPt = tmp.copy(p.lock.pos).addScaledVector(p.lock.vel, d / 680).clone(); }
  p.aimTurrets(dt, tgtPt);
  if (firing) fireTurrets(p, tgtPt);
  else if (p.lock && p.lock.pos.distanceTo(p.pos) < weaponRange(p)) fireTurrets(p, tgtPt);   // 잠금 시 자동 사격 (무기 사거리)
  void rayHit;
  // 도킹
  const [port, pd] = nearestPort(p.pos);
  const onPad = pd < 32 * Math.max(1, p.scale * 0.8) && p.pos.y - port.deck < 40 * p.scale && p.speed < 18 && launchT <= 0;
  if (onPad) { AP.on = false; docking = Math.min(1, docking + dt / 2.2); banner('DOCKING', `${port.def.nm} · 안정적으로 유지`, 0.3, docking); if (docking >= 1) { docking = 0; dock(port); } }
  else { docking = Math.max(0, docking - dt); if (!hintMsg && pd < 260 && launchT <= 0) hintMsg = `착륙장 중앙(원) 위로 천천히 내려오면 <b>${port.def.nm}</b>에 도킹합니다`; }
  { const [ob, od] = nearestOutpost(p.pos, true), [st, sd] = nearestOutpost(p.pos, false); nearBase = null;
    if (ob && od < 420) { nearBase = ob; if (!hintMsg) hintMsg = `${isTouch ? '기지 버튼' : 'B'} · <b>${ob.nm}</b> 관리 (유닛 생산·업그레이드)`; }
    else if (st && sd < 360 && !isBuilt(st.id)) { nearBase = st; if (!hintMsg) hintMsg = `${isTouch ? '기지 버튼' : 'B'} · <b>${st.nm}</b> 건설 <b>${fmt(outpostCost(outposts.length))} C</b>`; }
    $('tBase').style.display = nearBase ? 'flex' : 'none'; $('tMorph').style.display = p.canMorph ? 'flex' : 'none'; }
  if (Math.abs(p.pos.x) > WORLD || Math.abs(p.pos.z) > WORLD) hintMsg = '⚠ 전장 경계 — 안쪽으로 돌아가세요';
  $('clock').classList.toggle('safe', inSafe(p));
}
function dock(port) {
  const p = player; let val = 0;
  for (const [k, n] of Object.entries(p.cargo)) { save.storage[k] = (save.storage[k] || 0) + n; val += n * priceOf(k, port.def); }
  p.cargo = {}; p.cargoKg = 0; p.hp = p.maxHp;
  persist(); sfx('ui'); story('dock', 1); enterHangar(port); hangarRepair(); solEvent('dock', 1, 5);
  if (val) toast(`화물 보관 완료 — 시장 가치 <b>${fmt(val)} CR</b>`);
}

/* ================= 카메라 ================= */
function updateCamera(dt) {
  const p = player, sc = p.scale;
  if (!camSteerOn() && performance.now() - cam.last > 1600) cam.yaw = cam.yaw + wrap(p.yaw - cam.yaw) * (1 - Math.exp(-dt * 1.6));
  if (camSteerOn() && Math.abs(inp.jx) > 0.25) cam.yaw = cam.yaw + wrap(p.yaw - cam.yaw) * (1 - Math.exp(-dt * 3));
  const spd = p.speed / p.maxSpeed, dist = (58 + spd * 14 + (p.boostOn ? 10 : 0)) * sc * cam.dist, cp = Math.cos(cam.pitch);
  const want = tmp.set(p.pos.x + Math.sin(cam.yaw) * cp * dist, p.pos.y + 10 * sc + Math.sin(cam.pitch) * dist, p.pos.z + Math.cos(cam.yaw) * cp * dist);
  const g = groundAt(want.x, want.z) + 5; if (want.y < g) want.y = g;
  camera.position.lerp(want, 1 - Math.exp(-dt * 9));
  camera.lookAt(p.pos.x, p.pos.y + 16 * sc, p.pos.z);
  if (S.shake > 0.001) { camera.rotation.x += rand(-1, 1) * S.shake * 0.03; camera.rotation.y += rand(-1, 1) * S.shake * 0.03; S.shake *= Math.exp(-dt * 6); }
  const fov = 60 + spd * 10 + (p.boostOn ? 9 : 0); camera.fov = lerp(camera.fov, fov, 1 - Math.exp(-dt * 3)); camera.updateProjectionMatrix();
}

/* ================= HUD ================= */
const bpc = $('bpc').getContext('2d'); let bpTier = -1;
function drawBlueprint(tier) {
  bpTier = tier; const x = bpc, W = 360, H = 130; x.clearRect(0, 0, W, H);
  x.fillStyle = '#0a2a3a'; x.fillRect(0, 0, W, H); x.strokeStyle = 'rgba(34,211,211,.12)'; x.lineWidth = 1;
  for (let i = 0; i < W; i += 12) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); } for (let i = 0; i < H; i += 12) { x.beginPath(); x.moveTo(0, i); x.lineTo(W, i); x.stroke(); }
  x.strokeStyle = 'rgba(34,211,211,.6)'; x.strokeRect(14, 10, W - 28, H - 20);
  const s = 4.4 * (0.9 + tier * 0.05), cx = W / 2, cy = H / 2 + 12;
  x.save(); x.translate(cx, cy); x.scale(s, s); x.lineWidth = 0.45; x.strokeStyle = '#7ff3f3'; x.fillStyle = 'rgba(34,211,211,.22)';
  const R = (a, b, c, d) => { x.fillRect(a, b, c, d); x.strokeRect(a, b, c, d); };
  x.beginPath(); x.moveTo(-17, 2.4); x.lineTo(13, 2.4); x.lineTo(14, 0); x.lineTo(13, -2.4); x.lineTo(-9, -2.4); x.lineTo(-17, -0.6); x.closePath(); x.fill(); x.stroke();
  R(3, -5, 6, 2.6); R(4.5, -6.6, 3.6, 1.6); if (tier >= 2) R(5.4, -8, 3, 1.4);
  x.beginPath(); x.moveTo(7, -6.6); x.lineTo(7, -11); x.stroke(); R(5.6, -11.6, 3, 0.6);
  R(6, -0.6, 9, 3.6); for (const z of [8, 11]) { x.beginPath(); x.moveTo(z, -0.6); x.lineTo(z, 3); x.stroke(); }
  R(-9.5, -3.4, 2.4, 1.2); x.beginPath(); x.moveTo(-9.5, -3); x.lineTo(-14, -3); x.stroke(); R(10, -3.4, 2.4, 1.2);
  if (tier >= 1) R(-4, -3.6, 4.5, 1.2);
  for (const z of [-6, 5.5]) R(z - 1.2, 2.4, 2.4, 2);
  x.restore();
  x.fillStyle = '#7ff3f3'; x.font = '10px Orbitron'; x.fillText(`${TIERS[tier].t} · ${TIERS[tier].en}`, 22, 24);
}
$('hullSeg').innerHTML = '<i></i>'.repeat(22); $('shSeg').innerHTML = '<i></i>'.repeat(22);
const rc = $('radar').getContext('2d'), RANGE = 600;
let sweep = 0;
function drawRadar(dt) {
  const W = 440, R = W / 2, x = rc, p = player; sweep += dt * 2.4;
  x.clearRect(0, 0, W, W);
  x.save(); x.beginPath(); x.arc(R, R, R - 4, 0, 7); x.clip();
  x.fillStyle = 'rgba(4,10,12,.62)'; x.fillRect(0, 0, W, W);
  const ang = -cam.yaw;   // 카메라 방향이 위쪽
  // 스윕
  const g = x.createConicGradient ? x.createConicGradient(sweep - Math.PI / 2 - 0.9, R, R) : null;
  if (g) { g.addColorStop(0, 'rgba(34,211,211,0)'); g.addColorStop(0.14, 'rgba(34,211,211,.35)'); g.addColorStop(0.145, 'rgba(34,211,211,0)'); x.fillStyle = g; x.fillRect(0, 0, W, W); }
  x.strokeStyle = 'rgba(34,211,211,.25)'; x.lineWidth = 2; x.setLineDash([6, 8]); for (const r of [R * 0.33, R * 0.66]) { x.beginPath(); x.arc(R, R, r, 0, 7); x.stroke(); } x.setLineDash([]);
  x.beginPath(); x.moveTo(R, 8); x.lineTo(R, W - 8); x.moveTo(8, R); x.lineTo(W - 8, R); x.stroke();
  const P = (wx, wz) => { const dx = wx - p.pos.x, dz = wz - p.pos.z; const c = Math.cos(ang), s = Math.sin(ang); const rx = dx * c - dz * s, rz = dx * s + dz * c; let px = rx / RANGE * (R - 10), py = rz / RANGE * (R - 10); const l = Math.hypot(px, py); const edge = l > R - 14; if (edge) { px *= (R - 14) / l; py *= (R - 14) / l; } return [R + px, R + py, edge]; };
  for (const o of ores) { if (!o.alive) continue; const [a, b, e] = P(o.x, o.z); if (e && Math.hypot(o.x - p.pos.x, o.z - p.pos.z) > RANGE * 1.6) continue; x.fillStyle = '#' + ORES[o.type].col.toString(16).padStart(6, '0'); x.save(); x.translate(a, b); x.rotate(Math.PI / 4); x.fillRect(-6, -6, 12, 12); x.restore(); }
  for (const pt of ports) { const [a, b] = P(pt.x, pt.z); x.fillStyle = '#22d3d3'; x.fillRect(a - 11, b - 11, 22, 22); }
  for (const o of outposts) { const [a, b, e] = P(o.x, o.z); x.fillStyle = o.ruined ? '#ff6a55' : '#b88cff'; x.beginPath(); for (let k = 0; k < 6; k++) { const an = k / 6 * Math.PI * 2; x.lineTo(a + Math.cos(an) * 12, b + Math.sin(an) * 12); } x.fill(); void e; }
  for (const st of sites) if (!isBuilt(st.id)) { const [a, b, e] = P(st.x, st.z); if (!e) { x.strokeStyle = '#ffb347'; x.lineWidth = 3; x.beginPath(); x.arc(a, b, 10, 0, 7); x.stroke(); } }
  for (const u of S.units) if (u.def && u.alive) { const [a, b, e] = P(u.pos.x, u.pos.z); if (!e) { x.fillStyle = '#8affc1'; x.fillRect(a - 3, b - 3, 6, 6); } }
  for (const c of S.crates) { const [a, b, e] = P(c.g.position.x, c.g.position.z); if (!e) { x.strokeStyle = '#ffc84a'; x.lineWidth = 3; x.strokeRect(a - 6, b - 6, 12, 12); } }
  let hostiles = 0;
  for (const s of S.ships) {
    if (!s.alive || s === p) continue; const d = s.pos.distanceTo(p.pos); if (d > RANGE * 1.05 && !s.isBoss) continue;
    const h = S.hooks.hostile(p, s); if (h) hostiles++;
    const [a, b] = P(s.pos.x, s.pos.z); x.fillStyle = h ? '#ff3a3a' : s.faction === 'pirate' ? '#ff6a55' : s.pvp && save.pvp ? '#ff8a55' : '#9aa8ab';
    x.beginPath(); x.arc(a, b, s.isBoss ? 16 : s === p.lock ? 11 : 8, 0, 7); x.fill(); if (s === p.lock) { x.strokeStyle = '#fff'; x.lineWidth = 2; x.stroke(); }
  }
  // N 표시
  const [na, nb] = P(p.pos.x, p.pos.z - RANGE * 3); x.fillStyle = '#22d3d3'; x.font = 'bold 22px Orbitron'; x.textAlign = 'center'; x.fillText('N', na, nb + 8);
  x.restore();
  x.strokeStyle = '#1aa6a6'; x.lineWidth = 3; x.beginPath(); x.arc(R, R, R - 4, 0, 7); x.stroke();
  for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2, l = i % 6 ? 8 : 16; x.beginPath(); x.moveTo(R + Math.cos(a) * (R - 4), R + Math.sin(a) * (R - 4)); x.lineTo(R + Math.cos(a) * (R - 4 - l), R + Math.sin(a) * (R - 4 - l)); x.lineWidth = 2; x.stroke(); }
  // 내 함선 (진행 방향)
  const hd = wrap(p.yaw - cam.yaw);
  x.save(); x.translate(R, R); x.rotate(-hd); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, -16); x.lineTo(-11, 12); x.lineTo(0, 6); x.lineTo(11, 12); x.fill(); x.restore();
  $('rlabel').textContent = WEATHER.storm > 0.5 ? `레이더 · 모래폭풍 간섭${hostiles ? ` · ${hostiles} 적대적` : ''}` : `레이더 · ${RANGE} M${hostiles ? ` · ${hostiles} 적대적` : ''}`;
}
const mkPool = []; let mkUsed = 0;
function marker(cls, html, wx, wy, wz) {
  tmp.set(wx, wy, wz).project(camera); if (tmp.z > 1 || Math.abs(tmp.x) > 1.2 || Math.abs(tmp.y) > 1.2) return;
  let el = mkPool[mkUsed]; if (!el) { el = document.createElement('div'); $('markers').appendChild(el); mkPool.push(el); }
  mkUsed++; el.className = 'mk ' + cls; if (el._h !== html) { el.innerHTML = html; el._h = html; }
  el.style.display = 'block'; el.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
}
function cargoValue(c) { let v = 0; for (const [k, n] of Object.entries(c)) v += n * ORES[k].cr; return v; }
function hudFrame(dt) {
  hudExtras(dt);
  const p = player; mkUsed = 0;
  if (bpTier !== p.tier) drawBlueprint(p.tier);
  const segs = $('hullSeg').children, on = Math.ceil(p.hp / p.maxHp * segs.length);
  for (let i = 0; i < segs.length; i++) segs[i].classList.toggle('on', i < on); $('hullSeg').classList.toggle('low', p.hp / p.maxHp < 0.3);
  const shr = p.shBroken > 0 ? 0 : p.shield / Math.max(1, p.maxShield), ss = $('shSeg').children, son = Math.ceil(shr * ss.length);
  for (let i = 0; i < ss.length; i++) ss[i].classList.toggle('on', i < son);
  $('shSeg').dataset.c = p.shBroken > 0 ? 'x' : shr > 0.66 ? 'g' : shr > 0.33 ? 'y' : 'r';
  $('shT').textContent = p.shBroken > 0 ? `방어막 붕괴 · 재충전 ${Math.ceil(p.shBroken)}s` : `방어막 ${Math.round(shr * 100)}%`;
  $('crv').textContent = fmt(save.credits);
  { const u = Math.floor(p.ult || 0), rd = ultReady(p); $('ultFill').style.width = u + '%'; $('ultBar').classList.toggle('ready', rd); $('ultT').textContent = p.elems && p.elems.length ? (rd ? `궁극기 준비 · ${isTouch ? '궁극 버튼' : 'U'}` : `궁극기 ${u}%`) : '궁극기 · 원소 필요'; $('tUlt').classList.toggle('ready', rd); }
  $('clk').textContent = `${DAY.night > 0.5 ? '☾' : '☀'} ${DAY.label}${inSafe(p) ? ' · 포트 보호 구역' : ''}${p.form === 'tank' ? ' · 🛡전차' : ''}${p.elems && p.elems.length ? ' · ' + p.elems.map(e => ELEMS[e].nm).join('/') : ''}`; $('pvpBadge').hidden = !save.pvp;
  drawRadar(dt);
  // 화물칸
  const capVis = p.cargoCap / 0.84;
  $('cgKg').innerHTML = `${fmt(p.cargoKg)} / ${fmt(p.cargoCap)} <small>킬로그램</small>`;
  $('cgFill').style.width = Math.min(100, p.cargoKg / capVis * 100) + '%';
  const val = cargoValue(p.cargo);
  $('cgState').textContent = p.cargoKg ? '보안되지 않음 · 포트에 도킹해 보관' : '비어 있음 · 광석 근처에서 채굴하세요';
  $('cgVal').textContent = val ? `전리품 ${fmt(val)} C` : '';
  const list = Object.entries(p.cargo).sort((a, b) => b[1] * ORES[b[0]].cr - a[1] * ORES[a[0]].cr).slice(0, 3);
  const lh = list.map(([k, n]) => `<div class="ore" style="border-color:#${ORES[k].col.toString(16).padStart(6, '0')}"><b style="color:${RAR_COL[ORES[k].rar]}">${ORES[k].nm}</b><small>${ORES[k].rar}</small><span>${n} (${n * ORES[k].kg}kg)</span></div>`).join('');
  if ($('cgList')._h !== lh) { $('cgList').innerHTML = lh; $('cgList')._h = lh; }
  // 마커: 전초기지 · 부지
  for (const o of outposts) { const d = Math.hypot(o.x - p.pos.x, o.z - p.pos.z); if (d < 3000) marker('base', `<b>${o.nm} · Lv.${o.lv}</b><div class="hp"><i style="width:${o.hp / o.maxHp * 100}%;background:${o.ruined ? '#ff4a3a' : '#b88cff'}"></i></div><small>${o.build > 0 ? '건설 중' : o.ruined ? '파괴됨' : `유닛 ${o.units.length}`} · ${Math.round(d)}M</small><div class="tri"></div>`, o.x, o.deck + 80, o.z); }
  for (const st of sites) { if (isBuilt(st.id)) continue; const d = Math.hypot(st.x - p.pos.x, st.z - p.pos.z); if (d < 2600) marker('site', `<b>${st.nm} 부지</b><small>건설 ${fmt(outpostCost(outposts.length))}C · ${Math.round(d)}M</small><div class="tri"></div>`, st.x, st.ground + 120, st.z); }
  // 마커: 포트
  for (const pt of ports) { const d = Math.hypot(pt.x - p.pos.x, pt.z - p.pos.z); if (d < 2400) marker('', `<div class="tags"><span>T1</span><span>조선소</span><span>시장</span><span>퀘스트</span></div><b>${pt.def.nm}</b><small>${Math.round(d)}M</small><div class="tri"></div>`, pt.x, pt.deck + 70, pt.z); }
  for (const c of S.crates) { const d = c.g.position.distanceTo(p.pos); if (d < 700) marker('crate', `<small>전리품 ${Math.round(d)}M</small><div class="tri"></div>`, c.g.position.x, c.g.position.y + 14, c.g.position.z); }
  if (nearNode) marker('ore', `<b style="color:${RAR_COL[ORES[nearNode.type].rar]}">${ORES[nearNode.type].nm} · ${nearNode.amount}</b><div class="tri"></div>`, nearNode.x, nearNode.y + 26, nearNode.z);
  for (const s of S.ships) {
    if (!s.alive || s === p) continue; const d = s.pos.distanceTo(p.pos); if (d > 520 && s !== p.lock && !(s.isBoss && d < 2600)) continue;
    const h = S.hooks.hostile(p, s);
    marker(h ? 'tgt' : '', `<b style="font-size:12px;font-weight:600">${s.name}</b><div class="hp sh"><i style="width:${s.shBroken > 0 ? 0 : s.shield / s.maxShield * 100}%"></i></div><div class="hp"><i style="width:${s.hp / s.maxHp * 100}%;background:${h ? '#ff4a3a' : '#9fc3ff'}"></i></div><small>${Math.round(d)} M</small><div class="tri"></div>`, s.pos.x, s.pos.y + 22 * s.scale, s.pos.z);
  }
  if (AP.on) marker('ap', `<b>솔라레 안내 · ${AP.label}</b><small>${Math.round(Math.hypot(AP.x - p.pos.x, AP.z - p.pos.z))}M</small><div class="tri"></div>`, AP.x, AP.y + 40, AP.z);
  for (let i = mkUsed; i < mkPool.length; i++) mkPool[i].style.display = 'none';
  // 잠금 표적 바
  if (p.lock) { $('tbar').style.display = 'block'; $('tName').textContent = `🔒 ${p.lock.name} · ${TIERS[p.lock.tier].t}`; $('tHp').style.width = (p.lock.hp / p.lock.maxHp * 100) + '%'; $('tDist').textContent = Math.round(p.lock.pos.distanceTo(p.pos)) + ' M'; }
  else $('tbar').style.display = 'none';
  $('hint').style.display = hintMsg ? 'block' : 'none'; if ($('hint')._h !== hintMsg) { $('hint').innerHTML = hintMsg; $('hint')._h = hintMsg; }
  hitT -= dt; $('hitmark').style.opacity = hitT > 0 ? 1 : 0;
  bannerT -= dt; if (bannerT <= 0) $('banner').style.display = 'none';
}

/* ================= 지도 ================= */
let mapImg = null;
function buildMapImage() {
  const N = 180, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N);
  const span = WORLD * 1.15;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const wx = (i / N * 2 - 1) * span, wz = (j / N * 2 - 1) * span, h = terrainH(wx, wz), o = (j * N + i) * 4;
    if (h < 4) { im.data[o] = 30; im.data[o + 1] = 80; im.data[o + 2] = 90; }
    else { const t = clamp(h / 420, 0, 1); im.data[o] = 120 + t * 110; im.data[o + 1] = 60 + t * 110; im.data[o + 2] = 35 + t * 80; }
    im.data[o + 3] = 255;
  }
  x.putImageData(im, 0, 0); mapImg = c;
}
function openMap() {
  $('mapOv').classList.add('on'); if (document.pointerLockElement) document.exitPointerLock();
  const c = $('mapc'), x = c.getContext('2d'), W = c.width, span = WORLD * 1.15, P = (wx, wz) => [(wx / span + 1) / 2 * W, (wz / span + 1) / 2 * W];
  x.imageSmoothingEnabled = true; x.drawImage(mapImg, 0, 0, W, W);
  x.strokeStyle = 'rgba(255,74,58,.6)'; x.setLineDash([10, 8]); const [b0] = P(-WORLD, 0), [b1] = P(WORLD, 0); x.strokeRect(b0, b0, b1 - b0, b1 - b0); x.setLineDash([]);
  x.textAlign = 'center'; x.font = 'italic 600 26px Pretendard, sans-serif'; x.fillStyle = 'rgba(255,255,255,.45)'; for (const r of REGIONS) { const [a, b] = P(r.x, r.z); x.fillText(r.nm, a, b); }
  for (const I of islands) { const [a, b] = P(I.x, I.z); x.fillStyle = 'rgba(143,160,74,.85)'; x.beginPath(); x.arc(a, b, Math.max(5, I.r / (WORLD * 1.15) * W / 2), 0, 7); x.fill(); }
  for (const w of WRECKS) { const [a, b] = P(w.x, w.z); x.strokeStyle = '#bbb'; x.lineWidth = 3; x.beginPath(); x.moveTo(a - 7, b - 7); x.lineTo(a + 7, b + 7); x.moveTo(a + 7, b - 7); x.lineTo(a - 7, b + 7); x.stroke(); }
  if (AP.on) { const [a, b] = P(AP.x, AP.z); x.strokeStyle = '#22d3d3'; x.lineWidth = 3; x.beginPath(); x.arc(a, b, 14, 0, 7); x.stroke(); }
  for (const o of ores) if (o.alive) { const [a, b] = P(o.x, o.z); x.fillStyle = '#' + ORES[o.type].col.toString(16).padStart(6, '0'); x.save(); x.translate(a, b); x.rotate(Math.PI / 4); x.fillRect(-5, -5, 10, 10); x.restore(); }
  for (const s of S.ships) if (s.alive && s !== player) { const [a, b] = P(s.pos.x, s.pos.z); x.fillStyle = s.faction === 'pirate' ? '#ff4a3a' : '#9fb0b4'; x.beginPath(); x.arc(a, b, 5, 0, 7); x.fill(); }
  for (const st of sites) { const [a, b] = P(st.x, st.z); const own = outposts.find(o => o.site === st.id); x.fillStyle = own ? (own.ruined ? '#ff6a55' : '#b88cff') : 'rgba(255,179,71,.8)'; x.beginPath(); for (let k = 0; k < 6; k++) { const an = k / 6 * Math.PI * 2; x.lineTo(a + Math.cos(an) * 11, b + Math.sin(an) * 11); } x.fill(); x.fillStyle = '#fff'; x.font = '18px Pretendard, sans-serif'; x.textAlign = 'center'; x.fillText(st.nm.replace(' 전초기지', ''), a, b + 28); }
  for (const p of ports) { const [a, b] = P(p.x, p.z); x.fillStyle = '#22d3d3'; x.fillRect(a - 10, b - 10, 20, 20); x.fillStyle = '#fff'; x.font = 'bold 22px Pretendard, sans-serif'; x.textAlign = 'center'; x.fillText(p.def.nm, a, b - 18); }
  const [a, b] = P(player.pos.x, player.pos.z); x.save(); x.translate(a, b); x.rotate(-player.yaw); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, -14); x.lineTo(-9, 10); x.lineTo(9, 10); x.fill(); x.restore();
}
$('mapX').onclick = () => $('mapOv').classList.remove('on');
$('mapOv').onclick = e => { if (e.target.id === 'mapOv') $('mapOv').classList.remove('on'); };

/* ================= 항구 / 격납고 ================= */
function enterHangar(port) {
  dockPort = port; setMode('hangar'); $('ppanel').hidden = true; AP.on = false;
  if (aiDirty) spawnAll();
  setPortScene(port.def.id); setHangarShip(activeShip().tier, save.paint, activeShip().mods); refreshPort();
  for (const b of document.querySelectorAll('#ptabs button[data-tab]')) b.classList.remove('on');
}
function refreshPort() {
  $('pcrv').textContent = fmt(save.credits); $('pName').textContent = dockPort.def.nm;
  const r = rankOf(save.xp), nx = RANKS[r + 1];
  $('rName').textContent = RANKS[r].nm; $('rXp').textContent = nx ? `${save.xp} / ${nx.xp} · 다음: ${nx.nm}` : `${save.xp} · 최고 등급`;
  $('rFill').style.width = nx ? ((save.xp - RANKS[r].xp) / (nx.xp - RANKS[r].xp) * 100) + '%' : '100%';
  $('pvpBtn').textContent = save.pvp ? '켜기' : '끄기'; $('pvpBtn').classList.toggle('on', save.pvp);
  const a = activeShip(), T = TIERS[a.tier];
  const st = statsFor(a.tier, a.lv);
  $('psTier').textContent = `${T.t} · ${T.en}`; $('psName').textContent = T.nm;
  $('psStat').innerHTML = `${T.role} · 선체 ${st.hp} · 방어막 ${T.shield} · 속도 ${st.speed.toFixed(0)} m/s<br>화물 ${fmt(st.cargo)}kg · 포탑 ${T.turrets}문 · ${WEAPONS[a.weapon || 'cannon'].nm}<br>모듈 ${a.mods.length}/${slotCount(a.tier)} 장착`;
  renderObjective();
  $('qDot').hidden = !save.quests.some(q => q.have >= q.need || (q.type === 'deliver' && (save.storage[q.ore] || 0) > 0));
}
function statsFor(tier, lv) { const T = TIERS[tier]; return { hp: Math.round(T.hp * (1 + 0.22 * (lv.armor || 0))), speed: T.speed * (1 + 0.06 * (lv.engine || 0)), cargo: Math.round(T.cargo * (1 + 0.2 * (lv.cargo || 0))) }; }
$('pvpBtn').onclick = () => { save.pvp = !save.pvp; persist(); refreshPort(); sfx('ui'); toast(save.pvp ? 'PvP 켜짐 — PvP를 켠 캡틴과 서로 공격할 수 있습니다' : 'PvP 꺼짐 — 해적만 적대적입니다'); };
document.querySelectorAll('#ptabs button[data-tab]').forEach(b => b.onclick = () => {
  const on = b.classList.contains('on'); document.querySelectorAll('#ptabs button[data-tab]').forEach(x => x.classList.remove('on'));
  if (on) { $('ppanel').hidden = true; return; } b.classList.add('on'); openTab(b.dataset.tab); sfx('ui');
});
$('ppx').onclick = () => { $('ppanel').hidden = true; document.querySelectorAll('#ptabs button').forEach(x => x.classList.remove('on')); };
let curTab = null;
function openTab(tab) {
  curTab = tab; $('ppanel').hidden = false; const B = $('ppB'); const T = s => $('ppT').textContent = s;
  const a = activeShip();
  if (tab === 'paint') {
    T('페인트');
    B.innerHTML = `<p class="ds" style="color:var(--dim)">선체 도색을 고르세요. 무료입니다.</p><div class="swatches">${PAINTS.map(p => `<button data-p="${p.id}" class="${save.paint === p.id ? 'on' : ''}" style="background:rgb(${p.c.map(v => Math.min(255, Math.round(v * 169))).join(',')})">${p.nm}</button>`).join('')}</div>`;
    B.querySelectorAll('[data-p]').forEach(el => el.onclick = () => { save.paint = el.dataset.p; persist(); setHangarShip(a.tier, save.paint, a.mods); openTab('paint'); });
  } else if (tab === 'upgrade') {
    T('업그레이드');
    save.weapons = save.weapons || ['cannon'];
    const wHtml = `<h4 style="margin:4px 0 2px">주포 무기</h4><p style="color:var(--dim);font-size:12px;margin:0">한 번 사면 모든 함선에 장착할 수 있어요. 포탑 업그레이드는 모든 무기에 적용됩니다.</p>` + Object.entries(WEAPONS).map(([k, w]) => { const own = save.weapons.includes(k), eq = (a.weapon || 'cannon') === k;
      return `<div class="row"><div class="ic">${w.ic}</div><div><div class="nm">${w.nm}</div><div class="ds">${w.ds}</div></div>${eq ? '<button class="btn" disabled>장착 중</button>' : own ? `<button class="btn ghost" data-weq="${k}">장착</button>` : `<button class="btn" data-wbuy="${k}" ${save.credits < w.cost ? 'disabled' : ''}>구매 ${fmt(w.cost)} C</button>`}</div>`; }).join('') + `<h4 style="margin:18px 0 2px">함선 모듈</h4>`;
    B.innerHTML = wHtml + `<p style="color:var(--dim);font-size:13px">${TIERS[a.tier].t} ${TIERS[a.tier].nm}의 모듈 · 함선마다 따로 업그레이드됩니다.</p>` + Object.entries(MODS).map(([k, m]) => {
      const cap = lvCap(), l = a.lv[k] || 0, max = l >= cap, cost = modCost(k, l, a.tier);
      return `<div class="row"><div class="ic">${m.ic}</div><div><div class="nm">${m.nm} <small style="color:var(--dim)">Lv.${l}${isFounder() ? ` / ${cap}` : ''}</small></div><div class="ds">${m.ds(l)}${max ? '' : ' → ' + m.ds(l + 1).split('·')[0]}</div><div class="pips">${Array.from({ length: Math.min(cap, 10) }, (_, i) => `<i class="${i < Math.round(l / cap * Math.min(cap, 10)) ? 'on' : ''}"></i>`).join('')}</div></div><button class="btn" data-k="${k}" ${max || save.credits < cost ? 'disabled' : ''}>${max ? 'MAX' : `${l ? '업그레이드' : '구매'} ${fmt(cost)} C`}</button></div>`;
    }).join('');
    B.querySelectorAll('[data-k]').forEach(el => el.onclick = () => { const k = el.dataset.k, l = a.lv[k] || 0, cost = modCost(k, l, a.tier); if (save.credits < cost) return; save.credits -= cost; a.lv[k] = l + 1; persist(); sfx('coin'); refreshPort(); openTab('upgrade'); });
    B.querySelectorAll('[data-wbuy]').forEach(el => el.onclick = () => { const k = el.dataset.wbuy, w = WEAPONS[k]; if (save.credits < w.cost) return; save.credits -= w.cost; save.weapons.push(k); a.weapon = k; persist(); sfx('coin'); toast(`<b>${w.nm}</b> 구매·장착 완료`); refreshPort(); openTab('upgrade'); });
    B.querySelectorAll('[data-weq]').forEach(el => el.onclick = () => { a.weapon = el.dataset.weq; persist(); sfx('ui'); refreshPort(); openTab('upgrade'); });
  } else if (tab === 'market') {
    T(`시장 · ${dockPort.def.nm}`);
    const rows = Object.keys(ORES).map(k => { const n = save.storage[k] || 0, pr = priceOf(k, dockPort.def), base = ORES[k].cr, tr = pr > base * 1.05 ? '▲' : pr < base * 0.95 ? '▼' : '—';
      return `<div class="row"><div class="ic" style="color:#${ORES[k].col.toString(16).padStart(6, '0')}">◆</div><div><div class="nm" style="color:${RAR_COL[ORES[k].rar]}">${ORES[k].nm} <small style="color:var(--dim)">${ORES[k].rar}</small></div><div class="ds">보관 ${n}개 · 개당 <b>${pr} C</b> <span style="color:${tr === '▲' ? '#7fe07f' : tr === '▼' ? '#ff7a6a' : 'var(--dim)'}">${tr}</span></div></div><div style="display:flex;gap:6px"><button class="btn ghost" data-s1="${k}" ${n ? '' : 'disabled'}>1개</button><button class="btn" data-sa="${k}" ${n ? '' : 'disabled'}>전부 ${n ? fmt(n * pr) : 0} C</button></div></div>`; }).join('');
    const total = Object.keys(ORES).reduce((s, k) => s + (save.storage[k] || 0) * priceOf(k, dockPort.def), 0);
    B.innerHTML = `<p style="color:var(--dim);font-size:13px">포트마다 시세가 다르고 시간이 지나면 변합니다.</p>${rows}<div class="row" style="grid-template-columns:1fr auto"><b>보관 광석 전부 판매</b><button class="btn" id="sellAll" ${total ? '' : 'disabled'}>${fmt(total)} C 받기</button></div>`;
    const sell = (k, n) => { const pr = priceOf(k, dockPort.def); save.storage[k] -= n; save.credits += pr * n; story('sell', 1); persist(); sfx('coin'); refreshPort(); openTab('market'); };
    B.querySelectorAll('[data-s1]').forEach(el => el.onclick = () => sell(el.dataset.s1, 1));
    B.querySelectorAll('[data-sa]').forEach(el => el.onclick = () => sell(el.dataset.sa, save.storage[el.dataset.sa]));
    $('sellAll').onclick = () => { story('sell', 1); for (const k in ORES) { const n = save.storage[k] || 0; if (n) { save.credits += priceOf(k, dockPort.def) * n; save.storage[k] = 0; } } persist(); sfx('coin'); refreshPort(); openTab('market'); };
  } else if (tab === 'quest') {
    T('퀘스트'); refillQuests();
    const sc = CHAPTERS[save.story.ch];
    B.innerHTML = (sc && !save.story.done ? `<h4 class="ylv">주 임무 (스토리)</h4><div class="row story"><div class="ic">📜</div><div><div class="nm">${sc.nm}</div><div class="ds">${sc.goal} · 보상 ${fmt(sc.cr)} C · 평판 +${sc.xp}</div>${sc.need > 1 ? `<div class="qbar"><i style="width:${save.story.have / sc.need * 100}%"></i></div>` : ''}</div><span style="color:var(--dim);font-size:12px">${save.story.ch + 1}/${CHAPTERS.length}</span></div><h4 class="ylv">의뢰</h4>` : '') + save.quests.map((q, i) => {
      const have = q.type === 'deliver' ? Math.min(q.need, q.have) : q.have, done = have >= q.need, stock = q.type === 'deliver' ? (save.storage[q.ore] || 0) : 0;
      const btn = done ? `<button class="btn" data-claim="${i}">보상 받기</button>` : q.type === 'deliver' ? `<button class="btn ghost" data-dlv="${i}" ${stock ? '' : 'disabled'}>납품 (${stock})</button>` : `<span style="color:var(--dim);font-size:12px">진행 중</span>`;
      return `<div class="row"><div class="ic">${q.type === 'kill' ? '⚔️' : q.type === 'mine' ? '⛏️' : '📦'}</div><div><div class="nm">${q.nm}</div><div class="ds">보상 ${fmt(q.cr)} C · 평판 +${q.xp} · ${fmt(have)} / ${fmt(q.need)}</div><div class="qbar"><i style="width:${have / q.need * 100}%"></i></div></div>${btn}</div>`;
    }).join('') + `<div class="row" style="grid-template-columns:1fr auto"><span style="color:var(--dim);font-size:13px">진행 중이 아닌 퀘스트 교체</span><button class="btn ghost" id="qReroll" ${save.credits < 50 ? 'disabled' : ''}>새로고침 50 C</button></div>`;
    B.querySelectorAll('[data-claim]').forEach(el => el.onclick = () => { const q = save.quests[+el.dataset.claim]; save.credits += q.cr; gainXp(q.xp); save.quests.splice(+el.dataset.claim, 1); refillQuests(); persist(); sfx('coin'); toast(`퀘스트 완료 <b>+${fmt(q.cr)} C</b> · 평판 +${q.xp}`); refreshPort(); openTab('quest'); });
    B.querySelectorAll('[data-dlv]').forEach(el => el.onclick = () => { const q = save.quests[+el.dataset.dlv]; const n = Math.min(save.storage[q.ore] || 0, q.need - q.have); save.storage[q.ore] -= n; q.have += n; persist(); refreshPort(); openTab('quest'); });
    $('qReroll').onclick = () => { save.credits -= 50; save.quests = save.quests.filter(q => q.have > 0); refillQuests(); persist(); refreshPort(); openTab('quest'); };
  } else if (tab === 'yard') {
    T('조선소'); const r = rankOf(save.xp);
    setTimeout(() => { const b = document.createElement('button'); b.className = 'btn'; b.style.margin = '0 0 8px'; b.textContent = `외형 바꾸기 · 지금: ${STYLES[save.style || 'ship'].nm}`; b.onclick = () => openStylePicker(false); $('ppB').prepend(b); }, 0);
    B.innerHTML = `<p style="color:var(--dim);font-size:13px">평판 등급과 이전 등급 함선 보유가 필요합니다. 등급마다 전투·화물·정찰 등 여러 갈래가 있고, 모든 분기는 다음 단계로 이어집니다.</p>` + [0, 1, 2, 3, 4].map(lvl => `<h4 class="ylv">T${lvl + 1}</h4>` + TIERS.filter(t => t.tier === lvl).map(t => {
      const own = ownsTier(t.id), act = a.tier === t.id, lockR = r < t.rank, lockP = lvl > 0 && !ownsLevel(lvl - 1);
      const btn = act ? `<button class="btn" disabled>탑승 중</button>` : own ? `<button class="btn ghost" data-use="${t.id}">탑승</button>` : `<button class="btn" data-buy="${t.id}" ${lockR || lockP || save.credits < t.cost ? 'disabled' : ''}>${lockR ? `🔒 ${RANKS[t.rank].nm}` : lockP ? `🔒 T${lvl} 필요` : `구매 ${fmt(t.cost)} C`}</button>`;
      return `<div class="tcard ${act ? 'on' : ''}"><h4><small>${t.t}</small>${t.nm} <em class="role">${t.role}</em></h4>${btn}<p>${t.ds}<br>선체 ${t.hp} · 방어막 ${t.shield} · 속도 ${t.speed} m/s · 화물 ${fmt(t.cargo)}kg · 포탑 ${t.turrets}문 · 모듈 슬롯 ${t.slots}</p></div>`;
    }).join('')).join('');
    B.querySelectorAll('[data-buy]').forEach(el => el.onclick = () => { const t = TIERS[+el.dataset.buy]; if (save.credits < t.cost) return; save.credits -= t.cost; buyTier(t.id); persist(); sfx('coin'); toast(`<b>${t.nm}</b> 구매 완료!`); solEvent('newShip', 2, 1); if (t.tier >= 1) story('ship', 1); if (t.id === 8) story('arc', 1); aiDirty = true; setHangarShip(t.id, save.paint); refreshPort(); openTab('yard'); });
    B.querySelectorAll('[data-use]').forEach(el => el.onclick = () => { save.active = save.ships.findIndex(s => s.tier === +el.dataset.use); persist(); setHangarShip(activeShip().tier, save.paint, activeShip().mods); refreshPort(); openTab('yard'); });
  } else if (tab === 'inv') {
    T('인벤토리');
    const st = Object.entries(save.storage).filter(([, n]) => n > 0);
    B.innerHTML = `<h4 style="margin:6px 0">보관 창고</h4>` + (st.length ? st.map(([k, n]) => `<div class="row"><div class="ic" style="color:#${ORES[k].col.toString(16).padStart(6, '0')}">◆</div><div><div class="nm">${ORES[k].nm}</div><div class="ds">${n}개 · ${n * ORES[k].kg}kg</div></div><span style="font-family:var(--num);font-size:13px">${fmt(n * priceOf(k, dockPort.def))} C</span></div>`).join('') : '<p style="color:var(--dim)">비어 있습니다. 광석을 채굴해 도킹하면 여기 보관됩니다.</p>')
      + `<h4 style="margin:18px 0 6px">보유 함선</h4>` + save.ships.map(s => `<div class="row"><div class="ic">🚀</div><div><div class="nm">${TIERS[s.tier].t} ${TIERS[s.tier].nm}</div><div class="ds">${Object.entries(s.lv).map(([k, v]) => `${MODS[k].nm.split(' ')[0]} ${v}`).join(' · ')}</div></div>${s === a ? '<span style="color:var(--teal)">탑승 중</span>' : ''}</div>`).join('')
      + `<h4 style="margin:18px 0 6px">기록</h4><div class="kv"><span>격추</span><b>${save.stats.kills}</b><span>채굴</span><b>${fmt(save.stats.mined)} kg</b><span>격추당함</span><b>${save.stats.deaths}</b><span>SKY RUN 최고</span><b>${save.skyrunBest || 0}</b></div>`;
  } else if (tab === 'modules') {
    T('모듈'); const Tt = TIERS[a.tier]; save.modules = save.modules || [];
    const cats = ['방어', '기동', '공격', '유틸'];
    B.innerHTML = `<div class="slots">${Array.from({ length: slotCount(a.tier) }, (_, i) => { const id = a.mods[i], m = MODULES[id]; return m ? `<button class="slot full" data-un="${id}" title="해제">${m.ic}<small>${m.nm}</small><em>해제</em></button>` : '<div class="slot">빈 슬롯</div>'; }).join('')}</div>
      <p style="color:var(--dim);font-size:12px">${Tt.nm}: 슬롯 ${a.mods.length}/${slotCount(a.tier)}. 모듈은 한 번 사면 모든 함선에 장착할 수 있어요.</p>`
      + cats.map(c => `<h4 class="ylv">${c}</h4>` + Object.entries(MODULES).filter(([, m]) => m.cat === c).map(([id, m]) => {
        const own = save.modules.includes(id), eq = a.mods.includes(id), full = a.mods.length >= slotCount(a.tier);
        const btn = eq ? `<button class="btn ghost" data-un="${id}">해제</button>` : own ? `<button class="btn" data-eq="${id}" ${full ? 'disabled' : ''}>${full ? '슬롯 없음' : '장착'}</button>` : `<button class="btn" data-mbuy="${id}" ${save.credits < m.cost ? 'disabled' : ''}>구매 ${fmt(m.cost)} C</button>`;
        return `<div class="row"><div class="ic">${m.ic}</div><div><div class="nm">${m.nm}${eq ? ' <small style="color:var(--teal)">장착 중</small>' : ''}</div><div class="ds">${m.ds}</div></div>${btn}</div>`; }).join('')).join('');
    const re = () => { persist(); sfx('ui'); refreshPort(); refreshHangarMods(a.mods); openTab('modules'); };
    B.querySelectorAll('[data-mbuy]').forEach(el => el.onclick = () => { const id = el.dataset.mbuy, m = MODULES[id]; if (save.credits < m.cost) return; save.credits -= m.cost; save.modules.push(id); if (a.mods.length < slotCount(a.tier)) { a.mods.push(id); hangarInstall(id, a.mods.length - 1); story('module', 1); } toast(`<b>${m.nm}</b> 구매${a.mods.includes(id) ? '·장착' : ''} 완료`); re(); });
    B.querySelectorAll('[data-eq]').forEach(el => el.onclick = () => { if (a.mods.length < slotCount(a.tier) && !a.mods.includes(el.dataset.eq)) { a.mods.push(el.dataset.eq); hangarInstall(el.dataset.eq, a.mods.length - 1); story('module', 1); } re(); });
    B.querySelectorAll('[data-un]').forEach(el => el.onclick = () => { a.mods = a.mods.filter(x => x !== el.dataset.un); re(); });
    // ── 원소 코어: 포탑이 원소를 번갈아 쏘고, 서로 다른 원소가 같은 적에 맞으면 원소 반응
    const eSlots = elemSlots(a.tier); a.elems = a.elems || []; save.elements = save.elements || [];
    B.insertAdjacentHTML('beforeend', `<h4 class="ylv">원소 코어 <small style="color:var(--dim)">${a.elems.length}/${eSlots}칸${isFounder() ? ' · 캡틴 특권: 전부 장착' : ''}</small></h4><p style="color:var(--dim);font-size:12px;margin:0 0 6px">장착한 원소가 포탑 탄과 미사일에 실려요. 화염+물=증발, 번개+화염=과부하처럼 다른 원소가 이어서 맞으면 반응이 일어납니다.</p>` + Object.entries(ELEMS).map(([k, E]) => {
      const own = save.elements.includes(k), eq = a.elems.includes(k), full = a.elems.length >= eSlots;
      const btn = eq ? `<button class="btn ghost" data-eun="${k}">해제</button>` : own ? `<button class="btn" data-eeq="${k}" ${full ? 'disabled' : ''}>${full ? '슬롯 없음' : '장착'}</button>` : `<button class="btn" data-ebuy="${k}" ${save.credits < ELEM_COST ? 'disabled' : ''}>구매 ${fmt(ELEM_COST)} C</button>`;
      return `<div class="row"><div class="ic" style="color:${E.hex}">◈</div><div><div class="nm" style="color:${E.hex}">${E.nm} 코어 <small style="color:var(--dim)">${E.code}</small>${eq ? ' <small style="color:var(--teal)">장착 중</small>' : ''}</div></div>${btn}</div>`; }).join(''));
    B.querySelectorAll('[data-ebuy]').forEach(el => el.onclick = () => { if (save.credits < ELEM_COST) return; save.credits -= ELEM_COST; save.elements.push(el.dataset.ebuy); if (a.elems.length < eSlots) a.elems.push(el.dataset.ebuy); persist(); sfx('coin'); refreshPort(); openTab('modules'); });
    B.querySelectorAll('[data-eeq]').forEach(el => el.onclick = () => { if (a.elems.length < eSlots && !a.elems.includes(el.dataset.eeq)) a.elems.push(el.dataset.eeq); persist(); sfx('ui'); openTab('modules'); });
    B.querySelectorAll('[data-eun]').forEach(el => el.onclick = () => { a.elems = a.elems.filter(x => x !== el.dataset.eun); persist(); sfx('ui'); openTab('modules'); });
  } else if (tab === 'settings') {
    T('설정');
    B.innerHTML = `<div class="kv" style="align-items:center"><span>그래픽 품질</span><select class="sel" id="qSel"><option value="high">높음</option><option value="mid">보통</option><option value="low">낮음</option></select><span>AI 함선 수 (전원 T5) <b id="aiv">${aiCount()}</b>척</span><input type="range" id="aiR" min="20" max="80" step="4" value="${aiCount()}"><span>소리</span><button class="btn ghost" id="muteB">${save.mute ? '꺼짐 — 켜기' : '켜짐 — 끄기'}</button><span>AI 대화 모델</span><div><select class="sel" id="modS">${Object.entries(MODEL_NAMES).map(([k, n]) => `<option value="${k}" ${solCfg().model === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div><span>AI 대화</span><div><button class="btn ghost" id="llmB">${solCfg().llm ? '켜짐 — 끄기' : '꺼짐 — 켜기'}</button><div style="font-size:12px;color:var(--dim);margin-top:6px" id="solLLMStat">${llmText()}</div></div><span>자율 권한</span><div><select class="sel" id="permS">${PERM_NAMES.map((n, i) => `<option value="${i}" ${solCfg().perm === i ? 'selected' : ''}>${i} · ${n}</option>`).join('')}</select><div style="font-size:12px;color:var(--dim);margin-top:6px">${permDesc(solCfg().perm)}</div></div><span>깜박임 방지</span><div><button class="btn ghost" id="safeB">${SAFE ? '켜짐 — 끄기' : '꺼짐 — 켜기'}</button><div style="font-size:12px;color:var(--dim);margin-top:6px">사파리 검은 화면·깜박임이 보이면 켜세요. 후처리 효과가 꺼집니다. 적용하려면 새로고침</div></div><span>캡틴 특권</span><div>${isFounder() ? '<span style="color:var(--teal)">켜짐 — 레벨 상한 30 · 원소 전부 · 모든 함선</span> <button class="btn ghost" id="fdOff">해제</button>' : '<input id="fdIn" class="sel" type="password" placeholder="코드 입력" autocomplete="off" style="width:140px;user-select:text"> <button class="btn ghost" id="fdOn">적용</button>'}</div><span>카메라 방향 조종</span><button class="btn ghost" id="csB">${save.camSteer !== false ? '켜짐 — 끄기' : '꺼짐 — 켜기'}</button><span>스토리</span><button class="btn ghost" id="introB">인트로 다시 보기</button><span>저장 초기화</span><button class="btn red" id="rst">모두 지우기</button></div><p style="color:var(--dim);font-size:12px;margin-top:16px">조작: W/S 추진 · A/D 회전 · Space/Shift 상승·하강 · 마우스 시점(클릭하면 고정) · 클릭 사격 · E 채굴 · R 잠금 · F 미사일 · X 부스트 · C 플레어 · G 화물 투하 · M 지도 · Tab 순위</p>`;
    $('qSel').value = QUALITY; $('qSel').onchange = e => { try { localStorage.setItem('skyfleet_q', e.target.value); } catch (er) {} location.reload(); };
    $('llmB').onclick = () => { setLLM(!solCfg().llm); openTab('settings'); };
    $('modS').onchange = e => { setModel(e.target.value); openTab('settings'); };
    $('permS').onchange = e => { setPermUI(+e.target.value); $('solPerm').textContent = `권한 ${permName()}`; openTab('settings'); };
    if ($('fdOn')) $('fdOn').onclick = async () => { const h = await sha256($('fdIn').value.trim()); if (h === FOUNDER_HASH) { activateFounder(); sfx('coin'); toast('👑 <b>캡틴 특권</b> 활성화! 레벨 상한 30 · 원소 전부 · 모든 함선 · 슬롯 +4'); setHangarShip(activeShip().tier, save.paint, activeShip().mods); refreshPort(); openTab('settings'); } else { toast('코드가 맞지 않아요'); } };
    if ($('fdOff')) $('fdOff').onclick = () => { deactivateFounder(); toast('캡틴 특권을 해제했어요 (진행 상황은 유지)'); refreshPort(); openTab('settings'); };
    $('safeB').onclick = () => { try { localStorage.setItem('skyfleet_safe', SAFE ? '0' : '1'); } catch (e) {} location.reload(); };
    $('csB').onclick = () => { save.camSteer = save.camSteer === false; persist(); openTab('settings'); };
    $('introB').onclick = () => { $('ppanel').hidden = true; const port = dockPort; playIntro(() => enterHangar(port)); };
    $('muteB').onclick = () => { save.mute = !save.mute; setMute(save.mute); persist(); openTab('settings'); };
    $('aiR').oninput = e => { save.aiCount = +e.target.value; $('aiv').textContent = save.aiCount; aiDirty = true; persist(); };
    $('rst').onclick = () => { if (confirm('정말 모든 진행 상황을 지울까요?')) { localStorage.removeItem('skyfleet_save_v2'); location.reload(); } };
  }
}
$('leave').onclick = () => launch();
/* ===== 외형 선택 ===== */
function openStylePicker(first) {
  const ov = $('stylePick'), fd = isFounder();
  $('spList').innerHTML = STYLE_KEYS.map(k => `<button class="spc ${save.style === k ? 'on' : ''}" data-st="${k}"><i>${STYLES[k].ic}</i><b>${STYLES[k].nm}</b><small>${STYLES[k].ds}</small><em>속도 ×${STYLES[k].mul.speed} · 선회 ×${STYLES[k].mul.turn} · 화력 ×${STYLES[k].mul.dmg}</em></button>`).join('');
  $('spNote').textContent = fd ? '👑 캡틴 특권: 비행 중 T(변형)를 누르면 모든 외형과 전차로 차례대로 변신해요.' : (first ? '처음 함선 외형을 고르세요. 격납고 조선소 탭에서 언제든 바꿀 수 있어요.' : '외형을 바꿔도 능력치·모듈은 그대로예요.');
  ov.classList.add('on');
  $('spList').querySelectorAll('[data-st]').forEach(b => b.onclick = () => { save.style = b.dataset.st; persist(); sfx('install'); ov.classList.remove('on'); setHangarShip(activeShip().tier, save.paint, activeShip().mods); toast(`${STYLES[save.style].ic} <b>${STYLES[save.style].nm}</b> 선택!`); });
}
$('spX').onclick = () => { if (!save.style) { save.style = 'ship'; persist(); } $('stylePick').classList.remove('on'); };
$('toBridge').onclick = () => { setMode('bridge'); $('ppanel').hidden = true; enterBridge(); sfx('ui'); };
$('brBack').onclick = () => { exitBridge(); setMode('hangar'); sfx('ui'); };
$('brInteract').onpointerdown = e => { e.stopPropagation(); bridgeInteract(); };
$('brCam').onpointerdown = e => { e.stopPropagation(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' })); };
{ const j = $('brJoy'), kn = $('brJoyK'); let id = null; const set = e => { const r = j.getBoundingClientRect(), R = r.width / 2; let dx = (e.clientX - r.left - R) / R, dy = (e.clientY - r.top - R) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } bridgeInput.x = dx; bridgeInput.y = -dy; kn.style.transform = `translate(${dx * R * 0.55}px,${dy * R * 0.55}px)`; };
  j.addEventListener('pointerdown', e => { id = e.pointerId; j.setPointerCapture(id); set(e); }); j.addEventListener('pointermove', e => { if (e.pointerId === id) set(e); });
  const end = e => { if (e.pointerId === id) { id = null; bridgeInput.x = bridgeInput.y = 0; kn.style.transform = ''; } }; j.addEventListener('pointerup', end); j.addEventListener('pointercancel', end); }
bhooks.toast = m => toast(m); bhooks.say = t => solSay(t, 'calm', 2);
bhooks.setStrategy = k => { save.strategy = k; persist(); };
bhooks.onExit = () => { exitBridge(); setMode('hangar'); };
bhooks.world = () => ({ ores: ores.filter(o => o.alive), ports, outposts, ships: S.ships, player, ap: AP });
bhooks.status = () => { const s = solSnap(), a = activeShip(); return `현재 작전: ${STRATEGIES[save.strategy].nm}. ${s.cargoPct > 0.6 ? '화물이 많이 찼으니 판매를 권해요.' : s.hpPct < 0.7 ? '선체 정비가 필요해요.' : a.mods.length < slotCount(a.tier) ? '빈 모듈 슬롯이 있어요.' : '준비 완료, 출격하셔도 좋아요.'}`; };
function launch() {
  const a = activeShip(), p = dockPort;
  if (player.tier !== a.tier || player.paint !== save.paint) { player.tier = a.tier; player.paint = save.paint; }
  player.lv = a.lv; player.weapon = a.weapon || 'cannon'; player.mods = a.mods || []; player.elems = a.elems || []; player.form = 'ship'; player.look = player.baseLook = save.style || 'ship'; player.formShown = 'ship'; player.hp = undefined; player.shield = 0; player.build(scene);
  const yaw = Math.atan2(p.x, p.z);   // 바깥쪽 대신 맵 중앙을 향함
  player.spawnAt(p.x, p.deck + player.hover + 2, p.z, yaw);
  cam.yaw = yaw; cam.pitch = 0.3; cam.last = 0;
  camera.position.set(p.x + Math.sin(yaw) * 90, p.deck + 50, p.z + Math.cos(yaw) * 90);
  launchT = 2.6; docking = 0; $('ppanel').hidden = true; AP.on = false; agentReset();
  setMode('fly');
  banner('LAUNCH', DAY.night > 0.5 ? '야간 비행입니다, 캡틴 · 착륙장 조명을 따라 귀환하세요' : '맑은 하늘입니다, 캡틴', 3.2);
  sfx('ui'); story('launch', 1); setTimeout(() => solEvent(DAY.night > 0.5 ? 'night' : 'launch', 1, 5), 1200);
}

/* ================= 스토리 · 솔라레 · 자동비행 · 연출 ================= */
function camSteerOn() { return save.camSteer !== false && (isTouch || document.pointerLockElement === cv) && !AP.on; }
// 스토리 진행
function story(id, amt) {
  const st = save.story; if (st.done) return; const ch = CHAPTERS[st.ch]; if (!ch || ch.id !== id) return;
  st.have = Math.min(ch.need, st.have + amt); renderObjective();
  if (st.have < ch.need) return;
  save.credits += ch.cr; gainXp(ch.xp); st.ch++; st.have = 0; persist();
  banner('CHAPTER CLEAR', `${ch.nm} 완료 · +${fmt(ch.cr)} CR · 평판 +${ch.xp}`, 4);
  const nx = CHAPTERS[st.ch];
  if (nx) setTimeout(() => { solSay(`다음 임무: ${nx.nm}. ${nx.solare}`, 'happy', 2); renderObjective(); }, 1500);
  else { st.done = true; persist(); setTimeout(showEnding, 2500); }
  if (nx && nx.id === 'ship' && ownsLevel(1)) story('ship', 1);
  if (nx && nx.id === 'arc' && ownsTier(8)) story('arc', 1);
  if (nx && nx.id === 'module' && save.ships.some(s => s.mods.length)) story('module', 1);
}
function renderObjective() {
  const st = save.story, ch = CHAPTERS[st.ch], el = $('obj');
  if (!ch || st.done) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `<small>주 임무 · ${st.ch + 1}/${CHAPTERS.length}</small><b>${ch.nm}</b><span>${ch.goal}</span>${ch.need > 1 ? `<div class="qbar"><i style="width:${st.have / ch.need * 100}%"></i></div><em>${fmt(st.have)} / ${fmt(ch.need)}</em>` : ''}`;
}
function showEnding() { $('introT').textContent = '에필로그'; $('introS').textContent = ''; introOn = true; introLines = [{ t: '에필로그', s: ENDING, solare: true }]; introI = -1; $('intro').classList.add('on'); introNext(); }
// 인트로 (첫 실행)
let introOn = false, introI = -1, introLines = INTRO, introDone = null, introTyper = null, introCam = 0;
function playIntro(after) {
  introOn = true; introI = -1; introLines = INTRO; introDone = after; $('intro').classList.add('on'); setMode('intro'); introNext();
}
function introNext() {
  if (introTyper && introTyper.busy) { introTyper.finish(); return; }
  introI++;
  if (introI >= introLines.length) { introOn = false; $('intro').classList.remove('on'); if (introDone) { const f = introDone; introDone = null; save.story.intro = true; persist(); f(); } return; }
  const L = introLines[introI]; $('introT').textContent = L.t; $('introAv').classList.toggle('on', !!L.solare);
  let i = 0; const el = $('introS'), full = L.s;
  const iv = setInterval(() => { i += 1; el.textContent = full.slice(0, i); if (i >= full.length) { clearInterval(iv); introTyper.busy = false; } }, 32);
  introTyper = { busy: true, finish() { clearInterval(iv); el.textContent = full; this.busy = false; } };
  $('introDots').innerHTML = introLines.map((_, k) => `<i class="${k === introI ? 'on' : ''}"></i>`).join('');
}
$('introNext').onclick = () => introNext();
$('introSkip').onclick = () => { introI = introLines.length; introTyper && introTyper.finish(); introNext(); };
function updateIntroCam(dt) {
  introCam += dt * 0.05; const r = 1700, h = 620;
  camera.position.set(Math.cos(introCam) * r, h + Math.sin(introCam * 2) * 80, Math.sin(introCam) * r);
  camera.lookAt(300, 380, -500); camera.fov = 55; camera.updateProjectionMatrix();
}
// 자동 비행 (솔라레). 사용자 명령(src=user)과 자율 에이전트(src=agent)가 같이 쓴다
const AP = { on: false, x: 0, y: 0, z: 0, label: '', kind: '', src: 'user', target: null, node: null };
function setAP(x, y, z, label, kind, src = 'user') { Object.assign(AP, { on: true, x, y, z, label, kind, src, target: null, node: null }); }
let shipSeq = 0; const sid = s => s._id || (s._id = ++shipSeq);
/* ---------- 자동 비행 v2: 도착 감속 · 장애물 회피 · 피해 회피 ---------- */
const _av = new THREE.Vector3();
function weaponRange(s) { const W = WEAPONS[s.weapon || 'cannon']; return W.speed * (s.bulletSpd || 1) * W.life * 0.9; }
// 원하는 수평 속도(vx, vz)와 목표 고도를 받아 조종 입력으로 바꾼다
function steerTo(p, dt, vx, vz, wantY, opts = {}) {
  // 1) 장애물 회피: 앞쪽 1~3초 지점의 지형·섬·함선을 살핀다
  const sp = Math.max(p.speed, 20); let climb = 0, sideX = 0, sideZ = 0;
  const dirx = vx || -Math.sin(p.yaw), dirz = vz || -Math.cos(p.yaw), dl = Math.hypot(dirx, dirz) || 1;
  for (const t of [0.8, 1.6, 2.6]) {
    const px = p.pos.x + dirx / dl * sp * t, pz = p.pos.z + dirz / dl * sp * t;
    const g = surfaceBelow(px, p.pos.y + 40, pz) + 55 * p.scale; if (g > wantY) wantY = g;
    for (const I of islands) {
      const d = Math.hypot(px - I.x, pz - I.z);
      if (d < I.r + 40 && p.pos.y < I.y + 30 && p.pos.y > I.y - I.h - 20) { climb = Math.max(climb, 1); sideX += (px - I.x) / (d || 1); sideZ += (pz - I.z) / (d || 1); }
    }
  }
  for (const o of S.ships) {
    if (o === p || !o.alive) continue; const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z, d = Math.hypot(dx, dz);
    if (d < (o.radius + p.radius) * 2.2 && Math.abs(o.pos.y - p.pos.y) < 40 && (dx * dirx + dz * dirz) > 0) { sideX -= dx / d * 1.5; sideZ -= dz / d * 1.5; }
  }
  if (sideX || sideZ) { const k = Math.hypot(vx, vz) || sp; vx += sideX * k * 0.6; vz += sideZ * k * 0.6; }
  // 2) 원하는 방향으로 선회 (각속도 감쇠로 흔들림 방지)
  const want = Math.atan2(-vx, -vz), d = wrap(want - p.yaw), vdes = Math.hypot(vx, vz);
  p.inTurn = clamp(d * 2.1 - p.yawVel * 0.45, -1, 1);
  // 3) 속도: 방향이 많이 틀어졌으면 줄이고, 원하는 속도에 맞춰 추력
  const fwdSpeed = p.vel.x * -Math.sin(p.yaw) + p.vel.z * -Math.cos(p.yaw);
  const turnK = 0.3 + 0.7 * Math.max(0, Math.cos(d));
  const target = vdes * turnK;
  p.inThrust = clamp((target - fwdSpeed) / Math.max(12, p.maxSpeed * 0.22), -1, 1);
  p.boosting = !!opts.boost && Math.abs(d) < 0.25 && target > p.maxSpeed * 0.95;
  // 4) 고도: 오차에 비례 + 수직 속도 감쇠
  if (climb) wantY = Math.max(wantY, p.pos.y + 50);
  p.inLift = clamp((wantY - p.pos.y) / 30 - p.vel.y / 40, -1, 1);
}
// 거리 d 에서 멈추려면 낼 수 있는 최대 속도 (도착 감속)
function arriveSpeed(p, d, stopAt = 0) { const a = p.accel * 0.75; return Math.min(p.maxSpeed * (p.boosting ? 1.5 : 1), Math.sqrt(Math.max(0, 2 * a * Math.max(0, d - stopAt)))); }
function autopilot(p, dt) {
  // 전투: 무기 사거리에 맞춰 원을 그리며 싸우고, 방어막이 깨지면 물러나 회복
  if (AP.kind === 'fight') {
    const t = AP.target;
    if (!t || !t.alive || !S.hooks.hostile(p, t)) { AP.on = false; if (AP.src === 'agent') agentReset(); return; }
    const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z, dist = Math.hypot(dx, dz) || 1;
    const rng = weaponRange(p), hurt = p.shBroken > 0 || p.hp / p.maxHp < 0.45;
    const stand = hurt ? Math.max(900, rng * 1.4) : clamp(rng * 0.6, 170, 650) * (t.scale > 1.5 ? 1.4 : 1);
    AP.orbit = (AP.orbit || 1) * (Math.random() < dt * 0.08 ? -1 : 1);              // 가끔 도는 방향을 바꿔 조준을 피함
    const ux = dx / dist, uz = dz / dist, tx = -uz * AP.orbit, tz = ux * AP.orbit;   // 접선 방향
    const radial = clamp((dist - stand) / 150, -1, 1);
    const sp = p.maxSpeed * (hurt ? 1 : 0.75);
    let vx = (ux * radial + tx * (1 - Math.abs(radial) * 0.6)) * sp, vz = (uz * radial + tz * (1 - Math.abs(radial) * 0.6)) * sp;
    steerTo(p, dt, vx, vz, t.pos.y + (hurt ? 120 : 35), { boost: hurt || dist > rng * 1.6 });
    if (dist < p.lockRange) p.lock = t;
    if (!hurt && p.lock === t && dist > 220 && dist < 1100 && p.cdM <= 0 && p.lv.missile > 0 && Math.random() < dt * 0.5) fireMissile(p, t);
    return;
  }
  if (AP.kind === 'ore' && AP.node && !AP.node.alive) { AP.on = false; if (AP.src === 'agent') agentReset(); return; }
  const dx = AP.x - p.pos.x, dz = AP.z - p.pos.z, dist = Math.hypot(dx, dz) || 1;
  // 위협 회피: 싸우러 가는 게 아니면 가까운 적에게서 비켜 지나간다
  let fx = 0, fz = 0;
  for (const o of S.ships) { if (!o.alive || !S.hooks.hostile(p, o)) continue; const ox = p.pos.x - o.pos.x, oz = p.pos.z - o.pos.z, od = Math.hypot(ox, oz); if (od < 600) { const k = (600 - od) / 600; fx += ox / od * k; fz += oz / od * k; } }
  const stopAt = AP.kind === 'port' ? 0 : AP.kind === 'ore' ? 8 : 30;
  const v = arriveSpeed(p, dist, stopAt);
  let vx = dx / dist * v + fx * p.maxSpeed * 0.7, vz = dz / dist * v + fz * p.maxSpeed * 0.7;
  if (dist < 25) { vx = dx * 0.6; vz = dz * 0.6; }                                // 마지막엔 살살 맞춘다
  const ground = groundAt(p.pos.x, p.pos.z) + p.hover + 4;
  const wantY = dist > 280 ? Math.max(AP.y + 60, surfaceBelow(p.pos.x, p.pos.y, p.pos.z) + 80 * p.scale) : Math.max(AP.y, ground);
  steerTo(p, dt, vx, vz, wantY, { boost: dist > 1200 && !(fx || fz) });
  if (AP.kind === 'ore' && dist < 45 && AP.node && AP.node.alive) { S.hooks.mine(p, AP.node, dt); mineBeam(p, AP.node); p.mining = true; }
  if (dist < 40 && AP.kind === 'ore' && AP.src === 'user') { AP.on = false; solSay('도착했어요! E를 길게 누르면 채굴돼요.', 'happy'); }
  if (AP.kind === 'patrol' && dist < 70) { AP.on = false; agentReset(); return; }
  if (AP.kind === 'outpost' && AP.src === 'agent' && dist < 90) { p.inThrust = -clamp(p.speed / 15, 0, 0.8); p.inTurn *= 0.3; }
  if (dist < 60 && (AP.kind === 'island' || AP.kind === 'wreck' || AP.kind === 'outpost') && AP.src === 'user') { AP.on = false; solSay('도착했어요.', 'calm'); }
}
function goalFromAgent(g) {
  const p = player; if (!p || !p.alive) return;
  if (g.kind === 'patrol') { const a = rand(0, 6.28), r = rand(500, 1600); const x = clamp(p.pos.x + Math.cos(a) * r, -WORLD * 0.85, WORLD * 0.85), z = clamp(p.pos.z + Math.sin(a) * r, -WORLD * 0.85, WORLD * 0.85); setAP(x, groundAt(x, z) + 220, z, '순찰', 'patrol', 'agent'); return; }
  if (g.kind === 'outpost') { const [o] = nearestOutpost(p.pos, true); if (o) { setAP(o.x, o.deck + 70, o.z, o.nm, 'outpost', 'agent'); } return; }
  if (g.kind === 'ore' && g.node && g.node.alive) { setAP(g.node.x, g.node.y + 30 * p.scale, g.node.z, ORES[g.node.type].nm, 'ore', 'agent'); AP.node = g.node; return; }
  if (g.kind === 'fight') { AP.target = g.target; setAP(g.target.pos.x, g.target.pos.y, g.target.pos.z, g.target.name, 'fight', 'agent'); AP.target = g.target; return; }
  if (g.kind === 'ore') {
    let best = null, bd = 1e9; for (const o of ores) { if (!o.alive) continue; const d = Math.hypot(o.x - p.pos.x, o.z - p.pos.z); if (d < bd) { bd = d; best = o; } }
    if (!best) return; setAP(best.x, best.y + 30 * p.scale, best.z, ORES[best.type].nm, 'ore', 'agent'); AP.node = best; return;
  }
  if (g.kind === 'port') { const [pt] = nearestPort(p.pos); setAP(pt.x, pt.deck + p.hover + 6, pt.z, pt.def.nm, 'port', 'agent'); return; }
  if (g.kind === 'island') { let b = null, bd = 1e9; for (const I of islands) { const d = Math.hypot(I.x - p.pos.x, I.z - p.pos.z); if (d < bd) { bd = d; b = I; } } if (b) setAP(b.x, b.y + 80, b.z, '부유섬', 'island', 'agent'); return; }
  if (g.kind === 'wreck') { let b = null, bd = 1e9; for (const w of WRECKS) { const d = Math.hypot(w.x - p.pos.x, w.z - p.pos.z); if (d < bd) { bd = d; b = w; } } if (b) setAP(b.x, b.y + 60, b.z, '난파선', 'wreck', 'agent'); return; }
}
const oreTotalKg = () => Object.entries(save.storage).reduce((a, [k, n]) => a + n * ORES[k].kg, 0);
function solSnap() {
  const p = player, list = S.ships.filter(s => s.alive && S.hooks.hostile(p, s)).map(s => ({ ship: s, dist: s.pos.distanceTo(p.pos) })).sort((a, b) => a.dist - b.dist);
  const h = list[0] ? { ship: list[0].ship, dist: list[0].dist, name: list[0].ship.name } : null;
  const ch = CHAPTERS[save.story.ch], mission = ch && !save.story.done ? { id: ch.id, need: ch.need, have: save.story.have, nm: ch.nm } : null;
  const a = activeShip(), T = TIERS[a.tier];
  const ownedUnequipped = save.modules.some(id => !a.mods.includes(id)) && a.mods.length < slotCount(a.tier);
  const oreList = ores.filter(o => o.alive).map(o => ({ o, d: Math.hypot(o.x - p.pos.x, o.z - p.pos.z) }));
  let bestOre = null, bestV = -1;
  for (const { o, d } of oreList) { if (d > 2600) continue; const v = ORES[o.type].cr * (o.amount / 100) / (1 + d / 500); if (v > bestV) { bestV = v; bestOre = { node: o, x: o.x, z: o.z, nm: ORES[o.type].nm, rarity: ORES[o.type].rar, value: ORES[o.type].cr, dist: d }; } }
  const portDist = Math.min(...ports.map(pt => Math.hypot(pt.x - p.pos.x, pt.z - p.pos.z)));
  const [ownBase] = nearestOutpost(p.pos, true); const raid = S.ships.some(sh => sh.alive && sh.faction === 'pirate' && sh.ai && sh.ai.target && sh.ai.target.isUnit && sh.ai.target.build !== undefined);
  return { alive: p.alive, mode, hpPct: p.hp / p.maxHp, bestOre, portDist, ownBase: ownBase && !ownBase.ruined ? ownBase : null, raid, form: p.form, canMorph: p.canMorph, shieldPct: p.shBroken > 0 ? 0 : p.shield / Math.max(1, p.maxShield), shBroken: p.shBroken > 0,
    cargoPct: p.cargoKg / Math.max(1, p.cargoCap), cargoKg: p.cargoKg, storageKg: oreTotalKg(), incomingMissile: incoming(p), flareReady: p.flareCd <= 0,
    hostile: h ? Object.assign(h, { hpPct: h.ship.hp / h.ship.maxHp, shieldPct: h.ship.shBroken > 0 ? 0 : h.ship.shield / Math.max(1, h.ship.maxShield), tier: TIERS[h.ship.tier].tier }) : null, boss: EV.boss && EV.boss.alive ? EV.boss : null, mission, missionKill: !!mission && mission.id === 'kill', ownedUnequipped, credits: save.credits };
}
function brief() {
  const s = solSnap(), m = s.mission ? `임무: ${s.mission.nm}(${Math.floor(s.mission.have)}/${s.mission.need})` : '임무 없음';
  return `선체 ${Math.round(s.hpPct * 100)}%, 방어막 ${Math.round(s.shieldPct * 100)}%, 화물 ${Math.round(s.cargoPct * 100)}%, ${m}, 권한 ${solCfg().perm}단계, 소지 ${fmt(save.credits)}C` + (s.hostile ? `, 가장 가까운 적 ${s.hostile.name} ${Math.round(s.hostile.dist)}m` : '');
}
function sellAll() {
  if (mode !== 'hangar' || !dockPort) return '시장은 포트에서만 열려요.';
  let total = 0, n = 0;
  for (const k in ORES) { const c = save.storage[k] || 0; if (c) { total += c * priceOf(k, dockPort.def); n += c; save.storage[k] = 0; } }
  if (!n) return '팔 광석이 없어요.';
  save.credits += total; story('sell', 1); persist(); refreshPort(); sfx('coin');
  return `광석 ${n}개를 ${fmt(total)} C에 팔았어요.`;
}
function equipBest(silent) {
  const a = activeShip(), T = TIERS[a.tier]; let n = 0;
  for (const id of save.modules) { if (a.mods.length >= slotCount(a.tier)) break; if (!a.mods.includes(id)) { a.mods.push(id); n++; } }
  if (n) { story('module', 1); persist(); refreshPort(); }
  if (silent) return n;
  return n ? `모듈 ${n}개를 장착했어요.` : '장착할 모듈이 없어요. 모듈 탭에서 먼저 사 주세요.';
}
const BUY_ORDER = ['shield1', 'turbo', 'reactive', 'recharge', 'thruster', 'aimcomp', 'loader', 'shield2', 'rack', 'compress', 'drone', 'nanobot', 'stabil', 'scanner', 'flares', 'magnet', 'accel', 'shield3'];
function buyBest() {
  const reserve = 0.5;
  for (const id of BUY_ORDER) { const m = MODULES[id]; if (!save.modules.includes(id) && save.credits >= m.cost / reserve) { save.credits -= m.cost; save.modules.push(id); persist(); equipBest(true); refreshPort(); sfx('coin'); solEvent('autoBuy', 1, 2); return true; } }
  const r = rankOf(save.xp);
  for (const t of TIERS) { if (ownsTier(t.id) || t.rank > r) continue; if (t.tier > 0 && !ownsLevel(t.tier - 1)) continue; if (save.credits >= t.cost * 1.3) { save.credits -= t.cost; buyTier(t.id); persist(); setHangarShip(t.id, save.paint); refreshPort(); sfx('coin'); if (t.tier >= 1) story('ship', 1); return true; } }
  return false;
}
const solCtx = {
  mode: () => mode, brief,
  evade() { if (player && player.alive) { player.evadeT = 1.4; } },
  cancelAuto() { AP.on = false; },
  goal(g) { goalFromAgent(g); },
  autoPort() { if (mode !== 'fly' || !player.alive) return null; const [pt] = nearestPort(player.pos); setAP(pt.x, pt.deck + player.hover + 6, pt.z, pt.def.nm, 'port'); return pt.def.nm; },
  autoOre(type) {
    if (mode !== 'fly' || !player.alive) return '비행 중일 때 안내할 수 있어요.';
    let best = null, bd = 1e9; for (const o of ores) { if (!o.alive || (type && o.type !== type)) continue; const d = Math.hypot(o.x - player.pos.x, o.z - player.pos.z); if (d < bd) { bd = d; best = o; } }
    if (!best) return null; setAP(best.x, best.y + 30 * player.scale, best.z, ORES[best.type].nm, 'ore'); AP.node = best;
    return `${ORES[best.type].nm} 광맥(${ORES[best.type].rar}, 남은 ${best.amount})까지 ${Math.round(bd)}m. 자동 비행 시작!${best.island ? ' 부유섬 위에 있어요.' : ''}`;
  },
  gotoIsland() { if (mode !== 'fly') return null; goalFromAgent({ kind: 'island' }); return AP.on ? '가장 가까운 부유섬으로 안내할게요.' : null; },
  gotoOutpost() { if (mode !== 'fly') return null; const [o] = nearestOutpost(player.pos, true), [st] = nearestOutpost(player.pos, false); const t = o || st; if (!t) return null; setAP(t.x, (t.deck || t.ground) + 60, t.z, t.nm, 'outpost'); return `${t.nm}${o ? '' : ' 부지'}로 안내할게요.`; },
  gotoWreck() { if (mode !== 'fly') return null; goalFromAgent({ kind: 'wreck' }); return AP.on ? '난파선 묘지로 안내할게요.' : null; },
  fightBoss() { const b = EV.boss; if (!b || !b.alive) return null; goalFromAgent({ kind: 'fight', target: b }); return '고르곤에게 향합니다. 방어막을 잘 살피세요!'; },
  flare() { return mode === 'fly' && player.alive && dropFlares(player); },
  ult() { if (mode !== 'fly' || !player.alive) return '비행 중에만 쓸 수 있어요.'; if (!player.elems || !player.elems.length) return '원소 코어가 필요해요.'; if (!ultReady(player)) return `아직 충전 중이에요 (${Math.floor(player.ult || 0)}%).`; castUlt(player); return '궁극기 발동!'; },
  sellAll, equipBest, buyBest,
  launch() { if (mode === 'hangar') launch(); },
  bossInfo() { const b = EV.boss; if (b && b.alive) return `고르곤은 ${Math.round(b.pos.distanceTo(player.pos))}m 떨어져 있어요. 체력 ${Math.round(b.hp / b.maxHp * 100)}%, 남은 시간 ${Math.floor(EV.life / 60)}분.`; return `지금은 고르곤 신호가 없어요. 약 ${Math.max(1, Math.round(EV.timer / 60))}분 뒤 나타날 것 같아요.`; },
  priceInfo() { return Object.keys(ORES).map(k => { let bp = null, bv = 0; for (const p of ports) { const v = priceOf(k, p.def); if (v > bv) { bv = v; bp = p; } } return `${ORES[k].nm} ${bv}C(${bp.def.nm})`; }).join(' · ') + ' — 가장 비싸게 사는 곳이에요.'; },
  status() { const p = player, s = solSnap(); const sh = p.shBroken > 0 ? `방어막 붕괴, ${Math.ceil(p.shBroken)}초 후 복구` : `방어막 ${Math.round(s.shieldPct * 100)}%`; return `선체 ${Math.round(s.hpPct * 100)}%, ${sh}, 화물 ${fmt(p.cargoKg)}/${fmt(p.cargoCap)}kg, 부스트 에너지 ${Math.round(p.energy)}%. ${s.hpPct < 0.4 ? '수리가 필요해요!' : '양호해요.'}`; },
  threatInfo() { const s = solSnap(); if (!s.hostile) return '주변에 적대 함선이 없어요.'; const near = S.ships.filter(x => x.alive && S.hooks.hostile(player, x) && x.pos.distanceTo(player.pos) < 1000).length; return `가장 가까운 적은 ${s.hostile.name}, ${Math.round(s.hostile.dist)}m. 1km 안에 적 ${near}척.`; },
  missionInfo() { const st = save.story, ch = CHAPTERS[st.ch]; return ch && !st.done ? `${ch.nm}: ${ch.goal}. ${ch.solare}` : '모든 이야기를 끝냈어요! 이제 하늘은 캡틴 거예요.'; },
  adviceInfo() { const a = activeShip(), T = TIERS[a.tier]; if (a.mods.length < slotCount(a.tier)) return `모듈 슬롯이 ${slotCount(a.tier) - a.mods.length}칸 비어 있어요. 방어막 발생기나 터보 차저를 추천해요.`; if ((a.lv.guns || 0) < 3) return '포탑 업그레이드를 먼저 올리면 전투가 훨씬 편해져요.'; return '다음 등급 함선을 노려 볼까요? 조선소를 확인해 보세요.'; },
  onChat(on) { if (on && document.pointerLockElement) document.exitPointerLock(); },
};
initSolare(solCtx);
// 설정 값 표시
$('solPerm').textContent = `권한 ${permName()}`;
// 속도선 (카메라에 붙은 선분)
const SPD = (() => {
  const N = 90, pos = new Float32Array(N * 6), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  m.frustumCulled = false; camera.add(m); scene.add(camera);
  const P = Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0 })), reset = (q, far) => { const a = rand(0, 6.28), r = rand(7, 26); q.x = Math.cos(a) * r; q.y = Math.sin(a) * r * 0.7; q.z = far ? -rand(20, 160) : -160; };
  P.forEach(q => reset(q, true));
  return { m, pos, P, reset, g };
})();
function updateSpeedLines(dt) {
  const p = player, k = p.alive ? clamp((p.speed / p.maxSpeed - 0.55) * 2.2, 0, 1) + (p.boostOn ? 0.6 : 0) : 0;
  SPD.m.material.opacity = Math.min(0.55, k * 0.4); SPD.m.visible = k > 0.02;
  if (!SPD.m.visible) return;
  const v = p.speed * (p.boostOn ? 2.4 : 1.6), len = 4 + k * 10;
  SPD.P.forEach((q, i) => { q.z += v * dt; if (q.z > -4) SPD.reset(q); SPD.pos.set([q.x, q.y, q.z, q.x, q.y, q.z - len], i * 6); });
  SPD.g.attributes.position.needsUpdate = true;
}
// 난파선 모델
function buildWrecks() {
  for (const w of WRECKS) {
    const m = makeShipModel(pick([6, 8, 4, 7]), 'night', 'pirate', w.scale / TIERS[6].scale);
    m.root.traverse(o => { if (o.isMesh && o.material && o.material.toneMapped === false) o.visible = false; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    m.turrets.forEach(t => { t.rotation.y = rand(-2, 2); t.userData.gun.rotation.x = rand(-0.4, 0.2); });
    m.root.position.set(w.x, w.y - 4 * w.scale, w.z); m.root.rotation.set(w.pitch, w.yaw, w.roll, 'YXZ'); scene.add(m.root);
  }
}
// 방어막 이벤트 처리
function shieldEvents(s) {
  while (s.events.length) {
    const e = s.events.shift(); if (e === 'morph') { morphFx(s); continue; } shieldFx(s, e);
    if (s.isPlayer) { if (e === 'break') { solEvent('shieldBreak', 3, 10); toast('⚠ 방어막 붕괴!'); } else solEvent('shieldRestore', 1, 10); }
  }
}


/* 자율 모드일 때 솔라레가 전차 ⇄ 비행선 변형을 스스로 판단: 싸울 땐 전차(단단함), 이동할 땐 비행선(빠름) */
let formT = 0;
function autoForm(dt) {
  formT -= dt; if (formT > 0 || !player.alive || !player.canMorph || !AP.on || AP.src !== 'agent') return; formT = 1.2;
  const fighting = AP.kind === 'fight' || (AP.kind === 'outpost' && S.ships.some(sh => sh.alive && sh.faction === 'pirate' && sh.pos.distanceTo(player.pos) < 700));
  const low = player.hp / player.maxHp < 0.45 || player.shBroken > 0;
  const nearGround = player.pos.y - groundAt(player.pos.x, player.pos.z) < player.hover * 3.5 + 40;
  const tgtLow = AP.target ? AP.target.pos.y - groundAt(AP.target.pos.x, AP.target.pos.z) < 170 : true;
  const defending = AP.kind === 'outpost' && fighting;
  const want = (fighting && !low && (defending || (nearGround && tgtLow))) ? 'tank' : 'ship';
  if (want !== player.form && player.setForm(want === 'ship' ? 'base' : want)) solSay(want === 'tank' ? '전차 모드로 전환할게요! 단단하게 버텨요.' : '비행선 모드로 돌아와요.', 'calm', 0);
}
/* ================= 전초기지 연결 ================= */
let nearBase = null;
function baseAction() {
  if (mode !== 'fly' || !player.alive || !nearBase) return;
  if (nearBase.units) { if (basePanelOpen()) closeBasePanel(); else { if (document.pointerLockElement) document.exitPointerLock(); openBasePanel(nearBase); } return; }
  const r = buildOutpost(nearBase.id);
  if (r === 'money') toast(`크레딧이 부족해요 (${fmt(outpostCost(outposts.length))} C 필요)`);
  else if (r && r !== 'no') { toast(`🏗️ <b>${r.nm}</b> 건설 시작! 8초 뒤 완공됩니다`); solSay('전초기지 건설을 시작했어요! 완공되면 B로 유닛을 생산할 수 있어요.', 'happy', 2); sfx('coin'); }
}
$('bpClose').onclick = () => closeBasePanel();
opHooks.toast = m => toast(m);
opHooks.onChange = () => { if (basePanelOpen()) renderBasePanel(); };
opHooks.unitKill = (u, t) => { if (t.faction !== 'pirate') return; const lv = TIERS[t.tier].tier, b = Math.round(45 * (lv + 1)); save.credits += b; gainXp(5 * (lv + 1)); questProgress('kill', 1); story('kill', 1); persist(); };
opHooks.reactText = (pos, nm, col) => { sfx('react'); const el = document.createElement('div'); el.className = 'dn react'; el.style.color = col; el.textContent = nm; $('dmgn').appendChild(el); dnums.push({ t: null, pos: pos.clone().add(tmp2.set(0, 18, 0)), amt: 0, age: 0, el, label: nm }); };
opHooks.haul = (u, load) => { if (Math.random() < 0.35) toast(`🚚 화물 트럭이 ${ORES[load.type].nm} ${load.n}개를 창고에 보관했어요`); };
opHooks.spawnRaid = o => {
  if (mode !== 'fly') return;
  const n = 2 + o.lv;
  for (let i = 0; i < n; i++) {
    const lvl = clamp(Math.floor(rand(0, 1.99) + o.lv - 1), 0, 3), cls = pick(TIERS.filter(t => t.tier === lvl)).id;
    const e = new Ship({ name: `습격대 ${i + 1}`, faction: 'pirate', tier: cls, paint: 'crimson', lv: rollLv(cls), weapon: pick(['cannon', 'flak', 'rail']) });
    e.temp = true; e.ai.skill = rand(0.7, 1); scene.add(e.mesh); S.ships.push(e);
    const a = rand(0, 6.28); e.spawnAt(o.x + Math.cos(a) * 900, o.deck + rand(120, 220), o.z + Math.sin(a) * 900, a);
    e.ai.attacker = o; e.ai.attackT = 120; e.ai.target = o;
  }
  sfx('siren'); banner('RAID', `⚠ ${o.nm}에 해적 습격대 ${n}척 접근!`, 4); solSay(`${o.nm}가 습격받고 있어요! 방어 유닛이 막는 동안 지원해 주세요.`, 'alert', 3);
};

/* ================= 날씨 · 이벤트 · 부가 HUD ================= */
function applyWind(s, dt) { if (WEATHER.storm > 0.05) s.vel.addScaledVector(WEATHER.wind, 9 * WEATHER.storm * dt); }
WEATHER.onChange = on => { if (mode === 'fly') banner(on ? 'SANDSTORM' : 'CLEAR SKIES', on ? '모래폭풍 접근 — 시야와 레이더가 줄고 바람에 밀립니다' : '모래폭풍이 지나갔습니다', 3.5); };

const EV = { timer: 150, boss: null, playerDmg: 0, life: 0 };
function spawnBoss() {
  let x = 0, z = 0;
  for (let k = 0; k < 80; k++) {
    x = rand(-WORLD * 0.75, WORLD * 0.75); z = rand(-WORLD * 0.75, WORLD * 0.75);
    if (ports.every(p => Math.hypot(p.x - x, p.z - z) > 950) && Math.hypot(player.pos.x - x, player.pos.z - z) > 800) break;
  }
  const boss = new Ship({ name: '해적 기함 「고르곤」', faction: 'pirate', tier: 6, paint: 'night', lv: { guns: 4, missile: 4, armor: 5, engine: 0, cargo: 0, drill: 0 }, weapon: 'cannon', scaleMul: 1.9, hpMul: 2.5 });
  boss.isBoss = true; boss.temp = true; boss.ai.skill = 0.9; scene.add(boss.mesh); S.ships.push(boss);
  boss.spawnAt(x, groundAt(x, z) + 280, z, rand(-3, 3));
  for (let i = 0; i < 3; i++) {
    const t = pick(TIERS.filter(c => c.tier === Math.floor(rand(1, 2.99)))).id;
    const e = new Ship({ name: `고르곤 호위함 ${i + 1}`, faction: 'pirate', tier: t, paint: 'night', lv: rollLv(t), weapon: pick(['cannon', 'flak', 'rail']) });
    e.temp = true; e.ai.skill = rand(0.7, 1); scene.add(e.mesh); S.ships.push(e);
    e.spawnAt(x + rand(-150, 150), groundAt(x, z) + rand(200, 320), z + rand(-150, 150), rand(-3, 3));
  }
  EV.boss = boss; EV.playerDmg = 0; EV.life = 480;
  solEvent('boss', 2, 1);
  banner('EVENT', '해적 기함 「고르곤」 출현! 격추에 기여하면 큰 보상을 받습니다', 4.5);
  toast('⚑ 이벤트 · 지금 진행 중 — 레이더의 큰 빨간 점을 찾으세요'); sfx('ui');
}
function removeShip(s) { scene.remove(s.mesh); const i = S.ships.indexOf(s); if (i >= 0) S.ships.splice(i, 1); if (player.lock === s) player.lock = null; }
function bossDown(t, by) {
  explode(t.pos, 140); explode(tmp.copy(t.pos).add(tmp2.set(30, 10, 0)), 90); spawnDebris(t.pos, 2); spawnDebris(t.pos, 1.5);
  dropCrate(tmp.copy(t.pos), 900, { aether: 5, gold: 8, silver: 10 });
  if (EV.playerDmg > 0) {
    story('boss', 1); solEvent('bossDown', 2, 1);
    const share = clamp(EV.playerDmg / t.maxHp, 0.1, 1), cr = Math.round(1200 + 2800 * share), xp = Math.round(60 + 140 * share);
    save.credits += cr; gainXp(xp); save.stats.bosses = (save.stats.bosses || 0) + 1; persist();
    banner('EVENT CLEAR', `기함 격추! 기여도 ${Math.round(share * 100)}% · +${fmt(cr)} CR · 평판 +${xp}`, 5);
  } else banner('EVENT OVER', `${by ? by.name : '누군가'}가 해적 기함을 격추했습니다`, 4);
  EV.boss = null; EV.timer = rand(360, 480);
}
function updateEvent(dt) {
  for (const s of S.ships) if (s.temp && !s.alive && (s.respawn -= dt) < 0) { removeShip(s); break; }
  if (!EV.boss) { EV.timer -= dt; if (EV.timer <= 0 && player.alive) spawnBoss(); return; }
  EV.life -= dt;
  if (EV.life <= 0 && EV.boss.alive) { for (const s of [...S.ships]) if (s.temp) removeShip(s); EV.boss = null; EV.timer = rand(360, 480); toast('해적 기함이 전장을 떠났습니다'); }
}
const dnums = [];
function dmgNum(t, amt, at, shielded) {
  const last = dnums.find(d => d.t === t && d.age < 0.25);
  if (last) { last.amt += amt; last.age = Math.min(last.age, 0.05); return; }
  const el = document.createElement('div'); el.className = 'dn'; $('dmgn').appendChild(el);
  dnums.push({ t, pos: (at || t.pos).clone().add(tmp2.set(rand(-4, 4), rand(4, 10), rand(-4, 4))), amt, age: 0, el, big: player.weapon === 'rail' }); if (shielded) el.classList.add('sh');
}
let boardT = 0;
function hudExtras(dt) {
  const p = player;
  $('enFill').style.width = p.energy + '%'; $('enFill').classList.toggle('on', !!p.boostOn);
  $('flareT').textContent = p.flareCd > 0 ? `플레어 ${Math.ceil(p.flareCd)}s` : '플레어 준비';
  const inc = p.alive ? incoming(p) : 0;
  $('mwarn').style.display = inc && inc < 1300 ? 'block' : 'none'; if (inc) $('mwarn').textContent = `⚠ 미사일 접근 ${Math.round(inc)}M · ${isTouch ? '플레어 버튼' : 'C'}로 회피`;
  const b = EV.boss;
  if (b && b.alive) { $('evbar').style.display = 'block'; $('evHp').style.width = (b.hp / b.maxHp * 100) + '%'; $('evInfo').textContent = `${Math.round(b.pos.distanceTo(p.pos))} M · 남은 시간 ${Math.floor(EV.life / 60)}:${String(Math.floor(EV.life % 60)).padStart(2, '0')}${EV.playerDmg ? ` · 내 기여 ${Math.round(EV.playerDmg / b.maxHp * 100)}%` : ''}`; }
  else $('evbar').style.display = 'none';
  for (let i = dnums.length - 1; i >= 0; i--) {
    const d = dnums[i]; d.age += dt;
    if (d.age > 1) { d.el.remove(); dnums.splice(i, 1); continue; }
    tmp.copy(d.pos).project(camera);
    if (tmp.z > 1) { d.el.style.display = 'none'; continue; }
    d.el.style.display = 'block'; d.el.textContent = d.label || Math.round(d.amt); d.el.classList.toggle('big', d.big || d.amt > 20);
    d.el.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px'; d.el.style.top = ((1 - tmp.y) / 2 * innerHeight - d.age * 50) + 'px'; d.el.style.opacity = 1 - d.age * d.age;
  }
  if ($('board').classList.contains('on') && (boardT -= dt) <= 0) {
    boardT = 0.5;
    const rows = [...S.ships].sort((a, c) => c.kills - a.kills).map((s, i) => `<tr class="${s.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td style="color:${FC[s.faction]}">${s.isBoss ? '☠ ' : ''}${s.name}</td><td>${TIERS[s.tier].t}</td><td>${s.faction === 'pirate' ? '해적' : s.isPlayer ? '나' : s.pvp ? '캡틴 · PvP' : '캡틴'}</td><td>${s.alive ? '' : '격추됨'}</td><td><b>${s.kills}</b></td></tr>`).join('');
    $('boardB').innerHTML = `<table><tr><th>#</th><th>이름</th><th>등급</th><th>소속</th><th></th><th>격추</th></tr>${rows}</table>`;
  }
}

/* ================= 메인 루프 ================= */
const SUBSTEPS = clamp(+new URLSearchParams(location.search).get('ts') || 1, 1, 10);   // 테스트용 시뮬레이션 가속
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (mode === 'loading') { tickLoading(); return; }
  tickSolare(dt);
  if (mode === 'intro') { updateWorld(dt, camera.position); updateIntroCam(dt); render(scene, camera, dt); return; }
  blinkNav(now / 1000);
  if (mode === 'bridge') { engineSound(0, false, false); FXS.rays = 0; FXS.boost = 0; FXS.night = 0.2; FXS.vig = 0.4; FXS.sat = 1.1; if (player) agentUpdate(dt, solSnap()); updateBridge(dt); render(bscene, bcam, dt); return; }
  if (mode === 'hangar') { FXS.rays = 0; FXS.boost = 0; FXS.night = 0.3; FXS.vig = 0.45; FXS.sat = 1.12; engineSound(0, false, false); if (player) agentUpdate(dt, solSnap()); updateHangar(dt); render(hscene, hcam, dt); return; }
  // fly / dead
  mineSoundT -= dt; priceT -= dt; if (priceT <= 0) { driftPrices(); priceT = 60; }
  if (!$('mapOv').classList.contains('on')) for (let step = 0; step < SUBSTEPS; step++) {
    updatePlayer(dt);
    for (const s of S.ships) {
      if (s.events.length) shieldEvents(s);
      if (s.isPlayer) { if (s.alive) shipFx(s, dt); continue; }
      if (!s.alive) { if (s.temp) continue; s.respawn -= dt; if (s.respawn <= 0) { s.lv = rollLv(s.tier); s.stats(); spawnAI(s); } continue; }
      s.boosting = false; runAI(s, dt); s.boosting = s.boosting || s.ai.mode === 'return' || (s.ai.target && s.ai.target.pos.distanceTo(s.pos) > 900);
      if (s.flareCd <= 0) { const inc = incoming(s); if (inc && inc < 350 && Math.random() < 0.5) dropFlares(s); }
      applyWind(s, dt); s.physics(dt, onImpact); shipFx(s, dt);
    }
    // 겹침 방지
    const sh = S.ships;
    for (let i = 0; i < sh.length; i++) for (let j = i + 1; j < sh.length; j++) {
      const a = sh[i], b = sh[j]; if (!a.alive || !b.alive) continue;
      tmp.copy(a.pos).sub(b.pos); const d = tmp.length(), m = (a.radius + b.radius) * 0.75;
      if (d < m && d > 0.01) { tmp.multiplyScalar((m - d) / d * 0.5); a.pos.add(tmp); b.pos.sub(tmp); }
    }
    updateBullets(dt); updateMissiles(dt); updateDebris(dt); updateCrates(dt); updateFlares(dt); updateEvent(dt); updateOutposts(dt, player, mode === 'fly'); updateUlt(dt); updateShock(dt);
  }
  engineSound(player.alive ? clamp(player.speed / player.maxSpeed, 0, 1.4) : 0, player.boostOn, mode === 'fly' && player.alive);
  updateWorld(dt, player.pos);
  if (player.alive) updateCamera(dt); else { camera.lookAt(player.pos); }
  updateSpeedLines(dt);
  FXS.vig = 0.32 + (player.alive ? 0 : 0.25); FXS.boost = Math.max(FXS.ultB || 0, player.alive ? (player.boostOn ? 1 : clamp((player.speed / player.maxSpeed - 0.85) * 3, 0, 0.35)) : 0);
  setShipNight(DAY.night); if (player.headlight) player.headlight.intensity = player.alive ? DAY.night * 2600 : 0;
  if (player) agentUpdate(dt, solSnap());
  autoForm(dt);
  if (AP.on && AP.src === 'agent' && player.alive && ultReady(player) && !isCasting()) { const near = S.ships.filter(o => o.alive && o !== player && S.hooks.hostile(player, o) && o.pos.distanceTo(player.pos) < 520); if (near.length >= 2 || near.some(o => o.isBoss)) { castUlt(player); solSay('궁극기 발동! 모두 날려 버릴게요!', 'happy', 2); } }
  hudFrame(dt);
  render(scene, camera, dt);
}
requestAnimationFrame(frame);
boot().catch(e => { console.error(e); $('ldPhase').textContent = '오류: ' + e.message; });

window.__sf = { __tp: __teleport, __bs: __state, S, applyElement: (...a) => S.hooks.elemHit(...a), solSnap, outposts, get save() { return save; }, EV, WEATHER, AP, story, solCtx, get mode() { return mode; }, get player() { return player; }, ports, ores, launch: () => launch(), enterHangar: p => enterHangar(p || homePort()), key, inp, DAY, cam };

/* 모든 X(닫기) 버튼: 클릭을 가로채서 확실히 닫는다 */
document.addEventListener('click', e => {
  const x = e.target.closest && e.target.closest('.x'); if (!x) return;
  e.preventDefault(); e.stopPropagation();
  if (x.id === 'ppx') { $('ppanel').hidden = true; document.querySelectorAll('#ptabs button').forEach(b => b.classList.remove('on')); }
  else if (x.id === 'mapX') $('mapOv').classList.remove('on');
  else if (x.id === 'bpClose') closeBasePanel();
  else if (x.id === 'stX') $('strategyPanel').classList.remove('on');
  else if (x.id === 'ccX') $('crewCard').classList.remove('on');
  else { const p = x.closest('.panel,.card,.ov,#basePanel'); if (p) p.classList.remove('on'), p.hidden = true; }
}, true);
