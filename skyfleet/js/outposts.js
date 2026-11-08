// 전초기지 · 유닛(호위함 · 틸트로터 · 외골격 보병 · 원소 능력자 · 호버 정찰차 · 화물 트럭)
import { THREE, $, rand, clamp, lerp, wrap, pick, fmt, put, finish, box, cyl, HPI, addProto, COL, canvasTex, Q, camera, sfx } from './core.js';
import { scene, terrainH, groundAt, FIRE, SMOKE, ores, depleteOre, DAY, envMats } from './world.js';
import { S, explode } from './fx.js';
import { OUTPOST_SITES, UNIT_DEFS, ELEMENTS, REACTIONS, ORES, save, persist, unitCap, outpostCost, outpostUpCost } from './data.js';

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
S.units = S.units || [];
export const outposts = [];        // 지어진 기지 (런타임)
export const sites = [];           // 부지 표시 (런타임)

/* ---------- 재질 (미래형: 흰 패널 + 어두운 프레임 + 네온) ---------- */
const panelTex = canvasTex(256, 256, (x, W) => {
  x.fillStyle = '#d9e1e5'; x.fillRect(0, 0, W, W);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = `hsl(200,8%,${rand(80, 90)}%)`; x.fillRect(i * 32 + 1, j * 32 + 1, 30, 30); }
  x.strokeStyle = 'rgba(40,60,70,.45)'; x.lineWidth = 2; for (let i = 0; i <= W; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, W); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(W, i); x.stroke(); }
  x.fillStyle = 'rgba(34,211,211,.6)'; for (let i = 0; i < 10; i++) x.fillRect(rand(0, W), rand(0, W), rand(10, 40), 2);
});
panelTex.wrapS = panelTex.wrapT = THREE.RepeatWrapping;
const M = {
  white: new THREE.MeshStandardMaterial({ map: panelTex, color: 0xffffff, roughness: 0.32, metalness: 0.55 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1b2126, roughness: 0.45, metalness: 0.8 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x0b1820, emissive: 0x2ad4ff, emissiveIntensity: 0.8, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.85 }),
  neon: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 4.2, 4.6), toneMapped: false }),
  amber: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.6, 0.5), toneMapped: false }),
  red: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.6, 0.4), toneMapped: false }),
};
envMats.push(M.white, M.dark, M.glass);
const holoMat = () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 3, 3.4), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });

/* ---------- 모델: 전초기지 ---------- */
function outpostProto() {
  const B = {}, R = 70;
  put(B, 'dark', cyl(R, R + 4, 6, 6), 0, 3, 0, 0, Math.PI / 6);
  put(B, 'white', cyl(R - 2, R - 2, 0.7, 6), 0, 6.3, 0, 0, Math.PI / 6);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; put(B, 'neon', box(R, 0.5, 0.7), Math.cos(a) * R * 0.866, 6.8, Math.sin(a) * R * 0.866, 0, -a + HPI); }
  // 중앙 돔 + 리브
  put(B, 'glass', new THREE.SphereGeometry(22, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0, 6.6, 0);
  for (let i = 0; i < 6; i++) put(B, 'white', new THREE.TorusGeometry(22.2, 0.5, 6, 28, Math.PI), 0, 6.6, 0, 0, i * Math.PI / 6, 0);
  put(B, 'neon', new THREE.TorusGeometry(22.6, 0.35, 6, 48), 0, 7.2, 0, HPI);
  // 격납고 블록
  put(B, 'white', box(32, 16, 26), -36, 14.6, 22); put(B, 'dark', box(18, 11, 0.6), -36, 12, 35.2);
  for (const y of [9, 13, 17]) put(B, 'neon', box(18.4, 0.3, 0.7), -36, y, 35.4);
  put(B, 'dark', box(34, 2, 28), -36, 23.6, 22);
  // 착륙 패드
  put(B, 'dark', cyl(16, 16, 0.6, 32), 34, 6.9, 26); put(B, 'neon', new THREE.TorusGeometry(15, 0.35, 6, 48), 34, 7.4, 26, HPI);
  for (let i = 0; i < 4; i++) put(B, 'amber', box(1, 0.3, 4), 34 + Math.cos(i * HPI) * 11, 7.4, 26 + Math.sin(i * HPI) * 11, 0, -i * HPI);
  // 에너지 기둥 3개
  for (const [px, pz] of [[44, -34], [-50, -26], [8, 54]]) { put(B, 'white', cyl(1.6, 3, 34, 8), px, 23.6, pz); put(B, 'dark', cyl(3.6, 3.6, 2, 8), px, 8, pz); put(B, 'neon', new THREE.SphereGeometry(2.4, 12, 8), px, 42, pz); }
  // 안테나 첨탑
  put(B, 'white', cyl(1.2, 2.4, 56, 8), 26, 34.6, -28); put(B, 'red', box(1.4, 1.4, 1.4), 26, 63, -28);
  return finish(B, []);
}
function legsProto(h) { const B = {}; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; put(B, 'dark', cyl(2.4, 3.6, h, 8), Math.cos(a) * 58, -h / 2, Math.sin(a) * 58); put(B, 'neon', box(0.5, h * 0.8, 0.5), Math.cos(a) * 60.6, -h / 2, Math.sin(a) * 60.6); } return finish(B, []); }
function turretProto() { const b = {}, g = {}; put(b, 'dark', cyl(4, 5, 4, 10), 0, 2, 0); put(b, 'white', box(6, 3, 6), 0, 5, 0); put(g, 'dark', box(0.8, 0.8, 9), -1.2, 0, -4.5); put(g, 'dark', box(0.8, 0.8, 9), 1.2, 0, -4.5); put(g, 'neon', box(3.4, 0.3, 0.3), 0, 0.8, -1); return { base: finish(b, []), gun: finish(g, []) }; }
let OP = null, TUR = null;
function holoSign(text) {
  const t = canvasTex(512, 128, (x, W, H) => { x.clearRect(0, 0, W, H); x.strokeStyle = '#22d3d3'; x.lineWidth = 4; x.strokeRect(4, 4, W - 8, H - 8); x.fillStyle = '#9ff'; x.font = 'bold 44px Orbitron, sans-serif'; x.textAlign = 'center'; x.fillText(text, W / 2, 62); x.font = '22px Orbitron, sans-serif'; x.fillStyle = '#5fe'; x.fillText('SKY FLEET · FORWARD OUTPOST', W / 2, 100); });
  const m = holoMat(); m.map = t; const mesh = new THREE.Mesh(new THREE.PlaneGeometry(48, 12), m); return mesh;
}
function buildOutpostModel(o) {
  OP = OP || outpostProto(); TUR = TUR || turretProto();
  const g = new THREE.Group(); g.position.set(o.x, o.deck - 6.3, o.z);
  addProto(g, OP, M, { white: 1, dark: 1, glass: 1 });
  const legH = Math.max(4, o.deck - 6.3 - o.groundMin + 4); const legs = new THREE.Group(); addProto(legs, legsProto(legH), M, { dark: 1 }); g.add(legs);
  o.turrets = [[-48, -36], [48, -40]].map(([x, z]) => { const t = new THREE.Group(); t.position.set(x, 6.6, z); addProto(t, TUR.base, M, { dark: 1, white: 1 }); const gun = new THREE.Group(); gun.position.y = 5.5; addProto(gun, TUR.gun, M, { dark: 1 }); t.add(gun); t.userData.gun = gun; t.userData.cd = rand(0, 1); g.add(t); return t; });
  // 회전하는 홀로그램 고리 + 간판
  o.ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.25, 6, 48), holoMat()); o.ring.position.set(26, 56, -28); o.ring.rotation.x = HPI; g.add(o.ring);
  o.sign = holoSign(o.nm.replace(' 전초기지', '').toUpperCase()); o.sign.position.set(0, 44, 0); g.add(o.sign);
  // 기둥에서 하늘로 뻗는 빛기둥
  for (const [px, pz] of [[44, -34], [-50, -26], [8, 54]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2.4, 160, 10, 1, true), holoMat()); b.material.opacity = 0.12; b.position.set(px, 122, pz); g.add(b); }
  // 방어막 돔 (맞을 때 번쩍)
  o.shield = new THREE.Mesh(new THREE.SphereGeometry(92, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.4, 2.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, wireframe: true }));
  o.shield.position.y = 6; g.add(o.shield);
  g.traverse(m => { if (m.isMesh && !m.material.transparent) { m.castShadow = true; m.receiveShadow = true; } });
  scene.add(g); o.group = g;
}
function siteMarker(site) {
  const g = new THREE.Group(); g.position.set(site.x, site.ground, site.z);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 8, 260, 12, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.8, 0.4), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  beam.position.y = 130; g.add(beam);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(40, 0.6, 6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.4, 0.5), toneMapped: false, transparent: true, opacity: 0.8 }));
  ring.rotation.x = HPI; ring.position.y = 3; g.add(ring);
  scene.add(g); return { g, ring };
}

