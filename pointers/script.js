/* ═══════════════════════════════════════════════════════════
   POINTERS
   Each pointer is a winding path of 2–13 cells with an arrowhead.
   Firing it makes it slither forward: the head travels straight in the
   direction it points and the body follows its own path. It leaves the
   board only if every cell in a straight line ahead of the head is free.
═══════════════════════════════════════════════════════════ */
const { $, sfx } = Kit;

/* ── ENGINE (no DOM) ─────────────────────────────────────── */
const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1]; // up, right, down, left
const dirBetween = (a, b) => b[0] < a[0] ? 0 : b[1] > a[1] ? 1 : b[0] > a[0] ? 2 : 3;
const headOf = a => a.cells[a.cells.length - 1];

function occupancy(arrows, n) {
  const g = Array.from({ length: n }, () => Array(n).fill(-1));
  arrows.forEach((a, i) => { if (!a.gone) for (const [r, c] of a.cells) g[r][c] = i; });
  return g;
}
// Cells in a straight line ahead of the head, up to the edge
function rayOf(a, n) {
  const out = [];
  let [r, c] = headOf(a);
  for (;;) { r += DR[a.dir]; c += DC[a.dir]; if (r < 0 || r >= n || c < 0 || c >= n) return out; out.push([r, c]); }
}
// null if clear; otherwise { dist, blocker } (dist = free cells before the blocker)
function blockerOf(arrows, i, g, n) {
  const ray = rayOf(arrows[i], n);
  for (let k = 0; k < ray.length; k++) { const j = g[ray[k][0]][ray[k][1]]; if (j >= 0 && j !== i) return { dist: k, blocker: j }; }
  return null;
}
const selfBlocked = (a, n) => { const own = new Set(a.cells.map(([r, c]) => r * n + c)); return rayOf(a, n).some(([r, c]) => own.has(r * n + c)); };
function reverse(a) { a.cells.reverse(); a.dir = dirBetween(a.cells[a.cells.length - 2], a.cells[a.cells.length - 1]); }

// Peel off every free pointer, round by round. Leaving never blocks anyone,
// so the board is solvable exactly when this clears it.
function analyse(arrows, n) {
  const as = arrows.map(a => ({ ...a, gone: false }));
  let layers = 0, removed = 0, firstFree = 0;
  while (removed < as.length) {
    const g = occupancy(as, n);
    const free = as.map((a, i) => i).filter(i => !as[i].gone && !blockerOf(as, i, g, n));
    if (!free.length) return { solvable: false, layers, stuck: as.map((a, i) => i).filter(i => !as[i].gone) };
    if (!layers) firstFree = free.length;
    free.forEach(i => { as[i].gone = true; }); removed += free.length; layers++;
  }
  return { solvable: true, layers, firstFree };
}

