const canvas    = document.getElementById('gc');
const ctx       = canvas.getContext('2d');
const overlay   = document.getElementById('overlay');
const msg       = document.getElementById('msg');
const sub       = document.getElementById('sub');
const startBtn  = document.getElementById('startBtn');
const scoreEl   = document.getElementById('scoreEl');
const highEl    = document.getElementById('highEl');
const pauseHint = document.getElementById('pauseHint');

const CELL  = 22;
const SPEED = 130;

let cols, rows, snake, dir, nextDir, food, score, hi = 0;
let state = 'idle', lastTime = 0, raf, foodPulse = 0;

// ─── Food types ───────────────────────────────────────
// Each type: { color, glowColor, highlightColor, points, weight, label }
const FOOD_TYPES = [
  { color: '#f97316', glowColor: 'rgba(249,115,22,', highlightColor: 'rgba(255,200,160,0.75)', points: 1, weight: 70, label: '+1' },
  { color: '#a855f7', glowColor: 'rgba(168,85,247,',  highlightColor: 'rgba(220,180,255,0.75)', points: 2, weight: 22, label: '+2' },
  { color: '#38bdf8', glowColor: 'rgba(56,189,248,',  highlightColor: 'rgba(200,240,255,0.75)', points: 3, weight:  8, label: '+3' },
];

function pickFoodType() {
  const total = FOOD_TYPES.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of FOOD_TYPES) { r -= t.weight; if (r <= 0) return t; }
  return FOOD_TYPES[0];
}

// ─── Score pops ───────────────────────────────────────
// Each pop: { x, y, label, color, life (1→0) }
let scorePops = [];

function spawnScorePop(x, y, label, color) {
  scorePops.push({ x, y, label, color, life: 1 });
}

function drawScorePops() {
  scorePops.forEach(p => { p.y -= 1.1; p.life -= 0.028; });
  scorePops = scorePops.filter(p => p.life > 0);
  scorePops.forEach(p => {
    const alpha = Math.min(1, p.life * 2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = p.color;
    ctx.font        = 'bold 13px "Bebas Neue", sans-serif';
    ctx.textAlign   = 'center';
    ctx.fillText(p.label, p.x, p.y);
    ctx.textAlign   = 'left';
    ctx.globalAlpha = 1;
  });
}

// ─── Snake trail ──────────────────────────────────────
// Stores recent head positions for a motion trail
let trail = [];
const TRAIL_MAX = 12;

function updateTrail() {
  if (!snake || !snake.length) return;
  trail.push({ x: snake[0].x * CELL + CELL / 2, y: snake[0].y * CELL + CELL / 2 });
  if (trail.length > TRAIL_MAX) trail.shift();
}

function drawTrail() {
  trail.forEach((point, i) => {
    const progress = i / trail.length;
    const alpha = Math.floor(progress * 0.22 * 255).toString(16).padStart(2, '0');
    const r = Math.round(CELL / 2 * progress * 0.7);
    if (r < 1) return;
    ctx.beginPath();
    ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#f97316' + alpha;
    ctx.fill();
  });
}

// ─── Death animation ──────────────────────────────────
// deathAnim: null when inactive, else { progress 0→1, snapshotSnake }
let deathAnim = null;
const DEATH_DURATION = 900; // ms

// ─── Particles ────────────────────────────────────────

let particles = [];

function spawnParticles(x, y, col, n = 10) {
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 3;
    particles.push({
      x, y,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed - 1,
      life: 1,
      col,
      r: 2 + Math.random() * 2.5,
    });
  }
}

function drawParticles() {
  particles.forEach(p => { p.x += p.dx; p.y += p.dy; p.dy += 0.1; p.life -= 0.045; });
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    const alpha = Math.floor(p.life * 200).toString(16).padStart(2, '00');
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fillStyle = p.col + alpha;
    ctx.fill();
  });
}

// ─── Screen shake ─────────────────────────────────────

let shake = { x: 0, y: 0, t: 0 };

function triggerShake(mag) {
  shake.x = (Math.random() - 0.5) * mag * 2;
  shake.y = (Math.random() - 0.5) * mag * 2;
  shake.t = 8;
}

// ─── Web Audio ────────────────────────────────────────

