// 월드: 하늘·낮밤·지형·포트·광맥
import { FXS, THREE, Q, renderer, camera, rand, clamp, lerp, smooth, Particles, TEX_SOFT, TEX_SMOKE, canvasTex, put, finish, box, cyl, HPI, addProto, frameYield, mergeGeometries } from './core.js';
import { Sky } from '../vendor/addons/objects/Sky.js';
import { WORLD, PORT_DEFS, ORES, rollOre } from './data.js';

export const scene = new THREE.Scene();
export const FOG = new THREE.Fog(0xcbb79e, 1500, 7800);
scene.fog = FOG;

/* ---------- 하늘 / 낮밤 ---------- */
const SUN_DIR = new THREE.Vector3();
function makeSky(scale) {
  const s = new Sky(); s.scale.setScalar(scale);
  // 태양 원반이 만드는 극단적인 밝기를 제한해 블룸이 화면 전체를 덮지 않게 한다
  s.material.fragmentShader = s.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( min( retColor, vec3( 3.2 ) ), 1.0 );'); s.material.needsUpdate = true;
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

export const WEATHER = { storm: 0, target: 0, timer: 200, wind: new THREE.Vector3(1, 0, 0.3).normalize(), onChange: null };
const STORM_COL = new THREE.Color(0xb98556);
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
  moon.intensity = 0.95 * DAY.night;
  hemi.intensity = lerp(0.3, 0.55, day); hemi.color.set(day > 0.5 ? 0xbcd8ff : 0x4a5a88);
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
  const sand = new THREE.Color(0xe2bd86), wet = new THREE.Color(0x5e3a24), tmp = new THREE.Color(), grass = new THREE.Color(0x7e8e42);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = n.getY(i);
    const band = Math.floor((y + vnoise(x * 0.004, z * 0.004) * 18) / 22);
    c.copy(STRATA[((band % 8) + 8) % 8]);
    tmp.copy(sand).offsetHSL(0, 0, (vnoise(x * 0.01, z * 0.01) - 0.5) * 0.08);
    c.lerp(tmp, smooth(0.8, 0.95, ny));
    if (y > 4 && y < 46) c.lerp(grass, smooth(0.86, 0.98, ny) * smooth(46, 12, y) * (0.55 + vnoise(x * 0.006 + 3, z * 0.006) * 0.6));   // 강가 풀밭
    if (y < 10) c.lerp(wet, smooth(10, -5, y));
    c.offsetHSL(0, 0, (hash(i, 7) - 0.5) * 0.04);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const dm = DETAIL.map.clone(), dn = DETAIL.nrm.clone(); for (const t of [dm, dn]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(size / 60, size / 60); t.needsUpdate = true; }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: dm, normalMap: dn, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.94, metalness: 0, flatShading: true }); mat.userData.envBase = 0.4; envMats.push(mat);
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m;
}

