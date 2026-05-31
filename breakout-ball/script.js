const canvas = document.getElementById('gc');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const msg = document.getElementById('msg');
const sub = document.getElementById('sub');
const startBtn = document.getElementById('startBtn');
const scoreEl = document.getElementById('scoreEl');
const highEl = document.getElementById('highEl');
const livesEl = document.getElementById('livesEl');
const pauseHint = document.getElementById('pauseHint');

// ─── Design system colours (mirrors CSS vars) ─────────────
const C = {
  bg:      '#0a0a0f',
  surface: '#13131a',
  border:  '#1e1e2e',
  text:    '#e2e8f0',
  muted:   '#64748b',
  orange:  '#f97316',
  cyan:    '#38bdf8',
};

// ─── Constants ────────────────────────────────────────────

const ROWS = 5;
const COLS = 9;
const WALL = 8;
const PADDLE_W = 0.18;
const PADDLE_SPD = 9;
const BALL_SPD = 5;
const BALL_R = 7;
const PADDLE_Y_OFFSET = 18;
const BRICK_H = 16;
const BRICK_TOP_MARGIN = 30;
const LIVES = 3;
// Row colours: orange → cyan gradient across rows
const BRICK_COLORS = ['#f97316', '#fb923c', '#38bdf8', '#0ea5e9', '#7dd3fc'];
const ROW_POINTS = [5, 4, 3, 2, 1];

// ─── State ───────────────────────────────────────────────

const game = {
  ball: null,
  paddle: null,
  bricks: [],
  score: 0,
  hi: parseInt(localStorage.getItem('breakout_hi') || '0', 10),
  lives: LIVES,
  state: 'idle',    // idle | playing | paused | over | win
  keys: {},
  raf: null,
  lastTime: null,
  flashFrames: 0,
  shake: { x: 0, y: 0, t: 0 },
  particles: [],
};

// ─── Audio ────────────────────────────────────────────────

let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playSound(freq, type = 'square', duration = 0.1, volume = 0.08) {
  try {
    const ac = getAudio();
    const osc = ac.createOscillator();
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
  hit:   () => playSound(220, 'square',   0.06, 0.07),
  wall:  () => playSound(160, 'sine',     0.05, 0.05),
  brick: () => playSound(330, 'triangle', 0.10, 0.09),
  lose:  () => playSound(110, 'sawtooth', 0.40, 0.10),
  win:   () => playSound(440, 'triangle', 0.50, 0.12),
};

// ─── Setup ───────────────────────────────────────────────

function resize() {
  const oldW = canvas.width || 1;
  const oldH = canvas.height || 1;
  const w = canvas.parentElement.offsetWidth || 480;
  canvas.width = w;
  canvas.height = Math.min(Math.round(w * 0.65), 480);

  if (game.state === 'playing' || game.state === 'paused') {
    createPaddle();
    rebuildBrickLayout();
    if (game.ball) {
      game.ball.x = game.ball.x * (canvas.width / oldW);
      game.ball.y = game.ball.y * (canvas.height / oldH);
      game.ball.x = Math.max(BALL_R, Math.min(canvas.width - BALL_R, game.ball.x));
      game.ball.y = Math.max(BALL_R, Math.min(canvas.height - BALL_R, game.ball.y));
    }
  }
}

function createBall() {
  const absX = BALL_SPD * (Math.random() * 0.6 + 0.4);
  const absY = Math.sqrt(BALL_SPD * BALL_SPD - absX * absX);
  game.ball = {
    x: canvas.width / 2,
    y: canvas.height - 50,
    r: BALL_R,
    dx: absX * (Math.random() < 0.5 ? 1 : -1),
    dy: -absY,
    trail: [],
    paddleCooldown: 0, // frames to ignore paddle collision after a hit
  };
}

function createPaddle() {
  const pw = canvas.width * PADDLE_W;
  game.paddle = {
    x: (canvas.width - pw) / 2,
    y: canvas.height - PADDLE_Y_OFFSET,
    w: pw,
    h: 9,
    dx: 0,
  };
}

// Build bricks from scratch, setting all alive = true
function createBricks() {
  game.bricks = [];
  const bw = (canvas.width - WALL * (COLS + 1)) / COLS;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      game.bricks.push({
        x: c * (bw + WALL) + WALL,
        y: r * (bh() + WALL) + WALL + BRICK_TOP_MARGIN,
        w: bw,
        h: bh(),
        alive: true,
        color: BRICK_COLORS[r % BRICK_COLORS.length],
        row: r,
        col: c,
      });
    }
  }
}

