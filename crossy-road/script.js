/* ═══════════════════════════════════════════════════════════
   CROSSY ROAD
   World rows grow upward: row 0 is the start, the player moves to higher rows.
═══════════════════════════════════════════════════════════ */
const { $, clamp, rand, randInt, pick, sfx } = Kit;
const C = 40, COLS = 11, VIS = 15, W = C * COLS, H = C * 14;
const cv = $('#cv'), ctx = Kit.fitCanvas(cv, W, H), ov = $('#ov');
const store = Kit.store('crossy', { best: 0, bank: 0 });
const parts = new Kit.Particles();
Kit.soundToggle($('#sound'));

const CAR_COLS = ['#f43f5e', '#38bdf8', '#fbbf24', '#a78bfa', '#22c55e', '#f97316', '#e2e8f0'];
let G;

/* ── Lane generation ── */
function makeLane(row) {
  const d = Math.min(1, row / 150); // difficulty 0 → 1
  if (row < 4) return grass(row, row === 0 ? 0 : .12);
  const prev = G.lanes.get(row - 1);
  // lanes come in themed runs
  if (G.run.left <= 0) {
    const r = Math.random();
    const kind = prev && prev.type !== 'grass' && Math.random() < .55 ? 'grass'
      : r < .5 ? 'road' : r < .78 ? 'river' : r < .9 ? 'rail' : 'grass';
    G.run = { kind, left: kind === 'grass' ? randInt(1, 2) : kind === 'rail' ? randInt(1, 2) : randInt(1, 3 + Math.round(d * 2)) };
  }
  G.run.left--;
  const k = G.run.kind;
  if (k === 'grass') return grass(row, .18 + d * .1);
  const dir = Math.random() < .5 ? 1 : -1;
  if (k === 'road') {
    const truck = Math.random() < .3;
    const speed = rand(.9, 1.6) + d * 1.4;
    const lane = { type: 'road', dir, speed, items: [], row };
    const len = truck ? 2.4 : 1.35, gap = rand(2.4, 4.2) - d * .6;
    let x = rand(0, 3);
    while (x < COLS + 6) { lane.items.push({ x, len, col: truck ? '#cbd5e1' : pick(CAR_COLS), truck }); x += len + gap + rand(0, 2.5); }
    lane.wrap = x;
    return lane;
  }
  if (k === 'river') {
    const pads = Math.random() < .22;
    const lane = { type: 'river', dir: pads ? 0 : dir, speed: pads ? 0 : rand(.6, 1.2) + d * .8, items: [], row };
    if (pads) {
      const cols = new Set(); while (cols.size < randInt(3, 5)) cols.add(randInt(0, COLS - 1));
      cols.forEach(c => lane.items.push({ x: c + .1, len: .8, pad: true }));
      lane.wrap = COLS;
    } else {
      let x = rand(-1, 1);
      while (x < COLS + 6) { const len = randInt(2, 4) - (d > .6 && Math.random() < .4 ? 1 : 0); lane.items.push({ x, len }); x += len + rand(1.4, 2.8) + d * .8; }
      lane.wrap = x;
    }
    return lane;
  }
  return { type: 'rail', dir, row, train: null, timer: rand(120, 360), warn: 0 };
}
function grass(row, density) {
  const trees = new Set();
  if (row > 0) for (let c = 0; c < COLS; c++) if (Math.random() < density) trees.add(c);
  // Keep the path open under the player's column near the start
  if (row < 3) trees.delete(5);
  const coin = row > 4 && Math.random() < .22 ? randInt(0, COLS - 1) : -1;
  if (trees.has(coin)) trees.delete(coin);
  return { type: 'grass', row, trees, coin, shade: row % 2 };
}
function lane(row) {
  if (!G.lanes.has(row)) G.lanes.set(row, makeLane(row));
  return G.lanes.get(row);
}

/* ── State ── */
function reset() {
  G = { state: 'ready', lanes: new Map(), run: { kind: 'grass', left: 0 },
        p: { col: 5, row: 0, x: 5, fromX: 5, fromRow: 0, t: 1, face: 'up', squash: 0, dead: null, on: null },
        camY: 0, maxRow: 0, coins: 0, queue: [], idle: 0, shake: 0, eagle: null };
  for (let r = -4; r < VIS + 6; r++) lane(r);
  hud();
}
reset();