/* ---------- 디테일 텍스처 / 노멀맵 ---------- */
export function nrmFromHeight(hc, strength = 2.5) {
  const W = hc.width, H = hc.height, src = hc.getContext('2d').getImageData(0, 0, W, H).data;
  const out = document.createElement('canvas'); out.width = W; out.height = H; const o = out.getContext('2d'), img = o.createImageData(W, H);
  const at = (x, y) => src[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  o.putImageData(img, 0, 0); return out;
}
const DETAIL = (() => {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d');
  const im = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = 0.5 * vnoise(i / 16, j / 16) + 0.3 * vnoise(i / 5 + 40, j / 5) + 0.2 * Math.sin((j + vnoise(i / 30, j / 30) * 30) / 3.5) * 0.5 + 0.1;   // 모래 물결 + 바위 결
    const g = Math.round(205 + v * 50), k = (j * N + i) * 4; im.data[k] = g; im.data[k + 1] = g; im.data[k + 2] = g; im.data[k + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const nrm = new THREE.CanvasTexture(nrmFromHeight(c, 3)); nrm.anisotropy = 8;
  return { map, nrm };
})();
const WATER_NRM = (() => {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = (Math.sin(i / N * Math.PI * 8 + vnoise(i / 20, j / 20) * 5) + Math.sin(j / N * Math.PI * 6 + vnoise(i / 14 + 9, j / 14) * 6)) * 0.25 + 0.5;
    const g = Math.round(v * 255), k = (j * N + i) * 4; im.data[k] = g; im.data[k + 1] = g; im.data[k + 2] = g; im.data[k + 3] = 255;
  }
  x.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(nrmFromHeight(c, 4)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(120, 120); return t;
})();
let waterMat = null, waterMat2 = null, sunSprite = null;

/* ---------- 부유섬 ---------- */
export const islands = [];
export function islandPush(s) {
  for (const I of islands) {
    const dx = s.pos.x - I.x, dz = s.pos.z - I.z, d = Math.hypot(dx, dz); if (d > I.r + s.radius) continue;
    const top = I.y, bot = I.y - I.h;
    if (s.pos.y > top - 6 && s.pos.y < top + s.hover && d < I.r * 0.95) { s.pos.y = top + s.hover; if (s.vel.y < 0) s.vel.y = 0; continue; }
    if (s.pos.y <= top - 6 && s.pos.y > bot) {
      const rr = I.r * Math.pow(clamp((s.pos.y - bot) / I.h, 0, 1), 0.7) + s.radius * 0.55;
      if (d < rr && d > 0.01) { const k = (rr - d) / d; s.pos.x += dx * k; s.pos.z += dz * k; const vn = (s.vel.x * dx + s.vel.z * dz) / d; if (vn < 0) { s.vel.x -= dx / d * vn; s.vel.z -= dz / d * vn; } }
    }
  }
}
export function islandAt(x, z) { for (const I of islands) if (Math.hypot(x - I.x, z - I.z) < I.r * 0.9) return I; return null; }
export function surfaceBelow(x, y, z) { let g = groundAt(x, z); for (const I of islands) if (y >= I.y - 3 && Math.hypot(x - I.x, z - I.z) < I.r * 0.92) g = Math.max(g, I.y); return g; }
function makeIslands() {
  const B = {}, centers = [];
  const add = (x, z, r, y) => { centers.push({ x, z, r, y, h: r * rand(1.4, 2) }); };
  for (let i = 0; i < 16; i++) { const a = rand(0, 6.28), d = rand(0, 1150); add(300 + Math.cos(a) * d, -500 + Math.sin(a) * d, rand(55, 135), rand(430, 680)); }
  for (let i = 0; i < 6; i++) add(rand(-WORLD * 0.8, WORLD * 0.8), rand(-WORLD * 0.8, WORLD * 0.8), rand(50, 100), rand(500, 760));
  for (const c of centers) {
    if (ports.some(p => Math.hypot(p.x - c.x, p.z - c.z) < 500)) continue;
    if (islands.some(o => Math.hypot(o.x - c.x, o.z - c.z) < o.r + c.r + 60)) continue;
    c.y = Math.max(c.y, terrainH(c.x, c.z) + c.h + 120); islands.push(c);
    const g = new THREE.CylinderGeometry(c.r, c.r * 0.08, c.h, 18, 7), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + (vnoise(Math.cos(a) * 3 + c.x, y / 25 + c.z) - 0.5) * 0.5;
      if (y > c.h / 2 - 0.1) { p.setY(i, y + (vnoise(x / 20 + c.x, z / 20) - 0.5) * 6); p.setX(i, x * (Math.hypot(x, z) > c.r * 0.9 ? k : 1)); p.setZ(i, z * (Math.hypot(x, z) > c.r * 0.9 ? k : 1)); }
      else { p.setX(i, x * k); p.setZ(i, z * k); }
    }
    g.translate(c.x, c.y - c.h / 2, c.z); g.computeVertexNormals();
    const col = new Float32Array(p.count * 3), cc = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) - c.y;
      if (y > -2) cc.set(0x8fa04a).offsetHSL(0, 0, (Math.random() - 0.5) * 0.06); else if (y > -7) cc.set(0xc9a36b); else cc.copy(STRATA[(Math.floor(-y / 14) + 3) % 8]);
      col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); (B.rock = B.rock || []).push(g.toNonIndexed());
    // 떠다니는 파편 바위
    for (let k = 0; k < 4; k++) { const rg = new THREE.DodecahedronGeometry(rand(5, 14), 0); rg.translate(c.x + rand(-c.r, c.r) * 1.2, c.y - c.h * rand(0.4, 1.1), c.z + rand(-c.r, c.r) * 1.2); const n = rg.attributes.position.count, cl = new Float32Array(n * 3); for (let i = 0; i < n; i++) { cl[i * 3] = 0.6; cl[i * 3 + 1] = 0.33; cl[i * 3 + 2] = 0.2; } rg.setAttribute('color', new THREE.BufferAttribute(cl, 3)); rg.deleteAttribute('uv'); B.rock.push(rg); }
  }
  if (!B.rock) return;
  const geo = mergeGeometries(B.rock, false); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }); envMats.push(mat);
  const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; scene.add(m);
}

