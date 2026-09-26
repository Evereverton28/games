/* ═══════════════════════════════════════════════════════════
   PONG
═══════════════════════════════════════════════════════════ */
const { $, clamp, rand, sfx } = Kit;
const W = 760, H = 460, PW = 12, PH = 86, WIN = 7;
const cv = $('#cv'), ctx = Kit.fitCanvas(cv, W, H), ov = $('#ov');
const store = Kit.store('pong', { mode: 'medium', wins: 0, losses: 0 });
const parts = new Kit.Particles(), shake = new Kit.Shake();
Kit.soundToggle($('#sound'));

const AI = { easy: { speed: 4.2, err: 60, react: 22 }, medium: { speed: 6.2, err: 28, react: 10 }, hard: { speed: 8.6, err: 8, react: 3 } };
let mode, G;
const setMode = Kit.segmented($('#mode'), v => { mode = v; store.set('mode', v); intro(); });

function newMatch() {
  G = { state: 'serve', count: 180, s1: 0, s2: 0, rally: 0, longest: 0, server: Math.random() < .5 ? 1 : -1,
        p1: { y: H / 2, vy: 0 }, p2: { y: H / 2, vy: 0, target: H / 2, think: 0 },
        ball: { x: W / 2, y: H / 2, dx: 0, dy: 0, trail: [] }, flash: 0 };
  resetBall();
}
function resetBall() {
  const b = G.ball; b.x = W / 2; b.y = H / 2; b.dx = 0; b.dy = 0; b.trail = [];
  G.state = 'serve'; G.count = 150; G.rally = 0;
}
function serve() {
  const a = rand(-.45, .45);
  const sp = 6.2;
  G.ball.dx = Math.cos(a) * sp * G.server; G.ball.dy = Math.sin(a) * sp;
  G.state = 'play';
}

/* ── Input ── */
const keys = {};
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'p' || e.key === 'Escape') pause();
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
const touches = new Map();
cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); touches.set(e.pointerId, Kit.canvasPoint(cv, e, W, H)); });
cv.addEventListener('pointermove', e => { if (touches.has(e.pointerId) || e.pointerType === 'mouse') touches.set(e.pointerId, Kit.canvasPoint(cv, e, W, H)); });
['pointerup', 'pointercancel'].forEach(t => cv.addEventListener(t, e => { if (e.pointerType !== 'mouse') touches.delete(e.pointerId); }));
cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') touches.delete(e.pointerId); });
Kit.onHide(() => { if (G && (G.state === 'play' || G.state === 'serve')) pause(); });

function pause() {
  if (!G || G.state === 'over' || G.state === 'intro') return;
  if (G.state !== 'paused') {
    G.prev = G.state; G.state = 'paused';
    Kit.overlay(ov, { title: 'Paused', text: `${G.s1} – ${G.s2}`, actions: [{ label: 'Resume', primary: true, onClick: () => { G.state = G.prev; Kit.overlay(ov, null); } }] });
  }
}

