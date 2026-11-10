// AI: 해적(약탈) · 캡틴(채굴·교역·자위)
import { THREE, rand, clamp, wrap } from './core.js';
import { WORLD, WEAPONS } from './data.js';
import { ores, ports, groundAt, nearestPort } from './world.js';
import { S, fireTurrets, fireMissile, mineBeam } from './fx.js';

const tmp = new THREE.Vector3(), aimP = new THREE.Vector3();

function steer(s, tx, ty, tz, speedFrac, dt) {
  const dx = tx - s.pos.x, dz = tz - s.pos.z, dist = Math.hypot(dx, dz);
  const want = Math.atan2(-dx, -dz), d = wrap(want - s.yaw);
  s.inTurn = clamp(d * 1.6, -1, 1);
  const align = Math.max(0, Math.cos(d));
  s.inThrust = dist > 25 ? clamp(dist / 140, 0, 1) * speedFrac * align : -clamp(s.speed / 20, 0, 0.6);
  // 지형 회피: 2.5초 앞을 내다봄
  const ax = s.pos.x + s.vel.x * 2.5, az = s.pos.z + s.vel.z * 2.5;
  const safe = Math.max(groundAt(ax, az), groundAt(s.pos.x, s.pos.z), groundAt((s.pos.x + ax) / 2, (s.pos.z + az) / 2)) + 45 * s.scale;
  const wantY = Math.max(ty, safe);
  s.inLift = clamp((wantY - s.pos.y) / 30, -1, 1);
  if (s.pos.y < safe - 10) s.inThrust *= 0.4;
  return dist;
}
function findTarget(s, range) {
  let best = null, bd = range;
  for (const o of S.ships) { if (!o.alive || o === s || !S.hooks.hostile(s, o)) continue; const d = o.pos.distanceTo(s.pos); if (d < bd) { bd = d; best = o; } }
  // 해적은 아군 기지·유닛도 노린다 (기지는 조금 덜 우선)
  if (s.faction === 'pirate') for (const o of S.units) { if (!o.alive || o.build > 0) continue; const d = o.pos.distanceTo(s.pos) * (o.def ? 1 : 1.3); if (d < bd) { bd = d; best = o; } }
  return best;
}
/* 전투 AI v2: 무기 사거리에 맞춘 선회, 피격 시 회피 기동, 체력 낮으면 이탈, 탄속 기반 리드 조준, 미사일 일제사격 */
function combat(s, t, dt) {
  const a = s.ai, dist = t.pos.distanceTo(s.pos), W = WEAPONS[s.weapon] || WEAPONS.cannon;
  const rng = W.speed * (s.bulletSpd || 1) * W.life * 0.85, hpR = s.hp / s.maxHp;
  a.hitT = Math.max(0, (a.hitT || 0) - dt); if (s.hp < (a.lastHp ?? s.hp) - 0.5) a.hitT = 1.6; a.lastHp = s.hp;
  // 체력이 낮으면 물러나 방어막 회복 후 복귀
  if (hpR < 0.28 || (s.shBroken > 0 && hpR < 0.55)) a.retreatT = 6;
  if ((a.retreatT = (a.retreatT || 0) - dt) > 0) {
    const ux = s.pos.x - t.pos.x, uz = s.pos.z - t.pos.z, l = Math.hypot(ux, uz) || 1;
    steer(s, s.pos.x + ux / l * 600, t.pos.y + 140, s.pos.z + uz / l * 600, 1, dt); s.boosting = true;
    aimP.copy(t.pos).addScaledVector(t.vel, dist / W.speed); s.aimTurrets(dt, aimP); if (dist < rng) fireTurrets(s, aimP, 0.04);
    if (s.flareCd <= 0 && Math.random() < dt) S.hooks.flare && S.hooks.flare(s);
    return;
  }
  a.orbit = (a.orbit ?? rand(0, 6)) + dt * (0.45 + (a.hitT > 0 ? 0.6 : 0)) * (a.dir || 1);
  if (Math.random() < dt * 0.12) a.dir = -(a.dir || 1);                 // 불규칙하게 도는 방향 전환
  const r = Math.max(160, Math.min(rng * 0.7, 520)) + (a.seed || 0) * 80;
  const jink = a.hitT > 0 ? Math.sin(performance.now() / 180 + a.seed * 9) * 45 : 0;   // 맞으면 위아래로 흔든다
  steer(s, t.pos.x + Math.cos(a.orbit) * r, t.pos.y + 30 + jink + Math.sin(a.orbit * 0.7) * 25, t.pos.z + Math.sin(a.orbit) * r, dist > r * 1.6 ? 1 : 0.85, dt);
  s.boosting = dist > rng * 1.5 || a.hitT > 0.8;
  // 2단 리드 조준 (목표의 속도 · 탄 비행시간)
  let tt = dist / (W.speed * (s.bulletSpd || 1)); aimP.copy(t.pos).addScaledVector(t.vel, tt); tt = aimP.distanceTo(s.pos) / (W.speed * (s.bulletSpd || 1)); aimP.copy(t.pos).addScaledVector(t.vel, tt);
  s.aim = aimP; s.aimTurrets(dt, aimP);
  if (dist < rng) fireTurrets(s, aimP, 0.018 + (1 - (a.skill || 0.9)) * 0.03);
  if (dist > 160 && dist < 1200 && Math.random() < dt * 0.45) fireMissile(s, t);
  // 일제사격: 25초마다 미사일 4발
  a.salvo = (a.salvo ?? rand(8, 20)) - dt;
  if (a.salvo <= 0 && dist < 1000 && s.lv.missile > 0) { a.salvo = rand(22, 30); for (let i = 0; i < 4; i++) { s.cdM = 0; fireMissile(s, t); } }
}
export function runAI(s, dt) {
  const a = s.ai; a.t -= dt; a.skill = a.skill || rand(0.6, 1); a.seed = a.seed ?? Math.random(); a.dir = a.dir || (Math.random() < 0.5 ? -1 : 1);
  // 공격받으면 반격
  if (a.attacker && (!a.attacker.alive || a.attackT <= 0)) a.attacker = null; a.attackT = (a.attackT || 0) - dt;
  if (s.faction === 'pirate') {
    if (!a.target || !a.target.alive || a.t <= 0 || a.target.pos.distanceTo(s.pos) > 1500) { a.target = a.attacker || findTarget(s, 1100); a.t = rand(4, 8); }
    if (a.target && S.hooks.safe(a.target)) { a.target = null; a.attacker = null; }
    const nearPort = ports.find(p => Math.hypot(p.x - s.pos.x, p.z - s.pos.z) < 520);
    if (nearPort) { const dx = s.pos.x - nearPort.x, dz = s.pos.z - nearPort.z, l = Math.hypot(dx, dz) || 1; steer(s, nearPort.x + dx / l * 800, s.pos.y, nearPort.z + dz / l * 800, 1, dt); s.aimTurrets(dt, null); return; }
    if (a.target) combat(s, a.target, dt);
    else {
      if (!a.wp || Math.hypot(a.wp.x - s.pos.x, a.wp.z - s.pos.z) < 80) a.wp = { x: rand(-WORLD * 0.8, WORLD * 0.8), y: rand(220, 420), z: rand(-WORLD * 0.8, WORLD * 0.8) };
      steer(s, a.wp.x, a.wp.y, a.wp.z, 0.6, dt); s.aimTurrets(dt, null);
    }
    return;
  }
  // 캡틴
  const threat = a.attacker || (a.t <= 0 ? (a.threat = findTarget(s, 420)) : a.threat);
  if (a.t <= 0) a.t = rand(1.5, 3);
  if (threat && threat.alive) { a.mode = 'fight'; combat(s, threat, dt); return; }
  s.aimTurrets(dt, null);
  if (a.mode !== 'return' && s.cargoKg >= s.cargoCap * rand(0.6, 0.75)) { a.mode = 'return'; a.node = null; }
  if (a.mode === 'return') {
    if (!a.port) a.port = nearestPort(s.pos)[0];
    const p = a.port, d = steer(s, p.x, p.deck + 30, p.z, 0.8, dt);
    if (d < 40) { s.cargo = {}; s.cargoKg = 0; a.mode = 'mine'; a.port = null; s.hp = s.maxHp; }
    return;
  }
  a.mode = 'mine';
  if (!a.node || !a.node.alive) {
    let best = null, bd = 1e9; for (const o of ores) { if (!o.alive) continue; const d = Math.hypot(o.x - s.pos.x, o.z - s.pos.z) * rand(0.7, 1.4); if (d < bd) { bd = d; best = o; } }
    a.node = best;
  }
  const n = a.node; if (!n) return;
  const d = steer(s, n.x + (a.seed - 0.5) * 30, n.y + 34 * s.scale, n.z + (a.seed - 0.5) * 30, 0.75, dt);
  if (d < 45 && s.pos.y - n.y < 80) { S.hooks.mine(s, n, dt); if (Math.random() < 0.5) mineBeam(s, n); }
}
