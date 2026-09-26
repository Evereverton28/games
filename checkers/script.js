/* ═══════════════════════════════════════════════════════════
   CHECKERS — American rules, alpha-beta AI
   Board: 64 squares. P1 (orange) moves up the board, P2 (cyan) down.
   Values: 1 / 2 = P1 man / king, -1 / -2 = P2 man / king.
═══════════════════════════════════════════════════════════ */
const { $, sfx } = Kit;
const store = Kit.store('checkers', { mode: 'medium', wins: 0, losses: 0 });
const boardEl = $('#board'), ov = $('#ov');
Kit.soundToggle($('#sound'));

const rc = i => [i >> 3, i & 7];
const idx = (r, c) => r * 8 + c;
const on = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const side = v => Math.sign(v);

function initial() {
  const b = Array(64).fill(0);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if ((r + c) % 2 === 0) continue;
    if (r < 3) b[idx(r, c)] = -1;
    if (r > 4) b[idx(r, c)] = 1;
  }
  return b;
}

/* ── Move generation: moves are { from, path: [squares], caps: [squares] } ── */
function dirsFor(v) { return Math.abs(v) === 2 ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : v > 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]; }
function jumpsFrom(b, from, v, path, caps, out) {
  const [r, c] = rc(path.length ? path[path.length - 1] : from);
  let extended = false;
  for (const [dr, dc] of dirsFor(v)) {
    const mr = r + dr, mc = c + dc, tr = r + 2 * dr, tc = c + 2 * dc;
    if (!on(tr, tc)) continue;
    const mid = idx(mr, mc), to = idx(tr, tc);
    if (side(b[mid]) !== -side(v) || caps.includes(mid)) continue;
    if (b[to] !== 0 && to !== from) continue;
    extended = true;
    const promotes = Math.abs(v) === 1 && ((v > 0 && tr === 0) || (v < 0 && tr === 7));
    if (promotes) out.push({ from, path: [...path, to], caps: [...caps, mid] }); // crowning ends the move
    else jumpsFrom(b, from, v, [...path, to], [...caps, mid], out);
  }
  if (!extended && path.length) out.push({ from, path, caps });
}
function legalMoves(b, player) {
  const caps = [], quiet = [];
  for (let i = 0; i < 64; i++) {
    const v = b[i];
    if (side(v) !== player) continue;
    jumpsFrom(b, i, v, [], [], caps);
    if (caps.length) continue;
    const [r, c] = rc(i);
    for (const [dr, dc] of dirsFor(v)) if (on(r + dr, c + dc) && b[idx(r + dr, c + dc)] === 0) quiet.push({ from: i, path: [idx(r + dr, c + dc)], caps: [] });
  }
  return caps.length ? caps : quiet;
}
function apply(b, m) {
  const n = b.slice();
  let v = n[m.from];
  n[m.from] = 0;
  for (const c of m.caps) n[c] = 0;
  const to = m.path[m.path.length - 1];
  const r = to >> 3;
  if (v === 1 && r === 0) v = 2;
  if (v === -1 && r === 7) v = -2;
  n[to] = v;
  return n;
}

/* ── AI ── */
function evaluate(b) { // from P2 (computer) perspective
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const v = b[i]; if (!v) continue;
    const [r, c] = rc(i);
    let val = Math.abs(v) === 2 ? 175 : 100;
    if (Math.abs(v) === 1) val += (v > 0 ? 7 - r : r) * 3;          // advancement
    if (c >= 2 && c <= 5 && r >= 2 && r <= 5) val += 6;            // centre
    if (Math.abs(v) === 1 && ((v > 0 && r === 7) || (v < 0 && r === 0))) val += 8; // back row guard
    s += v < 0 ? val : -val;
  }
  return s;
}
function search(b, depth, alpha, beta, player) {
  const moves = legalMoves(b, player);
  if (!moves.length) return player === -1 ? -10000 - depth : 10000 + depth;
  if (depth <= 0 && !moves[0].caps.length) return evaluate(b);
  if (depth <= -4) return evaluate(b); // quiescence limit
  if (player === -1) {
    let best = -Infinity;
    for (const m of moves) { best = Math.max(best, search(apply(b, m), depth - 1, alpha, beta, 1)); alpha = Math.max(alpha, best); if (alpha >= beta) break; }
    return best;
  }
  let best = Infinity;
  for (const m of moves) { best = Math.min(best, search(apply(b, m), depth - 1, alpha, beta, -1)); beta = Math.min(beta, best); if (alpha >= beta) break; }
  return best;
}
function aiMove(b, level) {
  const moves = legalMoves(b, -1);
  if (level === 'easy' && Math.random() < .45) return Kit.pick(moves);
  const depth = { easy: 2, medium: 4, hard: 7 }[level];
  let best = -Infinity, choices = [];
  for (const m of Kit.shuffle(moves.slice())) {
    const s = search(apply(b, m), depth - 1, -Infinity, Infinity, 1);
    if (s > best) { best = s; choices = [m]; } else if (s === best) choices.push(m);
  }
  return choices[0];
}

