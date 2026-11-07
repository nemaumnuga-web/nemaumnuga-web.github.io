// 로딩 중 미니게임 "SKY RUN" — 스페이스/클릭으로 상승, 게이트 통과, 크레딧 획득
export function startSkyRun(cv, onCredit) {
  const x = cv.getContext('2d');
  let W = 0, H = 0, ship, gates, coins, t, run = false, dead = false, score = 0, best = 0, raf = 0, stopped = false;
  const fit = () => { const r = cv.getBoundingClientRect(); W = cv.width = Math.round(r.width * devicePixelRatio); H = cv.height = Math.round(r.height * devicePixelRatio); };
  const reset = () => { ship = { y: H * 0.5, v: 0 }; gates = []; coins = []; t = 0; score = 0; dead = false; };
  fit(); reset();
  const flap = () => { if (stopped) return; if (dead) { reset(); } run = true; ship.v = -H * 0.9; };
  const key = e => { if (e.code === 'Space') { e.preventDefault(); flap(); } };
  addEventListener('keydown', key); cv.addEventListener('pointerdown', flap);
  let last = performance.now();
  function loop(now) {
    if (stopped) return; raf = requestAnimationFrame(loop);
    const dt = Math.min(0.033, (now - last) / 1000); last = now; const u = H / 300;
    if (run && !dead) {
      t += dt; ship.v += H * 2.6 * dt; ship.y += ship.v * dt;
      if (!gates.length || gates[gates.length - 1].x < W - 230 * u) { const gap = 95 * u, gy = H * 0.2 + Math.random() * (H * 0.6 - gap); gates.push({ x: W + 20, gy, gap, w: 26 * u, passed: false }); if (Math.random() < 0.7) coins.push({ x: W + 20 + 13 * u, y: gy + gap / 2, got: false }); }
      for (const g of gates) { g.x -= 150 * u * dt; if (!g.passed && g.x + g.w < W * 0.18) { g.passed = true; score++; } }
      for (const c of coins) { c.x -= 150 * u * dt; if (!c.got && Math.abs(c.x - W * 0.18) < 14 * u && Math.abs(c.y - ship.y) < 16 * u) { c.got = true; onCredit && onCredit(); } }
      gates = gates.filter(g => g.x > -60 * u); coins = coins.filter(c => c.x > -20);
      const sx = W * 0.18;
      if (ship.y < 0 || ship.y > H - 14 * u) dead = true;
      for (const g of gates) if (sx + 16 * u > g.x && sx - 16 * u < g.x + g.w && (ship.y - 5 * u < g.gy || ship.y + 5 * u > g.gy + g.gap)) dead = true;
      if (dead) best = Math.max(best, score);
    }
    x.clearRect(0, 0, W, H);
    const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#05080a'); gr.addColorStop(1, '#0c2a2c'); x.fillStyle = gr; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(34,211,211,.25)'; x.lineWidth = 2 * devicePixelRatio; x.setLineDash([12 * u, 10 * u]); x.beginPath(); x.moveTo(0, H - 6 * u); x.lineTo(W, H - 6 * u); x.stroke(); x.setLineDash([]);
    for (const g of gates) {
      x.fillStyle = '#0b0f10'; x.strokeStyle = '#1aa6a6'; x.lineWidth = 2;
      x.fillRect(g.x, 0, g.w, g.gy); x.strokeRect(g.x, -2, g.w, g.gy + 2); x.fillRect(g.x, g.gy + g.gap, g.w, H); x.strokeRect(g.x, g.gy + g.gap, g.w, H);
      x.fillStyle = '#22d3d3'; x.fillRect(g.x - 4 * u, g.gy - 5 * u, g.w + 8 * u, 5 * u); x.fillRect(g.x - 4 * u, g.gy + g.gap, g.w + 8 * u, 5 * u);
      x.fillStyle = '#b8261d'; x.fillRect(g.x - 4 * u, g.gy - 2 * u, g.w + 8 * u, 1.5 * u); x.fillRect(g.x - 4 * u, g.gy + g.gap + 3 * u, g.w + 8 * u, 1.5 * u);
    }
    for (const c of coins) if (!c.got) { x.strokeStyle = '#22d3d3'; x.lineWidth = 2 * u; x.beginPath(); x.arc(c.x, c.y, 7 * u, 0, 7); x.stroke(); }
    const sx = W * 0.18, sy = ship.y, a = Math.max(-0.4, Math.min(0.5, ship.v / H * 0.6));
    x.save(); x.translate(sx, sy); x.rotate(a);
    x.fillStyle = 'rgba(34,211,211,.4)'; for (let i = 1; i < 5; i++) x.fillRect(-20 * u - i * 7 * u, -1 * u, 4 * u, 2 * u);
    x.fillStyle = '#9a9a96'; x.beginPath(); x.ellipse(0, 0, 18 * u, 5 * u, 0, 0, 7); x.fill();
    x.fillStyle = '#6a6a66'; x.fillRect(-9 * u, -9 * u, 8 * u, 5 * u); x.fillStyle = '#22d3d3'; x.fillRect(2 * u, -5 * u, 7 * u, 2.5 * u);
    x.restore();
    x.fillStyle = 'rgba(34,211,211,.6)'; x.font = `${9 * u}px Orbitron, sans-serif`; x.fillText('SKY RUN', 12 * u, 16 * u);
    x.fillStyle = '#fff'; x.textAlign = 'right'; x.fillText(`${score}  ·  BEST ${Math.max(best, score)}`, W - 12 * u, 16 * u); x.textAlign = 'left';
    if (!run || dead) {
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = `bold ${22 * u}px "Black Ops One", sans-serif`; x.fillText(dead ? 'CRASHED — TAP TO RETRY' : 'PRESS SPACE TO FLY', W / 2, H / 2);
      x.fillStyle = '#22d3d3'; x.font = `${8 * u}px Orbitron, sans-serif`; x.fillText('A QUICK RUN WHILE THE SKIES LOAD', W / 2, H / 2 + 26 * u); x.textAlign = 'left';
    }
  }
  raf = requestAnimationFrame(loop);
  return { stop() { stopped = true; cancelAnimationFrame(raf); removeEventListener('keydown', key); return Math.max(best, score); } };
}
