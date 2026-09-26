/* ═══════════════════════════════════════════════════════════
   O-LOGIC — game interface (rules engine in engine.js)
═══════════════════════════════════════════════════════════ */
const { $, sfx } = Kit;
const store = Kit.store('ologic', { mode: 'levels', level: 0, solved: {}, best: {}, progress: {}, autoX: true, conflicts: true, xFirst: true, seen: false, randomSize: 7 });
const boardEl = $('#board'), ov = $('#ov');
Kit.soundToggle($('#sound'));

const PALETTE = [
  ['#f97316', 'orange'], ['#3b82f6', 'blue'], ['#a78bfa', 'violet'], ['#22c55e', 'green'], ['#f472b6', 'pink'],
  ['#facc15', 'yellow'], ['#2dd4bf', 'teal'], ['#dc2626', 'red'], ['#94a3b8', 'grey'],
];
// 48 levels: size and the hardest logic technique each level may need
const LEVELS = [];
[[5, 6, [1, 2]], [6, 8, [2, 3]], [7, 10, [2, 3]], [8, 12, [3, 4]], [9, 12, [3, 4]]].forEach(([n, count, lv]) => {
  for (let k = 0; k < count; k++) LEVELS.push({ n, allowed: k < count / 2 ? [lv[0], lv[0] === 1 ? 2 : 3].filter(x => x <= lv[1]) : [lv[1]] });
});

function makePuzzle(n, seed, allowed) {
  for (let k = 0; k < 400; k++) {
    const rnd = Kit.rng(seed + k * 7717);
    const p = OL.generate(n, rnd);
    if (!p) continue;
    const r = OL.rate(p);
    if (r.level && allowed.includes(r.level)) {
      // shuffle which colour each region gets
      p.colors = Kit.shuffle([...Array(PALETTE.length).keys()], rnd).slice(0, n);
      p.rating = r;
      return p;
    }
  }
  return null;
}

/* ── State ── */
let mode, P, key, marks, history, elapsed, started, done, hintsUsed, focus = 0, timer;
const setMode = Kit.segmented($('#mode'), v => { saveProgress(); mode = v; store.set('mode', v); load(); });

function load(opts = {}) {
  if (mode === 'levels') {
    const i = opts.level != null ? opts.level : Math.min(store.data.level, LEVELS.length - 1);
    const L = LEVELS[i];
    P = makePuzzle(L.n, 5000 + i * 131, L.allowed); key = 'L' + i; P.label = String(i + 1); P.index = i;
  } else if (mode === 'daily') {
    const d = Kit.today();
    P = makePuzzle(8, Kit.hash('daily-' + d), [3, 4]); key = 'D' + d; P.label = d.slice(5).replace('-', '/');
  } else {
    const n = opts.size || store.data.randomSize;
    store.set('randomSize', n);
    const saved = !opts.fresh && store.data.progress.R;
    const seed = saved && saved.n === n ? saved.seed : Math.floor(Math.random() * 1e9);
    P = makePuzzle(n, seed, n <= 5 ? [1, 2, 3] : [2, 3, 4]); P.seed = seed; key = 'R'; P.label = `${n}×${n}`;
  }
  const prog = store.data.progress[key];
  const fresh = !prog || (key === 'R' && prog.seed !== P.seed) || prog.done;
  marks = fresh ? new Array(P.n * P.n).fill(0) : prog.marks.slice();
  elapsed = fresh ? 0 : prog.elapsed; hintsUsed = fresh ? 0 : prog.hints || 0;
  started = elapsed > 0; done = false; history = [];
  focus = 0;
  buildBoard(); render(); msg('');
  Kit.overlay(ov, null);
  $('#lvlLabel').textContent = mode === 'levels' ? 'Level' : mode === 'daily' ? 'Daily' : 'Random';
  $('#lvl').textContent = P.label;
  $('#moreLabel').textContent = mode === 'levels' ? 'Levels' : mode === 'daily' ? 'Levels' : 'New';
  const b = store.data.best[key === 'R' ? 'R' + P.n : key];
  $('#best').textContent = b ? Kit.fmtTime(b) : '–';
  startTimer();
}
function startTimer() {
  clearInterval(timer);
  let last = performance.now();
  timer = setInterval(() => {
    const now = performance.now();
    if (started && !done && !document.hidden && ov.hidden) elapsed += (now - last) / 1000;
    last = now;
    $('#time').textContent = Kit.fmtTime(elapsed);
  }, 500);
}
function saveProgress() {
  if (!P || !key) return;
  store.data.progress[key] = { marks, elapsed, hints: hintsUsed, done, seed: P.seed, n: P.n };
  // keep only recent daily progress
  const dailies = Object.keys(store.data.progress).filter(k => k[0] === 'D').sort();
  dailies.slice(0, -7).forEach(k => delete store.data.progress[k]);
  store.save();
}