/* ── Update ── */
function movePaddle(p, dir, speed, dt) {
  p.vy = Kit.lerp(p.vy, dir * speed, .35);
  p.y = clamp(p.y + p.vy * dt, PH / 2 + 6, H - PH / 2 - 6);
}
function predictY() {
  // project the ball to the AI's x, reflecting off walls
  const b = G.ball;
  if (b.dx <= 0) return H / 2;
  let x = b.x, y = b.y, dy = b.dy;
  const t = (W - 30 - x) / b.dx;
  y += dy * t;
  const span = H - 20;
  y = ((y - 10) % (2 * span) + 2 * span) % (2 * span);
  if (y > span) y = 2 * span - y;
  return y + 10;
}
function update(dt) {
  const p1 = G.p1, p2 = G.p2, b = G.ball;
  // player 1 (left)
  let d1 = (keys.w ? -1 : 0) + (keys.s ? 1 : 0);
  if (mode !== 'pvp') d1 += (keys.arrowup ? -1 : 0) + (keys.arrowdown ? 1 : 0);
  let t1 = null, t2 = null;
  for (const t of touches.values()) { if (mode !== 'pvp' || t.x < W / 2) t1 = t.y; else t2 = t.y; }
  if (t1 != null) { p1.vy = (t1 - p1.y) * .35; p1.y = clamp(p1.y + p1.vy, PH / 2 + 6, H - PH / 2 - 6); } else movePaddle(p1, clamp(d1, -1, 1), 8, dt);
  // player 2 / AI (right)
  if (mode === 'pvp') {
    const d2 = (keys.arrowup ? -1 : 0) + (keys.arrowdown ? 1 : 0);
    if (t2 != null) { p2.vy = (t2 - p2.y) * .35; p2.y = clamp(p2.y + p2.vy, PH / 2 + 6, H - PH / 2 - 6); } else movePaddle(p2, d2, 8, dt);
  } else {
    const ai = AI[mode];
    p2.think -= dt;
    if (p2.think <= 0) { p2.think = ai.react; p2.target = b.dx > 0 ? predictY() + rand(-ai.err, ai.err) : H / 2 + (b.y - H / 2) * .3; }
    const diff = p2.target - p2.y;
    movePaddle(p2, Math.abs(diff) < 6 ? 0 : Math.sign(diff) * Math.min(1, Math.abs(diff) / 30), ai.speed, dt);
  }
  if (G.state === 'serve') {
    G.count -= dt;
    b.y = H / 2 + Math.sin(G.count / 12) * 4;
    if (G.count <= 0) serve();
    return;
  }
  // ball — substeps prevent tunnelling at high speed
  const steps = Math.ceil(Math.hypot(b.dx, b.dy) * dt / 6);
  for (let s = 0; s < steps; s++) {
    b.x += b.dx * dt / steps; b.y += b.dy * dt / steps;
    if (b.y < 10) { b.y = 10; b.dy = Math.abs(b.dy); wall(); }
    if (b.y > H - 10) { b.y = H - 10; b.dy = -Math.abs(b.dy); wall(); }
    if (b.dx < 0 && b.x - 8 < 30 + PW && b.x > 24 && Math.abs(b.y - p1.y) < PH / 2 + 8) hit(p1, 1);
    if (b.dx > 0 && b.x + 8 > W - 30 - PW && b.x < W - 24 && Math.abs(b.y - p2.y) < PH / 2 + 8) hit(p2, -1);
    if (b.x < -20) return point(2);
    if (b.x > W + 20) return point(1);
  }
  b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 12) b.trail.shift();
  parts.update(dt);
  G.flash = Math.max(0, G.flash - .04 * dt);
}
function wall() { sfx.tone(240, { type: 'square', dur: .04, vol: .03 }); }
function hit(p, dir) {
  const b = G.ball;
  const off = clamp((b.y - p.y) / (PH / 2), -1, 1);
  G.rally++;
  const speed = Math.min(15, 6.2 + G.rally * .45);
  const ang = off * 1.0 + clamp(p.vy * .03, -.25, .25); // edge hits and paddle motion add angle
  b.dx = Math.cos(ang) * speed * dir; b.dy = Math.sin(ang) * speed;
  b.x = dir > 0 ? 30 + PW + 8 : W - 30 - PW - 8;
  parts.burst(b.x, b.y, dir > 0 ? '#f97316' : '#38bdf8', 10 + G.rally, { speed: 3 });
  sfx.tone(dir > 0 ? 440 : 520, { type: 'square', dur: .06, vol: .04 });
  if (G.rally > 6) shake.hit(Math.min(5, G.rally * .4));
}
function point(who) {
  G.longest = Math.max(G.longest, G.rally);
  if (who === 1) G.s1++; else G.s2++;
  G.server = who === 1 ? -1 : 1; // loser serves... toward the scorer's opponent
  shake.hit(10); G.flash = 1;
  parts.burst(who === 1 ? W - 10 : 10, G.ball.y, who === 1 ? '#f97316' : '#38bdf8', 36, { speed: 5 });
  sfx.score();
  Kit.say(`${G.s1} to ${G.s2}`);
  if (G.s1 >= WIN || G.s2 >= WIN) return end();
  resetBall();
}
function end() {
  G.state = 'over';
  const p1won = G.s1 > G.s2;
  let title, grad = true;
  if (mode === 'pvp') title = p1won ? 'Orange wins' : 'Cyan wins';
  else { title = p1won ? 'You win' : 'Computer wins'; grad = p1won; store.set(p1won ? 'wins' : 'losses', store.data[p1won ? 'wins' : 'losses'] + 1); }
  if (grad) { sfx.win(); Kit.confetti(); } else sfx.lose();
  Kit.overlay(ov, {
    title, grad, text: `Final score ${G.s1} – ${G.s2}. Longest rally: ${G.longest} hits.`,
    stats: mode === 'pvp' ? null : [[store.data.wins, 'Wins'], [store.data.losses, 'Losses']],
    actions: [{ label: 'Rematch', primary: true, onClick: () => { Kit.overlay(ov, null); newMatch(); } }],
  });
}