/* ---------- 모델: 유닛 ---------- */
const UNIT_PROTO = {};
function unitProto(type) {
  if (UNIT_PROTO[type]) return UNIT_PROTO[type];
  const B = {};
  if (type === 'escort') {
    const hull = new THREE.ConeGeometry(2.6, 16, 6); hull.rotateX(-HPI); put(B, 'white', hull, 0, 0, 0, 0, 0, Math.PI / 6);
    put(B, 'glass', box(1.8, 1, 4), 0, 1.1, -1); put(B, 'dark', box(14, 0.35, 4), 0, -0.3, 3); put(B, 'neon', box(14.2, 0.2, 0.4), 0, -0.1, 1.2);
    for (const s of [-1, 1]) { put(B, 'dark', cyl(0.9, 1.1, 5, 10), s * 3.6, -0.3, 5, HPI); put(B, 'neon', cyl(0.7, 0.7, 0.2, 10), s * 3.6, -0.3, 7.6, HPI); put(B, 'white', box(0.25, 2.4, 2.4), s * 6.8, 0.8, 4, 0, 0, s * 0.2); }
  } else if (type === 'vtol') {
    put(B, 'white', box(3.6, 3, 11), 0, 0, 0); put(B, 'glass', box(3.2, 1.6, 3), 0, 0.7, -5.5); put(B, 'dark', box(14, 0.4, 2.4), 0, 1.2, 0); put(B, 'white', box(0.4, 2.6, 3), 0, 1.6, 6);
    for (const s of [-1, 1]) { put(B, 'dark', cyl(1, 1, 3.4, 10), s * 7, 1.8, 0); put(B, 'neon', box(0.3, 2.6, 0.3), s * 7, 1.8, -1); }
    put(B, 'neon', box(3.7, 0.2, 9), 0, -1.4, 0); put(B, 'dark', box(0.6, 0.6, 3), 0, -1.6, -5);
  } else if (type === 'trooper') {
    // 외골격 슈트 (5m)
    put(B, 'white', box(2, 2.4, 1.4), 0, 3.4, 0); put(B, 'dark', box(1.8, 1, 1.2), 0, 2, 0);
    put(B, 'white', new THREE.SphereGeometry(0.75, 12, 8), 0, 5, 0); put(B, 'neon', box(1.1, 0.25, 0.3), 0, 5.05, -0.62);
    for (const s of [-1, 1]) { put(B, 'dark', box(0.7, 2, 0.7), s * 0.55, 0.9, 0); put(B, 'white', box(0.8, 0.4, 1.2), s * 0.55, 0.1, -0.2); put(B, 'dark', box(0.55, 1.8, 0.55), s * 1.35, 3.3, 0); }
    put(B, 'dark', box(1.6, 1.8, 0.8), 0, 3.6, 0.9); put(B, 'neon', cyl(0.3, 0.3, 0.2, 8), -0.45, 2.7, 1.3, HPI); put(B, 'neon', cyl(0.3, 0.3, 0.2, 8), 0.45, 2.7, 1.3, HPI);
    put(B, 'dark', box(0.35, 0.35, 2.6), 1.35, 3, -1.2); put(B, 'neon', box(0.2, 0.2, 0.6), 1.35, 3.1, -2.6);
  } else if (type === 'adept') {
    put(B, 'white', box(1.2, 2, 0.8), 0, 3.4, 0); put(B, 'dark', box(1.4, 1.6, 1), 0, 1.6, 0);
    const cape = new THREE.ConeGeometry(1.5, 3.6, 8, 1, true); put(B, 'dark', cape, 0, 2.3, 0.2);
    put(B, 'white', new THREE.SphereGeometry(0.6, 12, 8), 0, 4.8, 0); put(B, 'dark', new THREE.ConeGeometry(0.75, 1.2, 8), 0, 5.2, 0.15, -0.3);
    for (const s of [-1, 1]) put(B, 'white', box(0.4, 1.8, 0.4), s * 0.85, 3.3, -0.2, -0.4, 0, s * 0.3);
  } else if (type === 'rover') {
    put(B, 'white', box(5, 1.6, 9), 0, 1.4, 0); put(B, 'glass', box(4, 1.2, 3.4), 0, 2.6, -0.6); put(B, 'dark', box(5.4, 0.6, 9.4), 0, 0.5, 0);
    put(B, 'neon', box(5.5, 0.15, 0.3), 0, 1.2, -4.6); put(B, 'neon', box(4.6, 0.1, 8.4), 0, 0.15, 0); put(B, 'dark', box(0.6, 0.6, 3), 0, 3.4, -1.2); put(B, 'red', box(4.4, 0.25, 0.2), 0, 1.4, 4.6);
  } else if (type === 'hauler') {
    put(B, 'white', box(5, 4, 4.6), 0, 2.6, -6); put(B, 'glass', box(4.4, 1.4, 0.2), 0, 3.4, -8.35); put(B, 'dark', box(5.6, 5, 11), 0, 3, 2.5);
    for (const z of [-1, 2.5, 6]) put(B, 'neon', box(5.7, 0.25, 0.3), 0, 4.4, z);
    put(B, 'dark', box(5.4, 0.7, 16), 0, 0.5, -0.5); put(B, 'neon', box(4.6, 0.1, 15), 0, 0.12, -0.5); put(B, 'amber', box(4.6, 0.3, 0.2), 0, 4.8, -8.4);
  }
  return (UNIT_PROTO[type] = finish(B, []));
}
function makeUnitModel(type, elem) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const mats = Object.assign({}, M);
  if (elem) { const c = ELEMENTS[elem].col; mats.neon = new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0], c[1], c[2]), toneMapped: false }); }
  addProto(body, unitProto(type), mats, { white: 1, dark: 1 });
  const extra = {};
  if (type === 'vtol') extra.rotors = [-1, 1].map(s => { const r = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.08, 20), new THREE.MeshBasicMaterial({ color: 0xbfe9ef, transparent: true, opacity: 0.25, depthWrite: false })); r.position.set(s * 7, 3.6, 0); body.add(r); return r; });
  if (type === 'adept') {
    const c = ELEMENTS[elem || 'anemo'].col;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.12, 6, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0], c[1], c[2]), toneMapped: false })); halo.rotation.x = HPI; halo.position.y = 0.2; body.add(halo); extra.halo = halo;
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0] * 1.4, c[1] * 1.4, c[2] * 1.4), toneMapped: false })); orb.position.set(0, 3.6, -0.6); body.add(orb); extra.orb = orb;
  }
  root.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return { root, body, extra };
}

