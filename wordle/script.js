/* ═══════════════════════════════════════════════════════════
   WORDLE — daily + unlimited, hard mode, stats, share
═══════════════════════════════════════════════════════════ */
const { $, sfx } = Kit;
const store = Kit.store('wordle', { mode: 'daily', hard: false, contrast: false, days: {}, stats: { daily: null, free: null }, free: null });
const gridEl = $('#grid'), ov = $('#ov');
Kit.soundToggle($('#sound'));
const EPOCH = new Date(2024, 0, 1);
const dayNumber = () => Math.floor((new Date().setHours(0, 0, 0, 0) - EPOCH) / 864e5);
// Shuffle the answer list once with a fixed seed so consecutive days aren't alphabetical
const DAILY = Kit.shuffle(ANSWERS.slice(), Kit.rng(20240101));

let mode, G, busy = false;
const setMode = Kit.segmented($('#mode'), v => { mode = v; store.set('mode', v); load(); });
document.body.classList.toggle('contrast', store.data.contrast);

/* ── Grid & keyboard ── */
const tiles = [];
for (let r = 0; r < 6; r++) {
  const row = document.createElement('div'); row.className = 'rowg';
  for (let c = 0; c < 5; c++) { const t = document.createElement('div'); t.className = 'tile'; row.appendChild(t); tiles.push(t); }
  gridEl.appendChild(row);
}
const KB = ['qwertyuiop', 'asdfghjkl', '+zxcvbnm-'];
const keyEls = {};
KB.forEach(line => {
  const r = document.createElement('div'); r.className = 'r';
  for (const ch of line) {
    const b = document.createElement('button');
    if (ch === '+') { b.textContent = 'Enter'; b.className = 'wide'; b.dataset.k = 'Enter'; }
    else if (ch === '-') { b.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><path d="M21 5H9l-7 7 7 7h12z"/><path d="M18 9l-6 6M12 9l6 6"/></svg>'; b.className = 'wide'; b.dataset.k = 'Backspace'; b.setAttribute('aria-label', 'Delete'); }
    else { b.textContent = ch; b.dataset.k = ch; keyEls[ch] = b; }
    b.addEventListener('click', () => key(b.dataset.k));
    r.appendChild(b);
  }
  $('#kb').appendChild(r);
});

/* ── Scoring with correct duplicate handling ── */
function score(guess, answer) {
  const res = Array(5).fill('miss'), left = {};
  for (let i = 0; i < 5; i++) { if (guess[i] === answer[i]) res[i] = 'hit'; else left[answer[i]] = (left[answer[i]] || 0) + 1; }
  for (let i = 0; i < 5; i++) if (res[i] !== 'hit' && left[guess[i]]) { res[i] = 'near'; left[guess[i]]--; }
  return res;
}
function hardModeProblem(guess) {
  for (const g of G.guesses) {
    const res = score(g, G.answer);
    for (let i = 0; i < 5; i++) if (res[i] === 'hit' && guess[i] !== g[i]) return `Letter ${i + 1} must be ${g[i].toUpperCase()}`;
    const need = {};
    for (let i = 0; i < 5; i++) if (res[i] !== 'miss') need[g[i]] = (need[g[i]] || 0) + 1;
    for (const ch in need) if ([...guess].filter(x => x === ch).length < need[ch]) return `Guess must contain ${ch.toUpperCase()}`;
  }
  return null;
}

/* ── State ── */
function load() {
  Kit.overlay(ov, null);
  if (mode === 'daily') {
    const d = dayNumber();
    const saved = store.data.days[d];
    G = saved ? { ...saved, day: d } : { day: d, answer: DAILY[((d % DAILY.length) + DAILY.length) % DAILY.length], guesses: [], done: false, won: false };
  } else {
    G = store.data.free && !store.data.free.done ? { ...store.data.free } : { answer: Kit.pick(ANSWERS), guesses: [], done: false, won: false };
  }
  G.cur = '';
  paintAll();
  if (G.done) setTimeout(() => showStats(true), 300);
}
function save() {
  const { cur, ...rest } = G;
  if (mode === 'daily') { store.data.days[G.day] = rest; const keys = Object.keys(store.data.days).map(Number).sort((a, b) => b - a); keys.slice(14).forEach(k => delete store.data.days[k]); store.save(); }
  else store.set('free', rest);
}
function paintAll() {
  tiles.forEach(t => { t.className = 'tile'; t.textContent = ''; t.style.removeProperty('--c'); });
  Object.values(keyEls).forEach(k => k.className = '');
  G.guesses.forEach((g, r) => { const res = score(g, G.answer); for (let c = 0; c < 5; c++) { const t = tiles[r * 5 + c]; t.textContent = g[c]; t.classList.add('done'); t.style.setProperty('--c', `var(--${res[c]})`); } paintKeys(g, res); });
  paintCur();
}
function paintCur() {
  const r = G.guesses.length;
  if (r >= 6) return;
  for (let c = 0; c < 5; c++) { const t = tiles[r * 5 + c]; t.textContent = G.cur[c] || ''; t.classList.toggle('filled', !!G.cur[c]); }
}
function paintKeys(g, res) {
  const rank = { miss: 0, near: 1, hit: 2 };
  for (let i = 0; i < 5; i++) {
    const k = keyEls[g[i]]; const cur = k.className;
    if (!cur || rank[res[i]] > rank[cur]) k.className = res[i];
  }
}

/* ── Input ── */
function key(k) {
  if (busy || G.done || !ov.hidden) return;
  if (k === 'Enter') return submit();
  if (k === 'Backspace') { if (G.cur.length) { G.cur = G.cur.slice(0, -1); paintCur(); } return; }
  if (/^[a-z]$/.test(k) && G.cur.length < 5) { G.cur += k; paintCur(); sfx.tone(500 + G.cur.length * 30, { type: 'triangle', dur: .03, vol: .025 }); }
}
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Enter' || e.key === 'Backspace') { e.preventDefault(); key(e.key); }
  else if (/^[a-zA-Z]$/.test(e.key)) key(e.key.toLowerCase());
});
function reject(msg) {
  const row = gridEl.children[G.guesses.length];
  Kit.pulse(row, 'shake'); Kit.toast(msg, 1400); sfx.error();
}
function submit() {
  const g = G.cur;
  if (g.length < 5) return reject('Not enough letters');
  if (!VALID.has(g)) return reject('Not in word list');
  if (store.data.hard) { const p = hardModeProblem(g); if (p) return reject(p); }
  const res = score(g, G.answer);
  const r = G.guesses.length;
  G.guesses.push(g); G.cur = '';
  busy = true;
  for (let c = 0; c < 5; c++) {
    const t = tiles[r * 5 + c];
    t.style.setProperty('--c', `var(--${res[c]})`);
    t.style.animationDelay = `${c * 260}ms`;
    t.classList.remove('filled'); t.classList.add('flip');
    setTimeout(() => sfx.tone(res[c] === 'hit' ? 660 : res[c] === 'near' ? 520 : 300, { type: 'triangle', dur: .08, vol: .04 }), c * 260 + 250);
  }
  setTimeout(() => {
    for (let c = 0; c < 5; c++) { const t = tiles[r * 5 + c]; t.classList.remove('flip'); t.classList.add('done'); t.style.animationDelay = ''; }
    paintKeys(g, res);
    busy = false;
    const won = g === G.answer;
    if (won || G.guesses.length === 6) finish(won);
    save();
  }, 5 * 260 + 260);
}
function finish(won) {
  G.done = true; G.won = won;
  const s = stats();
  s.played++;
  if (won) { s.wins++; s.streak++; s.maxStreak = Math.max(s.maxStreak, s.streak); s.dist[G.guesses.length - 1]++; }
  else s.streak = 0;
  if (mode === 'daily') s.lastDay = G.day;
  store.save();
  const r = G.guesses.length - 1;
  if (won) {
    for (let c = 0; c < 5; c++) setTimeout(() => Kit.pulse(tiles[r * 5 + c], 'bounce'), c * 90);
    sfx.win();
    setTimeout(() => Kit.confetti(), 400);
    Kit.toast(['Genius', 'Magnificent', 'Impressive', 'Splendid', 'Great', 'Phew'][r], 1600);
  } else { sfx.lose(); Kit.toast(G.answer.toUpperCase(), 3000); }
  setTimeout(() => showStats(true), 1700);
}
function stats() {
  const key = mode === 'daily' ? 'daily' : 'free';
  if (!store.data.stats[key]) store.data.stats[key] = { played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0], lastDay: null };
  const s = store.data.stats[key];
  // a missed day breaks the daily streak
  if (key === 'daily' && s.lastDay != null && dayNumber() - s.lastDay > 1 && s.streak) { s.streak = 0; store.save(); }
  return s;
}
function shareText() {
  const rows = G.guesses.map(g => score(g, G.answer).map(r => r === 'hit' ? (store.data.contrast ? '🟧' : '🟩') : r === 'near' ? (store.data.contrast ? '🟦' : '🟨') : '⬛').join(''));
  return `Wordle${mode === 'daily' ? ' #' + G.day : ''} ${G.won ? G.guesses.length : 'X'}/6${store.data.hard ? '*' : ''}\n\n${rows.join('\n')}`;
}
function showStats(end) {
  const s = stats();
  const max = Math.max(1, ...s.dist);
  const hl = end && G.done && G.won ? G.guesses.length - 1 : -1;
  const dist = `<div class="dist">${s.dist.map((n, i) => `<div><b>${i + 1}</b><span class="${i === hl ? 'me' : ''}" style="width:${8 + n / max * 82}%">${n}</span></div>`).join('')}</div>`;
  const actions = [];
  if (end && G.done) {
    actions.push({ label: 'Share', onClick: () => { const t = shareText(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => Kit.toast('Copied results to clipboard'), () => Kit.toast('Could not copy')); } });
    actions.push(mode === 'free' ? { label: 'Next word', primary: true, onClick: () => { store.set('free', null); load(); } } : { label: 'Play unlimited', primary: true, onClick: () => setMode('free') || (mode = 'free', store.set('mode', 'free'), load()) });
  } else actions.push({ label: 'Close', primary: true, onClick: () => Kit.overlay(ov, null) });
  Kit.overlay(ov, {
    title: end && G.done ? (G.won ? 'Solved' : 'Out of guesses') : mode === 'daily' ? 'Daily statistics' : 'Unlimited statistics', grad: end && G.won,
    html: (end && G.done && !G.won ? `<div class="answer">${G.answer}</div>` : '') + '',
    stats: [[s.played, 'Played'], [s.played ? Math.round(s.wins / s.played * 100) : 0, 'Win %'], [s.streak, 'Streak'], [s.maxStreak, 'Max']],
    text: mode === 'daily' && end && G.done ? 'A new daily word arrives at midnight.' : '',
    actions,
    bind: el => { el.querySelector('.stats').insertAdjacentHTML('afterend', dist); },
  });
}
$('#statsBtn').onclick = () => showStats(false);
$('#setBtn').onclick = () => {
  const sw = (id, on) => `<button class="switch" role="switch" id="${id}" aria-checked="${on}"></button>`;
  Kit.overlay(ov, {
    title: 'Settings',
    html: `<div class="opt"><div>Hard mode<small>Revealed hints must be used in later guesses.${G.guesses.length && !G.done ? ' Change it before your first guess.' : ''}</small></div>${sw('hardSw', store.data.hard)}</div>
      <div class="opt" style="margin-bottom:16px"><div>High contrast<small>Orange and blue instead of green and yellow.</small></div>${sw('conSw', store.data.contrast)}</div>`,
    actions: [{ label: 'Done', primary: true, onClick: () => Kit.overlay(ov, null) }],
    bind: el => {
      el.querySelector('#hardSw').onclick = e => {
        if (G.guesses.length && !G.done) { Kit.toast('Hard mode can only change at the start of a round'); return; }
        store.set('hard', !store.data.hard); e.currentTarget.setAttribute('aria-checked', store.data.hard);
      };
      el.querySelector('#conSw').onclick = e => {
        store.set('contrast', !store.data.contrast); e.currentTarget.setAttribute('aria-checked', store.data.contrast);
        document.body.classList.toggle('contrast', store.data.contrast);
      };
    },
  });
};

mode = store.data.mode; setMode(mode);
load();
