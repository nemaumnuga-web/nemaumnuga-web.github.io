// 탄환·미사일·폭발·파편·전리품 상자·채굴 빔
import { THREE, Q, camera, rand, rv, clamp, sfx, box, cyl, put, finish, HPI, COL } from './core.js';
import { scene, FIRE, SMOKE, flash, groundAt } from './world.js';
import { MUZZLE } from './ships.js';

export const S = { ships: [], player: null, crates: [], hooks: {}, shake: 0 };
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), prevP = new THREE.Vector3(), Z_NEG = new THREE.Vector3(0, 0, -1);

export function explode(pos, size, kind = 'boom') {
  const n = Math.max(2, Math.round(size * 0.55 * Q.fx));
  FIRE.emit(pos.x, pos.y, pos.z, 0, 0, 0, 0.16, size * 1.0, size * 1.7, [4, 3, 2], [3, 1.4, 0.4], 0.9);
  for (let i = 0; i < n; i++) { const v = rv(size * 1.3); FIRE.emit(pos.x, pos.y, pos.z, v[0], v[1], v[2], rand(0.5, 1.1), size * rand(0.4, 0.7), size * rand(0.9, 1.4), COL.fireHot, COL.fireMid, 1, 3.2); }
  for (let i = 0; i < n * 0.7; i++) { const v = rv(size * 0.7); SMOKE.emit(pos.x + v[0] * 0.2, pos.y + v[1] * 0.2, pos.z + v[2] * 0.2, v[0], v[1] + size * 0.2, v[2], rand(2, 4.5), size * 0.5, size * rand(1.6, 2.4), COL.smokeD, COL.smokeL, 0.75, 1.4, -4); }
  for (let i = 0; i < n * 1.2; i++) { const v = rv(size * 5); FIRE.emit(pos.x, pos.y, pos.z, v[0], v[1], v[2], rand(0.5, 1.3), rand(1.5, 3), 0.4, COL.spark, COL.sparkE, 1, 0.6, 90); }
  const dc = camera.position.distanceTo(pos);
  if (size > 15 && dc < 1000) { flash.position.copy(pos); flash.intensity = Math.max(flash.intensity, size * 0.6 * (1 - dc / 1000)); }
  if (dc < 600) S.shake = Math.max(S.shake, size / 40 * (1 - dc / 600));
  if (dc < 1000) sfx(kind, clamp(1 - dc / 1000, 0.1, 1));
}

