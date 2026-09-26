/* ═══════════════════════════════════════════════════════════
   BREAKOUT
═══════════════════════════════════════════════════════════ */
const { $, clamp, rand, pick, sfx } = Kit;
const W = 480, H = 620;
const cv = $('#cv'), ctx = Kit.fitCanvas(cv, W, H), ov = $('#ov');
const store = Kit.store('breakout', { best: 0 });
const parts = new Kit.Particles(), shake = new Kit.Shake();
Kit.soundToggle($('#sound'));

// '.' empty, 1-3 hit points, '#' steel (unbreakable)
const LEVELS = [
  ['............', '111111111111', '111111111111', '111111111111', '111111111111'],
  ['2..........2', '22........22', '1221....1221', '111122221111', '.1111111111.', '..11111111..'],
  ['....3333....', '...222222...', '..11111111..', '.1111..1111.', '111......111', '11........11'],
  ['1#1#1#1#1#1#', '222222222222', '111111111111', '3..........3', '222222222222'],
  ['33.......33.', '2222...22222', '.1111.1111..', '..11111111..', '...222222...', '....3333....'],
  ['############', '3.3.3.3.3.3.', '.2.2.2.2.2.2', '1111111111..', '..1111111111', '##........##'],
  ['.3333333333.', '.2########2.', '.2111111112.', '.2111111112.', '.2111111112.', '.2222..2222.'],
  ['3#3#3#3#3#3#', '#2#2#2#2#2#2', '1#1#1#1#1#1#', '222222222222', '333333333333', '111111111111'],
];
const COLS = 12, BW = 36, BH = 18, GAP = 2, TOP = 70;
const BX = (W - (COLS * (BW + GAP) - GAP)) / 2;
const HP_COL = { 1: '#38bdf8', 2: '#a78bfa', 3: '#f97316' };
const POWERS = {
  wide:  { col: '#22c55e', label: 'W', name: 'Wide paddle' },
  multi: { col: '#f472b6', label: 'M', name: 'Multi-ball' },
  slow:  { col: '#38bdf8', label: 'S', name: 'Slow ball' },
  laser: { col: '#f43f5e', label: 'L', name: 'Lasers' },
  life:  { col: '#fbbf24', label: '+', name: 'Extra life' },
};

let G;
function newGame() {
  G = { state: 'ready', level: 0, score: 0, lives: 3, combo: 0 };
  loadLevel(0);
}
function loadLevel(n) {
  G.level = n;
  G.bricks = [];
  const map = LEVELS[n % LEVELS.length], boost = Math.floor(n / LEVELS.length);
  map.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '.') return;
    const steel = ch === '#';
    const hp = steel ? Infinity : Math.min(3, +ch + boost);
    G.bricks.push({ x: BX + c * (BW + GAP), y: TOP + r * (BH + GAP), hp, max: hp, steel, flash: 0 });
  }));
  G.paddle = { x: W / 2, w: 84, target: W / 2, wideT: 0, laserT: 0 };
  G.slowT = 0; G.drops = []; G.shots = []; G.pops = [];
  resetBall();
  G.state = 'serve';
  hud();
}
function baseSpeed() { return 5.2 + G.level * .35; }
function resetBall() { G.balls = [{ x: G.paddle.x, y: H - 58, dx: 0, dy: 0, stuck: true, trail: [] }]; G.combo = 0; }
function launch() {
  for (const b of G.balls) if (b.stuck) {
    const a = rand(-.35, .35);
    b.dx = Math.sin(a) * baseSpeed(); b.dy = -Math.cos(a) * baseSpeed(); b.stuck = false;
    sfx.tone(440, { type: 'triangle', dur: .08, vol: .05, slide: 660 });
  }
  if (G.state === 'serve') G.state = 'play';
}

/* ── Input ── */
const keys = {};
cv.addEventListener('pointermove', e => { G.paddle.target = Kit.canvasPoint(cv, e, W, H).x; });
cv.addEventListener('pointerdown', e => { G.paddle.target = Kit.canvasPoint(cv, e, W, H).x; if (G.state === 'serve') launch(); else fire(); });
addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys[e.key] = true;
  if (e.key === ' ') { if (G.state === 'serve') launch(); else fire(); }
  if (e.key === 'p' || e.key === 'Escape') pause();
});
addEventListener('keyup', e => { keys[e.key] = false; });
Kit.onHide(() => { if (G.state === 'play' || G.state === 'serve') pause(true); });