/* ---------- 유닛 ---------- */
let uid = 1;
class Unit {
  constructor(type, base, elem) {
    const d = UNIT_DEFS[type];
    Object.assign(this, { type, def: d, base, elem: type === 'adept' ? (elem || 'pyro') : null, isUnit: true, faction: 'player', alive: true, kills: 0, _id: 'u' + (uid++) });
    this.name = type === 'adept' ? `${ELEMENTS[this.elem].code} (${ELEMENTS[this.elem].nm})` : d.nm;
    this.maxHp = d.hp * (1 + (base.lv - 1) * 0.25); this.hp = this.maxHp; this.cd = rand(0, 1);
    const m = makeUnitModel(type, this.elem); this.mesh = m.root; this.body = m.body; this.extra = m.extra;
    this.pos = this.mesh.position; this.vel = new THREE.Vector3(); this.yaw = rand(0, 6.28); this.scale = 1;
    this.radius = d.air ? 10 : 5; this.phase = rand(0, 6.28); this.state = 'idle'; this.t = 0;
    const a = rand(0, 6.28); this.pos.set(base.x + Math.cos(a) * 30, base.deck + (d.air ? 30 : 0), base.z + Math.sin(a) * 30);
    if (!d.air) this.pos.y = groundAt(this.pos.x, this.pos.z);
    scene.add(this.mesh);
    // 등장 연출
    for (let i = 0; i < 14; i++) FIRE.emit(this.pos.x, this.pos.y + rand(0, 20), this.pos.z, rand(-8, 8), rand(10, 40), rand(-8, 8), rand(0.4, 0.9), 3, 0.5, COL.cyan, [0.2, 1, 1.2], 1, 1);
  }
  hurt(amt, by) {
    if (!this.alive) return;
    if (this.crystal > 0) { const a = Math.min(this.crystal, amt); this.crystal -= a; amt -= a; }
    this.hp -= amt; this.hitT = 0.15;
    if (this.hp <= 0) this.die(by);
  }
  die() {
    this.alive = false; explode(this.pos, this.def.air ? 26 : 14); scene.remove(this.mesh);
    const i = S.units.indexOf(this); if (i >= 0) S.units.splice(i, 1);
    this.base.units = this.base.units.filter(u => u !== this); saveOutposts();
    hooks.toast && hooks.toast(`<b>${this.name}</b> 이(가) 격파됐습니다 (${this.base.nm})`);
  }
}
/* 원소 반응 */
function reactKey(a, b) { return REACTIONS[`${a}+${b}`] ? `${a}+${b}` : REACTIONS[`${b}+${a}`] ? `${b}+${a}` : null; }
export function applyElement(t, dmg, unit, at, elem) {
  if (!t.alive) return;
  let mul = (t.shredT > 0 ? 1.3 : 1), react = null;
  if (elem) {
    const cur = t.elemAura && t.elemAura.t > 0 ? t.elemAura.e : null;
    if (elem === 'anemo' && cur && cur !== 'anemo') react = REACTIONS.anemo;
    else if (elem === 'geo' && cur && cur !== 'geo') react = REACTIONS.geo;
    else if (cur && cur !== elem) { const k = reactKey(cur, elem); react = k ? REACTIONS[k] : null; }
    if (react) {
      mul *= react.mul; t.elemAura = null;
      hooks.reactText && hooks.reactText(t.pos, react.nm, ELEMENTS[elem].hex);
      const ulv = unit.base ? unit.base.lv : 1 + ((unit.lv && unit.lv.guns) || 0) / 6;
      if (react.aoe) for (const o of S.ships) if (o !== t && o.alive && S.hooks.hostile(unit, o) && o.pos.distanceTo(t.pos) < react.aoe * 2) { S.hooks.damage(o, dmg * 0.6, unit, o.pos); if (elem === 'anemo' && cur) o.elemAura = { e: cur, t: 6 }; }
      if (react.dot) t.dot = { dps: react.dot * (1 + ulv * 0.3), t: 4, by: unit };
      if (react.slow) t.slowT = react.slow;
      if (react.shred) t.shredT = 6;
      if (react.shield) { if (unit.base) for (const u of unit.base.units) u.crystal = (u.crystal || 0) + react.shield; else if (unit.maxShield) unit.shield = Math.min(unit.maxShield, unit.shield + react.shield * 2); }
      explode(at || t.pos, react.aoe ? 22 : 12, 'hit');
    } else if (elem !== 'anemo' && elem !== 'geo') t.elemAura = { e: elem, t: 8 };
  }
  const was = t.alive; S.hooks.damage(t, dmg * mul, unit, at);
  if (was && !t.alive && !unit.isPlayer) { unit.kills++; hooks.unitKill && hooks.unitKill(unit, t); }
}
S.hooks.elemHit = applyElement;