/* ── Input ── */
function hop(dir) {
  if (G.state === 'ready') start();
  if (G.state !== 'play') return;
  if (G.queue.length < 2) G.queue.push(dir);
}
addEventListener('keydown', e => {
  const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', ' ': 'up' };
  if (map[e.key]) { e.preventDefault(); if (!e.repeat) hop(map[e.key]); }
});
Kit.swipe(cv, hop, { tap: () => hop('up') });
document.querySelectorAll('.pad button').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); hop(b.dataset.d); }));

function start() { G.state = 'play'; Kit.overlay(ov, null); }

function tryHop(dir) {
  const p = G.p;
  const dc = dir === 'left' ? -1 : dir === 'right' ? 1 : 0, dr = dir === 'up' ? 1 : dir === 'down' ? -1 : 0;
  p.face = dir;
  const tr = p.row + dr;
  // Landing column: snap to grid unless landing in a river
  const tl = lane(tr);
  let tx = p.x + dc;
  if (tl.type !== 'river') tx = Math.round(tx);
  if (tx < -.2 || tx > COLS - .8) { sfx.error(); return; }
  if (tl.type === 'grass' && tl.trees.has(Math.round(tx))) { p.squash = .6; sfx.tone(160, { dur: .05, vol: .03 }); return; }
  if (tr < G.camRowMin()) return;
  p.fromX = p.x; p.fromRow = p.row; p.row = tr; p.targetX = tx; p.t = 0; p.on = null;
  G.idle = 0;
  sfx.tone(dr > 0 ? 520 : 440, { type: 'triangle', dur: .06, vol: .04, slide: dr > 0 ? 700 : 560 });
}
G.camRowMin = () => Math.floor(G.camY / C) - 1;

