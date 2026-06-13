'use strict';

const canvas    = document.getElementById('gameCanvas');
const ctx       = canvas.getContext('2d');
const overlay   = document.getElementById('overlay');
const oTitle    = document.getElementById('overlay-title');
const oSub      = document.getElementById('overlay-sub');
const startBtn  = document.getElementById('start-btn');
const scoreEl   = document.getElementById('score-display');
const hiEl      = document.getElementById('hi-display');
const scoreCard = document.getElementById('score-card');

const W = canvas.width;
const H = canvas.height;
const GROUND = H - 54;

const C = {
  bg:      '#0a0a0f',
  surface: '#13131a',
  border:  '#1e1e2e',
  text:    '#e2e8f0',
  muted:   '#64748b',
  orange:  '#f97316',
  cyan:    '#38bdf8',
  green:   '#1D9E75',
};

/* ── Audio ──────────────────────────────────────────────────────────────── */
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playSound(freq, type = 'square', dur = 0.1, vol = 0.08) {
  try {
    const ac = getAudio(), osc = ac.createOscillator(), g = ac.createGain();
    osc.connect(g); g.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    osc.start(ac.currentTime); osc.stop(ac.currentTime + dur);
  } catch(e) {}
}
const Sounds = {
  jump: () => playSound(260, 'sine',     0.12, 0.09),
  hit:  () => playSound(120, 'square',   0.25, 0.12),
  mile: () => playSound(550, 'sine',     0.20, 0.10),
};

/* ── Particles ──────────────────────────────────────────────────────────── */
let particles = [];
function spawnParticles(x, y, col, n = 12) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3;
    particles.push({ x, y, dx: Math.cos(a) * sp, dy: Math.sin(a) * sp, life: 1, col, r: 2 + Math.random() * 3 });
  }
}
function drawParticles() {
  particles.forEach(p => { p.x += p.dx; p.y += p.dy; p.dy += 0.12; p.life -= 0.035; });
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    const al = Math.floor(p.life * 200).toString(16).padStart(2, '0');
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fillStyle = p.col + al; ctx.fill();
  });
}

/* ── Screen shake ───────────────────────────────────────────────────────── */
let shake = { x: 0, y: 0, t: 0 };
function triggerShake(mag) {
  shake.x = (Math.random() - 0.5) * mag * 2;
  shake.y = (Math.random() - 0.5) * mag * 2;
  shake.t = 8;
}

/* ── Game state ─────────────────────────────────────────────────────────── */
let state = 'idle', score = 0, hiScore = 0, speed = 6, frame = 0, milestone = 100, flashTimer = 0;

/* ── Dino ───────────────────────────────────────────────────────────────── */
const dino = { x: 90, y: GROUND, w: 44, h: 54, vy: 0, jumping: false, ducking: false, trail: [], legPhase: 0 };
const DUCK_H = 30, JUMP_V = -16.5, GRAVITY = 0.75;

function dinoJump() {
  if (!dino.jumping && state === 'running') {
    dino.vy = JUMP_V; dino.jumping = true;
    Sounds.jump();
    spawnParticles(dino.x + dino.w / 2, GROUND, C.cyan, 8);
  }
}

function updateDino() {
  dino.vy += GRAVITY; dino.y += dino.vy;
  if (dino.y >= GROUND) { dino.y = GROUND; dino.vy = 0; dino.jumping = false; }
  const h = dino.ducking ? DUCK_H : dino.h;
  dino.trail.push({ x: dino.x + dino.w / 2, y: dino.y - h / 2 });
  if (dino.trail.length > 8) dino.trail.shift();
  if (!dino.jumping) dino.legPhase += speed * 0.12;
}

function rr(x, y, w, h, r, fill) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
}

function drawLegs(x, baseY, width, duck) {
  if (dino.jumping) {
    rr(x + 4, baseY - 16, 8, 12, 4, C.text);
    rr(x + width - 12, baseY - 16, 8, 12, 4, C.text);
    return;
  }
  const legH = duck ? 12 : 18;
  const lL = Math.sin(dino.legPhase) * (duck ? 6 : 9);
  const lR = Math.sin(dino.legPhase + Math.PI) * (duck ? 6 : 9);
  rr(x + 4, baseY - legH + lL, 8, legH - lL, 4, C.text);
  rr(x + width - 12, baseY - legH + lR, 8, legH - lR, 4, C.text);
}