/* ── Board ── */
const cellEls = [];
function buildBoard() {
  const n = P.n;
  boardEl.style.setProperty('--n', n);
  boardEl.classList.remove('won');
  boardEl.innerHTML = ''; cellEls.length = 0;
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n), c = i % n, g = P.regions[i];
    const el = document.createElement('div');
    el.className = 'cell';
    if (r > 0 && P.regions[i - n] !== g) el.classList.add('bt');
    if (r < n - 1 && P.regions[i + n] !== g) el.classList.add('bb');
    if (c > 0 && P.regions[i - 1] !== g) el.classList.add('bl');
    if (c < n - 1 && P.regions[i + 1] !== g) el.classList.add('br');
    el.style.setProperty('--rc', Kit.rgba(PALETTE[P.colors[g]][0], .62));
    el.setAttribute('role', 'gridcell'); el.tabIndex = i === 0 ? 0 : -1; el.dataset.i = i;
    el.style.setProperty('--d', `${(r + c) * 35}ms`);
    boardEl.appendChild(el); cellEls.push(el);
  }
}
function killedByO() {
  const k = new Set();
  marks.forEach((m, i) => { if (m === 2) OL.killsOf(P.n, P.regions, i).forEach(j => k.add(j)); });
  return k;
}
function conflicts() {
  const n = P.n, os = marks.map((m, i) => m === 2 ? i : -1).filter(i => i >= 0), bad = new Set();
  for (let a = 0; a < os.length; a++) for (let b = a + 1; b < os.length; b++) {
    const i = os[a], j = os[b], ri = Math.floor(i / n), ci = i % n, rj = Math.floor(j / n), cj = j % n;
    if (ri === rj || ci === cj || P.regions[i] === P.regions[j] || (Math.abs(ri - rj) <= 1 && Math.abs(ci - cj) <= 1)) { bad.add(i); bad.add(j); }
  }
  return bad;
}
const XSVG = '<svg class="x" viewBox="0 0 20 20"><path d="M4 4l12 12M16 4L4 16"/></svg>';
function render() {
  const auto = store.data.autoX ? killedByO() : new Set();
  const bad = store.data.conflicts ? conflicts() : new Set();
  const n = P.n;
  cellEls.forEach((el, i) => {
    const m = marks[i], isAuto = m === 0 && auto.has(i);
    el.classList.toggle('auto', isAuto);
    el.classList.toggle('bad', bad.has(i));
    const want = m === 2 ? 'o' : (m === 1 || isAuto) ? 'x' : '';
    if (el.dataset.show !== want) { el.dataset.show = want; el.innerHTML = want === 'o' ? '<div class="o"></div>' : want === 'x' ? XSVG : ''; }
    el.setAttribute('aria-label', `Row ${Math.floor(i / n) + 1}, column ${i % n + 1}, ${PALETTE[P.colors[P.regions[i]]][1]} region, ${m === 2 ? 'O' : m === 1 ? 'crossed out' : isAuto ? 'ruled out' : 'empty'}`);
  });
  $('#placed').textContent = `${marks.filter(m => m === 2).length}/${n}`;
  $('#undo').disabled = !history.length || done;
}
function setMark(i, v, record = true) {
  if (done || marks[i] === v) return false;
  if (record) history.push(marks.slice());
  if (history.length > 300) history.shift();
  marks[i] = v;
  if (!started) started = true;
  return true;
}
function cycle(i) {
  const order = store.data.xFirst ? [0, 1, 2] : [0, 2, 1];
  const next = order[(order.indexOf(marks[i]) + 1) % 3];
  if (!setMark(i, next)) return;
  if (next === 2) sfx.tone(560, { type: 'triangle', dur: .08, vol: .05, slide: 700 });
  else if (next === 1) sfx.tone(330, { type: 'triangle', dur: .04, vol: .03 });
  else sfx.tone(260, { dur: .04, vol: .025 });
  after();
}
function after() {
  msg('');
  render(); saveProgress();
  checkWin();
}
function checkWin() {
  const n = P.n, os = marks.map((m, i) => m === 2 ? i : -1).filter(i => i >= 0);
  if (os.length !== n || conflicts().size) {
    if (os.length === n) msg('<b>Not quite.</b> Some O\'s break a rule; they are striped red.');
    return;
  }
  done = true; saveProgress();
  const secs = Math.max(1, Math.round(elapsed));
  const bestKey = key === 'R' ? 'R' + n : key;
  const prev = store.data.best[bestKey];
  const record = !hintsUsed && (prev == null || secs < prev);
  if (record) store.data.best[bestKey] = secs;
  if (mode === 'levels') { store.data.solved[P.index] = true; store.data.level = Math.max(store.data.level, Math.min(LEVELS.length - 1, P.index + 1)); }
  if (mode === 'daily') store.data.solved[key] = true;
  store.save();
  // clear the X's for a clean finished picture
  marks = marks.map(m => m === 2 ? 2 : 0);
  render();
  boardEl.classList.add('won');
  sfx.win(); setTimeout(() => Kit.confetti(P.colors.map(c => PALETTE[c][0])), 300);
  const last = mode === 'levels' && P.index === LEVELS.length - 1;
  setTimeout(() => Kit.overlay(ov, {
    title: 'Solved', grad: true,
    text: hintsUsed ? `Finished with ${hintsUsed} hint${hintsUsed > 1 ? 's' : ''}. Best times only count hint-free solves.` : mode === 'daily' ? 'Daily puzzle complete. A new one arrives tomorrow.' : 'Pure deduction. Nicely done.',
    stats: [[Kit.fmtTime(secs), 'Time'], [store.data.best[bestKey] ? Kit.fmtTime(store.data.best[bestKey]) : '–', 'Best']],
    note: record ? 'New best time' : '',
    actions: mode === 'levels' ? [{ label: 'Levels', onClick: picker }, { label: last ? 'Random puzzle' : 'Next level', primary: true, onClick: () => last ? (setMode('random'), mode = 'random', store.set('mode', 'random'), load({ fresh: true })) : load({ level: P.index + 1 }) }]
      : mode === 'daily' ? [{ label: 'Levels', onClick: () => { mode = 'levels'; setMode('levels'); store.set('mode', 'levels'); load(); } }, { label: 'Random puzzle', primary: true, onClick: () => { mode = 'random'; setMode('random'); store.set('mode', 'random'); load({ fresh: true }); } }]
      : [{ label: 'Change size', onClick: picker }, { label: 'New puzzle', primary: true, onClick: () => load({ fresh: true }) }],
  }), 900);
}
function msg(html) { $('#msg').innerHTML = html; }