function generate(n, { minLen, maxLen, straight }, rnd) {
  const taken = Array.from({ length: n }, () => Array(n).fill(false));
  const arrows = [];
  const starts = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) starts.push([r, c]);
  for (let i = starts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [starts[i], starts[j]] = [starts[j], starts[i]]; }
  for (const s of starts) {
    if (taken[s[0]][s[1]]) continue;
    // lengths skew towards the long end so boards get properly tangled
    const want = minLen + Math.floor(Math.pow(rnd(), .8) * (maxLen - minLen + 1));
    const cells = [s]; taken[s[0]][s[1]] = true;
    let dir = Math.floor(rnd() * 4);
    while (cells.length < want) {
      const [r, c] = cells[cells.length - 1];
      const opts = [0, 1, 2, 3].filter(d => {
        const rr = r + DR[d], cc = c + DC[d];
        return rr >= 0 && rr < n && cc >= 0 && cc < n && !taken[rr][cc];
      });
      if (!opts.length) break;
      // keep going straight sometimes; otherwise turn, preferring cells that hug other
      // pointers so paths wrap around each other and interlock
      const hug = d => { const rr = r + DR[d], cc = c + DC[d]; let k = 0; for (let e = 0; e < 4; e++) { const r2 = rr + DR[e], c2 = cc + DC[e]; if (r2 < 0 || r2 >= n || c2 < 0 || c2 >= n || taken[r2][c2]) k++; } return k; };
      let d;
      if (opts.includes(dir) && rnd() < straight) d = dir;
      else d = opts.map(o => [o, hug(o) + rnd() * 2.2]).sort((x, y) => y[1] - x[1])[0][0];
      const next = [r + DR[d], c + DC[d]];
      cells.push(next); taken[next[0]][next[1]] = true; dir = d;
    }
    if (cells.length < 2) { taken[s[0]][s[1]] = false; continue; }
    const a = { cells, dir: dirBetween(cells[cells.length - 2], cells[cells.length - 1]) };
    if (selfBlocked(a, n)) { reverse(a); if (selfBlocked(a, n)) { cells.forEach(([r, c]) => { taken[r][c] = false; }); continue; } }
    arrows.push(a);
  }
  // Break deadlocks by reversing stuck pointers (or, rarely, removing one)
  for (let guard = 0; guard < 600; guard++) {
    const res = analyse(arrows, n);
    if (res.solvable) break;
    const i = res.stuck[Math.floor(rnd() * res.stuck.length)], a = arrows[i];
    reverse(a);
    if (selfBlocked(a, n) || guard > 450) arrows.splice(i, 1);
  }
  fillGaps(arrows, n, rnd);
  return arrows;
}
// Grow tails into empty neighbouring cells (heads never move), keeping the board solvable
function fillGaps(arrows, n, rnd) {
  for (let pass = 0; pass < 4; pass++) {
    const g = occupancy(arrows, n);
    let grew = false;
    const empties = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (g[r][c] < 0) empties.push([r, c]);
    for (const [r, c] of empties.sort(() => rnd() - .5)) {
      const cands = [];
      for (let d = 0; d < 4; d++) {
        const rr = r + DR[d], cc = c + DC[d];
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        const i = g[rr][cc];
        if (i >= 0 && arrows[i].cells[0][0] === rr && arrows[i].cells[0][1] === cc && arrows[i].cells.length < 16) cands.push(i);
      }
      for (const i of cands.sort(() => rnd() - .5)) {
        const a = arrows[i];
        a.cells.unshift([r, c]);
        if (!selfBlocked(a, n) && analyse(arrows, n).solvable) { g[r][c] = i; grew = true; break; }
        a.cells.shift();
      }
    }
    if (!grew) break;
  }
}

const LEVEL_COUNT = 42;
function recipe(i) {
  const tier = Math.floor(i / 6), step = i % 6;
  return {
    n: [5, 6, 7, 8, 9, 10, 11][tier],
    minLen: 2, maxLen: [4, 5, 7, 8, 10, 12, 13][tier] + (step > 3 ? 1 : 0),
    straight: .45 - tier * .03,
    depth: 3 + tier + Math.floor(step / 2),
  };
}
function buildLevel(i, seed) {
  const R = recipe(i), rnd = Kit.rng(seed);
  let best = null;
  for (let k = 0; k < 30; k++) {
    const arrows = generate(R.n, R, rnd);
    const a = analyse(arrows, R.n);
    if (!a.solvable || arrows.length < 3) continue;
    const cover = arrows.reduce((s, x) => s + x.cells.length, 0) / (R.n * R.n);
    // prefer: deep dependency chains, few pointers free at the start, a well-filled board
    const score = Math.abs(a.layers - R.depth) * 3 + a.firstFree / arrows.length * 5 + (1 - cover) * 6;
    if (!best || score < best.score) best = { arrows, a, score };
  }
  return { n: R.n, arrows: best.arrows, layers: best.a.layers };
}
/* ── END ENGINE ─────────────────────────────────────────── */

const W = 480;
const cv = $('#cv'), ctx = Kit.fitCanvas(cv, W, W), ov = $('#ov');
const store = Kit.store('pointers2', { level: 0, stars: {} });
const parts = new Kit.Particles(), shake = new Kit.Shake();
Kit.soundToggle($('#sound'));
const PALETTE = ['#f97316', '#38bdf8', '#a78bfa', '#22c55e', '#f472b6', '#facc15', '#2dd4bf', '#fb7185', '#818cf8'];