function drawDino() {
  const h = dino.ducking ? DUCK_H : dino.h;
  const topY = dino.y - h;

  dino.trail.forEach((pt, i) => {
    const prog = i / dino.trail.length;
    const al = Math.floor(prog * 0.3 * 255).toString(16).padStart(2, '0');
    ctx.beginPath(); ctx.arc(pt.x, pt.y, (dino.w / 2.5) * prog, 0, Math.PI * 2);
    ctx.fillStyle = C.cyan + al; ctx.fill();
  });

  if (dino.ducking) {
    rr(dino.x, dino.y - DUCK_H, dino.w + 14, DUCK_H, 8, C.text);
    ctx.beginPath(); ctx.arc(dino.x + dino.w + 10, dino.y - DUCK_H + 10, 4, 0, Math.PI * 2);
    ctx.fillStyle = C.orange; ctx.fill();
    drawLegs(dino.x + 6, dino.y, dino.w + 2, true);
  } else {
    rr(dino.x + 4, topY + 18, dino.w - 8, h - 18, 8, C.text);
    rr(dino.x + 12, topY + 4, dino.w - 22, 20, 4, C.text);
    rr(dino.x + 8, topY, dino.w - 4, 22, 6, C.text);
    rr(dino.x + dino.w - 10, topY + 8, 14, 10, 4, C.text);
    ctx.beginPath(); ctx.arc(dino.x + dino.w - 12, topY + 7, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = C.orange; ctx.fill();
    ctx.beginPath(); ctx.arc(dino.x + dino.w - 11, topY + 6.5, 2, 0, Math.PI * 2);
    ctx.fillStyle = C.surface; ctx.fill();
    rr(dino.x + dino.w - 18, topY + 28, 10, 5, 2, C.muted);
    drawLegs(dino.x + 4, dino.y, dino.w - 8, false);
  }
}

/* ── Obstacles ──────────────────────────────────────────────────────────── */
let obstacles = [], nextObsDist = 0;

function spawnObstacle() {
  if (Math.random() < 0.25) {
    const flyH = GROUND - 80 - Math.random() * 70;
    obstacles.push({ type: 'ptero', x: W + 20, y: flyH, w: 56, h: 30, wp: 0 });
  } else {
    const v = Math.floor(Math.random() * 3);
    const sizes = [{ w: 20, h: 46 }, { w: 32, h: 52 }, { w: 48, h: 42 }];
    const s = sizes[v];
    obstacles.push({ type: 'cactus', x: W + 20, y: GROUND - s.h, w: s.w, h: s.h, v });
  }
}

function updateObstacles() {
  if (nextObsDist <= 0) {
    spawnObstacle();
    nextObsDist = 380 + Math.random() * 380 - Math.min(speed * 10, 150);
  }
  nextObsDist -= speed;
  obstacles.forEach(o => { o.x -= speed; if (o.type === 'ptero') o.wp += 0.15; });
  obstacles = obstacles.filter(o => o.x > -80);
}

function drawCactus(o) {
  const col = C.orange;
  if (o.v === 0) {
    rr(o.x + 6, o.y, 8, o.h, 4, col);
    rr(o.x, o.y + 12, 8, 16, 3, col);
    rr(o.x, o.y + 12, 6, 8, 3, col);
    rr(o.x + 14, o.y + 18, 8, 14, 3, col);
    rr(o.x + 14, o.y + 18, 6, 8, 3, col);
  } else if (o.v === 1) {
    rr(o.x + 4, o.y, 8, o.h, 4, col);
    rr(o.x + 20, o.y + 8, 8, o.h - 8, 4, col);
    rr(o.x, o.y + 16, 12, 8, 3, col);
    rr(o.x + 28, o.y + 22, 10, 8, 3, col);
  } else {
    rr(o.x, o.y + 6, 7, o.h - 6, 3, col);
    rr(o.x + 18, o.y, 8, o.h, 4, col);
    rr(o.x + 36, o.y + 8, 7, o.h - 8, 3, col);
    rr(o.x + 8, o.y + 14, 10, 7, 3, col);
    rr(o.x + 26, o.y + 18, 10, 7, 3, col);
  }
}

function drawPtero(o) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const wing = Math.sin(o.wp) * 10;
  ctx.beginPath(); ctx.ellipse(cx, cy, 16, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = C.cyan; ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + 16, cy); ctx.lineTo(cx + 30, cy - 4); ctx.lineTo(cx + 16, cy + 3);
  ctx.fillStyle = C.cyan; ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + 10, cy - 8); ctx.lineTo(cx + 22, cy - 18); ctx.lineTo(cx + 16, cy - 4);
  ctx.fillStyle = C.cyan; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy - 4); ctx.quadraticCurveTo(cx - 20, cy - 20 - wing, cx - 32, cy - 8 - wing);
  ctx.quadraticCurveTo(cx - 20, cy + 4, cx, cy + 4);
  ctx.fillStyle = C.cyan; ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 12, cy - 2, 3, 0, Math.PI * 2); ctx.fillStyle = C.bg; ctx.fill();
}

function drawObstacles() {
  obstacles.forEach(o => { if (o.type === 'cactus') drawCactus(o); else drawPtero(o); });
}

/* ── Ground ─────────────────────────────────────────────────────────────── */
let groundOffset = 0;
const groundDots = Array.from({ length: 30 }, () => ({
  x: Math.random() * W,
  h: 2 + Math.random() * 4,
  w: 4 + Math.random() * 18,
}));

