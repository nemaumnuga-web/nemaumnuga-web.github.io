'use strict';
/* =========================================================
   체스 살롱 — AI전 / 스킬 카드 / 온라인 1:1 · 2:2 / 비밀 조작실
   ========================================================= */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const params = new URLSearchParams(location.search);
const BOSS2 = params.get('boss') === '2';        // 속고 속이는 링크: 최선수 패널만 있고, 화살표가 일부러 틀린 수를 알려 줌
const BOSS = params.has('boss') && !BOSS2;
const HINTER = BOSS || BOSS2;                    // 최선수 화살표 패널을 쓸 수 있는 모드
const RIG_LINK = params.get('r') === '1';
const LOCAL_NET = params.has('local');          // 테스트용: 같은 브라우저 탭끼리 연결
const FILES = 'abcdefgh';
// 엔진: Stockfish 19 (lite, 단일 스레드) — 사이트에 직접 포함, 외부 CDN 불필요
const CDN = { sf: 'engine/stockfish-19-lite-single.js', pieces: 'https://cdn.jsdelivr.net/npm/@lichess-org/chessground@10.1.1/assets/chessground.cburnett.css' };
window.PIECES = {};
(function fallbackPieces() { const G = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  for (const c of 'wb') for (const t in G) PIECES[c + t] = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><text x="22.5" y="37" font-size="38" text-anchor="middle" fill="${c === 'w' ? '#fff' : '#111'}" stroke="${c === 'w' ? '#111' : '#fff'}" stroke-width="1">${G[t]}\uFE0E</text></svg>`); })();
const piecesReady = fetch(CDN.pieces).then(r => r.text()).then(css => {
  const code = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };
  const re = /piece\.(\w+)\.(white|black)\s*\{\s*background-image:\s*url\('([^']+)'\)/g; let m;
  while ((m = re.exec(css))) PIECES[(m[2] === 'white' ? 'w' : 'b') + code[m[1]]] = m[3];
  if (S.G) render();
  if (RV.rec) rvRender();
}).catch(() => {});
const ID_PREFIX = 'chess-salon-v1-';
// 테스트용: ?peerhost=host:port 로 자체 PeerJS 시그널링 서버 사용 (기본은 PeerJS 공개 서버)
const PEER_HOST = params.get('peerhost');
const peerOpts = () => { if (!PEER_HOST) return { debug: 0 }; const [host, port] = PEER_HOST.split(':'); return { debug: 0, host, port: +port || 9000, path: '/', secure: false }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clone = o => JSON.parse(JSON.stringify(o));
const other = c => (c === 'w' ? 'b' : 'w');
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

/* ---------------- 사운드: 리버브·컴프레서 버스 위에서 합성 ---------------- */
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const Snd = {
  ctx: null, on: store.get('snd', '1') === '1', out: null, revIn: null, nbuf: null,
  init() {
    if (!this.ctx) {
      try {
        const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = .004; comp.release.value = .2;
        comp.connect(c.destination);
        this.out = c.createGain(); this.out.gain.value = .9; this.out.connect(comp);
        const rev = c.createConvolver(); rev.buffer = this.impulse(2.6, 2.8);
        const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 6000;
        this.revIn = c.createGain(); this.revIn.gain.value = .9; this.revIn.connect(tone).connect(rev).connect(this.out);
        const len = c.sampleRate * 2; this.nbuf = c.createBuffer(1, len, c.sampleRate); const d = this.nbuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (this.ctx && Music.want && !Music.on) Music.start();
  },
  impulse(sec, decay) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 80 ? i / 80 : 1); }
    return b;
  },
  bus(wet, dest) { const c = this.ctx, g = c.createGain(); g.connect(dest || this.out); if (wet) { const s = c.createGain(); s.gain.value = wet; g.connect(s); s.connect(this.revIn); } return g; },
  env(g, t, vol, atk, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); },
  osc(type, f, t, dur, vol, o = {}) {
    const c = this.ctx, os = c.createOscillator(), g = c.createGain();
    os.type = type; os.frequency.setValueAtTime(f, t); if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + (o.slide || dur));
    if (o.detune) os.detune.value = o.detune;
    this.env(g, t, vol, o.atk || .004, dur); os.connect(g).connect(this.bus(o.wet || 0, o.dest)); os.start(t); os.stop(t + dur + .05);
  },
  noise(t, dur, vol, o = {}) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.nbuf; s.loop = true; f.type = o.type || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f || 1000, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    this.env(g, t, vol, o.atk || .002, dur); s.connect(f).connect(g).connect(this.bus(o.wet || 0, o.dest)); s.start(t, Math.random()); s.stop(t + dur + .05);
  },
  bell(f, t, vol, wet = .45) { // FM 종소리
    const c = this.ctx, car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
    car.frequency.value = f; mod.frequency.value = f * 3.5; mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * .05, t + 1.4);
    mod.connect(mg).connect(car.frequency); this.env(g, t, vol, .002, 2.2); car.connect(g).connect(this.bus(wet));
    car.start(t); mod.start(t); car.stop(t + 2.3); mod.stop(t + 2.3);
  },
  pluck(f, t, vol, dur = 1.4, wet = .4) { this.osc('triangle', f, t, dur, vol, { wet, atk: .003 }); this.osc('sine', f * 2, t, dur * .5, vol * .35, { wet, atk: .002 }); this.osc('sine', f * 3.01, t, dur * .2, vol * .12, { wet }); },
  wood(t, p = 1, v = 1) { // 나무 기물이 판에 닿는 소리
    this.noise(t, .014, .55 * v, { type: 'highpass', f: 2800 });
    this.osc('sine', 520 * p, t, .09, .32 * v, { to: 330 * p, slide: .06, wet: .06 });
    this.noise(t, .07, .45 * v, { f: 1150 * p, q: 7, wet: .08 });
    this.osc('sine', 120 * p, t, .1, .22 * v);
  },
  go(fn) { if (!this.on) return; this.init(); if (!this.ctx) return; try { fn(this.ctx.currentTime + .01); } catch (e) {} },
  move() { this.go(t => this.wood(t, 1 + (Math.random() - .5) * .08, 1)); },
  capture() { this.go(t => { this.wood(t, .86, .7); this.wood(t + .055, .72, 1.25); this.osc('sine', 85, t + .05, .18, .35); }); },
  check() { this.go(t => { this.wood(t, 1, .8); this.bell(1318.5, t + .04, .09); this.bell(1046.5, t + .2, .08); }); },
  select() { this.go(t => { this.osc('sine', 1568, t, .06, .045, { wet: .25 }); this.noise(t, .02, .06, { type: 'highpass', f: 5000 }); }); },
  card() { this.go(t => { this.noise(t, .22, .12, { f: 700, f2: 5200, q: 1.4 }); this.pluck(1318.5, t + .1, .07, .9); this.pluck(1975.5, t + .16, .04, .7); }); },
  epic() { this.go(t => { this.noise(t, .25, .12, { f: 600, f2: 6000 }); [659.3, 830.6, 987.8, 1318.5].forEach((f, i) => this.pluck(f, t + .06 + i * .07, .075, 1.3, .5)); }); },
  legend() { this.go(t => { this.noise(t, .5, .1, { f: 400, f2: 8000, atk: .3, wet: .4 }); [523.3, 659.3, 784, 987.8, 1174.7, 1568, 1975.5].forEach((f, i) => this.pluck(f, t + .05 + i * .065, .075, 1.8, .55)); this.bell(2093, t + .55, .07, .7); this.osc('sine', 65.4, t, 1.6, .28); }); },
  dud() { this.go(t => { this.wood(t, 1.7, .5); this.osc('sine', 520, t + .06, .32, .08, { to: 300, wet: .15 }); this.osc('sine', 300, t + .38, .55, .08, { to: 190, wet: .2 }); }); },
  fx() { this.go(t => { this.noise(t, 1.1, .25, { type: 'lowpass', f: 180, f2: 4200, atk: 1, wet: .3 }); this.osc('sine', 95, t + 1.05, 1.8, .6, { to: 38, slide: 1.2 }); this.noise(t + 1.05, .5, .4, { type: 'lowpass', f: 900, f2: 120 }); [110, 164.8, 220, 277.2, 329.6, 440].forEach((f, i) => { this.osc('sawtooth', f, t + 1.05, 3, .025, { wet: .7, atk: .05, detune: (i % 2 ? 7 : -7) }); }); this.bell(1760, t + 1.1, .06, .8); }); },
  morph() { this.go(t => { for (let i = 0; i < 9; i++) this.osc('sine', 1800 + Math.random() * 2400, t + i * .035, .25, .035, { wet: .7 }); this.osc('sine', 880, t, .5, .05, { to: 220, wet: .5 }); }); },
  win() { this.go(t => { [[523.3, 659.3, 784], [587.3, 740, 880], [659.3, 830.6, 987.8], [784, 987.8, 1174.7, 1568]].forEach((ch, i) => ch.forEach((f, j) => this.pluck(f, t + i * .22 + j * .025, .06, i === 3 ? 2.4 : 1, .5))); this.bell(2093, t + .7, .06, .7); }); },
  lose() { this.go(t => { [[440, 523.3], [392, 466.2], [349.2, 440], [329.6, 392]].forEach((ch, i) => ch.forEach(f => this.pluck(f, t + i * .32, .055, 1.6, .55))); }); },
  pop() { this.go(t => this.osc('sine', 480, t, .1, .07, { to: 1150, wet: .2 })); },
  join() { this.go(t => { this.bell(880, t, .06); this.bell(1318.5, t + .14, .06); }); },
  turn() { this.go(t => this.bell(1568, t + .25, .035, .5)); }
};

/* ---------------- 배경음악: 느린 라운지 재즈 (생성형) ---------------- */
const Music = {
  want: store.get('bgm', '0') === '1', on: false, g: null, timer: null, next: 0, beat: 0, chord: 0, B: .72,
  // [베이스, 보이싱] — Dm9 · G13 · Cmaj9 · A7(b9)
  prog: [[38, [53, 57, 60, 64]], [43, [53, 59, 64, 69]], [36, [52, 55, 59, 62]], [45, [55, 61, 65, 70]]],
  mel: [74, 76, 77, 79, 81, 84, 86],
  start() {
    const c = Snd.ctx; if (!c || this.on) return; this.on = true;
    this.g = c.createGain(); this.g.gain.setValueAtTime(0.0001, c.currentTime); this.g.gain.linearRampToValueAtTime(.55, c.currentTime + 2.5);
    this.g.connect(Snd.out); const s = c.createGain(); s.gain.value = .5; this.g.connect(s); s.connect(Snd.revIn);
    this.next = c.currentTime + .15; this.beat = 0;
    this.timer = setInterval(() => this.tick(), 150);
  },
  stop() {
    if (!this.on) return; this.on = false; clearInterval(this.timer);
    const c = Snd.ctx, g = this.g; g.gain.cancelScheduledValues(c.currentTime); g.gain.setValueAtTime(g.gain.value, c.currentTime); g.gain.linearRampToValueAtTime(0.0001, c.currentTime + 1.2);
    setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 1500);
  },
  rhodes(m, t, dur, vol) { // FM 일렉트릭 피아노
    const c = Snd.ctx, f = mtof(m), car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain(), trem = c.createOscillator(), tg = c.createGain();
    car.frequency.value = f; mod.frequency.value = f; mg.gain.setValueAtTime(f * 1.1, t); mg.gain.exponentialRampToValueAtTime(f * .08, t + .9);
    trem.frequency.value = 4.2; tg.gain.value = vol * .18; trem.connect(tg).connect(g.gain);
    mod.connect(mg).connect(car.frequency); Snd.env(g, t, vol, .008, dur); car.connect(g).connect(this.g);
    [car, mod, trem].forEach(o => { o.start(t); o.stop(t + dur + .1); });
  },
  tick() {
    const c = Snd.ctx; if (!c) return;
    while (this.next < c.currentTime + .5) {
      const t = this.next, b = this.beat % 8, [bass, voi] = this.prog[this.chord % 4];
      if (b === 0) { voi.forEach((m, i) => this.rhodes(m, t + i * .025, 5.2, .028)); Snd.osc('sine', mtof(bass), t, 2.4, .09, { dest: this.g }); }
      if (b === 4) Snd.osc('sine', mtof(bass + 7), t, 1.6, .06, { dest: this.g });
      if (b === 6 && Math.random() < .5) Snd.osc('sine', mtof(bass + 5), t, 1, .05, { dest: this.g });
      if (b % 2 === 1) Snd.noise(t, .09, .012, { type: 'highpass', f: 6500, dest: this.g });
      if (b !== 0 && Math.random() < .32) { const m = this.mel[Math.floor(Math.random() * this.mel.length)]; this.rhodes(m, t + (Math.random() < .5 ? 0 : this.B / 2), 1.8, .022); }
      this.beat++; if (this.beat % 8 === 0) this.chord++;
      this.next += this.B;
    }
  }
};
function syncSoundButtons() {
  $$('.sfxToggle').forEach(b => b.classList.toggle('off', !Snd.on));
  $$('.bgmToggle').forEach(b => b.classList.toggle('off', !Music.want));
}

/* ---------------- 카드 정의 ---------------- */
const CARDS = {
  queen:  { n: '여왕 즉위', i: '♛', d: '내 폰 하나를 퀸으로', r: 'legend', t: 'ownPawn' },
  smite:  { n: '유성 낙하', i: '☄', d: '상대 폰 하나를 소멸', r: 'legend', t: 'enemyPawn' },
  double: { n: '질풍', i: '⚡', d: '이번 턴 두 번 이동', r: 'epic', t: null },
  demote: { n: '강등', i: '⬇', d: '상대 기물 한 단계 하락', r: 'epic', t: 'enemyDemote' },
  freeze: { n: '빙결', i: '❄', d: '상대 기물 하나를 한 턴 동결', r: 'rare', t: 'enemyPiece' },
  swap:   { n: '자리바꿈', i: '⇄', d: '내 기물 둘의 자리 교환', r: 'rare', t: 'ownSwap' },
  knight: { n: '기사 서임', i: '♞', d: '내 폰 하나를 나이트로', r: 'common', t: 'ownPawn' },
  revive: { n: '부활', i: '✚', d: '잃은 폰을 시작 줄에 소환', r: 'common', t: 'reviveSq' },
  shield: { n: '방패', i: '⛨', d: '내 기물 하나 한 턴 보호', r: 'common', t: 'ownPiece' },
  water:  { n: '물 한 잔', i: '🥤', d: '목을 축였습니다. 끝.', r: 'dud', t: null },
  cough:  { n: '헛기침', i: '💨', d: '에헴. 아무 일도 없음', r: 'dud', t: null },
  nap:    { n: '낮잠', i: '💤', d: '잠깐 졸았습니다', r: 'dud', t: null }
};
const RAR_KO = { legend: '전설', epic: '영웅', rare: '희귀', common: '일반', dud: '꽝' };
const BY_RAR = {}; Object.entries(CARDS).forEach(([k, c]) => (BY_RAR[c.r] = BY_RAR[c.r] || []).push(k));
const DUD_TEXT = ['목을 축였습니다', '에헴…', '…쿨쿨', '아무 일도 없었다', '카드가 민망해합니다'];

/* ---------------- 조작(비밀) 설정 ---------------- */
const Rig = {
  R: { hint: false, bias: BOSS || RIG_LINK, dudFriend: false, legendMe: false, dumbAi: false },
  bossColors: new Set(),
  role(c) { if (!this.bossColors.size) return 'fair'; return this.bossColors.has(c) ? 'boss' : 'victim'; }
};
function drawHand(color) {
  const role = Rig.role(color), R = Rig.R;
  if (role === 'victim' && R.dudFriend) return shuffle(['water', 'cough', 'nap']);
  let w = { legend: 4, epic: 13, rare: 26, common: 33, dud: 15 };
  if (role === 'boss' && R.bias) w = { legend: 16, epic: 30, rare: 30, common: 24, dud: 0 };
  if (role === 'victim' && R.bias) w = { legend: 1, epic: 6, rare: 18, common: 35, dud: 40 };
  const hand = [];
  if (role === 'boss' && R.legendMe) hand.push('queen', 'smite', 'double');
  let guard = 0;
  while (hand.length < 3 && guard++ < 300) {
    const tot = Object.values(w).reduce((a, b) => a + b, 0); let x = Math.random() * tot, rar = 'common';
    for (const [k, v] of Object.entries(w)) { if ((x -= v) < 0) { rar = k; break; } }
    const pool = BY_RAR[rar].filter(k => !hand.includes(k)); if (!pool.length) continue;
    hand.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return shuffle(hand);
}

/* ---------------- 체스 규칙 계층 ---------------- */
function newGame(skills, two, fen) {
  const G = { fen: fen || new Chess().fen(), log: [], hist: [], last: null, frozen: [], shields: [], hands: { w: [], b: [] },
    cardUsed: false, extra: false, wc: 0, bc: 0, over: null, skills: !!skills, two: !!two, evSeq: 0, ev: null, reps: {} };
  dealFor(G, 'w'); return G;
}
function dealFor(G, c) { G.hands[c] = G.skills ? drawHand(c) : []; }
const turnOf = G => G.fen.split(' ')[1];
function seatForTurn(G) { const c = turnOf(G); if (!G.two) return c === 'w' ? 0 : 1; return c === 'w' ? (G.wc % 2 ? 2 : 0) : (G.bc % 2 ? 3 : 1); }
function pcs(ch) { const out = []; ch.board().forEach((row, i) => row.forEach((p, j) => { if (p) out.push({ type: p.type, color: p.color, square: FILES[j] + (8 - i) }); })); return out; }
const toUci = m => m.from + m.to + (m.promotion || '');

function legal(G) {
  const ch = new Chess(G.fen), t = ch.turn(), all = ch.moves({ verbose: true });
  const fz = new Set(G.frozen.filter(x => x.color === t).map(x => x.sq));
  const sh = new Set(G.shields.filter(x => x.color !== t).map(x => x.sq));
  const f = all.filter(m => !fz.has(m.from) && !(m.captured && sh.has(m.to)));
  return f.length ? f : all;
}
function rebuildFen(ch, turn) {
  const p = ch.fen().split(' '), old = p[2];
  const has = (sq, t, c) => { const x = ch.get(sq); return x && x.type === t && x.color === c; };
  let c = '';
  if (has('e1', 'k', 'w')) { if (old.includes('K') && has('h1', 'r', 'w')) c += 'K'; if (old.includes('Q') && has('a1', 'r', 'w')) c += 'Q'; }
  if (has('e8', 'k', 'b')) { if (old.includes('k') && has('h8', 'r', 'b')) c += 'k'; if (old.includes('q') && has('a8', 'r', 'b')) c += 'q'; }
  p[1] = turn; p[2] = c || '-'; p[3] = '-';
  return p.join(' ');
}
function validPos(fen) {
  const p = fen.split(' '), rows = p[0].split('/');
  if (/[pP]/.test(rows[0]) || /[pP]/.test(rows[7])) return false;
  if ((p[0].match(/K/g) || []).length !== 1 || (p[0].match(/k/g) || []).length !== 1) return false;
  const t = new Chess(); if (!t.load(fen)) return false;
  const q = p.slice(); q[1] = other(p[1]); q[3] = '-';
  const t2 = new Chess(); if (!t2.load(q.join(' '))) return false;
  return !t2.in_check();
}
function outcome(G) {
  const ch = new Chess(G.fen), L = legal(G);
  if (!L.length) return ch.in_check() ? { type: 'mate', winner: other(ch.turn()) } : { type: 'draw', why: '스테일메이트' };
  if (ch.insufficient_material()) return { type: 'draw', why: '기물 부족' };
  if (ch.in_draw()) return { type: 'draw', why: '50수 규칙' };
  const key = G.fen.split(' ').slice(0, 2).join(' ');
  if ((G.reps[key] || 0) >= 3) return { type: 'draw', why: '3회 동형 반복' };
  return null;
}
function applyMove(G, mv) {
  const L = legal(G);
  const m = L.find(x => x.from === mv.from && x.to === mv.to && (!x.promotion || x.promotion === (mv.promotion || 'q')));
  if (!m) return null;
  const fenBefore = G.fen;
  const ch = new Chess(G.fen); const r = ch.move({ from: m.from, to: m.to, promotion: m.promotion });
  if (!r) return null;
  const mover = r.color;
  if (!G.log) G.log = [];
  G.log.push({ f: fenBefore, u: r.from + r.to + (r.promotion || ''), s: r.san, c: mover });
  G.shields.forEach(s => { if (s.color === mover && s.sq === r.from) s.sq = r.to; });
  G.fen = ch.fen(); G.hist.push({ t: 'm', s: r.san, c: mover }); G.last = { from: r.from, to: r.to };
  let extra = false;
  if (G.extra) {
    G.extra = false;
    if (!ch.in_check() && !ch.game_over()) { const p = G.fen.split(' '); p[1] = mover; p[3] = '-'; const nf = p.join(' '); if (validPos(nf)) { G.fen = nf; extra = true; } }
  }
  if (!extra) {
    G.shields = G.shields.filter(s => s.color === mover);
    G.frozen = G.frozen.filter(f => f.color !== mover);
    if (mover === 'w') G.wc++; else G.bc++;
    G.cardUsed = false; G.hands[mover] = [];
  }
  const key = G.fen.split(' ').slice(0, 2).join(' '); G.reps[key] = (G.reps[key] || 0) + 1;
  G.over = outcome(G);
  if (!G.over && !extra) dealFor(G, turnOf(G));
  return { san: r.san, captured: !!r.captured, check: ch.in_check(), color: mover, extra, from: r.from, to: r.to };
}
function cardTryApply(G, idx, targets) {
  const ch = new Chess(G.fen), me = ch.turn(), op = other(me);
  if (!G.skills || G.cardUsed || G.over) return { ok: false, msg: '지금은 카드를 쓸 수 없어요' };
  const id = G.hands[me][idx]; if (!id) return { ok: false, msg: '카드가 없어요' };
  const P = sq => (sq ? ch.get(sq) : null), T = targets || [];
  const fail = msg => ({ ok: false, msg: msg || '거기는 안 돼요' });
  const addF = [], addS = []; let extra = false;
  const rank = sq => +sq[1];
  switch (id) {
    case 'queen': case 'knight': { const p = P(T[0]); if (!p || p.color !== me || p.type !== 'p') return fail(); ch.remove(T[0]); ch.put({ type: id === 'queen' ? 'q' : 'n', color: me }, T[0]); break; }
    case 'smite': { const p = P(T[0]); if (!p || p.color !== op || p.type !== 'p') return fail(); ch.remove(T[0]); break; }
    case 'demote': { const p = P(T[0]); const down = { q: 'r', r: 'b', b: 'n', n: 'p' };
      if (!p || p.color !== op || !down[p.type]) return fail(); const nt = down[p.type];
      if (nt === 'p' && (rank(T[0]) === 1 || rank(T[0]) === 8)) return fail('끝 줄 나이트는 강등 불가');
      ch.remove(T[0]); ch.put({ type: nt, color: op }, T[0]); break; }
    case 'freeze': { const p = P(T[0]); if (!p || p.color !== op || p.type === 'k') return fail(); addF.push({ sq: T[0], color: op }); break; }
    case 'shield': { const p = P(T[0]); if (!p || p.color !== me || p.type === 'k') return fail(); addS.push({ sq: T[0], color: me }); break; }
    case 'swap': { const a = P(T[0]), b = P(T[1]);
      if (!a || !b || T[0] === T[1] || a.color !== me || b.color !== me || a.type === 'k' || b.type === 'k') return fail();
      if (a.type === b.type) return fail('같은 종류끼리는 의미가 없어요');
      ch.remove(T[0]); ch.remove(T[1]); ch.put(b, T[0]); ch.put(a, T[1]); break; }
    case 'revive': { const s = T[0], home = me === 'w' ? 2 : 7;
      if (!s || rank(s) !== home || P(s)) return fail();
      const cnt = pcs(ch).filter(x => x && x.type === 'p' && x.color === me).length; if (cnt >= 8) return fail('잃은 폰이 없어요');
      ch.put({ type: 'p', color: me }, s); break; }
    case 'double': extra = true; break;
    default: break; // 꽝
  }
  const nf = rebuildFen(ch, me);
  if (nf.split(' ')[0] !== G.fen.split(' ')[0] && !validPos(nf)) return fail('그러면 상대 킹이 바로 체크돼서 안 돼요');
  return { ok: true, id, fen: nf, addF, addS, extra, me };
}
function applyCard(G, idx, targets) {
  const r = cardTryApply(G, idx, targets); if (!r.ok) return r;
  if (r.fen.split(' ')[0] !== G.fen.split(' ')[0]) G.fen = r.fen;
  G.frozen.push(...r.addF); G.shields.push(...r.addS); if (r.extra) G.extra = true;
  G.cardUsed = true; G.hands[r.me] = [];
  G.hist.push({ t: 'c', s: CARDS[r.id].i + ' ' + CARDS[r.id].n, c: r.me });
  G.over = outcome(G);
  return r;
}
function cardTargets(G, idx, picks) {
  const ch = new Chess(G.fen), me = ch.turn(), id = G.hands[me][idx], c = CARDS[id], out = [];
  if (!c || !c.t) return out;
  for (let f = 0; f < 8; f++) for (let r = 1; r <= 8; r++) {
    const sq = FILES[f] + r;
    if (c.t === 'ownSwap') {
      if (!picks.length) { const p = ch.get(sq); if (p && p.color === me && p.type !== 'k') out.push(sq); }
      else if (sq !== picks[0] && cardTryApply(G, idx, [picks[0], sq]).ok) out.push(sq);
    } else if (cardTryApply(G, idx, [sq]).ok) out.push(sq);
  }
  if (c.t === 'ownSwap' && !picks.length) return out.filter(a => out.some(b => b !== a && cardTryApply(G, idx, [a, b]).ok));
  return out;
}
function cardUsable(G, idx) { const id = G.hands[turnOf(G)][idx]; const c = CARDS[id]; if (!c) return false; return !c.t || cardTargets(G, idx, []).length > 0; }

/* 비밀 기물 변환 (권한자에서 실행) */
function bossMorph(G, sq, to) {
  const ch = new Chess(G.fen), p = ch.get(sq);
  if (!p || p.type === 'k') return false;
  let t = to; if (t === 'p' && (sq[1] === '1' || sq[1] === '8')) t = 'n';
  if (p.type === t) return false;
  ch.remove(sq); ch.put({ type: t, color: p.color }, sq);
  const nf = rebuildFen(ch, turnOf(G)); if (!validPos(nf)) return false;
  G.fen = nf; G.over = outcome(G); return true;
}

/* ---------------- Stockfish ---------------- */
const Engine = {
  w: null, ready: null, chain: Promise.resolve(), on: null, failed: false, hashMB: 64,
  init() {
    if (this.ready) return this.ready;
    this.ready = new Promise((res, rej) => {
      try { this.w = new Worker(CDN.sf); } catch (e) { this.failed = true; rej(e); return; }
      const to = setTimeout(() => { this.failed = true; rej('timeout'); }, 20000);
      this.w.onmessage = e => { const l = String(e.data); if (l.indexOf('uciok') === 0) { clearTimeout(to); this.w.postMessage('setoption name Hash value 64'); res(); } if (this.on) this.on(l); };
      this.w.onerror = err => { clearTimeout(to); this.failed = true; rej(err); };
      this.w.postMessage('uci');
    });
    this.ready.catch(() => {});
    return this.ready;
  },
  best(fen, o) {
    const run = () => this.init().then(() => new Promise(res => {
      const to = setTimeout(() => { this.on = null; this.w.postMessage('stop'); res(null); }, o.movetime + 5000);
      this.on = l => { if (l.indexOf('bestmove') === 0) { clearTimeout(to); this.on = null; const b = l.split(' ')[1]; res(b && b !== '(none)' ? b : null); } };
      this.w.postMessage('setoption name MultiPV value 1');
      this.w.postMessage('setoption name Skill Level value ' + o.skill);
      this.w.postMessage('position fen ' + fen);
      this.w.postMessage('go ' + (o.depth ? 'depth ' + o.depth : 'movetime ' + o.movetime) + (o.searchmoves ? ' searchmoves ' + o.searchmoves.join(' ') : ''));
    }));
    const p = this.chain.then(run, run); this.chain = p.catch(() => null); return p;
  },
  // 후보 수 여러 개 (MultiPV) → { best: uci, lines: [{uci, cp}] } (cp: 백 기준 평가, 흑 기준 아님)
  pick(fen, o) {
    const run = () => this.init().then(() => new Promise(res => {
      const lines = {};
      const to = setTimeout(() => { this.on = null; this.w.postMessage('stop'); res(null); }, o.movetime + 5000);
      this.on = l => {
        if (l.indexOf('info ') === 0 && l.indexOf(' pv ') > 0 && l.indexOf('bound') < 0) {
          const k = +((/multipv (\d+)/.exec(l) || [0, 1])[1]), sc = /score (cp|mate) (-?\d+)/.exec(l), pv = /\spv (.+)$/.exec(l);
          if (sc && pv) lines[k] = { uci: pv[1].trim().split(' ')[0], pv: pv[1].trim().split(' '), cp: sc[1] === 'cp' ? +sc[2] : (+sc[2] > 0 ? 10000 : -10000) - +sc[2] * 10 };
        } else if (l.indexOf('bestmove') === 0) {
          clearTimeout(to); this.on = null;
          const arr = Object.keys(lines).sort((a, b) => a - b).map(x => lines[x]);
          res(arr.length ? { best: arr[0].uci, lines: arr } : null);
        }
      };
      this.w.postMessage('setoption name MultiPV value ' + (o.n || 1));
      this.w.postMessage('setoption name Skill Level value ' + o.skill);
      this.w.postMessage('position fen ' + fen);
      this.w.postMessage('go movetime ' + o.movetime + (o.searchmoves ? ' searchmoves ' + o.searchmoves.join(' ') : ''));
    }));
    const p = this.chain.then(run, run); this.chain = p.catch(() => null); return p;
  },
  // 실시간 심층 분석: 깊이가 늘 때마다 o.onUpdate({uci, cp, depth}) 호출. o.maxMs 후 또는 stopAnalysis()로 종료
  analyze(fen, o) {
    const run = () => this.init().then(() => new Promise(res => {
      if (o.alive && !o.alive()) { res(); return; }
      let done = false, to = null;
      const finish = () => { if (done) return; done = true; clearTimeout(to); this.on = null; this.cur = null; res(); };
      to = setTimeout(() => this.w.postMessage('stop'), o.maxMs);
      this.cur = { stop: () => this.w.postMessage('stop') };
      this.on = l => {
        if (l.indexOf('info ') === 0 && l.indexOf(' pv ') > 0 && l.indexOf('bound') < 0) {
          const mp = /multipv (\d+)/.exec(l); if (mp && mp[1] !== '1') return;
          const d = /depth (\d+)/.exec(l), sc = /score (cp|mate) (-?\d+)/.exec(l), pv = /\spv (\S+)/.exec(l);
          if (!(d && sc && pv)) return;
          if (o.alive && !o.alive()) { this.w.postMessage('stop'); return; }
          o.onUpdate({ uci: pv[1], depth: +d[1], cp: sc[1] === 'cp' ? +sc[2] : (+sc[2] > 0 ? 10000 : -10000) - +sc[2] * 10 });
        } else if (l.indexOf('bestmove') === 0) finish();
      };
      this.w.postMessage('setoption name MultiPV value 1');
      this.w.postMessage('setoption name Skill Level value 20');
      if (o.hash && o.hash !== this.hashMB) { this.hashMB = o.hash; this.w.postMessage('setoption name Hash value ' + o.hash); }
      this.w.postMessage('position fen ' + fen);
      this.w.postMessage('go infinite' + (o.searchmoves ? ' searchmoves ' + o.searchmoves.join(' ') : ''));
    }));
    const p = this.chain.then(run, run); this.chain = p.catch(() => null); return p;
  },
  stopAnalysis() { if (this.cur) { try { this.cur.stop(); } catch (e) {} } }
};
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function fallbackMove(G) { // 엔진 실패 시: 1수 탐욕 + 랜덤
  const L = legal(G); let best = null, bs = -1e9;
  for (const m of L) { let s = Math.random() * .8 + (m.captured ? VAL[m.captured] * 2 : 0) + (m.promotion ? 8 : 0); if (s > bs) { bs = s; best = m; } }
  return best;
}

/* ---------------- 네트워크 (PeerJS / 로컬 테스트) ---------------- */
const Net = {
  peer: null, conns: new Map(), toHost: null, myId: null, bc: null,
  host(code, onOpen, onErr) {
    if (LOCAL_NET) {
      this.myId = 'host'; this.bc = new BroadcastChannel('cs-' + code);
      this.bc.onmessage = e => { const d = e.data; if (d.to !== 'host') return;
        let c = this.conns.get(d.from);
        if (!c) { c = { id: d.from, send: x => this.bc.postMessage({ from: 'host', to: d.from, x }) }; this.conns.set(d.from, c); }
        if (d.x === '__bye') { this.conns.delete(d.from); App.onGuestLeave(d.from); return; }
        App.onHostMsg(c, d.x); };
      setTimeout(onOpen, 50); return;
    }
    this.peer = new Peer(ID_PREFIX + code, peerOpts());
    this.peer.on('open', () => { this.myId = 'host'; onOpen(); });
    this.peer.on('error', e => onErr(e && e.type));
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) {} });
    this.peer.on('connection', conn => {
      conn.on('open', () => { const c = { id: conn.peer, send: x => { try { conn.send(x); } catch (e) {} } }; this.conns.set(conn.peer, c); conn.on('data', x => App.onHostMsg(c, x)); });
      conn.on('close', () => { this.conns.delete(conn.peer); App.onGuestLeave(conn.peer); });
    });
  },
  join(code, onOpen, onErr) {
    if (LOCAL_NET) {
      this.myId = 'g' + Math.random().toString(36).slice(2, 8); this.bc = new BroadcastChannel('cs-' + code);
      this.bc.onmessage = e => { const d = e.data; if (d.to === this.myId) App.onGuestMsg(d.x); };
      this.toHost = { send: x => this.bc.postMessage({ from: this.myId, to: 'host', x }) };
      addEventListener('beforeunload', () => this.toHost.send('__bye'));
      setTimeout(onOpen, 50); return;
    }
    this.peer = new Peer(peerOpts());
    this.peer.on('error', e => onErr(e && e.type));
    this.peer.on('open', id => {
      this.myId = id;
      const conn = this.peer.connect(ID_PREFIX + code, { reliable: true });
      const t = setTimeout(() => onErr('peer-unavailable'), 12000);
      conn.on('open', () => { clearTimeout(t); this.toHost = { send: x => { try { conn.send(x); } catch (e) {} } }; onOpen(); });
      conn.on('data', x => App.onGuestMsg(x));
      conn.on('close', () => App.onHostLost());
    });
  },
  broadcast(fn) { this.conns.forEach(c => c.send(typeof fn === 'function' ? fn(c) : fn)); },
  close() { try { if (this.toHost && LOCAL_NET) this.toHost.send('__bye'); } catch (e) {} try { this.peer && this.peer.destroy(); } catch (e) {} try { this.bc && this.bc.close(); } catch (e) {} this.peer = null; this.bc = null; this.conns.clear(); this.toHost = null; }
};

/* ---------------- 앱 상태 ---------------- */
// 15단계: 스톡피시 Skill Level(0~20)과 생각 시간을 함께 올림
const LV = [
  { n: '새싹', s: 0, t: 100 }, { n: '풋내기', s: 1, t: 130 }, { n: '견습', s: 3, t: 170 }, { n: '초보', s: 5, t: 210 },
  { n: '아마추어', s: 7, t: 260 }, { n: '실력자', s: 9, t: 320 }, { n: '클럽', s: 11, t: 400 }, { n: '고수', s: 12, t: 480 },
  { n: '전문가', s: 14, t: 580 }, { n: '마스터', s: 15, t: 700 }, { n: '국제 마스터', s: 16, t: 820 }, { n: '그랜드마스터', s: 18, t: 950 },
  { n: '슈퍼컴퓨터', s: 19, t: 1100 }, { n: '체스신', s: 20, t: 1300 }, { n: '심연', s: 20, t: 1700 }
];
const S = {
  mode: null, G: null, myColor: 'w', aiColor: 'b', level: 4, flip: false,
  online: false, isHost: false, mySeat: -1, seats: [], code: '', two: false, skillsOpt: false,
  sel: null, cardPick: null, morphArm: null, aiBusy: false, lastSeq: -1, undo: [], hintArrow: null, hintKey: '', renderedHist: 0
};
const nick = () => ($('#nick').value.trim() || '플레이어').slice(0, 10);

/* ---------------- 화면 전환 / 토스트 ---------------- */
function show(id) { $$('.screen').forEach(s => s.classList.toggle('active', s.id === id)); window.scrollTo(0, 0); }
function toast(msg, ms) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; if (ms) t.style.animationDuration = ms + 'ms'; $('#toasts').appendChild(t); setTimeout(() => t.remove(), ms || 2700); }
function announceCard(id, who) {
  const c = CARDS[id]; const el = document.createElement('div'); el.className = 'ann ' + c.r;
  el.innerHTML = `<span class="ai">${c.i}</span><b>${c.n}</b><small>${who} · ${RAR_KO[c.r]}${c.r === 'dud' ? ' — ' + DUD_TEXT[Math.floor(Math.random() * DUD_TEXT.length)] : ''}</small>`;
  $('#announce').innerHTML = ''; $('#announce').appendChild(el); setTimeout(() => el.remove(), 1800);
  if (c.r === 'legend') { Snd.legend(); shake(); } else if (c.r === 'epic') Snd.epic(); else if (c.r === 'dud') Snd.dud(); else Snd.card();
}
function mega(text) {
  const el = document.createElement('div'); el.className = 'mega'; el.innerHTML = '<b></b>'; el.querySelector('b').textContent = text;
  document.body.appendChild(el); Snd.fx(); shake(); if (navigator.vibrate) navigator.vibrate([60, 40, 120]); setTimeout(() => el.remove(), 3500);
}
function shake() { document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 600); }
function bubble(text, name) {
  const b = document.createElement('div'); const isEmo = [...text].length <= 2 || text === 'GG';
  b.className = 'bubble' + (isEmo ? '' : ' txt'); b.textContent = text;
  if (name) { const s = document.createElement('small'); s.textContent = name; b.appendChild(s); }
  b.style.left = (12 + Math.random() * 60) + 'vw'; b.style.top = (25 + Math.random() * 35) + 'vh';
  $('#bubbles').appendChild(b); setTimeout(() => b.remove(), 2300); Snd.pop();
}
function chatLine(name, text, sys) {
  const p = document.createElement('p');
  if (sys) { p.className = 'sys'; p.textContent = text; } else { const b = document.createElement('b'); b.textContent = name; p.append(b, document.createTextNode(text)); }
  $('#chatlog').appendChild(p); $('#chatlog').scrollTop = 1e9;
}

/* ---------------- 보드 렌더링 ---------------- */
function sqXY(sq) { const f = FILES.indexOf(sq[0]), r = +sq[1] - 1; return S.flip ? { x: 7 - f, y: r } : { x: f, y: 7 - r }; }
function buildSquares() {
  const box = $('#squares'); box.innerHTML = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const f = S.flip ? 7 - x : x, r = S.flip ? y : 7 - y, sq = FILES[f] + (r + 1);
    const d = document.createElement('div'); d.className = 'sq ' + ((f + r) % 2 ? 'l' : 'd'); d.dataset.sq = sq;
    if (y === 7) d.insertAdjacentHTML('beforeend', `<span class="co f">${FILES[f]}</span>`);
    if (x === 0) d.insertAdjacentHTML('beforeend', `<span class="co r">${r + 1}</span>`);
    box.appendChild(d);
  }
}
function viewColor() { if (!S.online) return S.myColor; const s = S.seats[S.mySeat]; return s ? (S.mySeat % 2 ? 'b' : 'w') : 'w'; }
function isMyTurn() {
  const G = S.G; if (!G || G.over) return false;
  if (!S.online) return turnOf(G) === S.myColor;   // AI가 둘 차례면 어차피 내 차례가 아님 (aiBusy가 꼬여도 내가 잠기지 않게)
  return seatForTurn(G) === S.mySeat;
}
function renderBoard(animate) {
  const G = S.G; if (!G) return; const ch = new Chess(G.fen);
  const sqEls = {}; $$('#squares .sq').forEach(e => { sqEls[e.dataset.sq] = e; e.classList.remove('last', 'sel', 'dot', 'cap', 'tgt', 'pick', 'chk'); });
  if (G.last) { sqEls[G.last.from] && sqEls[G.last.from].classList.add('last'); sqEls[G.last.to] && sqEls[G.last.to].classList.add('last'); }
  if (ch.in_check()) { const t = ch.turn(); pcs(ch).forEach(p => { if (p && p.type === 'k' && p.color === t) sqEls[p.square] && sqEls[p.square].classList.add('chk'); }); }
  // 일반 선택
  if (S.sel && !S.cardPick && !S.morphArm) {
    sqEls[S.sel] && sqEls[S.sel].classList.add('sel');
    legal(G).filter(m => m.from === S.sel).forEach(m => sqEls[m.to] && sqEls[m.to].classList.add(m.captured ? 'cap' : 'dot'));
  }
  // 카드 대상
  if (S.cardPick) {
    S.cardPick.picks.forEach(p => sqEls[p] && sqEls[p].classList.add('tgt', 'pick'));
    cardTargets(G, S.cardPick.idx, S.cardPick.picks).forEach(sq => sqEls[sq] && sqEls[sq].classList.add('tgt'));
  }
  // 비밀 변환 대상
  if (S.morphArm) {
    const mc = bossColor();
    pcs(ch).forEach(p => { if (!p || p.type === 'k') return; const mine = mc.has(p.color); if ((S.morphArm === 'p' && !mine && p.type !== 'p') || (S.morphArm === 'q' && mine && p.type !== 'q')) sqEls[p.square] && sqEls[p.square].classList.add('tgt'); });
  }
  // 기물
  const layer = $('#pieces'); layer.innerHTML = '';
  const fz = new Set(G.frozen.map(f => f.sq)), sh = new Set(G.shields.map(s => s.sq));
  pcs(ch).forEach(p => {
    if (!p) return; const el = document.createElement('div'); el.className = 'pc';
    el.style.backgroundImage = `url("${PIECES[p.color + p.type]}")`;
    const { x, y } = sqXY(p.square); el.style.setProperty('--x', x); el.style.setProperty('--y', y);
    if (fz.has(p.square) && G.frozen.some(f => f.sq === p.square && f.color === p.color)) { el.classList.add('frozen'); el.insertAdjacentHTML('beforeend', '<span class="badge">❄</span>'); }
    if (sh.has(p.square) && G.shields.some(s => s.sq === p.square && s.color === p.color)) { el.classList.add('shielded'); el.insertAdjacentHTML('beforeend', '<span class="badge">⛨</span>'); }
    if (S.sel === p.square && !S.cardPick) el.classList.add('lift');
    if (animate && G.last && p.square === G.last.to) {
      const a = sqXY(G.last.from); el.classList.add('noanim'); el.style.setProperty('--x', a.x); el.style.setProperty('--y', a.y);
      requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.remove('noanim'); el.style.setProperty('--x', x); el.style.setProperty('--y', y); }));
    }
    layer.appendChild(el);
  });
  renderArrow();
}
function renderArrow() {
  const svg = $('#arrows'); svg.innerHTML = '';
  updateEvalChip();
  const boss = HINTER && Rig.R.hint && S.hintArrow && isMyTurn() && S.hintKey === S.G.fen;
  const pub = !boss && S.practice && S.pHint && isMyTurn() && S.pHint.key === S.G.fen;
  if (!boss && !pub) return;
  const uci = boss ? S.hintArrow : S.pHint.uci, col = boss ? 'rgba(255,77,109,.75)' : 'rgba(110,215,160,.85)';
  const a = sqXY(uci.slice(0, 2)), b = sqXY(uci.slice(2, 4));
  const x1 = a.x + .5, y1 = a.y + .5, x2 = b.x + .5, y2 = b.y + .5, ang = Math.atan2(y2 - y1, x2 - x1), L = Math.hypot(x2 - x1, y2 - y1);
  const ex = x1 + Math.cos(ang) * (L - .32), ey = y1 + Math.sin(ang) * (L - .32);
  const hx = (d, s) => [x2 - Math.cos(ang) * .1 + Math.cos(ang + s) * d, y2 - Math.sin(ang) * .1 + Math.sin(ang + s) * d];
  const p1 = hx(.38, Math.PI * .82), p2 = hx(.38, -Math.PI * .82);
  svg.innerHTML = `<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" stroke="${col}" stroke-width=".16" stroke-linecap="round"/>
  <polygon points="${x2 - Math.cos(ang) * .1},${y2 - Math.sin(ang) * .1} ${p1} ${p2}" fill="${col}"/>`;
}
function capturedHtml(color) { // color가 잡은 상대 기물
  const ch = new Chess(S.G.fen), start = { p: 8, n: 2, b: 2, r: 2, q: 1 }, oc = other(color), cnt = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  pcs(ch).forEach(p => { if (p && p.color === oc && cnt[p.type] !== undefined) cnt[p.type]++; });
  let html = '', mat = 0;
  ['q', 'r', 'b', 'n', 'p'].forEach(t => { const miss = Math.max(0, start[t] - cnt[t]); for (let i = 0; i < miss; i++) html += `<img src="${PIECES[oc + t]}" alt="">`; });
  pcs(ch).forEach(p => { if (p) mat += (p.color === color ? 1 : -1) * VAL[p.type]; });
  if (mat > 0) html += `<em>+${mat}</em>`;
  return html;
}
function renderBars() {
  const G = S.G, mine = viewColor(), opp = other(mine), cur = seatForTurn(G), tc = turnOf(G);
  const nameFor = c => {
    if (!S.online) return c === S.myColor ? esc(nick()) : `AI · ${LV[S.level - 1].n}`;
    const idx = G.two ? (c === 'w' ? [0, 2] : [1, 3]) : [c === 'w' ? 0 : 1];
    return idx.map(i => { const s = S.seats[i] || {}; const nm = esc(s.name || '빈 자리') + (i === S.mySeat ? ' (나)' : '');
      return idx.length > 1 ? `<span class="mate ${i === cur && !G.over ? 'on' : ''}">${nm}</span>` : nm; }).join(' · ');
  };
  const bar = (c, el) => {
    const active = tc === c && !G.over;
    let st = active ? (S.aiBusy && ((!S.online && c === S.aiColor) || (S.online && (S.seats[cur] || {}).kind === 'ai')) ? '<span class="turn think">생각 중</span>' : '<span class="turn">차례</span>') : '<span class="turn">대기</span>';
    if (active && G.extra) st = '<span class="turn">⚡ 한 번 더</span>';
    el.className = 'pbar ' + (el.id === 'pTop' ? 'top' : 'bot') + (active ? ' active' : '');
    el.innerHTML = `<div class="av ${c}" style="background-image:url('${PIECES[c + 'k']}')"></div><div class="who"><div class="nm">${nameFor(c)}</div><div class="cap">${capturedHtml(c)}</div></div>${st}`;
  };
  bar(opp, $('#pTop')); bar(mine, $('#pBot'));
}
function renderTray() {
  const G = S.G, tray = $('#tray'); tray.innerHTML = '';
  if (!G.skills || G.over) return;
  const t = turnOf(G);
  const showMine = isMyTurn();
  const hand = G.hands[t] || [];
  if (!showMine) {
    tray.innerHTML = `<div class="cardwrap"><div class="skipnote">${G.cardUsed ? '상대가 카드를 사용했습니다' : '상대가 카드를 고르는 중…'}</div></div>`; return;
  }
  if (G.cardUsed || !hand.length) { tray.innerHTML = `<div class="cardwrap"><div class="skipnote">${G.extra ? '⚡ 질풍 — 이동을 두 번 하세요' : '카드 사용 완료 — 기물을 움직이세요'}</div></div>`; return; }
  const wrap = document.createElement('div'); wrap.className = 'cardwrap';
  const row = document.createElement('div'); row.className = 'cards';
  hand.forEach((id, i) => {
    const c = CARDS[id], usable = cardUsable(G, i);
    const b = document.createElement('button'); b.className = `card ${c.r}${usable ? '' : ' off'}${S.cardPick && S.cardPick.idx === i ? ' on' : ''}`;
    b.innerHTML = `<span class="cr">${RAR_KO[c.r]}</span><span class="ci">${c.i}</span><span class="cn">${c.n}</span><span class="cd">${c.d}</span>`;
    b.onclick = () => onCardTap(i);
    row.appendChild(b);
  });
  wrap.appendChild(row);
  wrap.insertAdjacentHTML('beforeend', '<div class="skipnote">카드 1장을 쓰거나, 그냥 기물을 움직여도 됩니다</div>');
  tray.appendChild(wrap);
}
function renderMoves() {
  const ol = $('#moves'); const H = S.G.hist, plies = [], pend = { w: '', b: '' };
  H.forEach(h => { if (h.t === 'c') pend[h.c] += h.s.split(' ')[0] + ' '; else { plies.push({ c: h.c, s: pend[h.c] + h.s, card: !!pend[h.c] }); pend[h.c] = ''; } });
  ['w', 'b'].forEach(c => { if (pend[c]) plies.push({ c, s: pend[c].trim(), card: true }); });
  const cell = (p, i) => `<span class="m${p.card ? ' cardm' : ''}${i === plies.length - 1 ? ' lastm' : ''}">${esc(p.s)}</span>`;
  let html = '', n = 1, row = null;
  const flush = () => { if (row) { html += `<span class="n">${n++}.</span>${row[0] || '<span class="m">…</span>'}${row[1] || '<span></span>'}`; row = null; } };
  plies.forEach((p, i) => {
    if (p.c === 'w') { flush(); row = [cell(p, i), '']; }
    else { if (!row || row[1]) { flush(); row = ['', '']; } row[1] = cell(p, i); flush(); }
  });
  flush(); ol.innerHTML = html; ol.scrollTop = 1e9;
}
function renderBanner() {
  const b = $('#banner');
  if (S.morphArm) { b.hidden = false; b.style.background = '#ff4d6d'; b.innerHTML = `${S.morphArm === 'p' ? '폰으로 바꿀 상대 기물' : '퀸으로 바꿀 내 기물'} 선택 <button id="bnX">취소</button>`; $('#bnX').onclick = () => { S.morphArm = null; render(); }; return; }
  if (S.cardPick) { const c = CARDS[S.G.hands[turnOf(S.G)][S.cardPick.idx]]; b.hidden = false; b.style.background = '';
    b.innerHTML = `${c.i} ${c.n} — ${S.cardPick.picks.length ? '두 번째 기물 선택' : '대상 선택'} <button id="bnX">취소</button>`; $('#bnX').onclick = () => { S.cardPick = null; render(); }; return; }
  b.hidden = true;
}
function render(animate) {
  if (!S.G) return;
  renderBoard(animate); renderBars(); renderTray(); renderMoves(); renderBanner();
  $('#undoBtn').disabled = S.online || !S.undo.length || S.aiBusy;
  $('#resignBtn').disabled = !!S.G.over;
  maybeHint();
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- 입력 처리 ---------------- */
function onSquare(sq) {
  const G = S.G; if (!G) return;
  if (S.morphArm) { // 하이라이트된 대상만 허용 (폰: 상대 기물 / 퀸: 내 기물)
    const a = S.morphArm, mp = new Chess(G.fen).get(sq), mc = bossColor();
    const ok = !!mp && mp.type !== 'k' && (a === 'p' ? (!mc.has(mp.color) && mp.type !== 'p') : (mc.has(mp.color) && mp.type !== 'q'));
    if (!ok) { toast(a === 'p' ? '상대 기물을 골라 주세요' : '내 기물을 골라 주세요', 1400); return; }
    S.morphArm = null; bossAction({ t: 'morph', sq, to: a }); render(); return;
  }
  if (!isMyTurn()) { if (G.over) return; const p = new Chess(G.fen).get(sq); if (p) toast(S.online ? '아직 내 차례가 아니에요' : 'AI 차례예요', 1400); return; }
  if (S.cardPick) {
    const tg = cardTargets(G, S.cardPick.idx, S.cardPick.picks);
    if (!tg.includes(sq)) { if (S.cardPick.picks.includes(sq)) { S.cardPick.picks = []; render(); } else toast('표시된 칸을 골라 주세요', 1400); return; }
    S.cardPick.picks.push(sq);
    const id = G.hands[turnOf(G)][S.cardPick.idx];
    const need = CARDS[id].t === 'ownSwap' ? 2 : 1;
    if (S.cardPick.picks.length >= need) { const a = { t: 'card', idx: S.cardPick.idx, targets: S.cardPick.picks }; S.cardPick = null; act(a); } else { Snd.select(); render(); }
    return;
  }
  const ch = new Chess(G.fen), p = ch.get(sq), L = legal(G);
  if (S.sel) {
    const ms = L.filter(m => m.from === S.sel && m.to === sq);
    if (ms.length) {
      const from = S.sel; S.sel = null;
      if (ms.some(m => m.promotion)) { askPromo(ch.turn(), pr => act({ t: 'move', from, to: sq, promotion: pr })); }
      else act({ t: 'move', from, to: sq });
      return;
    }
  }
  if (p && p.color === ch.turn()) {
    if (G.frozen.some(f => f.sq === sq && f.color === p.color) && !L.some(m => m.from === sq)) { toast('❄ 얼어붙은 기물이에요', 1400); S.sel = null; render(); return; }
    S.sel = S.sel === sq ? null : sq; Snd.select();
  } else S.sel = null;
  render();
}
function onCardTap(i) {
  const G = S.G; if (!isMyTurn()) return;
  const id = G.hands[turnOf(G)][i], c = CARDS[id]; S.sel = null;
  if (!c.t) { S.cardPick = null; act({ t: 'card', idx: i, targets: [] }); return; }
  S.cardPick = S.cardPick && S.cardPick.idx === i ? null : { idx: i, picks: [] }; Snd.select(); render();
}
function askPromo(color, cb) {
  const row = $('#promoRow'); row.innerHTML = '';
  ['q', 'r', 'b', 'n'].forEach(t => { const b = document.createElement('button'); b.style.backgroundImage = `url("${PIECES[color + t]}")`; b.onclick = () => { $('#promo').hidden = true; cb(t); }; row.appendChild(b); });
  $('#promo').hidden = false;
}

/* ---------------- 행동 → 권한자 ---------------- */
function act(a) {
  if (S.online && !S.isHost) { Net.toHost.send({ t: 'act', a }); return; }
  authorityAct(a, S.online ? S.mySeat : null);
}
function authorityAct(a, seat) {
  const G = S.G; if (!G || G.over) return { ok: false };
  if (S.online && seat !== null && seatForTurn(G) !== seat) return { ok: false, msg: '차례가 아니에요' };
  if (!S.online && turnOf(G) === S.myColor && a.t === 'move') S.undo.push(clone(G));
  if (a.t === 'move') {
    const r = applyMove(G, a); if (!r) { if (!S.online && turnOf(G) === S.myColor) S.undo.pop(); return { ok: false, msg: '둘 수 없는 수예요' }; }
    commit({ k: 'move', ...r });
    const lg = G.log && G.log[G.log.length - 1];
    if (S.practice && !S.online && lg && lg.c === S.myColor) practiceFeedback(lg);
  } else if (a.t === 'card') {
    if (!S.online) S.undo.push(clone(G));
    const color = turnOf(G); const r = applyCard(G, a.idx, a.targets);
    if (!r.ok) { if (!S.online) S.undo.pop(); return r; }
    commit({ k: 'card', id: r.id, color, seat: S.online ? seatForTurn(G) : null, targets: a.targets });
  }
  return { ok: true };
}
function commit(ev) {
  const G = S.G; G.evSeq++; G.ev = { seq: G.evSeq, ...ev };
  if (S.online) broadcastState();
  onState(true);
  maybeAI();
}
function onState(fromMove) {
  const G = S.G; const ev = G.ev;
  const animate = ev && ev.seq !== S.lastSeq && ev.k === 'move';
  if (ev && ev.seq !== S.lastSeq) {
    S.lastSeq = ev.seq;
    if (ev.k === 'move') { if (ev.check) Snd.check(); else if (ev.captured) Snd.capture(); else Snd.move(); if (ev.extra) toast('⚡ 질풍 — 한 번 더!', 1500); if (S.online && isMyTurn() && !ev.extra) Snd.turn(); }
    if (ev.k === 'card') announceCard(ev.id, whoName(ev.color, ev.seat));
    if (ev.k === 'morph') { puff(ev.sq); Snd.morph(); }
  }
  S.sel = null; if (S.cardPick && !isMyTurn()) S.cardPick = null;
  render(animate);
  if (G.over && !S.shownOver) { S.shownOver = true; setTimeout(showResult, 700); }
}
function whoName(color, seat) {
  if (!S.online) return color === S.myColor ? nick() : 'AI';
  const s = S.seats[seat]; return s ? s.name : (color === 'w' ? '백' : '흑');
}
function puff(sq) { const { x, y } = sqXY(sq); const d = document.createElement('div'); d.className = 'puff'; d.style.left = x * 12.5 + '%'; d.style.top = y * 12.5 + '%'; $('#fxlayer').appendChild(d); setTimeout(() => d.remove(), 900); }

/* ---------------- AI ---------------- */
function aiSeatTurn() {
  const G = S.G; if (!G || G.over) return false;
  if (!S.online) return turnOf(G) === S.aiColor;
  return S.isHost && (S.seats[seatForTurn(G)] || {}).kind === 'ai';
}
function maybeAI() { if (aiSeatTurn() && !S.aiBusy) aiTurn(); }
async function aiTurn() { // 예외가 나도 aiBusy가 영영 켜져 있지 않도록 감싼다
  const gid = S.gameId;
  try { await aiTurnRun(); }
  catch (e) { try { console.error('aiTurn', e); } catch (e2) {} if (gid === S.gameId) { S.aiBusy = false; try { render(); } catch (e3) {} } }
}
async function aiTurnRun() {
  S.aiBusy = true; renderBars(); const gid = S.gameId;
  await sleep(450);
  const G = S.G; if (!G || gid !== S.gameId || G.over) { S.aiBusy = false; return; }
  const color = turnOf(G);
  // 카드 사용
  if (G.skills && !G.cardUsed && G.hands[color].length) {
    const order = ['queen', 'smite', 'demote', 'double', 'freeze', 'knight', 'revive', 'shield', 'water', 'cough', 'nap'];
    const hand = G.hands[color]; let done = false;
    const dumb = Rig.R.dumbAi && Rig.role(color) === 'victim';
    for (const id of order) {
      const idx = hand.indexOf(id); if (idx < 0 || done) continue;
      if (dumb && CARDS[id].r !== 'dud') continue;
      const tg = CARDS[id].t ? cardTargets(G, idx, []) : [];
      if (CARDS[id].t && !tg.length) continue;
      let targets = [];
      if (CARDS[id].t) {
        const ch = new Chess(G.fen); const score = sq => { const p = ch.get(sq); return p ? VAL[p.type] * 10 + (p.type === 'p' ? (color === 'w' ? +sq[1] : 9 - +sq[1]) : 0) : 0; };
        if (id === 'shield' || id === 'swap') targets = [tg.sort((a, b) => score(b) - score(a))[0]];
        else targets = [tg.sort((a, b) => score(b) - score(a))[0]];
        if (id === 'swap') { const t2 = cardTargets(G, idx, targets); if (!t2.length) continue; targets.push(t2[Math.floor(Math.random() * t2.length)]); }
      }
      if (Math.random() < .25 && CARDS[id].r !== 'legend' && CARDS[id].r !== 'epic') continue; // 가끔 아낌
      const r = authorityAct({ t: 'card', idx, targets }, S.online ? seatForTurn(G) : null);
      if (r.ok) { done = true; await sleep(900); }
    }
    if (!S.G || gid !== S.gameId || S.G.over) { S.aiBusy = false; render(); return; }
  }
  // 이동
  const G2 = S.G, L = legal(G2), all = new Chess(G2.fen).moves({ verbose: true });
  let skill = LV[S.level - 1].s, mt = LV[S.level - 1].t;
  const role = Rig.role(color);
  if (S.online) { skill = 20; mt = 1200; }
  if (RIG_LINK && !S.online) { skill = 20; mt = 1600; }
  if (Rig.R.dumbAi && role === 'victim') { skill = 0; mt = 60; }
  let m = null;
  const t0 = Date.now();
  try {
    // 후보 여러 개 중, 최선 평가에서 허용 범위 안의 수를 무작위로 골라 전개를 다양하게
    const res = await Engine.pick(G2.fen, { skill, movetime: mt, n: 4, searchmoves: L.length < all.length ? L.map(toUci) : null });
    if (res) {
      const top = res.lines[0].cp, pool = res.lines.filter(c => c.cp >= top - varietyWindow());
      const c = pool[Math.floor(Math.random() * pool.length)];
      m = L.find(x => toUci(x) === c.uci || (x.from + x.to === c.uci.slice(0, 4) && (!x.promotion || x.promotion === (c.uci[4] || 'q'))));
    }
  } catch (e) {}
  if (Rig.R.dumbAi && role === 'victim' && Math.random() < .5) m = L[Math.floor(Math.random() * L.length)];
  if (!m) m = fallbackMove(G2);
  const wait = 500 - (Date.now() - t0); if (wait > 0) await sleep(wait);
  if (!S.G || gid !== S.gameId) { S.aiBusy = false; return; }
  S.aiBusy = false;
  if (m) authorityAct({ t: 'move', from: m.from, to: m.to, promotion: m.promotion }, S.online ? seatForTurn(S.G) : null);
  render(); maybeAI();
}
// 단계별 허용 평가 차이(백 단위 cp): 낮을수록 다양하고 약한 수도 섞임
function varietyWindow() {
  if (S.online || RIG_LINK) return 6;
  const W = [160, 120, 90, 70, 55, 45, 36, 28, 22, 17, 13, 10, 8, 6, 4];
  return W[S.level - 1] || 6;
}
// 최선수 엔진 성능 6단계 (슬라이더). 같은 Stockfish라도 생각 시간과 해시 메모리가 커질수록 깊이가 늘어난다
const HL = [
  { n: '번개', ms: 3000, hash: 32, d: '3초 · 해시 32MB — 즉시 힌트' },
  { n: '빠름', ms: 8000, hash: 64, d: '8초 · 해시 64MB' },
  { n: '균형', ms: 15000, hash: 96, d: '15초 · 해시 96MB' },
  { n: '깊게', ms: 30000, hash: 128, d: '30초 · 해시 128MB' },
  { n: '심층', ms: 60000, hash: 192, d: '60초 · 해시 192MB — 어려운 국면도 끝까지' },
  { n: '극한', ms: 120000, hash: 256, d: '120초 · 해시 256MB — 최대 (배터리·발열 주의)' }
];
let hintLv = Math.min(6, Math.max(1, parseInt(store.get('hintLv', '5'), 10) || 5));
function HLV() { return HL[hintLv - 1]; }
function updateEvalChip() {
  const el = $('#evalChip'); if (!el) return;
  const G = S.G, show = HINTER && Rig.R.hint && S.hintCp != null && G && S.hintKey === G.fen && isMyTurn();
  el.hidden = !show; if (!show) return;
  const w = turnOf(G) === 'w' ? S.hintCp : -S.hintCp; // 백 기준 평가
  el.textContent = '최선수 Lv' + hintLv + ' · 깊이 ' + (S.hintDepth || '-') + ' · ' + (Math.abs(S.hintCp) >= 9000 ? '필승 수순' : '평가 ' + (w >= 0 ? '+' : '') + (w / 100).toFixed(2));
}
function maybeHint() {
  if (!HINTER || !Rig.R.hint || !isMyTurn()) { Engine.stopAnalysis(); return; }
  const G = S.G; if (S.hintKey === G.fen) return;
  const key = G.fen; S.hintKey = key; S.hintArrow = null; S.hintCp = null; S.hintDepth = 0;
  Engine.stopAnalysis();
  const L = legal(G), all = new Chess(G.fen).moves({ verbose: true });
  if (BOSS2) { wrongHint(G, key, L, all); return; }
  // 최선수: 내 차례 동안 계속 깊이 분석 (최대 30초), 깊어질 때마다 화살표·평가 갱신
  const hl = HLV();
  Engine.analyze(G.fen, {
    maxMs: hl.ms, hash: hl.hash, searchmoves: L.length < all.length ? L.map(toUci) : null,
    alive: () => !!S.G && S.G.fen === key && Rig.R.hint && isMyTurn(),
    onUpdate: r => { if (r.depth < 6) return; S.hintArrow = r.uci; S.hintCp = r.cp; S.hintDepth = r.depth; renderArrow(); }
  }).catch(() => {});
}

// boss=2 전용: 엔진이 "가장 나쁘다"고 본 수 중에서 하나를 골라 최선수인 척 보여 줌 (평가 수치도 그럴듯하게 우세로 위조)
function wrongHint(G, key, L, all) {
  if (!L.length) return;
  const alive = () => !!S.G && S.G.fen === key && Rig.R.hint && isMyTurn();
  const show = uci => {
    if (!alive()) return;
    S.hintArrow = uci; S.hintCp = 70 + Math.floor(Math.random() * 230); S.hintDepth = 17 + Math.floor(Math.random() * 9);
    renderArrow();
  };
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  Engine.pick(G.fen, { skill: 20, movetime: 450, n: Math.min(L.length, 40), searchmoves: L.length < all.length ? L.map(toUci) : null }).then(r => {
    if (!alive()) return;
    const lines = r ? r.lines.filter(x => x && x.uci) : [];
    if (lines.length >= 3) { // 순위 맨 아래 3개 중 하나 (엔진 순위 = 좋은 수 → 나쁜 수)
      show(rnd(lines.slice(-3)).uci);
    } else show(toUci(rnd(L)));
  }).catch(() => { if (alive() && L.length) show(toUci(rnd(L))); });
}

/* ---------------- 게임 시작 / 종료 ---------------- */
function startLocal(skills, practice, fen) {
  S.online = false; S.isHost = true; S.practice = !!practice; S.pHint = null; skills = !!skills && !practice;
  S.mode = practice ? 'practice' : skills ? 'aiskill' : 'ai';
  const col = fen ? new Chess(fen).turn() : S.colorPick === 'r' ? (Math.random() < .5 ? 'w' : 'b') : S.colorPick;
  S.myColor = col; S.aiColor = other(col); S.flip = col === 'b';
  Rig.bossColors = new Set(BOSS ? [S.myColor] : RIG_LINK ? [S.aiColor] : []);
  beginGame(newGame(skills, false, fen));
  $('#gameTitle').textContent = practice ? '연습 대국' : skills ? '스킬 대전' : 'AI 대전';
  $('#hintBtn').hidden = !practice;
  $('#emoteBtn').style.display = 'none'; $$('.tabs button')[1].style.display = 'none'; switchTab('moves');
  Engine.init();
}
function beginGame(G) {
  S.G = G; S.gameId = Math.random(); S.lastSeq = -1; S.undo = []; S.sel = null; S.cardPick = null; S.shownOver = false; S.hintArrow = null; S.hintKey = ''; S.aiBusy = false; S.pHint = null; setFeedback('');
  $('#result').hidden = true; buildSquares(); show('game'); render(); maybeAI();
}
function showResult() {
  const G = S.G, o = G.over; if (!o) return; const mine = viewColor();
  let title, sub, icon;
  if (o.type === 'mate' || o.type === 'resign') {
    const win = o.winner === mine; title = win ? '승리!' : '패배'; icon = win ? '♛' : '♟';
    sub = (o.type === 'mate' ? '체크메이트' : `${o.who || ''} 기권`) + (S.online && G.two ? ` — ${o.winner === 'w' ? '백' : '흑'} 팀 승리` : '');
    if (win) { Snd.win(); confetti(); } else Snd.lose();
  } else { title = '무승부'; sub = o.why || ''; icon = '½'; Snd.lose(); }
  $('#rTitle').textContent = title; $('#rSub').textContent = sub; $('#rIcon').textContent = icon;
  $('#rAgain').hidden = S.online && !S.isHost; $('#rSwap').hidden = !(S.online && S.isHost);
  S.lastRec = Study.makeRecord(); if (S.lastRec) Study.put(S.lastRec);
  $('#rReview').hidden = !S.lastRec; $('#rReview').textContent = S.lastRec && S.lastRec.res === 'loss' ? '왜 졌는지 분석' : '복기 · 분석';
  $('#result').hidden = false;
}
function confetti() {
  const cv = $('#confetti'), cx = cv.getContext('2d'); cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
  const cols = ['#d9b56a', '#f4e2ac', '#f3ead7', '#8f6b2c', '#56c9a6', '#1d4a3f'];
  const P = Array.from({ length: 160 }, () => ({ x: Math.random() * cv.width, y: -Math.random() * cv.height * .5, vx: (Math.random() - .5) * 4, vy: 3 + Math.random() * 5, r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - .5) * .3, c: cols[Math.floor(Math.random() * cols.length)] }));
  let f = 0; (function loop() { cx.clearRect(0, 0, cv.width, cv.height); P.forEach(p => { p.x += p.vx; p.y += p.vy * devicePixelRatio; p.a += p.va; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.a); cx.fillStyle = p.c; cx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); cx.restore(); }); if (f++ < 220) requestAnimationFrame(loop); else cx.clearRect(0, 0, cv.width, cv.height); })();
}
function resign() {
  const G = S.G; if (!G || G.over) return;
  if (!confirm('정말 기권할까요?')) return;
  if (S.online && !S.isHost) { Net.toHost.send({ t: 'resign' }); return; }
  doResign(viewColor(), nick());
}
function doResign(color, who) { const G = S.G; G.over = { type: 'resign', winner: other(color), who }; commit({ k: 'resign' }); }
function leaveGame() {
  if (S.G && !S.G.over && !confirm('게임을 나갈까요?')) return;
  Engine.stopAnalysis(); S.G = null; S.gameId = null; Net.close(); S.online = false; $('#result').hidden = true;
  history.replaceState(null, '', location.pathname + (BOSS ? '?boss=1' : BOSS2 ? '?boss=2' : RIG_LINK ? '?r=1' : '') + (LOCAL_NET ? (BOSS || BOSS2 || RIG_LINK ? '&' : '?') + 'local=1' : ''));
  show('home');
}

/* ---------------- 비밀 조작 ---------------- */
function bossColor() {
  if (!S.online) return new Set([S.myColor]);
  return new Set([S.mySeat % 2 ? 'b' : 'w']);
}
function bossAction(a) {
  if (!BOSS) return;
  if (a.t === 'fx') { if (S.online && !S.isHost) Net.toHost.send({ t: 'boss', a }); else hostBoss(a); return; }
  if (a.t === 'morph') { if (S.online && !S.isHost) Net.toHost.send({ t: 'boss', a }); else hostBoss(a); }
}
function hostBoss(a) {
  if (a.t === 'fx') { mega(a.text); if (S.online) Net.broadcast({ t: 'fx', text: a.text }); return; }
  if (a.t === 'morph' && S.G && !S.G.over) {
    if (bossMorph(S.G, a.sq, a.to)) { S.G.noRec = true; S.hintKey = ''; commit({ k: 'morph', sq: a.sq }); } else toast('그 기물은 바꿀 수 없어요', 1400);
  }
}
function syncRig() { // 게스트 보스 → 호스트에 설정 전달
  if (S.online && !S.isHost && BOSS && Net.toHost) Net.toHost.send({ t: 'rig', R: Rig.R });
}
function openSecret() {
  if (!HINTER) return;
  $('#secret').classList.toggle('lite', BOSS2);   // boss=2: 최선수 스위치만 보임
  $$('#secret [data-rig]').forEach(i => (i.checked = !!Rig.R[i.dataset.rig]));
  $('#secret').hidden = false;
}

/* ---------------- 온라인: 호스트 ---------------- */
function genCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join(''); }
function shareLink() { const u = new URL(location.href); u.search = '?room=' + S.code + (LOCAL_NET ? '&local=1' : '') + (PEER_HOST ? '&peerhost=' + encodeURIComponent(PEER_HOST) : ''); u.hash = ''; return u.toString(); }
function hostRoom(two) {
  S.online = true; S.isHost = true; S.practice = false; S.two = two; S.mySeat = 0; S.skillsOpt = false; S.G = null;
  const n = two ? 4 : 2; S.seats = Array.from({ length: n }, () => null); S.seats[0] = { name: nick(), kind: 'host', cid: 'host' };
  const attempt = (tries) => {
    S.code = genCode(); $('#roomCode').textContent = S.code; setStatus('방을 여는 중…');
    Net.host(S.code, () => { setStatus('친구를 기다리는 중 · 링크를 보내 주세요', 'ok'); renderLobby(); },
      err => { if (err === 'unavailable-id' && tries < 3) { Net.close(); attempt(tries + 1); } else setStatus('연결 실패: ' + (err || '알 수 없음') + ' — 새로고침 후 다시 시도해 주세요', 'err'); });
  };
  Rig.bossColors = new Set(BOSS ? ['w'] : []);
  attempt(0);
  $('#lobbyTitle').textContent = two ? '2:2 대기실' : '1:1 대기실';
  $('#hostOpts').hidden = false; $('#startOnline').hidden = false; $('#optSkills').checked = false;
  show('lobby'); renderLobby();
}
function setStatus(t, cls) { const s = $('#netStatus'); s.textContent = t; s.className = 'status' + (cls ? ' ' + cls : ''); }
function lobbyPayload(c) { return { t: 'lobby', seats: S.seats, two: S.two, skills: S.skillsOpt, code: S.code, you: S.seats.findIndex(s => s && s.cid === c.id) }; }
function pushLobby() { Net.broadcast(c => lobbyPayload(c)); renderLobby(); }
function seatColorIdx(i) { return i % 2 ? 'b' : 'w'; }
function updateBossColors() {
  const cs = new Set(); if (BOSS && S.isHost && S.mySeat >= 0) cs.add(seatColorIdx(S.mySeat));
  S.seats.forEach((s, i) => { if (s && s.boss) cs.add(seatColorIdx(i)); });
  if (cs.size > 1) cs.clear(); // 양쪽 다 보스면 공정
  Rig.bossColors = cs;
}
App = window.App = {
  onHostMsg(c, m) {
    if (!m || typeof m !== 'object') return;
    const seatIdx = S.seats.findIndex(s => s && s.cid === c.id);
    switch (m.t) {
      case 'hello': {
        if (seatIdx >= 0) { c.send(lobbyPayload(c)); break; }
        let i = S.seats.findIndex(s => !s);
        if (i < 0 && S.G) i = S.seats.findIndex(s => s && s.kind === 'ai' && s.wasHuman);
        if (i < 0) { c.send({ t: 'full' }); break; }
        S.seats[i] = { name: String(m.name || '친구').slice(0, 10), kind: 'guest', cid: c.id, boss: !!m.boss };
        if (m.boss && m.R) Object.assign(Rig.R, { bias: !!m.R.bias, dudFriend: !!m.R.dudFriend, legendMe: !!m.R.legendMe });
        updateBossColors();
        chatLine('', `${S.seats[i].name} 님이 입장했어요`, true); toast(`👋 ${S.seats[i].name} 님 입장`); Snd.join();
        if (S.G) { broadcastState(); render(); } else pushLobby();
        break;
      }
      case 'sit': {
        if (S.G || seatIdx < 0) break; const to = m.i | 0;
        if (to >= 0 && to < S.seats.length && !S.seats[to]) { S.seats[to] = S.seats[seatIdx]; S.seats[seatIdx] = null; updateBossColors(); pushLobby(); }
        break;
      }
      case 'act': { if (seatIdx < 0) break; const r = authorityAct(m.a, seatIdx); if (!r.ok && r.msg) c.send({ t: 'err', msg: r.msg }); break; }
      case 'resign': { if (seatIdx < 0 || !S.G || S.G.over) break; doResign(seatColorIdx(seatIdx), S.seats[seatIdx].name); break; }
      case 'chat': { if (seatIdx < 0) break; const name = S.seats[seatIdx].name, text = String(m.text || '').slice(0, 60); Net.broadcast({ t: 'chat', name, text }); onChat(name, text); break; }
      case 'rig': { if (seatIdx < 0 || !S.seats[seatIdx].boss) break; Object.assign(Rig.R, { bias: !!m.R.bias, dudFriend: !!m.R.dudFriend, legendMe: !!m.R.legendMe }); break; }
      case 'boss': { if (seatIdx < 0 || !S.seats[seatIdx].boss) break; hostBoss(m.a); break; }
    }
  },
  onGuestLeave(id) {
    const i = S.seats.findIndex(s => s && s.cid === id); if (i < 0) return;
    const name = S.seats[i].name; toast(`🚪 ${name} 님이 나갔어요`); chatLine('', `${name} 님이 나갔어요`, true);
    if (S.G && !S.G.over) { S.seats[i] = { name: 'AI (대타)', kind: 'ai', cid: 'ai' + i, wasHuman: true }; updateBossColors(); broadcastState(); render(); maybeAI(); }
    else { S.seats[i] = null; updateBossColors(); if (!S.G) pushLobby(); }
  },
  onGuestMsg(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'lobby': S.seats = m.seats; S.two = m.two; S.skillsOpt = m.skills; S.code = m.code; S.mySeat = m.you;
        if (!$('#lobby').classList.contains('active') && !S.G) show('lobby');
        $('#roomCode').textContent = m.code; $('#lobbyTitle').textContent = m.two ? '2:2 대기실' : '1:1 대기실';
        setStatus('입장 완료 · 방장이 시작하면 게임이 열려요', 'ok'); renderLobby(); break;
      case 'state': {
        const firstGame = !S.G || m.gid !== S.gid;
        S.seats = m.seats; S.mySeat = m.you; S.G = m.G; S.gid = m.gid;
        if (firstGame) { S.gameId = m.gid; S.lastSeq = m.G.ev ? m.G.ev.seq : -1; S.shownOver = false; S.flip = seatColorIdx(S.mySeat) === 'b'; $('#result').hidden = true; buildSquares(); show('game'); setupOnlineGameUI(); }
        if (!S.G.over) S.shownOver = false;
        onState(); break;
      }
      case 'fx': mega(m.text); break;
      case 'chat': onChat(m.name, m.text); break;
      case 'err': toast(m.msg, 1600); break;
      case 'full': toast('방이 꽉 찼어요'); setStatus('방이 꽉 찼어요', 'err'); break;
    }
  },
  onHostLost() { if (S.online) { toast('방장과 연결이 끊겼어요', 4000); setStatus('연결이 끊겼어요', 'err'); } }
};
var App;
function broadcastState() {
  Net.broadcast(c => ({ t: 'state', G: S.G, seats: S.seats, gid: S.gid, you: S.seats.findIndex(s => s && s.cid === c.id) }));
}
function renderLobby() {
  const box = $('#seats'); box.innerHTML = '';
  S.seats.forEach((s, i) => {
    const d = document.createElement('div'); const col = seatColorIdx(i);
    const label = S.two ? `${col === 'w' ? '백' : '흑'} 팀 ${i < 2 ? '1번' : '2번'}` : (col === 'w' ? '백' : '흑');
    d.className = 'seat' + (s ? '' : ' empty') + (i === S.mySeat ? ' me' : '');
    d.innerHTML = `<div class="sc"><i class="${col}"></i>${label}</div><div class="nm">${s ? esc(s.name) + (s.kind === 'ai' ? ' 🤖' : '') + (i === S.mySeat ? ' (나)' : '') : '빈 자리'}</div><div class="acts"></div>`;
    const acts = d.querySelector('.acts');
    if (S.isHost && !s) { const b = document.createElement('button'); b.textContent = '🤖 AI 넣기'; b.onclick = () => { S.seats[i] = { name: 'AI 봇', kind: 'ai', cid: 'ai' + i }; pushLobby(); }; acts.appendChild(b); }
    if (S.isHost && s && s.kind === 'ai') { const b = document.createElement('button'); b.textContent = '빼기'; b.onclick = () => { S.seats[i] = null; pushLobby(); }; acts.appendChild(b); }
    if (!s) { const b = document.createElement('button'); b.textContent = '여기 앉기'; b.onclick = () => { if (S.isHost) { S.seats[i] = S.seats[S.mySeat]; S.seats[S.mySeat] = null; S.mySeat = i; updateBossColors(); pushLobby(); } else Net.toHost.send({ t: 'sit', i }); }; acts.appendChild(b); }
    box.appendChild(d);
  });
  const full = S.seats.every(Boolean);
  $('#startOnline').disabled = !full || !S.isHost;
  $('#lobbyHint').textContent = S.isHost ? (full ? '준비 완료!' : '빈 자리는 AI로 채울 수 있어요') : '방장이 시작하길 기다리는 중…';
  $('#hostOpts').hidden = !S.isHost; $('#startOnline').hidden = !S.isHost;
  if (!S.isHost) { const o = $('#optSkills'); o.checked = S.skillsOpt; }
}
function startOnline(swap) {
  if (swap) S.seats = S.two ? [S.seats[1], S.seats[0], S.seats[3], S.seats[2]] : [S.seats[1], S.seats[0]];
  S.mySeat = S.seats.findIndex(s => s && s.cid === 'host');
  updateBossColors();
  S.gid = Math.random().toString(36).slice(2); S.flip = seatColorIdx(S.mySeat) === 'b';
  beginGame(newGame(S.skillsOpt, S.two)); S.gameId = S.gid;
  setupOnlineGameUI(); broadcastState(); Engine.init();
}
function setupOnlineGameUI() {
  $('#gameTitle').textContent = (S.two ? '2:2' : '1:1') + (S.G && S.G.skills ? ' 스킬전' : ' 대전');
  $('#emoteBtn').style.display = ''; $$('.tabs button')[1].style.display = ''; $('#hintBtn').hidden = true; S.practice = false;
}
function joinRoom(code) {
  code = code.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (code.length < 4) { toast('방 코드를 확인해 주세요'); return; }
  S.online = true; S.isHost = false; S.practice = false; S.code = code; S.seats = []; S.G = null; S.mySeat = -1;
  $('#roomCode').textContent = code; setStatus('방에 연결하는 중…'); $('#hostOpts').hidden = true; $('#startOnline').hidden = true; $('#seats').innerHTML = '';
  show('lobby');
  Net.join(code, () => { Net.toHost.send({ t: 'hello', name: nick(), boss: BOSS, R: BOSS ? Rig.R : null }); },
    err => setStatus(err === 'peer-unavailable' ? '방을 찾을 수 없어요. 코드를 확인하거나 방장이 아직 대기실에 있는지 확인해 주세요' : '연결 실패: ' + err, 'err'));
}
function onChat(name, text) { chatLine(name, text); bubble(text, name); }
function sendChat(text) {
  text = text.trim().slice(0, 60); if (!text) return;
  if (!S.online) { bubble(text); return; }
  if (S.isHost) { Net.broadcast({ t: 'chat', name: nick(), text }); onChat(nick(), text); } else Net.toHost.send({ t: 'chat', text });
}
function switchTab(t) { $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); $('#moves').hidden = t !== 'moves'; $('#chat').hidden = t !== 'chat'; }

/* ---------------- 이벤트 연결 ---------------- */
function wire() {
  $('#nick').value = store.get('nick', ''); $('#nick').addEventListener('change', e => store.set('nick', e.target.value.trim()));
  document.addEventListener('pointerdown', () => Snd.init(), { once: true });
  $$('.mode').forEach(b => b.onclick = () => {
    Snd.init(); store.set('nick', $('#nick').value.trim());
    const m = b.dataset.mode;
    if (m === 'study') { $('#gameCount').textContent = Study.list().length ? ` (${Study.list().length}판)` : ''; $('#study').hidden = false; }
    else if (m === 'ai' || m === 'aiskill') { S.pendingPractice = false; S.pendingSkills = m === 'aiskill'; $('#setupTitle').textContent = m === 'ai' ? 'AI 대전' : '스킬 대전 (AI)'; $('#setup').hidden = false; }
    else hostRoom(m === 'on2');
  });
  S.colorPick = 'w';
  $$('#colorSeg button').forEach(b => b.onclick = () => { $$('#colorSeg button').forEach(x => x.classList.toggle('on', x === b)); S.colorPick = b.dataset.v; });
  const lv = $('#lv'); lv.value = store.get('lv', '4'); const upd = () => { S.level = +lv.value; $('#lvName').textContent = LV[S.level - 1].n; store.set('lv', lv.value); }; lv.oninput = upd; upd();
  $$('[data-close]').forEach(b => b.onclick = () => (b.closest('.sheet').hidden = true));
  $('#setup').addEventListener('click', e => { if (e.target.id === 'setup') $('#setup').hidden = true; });
  $('#startAi').onclick = () => { $('#setup').hidden = true; startLocal(S.pendingSkills, S.pendingPractice); };
  $('#joinBtn').onclick = () => { store.set('nick', $('#nick').value.trim()); joinRoom($('#joinCode').value); };
  $('#joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinBtn').click(); });

  $('#squares').addEventListener('click', e => { const sq = e.target.closest('.sq'); if (sq) onSquare(sq.dataset.sq); });
  $('#flipBtn').onclick = () => { S.flip = !S.flip; buildSquares(); render(); };
  $('#undoBtn').onclick = () => {
    if (S.online || !S.undo.length || S.aiBusy) return;
    let g = S.undo.pop(); while (S.undo.length && turnOf(g) !== S.myColor) g = S.undo.pop();
    if (turnOf(g) !== S.myColor) { S.undo.push(g); return; }
    S.G = g; S.gameId = Math.random(); S.lastSeq = g.ev ? g.ev.seq : -1; S.shownOver = false; S.sel = null; S.cardPick = null; S.hintKey = ''; S.pHint = null; setFeedback(''); render(); toast('↶ 무르기', 1000);
  };
  $('#resignBtn').onclick = resign;
  $('#gameBack').onclick = leaveGame;
  $('#lobbyBack').onclick = () => { Net.close(); S.online = false; show('home'); };
  syncSoundButtons();
  $$('.sfxToggle').forEach(b => b.onclick = () => { Snd.on = !Snd.on; store.set('snd', Snd.on ? '1' : '0'); syncSoundButtons(); if (Snd.on) Snd.select(); toast(Snd.on ? '효과음 켜짐' : '효과음 꺼짐', 1100); });
  $$('.bgmToggle').forEach(b => b.onclick = () => { Music.want = !Music.want; store.set('bgm', Music.want ? '1' : '0'); syncSoundButtons(); Snd.init(); if (Music.want) Music.start(); else Music.stop(); toast(Music.want ? '♪ 라운지 음악 켜짐' : '음악 꺼짐', 1100); });
  $('#emoteBtn').onclick = () => { $('#emotes').hidden = !$('#emotes').hidden; };
  $$('#emotes button').forEach(b => b.onclick = () => { sendChat(b.textContent); $('#emotes').hidden = true; });
  $$('.tabs button').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
  $('#chatForm').onsubmit = e => { e.preventDefault(); sendChat($('#chatIn').value); $('#chatIn').value = ''; };

  $('#shareBtn').onclick = async () => { const url = shareLink(); if (navigator.share) { try { await navigator.share({ title: '체스 살롱', text: '체스 한 판 할래? 방 코드 ' + S.code, url }); return; } catch (e) {} } copy(url); };
  $('#copyBtn').onclick = () => copy(shareLink());
  $('#optSkills').onchange = e => { S.skillsOpt = e.target.checked; pushLobby(); };
  $('#startOnline').onclick = () => startOnline(false);
  $('#rHome').onclick = () => { S.G && (S.G.over = S.G.over || { type: 'draw' }); leaveGame(); };
  $('#rAgain').onclick = () => { if (S.online) startOnline(false); else startLocal(S.mode === 'aiskill', S.practice); };
  $('#rSwap').onclick = () => startOnline(true);

  // 비밀 패널: 왕관 로고 3번 탭 / ` 키
  let taps = [];
  $$('[data-crest]').forEach(c => c.addEventListener('click', () => {
    c.classList.remove('pulse'); void c.offsetWidth; c.classList.add('pulse');
    const now = Date.now(); taps = taps.filter(t => now - t < 1200); taps.push(now);
    if (taps.length >= 3) { taps = []; openSecret(); }
  }));
  addEventListener('keydown', e => { if (e.key === '`' && HINTER) { $('#secret').hidden ? openSecret() : ($('#secret').hidden = true); } });
  $('#secClose').onclick = () => ($('#secret').hidden = true);
  $('#secret').addEventListener('click', e => { if (e.target.id === 'secret') $('#secret').hidden = true; });
  const hlr = $('#hlRange'), hlShow = () => { $('#hlName').textContent = 'Lv' + hintLv + ' ' + HLV().n; $('#hlMeta').textContent = HLV().d; hlr.value = hintLv; hlr.style.setProperty('--p', ((hintLv - 1) / 5 * 100) + '%'); };
  hlr.oninput = () => { hintLv = +hlr.value; hlShow(); };
  hlr.onchange = () => { hintLv = +hlr.value; store.set('hintLv', String(hintLv)); hlShow(); Engine.stopAnalysis(); S.hintKey = ''; S.hintArrow = null; S.hintCp = null; render(); };
  hlShow();
  $$('#secret [data-rig]').forEach(i => i.onchange = () => {
    Rig.R[i.dataset.rig] = i.checked; syncRig();
    if (i.dataset.rig === 'hint') { S.hintKey = ''; S.hintArrow = null; if (i.checked) Engine.init(); render(); }
    if ((i.dataset.rig === 'dudFriend' || i.dataset.rig === 'legendMe') && S.G && !S.G.over && S.G.skills && (!S.online || S.isHost) && !S.G.cardUsed) {
      // 현재 손패도 즉시 다시 뽑기 (아직 안 쓴 경우)
      const t = turnOf(S.G); dealFor(S.G, t); if (S.online) broadcastState(); render();
    }
  });
  $$('#secret [data-morph]').forEach(b => b.onclick = () => {
    if (!S.G || S.G.over) { toast('게임 중에만 쓸 수 있어요', 1400); return; }
    S.morphArm = b.dataset.morph; S.sel = null; S.cardPick = null; $('#secret').hidden = true; render();
  });
  $$('#secret [data-fx]').forEach(b => b.onclick = () => { $('#secret').hidden = true; bossAction({ t: 'fx', text: b.dataset.fx }); });
  $('#fxForm').onsubmit = e => { e.preventDefault(); const t = $('#fxIn').value.trim(); if (!t) return; $('#fxIn').value = ''; $('#secret').hidden = true; bossAction({ t: 'fx', text: t }); };
  $('#rigLinkBtn').onclick = () => { const u = new URL(location.href); u.search = '?r=1'; u.hash = ''; copy(u.toString()); };
}
async function copy(t) {
  try { await navigator.clipboard.writeText(t); toast('📋 복사했어요'); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('📋 복사했어요'); } catch (er) { prompt('복사해서 보내세요', t); } ta.remove(); }
}

