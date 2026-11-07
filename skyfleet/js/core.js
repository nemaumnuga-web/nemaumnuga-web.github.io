// 공용 유틸, 렌더러, 파티클
import * as THREE from 'three';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
export { THREE, mergeGeometries };

export const $ = id => document.getElementById(id);
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const rv = s => [rand(-s, s), rand(-s, s), rand(-s, s)];
export const fmt = n => Math.round(n).toLocaleString('ko-KR');
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const frameYield = () => new Promise(r => requestAnimationFrame(() => r()));

/* ---------- 품질 ---------- */
export const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 1;
let qn = isTouch ? 'mid' : 'high';
try { qn = localStorage.getItem('skyfleet_q') || qn; } catch (e) {}
export const QUALITY = qn;
export const Q = {
  high: { pr: Math.min(devicePixelRatio, 2), shadow: 2048, bloom: true, seg: 256, fx: 1 },
  mid: { pr: Math.min(devicePixelRatio, 1.5), shadow: 1024, bloom: true, seg: 192, fx: 0.7 },
  low: { pr: 1, shadow: 0, bloom: false, seg: 128, fx: 0.4 },
}[qn] || { pr: 1, shadow: 0, bloom: false, seg: 128, fx: 0.4 };

/* ---------- 렌더러 ---------- */
export const canvas = $('view');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: !Q.bloom, powerPreference: 'high-performance' });
renderer.setPixelRatio(Q.pr);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.62;
renderer.outputColorSpace = THREE.SRGBColorSpace;
if (Q.shadow) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
export const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 9500);

let composer = null, renderPass = null;
if (Q.bloom) {
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(new THREE.Scene(), camera);
  composer.addPass(renderPass);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.4, 1.0));
  composer.addPass(new OutputPass());
}
export function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  if (composer) composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
const _pScale = new THREE.Vector2();
export const particleSystems = [];
export function render(scene, cam, dt) {
  renderer.getDrawingBufferSize(_pScale);
  const sc = _pScale.y / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
  for (const ps of particleSystems) ps.mat.uniforms.scale.value = sc;
  if (composer) { renderPass.scene = scene; renderPass.camera = cam; composer.render(dt); }
  else renderer.render(scene, cam);
}

/* ---------- 캔버스 텍스처 ---------- */
export function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
export const TEX_SOFT = canvasTex(128, 128, x => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }, false);
export const TEX_SMOKE = canvasTex(128, 128, x => {
  for (let i = 0; i < 26; i++) { const px = 64 + rand(-26, 26), py = 64 + rand(-26, 26), r = rand(18, 40); const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
}, false);

/* ---------- 파티클 (CPU 시뮬레이션 + 셰이더 포인트) ---------- */
const P_VS = `attribute float size; attribute vec4 pcolor; varying vec4 vC; varying float vFog; uniform float scale; uniform float fogNear; uniform float fogFar;
void main(){ vC=pcolor; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*scale/-mv.z; gl_Position=projectionMatrix*mv; vFog=smoothstep(fogNear,fogFar,-mv.z); }`;
const P_FS_ADD = `uniform sampler2D map; varying vec4 vC; varying float vFog; void main(){ vec4 t=texture2D(map,gl_PointCoord); gl_FragColor=vec4(vC.rgb, vC.a*t.a*(1.-vFog)); }`;
const P_FS_NRM = `uniform sampler2D map; uniform vec3 fogColor; uniform float light; varying vec4 vC; varying float vFog; void main(){ vec4 t=texture2D(map,gl_PointCoord); gl_FragColor=vec4(mix(vC.rgb*light,fogColor,vFog), vC.a*t.a); }`;
export class Particles {
  constructor(scene, cap, tex, additive) {
    this.cap = cap; this.n = 0; this.d = new Float32Array(cap * 18); this.grav = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 4); this.sz = new Float32Array(cap);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.sz, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 500 }, fogNear: { value: 1500 }, fogFar: { value: 7800 }, fogColor: { value: new THREE.Color() }, light: { value: 1 } },
      vertexShader: P_VS, fragmentShader: additive ? P_FS_ADD : P_FS_NRM, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.geo = g;
    this.points.renderOrder = additive ? 3 : 2; scene.add(this.points); particleSystems.push(this);
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, a0, drag = 0, grav = 0) {
    if (this.n >= this.cap) return; const i = this.n++, o = i * 18, d = this.d;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz; d[o + 6] = life; d[o + 7] = life; d[o + 8] = s0; d[o + 9] = s1;
    d[o + 10] = c0[0]; d[o + 11] = c0[1]; d[o + 12] = c0[2]; d[o + 13] = c1[0]; d[o + 14] = c1[1]; d[o + 15] = c1[2]; d[o + 16] = a0; d[o + 17] = drag; this.grav[i] = grav;
  }
  update(dt) {
    const d = this.d, P = this.pos, C = this.col, S = this.sz;
    for (let i = 0; i < this.n; i++) {
      const o = i * 18; d[o + 6] -= dt;
      if (d[o + 6] <= 0) { const l = --this.n; if (i !== l) { d.copyWithin(o, l * 18, l * 18 + 18); this.grav[i] = this.grav[l]; } i--; continue; }
      const dr = Math.max(0, 1 - d[o + 17] * dt); d[o + 3] *= dr; d[o + 4] = d[o + 4] * dr - this.grav[i] * dt; d[o + 5] *= dr;
      d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
      const t = 1 - d[o + 6] / d[o + 7];
      P[i * 3] = d[o]; P[i * 3 + 1] = d[o + 1]; P[i * 3 + 2] = d[o + 2];
      C[i * 4] = d[o + 10] + (d[o + 13] - d[o + 10]) * t; C[i * 4 + 1] = d[o + 11] + (d[o + 14] - d[o + 11]) * t; C[i * 4 + 2] = d[o + 12] + (d[o + 15] - d[o + 12]) * t;
      C[i * 4 + 3] = d[o + 16] * (1 - t) * Math.min(1, t * 10 + 0.2);
      S[i] = d[o + 8] + (d[o + 9] - d[o + 8]) * t;
    }
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'pcolor', 'size']) this.geo.attributes[k].needsUpdate = true;
  }
}
export const COL = { fireHot: [3.4, 1.7, 0.55], fireMid: [1.6, 0.45, 0.08], smokeD: [0.12, 0.1, 0.09], smokeL: [0.42, 0.38, 0.34], spark: [7, 4, 1.4], sparkE: [2, 0.5, 0.1], white: [1, 1, 1], exhaust: [4, 1.8, 0.6], exhaustE: [0.6, 0.15, 0.6], blue: [0.6, 2.2, 5], red: [5, 1.4, 0.4], cyan: [0.4, 4, 4.5], dust: [0.5, 0.35, 0.22], dustE: [0.7, 0.55, 0.4] };

