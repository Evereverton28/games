/* ═══════════════════════════════════════════════════════════
   TIC-TAC-TOE
═══════════════════════════════════════════════════════════ */
const { $, sfx } = Kit;
const store = Kit.store('tictactoe', { mode: 'hard', tally: {} });
const boardEl = $('#board'), ov = $('#ov');
Kit.soundToggle($('#sound'));

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const XSVG = '<svg viewBox="0 0 100 100" class="x"><path d="M18 18L82 82" pathLength="100"/><path d="M82 18L18 82" pathLength="100"/></svg>';
const OSVG = '<svg viewBox="0 0 100 100" class="o"><circle cx="50" cy="50" r="32" pathLength="190"/></svg>';
let mode, cells, turn, starter = 'X', over, busy, panelTimer, aiTimer;
const sqs = [];
for (let i = 0; i < 9; i++) {
  const b = document.createElement('button');
  b.className = 'sq'; b.setAttribute('aria-label', `Square ${i + 1}, empty`);
  b.addEventListener('click', () => play(i, true));
  b.addEventListener('mouseenter', () => ghost(i, true)); b.addEventListener('mouseleave', () => ghost(i, false));
  boardEl.appendChild(b); sqs.push(b);
}
const setMode = Kit.segmented($('#mode'), v => { mode = v; store.set('mode', v); starter = 'X'; newRound(); });

function winner(b) {
  for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return { p: b[l[0]], line: l };
  return b.every(Boolean) ? { p: 'draw' } : null;
}
function minimax(b, player, depth) {
  const w = winner(b);
  if (w) return w.p === 'O' ? 10 - depth : w.p === 'X' ? depth - 10 : 0;
  const scores = [];
  for (let i = 0; i < 9; i++) if (!b[i]) { b[i] = player; scores.push(minimax(b, player === 'O' ? 'X' : 'O', depth + 1)); b[i] = null; }
  return player === 'O' ? Math.max(...scores) : Math.min(...scores);
}
function aiMove() {
  const free = cells.map((v, i) => v ? -1 : i).filter(i => i >= 0);
  const blunder = mode === 'easy' ? .75 : mode === 'medium' ? .3 : 0;
  if (Math.random() < blunder) {
    // even when careless, easy/medium still take an immediate win half the time
    const win = free.find(i => { cells[i] = 'O'; const w = winner(cells); cells[i] = null; return w && w.p === 'O'; });
    if (win != null && Math.random() < .5) return win;
    return Kit.pick(free);
  }
  let best = -Infinity, choices = [];
  for (const i of free) {
    cells[i] = 'O'; const s = minimax(cells, 'X', 1); cells[i] = null;
    if (s > best) { best = s; choices = [i]; } else if (s === best) choices.push(i);
  }
  return Kit.pick(choices);
}

