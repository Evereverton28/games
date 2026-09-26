/* ═══════════════════════════════════════════════════════════
   SNAKE
═══════════════════════════════════════════════════════════ */
const { $, sfx, randInt } = Kit;
const N = 20, CELL = 24, W = N * CELL, H = N * CELL;
const cv = $('#cv'), ctx = Kit.fitCanvas(cv, W, H), ov = $('#ov');
const store = Kit.store('snake', { mode: 'walls', best: {} });
const parts = new Kit.Particles(), shake = new Kit.Shake();
Kit.soundToggle($('#sound'));

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
let mode, G;
const setMode = Kit.segmented($('#mode'), v => { mode = v; store.set('mode', v); ready(); });

function reset() {
  G = { state: 'ready', snake: [{ x: 7, y: 10 }, { x: 6, y: 10 }, { x: 5, y: 10 }], prev: null, dir: 'right', queue: [],
        food: null, bonus: null, score: 0, eaten: 0, tick: 0, step: 9, grow: 0, t: 0 };
  G.prev = G.snake.map(s => ({ ...s }));
  G.food = freeCell();
  hud();
}
function freeCell() {
  let c;
  do { c = { x: randInt(0, N - 1), y: randInt(0, N - 1) }; }
  while (G.snake.some(s => s.x === c.x && s.y === c.y) || (G.food && G.food.x === c.x && G.food.y === c.y) || (G.bonus && G.bonus.x === c.x && G.bonus.y === c.y));
  return c;
}
function turn(d) {
  if (G.state === 'ready' || G.state === 'over') { if (G.state === 'over') return; start(); }
  if (G.state !== 'play') return;
  const last = G.queue.length ? G.queue[G.queue.length - 1] : G.dir;
  const [lx, ly] = DIRS[last], [dx, dy] = DIRS[d];
  if (d === last || (lx === -dx && ly === -dy)) return;
  if (G.queue.length < 2) G.queue.push(d);
}
addEventListener('keydown', e => {
  const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  if (map[e.key]) { e.preventDefault(); turn(map[e.key]); }
  if (e.key === 'p' || e.key === 'Escape' || (e.key === ' ' && G.state !== 'ready')) { e.preventDefault(); pause(); }
  if ((e.key === ' ' || e.key === 'Enter') && G.state === 'ready') start();
});
Kit.swipe(cv, turn, { min: 18 });
document.querySelectorAll('.pad button').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); turn(b.dataset.d); }));
Kit.onHide(() => { if (G.state === 'play') pause(); });
function pause() {
  if (G.state === 'play') { G.state = 'paused'; Kit.overlay(ov, { title: 'Paused', text: `Length ${G.snake.length}.`, actions: [{ label: 'Resume', primary: true, onClick: pause }] }); }
  else if (G.state === 'paused') { G.state = 'play'; Kit.overlay(ov, null); }
}
function start() { G.state = 'play'; Kit.overlay(ov, null); }

function step() {
  if (G.queue.length) G.dir = G.queue.shift();
  const [dx, dy] = DIRS[G.dir];
  const head = G.snake[0];
  let nx = head.x + dx, ny = head.y + dy;
  if (mode === 'wrap') { nx = (nx + N) % N; ny = (ny + N) % N; }
  else if (nx < 0 || ny < 0 || nx >= N || ny >= N) return die();
  // moving into the current tail is fine because it moves away this step (unless growing)
  const body = G.grow ? G.snake : G.snake.slice(0, -1);
  if (body.some(s => s.x === nx && s.y === ny)) return die();
  G.prev = G.snake.map(s => ({ ...s }));
  G.snake.unshift({ x: nx, y: ny });
  if (G.grow) { G.grow--; G.prev.push({ ...G.prev[G.prev.length - 1] }); } else G.snake.pop();
  if (nx === G.food.x && ny === G.food.y) {
    G.score += 1; G.eaten++; G.grow += 1;
    parts.burst(nx * CELL + CELL / 2, ny * CELL + CELL / 2, '#f43f5e', 12, { speed: 2.5 });
    sfx.tone(520 + Math.min(G.eaten, 30) * 12, { type: 'triangle', dur: .08, vol: .05 });
    G.food = freeCell();
    if (G.eaten % 5 === 0) G.step = Math.max(4.5, G.step - .6);
    if (!G.bonus && G.eaten % 4 === 0) G.bonus = { ...freeCell(), life: 360 };
  }
  if (G.bonus && nx === G.bonus.x && ny === G.bonus.y) {
    const pts = 3 + Math.ceil(G.bonus.life / 90);
    G.score += pts; G.grow += 2;
    parts.burst(nx * CELL + CELL / 2, ny * CELL + CELL / 2, '#fbbf24', 20, { speed: 3.5 });
    sfx.coin();
    Kit.toast(`Golden food +${pts}`, 1200);
    G.bonus = null;
  }
  hud();
}
function die() {
  G.state = 'over';
  shake.hit(10); sfx.boom();
  G.snake.forEach((s, i) => setTimeout(() => parts.burst(s.x * CELL + CELL / 2, s.y * CELL + CELL / 2, i % 2 ? '#f97316' : '#38bdf8', 4, { speed: 2 }), i * 15));
  const best = store.data.best[mode] || 0;
  const record = G.score > best;
  if (record) { store.data.best[mode] = G.score; store.save(); }
  hud();
  setTimeout(() => Kit.overlay(ov, {
    title: 'Game over', grad: record && G.score > 0, text: `You grew to ${G.snake.length} segments.`,
    stats: [[G.score, 'Score'], [store.data.best[mode] || 0, 'Best']], note: record && G.score > 0 ? 'New best score' : '',
    actions: [{ label: 'Play again', primary: true, onClick: () => { reset(); start(); } }],
  }), 700);
}
function hud() { $('#score').textContent = G.score; $('#len').textContent = G.snake.length; $('#best').textContent = Math.max(G.score, store.data.best[mode] || 0); }