/* ---------- 바위 아치 ---------- */
function makeArches() {
  const geos = [];
  for (let k = 0, tries = 0; k < 9 && tries < 400; tries++) {
    const x = rand(-WORLD * 0.85, WORLD * 0.85), z = rand(-WORLD * 0.85, WORLD * 0.85), h = terrainH(x, z);
    if (h < 15 || ports.some(p => Math.hypot(p.x - x, p.z - z) < 450) || islands.some(I => Math.hypot(I.x - x, I.z - z) < I.r + 200)) continue;
    const span = rand(170, 280), height = rand(120, 210), yaw = rand(0, 6.28), pts = [];
    for (let i = 0; i <= 16; i++) { const a = Math.PI * i / 16; pts.push(new THREE.Vector3(Math.cos(a) * span / 2, Math.sin(a) * height - 20, 0)); }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, rand(14, 22), 8, false), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const n = (vnoise(p.getX(i) / 18 + k * 7, p.getY(i) / 18) - 0.5) * 9; p.setX(i, p.getX(i) + n); p.setZ(i, p.getZ(i) + n * 0.8); }
    g.rotateY(yaw); g.translate(x, h, z); g.computeVertexNormals();
    const col = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const c = STRATA[Math.floor((p.getY(i)) / 20) % 8 | 0] || STRATA[0]; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); geos.push(g.toNonIndexed()); k++;
  }
  if (!geos.length) return;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }); envMats.push(mat);
  const m = new THREE.Mesh(mergeGeometries(geos, false), mat); m.castShadow = m.receiveShadow = true; scene.add(m);
}
/* 난파선 위치 (모델은 main.js 에서 생성) */
export const WRECKS = [];
function pickWrecks() {
  for (let k = 0, tries = 0; k < 7 && tries < 300; tries++) {
    const x = 2350 + rand(-520, 520), z = -350 + rand(-650, 650), h = terrainH(x, z);
    if (h < 6 || ports.some(p => Math.hypot(p.x - x, p.z - z) < 330) || WRECKS.some(w => Math.hypot(w.x - x, w.z - z) < 230)) continue;
    WRECKS.push({ x, z, y: h, yaw: rand(0, 6.28), roll: rand(-0.5, 0.5), pitch: rand(-0.25, 0.1), scale: rand(3.2, 5) }); k++;
  }
}

/* ---------- 파티클 ---------- */
export let FIRE, SMOKE, CLOUD;