let L, level, free, hearts, hints, done, hover = -1, cursor = { r: 0, c: 0 }, keyMode = false, hintIdx = -1, t = 0;
let PAD, CELL;

function colourise(arrows, n) {
  // neighbouring pointers get different colours so tangles stay readable
  const g = occupancy(arrows, n);
  arrows.forEach((a, i) => {
    const near = new Set();
    for (const [r, c] of a.cells) for (let d = 0; d < 4; d++) {
      const rr = r + DR[d], cc = c + DC[d];
      if (rr >= 0 && rr < n && cc >= 0 && cc < n && g[rr][cc] >= 0 && g[rr][cc] !== i && arrows[g[rr][cc]].col) near.add(arrows[g[rr][cc]].col);
    }
    const options = PALETTE.filter(p => !near.has(p));
    a.col = options.length ? options[(i * 7) % options.length] : PALETTE[i % PALETTE.length];
  });
}
function start(i, randomSize) {
  free = !!randomSize; level = i;
  L = free ? buildLevel(Math.min(LEVEL_COUNT - 1, (randomSize - 5) * 6 + 4), Math.floor(Math.random() * 1e9)) : buildLevel(i, 424242 + i * 7919);
  L.arrows = L.arrows.map((a, k) => ({ ...a, cells: a.cells.map(c => c.slice()), id: k, gone: false, fly: null, bump: null, flash: 0 }));
  colourise(L.arrows, L.n);
  hearts = 3; hints = 0; done = false; hintIdx = -1; hover = -1;
  PAD = 18; CELL = (W - PAD * 2) / L.n;
  cursor = { r: Math.floor(L.n / 2), c: Math.floor(L.n / 2) };
  Kit.overlay(ov, null);
  hud();
}
function hud() {
  $('#lvl').textContent = free ? `${L.n}×${L.n}` : level + 1;
  $('#lvlLabel').textContent = free ? 'Random' : 'Level';
  $('#left').textContent = L.arrows.filter(a => !a.gone).length;
  $('#hearts').innerHTML = '♥'.repeat(hearts) + `<span class="lost">${'♥'.repeat(3 - hearts)}</span>`;
  $('#hintsUsed').textContent = hints;
}
const grid = () => occupancy(L.arrows, L.n);