/* ---------- 투사체 (빛 탄) ---------- */
const bolts = [];
function fireBolt(from, to, dmg, unit, opt = {}) {
  const dir = tmp.copy(to).sub(from).normalize(), sp = opt.speed || 520;
  dir.x += rand(-0.02, 0.02); dir.y += rand(-0.02, 0.02); dir.z += rand(-0.02, 0.02); dir.normalize();
  bolts.push({ pos: from.clone(), vel: dir.clone().multiplyScalar(sp), life: opt.life || 1.5, dmg, unit, elem: opt.elem || null, col: opt.col || COL.cyan, size: opt.size || 2.4, splash: opt.splash || 0, homing: opt.homing || null });
  if (camera.position.distanceToSquared(from) < 1e6) FIRE.emit(from.x, from.y, from.z, 0, 0, 0, 0.08, (opt.size || 2.4) * 2, 1, opt.col || COL.cyan, COL.fireMid, 1);
}
function segDist2(a, b, c) { const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, l2 = abx * abx + aby * aby + abz * abz; let t = l2 ? ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / l2 : 0; t = clamp(t, 0, 1); const dx = a.x + abx * t - c.x, dy = a.y + aby * t - c.y, dz = a.z + abz * t - c.z; return dx * dx + dy * dy + dz * dz; }
const prev = new THREE.Vector3();
function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]; b.life -= dt; prev.copy(b.pos);
    if (b.homing && b.homing.alive) { tmp.copy(b.homing.pos).sub(b.pos).normalize().multiplyScalar(b.vel.length()); b.vel.lerp(tmp, Math.min(1, dt * 3)); }
    b.pos.addScaledVector(b.vel, dt);
    FIRE.emit(b.pos.x, b.pos.y, b.pos.z, 0, 0, 0, 0.12, b.size, b.size * 0.3, b.col, COL.fireMid, 0.9);
    let hit = null;
    for (const s of S.ships) { if (!s.alive || !S.hooks.hostile(b.unit, s)) continue; if (segDist2(prev, b.pos, s.pos) < (s.radius * 1.1) ** 2) { hit = s; break; } }
    if (hit) {
      applyElement(hit, b.dmg, b.unit, b.pos, b.elem);
      if (b.splash) for (const s of S.ships) if (s !== hit && s.alive && S.hooks.hostile(b.unit, s) && s.pos.distanceTo(b.pos) < b.splash) S.hooks.damage(s, b.dmg * 0.5, b.unit, s.pos);
      for (let k = 0; k < 5; k++) FIRE.emit(b.pos.x, b.pos.y, b.pos.z, rand(-40, 40), rand(-40, 40), rand(-40, 40), rand(0.2, 0.4), 1.6, 0.3, b.col, COL.sparkE, 1, 1, 30);
    }
    if (hit || b.life <= 0 || b.pos.y < groundAt(b.pos.x, b.pos.z)) bolts.splice(i, 1);
  }
}

/* ---------- 훅 (main 이 채움) ---------- */
export const hooks = { toast: null, unitKill: null, reactText: null, spawnRaid: null, onChange: null };