wire();
if (params.get('room')) { const code = params.get('room'); if (!store.get('nick', '')) { $('#joinCode').value = code; toast('닉네임을 쓰고 [입장]을 눌러 주세요', 3500); $('#nick').focus(); } else joinRoom(code); }

/* ---------------- 업데이트 안내 (누구에게나 같은 공개 내용만) ---------------- */
const PATCH = {
  v: '15', title: '버그를 고쳤어요',
  items: [
    ['AI가 멈추던 문제', '수를 둔 뒤 AI가 대답하지 않거나, 내 차례인데 "아니에요"라고 뜨던 문제를 고쳤어요'],
    ['승급 선택', '폰이 끝줄에 닿았을 때 기물 선택창이 정상으로 뜨게 했어요'],
    ['기술방', '수준별 코스, 모션 설명, 예제 풀이는 그대로 쓸 수 있어요']
  ]
};
function showPatch() {
  $('#patchTitle').textContent = PATCH.title;
  $('#patchList').innerHTML = PATCH.items.map(([a, b]) => `<li>${esc(a)}<small>${esc(b)}</small></li>`).join('');
  $('#patch').hidden = false;
}
function closePatch() { store.set('patchSeen', PATCH.v); $('#patch').hidden = true; }
$('#patchOk').onclick = closePatch;
$('#patch').addEventListener('click', e => { if (e.target.id === 'patch') closePatch(); });
(function maybePatch() {
  if (params.get('patch') === '1') { showPatch(); return; }          // 미리보기
  if (params.get('room')) return;                                    // 초대 링크로 들어올 땐 방해하지 않음
  if (store.get('patchSeen', '') === PATCH.v) return;
  if (!store.get('nick', '')) { store.set('patchSeen', PATCH.v); return; } // 처음 온 사람에겐 띄우지 않음
  showPatch();
})();

