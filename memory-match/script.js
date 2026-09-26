/* ═══════════════════════════════════════════════════════════
   MEMORY MATCH
═══════════════════════════════════════════════════════════ */
const { $, sfx } = Kit;
const store = Kit.store('memory', { diff: 'easy', best: {} });
const deckEl = $('#deck'), ov = $('#ov');
Kit.soundToggle($('#sound'));

const DIFFS = { easy: { pairs: 6, cols: 4 }, medium: { pairs: 10, cols: 5 }, hard: { pairs: 15, cols: 6 } };
const SYMBOLS = ['🍓', '🍋', '🍇', '🥝', '🍑', '🍍', '🥥', '🍒', '🌵', '🍄', '🌙', '⭐', '🔥', '💎', '🎈', '🎲', '🚀', '🐙', '🦊', '🐢', '🦋', '🐝'];

let diff, cards, open, moves, matched, streak, bestStreak, timer, startAt, elapsed, lock, over;
const setDiff = Kit.segmented($('#diff'), v => { diff = v; store.set('diff', v); newGame(); });

function newGame() {
  const D = DIFFS[diff];
  const syms = Kit.shuffle(SYMBOLS.slice()).slice(0, D.pairs);
  cards = Kit.shuffle([...syms, ...syms].map((s, i) => ({ s, i, done: false })));
  open = []; moves = 0; matched = 0; streak = 0; bestStreak = 0; elapsed = 0; startAt = 0; lock = false; over = false;
  clearInterval(timer);
  deckEl.style.setProperty('--cols', window.innerWidth < 480 && D.cols > 4 ? D.cols - 1 : D.cols);
  deckEl.innerHTML = '';
  cards.forEach((c, k) => {
    const b = document.createElement('button');
    b.className = 'card deal';
    b.style.animationDelay = `${k * 22}ms`;
    b.addEventListener('animationend', e => { if (e.animationName === 'deal') { b.classList.remove('deal'); b.style.animationDelay = ''; } });
    b.setAttribute('aria-label', 'Hidden card');
    b.innerHTML = `<span class="face back"></span><span class="face front">${c.s}</span>`;
    b.addEventListener('click', () => flip(k));
    deckEl.appendChild(b); c.el = b;
  });
  Kit.overlay(ov, null);
  hud(); bestLine();
}
function flip(k) {
  const c = cards[k];
  if (lock || over || c.done || open.includes(c)) return;
  if (!startAt) { startAt = performance.now(); timer = setInterval(tick, 250); }
  c.el.classList.add('up'); c.el.setAttribute('aria-label', c.s);
  sfx.tone(480 + open.length * 120, { type: 'triangle', dur: .06, vol: .04 });
  open.push(c);
  if (open.length < 2) return;
  moves++;
  const [a, b] = open;
  if (a.s === b.s) {
    a.done = b.done = true; matched++; streak++; bestStreak = Math.max(bestStreak, streak);
    open = [];
    setTimeout(() => {
      a.el.classList.add('done'); b.el.classList.add('done');
      sfx.tone(660 + streak * 60, { type: 'triangle', dur: .1, vol: .05 }); sfx.tone(990 + streak * 60, { type: 'triangle', dur: .16, vol: .04, delay: .07 });
      if (streak >= 2) Kit.pulse($('#streak').parentElement);
      Kit.say(`Match: ${a.s}`);
    }, 250);
    if (matched === cards.length / 2) setTimeout(win, 700);
  } else {
    streak = 0; lock = true;
    setTimeout(() => { a.el.classList.add('miss'); b.el.classList.add('miss'); sfx.error(); }, 350);
    setTimeout(() => {
      for (const c of [a, b]) { c.el.classList.remove('up', 'miss'); c.el.setAttribute('aria-label', 'Hidden card'); }
      open = []; lock = false;
    }, 1000);
  }
  hud();
}
function tick() { elapsed = (performance.now() - startAt) / 1000; $('#time').textContent = Kit.fmtTime(elapsed); }
function hud() {
  $('#moves').textContent = moves;
  $('#pairs').textContent = `${matched}/${cards.length / 2}`;
  $('#streak').textContent = streak;
  if (!startAt) $('#time').textContent = '0:00';
}
function bestLine() {
  const b = store.data.best[diff];
  $('#bestLine').textContent = b ? `Best on ${diff}: ${b.moves} moves · fastest ${Kit.fmtTime(b.time)}` : `No record on ${diff} yet.`;
}
function win() {
  over = true; clearInterval(timer); tick();
  const pairs = cards.length / 2;
  const stars = moves <= pairs * 1.5 ? 3 : moves <= pairs * 2.2 ? 2 : 1;
  const prev = store.data.best[diff] || {};
  const newMoves = !prev.moves || moves < prev.moves, newTime = !prev.time || elapsed < prev.time;
  store.data.best[diff] = { moves: Math.min(moves, prev.moves || Infinity), time: Math.min(elapsed, prev.time || Infinity) };
  store.save();
  sfx.win(); Kit.confetti();
  bestLine();
  Kit.overlay(ov, {
    title: 'All matched', grad: true,
    html: `<div class="stars" aria-label="${stars} of 3 stars">${'★'.repeat(stars)}<span class="off">${'★'.repeat(3 - stars)}</span></div>`,
    stats: [[moves, 'Moves'], [Kit.fmtTime(elapsed), 'Time'], [bestStreak, 'Best streak']],
    note: newMoves && newTime ? 'New best moves and time' : newMoves ? 'New best: fewest moves' : newTime ? 'New best: fastest time' : '',
    actions: [{ label: 'Play again', primary: true, onClick: newGame }],
  });
}
$('#new').onclick = newGame;
addEventListener('resize', () => { if (cards) deckEl.style.setProperty('--cols', window.innerWidth < 480 && DIFFS[diff].cols > 4 ? DIFFS[diff].cols - 1 : DIFFS[diff].cols); });

diff = store.data.diff; setDiff(diff);
newGame();