/* ---------- 기지 생성 / 저장 ---------- */
function siteInfo(site) {
  let gmin = 1e9, gmax = -1e9;
  for (let a = 0; a < 6.28; a += 0.5) for (const r of [0, 40, 70]) { const h = terrainH(site.x + Math.cos(a) * r, site.z + Math.sin(a) * r); gmin = Math.min(gmin, h); gmax = Math.max(gmax, h); }
  return { groundMin: Math.max(gmin, 2), deck: Math.max(gmax, 4) + 14 };
}
export function initOutposts() {
  for (const st of OUTPOST_SITES) {
    const info = siteInfo(st);
    const site = Object.assign({}, st, info, { ground: info.groundMin });
    sites.push(site);
    const sv = (save.outposts || []).find(o => o.site === st.id);
    if (sv) createOutpost(site, sv, true); else site.marker = siteMarker(site);
  }
}
function createOutpost(site, sv, fromSave) {
  const o = Object.assign({}, site, { site: site.id, lv: sv.lv || 1, maxHp: 0, hp: 0, units: [], queue: [], isUnit: true, faction: 'player', alive: true, radius: 70, vel: new THREE.Vector3(), build: fromSave ? 0 : 8, incomeT: 10, name: site.nm, scale: 2, _id: 'o-' + site.id });
  o.maxHp = 1500 * (1 + (o.lv - 1) * 0.5); o.hp = sv.hp ?? o.maxHp;
  o.pos = new THREE.Vector3(site.x, site.deck, site.z);
  o.hurt = (amt) => { if (!o.alive || o.build > 0) return; o.hp -= amt; o.shield.material.opacity = 0.35; if (o.hp <= 0) { o.hp = 0; o.alive = false; o.ruined = true; explode(o.pos, 90); hooks.toast && hooks.toast(`⚠ <b>${o.nm}</b> 이(가) 파괴됐습니다! 기지 메뉴에서 복구하세요`); saveOutposts(); } };
  buildOutpostModel(o);
  if (o.build > 0) o.group.scale.set(1, 0.02, 1);
  outposts.push(o); S.units.push(o);
  if (fromSave) for (const u of sv.units || []) spawnUnit(o, u.type, u.elem, true, 1);   // 저장은 개별 유닛 단위
  if (sv.ruined) { o.alive = false; o.ruined = true; o.hp = 0; }
  return o;
}
export function saveOutposts() {
  save.outposts = outposts.map(o => ({ site: o.site, lv: o.lv, hp: Math.round(o.hp), ruined: !!o.ruined, units: o.units.map(u => ({ type: u.type, elem: u.elem })) }));
  persist(); hooks.onChange && hooks.onChange();
}
function spawnUnit(o, type, elem, silent, count) {
  const n = count || UNIT_DEFS[type].squad || 1;
  for (let i = 0; i < n; i++) { const u = new Unit(type, o, elem); o.units.push(u); S.units.push(u); }
  if (!silent) { saveOutposts(); sfx('ui'); hooks.toast && hooks.toast(`${UNIT_DEFS[type].ic} <b>${type === 'adept' ? ELEMENTS[elem].code + ' 능력자' : UNIT_DEFS[type].nm}</b> 배치 완료 · ${o.nm}`); }
}
export function buildOutpost(siteId) {
  const site = sites.find(s => s.id === siteId); if (!site || outposts.some(o => o.site === siteId)) return 'no';
  const cost = outpostCost(outposts.length); if (save.credits < cost) return 'money';
  save.credits -= cost; if (site.marker) { scene.remove(site.marker.g); site.marker = null; }
  const o = createOutpost(site, { lv: 1 }, false); saveOutposts();
  return o;
}
export function upgradeOutpost(o) { const c = outpostUpCost(o.lv); if (!c || o.lv >= 3 || save.credits < c) return false; save.credits -= c; o.lv++; o.maxHp = 1500 * (1 + (o.lv - 1) * 0.5); o.hp = o.maxHp; saveOutposts(); return true; }
export const repairCost = o => Math.round((o.maxHp - o.hp) * 0.8 + (o.ruined ? 1200 : 0));
export function repairOutpost(o) { const c = repairCost(o); if (save.credits < c) return false; save.credits -= c; o.hp = o.maxHp; o.alive = true; o.ruined = false; saveOutposts(); return true; }
export function queueUnit(o, type, elem) {
  const d = UNIT_DEFS[type], used = o.units.length + o.queue.reduce((a, q) => a + (UNIT_DEFS[q.type].squad || 1), 0);
  if (o.ruined) return 'ruined'; if (used + (d.squad || 1) > unitCap(o.lv)) return 'cap'; if (save.credits < d.cost) return 'money';
  save.credits -= d.cost; o.queue.push({ type, elem, t: d.time, total: d.time }); persist(); return 'ok';
}
export function nearestOutpost(pos, ownedOnly = true) {
  let best = null, bd = 1e9;
  for (const s of ownedOnly ? outposts : sites) { const d = Math.hypot(s.x - pos.x, s.z - pos.z); if (d < bd) { bd = d; best = s; } }
  return [best, bd];
}
export const isBuilt = siteId => outposts.some(o => o.site === siteId);

