// 월드: 하늘·낮밤·지형·포트·광맥
import { THREE, Q, renderer, camera, rand, clamp, lerp, smooth, Particles, TEX_SOFT, TEX_SMOKE, canvasTex, put, finish, box, cyl, HPI, addProto, frameYield } from './core.js';
import { Sky } from '../vendor/addons/objects/Sky.js';
import { WORLD, PORT_DEFS, ORES, rollOre } from './data.js';

export const scene = new THREE.Scene();
export const FOG = new THREE.Fog(0xcbb79e, 1500, 7800);
scene.fog = FOG;

/* ---------- 하늘 / 낮밤 ---------- */
const SUN_DIR = new THREE.Vector3();
function makeSky(scale) {
  const s = new Sky(); s.scale.setScalar(scale);
  const u = s.material.uniforms; u.turbidity.value = 6; u.rayleigh.value = 1.3; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.86;
  return s;
}
const sky = makeSky(9000); sky.material.depthWrite = false; scene.add(sky);
const envScene = new THREE.Scene(), envSky = makeSky(50); envScene.add(envSky);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null, envTimer = 0;
function rebuildEnv() { const rt = pmrem.fromScene(envScene, 0, 0.1, 100); scene.environment = rt.texture; if (envRT) envRT.dispose(); envRT = rt; }

const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x8a5a34, 0.55); scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xffe2b8, 3.2); scene.add(sun); scene.add(sun.target);
const moon = new THREE.DirectionalLight(0x6f8cff, 0); scene.add(moon); scene.add(moon.target);
if (Q.shadow) {
  sun.castShadow = true; sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  const sc = sun.shadow.camera; sc.left = sc.bottom = -260; sc.right = sc.top = 260; sc.near = 10; sc.far = 4000;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
}
export const flash = new THREE.PointLight(0xffa050, 0, 700, 0); scene.add(flash);
// 별
const stars = (() => {
  const n = 2500, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y) * 0.9 + 0.05; v.normalize().multiplyScalar(8000); p.set([v.x, v.y, v.z], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(m); return m;
})();

export const DAY = { tod: 0.4, len: 480, light: 1, night: 0, label: '' };
const FOG_DAY = new THREE.Color(0xcbb79e), FOG_SET = new THREE.Color(0xd98d5f), FOG_NIGHT = new THREE.Color(0x0c1220);
export const envMats = [];   // 밤에 환경광 세기를 줄일 재질들
function applyDay(force) {
  const el = 72 * Math.sin((DAY.tod - 0.25) * Math.PI * 2), az = DAY.tod * 360 + 120;
  SUN_DIR.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - el), THREE.MathUtils.degToRad(az));
  sky.material.uniforms.sunPosition.value.copy(SUN_DIR); envSky.material.uniforms.sunPosition.value.copy(SUN_DIR);
  const day = smooth(-4, 12, el), set = smooth(25, 4, el) * smooth(-6, 2, el);
  DAY.light = day; DAY.night = 1 - smooth(-8, 2, el); DAY.el = el;
  sun.intensity = 3.2 * day; sun.color.setHSL(0.09, 0.6, lerp(0.62, 0.85, smooth(4, 30, el)));
  moon.intensity = 0.45 * DAY.night;
  hemi.intensity = lerp(0.14, 0.55, day); hemi.color.set(day > 0.5 ? 0xbcd8ff : 0x4a5a88);
  const fc = FOG_NIGHT.clone().lerp(FOG_DAY, day).lerp(FOG_SET, set * 0.7);
  FOG.color.copy(fc);
  stars.material.opacity = DAY.night;
  renderer.toneMappingExposure = lerp(0.85, 0.62, day);
  for (const m of envMats) m.envMapIntensity = (m.userData.envBase ?? 1) * lerp(0.08, 1, day);
  envTimer -= 1; if (force || envTimer <= 0) { rebuildEnv(); envTimer = 360; }
  const h = (DAY.tod * 24 + 0) % 24; DAY.label = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
}