/* ---------- 지형 디테일: 바위 · 덤불 · 풀 (인스턴스) ---------- */
function makeScatter() {
  const N = { rock: Math.round(900 * Q.scatter), bush: Math.round(1100 * Q.scatter), tuft: Math.round(1300 * Q.scatter) };
  const placed = [];
  const spot = (minH, maxH, minNy) => {
    for (let t = 0; t < 40; t++) {
      const x = rand(-WORLD * 1.15, WORLD * 1.15), z = rand(-WORLD * 1.15, WORLD * 1.15), h = terrainH(x, z);
      if (h < minH || h > maxH) continue; if (ports.some(p => Math.hypot(p.x - x, p.z - z) < 220)) continue;
      const e = 8, nx = terrainH(x + e, z) - terrainH(x - e, z), nz = terrainH(x, z + e) - terrainH(x, z - e), ny = 1 / Math.hypot(nx / (2 * e), 1, nz / (2 * e));
      if (ny < minNy) continue; return [x, h, z, ny];
    } return null;
  };
  // 바위: 깨진 다면체
  const rg = new THREE.IcosahedronGeometry(1, 1), rp = rg.attributes.position;
  for (let i = 0; i < rp.count; i++) { const k = 0.75 + hash(i, 11) * 0.5; rp.setXYZ(i, rp.getX(i) * k, rp.getY(i) * k * 0.7, rp.getZ(i) * k); }
  rg.computeVertexNormals();
  const rock = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), N.rock); envMats.push(rock.material);
  // 덤불: 뾰족한 원뿔 + 줄기
  const bg = new THREE.ConeGeometry(1, 2.2, 5, 1); bg.translate(0, 1.1, 0);
  const bush = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), N.bush); envMats.push(bush.material);
  const tg = new THREE.PlaneGeometry(1, 1); tg.translate(0, 0.5, 0);
  const tuft = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide, alphaTest: 0.5, map: TUFT_TEX }), N.tuft); envMats.push(tuft.material);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), c = new THREE.Color();
  let k = 0;
  while (k < N.rock) { const p = spot(6, 520, 0.25); if (!p) break; const s = rand(1.2, 7) * (p[3] < 0.7 ? 1.6 : 1); pos.set(p[0], p[1] + s * 0.15, p[2]); sc.set(s, s, s); m.compose(pos, q.setFromEuler(e.set(rand(0, 6), rand(0, 6), rand(0, 6))), sc); rock.setMatrixAt(k, m); c.copy(STRATA[(k * 7) % 8]).offsetHSL(0, -0.05, rand(-0.08, 0.04)); rock.setColorAt(k++, c); }
  rock.count = k; rock.castShadow = Q.shadow > 0; rock.receiveShadow = true; scene.add(rock);
  k = 0;
  while (k < N.bush) { const p = spot(5, 160, 0.75); if (!p) break; const s = rand(0.7, 2.6); pos.set(p[0], p[1] - 0.2, p[2]); sc.set(s * rand(0.7, 1.2), s * rand(0.8, 1.5), s); m.compose(pos, q.setFromEuler(e.set(0, rand(0, 6), 0)), sc); bush.setMatrixAt(k, m); c.setHSL(rand(0.08, 0.2), rand(0.25, 0.45), rand(0.25, 0.36)); bush.setColorAt(k++, c); }
  bush.count = k; bush.castShadow = false; bush.receiveShadow = true; scene.add(bush);
  k = 0;
  while (k < N.tuft) { const p = spot(4, 70, 0.85); if (!p) break; const s = rand(1.4, 3.4); pos.set(p[0], p[1] - 0.1, p[2]); sc.set(s, s * rand(0.7, 1.2), s); m.compose(pos, q.setFromEuler(e.set(0, rand(0, 6), 0)), sc); tuft.setMatrixAt(k, m); c.setHSL(rand(0.15, 0.26), rand(0.35, 0.6), rand(0.28, 0.4)); tuft.setColorAt(k++, c); }
  tuft.count = k; scene.add(tuft); void placed;
}
const TUFT_TEX = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#fff'; for (let i = 0; i < 9; i++) { const bx = 6 + i * 6 + Math.random() * 3, h = 26 + Math.random() * 34; x.beginPath(); x.moveTo(bx - 3, 64); x.quadraticCurveTo(bx + Math.random() * 6 - 3, 64 - h * 0.6, bx + Math.random() * 10 - 5, 64 - h); x.quadraticCurveTo(bx + 1, 64 - h * 0.5, bx + 3, 64); x.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();

