import * as THREE from 'three';

// ---------------------------------------------------------------------------
// GPU particle layer. Every particle's motion is computed in the vertex shader
// from (seed, time), so there is no per-frame CPU work regardless of count.
// ---------------------------------------------------------------------------
const MODES = { rise: 0, orbit: 1, helix: 2, swirl: 3, rain: 4, flame: 5, burst: 6 };

const particleVert = /* glsl */`
  #define TAU 6.28318530718
  uniform float uTime, uSpeed, uRadius, uHeight, uSize, uPixelRatio, uIntensity;
  uniform vec3 uColorA, uColorB;
  attribute vec4 aSeed;
  varying vec3 vColor;
  varying float vAlpha;

  // Cheap smooth turbulence
  vec3 curl(vec3 p, float t) {
    return vec3(
      sin(p.y * 1.7 + t * 1.3) + sin(p.z * 2.3 - t * 0.7),
      0.0,
      cos(p.x * 1.9 - t * 1.1) + sin(p.y * 2.1 + t * 0.9)
    ) * 0.5;
  }

  void main() {
    float spd = uSpeed * (0.6 + aSeed.y * 0.8);
    float life = fract(aSeed.x + uTime * spd);
    float ang0 = aSeed.z * TAU;
    vec3 p;
    float a = 1.0;
    float sz = 1.0;

  #if MODE == 0      // rise: drifting column of motes
    float r = uRadius * (0.35 + 0.65 * aSeed.w);
    float ang = ang0 + uTime * 0.35 + life * 1.5;
    p = vec3(cos(ang) * r, life * uHeight, sin(ang) * r);
    p += curl(p, uTime) * 0.25 * life;
    a = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.6, 1.0, life));
  #elif MODE == 1    // orbit: twinkling ring cloud
    float ang = ang0 + uTime * spd * 2.5;
    float r = uRadius * (0.8 + 0.4 * aSeed.y);
    p = vec3(cos(ang) * r, uHeight * (0.12 + 0.85 * aSeed.w) + sin(uTime * 1.3 + aSeed.x * 20.0) * 0.25, sin(ang) * r);
    a = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 3.0 + aSeed.x * 50.0));
  #elif MODE == 2    // helix: double strand climbing
    float strand = step(0.5, aSeed.w);
    float ang = life * TAU * 2.0 + strand * 3.14159 + uTime * 1.2;
    float r = uRadius * (1.0 - 0.25 * life) + (aSeed.y - 0.5) * 0.25;
    p = vec3(cos(ang) * r, life * uHeight, sin(ang) * r);
    a = smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.75, 1.0, life));
  #elif MODE == 3    // swirl: tornado widening upward
    float ang = ang0 + uTime * (2.0 + 3.0 * life) * (0.6 + spd);
    float r = uRadius * (0.25 + 1.1 * life * life) + aSeed.y * 0.3;
    p = vec3(cos(ang) * r, life * uHeight, sin(ang) * r);
    a = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.7, 1.0, life));
    sz = 0.6 + life * 0.8;
  #elif MODE == 4    // rain: falling sparkles
    float r = uRadius * sqrt(aSeed.z);
    float ang = aSeed.w * TAU;
    p = vec3(cos(ang) * r, uHeight * (1.0 - life), sin(ang) * r);
    p.x += sin(uTime + aSeed.y * 10.0) * 0.15;
    a = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.85, 1.0, life));
    sz = 0.7;
  #elif MODE == 5    // flame: converging tongues with turbulence
    float r = uRadius * (1.0 - life) * (0.3 + 0.7 * aSeed.w);
    float ang = ang0 + uTime * 0.6;
    p = vec3(cos(ang) * r, pow(life, 0.8) * uHeight, sin(ang) * r);
    p += curl(p * 1.5, uTime * 2.0) * 0.35 * life;
    a = smoothstep(0.0, 0.05, life) * (1.0 - life);
    sz = 1.4 - life;
  #else              // burst: expanding shell around the body
    float th = ang0, ph = acos(2.0 * aSeed.w - 1.0);
    vec3 dir = vec3(sin(ph) * cos(th), cos(ph) * 0.6, sin(ph) * sin(th));
    p = vec3(0.0, uHeight * 0.6, 0.0) + dir * (0.6 + life * uRadius);
    a = (1.0 - life) * smoothstep(0.0, 0.05, life);
    sz = 1.2 - life * 0.6;
  #endif

    vColor = mix(uColorA, uColorB, aSeed.y);
    vAlpha = a * uIntensity;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * sz * (0.5 + aSeed.w) * uPixelRatio * (320.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const particleFrag = /* glsl */`
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
  #ifdef STAR
    // four-point sparkle
    float spike = max(1.0 - abs(c.x) * 14.0, 0.0) * (1.0 - abs(c.y) * 2.0)
                + max(1.0 - abs(c.y) * 14.0, 0.0) * (1.0 - abs(c.x) * 2.0);
    float m = max(smoothstep(0.22, 0.0, d), clamp(spike, 0.0, 1.0));
  #else
    float m = smoothstep(0.5, 0.0, d);
  #endif
    float core = smoothstep(0.12, 0.0, d);
    vec3 col = vColor * m * 1.2 + vec3(core) * 0.45;
    gl_FragColor = vec4(col * vAlpha, m * vAlpha);
  }
