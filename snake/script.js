const canvas  = document.getElementById('gc');
const ctx     = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const msg     = document.getElementById('msg');
const sub     = document.getElementById('sub');
const startBtn= document.getElementById('startBtn');
const scoreEl = document.getElementById('scoreEl');
const highEl  = document.getElementById('highEl');
const pauseHint = document.getElementById('pauseHint');

const CELL  = 22;
const SPEED = 130;

let cols, rows;
let snake, dir, nextDir, food, score, hi = 0;
let state    = 'idle';
let lastTime = 0;
let raf;

let foodPulse = 0;

// ─── Grid helpers ─────────────────────────────────────

function resize() {
  const wrap = canvas.parentElement;
  const w = wrap.clientWidth  - 24 || 400;
  const h = wrap.clientHeight - 12 || 400;
  cols = Math.floor(w / CELL);
  rows = Math.floor(h / CELL);
  canvas.width  = cols * CELL;
  canvas.height = rows * CELL;
}

function rndCell() {
  return {
    x: Math.floor(Math.random() * cols),
    y: Math.floor(Math.random() * rows),
  };
}

function spawnFood() {
  if (!snake || snake.length === 0) { food = rndCell(); return; }

  const occupied = new Set(snake.map(s => s.x + ',' + s.y));

  for (let i = 0; i < 200; i++) {
    const pos = rndCell();
    if (!occupied.has(pos.x + ',' + pos.y)) {
      food = pos;
      return;
    }
  }

  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      if (!occupied.has(x + ',' + y)) {
        food = { x, y };
        return;
      }
    }
  }

  food = null;
}

// ─── Init ─────────────────────────────────────────────

function initGame() {
  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);
  snake   = [
    { x: cx,     y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy },
  ];
  dir     = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };
  score   = 0;
  foodPulse = 0;
  scoreEl.textContent = score;
  spawnFood();
}

// ─── Update ───────────────────────────────────────────

function tick() {
  dir = { x: nextDir.x, y: nextDir.y };
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  if (head.x < 0 || head.x >= cols || head.y < 0 || head.y >= rows) {
    return endGame();
  }
  if (snake.some(s => s.x === head.x && s.y === head.y)) {
    return endGame();
  }

  snake.unshift(head);

  if (food && head.x === food.x && head.y === food.y) {
    score++;
    if (score > hi) hi = score;
    scoreEl.textContent = score;
    highEl.textContent  = hi;
    spawnFood();
  } else {
    snake.pop();
  }
}

// ─── Draw ─────────────────────────────────────────────

function drawGrid() {
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth   = 0.4;
  for (let x = 0; x <= cols; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= rows; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(canvas.width, y * CELL);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255, 81, 47, 0.55)';
  ctx.lineWidth   = 1.5;
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
}

function drawSnake() {
  ctx.shadowBlur = 0;

  snake.forEach((seg, i) => {
    const t   = i / Math.max(snake.length - 1, 1);
    const pad = i === 0 ? 1 : 2;
    const x   = seg.x * CELL + pad;
    const y   = seg.y * CELL + pad;
    const sz  = CELL - pad * 2;

    const r = Math.round(255 - t * 34);
    const g = Math.round(81  - t * 45);
    const b = Math.round(47  + t * 71);
    const a = 1 - t * 0.4;

    ctx.beginPath();
    ctx.roundRect(x, y, sz, sz, i === 0 ? 7 : 4);

    if (i === 0) {
      ctx.shadowColor = 'rgba(255,81,47,0.9)';
      ctx.shadowBlur  = 12;
      ctx.fillStyle   = '#ff512f';
    } else {
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = `rgba(${r},${g},${b},${a})`;
    }

    ctx.fill();
    ctx.shadowBlur = 0;
  });

  if (snake.length > 0) {
    const seg = snake[0];
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 0;

    const ex1 = seg.x * CELL + CELL / 2 - dir.y * 4 + dir.x * 3;
    const ey1 = seg.y * CELL + CELL / 2 - dir.x * 4 + dir.y * 3;
    const ex2 = seg.x * CELL + CELL / 2 + dir.y * 4 + dir.x * 3;
    const ey2 = seg.y * CELL + CELL / 2 + dir.x * 4 + dir.y * 3;

    ctx.beginPath(); ctx.arc(ex1, ey1, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex2, ey2, 2, 0, Math.PI * 2); ctx.fill();
  }
}

