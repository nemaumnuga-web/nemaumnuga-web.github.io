// 선내 지휘본부: 내 아바타가 걸어 다니고, 선원과 대화하고, 솔라레 홀로그램과 전략 테이블에서 작전을 짠다
import { THREE, $, rand, pick, clamp, lerp, wrap, fmt, put, finish, box, cyl, HPI, addProto, canvasTex, Q, sfx, COL, Particles, TEX_SOFT } from './core.js';
import { CREW, crewLevel, crewUpCost, STRATEGIES, save, persist, TIERS, activeShip, ORES, MODULES } from './data.js';

export const bscene = new THREE.Scene();
bscene.background = new THREE.Color(0x070d12);
bscene.fog = new THREE.Fog(0x070d12, 40, 110);
export const bcam = new THREE.PerspectiveCamera(58, 1, 0.1, 200);
export const bhooks = { toast: null, setStrategy: null, status: null, onExit: null, say: null };

const ROOM = { w: 26, d: 40, h: 9.5 };
const M = {
  floor: null,
  wall: new THREE.MeshStandardMaterial({ color: 0x1b252c, roughness: 0.55, metalness: 0.65 }),
  panel: new THREE.MeshStandardMaterial({ color: 0x2c3a44, roughness: 0.4, metalness: 0.7 }),
  white: new THREE.MeshStandardMaterial({ color: 0xdfe7ea, roughness: 0.35, metalness: 0.4 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x14191d, roughness: 0.5, metalness: 0.8 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x0b1820, emissive: 0x2ad4ff, emissiveIntensity: 0.9, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.55 }),
  neon: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3.6, 4.0), toneMapped: false }),
  amber: new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 2.2, 0.5), toneMapped: false }),
  holo: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 3.2, 3.6), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
};
const state = { avatar: null, crew: [], solare: null, table: null, sky: null, near: null, keys: {}, yaw: Math.PI, camMode: 'third', talk: null, built: false, t: 0, hint: '', mapDots: [], parts: null, screens: [] };
const TABLE = new THREE.Vector3(0, 0, 3), SOL = new THREE.Vector3(0, 0, -9), WINDOW_Z = -ROOM.d / 2;

/* ---------- 사람 모델 (저폴리 우주복) ---------- */
function makePerson(col, opts = {}) {
  const g = new THREE.Group(), suit = new THREE.MeshStandardMaterial({ color: opts.suit || 0x2a3640, roughness: 0.55, metalness: 0.3 }), acc = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.2, emissive: col, emissiveIntensity: 0.35 });
  const skin = new THREE.MeshStandardMaterial({ color: opts.skin || 0xe0b898, roughness: 0.7 }), hair = new THREE.MeshStandardMaterial({ color: opts.hair || 0x2a1d14, roughness: 0.8 });
  const mk = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const legL = new THREE.Group(), legR = new THREE.Group(), armL = new THREE.Group(), armR = new THREE.Group();
  legL.position.set(-0.28, 1.0, 0); legR.position.set(0.28, 1.0, 0); armL.position.set(-0.62, 2.0, 0); armR.position.set(0.62, 2.0, 0);
  for (const l of [legL, legR]) { mk(new THREE.BoxGeometry(0.38, 1.0, 0.4), suit, 0, -0.5, 0, l); mk(new THREE.BoxGeometry(0.42, 0.2, 0.6), acc, 0, -1.05, 0.08, l); g.add(l); }
  for (const a of [armL, armR]) { mk(new THREE.BoxGeometry(0.28, 0.95, 0.3), suit, 0, -0.45, 0, a); mk(new THREE.SphereGeometry(0.18, 8, 6), skin, 0, -1.0, 0, a); mk(new THREE.BoxGeometry(0.34, 0.14, 0.34), acc, 0, -0.1, 0, a); g.add(a); }
  mk(new THREE.BoxGeometry(0.95, 1.1, 0.55), suit, 0, 1.55, 0); mk(new THREE.BoxGeometry(0.98, 0.18, 0.58), acc, 0, 1.12, 0); mk(new THREE.BoxGeometry(0.5, 0.5, 0.14), acc, 0, 1.65, 0.3);
  mk(new THREE.BoxGeometry(0.22, 0.2, 0.22), skin, 0, 2.18, 0);
  const head = new THREE.Group(); head.position.y = 2.55; g.add(head);
  mk(new THREE.SphereGeometry(0.34, 14, 10), skin, 0, 0, 0, head);
  const cap = mk(new THREE.SphereGeometry(0.37, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), opts.cap ? acc : hair, 0, 0.04, -0.02, head);
  if (opts.cap) mk(new THREE.BoxGeometry(0.5, 0.06, 0.34), acc, 0, 0.0, 0.34, head);
  mk(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }), -0.12, 0.02, 0.32, head); mk(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }), 0.12, 0.02, 0.32, head);
  g.userData = { legL, legR, armL, armR, head, cap };
  g.scale.setScalar(opts.scale || 1);
  return g;
}
function nameTag(text, col) {
  const t = canvasTex(256, 64, (x, W, H) => { x.clearRect(0, 0, W, H); x.fillStyle = 'rgba(6,14,18,.8)'; x.fillRect(0, 8, W, 48); x.strokeStyle = '#' + col.toString(16).padStart(6, '0'); x.lineWidth = 3; x.strokeRect(2, 10, W - 4, 44); x.fillStyle = '#fff'; x.font = 'bold 26px Pretendard, sans-serif'; x.textAlign = 'center'; x.fillText(text, W / 2, 42); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false })); s.scale.set(3, 0.75, 1); s.position.y = 3.6; s.renderOrder = 30; return s;
}

