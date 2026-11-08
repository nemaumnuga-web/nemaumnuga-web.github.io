/* ===================== 기술방 (tech.js) =====================
   모션 설명 → 예시 문제 → 틀리면 되돌리고 설명 → 맞아야 다음 단계
   수준: 초보자 / 중급자 / 고급자(감 익히기) / 선생님
   app.js 의 전역(Chess, Engine, PIECES, pcs, arrowMarkup, evalPly, judge, winPct, PK, eul, VAL …)을 사용한다. */

const TLV = {
  b: { n: '초보자', e: 'Débutant', ico: '♙', d: '기물 움직임부터 체크메이트·특수 규칙·오프닝까지, 한 걸음씩 안내해요' },
  m: { n: '중급자', e: 'Intermédiaire', ico: '♘', d: '포크·핀·스큐어 같은 전술 기술을 배우고 바로 써 봐요' },
  a: { n: '고급자', e: 'Avancé', ico: '♕', d: '설명은 짧게 — 전술 스프린트 · 위협 읽기 · 형세 판단 · 내 실수 복습으로 감을 익혀요' },
  t: { n: '선생님', e: 'Maître', ico: '♔', d: '전 과정을 잠금 없이 열람 · 정답과 해설을 바로 확인 — 누군가를 가르칠 때 쓰세요' }
};
const TCOL = { y: 'rgba(244,226,172,.92)', g: 'rgba(110,215,160,.95)', r: 'rgba(238,104,114,.95)', b: 'rgba(125,184,244,.95)' };
const PMSG = {
  p: '폰은 앞으로 걷고, 잡을 때만 대각선 앞으로 가요.',
  n: '나이트는 L자(두 칸 + 한 칸)로만 움직여요.',
  b: '비숍은 대각선으로만 움직여요.',
  r: '룩은 가로·세로로만 움직여요.',
  q: '퀸은 가로·세로·대각선으로 움직여요. 다른 기물을 뛰어넘진 못해요.',
  k: '킹은 한 칸씩만 가고, 상대가 공격하는 칸으로는 갈 수 없어요.'
};
const LETTERS = ['A', 'B', 'C', 'D'];

/* ---------- 저장 ---------- */
const Tech = {
  d: (() => { try { return JSON.parse(store.get('tech', '{}')) || {}; } catch (e) { return {}; } })(),
  save() { store.set('tech', JSON.stringify(this.d)); },
  lv() { return this.d.lv || null; },
  setLv(v) { this.d.lv = v; this.save(); },
  done(id) { return !!(this.d.done && this.d.done[id]); },
  stars(id) { const r = this.d.done && this.d.done[id]; return r ? r.s : 0; },
  mark(id, wrong) { (this.d.done = this.d.done || {})[id] = { s: wrong <= 0 ? 3 : wrong <= 2 ? 2 : 1, w: wrong, ts: Date.now() }; this.save(); },
  prog(id) { return (this.d.prog && this.d.prog[id]) || 0; },
  setProg(id, n) { (this.d.prog = this.d.prog || {})[id] = n; this.save(); },
  all() { return (typeof LESSONS !== 'undefined' ? LESSONS : []); },
  find(id) { return id === 'mine' ? mineLesson() : this.all().find(l => l.id === id); },
  path(lv) { return this.all().filter(l => l.lv === lv); },
  open(l) {
    const lv = this.lv(); if (lv === 't' || l.lv === 'a') return true;
    if (l.lv !== lv && lv !== null) return true;       // 다른 수준의 레슨은 자유롭게 둘러보기
    const p = this.path(l.lv), i = p.indexOf(l); return i <= 0 || this.done(p[i - 1].id);
  }
};

/* ---------- 체스 보조 ---------- */
function forceMove(ch, from, to, promo) {              // 차례와 상관없이 기물을 움직인다(설명용)
  let m = ch.move({ from, to, promotion: promo });
  if (m) return m;
  const p = ch.get(from); if (!p) return null;
  const f = ch.fen().split(' '); f[1] = p.color; f[3] = '-';
  const c2 = new Chess(f.join(' ')); m = c2.move({ from, to, promotion: promo });
  if (m) ch.load(c2.fen());
  return m;
}
function movesOf(ch, sq) {
  const p = ch.get(sq); if (!p) return [];
  const f = ch.fen().split(' '); f[1] = p.color; f[3] = '-';
  return new Chess(f.join(' ')).moves({ square: sq, verbose: true });
}
function lineNet(fen, pv, me) {                          // 앞 4수 동안 내(me)가 얻은 기물 점수(손해면 음수)
  const ch = new Chess(fen); let net = 0, first = null;
  for (let k = 0; k < Math.min(4, (pv || []).length); k++) {
    const u = pv[k], m = ch.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); if (!m) break;
    if (m.captured) { if (m.color === me) net += VAL[m.captured]; else { net -= VAL[m.captured]; if (!first) first = { san: m.san, type: m.captured }; } }
  }
  return { net, first };
}
const tStrip = h => String(h).replace(/<[^>]+>/g, '');
const sanOf = (fen, u) => { try { const m = new Chess(fen).moves({ verbose: true }).find(x => toUci(x) === u); return m ? m.san : u; } catch (e) { return u; } };

