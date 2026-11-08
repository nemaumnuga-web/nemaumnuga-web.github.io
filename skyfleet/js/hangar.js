// 격납고: 항구마다 다른 3D 배경 · 정비 로봇팔 · 모듈 장착 애니메이션
import { THREE, Q, renderer, rand, pick, canvasTex, Particles, TEX_SMOKE, TEX_SOFT, put, finish, box, cyl, HPI, addProto, COL, clamp, lerp, sfx } from './core.js';
import { makeShipModel } from './ships.js';
import { TIERS, MODULES } from './data.js';

export const hscene = new THREE.Scene();
hscene.background = new THREE.Color(0x05090b);
hscene.fog = new THREE.Fog(0x05090b, 140, 340);
export const hcam = new THREE.PerspectiveCamera(48, 1, 0.5, 700);
const view = { yaw: 0.6, pitch: 0.32, drag: false, auto: true };

/* ---------- 포트별 설정 (배경 · 조명 · 바닥 · 소품) ---------- */
const PORTS = {
  anton: { nm: '포트 앤톤 · 사막 정비창', sky: 0xe6b27a, fog: 0xd49c6a, near: 180, far: 520, floor: 'sand', amb: 0xffd6a6, key: 0xffc27a, rim: 0xffb14a, props: 'dune',
    pal: { stone: '#c69a6a', dark: '#4a4238', white: '#e6dccb', accent: '#ffb14a', wood: '#8a5e3a', leaf: '#4f6b2a', cloth: '#d24a3a' }, glow: [3.4, 2.0, 0.6], water: null },
  mesa: { nm: '메사 기지 · 절벽 격납고', sky: 0x5a7d93, fog: 0x8aa1b0, near: 200, far: 600, floor: 'metal', amb: 0xc8dcea, key: 0xfff1d6, rim: 0x7fd8ff, props: 'mesa',
    pal: { stone: '#9c7a5c', dark: '#2b3238', white: '#dfe7ec', accent: '#7fd8ff', wood: '#7a5234', leaf: '#3c5a3a', cloth: '#c84a3a' }, glow: [0.6, 2.8, 4.0], water: null },
  red: { nm: '레드캐년 정거장 · 협곡 도크', sky: 0x7a2e1e, fog: 0x9a4a30, near: 160, far: 480, floor: 'rock', amb: 0xffb490, key: 0xffa060, rim: 0xff4a3a, props: 'canyon',
    pal: { stone: '#8a3a2a', dark: '#2e1c18', white: '#e8d6c8', accent: '#ff4a3a', wood: '#6a3a24', leaf: '#5a3a24', cloth: '#f0c04a' }, glow: [4.2, 0.7, 0.4], water: null },
  oasis: { nm: '오아시스 교역소 · 야시장', sky: 0x8fe0d2, fog: 0xc0efe6, near: 220, far: 640, floor: 'wood', amb: 0xe0ffee, key: 0xfff0b0, rim: 0x9fffe0, props: 'oasis',
    pal: { stone: '#d8c39a', dark: '#3a4a40', white: '#f2f0e6', accent: '#f2c14a', wood: '#8a5e3a', leaf: '#3f8a3a', cloth: '#e0503a' }, glow: [4.0, 2.6, 0.9], water: 0x2aa8c0 },
  grave: { nm: '난파선 전초기지 · 잿빛 격납고', sky: 0x0b1714, fog: 0x14231e, near: 120, far: 400, floor: 'rust', amb: 0x6fa08a, key: 0xb8e0c0, rim: 0x9aff7a, props: 'wreck',
    pal: { stone: '#4a3a30', dark: '#1e2620', white: '#8a9a90', accent: '#9aff7a', wood: '#3a2a20', leaf: '#2a3a2a', cloth: '#5a6a50' }, glow: [1.4, 4.2, 1.2], water: null },
};
const LIGHTS = {};
const SLOTS = [[-7.2, 3.2, -4], [7.2, 3.2, -4], [-7.2, 3.2, 5], [7.2, 3.2, 5], [0, 6.4, -9], [0, 2.6, 11]];
const MOD_COL = { '방어': 0x5fe8ff, '기동': 0xffb347, '공격': 0xff5a4a, '유틸': 0xb88cff };
const ARM = { L1: 16, L2: 14, SH: 4.5, base: new THREE.Vector3(24, 0, 12), crate: new THREE.Vector3(36, 0, -16), cur: { h: 0, p1: 0.9, p2: 0.2 }, rig: null };
let ship = null, curTier = 0, curPaint = 'sand', curMods = [], modGroup = null, curPort = null, envGroup = null, H_SMOKE = null, H_FIRE = null, job = null, idleT = 0;
const flashes = [], envCache = {}, neonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3.4, 3.8), toneMapped: false });