/* ---------- 렌즈 플레어 (태양 반대편으로 이어지는 빛 알갱이) ---------- */
const flareSprites = [];
function makeFlare() {
  const cols = [[1.6, 1.2, 0.7, 150], [0.6, 1.6, 1.4, 90], [1.4, 0.7, 0.5, 220], [0.5, 0.9, 1.7, 70], [1.2, 1.1, 0.8, 120]];
  for (const [r, g, b, size] of cols) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_SOFT, color: new THREE.Color(r, g, b), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, fog: false, toneMapped: false, transparent: true, opacity: 0 }));
    sp.scale.setScalar(size); sp.renderOrder = 20; sp.userData.size = size; scene.add(sp); flareSprites.push(sp);
  }
}
const _fv = new THREE.Vector3();
function updateFlare() {
  _fv.copy(camera.position).addScaledVector(SUN_DIR, 5000).project(camera);
  const vis = DAY.el > -2 && _fv.z < 1 && Math.abs(_fv.x) < 1.15 && Math.abs(_fv.y) < 1.15;
  const k = vis ? smooth(-2, 8, DAY.el) * (1 - WEATHER.storm * 0.85) * (1 - smooth(0.7, 1.25, Math.hypot(_fv.x, _fv.y)) * 0.8) : 0;
  FXS.sunX = clamp((_fv.x + 1) / 2, -0.5, 1.5); FXS.sunY = clamp((_fv.y + 1) / 2, -0.5, 1.5);
  FXS.rays = Q.rays ? k * 0.3 : 0; FXS.night = DAY.night; FXS.sat = 1.08 + 0.08 * DAY.light;
  flareSprites.forEach((sp, i) => {
    const t = [0.4, 0.8, 1.3, 1.7, 2.1][i], nx = _fv.x * (1 - t), ny = _fv.y * (1 - t);
    _fv.set(nx, ny, 0.9).unproject(camera); sp.position.copy(_fv);
    const d = camera.position.distanceTo(sp.position); sp.scale.setScalar(sp.userData.size * d * 0.0016);
    sp.material.opacity = k * (i === 0 ? 0.35 : 0.22) * (vis ? 1 : 0);
    _fv.copy(camera.position).addScaledVector(SUN_DIR, 5000).project(camera);
  });
}


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
  // 관제탑 서치라이트 (밤에만 회전하는 빛 원뿔)
  const sweep = new THREE.Group(); sweep.position.set(-PAD - 18, 40, -PAD + 18);
  for (const a0 of [0, Math.PI]) { const cone = new THREE.Mesh(new THREE.ConeGeometry(14, 160, 20, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true })); cone.geometry.translate(0, -80, 0); cone.rotation.z = Math.PI / 2 - 0.5; cone.rotation.y = a0; sweep.add(cone); }
  g.add(sweep); sweep.visible = false;
  // 착륙장 모서리 빛기둥
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.4, 90, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.4, 0.5), transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); bm.position.set(sx * (PAD + 2), 52, sz * (PAD + 2)); g.add(bm); }
  Object.assign(p, { group: g, deck: p.ground + 6, ring, beacon, lamp, sweep });
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
  node.island = null; let rich = false;
  if (node.onIsland && islands.length) {
    const I = islands[Math.floor(Math.random() * islands.length)], a = rand(0, 6.28), d = rand(0, I.r * 0.45);
    node.x = I.x + Math.cos(a) * d; node.z = I.z + Math.sin(a) * d; node.y = I.y; node.island = I; rich = true;
  } else for (let tries = 0; tries < 300; tries++) {
    const x = rand(-WORLD * 0.9, WORLD * 0.9), z = rand(-WORLD * 0.9, WORLD * 0.9), h = terrainH(x, z);
    if (h < 12) continue;
    if (ports.some(p => Math.hypot(p.x - x, p.z - z) < 380)) continue;
    if (ores.some(o => o !== node && o.alive && Math.hypot(o.x - x, o.z - z) < 220)) continue;
    node.x = x; node.z = z; node.y = h; rich = WRECKS.some(w => Math.hypot(w.x - x, w.z - z) < 450); break;
  }
  node.type = rollOre(rich); node.max = node.amount = Math.round(rand(40, 110) * (node.type === 'aether' ? 0.5 : 1));
  node.alive = true; node.respawn = 0;
  node.group.position.set(node.x, node.y - 2, node.z); node.group.rotation.y = rand(0, 6);
  node.cry.material = oreMats[node.type]; node.group.visible = true; node.group.scale.setScalar(1);
}
function makeOres(n) {
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group(), v = i % 4;
    const rock = new THREE.Mesh(rockGeos[v], rockMat), cry = new THREE.Mesh(crystalGeos[v], oreMats.copper);
    rock.castShadow = cry.castShadow = true; rock.receiveShadow = true; g.add(rock, cry); scene.add(g);
    const node = { group: g, cry, alive: false, onIsland: i < n * 0.28 }; ores.push(node); placeOre(node);
  }
}
export function depleteOre(node) { node.alive = false; node.group.visible = false; node.respawn = rand(45, 80); }