/* ---------- 탄환 (인스턴스) ---------- */
const MAXB = 2500;
const bulletMesh = new THREE.InstancedMesh(box(0.5, 0.5, 9), new THREE.MeshBasicMaterial({ toneMapped: false }), MAXB);
bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); bulletMesh.frustumCulled = false;
bulletMesh.setColorAt(0, new THREE.Color()); bulletMesh.count = 0;
let bulletsAdded = false;
const B_COL = { player: new THREE.Color(0.8, 4, 4.4), captain: new THREE.Color(1, 2.2, 6), pirate: new THREE.Color(6, 1.6, 0.5) };
export const bullets = [];
export function fireTurrets(s, point, spread = 0.012) {
  let shot = false;
  for (const t of s.turrets) {
    if (t.userData.cd > 0 || t.userData.err > 0.25) continue;
    t.userData.cd = 1 / s.gunRate;
    const g = t.userData.gun;
    for (const mz of MUZZLE) {
      if (bullets.length >= MAXB) break;
      const p = g.localToWorld(tmp.set(mz[0], mz[1], mz[2])).clone();
      const dir = tmp2.copy(point).sub(p).normalize(); dir.x += rand(-spread, spread); dir.y += rand(-spread, spread); dir.z += rand(-spread, spread); dir.normalize();
      const v = dir.clone().multiplyScalar(680).add(s.vel);
      bullets.push({ pos: p, vel: v, q: new THREE.Quaternion().setFromUnitVectors(Z_NEG, dir.clone()), life: 1.15, owner: s, dmg: s.gunDmg });
      if (camera.position.distanceToSquared(p) < 1.2e6) FIRE.emit(p.x, p.y, p.z, s.vel.x, s.vel.y, s.vel.z, 0.06, 4 * s.scale, 1.5, s.faction === 'pirate' ? COL.red : COL.cyan, COL.fireMid, 1);
    }
    shot = true;
  }
  if (shot && s.isPlayer) sfx('shot');
  return shot;
}
function segDist2(a, b, c) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 ? ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / l2 : 0; t = clamp(t, 0, 1);
  const dx = a.x + abx * t - c.x, dy = a.y + aby * t - c.y, dz = a.z + abz * t - c.z; return dx * dx + dy * dy + dz * dz;
}
function hitTest(prev, cur, owner) {
  for (const s of S.ships) { if (!s.alive || s === owner || !S.hooks.hostile(owner, s)) continue; if (segDist2(prev, cur, s.pos) < s.radius * s.radius) return s; }
  return null;
}
const _bm = new THREE.Matrix4(), _bs = new THREE.Vector3(1, 1, 1);
export function updateBullets(dt) {
  if (!bulletsAdded) { scene.add(bulletMesh); bulletsAdded = true; }
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; b.life -= dt; prevP.copy(b.pos); b.pos.addScaledVector(b.vel, dt);
    const hit = hitTest(prevP, b.pos, b.owner);
    const ground = b.pos.y < groundAt(b.pos.x, b.pos.z);
    if (hit) {
      S.hooks.damage(hit, b.dmg, b.owner);
      for (let k = 0; k < 6 * Q.fx + 2; k++) { const v = rv(60); FIRE.emit(b.pos.x, b.pos.y, b.pos.z, v[0], v[1], v[2], rand(0.2, 0.5), 1.6, 0.3, COL.spark, COL.sparkE, 1, 1, 40); }
      FIRE.emit(b.pos.x, b.pos.y, b.pos.z, 0, 0, 0, 0.12, 6, 9, COL.fireHot, COL.fireMid, 1);
    } else if (ground) SMOKE.emit(b.pos.x, b.pos.y + 2, b.pos.z, 0, 10, 0, 1.2, 4, 12, COL.dust, COL.dustE, 0.3);
    if (hit || ground || b.life <= 0) { bullets[i] = bullets[bullets.length - 1]; bullets.pop(); }
  }
  let n = 0;
  for (const b of bullets) { _bm.compose(b.pos, b.q, _bs); bulletMesh.setMatrixAt(n, _bm); bulletMesh.setColorAt(n, B_COL[b.owner.faction]); n++; }
  bulletMesh.count = n; bulletMesh.instanceMatrix.needsUpdate = true; if (bulletMesh.instanceColor) bulletMesh.instanceColor.needsUpdate = true;
}

/* ---------- 미사일 ---------- */
const misGeo = (() => { const B = {}; put(B, 'm', cyl(0.7, 0.7, 6, 10), 0, 0, 0, HPI); put(B, 'm', new THREE.ConeGeometry(0.7, 1.6, 10), 0, 0, -3.8, -HPI); for (let i = 0; i < 4; i++) put(B, 'm', box(0.1, 1.6, 1.4), 0, 0, 2.3, 0, 0, i * HPI); return finish(B, []).m; })();
const misMat = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.4, metalness: 0.5 });
export const missiles = [];
export function fireMissile(s, target) {
  if (s.cdM > 0 || !(s.lv.missile > 0) || !target) return false;
  s.cdM = s.misCd;
  const m = new THREE.Mesh(misGeo, misMat); s.world((missiles.length % 2 ? 5.6 : -5.6), 2.0, -6, m.position); scene.add(m);
  s.fwd(tmp); const v = tmp.clone().multiplyScalar(80).add(s.vel); v.y += 25;
  missiles.push({ mesh: m, vel: v, life: 7, owner: s, dmg: s.misDmg, target, spd: 100 });
  if (s.isPlayer) sfx('shot', 1.6);
  return true;
}
export function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const p = missiles[i], mp = p.mesh.position; p.life -= dt; prevP.copy(mp);
    p.spd = Math.min(380, p.spd + 260 * dt);
    if (p.target && p.target.alive) {
      tmp.copy(p.target.pos).sub(mp).normalize(); const dir = tmp2.copy(p.vel).normalize();
      dir.lerp(tmp, Math.min(1, dt * 2.8)).normalize(); p.vel.copy(dir).multiplyScalar(p.spd);
    } else p.vel.setLength(p.spd);
    mp.addScaledVector(p.vel, dt); tmp2.copy(p.vel).normalize(); p.mesh.quaternion.setFromUnitVectors(Z_NEG, tmp2);
    const bx = mp.x - tmp2.x * 3.5, by = mp.y - tmp2.y * 3.5, bz = mp.z - tmp2.z * 3.5;
    FIRE.emit(bx, by, bz, -tmp2.x * 40, -tmp2.y * 40, -tmp2.z * 40, 0.08, 3.5, 1.2, COL.fireHot, COL.fireMid, 1);
    SMOKE.emit(bx, by, bz, ...rv(3), rand(1.4, 2.4), 2, rand(7, 11), [0.85, 0.83, 0.8], [0.7, 0.68, 0.66], 0.45, 0.6, -3);
    const hit = hitTest(prevP, mp, p.owner);
    const gone = p.life <= 0 || mp.y < groundAt(mp.x, mp.z);
    if (hit) { explode(mp, 26); S.hooks.damage(hit, p.dmg, p.owner); }
    else if (gone) explode(mp, 18);
    if (hit || gone) { scene.remove(p.mesh); missiles.splice(i, 1); }
  }
}

