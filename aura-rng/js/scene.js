import * as THREE from 'three';
import { EffectComposer } from '../vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../vendor/postprocessing/ShaderPass.js';
import { Avatar } from './avatar.js';
import { AuraFx } from './auraFx.js';

// Final pass: ACES tone mapping, sRGB encode, chromatic aberration, vignette, grain.
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uExposure: { value: 0.95 },
    uAberration: { value: 0.0015 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uExposure, uAberration, uFlash;
    uniform vec3 uFlashColor;
    varying vec2 vUv;
    vec3 aces(vec3 x) {
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 dir = vUv - 0.5;
      float amt = uAberration * (1.0 + uFlash * 6.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + dir * amt).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - dir * amt).b;
      col += uFlashColor * uFlash * 1.5;
      col = aces(col * uExposure);
      float vig = smoothstep(0.95, 0.25, length(dir * vec2(1.1, 1.0)));
      col *= mix(0.55, 1.0, vig);
      col = toSRGB(col);
      col += (rand(vUv * 1000.0 + uTime) - 0.5) * 0.025;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/** Drag to orbit, wheel / pinch to zoom, inertia, idle auto-rotate. */
class OrbitRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.target = new THREE.Vector3(0, 3.4, 0);
    this.yaw = 0.35; this.pitch = 0.12; this.dist = 17;
    this.vYaw = 0; this.vPitch = 0;
    this.goalDist = 17;
    this.autoRotate = true;
    this.idle = 10;
    this.shake = 0;
    this.zoomPunch = 0;
    this.pointers = new Map();
    this._pinch = 0;

    dom.addEventListener('pointerdown', e => {
      dom.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.idle = 0;
    });
    dom.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 1) {
        this.vYaw = -dx * 0.006;
        this.vPitch = dy * 0.004;
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this._pinch) this.goalDist *= this._pinch / d;
        this._pinch = d;
        this._clampDist();
      }
      this.idle = 0;
    });
    const up = e => { this.pointers.delete(e.pointerId); this._pinch = 0; };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', e => {
      e.preventDefault();
      this.goalDist *= Math.exp(e.deltaY * 0.0012);
      this._clampDist();
      this.idle = 0;
    }, { passive: false });
    dom.addEventListener('dblclick', () => this.reset());
  }
  _clampDist() { this.goalDist = THREE.MathUtils.clamp(this.goalDist, 7, 30); }
  reset() { this.vYaw = 0; this.vPitch = 0; this.goalDist = 17; this.pitch = 0.12; this.yaw = 0.35; }

  update(dt) {
    this.idle += dt;
    this.yaw += this.vYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + this.vPitch, -0.25, 1.2);
    const damp = Math.exp(-dt * 6);
    this.vYaw *= damp; this.vPitch *= damp;
    if (this.autoRotate && this.idle > 3 && this.pointers.size === 0) this.yaw += dt * 0.18 * Math.min(1, (this.idle - 3) / 2);
    this.dist += (this.goalDist - this.dist) * (1 - Math.exp(-dt * 8));
    this.zoomPunch *= Math.exp(-dt * 2.5);
    this.shake *= Math.exp(-dt * 4);

    const d = this.dist * (1 - this.zoomPunch * 0.35);
    const c = this.camera;
    c.position.set(
      this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * d,
      this.target.y + Math.sin(this.pitch) * d,
      this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * d,
    );
    c.lookAt(this.target);
    if (this.shake > 0.001) {
      const s = this.shake;
      c.position.x += (Math.random() - 0.5) * s;
      c.position.y += (Math.random() - 0.5) * s;
      c.rotation.z += (Math.random() - 0.5) * s * 0.05;
    }
  }
}

export class Stage {
  constructor(canvas, { avatarColors, onBolt }) {
    this.canvas = canvas;
    this.onBolt = onBolt || (() => {});
    this.quality = 'high';

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x07051a, 0.022);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.rig = new OrbitRig(this.camera, canvas);

    this._buildEnvironment();

    this.avatar = new Avatar(avatarColors);
    scene.add(this.avatar.group);

    this.aura = null;
    this.dying = [];
    this.accent = new THREE.Color('#8b7cf6');
    this.accentTarget = this.accent.clone();

