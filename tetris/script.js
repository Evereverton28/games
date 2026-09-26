/* ═══════════════════════════════════════════════════════════
   TETRIS — SRS rotation, 7-bag, hold, ghost, lock delay
═══════════════════════════════════════════════════════════ */
const { $, sfx } = Kit;
const COLS = 10, ROWS = 20, B = 28, BX = 96, W = BX + COLS * B + 104, H = ROWS * B + 8, BY = 4;
const cv = $('#cv'), ctx = Kit.fitCanvas(cv, W, H), ov = $('#ov');
const store = Kit.store('tetris', { best: 0 });
const parts = new Kit.Particles();
Kit.soundToggle($('#sound'));

const SHAPES = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]], O: [[1, 0], [2, 0], [1, 1], [2, 1]], T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};
const COLOR = { I: '#22d3ee', O: '#fbbf24', T: '#a78bfa', S: '#22c55e', Z: '#f43f5e', J: '#3b82f6', L: '#f97316' };
// SRS wall-kick data (y up in the spec, so dy is negated when applied)
const KICKS = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};
function cells(type, rot) {
  // rotate within the piece's bounding box (4 for I, 2 for O, 3 otherwise)
  const n = type === 'I' ? 4 : type === 'O' ? 2 : 3;
  let c = SHAPES[type].map(([x, y]) => type === 'O' ? [x - 1, y] : [x, y]);
  for (let r = 0; r < rot; r++) c = c.map(([x, y]) => [n - 1 - y, x]);
  return c;
}

let G;
function newGame() {
  G = { board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)), bag: [], queue: [], hold: null, canHold: true,
        score: 0, lines: 0, level: 1, combo: -1, b2b: false, state: 'play', piece: null, drop: 0, lock: 0, resets: 0,
        clearing: null, pops: [], lastRot: false, flash: 0 };
  while (G.queue.length < 5) G.queue.push(fromBag());
  spawn(); hud();
}
function fromBag() { if (!G.bag.length) G.bag = Kit.shuffle(Object.keys(SHAPES)); return G.bag.pop(); }
function spawn(type) {
  type = type || G.queue.shift();
  if (G.queue.length < 5) G.queue.push(fromBag());
  G.piece = { type, rot: 0, x: type === 'O' ? 4 : 3, y: -1 };
  G.lock = 0; G.resets = 0; G.lastRot = false;
  if (collides(G.piece)) { G.piece.y = -2; if (collides(G.piece)) return gameOver(); }
}
function collides(p, dx = 0, dy = 0, rot = p.rot) {
  for (const [x, y] of cells(p.type, rot)) {
    const cx = p.x + x + dx, cy = p.y + y + dy;
    if (cx < 0 || cx >= COLS || cy >= ROWS) return true;
    if (cy >= 0 && G.board[cy][cx]) return true;
  }
  return false;
}
function grounded() { return collides(G.piece, 0, 1); }
function resetLock() { if (grounded() && G.resets < 15) { G.lock = 0; G.resets++; } }

/* ── Actions ── */
function move(dx) {
  if (!active()) return false;
  if (collides(G.piece, dx, 0)) return false;
  G.piece.x += dx; G.lastRot = false; resetLock();
  sfx.tone(260, { type: 'triangle', dur: .03, vol: .025 });
  return true;
}
function rotate(dir) {
  if (!active() || G.piece.type === 'O') return;
  const p = G.piece, to = (p.rot + dir + 4) % 4;
  const table = (p.type === 'I' ? KICKS_I : KICKS)[`${p.rot}>${to}`];
  for (const [kx, ky] of table) {
    if (!collides(p, kx, -ky, to)) {
      p.x += kx; p.y -= ky; p.rot = to; G.lastRot = true; resetLock();
      sfx.tone(420, { type: 'triangle', dur: .05, vol: .03, slide: 520 });
      return;
    }
  }
}
function softDrop() { if (active() && !grounded()) { G.piece.y++; G.score++; G.drop = 0; G.lastRot = false; hud(); } }
function hardDrop() {
  if (!active()) return;
  let n = 0; while (!grounded()) { G.piece.y++; n++; }
  G.score += n * 2; if (n) G.lastRot = false;
  for (const [x, y] of cells(G.piece.type, G.piece.rot)) parts.burst(BX + (G.piece.x + x) * B + B / 2, BY + (G.piece.y + y) * B + B, COLOR[G.piece.type], 2, { speed: 1.5, gravity: -.02 });
  sfx.tone(160, { type: 'square', dur: .08, vol: .05, slide: 90 });
  lockPiece();
}
function hold() {
  if (!active() || !G.canHold) return;
  const t = G.piece.type;
  if (G.hold) spawn(G.hold); else spawn();
  G.hold = t; G.canHold = false;
  sfx.tone(600, { type: 'sine', dur: .08, vol: .04, slide: 400 });
}
const active = () => G && G.state === 'play' && !G.clearing && G.piece;