/* ---------- 파편 ---------- */
const DEB_GEO = [box(3, 1.4, 4), box(5, 0.5, 2.5), cyl(1.2, 1.2, 4, 8)];
const debMat = [new THREE.MeshStandardMaterial({ color: 0x8a7d5e, roughness: 0.8, metalness: 0.4 }), new THREE.MeshStandardMaterial({ color: 0x55534c, roughness: 0.5, metalness: 0.8 })];
export const debris = [];
export function spawnDebris(pos, scale = 1) {
  const n = Math.round(9 * Q.fx) + 3;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(DEB_GEO[i % 3], debMat[i % 2]); m.position.copy(pos).add(tmp.set(...rv(6))); m.scale.setScalar(rand(0.6, 1.3) * scale);
    m.castShadow = true; scene.add(m);
    debris.push({ mesh: m, vel: new THREE.Vector3(...rv(80)).add(tmp.set(0, 30, 0)), rot: new THREE.Vector3(...rv(5)), life: rand(2.5, 4.5), burn: Math.random() < 0.6 });
  }
}
export function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i], m = d.mesh; d.life -= dt; d.vel.y -= 70 * dt; m.position.addScaledVector(d.vel, dt);
    m.rotation.x += d.rot.x * dt; m.rotation.y += d.rot.y * dt; m.rotation.z += d.rot.z * dt;
    if (d.burn) { FIRE.emit(m.position.x, m.position.y, m.position.z, 0, 0, 0, 0.25, 4, 1, COL.fireHot, COL.fireMid, 1); SMOKE.emit(m.position.x, m.position.y, m.position.z, 0, 6, 0, 1.8, 3, 9, COL.smokeD, COL.smokeL, 0.55); }
    if (d.life <= 0 || m.position.y < groundAt(m.position.x, m.position.z)) { if (d.life > 0) explode(m.position, 7, 'hit'); scene.remove(m); debris.splice(i, 1); }
  }
}

/* ---------- 전리품 상자 ---------- */
const crateGeo = box(4, 4, 4), crateMat = new THREE.MeshStandardMaterial({ color: 0x3a3a36, roughness: 0.5, metalness: 0.7, emissive: 0x22d3d3, emissiveIntensity: 0.25 });
const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3, 3.2), toneMapped: false, transparent: true, opacity: 0.35, depthWrite: false });
export function dropCrate(pos, credits, cargo) {
  const kg = Object.entries(cargo || {}).reduce((a, [k, n]) => a + n, 0);
  if (credits <= 0 && kg <= 0) return;
  const g = new THREE.Group(); g.position.copy(pos);
  const c = new THREE.Mesh(crateGeo, crateMat); c.castShadow = true; g.add(c);
  const beam = new THREE.Mesh(cyl(0.6, 0.6, 120, 6), beamMat); beam.position.y = 60; g.add(beam);
  scene.add(g); S.crates.push({ g, vel: new THREE.Vector3(...rv(10)), credits, cargo: Object.assign({}, cargo), life: 120 });
}
export function updateCrates(dt) {
  for (let i = S.crates.length - 1; i >= 0; i--) {
    const c = S.crates[i]; c.life -= dt;
    const gy = groundAt(c.g.position.x, c.g.position.z) + 2;
    c.vel.y -= 25 * dt; c.g.position.addScaledVector(c.vel, dt); if (c.g.position.y < gy) { c.g.position.y = gy; c.vel.set(0, 0, 0); }
    c.g.children[0].rotation.y += dt;
    for (const s of S.ships) if (s.alive && s.pos.distanceTo(c.g.position) < 26 * s.scale) { S.hooks.pickup(s, c); c.life = 0; break; }
    if (c.life <= 0) { scene.remove(c.g); S.crates.splice(i, 1); }
  }
}