/* ---------- 유닛 AI ---------- */
function nearestHostile(u, from, range) {
  let best = null, bd = range;
  for (const s of S.ships) { if (!s.alive || !S.hooks.hostile(u, s)) continue; const d = s.pos.distanceTo(from); if (d < bd) { bd = d; best = s; } }
  return best;
}
function moveAir(u, dt, tx, ty, tz, maxSp) {
  tmp.set(tx - u.pos.x, ty - u.pos.y, tz - u.pos.z); const d = tmp.length();
  const sp = Math.min(maxSp, Math.sqrt(2 * 40 * d)); if (d > 0.1) tmp.multiplyScalar(sp / d);
  u.vel.lerp(tmp, 1 - Math.exp(-dt * 2.2));
  if (u.slowT > 0) u.vel.multiplyScalar(0.5);
  u.pos.addScaledVector(u.vel, dt);
  const g = groundAt(u.pos.x, u.pos.z) + 12; if (u.pos.y < g) u.pos.y = g;
  const hs = Math.hypot(u.vel.x, u.vel.z); if (hs > 2) u.yaw = lerpAngle(u.yaw, Math.atan2(-u.vel.x, -u.vel.z), 1 - Math.exp(-dt * 4));
  u.mesh.rotation.set(0, u.yaw, 0);
  u.body.rotation.z = lerp(u.body.rotation.z, clamp(-wrap(Math.atan2(-u.vel.x, -u.vel.z) - u.yaw) * 1.5, -0.5, 0.5), 1 - Math.exp(-dt * 3));
}
function moveGround(u, dt, tx, tz, maxSp, hover = 0) {
  tmp.set(tx - u.pos.x, 0, tz - u.pos.z); const d = tmp.length();
  const sp = Math.min(maxSp, d * 1.2); if (d > 0.1) tmp.multiplyScalar(sp / d);
  u.vel.x = lerp(u.vel.x, tmp.x, 1 - Math.exp(-dt * 3)); u.vel.z = lerp(u.vel.z, tmp.z, 1 - Math.exp(-dt * 3));
  u.pos.x += u.vel.x * dt; u.pos.z += u.vel.z * dt;
  const g = groundAt(u.pos.x, u.pos.z); u.pos.y = lerp(u.pos.y, g + hover, 1 - Math.exp(-dt * 8));
  if (Math.hypot(u.vel.x, u.vel.z) > 0.5) u.yaw = lerpAngle(u.yaw, Math.atan2(-u.vel.x, -u.vel.z), 1 - Math.exp(-dt * 6));
  u.mesh.rotation.set(0, u.yaw, 0);
}
const lerpAngle = (a, b, t) => a + wrap(b - a) * t;
function aimFire(u, t, from, opt) {
  if (u.cd > 0) return; u.cd = 1 / u.def.rate;
  const lead = tmp2.copy(t.pos).addScaledVector(t.vel, from.distanceTo(t.pos) / (opt.speed || 520));
  fireBolt(from, lead, u.def.dmg * (1 + (u.base.lv - 1) * 0.3), u, opt);
}
function updateUnit(u, dt, player) {
  const d = u.def, b = u.base, t = performance.now() / 1000;
  u.cd -= dt; u.t += dt; if (u.slowT > 0) u.slowT -= dt;
  const from = tmp2.copy(u.pos);
  switch (u.type) {
    case 'escort': {
      const follow = player && player.alive && player.pos.distanceTo(b.pos) < 3500;
      const anchor = follow ? player.pos : b.pos;
      const tgt = nearestHostile(u, anchor, 900);
      if (tgt) { const a = t * 0.6 + u.phase; moveAir(u, dt, tgt.pos.x + Math.cos(a) * 240, tgt.pos.y + 30, tgt.pos.z + Math.sin(a) * 240, d.speed); if (u.pos.distanceTo(tgt.pos) < d.range) aimFire(u, tgt, u.pos.clone(), { col: COL.cyan, speed: 700 }); }
      else if (follow) { const i = b.units.filter(x => x.type === 'escort').indexOf(u), side = i % 2 ? 1 : -1, back = 50 + Math.floor(i / 2) * 30; const yaw = player.yaw; moveAir(u, dt, player.pos.x + Math.cos(yaw) * side * 45 + Math.sin(yaw) * back, player.pos.y + 12, player.pos.z - Math.sin(yaw) * side * 45 + Math.cos(yaw) * back, d.speed * 1.4); }
      else { const a = t * 0.25 + u.phase; moveAir(u, dt, b.x + Math.cos(a) * 220, b.deck + 120, b.z + Math.sin(a) * 220, d.speed * 0.6); }
      break;
    }
    case 'vtol': {
      const tgt = nearestHostile(u, b.pos, 1000);
      if (tgt) { const a = t * 0.5 + u.phase; moveAir(u, dt, tgt.pos.x + Math.cos(a) * 280, tgt.pos.y + 20, tgt.pos.z + Math.sin(a) * 280, d.speed); if (u.pos.distanceTo(tgt.pos) < d.range) aimFire(u, tgt, u.pos.clone(), { col: COL.fireHot, speed: 380, size: 3.4, splash: 35, homing: tgt, life: 2.4 }); }
      else { const a = t * 0.2 + u.phase; moveAir(u, dt, b.x + Math.cos(a) * 260, b.deck + 90 + Math.sin(t + u.phase) * 10, b.z + Math.sin(a) * 260, d.speed * 0.6); }
      for (const r of u.extra.rotors) r.rotation.y += dt * 40;
      break;
    }
    case 'adept': {
      const c = ELEMENTS[u.elem].col, tgt = nearestHostile(u, b.pos, 950);
      if (tgt) {
        const a = t * 0.8 + u.phase; moveAir(u, dt, tgt.pos.x + Math.cos(a) * 260, tgt.pos.y + 10, tgt.pos.z + Math.sin(a) * 260, d.speed * 1.6);
        if (u.pos.distanceTo(tgt.pos) < d.range && u.cd <= 0) { u.cd = 1 / d.rate; fireBolt(u.pos.clone().add(tmp.set(0, 4, 0)), tgt.pos, d.dmg * (1 + (b.lv - 1) * 0.3), u, { elem: u.elem, col: c, speed: 300, size: 5, homing: tgt, life: 3.5 }); }
      } else { const a = t * 0.3 + u.phase; moveAir(u, dt, b.x + Math.cos(a) * 110, b.deck + 26 + Math.sin(t * 1.3 + u.phase) * 4, b.z + Math.sin(a) * 110, d.speed); }
      u.extra.halo.rotation.z += dt * 2; u.extra.orb.rotation.y += dt * 3;
      if (Math.random() < 0.5) FIRE.emit(u.pos.x + rand(-2, 2), u.pos.y + rand(0, 5), u.pos.z + rand(-2, 2), 0, rand(2, 6), 0, 0.6, 1.4, 0.2, c, c, 0.7);
      break;
    }
    case 'trooper': {
      const tgt = nearestHostile(u, b.pos, 700);
      if (tgt) { u.vel.multiplyScalar(0.9); moveGround(u, dt, u.pos.x, u.pos.z, 0); if (u.pos.distanceTo(tgt.pos) < d.range) aimFire(u, tgt, u.pos.clone().add(tmp.set(0, 3.2, 0)), { col: [3.6, 0.8, 3.4], speed: 600, size: 1.6 }); u.yaw = lerpAngle(u.yaw, Math.atan2(-(tgt.pos.x - u.pos.x), -(tgt.pos.z - u.pos.z)), 0.2); }
      else { if (!u.wp || Math.hypot(u.wp.x - u.pos.x, u.wp.z - u.pos.z) < 6) { const a = rand(0, 6.28), r = rand(80, 150); u.wp = { x: b.x + Math.cos(a) * r, z: b.z + Math.sin(a) * r }; } moveGround(u, dt, u.wp.x, u.wp.z, d.speed); }
      // 점프 제트
      u.jump = (u.jump || 0) - dt; if (u.jump < -rand(4, 9)) u.jump = 1.2;
      const hop = u.jump > 0 ? Math.sin((1.2 - u.jump) / 1.2 * Math.PI) * 14 : 0; u.body.position.y = hop;
      if (u.jump > 0) FIRE.emit(u.pos.x, u.pos.y + hop + 2.6, u.pos.z, 0, -20, 0, 0.15, 1.6, 0.4, COL.cyan, COL.exhaustE, 0.8);
      u.body.rotation.x = Math.sin(t * 9 + u.phase) * 0.06 * Math.min(1, Math.hypot(u.vel.x, u.vel.z) / 4);
      break;
    }
    case 'rover': {
      const tgt = nearestHostile(u, b.pos, 650);
      const a = t * 0.12 + u.phase; moveGround(u, dt, b.x + Math.cos(a) * 300, b.z + Math.sin(a) * 300, d.speed, 1.2);
      if (tgt && u.pos.distanceTo(tgt.pos) < d.range) aimFire(u, tgt, u.pos.clone().add(tmp.set(0, 3.6, 0)), { col: COL.red, speed: 650, size: 1.8 });
      break;
    }
    case 'hauler': {
      if (u.state === 'idle' || (u.node && !u.node.alive && u.state !== 'return')) {
        let best = null, bd = 1600; for (const o of ores) { if (!o.alive || o.island) continue; const dd = Math.hypot(o.x - b.x, o.z - b.z); if (dd < bd) { bd = dd; best = o; } }
        u.node = best; u.state = best ? 'go' : 'wait'; u.t = 0;
      }
      if (u.state === 'go') { moveGround(u, dt, u.node.x + 12, u.node.z + 12, d.speed, 1.4); if (Math.hypot(u.node.x + 12 - u.pos.x, u.node.z + 12 - u.pos.z) < 10) { u.state = 'mine'; u.t = 0; } }
      else if (u.state === 'mine') {
        u.vel.multiplyScalar(0.8); moveGround(u, dt, u.pos.x, u.pos.z, 0, 1.4);
        if (Math.random() < 0.5) FIRE.emit(u.node.x + rand(-4, 4), u.node.y + rand(2, 8), u.node.z + rand(-4, 4), rand(-10, 10), rand(5, 20), rand(-10, 10), 0.4, 1.2, 0.2, COL.spark, COL.sparkE, 1, 1, 30);
        if (u.t > 6) { const o = u.node, n = Math.min(o.amount, Math.max(2, Math.round(42 / ORES[o.type].kg))); o.amount -= n; u.load = { type: o.type, n }; if (o.amount <= 0) depleteOre(o); u.state = 'return'; }
      } else if (u.state === 'return') {
        moveGround(u, dt, b.x - 36, b.z + 50, d.speed, 1.4);
        if (Math.hypot(b.x - 36 - u.pos.x, b.z + 50 - u.pos.z) < 12) { if (u.load) { save.storage[u.load.type] = (save.storage[u.load.type] || 0) + u.load.n; hooks.haul && hooks.haul(u, u.load); u.load = null; persist(); } u.state = 'idle'; }
      } else if (u.state === 'wait') { moveGround(u, dt, b.x - 36, b.z + 50, d.speed, 1.4); if (u.t > 5) u.state = 'idle'; }
      break;
    }
  }
  // 엔진·호버 빛
  if (d.air && Math.random() < 0.6) FIRE.emit(u.pos.x, u.pos.y - 1, u.pos.z, 0, -10, 0, 0.2, 2.2, 0.4, COL.cyan, [0.1, 0.6, 0.8], 0.6);
  if ((u.type === 'rover' || u.type === 'hauler') && Math.random() < 0.4) SMOKE.emit(u.pos.x + rand(-3, 3), u.pos.y, u.pos.z + rand(-3, 3), rand(-4, 4), 2, rand(-4, 4), 1.2, 3, 9, COL.dust, COL.dustE, 0.35);
  if (u.hitT > 0) { u.hitT -= dt; }
}
/* 해적에게 걸린 원소/지속 효과 처리 */
function updateStatus(dt) {
  for (const s of S.ships) {
    if (!s.alive) continue;
    if (s.elemAura) { s.elemAura.t -= dt; if (s.elemAura.t <= 0) s.elemAura = null; else if (Math.random() < 0.3) { const c = ELEMENTS[s.elemAura.e].col; FIRE.emit(s.pos.x + rand(-10, 10), s.pos.y + rand(-4, 8), s.pos.z + rand(-10, 10), 0, 4, 0, 0.5, 3, 0.5, c, c, 0.8); } }
    if (s.dot) { s.dot.t -= dt; S.hooks.damage(s, s.dot.dps * dt, s.dot.by, null); if (s.dot.t <= 0) s.dot = null; }
    if (s.slowT > 0) { s.slowT -= dt; s.vel.multiplyScalar(Math.exp(-dt * 3)); }
    if (s.shredT > 0) s.shredT -= dt;
  }
}

