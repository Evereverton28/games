/* ═══════════════════════════════════════════════════════════
   2048
═══════════════════════════════════════════════════════════ */
const { $, sfx } = Kit;
const N = 4;
const store = Kit.store('2048', { best: 0, saved: null });
const boardEl = $('#board'), tilesEl = $('#tiles'), ov = $('#ov');
Kit.soundToggle($('#sound'));

// Tile palette: cool dark tiles → warm → accent gradient for the big ones
const STYLE = {
  2: ['#1f2233', '#cbd5e1'], 4: ['#252a40', '#e2e8f0'], 8: ['#3b2a22', '#fdba74'], 16: ['#4a2b1a', '#fb923c'],
  32: ['#5a2a14', '#fff7ed'], 64: ['#7c2d12', '#fff7ed'], 128: ['#0c4a6e', '#e0f2fe'], 256: ['#075985', '#f0f9ff'],
  512: ['#0369a1', '#ffffff'], 1024: ['#0284c7', '#ffffff'], 2048: ['linear-gradient(135deg,#f97316,#38bdf8)', '#ffffff'],
};
let grid, score, won, keepGoing, over, history, nextId, tileEls;

for (let i = 0; i < N * N; i++) $('#cells').appendChild(document.createElement('div'));

function empty() { return Array.from({ length: N }, () => Array(N).fill(null)); }
function newGame() {
  grid = empty(); score = 0; won = false; keepGoing = false; over = false; history = []; nextId = 1;
  tilesEl.innerHTML = ''; tileEls = new Map();
  addRandom(); addRandom();
  Kit.overlay(ov, null);
  render(); save();
}
function addRandom() {
  const free = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!grid[r][c]) free.push([r, c]);
  if (!free.length) return;
  const [r, c] = Kit.pick(free);
  grid[r][c] = { id: nextId++, v: Math.random() < .9 ? 2 : 4, isNew: true };
}

function move(dir) {
  if (over || (won && !keepGoing)) return;
  const snap = { grid: grid.map(row => row.map(t => t && { id: t.id, v: t.v })), score };
  const vec = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] }[dir];
  const order = [...Array(N).keys()];
  const rows = vec[0] === 1 ? order.slice().reverse() : order;
  const cols = vec[1] === 1 ? order.slice().reverse() : order;
  let moved = false, gained = 0;
  grid.forEach(row => row.forEach(t => { if (t) { t.isNew = false; t.merged = false; t.gone = null; } }));
  const ghosts = [];
  for (const r of rows) for (const c of cols) {
    const t = grid[r][c];
    if (!t) continue;
    let nr = r, nc = c;
    while (true) {
      const tr = nr + vec[0], tc = nc + vec[1];
      if (tr < 0 || tr >= N || tc < 0 || tc >= N) break;
      const o = grid[tr][tc];
      if (!o) { nr = tr; nc = tc; continue; }
      if (o.v === t.v && !o.merged) {
        // merge: the moving tile slides into o, then disappears; o doubles
        grid[r][c] = null;
        o.v *= 2; o.merged = true; gained += o.v;
        ghosts.push({ id: t.id, r: tr, c: tc });
        moved = true; nr = null;
      }
      break;
    }
    if (nr === null) continue;
    if (nr !== r || nc !== c) { grid[nr][nc] = t; grid[r][c] = null; moved = true; }
  }
  if (!moved) { Kit.pulse(boardEl, 'nudge'); return; }
  history.push(snap); if (history.length > 30) history.shift();
  score += gained;
  addRandom();
  render(ghosts, gained);
  if (gained) { sfx.tone(300 + Math.log2(gained) * 45, { type: 'triangle', dur: .1, vol: .05 }); } else sfx.tone(240, { dur: .04, vol: .025 });
  const top = maxTile();
  if (top >= 2048 && !won) { won = true; setTimeout(winPanel, 350); }
  else if (!canMove()) { over = true; setTimeout(losePanel, 450); }
  save();
}
function canMove() {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const t = grid[r][c];
    if (!t) return true;
    if (c < N - 1 && grid[r][c + 1] && grid[r][c + 1].v === t.v) return true;
    if (r < N - 1 && grid[r + 1][c] && grid[r + 1][c].v === t.v) return true;
  }
  return false;
}
function maxTile() { let m = 0; grid.forEach(row => row.forEach(t => { if (t) m = Math.max(m, t.v); })); return m; }