/* ── Draw ── */
function draw() {
  ctx.fillStyle = '#0c0c13'; ctx.fillRect(0, 0, W, H);
  const sh = shake.apply(ctx);
  ctx.fillStyle = 'rgba(226,232,240,.12)';
  for (let y = 10; y < H; y += 26) ctx.fillRect(W / 2 - 2, y, 4, 14);
  ctx.strokeStyle = 'rgba(226,232,240,.06)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(W / 2, H / 2, 60, 0, 7); ctx.stroke();
  // scores
  ctx.font = '96px "Bebas Neue", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(249,115,22,.22)'; ctx.fillText(G.s1, W / 2 - 90, 24);
  ctx.fillStyle = 'rgba(56,189,248,.22)'; ctx.fillText(G.s2, W / 2 + 90, 24);
  // paddles
  paddle(30, G.p1.y, '#f97316');
  paddle(W - 30 - PW, G.p2.y, '#38bdf8');
  // ball + trail
  const b = G.ball;
  b.trail.forEach((t, i) => { ctx.fillStyle = `rgba(226,232,240,${i / b.trail.length * .25})`; ctx.beginPath(); ctx.arc(t.x, t.y, 8 * i / b.trail.length, 0, 7); ctx.fill(); });
  ctx.shadowColor = '#e2e8f0'; ctx.shadowBlur = 14;
  ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.arc(b.x, b.y, 8, 0, 7); ctx.fill();
  ctx.shadowBlur = 0;
  parts.draw(ctx);
  if (sh) ctx.restore();
  if (G.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${G.flash * .08})`; ctx.fillRect(0, 0, W, H); }
  if (G.state === 'serve') {
    const n = Math.ceil(G.count / 50);
    ctx.font = '64px "Bebas Neue", sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e2e8f0'; ctx.fillText(n > 0 ? n : '', W / 2, H / 2 - 70);
  }
  if (G.rally >= 5 && G.state === 'play') {
    ctx.font = '600 13px DM Sans, sans-serif'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#fbbf24';
    ctx.fillText(`Rally ${G.rally}`, W / 2, H - 10);
  }
}
function paddle(x, y, col) {
  ctx.shadowColor = col; ctx.shadowBlur = 16;
  ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x, y - PH / 2, PW, PH, 6); ctx.fill();
  ctx.shadowBlur = 0;
}

function intro() {
  newMatch(); G.state = 'intro';
  $('#keys').innerHTML = mode === 'pvp'
    ? 'Orange: <kbd>W</kbd><kbd>S</kbd> · Cyan: <kbd>↑</kbd><kbd>↓</kbd> · touch: drag on your half · <kbd>P</kbd> pause'
    : 'Move with <kbd>W</kbd><kbd>S</kbd>, <kbd>↑</kbd><kbd>↓</kbd>, the mouse or by dragging · <kbd>P</kbd> pause';
  Kit.overlay(ov, {
    title: 'Pong', grad: true,
    text: mode === 'pvp' ? 'Orange on the left, cyan on the right. First to 7.' : `You are orange. The computer (${mode}) is cyan. First to 7.`,
    actions: [{ label: 'Serve', primary: true, onClick: () => { Kit.overlay(ov, null); newMatch(); } }],
  });
}
// Mouse control for player 1 when not in 2-player mode
cv.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && mode !== 'pvp') touches.set('mouse', Kit.canvasPoint(cv, e, W, H)); });
cv.addEventListener('pointerleave', () => touches.delete('mouse'));

mode = store.data.mode; setMode(mode);
intro();
Kit.loop(dt => { if (G.state === 'play' || G.state === 'serve') update(dt); else parts.update(dt); draw(); });