/* ── Game state & rendering ── */
let board, turn, mode, selected, history, quietPlies, busy, lastMove, over;
const squares = [], pieceEls = new Map();
for (let i = 0; i < 64; i++) {
  const [r, c] = rc(i);
  const d = document.createElement('div');
  d.className = 'sq' + ((r + c) % 2 ? ' dark' : '');
  if ((r + c) % 2) { d.tabIndex = -1; d.setAttribute('role', 'gridcell'); d.addEventListener('click', () => clickSquare(i)); }
  boardEl.appendChild(d); squares.push(d);
}
const setMode = Kit.segmented($('#mode'), v => { mode = v; store.set('mode', v); newGame(); });

function newGame() {
  board = initial(); turn = 1; selected = null; history = []; quietPlies = 0; busy = false; lastMove = null; over = false;
  pieceEls.forEach(el => el.remove()); pieceEls.clear();
  // assign stable ids to pieces so they can animate
  ids = Array(64).fill(null); let n = 0;
  for (let i = 0; i < 64; i++) if (board[i]) ids[i] = ++n;
  Kit.overlay(ov, null);
  render();
}
let ids = [];
function place(el, i) { const [r, c] = rc(i); el.style.transform = `translate(${c * 100}%, ${r * 100}%)`; }
function render() {
  const moves = !over && (mode === 'pvp' || turn === 1) ? legalMoves(board, turn) : [];
  const mustCapture = moves.length && moves[0].caps.length;
  const selMoves = selected == null ? [] : moves.filter(m => m.from === selected);
  const alive = new Set();
  for (let i = 0; i < 64; i++) {
    const v = board[i];
    if (!v) continue;
    const id = ids[i]; alive.add(id);
    let el = pieceEls.get(id);
    if (!el) { el = document.createElement('div'); el.innerHTML = '<div class="disk"></div>'; boardEl.appendChild(el); pieceEls.set(id, el); }
    const wasKing = el.classList.contains('king');
    el.className = `piece ${v > 0 ? 'p1' : 'p2'}${Math.abs(v) === 2 ? ' king' : ''}${i === selected ? ' sel' : ''}${mustCapture && moves.some(m => m.from === i) && selected == null ? ' must' : ''}`;
    if (!wasKing && Math.abs(v) === 2 && el.dataset.placed) { el.classList.add('crowned'); sfx.arp([784, 988, 1175], { gap: .06, dur: .2, vol: .05 }); }
    el.dataset.placed = 1;
    place(el, i);
  }
  pieceEls.forEach((el, id) => { if (!alive.has(id)) { el.classList.add('dying'); setTimeout(() => el.remove(), 260); pieceEls.delete(id); } });
  squares.forEach((sq, i) => {
    sq.classList.remove('target', 'cap', 'last');
    if (lastMove && (lastMove.from === i || lastMove.path.includes(i))) sq.classList.add('last');
  });
  for (const m of selMoves) { const t = m.path[0]; squares[t].classList.add('target'); if (m.caps.length) squares[t].classList.add('cap'); }
  // side panel
  const count = s => board.filter(v => side(v) === s).length;
  $('#p1cap').textContent = `${count(1)} pieces`;
  $('#p2cap').textContent = `${count(-1)} pieces`;
  $('#p1name').textContent = mode === 'pvp' ? 'Orange' : 'You';
  $('#p2name').textContent = mode === 'pvp' ? 'Cyan' : 'Computer';
  $('#p1').classList.toggle('active', turn === 1 && !over);
  $('#p2').classList.toggle('active', turn === -1 && !over);
  $('#turn').textContent = over ? 'Game over' : mode === 'pvp' ? (turn === 1 ? 'Orange to move' : 'Cyan to move') : turn === 1 ? (mustCapture ? 'You must capture' : 'Your move') : 'Thinking…';
  $('#undo').disabled = !history.length || busy;
}