/* ---------- 모션 보드 ---------- */
const TB = {
  flip: false, els: {}, sqm: {}, ch: null, onSq: null, fast: false,
  init() {
    this.sqs = $('#tSquares'); this.pl = $('#tPieces'); this.ar = $('#tArrows'); this.hi = $('#tFxHi'); this.root = $('#tBoard');
    this.build();
    this.sqs.addEventListener('click', e => { const s = e.target.closest('.sq'); if (s && this.onSq) this.onSq(s.dataset.sq); });
    piecesReady.then(() => this.refresh());
  },
  xy(sq) { const f = FILES.indexOf(sq[0]), r = +sq[1] - 1; return this.flip ? { x: 7 - f, y: r } : { x: f, y: 7 - r }; },
  build() {
    this.sqs.innerHTML = ''; this.sqm = {};
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const f = this.flip ? 7 - x : x, r = this.flip ? y : 7 - y, sq = FILES[f] + (r + 1);
      const d = document.createElement('div'); d.className = 'sq ' + ((f + r) % 2 ? 'l' : 'd'); d.dataset.sq = sq;
      if (y === 7) d.insertAdjacentHTML('beforeend', `<span class="co f">${FILES[f]}</span>`);
      if (x === 0) d.insertAdjacentHTML('beforeend', `<span class="co r">${r + 1}</span>`);
      this.sqs.appendChild(d); this.sqm[sq] = d;
    }
  },
  slow(on) { this.root.classList.toggle('tslow', !!on); this.dur = on ? 780 : 300; },
  set(fen, flip) {
    if (flip !== undefined && !!flip !== this.flip) { this.flip = !!flip; this.build(); }
    this.ch = new Chess(fen); this.pl.innerHTML = ''; this.els = {};
    pcs(this.ch).forEach(p => this.add(p)); this.clearMarks();
  },
  place(el, sq) { const { x, y } = this.xy(sq); el.style.setProperty('--x', x); el.style.setProperty('--y', y); el.dataset.sq = sq; },
  add(p, fade) {
    const el = document.createElement('div'); el.className = 'pc noanim' + (fade ? ' fadein' : ''); el.dataset.pc = p.color + p.type;
    el.style.backgroundImage = `url("${PIECES[p.color + p.type]}")`; this.place(el, p.square); this.pl.appendChild(el); this.els[p.square] = el;
    void el.offsetWidth; el.classList.remove('noanim'); return el;
  },
  refresh() { for (const sq in this.els) { const el = this.els[sq]; el.style.backgroundImage = `url("${PIECES[el.dataset.pc]}")`; } },
  async move(uci, fast) {
    const from = uci.slice(0, 2), to = uci.slice(2, 4), pr = uci[4];
    const m = forceMove(this.ch, from, to, pr); if (!m) return null;
    const el = this.els[from]; if (!el) { this.set(this.ch.fen()); return m; }
    const capSq = m.flags.indexOf('e') >= 0 ? to[0] + from[1] : to;
    const capEl = m.captured ? this.els[capSq] : null; if (capEl) delete this.els[capSq];
    delete this.els[from];
    if (fast) el.classList.add('noanim');
    this.place(el, to); this.els[to] = el;
    if (capEl) { capEl.classList.add('gone'); setTimeout(() => capEl.remove(), fast ? 0 : 520); }
    if (m.flags.indexOf('k') >= 0 || m.flags.indexOf('q') >= 0) {
      const r = m.color === 'w' ? '1' : '8', ks = m.flags.indexOf('k') >= 0, rf = (ks ? 'h' : 'a') + r, rt = (ks ? 'f' : 'd') + r, rel = this.els[rf];
      if (rel) { delete this.els[rf]; if (fast) rel.classList.add('noanim'); this.place(rel, rt); this.els[rt] = rel; if (fast) { void rel.offsetWidth; rel.classList.remove('noanim'); } }
    }
    if (m.promotion) {
      const sw = () => { el.dataset.pc = m.color + m.promotion; el.style.backgroundImage = `url("${PIECES[m.color + m.promotion]}")`; el.classList.add('promo'); };
      if (fast) sw(); else setTimeout(sw, this.dur * .8);
    }
    if (fast) { void el.offsetWidth; el.classList.remove('noanim'); }
    Object.values(this.sqm).forEach(d => d.classList.remove('last')); this.sqm[from].classList.add('last'); this.sqm[to].classList.add('last');
    if (!fast) { if (m.captured) Snd.capture(); else Snd.move(); }
    await sleep(fast ? 20 : this.dur + 60);
    return m;
  },
  async revert(m, fenBefore) {                         // 틀린 수를 부드럽게 되돌린다
    this.hi.innerHTML = '';
    if (/[kqe]/.test(m.flags) || m.promotion || !this.els[m.to]) { this.set(fenBefore); return; }
    const el = this.els[m.to]; this.place(el, m.from); delete this.els[m.to]; this.els[m.from] = el;
    if (m.captured) { await sleep(280); this.add({ type: m.captured, color: other(m.color), square: m.to }, true); }
    await sleep(360); this.ch = new Chess(fenBefore);
    Object.values(this.sqm).forEach(d => d.classList.remove('last'));
  },
  clearMarks() {
    Object.values(this.sqm).forEach(d => d.classList.remove('sel', 'dot', 'cap', 'hl', 'last', 'chk', 'bad'));
    this.hi.innerHTML = ''; this.ar.innerHTML = '';
  },
  hl(list) { Object.values(this.sqm).forEach(d => d.classList.remove('hl')); (list || []).forEach(s => this.sqm[s] && this.sqm[s].classList.add('hl')); },
  sel(sq) { Object.values(this.sqm).forEach(d => d.classList.remove('sel')); if (sq) this.sqm[sq].classList.add('sel'); },
  dots(ms) {
    Object.values(this.sqm).forEach(d => d.classList.remove('dot', 'cap'));
    (ms || []).forEach(m => this.sqm[m.to].classList.add(m.captured || /e/.test(m.flags) ? 'cap' : 'dot'));
  },
  badge(sq, kind, txt) {
    const { x, y } = this.xy(sq), i = document.createElement('i');
    i.className = 'bd ' + kind; i.dataset.g = txt || { x: '✕', ok: '✓', q: '?', warn: '!' }[kind] || '';
    i.style.left = x * 12.5 + '%'; i.style.top = y * 12.5 + '%'; this.hi.appendChild(i);
  },
  arrows(list) {
    this.ar.innerHTML = (list || []).map(a => `<g class="tar">${arrowMarkup(a[0], a[1], s => this.xy(s), TCOL[a[2] || 'y'])}</g>`).join('');
  },
  shake() { this.root.classList.remove('tshake'); void this.root.offsetWidth; this.root.classList.add('tshake'); }
};

