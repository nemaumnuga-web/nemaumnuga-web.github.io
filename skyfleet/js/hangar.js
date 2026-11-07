// 격납고(조선소) 3D 씬
import { THREE, Q, renderer, rand, canvasTex, Particles, TEX_SMOKE, TEX_SOFT, put, finish, box, cyl, HPI, addProto, COL } from './core.js';
import { makeShipModel } from './ships.js';
import { TIERS } from './data.js';

export const hscene = new THREE.Scene();
hscene.background = new THREE.Color(0x05090b);
hscene.fog = new THREE.Fog(0x05090b, 120, 260);
export const hcam = new THREE.PerspectiveCamera(48, 1, 0.5, 600);
let ship = null, curTier = 0, arm = null, H_SMOKE = null, H_FIRE = null;
const view = { yaw: 0.6, pitch: 0.32, drag: false, auto: true };

function floorTex() {
  return canvasTex(1024, 1024, (x, W) => {
    x.fillStyle = '#5d7177'; x.fillRect(0, 0, W, W);
    for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${rand(0.02, 0.06)})`; x.fillRect(rand(0, W), rand(0, W), rand(2, 10), rand(2, 10)); }
    const c = W / 2;
    x.strokeStyle = 'rgba(230,240,240,.85)'; x.lineWidth = 6;
    for (const r of [110, 250, 380]) { x.beginPath(); x.arc(c, c, r, 0, 7); x.stroke(); }
    for (let a = 0; a < 12; a++) { const t = a * Math.PI / 6; x.beginPath(); x.moveTo(c + Math.cos(t) * 110, c + Math.sin(t) * 110); x.lineTo(c + Math.cos(t) * 380, c + Math.sin(t) * 380); x.stroke(); }
    x.lineWidth = 22; for (let a = 0; a < 48; a++) { x.strokeStyle = a % 2 ? '#c8352a' : '#e6e1d6'; x.beginPath(); x.arc(c, c, 470, a * Math.PI / 24, (a + 1) * Math.PI / 24); x.stroke(); }
    x.strokeStyle = '#22d3d3'; x.lineWidth = 14; x.beginPath(); x.arc(c, c, 440, 0, 7); x.stroke();
    x.fillStyle = 'rgba(240,248,248,.9)';
    for (let a = 0; a < 4; a++) { x.save(); x.translate(c, c); x.rotate(a * Math.PI / 2 + Math.PI / 4); for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(-40, -300 - k * 34); x.lineTo(0, -330 - k * 34); x.lineTo(40, -300 - k * 34); x.lineTo(40, -288 - k * 34); x.lineTo(0, -318 - k * 34); x.lineTo(-40, -288 - k * 34); x.fill(); } x.restore(); }
  });
}
function wallTex() {
  return canvasTex(1024, 256, (x, W, H) => {
    x.fillStyle = '#1b2023'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 16; i++) { x.fillStyle = `hsl(200,6%,${rand(12, 20)}%)`; x.fillRect(i * 64 + 3, 30, 58, 150); x.fillStyle = 'rgba(255,255,255,.04)'; x.fillRect(i * 64 + 3, 30, 58, 6); }
    x.fillStyle = '#0d1012'; for (let i = 0; i < 16; i += 2) x.fillRect(i * 64, 0, 10, H);
    x.fillStyle = '#2a2f33'; x.fillRect(0, 190, W, 66);
  });
}
export function buildHangar() {
  const pm = new THREE.PMREMGenerator(renderer), env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(40, 16, 8), new THREE.MeshBasicMaterial({ color: 0x0c1418, side: THREE.BackSide })));
  for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(box(6, 2, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? 0.5 : 4, i % 2 ? 4 : 4, i % 2 ? 4.5 : 4) })); l.position.set(Math.cos(i) * 25, 22, Math.sin(i) * 25); env.add(l); }
  hscene.environment = pm.fromScene(env, 0, 0.1, 100).texture;

  const floor = new THREE.Mesh(new THREE.CircleGeometry(90, 64), new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.55, metalness: 0.3 }));
  floor.rotation.x = -HPI; floor.receiveShadow = true; hscene.add(floor);
  const wt = wallTex(); wt.wrapS = THREE.RepeatWrapping; wt.repeat.set(4, 1);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(90, 90, 50, 32, 1, true), new THREE.MeshStandardMaterial({ map: wt, side: THREE.BackSide, roughness: 0.8, metalness: 0.4 }));
  wall.position.y = 25; hscene.add(wall);
  const ceil = new THREE.Mesh(new THREE.CircleGeometry(90, 32), new THREE.MeshStandardMaterial({ color: 0x0b0e10, roughness: 0.9 })); ceil.rotation.x = HPI; ceil.position.y = 50; hscene.add(ceil);
  const B = {};
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; put(B, 'steel', box(4, 50, 3), Math.cos(a) * 87, 25, Math.sin(a) * 87, 0, -a, 0); }
  for (let i = -3; i <= 3; i++) { put(B, 'steel', box(170, 2.5, 2), 0, 46, i * 22); put(B, 'steel', box(2, 2.5, 170), i * 22, 45, 0); }
  // 계단 + 상부 통로
  for (let i = 0; i < 14; i++) put(B, 'steel', box(6, 0.4, 2), -30 + i * 1.6, 2 + i * 1.6, -80);
  put(B, 'steel', box(60, 1, 6), 10, 24, -82);
  // 상자
  const crates = [[50, 0, -55], [56, 0, -50], [50, 6, -53], [-55, 0, 52], [-61, 0, 47], [-58, 6, 50], [60, 0, 40]];
  for (const [cx, cy, cz] of crates) { put(B, 'crate', box(6, 6, 6), cx, cy + 3, cz); put(B, 'white', box(6.2, 1, 6.2), cx, cy + 4.6, cz); }
  // 패드
  put(B, 'steel', cyl(26, 27, 1.2, 48), 0, 0.6, 0);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; put(B, 'white', cyl(1.5, 1.5, 2.4, 12), Math.cos(a) * 40, 1.2, Math.sin(a) * 40); put(B, 'crate', cyl(1.55, 1.55, 0.6, 12), Math.cos(a) * 40, 2.2, Math.sin(a) * 40); }
  // 모니터
  put(B, 'steel', box(16, 10, 1), -40, 22, -78, 0, 0.45, 0);
  const f = finish(B, []);
  const M = {
    steel: new THREE.MeshStandardMaterial({ color: 0x2c3236, roughness: 0.6, metalness: 0.7 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x9c2420, roughness: 0.6, metalness: 0.3 }),
    white: new THREE.MeshStandardMaterial({ color: 0xd9dcdc, roughness: 0.5, metalness: 0.2 }),
  };
  addProto(hscene, f, M, { steel: 1, crate: 1, white: 1 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(15, 9), new THREE.MeshBasicMaterial({ map: canvasTex(512, 300, (x, W, H) => { x.fillStyle = '#04161a'; x.fillRect(0, 0, W, H); x.strokeStyle = '#22d3d3'; x.lineWidth = 3; x.strokeRect(10, 10, W - 20, H - 20); x.fillStyle = '#22d3d3'; x.font = 'bold 34px Orbitron, sans-serif'; x.fillText('SHIPYARD · DOCK 1', 30, 64); x.font = '20px Orbitron, sans-serif'; for (let i = 0; i < 6; i++) { x.globalAlpha = 0.4 + Math.random() * 0.6; x.fillRect(30, 100 + i * 28, rand(100, 440), 12); } }), toneMapped: false }));
  screen.position.set(-40 + Math.sin(0.45) * 0.6, 22, -78 + Math.cos(0.45) * 0.6); screen.rotation.y = 0.45; hscene.add(screen);
  // 네온 링
  const neon = (r, y, col, tube = 0.25) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 128), new THREE.MeshBasicMaterial({ color: col, toneMapped: false })); m.rotation.x = HPI; m.position.y = y; hscene.add(m); return m; };
  neon(88.5, 12, new THREE.Color(0.3, 3.5, 3.8)); neon(88.5, 18, new THREE.Color(0.3, 3.5, 3.8), 0.15); neon(88.5, 30, new THREE.Color(4, 0.4, 0.3), 0.15);
  neon(27, 1.3, new THREE.Color(0.3, 4, 4.2), 0.35);
  // 천장등
  const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5, 5), toneMapped: false });
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const l = new THREE.Mesh(new THREE.CircleGeometry(2.6, 20), lampM); l.rotation.x = HPI; l.position.set(Math.cos(a) * 55, 44, Math.sin(a) * 55); hscene.add(l); }
  // 조명
  hscene.add(new THREE.HemisphereLight(0x9fd8e0, 0x1a2024, 0.5));
  const spot = new THREE.SpotLight(0xffffff, 3500, 220, 0.55, 0.5, 1.6); spot.position.set(20, 48, 25); spot.target.position.set(0, 4, 0);
  if (Q.shadow) { spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0005; }
  hscene.add(spot, spot.target);
  for (let i = 0; i < 4; i++) { const p = new THREE.PointLight(i % 2 ? 0x22d3d3 : 0x88ffff, 1800, 120, 1.6); const a = i * HPI + 0.4; p.position.set(Math.cos(a) * 70, 14, Math.sin(a) * 70); hscene.add(p); }
  // 로봇 팔
  const AB = {};
  put(AB, 'w', cyl(4, 5, 4, 16), 0, 2, 0); put(AB, 'w', box(3, 18, 3), 0, 12, 0, 0, 0, 0.5);
  put(AB, 'w', box(2.4, 16, 2.4), -8, 26, 0, 0, 0, -0.9); put(AB, 'd', cyl(1.6, 1.6, 4, 12), -15, 31, 0, HPI);
  const af = finish(AB, []);
  arm = new THREE.Group(); addProto(arm, af, { w: new THREE.MeshStandardMaterial({ color: 0xe8ebeb, roughness: 0.35, metalness: 0.3 }), d: new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.5, metalness: 0.8 }) });
  arm.position.set(64, 0, 28); hscene.add(arm);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6), toneMapped: false })); tip.position.set(-17, 31, 0); arm.add(tip); arm.userData.tip = tip;
  H_SMOKE = new Particles(hscene, 1500, TEX_SMOKE, false); H_FIRE = new Particles(hscene, 400, TEX_SOFT, true);
  H_SMOKE.mat.uniforms.fogColor.value.set(0x05090b); H_SMOKE.mat.uniforms.fogNear.value = 120; H_SMOKE.mat.uniforms.fogFar.value = 260;
  H_FIRE.mat.uniforms.fogNear.value = 120; H_FIRE.mat.uniforms.fogFar.value = 260;
  // 드래그로 회전
  const cv = document.getElementById('view');
  cv.addEventListener('pointerdown', e => { if (document.body.dataset.mode === 'hangar') { view.drag = { x: e.clientX, y: e.clientY }; view.auto = false; } });
  addEventListener('pointermove', e => { if (view.drag && document.body.dataset.mode === 'hangar') { view.yaw -= (e.clientX - view.drag.x) * 0.006; view.pitch = Math.max(0.05, Math.min(0.9, view.pitch + (e.clientY - view.drag.y) * 0.004)); view.drag = { x: e.clientX, y: e.clientY }; } });
  addEventListener('pointerup', () => { view.drag = false; setTimeout(() => view.auto = true, 4000); });
}
export function setHangarShip(tier, paint) {
  if (ship) hscene.remove(ship.root);
  curTier = tier;
  ship = makeShipModel(tier, paint, 'player');
  ship.root.position.y = 9 + TIERS[tier].scale * 3; ship.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  hscene.add(ship.root);
}
export function updateHangar(dt) {
  const t = performance.now() / 1000;
  if (view.auto) view.yaw += dt * 0.12;
  const sc = TIERS[curTier].scale;
  const r = 62 + sc * 18;
  hcam.position.set(Math.sin(view.yaw) * Math.cos(view.pitch) * r, 8 + Math.sin(view.pitch) * r, Math.cos(view.yaw) * Math.cos(view.pitch) * r);
  hcam.lookAt(0, 8 + sc * 2, 0); hcam.aspect = innerWidth / innerHeight; hcam.updateProjectionMatrix();
  if (ship) { ship.model.position.y = Math.sin(t * 1.3) * 0.6; ship.radar.rotation.y = t * 2; ship.turrets.forEach((tu, i) => tu.rotation.y = Math.sin(t * 0.4 + i) * 0.6); }
  if (arm) { arm.rotation.y = Math.sin(t * 0.35) * 0.8 - 0.4; if ((t % 3) < 0.6) { const p = arm.userData.tip.getWorldPosition(new THREE.Vector3()); for (let i = 0; i < 3; i++) H_FIRE.emit(p.x, p.y, p.z, rand(-20, 20), rand(-5, 20), rand(-20, 20), rand(0.2, 0.5), 1, 0.2, COL.spark, COL.sparkE, 1, 0.5, 60); } }
  for (const [vx, vz] of [[-55, -35], [35, 62], [-70, 20]]) if (Math.random() < 0.6) H_SMOKE.emit(vx + rand(-3, 3), 0.5, vz + rand(-3, 3), rand(-2, 2), rand(6, 12), rand(-2, 2), rand(3, 5), 4, 22, [0.5, 0.56, 0.58], [0.35, 0.4, 0.42], 0.35, 0.3);
  if (ship && Math.random() < 0.6) for (const x of [-8, 8]) { const p = ship.model.localToWorld(new THREE.Vector3(x, -0.3, 15.4)); H_FIRE.emit(p.x, p.y, p.z, rand(-1, 1), rand(-1, 1), 10, 0.25, 2.4, 0.6, COL.exhaust, COL.exhaustE, 0.6); }
  H_SMOKE.update(dt); H_FIRE.update(dt);
}