// Recalculate brick positions after resize without resetting alive state
function rebuildBrickLayout() {
  const bw = (canvas.width - WALL * (COLS + 1)) / COLS;
  for (const b of game.bricks) {
    b.x = b.col * (bw + WALL) + WALL;
    b.y = b.row * (bh() + WALL) + WALL + BRICK_TOP_MARGIN;
    b.w = bw;
    b.h = bh();
  }
}

function bh() { return BRICK_H; }

// ─── Particles ────────────────────────────────────────────

function spawnParticles(x, y, col, n = 10) {
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 3;
    game.particles.push({
      x, y,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      life: 1,
      col,
      r: 2 + Math.random() * 3,
    });
  }
}

function updateParticles() {
  game.particles.forEach(p => {
    p.x += p.dx; p.y += p.dy;
    p.dy += 0.1;
    p.life -= 0.04;
  });
  game.particles = game.particles.filter(p => p.life > 0);
}

function drawParticles() {
  for (const p of game.particles) {
    const alpha = Math.floor(p.life * 180).toString(16).padStart(2, '0');
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fillStyle = p.col + alpha;
    ctx.fill();
  }
}

// ─── Trail ────────────────────────────────────────────────

function updateTrail(ball) {
  ball.trail.push({ x: ball.x, y: ball.y });
  if (ball.trail.length > 10) ball.trail.shift();
}

function drawTrail(ball) {
  for (let i = 0; i < ball.trail.length; i++) {
    const p = ball.trail[i];
    const progress = i / ball.trail.length;
    const alpha = Math.floor(progress * 0.35 * 255).toString(16).padStart(2, '0');
    ctx.beginPath();
    ctx.arc(p.x, p.y, ball.r * progress * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = C.cyan + alpha;
    ctx.fill();
  }
}

// ─── Drawing ─────────────────────────────────────────────

function drawBricks() {
  for (const b of game.bricks) {
    if (!b.alive) continue;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 3);
    ctx.fillStyle = b.color;
    ctx.fill();
  }
}

function drawBall() {
  drawTrail(game.ball);
  ctx.beginPath();
  ctx.arc(game.ball.x, game.ball.y, game.ball.r, 0, Math.PI * 2);
  ctx.fillStyle = C.text;
  ctx.fill();
}

function drawPaddle() {
  const p = game.paddle;
  ctx.beginPath();
  ctx.roundRect(p.x, p.y, p.w, p.h, 5);
  const grad = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
  grad.addColorStop(0, C.orange);
  grad.addColorStop(1, C.cyan);
  ctx.fillStyle = grad;
  ctx.fill();
}

function draw() {
  const sk = game.shake;
  ctx.save();

  if (sk.t > 0) {
    ctx.translate(sk.x, sk.y);
    sk.t--;
    sk.x *= 0.7;
    sk.y *= 0.7;
  }

  ctx.clearRect(-20, -20, canvas.width + 40, canvas.height + 40);

  // Life-loss flash
  if (game.flashFrames > 0) {
    const alpha = (game.flashFrames / 12) * 0.35;
    ctx.fillStyle = `rgba(249, 115, 22, ${alpha})`;
    ctx.fillRect(-20, -20, canvas.width + 40, canvas.height + 40);
    game.flashFrames--;
  }

  drawBricks();
  drawParticles();
  drawBall();
  drawPaddle();

  if (game.state === 'paused') {
    ctx.fillStyle = 'rgba(10,10,15,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = C.text;
    ctx.font = '500 18px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
    ctx.textAlign = 'left';
  }

  ctx.restore();
}

// ─── Continuous collision (swept) ─────────────────────────

