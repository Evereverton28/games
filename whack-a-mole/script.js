/* ════════════════════════════════════════════════════════
   WHACK-A-MOLE
   - 3x3 grid of holes; moles pop up for a limited time.
   - Purple mole = +points, gold mole = bonus, bomb = penalty.
   - Difficulty ramps: moles appear faster & stay up less as
     the clock runs down.
   ════════════════════════════════════════════════════════ */

/* ─── Safe storage shim ─── */
(function () {
  try { const t="__ls__"; localStorage.setItem(t,"1"); localStorage.removeItem(t); }
  catch (e) {
    let m={}; const safe={getItem:k=>k in m?m[k]:null,setItem:(k,v)=>m[k]=String(v),
      removeItem:k=>delete m[k],clear:()=>m={},key:i=>Object.keys(m)[i]||null,get length(){return Object.keys(m).length;}};
    try { Object.defineProperty(window,"localStorage",{value:safe,configurable:true}); } catch(e2){ window.localStorage=safe; }
  }
})();

const HOLES = 9;
const GAME_SECONDS = 30;

const $ = id => document.getElementById(id);
const grid       = $('grid');
const scoreEl    = $('score-display');
const timeEl     = $('time-display');
const streakEl   = $('streak-display');
const bestEl     = $('best-display');
const overlay    = $('overlay');
const overlayTitle = $('overlay-title');
const overlaySub = $('overlay-sub');
const startBtn   = $('start-btn');
const boardWrap  = document.querySelector('.board-wrap');

let holes = [];       // { el, moleEl, occupied, kind, timer, hideTimer }
let running = false;
let score = 0, streak = 0, timeLeft = GAME_SECONDS;
let best = parseInt(localStorage.getItem('wam_best') || '0');
let spawnTimer = null, clockTimer = null, elapsed = 0;

/* ── Audio ── */
let audioCtx = null;
function tone(freq, type='sine', dur=0.08, vol=0.06, freqEnd) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination); o.type=type;
    o.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, audioCtx.currentTime+dur);
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+dur);
    o.start(); o.stop(audioCtx.currentTime+dur);
  } catch(_){}
}
const Sfx = {
  whack: () => tone(520,'square',0.07,0.07,300),
  gold:  () => { tone(660,'triangle',0.1,0.08,880); setTimeout(()=>tone(990,'triangle',0.12,0.06),80); },
  bomb:  () => { tone(120,'sawtooth',0.25,0.12,60); },
  pop:   () => tone(300,'sine',0.05,0.03,420),
  over:  () => [440,330,220].forEach((f,i)=>setTimeout(()=>tone(f,'triangle',0.3,0.08),i*120)),
};

/* ── Build board ── */
function buildBoard() {
  grid.innerHTML = '';
  holes = [];
  for (let i = 0; i < HOLES; i++) {
    const hole = document.createElement('div');
    hole.className = 'hole';
    const mole = document.createElement('div');
    mole.className = 'mole';
    hole.appendChild(mole);
    grid.appendChild(hole);
    const rec = { el: hole, moleEl: mole, occupied: false, kind: null, hideTimer: null };
    hole.addEventListener('click', () => whack(rec));
    holes.push(rec);
  }
}

/* ── Spawn logic ── */
function difficulty() {
  // 0 at start → 1 at end
  return Math.min(1, elapsed / GAME_SECONDS);
}
function nextSpawnDelay() {
  const d = difficulty();
  // 700ms → 320ms between spawns
  return 700 - d*380 + Math.random()*180;
}
function moleUpDuration() {
  const d = difficulty();
  // 1100ms → 620ms up-time
  return 1100 - d*480;
}

function pickKind() {
  const d = difficulty();
  const r = Math.random();
  const bombChance = 0.14 + d*0.16;   // more bombs later
  const goldChance = 0.08;
  if (r < bombChance) return 'bomb';
  if (r < bombChance + goldChance) return 'gold';
  return 'good';
}

