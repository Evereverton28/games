/* ═══════════════════════════════════════════════════════════
   SUDOKU — unique-solution generator, notes, hints
═══════════════════════════════════════════════════════════ */
const { $, sfx } = Kit;
const store = Kit.store('sudoku', { diff: 'easy', best: {}, saved: null });
const boardEl = $('#board'), ov = $('#ov');
Kit.soundToggle($('#sound'));

const ROW = i => Math.floor(i / 9), COL = i => i % 9, BOX = i => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);
const PEERS = Array.from({ length: 81 }, (_, i) => { const s = new Set(); for (let j = 0; j < 81; j++) if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) s.add(j); return [...s]; });

/* ── Solver (bitmasks, most-constrained cell first) ── */
function countSolutions(grid, limit = 2, fill = null) {
  const g = grid.slice(), rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) if (g[i]) { const b = 1 << g[i]; rows[ROW(i)] |= b; cols[COL(i)] |= b; boxes[BOX(i)] |= b; }
  let count = 0;
  const order = fill ? Kit.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]) : [1, 2, 3, 4, 5, 6, 7, 8, 9];
  (function rec() {
    let best = -1, bestMask = 0, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const used = rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)];
      let n = 0; for (let d = 1; d <= 9; d++) if (!(used & (1 << d))) n++;
      if (n < bestN) { bestN = n; best = i; bestMask = used; if (n <= 1) break; }
    }
    if (best < 0) { count++; if (fill) fill.push(g.slice()); return; }
    for (const d of order) {
      if (bestMask & (1 << d)) continue;
      const b = 1 << d; g[best] = d; rows[ROW(best)] |= b; cols[COL(best)] |= b; boxes[BOX(best)] |= b;
      rec();
      g[best] = 0; rows[ROW(best)] &= ~b; cols[COL(best)] &= ~b; boxes[BOX(best)] &= ~b;
      if (count >= limit) return;
    }
  })();
  return count;
}
function generate(diff) {
  const full = []; countSolutions(new Array(81).fill(0), 1, full);
  const solution = full[0], puzzle = solution.slice();
  const target = { easy: 40, medium: 32, hard: 25 }[diff];
  // remove symmetric pairs while the solution stays unique
  const cells = Kit.shuffle([...Array(41).keys()]);
  let clues = 81;
  for (const i of cells) {
    if (clues <= target) break;
    const j = 80 - i, a = puzzle[i], b = puzzle[j];
    puzzle[i] = 0; puzzle[j] = 0;
    if (countSolutions(puzzle, 2) !== 1) { puzzle[i] = a; puzzle[j] = b; }
    else clues -= i === j ? 1 : 2;
  }
  return { puzzle, solution };
}

/* ── State ── */
let diff, P, sel = -1, noteMode = false, timer;
const cellEls = [];
for (let i = 0; i < 81; i++) {
  const c = document.createElement('div');
  c.className = 'cell'; c.setAttribute('role', 'gridcell'); c.tabIndex = -1;
  c.addEventListener('click', () => select(i));
  boardEl.appendChild(c); cellEls.push(c);
}
for (let d = 1; d <= 9; d++) {
  const b = document.createElement('button');
  b.innerHTML = `${d}<small></small>`; b.dataset.d = d; b.setAttribute('aria-label', `Enter ${d}`);
  b.addEventListener('click', () => input(d));
  $('#pad').appendChild(b);
}
const setDiff = Kit.segmented($('#diff'), v => { if (P && P.filled > 0 && !P.done && !confirm('Start a new puzzle? This one will be lost.')) { setDiff(diff); return; } diff = v; store.set('diff', v); newPuzzle(); });

function newPuzzle() {
  const { puzzle, solution } = generate(diff);
  P = { diff, given: puzzle.map(v => !!v), grid: puzzle.slice(), solution, notes: Array.from({ length: 81 }, () => 0), history: [], hints: 0, elapsed: 0, done: false, filled: 0 };
  sel = P.grid.findIndex(v => !v);
  Kit.overlay(ov, null);
  boardEl.classList.remove('won');
  startTimer(); render(); save();
}
function startTimer() {
  clearInterval(timer);
  let last = performance.now();
  timer = setInterval(() => {
    const now = performance.now();
    if (!P.done && !document.hidden && ov.hidden) P.elapsed += (now - last) / 1000;
    last = now;
    $('#time').textContent = Kit.fmtTime(P.elapsed);
  }, 500);
}
function select(i) { sel = i; cellEls[i].focus({ preventScroll: true }); render(); }