function fire(i) {
  if (done || i < 0) return;
  const a = L.arrows[i];
  if (a.gone || a.fly || a.bump) return;
  hintIdx = -1;
  const b = blockerOf(L.arrows, i, grid(), L.n);
  if (!b) {
    a.gone = true; a.fly = { p: 0, v: .08 };
    sfx.tone(380 + (L.arrows.filter(q => q.gone).length % 8) * 45, { type: 'triangle', dur: .14, vol: .05, slide: 900 });
    hud();
    if (L.arrows.every(q => q.gone)) setTimeout(win, 600);
  } else {
    a.bump = { dist: b.dist, t: 0, hit: false };
    L.arrows[b.blocker].flash = 1;
    hearts--;
    sfx.error(); shake.hit(5);
    Kit.pulse($('#hearts').parentElement, 'hurt');
    if (navigator.vibrate) navigator.vibrate(60);
    hud();
    if (hearts <= 0) { done = true; setTimeout(lose, 700); }
  }
}
function starsFor() { return Math.max(1, hearts - (hints ? 1 : 0)); }
function win() {
  done = true;
  const stars = starsFor();
  if (!free) {
    store.data.stars[level] = Math.max(store.data.stars[level] || 0, stars);
    store.set('level', Math.max(store.data.level, Math.min(LEVEL_COUNT - 1, level + 1)));
  }
  sfx.win(); Kit.confetti();
  const last = !free && level === LEVEL_COUNT - 1;
  Kit.overlay(ov, {
    title: free ? 'Board cleared' : last ? 'All levels cleared' : `Level ${level + 1} cleared`, grad: true,
    html: `<div class="stars" aria-label="${stars} of 3 stars">${'★'.repeat(stars)}<span class="off">${'★'.repeat(3 - stars)}</span></div>`,
    text: hearts === 3 && !hints ? 'Flawless: no bumps, no hints.' : `${3 - hearts} bump${3 - hearts === 1 ? '' : 's'}${hints ? `, ${hints} hint${hints > 1 ? 's' : ''}` : ''}.`,
    actions: free ? [{ label: 'Levels', onClick: picker }, { label: 'New board', primary: true, onClick: () => start(0, L.n) }]
      : [{ label: 'Replay', onClick: () => start(level) }, { label: last ? 'Levels' : 'Next level', primary: true, onClick: () => last ? picker() : start(level + 1) }],
  });
}
function lose() {
  sfx.lose();
  Kit.overlay(ov, {
    title: 'Out of hearts', text: 'Three pointers hit something. Follow a head in a straight line to the edge before you tap: it must be completely clear.',
    actions: [{ label: 'Levels', onClick: picker }, { label: 'Try again', primary: true, onClick: () => free ? start(0, L.n) : start(level) }],
  });
}
function hint() {
  if (done) return;
  const g = grid();
  const cands = L.arrows.map((a, i) => i).filter(i => !L.arrows[i].gone && !blockerOf(L.arrows, i, g, L.n));
  if (!cands.length) return;
  // the most useful free pointer is the one whose exit frees the most others
  const freed = i => { const as = L.arrows.map(a => ({ ...a })); as[i].gone = true; const g2 = occupancy(as, L.n); return as.filter((a, k) => !a.gone && !blockerOf(as, k, g2, L.n)).length; };
  cands.sort((a, b) => freed(b) - freed(a));
  hintIdx = cands[0]; hints++;
  sfx.tone(990, { type: 'sine', dur: .18, vol: .04 });
  Kit.say('A free pointer is highlighted.');
  hud();
}
function picker() {
  const unlocked = store.data.level;
  let html = '<div class="levels">';
  for (let i = 0; i < LEVEL_COUNT; i++) {
    if (i % 6 === 0) html += `<div class="chapter">${recipe(i).n}×${recipe(i).n}</div>`;
    html += `<button data-l="${i}" ${i > unlocked ? 'disabled' : ''} class="${i === level && !free ? 'cur' : ''}">${i + 1}<small>${'★'.repeat(store.data.stars[i] || 0)}</small></button>`;
  }
  html += '</div><p style="margin-bottom:6px">Random board</p><div class="seg" id="rnd">' + [6, 7, 8, 9, 10, 11].map(s => `<button data-v="${s}">${s}×${s}</button>`).join('') + '</div>';
  Kit.overlay(ov, {
    title: 'Levels', html,
    actions: [{ label: 'Close', onClick: () => { if (!done) Kit.overlay(ov, null); else picker(); } }],
    bind: el => {
      el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => start(+b.dataset.l));
      el.querySelectorAll('#rnd button').forEach(b => b.onclick = () => start(0, +b.dataset.v));
      const cur = el.querySelector('.cur'); if (cur) cur.scrollIntoView({ block: 'center' });
    },
  });
}

/* ── Input ── */
function arrowAt(x, y) {
  const c = Math.floor((x - PAD) / CELL), r = Math.floor((y - PAD) / CELL);
  if (r < 0 || c < 0 || r >= L.n || c >= L.n) return -1;
  return grid()[r][c];
}
cv.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; const p = Kit.canvasPoint(cv, e, W, W); hover = arrowAt(p.x, p.y); keyMode = false; });
cv.addEventListener('pointerleave', () => { hover = -1; });
cv.addEventListener('pointerdown', e => { const p = Kit.canvasPoint(cv, e, W, W); keyMode = false; fire(arrowAt(p.x, p.y)); });
addEventListener('keydown', e => {
  if (!ov.hidden) return;
  const d = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 }[e.key];
  if (d != null) {
    e.preventDefault(); keyMode = true;
    cursor.r = Math.max(0, Math.min(L.n - 1, cursor.r + DR[d])); cursor.c = Math.max(0, Math.min(L.n - 1, cursor.c + DC[d]));
    const i = grid()[cursor.r][cursor.c];
    if (i >= 0) Kit.say(`Pointer of ${L.arrows[i].cells.length} cells, heading ${['up', 'right', 'down', 'left'][L.arrows[i].dir]}`);
  }
  if ((e.key === 'Enter' || e.key === ' ') && keyMode) { e.preventDefault(); fire(grid()[cursor.r][cursor.c]); }
  if (e.key === 'h' || e.key === 'H') hint();
});
$('#hint').onclick = hint;
$('#restart').onclick = () => free ? start(0, L.n) : start(level);
$('#levels').onclick = picker;