function drawFood() {
  if (!food) return;

  const cx = food.x * CELL + CELL / 2;
  const cy = food.y * CELL + CELL / 2;
  const baseR = CELL / 2 - 4;

  foodPulse += 0.07;
  const r = baseR + Math.sin(foodPulse) * 1.5;

  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,81,47,0.18)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,81,47,0.3)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(r, 2), 0, Math.PI * 2);
  ctx.fillStyle   = '#ff512f';
  ctx.shadowColor = '#ff512f';
  ctx.shadowBlur  = 14;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(cx - 2, cy - 2, Math.max(r * 0.35, 1), 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,200,160,0.75)';
  ctx.fill();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.shadowBlur = 0;

  drawGrid();
  drawFood();
  drawSnake();

  if (state === 'paused') {
    ctx.shadowBlur = 0;
    ctx.fillStyle  = 'rgba(0,4,40,0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.shadowColor = '#ff512f';
    ctx.shadowBlur  = 14;
    ctx.fillStyle   = '#fff';
    ctx.font        = 'bold 22px Arial';
    ctx.textAlign   = 'center';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
    ctx.shadowBlur  = 0;
    ctx.textAlign   = 'left';
  }
}

// ─── Game loop ────────────────────────────────────────

function loop(ts) {
  if (state === 'playing') {
    if (ts - lastTime > SPEED) {
      tick();
      lastTime = ts;
    }
    draw();
  } else if (state === 'paused') {
    draw();
  } else if (state === 'idle') {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
  }
  raf = requestAnimationFrame(loop);
}

// ─── State helpers ────────────────────────────────────

function endGame() {
  state = 'over';

  ctx.fillStyle = 'rgba(255,0,60,0.22)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  setTimeout(() => {
    msg.textContent      = 'GAME OVER';
    sub.textContent      = 'Score: ' + score + '  ·  Best: ' + hi;
    startBtn.textContent = 'Play Again ▶';
    overlay.classList.remove('hidden');
    pauseHint.textContent = '';
  }, 250);
}

function startGame() {
  resize();
  initGame();
  overlay.classList.add('hidden');
  pauseHint.textContent = 'P to pause · Arrow keys / WASD to move';
  state    = 'playing';
  lastTime = 0;
  if (!raf) requestAnimationFrame(loop);
}

// ─── Input ────────────────────────────────────────────

const DIR_MAP = {
  ArrowUp:    { x: 0,  y: -1 },
  ArrowDown:  { x: 0,  y:  1 },
  ArrowLeft:  { x: -1, y:  0 },
  ArrowRight: { x:  1, y:  0 },
  w: { x: 0, y: -1 }, W: { x: 0, y: -1 },
  s: { x: 0, y:  1 }, S: { x: 0, y:  1 },
  a: { x: -1, y: 0 }, A: { x: -1, y: 0 },
  d: { x:  1, y: 0 }, D: { x:  1, y: 0 },
};

window.addEventListener('keydown', (e) => {
  if ((e.key === 'p' || e.key === 'P') && (state === 'playing' || state === 'paused')) {
    state = state === 'paused' ? 'playing' : 'paused';
    pauseHint.textContent = state === 'paused'
      ? 'Paused — press P to resume'
      : 'P to pause · Arrow keys / WASD to move';
    return;
  }
  const d = DIR_MAP[e.key];
  if (d) {
    if (!(d.x === -dir.x && d.y === -dir.y)) nextDir = d;
    e.preventDefault();
  }
});

let touchStartX = 0, touchStartY = 0;
canvas.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

canvas.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    const d = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
    if (!(d.x === -dir.x)) nextDir = d;
  } else {
    const d = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
    if (!(d.y === -dir.y)) nextDir = d;
  }
}, { passive: true });

window.addEventListener('resize', () => {
  resize();
  if (state === 'playing' || state === 'paused') initGame();
});

// ─── Boot ─────────────────────────────────────────────
resize();
requestAnimationFrame(loop);