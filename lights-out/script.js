/* ═══════════════════════════════════════════════════════════
   LIGHTS OUT — GF(2) solver for hints and optimal move counts
═══════════════════════════════════════════════════════════ */
const { $, sfx } = Kit;
const store = Kit.store('lightsout', { level: 0, stars: {} });
const gridEl = $('#grid'), ov = $('#ov');
Kit.soundToggle($('#sound'));

// 25 levels: size grows, more presses in the scramble
const LEVELS = Array.from({ length: 25 }, (_, i) => ({
  n: i < 4 ? 3 : i < 9 ? 4 : i < 16 ? 5 : i < 21 ? 6 : 7,
  presses: [2, 3, 3, 4, 3, 4, 5, 5, 6, 4, 5, 6, 7, 8, 9, 10, 7, 9, 10, 11, 12, 10, 12, 13, 15][i],
}));

/* ── Solver: Gaussian elimination over GF(2), then minimise over the null space ── */
function solve(board, n) {
  const N = n * n;
  const rows = [];
  for (let i = 0; i < N; i++) {
    const r = new Uint8Array(N + 1);
    const y = Math.floor(i / n), x = i % n;
    for (const [dy, dx] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && yy < n && xx >= 0 && xx < n) r[yy * n + xx] = 1;
    }
    r[N] = board[i];
    rows.push(r);
  }
  const pivotCol = [];
  let row = 0;
  for (let col = 0; col < N && row < N; col++) {
    let p = row; while (p < N && !rows[p][col]) p++;
    if (p === N) continue;
    [rows[row], rows[p]] = [rows[p], rows[row]];
    for (let r = 0; r < N; r++) if (r !== row && rows[r][col]) for (let c = col; c <= N; c++) rows[r][c] ^= rows[row][c];
    pivotCol.push(col); row++;
  }
  for (let r = row; r < N; r++) if (rows[r][N]) return null; // unsolvable
  const free = [];
  for (let c = 0; c < N; c++) if (!pivotCol.includes(c)) free.push(c);
  let best = null;
  for (let mask = 0; mask < (1 << free.length); mask++) {
    const x = new Uint8Array(N);
    free.forEach((c, k) => { x[c] = (mask >> k) & 1; });
    for (let r = row - 1; r >= 0; r--) {
      const pc = pivotCol[r];
      let v = rows[r][N];
      for (let c = pc + 1; c < N; c++) if (rows[r][c]) v ^= x[c];
      x[pc] = v;
    }
    const cnt = x.reduce((a, b) => a + b, 0);
    if (!best || cnt < best.cnt) best = { x, cnt };
  }
  return best;
}