/* ---------- 지형 ---------- */
function hash(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967295; }
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
function terrainBase(x, z) {
  const base = fbm(x * 0.0005, z * 0.0005, 5);
  const mesa = smooth(0.52, 0.6, fbm(x * 0.00034 + 17, z * 0.00034 - 9, 3));
  let h = base * 280 - 70 + mesa * 340;
  const r = Math.abs(fbm(x * 0.00036 - 31, z * 0.00036 + 5, 3) - 0.5) * 2;
  h = h * (0.12 + 0.88 * smooth(0.03, 0.28, r)) - 45 * (1 - smooth(0, 0.09, r));
  const T = 44, t = h / T, fl = Math.floor(t);
  return T * (fl + smooth(0.6, 1, t - fl)) * 0.85 + h * 0.15;
}
export const ports = PORT_DEFS.map(d => ({ def: d, x: d.x, z: d.z, ground: clamp(terrainBase(d.x, d.z), 30, 200) }));
export function terrainH(x, z) {
  let h = terrainBase(x, z);
  for (const p of ports) { const dx = x - p.x, dz = z - p.z, d2 = dx * dx + dz * dz; if (d2 < 340 * 340) h = lerp(p.ground, h, smooth(175, 340, Math.sqrt(d2))); }
  return h;
}
const PAD = 58;  // 착륙장 반폭
export function groundAt(x, z) {
  for (const p of ports) if (Math.abs(x - p.x) < PAD && Math.abs(z - p.z) < PAD) return p.ground + 7;
  return Math.max(terrainH(x, z), 2);
}
const STRATA = [0x9a4a2a, 0xb8643a, 0xc98552, 0xa85634, 0xd9a36b, 0x8e4428, 0xc27445, 0xe0b27a].map(c => new THREE.Color(c));
function buildTerrain(size, seg, sink) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); let h = terrainH(x, z); if (sink && Math.abs(x) < sink && Math.abs(z) < sink) h -= 60; p.setY(i, h); }
  g.computeVertexNormals();
  const n = g.attributes.normal, cols = new Float32Array(p.count * 3), c = new THREE.Color();
  const sand = new THREE.Color(0xe2bd86), wet = new THREE.Color(0x5e3a24), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = n.getY(i);
    const band = Math.floor((y + vnoise(x * 0.004, z * 0.004) * 18) / 22);
    c.copy(STRATA[((band % 8) + 8) % 8]);
    tmp.copy(sand).offsetHSL(0, 0, (vnoise(x * 0.01, z * 0.01) - 0.5) * 0.08);
    c.lerp(tmp, smooth(0.8, 0.95, ny));
    if (y < 10) c.lerp(wet, smooth(10, -5, y));
    c.offsetHSL(0, 0, (hash(i, 7) - 0.5) * 0.04);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, flatShading: true }); mat.userData.envBase = 0.4; envMats.push(mat);
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m;
}

/* ---------- 파티클 ---------- */
export let FIRE, SMOKE, CLOUD;