function pos(r, c) { return `translate(calc(${c} * (100% + var(--gap))), calc(${r} * (100% + var(--gap))))`; }
function paint(el, v) {
  const [bg, fg] = STYLE[v] || ['#0f172a', '#fbbf24'];
  const face = el.firstChild;
  face.style.background = bg; face.style.color = fg;
  face.style.setProperty('--fs', v >= 1024 ? 'clamp(22px,7vw,38px)' : v >= 128 ? 'clamp(26px,8vw,44px)' : '');
  face.style.boxShadow = v >= 128 ? `0 0 ${Math.min(26, Math.log2(v) * 2)}px rgba(56,189,248,.25)` : v >= 8 ? '0 0 12px rgba(249,115,22,.12)' : 'none';
  face.textContent = v;
}
function render(ghosts = [], gained = 0) {
  const seen = new Set();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const t = grid[r][c];
    if (!t) continue;
    seen.add(t.id);
    let el = tileEls.get(t.id);
    if (!el) {
      el = document.createElement('div'); el.className = 'tile';
      el.appendChild(document.createElement('div')).className = 'face';
      tilesEl.appendChild(el); tileEls.set(t.id, el);
    }
    el.style.transform = pos(r, c);
    el.classList.toggle('new', !!t.isNew);
    if (t.merged) { el.classList.remove('merged'); void el.offsetWidth; el.classList.add('merged'); setTimeout(() => paint(el, t.v), 90); }
    else paint(el, t.v);
  }
  // Tiles that merged away slide to their target, then vanish
  for (const g of ghosts) {
    const el = tileEls.get(g.id);
    if (el) { el.style.transform = pos(g.r, g.c); el.style.zIndex = 1; setTimeout(() => el.remove(), 120); tileEls.delete(g.id); seen.add(g.id); }
  }
  for (const [id, el] of tileEls) if (!seen.has(id)) { el.remove(); tileEls.delete(id); }
  $('#score').textContent = score;
  if (score > store.data.best) store.set('best', score);
  $('#best').textContent = store.data.best;
  $('#top').textContent = maxTile();
  if (gained) {
    Kit.pulse($('#score'));
    const g = document.createElement('div'); g.className = 'gain'; g.textContent = '+' + gained;
    $('#score').parentElement.style.position = 'relative'; $('#score').parentElement.appendChild(g);
    setTimeout(() => g.remove(), 800);
  }
  $('#undo').disabled = !history.length;
}

function undo() {
  const s = history.pop();
  if (!s) return;
  over = false; if (!keepGoing) won = maxTileOf(s.grid) >= 2048;
  grid = s.grid.map(row => row.map(t => t && { id: t.id, v: t.v }));
  score = s.score;
  Kit.overlay(ov, null);
  tilesEl.innerHTML = ''; tileEls = new Map();
  render(); save();
  sfx.tone(520, { dur: .1, vol: .04, slide: 320 });
}
function maxTileOf(g) { let m = 0; g.forEach(row => row.forEach(t => { if (t) m = Math.max(m, t.v); })); return m; }

function winPanel() {
  sfx.win(); Kit.confetti(['#f97316', '#38bdf8', '#fbbf24']);
  Kit.overlay(ov, {
    title: 'You made 2048', grad: true, text: 'Keep going for 4096, or start over.',
    stats: [[score, 'Score'], [store.data.best, 'Best']],
    actions: [{ label: 'Keep going', primary: true, onClick: () => { keepGoing = true; Kit.overlay(ov, null); boardEl.focus(); } },
              { label: 'New game', onClick: newGame }],
  });
}
function losePanel() {
  sfx.lose();
  Kit.overlay(ov, {
    title: 'No moves left', text: `Your biggest tile was ${maxTile()}.`,
    stats: [[score, 'Score'], [store.data.best, 'Best']],
    note: score && score >= store.data.best ? 'New best score' : '',
    actions: [{ label: 'Undo', onClick: undo }, { label: 'New game', primary: true, onClick: newGame }],
  });
}
function save() { store.set('saved', over ? null : { grid: grid.map(r => r.map(t => t && t.v)), score, won, keepGoing }); }

addEventListener('keydown', e => {
  const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
  if (map[e.key] && ov.hidden) { e.preventDefault(); move(map[e.key]); }
  if ((e.key === 'z' || e.key === 'u') && !e.metaKey) undo();
});
Kit.swipe(boardEl, dir => { if (ov.hidden) move(dir); });
$('#undo').onclick = undo;
$('#new').onclick = () => { if (score === 0 || confirm('Start a new game? Your current board will be lost.')) newGame(); };

// Restore a game in progress
const saved = store.data.saved;
if (saved && saved.grid) {
  grid = saved.grid.map(row => row.map(v => v ? { id: 0, v } : null));
  nextId = 1; grid.forEach(row => row.forEach(t => { if (t) t.id = nextId++; }));
  score = saved.score; won = saved.won; keepGoing = saved.keepGoing; over = false; history = []; tileEls = new Map();
  render();
} else newGame();