let audioCtx = null;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(freq, type = 'square', duration = 0.1, volume = 0.07) {
  try {
    const ac   = getAudio();
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    gain.gain.setValueAtTime(volume, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.start(ac.currentTime); osc.stop(ac.currentTime + duration);
  } catch (e) {}
}

const Sounds = {
  eat:   () => playSound(330, 'triangle', 0.20, 0.09),
  eatBig:() => playSound(440, 'triangle', 0.25, 0.10),
  die:   () => playSound(110, 'sawtooth', 0.35, 0.09),
};

// ─── Grid helpers ─────────────────────────────────────

function resize() {
  const wrap = canvas.parentElement;
  const w = wrap.clientWidth  - 24;
  const h = wrap.clientHeight - 8;
  cols = Math.max(4, Math.floor(w / CELL));
  rows = Math.max(4, Math.floor(h / CELL));
  canvas.width  = cols * CELL;
  canvas.height = rows * CELL;
}

function rndCell() {
  return { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
}

function spawnFood() {
  if (!snake || !snake.length) { food = { ...rndCell(), type: pickFoodType() }; return; }
  const occ = new Set(snake.map(s => s.x + ',' + s.y));
  for (let i = 0; i < 200; i++) {
    const p = rndCell();
    if (!occ.has(p.x + ',' + p.y)) { food = { ...p, type: pickFoodType() }; return; }
  }
  for (let x = 0; x < cols; x++)
    for (let y = 0; y < rows; y++)
      if (!occ.has(x + ',' + y)) { food = { x, y, type: pickFoodType() }; return; }
  food = null;
}

// ─── Init ─────────────────────────────────────────────

function initGame() {
  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);
  snake      = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
  dir        = { x: 1, y: 0 };
  nextDir    = { x: 1, y: 0 };
  score      = 0;
  foodPulse  = 0;
  particles  = [];
  scorePops  = [];
  trail      = [];
  deathAnim  = null;
  shake      = { x: 0, y: 0, t: 0 };
  scoreEl.textContent = 0;
  spawnFood();
}

// ─── Update ───────────────────────────────────────────

function tick() {
  dir = { ...nextDir };
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  if (head.x < 0 || head.x >= cols || head.y < 0 || head.y >= rows) return endGame();
  if (snake.some(s => s.x === head.x && s.y === head.y))            return endGame();

  snake.unshift(head);

  if (food && head.x === food.x && head.y === food.y) {
    const ft = food.type;
    score += ft.points;
    if (score > hi) hi = score;
    scoreEl.textContent = score;
    highEl.textContent  = hi;
    ft.points > 1 ? Sounds.eatBig() : Sounds.eat();
    spawnParticles(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, ft.color, ft.points === 3 ? 16 : 10);
    spawnScorePop(food.x * CELL + CELL / 2, food.y * CELL, ft.label, ft.color);
    spawnFood();
  } else {
    snake.pop();
  }
}

// ─── Draw ─────────────────────────────────────────────

function drawGrid() {
  ctx.strokeStyle = 'rgba(255,255,255,0.022)';
  ctx.lineWidth   = 0.4;
  for (let x = 0; x <= cols; x++) {
    ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= rows; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(canvas.width, y * CELL); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(56,189,248,0.18)';
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

    ctx.beginPath();
    ctx.roundRect(x, y, sz, sz, i === 0 ? 7 : 4);

    if (i === 0) {
      ctx.fillStyle = '#f97316';
    } else {
      const r = Math.round(249 - t * 200);
      const g = Math.round(115 + t * 74);
      const b = Math.round(22  + t * 198);
      const a = 1 - t * 0.38;
      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
    }
    ctx.fill();
  });

  if (snake.length > 0) {
    const seg = snake[0];
    ctx.fillStyle  = '#fff';
    ctx.shadowBlur = 0;
    const ex1 = seg.x * CELL + CELL / 2 - dir.y * 4 + dir.x * 3;
    const ey1 = seg.y * CELL + CELL / 2 - dir.x * 4 + dir.y * 3;
    const ex2 = seg.x * CELL + CELL / 2 + dir.y * 4 + dir.x * 3;
    const ey2 = seg.y * CELL + CELL / 2 + dir.x * 4 + dir.y * 3;
    ctx.beginPath(); ctx.arc(ex1, ey1, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex2, ey2, 2, 0, Math.PI * 2); ctx.fill();
  }
}