/* ── Pointer input: tap cycles, drag paints ✕ (or erases ✕) ── */
let drag = null;
boardEl.addEventListener('pointerdown', e => {
  const el = e.target.closest('.cell'); if (!el || done) return;
  e.preventDefault();
  boardEl.setPointerCapture(e.pointerId);
  const i = +el.dataset.i;
  setFocus(i, false);
  drag = { start: i, last: i, moved: false, paint: marks[i] === 1 ? 0 : 1, snap: marks.slice() };
});
boardEl.addEventListener('pointermove', e => {
  if (!drag) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const cell = el && el.closest && el.closest('.cell');
  if (!cell) return;
  const i = +cell.dataset.i;
  if (i === drag.last) return;
  if (!drag.moved) { drag.moved = true; history.push(drag.snap); paintCell(drag.start); }
  drag.last = i; paintCell(i);
});
function paintCell(i) {
  // painting never overwrites an O
  if (marks[i] === 2) return;
  if (drag.paint === 1 && marks[i] === 0) { marks[i] = 1; started = true; sfx.tone(330 + Math.random() * 40, { type: 'triangle', dur: .03, vol: .02 }); }
  if (drag.paint === 0 && marks[i] === 1) marks[i] = 0;
  render();
}
boardEl.addEventListener('pointerup', () => {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.moved) { saveProgress(); msg(''); return; }
  cycle(d.start);
});
boardEl.addEventListener('pointercancel', () => { drag = null; });
boardEl.addEventListener('contextmenu', e => e.preventDefault());

