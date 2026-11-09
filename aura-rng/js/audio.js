// Fully synthesized sound engine (no audio files).
//
// Graph:
//   voices ──► sfxBus ──┬──────────────► master ─► compressor ─► destination
//                       ├─► reverbSend ─► convolver ─┘
//                       └─► delaySend ─► delay ⟲ feedback ─┘
//   ambient voices ─► ambBus ─► (same sends)

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  whole: [0, 2, 4, 6, 8, 10],
  penta: [0, 2, 4, 7, 9],
};

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const scaleNote = (root, scale, step) => {
  const s = SCALES[scale] || SCALES.major;
  const oct = Math.floor(step / s.length);
  return root + s[((step % s.length) + s.length) % s.length] + 12 * oct;
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterLevel = 0.7;
    this.ambientLevel = 0.45;
    this.muted = false;
    this.amb = null;
    this._noise = null;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { this.ctx = new AC(); } catch (e) { return false; }
    const c = this.ctx;

    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;
    this.comp.connect(c.destination);

    this.master = c.createGain();
    this.master.connect(this.comp);

    this.reverb = c.createConvolver();
    this.reverb.buffer = this._impulse(3.2, 2.6);
    const revOut = c.createGain(); revOut.gain.value = 0.9;
    this.reverb.connect(revOut).connect(this.master);

    this.delay = c.createDelay(1.5);
    this.delay.delayTime.value = 0.32;
    const fb = c.createGain(); fb.gain.value = 0.38;
    const dTone = c.createBiquadFilter(); dTone.type = 'lowpass'; dTone.frequency.value = 3200;
    this.delay.connect(dTone).connect(fb).connect(this.delay);
    dTone.connect(this.master);

    const makeBus = (rev, del) => {
      const bus = c.createGain();
      bus.connect(this.master);
      const r = c.createGain(); r.gain.value = rev; bus.connect(r).connect(this.reverb);
      const d = c.createGain(); d.gain.value = del; bus.connect(d).connect(this.delay);
      return bus;
    };
    this.sfx = makeBus(0.35, 0.12);
    this.ambBus = makeBus(0.6, 0.18);
    this._applyLevels();
    return true;
  }

  _applyLevels() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.masterLevel, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.ambientLevel, t, 0.1);
  }
  setMaster(v) { this.masterLevel = v; this._applyLevels(); }
  setAmbient(v) { this.ambientLevel = v; this._applyLevels(); }
  setMuted(m) { this.muted = m; this._applyLevels(); }

  // Exponentially decaying stereo noise = cheap algorithmic reverb.
  _impulse(seconds, decay) {
    const c = this.ctx, len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 80 ? i / 80 : 1);
      }
    }
    return buf;
  }

  _noiseBuf() {
    if (this._noise) return this._noise;
    const c = this.ctx, len = c.sampleRate * 2;
    const b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return (this._noise = b);
  }

  /** One enveloped oscillator voice. */
  tone(freq, t, dur, o = {}) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, t + (o.glideTime || dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = c.createGain();
    const peak = o.gain ?? 0.2, a = o.attack ?? 0.01, r = o.release ?? dur * 0.8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + r);
    let node = osc;
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = o.filterType || 'lowpass';
      f.frequency.setValueAtTime(o.filter, t);
      if (o.filterTo) f.frequency.exponentialRampToValueAtTime(o.filterTo, t + dur);
      f.Q.value = o.q ?? 0.7;
      node.connect(f); node = f;
    }
    if (o.pan && c.createStereoPanner) {
      const p = c.createStereoPanner(); p.pan.value = o.pan;
      node.connect(p); node = p;
    }
    node.connect(g).connect(o.bus || this.sfx);
    osc.start(t);
    osc.stop(t + a + r + 0.05);
    return osc;
  }

  /** Filtered noise burst / sweep. */
  noise(t, dur, o = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuf();
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, t + dur);
    f.Q.value = o.q ?? 1;
    const g = c.createGain();
    const peak = o.gain ?? 0.2, a = o.attack ?? 0.01;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(o.bus || this.sfx);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  // ---------------- UI / roll sounds ----------------
  click() {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    this.tone(1800, t, 0.05, { type: 'square', gain: 0.04, attack: 0.002, release: 0.04, filter: 3000 });
  }

  rollTick(progress) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const f = 500 + progress * 900 + Math.random() * 40;
    this.tone(f, t, 0.06, { type: 'triangle', gain: 0.07, attack: 0.002, release: 0.05 });
  }

  /** Tension build before a rare reveal. Returns its length in seconds. */
  buildUp(tier) {
    if (!this.ensure()) return 0;
    const c = this.ctx, t = c.currentTime;
    const len = 1.4 + tier * 0.35;
    this.noise(t, len, { type: 'bandpass', freq: 200, freqTo: 6000, q: 2.5, gain: 0.18, attack: len * 0.8 });
    this.tone(mtof(36), t, len, { type: 'sawtooth', gain: 0.08, attack: len * 0.7, release: 0.3, glideTo: mtof(48), filter: 200, filterTo: 2400 });
    // heartbeat thumps that accelerate
    let x = 0;
    for (let i = 0; i < 8 + tier * 2; i++) {
      x += 0.42 * Math.pow(0.86, i);
      if (x > len - 0.05) break;
      this.tone(70, t + x, 0.18, { gain: 0.5, attack: 0.004, release: 0.16, glideTo: 38, glideTime: 0.16 });
    }
    return len;
  }

  /** Reveal stinger, flavored per aura. */
  reveal(aura) {
    if (!this.ensure()) return;
    const s = aura.sound, tier = aura.tier;
    const t = this.ctx.currentTime + 0.02;
    const root = s.root;

    // Arpeggio from the aura's scale
    const steps = tier <= 0 ? [0, 4] : tier === 1 ? [0, 2, 4, 7] : [0, 2, 4, 7, 9, 11, 14];
    steps.forEach((st, i) => {
      const m = scaleNote(root + 12, s.scale, st);
      this.tone(mtof(m), t + i * 0.07, 0.6, {
        type: tier >= 2 ? 'triangle' : 'sine', gain: 0.12, attack: 0.005, release: 0.9,
        pan: (i % 2 ? 0.35 : -0.35),
      });
    });

    if (tier >= 1) {
      // Chord pad bloom
      [0, 2, 4].forEach(st => {
        const m = scaleNote(root, s.scale, st);
        for (const d of [-9, 9]) {
          this.tone(mtof(m), t, 1.6, { type: s.wave, gain: 0.05, attack: 0.08, release: 1.8, detune: d, filter: s.bright, filterTo: s.bright * 0.4 });
        }
      });
    }
    if (tier >= 2) {
      // Sub boom + air whoosh
      this.tone(110, t, 0.9, { gain: 0.55, attack: 0.005, release: 0.9, glideTo: 32, glideTime: 0.8 });
      this.noise(t, 1.2, { type: 'highpass', freq: 3000, freqTo: 600, gain: 0.12, attack: 0.01 });
    }
    if (tier >= 3) {
      // Inharmonic gong
      [1, 1.48, 2.03, 2.74, 3.6, 4.4].forEach((r, i) => {
        this.tone(mtof(root - 12) * r, t, 3.5, { type: 'sine', gain: 0.09 / (i + 1), attack: 0.003, release: 4 - i * 0.4 });
      });
    }
    if (tier >= 3 || s.choir) this._choir(t + 0.1, root, s.scale, 2.8 + tier * 0.3);
    if (tier >= 4) {
      // Sparkle cascade into the delay line
      for (let i = 0; i < 16; i++) {
        const m = scaleNote(root + 24, s.scale, Math.floor(Math.random() * 10));
        this.tone(mtof(m), t + 0.25 + i * 0.06, 0.3, { type: 'sine', gain: 0.05, attack: 0.002, release: 0.35, pan: Math.random() * 2 - 1 });
      }
    }
    if (tier >= 5) {
      // Reverse-ish swell + distorted low drone
      this.tone(mtof(root - 24), t, 4, { type: 'sawtooth', gain: 0.14, attack: 0.02, release: 4, filter: 120, filterTo: 900, q: 6 });
      this.noise(t, 3, { type: 'lowpass', freq: 400, freqTo: 80, gain: 0.25, attack: 0.02 });
    }
  }

  /** "Aah" choir: detuned saws through vowel formants. */
  _choir(t, root, scale, dur) {
    const c = this.ctx;
    const formants = [[800, 1150, 2900], [400, 1600, 2700]][Math.random() < 0.5 ? 0 : 1];
    [0, 2, 4, 7].forEach((st, i) => {
      const m = scaleNote(root, scale, st);
      const out = c.createGain();
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(0.06, t + 0.4 + i * 0.05);
      out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      out.connect(this.sfx);
      formants.forEach((fq, k) => {
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = 8;
        const g = c.createGain(); g.gain.value = [1, 0.6, 0.3][k];
        bp.connect(g).connect(out);
        for (const d of [-12, 0, 12]) {
          const o = c.createOscillator(); o.type = 'sawtooth';
          o.frequency.value = mtof(m); o.detune.value = d + (Math.random() * 6 - 3);
          // gentle vibrato
          const lfo = c.createOscillator(), lg = c.createGain();
          lfo.frequency.value = 4.5 + Math.random(); lg.gain.value = 6;
          lfo.connect(lg).connect(o.detune);
          o.connect(bp); o.start(t); o.stop(t + dur + 0.1);
          lfo.start(t); lfo.stop(t + dur + 0.1);
        }
      });
    });
  }

  /** Electric crackle for lightning bolts (called from the 3D FX). */
  zap(strength = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.25, { type: 'highpass', freq: 2500, gain: 0.08 * strength, attack: 0.002, bus: this.ambBus });
    this.tone(90, t, 0.3, { type: 'square', gain: 0.05 * strength, attack: 0.002, release: 0.25, glideTo: 40, filter: 600, bus: this.ambBus });
  }

  equip(aura) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const s = aura.sound;
    this.noise(t, 0.6, { type: 'bandpass', freq: 600, freqTo: 5000, q: 1.5, gain: 0.12, attack: 0.25 });
    [0, 4, 7].forEach((st, i) => this.tone(mtof(scaleNote(s.root + 12, s.scale, st)), t + 0.2 + i * 0.05, 0.5,
      { type: 'triangle', gain: 0.08, attack: 0.005, release: 0.7 }));
  }

  // ---------------- Ambient loop for the equipped aura ----------------
  startAmbient(aura) {
    if (!this.ensure()) return;
    this.stopAmbient();
    const c = this.ctx, s = aura.sound, t = c.currentTime;
    const nodes = [], timers = [];
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.5, t + 2.5);
    out.connect(this.ambBus);

    // Pad: root + fifth + scale third, detuned pairs through a breathing lowpass.
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = s.bright; lp.Q.value = 1.2;
    const lfo = c.createOscillator(), lfoG = c.createGain();
    lfo.frequency.value = 0.07 + aura.tier * 0.02; lfoG.gain.value = s.bright * 0.5;
    lfo.connect(lfoG).connect(lp.frequency); lfo.start();
    lp.connect(out);
    nodes.push(lfo);
    [0, 2, 4].forEach((st, i) => {
      const m = scaleNote(s.root - 12, s.scale, st);
      for (const d of [-7, 7]) {
        const o = c.createOscillator(); o.type = s.wave === 'square' ? 'triangle' : s.wave;
        o.frequency.value = mtof(m); o.detune.value = d;
        const g = c.createGain(); g.gain.value = 0.05 / (i + 1);
        o.connect(g).connect(lp); o.start(); nodes.push(o);
      }
    });

    if (s.sub) {
      const o = c.createOscillator(); o.frequency.value = mtof(s.root - 24);
      const g = c.createGain(); g.gain.value = 0.12;
      o.connect(g).connect(out); o.start(); nodes.push(o);
    }

    if (s.noise > 0) {
      // Wind: noise through a sweeping bandpass
      const src = c.createBufferSource(); src.buffer = this._noiseBuf(); src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.9;
      const wl = c.createOscillator(), wg = c.createGain();
      wl.frequency.value = 0.11; wg.gain.value = 500;
      wl.connect(wg).connect(bp.frequency); wl.start();
      const g = c.createGain(); g.gain.value = s.noise * 0.12;
      src.connect(bp).connect(g).connect(out); src.start();
      nodes.push(src, wl);
    }

    if (s.crackle) {
      const tick = () => {
        if (!this.ctx) return;
        const now = c.currentTime;
        for (let i = 0; i < 3; i++) this.noise(now + Math.random() * 0.3, 0.03, { type: 'highpass', freq: 3000 + Math.random() * 3000, gain: 0.04 + Math.random() * 0.05, attack: 0.001, bus: out });
      };
      timers.push(setInterval(tick, 260));
    }

    if (s.shimmer) {
      // Random high sparkles in the aura's scale
      const sparkle = () => {
        if (!this.ctx) return;
        const now = c.currentTime;
        const m = scaleNote(s.root + 24, s.scale, Math.floor(Math.random() * 8));
        this.tone(mtof(m), now, 0.4, { type: 'sine', gain: 0.035, attack: 0.003, release: 0.6, pan: Math.random() * 1.6 - 0.8, bus: out });
      };
      timers.push(setInterval(sparkle, 700 - aura.tier * 70));
    }

    this.amb = { out, nodes, timers };
  }

  stopAmbient() {
    if (!this.amb || !this.ctx) { this.amb = null; return; }
    const { out, nodes, timers } = this.amb;
    const t = this.ctx.currentTime;
    timers.forEach(clearInterval);
    out.gain.cancelScheduledValues(t);
    out.gain.setTargetAtTime(0.0001, t, 0.3);
    nodes.forEach(n => { try { n.stop(t + 1.5); } catch (e) {} });
    setTimeout(() => out.disconnect(), 1800);
    this.amb = null;
  }
}