/* ---------- 방 ---------- */
function floorTex() {
  return canvasTex(512, 512, (x, W) => {
    x.fillStyle = '#10171c'; x.fillRect(0, 0, W, W);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = `hsl(205,14%,${rand(11, 17)}%)`; x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60); }
    x.strokeStyle = 'rgba(80,220,240,.5)'; x.lineWidth = 3; for (let i = 0; i <= W; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, W); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(W, i); x.stroke(); }
    x.fillStyle = 'rgba(255,200,80,.7)'; for (let k = 0; k < 8; k++) x.fillRect(32 + k * 60, 4, 30, 5);
  });
}
function starTex() {
  return canvasTex(1024, 512, (x, W, H) => {
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#4a89c9'); g.addColorStop(0.55, '#a9c8ea'); g.addColorStop(1, '#f0c79a'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 18; i++) { x.fillStyle = `rgba(255,255,255,${rand(0.15, 0.5)})`; x.beginPath(); x.ellipse(rand(0, W), rand(30, 320), rand(60, 160), rand(8, 26), 0, 0, 7); x.fill(); }
    x.fillStyle = '#b8643a'; x.beginPath(); x.moveTo(0, H); for (let i = 0; i <= 32; i++) x.lineTo(i * 32, 390 - Math.sin(i * 0.7) * 24 - rand(0, 30)); x.lineTo(W, H); x.fill();
  });
}
function build() {
  const B = {}, W = ROOM.w, D = ROOM.d, H = ROOM.h;
  M.floor = new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.4, metalness: 0.5 }); M.floor.map.wrapS = M.floor.map.wrapT = THREE.RepeatWrapping; M.floor.map.repeat.set(4, 6);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.floor); fl.rotation.x = -HPI; fl.receiveShadow = true; bscene.add(fl);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.dark); ceil.rotation.x = HPI; ceil.position.y = H; bscene.add(ceil);
  // 벽: 좌우 + 뒤. 앞은 대형 전망창
  for (const s of [-1, 1]) { put(B, 'wall', box(0.6, H, D), s * W / 2, H / 2, 0); put(B, 'neon', box(0.2, 0.2, D - 2), s * (W / 2 - 0.35), 1.2, 0); put(B, 'neon', box(0.2, 0.2, D - 2), s * (W / 2 - 0.35), H - 0.8, 0);
    for (let k = -3; k <= 3; k++) put(B, 'panel', box(0.3, 4.2, 4.2), s * (W / 2 - 0.5), 3.6, k * 5.4); }
  put(B, 'wall', box(W, H, 0.6), 0, H / 2, D / 2);
  // 전망창 프레임 + 유리 (바깥 하늘 텍스처)
  put(B, 'panel', box(W, 1.6, 0.8), 0, 0.8, WINDOW_Z); put(B, 'panel', box(W, 1.6, 0.8), 0, H - 0.8, WINDOW_Z);
  for (let k = -3; k <= 3; k++) put(B, 'panel', box(0.6, H, 0.8), k * (W / 6.2), H / 2, WINDOW_Z);
  put(B, 'neon', box(W, 0.18, 0.2), 0, 1.7, WINDOW_Z + 0.5); put(B, 'amber', box(W, 0.12, 0.2), 0, H - 1.7, WINDOW_Z + 0.5);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(W * 3, H * 3), new THREE.MeshBasicMaterial({ map: starTex(), toneMapped: false, fog: false })); sky.position.set(0, H / 2, WINDOW_Z - 30); bscene.add(sky); state.sky = sky;
  // 천장 조명 띠
  for (let k = -2; k <= 2; k++) { put(B, 'neon', box(W - 4, 0.2, 0.3), 0, H - 0.25, k * 7.5); }
  // 선장석
  put(B, 'dark', cyl(1.6, 1.8, 0.5, 14), 0, 0.25, -3.6); put(B, 'white', box(2.4, 0.9, 2), 0, 1.1, -3.6); put(B, 'dark', box(2.4, 1.8, 0.5), 0, 2.2, -4.5); put(B, 'neon', box(2, 0.1, 0.1), 0, 3.1, -4.2);
  for (const s of [-1, 1]) put(B, 'panel', box(0.5, 0.8, 1.6), s * 1.4, 1.5, -3.6);
  // 통신·항법·화력·정비 콘솔 (선원 자리)
  for (const c of CREW) { const [cx, , cz] = c.st; put(B, 'panel', box(4.4, 1.1, 1.8), cx, 0.55, cz + (cz < 0 ? -1.4 : 1.4)); put(B, 'dark', box(4, 0.2, 1.6), cx, 1.2, cz + (cz < 0 ? -1.4 : 1.4)); put(B, 'neon', box(3.6, 0.08, 0.08), cx, 1.35, cz + (cz < 0 ? -0.6 : 0.6)); }
  // 문(후미 쪽 격벽)
  put(B, 'dark', box(5, 6, 0.8), 0, 3, D / 2 - 0.5); put(B, 'amber', box(5.4, 0.2, 0.2), 0, 6.1, D / 2 - 0.8); put(B, 'neon', box(0.2, 6, 0.2), -2.6, 3, D / 2 - 0.8); put(B, 'neon', box(0.2, 6, 0.2), 2.6, 3, D / 2 - 0.8);
  // 보급 상자 · 화분
  for (let k = 0; k < 6; k++) put(B, k % 2 ? 'panel' : 'white', box(2, 2, 2), -10 + (k % 3) * 2.2, 1, 17.5 - Math.floor(k / 3) * 2.2);
  for (const [x, z] of [[-10.5, -14], [10.5, -14], [-10.5, 14], [10.5, 14]]) { put(B, 'dark', cyl(0.8, 0.6, 1.2, 10), x, 0.6, z); put(B, 'neon', new THREE.SphereGeometry(0.55, 10, 8), x, 1.8, z); }
  const fin = finish(B, []);
  for (const k in fin) { const m = new THREE.Mesh(fin[k], M[k] || M.panel); m.castShadow = m.receiveShadow = true; bscene.add(m); }
  // 전략 테이블 (원형, 홀로 지도)
  const tb = new THREE.Group(); tb.position.copy(TABLE);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 1.1, 32), M.dark); base.position.y = 0.55; tb.add(base);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.4, 0.2, 32), M.panel); top.position.y = 1.2; tb.add(top);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.1, 6, 48), M.neon); ring.rotation.x = HPI; ring.position.y = 1.35; tb.add(ring);
  const mapC = document.createElement('canvas'); mapC.width = mapC.height = 512; const mapT = new THREE.CanvasTexture(mapC); mapT.colorSpace = THREE.SRGBColorSpace;
  const mapMesh = new THREE.Mesh(new THREE.CircleGeometry(3.1, 48), new THREE.MeshBasicMaterial({ map: mapT, transparent: true, opacity: 0.92, toneMapped: false })); mapMesh.rotation.x = -HPI; mapMesh.position.y = 1.32; tb.add(mapMesh);
  const hologram = new THREE.Group(); hologram.position.y = 2.2; tb.add(hologram);
  bscene.add(tb); state.table = { g: tb, mapC, mapT, hologram, ring };
  // 솔라레 홀로그램 (작전실 앞쪽 단상)
  const sg = new THREE.Group(); sg.position.copy(SOL);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2, 0.4, 24), M.dark); pad.position.y = 0.2; sg.add(pad);
  const prg = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.08, 6, 40), M.neon); prg.rotation.x = HPI; prg.position.y = 0.45; sg.add(prg);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 6.2, 28, 1, true), M.holo); cone.position.y = 3.5; sg.add(cone);
  const body = buildSolareBody(); body.position.y = 0.45; sg.add(body);
  bscene.add(sg); state.solare = { g: sg, body, ring: prg, cone };
  // 선원
  for (const c of CREW) {
    const p = makePerson(c.col, { cap: c.id === 'pilot' || c.id === 'eng', suit: 0x26323c, hair: [0x2a1d14, 0x6a3a1c, 0x111111, 0xcab07a, 0x3a2a4a][CREW.indexOf(c)] });
    p.position.set(c.st[0], 0, c.st[2]); p.rotation.y = c.st[2] < 0 ? 0 : Math.PI; p.add(nameTag(`${c.nm} · ${c.role}`, c.col)); bscene.add(p);
    state.crew.push({ def: c, g: p, home: new THREE.Vector3(c.st[0], 0, c.st[2]), tgt: null, t: rand(0, 6), walk: 0, say: '' });
  }
  // 아바타 (나)
  const av = makePerson(0x22d3d3, { suit: 0x1c2a36, scale: 1.04, hair: 0x181818 }); av.position.set(0, 0, 11); av.rotation.y = Math.PI; av.add(nameTag('나 · 캡틴', 0x22d3d3)); bscene.add(av); state.avatar = av;
  // 조명
  bscene.add(new THREE.HemisphereLight(0xaedcff, 0x182028, 0.7));
  const key = new THREE.PointLight(0x9fe8ff, 1200, 60, 1.6); key.position.set(0, H - 1.2, 2); bscene.add(key);
  const warm = new THREE.PointLight(0xffc27a, 700, 40, 1.8); warm.position.set(0, 3, WINDOW_Z + 4); bscene.add(warm);
  const cyan = new THREE.PointLight(0x22d3d3, 600, 26, 1.8); cyan.position.set(0, 2.6, -9); bscene.add(cyan);
  state.parts = new Particles(bscene, 300, TEX_SOFT, true); state.parts.mat.uniforms.fogNear.value = 40; state.parts.mat.uniforms.fogFar.value = 110;
  state.built = true;
}
function buildSolareBody() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 3.6, 3.8), toneMapped: false })); core.position.y = 2.6; g.add(core);
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(1.3 + i * 0.25, 0.04, 6, 48), M.holo); r.position.y = 2.6; r.rotation.set(i * 1.0, i * 0.6, 0); g.add(r); (g.userData.rings = g.userData.rings || []).push(r); }
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0x021416 })); e.position.set(s * 0.28, 2.7, 0.78); g.add(e); (g.userData.eyes = g.userData.eyes || []).push(e); }
  const base = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 10, 1, true), M.holo); base.position.y = 1.2; base.rotation.x = Math.PI; g.add(base);
  g.userData.core = core; return g;
}