/* ---------------- 공부방: 판 기록 · 연습 대국 · 복기 분석 ---------------- */
const PK = { p: '폰', n: '나이트', b: '비숍', r: '룩', q: '퀸', k: '킹' };
const eul = t => (t === 'n' ? '를' : '을');
const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1);
const fmtW = c => (Math.abs(c) >= 9000 ? (c > 0 ? '백 메이트' : '흑 메이트') : (c >= 0 ? '+' : '−') + (Math.abs(c) / 100).toFixed(1));
const fmtMe = c => (Math.abs(c) >= 9000 ? (c > 0 ? '메이트 승' : '메이트 패') : (c >= 0 ? '+' : '−') + (Math.abs(c) / 100).toFixed(1));
const povW = (cp, c) => (c === 'w' ? cp : -cp);
const CLS = {
  best: { label: '최선', mark: '✓' }, good: { label: '좋은 수', mark: '✓' }, ok: { label: '무난', mark: '' },
  inacc: { label: '부정확', mark: '?!' }, mistake: { label: '실수', mark: '?' }, blunder: { label: '블런더', mark: '??' }
};
const PHASE_KO = { open: '오프닝', mid: '중반', end: '종반' };
const RES_KO = { win: '승리', loss: '패배', draw: '무승부' };

/* ----- 저장 ----- */
const Study = {
  list() { try { return JSON.parse(store.get('games', '[]')) || []; } catch (e) { return []; } },
  put(rec) { const L = this.list().filter(r => r.id !== rec.id); L.unshift(rec); store.set('games', JSON.stringify(L.slice(0, 12))); },
  makeRecord() {
    const G = S.G; if (!G || !G.over || G.noRec || !G.log || G.log.length < 4) return null;
    const o = G.over, mine = viewColor(); let res = 'draw';
    if (o.type === 'mate' || o.type === 'resign') res = o.winner === mine ? 'win' : 'loss';
    let opp;
    if (S.online) { const oc = other(mine); opp = S.seats.filter((s, i) => s && (i % 2 ? 'b' : 'w') === oc).map(s => s.name).join(' · ') || '상대'; }
    else opp = `AI · ${LV[S.level - 1].n}`;
    return {
      id: String(S.online ? S.gid : S.gameId), ts: Date.now(), mine, res, opp, skills: !!G.skills,
      why: o.type === 'mate' ? '체크메이트' : o.type === 'resign' ? '기권' : (o.why || '무승부'),
      mode: S.online ? (G.two ? '2:2' : '1:1') : (S.practice ? '연습' : G.skills ? '스킬' : '일반'),
      log: G.log.map(x => [x.f, x.u, x.s, x.c === 'w' ? 0 : 1])
    };
  }
};