/* ---------- 프레임 ---------- */
let raidT = 240;
export function updateOutposts(dt, player, flying) {
  const t = performance.now() / 1000;
  for (const s of sites) if (s.marker) { s.marker.ring.rotation.z = t * 0.5; s.marker.g.visible = true; }
  for (const o of outposts) {
    if (o.build > 0) { o.build -= dt; const k = 1 - Math.max(0, o.build) / 8; o.group.scale.set(1, Math.max(0.02, k), 1); for (let i = 0; i < 3; i++) FIRE.emit(o.x + rand(-60, 60), o.deck + rand(-6, 30) * k, o.z + rand(-60, 60), rand(-20, 20), rand(0, 30), rand(-20, 20), rand(0.3, 0.6), 2, 0.3, COL.spark, COL.sparkE, 1, 1, 40); if (o.build <= 0) { o.group.scale.set(1, 1, 1); hooks.toast && hooks.toast(`🏗️ <b>${o.nm}</b> 건설 완료!`); sfx('coin'); } continue; }
    o.ring.rotation.z = t * 1.2; o.sign.rotation.y = t * 0.35; o.shield.material.opacity *= Math.exp(-dt * 3);
    if (o.ruined) { if (Math.random() < 0.5) SMOKE.emit(o.x + rand(-40, 40), o.deck, o.z + rand(-40, 40), rand(-4, 4), rand(10, 20), rand(-4, 4), 4, 10, 40, COL.smokeD, COL.smokeL, 0.6); continue; }
    // 생산
    if (o.queue.length) { const q = o.queue[0]; q.t -= dt; if (q.t <= 0) { o.queue.shift(); spawnUnit(o, q.type, q.elem); } }
    // 방어 포탑
    const tgt = nearestHostile(o, o.pos, 760 + o.lv * 60);
    for (const tu of o.turrets) {
      tu.userData.cd -= dt;
      if (!tgt) continue;
      tu.updateMatrixWorld(); const gp = tu.userData.gun.getWorldPosition(tmp); const want = Math.atan2(-(tgt.pos.x - gp.x), -(tgt.pos.z - gp.z));
      tu.rotation.y = lerpAngle(tu.rotation.y, want, 1 - Math.exp(-dt * 4));
      if (tu.userData.cd <= 0) { tu.userData.cd = 0.6 / o.lv; fireBolt(gp.clone().add(tmp2.set(0, 2, 0)), tmp.copy(tgt.pos).addScaledVector(tgt.vel, 0.6), 14 * o.lv, o, { col: COL.cyan, speed: 760, size: 2.6 }); }
    }
    // 기지 수입 (데이터 중계)
    o.incomeT -= dt; if (o.incomeT <= 0) { o.incomeT = 10; save.credits += 6 * o.lv; }
    if (o.hp < o.maxHp && !tgt) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.004 * dt);
  }
  for (const u of [...S.units]) if (!u.isUnit || u.type) { if (u.def && u.alive) updateUnit(u, dt, player); }
  updateBolts(dt); updateStatus(dt);
  // 해적 습격
  if (flying && outposts.some(o => !o.ruined && o.build <= 0)) { raidT -= dt; if (raidT <= 0) { raidT = rand(300, 420); const o = pick(outposts.filter(o => !o.ruined && o.build <= 0)); hooks.spawnRaid && hooks.spawnRaid(o); } }
}