/* ── Update ── */
function update(dt) {
  const p = G.p;
  // lanes move
  for (const [row, l] of G.lanes) {
    if (l.type === 'road' || (l.type === 'river' && l.speed)) {
      for (const it of l.items) {
        it.x += l.dir * l.speed * dt / 60;
        if (l.dir > 0 && it.x > COLS + 1) it.x -= l.wrap;
        if (l.dir < 0 && it.x + it.len < -1) it.x += l.wrap;
      }
    }
    if (l.type === 'rail') {
      if (!l.train) {
        l.timer -= dt;
        if (l.timer < 70 && !l.warn) { l.warn = 1; if (Math.abs(row - p.row) < 8) sfx.tone(1400, { type: 'square', dur: .08, vol: .025 }); }
        if (l.timer <= 0) { l.train = { x: l.dir > 0 ? -18 : COLS + 1, len: 17 }; l.warn = 0; if (Math.abs(row - p.row) < 7) sfx.noise({ dur: 1.2, vol: .07, filter: 500 }); }
      } else {
        l.train.x += l.dir * 22 * dt / 60;
        if ((l.dir > 0 && l.train.x > COLS + 2) || (l.dir < 0 && l.train.x + l.train.len < -2)) { l.train = null; l.timer = rand(200, 420); }
      }
    }
  }
  // hop animation
  if (p.t < 1) {
    p.t = Math.min(1, p.t + .16 * dt);
    p.x = Kit.lerp(p.fromX, p.targetX, p.t);
    if (p.t >= 1) land();
  } else if (G.queue.length && !p.dead) tryHop(G.queue.shift());
  p.squash = Math.max(0, p.squash - .05 * dt);

  // riding logs
  const cur = lane(p.row);
  if (p.t >= 1 && cur.type === 'river' && p.on) {
    p.x += cur.dir * cur.speed * dt / 60;
    if (p.x < -.6 || p.x > COLS - .4) return die('drift');
  }
  // collisions
  if (!p.dead && cur.type === 'road') for (const it of cur.items) if (p.x + .75 > it.x && p.x + .25 < it.x + it.len) return die('car');
  if (!p.dead && cur.type === 'rail' && cur.train && p.x + .8 > cur.train.x && p.x + .2 < cur.train.x + cur.train.len) return die('train');

  // camera: follows the player and slowly pushes forward
  const targetCam = Math.max(G.camY, (p.row - 3.2) * C);
  G.camY += (targetCam - G.camY) * .08 * dt;
  G.idle += dt;
  if (G.maxRow > 0) G.camY += (.12 + Math.min(.25, G.maxRow / 800)) * dt * (G.idle > 240 ? 3 : 1);
  if ((p.row + .6) * C < G.camY && !p.dead) return die('eagle');
  // keep generated lanes ahead, drop old ones
  const top = Math.floor(G.camY / C) + VIS + 4;
  for (let r = Math.floor(G.camY / C) - 3; r <= top; r++) lane(r);
  for (const r of G.lanes.keys()) if (r < G.camY / C - 8) G.lanes.delete(r);
  parts.update(dt);
}
function land() {
  const p = G.p, l = lane(p.row);
  if (l.type === 'river') {
    const log = l.items.find(it => p.x + .5 > it.x && p.x + .5 < it.x + it.len);
    if (!log) return die('water');
    p.on = log;
    if (log.pad) p.x = log.x - .1;
    sfx.tone(300, { type: 'sine', dur: .06, vol: .04 });
  }
  if (l.type === 'grass' && l.coin === Math.round(p.x)) {
    l.coin = -1; G.coins++; sfx.coin();
    parts.burst(sx(p.x + .5), sy(p.row) - 10, '#fbbf24', 10, { speed: 2.5 });
  }
  if (p.row > G.maxRow) { G.maxRow = p.row; }
  hud();
}
function die(kind) {
  const p = G.p;
  p.dead = kind; G.state = 'over';
  const x = sx(p.x + .5), y = sy(p.row) - 12;
  if (kind === 'water' || kind === 'drift') { parts.burst(x, y + 10, '#7dd3fc', 26, { speed: 3.5, gravity: .15 }); sfx.noise({ dur: .4, vol: .1, filter: 2200 }); }
  else if (kind === 'eagle') { G.eagle = { y: -60 }; sfx.tone(900, { type: 'sawtooth', dur: .4, vol: .04, slide: 400 }); }
  else { parts.burst(x, y, '#f8fafc', 24, { speed: 4 }); parts.burst(x, y, '#f43f5e', 10, { speed: 3 }); sfx.boom(); G.shake = 12; }
  const score = G.maxRow;
  const best = store.best('best', score);
  store.set('bank', store.data.bank + G.coins);
  hud();
  const msg = { car: 'Flattened by traffic.', train: 'The train always wins.', water: 'Chickens cannot swim.', drift: 'Swept away down the river.', eagle: 'Too slow. The eagle swooped in.' }[kind];
  setTimeout(() => Kit.overlay(ov, {
    title: 'Game over', grad: best && score > 0, text: msg,
    stats: [[score, 'Score'], [G.coins, 'Coins'], [store.data.best, 'Best']],
    note: best && score > 0 ? 'New best score' : '',
    actions: [{ label: 'Hop again', primary: true, onClick: () => { reset(); start(); } }],
  }), 900);
}
function hud() {
  $('#score').textContent = G.maxRow; $('#coins').textContent = G.coins; $('#best').textContent = store.data.best;
}