function clickSquare(i) {
  if (busy || over || (mode !== 'pvp' && turn !== 1)) return;
  const moves = legalMoves(board, turn);
  if (side(board[i]) === turn) {
    if (moves.some(m => m.from === i)) { selected = i; sfx.select(); }
    else { sfx.error(); Kit.toast(moves[0] && moves[0].caps.length ? 'A capture is available, so you must take it.' : 'That piece has no moves.'); }
    render(); return;
  }
  if (selected == null) return;
  // Choose the move whose first hop lands here; for multi-jump branches, prefer the longest
  const options = moves.filter(m => m.from === selected && m.path[0] === i).sort((a, b) => b.caps.length - a.caps.length);
  if (!options.length) { selected = null; render(); return; }
  play(options[0]);
}

async function play(m) {
  busy = true;
  history.push({ board: board.slice(), ids: ids.slice(), turn, quietPlies, lastMove });
  selected = null;
  const id = ids[m.from];
  const el = pieceEls.get(id);
  // animate hop by hop
  let cur = m.from;
  for (let k = 0; k < m.path.length; k++) {
    const to = m.path[k];
    if (el) { el.style.zIndex = 5; place(el, to); }
    if (m.caps[k] != null) {
      const capEl = pieceEls.get(ids[m.caps[k]]);
      setTimeout(() => { if (capEl) capEl.classList.add('dying'); }, 120);
      sfx.tone(300 - k * 20, { type: 'triangle', dur: .1, vol: .06, slide: 180 });
    } else sfx.tone(360, { type: 'triangle', dur: .05, vol: .04 });
    await wait(m.path.length > 1 ? 190 : 170);
    cur = to;
  }
  if (el) el.style.zIndex = '';
  const moverWasMan = Math.abs(board[m.from]) === 1;
  board = apply(board, m);
  const to = m.path[m.path.length - 1];
  ids[to] = id; ids[m.from] = null; m.caps.forEach(c => { ids[c] = null; });
  quietPlies = m.caps.length || moverWasMan ? 0 : quietPlies + 1;
  lastMove = m;
  turn = -turn;
  busy = false;
  render();
  checkEnd();
  if (!over && mode !== 'pvp' && turn === -1) {
    busy = true; render();
    await wait(260);
    const reply = aiMove(board, mode);
    busy = false;
    play(reply);
  }
}
const wait = ms => new Promise(r => setTimeout(r, ms));

function checkEnd() {
  const moves = legalMoves(board, turn);
  let title, text, win = false;
  if (!moves.length) {
    const loser = turn;
    over = true;
    if (mode === 'pvp') { title = `${loser === 1 ? 'Cyan' : 'Orange'} wins`; text = `${loser === 1 ? 'Orange' : 'Cyan'} has no moves left.`; win = true; }
    else if (loser === -1) { title = 'You win'; text = 'The computer has no moves left.'; win = true; store.set('wins', store.data.wins + 1); }
    else { title = 'Computer wins'; text = 'You have no moves left.'; store.set('losses', store.data.losses + 1); }
  } else if (quietPlies >= 80) {
    over = true; title = 'Draw'; text = '40 moves each without a capture or a man moving.';
  }
  if (!over) return;
  render();
  win ? (sfx.win(), Kit.confetti(['#f97316', '#38bdf8', '#fbbf24'])) : sfx.lose();
  setTimeout(() => Kit.overlay(ov, {
    title, grad: win, text,
    stats: mode === 'pvp' ? null : [[store.data.wins, 'Wins'], [store.data.losses, 'Losses']],
    actions: [{ label: 'Review board', onClick: () => Kit.overlay(ov, null) }, { label: 'Play again', primary: true, onClick: newGame }],
  }), 500);
}

$('#undo').onclick = () => {
  if (busy || !history.length) return;
  // In vs-computer games, step back to the player's previous turn
  let h = history.pop();
  if (mode !== 'pvp' && h.turn === -1 && history.length) h = history.pop();
  board = h.board; ids = h.ids; turn = h.turn; quietPlies = h.quietPlies; lastMove = h.lastMove; selected = null; over = false;
  pieceEls.forEach(el => el.remove()); pieceEls.clear();
  Kit.overlay(ov, null);
  render(); sfx.tone(520, { dur: .1, vol: .04, slide: 320 });
};
$('#new').onclick = newGame;
addEventListener('keydown', e => { if (e.key === 'Escape') { selected = null; render(); } });

mode = store.data.mode; setMode(mode);
newGame();