function popMole() {
  if (!running) return;
  // choose a free hole
  const free = holes.filter(h => !h.occupied);
  if (free.length) {
    const rec = free[Math.floor(Math.random()*free.length)];
    const kind = pickKind();
    rec.occupied = true; rec.kind = kind;
    rec.moleEl.className = 'mole up mole-' + kind;
    rec.moleEl.textContent = kind==='bomb' ? '💣' : kind==='gold' ? '⭐' : '🐹';
    Sfx.pop();
    rec.hideTimer = setTimeout(() => hideMole(rec, true), moleUpDuration());
  }
  spawnTimer = setTimeout(popMole, nextSpawnDelay());
}

function hideMole(rec, missed) {
  if (!rec.occupied) return;
  clearTimeout(rec.hideTimer);
  rec.moleEl.classList.remove('up');
  const wasGood = rec.kind === 'good' || rec.kind === 'gold';
  rec.occupied = false; rec.kind = null;
  // missing a good mole breaks the streak (bombs are fine to miss)
  if (missed && wasGood) { streak = 0; streakEl.textContent = streak; }
}

/* ── Whack ── */
function whack(rec) {
  if (!running || !rec.occupied) return;
  const kind = rec.kind;
  rec.moleEl.classList.add('whacked');
  const rect = rec.el.getBoundingClientRect();

  if (kind === 'bomb') {
    score = Math.max(0, score - 5);
    streak = 0;
    Sfx.bomb();
    popup(rec, '-5', 'var(--danger)');
    boardWrap.classList.remove('shake'); void boardWrap.offsetWidth; boardWrap.classList.add('shake');
  } else {
    streak++;
    const base = kind === 'gold' ? 5 : 1;
    const bonus = Math.floor(streak / 5); // small streak bonus
    const gained = base + bonus;
    score += gained;
    if (kind === 'gold') Sfx.gold(); else Sfx.whack();
    popup(rec, '+' + gained, kind==='gold' ? '#fde047' : '#a78bfa');
    streakEl.textContent = streak;
    bump(streakEl);
  }
  scoreEl.textContent = score;
  bump(scoreEl);
  hideMole(rec, false);
  setTimeout(() => rec.moleEl.classList.remove('whacked'), 180);
}

function popup(rec, text, color) {
  const p = document.createElement('div');
  p.className = 'popup';
  p.textContent = text;
  p.style.color = color;
  p.style.left = '50%';
  p.style.top = '30%';
  p.style.transform = 'translateX(-50%)';
  rec.el.appendChild(p);
  setTimeout(() => p.remove(), 700);
}

function bump(el){ el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

/* ── Clock ── */
function tick() {
  timeLeft--; elapsed++;
  timeEl.textContent = timeLeft;
  timeEl.classList.toggle('low', timeLeft <= 5);
  if (timeLeft <= 0) endGame();
}

/* ── Flow ── */
function startGame() {
  score = 0; streak = 0; timeLeft = GAME_SECONDS; elapsed = 0;
  running = true;
  scoreEl.textContent = 0; streakEl.textContent = 0;
  timeEl.textContent = timeLeft; timeEl.classList.remove('low');
  bestEl.textContent = best;
  overlay.classList.add('hidden');
  // reset any lingering moles
  holes.forEach(h => { clearTimeout(h.hideTimer); h.occupied=false; h.kind=null; h.moleEl.className='mole'; });
  clearTimeout(spawnTimer); clearInterval(clockTimer);
  spawnTimer = setTimeout(popMole, 500);
  clockTimer = setInterval(tick, 1000);
}

function endGame() {
  running = false;
  clearTimeout(spawnTimer); clearInterval(clockTimer);
  holes.forEach(h => { clearTimeout(h.hideTimer); h.moleEl.classList.remove('up'); h.occupied=false; });
  Sfx.over();
  if (score > best) { best = score; localStorage.setItem('wam_best', String(best)); }
  bestEl.textContent = best;
  overlayTitle.textContent = 'TIME!';
  overlaySub.innerHTML = `You scored <strong style="color:var(--x-color)">${score}</strong>` +
    (score >= best && score > 0 ? ' — new best! 🏆' : `<br>Best: ${best}`);
  startBtn.textContent = 'PLAY AGAIN';
  overlay.classList.remove('hidden');
}

startBtn.addEventListener('click', () => { try{ if(!audioCtx) audioCtx=new(window.AudioContext||window.webkitAudioContext)(); }catch(_){} startGame(); });

/* ── Boot ── */
buildBoard();
bestEl.textContent = best;