function pause(force) {
  if (G.state === 'play' || G.state === 'serve') {
    G.prev = G.state; G.state = 'paused';
    Kit.overlay(ov, { title: 'Paused', text: `Level ${G.level + 1}, ${G.lives} ${G.lives === 1 ? 'life' : 'lives'} left.`, actions: [{ label: 'Resume', primary: true, onClick: () => pause() }] });
  } else if (G.state === 'paused' && !force) { G.state = G.prev; Kit.overlay(ov, null); }
}
function fire() {
  if (G.state !== 'play' || G.paddle.laserT <= 0 || G.shots.length > 4) return;
  const p = G.paddle;
  G.shots.push({ x: p.x - p.w / 2 + 6, y: H - 44 }, { x: p.x + p.w / 2 - 6, y: H - 44 });
  sfx.tone(1200, { type: 'square', dur: .05, vol: .025, slide: 600 });
}

/* ── Update ── */
function update(dt) {
  const p = G.paddle;
  if (keys.ArrowLeft || keys.a) p.target = p.x - 14;
  if (keys.ArrowRight || keys.d) p.target = p.x + 14;
  p.w = Kit.lerp(p.w, p.wideT > 0 ? 130 : 84, .15);
  p.target = clamp(p.target, p.w / 2, W - p.w / 2);
  p.x += (p.target - p.x) * Math.min(1, .45 * dt);
  p.wideT -= dt; p.laserT -= dt; G.slowT -= dt;
  if (p.laserT > 0 && keys[' '] && Math.random() < .08) fire();

  const speedK = G.slowT > 0 ? .62 : 1;
  const steps = 4;
  for (const b of G.balls) {
    if (b.stuck) { b.x = p.x; b.y = H - 58; continue; }
    for (let s = 0; s < steps; s++) stepBall(b, dt * speedK / steps);
    b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 8) b.trail.shift();
  }
  const before = G.balls.length;
  G.balls = G.balls.filter(b => b.y < H + 20);
  if (!G.balls.length) loseLife();
  else if (G.balls.length < before) sfx.tone(200, { dur: .15, vol: .04, slide: 120 });

  // Laser shots
  for (const s of G.shots) {
    s.y -= 9 * dt;
    for (const br of G.bricks) if (!br.dead && s.x > br.x && s.x < br.x + BW && s.y > br.y && s.y < br.y + BH) { hitBrick(br); s.y = -99; break; }
  }
  G.shots = G.shots.filter(s => s.y > 0);

  // Power-up drops
  for (const d of G.drops) {
    d.y += 2.3 * dt; d.t += dt;
    if (d.y > H - 46 && d.y < H - 26 && Math.abs(d.x - p.x) < p.w / 2 + 12) { d.got = true; power(d.kind); }
  }
  G.drops = G.drops.filter(d => !d.got && d.y < H + 20);
  for (const br of G.bricks) br.flash = Math.max(0, br.flash - .08 * dt);
  for (const q of G.pops) { q.y -= .5 * dt; q.life -= .02 * dt; }
  G.pops = G.pops.filter(q => q.life > 0);
  parts.update(dt);

  if (G.bricks.every(b => b.dead || b.steel)) levelClear();
}
function stepBall(b, k) {
  b.x += b.dx * k; b.y += b.dy * k;
  const R = 6;
  if (b.x < R) { b.x = R; b.dx = Math.abs(b.dx); wall(b); }
  if (b.x > W - R) { b.x = W - R; b.dx = -Math.abs(b.dx); wall(b); }
  if (b.y < R) { b.y = R; b.dy = Math.abs(b.dy); wall(b); }
  // Paddle: bounce angle depends on hit position
  const p = G.paddle, py = H - 46;
  if (b.dy > 0 && b.y + R > py && b.y - R < py + 12 && b.x > p.x - p.w / 2 - R && b.x < p.x + p.w / 2 + R) {
    const off = clamp((b.x - p.x) / (p.w / 2), -1, 1);
    const ang = off * 1.05;
    const sp = Math.min(Math.hypot(b.dx, b.dy) * 1.01, baseSpeed() * 1.6);
    b.dx = Math.sin(ang) * sp; b.dy = -Math.cos(ang) * sp; b.y = py - R;
    G.combo = 0;
    sfx.tone(260 + Math.abs(off) * 120, { type: 'triangle', dur: .07, vol: .06 });
    parts.burst(b.x, py, '#38bdf8', 5, { speed: 2 });
  }
  // Bricks
  for (const br of G.bricks) {
    if (br.dead) continue;
    const nx = clamp(b.x, br.x, br.x + BW), ny = clamp(b.y, br.y, br.y + BH);
    const dx = b.x - nx, dy = b.y - ny;
    if (dx * dx + dy * dy > R * R) continue;
    // reflect on the axis of least penetration
    const overX = Math.min(b.x + R - br.x, br.x + BW - (b.x - R));
    const overY = Math.min(b.y + R - br.y, br.y + BH - (b.y - R));
    if (overX < overY) { b.dx = b.x < br.x + BW / 2 ? -Math.abs(b.dx) : Math.abs(b.dx); }
    else { b.dy = b.y < br.y + BH / 2 ? -Math.abs(b.dy) : Math.abs(b.dy); }
    hitBrick(br);
    break;
  }
  // avoid near-horizontal loops
  if (Math.abs(b.dy) < 1.2) b.dy = b.dy < 0 ? -1.2 : 1.2;
}
function wall(b) { sfx.tone(180, { dur: .04, vol: .03 }); }
function hitBrick(br) {
  br.flash = 1;
  if (br.steel) { sfx.tone(900, { type: 'square', dur: .04, vol: .025 }); parts.burst(br.x + BW / 2, br.y + BH / 2, '#94a3b8', 3, { speed: 1.5 }); return; }
  br.hp--;
  G.combo++;
  if (br.hp <= 0) {
    br.dead = true;
    const pts = 10 * br.max * Math.min(G.combo, 8);
    G.score += pts;
    if (G.combo >= 3) G.pops.push({ x: br.x + BW / 2, y: br.y, text: `x${Math.min(G.combo, 8)}`, life: 1 });
    parts.burst(br.x + BW / 2, br.y + BH / 2, HP_COL[br.max] || '#e2e8f0', 12, { speed: 3 });
    shake.hit(2);
    sfx.tone(420 + Math.min(G.combo, 12) * 40, { type: 'triangle', dur: .07, vol: .05 });
    if (Math.random() < .14) G.drops.push({ x: br.x + BW / 2, y: br.y + BH / 2, kind: pick(['wide', 'wide', 'multi', 'multi', 'slow', 'laser', 'laser', 'life']), t: 0 });
  } else {
    G.score += 5;
    sfx.tone(320, { type: 'triangle', dur: .05, vol: .04 });
  }
  hud();
}
function power(kind) {
  const P = POWERS[kind];
  sfx.arp([660, 880, 1100], { gap: .05, dur: .12, vol: .04 });
  G.pops.push({ x: G.paddle.x, y: H - 70, text: P.name, life: 1.3, col: P.col });
  if (kind === 'wide') G.paddle.wideT = 900;
  if (kind === 'slow') G.slowT = 600;
  if (kind === 'laser') G.paddle.laserT = 700;
  if (kind === 'life') { G.lives = Math.min(5, G.lives + 1); hud(); }
  if (kind === 'multi') {
    const src = G.balls.find(b => !b.stuck) || G.balls[0];
    for (let i = 0; i < 2; i++) {
      const a = Math.atan2(src.dx, -src.dy) + (i ? .5 : -.5), sp = Math.max(baseSpeed(), Math.hypot(src.dx, src.dy));
      G.balls.push({ x: src.x, y: src.y, dx: Math.sin(a) * sp, dy: -Math.abs(Math.cos(a) * sp), stuck: false, trail: [] });
    }
  }
}
function loseLife() {
  G.lives--;
  shake.hit(8); sfx.lose();
  hud();
  if (G.lives <= 0) return gameOver();
  G.paddle.wideT = 0; G.paddle.laserT = 0; G.slowT = 0; G.drops = []; G.shots = [];
  resetBall(); G.state = 'serve';
}
function levelClear() {
  G.state = 'clear';
  sfx.win(); Kit.confetti();
  const bonus = G.lives * 100;
  G.score += bonus; hud();
  Kit.overlay(ov, {
    title: `Level ${G.level + 1} cleared`, grad: true, text: `Life bonus: +${bonus}.`,
    stats: [[G.score, 'Score'], [G.lives, 'Lives']],
    actions: [{ label: 'Next level', primary: true, onClick: () => { Kit.overlay(ov, null); loadLevel(G.level + 1); } }],
  });
}
function gameOver() {
  G.state = 'over';
  const best = store.best('best', G.score);
  hud();
  Kit.overlay(ov, {
    title: 'Game over', text: `You reached level ${G.level + 1}.`,
    stats: [[G.score, 'Score'], [store.data.best, 'Best']], note: best && G.score ? 'New best score' : '',
    actions: [{ label: 'Play again', primary: true, onClick: () => { Kit.overlay(ov, null); newGame(); } }],
  });
}
function hud() {
  $('#score').textContent = G.score; $('#level').textContent = G.level + 1;
  $('#lives').textContent = G.lives; $('#best').textContent = Math.max(store.data.best, G.score);
}