/* ── Keyboard ── */
function setFocus(i, move = true) {
  cellEls[focus] && (cellEls[focus].tabIndex = -1);
  focus = i; cellEls[i].tabIndex = 0;
  if (move) cellEls[i].focus();
}
boardEl.addEventListener('keydown', e => {
  const n = P.n, r = Math.floor(focus / n), c = focus % n;
  const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
  if (d) { e.preventDefault(); setFocus(Math.max(0, Math.min(n - 1, r + d[0])) * n + Math.max(0, Math.min(n - 1, c + d[1]))); return; }
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cycle(focus); }
  if (e.key === 'x' || e.key === 'X') { if (setMark(focus, marks[focus] === 1 ? 0 : 1)) after(); }
  if (e.key === 'o' || e.key === 'O' || e.key === '0') { if (setMark(focus, marks[focus] === 2 ? 0 : 2)) { sfx.tone(560, { type: 'triangle', dur: .08, vol: .05, slide: 700 }); after(); } }
  if (e.key === 'Backspace' || e.key === 'Delete') { if (setMark(focus, 0)) after(); }
});
addEventListener('keydown', e => {
  if (!ov.hidden || e.metaKey || e.ctrlKey) return;
  if (e.key === 'z' || e.key === 'Z') undo();
  if (e.key === 'h' || e.key === 'H') hint();
});

/* ── Tools ── */
function undo() {
  if (done || !history.length) return;
  marks = history.pop(); sfx.tone(500, { dur: .08, vol: .03, slide: 330 }); after();
}
$('#undo').onclick = undo;
$('#clear').onclick = () => { if (done || !marks.some(Boolean)) return; history.push(marks.slice()); marks.fill(0); sfx.tone(300, { dur: .12, vol: .03, slide: 150 }); after(); };
$('#more').onclick = () => mode === 'random' ? picker() : picker();

const NAME = {
  row: u => `row ${u.id + 1}`, col: u => `column ${u.id + 1}`,
  region: u => `the ${PALETTE[P.colors[u.id]][1]} region`,
};
const unitName = u => NAME[u.kind](u);
function flag(cells) {
  cellEls.forEach(el => el.classList.remove('flag'));
  cells.forEach(i => { const el = cellEls[i]; void el.offsetWidth; el.classList.add('flag'); el.addEventListener('animationend', e => { if (e.animationName === 'flag') el.classList.remove('flag'); }, { once: true }); });
}
function hint() {
  if (done) return;
  const n = P.n, sol = new Set(P.solution.map((c, r) => r * n + c));
  // 1. mistakes first
  const wrongO = marks.map((m, i) => m === 2 && !sol.has(i) ? i : -1).filter(i => i >= 0);
  if (wrongO.length) { flag(wrongO); msg(`<b>Check ${wrongO.length > 1 ? 'these O\'s' : 'this O'}.</b> ${wrongO.length > 1 ? 'They are' : 'It is'} not part of the solution.`); hintsUsed++; saveProgress(); sfx.error(); return; }
  const wrongX = marks.map((m, i) => m === 1 && sol.has(i) ? i : -1).filter(i => i >= 0);
  if (wrongX.length) { flag(wrongX); msg(`<b>Check ${wrongX.length > 1 ? 'these ✕ marks' : 'this ✕'}.</b> ${wrongX.length > 1 ? 'Those cells' : 'That cell'} can still hold an O.`); hintsUsed++; saveProgress(); sfx.error(); return; }
  // 2. next logical step from what is already known
  const s = OL.makeState(P);
  marks.forEach((m, i) => { if (m === 2) OL.place(s, i); });
  marks.forEach((m, i) => { if (m === 1) s.cand[i] = 0; });
  let st = OL.step(s);
  // skip steps that only remove cells the player already sees as ruled out
  const shown = store.data.autoX ? killedByO() : new Set();
  while (st && st.eliminate && st.eliminate.every(i => marks[i] === 1 || shown.has(i))) { OL.apply(s, st); st = OL.step(s); }
  if (!st) return;
  hintsUsed++;
  sfx.tone(990, { type: 'sine', dur: .18, vol: .04 });
  if (st.place != null) {
    flag([st.place]);
    msg(`<b>${cap(unitName(st.unit))}</b> has only one cell left that can hold an O. Place it there.`);
  } else {
    history.push(marks.slice());
    st.eliminate.forEach(i => { if (marks[i] === 0) marks[i] = 1; });
    render(); flag(st.eliminate); saveProgress();
    if (st.level === 2) msg(`Every open cell of <b>${unitName(st.unit)}</b> lies in <b>${unitName(st.into)}</b>, so the rest of ${unitName(st.into)} can't hold an O. Crossed out.`);
    else if (st.level === 3) msg(`An O here would leave <b>${unitName(st.unit)}</b> with no room at all, so it's crossed out.`);
    else msg(`<b>${st.group.map(unitName).join(' and ')}</b> only fit inside <b>${st.lines.map(unitName).join(' and ')}</b>, so every other cell there is crossed out.`);
  }
  saveProgress();
}
const cap = s => s[0].toUpperCase() + s.slice(1);
$('#hint').onclick = hint;