/* ---------- 진입 / 퇴장 ---------- */
export function enterBridge() {
  if (!state.built) build();
  state.avatar.position.set(0, 0, 11); state.yaw = Math.PI; state.near = null; state.talk = null; state.camMode = 'third';
  document.getElementById('bridgeUI').classList.add('on'); renderStrategy();
  const a = activeShip(); $('brShip').textContent = `${TIERS[a.tier].t} ${TIERS[a.tier].nm}`;
  bhooks.say && bhooks.say('캡틴, 지휘본부에 오신 걸 환영해요. 선원들과 이야기하고 전략 테이블에서 작전을 정해요.');
}
export function __teleport(x, z) { state.avatar.position.set(x, 0, z); }
export function __state() { return { near: state.near && state.near.nm, pos: [state.avatar.position.x, state.avatar.position.z].map(v => +v.toFixed(1)) }; }
export function exitBridge() { document.getElementById('bridgeUI').classList.remove('on'); closeCrewCard(); }

/* ---------- 입력 ---------- */
const keyMap = { w: 'f', arrowup: 'f', s: 'b', arrowdown: 'b', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r' };
addEventListener('keydown', e => { const k = keyMap[e.key.toLowerCase()]; if (k && document.body.dataset.mode === 'bridge' && !(e.target.tagName === 'INPUT')) state.keys[k] = true; if (document.body.dataset.mode === 'bridge' && e.key.toLowerCase() === 'e') interact(); if (document.body.dataset.mode === 'bridge' && e.key.toLowerCase() === 'c') state.camMode = state.camMode === 'third' ? 'first' : 'third'; });
addEventListener('keyup', e => { const k = keyMap[e.key.toLowerCase()]; if (k) state.keys[k] = false; });
export const bridgeInput = { x: 0, y: 0 };   // 터치 조이스틱 (main 이 채움)
let drag = null;
addEventListener('pointerdown', e => { if (document.body.dataset.mode === 'bridge' && e.target.id === 'view') drag = { x: e.clientX }; });
addEventListener('pointermove', e => { if (drag && document.body.dataset.mode === 'bridge') { state.yaw -= (e.clientX - drag.x) * 0.006; drag.x = e.clientX; } });
addEventListener('pointerup', () => { drag = null; });

/* ---------- 상호작용 ---------- */
export function interact() {
  if (!state.near) return;
  const n = state.near;
  if (n.kind === 'crew') openCrewCard(n.ref);
  else if (n.kind === 'table') { document.getElementById('strategyPanel').classList.add('on'); renderStrategy(); }
  else if (n.kind === 'solare') { bhooks.say && bhooks.say('저예요, 캡틴! 오른쪽 아래 채팅으로 무엇이든 말씀해 주세요. "작전 짜줘"라고 하면 추천 전략을 알려 드려요.'); document.getElementById('solBtn').click(); }
  else if (n.kind === 'door') { bhooks.onExit && bhooks.onExit(); }
}
function openCrewCard(c) {
  const lv = crewLevel(c.def.id), cost = crewUpCost(c.def.id), el = document.getElementById('crewCard');
  el.classList.add('on');
  el.innerHTML = `<button class="x" id="ccX">✕</button><div class="cch"><span class="cci" style="color:#${c.def.col.toString(16).padStart(6, '0')}">${c.def.ic}</span><div><b>${c.def.nm}</b><small>${c.def.role} · Lv.${lv}</small></div></div><p>${c.def.ds}</p><div class="ccb">${c.def.bonus(lv)}</div><div class="ccn">${c.def.bonus(lv + 1)} <small>(다음 레벨)</small></div><button class="btn" id="ccUp" ${save.credits < cost ? 'disabled' : ''}>훈련 ${fmt(cost)} C</button><p class="ccq">"${pick(c.def.id === 'gunner' ? ['사격 준비 끝났습니다, 캡틴!', '적은 한 방에 보내 드리죠.'] : c.def.id === 'pilot' ? ['바람이 좋아요. 마음껏 날아 보세요.', '급선회 문제없어요.'] : c.def.id === 'nav' ? ['레이더에 이상 없어요.', '다음 목적지를 말씀해 주세요.'] : c.def.id === 'medic' ? ['다치시면 바로 오세요.', '전투 끝나면 제가 치료할게요.'] : ['엔진 컨디션 최고예요!', '방어막은 제가 책임질게요.'])}"</p>`;
  document.getElementById('ccX').onclick = closeCrewCard;
  document.getElementById('ccUp').onclick = () => { if (save.credits < cost) return; save.credits -= cost; save.crew[c.def.id] = (save.crew[c.def.id] || 0) + 1; persist(); sfx('coin'); bhooks.toast && bhooks.toast(`${c.def.nm} Lv.${crewLevel(c.def.id)} 달성!`); openCrewCard(c); };
  c.talkT = 4;
}
function closeCrewCard() { document.getElementById('crewCard').classList.remove('on'); }
export function renderStrategy() {
  const box_ = document.getElementById('strategyList'); if (!box_) return;
  box_.innerHTML = Object.entries(STRATEGIES).map(([k, s]) => `<button class="strat ${save.strategy === k ? 'on' : ''}" data-s="${k}"><i>${s.ic}</i><b>${s.nm}</b><small>${s.ds}</small></button>`).join('');
  box_.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { save.strategy = b.dataset.s; persist(); sfx('ui'); bhooks.setStrategy && bhooks.setStrategy(b.dataset.s); renderStrategy(); bhooks.say && bhooks.say(`${STRATEGIES[b.dataset.s].nm} 작전으로 갈게요! ${STRATEGIES[b.dataset.s].ds}`); });
  const advice = bhooks.status ? bhooks.status() : null;
  if (advice) { const a = document.getElementById('strategyAdvice'); if (a) a.textContent = advice; }
}