`;

function makeParticles(layer, colors, pixelRatio) {
  const n = layer.count;
  const seeds = new Float32Array(n * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  const g = new THREE.BufferGeometry();
  // position attribute is required by three; real positions come from the shader
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), 12);

  const [ca, cb] = layer.color;
  const mat = new THREE.ShaderMaterial({
    vertexShader: particleVert,
    fragmentShader: particleFrag,
    defines: { MODE: MODES[layer.mode] ?? 0, ...(layer.shape === 'star' ? { STAR: '' } : {}) },
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: layer.speed },
      uRadius: { value: layer.radius },
      uHeight: { value: layer.height },
      uSize: { value: layer.size },
      uPixelRatio: { value: pixelRatio },
      uIntensity: { value: 0 },
      uColorA: { value: new THREE.Color(colors[ca]) },
      uColorB: { value: new THREE.Color(colors[cb]) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------------------------------------------------------------------------
// Procedural magic-circle texture (rings, polygram, rune glyphs).
// ---------------------------------------------------------------------------
function magicCircleTexture(seed) {
  const s = 1024, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  let rnd = seed * 9301 + 49297;
  const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
  g.translate(s / 2, s / 2);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';

  const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  ring(495, 6); ring(470, 2); ring(380, 4); ring(360, 1.5); ring(150, 3);

  // Rune band between 380 and 470
  const runes = 36;
  for (let i = 0; i < runes; i++) {
    const a = (i / runes) * Math.PI * 2;
    g.save();
    g.rotate(a);
    g.translate(0, -425);
    g.lineWidth = 3;
    g.beginPath();
    const strokes = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < strokes; k++) {
      const x1 = (rand() - 0.5) * 26, y1 = (rand() - 0.5) * 34;
      const x2 = (rand() - 0.5) * 26, y2 = (rand() - 0.5) * 34;
      g.moveTo(x1, y1); g.lineTo(x2, y2);
    }
    if (rand() < 0.4) g.arc(0, 0, 6 + rand() * 6, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  // Polygram
  const pts = 5 + Math.floor(rand() * 4), skip = pts === 6 ? 2 : Math.floor(pts / 2);
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i <= pts; i++) {
    const a = ((i * skip) % pts) / pts * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * 360, y = Math.sin(a) * 360;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();

  // Small orbiting circles at the polygram vertices
  for (let i = 0; i < pts; i++) {
    const a = i / pts * Math.PI * 2 - Math.PI / 2;
    g.lineWidth = 2;
    g.beginPath(); g.arc(Math.cos(a) * 360, Math.sin(a) * 360, 26, 0, Math.PI * 2); g.stroke();
  }

  // Tick marks
  for (let i = 0; i < 120; i++) {
    const a = i / 120 * Math.PI * 2, l = i % 5 ? 10 : 22;
    g.lineWidth = i % 5 ? 1.5 : 3;
    g.beginPath();
    g.moveTo(Math.cos(a) * 470, Math.sin(a) * 470);
    g.lineTo(Math.cos(a) * (470 - l), Math.sin(a) * (470 - l));
    g.stroke();
  }

  const t = new THREE.CanvasTexture(cv);
  t.anisotropy = 8;
  return t;
}

const circleVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const circleFrag = /* glsl */`
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uTime, uIntensity;
  varying vec2 vUv;
  void main() {
    float m = texture2D(uMap, vUv).r;
    vec2 c = vUv - 0.5;
    float d = length(c) * 2.0;
    // energy wave sweeping outward
    float wave = smoothstep(0.08, 0.0, abs(fract(d - uTime * 0.35) - 0.5) - 0.42);
    float glow = smoothstep(1.0, 0.2, d) * 0.12;
    float a = (m * (0.7 + 0.6 * wave) + glow) * uIntensity;
    gl_FragColor = vec4(uColor * a * 1.5, a);
  }
