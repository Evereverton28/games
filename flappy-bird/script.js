const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const startBtn = document.getElementById('startBtn');

const colors = {
  bg: '#0a0a0f',
  surface: '#13131a',
  border: '#1e1e2e',
  text: '#e2e8f0',
  muted: '#64748b',
  x: '#f97316',
  o: '#38bdf8',
};

let best = Number(localStorage.getItem('flappy-best') || 0);
bestEl.textContent = best;

// ---------- Audio ----------
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playSound(freq, type = 'square', duration = 0.1, volume = 0.08) {
  try {
    const ctx2 = getAudio();
    const osc = ctx2.createOscillator();
    const gain = ctx2.createGain();
    osc.connect(gain);
    gain.connect(ctx2.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx2.currentTime);
    gain.gain.setValueAtTime(volume, ctx2.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx2.currentTime + duration);
    osc.start(ctx2.currentTime);
    osc.stop(ctx2.currentTime + duration);
  } catch (e) {}
}
const Sounds = {
  flap:  () => playSound(420, 'square', 0.06, 0.06),
  score: () => playSound(660, 'triangle', 0.20, 0.10),
  hit:   () => playSound(120, 'sawtooth', 0.25, 0.10),
};

// ---------- Particles ----------
let particles = [];
function spawnParticles(x, y, col, n = 12) {
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 3;
    particles.push({
      x, y,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      life: 1,
      col,
      r: 2 + Math.random() * 3,
    });
  }
}
function drawParticles() {
  particles.forEach(p => {
    p.x += p.dx;
    p.y += p.dy;
    p.dy += 0.1;
    p.life -= 0.04;
  });
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    const alpha = Math.floor(p.life * 180).toString(16).padStart(2, '0');
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fillStyle = p.col + alpha;
    ctx.fill();
  });
}

// ---------- Screen shake ----------
let shake = { x: 0, y: 0, t: 0 };
function triggerShake(magnitude) {
  shake.x = (Math.random() - 0.5) * magnitude * 2;
  shake.y = (Math.random() - 0.5) * magnitude * 2;
  shake.t = 8;
}

// ---------- Game state ----------
const GRAVITY = 0.45;
const FLAP_VELOCITY = -8;
const PIPE_GAP = 150;
const PIPE_WIDTH = 64;
const PIPE_SPACING = 220;
const PIPE_SPEED = 2.6;

let bird, pipes, score, frame, state; // state: 'ready' | 'playing' | 'over'

function resetGame() {
  bird = {
    x: W * 0.32,
    y: H / 2,
    r: 14,
    vy: 0,
    rotation: 0,
    trail: [],
  };
  pipes = [];
  particles = [];
  score = 0;
  frame = 0;
  scoreEl.textContent = score;
  spawnPipe(W + 100);
  spawnPipe(W + 100 + PIPE_SPACING);
  spawnPipe(W + 100 + PIPE_SPACING * 2);
}

function spawnPipe(x) {
  const margin = 60;
  const top = margin + Math.random() * (H - PIPE_GAP - margin * 2);
  pipes.push({ x, top, bottom: top + PIPE_GAP, scored: false });
}

function updateTrail(obj, maxLength = 10) {
  obj.trail.push({ x: obj.x, y: obj.y });
  if (obj.trail.length > maxLength) obj.trail.shift();
}
function drawTrail(obj, baseColor) {
  obj.trail.forEach((point, i) => {
    const progress = i / obj.trail.length;
    const alpha = Math.floor(progress * 0.25 * 255).toString(16).padStart(2, '0');
    ctx.beginPath();
    ctx.arc(point.x, point.y, obj.r * progress, 0, Math.PI * 2);
    ctx.fillStyle = baseColor + alpha;
    ctx.fill();
  });
}

// ---------- Drawing ----------
function drawBackground() {
  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, 0, W, H);

  // subtle radial glows for atmosphere
  const g1 = ctx.createRadialGradient(W * 0.2, H * 0.15, 0, W * 0.2, H * 0.15, W * 0.6);
  g1.addColorStop(0, 'rgba(249,115,22,0.06)');
  g1.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);

  const g2 = ctx.createRadialGradient(W * 0.8, H * 0.85, 0, W * 0.8, H * 0.85, W * 0.6);
  g2.addColorStop(0, 'rgba(56,189,248,0.06)');
  g2.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);

  // ground line
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, H - 2);
  ctx.lineTo(W, H - 2);
  ctx.stroke();
}