/* ── State ── */
let n, board, moves, history, level, free, par, hintIdx, done;
function toggle(b, i, size) {
  const y = Math.floor(i / size), x = i % size;
  for (const [dy, dx] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const yy = y + dy, xx = x + dx;
    if (yy >= 0 && yy < size && xx >= 0 && xx < size) b[yy * size + xx] ^= 1;
  }
}
function scramble(size, presses, seed) {
  const rnd = Kit.rng(seed);
  let b;
  do {
    b = new Uint8Array(size * size);
    const picks = new Set();
    while (picks.size < presses) picks.add(Math.floor(rnd() * size * size));
    picks.forEach(i => toggle(b, i, size));
  } while (!b.some(v => v) || solve(b, size).cnt < Math.min(presses, 2));
  return b;
}
function startLevel(i) {
  level = i; free = false;
  const L = LEVELS[i];
  setup(L.n, scramble(L.n, L.presses, 7331 + i * 101));
}
function startFree(size) {
  free = true; level = -1;
  // any random board may be unsolvable on some sizes; build it from presses instead
  const presses = Kit.randInt(Math.ceil(size * size * .3), Math.ceil(size * size * .55));
  setup(size, scramble(size, presses, Math.floor(Math.random() * 1e9)));
}
function setup(size, b) {
  n = size; board = b; moves = 0; history = []; hintIdx = -1; done = false;
  par = solve(board, n).cnt;
  gridEl.style.setProperty('--n', n);
  gridEl.classList.remove('solved');
  gridEl.innerHTML = '';
  for (let i = 0; i < n * n; i++) {
    const c = document.createElement('button');
    c.className = 'cell'; c.setAttribute('role', 'gridcell');
    c.addEventListener('click', () => press(i));
    c.addEventListener('keydown', e => arrow(e, i));
    gridEl.appendChild(c);
  }
  Kit.overlay(ov, null);
  render(-1);
}
function arrow(e, i) {
  const y = Math.floor(i / n), x = i % n;
  const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
  if (!d) return;
  e.preventDefault();
  const yy = Math.max(0, Math.min(n - 1, y + d[0])), xx = Math.max(0, Math.min(n - 1, x + d[1]));
  gridEl.children[yy * n + xx].focus();
}
function press(i) {
  if (done) return;
  history.push(board.slice());
  toggle(board, i, n);
  moves++;
  hintIdx = -1;
  const on = board[i];
  sfx.tone(on ? 660 : 440, { type: 'triangle', dur: .07, vol: .045, slide: on ? 760 : 380 });
  render(i);
  if (!board.some(v => v)) win();
}
function render(pressed) {
  const cells = gridEl.children;
  const y0 = Math.floor(pressed / n), x0 = pressed % n;
  for (let i = 0; i < n * n; i++) {
    const c = cells[i];
    c.classList.toggle('on', !!board[i]);
    c.classList.toggle('hint', i === hintIdx);
    c.setAttribute('aria-label', `Row ${Math.floor(i / n) + 1}, column ${i % n + 1}, ${board[i] ? 'on' : 'off'}`);
    const y = Math.floor(i / n), x = i % n;
    if (pressed >= 0 && Math.abs(y - y0) + Math.abs(x - x0) <= 1) { c.classList.remove('flip'); void c.offsetWidth; c.classList.add('flip'); }
  }
  $('#lvl').textContent = free ? `${n}×${n}` : level + 1;
  $('#lvlLabel').textContent = free ? 'Free play' : 'Level';
  $('#moves').textContent = moves;
  $('#par').textContent = par;
  $('#lit').textContent = board.reduce((a, b) => a + b, 0);
  $('#undo').disabled = !history.length || done;
}
function starsFor(m) { return m <= par ? 3 : m <= par + Math.ceil(par * .5) + 1 ? 2 : 1; }
function win() {
  done = true;
  gridEl.classList.add('solved');
  sfx.win(); Kit.confetti(['#fbbf24', '#f97316', '#fde68a']);
  const stars = starsFor(moves);
  if (!free) {
    const prev = store.data.stars[level] || 0;
    store.data.stars[level] = Math.max(prev, stars);
    store.set('level', Math.min(LEVELS.length - 1, Math.max(store.data.level, level + 1)));
  }
  const last = !free && level === LEVELS.length - 1;
  setTimeout(() => Kit.overlay(ov, {
    title: free ? 'All dark' : last ? 'Every level solved' : `Level ${level + 1} solved`, grad: true,
    html: `<div class="stars" aria-label="${stars} of 3 stars">${'★'.repeat(stars)}<span class="off">${'★'.repeat(3 - stars)}</span></div>`,
    text: moves <= par ? 'Solved in the fewest possible presses.' : `Possible in ${par}. You used ${moves}.`,
    actions: free ? [{ label: 'Replay', onClick: () => setup(n, history[0] ? xorFirst() : board) }, { label: 'New board', primary: true, onClick: () => startFree(n) }]
      : [{ label: 'Retry', onClick: () => startLevel(level) }, { label: last ? 'Levels' : 'Next level', primary: true, onClick: () => last ? levelPicker() : startLevel(level + 1) }],
  }), 650);
}
function xorFirst() { return history[0]; }

$('#undo').onclick = () => { if (!history.length || done) return; board = history.pop(); moves--; hintIdx = -1; render(-1); sfx.tone(500, { dur: .08, vol: .03, slide: 330 }); };
$('#reset').onclick = () => { if (!history.length) return; board = history[0]; history = []; moves = 0; hintIdx = -1; done = false; gridEl.classList.remove('solved'); Kit.overlay(ov, null); render(-1); };
$('#hint').onclick = () => {
  if (done) return;
  const s = solve(board, n);
  const i = s.x.findIndex(v => v);
  hintIdx = i;
  render(-1);
  gridEl.children[i].focus();
  Kit.say(`Press row ${Math.floor(i / n) + 1}, column ${i % n + 1}.`);
  sfx.tone(990, { type: 'sine', dur: .15, vol: .03 });
};
$('#levels').onclick = levelPicker;
function levelPicker() {
  const unlocked = store.data.level;
  Kit.overlay(ov, {
    title: 'Levels', text: 'Grids grow from 3×3 to 7×7.',
    html: `<div class="levels">${LEVELS.map((L, i) => `<button data-l="${i}" ${i > unlocked ? 'disabled' : ''} class="${i === level ? 'cur' : ''}">${i + 1}<small>${'★'.repeat(store.data.stars[i] || 0)}</small></button>`).join('')}</div>
      <p style="margin-bottom:6px">Free play: a random board</p>
      <div class="seg" id="freeSeg">${[3, 4, 5, 6, 7].map(s => `<button data-v="${s}">${s}×${s}</button>`).join('')}</div>`,
    actions: [{ label: 'Close', onClick: () => Kit.overlay(ov, null) }],
    bind: el => {
      el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => startLevel(+b.dataset.l));
      el.querySelectorAll('#freeSeg button').forEach(b => b.onclick = () => startFree(+b.dataset.v));
    },
  });
}

startLevel(Math.min(store.data.level, LEVELS.length - 1));