/* ── Draw ── */
function draw() {
  ctx.clearRect(0, 0, W, H);
  const sh = shake.apply(ctx);
  ctx.fillStyle = '#0d0d14'; ctx.fillRect(-10, -10, W + 20, H + 20);
  // faint grid
  ctx.strokeStyle = 'rgba(56,189,248,.035)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (const br of G.bricks) {
    if (br.dead) continue;
    const col = br.steel ? '#64748b' : HP_COL[br.hp];
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.roundRect(br.x, br.y, BW, BH, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(br.x + 2, br.y + 2, BW - 4, 3);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(br.x + 2, br.y + BH - 4, BW - 4, 2);
    if (br.steel) { ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(br.x + 5, br.y + 7, 3, 3); ctx.fillRect(br.x + BW - 8, br.y + 7, 3, 3); }
    else if (br.hp < br.max) { ctx.strokeStyle = 'rgba(10,10,15,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(br.x + 10, br.y + 2); ctx.lineTo(br.x + 16, br.y + 10); ctx.lineTo(br.x + 13, br.y + 16); ctx.stroke(); }
    if (br.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${br.flash * .6})`; ctx.beginPath(); ctx.roundRect(br.x, br.y, BW, BH, 4); ctx.fill(); }
  }
  // Drops
  for (const d of G.drops) {
    const P = POWERS[d.kind];
    ctx.fillStyle = P.col; ctx.beginPath(); ctx.roundRect(d.x - 14, d.y - 8, 28, 16, 8); ctx.fill();
    ctx.fillStyle = '#0a0a0f'; ctx.font = '700 12px DM Sans, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(P.label, d.x, d.y + 1);
  }
  // Shots
  ctx.fillStyle = '#f43f5e'; for (const s of G.shots) ctx.fillRect(s.x - 1.5, s.y, 3, 12);
  // Paddle
  const p = G.paddle, py = H - 46;
  const grd = ctx.createLinearGradient(p.x - p.w / 2, 0, p.x + p.w / 2, 0);
  grd.addColorStop(0, '#f97316'); grd.addColorStop(1, '#38bdf8');
  ctx.fillStyle = grd; ctx.beginPath(); ctx.roundRect(p.x - p.w / 2, py, p.w, 12, 6); ctx.fill();
  if (p.laserT > 0) { ctx.fillStyle = '#f43f5e'; ctx.fillRect(p.x - p.w / 2 + 3, py - 6, 6, 8); ctx.fillRect(p.x + p.w / 2 - 9, py - 6, 6, 8); }
  // Balls
  for (const b of G.balls) {
    b.trail.forEach((t, i) => { ctx.fillStyle = `rgba(226,232,240,${i / b.trail.length * .22})`; ctx.beginPath(); ctx.arc(t.x, t.y, 6 * i / b.trail.length, 0, 7); ctx.fill(); });
    ctx.fillStyle = G.slowT > 0 ? '#bae6fd' : '#e2e8f0'; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, 7); ctx.fill();
  }
  parts.draw(ctx);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const q of G.pops) { ctx.globalAlpha = Math.min(1, q.life); ctx.fillStyle = q.col || '#fbbf24'; ctx.font = '600 14px DM Sans, sans-serif'; ctx.fillText(q.text, q.x, q.y); }
  ctx.globalAlpha = 1;
  if (sh) ctx.restore();
  // Active power timers
  let px = 12;
  for (const [k, t] of [['wide', p.wideT], ['slow', G.slowT], ['laser', p.laserT]]) {
    if (t <= 0) continue;
    ctx.fillStyle = POWERS[k].col; ctx.globalAlpha = t < 120 && Math.floor(t / 10) % 2 ? .3 : 1;
    ctx.beginPath(); ctx.roundRect(px, 14, 26, 16, 8); ctx.fill();
    ctx.fillStyle = '#0a0a0f'; ctx.font = '700 11px DM Sans, sans-serif'; ctx.fillText(POWERS[k].label, px + 13, 23);
    ctx.globalAlpha = 1; px += 32;
  }
  if (G.state === 'serve') {
    ctx.fillStyle = 'rgba(226,232,240,.7)'; ctx.font = '600 14px DM Sans, sans-serif';
    ctx.fillText(matchMedia('(pointer: coarse)').matches ? 'Tap to launch' : 'Click or press Space to launch', W / 2, H - 110);
  }
}

newGame();
Kit.overlay(ov, {
  title: 'Breakout', grad: true, text: 'Eight levels of bricks. Purple and orange bricks take extra hits, grey steel never breaks. Catch the capsules that fall.',
  actions: [{ label: 'Start', primary: true, onClick: () => Kit.overlay(ov, null) }],
});
Kit.loop(dt => {
  if (G.state === 'play' || G.state === 'serve') update(dt);
  else parts.update(dt);
  draw();
});