/* ---------- 지오메트리 병합 도우미 ---------- */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _one = new THREE.Vector3(1, 1, 1), _v = new THREE.Vector3();
export function put(B, key, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.clearGroups();
  g.applyMatrix4(_m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _one)); (B[key] = B[key] || []).push(g);
}
export function triUV(g, s) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, p.getZ(i) * s, p.getY(i) * s); else if (ay >= az) uv.setXY(i, p.getX(i) * s, p.getZ(i) * s); else uv.setXY(i, p.getX(i) * s, p.getY(i) * s);
  }
}
export function finish(B, uvKeys = ['hull', 'armor']) {
  const out = {};
  for (const k in B) { const g = mergeGeometries(B[k], false); if (uvKeys.includes(k)) triUV(g, 1 / 9); out[k] = g; }
  return out;
}
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);
export const HPI = Math.PI / 2;
export function addProto(parent, proto, mats, shadowKeys = { hull: 1, armor: 1, metal: 1, dark: 1 }) {
  const out = {};
  for (const k in proto) {
    const m = new THREE.Mesh(proto[k], mats[k]);
    if (shadowKeys[k]) { m.castShadow = true; m.receiveShadow = true; }
    parent.add(m); out[k] = m;
  }
  return out;
}

/* ---------- 소리 ---------- */
let ac = null, muted = false, eng = null;
export function setMute(m) { muted = m; if (eng) eng.g.gain.value = 0; }
// 엔진 소리: 톱니파 2개 + 저역 필터, 속도에 따라 음높이·볼륨 변화
export function engineSound(level, boost, on) {
  try {
    if (muted || !on) { if (eng) eng.g.gain.setTargetAtTime(0, ac.currentTime, 0.1); return; }
    ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume();
    if (!eng) {
      const g = ac.createGain(); g.gain.value = 0; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.connect(g); g.connect(ac.destination);
      const o1 = ac.createOscillator(), o2 = ac.createOscillator(); o1.type = 'sawtooth'; o2.type = 'sawtooth'; o1.connect(f); o2.connect(f); o1.start(); o2.start();
      eng = { g, f, o1, o2 };
    }
    const t = ac.currentTime, base = 42 + level * 38 + (boost ? 26 : 0);
    eng.o1.frequency.setTargetAtTime(base, t, 0.15); eng.o2.frequency.setTargetAtTime(base * 1.505, t, 0.15);
    eng.f.frequency.setTargetAtTime(300 + level * 500 + (boost ? 600 : 0), t, 0.2);
    eng.g.gain.setTargetAtTime(0.018 + level * 0.025 + (boost ? 0.02 : 0), t, 0.2);
  } catch (e) {}
}
export function sfx(kind, vol = 1) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume();
    const t = ac.currentTime, g = ac.createGain(); g.connect(ac.destination);
    if (kind === 'glass') {
      for (let i = 0; i < 6; i++) { const o = ac.createOscillator(), gg = ac.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(rand(1800, 4200), t + i * 0.025); gg.gain.setValueAtTime(0.05 * vol, t + i * 0.025); gg.gain.exponentialRampToValueAtTime(0.001, t + i * 0.025 + 0.25); o.connect(gg); gg.connect(ac.destination); o.start(t + i * 0.025); o.stop(t + i * 0.025 + 0.26); }
      return;
    }
    if (kind === 'shot' || kind === 'ui' || kind === 'coin') {
      const o = ac.createOscillator(); o.type = kind === 'shot' ? 'square' : 'sine';
      const f0 = kind === 'shot' ? 520 : kind === 'ui' ? 880 : 1320, f1 = kind === 'shot' ? 110 : kind === 'ui' ? 660 : 1760;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.08);
      g.gain.setValueAtTime((kind === 'shot' ? 0.04 : 0.06) * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12); o.connect(g); o.start(t); o.stop(t + 0.13);
    } else {
      const len = ac.sampleRate * 0.6, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      const s = ac.createBufferSource(); s.buffer = b; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'boom' ? 500 : kind === 'mine' ? 2400 : 1500;
      g.gain.setValueAtTime((kind === 'boom' ? 0.45 : kind === 'mine' ? 0.03 : 0.12) * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'mine' ? 0.15 : 0.6)); s.connect(f); f.connect(g); s.start(t);
    }
  } catch (e) {}
}