function drawPipes() {
  pipes.forEach(p => {
    // top pipe
    const grad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_WIDTH, 0);
    grad.addColorStop(0, colors.x);
    grad.addColorStop(1, colors.o);

    ctx.fillStyle = colors.bg;
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;

    // top
    ctx.fillRect(p.x, 0, PIPE_WIDTH, p.top);
    ctx.strokeRect(p.x, 0, PIPE_WIDTH, p.top);

    // bottom
    ctx.fillRect(p.x, p.bottom, PIPE_WIDTH, H - p.bottom);
    ctx.strokeRect(p.x, p.bottom, PIPE_WIDTH, H - p.bottom);

    // lip details
    ctx.fillStyle = colors.surface;
    ctx.fillRect(p.x - 4, p.top - 18, PIPE_WIDTH + 8, 18);
    ctx.strokeRect(p.x - 4, p.top - 18, PIPE_WIDTH + 8, 18);

    ctx.fillRect(p.x - 4, p.bottom, PIPE_WIDTH + 8, 18);
    ctx.strokeRect(p.x - 4, p.bottom, PIPE_WIDTH + 8, 18);
  });
}

function drawBird() {
  drawTrail(bird, colors.o);

  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.rotation);

  // body
  const grad = ctx.createLinearGradient(-bird.r, -bird.r, bird.r, bird.r);
  grad.addColorStop(0, colors.x);
  grad.addColorStop(1, colors.o);
  ctx.beginPath();
  ctx.arc(0, 0, bird.r, 0, Math.PI * 2);
  ctx.fillStyle = colors.text;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = grad;
  ctx.stroke();

  // eye
  ctx.beginPath();
  ctx.arc(bird.r * 0.35, -bird.r * 0.25, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = colors.bg;
  ctx.fill();

  // beak
  ctx.beginPath();
  ctx.moveTo(bird.r * 0.7, 0);
  ctx.lineTo(bird.r * 1.5, 3);
  ctx.lineTo(bird.r * 0.7, 6);
  ctx.closePath();
  ctx.fillStyle = colors.x;
  ctx.fill();

  ctx.restore();
}

function draw() {
  if (shake.t > 0) {
    ctx.save();
    ctx.translate(shake.x, shake.y);
    shake.t--;
    shake.x *= 0.7;
    shake.y *= 0.7;
  }

  drawBackground();
  drawPipes();
  drawTrail;
  drawBird();
  drawParticles();

  if (shake.t >= 0) {
    if (shake.t === 0) {} // no-op
  }
  ctx.restore();
}

// ---------- Update / collision ----------
function circleRectCollide(cx, cy, r, rx, ry, rw, rh) {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx * dx + dy * dy) < (r * r);
}

function update() {
  if (state !== 'playing') return;

  frame++;
  bird.vy += GRAVITY;
  bird.y += bird.vy;
  bird.rotation = Math.max(-0.5, Math.min(1.2, bird.vy / 10));

  updateTrail(bird);

  // pipes
  pipes.forEach(p => p.x -= PIPE_SPEED);

  // remove offscreen, add new
  if (pipes.length && pipes[0].x + PIPE_WIDTH < 0) {
    pipes.shift();
    const lastX = pipes[pipes.length - 1].x;
    spawnPipe(lastX + PIPE_SPACING);
  }

  // scoring
  pipes.forEach(p => {
    if (!p.scored && p.x + PIPE_WIDTH < bird.x) {
      p.scored = true;
      score++;
      scoreEl.textContent = score;
      Sounds.score();
      spawnParticles(bird.x, bird.y, colors.o, 14);
      triggerShake(2);
    }
  });

  // collisions: floor / ceiling
  if (bird.y + bird.r >= H || bird.y - bird.r <= 0) {
    gameOver();
    return;
  }

  // collisions: pipes
  for (const p of pipes) {
    if (circleRectCollide(bird.x, bird.y, bird.r, p.x, 0, PIPE_WIDTH, p.top) ||
        circleRectCollide(bird.x, bird.y, bird.r, p.x, p.bottom, PIPE_WIDTH, H - p.bottom)) {
      gameOver();
      return;
    }
  }
}

function gameOver() {
  state = 'over';
  Sounds.hit();
  spawnParticles(bird.x, bird.y, colors.x, 20);
  triggerShake(6);

  if (score > best) {
    best = score;
    localStorage.setItem('flappy-best', String(best));
  }
  bestEl.textContent = best;

  overlayTitle.textContent = 'GAME OVER';
  startBtn.textContent = 'RETRY';
  overlay.classList.remove('hidden');
}

function flap() {
  if (state === 'ready') {
    startGame();
  }
  if (state === 'playing') {
    bird.vy = FLAP_VELOCITY;
    Sounds.flap();
    spawnParticles(bird.x, bird.y, colors.o, 6);
  }
}

function startGame() {
  resetGame();
  state = 'playing';
  overlay.classList.add('hidden');
}

// ---------- Input ----------
document.addEventListener('keydown', e => {
  if (e.code === 'Space') {
    e.preventDefault();
    flap();
  }
});
canvas.addEventListener('mousedown', flap);
canvas.addEventListener('touchstart', e => { e.preventDefault(); flap(); });
startBtn.addEventListener('click', startGame);

// ---------- Loop ----------
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

resetGame();
state = 'ready';
overlayTitle.textContent = 'FLAPPY BIRD';
startBtn.textContent = 'START';
draw();
loop();