/* ---------- 바닥 텍스처 ---------- */
function floorTex(kind) {
  const C = { sand: ['#c9a06a', '#a9824f', '#e2bd86'], metal: ['#3a4650', '#2a333b', '#55636e'], rock: ['#7a3b2a', '#5e2a1f', '#9a5238'], wood: ['#8a5e3a', '#6b4528', '#a77a4c'], rust: ['#4c3a30', '#352820', '#6a5140'] }[kind];
  return canvasTex(512, 512, (x, W) => {
    x.fillStyle = C[0]; x.fillRect(0, 0, W, W);
    for (let i = 0; i < 2600; i++) { x.fillStyle = Math.random() < 0.5 ? C[1] : C[2]; x.globalAlpha = 0.25; x.fillRect(Math.random() * W, Math.random() * W, rand(2, 9), rand(2, 9)); }
    x.globalAlpha = 1;
    if (kind === 'metal') { x.strokeStyle = 'rgba(120,200,220,.35)'; x.lineWidth = 3; for (let i = 0; i <= W; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, W); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(W, i); x.stroke(); } }
    if (kind === 'wood') { x.strokeStyle = 'rgba(40,20,8,.5)'; x.lineWidth = 4; for (let i = 0; i <= W; i += 64) { x.beginPath(); x.moveTo(0, i); x.lineTo(W, i); x.stroke(); } }
    if (kind === 'rust') { for (let i = 0; i < 30; i++) { x.fillStyle = `rgba(190,90,40,${rand(0.05, 0.2)})`; x.beginPath(); x.arc(rand(0, W), rand(0, W), rand(10, 60), 0, 7); x.fill(); } }
    if (kind === 'rock') { for (let i = 0; i < 14; i++) { x.strokeStyle = 'rgba(40,12,8,.45)'; x.lineWidth = 2; x.beginPath(); x.moveTo(rand(0, W), rand(0, W)); x.lineTo(rand(0, W), rand(0, W)); x.stroke(); } }
    x.strokeStyle = 'rgba(230,245,245,.7)'; x.lineWidth = 8; x.beginPath(); x.arc(W / 2, W / 2, W * 0.34, 0, 7); x.stroke(); x.lineWidth = 4; x.beginPath(); x.arc(W / 2, W / 2, W * 0.22, 0, 7); x.stroke();
  });
}