/* ── Drawing (blocky pseudo-3D) ── */
const sx = col => col * C;
const sy = row => H - (row * C - G.camY) - C; // top of a row on screen
function block(x, y, w, h, depth, top, side) {
  ctx.fillStyle = side; ctx.fillRect(x, y + h - depth, w, depth + depth * .0);
  ctx.fillStyle = top; ctx.fillRect(x, y - depth, w, h);
  ctx.fillStyle = side; ctx.fillRect(x, y + h - depth, w, depth);
}
function draw() {
  ctx.save();
  if (G.shake > 0) { ctx.translate(rand(-G.shake, G.shake) * .5, rand(-G.shake, G.shake) * .5); G.shake *= .85; if (G.shake < .5) G.shake = 0; }
  const r0 = Math.floor(G.camY / C) - 1, r1 = r0 + VIS + 2;
  for (let r = r1; r >= r0; r--) {
    const l = lane(r), y = sy(r);
    if (l.type === 'grass') {
      ctx.fillStyle = l.shade ? '#2f6b3a' : '#347542'; ctx.fillRect(0, y, W, C);
    } else if (l.type === 'road') {
      ctx.fillStyle = '#2a2a36'; ctx.fillRect(0, y, W, C);
      const nb = lane(r + 1);
      if (nb.type === 'road') { ctx.fillStyle = 'rgba(226,232,240,.35)'; for (let x = 8; x < W; x += 40) ctx.fillRect(x, y - 1, 20, 2); }
    } else if (l.type === 'river') {
      ctx.fillStyle = '#1d4e89'; ctx.fillRect(0, y, W, C);
      ctx.fillStyle = 'rgba(125,211,252,.12)';
      const off = (performance.now() / 40 * (l.dir || .3)) % 40;
      for (let x = -40 + off; x < W; x += 40) ctx.fillRect(x, y + 12 + (r % 2) * 10, 16, 2);
    } else {
      ctx.fillStyle = '#3b3530'; ctx.fillRect(0, y, W, C);
      ctx.fillStyle = '#5b4636'; for (let x = 2; x < W; x += 14) ctx.fillRect(x, y + 6, 6, C - 12);
      ctx.fillStyle = '#94a3b8'; ctx.fillRect(0, y + 11, W, 3); ctx.fillRect(0, y + C - 14, W, 3);
    }
  }
  // Objects, drawn back-to-front so nearer rows overlap farther ones
  for (let r = r1; r >= r0; r--) {
    const l = lane(r), y = sy(r);
    if (l.type === 'grass') {
      for (const c of l.trees) {
        block(sx(c) + 8, y + 10, 24, 20, 8, '#5b3a22', '#3f2716');
        block(sx(c) + 3, y - 4, 34, 28, 14, '#3f9a57', '#2c6e3e');
      }
      if (l.coin >= 0) {
        const bob = Math.sin(performance.now() / 200 + r) * 3;
        ctx.fillStyle = '#b45309'; ctx.beginPath(); ctx.ellipse(sx(l.coin) + 20, y + 18 + bob + 2, 9, 9, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.ellipse(sx(l.coin) + 20, y + 18 + bob, 9, 9, 0, 0, 7); ctx.fill();
      }
    }
    if (l.type === 'river') for (const it of l.items) {
      if (it.pad) { ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.ellipse(sx(it.x) + 16, y + 20, 15, 12, 0, .3, Math.PI * 2 - .3); ctx.lineTo(sx(it.x) + 16, y + 20); ctx.fill(); }
      else block(sx(it.x) + 2, y + 10, it.len * C - 4, 22, 6, '#8b5a33', '#5c3a1f');
    }
    if (l.type === 'road') for (const it of l.items) drawCar(sx(it.x), y, it.len * C, it, l.dir);
    if (l.type === 'rail') {
      // signal light
      const on = l.warn && Math.floor(performance.now() / 180) % 2;
      ctx.fillStyle = '#1e1e2e'; ctx.fillRect(W - 18, y - 16, 6, 28);
      ctx.fillStyle = on ? '#f43f5e' : '#4b1d27'; ctx.beginPath(); ctx.arc(W - 15, y - 16, 6, 0, 7); ctx.fill();
      if (on) { ctx.fillStyle = 'rgba(244,63,94,.15)'; ctx.fillRect(0, y, W, C); }
      if (l.train) {
        const tx = sx(l.train.x);
        for (let k = 0; k < 4; k++) block(tx + k * (l.train.len * C / 4) + 2, y + 4, l.train.len * C / 4 - 4, 30, 14, k === (l.dir > 0 ? 3 : 0) ? '#f43f5e' : '#e2e8f0', k === (l.dir > 0 ? 3 : 0) ? '#9f1239' : '#94a3b8');
      }
    }
    if (G.p.row === r) drawChicken();
  }
  parts.draw(ctx);
  if (G.eagle) { G.eagle.y += 14; const x = sx(G.p.x + .5); ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.moveTo(x - 60, G.eagle.y); ctx.lineTo(x, G.eagle.y + 30); ctx.lineTo(x + 60, G.eagle.y); ctx.lineTo(x, G.eagle.y + 10); ctx.fill(); }
  ctx.restore();
  if (G.state === 'play' && G.maxRow === 0) {
    ctx.fillStyle = 'rgba(10,10,15,.6)'; ctx.fillRect(0, H - 50, W, 50);
    ctx.fillStyle = '#e2e8f0'; ctx.font = '600 14px DM Sans, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Hop forward to start scoring', W / 2, H - 20);
  }
}
function drawCar(x, y, w, it, dir) {
  if (it.truck) {
    block(x + 2, y + 8, w - 4, 26, 16, '#cbd5e1', '#64748b');
    const cabX = dir > 0 ? x + w - 26 : x + 2;
    block(cabX, y + 6, 24, 28, 18, '#f97316', '#9a3412');
  } else {
    block(x + 3, y + 10, w - 6, 22, 10, it.col, 'rgba(0,0,0,.45)');
    ctx.fillStyle = it.col; ctx.fillRect(x + 3, y + 10 + 12, w - 6, 10); ctx.globalAlpha = .35; ctx.fillStyle = '#000'; ctx.fillRect(x + 3, y + 10 + 12, w - 6, 10); ctx.globalAlpha = 1;
    block(x + w * .28, y + 6, w * .44, 14, 8, '#0f172a', '#020617');
    ctx.fillStyle = '#fef9c3'; ctx.fillRect(dir > 0 ? x + w - 7 : x + 3, y + 12, 4, 6);
  }
}
function drawChicken() {
  const p = G.p;
  if (p.dead === 'water' || p.dead === 'drift' || (p.dead === 'eagle' && G.eagle && G.eagle.y > sy(p.row))) return;
  const hopH = p.t < 1 ? Math.sin(p.t * Math.PI) * 16 : 0;
  const rowY = p.t < 1 ? Kit.lerp(sy(p.fromRow), sy(p.row), p.t) : sy(p.row);
  const x = sx(p.x) + 6, y = rowY + 8 - hopH;
  const flat = p.dead === 'car' || p.dead === 'train';
  const sq = 1 - p.squash * .25;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x + 2, rowY + 30, 24, 6);
  if (flat) { ctx.fillStyle = '#f8fafc'; ctx.fillRect(x - 4, rowY + 20, 32, 8); ctx.fillStyle = '#f43f5e'; ctx.fillRect(x + 10, rowY + 18, 6, 4); return; }
  const h = 22 * sq;
  block(x, y + (22 - h), 28, h + 2, 14, '#f8fafc', '#cbd5e1');
  // comb + beak depend on facing
  ctx.fillStyle = '#f43f5e'; ctx.fillRect(x + 10, y + (22 - h) - 19, 8, 5);
  ctx.fillStyle = '#fb923c';
  if (p.face === 'up') ctx.fillRect(x + 9, y + (22 - h) - 14, 6, 3);
  if (p.face === 'down') ctx.fillRect(x + 9, y + 8, 6, 5);
  if (p.face === 'left') ctx.fillRect(x - 4, y + 2, 5, 5);
  if (p.face === 'right') ctx.fillRect(x + 23, y + 2, 5, 5);
  ctx.fillStyle = '#0a0a0f';
  if (p.face !== 'up') { ctx.fillRect(x + 5, y + 1, 3, 3); ctx.fillRect(x + 16, y + 1, 3, 3); }
}

Kit.overlay(ov, {
  title: 'Crossy Road', grad: true,
  text: 'Hop as far as you can. Ride the logs, never touch the water, and do not dawdle or the eagle comes.',
  actions: [{ label: 'Start hopping', primary: true, onClick: start }],
});
Kit.onHide(() => { if (G.state === 'play') { G.state = 'paused'; Kit.overlay(ov, { title: 'Paused', actions: [{ label: 'Resume', primary: true, onClick: start }] }); } });
Kit.loop(dt => { if (G.state === 'play') update(dt); else parts.update(dt); draw(); });
