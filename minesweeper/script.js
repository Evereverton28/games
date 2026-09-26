/* ═══════════════════════════════════════════════════════════
   MINESWEEPER
═══════════════════════════════════════════════════════════ */
const { $, sfx } = Kit;
const store = Kit.store('minesweeper', { diff: 'beginner', best: {} });
const fieldEl = $('#field'), ov = $('#ov');
Kit.soundToggle($('#sound'));

const DIFFS = { beginner: { r: 9, c: 9, m: 10 }, intermediate: { r: 16, c: 16, m: 40 }, expert: { r: 16, c: 30, m: 99 } };
let diff, R, Cc, M, mine, adj, state, started, over, flags, openCount, t0, timer, flagMode = false, focusIdx = 0;
const setDiff = Kit.segmented($('#diff'), v => { diff = v; store.set('diff', v); newGame(); });

function newGame() {
  const D = DIFFS[diff];
  // Expert rotates to a tall board on narrow screens
  const tall = D.c > D.r && innerWidth < 700;
  R = tall ? D.c : D.r; Cc = tall ? D.r : D.c; M = D.m;
  mine = new Uint8Array(R * Cc); adj = new Uint8Array(R * Cc); state = new Uint8Array(R * Cc); // 0 hidden, 1 open, 2 flag
  started = false; over = false; flags = 0; openCount = 0;
  clearInterval(timer); $('#time').textContent = 0;
  fieldEl.style.setProperty('--cols', Cc);
  fieldEl.style.setProperty('--fs', Cc > 20 ? '15px' : Cc > 12 ? '17px' : '24px');
  fieldEl.classList.remove('lost');
  fieldEl.innerHTML = '';
  for (let i = 0; i < R * Cc; i++) {
    const b = document.createElement('button');
    b.className = 'c'; b.tabIndex = i === 0 ? 0 : -1; b.dataset.i = i;
    fieldEl.appendChild(b);
  }
  Kit.overlay(ov, null);
  hud(); paintAll();
}
const nb = i => { const r = Math.floor(i / Cc), c = i % Cc, out = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < R && cc >= 0 && cc < Cc) out.push(rr * Cc + cc); } return out; };

function plant(safe) {
  // first click and its neighbours are always clear, so the first click opens an area
  const banned = new Set([safe, ...nb(safe)]);
  const pool = []; for (let i = 0; i < R * Cc; i++) if (!banned.has(i)) pool.push(i);
  Kit.shuffle(pool).slice(0, M).forEach(i => { mine[i] = 1; });
  for (let i = 0; i < R * Cc; i++) adj[i] = nb(i).reduce((a, j) => a + mine[j], 0);
  started = true; t0 = performance.now();
  timer = setInterval(() => { $('#time').textContent = Math.min(999, Math.floor((performance.now() - t0) / 1000)); }, 250);
}