function input(d) {
  if (P.done || sel < 0 || P.given[sel]) return;
  if (noteMode) {
    if (P.grid[sel]) return;
    push(); P.notes[sel] ^= 1 << d;
    sfx.tone(700 + d * 20, { type: 'triangle', dur: .04, vol: .03 });
  } else {
    if (P.grid[sel] === d) return;
    push(); P.grid[sel] = d; P.notes[sel] = 0;
    // clear this digit from notes of peers
    for (const j of PEERS[sel]) P.notes[j] &= ~(1 << d);
    const clash = PEERS[sel].some(j => P.grid[j] === d);
    clash ? sfx.error() : sfx.tone(440 + d * 30, { type: 'triangle', dur: .07, vol: .045 });
    Kit.pulse(cellEls[sel], 'pop');
    celebrateUnits(sel);
  }
  render(); save(); checkWin();
}
function erase() {
  if (P.done || sel < 0 || P.given[sel] || (!P.grid[sel] && !P.notes[sel])) return;
  push(); P.grid[sel] = 0; P.notes[sel] = 0; sfx.tone(300, { dur: .05, vol: .03 });
  render(); save();
}
function push() { P.history.push({ grid: P.grid.slice(), notes: P.notes.slice(), sel }); if (P.history.length > 200) P.history.shift(); }
function undo() {
  const h = P.history.pop(); if (!h || P.done) return;
  P.grid = h.grid; P.notes = h.notes; sel = h.sel;
  sfx.tone(520, { dur: .08, vol: .03, slide: 330 }); render(); save();
}
function hint() {
  if (P.done) return;
  // Prefer the selected cell if it's empty or wrong, otherwise the empty cell with the fewest candidates
  let i = sel >= 0 && !P.given[sel] && P.grid[sel] !== P.solution[sel] ? sel : -1;
  if (i < 0) {
    let bestN = 10;
    for (let k = 0; k < 81; k++) {
      if (P.grid[k] === P.solution[k]) continue;
      const used = new Set(PEERS[k].map(j => P.grid[j]));
      const n = 9 - [...used].filter(Boolean).length;
      if (n < bestN) { bestN = n; i = k; }
    }
  }
  if (i < 0) return;
  push();
  P.grid[i] = P.solution[i]; P.notes[i] = 0; P.given[i] = false; P.hints++;
  for (const j of PEERS[i]) P.notes[j] &= ~(1 << P.solution[i]);
  sel = i; P.hinted = (P.hinted || []).concat(i);
  sfx.tone(990, { type: 'sine', dur: .2, vol: .04 });
  Kit.pulse(cellEls[i], 'pop');
  render(); save(); checkWin();
}
function celebrateUnits(i) {
  const units = [[...Array(81).keys()].filter(j => ROW(j) === ROW(i)), [...Array(81).keys()].filter(j => COL(j) === COL(i)), [...Array(81).keys()].filter(j => BOX(j) === BOX(i))];
  for (const u of units) if (u.every(j => P.grid[j] === P.solution[j])) u.forEach((j, k) => setTimeout(() => Kit.pulse(cellEls[j], 'pop'), k * 25));
}
function checkWin() {
  if (!P.grid.every((v, i) => v === P.solution[i])) return;
  P.done = true;
  const secs = Math.round(P.elapsed);
  const prev = store.data.best[diff];
  const record = P.hints === 0 && (prev == null || secs < prev);
  if (record) { store.data.best[diff] = secs; store.save(); }
  store.set('saved', null);
  sel = -1; render();
  boardEl.classList.add('won');
  [...cellEls].forEach((c, k) => c.style.animationDelay = `${(ROW(k) + COL(k)) * 30}ms`);
  sfx.win(); Kit.confetti();
  setTimeout(() => Kit.overlay(ov, {
    title: 'Solved', grad: true, text: P.hints ? `Solved with ${P.hints} hint${P.hints > 1 ? 's' : ''}. Best times only count hint-free solves.` : `A clean ${diff} solve.`,
    stats: [[Kit.fmtTime(secs), 'Time'], [store.data.best[diff] != null ? Kit.fmtTime(store.data.best[diff]) : '–', 'Best']],
    note: record ? 'New best time' : '',
    actions: [{ label: 'New puzzle', primary: true, onClick: newPuzzle }],
  }), 900);
}