/* ----- 평가 · 판정 ----- */
async function evalPly(fen, uci, ms) {
  const r1 = await Engine.pick(fen, { skill: 20, movetime: ms, n: 1 });
  if (!r1) return null;
  const best = r1.lines[0];
  if (best.uci === uci) return { best, played: best, same: true };
  const r2 = await Engine.pick(fen, { skill: 20, movetime: ms, n: 1, searchmoves: [uci] });
  if (!r2) return null;
  return { best, played: r2.lines[0], same: false };
}
function judge(e) {
  const drop = Math.max(0, winPct(e.best.cp) - winPct(e.played.cp));
  const key = e.same ? 'best' : drop < 2 ? 'good' : drop < 5 ? 'ok' : drop < 10 ? 'inacc' : drop < 15 ? 'mistake' : 'blunder';
  return { key, drop, acc: Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669)) };
}
function phaseOf(fen, i) { return (fen.split(' ')[0].match(/[nbrqNBRQ]/g) || []).length <= 6 ? 'end' : (i < 20 ? 'open' : 'mid'); }
function pvNetLoss(fen, pv) { // 수순 앞 4수 동안 내가 잃은 기물 가치(손해면 양수)
  const ch = new Chess(fen), me = ch.turn(); let net = 0, first = null;
  for (let k = 0; k < Math.min(4, (pv || []).length); k++) {
    const u = pv[k], m = ch.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    if (!m) break;
    if (m.captured) { const v = VAL[m.captured]; if (m.color === me) net -= v; else { net += v; if (!first) first = { type: m.captured, san: m.san }; } }
  }
  return { net, first };
}
function explainPly(fen, uci, e, J, ph) {
  const ch = new Chess(fen), mv = ch.moves({ verbose: true }), by = u => mv.find(m => toUci(m) === u);
  const pm = by(uci), bm = by(e.best.uci);
  const out = { playedSan: pm ? pm.san : uci, bestSan: bm ? bm.san : e.best.uci, tag: 'ok', text: '' };
  if (!pm) return out;
  if (J.key === 'best') { out.tag = 'good'; out.text = '엔진이 고른 최선수와 같은 수예요.'; return out; }
  if (J.key === 'good') { out.tag = 'good'; out.text = `최선수(${out.bestSan})와 가치가 거의 같은 좋은 수예요.`; return out; }
  if (J.key === 'ok') { out.text = `큰 손해는 없어요. 엔진은 ${out.bestSan}를 조금 더 좋게 봤어요.`; return out; }
  const reply = (() => { const u = (e.played.pv || [])[1]; if (!u) return null; const c2 = new Chess(fen); c2.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); const m2 = c2.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); return m2 ? m2.san : null; })();
  const loss = pvNetLoss(fen, e.played.pv), gain = bm ? -pvNetLoss(fen, e.best.pv).net : 0;
  if (e.played.cp <= -9000) { out.tag = 'mateAllowed'; out.text = `이 수를 두면 상대가 체크메이트를 낼 수 있어요${reply ? ` (상대 수순: ${reply})` : ''}. 킹 주변을 먼저 확인해야 했어요.`; }
  else if (e.best.cp >= 9000 && e.played.cp < 9000) { out.tag = 'missedMate'; out.text = `체크메이트로 이어지는 수가 있었어요 (추천: ${out.bestSan}).`; }
  else if (loss.net >= 2 && loss.first) { out.tag = 'hung'; out.text = `이 수를 두면 상대의 ${loss.first.san} 한 수로 내 ${PK[loss.first.type]}${eul(loss.first.type)} 잃어요 (손실 약 ${loss.net}점). 추천: ${out.bestSan}.`; }
  else if (bm && bm.captured && !pm.captured && gain >= 1) { out.tag = 'missedCapture'; out.text = `상대 ${PK[bm.captured]}${eul(bm.captured)} 잡을 수 있었어요 (추천: ${out.bestSan}).`; }
  else if (bm && /[+#]/.test(bm.san)) { out.tag = 'missedCheck'; out.text = `상대 킹을 몰아붙일 수 있었어요 (추천: ${out.bestSan}).`; }
  else if (bm && /[kq]/.test(bm.flags)) { out.tag = 'pos'; out.text = `킹을 안전하게 하는 캐슬링이 더 좋았어요 (추천: ${out.bestSan}).`; }
  else if (bm && ph === 'open' && (bm.piece === 'n' || bm.piece === 'b')) { out.tag = 'pos'; out.text = `기물을 더 빨리 발전시키는 수가 있었어요 (추천: ${out.bestSan}).`; }
  else if (bm && bm.piece === 'p' && /[de]/.test(bm.to[0])) { out.tag = 'pos'; out.text = `중앙을 먼저 잡는 수가 좋았어요 (추천: ${out.bestSan}).`; }
  else { out.tag = 'pos'; out.text = `형세가 더 좋아지는 수가 있었어요 (추천: ${out.bestSan}).`; }
  return out;
}

/* ----- 연습 대국: 피드백 · 힌트 ----- */
function setFeedback(html, css) {
  const el = $('#fbChip'); if (!el) return;
  if (!html) { el.hidden = true; el.innerHTML = ''; return; }
  el.className = 'fbchip ' + (css || ''); el.innerHTML = html; el.hidden = false;
}
async function practiceFeedback(lg) {
  const gid = S.gameId; setFeedback('내 수를 평가하는 중…', 'wait');
  let e = null; try { e = await evalPly(lg.f, lg.u, 260); } catch (er) {}
  if (!e || !S.G || gid !== S.gameId) return;
  const j = judge(e), ex = explainPly(lg.f, lg.u, e, j, phaseOf(lg.f, S.G.log.length));
  const bad = j.key === 'inacc' || j.key === 'mistake' || j.key === 'blunder';
  setFeedback(`<b class="mk ${j.key}">${CLS[j.key].mark || '·'}</b> <b>${esc(lg.s)}</b> ${CLS[j.key].label}${bad ? ` — 추천 ${esc(ex.bestSan)}` : ''}<small>${esc(ex.text)}</small>`, j.key);
}
async function practiceHint() {
  if (!S.practice || !S.G || !isMyTurn()) { toast('내 차례에 눌러 주세요', 1200); return; }
  const key = S.G.fen, gid = S.gameId; setFeedback('힌트를 계산하는 중…', 'wait');
  let r = null; try { r = await Engine.pick(key, { skill: 20, movetime: 1800, n: 1 }); } catch (er) {}
  if (!r || !S.G || S.G.fen !== key || gid !== S.gameId) return;
  S.pHint = { key, uci: r.best }; renderArrow();
  const mv = new Chess(key).moves({ verbose: true }).find(m => toUci(m) === r.best);
  setFeedback(`💡 추천 수 <b>${esc(mv ? mv.san : r.best)}</b> · 평가 ${fmtW(povW(r.lines[0].cp, turnOf(S.G)))}<small>화살표를 따라 두면 좋아요</small>`, 'hint');
}

/* ----- 복기 화면 ----- */
const RV = { rec: null, an: null, pl: [], sum: null, i: 0, fens: [], after: [], flip: false, ret: 'home', token: 0 };
function rvXY(sq) { const f = FILES.indexOf(sq[0]), r = +sq[1] - 1; return RV.flip ? { x: 7 - f, y: r } : { x: f, y: 7 - r }; }
function rvBuildSquares() {
  const box = $('#rvSquares'); box.innerHTML = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const f = RV.flip ? 7 - x : x, r = RV.flip ? y : 7 - y, sq = FILES[f] + (r + 1);
    const d = document.createElement('div'); d.className = 'sq ' + ((f + r) % 2 ? 'l' : 'd'); d.dataset.sq = sq;
    if (y === 7) d.insertAdjacentHTML('beforeend', `<span class="co f">${FILES[f]}</span>`);
    if (x === 0) d.insertAdjacentHTML('beforeend', `<span class="co r">${r + 1}</span>`);
    box.appendChild(d);
  }
}
function arrowMarkup(from, to, xy, col) {
  const a = xy(from), b = xy(to), x1 = a.x + .5, y1 = a.y + .5, x2 = b.x + .5, y2 = b.y + .5, ang = Math.atan2(y2 - y1, x2 - x1), L = Math.hypot(x2 - x1, y2 - y1);
  const ex = x1 + Math.cos(ang) * (L - .32), ey = y1 + Math.sin(ang) * (L - .32);
  const hx = (d, s) => [x2 - Math.cos(ang) * .1 + Math.cos(ang + s) * d, y2 - Math.sin(ang) * .1 + Math.sin(ang + s) * d];
  const p1 = hx(.38, Math.PI * .82), p2 = hx(.38, -Math.PI * .82);
  return `<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" stroke="${col}" stroke-width=".16" stroke-linecap="round"/><polygon points="${x2 - Math.cos(ang) * .1},${y2 - Math.sin(ang) * .1} ${p1} ${p2}" fill="${col}"/>`;
}
function rvAfterFens(rec) {
  return rec.log.map(p => { const ch = new Chess(p[0]); ch.move({ from: p[1].slice(0, 2), to: p[1].slice(2, 4), promotion: p[1][4] }); return ch.fen(); });
}
function rvOpen(rec, ret) {
  RV.token = Math.random(); RV.rec = rec; RV.ret = ret || 'home'; RV.i = 0; RV.flip = rec.mine === 'b';
  RV.after = rvAfterFens(rec); RV.fens = rec.log.map(p => p[0]).concat([RV.after[RV.after.length - 1]]);
  RV.an = null; RV.pl = []; RV.sum = null;
  $('#rvSummary').innerHTML = ''; $('#rvDetail').innerHTML = ''; $('#rvMoves').innerHTML = ''; $('#rvGraph').innerHTML = '';
  rvBuildSquares(); show('review'); rvRender();
  if (rec.an) { RV.an = rec.an.map((c, i) => { const best = { uci: c.b[0], cp: c.b[1], pv: c.b[2] }, same = !!c.s; return { best, same, played: same ? best : { uci: rec.log[i][1], cp: c.p[0], pv: c.p[1] } }; }); rvReady(); return; }
  rvRun(rec);
}
async function rvRun(rec) {
  const tok = RV.token, N = rec.log.length, an = [];
  $('#rvProg').hidden = false; $('#rvBar').style.width = '0%'; $('#rvProgTxt').textContent = '엔진이 한 수씩 평가하는 중…';
  Engine.init().catch(() => {});
  for (let i = 0; i < N; i++) {
    let e = null; try { e = await evalPly(rec.log[i][0], rec.log[i][1], N > 60 ? 220 : 300); } catch (er) {}
    if (RV.token !== tok) return;
    if (!e) { $('#rvProg').hidden = true; $('#rvSummary').innerHTML = '<p class="rvnote">엔진을 불러오지 못해서 분석할 수 없어요. 연결을 확인하고 다시 열어 주세요.</p>'; return; }
    an.push(e); $('#rvBar').style.width = Math.round((i + 1) / N * 100) + '%'; $('#rvProgTxt').textContent = `${i + 1} / ${N}수 분석 중…`;
  }
  $('#rvProg').hidden = true; RV.an = an;
  rec.an = an.map(e => ({ s: e.same ? 1 : 0, b: [e.best.uci, e.best.cp, e.best.pv.slice(0, 6)], p: e.same ? null : [e.played.cp, e.played.pv.slice(0, 6)] }));
  Study.put(rec); rvReady();
}
function rvReady() { rvDerive(); RV.i = RV.sum.crit.length ? RV.sum.crit[0] : 0; rvRender(); }
function rvDerive() {
  const rec = RV.rec, an = RV.an, me = rec.mine;
  const pl = an.map((e, i) => {
    const [fen, uci, san, ci] = rec.log[i], c = ci === 0 ? 'w' : 'b', j = judge(e), ph = phaseOf(fen, i), ex = explainPly(fen, uci, e, j, ph), num = +fen.split(' ')[5] || Math.floor(i / 2) + 1;
    return { e, j, ex, c, ph, san, uci, num, mine: c === me, label: `${num}${c === 'w' ? '.' : '…'} ${san}`, cardBefore: !!rec.skills && i > 0 && RV.after[i - 1].split(' ')[0] !== fen.split(' ')[0] };
  });
  const ser = [povW(an[0].best.cp, pl[0].c)]; pl.forEach(p => ser.push(povW(p.e.played.cp, p.c)));
  const mineP = pl.filter(p => p.mine), oppP = pl.filter(p => !p.mine);
  const avg = a => (a.length ? Math.round(a.reduce((s, p) => s + p.j.acc, 0) / a.length) : 0), cnt = k => mineP.filter(p => p.j.key === k).length;
  const phases = {}; ['open', 'mid', 'end'].forEach(k => { const a = mineP.filter(p => p.ph === k); phases[k] = { n: a.length, acc: avg(a) }; });
  const crit = mineP.filter(p => p.j.drop >= 10).sort((a, b) => b.j.drop - a.j.drop).map(p => pl.indexOf(p)).slice(0, 4);
  const peak = Math.max(...ser.map(v => (me === 'w' ? v : -v)));
  RV.pl = pl; RV.sum = { ser, myAcc: avg(mineP), opAcc: avg(oppP), b: cnt('blunder'), m: cnt('mistake'), n: cnt('inacc'), phases, crit, peak };
  RV.sum.why = rvVerdict();
}
function rvVerdict() {
  const rec = RV.rec, sm = RV.sum, pl = RV.pl, L = [], bad = k => pl.filter(p => p.mine && p.ex.tag === k && p.j.drop >= 10).length;
  const c0 = sm.crit.length ? pl[sm.crit[0]] : null;
  if (rec.res === 'win') L.push(['🏆', '이겼어요! 그래도 놓친 부분을 짚어볼게요.']);
  else if (rec.res === 'loss') L.push(['📉', '졌어요. 원인을 정리했어요.']); else L.push(['🤝', '비겼어요. 승부가 갈릴 수 있던 곳을 짚어볼게요.']);
  if (c0) L.push(['🎯', `${rec.res === 'win' ? '가장 아쉬운 장면' : '결정적 장면'}은 ${c0.label} (${CLS[c0.j.key].label})예요. 내 기준 평가가 ${fmtMe(c0.e.best.cp)} → ${fmtMe(c0.e.played.cp)}로 흔들렸어요. ${c0.ex.text}`]);
  else L.push(['🧩', rec.res === 'win' ? '큰 실수 없이 깔끔하게 뒀어요!' : '큰 실수는 없었어요. 작은 부정확이 쌓여서 조금씩 밀렸어요.']);
  if (rec.res !== 'win' && sm.peak >= 150) L.push(['⚖️', `한때 ${fmtMe(sm.peak)}(내 기준)로 앞서 있었어요. 이길 수 있던 판이라 더 아쉬워요.`]);
  if (bad('hung')) L.push(['⚠️', `기물을 공짜로 내준 수가 ${bad('hung')}번 있었어요. 수를 두기 전에 "이 기물이 잡히나?"를 한 번 확인하세요.`]);
  if (bad('missedMate') + bad('missedCapture') + bad('missedCheck')) L.push(['👀', `잡거나 몰아붙일 기회를 놓친 장면이 ${bad('missedMate') + bad('missedCapture') + bad('missedCheck')}번 있었어요. 상대 기물이 지켜지는지 먼저 살펴보세요.`]);
  if (bad('mateAllowed')) L.push(['🛑', '체크메이트를 허용한 수가 있었어요. 내 킹 주변 칸을 한 번 더 확인하세요.']);
  const ph = Object.entries(sm.phases).filter(([, v]) => v.n >= 3).sort((a, b) => a[1].acc - b[1].acc);
  if (ph.length > 1 && ph[0][1].acc < 80 && ph[ph.length - 1][1].acc - ph[0][1].acc >= 8) L.push(['📊', `${PHASE_KO[ph[0][0]]}이 가장 약했어요 (정확도 ${ph[0][1].acc}%).`]);
  if (rec.res !== 'win') {
    const tip = bad('hung') ? '공부 포인트: 기물이 공격받는지·지켜지는지 매 수 확인하는 습관.' : phaseTip(ph.length ? ph[0][0] : 'mid');
    L.push(['📚', tip]);
  }
  return L;
}
function phaseTip(k) {
  return k === 'open' ? '공부 포인트: 오프닝은 중앙 폰 → 나이트·비숍 발전 → 캐슬링 순서를 지켜 보세요.'
    : k === 'end' ? '공부 포인트: 종반엔 킹도 적극적으로 쓰고, 폰이 승격하기까지 몇 수인지 세어 보세요.'
    : '공부 포인트: 중반엔 상대의 위협을 먼저 보고, 내 수는 그 다음에 고르세요.';
}
function rvDetailHtml() {
  const rec = RV.rec, N = rec.log.length, i = RV.i;
  if (!RV.pl.length) return '<p class="rvnote">분석이 끝나면 여기에 설명이 나와요.</p>';
  if (i >= N) return `<div class="dtop"><b>최종 局面</b><em>${RES_KO[rec.res]} · ${esc(rec.why)}</em></div><p>마지막 수까지 봤어요. 위 요약에서 결정적 장면을 눌러 다시 볼 수 있어요.</p>`;
  const p = RV.pl[i], J = CLS[p.j.key];
  let h = `<div class="dtop"><span class="mk ${p.j.key}">${J.mark || '·'}</span><b>${esc(p.label)}</b><em>${p.mine ? '내 수' : '상대 수'} · ${J.label}</em></div>`;
  if (p.cardBefore) h += '<p class="rvnote">🃏 이 수 앞에서 카드 효과로 판이 바뀌었어요.</p>';
  h += `<p>${esc(p.ex.text)}</p><div class="dnums"><span>둔 수 평가 <b>${fmtW(povW(p.e.played.cp, p.c))}</b></span>${p.e.same ? '' : `<span>추천 수 <b>${esc(p.ex.bestSan)}</b> ${fmtW(povW(p.e.best.cp, p.c))}</span>`}<span>백 기준</span></div>`;
  h += '<button class="btn ghost thin" id="rvPlay">이 局面에서 다시 두기</button>';
  return h;
}
function rvSummaryHtml() {
  const sm = RV.sum, rec = RV.rec;
  let h = `<div class="accrow"><div><small>내 정확도</small><b>${sm.myAcc}%</b></div><div><small>상대 정확도</small><b>${sm.opAcc}%</b></div><div><small>블런더·실수·부정확</small><b>${sm.b}·${sm.m}·${sm.n}</b></div></div>`;
  h += '<ul class="why">' + sm.why.map(([ic, t]) => `<li><span>${ic}</span><p>${esc(t)}</p></li>`).join('') + '</ul>';
  if (sm.crit.length) h += '<div class="crits">' + sm.crit.map(i => `<button class="crit" data-i="${i}">${esc(RV.pl[i].label)} <b class="mk ${RV.pl[i].j.key}">${CLS[RV.pl[i].j.key].mark}</b></button>`).join('') + '</div>';
  return h;
}
function rvMovesHtml() {
  return RV.pl.map((p, i) => `${p.c === 'w' || i === 0 ? `<span class="n">${p.num}${p.c === 'w' ? '.' : '…'}</span>` : ''}<button class="m ${p.j.key}${p.mine ? ' mine' : ''}${i === RV.i ? ' on' : ''}" data-i="${i}">${esc(p.san)}<i>${CLS[p.j.key].mark}</i></button>`).join('');
}
function rvGraph() {
  const svg = $('#rvGraph'); if (!RV.sum) { svg.innerHTML = ''; return; }
  const W = Math.max(260, svg.clientWidth || 300), H = 90, N = RV.rec.log.length, ser = RV.sum.ser;
  const X = k => 6 + (W - 12) * k / Math.max(1, N), Y = c => H / 2 - Math.max(-600, Math.min(600, c)) / 600 * (H / 2 - 8);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const line = ser.map((c, k) => `${k ? 'L' : 'M'}${X(k).toFixed(1)} ${Y(c).toFixed(1)}`).join(' ');
  let s = `<line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="rgba(217,181,106,.3)" stroke-dasharray="3 4"/>`;
  s += `<path d="${line} L${X(N)} ${H / 2} L${X(0)} ${H / 2} Z" fill="rgba(217,181,106,.16)"/><path d="${line}" fill="none" stroke="#f4e2ac" stroke-width="1.6"/>`;
  RV.pl.forEach((p, i) => { if (p.j.key === 'blunder' || p.j.key === 'mistake') s += `<circle cx="${X(i + 1)}" cy="${Y(ser[i + 1])}" r="${p.mine ? 4.2 : 3}" fill="${p.j.key === 'blunder' ? '#e0525c' : '#e89a4a'}" opacity="${p.mine ? 1 : .55}"/>`; });
  s += `<line x1="${X(RV.i)}" y1="0" x2="${X(RV.i)}" y2="${H}" stroke="#fff" stroke-opacity=".75" stroke-width="1.2"/>`;
  svg.innerHTML = s;
}
function rvRender() {
  const rec = RV.rec; if (!rec) return; const N = rec.log.length, i = RV.i;
  const sq = {}; $$('#rvSquares .sq').forEach(e => { sq[e.dataset.sq] = e; e.classList.remove('last'); });
  if (i > 0) { const u = rec.log[i - 1][1]; [u.slice(0, 2), u.slice(2, 4)].forEach(s => sq[s] && sq[s].classList.add('last')); }
  const layer = $('#rvPieces'); layer.innerHTML = '';
  pcs(new Chess(RV.fens[i])).forEach(p => { const el = document.createElement('div'); el.className = 'pc noanim'; el.style.backgroundImage = `url("${PIECES[p.color + p.type]}")`; const { x, y } = rvXY(p.square); el.style.setProperty('--x', x); el.style.setProperty('--y', y); layer.appendChild(el); });
  let ar = ''; const p = RV.pl[i];
  if (p) { ar += arrowMarkup(p.uci.slice(0, 2), p.uci.slice(2, 4), rvXY, 'rgba(244,226,172,.9)'); if (!p.e.same) ar += arrowMarkup(p.e.best.uci.slice(0, 2), p.e.best.uci.slice(2, 4), rvXY, 'rgba(110,215,160,.9)'); }
  $('#rvArrows').innerHTML = ar;
  $('#rvDetail').innerHTML = rvDetailHtml();
  if (RV.sum) { if (!$('#rvSummary').firstChild || $('#rvSummary').querySelector('.rvnote')) $('#rvSummary').innerHTML = rvSummaryHtml(); }
  $('#rvMoves').innerHTML = RV.pl.length ? rvMovesHtml() : '';
  const on = $('#rvMoves .m.on'); if (on) { const box = $('#rvMoves'); box.scrollTop = on.offsetTop - box.clientHeight / 2; }
  $('#rvFirst').disabled = $('#rvPrev').disabled = i <= 0; $('#rvNext').disabled = $('#rvLast').disabled = i >= N;
  rvGraph();
}
function rvSelect(i) { if (!RV.rec) return; RV.i = Math.max(0, Math.min(RV.rec.log.length, i)); rvRender(); }
function rvBack() {
  RV.token = Math.random(); Engine.stopAnalysis(); $('#rvProg').hidden = true;
  if (RV.ret === 'game' && S.G) { show('game'); $('#result').hidden = false; } else show('home');
}
function rvPractice() {
  if (!RV.rec || RV.i >= RV.rec.log.length) return;
  const fen = RV.fens[RV.i]; RV.token = Math.random(); Engine.stopAnalysis();
  $('#result').hidden = true; Net.close(); S.G = null; S.online = false; startLocal(false, true, fen);
}
function openGameList() {
  const L = Study.list(), box = $('#gameList');
  box.innerHTML = L.map(r => { const d = new Date(r.ts), t = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `<button class="gitem" data-id="${esc(r.id)}"><span class="gb ${r.res}">${{ win: '승', loss: '패', draw: '무' }[r.res]}</span><span class="gt"><b>${esc(r.opp)} · ${esc(r.mode)}</b><small>${t} · ${r.log.length}수 · ${esc(r.why)}${r.an ? ' · 분석됨' : ''}</small></span></button>`; }).join('') || '<p class="rvnote">아직 저장된 판이 없어요.</p>';
  $('#rvList').hidden = false;
}
function wireStudy() {
  $('#goPractice').onclick = () => { $('#study').hidden = true; S.pendingSkills = false; S.pendingPractice = true; $('#setupTitle').textContent = '연습 대국'; $('#setup').hidden = false; };
  $('#goReview').onclick = () => { if (!Study.list().length) { toast('저장된 판이 없어요. 한 판 두고 오세요', 2200); return; } $('#study').hidden = true; openGameList(); };
  $('#study').addEventListener('click', e => { if (e.target.id === 'study') $('#study').hidden = true; });
  $('#rvList').addEventListener('click', e => { if (e.target.id === 'rvList') $('#rvList').hidden = true; });
  $('#gameList').onclick = e => { const b = e.target.closest('[data-id]'); if (!b) return; const rec = Study.list().find(r => r.id === b.dataset.id); if (rec) { $('#rvList').hidden = true; rvOpen(rec, 'home'); } };
  $('#rReview').onclick = () => { const rec = S.lastRec; if (!rec) return; $('#result').hidden = true; rvOpen(rec, 'game'); };
  $('#rvBack').onclick = rvBack;
  $('#rvFirst').onclick = () => rvSelect(0); $('#rvPrev').onclick = () => rvSelect(RV.i - 1);
  $('#rvNext').onclick = () => rvSelect(RV.i + 1); $('#rvLast').onclick = () => rvSelect(1e9);
  $('#rvMoves').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) rvSelect(+b.dataset.i); });
  $('#rvSummary').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) { rvSelect(+b.dataset.i); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
  $('#rvDetail').addEventListener('click', e => { if (e.target.closest('#rvPlay')) rvPractice(); });
  $('#rvGraph').addEventListener('click', e => { if (!RV.rec) return; const r = e.currentTarget.getBoundingClientRect(); rvSelect(Math.round((e.clientX - r.left - 6) / (r.width - 12) * RV.rec.log.length)); });
  $('#hintBtn').onclick = practiceHint;
  addEventListener('keydown', e => { if (!$('#review').classList.contains('active')) return; if (e.key === 'ArrowLeft') rvSelect(RV.i - 1); else if (e.key === 'ArrowRight') rvSelect(RV.i + 1); });
  addEventListener('resize', () => { if ($('#review').classList.contains('active')) rvGraph(); });
}
wireStudy();
