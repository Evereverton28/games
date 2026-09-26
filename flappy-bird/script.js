/* ═══════════════════════════════════════════════════════════
   FLAPPY BIRD
═══════════════════════════════════════════════════════════ */
const { $, clamp, rand, sfx } = Kit;
const W = 400, H = 600, FLOOR = 540;
const cv = $('#cv'), ctx = Kit.fitCanvas(cv, W, H), ov = $('#ov');
const store = Kit.store('flappy', { best: 0, games: 0 });
const parts = new Kit.Particles(), shake = new Kit.Shake();
Kit.soundToggle($('#sound'));

const MEDALS = [
  { min: 80, name: 'Platinum', col: 'linear-gradient(135deg,#e0f2fe,#94a3b8)' },
  { min: 40, name: 'Gold', col: 'linear-gradient(135deg,#fde68a,#f59e0b)' },
  { min: 20, name: 'Silver', col: 'linear-gradient(135deg,#f1f5f9,#94a3b8)' },
  { min: 10, name: 'Bronze', col: 'linear-gradient(135deg,#fdba74,#b45309)' },
];

let G;
const city = Array.from({ length: 14 }, (_, i) => ({ x: i * 34, h: rand(40, 130), w: rand(24, 34), win: Math.random() }));
function reset() {
  G = { state: 'ready', bird: { x: 110, y: 270, vy: 0, rot: 0, flap: 0 }, pipes: [], score: 0, t: 0, next: 0, scroll: 0, flash: 0 };
  hud();
}
reset();

function flap() {
  if (G.state === 'ready') { G.state = 'play'; Kit.overlay(ov, null); }
  if (G.state !== 'play') return;
  G.bird.vy = -7.6; G.bird.flap = 1;
  sfx.tone(560, { type: 'triangle', dur: .07, vol: .04, slide: 820 });
  parts.add({ x: G.bird.x - 12, y: G.bird.y + 6, dx: -1.5, dy: 1, col: 'rgba(226,232,240,.5)', r: 3, decay: .06 });
}
addEventListener('keydown', e => {
  if ([' ', 'ArrowUp', 'w'].includes(e.key)) { e.preventDefault(); if (!e.repeat) { if (G.state === 'over') { if (performance.now() - G.overAt > 700) restart(); } else flap(); } }
  if (e.key === 'p' || e.key === 'Escape') pause();
});
cv.addEventListener('pointerdown', e => { e.preventDefault(); if (G.state !== 'over') flap(); });
Kit.onHide(() => { if (G.state === 'play') pause(); });
function pause() {
  if (G.state === 'play') { G.state = 'paused'; Kit.overlay(ov, { title: 'Paused', actions: [{ label: 'Resume', primary: true, onClick: () => { G.state = 'play'; Kit.overlay(ov, null); } }] }); }
}
function restart() { reset(); Kit.overlay(ov, null); readyScreen(); }

function gapSize() { return Math.max(128, 176 - G.score * 1.6); }
function addPipe() {
  const gap = gapSize();
  const lastY = G.pipes.length ? G.pipes[G.pipes.length - 1].y : 270;
  const y = clamp(lastY + rand(-150, 150), 90 + gap / 2, FLOOR - 70 - gap / 2);
  G.pipes.push({ x: W + 30, y, gap, scored: false, move: G.score >= 20 ? rand(.6, 1.2) * (Math.random() < .5 ? 1 : -1) : 0, base: y, t: rand(0, 6) });
}

function update(dt) {
  G.t += dt;
  const b = G.bird;
  if (G.state === 'ready') { b.y = 270 + Math.sin(G.t / 10) * 8; G.scroll += 2 * dt; return; }
  b.vy = Math.min(11, b.vy + .42 * dt);
  b.y += b.vy * dt;
  b.rot = clamp(b.vy / 10, -.45, 1.4);
  b.flap = Math.max(0, b.flap - .08 * dt);
  if (G.state === 'play') {
    const speed = 2.6 + Math.min(1.2, G.score * .02);
    G.scroll += speed * dt;
    G.next -= speed * dt;
    if (G.next <= 0) { addPipe(); G.next = 205; }
    for (const p of G.pipes) {
      p.x -= speed * dt;
      if (p.move) { p.t += .03 * dt; p.y = clamp(p.base + Math.sin(p.t) * 55 * Math.abs(p.move), 90 + p.gap / 2, FLOOR - 70 - p.gap / 2); }
      if (!p.scored && p.x + 34 < b.x) {
        p.scored = true; G.score++; hud(); Kit.pulse($('#score'));
        sfx.tone(880, { type: 'triangle', dur: .08, vol: .05 }); sfx.tone(1320, { type: 'triangle', dur: .12, vol: .04, delay: .06 });
        if (G.score % 10 === 0) { G.flash = 1; parts.burst(b.x, b.y, '#fbbf24', 16, { speed: 3 }); }
      }
      // collision with circle vs rects
      const r = 13;
      if (b.x + r > p.x && b.x - r < p.x + 68) {
        if (b.y - r < p.y - p.gap / 2 || b.y + r > p.y + p.gap / 2) return die();
      }
    }
    G.pipes = G.pipes.filter(p => p.x > -80);
    if (b.y - 14 < 0) { b.y = 14; b.vy = 0; }
  }
  if (b.y + 13 >= FLOOR) { b.y = FLOOR - 13; if (G.state === 'play') die(); if (G.state === 'falling') land(); }
  G.flash = Math.max(0, G.flash - .03 * dt);
  parts.update(dt);
}
function die() {
  G.state = 'falling';
  shake.hit(8); G.flash = .8;
  sfx.tone(180, { type: 'square', dur: .2, vol: .05, slide: 90 });
  parts.burst(G.bird.x, G.bird.y, '#fbbf24', 18, { speed: 3.5 });
  G.bird.vy = Math.min(G.bird.vy, -3);
  if (G.bird.y + 13 >= FLOOR) land();
}
function land() {
  if (G.state === 'over') return;
  G.state = 'over'; G.overAt = performance.now();
  sfx.tone(120, { dur: .25, vol: .05, slide: 60 });
  store.set('games', store.data.games + 1);
  const best = store.best('best', G.score);
  hud();
  const medal = MEDALS.find(m => G.score >= m.min);
  setTimeout(() => Kit.overlay(ov, {
    title: 'Game over', grad: !!medal,
    html: medal ? `<div class="medal" style="background:${medal.col}">${medal.name}</div>` : `<p>Score 10 for a bronze medal.</p>`,
    stats: [[G.score, 'Score'], [store.data.best, 'Best']], note: best && G.score ? 'New best score' : '',
    actions: [{ label: 'Fly again', primary: true, onClick: restart }],
  }), 500);
}
function hud() { $('#score').textContent = G.score; $('#best').textContent = store.data.best; $('#games').textContent = store.data.games; }