/* ---------- 포트별 배경 소품 ---------- */
const PROPS = {
  dune(B) {   // 사막 항구: 모래언덕 · 사암 벽 · 태양광 패널 · 물탱크 · 등불
    for (let i = 0; i < 22; i++) { const a = i / 22 * 6.283 + rand(-0.1, 0.1), r = rand(108, 132), s = rand(14, 26); put(B, 'stone', new THREE.SphereGeometry(s, 12, 8).scale(1, 0.32, 1), Math.cos(a) * r, -s * 0.2, Math.sin(a) * r); }
    for (let i = 0; i < 18; i++) { const a = i / 18 * 6.283, h = rand(26, 44); put(B, 'stone', box(16, h, 12), Math.cos(a) * 98, h / 2 - 4, Math.sin(a) * 98, 0, -a, 0); }
    for (let i = 0; i < 5; i++) { const x = -70 + i * 13, z = -42; put(B, 'dark', box(11, 0.6, 7.5), x, 15, z, -0.45, 0, 0); put(B, 'white', cyl(0.4, 0.4, 15, 6), x, 7.5, z); put(B, 'accent', box(10, 0.15, 0.15), x, 15.4, z - 3.6, -0.45); }
    put(B, 'white', cyl(6, 6, 22, 12), -78, 11, -62); put(B, 'dark', new THREE.ConeGeometry(7, 5, 12), -78, 24.5, -62);
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283; put(B, 'glow', box(1.2, 1.2, 1.2), Math.cos(a) * 86, 6, Math.sin(a) * 86); put(B, 'wood', cyl(0.3, 0.3, 6, 5), Math.cos(a) * 86, 3, Math.sin(a) * 86); }
  },
  mesa(B) {   // 메사 기지: 평평한 절벽 봉우리 · 철골 비계 · 안테나 · 화물 상자
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + 0.2, r = 124, h = rand(40, 70); put(B, 'stone', cyl(rand(18, 26), rand(22, 32), h, 9), Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r); put(B, 'accent', cyl(rand(19, 27), rand(23, 33), 0.6, 9), Math.cos(a) * r, h - 6.2, Math.sin(a) * r); }
    for (let i = 0; i < 12; i++) { const x = -60 + i * 4, z = -22; put(B, 'dark', box(0.8, 24, 0.8), x, 12, z); put(B, 'dark', box(0.8, 0.8, 16), x, 20, z - 8); }
    for (let k = 0; k < 14; k++) { const a = rand(0, 6.28), r = rand(40, 74); put(B, 'wood', box(4, 4, 4), Math.cos(a) * r, 2, Math.sin(a) * r, 0, rand(0, 1), 0); }
    put(B, 'white', cyl(0.4, 0.8, 46, 6), 34, 23, -62); put(B, 'glow', new THREE.SphereGeometry(1.4, 8, 6), 34, 47, -62);
  },
  canyon(B) { // 레드캐년 협곡: 솟은 붉은 바위 · 자연 아치 · 붉은 네온 띠
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283 + rand(-0.1, 0.1), r = rand(92, 112), h = rand(60, 120); put(B, 'stone', cyl(rand(10, 16), rand(14, 22), h, 7), Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r); }
    put(B, 'stone', new THREE.TorusGeometry(56, 9, 8, 24, Math.PI), 0, 6, -74, 0, 0, 0);
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; put(B, 'glow', box(12, 0.6, 0.6), Math.cos(a) * 92, 10, Math.sin(a) * 92, 0, -a, 0); }
    for (let k = 0; k < 16; k++) { const a = rand(0, 6.28), r = rand(40, 80); put(B, 'accent', new THREE.OctahedronGeometry(rand(1.5, 3), 0), Math.cos(a) * r, rand(1, 5), Math.sin(a) * r); }
  },
  oasis(B) {  // 오아시스 야시장: 야자수 · 천막 가게 · 등불 · 물웅덩이
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283 + rand(-0.1, 0.1), r = rand(74, 98), x = Math.cos(a) * r, z = Math.sin(a) * r; put(B, 'wood', cyl(1.1, 1.6, 26, 6), x, 12, z); for (let j = 0; j < 6; j++) put(B, 'leaf', box(14, 0.35, 2.2), x, 25, z, 0.45, j * 1.047, 0); }
    for (let i = 0; i < 4; i++) { const a = -0.8 + i * 0.55, x = 58 + Math.cos(a) * 16, z = -46 + Math.sin(a) * 16; put(B, 'wood', box(10, 3, 6), x, 1.5, z); put(B, 'cloth', new THREE.ConeGeometry(9, 5, 4), x, 6.5, z, 0, 0.78, 0); put(B, 'glow', box(1, 1, 1), x + 4, 4, z + 3); }
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; put(B, 'glow', new THREE.SphereGeometry(1.1, 8, 6), Math.cos(a) * 60, 7, Math.sin(a) * 60 + 20); }
    put(B, 'stone', box(40, 6, 4), -60, 3, 40, 0, 0.3, 0);
  },
  wreck(B) {  // 난파선 전초: 녹슨 함선 잔해 · 부러진 돛대 · 떠다니는 파편
    put(B, 'rust', box(44, 14, 16), 22, 6, -42, 0.1, 0.5, 0.15); put(B, 'dark', box(30, 10, 12), -34, 4, 36, -0.2, 1.1, 0.1); put(B, 'rust', box(26, 8, 10), -6, 3, 70, 0.3, -0.4, -0.2);
    put(B, 'rust', cyl(0.8, 1, 46, 6), 10, 20, 44, 0.5, 0, 0.3); put(B, 'dark', cyl(0.6, 0.6, 26, 6), -40, 13, -54, 0, 0, 1.2);
    for (let k = 0; k < 34; k++) { const a = rand(0, 6.28), r = rand(40, 110); put(B, Math.random() < 0.5 ? 'rust' : 'dark', box(rand(2, 8), rand(1, 4), rand(2, 8)), Math.cos(a) * r, rand(0, 4), Math.sin(a) * r, rand(0, 3), rand(0, 3), rand(0, 3)); }
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; put(B, 'glow', box(1.4, 0.8, 1.4), Math.cos(a) * 96, 2, Math.sin(a) * 96); }
  },
};