/* ---------- 홀로 지도 ---------- */
function drawTableMap(t) {
  const { mapC, mapT } = state.table, x = mapC.getContext('2d'), W = 512, R = 256;
  x.clearRect(0, 0, W, W); x.save(); x.beginPath(); x.arc(R, R, R - 4, 0, 7); x.clip();
  x.fillStyle = 'rgba(4,22,28,.9)'; x.fillRect(0, 0, W, W);
  x.strokeStyle = 'rgba(34,211,211,.35)'; x.lineWidth = 2; for (let r = 60; r < R; r += 60) { x.beginPath(); x.arc(R, R, r, 0, 7); x.stroke(); }
  x.beginPath(); x.moveTo(R, 0); x.lineTo(R, W); x.moveTo(0, R); x.lineTo(W, R); x.stroke();
  const sw = (t * 1.4) % (Math.PI * 2); const gr = x.createConicGradient ? x.createConicGradient(sw, R, R) : null; if (gr) { gr.addColorStop(0, 'rgba(34,211,211,0)'); gr.addColorStop(0.1, 'rgba(34,211,211,.35)'); gr.addColorStop(0.101, 'rgba(34,211,211,0)'); x.fillStyle = gr; x.fillRect(0, 0, W, W); }
  const g = bhooks.world ? bhooks.world() : null, S = 4600;
  const P = (wx, wz) => [R + wx / S * (R - 14), R + wz / S * (R - 14)];
  if (g) {
    for (const o of g.ores) { const [a, b] = P(o.x, o.z); x.fillStyle = '#' + ORES[o.type].col.toString(16).padStart(6, '0'); x.fillRect(a - 2, b - 2, 4, 4); }
    for (const p of g.ports) { const [a, b] = P(p.x, p.z); x.fillStyle = '#22d3d3'; x.fillRect(a - 5, b - 5, 10, 10); }
    for (const o of g.outposts) { const [a, b] = P(o.x, o.z); x.fillStyle = o.ruined ? '#ff6a55' : '#b88cff'; x.beginPath(); for (let k = 0; k < 6; k++) { const an = k / 6 * 6.283; x.lineTo(a + Math.cos(an) * 6, b + Math.sin(an) * 6); } x.fill(); }
    for (const s of g.ships) { if (!s.alive || s.isPlayer) continue; const [a, b] = P(s.pos.x, s.pos.z); x.fillStyle = s.faction === 'pirate' ? '#ff4a3a' : '#9fb0b4'; x.beginPath(); x.arc(a, b, s.isBoss ? 6 : 3, 0, 7); x.fill(); }
    const pl = g.player; if (pl) { const [a, b] = P(pl.pos.x, pl.pos.z); x.fillStyle = '#fff'; x.beginPath(); x.arc(a, b, 5, 0, 7); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.arc(a, b, 9 + Math.sin(t * 4) * 2, 0, 7); x.stroke(); }
    if (g.ap && g.ap.on) { const [a, b] = P(g.ap.x, g.ap.z); x.strokeStyle = '#ffc84a'; x.lineWidth = 2; x.setLineDash([6, 4]); x.beginPath(); if (g.player) { const [pa, pb] = P(g.player.pos.x, g.player.pos.z); x.moveTo(pa, pb); } x.lineTo(a, b); x.stroke(); x.setLineDash([]); x.beginPath(); x.arc(a, b, 8, 0, 7); x.stroke(); }
  }
  x.restore(); mapT.needsUpdate = true;
}