function tSpin() {
  const p = G.piece;
  if (p.type !== 'T' || !G.lastRot) return false;
  const corners = [[0, 0], [2, 0], [0, 2], [2, 2]].filter(([x, y]) => {
    const cx = p.x + x, cy = p.y + y;
    return cx < 0 || cx >= COLS || cy >= ROWS || (cy >= 0 && G.board[cy][cx]);
  });
  return corners.length >= 3;
}
function lockPiece() {
  const p = G.piece, spin = tSpin();
  let above = false;
  for (const [x, y] of cells(p.type, p.rot)) {
    if (p.y + y < 0) above = true; else G.board[p.y + y][p.x + x] = p.type;
  }
  if (above) return gameOver();
  G.piece = null; G.canHold = true;
  const full = [];
  for (let r = 0; r < ROWS; r++) if (G.board[r].every(Boolean)) full.push(r);
  score(full.length, spin);
  if (full.length) { G.clearing = { rows: full, t: 0 }; }
  else { sfx.tone(200, { type: 'triangle', dur: .05, vol: .04 }); spawn(); }
}
function score(n, spin) {
  const L = G.level;
  let pts = 0, label = '';
  if (spin) { pts = [400, 800, 1200, 1600][n]; label = ['T-spin', 'T-spin single', 'T-spin double', 'T-spin triple'][n]; }
  else pts = [0, 100, 300, 500, 800][n];
  const difficult = n === 4 || (spin && n > 0);
  if (n) {
    if (difficult && G.b2b) { pts *= 1.5; label = 'Back-to-back ' + (label || 'Tetris'); }
    G.b2b = difficult;
    G.combo++;
    if (G.combo > 0) pts += 50 * G.combo * L;
    if (n === 4 && !label) label = 'Tetris';
  } else G.combo = -1;
  G.score += Math.round(pts * L);
  if (label || G.combo > 0) G.pops.push({ text: label + (G.combo > 0 ? `${label ? ' · ' : ''}Combo ${G.combo}` : ''), life: 90 });
  if (n) {
    G.lines += n;
    const lvl = Math.floor(G.lines / 10) + 1;
    if (lvl > G.level) { G.level = lvl; sfx.arp([523, 659, 784, 1047], { gap: .07 }); G.pops.push({ text: `Level ${lvl}`, life: 90 }); }
    if (n === 4 || spin) { sfx.arp([659, 880, 1047, 1319], { type: 'square', gap: .05, dur: .15, vol: .04 }); G.flash = 1; }
    else sfx.tone(520 + n * 110, { type: 'triangle', dur: .18, vol: .06 });
  }
  hud();
}
function gravityFrames() {
  // guideline gravity in seconds per row → frames
  const s = Math.pow(.8 - (G.level - 1) * .007, G.level - 1);
  return Math.max(1, s * 60);
}