/* ---------- 재생기(모션 설명) ---------- */
const TP = { tok: 0, paused: false, si: 0, L: null };
const tAbort = { stop: true };
async function twait(ms) {
  const t = TP.tok; let left = ms;
  while (left > 0) { if (t !== TP.tok) throw tAbort; if (TP.paused) { await sleep(100); continue; } const d = Math.min(80, left); await sleep(d); left -= d; }
  if (t !== TP.tok) throw tAbort;
}
function effLv(L) { const v = Tech.lv(); return v === 'b' || v === 'm' ? v : (L.lv === 'b' ? 'b' : 'm'); }
function cap(html) { const el = $('#tCap'); el.innerHTML = html || ''; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
function sceneSteps(L, sc) { const lv = effLv(L); return sc.steps.filter(s => !s.lv || s.lv === lv); }
async function doStep(s, fast, pace) {
  if (s.set) TB.set(s.set, s.flip);
  if (s.clr) TB.clearMarks();
  if (s.hl) TB.hl(s.hl);
  if (s.dots) { const ms = movesOf(TB.ch, s.dots); TB.dots(ms); TB.sel(s.dots); }
  if (s.nodots) { TB.dots([]); TB.sel(null); }
  if (s.c !== undefined) cap(s.c);
  const mvs = s.mv ? [].concat(s.mv) : [];
  for (const u of mvs) { await TB.move(u, fast); }
  if (s.ar) TB.arrows(s.ar);
  (s.x || []).forEach(q => TB.badge(q, 'x')); (s.ok || []).forEach(q => TB.badge(q, 'ok')); (s.q || []).forEach(q => TB.badge(q, 'q'));
  if (!fast) {
    let w = s.w; if (w === undefined) w = s.c ? Math.max(1700, tStrip(s.c).length * 66) : (mvs.length ? 300 : 500);
    await twait(w * pace);
  }
}
async function playScene(L, si, fast) {
  const t = ++TP.tok; TP.si = si; TP.paused = false; $('#tPause').textContent = '⏸'; TB.onSq = null; TB.slow(!fast);
  const sc = L.scenes[si], steps = sceneSteps(L, sc), pace = effLv(L) === 'b' ? 1.25 : 1;
  TB.set(sc.fen, sc.flip); TB.root.classList.remove('tdrill');
  $('#tBar').style.width = '0%';
  try {
    for (let k = 0; k < steps.length; k++) {
      if (t !== TP.tok) return;
      await doStep(steps[k], fast, pace);
      $('#tBar').style.width = Math.round((k + 1) / steps.length * 100) + '%';
    }
    $('#tBar').style.width = '100%';
  } catch (e) { if (e !== tAbort) console.error(e); }
}

/* ---------- 화면 ---------- */
function tShow(id) { show(id); }
let TL = { L: null, stage: 'scene', i: 0 };               // 현재 레슨
const TD = { d: null, i: -1, k: 0, wrong: 0, busy: false, sel: null, done: false, t0: 0, tot: 0, hint: false, tried: {} };

function techEnter() {
  if (!Tech.lv()) { openLevelSheet(true); return; }
  renderTechHome(); tShow('techHome');
}
function openLevelSheet(first) {
  const box = $('#tLvList');
  box.innerHTML = Object.keys(TLV).map(k => `<button class="sopt lvopt${Tech.lv() === k ? ' on' : ''}" data-lv="${k}"><b><span class="lvi">${TLV[k].ico}</span>${TLV[k].n}<em>${TLV[k].e}</em></b><small>${TLV[k].d}</small></button>`).join('');
  $('#tLvTitle').textContent = first ? '어느 수준에서 시작할까요?' : '수준 바꾸기';
  $('#tLvSub').textContent = first ? '고른 수준에 맞는 기술과 튜토리얼이 열려요. 언제든 바꿀 수 있어요.' : '진행 기록은 그대로 남아요.';
  $('#techLv').hidden = false;
}
function lessonCard(l) {
  const open = Tech.open(l), done = Tech.done(l.id), st = Tech.stars(l.id), n = l.drills.length, mine = l.id === 'mine';
  const stars = done ? '★'.repeat(st) + '☆'.repeat(3 - st) : '';
  const tag = l.scenes && l.scenes.length ? `설명 ${l.scenes.length} · 예제 ${n}` : `문제 ${n}`;
  return `<button class="tcard${done ? ' done' : ''}${open ? '' : ' lock'}" data-id="${l.id}" ${open ? '' : 'aria-disabled="true"'}>
    <span class="tci">${open ? l.ico : '🔒'}</span><span class="tct"><b>${esc(l.t)}</b><small>${esc(l.sub)}</small><i>${tag}${stars ? ' · <u>' + stars + '</u>' : ''}</i></span></button>`;
}
function renderTechHome() {
  const lv = Tech.lv(), I = TLV[lv];
  let h = `<div class="thhead"><span class="thico">${I.ico}</span><div><b>${I.n}</b><small>${I.d}</small></div><button class="btn ghost thin" id="thChange">수준 바꾸기</button></div>`;
  const grp = (k, title) => { const p = Tech.path(k); if (!p.length) return ''; const dn = p.filter(l => Tech.done(l.id)).length; return `<h3 class="thsec">${title}<em>${dn} / ${p.length}</em></h3><div class="tlist">${p.map(lessonCard).join('')}</div>`; };
  const mineN = mineLesson().drills.length;
  const mineCard = `<h3 class="thsec">내 실수 복습<em>${mineN ? mineN + '문제' : '준비 중'}</em></h3><div class="tlist"><button class="tcard${mineN ? '' : ' lock'}" data-id="mine"><span class="tci">🎯</span><span class="tct"><b>내가 틀렸던 局面 다시 풀기</b><small>${mineN ? '복기에서 분석한 내 실수 장면으로 만든 문제예요' : '대국을 두고 “복기 · 분석”을 열면 여기에 문제가 생겨요'}</small><i>${mineN ? mineN + '문제' : '아직 없음'}</i></span></button></div>`;
  if (lv === 'b') h += grp('b', '초보자 코스') + `<details class="thmore"><summary>다른 수준 둘러보기</summary>${grp('m', '중급자 코스')}${grp('a', '고급자 · 감 익히기')}</details>`;
  else if (lv === 'm') h += grp('m', '중급자 코스') + `<details class="thmore"><summary>다른 수준 둘러보기</summary>${grp('b', '초보자 코스')}${grp('a', '고급자 · 감 익히기')}</details>`;
  else if (lv === 'a') h += grp('a', '감 익히기') + mineCard + `<details class="thmore"><summary>기초·전술 복습</summary>${grp('b', '초보자 코스')}${grp('m', '중급자 코스')}</details>`;
  else h += `<p class="thnote">선생님 모드: 모든 레슨이 열려 있고, 예제에서 <b>정답 보기</b>가 항상 켜져 있어요.</p>` + grp('b', '초보자 코스') + grp('m', '중급자 코스') + grp('a', '고급자 · 감 익히기') + mineCard;
  $('#thBody').innerHTML = h;
}

/* ---------- 레슨 열기 ---------- */
function openLesson(id) {
  const L = Tech.find(id); if (!L || !L.drills.length) { toast('아직 문제가 없어요. 대국 후 복기를 열어 보세요', 2400); return; }
  if (!Tech.open(L)) { toast('앞 레슨을 먼저 끝내야 열려요', 2000); return; }
  TL = { L, stage: 'scene', i: 0 }; TP.L = L; TD.tot = 0;
  $('#tTitle').textContent = L.t; $('#tLvChip').textContent = TLV[Tech.lv()].n;
  tShow('techLesson'); Engine.init().catch(() => {});
  buildDots(); $('#tDone').hidden = true; $('#tSide').hidden = false;
  if (L.scenes && L.scenes.length) { gotoScene(0); } else { startDrill(Tech.lv() === 'a' ? 0 : Math.min(Tech.prog(L.id), L.drills.length - 1)); }
}
function buildDots() {
  const L = TL.L, sc = (L.scenes || []).length, n = L.drills.length;
  $('#tDots').innerHTML = (sc ? Array.from({ length: sc }, (_, i) => `<i class="dt s" data-k="s${i}"></i>`).join('') + '<b class="dsep"></b>' : '') + Array.from({ length: n }, (_, i) => `<i class="dt d" data-k="d${i}"></i>`).join('');
}
function paintDots() {
  const L = TL.L; $$('#tDots .dt').forEach(e => {
    const k = e.dataset.k, i = +k.slice(1), cur = (TL.stage === 'scene' && k[0] === 's' && i === TL.i) || (TL.stage === 'drill' && k[0] === 'd' && i === TL.i);
    const done = (k[0] === 's' && (TL.stage === 'drill' || TL.stage === 'done' || i < TL.i)) || (k[0] === 'd' && (TL.stage === 'done' || i < TL.i || (i === TL.i && TD.done)));
    e.classList.toggle('cur', cur); e.classList.toggle('ok', done);
  });
}
function setMode(m) {                                    // 'scene' | 'drill'
  $('#tCtlScene').hidden = m !== 'scene'; $('#tCtlDrill').hidden = m !== 'drill'; $('#tProg').hidden = m !== 'scene';
  $('#tBoard').classList.toggle('tdrill', m === 'drill');
  if (m !== 'drill') { $('#tChoices').hidden = true; }
}
function fb(html, css) { const el = $('#tFb'); if (!html) { el.hidden = true; el.innerHTML = ''; return; } el.className = 'tfb ' + (css || ''); el.innerHTML = html; el.hidden = false; }
function actBtn(text, fn, off) { const b = $('#tAct'); if (!text) { b.hidden = true; b.onclick = null; return; } b.hidden = false; b.textContent = text; b.disabled = !!off; b.onclick = fn; }

function gotoScene(i) {
  const L = TL.L; TL.stage = 'scene'; TL.i = i; setMode('scene'); fb('');
  $('#tStage').textContent = `설명 ${i + 1} / ${L.scenes.length}`; $('#tGoal').innerHTML = esc(L.scenes[i].t || L.t);
  paintDots();
  actBtn(i < L.scenes.length - 1 ? '다음 장면 ▶' : '예제 풀어보기 ▶', () => { if (i < L.scenes.length - 1) gotoScene(i + 1); else startDrill(Tech.lv() === 'a' ? 0 : Math.min(Tech.prog(L.id), L.drills.length - 1)); });
  playScene(L, i, false);
}

/* ---------- 예제(문제) ---------- */
const drillSide = d => d.side || d.fen.split(' ')[1];
function playFen(d) { const f = d.fen.split(' '); if (f[1] === drillSide(d)) return d.fen; f[1] = drillSide(d); f[3] = '-'; return f.join(' '); }
function expectedUci(d) { return d.type === 'choice' ? d.opts[d.ans] : (d.sol ? d.sol[TD.k] : d.best) || d.best; }
function startDrill(i) {
  const L = TL.L, d = L.drills[i]; TP.tok++; TL.stage = 'drill'; TL.i = i;
  Object.assign(TD, { d, i, k: 0, wrong: 0, busy: false, sel: null, done: false, t0: Date.now(), hint: false, tried: {} });
  setMode('drill'); TB.slow(false); const side = drillSide(d); TB.set(playFen(d), d.flip !== undefined ? d.flip : side === 'b');
  $('#tStage').textContent = `${L.set ? '문제' : '예제'} ${i + 1} / ${L.drills.length}`; $('#tGoal').innerHTML = d.type === 'choice' ? '가장 좋은 수를 골라 보세요.' : d.type === 'eval' ? '형세를 판단해 보세요.' : d.type === 'threat' ? '상대 기물을 눌러, 상대가 노리는 수를 두어 보세요.' : '기물을 누르고 → 도착 칸을 눌러요.';
  cap(d.goal); fb(''); paintDots(); actBtn('');
  $('#tHint').hidden = !d.hint && !(d.sol || d.best); $('#tShow').hidden = !(Tech.lv() === 't'); $('#tHint').classList.remove('on');
  Tech.setProg(L.id, i);
  if (d.type === 'choice' || d.type === 'eval') { TB.onSq = null; buildChoices(d); } else { TB.onSq = onDrillSq; $('#tChoices').hidden = true; }
  if (effLv(L) === 'b' && Tech.lv() === 'b' && d.pre) TB.hl(d.pre);
}
function buildChoices(d) {
  const box = $('#tChoices'); box.hidden = false; TD.tried = {};
  if (d.type === 'choice') {
    TB.arrows(d.opts.map((u, k) => [u.slice(0, 2), u.slice(2, 4), ['y', 'b', 'r', 'g'][k]]));
    d.opts.forEach((u, k) => TB.badge(u.slice(2, 4), 'ltr', LETTERS[k]));
    box.innerHTML = d.opts.map((u, k) => `<button class="tch" data-k="${k}"><b>${LETTERS[k]}</b>${esc(sanOf(playFen(d), u))}</button>`).join('');
  } else {
    box.innerHTML = (d.labels || ['백이 유리', '비슷해요', '흑이 유리']).map((t, k) => `<button class="tch wide" data-k="${k}">${esc(t)}</button>`).join('');
  }
}
async function onChoice(k) {
  if (TD.busy || TD.done || TD.tried[k]) return; const d = TD.d, btn = $(`#tChoices [data-k="${k}"]`);
  if (k === d.ans) {
    TD.busy = true; btn.classList.add('ok'); $$('#tChoices button').forEach(b => b.disabled = true);
    if (d.type === 'choice') { const u = d.opts[k]; TB.arrows([[u.slice(0, 2), u.slice(2, 4), 'g']]); TB.hi.innerHTML = ''; TB.badge(u.slice(2, 4), 'ok'); }
    finishDrill(d.why);
  } else {
    TD.tried[k] = 1; TD.wrong++; TD.tot++; btn.classList.add('bad'); btn.disabled = true; TB.shake();
    let why = (d.explain && d.explain[k]) || '';
    if (!why && d.type === 'choice') { TD.busy = true; fb('이 수를 두면 어떻게 되는지 확인하는 중…', 'wait'); why = await wrongWhy(d, playFen(d), d.opts[k]); TD.busy = false; }
    if (!why) why = d.miss || '다시 생각해 보세요.';
    fb(`<b>✗ 아니에요</b> ${why}<small>다른 답을 골라 보세요</small>`, 'bad');
    if (TD.wrong >= 2 && d.type === 'choice') $('#tShow').hidden = false;
  }
}
function onDrillSq(sq) {
  if (TD.busy || TD.done) return;
  const ch = TB.ch, p = ch.get(sq), side = drillSide(TD.d);
  if (TD.sel) {
    if (sq === TD.sel) { TD.sel = null; TB.sel(null); TB.dots([]); return; }
    const mv = ch.moves({ square: TD.sel, verbose: true }).filter(m => m.to === sq);
    if (mv.length) { const from = TD.sel; TD.sel = null; TB.sel(null); TB.dots([]); return mv.length > 1 ? tAskPromo(side).then(pr => tCommit(from, sq, pr)) : tCommit(from, sq, mv[0].promotion); }
    if (p && p.color === side) return selectSq(sq);
    const src = ch.get(TD.sel); TB.sel(null); TB.dots([]); TD.sel = null; TB.shake();
    if (Tech.lv() === 'b' || Tech.lv() === 't') fb(`<b>그 칸으로는 갈 수 없어요.</b> ${PMSG[src.type]}`, 'info');
    return;
  }
  if (p && p.color === side) selectSq(sq);
}
function selectSq(sq) {
  TD.sel = sq; TB.sel(sq); const ms = TB.ch.moves({ square: sq, verbose: true }); TB.dots(ms);
  if (!ms.length) fb('<b>이 기물은 지금 움직일 수 없어요.</b> 킹이 위험해지거나(핀) 막혀 있어요.', 'info');
}
function tAskPromo(color) {
  return new Promise(res => {
    const box = $('#tPromoList'); box.innerHTML = ['q', 'r', 'b', 'n'].map(p => `<button data-p="${p}" style="background-image:url('${PIECES[color + p]}')" aria-label="${PK[p]}"></button>`).join('');
    $('#tPromo').hidden = false; box.onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; $('#tPromo').hidden = true; res(b.dataset.p); };
  });
}
async function wrongWhy(d, fenBefore, u) {              // 틀린 수의 이유
  if (d.wrong && d.wrong[u]) return d.wrong[u];
  if (d.type === 'threat') return d.miss || '그 수도 위협이지만, 더 큰 이득을 노리는 수가 있어요.';
  const ch = new Chess(fenBefore), mv = ch.moves({ verbose: true }).find(m => toUci(m) === u); if (!mv) return d.miss || '';
  const me = mv.color; ch.move(mv);
  if (ch.in_stalemate()) return '상대가 움직일 곳이 없는데 체크도 아니에요 — <b>스테일메이트(무승부)</b>예요. 이기려면 체크메이트를 해야 해요.';
  if (ch.in_checkmate()) return '';
  let txt = '';
  try {
    const r = await Engine.pick(ch.fen(), { skill: 20, movetime: 240, n: 1 });
    if (r && r.lines[0]) {
      const L0 = r.lines[0], reply = sanOf(ch.fen(), L0.uci), ln = lineNet(ch.fen(), L0.pv, me);
      if (L0.cp >= 9000) txt = `이 수를 두면 상대가 <b>${esc(reply)}</b>로 체크메이트를 낼 수 있어요.`;
      else if (ln.first && ln.net <= -2) txt = `이 수를 두면 상대가 <b>${esc(ln.first.san)}</b>로 내 ${PK[ln.first.type]}${eul(ln.first.type)} 잡아요 (약 ${-ln.net}점 손해).`;
      else if (d.best || d.sol) {
        const bu = d.best || d.sol[TD.k]; const e0 = await evalPly(fenBefore, bu, 200);
        if (e0 && e0.best && winPct(e0.best.cp) - winPct(-L0.cp) >= 12) txt = (d.miss ? d.miss + ' ' : '') + '(이 수는 더 좋은 수에 비해 이득이 훨씬 작아요.)';
      }
    }
  } catch (e) {}
  return txt || d.miss || '이번 목표와는 다른 수예요.';
}
async function tCommit(from, to, promo) {
  const d = TD.d, L = TL.L, fenBefore = TB.ch.fen(), u = from + to + (promo || ''); TD.busy = true; fb('');
  TB.hl([]); TB.arrows([]);
  const m = await TB.move(u, false); if (!m) { TD.busy = false; return; }
  let ok = false;
  if (d.judge === 'engine') {
    fb('엔진이 내 수를 확인하는 중…', 'wait'); let e = null; try { e = await evalPly(fenBefore, u, 320); } catch (er) {}
    if (e) { const j = judge(e); ok = j.drop < 6; TD.bestSan = sanOf(fenBefore, e.best.uci); TD.bestU = e.best.uci; } else ok = u === d.best;
  } else if (d.sol && TD.k < d.sol.length) {
    ok = u === d.sol[TD.k] || (TD.k === 0 && (d.acc || []).indexOf(u) >= 0);
  }
  if (!ok && d.any === 'mate') ok = TB.ch.in_checkmate();
  if (!ok && d.ok) ok = !!d.ok(m, new Chess(fenBefore), u);
  if (ok) {
    if (d.sol && TD.k + 1 < d.sol.length) {            // 상대 응수 → 다음 수
      TB.badge(to, 'ok'); fb(`<b>좋아요!</b> 상대가 이렇게 받았어요. 이어서 두세요.`, 'ok'); await sleep(450);
      const rep = d.sol[TD.k + 1]; await TB.move(rep, false); TD.k += 2; TB.hi.innerHTML = '';
      if (TD.k >= d.sol.length) { finishDrill(d.why); return; }
      TD.busy = false; return;
    }
    TB.badge(to, 'ok'); finishDrill(d.why); return;
  }
  // 오답: 보여 주고 → 이유 → 되돌리기
  TD.wrong++; TD.tot++; TB.badge(to, 'x'); TB.shake(); Snd.dud();
  const why = await wrongWhy(d, fenBefore, u);
  fb(`<b>✗ 아쉬워요.</b> ${why}<small>수를 되돌릴게요 — 다시 해 보세요</small>`, 'bad');
  await sleep(2000 + Math.min(1500, tStrip(why).length * 22)); await TB.revert(m, fenBefore); TB.sel(null); TB.dots([]);
  TD.busy = false;
  if (TD.wrong >= 1 && Tech.lv() === 'b') showHint(true);
  if (TD.wrong >= 2) $('#tShow').hidden = false;
  if (TD.wrong >= 1) $('#tHint').hidden = false;
}
function showHint(auto) {
  const d = TD.d; if (TD.done) return; const u = expectedUci(d); TD.hint = true;
  if (u && d.type !== 'choice' && d.type !== 'eval') TB.hl([u.slice(0, 2)]);
  const txt = d.hint || (u ? `움직일 기물은 ${PK[(TB.ch.get(u.slice(0, 2)) || {}).type] || '기물'}이에요.` : '');
  if (txt) fb(`<b>💡 힌트</b> ${txt}`, 'hint');
}
function showAnswer() {
  const d = TD.d; if (TD.done) return; const u = expectedUci(d); if (!u) return;
  if (d.type === 'eval') { const b = $(`#tChoices [data-k="${d.ans}"]`); if (b) b.classList.add('peek'); return; }
  TB.arrows([[u.slice(0, 2), u.slice(2, 4), 'g']]); TB.hl([u.slice(0, 2)]);
  fb(`<b>정답 보기</b> 초록 화살표대로 <b>직접 두어서</b> 확인해 보세요.${d.why && Tech.lv() === 't' ? '<small>' + d.why + '</small>' : ''}`, 'hint');
}
function finishDrill(why) {
  const L = TL.L, d = TD.d; TD.done = true; TD.busy = false; TB.sel(null); TB.dots([]);
  const last = TD.i >= L.drills.length - 1, stars = TD.wrong === 0 ? '<span class="stars">★ 한 번에 성공!</span>' : '';
  const body = why || d.why || '';
  fb(`<b>✓ 정답!</b> ${stars}<span class="why">${body}</span>`, 'ok'); paintDots();
  Snd.pop();
  actBtn(last ? '레슨 마치기 ✓' : '다음 예제 ▶', () => { if (last) completeLesson(); else startDrill(TD.i + 1); });
  $('#tHint').hidden = true; $('#tShow').hidden = true;
}
function completeLesson() {
  const L = TL.L; TL.stage = 'done'; paintDots(); TP.tok++;
  const w = TD.tot; if (L.id !== 'mine') Tech.mark(L.id, w); Tech.setProg(L.id, 0);
  const st = w <= 0 ? 3 : w <= 2 ? 2 : 1; Snd.win(); if (st >= 2) confetti();
  const p = Tech.path(L.lv), idx = p.indexOf(L), next = idx >= 0 ? p[idx + 1] : null;
  $('#tSide').hidden = true; $('#tDone').hidden = false;
  $('#tDoneBody').innerHTML = `<div class="tdstars">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</div><h3>${esc(L.t)} 완료!</h3><p>${w === 0 ? '틀린 수 없이 깔끔하게 끝냈어요.' : `헷갈린 수가 ${w}번 있었어요. 그래도 끝까지 해냈어요.`}</p>${L.takeaway ? `<div class="tdtake"><b>오늘의 기술</b>${L.takeaway}</div>` : ''}`;
  $('#tDoneNext').hidden = !next; if (next) { $('#tDoneNext').textContent = `다음: ${next.t} ▶`; $('#tDoneNext').onclick = () => openLesson(next.id); }
  if (!next && (Tech.lv() === 'b' || Tech.lv() === 'm') && !L.set) { $('#tDoneMsg').textContent = Tech.lv() === 'b' ? '초보자 코스를 모두 마쳤어요! 중급자 코스로 올라가 볼까요?' : '중급자 코스를 모두 마쳤어요! 고급자의 감 익히기에 도전해 보세요.'; $('#tUp').hidden = false; $('#tUp').onclick = () => { Tech.setLv(Tech.lv() === 'b' ? 'm' : 'a'); renderTechHome(); tShow('techHome'); }; }
  else { $('#tDoneMsg').textContent = ''; $('#tUp').hidden = true; }
}