/* ---------- 식생 ---------- */
function makePalms() {
  const B = {};
  put(B, 'trunk', cyl(0.5, 0.9, 16, 6), 0, 8, 0, 0.12, 0, 0.1);
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; put(B, 'leaf', box(1.6, 0.2, 9), Math.cos(a) * 4 + 1, 15.6, Math.sin(a) * 4 + 1.6, 0.35, -a + HPI, 0); }
  const f = finish(B, []);
  const N = 90 + islands.length * 4, tr = new THREE.InstancedMesh(f.trunk, new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.9 }), N), lf = new THREE.InstancedMesh(f.leaf, new THREE.MeshStandardMaterial({ color: 0x4f6b2a, roughness: 0.8, side: THREE.DoubleSide }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(); let k = 0;
  for (let t = 0; t < 2500 && k < 90; t++) {
    const p = ports[k % ports.length], a = rand(0, 6.28), r = rand(150, 420); const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, h = terrainH(x, z);
    if (h < 6 || Math.abs(h - p.ground) > 60) continue;
    const sc = rand(0.8, 1.4); m.compose(new THREE.Vector3(x, h - 0.5, z), q.setFromEuler(new THREE.Euler(0, rand(0, 6), 0)), s.set(sc, sc, sc));
    tr.setMatrixAt(k, m); lf.setMatrixAt(k, m); k++;
  }
  for (const I of islands) for (let j = 0; j < 4 && k < N; j++) {
    const a = rand(0, 6.28), r = rand(I.r * 0.4, I.r * 0.8), sc = rand(0.8, 1.3);
    m.compose(new THREE.Vector3(I.x + Math.cos(a) * r, I.y - 1, I.z + Math.sin(a) * r), q.setFromEuler(new THREE.Euler(0, rand(0, 6), 0)), s.set(sc, sc, sc));
    tr.setMatrixAt(k, m); lf.setMatrixAt(k, m); k++;
  }
  tr.count = lf.count = k; tr.castShadow = lf.castShadow = true; scene.add(tr, lf);
}
function makeSpires() {
  const geo = new THREE.CylinderGeometry(0.55, 1, 1, 7, 3); const pp = geo.attributes.position;
  for (let i = 0; i < pp.count; i++) { const k = 1 + (hash(i, 3) - 0.5) * 0.35; pp.setX(i, pp.getX(i) * k); pp.setZ(i, pp.getZ(i) * k); }
  geo.computeVertexNormals();
  const N = 300, mat = new THREE.MeshStandardMaterial({ color: 0xb0603a, roughness: 0.95, flatShading: true }); envMats.push(mat);
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
  for (let i = 0; i < 80; i++) {
    const low = i % 4 === 0, cx = rand(-WORLD * 1.7, WORLD * 1.7), cz = rand(-WORLD * 1.7, WORLD * 1.7), cy = low ? rand(560, 760) : rand(950, 1450);
    for (let k = 0; k < 18; k++) { const sh = rand(0.85, 1) * 2.05; CLOUD.emit(cx + rand(-260, 260), cy + rand(-30, 50) * (k % 3), cz + rand(-180, 180), 0, 0, 0, 1e9, rand(260, 480), 0, [sh, sh, sh * 0.98], [sh, sh, sh * 0.98], 1.15); }
  }
  CLOUD.update(0);
  PORT_MAT.deckTop = new THREE.MeshStandardMaterial({ map: deckTexture(), roughness: 0.8, metalness: 0.4 }); envMats.push(PORT_MAT.deckTop);
  await frameYield();
  progress('GENERATING TERRAIN', 0.4);
  const INNER = WORLD * 2.6;
  scene.add(buildTerrain(INNER, Q.seg, 0)); await frameYield();
  scene.add(buildTerrain(INNER * 3.2, 96, INNER / 2 - 40)); await frameYield();
  waterMat = new THREE.MeshStandardMaterial({ color: 0x1f5c66, roughness: 0.06, metalness: 0.25, normalMap: WATER_NRM, normalScale: new THREE.Vector2(0.6, 0.6), transparent: true, opacity: 0.9 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(INNER * 3.2, INNER * 3.2), waterMat);
  water.rotation.x = -HPI; water.position.y = 2; water.receiveShadow = true; scene.add(water); envMats.push(water.material);
  waterMat2 = new THREE.MeshStandardMaterial({ color: 0x4aa0b0, roughness: 0.05, metalness: 0.35, normalMap: WATER_NRM.clone(), normalScale: new THREE.Vector2(0.45, 0.45), transparent: true, opacity: 0.22, depthWrite: false });
  waterMat2.normalMap.needsUpdate = true; waterMat2.normalMap.repeat.set(70, 70);
  const water2 = new THREE.Mesh(new THREE.PlaneGeometry(INNER * 3.2, INNER * 3.2), waterMat2); water2.rotation.x = -HPI; water2.position.y = 2.6; scene.add(water2); envMats.push(waterMat2);
  pickWrecks(); makeIslands(); makeArches(); makeSpires(); makePalms(); await frameYield();
  makeScatter(); makeFlare();
  sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_SOFT, color: new THREE.Color(3.6, 2.9, 1.9), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false })); sunSprite.scale.setScalar(560); scene.add(sunSprite);
  progress('BUILDING PORTS', 0.6);
  PORT_PROTO = buildPortProto(); for (const p of ports) buildPort(p);
  buildOreGeos(); makeOres(46);
  await frameYield();
  applyDay(true);
}