/* ── Input with auto-repeat ── */
const held = {};
const DAS = 10, ARR = 2;
function keyAction(k, down) {
  if (!G) return;
  if (down) {
    if (k === 'left' || k === 'right') { held.dir = k; held.t = 0; move(k === 'left' ? -1 : 1); }
    if (k === 'soft') held.soft = true;
    if (k === 'rotate') rotate(1); if (k === 'ccw') rotate(-1);
    if (k === 'hard') hardDrop(); if (k === 'hold') hold();
  } else {
    if (k === held.dir) held.dir = null;
    if (k === 'soft') held.soft = false;
  }
}
const KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'soft', ArrowUp: 'rotate', x: 'rotate', X: 'rotate', z: 'ccw', Z: 'ccw', ' ': 'hard', c: 'hold', C: 'hold', Shift: 'hold' };
addEventListener('keydown', e => {
  const k = KEYMAP[e.key];
  if (k) { e.preventDefault(); if (!e.repeat) keyAction(k, true); }
  if (e.key === 'p' || e.key === 'Escape') pause();
  if (e.key === 'Enter' && G && G.state === 'over') start();
});
addEventListener('keyup', e => { const k = KEYMAP[e.key]; if (k) keyAction(k, false); });
document.querySelectorAll('.tpad button').forEach(b => Kit.holdButton(b, () => keyAction(b.dataset.k, true), () => keyAction(b.dataset.k, false)));
Kit.swipe(cv, d => { if (d === 'left') move(-1); if (d === 'right') move(1); if (d === 'down') hardDrop(); if (d === 'up') hold(); }, { tap: () => rotate(1), min: 30 });
Kit.onHide(() => { if (G && G.state === 'play') pause(); });
function pause() {
  if (!G) return;
  if (G.state === 'play') { G.state = 'paused'; Kit.overlay(ov, { title: 'Paused', text: `Level ${G.level}, ${G.lines} lines.`, actions: [{ label: 'Resume', primary: true, onClick: pause }] }); }
  else if (G.state === 'paused') { G.state = 'play'; Kit.overlay(ov, null); }
}

/* ── Update ── */
function update(dt) {
  if (G.clearing) {
    G.clearing.t += dt;
    if (G.clearing.t > 18) {
      for (const r of G.clearing.rows) {
        for (let c = 0; c < COLS; c++) parts.burst(BX + c * B + B / 2, BY + r * B + B / 2, COLOR[G.board[r][c]], 3, { speed: 3 });
        G.board.splice(r, 1); G.board.unshift(Array(COLS).fill(null));
      }
      G.clearing = null; spawn();
    }
    parts.update(dt); return;
  }
  if (!G.piece) return;
  if (held.dir) { held.t += dt; if (held.t >= DAS) { while (held.t >= DAS + ARR) { held.t -= ARR; move(held.dir === 'left' ? -1 : 1); } } }
  G.drop += dt * (held.soft ? 20 : 1);
  const g = gravityFrames();
  while (G.drop >= g) {
    G.drop -= g;
    if (!grounded()) { G.piece.y++; G.lastRot = false; if (held.soft) { G.score++; } }
    else break;
  }
  if (grounded()) { G.lock += dt; if (G.lock >= 30) lockPiece(); }
  for (const p of G.pops) p.life -= dt;
  G.pops = G.pops.filter(p => p.life > 0);
  G.flash = Math.max(0, G.flash - .04 * dt);
  parts.update(dt);
  if (G.state === 'play') $('#score').textContent = G.score;
}
function gameOver() {
  G.state = 'over'; G.piece = null;
  sfx.lose();
  // grey out the stack row by row
  G.board.forEach((row, r) => setTimeout(() => { row.forEach((v, c) => { if (v) row[c] = 'X'; }); }, (ROWS - r) * 30));
  const rec = store.best('best', G.score);
  hud();
  setTimeout(() => Kit.overlay(ov, {
    title: 'Topped out', grad: rec && G.score > 0, text: `You reached level ${G.level}.`,
    stats: [[G.score, 'Score'], [G.lines, 'Lines'], [store.data.best, 'Best']], note: rec && G.score ? 'New best score' : '',
    actions: [{ label: 'Play again', primary: true, onClick: start }],
  }), 800);
}
function hud() {
  $('#score').textContent = G.score; $('#lines').textContent = G.lines; $('#level').textContent = G.level;
  $('#best').textContent = Math.max(store.data.best, G.score);
}
function start() { Kit.overlay(ov, null); newGame(); }