/* ---------- 내 실수 복습 ---------- */
function mineLesson() {
  const out = [];
  try {
    Study.list().forEach(rec => {
      if (!rec.an) return;
      rec.log.forEach((p, i) => {
        const a = rec.an[i]; if (!a || a.s || !a.p) return; const c = p[3] === 0 ? 'w' : 'b'; if (c !== rec.mine) return;
        const drop = winPct(a.b[1]) - winPct(a.p[0]); if (drop < 10) return;
        out.push({ fen: p[0], judge: 'engine', best: a.b[0], drop, rec: rec.id, goal: `내가 실제로 둔 수는 <b>${esc(p[2])}</b>였어요. 이 局面에서 더 좋은 수를 찾아보세요.`,
          hint: '내 킹과 기물이 안전한지, 상대가 노리는 수가 없는지 먼저 확인해 보세요.', why: `엔진이 고른 수는 <b>${esc(sanOf(p[0], a.b[0]))}</b>예요. 그때 둔 ${esc(p[2])}는 승률을 약 ${Math.round(drop)}%p 낮췄어요.` });
      });
    });
  } catch (e) {}
  out.sort((x, y) => y.drop - x.drop);
  return { id: 'mine', lv: 'a', set: true, ico: '🎯', t: '내 실수 복습', sub: '내가 둔 판에서 가장 아팠던 장면', drills: out.slice(0, 8) };
}