/* ---------- 포트 환경 빌드 (캐시) ---------- */
function buildEnv(id) {
  const P = PORTS[id], g = new THREE.Group(), B = {};
  const floor = new THREE.Mesh(new THREE.CircleGeometry(96, 72), new THREE.MeshStandardMaterial({ map: floorTex(P.floor), roughness: 0.62, metalness: P.floor === 'metal' ? 0.5 : 0.1 }));
  floor.rotation.x = -HPI; floor.receiveShadow = true; g.add(floor);
  PROPS[P.props](B);
  const pal = P.pal, mats = {
    stone: new THREE.MeshStandardMaterial({ color: pal.stone, roughness: 0.9, flatShading: true }),
    dark: new THREE.MeshStandardMaterial({ color: pal.dark, roughness: 0.55, metalness: 0.6 }),
    white: new THREE.MeshStandardMaterial({ color: pal.white, roughness: 0.4, metalness: 0.3 }),
    accent: new THREE.MeshStandardMaterial({ color: pal.accent, roughness: 0.4, metalness: 0.2, emissive: pal.accent, emissiveIntensity: 0.25 }),
    wood: new THREE.MeshStandardMaterial({ color: pal.wood, roughness: 0.8 }),
    leaf: new THREE.MeshStandardMaterial({ color: pal.leaf, roughness: 0.8, side: THREE.DoubleSide }),
    cloth: new THREE.MeshStandardMaterial({ color: pal.cloth, roughness: 0.9, side: THREE.DoubleSide }),
    rust: new THREE.MeshStandardMaterial({ color: pal.stone, roughness: 0.85, metalness: 0.2, flatShading: true }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(P.glow[0], P.glow[1], P.glow[2]), toneMapped: false }),
  };
  for (const k in B) { const m = new THREE.Mesh(finish({ [k]: B[k] }, [])[k], mats[k] || mats.stone); m.castShadow = m.receiveShadow = true; g.add(m); }
  if (P.water) { const w = new THREE.Mesh(new THREE.CircleGeometry(24, 36), new THREE.MeshStandardMaterial({ color: P.water, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.9 })); w.rotation.x = -HPI; w.position.set(30, 0.3, -20); g.add(w); }
  // 장식용 원소 등 (레드캐년·메사 는 네온, 오아시스 는 등불)
  return g;
}
function setPortScene(id) {
  if (!PORTS[id]) id = 'anton';
  if (curPort === id && envGroup) return;
  if (envGroup) hscene.remove(envGroup);
  if (!envCache[id]) envCache[id] = buildEnv(id);
  envGroup = envCache[id]; hscene.add(envGroup); curPort = id;
  const P = PORTS[id];
  hscene.background = new THREE.Color(P.sky); hscene.fog = new THREE.Fog(P.fog, P.near, P.far);
  LIGHTS.hemi.color.set(P.amb); LIGHTS.key.color.set(P.key); LIGHTS.rim.forEach(r => r.color.set(P.rim));
}