/* ---------- 프레임 업데이트 ---------- */
const FOG_LIN = new THREE.Color();
export function updateWorld(dt, focus) {
  DAY.tod = (DAY.tod + dt / DAY.len * (DAY.night > 0.5 ? 1.8 : 1)) % 1;
  applyDay(false);
  // 모래폭풍
  WEATHER.timer -= dt;
  if (WEATHER.timer <= 0) {
    if (WEATHER.target > 0) { WEATHER.target = 0; WEATHER.timer = rand(240, 420); }
    else { WEATHER.target = 1; WEATHER.timer = rand(70, 110); WEATHER.wind.set(rand(-1, 1), 0, rand(-1, 1)).normalize(); }
    if (WEATHER.onChange) WEATHER.onChange(WEATHER.target > 0);
  }
  WEATHER.storm += (WEATHER.target - WEATHER.storm) * Math.min(1, dt * 0.25);
  const st = WEATHER.storm;
  FOG.near = lerp(1500, 90, st); FOG.far = lerp(7800, 1100, st);
  if (st > 0.01) {
    FOG.color.lerp(STORM_COL.clone().multiplyScalar(lerp(0.12, 1, DAY.light)), st * 0.85);
    const n = Math.round(30 * st * Q.fx), w = WEATHER.wind;
    for (let i = 0; i < n; i++) { const x = camera.position.x + rand(-260, 260), y = camera.position.y + rand(-80, 80), z = camera.position.z + rand(-260, 260);
      SMOKE.emit(x, y, z, w.x * 70 + rand(-10, 10), rand(-4, 4), w.z * 70 + rand(-10, 10), rand(2, 3.5), rand(18, 30), rand(40, 70), [0.75, 0.55, 0.36], [0.68, 0.5, 0.33], 0.22 * st); }
  }
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
  if (waterMat) { waterMat.normalMap.offset.x = t * 0.004; waterMat.normalMap.offset.y = t * 0.0025; }
  updateFlare();
  if (waterMat2) { waterMat2.normalMap.offset.x = -t * 0.003; waterMat2.normalMap.offset.y = t * 0.0035; }
  for (const p of ports) { if (p.sweep) { p.sweep.rotation.y = t * 0.8; p.sweep.visible = DAY.night > 0.15; p.sweep.children.forEach(c => c.material.opacity = 0.16 * DAY.night); } }
  // 공중에 떠다니는 먼지 (속도감·깊이감)
  const nd = Math.round(Q.fx * 3 * (1 - WEATHER.storm)); for (let i = 0; i < nd; i++) SMOKE.emit(camera.position.x + rand(-160, 160), camera.position.y + rand(-70, 70), camera.position.z + rand(-160, 160), WEATHER.wind.x * 12 + rand(-3, 3), rand(-1, 2), WEATHER.wind.z * 12 + rand(-3, 3), rand(3, 6), rand(0.8, 1.8), 0.4, [1, 0.92, 0.78], [1, 0.92, 0.78], 0.16 * DAY.light + 0.03);
  if (sunSprite) { sunSprite.position.copy(camera.position).addScaledVector(SUN_DIR, 7000); sunSprite.visible = DAY.el > -4; sunSprite.material.opacity = smooth(-4, 6, DAY.el) * (1 - WEATHER.storm * 0.8); }
  for (const w of WRECKS) if (Math.random() < 0.25 && camera.position.distanceToSquared(tmpW.set(w.x, w.y, w.z)) < 4e6) SMOKE.emit(w.x + rand(-20, 20), w.y + 30, w.z + rand(-20, 20), rand(-3, 3) + WEATHER.wind.x * 8, rand(14, 22), rand(-3, 3), rand(5, 8), 18, 70, [0.16, 0.14, 0.13], [0.4, 0.37, 0.34], 0.5);
  FIRE.update(dt); SMOKE.update(dt);
}
const tmpW = new THREE.Vector3();
export function nearestPort(pos) { let b = null, bd = 1e9; for (const p of ports) { const d = Math.hypot(p.x - pos.x, p.z - pos.z); if (d < bd) { bd = d; b = p; } } return [b, bd]; }
export const homePort = () => ports[0];