function update(dt) {
  G.tick += dt;
  if (G.tick >= G.step) { G.tick -= G.step; step(); }
  if (G.bonus) { G.bonus.life -= dt; if (G.bonus.life <= 0) G.bonus = null; }
}

/* ── Draw ── */
function draw(dt) {
  G.t += dt;
  ctx.fillStyle = '#0d0d14'; ctx.fillRect(0, 0, W, H);
  const sh = shake.apply(ctx);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x + y) % 2) { ctx.fillStyle = 'rgba(255,255,255,.018)'; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); }
  if (mode === 'walls') { ctx.strokeStyle = 'rgba(244,63,94,.35)'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, W - 3, H - 3); }
  // food
  const pulse = 1 + Math.sin(G.t / 8) * .08;
  const f = G.food;
  ctx.fillStyle = '#f43f5e'; ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(f.x * CELL + CELL / 2, f.y * CELL + CELL / 2 + 1, CELL * .36 * pulse, 0, 7); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = '#22c55e'; ctx.fillRect(f.x * CELL + CELL / 2, f.y * CELL + 3, 3, 6);
  if (G.bonus) {
    const b = G.bonus, blink = b.life < 100 && Math.floor(b.life / 8) % 2;
    if (!blink) {
      ctx.fillStyle = '#fbbf24'; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 16;
      const cx = b.x * CELL + CELL / 2, cy = b.y * CELL + CELL / 2, r = CELL * .42 * pulse;
      ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? r * .45 : r; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
  // snake — interpolate between previous and current positions
  const k = G.state === 'play' ? Math.min(1, G.tick / G.step) : 1;
  const pts = G.snake.map((s, i) => {
    const p = G.prev[i] || s;
    let px = p.x, py = p.y;
    if (Math.abs(s.x - p.x) > 1) px = s.x + Math.sign(p.x - s.x); // wrap: slide from just off-edge
    if (Math.abs(s.y - p.y) > 1) py = s.y + Math.sign(p.y - s.y);
    return { x: (px + (s.x - px) * k) * CELL + CELL / 2, y: (py + (s.y - py) * k) * CELL + CELL / 2, jump: Math.abs(s.x - p.x) > 1 || Math.abs(s.y - p.y) > 1 };
  });
  const n = pts.length;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = n - 1; i > 0; i--) {
    const a = pts[i], b = pts[i - 1];
    if (Math.abs(a.x - b.x) > CELL * 1.5 || Math.abs(a.y - b.y) > CELL * 1.5) continue;
    const t = i / n;
    ctx.strokeStyle = `rgb(${Math.round(249 + (56 - 249) * t)},${Math.round(115 + (189 - 115) * t)},${Math.round(22 + (248 - 22) * t)})`;
    ctx.lineWidth = CELL * (.78 - t * .22);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // head
  const h = pts[0], [dx, dy] = DIRS[G.queue[0] && k > .9 ? G.queue[0] : G.dir];
  ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(h.x, h.y, CELL * .44, 0, 7); ctx.fill();
  const ex = -dy, ey = dx;
  for (const s of [-1, 1]) {
    const cx = h.x + dx * 4 + ex * 5 * s, cy = h.y + dy * 4 + ey * 5 * s;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 3.4, 0, 7); ctx.fill();
    ctx.fillStyle = G.state === 'over' ? '#64748b' : '#0a0a0f'; ctx.beginPath(); ctx.arc(cx + dx * 1.2, cy + dy * 1.2, 1.8, 0, 7); ctx.fill();
  }
  parts.draw(ctx);
  if (sh) ctx.restore();
}

function ready() {
  reset();
  Kit.overlay(ov, {
    title: 'Snake', grad: true,
    text: mode === 'wrap' ? 'Pass through one edge to come out the other. Golden food is worth extra but vanishes.' : 'Hitting the edge ends the game. Golden food is worth extra but vanishes.',
    actions: [{ label: 'Start', primary: true, onClick: start }],
  });
}
mode = store.data.mode; setMode(mode);
ready();
Kit.loop(dt => { if (G.state === 'play') update(dt); parts.update(dt); draw(G.state === 'play' ? dt : dt * .3); });