/* ---------- 기본 조명 · 환경맵 · 로봇팔 · 보급 상자 ---------- */
function buildArm() {
  const root = new THREE.Group(); root.position.copy(ARM.base); hscene.add(root);
  const base = new THREE.Group(); root.add(base);
  const white = new THREE.MeshStandardMaterial({ color: 0xe8ebeb, roughness: 0.35, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a3034, roughness: 0.5, metalness: 0.7 });
  const cyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3.4, 3.8), toneMapped: false });
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 4, 18), dark); ped.position.y = 2; base.add(ped);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.25, 6, 28), cyan); ring.rotation.x = HPI; ring.position.y = 4.1; base.add(ring);
  const sh = new THREE.Group(); sh.position.y = ARM.SH; base.add(sh);
  const j1 = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8), dark); sh.add(j1);
  const up = new THREE.Mesh(new THREE.BoxGeometry(2, ARM.L1, 2), white); up.position.y = ARM.L1 / 2; sh.add(up);
  const el = new THREE.Group(); el.position.y = ARM.L1; sh.add(el);
  const j2 = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), dark); el.add(j2);
  const fore = new THREE.Mesh(new THREE.BoxGeometry(1.5, ARM.L2, 1.5), white); fore.position.y = ARM.L2 / 2; el.add(fore);
  const tool = new THREE.Group(); tool.position.y = ARM.L2; el.add(tool);
  const claw = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 1.4), dark); claw.position.y = 0.6; tool.add(claw);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 0.4), dark); p.position.set(s * 1.1, -0.4, 0); tool.add(p); }
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), cyan); tip.position.y = 0.2; tool.add(tip);
  // 보급 상자 (모듈이 여기서 집혀 나온다)
  const crate = new THREE.Group(); crate.position.copy(ARM.crate); hscene.add(crate);
  const cb = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 6), new THREE.MeshStandardMaterial({ color: 0x3a4650, roughness: 0.6, metalness: 0.5 })); cb.position.y = 2.5; crate.add(cb);
  const cl = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.4, 6.2), cyan); cl.position.y = 5.1; crate.add(cl);
  ARM.rig = { root, base, sh, el, tool, tip, crateTop: new THREE.Vector3(ARM.crate.x, 6.4, ARM.crate.z) };
}
function solveArm(T) {  // T: 팔 뿌리 기준 목표 좌표 → 어깨·팔꿈치 각도
  const h = Math.atan2(T.x, T.z), r = Math.hypot(T.x, T.z), dy = T.y - ARM.SH;
  const D = clamp(Math.hypot(r, dy), Math.abs(ARM.L1 - ARM.L2) + 0.6, ARM.L1 + ARM.L2 - 0.4), a = Math.atan2(dy, r);
  const ca = clamp((ARM.L1 * ARM.L1 + D * D - ARM.L2 * ARM.L2) / (2 * ARM.L1 * D), -1, 1);
  const p1 = a + Math.acos(ca), ux = ARM.L1 * Math.cos(p1), uy = ARM.L1 * Math.sin(p1);
  return { h, p1, p2: Math.atan2(dy - uy, r - ux) };
}
function applyArm(dt, target) {
  const R = ARM.rig; if (!R) return;
  const T = R.root.worldToLocal(target.clone()), s = solveArm(T), k = 1 - Math.exp(-dt * 7), c = ARM.cur;
  c.h = lerp(c.h, s.h, k); c.p1 = lerp(c.p1, s.p1, k); c.p2 = lerp(c.p2, s.p2, k);
  R.base.rotation.y = c.h; R.sh.rotation.x = HPI - c.p1; R.el.rotation.x = c.p1 - c.p2;
}
function buildLights() {
  LIGHTS.hemi = new THREE.HemisphereLight(0xbcd8ff, 0x1a2024, 0.9); hscene.add(LIGHTS.hemi);
  LIGHTS.key = new THREE.SpotLight(0xffffff, 3500, 260, 0.55, 0.5, 1.6); LIGHTS.key.position.set(20, 56, 25); LIGHTS.key.target.position.set(0, 4, 0);
  if (Q.shadow) { LIGHTS.key.castShadow = true; LIGHTS.key.shadow.mapSize.set(1024, 1024); LIGHTS.key.shadow.bias = -0.0005; }
  hscene.add(LIGHTS.key, LIGHTS.key.target);
  LIGHTS.rim = []; for (let i = 0; i < 4; i++) { const p = new THREE.PointLight(0x88ffff, 1800, 140, 1.6); const a = i * HPI + 0.4; p.position.set(Math.cos(a) * 74, 16, Math.sin(a) * 74); hscene.add(p); LIGHTS.rim.push(p); }
}

/* ---------- 빌드 ---------- */
export { setPortScene };
export function buildHangar() {
  const pm = new THREE.PMREMGenerator(renderer), env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(40, 16, 8), new THREE.MeshBasicMaterial({ color: 0x3a4a52, side: THREE.BackSide })));
  for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(box(6, 2, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? 0.5 : 4, 4, i % 2 ? 4.5 : 4) })); l.position.set(Math.cos(i) * 25, 22, Math.sin(i) * 25); env.add(l); }
  hscene.environment = pm.fromScene(env, 0, 0.1, 100).texture;
  buildLights(); buildArm(); setPortScene('anton');
  H_SMOKE = new Particles(hscene, 900, TEX_SMOKE, false); H_FIRE = new Particles(hscene, 500, TEX_SOFT, true);
  const cv = document.getElementById('view');
  cv.addEventListener('pointerdown', e => { if (document.body.dataset.mode === 'hangar') { view.drag = { x: e.clientX, y: e.clientY }; view.auto = false; } });
  addEventListener('pointermove', e => { if (view.drag && document.body.dataset.mode === 'hangar') { view.yaw -= (e.clientX - view.drag.x) * 0.006; view.pitch = Math.max(0.05, Math.min(0.9, view.pitch + (e.clientY - view.drag.y) * 0.004)); view.drag = { x: e.clientX, y: e.clientY }; } });
  addEventListener('pointerup', () => { view.drag = false; setTimeout(() => view.auto = true, 4000); });
}