/* ---------- 채굴 빔 ---------- */
export function mineBeam(s, node) {
  s.world(0, -4.6, 0, tmp);
  const tx = node.x + rand(-5, 5), ty = node.y + rand(3, 10), tz = node.z + rand(-5, 5);
  const n = 6;
  for (let i = 0; i <= n; i++) { const t = i / n; FIRE.emit(tmp.x + (tx - tmp.x) * t, tmp.y + (ty - tmp.y) * t, tmp.z + (tz - tmp.z) * t, 0, 0, 0, 0.07, 2.2, 1.6, COL.cyan, COL.cyan, 0.8); }
  for (let k = 0; k < 2; k++) { const v = rv(25); FIRE.emit(tx, ty, tz, v[0], Math.abs(v[1]), v[2], rand(0.3, 0.6), 1.5, 0.3, COL.spark, COL.sparkE, 1, 1, 50); }
  if (Math.random() < 0.3) SMOKE.emit(tx, ty, tz, ...rv(6), 1.5, 4, 12, COL.dust, COL.dustE, 0.4);
}

/* ---------- 함선 연출 (배기·비행운·손상) ---------- */
export function shipFx(s, dt) {
  s.radar.rotation.y += dt * 2.2;
  if (camera.position.distanceToSquared(s.pos) > 1.4e6 * Q.fx) return;
  s.fwd(tmp2);
  const thr = 0.6 + Math.abs(s.inThrust) + (s.speed / s.maxSpeed) * 0.4, back = -20 - s.speed * 0.3, sc = s.scale;
  const nacs = s.tier >= 3 ? [[-8, -0.3], [8, -0.3], [-11.5, -2.4], [11.5, -2.4]] : [[-8, -0.3], [8, -0.3]];
  for (const [x, y] of nacs) { s.world(x, y, 15.4, tmp); FIRE.emit(tmp.x, tmp.y, tmp.z, tmp2.x * back + rand(-2, 2), rand(-2, 2), tmp2.z * back + rand(-2, 2), 0.2, 2.5 * thr * sc, 0.6, COL.exhaust, COL.exhaustE, 0.7); }
  // 부양 포드 아래 열기
  if (Math.random() < 0.5) for (const x of [-3.3, 3.3]) { s.world(x, -4.8, rand(-6, 5.5), tmp); FIRE.emit(tmp.x, tmp.y, tmp.z, 0, -18, 0, 0.18, 1.8 * sc, 0.5, [1.2, 0.8, 2.5], [0.3, 0.2, 0.8], 0.5); }
  if (s.speed > s.maxSpeed * 0.85 || Math.abs(s.bank) > 0.22) for (const x of [-14.3, 14.3]) { s.world(x, 0.4, 8, tmp); SMOKE.emit(tmp.x, tmp.y, tmp.z, 0, 0, 0, 1.2, 1.2, 3.5, COL.white, COL.white, 0.3); }
  const hpR = s.hp / s.maxHp;
  if (hpR < 0.55 && Math.random() < 0.7) { s.world(rand(-3, 3), 3, rand(-4, 8), tmp); SMOKE.emit(tmp.x, tmp.y, tmp.z, ...rv(4), rand(1.5, 2.5), 3 * sc, 14 * sc, COL.smokeD, [0.3, 0.28, 0.26], 0.7, 0.4, -6); }
  if (hpR < 0.3) { s.world(rand(-3, 3), 2.6, rand(-3, 6), tmp); FIRE.emit(tmp.x, tmp.y, tmp.z, ...rv(6), 0.35, 4 * sc, 1.5, COL.fireHot, COL.fireMid, 1); }
}
export function clearFx() {
  bullets.length = 0; for (const m of missiles) scene.remove(m.mesh); missiles.length = 0;
  for (const d of debris) scene.remove(d.mesh); debris.length = 0;
  for (const c of S.crates) scene.remove(c.g); S.crates.length = 0;
}
