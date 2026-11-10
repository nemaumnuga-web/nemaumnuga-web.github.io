// 궁극기: 원소 게이지를 모아 원소별 대규모 공격. 충전 → 응축 → 대폭발 · 충격파 · 빛기둥 · 원소 반응
import { THREE, $, rand, clamp, sfx, Q, camera, COL, FXS } from './core.js';
import { ELEMENTS, save } from './data.js';
import { scene, FIRE, SMOKE, flash } from './world.js';
import { S } from './fx.js';

export const ULT_NAMES = { pyro: '태양 붕괴', hydro: '해일 심판', anemo: '폭풍의 눈', electro: '천뢰 강림', dendro: '세계수 개화', cryo: '절대영도', geo: '대지 붕괴', all: '칠원소 개방' };
const fxList = [];
const ringGeo = new THREE.TorusGeometry(1, 0.06, 8, 96), pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true), orbGeo = new THREE.SphereGeometry(1, 32, 20);
const addMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const col = e => { const c = (ELEMENTS[e] || ELEMENTS.anemo).col; return new THREE.Color(c[0], c[1], c[2]); };
function spawn(mesh, life, upd) { scene.add(mesh); fxList.push({ mesh, t: 0, life, upd }); }
/* 게이지: 피해·격추·시간으로 충전 */
export function ultGain(p, amt) { if (!p || !p.isPlayer) return; p.ult = clamp((p.ult || 0) + amt * (save.founder ? 2 : 1), 0, 100); }
export const ultReady = p => p && (p.ult || 0) >= 100 && p.elems && p.elems.length > 0;
let casting = null;
export function castUlt(p) {
  if (!ultReady(p) || casting) return false;
  const all = save.founder && p.elems.length >= 7, elems = all ? p.elems.slice() : [p.elems[(p.ultIdx = (p.ultIdx || 0) + 1) % p.elems.length]];
  p.ult = 0; casting = { p, elems, t: 0, waves: 0, key: all ? 'all' : elems[0] };
  // 충전 연출: 주위로 빛이 빨려 들어옴
  sfx('ultCharge', 1.2);
  const c = col(elems[0]), orb = new THREE.Mesh(orbGeo, addMat(c)); orb.position.copy(p.pos);
  spawn(orb, 1.1, (f, k) => { f.mesh.position.copy(p.pos); f.mesh.scale.setScalar(4 + k * 18); f.mesh.material.opacity = 0.25 + k * 0.6; });
  for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(ringGeo, addMat(col(elems[i % elems.length]))); r.rotation.set(rand(0, 3), rand(0, 3), 0); spawn(r, 1.1, (f, k) => { f.mesh.position.copy(p.pos); f.mesh.scale.setScalar(140 * (1 - k) + 8); f.mesh.rotation.z += 0.08; f.mesh.material.opacity = k; }); }
  hooks.banner && hooks.banner('ULTIMATE', `${ULT_NAMES[casting.key]}${all ? ' — 일곱 원소를 모두 해방한다' : ` · ${ELEMENTS[elems[0]].nm}`}`);
  return true;
}
export const hooks = { banner: null, hit: null };
function wave(p, e, idx, n) {
  const c = col(e), cA = ELEMENTS[e].col, R = (save.founder ? 900 : 620), pos = p.pos.clone();
  sfx('ult', idx === 0 ? 1.4 : 0.8); S.shake = Math.max(S.shake, 1.4); flash.position.copy(pos); flash.intensity = Math.max(flash.intensity, 700);
  FXS.ultB = 1;
  // 충격파 링 3겹
  for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(ringGeo, addMat(c)); r.rotation.x = Math.PI / 2; r.position.copy(pos); spawn(r, 1.3 + k * 0.25, (f, q) => { f.mesh.scale.set(R * q * (1 + k * 0.12), R * q * (1 + k * 0.12), 40 * (1 - q) + 4); f.mesh.material.opacity = (1 - q) * (1 - k * 0.25); }); }
  // 빛기둥
  const pl = new THREE.Mesh(pillarGeo, addMat(c)); pl.position.copy(pos); spawn(pl, 1.6, (f, q) => { const w = q < 0.15 ? q / 0.15 : 1 - (q - 0.15) / 0.85; f.mesh.scale.set(30 * w + 4, 2400, 30 * w + 4); f.mesh.position.y = pos.y + 1200 - 200; f.mesh.material.opacity = w * 0.55; });
  // 중심 폭발 구
  const orb = new THREE.Mesh(orbGeo, addMat(c)); orb.position.copy(pos); spawn(orb, 0.9, (f, q) => { f.mesh.scale.setScalar(20 + q * R * 0.55); f.mesh.material.opacity = (1 - q) * 0.4; });
  // 입자 폭풍
  const N = Math.round(420 * Q.fx) + 80;
  for (let i = 0; i < N; i++) {
    const d = new THREE.Vector3().randomDirection(), sp = rand(120, 520);
    const special = e === 'cryo' ? [1.4, 3, 4] : e === 'electro' ? [3, 1.2, 4.5] : cA;
    FIRE.emit(pos.x, pos.y, pos.z, d.x * sp, d.y * sp * 0.6, d.z * sp, rand(0.8, 2.2), rand(2.5, 6), 0.4, special, [cA[0] * 0.3, cA[1] * 0.3, cA[2] * 0.3], 1, 0.9, e === 'geo' ? 140 : 0);
  }
  for (let i = 0; i < N * 0.3; i++) { const d = new THREE.Vector3().randomDirection(); SMOKE.emit(pos.x + d.x * 40, pos.y + d.y * 20, pos.z + d.z * 40, d.x * 90, Math.abs(d.y) * 60, d.z * 90, rand(2.5, 5), 30, 120, [cA[0] * 0.15, cA[1] * 0.15, cA[2] * 0.15], [0.3, 0.3, 0.3], 0.5, 0.8); }
  // 원소별 추가 연출
  if (e === 'electro') for (let b = 0; b < 14; b++) { const a = rand(0, 6.28), r0 = rand(0, R), x = pos.x + Math.cos(a) * r0, z = pos.z + Math.sin(a) * r0; for (let y = 0; y < 30; y++) FIRE.emit(x + rand(-8, 8), pos.y + 600 - y * 24, z + rand(-8, 8), 0, 0, 0, 0.35, 6, 2, [3, 2, 6], [1, 0.5, 3], 1); }
  if (e === 'anemo') for (let i = 0; i < 260 * Q.fx; i++) { const a = i / 30, r0 = 30 + i * 2.2; FIRE.emit(pos.x + Math.cos(a) * r0, pos.y + i * 1.2, pos.z + Math.sin(a) * r0, -Math.sin(a) * 160, 40, Math.cos(a) * 160, 1.6, 5, 1, cA, cA, 0.8, 0.5); }
  if (e === 'cryo') for (let i = 0; i < 40; i++) { const a = rand(0, 6.28), r0 = rand(40, R * 0.8); FIRE.emit(pos.x + Math.cos(a) * r0, pos.y - 20, pos.z + Math.sin(a) * r0, 0, 220, 0, 1.2, 14, 4, [2, 3.5, 4], [0.5, 1, 1.5], 1); }
  // 피해 + 원소 반응 + 넉백
  const dmg = (save.founder ? 260 : 380) + 50 * ((p.lv && p.lv.guns) || 0);
  for (const s of S.ships) {
    if (!s.alive || s === p || !S.hooks.hostile(p, s)) continue;
    const d = s.pos.distanceTo(pos); if (d > R) continue;
    const k = 1 - d / R * 0.6;
    if (S.hooks.elemHit) S.hooks.elemHit(s, dmg * k, p, s.pos.clone(), e); else S.hooks.damage(s, dmg * k, p, s.pos);
    const dir = s.pos.clone().sub(pos).normalize(); s.vel.addScaledVector(dir, 220 * k); s.vel.y += 60 * k;
    if (e === 'cryo') s.slowT = 5;
  }
  hooks.hit && hooks.hit(e, idx, n);
}
export function updateUlt(dt) {
  FXS.ultB = Math.max(0, (FXS.ultB || 0) - dt * 0.9);
  for (let i = fxList.length - 1; i >= 0; i--) { const f = fxList[i]; f.t += dt; const k = Math.min(1, f.t / f.life); f.upd(f, k); if (k >= 1) { scene.remove(f.mesh); f.mesh.material.dispose(); fxList.splice(i, 1); } }
  if (!casting) return;
  const c = casting; c.t += dt;
  if (!c.p.alive) { casting = null; return; }
  // 응축 단계에서 입자가 빨려 들어감
  if (c.t < 1.1) { const e = c.elems[0], cA = ELEMENTS[e].col; for (let i = 0; i < 12 * Q.fx + 3; i++) { const d = new THREE.Vector3().randomDirection().multiplyScalar(rand(80, 200)); FIRE.emit(c.p.pos.x + d.x, c.p.pos.y + d.y, c.p.pos.z + d.z, -d.x * 1.6, -d.y * 1.6, -d.z * 1.6, 0.6, 4, 1, cA, cA, 0.9); } FXS.ultB = 0.4 + c.t * 0.4; return; }
  const gap = 0.28, next = 1.1 + c.waves * gap;
  if (c.t >= next && c.waves < c.elems.length) { wave(c.p, c.elems[c.waves], c.waves, c.elems.length); c.waves++; }
  if (c.waves >= c.elems.length && c.t > next + 1) casting = null;
}
export const isCasting = () => !!casting;