/* ---------- 함선 · 장착 모듈 표시 ---------- */
function slotWorld(idx, out) { const s = SLOTS[Math.min(idx, SLOTS.length - 1)]; return ship.model.localToWorld(out.set(s[0], s[1], s[2])); }
function rebuildMarkers() {
  if (!ship) return;
  if (modGroup) ship.model.remove(modGroup);
  modGroup = new THREE.Group(); ship.model.add(modGroup);
  curMods.forEach((id, i) => {
    const m = MODULES[id]; if (!m) return; const s = SLOTS[Math.min(i, SLOTS.length - 1)];
    const col = MOD_COL[m.cat] || 0xffffff;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.4 }));
    mesh.position.set(s[0], s[1], s[2]); modGroup.add(mesh);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.12, 6, 24), new THREE.MeshBasicMaterial({ color: col, toneMapped: false, transparent: true, opacity: 0.7 })); ring.rotation.x = HPI; ring.position.set(s[0], s[1] - 1, s[2]); modGroup.add(ring);
  });
}
export function setHangarShip(cls, paint, mods = []) {
  if (ship) hscene.remove(ship.root);
  curTier = cls; curPaint = paint; curMods = (mods || []).slice();
  ship = makeShipModel(cls, paint, 'player');
  ship.root.position.y = 9 + TIERS[cls].scale * 3; ship.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  hscene.add(ship.root); rebuildMarkers();
}
/* 장착 목록만 바뀌었을 때 (작업 중이면 끝난 뒤에 반영) */
export function refreshHangarMods(mods) { curMods = (mods || []).slice(); if (!job) rebuildMarkers(); }

/* ---------- 로봇팔 작업: 정비 · 모듈 장착 ---------- */
function flash(pos) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 6, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3.4, 3.8), toneMapped: false, transparent: true, opacity: 1, depthWrite: false }));
  m.position.copy(pos); m.rotation.x = HPI; hscene.add(m); flashes.push({ m, t: 0 });
}
/* 정비: 함선 표면 여러 곳을 용접하듯 훑는다 */
export function hangarRepair() {
  if (!ship || job) return;
  job = { type: 'repair', t: 0, dur: 4.2 }; sfx('repair');
}
/* 모듈 장착: 보급 상자에서 집어 슬롯에 끼운다 */
export function hangarInstall(id, idx) {
  if (!ship || !MODULES[id]) return;
  const cat = MODULES[id].cat, col = MOD_COL[cat] || 0xffffff;
  const mod = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.4 }));
  mod.position.copy(ARM.rig.crateTop).add(new THREE.Vector3(0, 1.4, 0)); hscene.add(mod);
  job = { type: 'install', t: 0, dur: 3.6, mod, idx: Math.max(0, idx), grip: false, released: false, fx: col };
  sfx('ui');
}
function jobTarget(dt) {
  const R = ARM.rig, J = job, tmp = new THREE.Vector3();
  if (J.type === 'repair') {
    const pts = [[-4, 3, -6], [4, 3, -6], [4, 2, 6], [-4, 2, 6], [0, 6, 0]];   // 선체 모델 좌표
    const k = Math.floor(J.t / 0.84) % pts.length, p = pts[k];
    const world = ship.model.localToWorld(tmp.set(p[0], p[1], p[2])).clone();
    if (Math.random() < 0.6) for (let i = 0; i < 2; i++) H_FIRE.emit(R.tip.getWorldPosition(new THREE.Vector3()).x, R.tip.getWorldPosition(new THREE.Vector3()).y, R.tip.getWorldPosition(new THREE.Vector3()).z, rand(-30, 30), rand(-10, 30), rand(-30, 30), rand(0.2, 0.5), 1.4, 0.2, COL.spark, COL.sparkE, 1, 1, 60);
    return world;
  }
  // 모듈 장착
  const mod = J.mod;
  if (J.t < 1.0) return R.crateTop.clone().add(new THREE.Vector3(0, 6, 0));
  if (J.t < 1.25) return R.crateTop.clone().add(new THREE.Vector3(0, 0.6, 0));
  if (!J.grip) { J.grip = true; R.tool.attach(mod); mod.position.set(0, 1.2, 0); mod.rotation.set(0, 0, 0); }
  if (J.t < 2.5) return slotWorld(J.idx, tmp.clone()).clone();
  if (!J.released) {
    J.released = true; ship.model.attach(mod); flash(mod.getWorldPosition(new THREE.Vector3()));
    for (let i = 0; i < 36; i++) H_FIRE.emit(mod.position.x, mod.position.y, mod.position.z, rand(-14, 14), rand(-6, 14), rand(-14, 14), rand(0.4, 0.9), 1.6, 0.2, COL.cyan, COL.spark, 1, 1, 30);
    sfx('install'); mod.userData.tail = 0;
  }
  return slotWorld(J.idx, tmp.clone()).clone();
}
function finishJob() {
  const J = job; job = null;
  if (J.type === 'install') { if (J.mod.parent) J.mod.parent.remove(J.mod); hscene.remove(J.mod); rebuildMarkers(); sfx('coin', 0.5); }
  if (J.type === 'repair') { flash(ship.root.position.clone()); sfx('shield'); }
}