`;

// Thin glowing band (floating rings / ground ring) with travelling dashes.
const bandFrag = /* glsl */`
  uniform vec3 uColor;
  uniform float uTime, uIntensity, uSpeed;
  varying vec2 vUv;
  void main() {
    float dash = 0.55 + 0.45 * sin(vUv.x * 80.0 - uTime * uSpeed * 12.0);
    float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
    float a = pow(edge, 1.5) * dash * uIntensity;
    gl_FragColor = vec4(uColor * a * 1.8, a);
  }
`;

// Aurora curtain: layered noise bands on an open cylinder.
const auroraVert = /* glsl */`
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const auroraFrag = /* glsl */`
  uniform vec3 uColorA, uColorB;
  uniform float uTime, uIntensity;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vView;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float noise(vec2 x) {
    vec2 p = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n = p.x + p.y * 57.0;
    return mix(mix(hash(n), hash(n + 1.0), f.x), mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  void main() {
    vec2 uv = vUv;
    float x = uv.x * 18.0;
    float n = fbm(vec2(x, uv.y * 2.0 - uTime * 0.6));
    float bands = smoothstep(0.45, 0.85, fbm(vec2(x * 0.6 + n * 2.0, uTime * 0.15)));
    float vert = smoothstep(0.0, 0.25, uv.y) * (1.0 - smoothstep(0.55, 1.0, uv.y));
    float rim = 1.0 - abs(dot(normalize(vN), normalize(vView)));
    float a = bands * vert * (0.35 + rim * 0.9) * uIntensity;
    vec3 col = mix(uColorA, uColorB, uv.y + n * 0.3);
    gl_FragColor = vec4(col * a * 1.1, a);
  }
`;

// Wing feather: gradient from root color to tip color, soft edges.
const featherFrag = /* glsl */`
  uniform vec3 uColorA, uColorB;
  uniform float uIntensity, uTime;
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - vec2(0.5, 0.0);
    float shape = 1.0 - smoothstep(0.0, 0.5, abs(c.x) / max(0.02, sin(vUv.y * 3.14159) * 0.5));
    float vein = smoothstep(0.03, 0.0, abs(c.x)) * 0.5;
    float shimmer = 0.75 + 0.25 * sin(vUv.y * 20.0 - uTime * 4.0);
    float a = (shape * 0.75 + vein) * uIntensity * shimmer * (1.0 - vUv.y * 0.3);
    vec3 col = mix(uColorA, uColorB, pow(vUv.y, 1.5));
    gl_FragColor = vec4(col * a * 1.8, a);
  }
`;