function render() {
  const v = sel >= 0 ? P.grid[sel] : 0;
  const counts = Array(10).fill(0);
  let left = 0;
  for (let i = 0; i < 81; i++) {
    const c = cellEls[i], val = P.grid[i];
    if (val) counts[val]++; else left++;
    const bad = val && PEERS[i].some(j => P.grid[j] === val);
    c.className = 'cell' + (P.given[i] ? ' given' : '') + (i === sel ? ' sel' : '') +
      (sel >= 0 && i !== sel && PEERS[sel].includes(i) ? ' peer' : '') + (v && val === v && i !== sel ? ' same' : '') +
      (bad ? ' bad' : '') + (P.hinted && P.hinted.includes(i) ? ' hinted' : '');
    if (val) c.textContent = val;
    else if (P.notes[i]) c.innerHTML = `<div class="notes">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<span class="${v === d ? 'hl' : ''}">${P.notes[i] & (1 << d) ? d : ''}</span>`).join('')}</div>`;
    else c.textContent = '';
    c.setAttribute('aria-label', `Row ${ROW(i) + 1}, column ${COL(i) + 1}: ${val || 'empty'}${P.given[i] ? ', given' : ''}`);
    c.tabIndex = i === sel ? 0 : -1;
  }
  P.filled = 81 - left - P.given.filter(Boolean).length;
  $$pad().forEach(b => { const d = +b.dataset.d; b.classList.toggle('done', counts[d] >= 9); b.querySelector('small').textContent = Math.max(0, 9 - counts[d]); });
  $('#left').textContent = left;
  $('#hints').textContent = P.hints;
  $('#best').textContent = store.data.best[diff] != null ? Kit.fmtTime(store.data.best[diff]) : '–';
  $('#undo').disabled = !P.history.length || P.done;
}
const $$pad = () => [...$('#pad').children];
function save() { store.set('saved', P.done ? null : { ...P, history: [] }); }

$('#undo').onclick = undo; $('#erase').onclick = erase; $('#hint').onclick = hint;
$('#notes').onclick = () => { noteMode = !noteMode; $('#notes').setAttribute('aria-pressed', noteMode); sfx.click(); };
$('#new').onclick = () => { if (P.filled > 0 && !P.done && !confirm('Start a new puzzle? This one will be lost.')) return; newPuzzle(); };
addEventListener('keydown', e => {
  if (!ov.hidden || e.metaKey || e.ctrlKey) return;
  if (/^[1-9]$/.test(e.key)) { input(+e.key); return; }
  if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { erase(); return; }
  if (e.key === 'n' || e.key === 'N') { $('#notes').click(); return; }
  if (e.key === 'z' || e.key === 'Z') { undo(); return; }
  if (e.key === 'h' || e.key === 'H') { hint(); return; }
  const d = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
  if (d) {
    e.preventDefault();
    if (sel < 0) sel = 0;
    const r = ROW(sel), c = COL(sel);
    const nr = (r + (d === -9 ? -1 : d === 9 ? 1 : 0) + 9) % 9, nc = (c + (d === -1 ? -1 : d === 1 ? 1 : 0) + 9) % 9;
    select(nr * 9 + nc);
  }
});

diff = store.data.diff; setDiff(diff);
const saved = store.data.saved;
if (saved && saved.grid) { P = saved; diff = P.diff; setDiff(diff); sel = P.grid.findIndex(v => !v); startTimer(); render(); }
else newPuzzle();