/* ---------- 프레임 ---------- */
const _tp = new THREE.Vector3();
export function updateHangar(dt) {
  const t = performance.now() / 1000;
  if (view.auto) view.yaw += dt * 0.12;
  const sc = TIERS[curTier].scale, r = 64 + sc * 20;
  hcam.position.set(Math.sin(view.yaw) * Math.cos(view.pitch) * r, 10 + Math.sin(view.pitch) * r, Math.cos(view.yaw) * Math.cos(view.pitch) * r);
  hcam.lookAt(0, 8 + sc * 2, 0); hcam.aspect = innerWidth / innerHeight; hcam.updateProjectionMatrix();
  if (ship) { ship.model.position.y = Math.sin(t * 1.3) * 0.6; ship.radar.rotation.y = t * 2; ship.turrets.forEach((tu, i) => tu.rotation.y = Math.sin(t * 0.4 + i) * 0.6); }
  // 로봇팔: 작업 중이면 작업 목표, 아니면 천천히 돌아다니는 대기 동작
  let target;
  if (job) { job.t += dt; target = jobTarget(dt); if (job.t >= job.dur) finishJob(); }
  if (!job) { idleT += dt; target = _tp.set(ARM.crate.x - 6 + Math.sin(t * 0.25) * 4, 10 + Math.sin(t * 0.7) * 1.5, ARM.crate.z + 14); }
  if (ARM.rig && target) applyArm(dt, target);
  if (ARM.rig && job && job.type === 'repair' && Math.random() < 0.3) { const p = ARM.rig.tip.getWorldPosition(new THREE.Vector3()); H_FIRE.emit(p.x, p.y, p.z, rand(-10, 10), rand(-4, 8), rand(-10, 10), 0.3, 1, 0.1, COL.spark, COL.sparkE, 1, 1, 40); }
  for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.t += dt; const k = f.t / 0.8; f.m.scale.setScalar(1 + k * 6); f.m.material.opacity = Math.max(0, 1 - k); if (k >= 1) { hscene.remove(f.m); f.m.geometry.dispose(); flashes.splice(i, 1); } }
  // 배경 연기·먼지 (포트별 분위기)
  const P = PORTS[curPort] || PORTS.anton;
  if (Math.random() < 0.5) H_SMOKE.emit(rand(-70, 70), rand(0, 2), rand(-70, 70), rand(-1, 1), rand(4, 9), rand(-1, 1), rand(4, 7), 4, 20, P.fog ? [0.5, 0.5, 0.5] : [0.5, 0.5, 0.5], [0.35, 0.4, 0.42], 0.22);
  if (ship && Math.random() < 0.6) for (const x of [-8, 8]) { const p = ship.model.localToWorld(new THREE.Vector3(x, -0.3, 15.4)); H_FIRE.emit(p.x, p.y, p.z, rand(-1, 1), rand(-1, 1), 10, 0.25, 2.4, 0.6, COL.exhaust, COL.exhaustE, 0.6); }
  H_SMOKE.update(dt); H_FIRE.update(dt);
}