// ---------------------------------------------------------------------------
export class AuraFx {
  /**
   * @param def    aura definition (data.js)
   * @param opts   { pixelRatio, onBolt(strength) }
   */
  constructor(def, opts = {}) {
    this.def = def;
    this.group = new THREE.Group();      // ground-anchored effects
    this.attached = new THREE.Group();   // follows the avatar body (halo, wings)
    this.uniforms = [];       // every uniform block that has uTime / uIntensity
    this.updaters = [];       // per-frame callbacks (t, dt)
    this.disposables = [];
    this.intensity = 0;
    this.target = 1;
    this.onBolt = opts.onBolt || (() => {});

    const C = {};
    for (const k of ['a', 'b', 'c']) C[k] = new THREE.Color(def.colors[k]);
    const hex = def.colors;
    const fx = def.fx;

    // Particles
    for (const layer of fx.particles || []) {
      const p = makeParticles(layer, hex, opts.pixelRatio || 1);
      this._track(p, p.material.uniforms);
      this.group.add(p);
    }

    // Rings
    for (const r of fx.rings || []) this._ring(r, C);

    if (fx.halo) this._halo(fx.halo, C);
    if (fx.wings) this._wings(fx.wings, C);
    if (fx.aurora) this._aurora(fx.aurora, C);
    if (fx.orbs) this._orbs(fx.orbs, C);
    if (fx.lightning) this._lightning(fx.lightning, C);

    // Light
    this.light = new THREE.PointLight(C.a, 0, 14, 1.6);
    this.light.position.set(0, 3.5, 0);
    this.group.add(this.light);
    const base = fx.light || 1;
    this.updaters.push((t) => {
      const flick = fx.flicker ? 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3) : 1;
      this.light.intensity = base * 2.2 * flick * this.intensity;
    });
  }

  _track(obj, uniforms) {
    if (uniforms) this.uniforms.push(uniforms);
    this.disposables.push(obj);
  }

  _ring(r, C) {
    const color = C[r.color].clone();
    if (r.kind === 'circle') {
      const tex = magicCircleTexture(Math.floor(r.radius * 100));
      const u = {
        uMap: { value: tex }, uColor: { value: color },
        uTime: { value: 0 }, uIntensity: { value: 0 },
      };
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(r.radius * 2, r.radius * 2),
        new THREE.ShaderMaterial({ vertexShader: circleVert, fragmentShader: circleFrag, uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.03;
      this.group.add(m);
      this._track(m, u);
      this.disposables.push(tex);
      this.updaters.push((t) => { m.rotation.z = t * r.speed; });
      return;
    }
    // band ring (ground or floating); uv.x runs around the ring, uv.y across
    const seg = 160, R = r.radius, w = r.width || 0.1;
    const geo = new THREE.BufferGeometry();
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2;
      for (const s of [-1, 1]) {
        const rr = R + s * w;
        pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
        uv.push(i / seg, s < 0 ? 0 : 1);
      }
      if (i < seg) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const u = { uColor: { value: color }, uTime: { value: 0 }, uIntensity: { value: 0 }, uSpeed: { value: r.speed } };
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: circleVert, fragmentShader: bandFrag, uniforms: u,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    const holder = new THREE.Group();
    holder.position.y = r.kind === 'float' ? r.y : 0.05;
    holder.rotation.x = r.tilt || 0;
    holder.add(m);
    this.group.add(holder);
    this._track(m, u);
    this.updaters.push((t) => { holder.rotation.y = t * r.speed * 0.6; });
  }

  _halo(h, C) {
    const mk = (radius, y, col) => {
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.05, 12, 64),
        new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2), transparent: true, opacity: 0 }),
      );
      m.rotation.x = Math.PI / 2;
      m.position.y = y;
      this.attached.add(m);
      this.disposables.push(m);
      return m;
    };
    const rings = [mk(h.radius, 5.75, C[h.color])];
    if (h.double) rings.push(mk(h.radius * 1.4, 5.95, C.a));
    this.updaters.push((t) => {
      rings.forEach((m, i) => {
        m.material.opacity = this.intensity;
        m.position.y = 5.75 + i * 0.2 + Math.sin(t * 2 + i) * 0.06;
        m.rotation.z = t * (i ? -0.8 : 0.5);
        m.rotation.x = Math.PI / 2 + Math.sin(t * 0.9 + i) * 0.08;
      });
    });
  }

  _wings(w, C) {
    const u = { uColorA: { value: C[w.color].clone() }, uColorB: { value: C[w.tip].clone() }, uIntensity: { value: 0 }, uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({ vertexShader: circleVert, fragmentShader: featherFrag, uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.uniforms.push(u);
    const pivots = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.35, 3.7, -0.6);
      const feathers = 7;
      for (let i = 0; i < feathers; i++) {
        const len = w.span * (0.55 + 0.45 * Math.sin((i + 1) / (feathers + 1) * Math.PI));
        const geo = new THREE.PlaneGeometry(0.55, len);
        geo.translate(0, len / 2, 0);
        const f = new THREE.Mesh(geo, mat);
        // fan from upward to outward-downward
        f.rotation.z = side * (-0.25 - i * 0.28);
        f.position.z = -i * 0.02;
        pivot.add(f);
        this.disposables.push(f);
      }
      this.attached.add(pivot);
      pivots.push({ pivot, side });
    }
    this.updaters.push((t) => {
      const flap = Math.sin(t * 1.8) * 0.22;
      for (const { pivot, side } of pivots) {
        pivot.rotation.y = side * (0.35 + flap);
        pivot.rotation.x = 0.15;
      }
    });
  }

  _aurora(a, C) {
    const u = { uColorA: { value: C[a.colorA].clone() }, uColorB: { value: C[a.colorB].clone() }, uTime: { value: 0 }, uIntensity: { value: 0 } };
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(a.radius, a.radius * 0.8, a.height, 96, 1, true),
      new THREE.ShaderMaterial({ vertexShader: auroraVert, fragmentShader: auroraFrag, uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    m.position.y = a.height / 2;
    this.group.add(m);
    this._track(m, u);
    this.updaters.push((t) => { m.rotation.y = t * 0.15; });
  }

  _orbs(o, C) {
    const col = C[o.color];
    const TRAIL = 48;
    const orbs = [];
    for (let i = 0; i < o.count; i++) {
      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.16, 2),
        new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(4), transparent: true }),
      );
      const positions = new Float32Array(TRAIL * 3);
      const colors = new Float32Array(TRAIL * 3);
      for (let k = 0; k < TRAIL; k++) {
        const f = Math.pow(1 - k / TRAIL, 2) * 2;
        colors.set([col.r * f, col.g * f, col.b * f], k * 3);
      }
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      tg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      trail.frustumCulled = false;
      this.group.add(core, trail);
      this.disposables.push(core, trail);
      orbs.push({ core, trail, phase: i / o.count * Math.PI * 2, tilt: (i % 3 - 1) * 0.5, filled: false });
    }
    const p = new THREE.Vector3();
    this.updaters.push((t) => {
      for (const ob of orbs) {
        const a = ob.phase + t * o.speed;
        p.set(Math.cos(a) * o.radius, o.height + Math.sin(a * 2 + ob.phase) * 0.6 + Math.sin(a) * ob.tilt * 2, Math.sin(a) * o.radius);
        ob.core.position.copy(p);
        ob.core.material.opacity = this.intensity;
        ob.trail.material.opacity = this.intensity;
        const arr = ob.trail.geometry.attributes.position.array;
        if (!ob.filled) { for (let k = 0; k < TRAIL; k++) arr.set([p.x, p.y, p.z], k * 3); ob.filled = true; }
        arr.copyWithin(3, 0, (TRAIL - 1) * 3);    // shift history back by one
        arr[0] = p.x; arr[1] = p.y; arr[2] = p.z;
        ob.trail.geometry.attributes.position.needsUpdate = true;
      }
    });
  }

  _lightning(l, C) {
    const MAXPTS = 64;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXPTS * 3), 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ color: C[l.color].clone().multiplyScalar(6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const bolt = new THREE.LineSegments(geo, mat);
    bolt.frustumCulled = false;
    this.group.add(bolt);
    this.disposables.push(bolt);

    let next = 0.5, life = 0;
    // midpoint displacement between a and b, depth levels
    const build = () => {
      const pts = [];
      const from = new THREE.Vector3((Math.random() - 0.5) * 1.5, 7 + Math.random() * 2, (Math.random() - 0.5) * 1.5);
      const ang = Math.random() * Math.PI * 2, rad = 2 + Math.random() * 2.5;
      const to = new THREE.Vector3(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
      const subdivide = (a, b, depth, out) => {
        if (depth === 0) { out.push(a.clone(), b.clone()); return; }
        const mid = a.clone().lerp(b, 0.5);
        const off = a.distanceTo(b) * 0.22;
        mid.x += (Math.random() - 0.5) * off; mid.z += (Math.random() - 0.5) * off; mid.y += (Math.random() - 0.5) * off * 0.5;
        subdivide(a, mid, depth - 1, out); subdivide(mid, b, depth - 1, out);
      };
      subdivide(from, to, 4, pts);                       // 16 segments = 32 points
      // a branch off a random point
      const bi = 2 + Math.floor(Math.random() * 10) * 2;
      const bEnd = pts[bi].clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, -1.5 - Math.random() * 2, (Math.random() - 0.5) * 3));
      subdivide(pts[bi], bEnd, 3, pts);                 // +16 points
      const arr = geo.attributes.position.array;
      const n = Math.min(pts.length, MAXPTS);
      for (let i = 0; i < n; i++) arr.set([pts[i].x, pts[i].y, pts[i].z], i * 3);
      geo.attributes.position.needsUpdate = true;
      geo.setDrawRange(0, n);
    };
    this.updaters.push((t, dt) => {
      next -= dt;
      if (next <= 0 && this.intensity > 0.5) {
        build();
        life = 0.18;
        next = (0.4 + Math.random() * 2.2) / l.rate;
        this.onBolt(1);
      }
      life -= dt;
      const on = life > 0 ? (Math.random() < 0.75 ? 1 : 0.3) : 0;
      mat.opacity = on * this.intensity;
      if (life <= 0) geo.setDrawRange(0, 0);
      this.boltFlash = on;
    });
  }

  fadeOut() { this.target = 0; }
  get dead() { return this.target === 0 && this.intensity < 0.01; }

  update(t, dt) {
    const k = 1 - Math.exp(-dt * (this.target ? 2.2 : 5));
    this.intensity += (this.target - this.intensity) * k;
    for (const u of this.uniforms) {
      if (u.uTime) u.uTime.value = t;
      if (u.uIntensity) u.uIntensity.value = this.intensity;
    }
    for (const f of this.updaters) f(t, dt);
    if (this.boltFlash) this.light.intensity += this.boltFlash * 12 * this.intensity;
  }

  dispose() {
    for (const o of this.disposables) {
      if (o.isTexture) { o.dispose(); continue; }
      o.geometry?.dispose();
      const m = o.material;
      if (m) { m.uniforms?.uMap?.value?.dispose?.(); m.dispose(); }
    }
    this.group.removeFromParent();
    this.attached.removeFromParent();
  }
}
