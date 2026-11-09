import * as THREE from 'three';

// Box with rounded edges: subdivide a box, then project every vertex onto a
// rounded shell (clamp to the inner box, push out by `r` along the offset).
export function roundedBox(w, h, d, r, seg = 4) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const p = new THREE.Vector3(), inner = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    inner.set(
      THREE.MathUtils.clamp(p.x, -hw, hw),
      THREE.MathUtils.clamp(p.y, -hh, hh),
      THREE.MathUtils.clamp(p.z, -hd, hd),
    );
    n.subVectors(p, inner);
    if (n.lengthSq() < 1e-10) n.fromBufferAttribute(nrm, i); else n.normalize();
    p.copy(inner).addScaledVector(n, r);
    pos.setXYZ(i, p.x, p.y, p.z);
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
  pos.needsUpdate = true;
  nrm.needsUpdate = true;
  return g;
}

// Classic smile face, drawn on a canvas.
function faceTexture() {
  const s = 256, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, s, s);
  g.fillStyle = '#111';
  for (const x of [0.36, 0.64]) {
    g.beginPath();
    g.ellipse(s * x, s * 0.4, s * 0.045, s * 0.085, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#111';
  g.lineWidth = s * 0.035;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(s * 0.5, s * 0.5, s * 0.2, Math.PI * 0.2, Math.PI * 0.8);
  g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Subtle shirt detail (seams + collar), tinted by the material color.
function shirtTexture() {
  const s = 256, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(0,0,0,.18)';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(s * 0.35, 0); g.lineTo(s * 0.5, s * 0.16); g.lineTo(s * 0.65, 0);
  g.stroke();
  g.fillStyle = 'rgba(0,0,0,.12)';
  g.fillRect(0, s * 0.9, s, s * 0.1);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * R6-style blocky avatar. Units are roughly Roblox studs:
 * legs 0..2, torso 2..4, head centered ~4.65.
 */
export class Avatar {
  constructor(colors) {
    this.group = new THREE.Group();      // world placement
    this.body = new THREE.Group();       // animated (float / bob)
    this.group.add(this.body);

    const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05, ...extra });
    this.mats = {
      head: mat(colors.head),
      arms: mat(colors.head),
      torso: mat(colors.torso, { map: shirtTexture() }),
      legs: mat(colors.legs),
    };
    this.faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(), transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 });

    const shadowed = m => { m.castShadow = true; m.receiveShadow = true; return m; };

    // Torso
    this.torso = shadowed(new THREE.Mesh(roundedBox(2, 2, 1, 0.08), this.mats.torso));
    this.torso.position.y = 3;
    this.body.add(this.torso);

    // Head (pivot at neck so it can look around)
    this.neck = new THREE.Group();
    this.neck.position.y = 4;
    this.body.add(this.neck);
    this.head = shadowed(new THREE.Mesh(roundedBox(1.25, 1.2, 1.2, 0.28, 5), this.mats.head));
    this.head.position.y = 0.65;
    this.neck.add(this.head);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.05), this.faceMat);
    face.position.set(0, 0.65, 0.601);
    this.neck.add(face);

    // Limbs pivot at the shoulder / hip.
    const limb = (m, x, y) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const mesh = shadowed(new THREE.Mesh(roundedBox(1, 2, 1, 0.08), m));
      mesh.position.y = -1;
      pivot.add(mesh);
      this.body.add(pivot);
      return pivot;
    };
    this.armL = limb(this.mats.arms, -1.5, 4);
    this.armR = limb(this.mats.arms, 1.5, 4);
    this.legL = limb(this.mats.legs, -0.5, 2);
    this.legR = limb(this.mats.legs, 0.5, 2);

    this.pose = 'idle';
    this.poseTime = 0;
    this.levitate = 0;      // current (smoothed)
    this.levitateTarget = 0;
    this.glow = new THREE.Color(0, 0, 0);
    this.glowTarget = new THREE.Color(0, 0, 0);
  }

  setColors({ head, torso, legs }) {
    this.mats.head.color.set(head);
    this.mats.arms.color.set(head);
    this.mats.torso.color.set(torso);
    this.mats.legs.color.set(legs);
  }

  setGlow(hex, amount) {
    if (!hex) this.glowTarget.setRGB(0, 0, 0);
    else this.glowTarget.set(hex).multiplyScalar(amount);
  }

  setLevitate(on) { this.levitateTarget = on ? 1 : 0; }

  /** 'cheer' plays once then returns to idle. */
  play(pose) { this.pose = pose; this.poseTime = 0; }

  update(t, dt) {
    this.poseTime += dt;
    const k = 1 - Math.exp(-dt * 3);
    this.levitate += (this.levitateTarget - this.levitate) * k;
    this.glow.lerp(this.glowTarget, k);
    for (const m of Object.values(this.mats)) m.emissive.copy(this.glow);

    // Base idle
    const breathe = Math.sin(t * 1.8);
    let armL = 0.06 * Math.sin(t * 1.1), armR = -0.06 * Math.sin(t * 1.1);
    let armLz = -0.05, armRz = 0.05;
    let legL = 0, legR = 0;
    let headY = 0.25 * Math.sin(t * 0.45), headX = 0.05 * Math.sin(t * 0.7);
    this.torso.scale.set(1 + breathe * 0.008, 1, 1 + breathe * 0.012);

    // Floating pose: limbs dangle and spread a little
    const L = this.levitate;
    armLz += -0.35 * L; armRz += 0.35 * L;
    legL += 0.15 * L * Math.sin(t * 1.3); legR += -0.15 * L * Math.sin(t * 1.3);

    if (this.pose === 'cheer') {
      const p = this.poseTime;
      const env = Math.min(1, p * 5) * (p > 1.6 ? Math.max(0, 1 - (p - 1.6) * 3) : 1);
      armL = THREE.MathUtils.lerp(armL, Math.PI * 0.95 + Math.sin(p * 12) * 0.12, env);
      armR = THREE.MathUtils.lerp(armR, Math.PI * 0.95 - Math.sin(p * 12) * 0.12, env);
      headX = THREE.MathUtils.lerp(headX, -0.25, env);
      if (p > 2) this.pose = 'idle';
    } else if (this.pose === 'wave') {
      const p = this.poseTime;
      const env = Math.min(1, p * 4) * (p > 2 ? Math.max(0, 1 - (p - 2) * 3) : 1);
      armR = THREE.MathUtils.lerp(armR, Math.PI * 0.85, env);
      armRz = THREE.MathUtils.lerp(armRz, 0.35 + Math.sin(p * 10) * 0.35, env);
      if (p > 2.4) this.pose = 'idle';
    } else if (this.pose === 'dance') {
      const p = this.poseTime, b = Math.sin(p * 7);
      armL = 0.9 * b; armR = -0.9 * b;
      armLz = -0.4 - 0.3 * Math.abs(b); armRz = 0.4 + 0.3 * Math.abs(b);
      legL = 0.35 * b; legR = -0.35 * b;
      headY = 0.3 * Math.sin(p * 3.5);
      this.body.rotation.y = 0.35 * Math.sin(p * 3.5);
    }
    if (this.pose !== 'dance') this.body.rotation.y *= 0.9;

    this.armL.rotation.set(armL, 0, armLz);
    this.armR.rotation.set(armR, 0, armRz);
    this.legL.rotation.x = legL;
    this.legR.rotation.x = legR;
    this.neck.rotation.set(headX, headY, 0);

    const dance = this.pose === 'dance' ? Math.abs(Math.sin(this.poseTime * 7)) * 0.25 : 0;
    this.body.position.y = L * (0.9 + Math.sin(t * 1.4) * 0.18) + dance;
  }

  dispose() {
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of [...Object.values(this.mats), this.faceMat]) {
      if (m.map) m.map.dispose();
      m.dispose();
    }
  }
}
