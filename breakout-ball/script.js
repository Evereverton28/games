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

const ROWS = 5;
const COLS = 9;
const WALL = 8;
const PADDLE_W = 0.18;
const PADDLE_SPD = 9;
const BALL_SPD = 5;
const LIVES = 3;
const BRICK_COLORS = ['#ff512f', '#dd2476', '#ff7f50', '#ff2d78', '#ff8c42'];

let ball, paddle, bricks = [];
let score = 0, hi = 0, lives = LIVES;
let state = 'idle'; // idle | playing | paused | over | win
let keys = {};
let raf;

// ─── Setup ───────────────────────────────────────────────

function resize() {
  const w = canvas.parentElement.offsetWidth || 480;
  canvas.width = w;
  canvas.height = Math.min(Math.round(w * 0.65), 480);
  if (state === 'playing' || state === 'paused') {
    createPaddle();
    createBricks();
    if (ball) { ball.x = canvas.width / 2; ball.y = canvas.height - 50; }
  }
}

function createBall() {
  ball = {
    x: canvas.width / 2,
    y: canvas.height - 50,
    r: 7,
    dx: BALL_SPD * (Math.random() < 0.5 ? 1 : -1),
    dy: -BALL_SPD,
  };
}

function createPaddle() {
  const pw = canvas.width * PADDLE_W;
  paddle = { x: (canvas.width - pw) / 2, y: canvas.height - 18, w: pw, h: 9, dx: 0 };
}

function createBricks() {
  bricks = [];
  const bw = (canvas.width - WALL * (COLS + 1)) / COLS;
  const bh = 16;
  for (let c = 0; c < COLS; c++) {
    bricks[c] = [];
    for (let r = 0; r < ROWS; r++) {
      bricks[c][r] = {
        x: c * (bw + WALL) + WALL,
        y: r * (bh + WALL) + WALL + 30,
        w: bw,
        h: bh,
        alive: true,
        color: BRICK_COLORS[r % BRICK_COLORS.length],
      };
    }
  }
}

// ─── Drawing ─────────────────────────────────────────────

function drawBricks() {
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const b = bricks[c][r];
      if (!b.alive) continue;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 3);
      ctx.fillStyle = b.color;
      ctx.fill();
    }
  }
}

function drawBall() {
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(255,81,47,0.8)';
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawPaddle() {
  ctx.beginPath();
  ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 5);
  const grad = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.w, 0);
  grad.addColorStop(0, '#ff512f');
  grad.addColorStop(1, '#dd2476');
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgba(221,36,118,0.7)';
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBricks();
  drawBall();
  drawPaddle();

  if (state === 'paused') {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '500 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Paused', canvas.width / 2, canvas.height / 2);
    ctx.textAlign = 'left';
  }
}

// ─── Game logic ───────────────────────────────────────────

function update() {
  ball.x += ball.dx;
  ball.y += ball.dy;

  // Wall collisions
  if (ball.x + ball.r > canvas.width) { ball.x = canvas.width - ball.r; ball.dx = -Math.abs(ball.dx); }
  if (ball.x - ball.r < 0) { ball.x = ball.r; ball.dx = Math.abs(ball.dx); }
  if (ball.y - ball.r < 0) { ball.y = ball.r; ball.dy = Math.abs(ball.dy); }

  // Ball out of bounds (lose a life)
  if (ball.y - ball.r > canvas.height) {
    lives--;
    updateHUD();
    if (lives <= 0) {
      state = 'over';
      showOverlay('Game Over', 'Final score: ' + score, 'Play again');
    } else {
      createBall();
    }
    return;
  }

  // Paddle collision — angle based on hit position
  if (
    ball.y + ball.r > paddle.y &&
    ball.y - ball.r < paddle.y + paddle.h &&
    ball.x > paddle.x &&
    ball.x < paddle.x + paddle.w
  ) {
    const rel = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
    ball.dx = BALL_SPD * rel * 1.4;
    ball.dy = -Math.abs(ball.dy);
    ball.y = paddle.y - ball.r;
  }

  // Brick collisions
  let remaining = 0;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const b = bricks[c][r];
      if (!b.alive) continue;
      remaining++;
      if (
        ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w &&
        ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h
      ) {
        const overlapL = ball.x + ball.r - b.x;
        const overlapR = b.x + b.w - (ball.x - ball.r);
        const overlapT = ball.y + ball.r - b.y;
        const overlapB = b.y + b.h - (ball.y - ball.r);
        const minH = Math.min(overlapL, overlapR);
        const minV = Math.min(overlapT, overlapB);
        if (minH < minV) ball.dx = -ball.dx; else ball.dy = -ball.dy;
        b.alive = false;
        score++;
        if (score > hi) hi = score;
        updateHUD();
      }
    }
  }

  if (remaining === 0) {
    state = 'win';
    showOverlay('You Win!', 'Score: ' + score + ' · Best: ' + hi, 'Play again');
  }

  // Move paddle via keyboard
  if (keys['ArrowRight']) paddle.dx = PADDLE_SPD;
  else if (keys['ArrowLeft']) paddle.dx = -PADDLE_SPD;
  else paddle.dx = 0;

  paddle.x += paddle.dx;
  paddle.x = Math.max(0, Math.min(canvas.width - paddle.w, paddle.x));
}

// ─── Loop ────────────────────────────────────────────────

function loop() {
  if (state === 'playing') update();
  draw();
  raf = requestAnimationFrame(loop);
}

// ─── HUD & Overlay ───────────────────────────────────────

function updateHUD() {
  scoreEl.textContent = score;
  highEl.textContent = hi;
  livesEl.textContent = '❤️'.repeat(Math.max(0, lives));
}

function showOverlay(m, s, btn) {
  msg.textContent = m;
  sub.textContent = s;
  startBtn.textContent = btn + ' ▶';
  overlay.classList.remove('hidden');
  pauseHint.textContent = '';
}

function startGame() {
  score = 0;
  lives = LIVES;
  createBricks();
  createBall();
  createPaddle();
  updateHUD();
  overlay.classList.add('hidden');
  pauseHint.textContent = 'P to pause · Arrow keys or mouse to move';
  state = 'playing';
  if (!raf) loop();
}

// ─── Input ───────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  if ((e.key === 'p' || e.key === 'P') && (state === 'playing' || state === 'paused')) {
    state = state === 'paused' ? 'playing' : 'paused';
    pauseHint.textContent = state === 'paused'
      ? 'Paused — press P to resume'
      : 'P to pause · Arrow keys or mouse to move';
  }
  if (['ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
});

window.addEventListener('keyup', (e) => { keys[e.key] = false; });

canvas.addEventListener('mousemove', (e) => {
  if (state !== 'playing') return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  paddle.x = Math.max(0, Math.min(canvas.width - paddle.w, mx - paddle.w / 2));
});

canvas.addEventListener('touchmove', (e) => {
  if (state !== 'playing') return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const tx = e.touches[0].clientX - rect.left;
  paddle.x = Math.max(0, Math.min(canvas.width - paddle.w, tx - paddle.w / 2));
}, { passive: false });

window.addEventListener('resize', resize);

// ─── Init ────────────────────────────────────────────────
resize();
loop();
