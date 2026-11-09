// 함선: 파라메트릭 모델(9종) · 방어막 · 호버 비행 물리
import { THREE, rand, clamp, lerp, wrap, canvasTex, put, finish, box, cyl, HPI, addProto } from './core.js';
import { TIERS, PAINTS, WORLD, modFx, crewFx, save as SAVE } from './data.js';
import { groundAt, islandPush, envMats } from './world.js';

/* ---------- 재질 (판넬 텍스처 + 노멀맵) ---------- */
function hullCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  const h = document.createElement('canvas'); h.width = h.height = 512; const y = h.getContext('2d');   // 높이맵
  x.fillStyle = '#a99a72'; x.fillRect(0, 0, 512, 512); y.fillStyle = '#808080'; y.fillRect(0, 0, 512, 512);
  for (let gy = 0; gy < 512; gy += 64) for (let gx = 0; gx < 512; gx += 64) {
    const sub = Math.random() < 0.4 ? 2 : 1, w = 64 / sub;
    for (let a = 0; a < sub; a++) for (let b = 0; b < sub; b++) {
      x.fillStyle = `hsl(${rand(40, 46)},${rand(18, 26)}%,${52 + rand(-6, 6)}%)`; x.fillRect(gx + a * w, gy + b * w, w, w);
      const v = Math.round(rand(118, 140)); y.fillStyle = `rgb(${v},${v},${v})`; y.fillRect(gx + a * w + 2, gy + b * w + 2, w - 4, w - 4);
    }
  }
  x.strokeStyle = 'rgba(40,30,18,.6)'; x.lineWidth = 2; y.strokeStyle = '#303030'; y.lineWidth = 3;
  for (let i = 0; i <= 512; i += 64) for (const ctx of [x, y]) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke(); }
  x.fillStyle = 'rgba(30,22,12,.55)'; y.fillStyle = '#e0e0e0';
  for (let i = 0; i <= 512; i += 64) for (let j = 4; j < 512; j += 10) { x.fillRect(i + 3, j, 2, 2); x.fillRect(j, i + 3, 2, 2); y.fillRect(i + 3, j, 2, 2); y.fillRect(j, i + 3, 2, 2); }
  for (let i = 0; i < 40; i++) { const px = rand(0, 512), py = rand(0, 512), r = rand(20, 80), g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(60,40,20,.28)'); g.addColorStop(1, 'rgba(60,40,20,0)'); x.fillStyle = g; x.fillRect(0, 0, 512, 512); }
  for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(50,35,20,${rand(0.05, 0.18)})`; x.fillRect(rand(0, 512), rand(0, 512), rand(1, 3), rand(20, 90)); }
  return [c, h];
}
function heightToNormal(hc, strength = 2.5) {
  const W = hc.width, H = hc.height, src = hc.getContext('2d').getImageData(0, 0, W, H).data;
  const out = document.createElement('canvas'); out.width = W; out.height = H; const o = out.getContext('2d'), img = o.createImageData(W, H);
  const at = (x, y) => src[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  o.putImageData(img, 0, 0); return out;
}
const [HC, HH] = hullCanvas();
const HULL_TEX = new THREE.CanvasTexture(HC); HULL_TEX.colorSpace = THREE.SRGBColorSpace; HULL_TEX.anisotropy = 8;
const HULL_NRM = new THREE.CanvasTexture(heightToNormal(HH)); HULL_NRM.anisotropy = 8;
for (const t of [HULL_TEX, HULL_NRM]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
export { heightToNormal };
const SHARED = {
  metal: new THREE.MeshStandardMaterial({ color: 0x77766d, roughness: 0.32, metalness: 0.9 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2b2925, roughness: 0.55, metalness: 0.65 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x0e1a24, emissive: 0x3aa0ff, emissiveIntensity: 1.6, roughness: 0.05, metalness: 0.9 }),
  glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.2, 0.7), toneMapped: false }),
  halo: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3.6, 4.2), toneMapped: false }),
  navR: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.3, 0.2), toneMapped: false }),
  navG: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 6, 0.6), toneMapped: false }),
};
envMats.push(SHARED.metal, SHARED.dark, SHARED.glass);
export const FACTION_COL = { player: 0x22d3d3, captain: 0x3f86ff, pirate: 0xff3a24 };
const matCache = {};
export function shipMats(paintId, faction) {
  const key = paintId + '|' + faction; if (matCache[key]) return matCache[key];
  const p = (PAINTS.find(q => q.id === paintId) || PAINTS[0]).c, c = new THREE.Color(p[0], p[1], p[2]);
  const hull = new THREE.MeshStandardMaterial({ map: HULL_TEX, normalMap: HULL_NRM, normalScale: new THREE.Vector2(0.7, 0.7), color: c, roughness: 0.62, metalness: 0.42 });
  const armor = new THREE.MeshStandardMaterial({ map: HULL_TEX, normalMap: HULL_NRM, normalScale: new THREE.Vector2(0.9, 0.9), color: c.clone().multiplyScalar(0.8), roughness: 0.7, metalness: 0.5 });
  const fc = FACTION_COL[faction];
  const team = new THREE.MeshStandardMaterial({ color: fc, emissive: fc, emissiveIntensity: 0.45, roughness: 0.4, metalness: 0.35 });
  envMats.push(hull, armor, team);
  return (matCache[key] = Object.assign({ hull, armor, team }, SHARED));
}
export function setShipNight(n) { SHARED.glass.emissiveIntensity = 1.6 + n * 3.4; SHARED.glow.color.setRGB(5 + n * 1.5, 2.2 + n * 0.6, 0.7); }
export function blinkNav(t) { const b = (t % 1.2) < 0.15 ? 1 : 0.15; SHARED.navR.color.setRGB(6 * b, 0.3 * b, 0.2 * b); SHARED.navG.color.setRGB(0.3 * b, 6 * b, 0.6 * b); }

/* ---------- 파라메트릭 모델 ---------- */
function geom(cls) {
  const m = TIERS[cls].model, L = m.len, W = m.wid, f = -L / 2, r = L / 2;
  const turrets = [[0, 2.15, f + 4.4], [0, 2.55, r - 1.8]];
  const n = TIERS[cls].turrets;
  if (n >= 3) turrets.push([5.8 * W, 2.0, 2]);
  if (n >= 4) turrets.push([-5.8 * W, 2.0, 2]);
  if (n >= 5) turrets.push([0, 2.45, -0.8]);
  return { m, L, W, f, r, turrets, bridgeZ: r - 7, wingZ: r - 6, nacZ: r - 4 };
}
function shipProto(cls) {
  const B = {}, G = geom(cls), { m, L, W, f, r } = G, ys = m.slim ? 0.82 : 1;
  const sh = new THREE.Shape([[-3.2, -2.4], [3.2, -2.4], [4.6, -1.0], [5.0, 0.9], [4.0, 2.2], [-4.0, 2.2], [-5.0, 0.9], [-4.6, -1.0]].map(p => new THREE.Vector2(p[0] * W, p[1] * ys)));
  const hull = new THREE.ExtrudeGeometry(sh, { depth: L, steps: 10, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.35, bevelSegments: 1 });
  hull.translate(0, 0, f);
  const hp = hull.attributes.position, noseLen = m.ram ? 12 : 9.5;
  for (let i = 0; i < hp.count; i++) { const z = hp.getZ(i); const t = clamp((f + noseLen - z) / noseLen, 0, 1); hp.setX(i, hp.getX(i) * (1 - (m.slim ? 0.6 : 0.48) * t)); hp.setY(i, hp.getY(i) * (1 - 0.32 * t) - 0.35 * t); }
  hull.computeVertexNormals(); put(B, 'hull', hull);
  put(B, 'armor', box(7 * W, 0.6, L - 6), 0, -2.75 * ys, 0.5);
  put(B, 'team', box(1.4, 0.12, L - 13), 0, 2.6 * ys, 1.5);
  for (const s of [-1, 1]) put(B, 'team', box(0.15, 0.9, L * 0.35), s * (5.38 * W), 0.9 * ys, 0);
  for (const s of [-1, 1]) for (const z of [-1.2, -3.9]) put(B, 'armor', cyl(1.1, 1.15, 0.3, 14), s * 2.1, 2.65 * ys, z);
  // 함교
  const bz = G.bridgeZ;
  put(B, 'hull', box(5, 2.6, 6), 0, 3.85, bz); put(B, 'armor', box(3.6, 1.5, 3.6), 0, 5.9, bz + 0.4);
  put(B, 'glass', box(4.2, 0.55, 0.12), 0, 4.35, bz - 3.03); put(B, 'glass', box(3.0, 0.45, 0.1), 0, 6.05, bz - 1.42);
  for (const s of [-1, 1]) put(B, 'glass', box(0.1, 0.45, 2.6), s * 2.52, 4.35, bz - 1);
  let top = 6.65;
  if (m.bridge >= 2) { put(B, 'hull', box(3, 1.4, 3), 0, 7.4, bz + 1); put(B, 'glass', box(3.1, 0.4, 0.1), 0, 7.5, bz - 0.52); top = 8.1; }
  if (m.bridge >= 3) { put(B, 'armor', box(2.2, 1.2, 2.2), 0, 8.7, bz + 1.4); put(B, 'glass', box(2.3, 0.35, 0.1), 0, 8.8, bz + 0.28); top = 9.3; }
  put(B, 'metal', cyl(0.15, 0.18, 3.6, 6), 0, top + 1.8, bz + 1);
  for (const s of [-1, 1]) put(B, 'dark', cyl(0.06, 0.06, 3.2, 4), s * 1.3, top + 1.4, bz + 1.6);
  for (let i = 0; i < 5; i++) put(B, 'dark', box(1.6, 0.12, 0.12), 0, 2.9 + i * 0.6, bz + 3.05);
  for (const s of [-1, 1]) put(B, 'dark', box(2.2, 0.25, 3), s * 2.3, 2.65 * ys, r - 2.4);
  // 날개
  const ws = m.wing, wz = G.wingZ;
  put(B, 'hull', box(ws, 0.5, 5), 0, 0.4, wz);
  for (const s of [-1, 1]) {
    put(B, 'hull', box(0.3, 3, 3.2), s * (ws / 2 - 0.9), 2.0, wz + 1, 0, 0, s * -0.15);
    put(B, 'team', box(1.3, 0.9, 5.2), s * (ws / 2 + 0.1), 0.4, wz);
    put(B, s < 0 ? 'navR' : 'navG', box(0.5, 0.5, 0.6), s * (ws / 2 + 0.85), 0.4, wz - 1.4);
    if (m.halo) put(B, 'halo', box(ws / 2 - 6, 0.14, 0.5), s * (ws / 4 + 3), 0.72, wz - 2.3);
    for (const [nx0, ny] of m.nac) {
      const nx = nx0 * Math.max(W, 0.9), nz = G.nacZ;
      put(B, 'metal', cyl(1.9, 1.9, 9, 16), s * nx, ny, nz, HPI);
      for (const z of [-2.5, 0.5, 3]) put(B, 'dark', cyl(2.05, 2.05, 0.35, 16), s * nx, ny, nz + z, HPI);
      put(B, 'dark', cyl(1.9, 2.2, 0.8, 16), s * nx, ny, nz - 4.7, HPI);
      put(B, 'dark', cyl(1.5, 1.9, 1.3, 16), s * nx, ny, nz + 5.1, HPI);
      put(B, 'glow', cyl(1.25, 1.25, 0.2, 14), s * nx, ny, nz + 5.8, HPI);
      put(B, 'team', box(0.25, 2.6, 6), s * (nx + 2.1), ny, nz);
    }
    put(B, 'dark', box(0.6, 0.6, 3), s * 5.9 * W, -0.3, G.nacZ - 1);
    for (const z of [f + 7, r - 7.5]) { put(B, 'metal', cyl(1.3, 1.1, 2.2, 12), s * 3.3 * W, -3.3 * ys, z); put(B, 'dark', cyl(1.38, 1.38, 0.3, 12), s * 3.3 * W, -2.5 * ys, z); put(B, 'glow', cyl(0.85, 0.85, 0.12, 12), s * 3.3 * W, -4.45 * ys, z); }
    if (m.pods === 'missile') { put(B, 'armor', box(1.3, 1.3, 4.5), s * 5.6 * W, 2.0, f + 10); for (const a of [-1, 1]) for (const b of [-1, 1]) put(B, 'dark', cyl(0.3, 0.3, 0.1, 8), s * 5.6 * W + a * 0.32, 2.0 + b * 0.32, f + 7.73, HPI); }
    if (m.pods === 'cargo') { put(B, 'armor', box(3.2, 3.4, 13), s * 7.4 * W, -0.6, 0); put(B, 'team', box(3.3, 0.5, 13.1), s * 7.4 * W, 0.4, 0); for (const z of [-4, 0, 4]) put(B, 'dark', box(3.4, 3.6, 0.3), s * 7.4 * W, -0.6, z); }
    if (m.sponson || (m.sponsonR && s > 0)) put(B, 'armor', box(2.6, 1.6, 4), s * 5.8 * W, 1.2, 2);
  }
  if (m.spine) { put(B, 'hull', box(0.4, 3.2, 9), 0, 4.1, -3, 0.18, 0, 0); put(B, 'team', box(0.45, 0.4, 7), 0, 5.4, -3.6, 0.18, 0, 0); }
  if (m.ram) { put(B, 'dark', box(2.6, 1.6, 6), 0, -1.6, f - 0.5, 0.25, 0, 0); put(B, 'metal', box(1.2, 0.8, 3), 0, -1.9, f - 3.2, 0.25, 0, 0); }
  put(B, 'dark', box(0.8, 3, 0.8), 0, -4.2 * ys, f + 4); put(B, 'team', box(2.4, 0.5, 2), 0, -5.8 * ys, f + 4);
  put(B, 'armor', box(5 * W, 3 * ys, 1.6), 0, 0, r + 0.9); put(B, 'glow', box(3.4 * W, 1.5 * ys, 0.15), 0, 0, r + 1.75);
  return finish(B);
}
function turretProto() {
  const base = {}, gun = {};
  put(base, 'armor', cyl(1.5, 1.7, 0.7, 14), 0, 0.35, 0); put(base, 'armor', box(2.4, 1.2, 2.8), 0, 1.2, 0.2);
  put(gun, 'armor', box(1.8, 0.7, 0.8), 0, 0, -1.2);
  for (const s of [-1, 1]) { put(gun, 'dark', cyl(0.2, 0.2, 4.2, 8), s * 0.45, 0, -3.0, HPI); put(gun, 'dark', cyl(0.3, 0.3, 0.6, 8), s * 0.45, 0, -5.0, HPI); }
  return { base: finish(base), gun: finish(gun) };
}
function radarProto() { const B = {}; put(B, 'metal', box(3.4, 1.1, 0.18), 0, 0, 0, -0.25); put(B, 'metal', box(0.25, 0.25, 0.8), 0, 0, 0.4); return finish(B, []); }
const PROTOS = TIERS.map(t => shipProto(t.id)), GEOMS = TIERS.map(t => geom(t.id)), TUR = turretProto(), RAD = radarProto();
export const MUZZLE = [[-0.45, 0, -5.4], [0.45, 0, -5.4]];
export function shipGeom(cls) { return GEOMS[cls]; }
export function makeShipModel(cls, paint, faction, scaleMul = 1) {
  const mats = shipMats(paint, faction), G = GEOMS[cls];
  const root = new THREE.Group(), model = new THREE.Group(); root.add(model);
  model.scale.setScalar(TIERS[cls].scale * scaleMul);
  addProto(model, PROTOS[cls], mats);
  model.children.forEach(c => { c.userData.shipPart = true; });   // 전차 변형 때 숨길 선체 파츠
  const turrets = G.turrets.map(p => {
    const t = new THREE.Group(); t.position.set(...p); addProto(t, TUR.base, mats);
    const g = new THREE.Group(); g.position.y = 1.25; addProto(g, TUR.gun, mats); t.add(g); t.userData.gun = g; t.userData.cd = rand(0, 0.3);
    model.add(t); return t;
  });
  const radar = new THREE.Group(); radar.position.set(0, (G.m.bridge >= 3 ? 9.3 : G.m.bridge >= 2 ? 8.1 : 6.65) + 3.7, G.bridgeZ + 1); addProto(radar, RAD, mats); model.add(radar);
  return { root, model, turrets, radar };
}

/* ---------- 전차 형태 모델 ---------- */
function buildTank(ship) {
  const G = ship.G, mats = shipMats(ship.paint, ship.faction), g = new THREE.Group(), W = Math.max(G.W, 0.9), L = G.L;
  const mk = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
  mk(new THREE.BoxGeometry(9.4 * W, 4.4, L * 0.78), mats.hull, 0, -0.4, 0.4);                       // 차체
  mk(new THREE.BoxGeometry(8.6 * W, 2.4, 7), mats.armor, 0, -0.8, -L * 0.42, -0.5);                // 경사 장갑
  mk(new THREE.BoxGeometry(9.8 * W, 0.7, L * 0.7), mats.armor, 0, 1.95, 0.4);                        // 상판
  mk(new THREE.BoxGeometry(2, 0.3, L * 0.55), mats.team, 0, 2.4, 1.2);                             // 팀 색 줄
  for (const s of [-1, 1]) {
    mk(new THREE.BoxGeometry(3.4, 4.4, L * 0.98), mats.dark, s * 6.4 * W, -1.4, 0.3);                 // 무한궤도
    mk(new THREE.BoxGeometry(0.3, 0.5, L * 0.9), mats.team, s * 8.2 * W, -0.2, 0.3);
    for (let i = 0; i < 7; i++) mk(new THREE.CylinderGeometry(1.5, 1.5, 3.6, 12), mats.metal, s * 6.4 * W, -2.6, -L * 0.42 + i * (L * 0.84 / 6), 0, 0, HPI);
    mk(new THREE.CylinderGeometry(0.8, 1, 5, 8), mats.dark, s * 3.6 * W, 1.4, L * 0.46, HPI, 0, 0);    // 배기관
  }
  mk(new THREE.BoxGeometry(3.4 * W, 1.4, 0.3), mats.glow, 0, -0.6, L * 0.42);                       // 후미 엔진 빛
  g.userData.parts = true; return g;
}
export function morphFxPos(s) { return s.pos; }

/* ---------- 외형(스타일): 같은 함선 등급을 다른 모양으로 ---------- */
export const STYLES = {
  ship:    { nm: '전투 비행선', ic: '🛳️', ds: '균형 잡힌 기본형. 포탑 갑판과 쌍발 엔진', mul: { speed: 1, turn: 1, dmg: 1 } },
  fighter: { nm: '우주 전투기', ic: '🚀', ds: '날렵한 화살촉 동체와 후퇴익. 가장 빠르고 민첩', mul: { speed: 1.2, turn: 1.18, dmg: 0.95 } },
  saucer:  { nm: '원반 비행체', ic: '🛸', ds: '빛나는 원반과 유리 돔. 제자리 선회가 매우 빠름', mul: { speed: 1.02, turn: 1.45, dmg: 1 } },
  stealth: { nm: '스텔스 전익기', ic: '🔺', ds: '평평한 삼각 전익. 빠르고 날카로운 공격', mul: { speed: 1.12, turn: 1.05, dmg: 1.1 } },
  cruiser: { nm: '우주 순양함', ic: '🛰️', ds: '쐐기형 거대 선체와 함교 탑. 화력 최강', mul: { speed: 0.92, turn: 0.9, dmg: 1.25 } },
  ring:    { nm: '에테르 링선', ic: '💠', ds: '빛나는 코어 주위를 고리가 도는 신비한 함선', mul: { speed: 1.06, turn: 1.2, dmg: 1.12 } },
};
export const STYLE_KEYS = Object.keys(STYLES);
function buildStyle(key, G, paint, faction) {
  const mats = shipMats(paint, faction), g = new THREE.Group(), L = G.L, W = Math.max(G.W, 0.9), ws = G.m.wing;
  const neon = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3.6, 4.2), toneMapped: false });
  const mk = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
  if (key === 'fighter') {
    const nose = new THREE.ConeGeometry(3.4 * W, L * 0.62, 6); nose.rotateX(-HPI); mk(nose, mats.hull, 0, 0.4, -L * 0.22, 0, 0, Math.PI / 6);
    mk(new THREE.CylinderGeometry(3.4 * W, 3.0 * W, L * 0.42, 6), mats.armor, 0, 0.4, L * 0.3, HPI, 0, Math.PI / 6);
    const cano = new THREE.SphereGeometry(1.8, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2); cano.scale(1, 0.7, 2.6); mk(cano, mats.glass, 0, 2.4, -L * 0.08);
    for (const sd of [-1, 1]) {
      const wing = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -L * 0.15), new THREE.Vector3(sd * ws * 0.62, 0, L * 0.32), new THREE.Vector3(0, 0, L * 0.36)]);
      wing.setIndex([0, 1, 2, 2, 1, 0]); wing.computeVertexNormals(); mk(wing, mats.hull, sd * 2.6, 0, 0);
      mk(new THREE.BoxGeometry(ws * 0.5, 0.18, 0.4), neon, sd * ws * 0.3, 0.2, L * 0.33);
      mk(new THREE.BoxGeometry(0.3, 5, 5), mats.team, sd * 3, 3.2, L * 0.4, 0, 0, sd * 0.35);
    }
    for (const x of [-2.4, 0, 2.4]) { mk(new THREE.CylinderGeometry(1.2, 1.4, 3, 12), mats.dark, x, 0.4, L * 0.52, HPI); mk(new THREE.CylinderGeometry(1, 1, 0.2, 12), mats.glow, x, 0.4, L * 0.54, HPI); }
  } else if (key === 'saucer') {
    const R = Math.max(ws * 0.5, L * 0.45);
    const disc = new THREE.SphereGeometry(R, 40, 14); disc.scale(1, 0.18, 1); mk(disc, mats.hull, 0, 0, 0);
    mk(new THREE.TorusGeometry(R * 0.98, 0.7, 8, 64), mats.armor, 0, 0, 0, HPI);
    const dome = new THREE.SphereGeometry(R * 0.32, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2); mk(dome, mats.glass, 0, R * 0.12, 0);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; mk(new THREE.SphereGeometry(0.7, 8, 6), i % 2 ? neon : mats.glow, Math.cos(a) * R * 0.86, -0.4, Math.sin(a) * R * 0.86); }
    mk(new THREE.CylinderGeometry(R * 0.35, R * 0.45, 2, 32), mats.dark, 0, -R * 0.14, 0); mk(new THREE.CylinderGeometry(R * 0.3, R * 0.3, 0.2, 32), neon, 0, -R * 0.2, 0);
  } else if (key === 'stealth') {
    const tri = new THREE.Shape([new THREE.Vector2(0, -L * 0.6), new THREE.Vector2(ws * 0.62, L * 0.4), new THREE.Vector2(ws * 0.2, L * 0.3), new THREE.Vector2(0, L * 0.44), new THREE.Vector2(-ws * 0.2, L * 0.3), new THREE.Vector2(-ws * 0.62, L * 0.4)]);
    const geo = new THREE.ExtrudeGeometry(tri, { depth: 2.2, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.6, bevelSegments: 1 }); geo.rotateX(HPI); geo.translate(0, 1.2, 0);
    mk(geo, mats.dark, 0, 0, 0);
    mk(new THREE.BoxGeometry(4, 1.4, L * 0.5), mats.armor, 0, 1.6, -L * 0.05); mk(new THREE.BoxGeometry(3, 0.5, 4), mats.glass, 0, 2.4, -L * 0.2);
    for (const sd of [-1, 1]) { mk(new THREE.BoxGeometry(ws * 0.55, 0.12, 0.3), neon, sd * ws * 0.3, 1.25, L * 0.36, 0, sd * -0.25); mk(new THREE.BoxGeometry(5, 0.6, 1.2), mats.glow, sd * 4, 0.8, L * 0.4); }
  } else if (key === 'cruiser') {
    const w = new THREE.Shape([new THREE.Vector2(0, -L * 0.75), new THREE.Vector2(7 * W, L * 0.45), new THREE.Vector2(-7 * W, L * 0.45)]);
    const geo = new THREE.ExtrudeGeometry(w, { depth: 5, bevelEnabled: true, bevelSize: 0.6, bevelThickness: 0.6, bevelSegments: 1 }); geo.rotateX(HPI); geo.translate(0, 2.5, 0);
    mk(geo, mats.hull, 0, 0, 0);
    mk(new THREE.BoxGeometry(5, 0.4, L * 0.9), mats.team, 0, 3.2, 0); mk(new THREE.BoxGeometry(6, 5, 7), mats.armor, 0, 5.5, L * 0.28); mk(new THREE.BoxGeometry(8, 1.2, 2.4), mats.armor, 0, 8.6, L * 0.28); mk(new THREE.BoxGeometry(6, 0.5, 0.2), mats.glass, 0, 6.8, L * 0.28 - 3.6);
    for (const x of [-4.5, -1.5, 1.5, 4.5]) { mk(new THREE.CylinderGeometry(1.5, 1.7, 3, 12), mats.dark, x * W, -0.2, L * 0.47, HPI); mk(new THREE.CylinderGeometry(1.3, 1.3, 0.2, 12), mats.glow, x * W, -0.2, L * 0.49, HPI); }
    for (const sd of [-1, 1]) mk(new THREE.BoxGeometry(0.2, 0.3, L * 0.8), neon, sd * 5.5 * W, 0.4, 0, 0, sd * 0.1);
  } else if (key === 'ring') {
    const R = Math.max(ws * 0.42, L * 0.4);
    mk(new THREE.IcosahedronGeometry(R * 0.32, 1), mats.armor, 0, 0, 0);
    const core = mk(new THREE.SphereGeometry(R * 0.22, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 3.4, 4.2), toneMapped: false }), 0, 0, 0);
    const r1 = mk(new THREE.TorusGeometry(R * 0.8, 1, 8, 48), mats.hull, 0, 0, 0, HPI), r2 = mk(new THREE.TorusGeometry(R * 0.62, 0.5, 8, 48), neon, 0, 0, 0, 0.4, 0, 0.6);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; mk(new THREE.BoxGeometry(1.6, 1.6, 4), mats.dark, Math.cos(a) * R * 0.8, 0, Math.sin(a) * R * 0.8, 0, -a); }
    mk(new THREE.CylinderGeometry(1.4, 2, 4, 12), mats.dark, 0, 0, R * 0.42, HPI); mk(new THREE.CylinderGeometry(1.3, 1.3, 0.2, 12), mats.glow, 0, 0, R * 0.55, HPI);
    g.userData.spin = [r1, r2]; void core;
  }
  return g;
}
export function applyLook(model, shipParts, looks, key) { shipParts.forEach(c => c.visible = key === 'ship'); for (const k in looks) looks[k].visible = k === key; }
/* 격납고 미리보기용: 모델에 외형을 입힌다 */
export function styleModel(m, cls, paint, key) {
  if (!key || key === 'ship') return;
  const parts = m.model.children.filter(c => c.userData.shipPart), lk = buildStyle(key, GEOMS[cls], paint, 'player');
  m.model.add(lk); parts.forEach(c => c.visible = false); m.look = lk;
}


/* ---------- 방어막 셰이더 ---------- */
const SH_GEO = new THREE.SphereGeometry(1, 48, 24);
const SH_VS = `varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){ vP = normalize(position); vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const SH_FS = `uniform vec4 uHits[8]; uniform vec3 uCol; uniform float uFull; uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){
  vec2 uv = vec2(atan(vP.z, vP.x) * 7.0, vP.y * 9.0); uv.x += mod(floor(uv.y), 2.0) * 0.5;
  vec2 g = abs(fract(uv) - 0.5); float line = smoothstep(0.38, 0.5, max(g.x, g.y));
  float a = 0.0;
  for (int i = 0; i < 8; i++) { vec4 h = uHits[i]; if (h.w <= 0.0) continue; float d = distance(vP, h.xyz);
    a += h.w * (smoothstep(0.85, 0.0, d) * (0.65 + 0.35 * sin(d * 34.0 - uTime * 14.0)) + smoothstep(0.12, 0.0, abs(d - (1.0 - h.w) * 0.9)) * 0.8); }
  float fres = pow(1.0 - abs(dot(vN, vV)), 2.2);
  a = a * (0.55 + 0.9 * line) + uFull * (0.18 + fres * 1.1) * (0.5 + 0.8 * line);
  gl_FragColor = vec4(uCol * a, 1.0);
}`;
export const SH_COL = { g: new THREE.Color(0.12, 1.25, 0.4), y: new THREE.Color(1.2, 0.95, 0.1), r: new THREE.Color(1.4, 0.14, 0.06) };
function shieldColor(ratio, out) { return ratio > 0.5 ? out.copy(SH_COL.y).lerp(SH_COL.g, (ratio - 0.5) * 2) : out.copy(SH_COL.r).lerp(SH_COL.y, ratio * 2); }

/* ---------- 함선 ---------- */
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _l = new THREE.Vector3(), _w = new THREE.Vector3();
export class Ship {
  constructor({ name, faction, tier = 0, paint = 'sand', lv = {}, pvp = false, isPlayer = false, weapon = 'cannon', scaleMul = 1, hpMul = 1, mods = [], elems = [] }) {
    Object.assign(this, { name, faction, tier, paint, lv, pvp, isPlayer, weapon, scaleMul, hpMul, mods, elems });
    this.form = 'ship'; this.look = 'ship'; this.formAnim = 0; this.formShown = 'ship'; this.elemIdx = 0; this.morphCd = 0;
    this.energy = 100; this.boosting = false; this.flareCd = 0;
    this.vel = new THREE.Vector3(); this.yaw = 0; this.yawVel = 0; this.bank = 0; this.pitchV = 0;
    this.cargo = {}; this.cargoKg = 0; this.alive = false; this.respawn = 0; this.kills = 0;
    this.inThrust = 0; this.inTurn = 0; this.inLift = 0; this.aim = null; this.lock = null; this.cdM = 0;
    this.shield = 0; this.shBroken = 0; this.shDelay = 99; this.hits = []; this.full = 0; this.events = [];
    this.ai = { mode: 'idle', t: 0 };
    this.build();
  }
  build(scene) {
    const parent = this.mesh && this.mesh.parent;
    if (this.mesh && parent) parent.remove(this.mesh);
    const m = makeShipModel(this.tier, this.paint, this.faction, this.scaleMul);
    this.mesh = m.root; this.model = m.model; this.turrets = m.turrets; this.radar = m.radar; this.G = GEOMS[this.tier];
    // 방어막 메시 (모델 로컬 공간의 타원체)
    this.shMat = new THREE.ShaderMaterial({ uniforms: { uHits: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }, uCol: { value: new THREE.Color() }, uFull: { value: 0 }, uTime: { value: 0 } },
      vertexShader: SH_VS, fragmentShader: SH_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.shMesh = new THREE.Mesh(SH_GEO, this.shMat);
    const G = this.G; this.shMesh.scale.set(G.m.wing / 2 + 2.5, 7.5 + G.m.bridge, G.L / 2 + 4.5); this.shMesh.position.set(0, 1.5, 0.5);
    this.shMesh.visible = false; this.shMesh.renderOrder = 4; this.model.add(this.shMesh);
    this.baseScale = this.model.scale.x; this.shipParts = this.model.children.filter(c => c.userData.shipPart);
    if (this.isPlayer) {
      this.tank = buildTank(this); this.tank.visible = false; this.model.add(this.tank);
      this.looks = { tank: this.tank };
      for (const k of STYLE_KEYS) if (k !== 'ship' && (SAVE.founder || k === this.look)) { const g = buildStyle(k, this.G, this.paint, this.faction); g.visible = false; this.model.add(g); this.looks[k] = g; }
      this.formShown = this.form === 'tank' ? 'tank' : this.look; applyLook(this.model, this.shipParts, this.looks, this.formShown);
    }
    if (this.isPlayer) {
      // 전조등: 밤에 앞쪽 지형을 비춘다
      this.headlight = new THREE.SpotLight(0xfff1d6, 0, 460, 0.5, 0.75, 1.3); this.headlight.position.set(0, 1.5, this.G.f + 2); this.headlight.target.position.set(0, -34, this.G.f - 120);
      this.model.add(this.headlight, this.headlight.target);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(16 * this.scale, 0.18, 6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 3.5, 3.6), toneMapped: false, transparent: true, opacity: 0.85 }));
      ring.rotation.x = HPI; ring.position.y = 6 * this.scale; this.mesh.add(ring); this.ring = ring;
    }
    if (this.pos) this.mesh.position.copy(this.pos);
    this.pos = this.mesh.position;
    if (parent || scene) (parent || scene).add(this.mesh);
    this.mesh.visible = this.alive;
    this.stats();
  }
  stats() {
    const T = TIERS[this.tier], l = this.lv, g = k => l[k] || 0, f = this.fx = modFx(this.mods);
    if (this.isPlayer) { const c = crewFx(); for (const k in c) f[k] = (f[k] || 0) + c[k]; }   // 선원 보너스
    this.maxHp = Math.round(T.hp * (1 + 0.22 * g('armor')) * (this.hpMul || 1));
    this.maxShield = Math.round(T.shield * (1 + (f.shield || 0)) * (this.hpMul || 1));
    this.maxSpeed = T.speed * (1 + 0.06 * g('engine')) * (1 + (f.speed || 0)); this.accel = T.accel * (1 + 0.06 * g('engine')) * (1 + (f.accel || 0));
    this.turnRate = T.turn * (1 + 0.05 * g('engine')) * (1 + (f.turn || 0));
    this.cargoCap = Math.round(T.cargo * (1 + 0.2 * g('cargo')) * (1 + (f.cargo || 0)));
    this.drill = 1.3 * (1 + 0.5 * g('drill')) * (1 + (f.drill || 0)); this.mineRange = 1 + (f.mineRange || 0);
    this.gunDmg = (2.2 + 0.9 * g('guns')) * (1 + (f.gunDmg || 0)); this.gunRate = (2.4 + 0.6 * g('guns')) * (1 + (f.rate || 0));
    this.bulletSpd = 1 + (f.bulletSpd || 0); this.spreadMul = Math.max(0.2, 1 + (f.spread || 0)); this.lockRange = 1000 * (1 + (f.lockRange || 0));
    this.misDmg = 40 + 15 * g('missile'); this.misCd = Math.max(2.5, 6 - 0.6 * g('missile')); this.misCount = 1 + (f.misCount || 0);
    this.hullDR = f.hullDR || 0; this.radarMul = 1 + (f.radar || 0); this.flareCdMax = 12 * (1 + (f.flareCd || 0));
    this.magnet = 1 + (f.magnet || 0); this.bountyMul = 1 + (f.bounty || 0);
    this.shRegen = this.maxShield * 0.1 * (1 + (f.shRegen || 0)); this.shBreakT = 6 * (1 + (f.shBreak || 0));
    this.radius = 16 * this.scale; this.hover = 7 * this.scale;
    if (this.hp === undefined || this.hp > this.maxHp) this.hp = this.maxHp;
    this.shield = Math.min(this.shield || this.maxShield, this.maxShield);
  }
  get scale() { return TIERS[this.tier].scale * (this.scaleMul || 1); }
  get canMorph() { return this.isPlayer && !!this.tank && (SAVE.founder || (this.fx && this.fx.morph)); }
  get forms() { return SAVE.founder ? [...STYLE_KEYS, 'tank'] : [...new Set([this.baseLook || 'ship', 'tank'])]; }
  get shownKey() { return this.form === 'tank' ? 'tank' : this.look; }
  setForm(f) {
    if (!this.canMorph || this.morphCd > 0) return false;
    if (f === 'base') f = this.baseLook || 'ship';
    if (f !== 'tank' && !this.looks[f] && f !== 'ship') return false;
    if (f === this.shownKey) return false;
    if (f === 'tank') this.form = 'tank'; else { this.form = 'ship'; this.look = f; }
    this.formAnim = 1; this.morphCd = 1.6; this.events.push('morph'); return true;
  }
  nextForm() { const L = this.forms, i = L.indexOf(this.shownKey); return this.setForm(L[(i + 1) % L.length]); }
  get styleMul() { return (STYLES[this.form === 'tank' ? 'ship' : this.look] || STYLES.ship).mul; }
  updateForm(dt) {
    if (this.morphCd > 0) this.morphCd -= dt;
    if (!this.tank) return;
    if (this.formAnim > 0) {
      this.formAnim = Math.max(0, this.formAnim - dt * 1.3);
      const k = 1 - this.formAnim, dip = Math.sin(Math.PI * k), b = this.baseScale;
      this.model.scale.set(b * (1 + 0.14 * dip), b * (1 - 0.34 * dip), b * (1 + 0.14 * dip));
      if (k > 0.5 && this.formShown !== this.shownKey) { this.formShown = this.shownKey; applyLook(this.model, this.shipParts, this.looks, this.formShown); }
      if (this.formAnim === 0) this.model.scale.setScalar(b);
    }
  }
  spawnAt(x, y, z, yaw) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.yaw = yaw; this.yawVel = 0; this.hp = this.maxHp; this.alive = true; this.mesh.visible = true;
    this.cargo = {}; this.cargoKg = 0; this.lock = null; this.cdM = 1; this.energy = 100; this.flareCd = 0;
    this.shield = this.maxShield; this.shBroken = 0; this.shDelay = 99; this.hits.length = 0; this.full = 0;
    this.mesh.rotation.set(0, yaw, 0); this.mesh.updateMatrixWorld(true);
  }
  fwd(out) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  world(x, y, z, out) { return this.model.localToWorld(out.set(x, y, z)); }
  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  /* 방어막: 피해 흡수. 반환값 = 선체로 넘어가는 피해 */
  absorb(amt, at) {
    this.shDelay = 0;
    if (this.shBroken > 0 || this.shield <= 0) return amt * (1 - this.hullDR);
    // 맞은 부위 표시
    if (at) {
      this.shMesh.updateMatrixWorld(); _l.copy(at); this.shMesh.worldToLocal(_l); _l.normalize();
      const near = this.hits.find(h => h.dir.distanceTo(_l) < 0.25);
      if (near) near.s = 1; else { if (this.hits.length >= 8) this.hits.shift(); this.hits.push({ dir: _l.clone(), s: 1 }); }
    }
    this.shield -= amt;
    if (this.shield <= 0) { const over = -this.shield; this.shield = 0; this.shBroken = this.shBreakT; this.full = 1.4; this.events.push('break'); return over * (1 - this.hullDR); }
    return 0;
  }
  updateShield(dt) {
    this.shDelay += dt;
    if (this.shBroken > 0) { this.shBroken -= dt; if (this.shBroken <= 0) { this.shield = this.maxShield * 0.35; this.full = 1.2; this.events.push('restore'); } }
    else if (this.shDelay > 3 && this.shield < this.maxShield) this.shield = Math.min(this.maxShield, this.shield + this.shRegen * dt);
    if (this.fx.nano && this.shDelay > 5 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * this.fx.nano * dt);
    // 셰이더 갱신
    let any = this.full > 0;
    const U = this.shMat.uniforms;
    for (let i = 0; i < 8; i++) {
      const h = this.hits[i]; if (h) { h.s -= dt * 1.6; if (h.s > 0) { any = true; U.uHits.value[i].set(h.dir.x, h.dir.y, h.dir.z, h.s); continue; } }
      U.uHits.value[i].w = 0;
    }
    this.hits = this.hits.filter(h => h.s > 0);
    this.full = Math.max(0, this.full - dt * 1.4); U.uFull.value = Math.min(1, this.full);
    U.uTime.value = performance.now() / 1000;
    const ratio = this.shBroken > 0 ? 0 : this.shield / Math.max(1, this.maxShield);
    if (this.events[this.events.length - 1] === 'restore' && this.full > 0) U.uCol.value.copy(SH_COL.g); else shieldColor(ratio, U.uCol.value);
    this.shMesh.visible = any && this.alive;
  }
  physics(dt, onImpact) {
    const load = this.cargoKg / Math.max(1, this.cargoCap); let vmax = this.maxSpeed * (1 - 0.25 * clamp(load, 0, 1.2)), acc = this.accel;
    const fx = this.fx || {};
    const boost = this.boosting && this.energy > 1 && this.inThrust > 0.2;
    if (boost) { vmax *= 1.6; acc *= 2.2; this.energy = Math.max(0, this.energy - 26 * (1 - (fx.boostEff || 0)) * dt); } else this.energy = Math.min(100, this.energy + 14 * (1 + (fx.boostRegen || 0)) * dt);
    this.boostOn = boost; this.flareCd -= dt;
    const tank = this.form === 'tank'; if (tank) { vmax *= 0.72; acc *= 1.5; this.inLift = 0; }
    else if (this.isPlayer) { const sm = this.styleMul; vmax *= sm.speed; acc *= sm.speed; }
    if (this.looks && this.looks[this.formShown] && this.looks[this.formShown].userData.spin) this.looks[this.formShown].userData.spin.forEach((r, i) => { r.rotation.z += dt * (i ? -1.6 : 0.9); });
    this.updateForm(dt);
    this.fwd(_f); _r.set(-_f.z, 0, _f.x);
    this.vel.addScaledVector(_f, this.inThrust * acc * dt);
    this.vel.y += this.inLift * this.accel * 1.15 * dt;
    // 감쇠: 옆미끄럼 강하게 → 날카로운 선회감
    const fw = this.vel.dot(_f), sd = this.vel.dot(_r);
    const fw2 = fw * Math.exp(-dt * (Math.abs(this.inThrust) > 0.05 ? 0.12 : 0.95)), sd2 = sd * Math.exp(-dt * 3.6);
    this.vel.x = _f.x * fw2 + _r.x * sd2; this.vel.z = _f.z * fw2 + _r.z * sd2;
    this.vel.y *= Math.exp(-dt * (Math.abs(this.inLift) > 0.05 ? 0.5 : 3.2));
    const hs = Math.hypot(this.vel.x, this.vel.z); if (hs > vmax) { const k = lerp(1, vmax / hs, 1 - Math.exp(-dt * 4)); this.vel.x *= k; this.vel.z *= k; }
    this.vel.y = clamp(this.vel.y, -vmax * 0.7, vmax * 0.7);
    this.yawVel = lerp(this.yawVel, this.inTurn * this.turnRate * (tank ? 1.3 : (this.isPlayer ? this.styleMul.turn : 1)), 1 - Math.exp(-dt * 6.5));
    this.yaw = wrap(this.yaw + this.yawVel * dt);
    this.pos.addScaledVector(this.vel, dt);
    for (const k of ['x', 'z']) if (Math.abs(this.pos[k]) > WORLD) { this.vel[k] -= Math.sign(this.pos[k]) * 80 * dt; }
    const g = groundAt(this.pos.x, this.pos.z) + this.hover;
    if (tank) { this.pos.y = lerp(this.pos.y, groundAt(this.pos.x, this.pos.z) + this.hover * 0.62, 1 - Math.exp(-dt * 7)); this.vel.y = 0; }
    else if (this.pos.y < g) { if (this.vel.y < -18 && onImpact) onImpact(this, -this.vel.y); this.pos.y = g; if (this.vel.y < 0) this.vel.y = 0; }
    islandPush(this);
    if (this.pos.y > 1150) { this.pos.y = 1150; this.vel.y = Math.min(0, this.vel.y); }
    // 연출: 선회 시 크게 기울고, 가속 시 기수 숙임
    const tb = clamp(-this.yawVel / this.turnRate, -1, 1) * (0.42 + hs / (this.maxSpeed + 1) * 0.15) + clamp(sd / 40, -0.15, 0.15);
    this.bank = lerp(this.bank, -tb, 1 - Math.exp(-dt * 4));
    this.pitchV = lerp(this.pitchV, -this.inThrust * 0.08 * (1 - hs / (vmax + 1) * 0.5) + this.vel.y * 0.004, 1 - Math.exp(-dt * 3));
    this.model.rotation.set(tank ? this.pitchV * 0.25 : this.pitchV, 0, tank ? this.bank * 0.2 : this.bank);
    this.model.position.y = tank ? 0 : Math.sin(performance.now() * 0.0013 + this.yaw * 3) * 0.35 * this.scale;
    this.mesh.rotation.set(0, this.yaw, 0);
    this.cdM -= dt;
    this.updateShield(dt);
  }
  aimTurrets(dt, point) {
    for (const t of this.turrets) {
      t.userData.cd -= dt;
      if (!point) { t.rotation.y = lerp(t.rotation.y, 0, 1 - Math.exp(-dt * 2)); t.userData.gun.rotation.x *= 0.95; t.userData.err = 9; continue; }
      t.userData.gun.getWorldPosition(_w);
      t.worldToLocal(_l.copy(point));
      const want = wrap(t.rotation.y + Math.atan2(-_l.x, -_l.z));
      const d = wrap(want - t.rotation.y); t.rotation.y = wrap(t.rotation.y + clamp(d, -dt * 4, dt * 4));
      const dist = _w.distanceTo(point), el = Math.asin(clamp((point.y - _w.y) / Math.max(dist, 1), -1, 1));
      const g = t.userData.gun; g.rotation.x = lerp(g.rotation.x, clamp(el, -0.5, 1.1), 1 - Math.exp(-dt * 7));
      t.userData.err = Math.abs(d) + Math.abs(g.rotation.x - el);
    }
  }
}