// Death animation — draws the frozen snake fading red then shrinking out
function drawDeathSnake(progress) {
  if (!deathAnim) return;
  const flash = progress < 0.35;
  // 0–35%: flash red; 35–100%: shrink + fade
  const fadeT = Math.max(0, (progress - 0.35) / 0.65);
  const scale = 1 - fadeT * 0.85;
  const alpha = 1 - fadeT;

  deathAnim.snapshot.forEach((seg, i) => {
    const pad = i === 0 ? 1 : 2;
    const cx  = seg.x * CELL + CELL / 2;
    const cy  = seg.y * CELL + CELL / 2;
    const half = (CELL - pad * 2) / 2 * scale;
    if (half < 0.5) return;

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.roundRect(cx - half, cy - half, half * 2, half * 2, Math.max(1, (i === 0 ? 7 : 4) * scale));

    if (flash) {
      // pulse between red shades
      const pulse = Math.sin(progress * Math.PI * 14) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(${Math.round(220 + pulse * 35)},${Math.round(20 + pulse * 20)},${Math.round(20 + pulse * 20)},1)`;
    } else {
      ctx.fillStyle = `rgba(220,40,40,1)`;
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function drawFood() {
  if (!food) return;
  const ft = food.type;
  const cx = food.x * CELL + CELL / 2;
  const cy = food.y * CELL + CELL / 2;
  foodPulse += 0.07;
  const r = CELL / 2 - 4 + Math.sin(foodPulse) * 1.5;

  ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
  ctx.fillStyle = ft.glowColor + '0.12)'; ctx.fill();

  ctx.beginPath(); ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2);
  ctx.fillStyle = ft.glowColor + '0.25)'; ctx.fill();

  ctx.beginPath(); ctx.arc(cx, cy, Math.max(r, 2), 0, Math.PI * 2);
  ctx.fillStyle = ft.color; ctx.fill();

  ctx.beginPath(); ctx.arc(cx - 2, cy - 2, Math.max(r * 0.35, 1), 0, Math.PI * 2);
  ctx.fillStyle = ft.highlightColor; ctx.fill();

  // points badge for 2pt and 3pt food
  if (ft.points > 1) {
    ctx.fillStyle   = ft.color;
    ctx.font        = `bold ${ft.points === 3 ? 9 : 8}px "Bebas Neue", sans-serif`;
    ctx.textAlign   = 'center';
    ctx.fillText(ft.label, cx, cy + r + 10);
    ctx.textAlign   = 'left';
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.shadowBlur = 0;

  const shaking = shake.t > 0;
  if (shaking) {
    ctx.save();
    ctx.translate(shake.x, shake.y);
    shake.t--;
    shake.x *= 0.7;
    shake.y *= 0.7;
  }

  drawGrid();
  drawFood();

  if (deathAnim) {
    drawDeathSnake(deathAnim.progress);
  } else {
    drawTrail();
    drawSnake();
  }

  drawParticles();
  drawScorePops();

  if (shaking) ctx.restore();

  if (state === 'paused') {
    ctx.fillStyle = 'rgba(10,10,15,0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e2e8f0';
    ctx.font      = 'bold 20px "Bebas Neue", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
    ctx.textAlign = 'left';
  }
}

// ─── Game loop ────────────────────────────────────────

function loop(ts) {
  if (state === 'playing') {
    if (ts - lastTime > SPEED) { updateTrail(); tick(); lastTime = ts; }
    draw();
  } else if (state === 'dying') {
    // advance death animation
    const elapsed = ts - deathAnim.startTs;
    deathAnim.progress = Math.min(1, elapsed / DEATH_DURATION);
    draw();
    if (deathAnim.progress >= 1) {
      state = 'over';
      deathAnim = null;
      msg.textContent      = 'GAME OVER';
      sub.textContent      = 'Score: ' + score + '  ·  Best: ' + hi;
      startBtn.textContent = 'Play Again ▶';
      overlay.classList.remove('hidden');
      pauseHint.textContent = '';
    }
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
  Sounds.die();
  triggerShake(6);
  // snapshot the snake for the death animation
  deathAnim = { snapshot: snake.map(s => ({ ...s })), progress: 0, startTs: performance.now() };
  state = 'dying';
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

startBtn.addEventListener('click', startGame);

// ─── Keyboard input ───────────────────────────────────

const DIR_MAP = {
  ArrowUp:    { x: 0,  y: -1 }, ArrowDown:  { x: 0,  y:  1 },
  ArrowLeft:  { x: -1, y:  0 }, ArrowRight: { x:  1, y:  0 },
  w: { x: 0, y: -1 }, W: { x: 0, y: -1 },
  s: { x: 0, y:  1 }, S: { x: 0, y:  1 },
  a: { x: -1, y:  0 }, A: { x: -1, y:  0 },
  d: { x:  1, y:  0 }, D: { x:  1, y:  0 },
};

window.addEventListener('keydown', e => {
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

// ─── Touch input ──────────────────────────────────────

let touchStartX = 0, touchStartY = 0;

canvas.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

canvas.addEventListener('touchend', e => {
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

// ─── D-pad input ──────────────────────────────────────

function pressDir(d) {
  if (state === 'playing' && !(d.x === -dir.x && d.y === -dir.y)) nextDir = d;
}

const dpadMap = {
  'btn-up':    { x: 0,  y: -1 },
  'btn-down':  { x: 0,  y:  1 },
  'btn-left':  { x: -1, y:  0 },
  'btn-right': { x:  1, y:  0 },
};

Object.entries(dpadMap).forEach(([id, d]) => {
  const btn = document.getElementById(id);
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    pressDir(d);
    btn.classList.add('pressed');
  });
  btn.addEventListener('pointerup',    () => btn.classList.remove('pressed'));
  btn.addEventListener('pointerleave', () => btn.classList.remove('pressed'));
});

// ─── Resize ───────────────────────────────────────────

window.addEventListener('resize', () => {
  resize();
  if (state === 'playing' || state === 'paused') initGame();
});

// ─── Boot ─────────────────────────────────────────────

resize();
requestAnimationFrame(loop);