/* ---------- 프레임 ---------- */
const _v = new THREE.Vector3();
function nearest() {
  const a = state.avatar.position; let best = null, bd = 1e9;
  const cand = [];
  for (const c of state.crew) cand.push({ kind: 'crew', ref: c, pos: c.g.position, r: 5.0, nm: `${c.def.nm} (${c.def.role})와 대화` });
  cand.push({ kind: 'table', pos: TABLE, r: 6.4, nm: '전략 테이블 열기' }, { kind: 'solare', pos: SOL, r: 4.5, nm: '솔라레와 이야기하기' }, { kind: 'door', pos: new THREE.Vector3(0, 0, ROOM.d / 2 - 1.5), r: 3.6, nm: '지휘본부 나가기' });
  for (const c of cand) { const d = Math.hypot(c.pos.x - a.x, c.pos.z - a.z); if (d < c.r && d < bd) { bd = d; best = c; } }
  return best;
}
export function updateBridge(dt) {
  state.t += dt; const t = state.t, av = state.avatar, k = state.keys;
  // 이동 (카메라 방향 기준 아님: 아바타 시선 기준)
  const f = (k.f ? 1 : 0) - (k.b ? 1 : 0) - bridgeInput.y, s = (k.r ? 1 : 0) - (k.l ? 1 : 0) + bridgeInput.x;
  if (Math.abs(s) > 0.05) state.yaw -= s * dt * 2.2;
  const sp = 6.5 * (k.f && k.b ? 0 : 1);
  if (Math.abs(f) > 0.05) { av.position.x += -Math.sin(state.yaw) * f * sp * dt; av.position.z += -Math.cos(state.yaw) * f * sp * dt; }
  av.position.x = clamp(av.position.x, -ROOM.w / 2 + 1.4, ROOM.w / 2 - 1.4); av.position.z = clamp(av.position.z, WINDOW_Z + 2.2, ROOM.d / 2 - 1.6);
  // 테이블·콘솔 충돌
  const tdx = av.position.x - TABLE.x, tdz = av.position.z - TABLE.z, td = Math.hypot(tdx, tdz); if (td < 4.2 && td > 0.01) { av.position.x = TABLE.x + tdx / td * 4.2; av.position.z = TABLE.z + tdz / td * 4.2; }
  av.rotation.y = lerp(av.rotation.y, state.yaw, 1 - Math.exp(-dt * 12)); (() => { let d = wrap(state.yaw - av.rotation.y); av.rotation.y += d * 0.0; })();
  const moving = Math.abs(f) > 0.05, ph = t * 9, u = av.userData;
  u.legL.rotation.x = moving ? Math.sin(ph) * 0.7 : lerp(u.legL.rotation.x, 0, 0.2); u.legR.rotation.x = moving ? -Math.sin(ph) * 0.7 : lerp(u.legR.rotation.x, 0, 0.2);
  u.armL.rotation.x = moving ? -Math.sin(ph) * 0.6 : lerp(u.armL.rotation.x, 0, 0.2); u.armR.rotation.x = moving ? Math.sin(ph) * 0.6 : lerp(u.armR.rotation.x, 0, 0.2);
  av.position.y = moving ? Math.abs(Math.sin(ph)) * 0.08 : 0;
  // 카메라
  if (state.camMode === 'third') { bcam.position.set(av.position.x + Math.sin(state.yaw) * 13, 8.2, av.position.z + Math.cos(state.yaw) * 13); bcam.lookAt(av.position.x - Math.sin(state.yaw) * 4, 1.8, av.position.z - Math.cos(state.yaw) * 4); av.visible = true; }
  else { bcam.position.set(av.position.x, 3.2, av.position.z); bcam.lookAt(av.position.x - Math.sin(state.yaw) * 6, 3, av.position.z - Math.cos(state.yaw) * 6); av.visible = false; }
  bcam.aspect = innerWidth / innerHeight; bcam.updateProjectionMatrix();
  // 선원: 제자리 근무 + 가끔 서성임, 가까이 가면 돌아봄
  for (const c of state.crew) {
    c.t += dt; const p = c.g.position, home = c.home; let wantFace = c.home.z < 0 ? 0 : Math.PI;
    const dA = Math.hypot(av.position.x - p.x, av.position.z - p.z);
    if (dA < 6) wantFace = Math.atan2(av.position.x - p.x, av.position.z - p.z);
    if (!c.tgt && Math.random() < dt * 0.08) c.tgt = home.clone().add(new THREE.Vector3(rand(-2.5, 2.5), 0, rand(-1.5, 1.5)));
    let walking = false;
    if (c.tgt) { const dx = c.tgt.x - p.x, dz = c.tgt.z - p.z, d = Math.hypot(dx, dz); if (d < 0.2) c.tgt = Math.random() < 0.5 ? home.clone() : null; else { p.x += dx / d * 2 * dt; p.z += dz / d * 2 * dt; wantFace = Math.atan2(dx, dz); walking = true; } }
    c.g.rotation.y = lerp(c.g.rotation.y, wantFace, 1 - Math.exp(-dt * 5));
    const u2 = c.g.userData, w = t * 8 + c.t; u2.legL.rotation.x = walking ? Math.sin(w) * 0.6 : 0; u2.legR.rotation.x = walking ? -Math.sin(w) * 0.6 : 0;
    u2.armL.rotation.x = walking ? -Math.sin(w) * 0.5 : Math.sin(c.t * 1.4) * 0.12 - 0.5; u2.armR.rotation.x = walking ? Math.sin(w) * 0.5 : -0.6 + Math.sin(c.t * 2.2 + 1) * 0.1;   // 근무 중엔 콘솔을 만지는 팔
    u2.head.rotation.y = lerp(u2.head.rotation.y, dA < 6 ? 0 : Math.sin(c.t * 0.5) * 0.4, 0.08);
    if (c.talkT > 0) { c.talkT -= dt; u2.armR.rotation.x = -1.4 + Math.sin(c.t * 7) * 0.25; }
  }
  // 솔라레 홀로그램 · 테이블
  const S = state.solare; S.body.userData.rings.forEach((r, i) => { r.rotation.y += dt * (0.8 + i * 0.5); r.rotation.x += dt * 0.3; }); S.body.userData.core.scale.setScalar(1 + Math.sin(t * 2.2) * 0.05); S.body.position.y = 0.45 + Math.sin(t * 1.4) * 0.15;
  S.body.lookAt(av.position.x, S.g.position.y + 3, av.position.z); S.ring.rotation.z = t * 0.6;
  state.table.ring.rotation.z = t * 0.4; state.table.hologram.rotation.y = t * 0.3;
  if (Math.floor(t * 8) !== state.mapT) { state.mapT = Math.floor(t * 8); drawTableMap(t); }
  state.sky.position.x = Math.sin(t * 0.05) * 6;
  if (Math.random() < 0.4) state.parts.emit(rand(-11, 11), rand(0.5, 8), rand(-18, 18), 0, rand(0.2, 0.8), 0, rand(3, 6), 0.35, 0.1, [0.6, 3, 3.4], [0.3, 1, 1.6], 0.5);
  state.parts.update(dt);
  // 힌트
  state.near = nearest(); const h = document.getElementById('brHint');
  if (h) { h.style.display = state.near ? 'block' : 'none'; h.innerHTML = state.near ? `${('ontouchstart' in window) ? '상호작용 버튼' : 'E'} · <b>${state.near.nm}</b>` : ''; }
  const wp = document.getElementById('brInteract'); if (wp) wp.style.display = state.near ? 'flex' : 'none';
}