function newRound() {
  clearTimeout(panelTimer); clearTimeout(aiTimer);
  cells = Array(9).fill(null); turn = starter; over = false; busy = false;
  $('#line').innerHTML = '';
  sqs.forEach((s, i) => { s.innerHTML = ''; s.className = 'sq'; s.disabled = false; s.setAttribute('aria-label', `Square ${i + 1}, empty`); });
  Kit.overlay(ov, null);
  labels(); status();
  if (mode !== 'pvp' && turn === 'O') computer();
}
function ghost(i, on) {
  const s = sqs[i];
  if (cells[i] || over || busy || (mode !== 'pvp' && turn === 'O')) return;
  if (on) { s.innerHTML = turn === 'X' ? XSVG : OSVG; s.classList.add('ghost'); s.querySelectorAll('path,circle').forEach(p => p.style.animation = 'none'); s.querySelectorAll('path,circle').forEach(p => p.style.strokeDashoffset = 0); }
  else { s.innerHTML = ''; s.classList.remove('ghost'); }
}
function play(i, human) {
  if (over || cells[i] || (human && (busy || (mode !== 'pvp' && turn === 'O')))) return;
  cells[i] = turn;
  const s = sqs[i];
  s.classList.remove('ghost');
  s.innerHTML = turn === 'X' ? XSVG : OSVG;
  s.disabled = true; s.setAttribute('aria-label', `Square ${i + 1}, ${turn}`);
  sfx.tone(turn === 'X' ? 520 : 390, { type: 'triangle', dur: .1, vol: .05, slide: turn === 'X' ? 620 : 470 });
  const w = winner(cells);
  if (w) return finish(w);
  turn = turn === 'X' ? 'O' : 'X';
  status();
  if (mode !== 'pvp' && turn === 'O') computer();
}
function computer() {
  busy = true; status();
  aiTimer = setTimeout(() => { busy = false; play(aiMove(), false); }, 420);
}
function finish(w) {
  over = true;
  sqs.forEach(s => s.disabled = true);
  const t = tally();
  if (w.p === 'draw') { t.d++; sfx.arp([392, 392], { gap: .15 }); }
  else {
    t[w.p === 'X' ? 'x' : 'o']++;
    w.line.forEach(i => sqs[i].classList.add('win'));
    sqs.forEach((s, i) => { if (!w.line.includes(i)) s.classList.add('dim'); });
    const c = k => [50 + (k % 3) * 100, 50 + Math.floor(k / 3) * 100];
    const [a, b] = [c(w.line[0]), c(w.line[2])];
    const ext = (p, q) => [p[0] + (p[0] - q[0]) * .18, p[1] + (p[1] - q[1]) * .18];
    const [s0, s1] = [ext(a, b), ext(b, a)];
    $('#line').innerHTML = `<path d="M${s0[0]} ${s0[1]}L${s1[0]} ${s1[1]}" pathLength="400"/>`;
    const youWon = mode === 'pvp' || w.p === 'X';
    if (youWon) { sfx.win(); Kit.confetti(w.p === 'X' ? ['#f97316', '#fdba74', '#fbbf24'] : ['#38bdf8', '#7dd3fc', '#a78bfa']); } else sfx.lose();
  }
  store.save(); labels();
  starter = starter === 'X' ? 'O' : 'X';
  const text = w.p === 'draw' ? "It's a draw" : mode === 'pvp' ? `${w.p} wins` : w.p === 'X' ? 'You win' : 'Computer wins';
  $('#status').textContent = text; $('#status').className = 'status ' + (w.p === 'draw' ? '' : w.p.toLowerCase());
  Kit.say(text);
  panelTimer = setTimeout(() => Kit.overlay(ov, {
    title: text, grad: w.p !== 'draw' && (mode === 'pvp' || w.p === 'X'),
    text: mode === 'hard' && w.p !== 'X' ? 'Hard mode plays perfectly. A draw is the best possible result.' : `${starter === 'X' ? (mode === 'pvp' ? 'X' : 'You') : (mode === 'pvp' ? 'O' : 'The computer')} start${starter === 'X' && mode !== 'pvp' ? '' : 's'} next round.`,
    stats: [[t.x, mode === 'pvp' ? 'X' : 'You'], [t.d, 'Draws'], [t.o, mode === 'pvp' ? 'O' : 'Computer']],
    actions: [{ label: 'Next round', primary: true, onClick: newRound }],
  }), 1100);
}
function tally() { return store.data.tally[mode] || (store.data.tally[mode] = { x: 0, o: 0, d: 0 }); }
function labels() {
  const t = tally();
  $('#sx').textContent = t.x; $('#so').textContent = t.o; $('#sd').textContent = t.d;
  $('#lx').textContent = mode === 'pvp' ? 'Player X' : 'You (X)';
  $('#lo').textContent = mode === 'pvp' ? 'Player O' : 'Computer (O)';
}
function status() {
  const el = $('#status');
  el.className = 'status ' + turn.toLowerCase();
  el.textContent = mode === 'pvp' ? `${turn} to move` : turn === 'X' ? 'Your move' : 'Computer is thinking…';
}
$('#next').onclick = newRound;
$('#reset').onclick = () => { store.data.tally[mode] = { x: 0, o: 0, d: 0 }; store.save(); labels(); sfx.click(); };
addEventListener('keydown', e => { if (/^[1-9]$/.test(e.key)) { const k = +e.key - 1; play([6, 7, 8, 3, 4, 5, 0, 1, 2][k], true); } });

mode = store.data.mode; setMode(mode);
newRound();