function reveal(i) {
  if (over || state[i] === 2) return;
  if (!started) plant(i);
  if (state[i] === 1) return chord(i);
  if (mine[i]) return lose(i);
  // flood fill with a delay by distance for a ripple effect
  const queue = [[i, 0]], seen = new Set([i]);
  let opened = 0;
  while (queue.length) {
    const [j, d] = queue.shift();
    if (state[j] !== 0) continue;
    state[j] = 1; openCount++; opened++;
    paint(j, Math.min(d * 28, 500));
    if (adj[j] === 0) for (const k of nb(j)) if (!seen.has(k) && !mine[k]) { seen.add(k); queue.push([k, d + 1]); }
  }
  if (opened > 1) sfx.noise({ dur: .18, vol: .05, filter: 3000, type: 'highpass' });
  sfx.tone(opened > 1 ? 660 : 520, { type: 'triangle', dur: .05, vol: .04 });
  if (openCount === R * Cc - M) win();
}
function chord(i) {
  if (!adj[i]) return;
  const around = nb(i);
  const f = around.filter(j => state[j] === 2).length;
  if (f !== adj[i]) { around.filter(j => state[j] === 0).forEach(j => { const el = fieldEl.children[j]; el.style.background = '#2d2d48'; setTimeout(() => el.style.background = '', 150); }); return; }
  for (const j of around) if (state[j] === 0) { reveal(j); if (over) return; }
}
function toggleFlag(i) {
  if (over || state[i] === 1) return;
  if (!started && state[i] === 0 && flags === 0) { /* allow pre-flagging */ }
  state[i] = state[i] === 2 ? 0 : 2;
  flags += state[i] === 2 ? 1 : -1;
  sfx.tone(state[i] === 2 ? 880 : 440, { type: 'square', dur: .04, vol: .025 });
  if (navigator.vibrate) navigator.vibrate(12);
  paint(i); hud();
}
function paint(i, delay = 0) {
  const el = fieldEl.children[i];
  el.className = 'c';
  el.style.removeProperty('--d');
  el.textContent = '';
  const r = Math.floor(i / Cc) + 1, c = i % Cc + 1;
  if (state[i] === 1) {
    el.classList.add('open');
    if (delay) el.style.setProperty('--d', delay + 'ms');
    if (adj[i]) { el.classList.add('num', 'n' + adj[i]); el.textContent = adj[i]; }
    el.setAttribute('aria-label', `Row ${r}, column ${c}: ${adj[i] || 'empty'}`);
  } else if (state[i] === 2) { el.classList.add('flag'); el.setAttribute('aria-label', `Row ${r}, column ${c}: flagged`); }
  else el.setAttribute('aria-label', `Row ${r}, column ${c}: hidden`);
}
function paintAll() { for (let i = 0; i < R * Cc; i++) paint(i); }
function hud() {
  $('#mines').textContent = M - flags;
  const b = store.data.best[diff];
  $('#best').textContent = b != null ? b + 's' : '–';
}
function lose(i) {
  over = true; clearInterval(timer);
  fieldEl.classList.add('lost');
  sfx.boom();
  const hit = fieldEl.children[i];
  hit.className = 'c mine boom';
  // reveal other mines outward from the one that went off
  const r0 = Math.floor(i / Cc), c0 = i % Cc;
  for (let j = 0; j < R * Cc; j++) {
    if (j === i) continue;
    const el = fieldEl.children[j];
    if (mine[j] && state[j] !== 2) { el.className = 'c mine'; el.style.setProperty('--d', (Math.hypot(Math.floor(j / Cc) - r0, j % Cc - c0) * 45) + 'ms'); }
    if (!mine[j] && state[j] === 2) el.className = 'c wrong';
  }
  const pct = Math.round(openCount / (R * Cc - M) * 100);
  setTimeout(() => Kit.overlay(ov, {
    title: 'Boom', text: `You cleared ${pct}% of the safe squares.`,
    actions: [{ label: 'See board', onClick: () => Kit.overlay(ov, null) }, { label: 'Try again', primary: true, onClick: newGame }],
  }), 1100);
}
function win() {
  over = true; clearInterval(timer);
  const secs = Math.max(1, Math.round((performance.now() - t0) / 1000));
  for (let j = 0; j < R * Cc; j++) if (mine[j] && state[j] !== 2) { state[j] = 2; paint(j); }
  flags = M; hud();
  const best = store.data.best[diff];
  const record = best == null || secs < best;
  if (record) { store.data.best[diff] = secs; store.save(); hud(); }
  sfx.win(); Kit.confetti();
  setTimeout(() => Kit.overlay(ov, {
    title: 'Field cleared', grad: true, text: `${diff[0].toUpperCase() + diff.slice(1)} board, ${M} mines avoided.`,
    stats: [[secs + 's', 'Time'], [store.data.best[diff] + 's', 'Best']], note: record ? 'New best time' : '',
    actions: [{ label: 'See board', onClick: () => Kit.overlay(ov, null) }, { label: 'Play again', primary: true, onClick: newGame }],
  }), 600);
}

/* ── Input: click, right-click, long-press, keyboard ── */
let pressTimer = null, longPressed = false;
fieldEl.addEventListener('pointerdown', e => {
  const el = e.target.closest('.c'); if (!el) return;
  longPressed = false;
  if (e.pointerType !== 'mouse') pressTimer = setTimeout(() => { longPressed = true; toggleFlag(+el.dataset.i); }, 380);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach(t => fieldEl.addEventListener(t, () => clearTimeout(pressTimer)));
fieldEl.addEventListener('click', e => {
  const el = e.target.closest('.c'); if (!el) return;
  if (longPressed) { longPressed = false; return; }
  const i = +el.dataset.i;
  setFocus(i, false);
  if (flagMode && state[i] !== 1) toggleFlag(i); else reveal(i);
});
fieldEl.addEventListener('contextmenu', e => { e.preventDefault(); const el = e.target.closest('.c'); if (el) toggleFlag(+el.dataset.i); });
function setFocus(i, focus = true) {
  fieldEl.children[focusIdx].tabIndex = -1; focusIdx = i; fieldEl.children[i].tabIndex = 0;
  if (focus) fieldEl.children[i].focus();
}
fieldEl.addEventListener('keydown', e => {
  const r = Math.floor(focusIdx / Cc), c = focusIdx % Cc;
  const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
  if (d) { e.preventDefault(); setFocus(Math.max(0, Math.min(R - 1, r + d[0])) * Cc + Math.max(0, Math.min(Cc - 1, c + d[1]))); }
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(focusIdx); }
  if (e.key === 'f' || e.key === 'F') toggleFlag(focusIdx);
});
$('#flagMode').onclick = () => { flagMode = !flagMode; $('#flagMode').setAttribute('aria-pressed', flagMode); sfx.click(); };
addEventListener('keydown', e => { if ((e.key === 'm' || e.key === 'M')) $('#flagMode').click(); });
$('#new').onclick = newGame;

diff = store.data.diff; setDiff(diff);
newGame();