/* ── Drawing: every pointer is drawn as a window sliding along its own
   track (its cells, then straight on past the edge) ── */
const cx = c => PAD + (c + .5) * CELL, cy = r => PAD + (r + .5) * CELL;
function trackOf(a) {
  if (a.track) return a.track;
  const tr = a.cells.map(c => c.slice());
  let [r, c] = headOf(a);
  for (let k = 0; k < L.n + a.cells.length + 3; k++) { r += DR[a.dir]; c += DC[a.dir]; tr.push([r, c]); }
  return a.track = tr;
}
function pointAt(tr, s) {
  const i = Math.max(0, Math.min(tr.length - 2, Math.floor(s))), f = s - i;
  return [cx(tr[i][1] + (tr[i + 1][1] - tr[i][1]) * f), cy(tr[i][0] + (tr[i + 1][0] - tr[i][0]) * f)];
}
function drawArrow(a, offset, glow) {
  const tr = trackOf(a), len = a.cells.length;
  const s0 = offset, s1 = offset + len - 1;
  const pts = [pointAt(tr, s0)];
  for (let k = Math.floor(s0) + 1; k <= Math.ceil(s1) - 1; k++) pts.push([cx(tr[k][1]), cy(tr[k][0])]);
  pts.push(pointAt(tr, s1));
  // head direction from the track segment it's on
  const hi = Math.min(tr.length - 2, Math.floor(s1));
  const hd = s1 >= len - 1 ? a.dir : dirBetween(tr[hi], tr[hi + 1]);
  const th = CELL * .3;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]); };
  // dark outline first so crossing/touching pointers separate cleanly
  if (glow) { ctx.shadowColor = a.col; ctx.shadowBlur = 16 * glow; }
  ctx.strokeStyle = '#0b0b12'; ctx.lineWidth = th + 5; path(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = a.col; ctx.lineWidth = th; path(); ctx.stroke();
  // highlight stripe
  ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = th * .28; path(); ctx.stroke();
  // arrowhead
  const [hx, hy] = pts[pts.length - 1];
  const fx = DC[hd], fy = DR[hd], px = -fy, py = fx;
  const tipX = hx + fx * CELL * .36, tipY = hy + fy * CELL * .36, back = CELL * .34, wing = CELL * .3;
  const tri = () => { ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(tipX - fx * back + px * wing, tipY - fy * back + py * wing); ctx.lineTo(tipX - fx * back - px * wing, tipY - fy * back - py * wing); ctx.closePath(); };
  ctx.lineWidth = 5; ctx.strokeStyle = '#0b0b12'; tri(); ctx.stroke();
  ctx.fillStyle = a.col; tri(); ctx.fill();
  // tail cap
  ctx.fillStyle = '#0b0b12'; ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], th * .26, 0, 7); ctx.fill();
  if (a.flash > 0) {
    ctx.strokeStyle = `rgba(244,63,94,${a.flash})`; ctx.lineWidth = th + 10; ctx.globalAlpha = .5 * a.flash; path(); ctx.stroke(); ctx.globalAlpha = 1;
  }
}
function frame(dt) {
  t += dt;
  ctx.clearRect(0, 0, W, W);
  const sh = shake.apply(ctx);
  ctx.fillStyle = '#101018'; ctx.beginPath(); ctx.roundRect(PAD - 8, PAD - 8, W - PAD * 2 + 16, W - PAD * 2 + 16, 14); ctx.fill();
  ctx.fillStyle = 'rgba(226,232,240,.07)';
  for (let r = 0; r < L.n; r++) for (let c = 0; c < L.n; c++) { ctx.beginPath(); ctx.arc(cx(c), cy(r), 1.8, 0, 7); ctx.fill(); }
  const g = grid();
  const focus = keyMode ? g[cursor.r][cursor.c] : hover;
  // straight-line preview from the head of the focused pointer
  if (!done && focus >= 0 && !L.arrows[focus].gone) {
    const a = L.arrows[focus], b = blockerOf(L.arrows, focus, g, L.n), [hr, hc] = headOf(a);
    const steps = b ? b.dist + .5 : L.n;
    ctx.strokeStyle = b ? 'rgba(244,63,94,.6)' : 'rgba(34,197,94,.65)'; ctx.lineWidth = 2.5; ctx.setLineDash([5, 6]);
    ctx.beginPath(); ctx.moveTo(cx(hc) + DC[a.dir] * CELL * .45, cy(hr) + DR[a.dir] * CELL * .45);
    ctx.lineTo(Math.max(PAD - 6, Math.min(W - PAD + 6, cx(hc + DC[a.dir] * steps))), Math.max(PAD - 6, Math.min(W - PAD + 6, cy(hr + DR[a.dir] * steps))));
    ctx.stroke(); ctx.setLineDash([]);
    if (b) { const [br, bc] = [hr + DR[a.dir] * (b.dist + 1), hc + DC[a.dir] * (b.dist + 1)]; ctx.strokeStyle = 'rgba(244,63,94,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx(bc), cy(br), CELL * .3, 0, 7); ctx.stroke(); }
  }
  // clip flying pointers softly at the board edge
  for (const a of L.arrows) {
    if (a.flash) a.flash = Math.max(0, a.flash - .03 * dt);
    if (a.gone && !a.fly) continue;
    let off = 0, alpha = 1;
    if (a.fly) {
      a.fly.v = Math.min(1.1, a.fly.v + .03 * dt); a.fly.p += a.fly.v * dt;
      off = a.fly.p;
      if (off > a.cells.length + L.n + 1) { a.fly = null; continue; }
      if (Math.random() < .4) { const [x, y] = pointAt(trackOf(a), off); parts.add({ x, y, dx: 0, dy: 0, col: a.col, r: 2.2, decay: .05 }); }
    } else if (a.bump) {
      a.bump.t += dt;
      const reach = a.bump.dist + .15, k = a.bump.t;
      off = k < 9 ? reach * (k / 9) : k < 22 ? reach * (1 - (k - 9) / 13) : 0;
      if (k >= 9 && !a.bump.hit) {
        a.bump.hit = true; sfx.tone(150, { type: 'square', dur: .08, vol: .05 });
        const [x, y] = pointAt(trackOf(a), off + a.cells.length - 1);
        parts.burst(x + DC[a.dir] * CELL * .4, y + DR[a.dir] * CELL * .4, '#f43f5e', 8, { speed: 2 });
      }
      if (k >= 22) a.bump = null;
    }
    const i = L.arrows.indexOf(a);
    const glow = i === hintIdx ? .6 + .4 * Math.sin(t / 5) : i === focus ? .55 : 0;
    ctx.save();
    if (a.fly) { ctx.beginPath(); ctx.rect(PAD - 10, PAD - 10, W - PAD * 2 + 20, W - PAD * 2 + 20); ctx.clip(); ctx.globalAlpha = alpha; }
    drawArrow(a, off, glow);
    ctx.restore();
  }
  if (keyMode && !done) { ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(PAD + cursor.c * CELL + 2, PAD + cursor.r * CELL + 2, CELL - 4, CELL - 4, 8); ctx.stroke(); }
  parts.update(dt); parts.draw(ctx);
  if (sh) ctx.restore();
}

start(Math.min(store.data.level, LEVEL_COUNT - 1));
if (store.data.level === 0 && !Object.keys(store.data.stars).length) Kit.overlay(ov, {
  title: 'Pointers', grad: true,
  text: 'Tap a pointer and it slithers off the board, head first, in the direction its arrow points. It only escapes if the straight line ahead of its head is completely clear; otherwise it bumps and costs a heart. Untangle the board.',
  actions: [{ label: 'Play', primary: true, onClick: () => Kit.overlay(ov, null) }],
});
Kit.loop(frame);
