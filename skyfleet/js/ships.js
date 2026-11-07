// 함선 모델 + 호버 비행 물리
import { THREE, rand, clamp, lerp, wrap, canvasTex, put, finish, box, cyl, HPI, addProto } from './core.js';
import { TIERS, PAINTS, WORLD } from './data.js';
import { groundAt, envMats } from './world.js';

/* ---------- 재질 ---------- */
function hullTexture() {
  return canvasTex(512, 512, (x) => {
    x.fillStyle = '#a99a72'; x.fillRect(0, 0, 512, 512);
    for (let gy = 0; gy < 512; gy += 64) for (let gx = 0; gx < 512; gx += 64) {
      const sub = Math.random() < 0.4 ? 2 : 1, w = 64 / sub;
      for (let a = 0; a < sub; a++) for (let b = 0; b < sub; b++) { x.fillStyle = `hsl(${rand(40, 46)},${rand(18, 26)}%,${52 + rand(-6, 6)}%)`; x.fillRect(gx + a * w, gy + b * w, w, w); }
    }
    x.strokeStyle = 'rgba(40,30,18,.6)'; x.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke(); }
    x.fillStyle = 'rgba(30,22,12,.55)';
    for (let i = 0; i <= 512; i += 64) for (let j = 4; j < 512; j += 10) { x.fillRect(i + 3, j, 2, 2); x.fillRect(j, i + 3, 2, 2); }
    for (let i = 0; i < 40; i++) { const px = rand(0, 512), py = rand(0, 512), r = rand(20, 80), g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(60,40,20,.28)'); g.addColorStop(1, 'rgba(60,40,20,0)'); x.fillStyle = g; x.fillRect(0, 0, 512, 512); }
    for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(50,35,20,${rand(0.05, 0.18)})`; x.fillRect(rand(0, 512), rand(0, 512), rand(1, 3), rand(20, 90)); }
  });
}
const HULL_TEX = hullTexture(); HULL_TEX.wrapS = HULL_TEX.wrapT = THREE.RepeatWrapping;
const SHARED = {
  metal: new THREE.MeshStandardMaterial({ color: 0x77766d, roughness: 0.38, metalness: 0.85 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2b2925, roughness: 0.6, metalness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x0e1a24, emissive: 0x3aa0ff, emissiveIntensity: 1.6, roughness: 0.08, metalness: 0.9 }),
  glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.2, 0.7), toneMapped: false }),
  navR: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.3, 0.2), toneMapped: false }),
  navG: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 6, 0.6), toneMapped: false }),
};
envMats.push(SHARED.metal, SHARED.dark, SHARED.glass);
export const FACTION_COL = { player: 0x22d3d3, captain: 0x3f86ff, pirate: 0xff3a24 };
const matCache = {};
export function shipMats(paintId, faction) {
  const key = paintId + '|' + faction; if (matCache[key]) return matCache[key];
  const p = (PAINTS.find(q => q.id === paintId) || PAINTS[0]).c, c = new THREE.Color(p[0], p[1], p[2]);
  const hull = new THREE.MeshStandardMaterial({ map: HULL_TEX, color: c, roughness: 0.72, metalness: 0.35 });
  const armor = new THREE.MeshStandardMaterial({ map: HULL_TEX, color: c.clone().multiplyScalar(0.8), roughness: 0.78, metalness: 0.45 });
  const fc = FACTION_COL[faction];
  const team = new THREE.MeshStandardMaterial({ color: fc, emissive: fc, emissiveIntensity: 0.4, roughness: 0.5, metalness: 0.3 });
  envMats.push(hull, armor, team);
  return (matCache[key] = Object.assign({ hull, armor, team }, SHARED));
}
export function blinkNav(t) { const b = (t % 1.2) < 0.15 ? 1 : 0.15; SHARED.navR.color.setRGB(6 * b, 0.3 * b, 0.2 * b); SHARED.navG.color.setRGB(0.3 * b, 6 * b, 0.6 * b); }

/* ---------- 모델 ---------- */
function shipProto(tier) {
  const B = {};
  const sh = new THREE.Shape([[-3.2, -2.4], [3.2, -2.4], [4.6, -1.0], [5.0, 0.9], [4.0, 2.2], [-4.0, 2.2], [-5.0, 0.9], [-4.6, -1.0]].map(p => new THREE.Vector2(p[0], p[1])));
  const hull = new THREE.ExtrudeGeometry(sh, { depth: 26, steps: 8, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.35, bevelSegments: 1 });
  hull.translate(0, 0, -13);
  const hp = hull.attributes.position;
  for (let i = 0; i < hp.count; i++) { const z = hp.getZ(i); const t = clamp((-4 - z) / 9.5, 0, 1); hp.setX(i, hp.getX(i) * (1 - 0.48 * t)); hp.setY(i, hp.getY(i) * (1 - 0.32 * t) - 0.35 * t); }
  hull.computeVertexNormals(); put(B, 'hull', hull);
  put(B, 'armor', box(7, 0.6, 20), 0, -2.75, 0.5);
  put(B, 'team', box(1.4, 0.12, 13), 0, 2.6, 1.5);
  for (const s of [-1, 1]) put(B, 'team', box(0.15, 0.9, 9), s * 5.38, 0.9, 0);
  for (const s of [-1, 1]) for (const z of [-1.2, -3.9]) put(B, 'armor', cyl(1.1, 1.15, 0.3, 14), s * 2.1, 2.65, z);
  put(B, 'hull', box(5, 2.6, 6), 0, 3.85, 6);
  put(B, 'armor', box(3.6, 1.5, 3.6), 0, 5.9, 6.4);
  put(B, 'glass', box(4.2, 0.55, 0.12), 0, 4.35, 2.97); put(B, 'glass', box(3.0, 0.45, 0.1), 0, 6.05, 4.58);
  for (const s of [-1, 1]) put(B, 'glass', box(0.1, 0.45, 2.6), s * 2.52, 4.35, 5);
  if (tier >= 2) { put(B, 'hull', box(3, 1.4, 3), 0, 7.4, 7); put(B, 'glass', box(3.1, 0.4, 0.1), 0, 7.5, 5.48); }
  put(B, 'metal', cyl(0.15, 0.18, 3.6, 6), 0, tier >= 2 ? 9.6 : 8.4, 7);
  for (const s of [-1, 1]) put(B, 'dark', cyl(0.06, 0.06, 3.2, 4), s * 1.3, 8.1, 7.6);
  for (const s of [-1, 1]) put(B, 'dark', box(2.2, 0.25, 3), s * 2.3, 2.65, 10.6);
  put(B, 'hull', box(27, 0.5, 5), 0, 0.4, 7);
  // 사다리 (선교 뒤)
  for (let i = 0; i < 5; i++) put(B, 'dark', box(1.6, 0.12, 0.12), 0, 2.9 + i * 0.6, 9.05);
  for (const s of [-1, 1]) {
    put(B, 'hull', box(0.3, 3, 3.2), s * 12.6, 2.0, 8, 0, 0, s * -0.15);
    put(B, 'team', box(1.3, 0.9, 5.2), s * 13.6, 0.4, 7);
    put(B, s < 0 ? 'navR' : 'navG', box(0.5, 0.5, 0.6), s * 14.35, 0.4, 5.6);
    const nac = tier >= 3 ? [[8, -0.3], [11.5, -2.4]] : [[8, -0.3]];
    for (const [nx, ny] of nac) {
      put(B, 'metal', cyl(1.9, 1.9, 9, 16), s * nx, ny, 9, HPI);
      for (const z of [6.5, 9.5, 12]) put(B, 'dark', cyl(2.05, 2.05, 0.35, 16), s * nx, ny, z, HPI);
      put(B, 'dark', cyl(1.9, 2.2, 0.8, 16), s * nx, ny, 4.3, HPI);
      put(B, 'dark', cyl(1.5, 1.9, 1.3, 16), s * nx, ny, 14.1, HPI);
      put(B, 'glow', cyl(1.25, 1.25, 0.2, 14), s * nx, ny, 14.8, HPI);
      // 장갑 덮개 (스카이쉽 스타일 노란 패널)
      put(B, 'team', box(0.25, 2.6, 6), s * (nx + 2.1), ny, 9);
    }
    put(B, 'dark', box(0.6, 0.6, 3), s * 5.9, -0.3, 8);
    for (const z of [-6, 5.5]) { put(B, 'metal', cyl(1.3, 1.1, 2.2, 12), s * 3.3, -3.3, z); put(B, 'dark', cyl(1.38, 1.38, 0.3, 12), s * 3.3, -2.5, z); put(B, 'glow', cyl(0.85, 0.85, 0.12, 12), s * 3.3, -4.45, z); }
    if (tier >= 1) { put(B, 'armor', box(1.3, 1.3, 4.5), s * 5.6, 2.0, -3); for (const a of [-1, 1]) for (const b of [-1, 1]) put(B, 'dark', cyl(0.3, 0.3, 0.1, 8), s * 5.6 + a * 0.32, 2.0 + b * 0.32, -5.27, HPI); }
    if (tier >= 2) put(B, 'armor', box(2.6, 1.6, 4), s * 5.8, 1.2, 2);   // 측면 포탑 받침
  }
  // 착륙 기어
  put(B, 'dark', box(0.8, 3, 0.8), 0, -4.2, -9); put(B, 'team', box(2.4, 0.5, 2), 0, -5.8, -9);
  put(B, 'armor', box(5, 3, 1.6), 0, 0, 13.9); put(B, 'glow', box(3.4, 1.5, 0.15), 0, 0, 14.75);
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
const PROTOS = TIERS.map(t => shipProto(t.id)), TUR = turretProto(), RAD = radarProto();
const TURRET_SLOTS = [
  [[0, 2.15, -8.6], [0, 2.55, 11.2]],
  [[0, 2.15, -8.6], [0, 2.55, 11.2]],
  [[0, 2.15, -8.6], [0, 2.55, 11.2], [5.8, 2.0, 2]],
  [[0, 2.15, -8.6], [0, 2.55, 11.2], [5.8, 2.0, 2], [-5.8, 2.0, 2]],
];
export const MUZZLE = [[-0.45, 0, -5.4], [0.45, 0, -5.4]];
export function makeShipModel(tier, paint, faction, scaleMul = 1) {
  const mats = shipMats(paint, faction);
  const root = new THREE.Group(), model = new THREE.Group(); root.add(model);
  const sc = TIERS[tier].scale * scaleMul; model.scale.setScalar(sc);
  addProto(model, PROTOS[tier], mats);
  const turrets = TURRET_SLOTS[tier].map(p => {
    const t = new THREE.Group(); t.position.set(...p); addProto(t, TUR.base, mats);
    const g = new THREE.Group(); g.position.y = 1.25; addProto(g, TUR.gun, mats); t.add(g); t.userData.gun = g; t.userData.cd = rand(0, 0.3);
    model.add(t); return t;
  });
  const radar = new THREE.Group(); radar.position.set(0, tier >= 2 ? 11.5 : 10.3, 7); addProto(radar, RAD, mats); model.add(radar);
  return { root, model, turrets, radar };
}

/* ---------- 함선 ---------- */
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _l = new THREE.Vector3(), _w = new THREE.Vector3();
export class Ship {
  constructor({ name, faction, tier = 0, paint = 'sand', lv = {}, pvp = false, isPlayer = false, weapon = 'cannon', scaleMul = 1, hpMul = 1 }) {
    Object.assign(this, { name, faction, tier, paint, lv, pvp, isPlayer, weapon, scaleMul, hpMul });
    this.energy = 100; this.boosting = false; this.flareCd = 0;
    this.vel = new THREE.Vector3(); this.yaw = 0; this.yawVel = 0; this.bank = 0; this.pitchV = 0;
    this.cargo = {}; this.cargoKg = 0; this.alive = false; this.respawn = 0; this.kills = 0;
    this.inThrust = 0; this.inTurn = 0; this.inLift = 0; this.aim = null; this.lock = null; this.cdM = 0;
    this.ai = { mode: 'idle', t: 0 };
    this.build();
  }
  build(scene) {
    const parent = this.mesh && this.mesh.parent;
    if (this.mesh && parent) parent.remove(this.mesh);
    const m = makeShipModel(this.tier, this.paint, this.faction, this.scaleMul);
    this.mesh = m.root; this.model = m.model; this.turrets = m.turrets; this.radar = m.radar;
    if (this.isPlayer) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(16 * TIERS[this.tier].scale, 0.18, 6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 3.5, 3.6), toneMapped: false, transparent: true, opacity: 0.85 }));
      ring.rotation.x = HPI; ring.position.y = 6 * TIERS[this.tier].scale; this.mesh.add(ring); this.ring = ring;
    }
    if (this.pos) this.mesh.position.copy(this.pos);
    this.pos = this.mesh.position;
    if (parent || scene) (parent || scene).add(this.mesh);
    this.mesh.visible = this.alive;
    this.stats();
  }
  stats() {
    const T = TIERS[this.tier], l = this.lv;
    const g = k => l[k] || 0;
    this.maxHp = Math.round(T.hp * (1 + 0.22 * g('armor')) * (this.hpMul || 1));
    this.maxSpeed = T.speed * (1 + 0.07 * g('engine')); this.accel = T.accel * (1 + 0.07 * g('engine')); this.turnRate = T.turn * (1 + 0.06 * g('engine'));
    this.cargoCap = Math.round(T.cargo * (1 + 0.2 * g('cargo')));
    this.drill = 1.3 * (1 + 0.5 * g('drill'));
    this.gunDmg = 2.2 + 0.9 * g('guns'); this.gunRate = 2.4 + 0.6 * g('guns');
    this.misDmg = 40 + 15 * g('missile'); this.misCd = Math.max(2.5, 6 - 0.6 * g('missile'));
    this.radius = 16 * this.scale; this.hover = 7 * this.scale;
    if (this.hp === undefined || this.hp > this.maxHp) this.hp = this.maxHp;
  }
  get scale() { return TIERS[this.tier].scale * (this.scaleMul || 1); }
  spawnAt(x, y, z, yaw) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.yaw = yaw; this.yawVel = 0; this.hp = this.maxHp; this.alive = true; this.mesh.visible = true;
    this.cargo = {}; this.cargoKg = 0; this.lock = null; this.cdM = 1; this.energy = 100; this.flareCd = 0;
    this.mesh.rotation.set(0, yaw, 0); this.mesh.updateMatrixWorld(true);
  }
  fwd(out) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  world(x, y, z, out) { return this.model.localToWorld(out.set(x, y, z)); }
  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  physics(dt, onImpact) {
    const load = this.cargoKg / Math.max(1, this.cargoCap); let vmax = this.maxSpeed * (1 - 0.3 * clamp(load, 0, 1.2)), acc = this.accel;
    const boost = this.boosting && this.energy > 1 && this.inThrust > 0.2;
    if (boost) { vmax *= 1.65; acc *= 2.4; this.energy = Math.max(0, this.energy - 28 * dt); } else this.energy = Math.min(100, this.energy + 13 * dt);
    this.boostOn = boost; this.flareCd -= dt;
    this.fwd(_f); _r.set(-_f.z, 0, _f.x);
    this.vel.addScaledVector(_f, this.inThrust * acc * dt);
    this.vel.y += this.inLift * this.accel * 0.9 * dt;
    // 감쇠: 옆미끄럼 강하게, 전진 약하게
    const fw = this.vel.dot(_f), sd = this.vel.dot(_r);
    const fw2 = fw * Math.exp(-dt * (Math.abs(this.inThrust) > 0.05 ? 0.25 : 0.7)), sd2 = sd * Math.exp(-dt * 2.2);
    this.vel.x = _f.x * fw2 + _r.x * sd2; this.vel.z = _f.z * fw2 + _r.z * sd2;
    this.vel.y *= Math.exp(-dt * (Math.abs(this.inLift) > 0.05 ? 0.6 : 2.4));
    const hs = Math.hypot(this.vel.x, this.vel.z); if (hs > vmax) { this.vel.x *= vmax / hs; this.vel.z *= vmax / hs; }
    this.vel.y = clamp(this.vel.y, -vmax * 0.6, vmax * 0.6);
    this.yawVel = lerp(this.yawVel, this.inTurn * this.turnRate, 1 - Math.exp(-dt * 3));
    this.yaw = wrap(this.yaw + this.yawVel * dt);
    this.pos.addScaledVector(this.vel, dt);
    // 경계
    for (const k of ['x', 'z']) if (Math.abs(this.pos[k]) > WORLD) { this.vel[k] -= Math.sign(this.pos[k]) * 60 * dt; }
    const g = groundAt(this.pos.x, this.pos.z) + this.hover;
    if (this.pos.y < g) { if (this.vel.y < -14 && onImpact) onImpact(this, -this.vel.y); this.pos.y = g; if (this.vel.y < 0) this.vel.y = 0; }
    if (this.pos.y > 1100) { this.pos.y = 1100; this.vel.y = Math.min(0, this.vel.y); }
    // 연출: 기울기·자세·부유감
    const tb = clamp(-this.yawVel / this.turnRate, -1, 1) * 0.28 + clamp(sd / 40, -0.15, 0.15);
    this.bank = lerp(this.bank, -tb, 1 - Math.exp(-dt * 3));
    this.pitchV = lerp(this.pitchV, -this.inThrust * 0.06 * (1 - hs / (vmax + 1) * 0.5) + this.vel.y * 0.003, 1 - Math.exp(-dt * 2.5));
    this.model.rotation.set(this.pitchV, 0, this.bank);
    this.model.position.y = Math.sin(performance.now() * 0.0013 + this.yaw * 3) * 0.35 * this.scale;
    this.mesh.rotation.set(0, this.yaw, 0);
    this.cdM -= dt;
  }
  aimTurrets(dt, point) {
    for (const t of this.turrets) {
      t.userData.cd -= dt;
      if (!point) { t.rotation.y = lerp(t.rotation.y, 0, 1 - Math.exp(-dt * 2)); t.userData.gun.rotation.x *= 0.95; t.userData.err = 9; continue; }
      t.userData.gun.getWorldPosition(_w);
      t.worldToLocal(_l.copy(point));
      const want = wrap(t.rotation.y + Math.atan2(-_l.x, -_l.z));
      const d = wrap(want - t.rotation.y); t.rotation.y = wrap(t.rotation.y + clamp(d, -dt * 3.2, dt * 3.2));
      const dist = _w.distanceTo(point), el = Math.asin(clamp((point.y - _w.y) / Math.max(dist, 1), -1, 1));
      const g = t.userData.gun; g.rotation.x = lerp(g.rotation.x, clamp(el, -0.5, 1.1), 1 - Math.exp(-dt * 6));
      t.userData.err = Math.abs(d) + Math.abs(g.rotation.x - el);
    }
  }
}
