// ---------- Audio ----------
let audioCtx = null;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(freq, type = 'square', duration = 0.1, volume = 0.08) {
  try {
    const ctx  = getAudio();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

const Sounds = {
  flip:    () => playSound(300, 'square',   0.06, 0.06),
  match:   () => playSound(550, 'triangle', 0.20, 0.10),
  mismatch:() => playSound(120, 'sawtooth', 0.18, 0.07),
  win:     () => playSound(440, 'triangle', 0.50, 0.12),
};

// ---------- Card data ----------
const EMOJI_POOL = ['⚽','🏆','🎮','👻','🚀','🍕','🎵','💎','🔥','🌙','⭐','🍀','🎲','🦊','🐸','🍩'];

const DIFFICULTIES = {
  easy:   { pairs: 6,  cols: 3 },
  medium: { pairs: 8,  cols: 4 },
  hard:   { pairs: 12, cols: 4 },
};

let currentDiff = 'easy';

const boardEl = document.getElementById('board');
const movesEl = document.getElementById('moves');
const pairsEl = document.getElementById('pairs');
const timeEl  = document.getElementById('time');
const restartBtn = document.getElementById('restart');
const winOverlay = document.getElementById('winOverlay');
const winStats = document.getElementById('winStats');
const playAgainBtn = document.getElementById('playAgain');
const diffButtons = document.querySelectorAll('.diff-btn');

let cards = [];
let flippedCards = [];
let matchedCount = 0;
let totalPairs = 6;
let moves = 0;
let lockBoard = false;
let timerInterval = null;
let seconds = 0;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function startTimer() {
  stopTimer();
  seconds = 0;
  timeEl.textContent = formatTime(seconds);
  timerInterval = setInterval(() => {
    seconds++;
    timeEl.textContent = formatTime(seconds);
  }, 1000);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function createBoard() {
  const { pairs, cols } = DIFFICULTIES[currentDiff];
  totalPairs = pairs;

  boardEl.innerHTML = '';
  boardEl.className = `board cols-${cols}`;
  cards = [];
  flippedCards = [];
  matchedCount = 0;
  moves = 0;
  lockBoard = false;
  movesEl.textContent = '0';
  pairsEl.textContent = `0 / ${totalPairs}`;
  winOverlay.classList.add('hidden');

  const symbols = shuffle([...EMOJI_POOL]).slice(0, pairs);
  const deck = shuffle([...symbols, ...symbols]);

  deck.forEach((symbol, i) => {
    const card = document.createElement('div');
    card.className = 'card placed';
    card.dataset.symbol = symbol;
    card.style.animationDelay = `${i * 0.03}s`;

    const inner = document.createElement('div');
    inner.className = 'card-inner';

    const front = document.createElement('div');
    front.className = 'card-face card-front';

    const back = document.createElement('div');
    back.className = 'card-face card-back';
    back.textContent = symbol;

    inner.appendChild(front);
    inner.appendChild(back);
    card.appendChild(inner);

    card.addEventListener('click', () => handleCardClick(card));

    boardEl.appendChild(card);
    cards.push(card);
  });

  startTimer();
}

function handleCardClick(card) {
  if (lockBoard) return;
  if (card.classList.contains('flipped') || card.classList.contains('matched')) return;

  Sounds.flip();
  card.classList.add('flipped');
  flippedCards.push(card);

  if (flippedCards.length === 2) {
    moves++;
    movesEl.textContent = moves;
    lockBoard = true;

    const [first, second] = flippedCards;

    if (first.dataset.symbol === second.dataset.symbol) {
      handleMatch(first, second);
    } else {
      handleMismatch(first, second);
    }
  }
}

function handleMatch(first, second) {
  Sounds.match();
  matchedCount++;
  pairsEl.textContent = `${matchedCount} / ${totalPairs}`;

  // alternate accent colours between pairs for variety
  const accent = matchedCount % 2 === 0 ? 'x' : '';

  [first, second].forEach(c => {
    c.classList.add('matched');
    if (accent) c.classList.add(accent);
    c.classList.add('winner-cell');
  });

  setTimeout(() => {
    [first, second].forEach(c => c.classList.remove('winner-cell'));
  }, 600);

  flippedCards = [];
  lockBoard = false;

  if (matchedCount === totalPairs) {
    stopTimer();
    Sounds.win();
    setTimeout(showWin, 500);
  }
}

function handleMismatch(first, second) {
  Sounds.mismatch();
  setTimeout(() => {
    first.classList.remove('flipped');
    second.classList.remove('flipped');
    flippedCards = [];
    lockBoard = false;
  }, 800);
}

function showWin() {
  winStats.textContent = `Solved in ${moves} moves — ${formatTime(seconds)}`;
  winOverlay.classList.remove('hidden');
}

restartBtn.addEventListener('click', createBoard);
playAgainBtn.addEventListener('click', createBoard);

diffButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.diff === currentDiff) return;
    diffButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentDiff = btn.dataset.diff;
    createBoard();
  });
});

createBoard();