// Returns fraction t in [0,1] at which the ball edge first contacts a rect,
// or null if no collision this frame.
function sweepBallRect(ball, prevX, prevY, rect) {
  const r = ball.r;
  // Expand rect by ball radius (Minkowski sum)
  const left   = rect.x - r;
  const right  = rect.x + rect.w + r;
  const top    = rect.y - r;
  const bottom = rect.y + rect.h + r;

  const dx = ball.x - prevX;
  const dy = ball.y - prevY;

  let tmin = 0, tmax = 1;

  if (dx !== 0) {
    const t1 = (left  - prevX) / dx;
    const t2 = (right - prevX) / dx;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else {
    if (prevX < left || prevX > right) return null;
  }

  if (dy !== 0) {
    const t1 = (top    - prevY) / dy;
    const t2 = (bottom - prevY) / dy;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else {
    if (prevY < top || prevY > bottom) return null;
  }

  if (tmin > tmax || tmax < 0 || tmin > 1) return null;
  return Math.max(0, tmin);
}

// ─── Game logic ───────────────────────────────────────────

function update(dt) {
  const ball = game.ball;
  const paddle = game.paddle;

  // Decrement paddle cooldown
  if (ball.paddleCooldown > 0) ball.paddleCooldown--;

  const prevX = ball.x;
  const prevY = ball.y;

  ball.x += ball.dx * dt;
  ball.y += ball.dy * dt;

  // Update trail each frame
  updateTrail(ball);
  updateParticles();

  // Wall collisions
  if (ball.x + ball.r > canvas.width)  { ball.x = canvas.width - ball.r;  ball.dx = -Math.abs(ball.dx); Sounds.wall(); spawnParticles(ball.x, ball.y, C.muted, 5); }
  if (ball.x - ball.r < 0)             { ball.x = ball.r;                  ball.dx =  Math.abs(ball.dx); Sounds.wall(); spawnParticles(ball.x, ball.y, C.muted, 5); }
  if (ball.y - ball.r < 0)             { ball.y = ball.r;                  ball.dy =  Math.abs(ball.dy); Sounds.wall(); spawnParticles(ball.x, ball.y, C.muted, 5); }

  // Ball out of bounds — lose a life
  if (ball.y - ball.r > canvas.height) {
    game.lives--;
    updateHUD();
    Sounds.lose();
    if (game.lives <= 0) {
      game.state = 'over';
      showOverlay('Game Over', 'Final score: ' + game.score, 'Play again');
    } else {
      game.flashFrames = 12;
      triggerShake(6);
      createBall();
    }
    return;
  }

  // Paddle collision — only when cooldown is zero
  // FIX: cooldown prevents re-triggering while ball is still overlapping
  if (ball.paddleCooldown === 0) {
    const tPaddle = sweepBallRect(ball, prevX, prevY, paddle);
    if (tPaddle !== null) {
      const rel = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
      ball.dx = BALL_SPD * rel * 1.4;
      ball.dy = -Math.abs(ball.dy);
      // Push ball clear of paddle by r+2 so next frame it's outside the expanded zone
      ball.y = paddle.y - ball.r - 2;
      ball.paddleCooldown = 8; // ignore paddle for 8 frames
      Sounds.hit();
      spawnParticles(ball.x, ball.y, C.cyan, 8);
      triggerShake(3);
    }
  }

  // Brick collisions — one per frame
  let remaining = 0;
  let hitThisFrame = false;

  for (const b of game.bricks) {
    if (!b.alive) continue;
    remaining++;
    if (hitThisFrame) continue;

    const t = sweepBallRect(ball, prevX, prevY, b);
    if (t === null) continue;

    const overlapL = ball.x + ball.r - b.x;
    const overlapR = b.x + b.w - (ball.x - ball.r);
    const overlapT = ball.y + ball.r - b.y;
    const overlapB = b.y + b.h - (ball.y - ball.r);
    const minH = Math.min(overlapL, overlapR);
    const minV = Math.min(overlapT, overlapB);
    if (minH < minV) ball.dx = -ball.dx; else ball.dy = -ball.dy;

    b.alive = false;
    remaining--;
    hitThisFrame = true;

    spawnParticles(b.x + b.w / 2, b.y + b.h / 2, b.color, 10);
    Sounds.brick();

    const pts = ROW_POINTS[b.row] ?? 1;
    game.score += pts;
    if (game.score > game.hi) {
      game.hi = game.score;
      localStorage.setItem('breakout_hi', game.hi);
    }
    updateHUD();
  }

  // Enforce minimum vertical speed
  if (Math.abs(ball.dy) < 1.5) {
    ball.dy = ball.dy < 0 ? -1.5 : 1.5;
  }

  if (remaining === 0) {
    game.state = 'win';
    Sounds.win();
    showOverlay('You Win!', 'Score: ' + game.score + ' · Best: ' + game.hi, 'Play again');
    return;
  }

  // Keyboard paddle movement
  if (game.keys['ArrowRight'])      paddle.dx =  PADDLE_SPD;
  else if (game.keys['ArrowLeft'])  paddle.dx = -PADDLE_SPD;
  else                              paddle.dx =  0;

  paddle.x += paddle.dx * dt;
  paddle.x = Math.max(0, Math.min(canvas.width - paddle.w, paddle.x));
}

function triggerShake(magnitude) {
  game.shake.x = (Math.random() - 0.5) * magnitude * 2;
  game.shake.y = (Math.random() - 0.5) * magnitude * 2;
  game.shake.t = 8;
}

// ─── Loop ────────────────────────────────────────────────

function loop(timestamp) {
  // Delta time: clamped to max 2 frames to avoid spiral-of-death on tab resume
  const dt = game.lastTime ? Math.min((timestamp - game.lastTime) / 16.667, 2) : 1;
  game.lastTime = timestamp;

  if (game.state === 'playing') update(dt);
  draw();
  game.raf = requestAnimationFrame(loop);
}

function startLoop() {
  if (game.raf) {
    cancelAnimationFrame(game.raf);
    game.raf = null;
  }
  game.lastTime = null;
  game.raf = requestAnimationFrame(loop);
}

// ─── HUD & Overlay ───────────────────────────────────────

function updateHUD() {
  scoreEl.textContent = game.score;
  highEl.textContent = game.hi;
  livesEl.textContent = '❤️'.repeat(Math.max(0, game.lives));
}

function showOverlay(m, s, btn) {
  msg.textContent = m;
  sub.textContent = s;
  startBtn.textContent = btn + ' ▶';
  overlay.classList.remove('hidden');
  pauseHint.textContent = '';
}

function startGame() {
  game.score = 0;
  game.lives = LIVES;
  game.flashFrames = 0;
  game.shake = { x: 0, y: 0, t: 0 };
  game.particles = [];
  createBricks();
  createBall();
  createPaddle();
  updateHUD();
  overlay.classList.add('hidden');
  pauseHint.textContent = 'P to pause · Arrow keys or mouse to move';
  game.state = 'playing';
  startLoop();
}

// ─── Input ───────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  game.keys[e.key] = true;
  if ((e.key === 'p' || e.key === 'P') && (game.state === 'playing' || game.state === 'paused')) {
    game.state = game.state === 'paused' ? 'playing' : 'paused';
    pauseHint.textContent = game.state === 'paused'
      ? 'Paused — press P to resume'
      : 'P to pause · Arrow keys or mouse to move';
  }
  if (['ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
});

window.addEventListener('keyup', (e) => { game.keys[e.key] = false; });

canvas.addEventListener('mousemove', (e) => {
  if (game.state !== 'playing') return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  game.paddle.x = Math.max(0, Math.min(canvas.width - game.paddle.w, mx - game.paddle.w / 2));
});

canvas.addEventListener('touchmove', (e) => {
  if (game.state !== 'playing') return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const tx = e.touches[0].clientX - rect.left;
  game.paddle.x = Math.max(0, Math.min(canvas.width - game.paddle.w, tx - game.paddle.w / 2));
}, { passive: false });

window.addEventListener('resize', resize);

// ─── Init ────────────────────────────────────────────────
updateHUD();
resize();
startLoop();