/* ---------- 포트 ---------- */
function deckTexture() {
  return canvasTex(1024, 1024, (x, W) => {
    x.fillStyle = '#2b2b2a'; x.fillRect(0, 0, W, W);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { x.fillStyle = `hsl(40,4%,${rand(14, 20)}%)`; x.fillRect(i * 64 + 1, j * 64 + 1, 62, 62); }
    x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = 3; for (let i = 0; i <= W; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, W); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(W, i); x.stroke(); }
    const stripe = (x0, y0, w, h) => { x.save(); x.beginPath(); x.rect(x0, y0, w, h); x.clip(); x.fillStyle = '#d8d4c8'; x.fillRect(x0, y0, w, h); x.fillStyle = '#b8261d'; for (let k = -W; k < W * 2; k += 40) { x.beginPath(); x.moveTo(k, y0); x.lineTo(k + 20, y0); x.lineTo(k + 20 + h, y0 + h); x.lineTo(k + h, y0 + h); x.fill(); } x.restore(); };
    stripe(40, 40, W - 80, 26); stripe(40, W - 66, W - 80, 26); stripe(40, 40, 26, W - 80); stripe(W - 66, 40, 26, W - 80);
    x.strokeStyle = '#c9c2b0'; x.lineWidth = 10; x.beginPath(); x.arc(W / 2, W / 2, 190, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 6; x.beginPath(); x.arc(W / 2, W / 2, 120, 0, Math.PI * 2); x.stroke();
    for (let a = 0; a < 8; a++) { const r = a * Math.PI / 4; x.beginPath(); x.moveTo(W / 2 + Math.cos(r) * 140, W / 2 + Math.sin(r) * 140); x.lineTo(W / 2 + Math.cos(r) * 175, W / 2 + Math.sin(r) * 175); x.stroke(); }
    x.fillStyle = '#b8261d'; x.beginPath(); x.arc(W / 2, W / 2, 14, 0, 7); x.fill();
    x.fillStyle = 'rgba(216,212,200,.75)'; for (let k = 0; k < 6; k++) { x.fillRect(110 + k * 22, 150, 12, 220); x.fillRect(W - 240 + k * 22, W - 370, 12, 220); }
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(0,0,0,${rand(0.05, 0.18)})`; x.beginPath(); x.arc(rand(0, W), rand(0, W), rand(2, 18), 0, 7); x.fill(); }
  });
}
const PORT_MAT = {
  deckTop: null,
  hull: new THREE.MeshStandardMaterial({ color: 0x3a3936, roughness: 0.75, metalness: 0.55 }),
  armor: new THREE.MeshStandardMaterial({ color: 0x55524a, roughness: 0.7, metalness: 0.5 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x6d6c66, roughness: 0.4, metalness: 0.85 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1f1f1e, roughness: 0.6, metalness: 0.6 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x7a4a30, roughness: 0.85, metalness: 0.3 }),
  red: new THREE.MeshStandardMaterial({ color: 0x9c2a20, roughness: 0.6, metalness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x0e1a24, emissive: 0xffc070, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.9 }),
  lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.2, 0.8), toneMapped: false }),
  beacon: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.4, 0.3), toneMapped: false }),
};
for (const k of ['hull', 'armor', 'metal', 'dark', 'rust', 'red']) envMats.push(PORT_MAT[k]);
function buildPortProto() {
  const B = {};
  put(B, 'hull', box(2 * PAD, 6, 2 * PAD), 0, 3, 0);
  for (const s of [-1, 1]) for (const t of [-1, 1]) { put(B, 'armor', cyl(5, 6, 6, 10), s * (PAD + 2), 3.5, t * (PAD + 2)); put(B, 'dark', cyl(5.3, 5.3, 0.8, 10), s * (PAD + 2), 6.8, t * (PAD + 2)); }
  // 화물 창고 (골진 지붕)
  put(B, 'hull', box(36, 12, 2 * PAD - 10), PAD + 20, 6, 0);
  for (let i = -6; i <= 6; i++) put(B, 'armor', box(38, 1, 3), PAD + 20, 12.6, i * 8.5);
  put(B, 'dark', box(0.4, 8, 26), PAD + 1.8, 4.5, -20); put(B, 'dark', box(0.4, 8, 26), PAD + 1.8, 4.5, 20);
  // 관제탑
  put(B, 'hull', box(18, 16, 18), -PAD - 18, 8, -PAD + 18); put(B, 'armor', box(22, 6, 22), -PAD - 18, 19, -PAD + 18);
  put(B, 'glass', box(22.2, 2.2, 22.2), -PAD - 18, 19.5, -PAD + 18); put(B, 'dark', box(14, 2, 14), -PAD - 18, 23, -PAD + 18);
  put(B, 'metal', cyl(0.4, 0.5, 18, 6), -PAD - 18, 33, -PAD + 18); put(B, 'metal', box(6, 0.4, 0.4), -PAD - 18, 38, -PAD + 18);
  for (let i = 0; i < 4; i++) put(B, 'metal', box(26, 0.4, 0.4), -PAD - 18, 22.5, -PAD + 18 + (i - 1.5) * 7, 0, 0, 0);
  // 연료 탱크
  for (let i = 0; i < 3; i++) { const z = -30 + i * 30; put(B, 'rust', cyl(5, 5, 26, 14), -PAD - 14, 7, z, 0, 0, HPI); put(B, 'dark', cyl(5.2, 5.2, 0.6, 14), -PAD - 14, 7, z, 0, 0, HPI); put(B, 'metal', box(1.4, 6, 1.4), -PAD - 4, 3, z); put(B, 'dark', cyl(0.7, 0.7, 12, 6), -PAD - 4, 6, z, 0, 0, HPI); }
  // 크레인
  put(B, 'red', box(3, 34, 3), PAD + 6, 17, PAD + 8); put(B, 'red', box(3, 3, 40), PAD + 6, 34, PAD - 8); put(B, 'dark', box(1, 10, 1), PAD + 6, 28, PAD - 24);
  // 컨테이너
  const cc = ['red', 'metal', 'rust', 'armor'];
  for (let i = 0; i < 9; i++) put(B, cc[i % 4], box(14, 6, 6), PAD - 14 - (i % 3) * 15, 9 + Math.floor(i / 3) * 6, -PAD + 8 + (i % 2) * 0.3);
  return finish(B, []);
}
let PORT_PROTO = null;
function buildPort(p) {
  const g = new THREE.Group(); g.position.set(p.x, p.ground, p.z);
  addProto(g, PORT_PROTO, PORT_MAT, { hull: 1, armor: 1, metal: 1, dark: 1, rust: 1, red: 1 });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(2 * PAD - 2, 2 * PAD - 2), PORT_MAT.deckTop); top.rotation.x = -HPI; top.position.y = 6.05; top.receiveShadow = true; g.add(top);
  // 가장자리 조명
  const pts = [];
  for (let k = -PAD + 4; k <= PAD - 4; k += 6) { pts.push([k, PAD - 3], [k, -PAD + 3], [PAD - 3, k], [-PAD + 3, k]); }
  for (let k = -30; k <= 30; k += 7.5) { pts.push([k, 30], [k, -30], [30, k], [-30, k]); }
  const lamps = new THREE.InstancedMesh(box(0.9, 0.5, 0.9), PORT_MAT.lamp, pts.length); const mm = new THREE.Matrix4();
  pts.forEach((q, i) => lamps.setMatrixAt(i, mm.makeTranslation(q[0], 6.3, q[1]))); g.add(lamps);
  const big = new THREE.InstancedMesh(box(1.6, 1, 1.6), PORT_MAT.lamp, 4); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((q, i) => big.setMatrixAt(i, mm.makeTranslation(q[0] * (PAD + 2), 7.7, q[1] * (PAD + 2)))); g.add(big);
  const beacon = new THREE.Mesh(box(1.4, 1.4, 1.4), PORT_MAT.beacon); beacon.position.set(-PAD - 18, 42.5, -PAD + 18); g.add(beacon);
  // 도킹 홀로그램 링
  const ring = new THREE.Mesh(new THREE.TorusGeometry(22, 0.35, 6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 3.2, 3.4), toneMapped: false, transparent: true, opacity: 0.8 }));
  ring.rotation.x = -HPI; ring.position.y = 9; g.add(ring);
  const lamp = new THREE.PointLight(0xffc070, 0, 200, 1.4); lamp.position.set(0, 30, 0); g.add(lamp);
  scene.add(g);
  Object.assign(p, { group: g, deck: p.ground + 6, ring, beacon, lamp });
}

/* ---------- 광맥 ---------- */
export const ores = [];
const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a4a33, roughness: 0.95, flatShading: true }); envMats.push(rockMat);
const oreMats = {};
for (const k in ORES) { const o = ORES[k]; oreMats[k] = new THREE.MeshStandardMaterial({ color: o.col, emissive: o.col, emissiveIntensity: o.glow, roughness: 0.25, metalness: 0.65, flatShading: true }); envMats.push(oreMats[k]); }
const crystalGeos = [], rockGeos = [];
function buildOreGeos() {
  for (let v = 0; v < 4; v++) {
    const B = {};
    put(B, 'rock', new THREE.DodecahedronGeometry(9, 0), 0, 2, 0, rand(0, 3), rand(0, 3), 0);
    put(B, 'rock', new THREE.DodecahedronGeometry(6, 0), rand(-8, 8), 0, rand(-8, 8), rand(0, 3), rand(0, 3), 0);
    for (let i = 0; i < 7; i++) { const h = rand(5, 13), r = rand(1.2, 2.6); put(B, 'cry', new THREE.OctahedronGeometry(1, 0).scale(r, h, r), rand(-7, 7), 6 + h * 0.3, rand(-7, 7), rand(-0.5, 0.5), rand(0, 3), rand(-0.5, 0.5)); }
    const f = finish(B, []); rockGeos.push(f.rock); crystalGeos.push(f.cry);
  }
}
function placeOre(node) {
  for (let tries = 0; tries < 300; tries++) {
    const x = rand(-WORLD * 0.9, WORLD * 0.9), z = rand(-WORLD * 0.9, WORLD * 0.9), h = terrainH(x, z);
    if (h < 12) continue;
    if (ports.some(p => Math.hypot(p.x - x, p.z - z) < 380)) continue;
    if (ores.some(o => o !== node && o.alive && Math.hypot(o.x - x, o.z - z) < 220)) continue;
    node.x = x; node.z = z; node.y = h; break;
  }
  node.type = rollOre(); node.max = node.amount = Math.round(rand(40, 110) * (node.type === 'aether' ? 0.5 : 1));
  node.alive = true; node.respawn = 0;
  node.group.position.set(node.x, node.y - 2, node.z); node.group.rotation.y = rand(0, 6);
  node.cry.material = oreMats[node.type]; node.group.visible = true; node.group.scale.setScalar(1);
}
function makeOres(n) {
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group(), v = i % 4;
    const rock = new THREE.Mesh(rockGeos[v], rockMat), cry = new THREE.Mesh(crystalGeos[v], oreMats.copper);
    rock.castShadow = cry.castShadow = true; rock.receiveShadow = true; g.add(rock, cry); scene.add(g);
    const node = { group: g, cry, alive: false }; ores.push(node); placeOre(node);
  }
}
export function depleteOre(node) { node.alive = false; node.group.visible = false; node.respawn = rand(45, 80); }

/* ---------- 식생 ---------- */
function makePalms() {
  const B = {};
  put(B, 'trunk', cyl(0.5, 0.9, 16, 6), 0, 8, 0, 0.12, 0, 0.1);
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; put(B, 'leaf', box(1.6, 0.2, 9), Math.cos(a) * 4 + 1, 15.6, Math.sin(a) * 4 + 1.6, 0.35, -a + HPI, 0); }
  const f = finish(B, []);
  const N = 70, tr = new THREE.InstancedMesh(f.trunk, new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.9 }), N), lf = new THREE.InstancedMesh(f.leaf, new THREE.MeshStandardMaterial({ color: 0x4f6b2a, roughness: 0.8, side: THREE.DoubleSide }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(); let k = 0;
  for (let t = 0; t < 2000 && k < N; t++) {
    const p = ports[k % ports.length], a = rand(0, 6.28), r = rand(150, 420); const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, h = terrainH(x, z);
    if (h < 6 || Math.abs(h - p.ground) > 60) continue;
    const sc = rand(0.8, 1.4); m.compose(new THREE.Vector3(x, h - 0.5, z), q.setFromEuler(new THREE.Euler(0, rand(0, 6), 0)), s.set(sc, sc, sc));
    tr.setMatrixAt(k, m); lf.setMatrixAt(k, m); k++;
  }
  tr.count = lf.count = k; tr.castShadow = lf.castShadow = true; scene.add(tr, lf);
}
function makeSpires() {
  const geo = new THREE.CylinderGeometry(0.55, 1, 1, 7, 3); const pp = geo.attributes.position;
  for (let i = 0; i < pp.count; i++) { const k = 1 + (hash(i, 3) - 0.5) * 0.35; pp.setX(i, pp.getX(i) * k); pp.setZ(i, pp.getZ(i) * k); }
  geo.computeVertexNormals();
  const N = 200, mat = new THREE.MeshStandardMaterial({ color: 0xb0603a, roughness: 0.95, flatShading: true }); envMats.push(mat);
  const im = new THREE.InstancedMesh(geo, mat, N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(); let k = 0, tries = 0;
  while (k < N && tries++ < 5000) {
    const x = rand(-WORLD * 1.3, WORLD * 1.3), z = rand(-WORLD * 1.3, WORLD * 1.3), h = terrainH(x, z); if (h < 12) continue;
    if (ports.some(p => Math.hypot(p.x - x, p.z - z) < 300)) continue;
    const hh = rand(50, 200), r = rand(10, 28);
    m.compose(new THREE.Vector3(x, h + hh / 2 - 6, z), q.setFromEuler(e.set(rand(-0.08, 0.08), rand(0, 6), rand(-0.08, 0.08))), new THREE.Vector3(r, hh, r));
    im.setMatrixAt(k, m); im.setColorAt(k, STRATA[k % 8].clone().offsetHSL(0, 0, 0.05)); k++;
  }
  im.count = k; im.castShadow = im.receiveShadow = true; scene.add(im);
}

/* ---------- 빌드 (로딩 화면에서 단계별 호출) ---------- */
export async function buildWorld(progress) {
  progress('STREAMING ASSETS', 0.25);
  FIRE = new Particles(scene, Math.round(9000 * Q.fx) + 1000, TEX_SOFT, true);
  SMOKE = new Particles(scene, Math.round(7000 * Q.fx) + 1000, TEX_SMOKE, false);
  CLOUD = new Particles(scene, 1400, TEX_SMOKE, false);
  for (let i = 0; i < 60; i++) {
    const cx = rand(-WORLD * 1.7, WORLD * 1.7), cz = rand(-WORLD * 1.7, WORLD * 1.7), cy = rand(950, 1400);
    for (let k = 0; k < 18; k++) { const sh = rand(0.85, 1) * 2.05; CLOUD.emit(cx + rand(-260, 260), cy + rand(-30, 50) * (k % 3), cz + rand(-180, 180), 0, 0, 0, 1e9, rand(260, 480), 0, [sh, sh, sh * 0.98], [sh, sh, sh * 0.98], 1.15); }
  }
  CLOUD.update(0);
  PORT_MAT.deckTop = new THREE.MeshStandardMaterial({ map: deckTexture(), roughness: 0.8, metalness: 0.4 }); envMats.push(PORT_MAT.deckTop);
  await frameYield();
  progress('GENERATING TERRAIN', 0.4);
  const INNER = WORLD * 2.6;
  scene.add(buildTerrain(INNER, Q.seg, 0)); await frameYield();
  scene.add(buildTerrain(INNER * 3.2, 96, INNER / 2 - 40)); await frameYield();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(INNER * 3.2, INNER * 3.2), new THREE.MeshStandardMaterial({ color: 0x2f6a6c, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.88 }));
  water.rotation.x = -HPI; water.position.y = 2; water.receiveShadow = true; scene.add(water); envMats.push(water.material);
  makeSpires(); makePalms(); await frameYield();
  progress('BUILDING PORTS', 0.6);
  PORT_PROTO = buildPortProto(); for (const p of ports) buildPort(p);
  buildOreGeos(); makeOres(34);
  await frameYield();
  applyDay(true);
}

/* ---------- 프레임 업데이트 ---------- */
const FOG_LIN = new THREE.Color();
export function updateWorld(dt, focus) {
  DAY.tod = (DAY.tod + dt / DAY.len * (DAY.night > 0.5 ? 1.8 : 1)) % 1;
  applyDay(false);
  sky.position.copy(camera.position); stars.position.copy(camera.position);
  if (focus) { sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(SUN_DIR, 1800); moon.target.position.copy(focus); moon.position.copy(focus).addScaledVector(SUN_DIR, -1800); }
  flash.intensity *= Math.exp(-dt * 7);
  FOG_LIN.copy(FOG.color);
  for (const ps of [FIRE, SMOKE, CLOUD]) { ps.mat.uniforms.fogColor.value.copy(FOG_LIN); ps.mat.uniforms.fogNear.value = FOG.near; ps.mat.uniforms.fogFar.value = FOG.far; }
  SMOKE.mat.uniforms.light.value = lerp(0.12, 1, DAY.light); CLOUD.mat.uniforms.light.value = lerp(0.06, 1, DAY.light);
  const t = performance.now() / 1000, blink = (t % 1.4) < 0.2 ? 1 : 0.1;
  PORT_MAT.beacon.color.setRGB(6 * blink, 0.4 * blink, 0.3 * blink);
  PORT_MAT.glass.emissiveIntensity = lerp(2.2, 0.4, DAY.light);
  for (const p of ports) { p.ring.rotation.z = t * 0.6; p.ring.material.opacity = 0.5 + Math.sin(t * 3) * 0.25; p.lamp.intensity = DAY.night * 900; }
  for (const k in oreMats) oreMats[k].emissiveIntensity = ORES[k].glow * (1 + DAY.night * 1.5) + DAY.night * 0.3;
  for (const o of ores) if (!o.alive) { o.respawn -= dt; if (o.respawn <= 0) placeOre(o); }
  FIRE.update(dt); SMOKE.update(dt);
}
export function nearestPort(pos) { let b = null, bd = 1e9; for (const p of ports) { const d = Math.hypot(p.x - pos.x, p.z - pos.z); if (d < bd) { bd = d; b = p; } } return [b, bd]; }
export const homePort = () => ports[0];