/* ---------- 기지 패널 (UI) ---------- */
let panelO = null, elemSel = 'pyro';
export function openBasePanel(o) { panelO = o; $('basePanel').classList.add('on'); renderBasePanel(); }
export function closeBasePanel() { panelO = null; $('basePanel').classList.remove('on'); }
export function basePanelOpen() { return !!panelO; }
export function renderBasePanel() {
  const o = panelO; if (!o) return;
  const cap = unitCap(o.lv), used = o.units.length + o.queue.reduce((a, q) => a + (UNIT_DEFS[q.type].squad || 1), 0);
  const counts = {}; for (const u of o.units) counts[u.type] = (counts[u.type] || 0) + 1;
  const up = outpostUpCost(o.lv), rc = repairCost(o);
  $('bpTitle').textContent = `${o.nm} · Lv.${o.lv}`;
  $('bpSub').textContent = `${o.region} · 유닛 ${used}/${cap} · 수입 ${6 * o.lv} C / 10초`;
  $('bpHp').style.width = (o.hp / o.maxHp * 100) + '%';
  const q = o.queue.map((x, i) => `<div class="bq"><span>${UNIT_DEFS[x.type].ic} ${x.type === 'adept' ? ELEMENTS[x.elem].code : UNIT_DEFS[x.type].nm}</span><i style="width:${i === 0 ? (1 - x.t / x.total) * 100 : 0}%"></i></div>`).join('');
  $('bpBody').innerHTML = `
    <div class="bpr">${o.ruined ? `<button class="btn red" data-act="repair" ${save.credits < rc ? 'disabled' : ''}>파괴됨 — 복구 ${fmt(rc)} C</button>` : `<button class="btn ghost" data-act="repair" ${o.hp >= o.maxHp || save.credits < rc ? 'disabled' : ''}>수리 ${fmt(rc)} C</button>`}
    <button class="btn" data-act="up" ${!up || save.credits < up || o.ruined ? 'disabled' : ''}>${o.lv >= 3 ? '최대 레벨' : `기지 Lv.${o.lv + 1} 업그레이드 ${fmt(up)} C`}</button></div>
    ${q ? `<h4>생산 대기열</h4>${q}` : ''}
    <h4>유닛 생산 <small>보유 ${o.units.length} · 한도 ${cap}</small></h4>
    <div class="ugrid">${Object.entries(UNIT_DEFS).map(([k, d]) => `<div class="ucard"><div class="ui">${d.ic}</div><b>${d.nm}</b><small>${d.role}</small><p>${d.ds}</p>
      ${k === 'adept' ? `<div class="elems">${Object.entries(ELEMENTS).map(([e, E]) => `<button data-elem="${e}" class="${elemSel === e ? 'on' : ''}" style="--c:${E.hex}" title="${E.code}">${E.nm}</button>`).join('')}</div>` : ''}
      <div class="uf"><span>보유 ${counts[k] || 0}${d.squad ? ` (${d.squad}인 분대)` : ''}</span><button class="btn" data-unit="${k}" ${save.credits < d.cost || o.ruined || used + (d.squad || 1) > cap ? 'disabled' : ''}>${fmt(d.cost)} C · ${d.time}초</button></div></div>`).join('')}</div>
    <p class="bpn">원소 반응: 화염+물=증발 · 화염+얼음=융해 · 번개+화염=과부하(폭발) · 번개+물=감전 · 얼음+물=빙결(감속) · 얼음+번개=초전도 · 풀+물=개화 · 풀+화염=연소 · 바람=확산 · 바위=결정화(아군 보호막)</p>`;
  $('bpBody').querySelectorAll('[data-elem]').forEach(b => b.onclick = () => { elemSel = b.dataset.elem; renderBasePanel(); });
  $('bpBody').querySelectorAll('[data-unit]').forEach(b => b.onclick = () => { const r = queueUnit(o, b.dataset.unit, elemSel); if (r !== 'ok') hooks.toast && hooks.toast(r === 'cap' ? '유닛 한도가 찼어요. 기지를 업그레이드하세요' : r === 'money' ? '크레딧이 부족해요' : '기지를 먼저 복구하세요'); else sfx('ui'); renderBasePanel(); });
  $('bpBody').querySelectorAll('[data-act]').forEach(b => b.onclick = () => { if (b.dataset.act === 'up') { if (upgradeOutpost(o)) { sfx('coin'); hooks.toast && hooks.toast(`<b>${o.nm}</b> Lv.${o.lv} 달성!`); } } else if (repairOutpost(o)) sfx('coin'); renderBasePanel(); });
}