/* ---------- 배선 ---------- */
function wireTech() {
  TB.init(); TB.slow(true);
  $('#tBack').onclick = () => { TP.tok++; TB.onSq = null; renderTechHome(); tShow('techHome'); };
  $('#thBack').onclick = () => show('home');
  $('#techLv').addEventListener('click', e => {
    if (e.target.id === 'techLv' && Tech.lv()) { $('#techLv').hidden = true; return; }
    const b = e.target.closest('[data-lv]'); if (!b) return; Tech.setLv(b.dataset.lv); $('#techLv').hidden = true; renderTechHome(); tShow('techHome');
  });
  $('#techLv [data-close]').onclick = () => { $('#techLv').hidden = true; if (!Tech.lv()) show('home'); };
  $('#thBody').addEventListener('click', e => {
    if (e.target.id === 'thChange') { openLevelSheet(false); return; }
    const c = e.target.closest('.tcard'); if (c) openLesson(c.dataset.id);
  });
  $('#tReplay').onclick = () => playScene(TL.L, TL.i, false);
  $('#tPause').onclick = () => { TP.paused = !TP.paused; $('#tPause').textContent = TP.paused ? '▶' : '⏸'; };
  $('#tSkip').onclick = () => playScene(TL.L, TL.i, true);
  $('#tPrevS').onclick = () => { if (TL.i > 0) gotoScene(TL.i - 1); };
  $('#tHint').onclick = () => showHint(false);
  $('#tShow').onclick = showAnswer;
  $('#tChoices').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) onChoice(+b.dataset.k); });
  $('#tDoneList').onclick = () => { renderTechHome(); tShow('techHome'); };
  $('#tDoneAgain').onclick = () => openLesson(TL.L.id);
  const m = document.querySelector('.mode[data-mode=tech]');
  if (m) m.onclick = () => { Snd.init(); techEnter(); };
}

wireTech();