function drawGround() {
  ctx.fillStyle = C.border; ctx.fillRect(0, GROUND + 4, W, 2);
  ctx.fillStyle = C.surface; ctx.fillRect(0, GROUND + 6, W, H - GROUND - 6);
  groundDots.forEach(d => {
    const x = ((d.x - groundOffset) % W + W) % W;
    rr(x, GROUND + 10, d.w, d.h, 2, C.border);
  });
}

/* ── Stars ──────────────────────────────────────────────────────────────── */
const stars = Array.from({ length: 60 }, () => ({
  x: Math.random() * W, y: Math.random() * (GROUND - 30),
  r: Math.random() * 1.2 + 0.3, tw: Math.random() * Math.PI * 2,
}));
function drawStars() {
  stars.forEach(s => {
    s.tw += 0.03;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(226,232,240,${(0.15 + 0.1 * Math.sin(s.tw)).toFixed(2)})`; ctx.fill();
  });
}

/* ── Clouds ─────────────────────────────────────────────────────────────── */
const clouds = Array.from({ length: 5 }, () => ({
  x: Math.random() * W, y: 30 + Math.random() * 70,
  w: 60 + Math.random() * 60, sp: 0.4 + Math.random() * 0.4,
}));
function drawClouds() {
  clouds.forEach(c => {
    c.x -= c.sp; if (c.x < -c.w) c.x = W + c.w;
    ctx.globalAlpha = 0.12; ctx.fillStyle = C.muted;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, c.w / 2, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(c.x - c.w * 0.2, c.y + 6, c.w * 0.3, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  });
}

/* ── Collision ──────────────────────────────────────────────────────────── */
function checkCollision() {
  const dh = dino.ducking ? DUCK_H : dino.h;
  const dw = dino.ducking ? dino.w + 14 : dino.w;
  const dx1 = dino.x + 10, dy1 = dino.y - dh + 8;
  const dx2 = dx1 + dw - 20, dy2 = dy1 + dh - 14;
  for (const o of obstacles) {
    const pad = 7;
    if (dx2 > o.x + pad && dx1 < o.x + o.w - pad && dy2 > o.y + pad && dy1 < o.y + o.h - pad) return true;
  }
  return false;
}

/* ── Score ──────────────────────────────────────────────────────────────── */
function fmt(n) { return String(Math.floor(n)).padStart(5, '0'); }
function updateScore() {
  score += speed * 0.05;
  scoreEl.textContent = fmt(score);
  if (score > hiScore) { hiScore = score; hiEl.textContent = fmt(hiScore); }
  if (score >= milestone) {
    milestone += 100; Sounds.mile(); flashTimer = 20;
    speed = Math.min(speed + 0.35, 18);
  }
  if (flashTimer > 0) { flashTimer--; scoreCard.classList.add('active-x'); }
  else scoreCard.classList.remove('active-x');
}

/* ── Draw ───────────────────────────────────────────────────────────────── */
function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  if (shake.t > 0) {
    ctx.save(); ctx.translate(shake.x, shake.y);
    shake.t--; shake.x *= 0.7; shake.y *= 0.7;
  }
  drawStars(); drawClouds(); drawGround(); drawObstacles(); drawDino(); drawParticles();
  if (shake.t >= 0 && shake.t < 8) ctx.restore();
}

/* ── Loop ───────────────────────────────────────────────────────────────── */
let rafId = null;
function loop() {
  frame++;
  groundOffset = (groundOffset + speed) % W;
  updateDino(); updateObstacles(); updateScore();
  if (checkCollision()) { die(); return; }
  draw();
  rafId = requestAnimationFrame(loop);
}

function startGame() {
  score = 0; speed = 6; frame = 0; milestone = 100; flashTimer = 0;
  obstacles = []; particles = []; nextObsDist = 300;
  dino.y = GROUND; dino.vy = 0; dino.jumping = false; dino.ducking = false;
  dino.trail = []; dino.legPhase = 0;
  scoreEl.textContent = '00000';
  scoreCard.classList.remove('active-x');
  overlay.classList.add('hidden');
  state = 'running';
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function die() {
  state = 'dead';
  if (rafId) cancelAnimationFrame(rafId);
  Sounds.hit(); triggerShake(8);
  spawnParticles(dino.x + dino.w / 2, dino.y - dino.h / 2, C.orange, 20);
  draw();
  oTitle.textContent = 'GAME OVER';
  oSub.textContent = 'SCORE: ' + fmt(score);
  startBtn.textContent = 'PLAY AGAIN';
  overlay.classList.remove('hidden');
}

/* ── Input ──────────────────────────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (state === 'running') dinoJump();
  }
  if (e.code === 'ArrowDown') { e.preventDefault(); if (state === 'running') dino.ducking = true; }
});
document.addEventListener('keyup', e => {
  if (e.code === 'ArrowDown') dino.ducking = false;
});
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (state === 'running') dinoJump();
}, { passive: false });

startBtn.addEventListener('click', () => { getAudio(); startGame(); });

draw();