/* ── Draw ── */
function block(x, y, col, size = B, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x + 1, y + 1, size - 2, size - 2, 4); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x + 3, y + 3, size - 6, 3);
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x + 3, y + size - 6, size - 6, 3);
  ctx.globalAlpha = 1;
}
function mini(type, cx, cy, s = 16, dim = false) {
  const c = cells(type, 0);
  const xs = c.map(p => p[0]), ys = c.map(p => p[1]);
  const w = (Math.max(...xs) - Math.min(...xs) + 1) * s, h = (Math.max(...ys) - Math.min(...ys) + 1) * s;
  for (const [x, y] of c) block(cx - w / 2 + (x - Math.min(...xs)) * s, cy - h / 2 + (y - Math.min(...ys)) * s, dim ? '#475569' : COLOR[type], s);
}
function draw() {
  ctx.clearRect(0, 0, W, H);
  // well
  ctx.fillStyle = '#0d0d14'; ctx.beginPath(); ctx.roundRect(BX - 4, BY - 4, COLS * B + 8, ROWS * B + 8, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.03)'; ctx.lineWidth = 1;
  for (let c = 1; c < COLS; c++) { ctx.beginPath(); ctx.moveTo(BX + c * B, BY); ctx.lineTo(BX + c * B, BY + ROWS * B); ctx.stroke(); }
  for (let r = 1; r < ROWS; r++) { ctx.beginPath(); ctx.moveTo(BX, BY + r * B); ctx.lineTo(BX + COLS * B, BY + r * B); ctx.stroke(); }
  // side labels
  ctx.fillStyle = '#64748b'; ctx.font = '600 12px DM Sans, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('HOLD', BX / 2 - 2, 20); ctx.fillText('NEXT', BX + COLS * B + 52, 20);
  ctx.fillStyle = '#13131a';
  ctx.beginPath(); ctx.roundRect(6, 28, BX - 18, 64, 10); ctx.fill();
  ctx.beginPath(); ctx.roundRect(BX + COLS * B + 12, 28, 80, 290, 10); ctx.fill();
  if (G) {
    if (G.hold) mini(G.hold, BX / 2 - 3, 60, 16, !G.canHold);
    G.queue.slice(0, 5).forEach((t, i) => mini(t, BX + COLS * B + 52, 62 + i * 54, i ? 14 : 17));
    if (G.b2b) { ctx.fillStyle = '#fbbf24'; ctx.font = '600 11px DM Sans, sans-serif'; ctx.fillText('B2B ready', BX / 2 - 3, 112); }
    // stack
    G.board.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return;
      const clearing = G.clearing && G.clearing.rows.includes(r);
      block(BX + c * B, BY + r * B, v === 'X' ? '#334155' : clearing ? '#f8fafc' : COLOR[v], B, clearing ? 1 - G.clearing.t / 20 : 1);
    }));
    // ghost + piece
    if (G.piece) {
      let gy = 0; while (!collides(G.piece, 0, gy + 1)) gy++;
      const cs = cells(G.piece.type, G.piece.rot), col = COLOR[G.piece.type];
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.globalAlpha = .45;
      for (const [x, y] of cs) if (G.piece.y + y + gy >= 0) { ctx.beginPath(); ctx.roundRect(BX + (G.piece.x + x) * B + 2, BY + (G.piece.y + y + gy) * B + 2, B - 4, B - 4, 4); ctx.stroke(); }
      ctx.globalAlpha = 1;
      const lockFade = grounded() ? .75 + .25 * Math.cos(G.lock / 3) : 1;
      for (const [x, y] of cs) if (G.piece.y + y >= 0) block(BX + (G.piece.x + x) * B, BY + (G.piece.y + y) * B, col, B, lockFade);
    }
    parts.draw(ctx);
    if (G.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${G.flash * .12})`; ctx.fillRect(BX, BY, COLS * B, ROWS * B); }
    // pop labels
    G.pops.forEach((p, i) => {
      ctx.globalAlpha = Math.min(1, p.life / 20);
      ctx.fillStyle = '#fbbf24'; ctx.font = '26px "Bebas Neue", sans-serif';
      ctx.fillText(p.text, BX + COLS * B / 2, 200 + i * 30 - (90 - p.life) * .4);
      ctx.globalAlpha = 1;
    });
  }
}

Kit.overlay(ov, {
  title: 'Tetris', grad: true, text: 'Clear lines to level up. Four at once is a Tetris. Rotate a T into a tight slot for a T-spin bonus.',
  actions: [{ label: 'Start', primary: true, onClick: start }],
});
Kit.loop(dt => { if (G && G.state === 'play') update(dt); else parts.update(dt); draw(); });