/* ── Draw ── */
function draw() {
  const sh = shake.apply(ctx);
  const sky = ctx.createLinearGradient(0, 0, 0, FLOOR);
  sky.addColorStop(0, '#0e1422'); sky.addColorStop(1, '#1f1a2e');
  ctx.fillStyle = sky; ctx.fillRect(-10, -10, W + 20, H + 20);
  // stars
  ctx.fillStyle = 'rgba(226,232,240,.5)';
  for (let i = 0; i < 26; i++) ctx.fillRect((i * 83 - G.scroll * .05) % W + (i * 83 - G.scroll * .05 < 0 ? W : 0), (i * 47) % 260, 2, 2);
  // skyline (slow parallax)
  for (const layer of [{ k: .2, col: '#171b2c', dy: 60 }, { k: .45, col: '#1d2236', dy: 0 }]) {
    for (const b of city) {
      const x = ((b.x - G.scroll * layer.k) % (city.length * 34) + city.length * 34) % (city.length * 34) - 34;
      const h = b.h + layer.dy;
      ctx.fillStyle = layer.col; ctx.fillRect(x, FLOOR - h, b.w, h);
      if (layer.k > .3) { ctx.fillStyle = 'rgba(251,191,36,.25)'; for (let y = FLOOR - h + 8; y < FLOOR - 8; y += 14) if ((y + b.win * 100) % 3 < 1.2) ctx.fillRect(x + 6, y, 4, 5); }
    }
  }
  // pipes
  for (const p of G.pipes) {
    const top = p.y - p.gap / 2, bot = p.y + p.gap / 2;
    pipe(p.x, 0, top, true); pipe(p.x, bot, FLOOR - bot, false);
  }
  // ground
  ctx.fillStyle = '#2a2233'; ctx.fillRect(0, FLOOR, W, H - FLOOR);
  ctx.fillStyle = '#3b2f47'; ctx.fillRect(0, FLOOR, W, 6);
  ctx.fillStyle = 'rgba(249,115,22,.25)';
  for (let x = -(G.scroll % 24); x < W; x += 24) ctx.fillRect(x, FLOOR + 10, 12, 4);
  parts.draw(ctx);
  bird();
  if (sh) ctx.restore();
  if (G.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${G.flash * .25})`; ctx.fillRect(0, 0, W, H); }
  // big score
  if (G.state !== 'ready') {
    ctx.textAlign = 'center'; ctx.font = '64px "Bebas Neue", sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillText(G.score, W / 2 + 2, 84);
    ctx.fillStyle = '#f8fafc'; ctx.fillText(G.score, W / 2, 80);
  } else {
    ctx.textAlign = 'center'; ctx.fillStyle = '#e2e8f0'; ctx.font = '600 15px DM Sans, sans-serif';
    ctx.fillText('Tap, click or press Space to flap', W / 2, 360);
  }
}
function pipe(x, y, h, top) {
  const g = ctx.createLinearGradient(x, 0, x + 68, 0);
  g.addColorStop(0, '#15803d'); g.addColorStop(.35, '#4ade80'); g.addColorStop(1, '#14532d');
  ctx.fillStyle = g; ctx.fillRect(x + 4, y, 60, h);
  const capY = top ? y + h - 26 : y;
  ctx.fillRect(x, capY, 68, 26);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, top ? capY : capY + 22, 68, 4);
}
function bird() {
  const b = G.bird;
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
  ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.ellipse(0, 0, 17, 13, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.ellipse(-2, 4, 10, 6, 0, 0, 7); ctx.fill();
  // wing
  const wy = b.flap > .3 ? -8 : Math.sin(G.t / 4) * 2 + 1;
  ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.ellipse(-6, wy, 9, 5, -.3, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(7, -5, 5.5, 0, 7); ctx.fill();
  ctx.fillStyle = G.state === 'over' || G.state === 'falling' ? '#64748b' : '#0a0a0f'; ctx.beginPath(); ctx.arc(9, -5, 2.6, 0, 7); ctx.fill();
  ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(24, 3); ctx.lineTo(12, 7); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function readyScreen() { G.state = 'ready'; }

Kit.loop(dt => { if (G.state !== 'paused') update(dt); draw(); });