function picker() {
  if (mode === 'random') {
    return Kit.overlay(ov, {
      title: 'Random puzzle', text: 'A fresh puzzle with a single solution, reachable by logic alone.',
      html: `<div class="seg" id="sz">${[5, 6, 7, 8, 9].map(s => `<button data-v="${s}" aria-pressed="${s === P.n}">${s}×${s}</button>`).join('')}</div>`,
      actions: [{ label: 'Cancel', onClick: () => Kit.overlay(ov, null) }, { label: 'Generate', primary: true, onClick: () => { const b = ov.querySelector('#sz [aria-pressed="true"]'); load({ fresh: true, size: +b.dataset.v }); } }],
      bind: el => Kit.segmented(el.querySelector('#sz'), () => {}),
    });
  }
  const unlocked = store.data.level;
  let html = '<div class="levels">', lastN = 0;
  LEVELS.forEach((L, i) => {
    if (L.n !== lastN) { html += `<div class="chapter">${L.n}×${L.n}</div>`; lastN = L.n; }
    html += `<button data-l="${i}" ${i > unlocked ? 'disabled' : ''} class="${mode === 'levels' && P.index === i ? 'cur' : ''}">${i + 1}<small>${store.data.solved[i] ? '✓' : ''}</small></button>`;
  });
  html += '</div>';
  Kit.overlay(ov, {
    title: 'Levels', text: 'Grids grow from 5×5 to 9×9. Later levels need deeper deductions.', html,
    actions: [{ label: 'Close', onClick: () => done ? picker() : Kit.overlay(ov, null) }],
    bind: el => {
      el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { saveProgress(); if (mode !== 'levels') { mode = 'levels'; setMode('levels'); store.set('mode', 'levels'); } load({ level: +b.dataset.l }); });
      const cur = el.querySelector('.cur'); if (cur) cur.scrollIntoView({ block: 'center' });
    },
  });
}
function rules(first) {
  const c = PALETTE.map(p => Kit.rgba(p[0], .62));
  const demo = [0, 0, 1, 1, 0, 2, 2, 1, 3, 2, 2, 1, 3, 3, 2, 2];
  const os = new Set([1, 7, 8, 14]);
  Kit.overlay(ov, {
    title: 'How to play', grad: first,
    html: `<div class="demo">${demo.map((g, i) => `<span style="background:${c[[0, 1, 3, 4][g]]}">${os.has(i) ? '<i></i>' : ''}</span>`).join('')}</div>
      <ol class="rules"><li>Place exactly one <b>O</b> in every row and every column.</li><li>Each coloured region gets exactly one <b>O</b>.</li><li>No two O's may touch, not even diagonally.</li><li>Tap once for ✕ (a cell that can't be an O), again for O. Drag to cross out many cells.</li></ol>`,
    actions: [{ label: first ? 'Start' : 'Got it', primary: true, onClick: () => { store.set('seen', true); Kit.overlay(ov, null); } }],
  });
}
$('#rulesBtn').onclick = () => rules(false);
$('#setBtn').onclick = () => {
  const sw = (id, on) => `<button class="switch" role="switch" id="${id}" aria-checked="${on}"></button>`;
  Kit.overlay(ov, {
    title: 'Settings',
    html: `<div class="opt"><div>Auto-cross<small>Faintly cross out cells an O rules out.</small></div>${sw('autoX', store.data.autoX)}</div>
      <div class="opt"><div>Show rule breaks<small>Stripe O's that share a line or region, or touch.</small></div>${sw('conflicts', store.data.conflicts)}</div>
      <div class="opt" style="margin-bottom:16px"><div>First tap places ✕<small>Turn off to place an O on the first tap.</small></div>${sw('xFirst', store.data.xFirst)}</div>`,
    actions: [{ label: 'Done', primary: true, onClick: () => Kit.overlay(ov, null) }],
    bind: el => el.querySelectorAll('.switch').forEach(b => b.onclick = () => { store.set(b.id, !store.data[b.id]); b.setAttribute('aria-checked', store.data[b.id]); render(); }),
  });
};
Kit.onHide(saveProgress);

mode = store.data.mode; setMode(mode);
load();
if (!store.data.seen) rules(true);