    // Post-processing
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.45, 0.6);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.bloomBase = 0.7;
    this.bloomKick = 0;

    this.clock = new THREE.Clock();
    this.time = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
    r.setAnimationLoop(() => this._frame());
  }

  _buildEnvironment() {
    const scene = this.scene;

    // Gradient sky dome tinted by the current aura
    this.skyU = { uTop: { value: new THREE.Color('#130b33') }, uBottom: { value: new THREE.Color('#030208') }, uAccent: { value: new THREE.Color('#8b7cf6') }, uTime: { value: 0 } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.skyU,
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uTop, uBottom, uAccent; uniform float uTime; varying vec3 vP;
        void main(){
          float h = vP.y * 0.5 + 0.5;
          vec3 c = mix(uBottom, uTop, smoothstep(0.35, 0.9, h));
          float band = exp(-pow((vP.y - 0.02) * 6.0, 2.0));
          c += uAccent * band * 0.18 * (0.8 + 0.2 * sin(atan(vP.z, vP.x) * 3.0 + uTime * 0.2));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    scene.add(sky);

    // Twinkling stars
    const N = 1600, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rr = 70 + Math.random() * 15;
      const s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(th) * s * rr, Math.abs(u) * rr * 0.9 + 2, Math.sin(th) * s * rr], i * 3);
      seed[i] = Math.random();
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.starU = { uTime: { value: 0 }, uPR: { value: 1 } };
    scene.add(new THREE.Points(sg, new THREE.ShaderMaterial({
      uniforms: this.starU, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSeed; uniform float uTime, uPR; varying float vA;
        void main(){ vA = 0.4 + 0.6 * (0.5 + 0.5 * sin(uTime * (1.0 + aSeed * 3.0) + aSeed * 40.0));
          gl_PointSize = (1.0 + aSeed * 2.2) * uPR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0) * smoothstep(0.5, 0.0, d) * vA, 1.0); }`,
    })));

    // Platform: dark disc with a glowing hex grid + rim, tinted by aura.
    this.floorU = { uAccent: { value: new THREE.Color('#8b7cf6') }, uTime: { value: 0 } };
    const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 96), new THREE.ShaderMaterial({
      uniforms: this.floorU, transparent: true,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uAccent; uniform float uTime; varying vec2 vP;
        float hexDist(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0,1.732))), p.x); }
        void main(){
          float r = length(vP);
          vec2 p = vP * 1.1;
          vec2 s = vec2(1.0, 1.732);
          vec2 a = mod(p, s) - s*0.5, b = mod(p - s*0.5, s) - s*0.5;
          vec2 g = dot(a,a) < dot(b,b) ? a : b;
          float edge = smoothstep(0.05, 0.0, abs(hexDist(g) - 0.48));
          float pulse = 0.5 + 0.5 * sin(r * 2.0 - uTime * 2.0);
          float fade = smoothstep(9.0, 2.0, r);
          vec3 base = vec3(0.02, 0.018, 0.04);
          vec3 c = base + uAccent * edge * fade * (0.15 + 0.35 * pulse);
          float rim = smoothstep(0.12, 0.0, abs(r - 8.6));
          c += uAccent * rim * 1.4;
          c += uAccent * smoothstep(3.0, 0.0, r) * 0.08;
          float alpha = smoothstep(9.0, 8.4, r) + rim;
          gl_FragColor = vec4(c, clamp(alpha, 0.0, 1.0));
        }`,
    }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Shadow catcher on top of the floor
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(8.4, 64), new THREE.ShadowMaterial({ opacity: 0.45 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    shadow.receiveShadow = true;
    scene.add(shadow);

    // Lights
    scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x1a1030, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(5, 12, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -6; key.shadow.camera.right = 6;
    key.shadow.camera.top = 9; key.shadow.camera.bottom = -2;
    key.shadow.bias = -0.0005;
    scene.add(key);
    this.rim = new THREE.DirectionalLight(0x8b7cf6, 2.5);
    this.rim.position.set(-6, 6, -8);
    scene.add(this.rim);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // pull the camera back on portrait screens so the avatar fits
    this.camera.fov = w < h ? 52 : 40;
    // Shift the projection so the avatar is centered in the area the HUD leaves free.
    const ins = this.insets || { right: 0, bottom: 0 };
    this.camera.setViewOffset(w, h, ins.right / 2, ins.bottom / 2, w, h);
    this.camera.updateProjectionMatrix();
    this.starU.uPR.value = this.renderer.getPixelRatio();
  }

  /** Pixels covered by UI on the right / bottom edges. */
  setInsets(right, bottom) {
    this.insets = { right, bottom };
    this.resize();
  }

  setQuality(q) {
    this.quality = q;
    const low = q === 'low';
    this.renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !low;
    this.bloom.enabled = !low;
    this.resize();
  }

  /** Equip (or preview) an aura. Pass null to clear. */
  setAura(def) {
    if (this.aura) { this.aura.fadeOut(); this.dying.push(this.aura); this.aura = null; }
    if (!def) {
      this.avatar.setGlow(null);
      this.avatar.setLevitate(false);
      this.accentTarget.set('#8b7cf6');
      return;
    }
    const fx = new AuraFx(def, { pixelRatio: this.renderer.getPixelRatio(), onBolt: s => this.onBolt(s) });
    this.avatar.group.add(fx.group);
    this.avatar.body.add(fx.attached);
    this.aura = fx;
    this.avatar.setGlow(def.colors.a, 0.025 + def.tier * 0.012);
    this.avatar.setLevitate(!!def.fx.levitate);
    this.accentTarget.set(def.colors.a);
  }

  /** Screen punch for a reveal. */
  impact(def) {
    const tier = def.tier;
    this.rig.shake = 0.08 + tier * 0.12;
    this.rig.zoomPunch = Math.min(1, 0.2 + tier * 0.15);
    this.bloomKick = 0.3 + tier * 0.25;
    this.final.uniforms.uFlash.value = Math.min(1, 0.25 + tier * 0.18);
    this.final.uniforms.uFlashColor.value.set(def.colors.a);
    this.avatar.play(tier >= 1 ? 'cheer' : 'wave');
  }

  screenshot() {
    this.composer.render();
    return this.canvas.toDataURL('image/png');
  }

  _frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    const t = this.time;

    this.accent.lerp(this.accentTarget, 1 - Math.exp(-dt * 2));
    this.skyU.uAccent.value.copy(this.accent);
    this.floorU.uAccent.value.copy(this.accent);
    this.rim.color.copy(this.accent);
    this.skyU.uTime.value = t;
    this.floorU.uTime.value = t;
    this.starU.uTime.value = t;

    this.avatar.update(t, dt);
    if (this.aura) this.aura.update(t, dt);
    this.dying = this.dying.filter(a => {
      a.update(t, dt);
      if (a.dead) { a.dispose(); return false; }
      return true;
    });

    this.bloomKick *= Math.exp(-dt * 2.5);
    this.bloom.strength = this.bloomBase + this.bloomKick;
    const f = this.final.uniforms;
    f.uFlash.value *= Math.exp(-dt * 3);
    f.uTime.value = t;

    this.rig.update(dt);
    this.composer.render(dt);
  }
}
