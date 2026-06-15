/* ─────────────────────────────────────────────────────────────
   CROSSY ROADS  –  script.js
   Dark Arcade UI colour system applied throughout
───────────────────────────────────────────────────────────── */

// ── Constants ──────────────────────────────────────────────────
const COLS       = 11;         // tiles across
const ROWS       = 13;         // tiles visible
const TILE       = 52;         // px per tile
const W          = COLS * TILE;
const H          = ROWS * TILE;
const SAFE_ROW   = ROWS - 1;   // grass starting row (bottom)
const SPAWN_ROW  = ROWS - 1;
const START_COL  = Math.floor(COLS / 2);

// Palette pulled from CSS custom props (read once at startup)
const C = {
  bg:      '#0a0a0f',
  surface: '#13131a',
  border:  '#1e1e2e',
  text:    '#e2e8f0',
  muted:   '#64748b',
  orange:  '#f97316',
  cyan:    '#38bdf8',
  grass:   '#15291a',
  grass2:  '#172e1d',
  road:    '#1a1a24',
  road2:   '#1e1e2e',
  water:   '#0c1e30',
  water2:  '#0e2437',
  log:     '#6b3f1f',
  log2:    '#7a4925',
  rail:    '#1c1c28',
};

// ── Audio ──────────────────────────────────────────────────────
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
  hop:    () => playSound(300, 'square',   0.06, 0.06),
  splash: () => playSound(140, 'sine',     0.20, 0.10),
  hit:    () => playSound(80,  'sawtooth', 0.25, 0.12),
  score:  () => playSound(440, 'triangle', 0.18, 0.09),
  win:    () => playSound(550, 'triangle', 0.40, 0.12),
};

// ── Particles ──────────────────────────────────────────────────
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
function drawParticles(ctx) {
  particles.forEach(p => {
    p.x += p.dx;
    p.y += p.dy;
    p.dy += 0.08;
    p.life -= 0.03;
  });
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    const alpha = Math.floor(p.life * 200).toString(16).padStart(2, '0');
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fillStyle = p.col + alpha;
    ctx.fill();
  });
}

// ── Screen shake ───────────────────────────────────────────────
let shake = { x: 0, y: 0, t: 0 };
function triggerShake(mag) {
  shake.x = (Math.random() - 0.5) * mag * 2;
  shake.y = (Math.random() - 0.5) * mag * 2;
  shake.t = 10;
}

// ── State ──────────────────────────────────────────────────────
let bestScore = parseInt(localStorage.getItem('crossy_best') || '0', 10);
let score = 0;
let maxRow = SPAWN_ROW; // track furthest row reached
let gameState = 'start'; // 'start' | 'playing' | 'dead'
let rafId = null;

// ── DOM refs ──────────────────────────────────────────────────
const startScreen = document.getElementById('start-screen');
const gameScreen  = document.getElementById('game-screen');
const deadScreen  = document.getElementById('dead-screen');
const canvas      = document.getElementById('game-canvas');
const ctx         = canvas.getContext('2d');

canvas.width  = W;
canvas.height = H;

const scoreVal   = document.getElementById('score-val');
const bestVal    = document.getElementById('best-val');
const finalScore = document.getElementById('final-score');
const finalBest  = document.getElementById('final-best');
const bestDisp   = document.getElementById('best-display');
const scoreCard  = document.getElementById('score-card');

document.getElementById('start-btn').addEventListener('click',  () => startGame());
document.getElementById('retry-btn').addEventListener('click',  () => startGame());
document.getElementById('menu-btn').addEventListener('click',   () => showScreen('start'));

bestDisp.textContent = bestScore;
bestVal.textContent  = bestScore;

// ── Touch controls ─────────────────────────────────────────────
const touchDiv = document.createElement('div');
touchDiv.id = 'touch-controls';
touchDiv.innerHTML = `
  <div class="dpad">
    <button class="dpad-btn up">▲</button>
    <button class="dpad-btn left">◀</button>
    <button class="dpad-btn down">▼</button>
    <button class="dpad-btn right">▶</button>
  </div>`;
document.body.appendChild(touchDiv);

touchDiv.querySelector('.up').addEventListener('touchstart',    e => { e.preventDefault(); move(0,-1); });
touchDiv.querySelector('.down').addEventListener('touchstart',  e => { e.preventDefault(); move(0, 1); });
touchDiv.querySelector('.left').addEventListener('touchstart',  e => { e.preventDefault(); move(-1,0); });
touchDiv.querySelector('.right').addEventListener('touchstart', e => { e.preventDefault(); move( 1,0); });

// ── Lane types ─────────────────────────────────────────────────
// Each lane: { type: 'grass'|'road'|'water'|'rail', vehicles: [], speed, dir, logGaps }

function buildLanes(count) {
  const lanes = [];
  // bottom safe grass
  lanes.push({ type: 'grass', vehicles: [], speed: 0, dir: 1 });

  for (let i = 1; i < count; i++) {
    const difficulty = i / count;
    const roll = Math.random();

    // First few rows always safe grass or road
    if (i <= 2) {
      lanes.push(makeLane('road', difficulty));
      continue;
    }

    if (roll < 0.30) {
      lanes.push({ type: 'grass', vehicles: [], speed: 0, dir: 1 });
    } else if (roll < 0.60) {
      lanes.push(makeLane('road', difficulty));
    } else if (roll < 0.82) {
      lanes.push(makeLane('water', difficulty));
    } else {
      lanes.push(makeLane('rail', difficulty));
    }
  }
  return lanes;
}

function makeLane(type, diff) {
  const dir     = Math.random() < 0.5 ? 1 : -1;
  const baseSpd = type === 'water' ? 0.6 + diff * 0.8
                : type === 'rail'  ? 3.5 + diff * 2
                :                    0.8 + diff * 2.2;
  const speed   = baseSpd;
  const vehicles = spawnVehicles(type, dir, speed);
  return { type, vehicles, speed, dir };
}

function spawnVehicles(type, dir, speed) {
  const items = [];
  const count = type === 'water' ? 3 : type === 'rail' ? 2 : 4;

  if (type === 'water') {
    // logs
    let x = Math.random() * W;
    for (let i = 0; i < count; i++) {
      const len = 2 + Math.floor(Math.random() * 2); // 2–3 tiles
      items.push({ x, w: len * TILE, h: TILE * 0.55, isLog: true });
      x += len * TILE + TILE * (1.5 + Math.random() * 2);
    }
  } else if (type === 'rail') {
    // train — one long entity
    const trainLen = 5 + Math.floor(Math.random() * 4);
    const startX = dir > 0 ? -trainLen * TILE - 200 : W + 200;
    items.push({ x: startX, w: trainLen * TILE, h: TILE * 0.72, isTrain: true });
  } else {
    // cars
    let x = Math.random() * W;
    for (let i = 0; i < count; i++) {
      const w = TILE * (1.2 + Math.random() * 0.8);
      items.push({ x, w, h: TILE * 0.65 });
      x += w + TILE * (1.2 + Math.random() * 2.5);
    }
  }
  return items;
}

// ── Player ─────────────────────────────────────────────────────
const player = {
  col: START_COL,
  row: SPAWN_ROW,
  x: START_COL * TILE + TILE / 2,  // pixel centre (for smooth animation)
  y: SPAWN_ROW * TILE + TILE / 2,
  tx: 0, ty: 0,         // animation targets
  animating: false,
  animT: 0,             // 0..1
  dead: false,
  trail: [],
  onLog: null,
};

function resetPlayer() {
  player.col = START_COL;
  player.row = SPAWN_ROW;
  player.x   = START_COL * TILE + TILE / 2;
  player.y   = SPAWN_ROW * TILE + TILE / 2;  // world-space Y
  player.tx  = player.x;
  player.ty  = player.y;
  player.animating = false;
  player.animT     = 0;
  player.dead      = false;
  player.onLog     = null;
  player.trail     = [];
}

// ── Camera (vertical scroll) ───────────────────────────────────
// camY is the world-Y pixel that maps to the TOP of the canvas.
// Increasing camY scrolls the world upward (player goes forward = world moves up).
let camY = 0;
let targetCamY = 0;

// ── World lanes (infinite — generated on demand) ───────────────
let lanes = [];
let laneOriginRow = 0;  // which game-row index is lanes[0]

function ensureLanes(neededRow) {
  // neededRow is the furthest row the player can reach (counts upward)
  // lanes[0] = row 0 (safe grass), lanes[1] = row 1, etc.
  while (lanes.length <= neededRow + ROWS) {
    const diff = Math.min(lanes.length / 60, 1);
    const roll = Math.random();
    if (lanes.length <= 2) {
      lanes.push({ type: 'grass', vehicles: [], speed: 0, dir: 1 });
    } else if (roll < 0.28) {
      lanes.push({ type: 'grass', vehicles: [], speed: 0, dir: 1 });
    } else if (roll < 0.58) {
      lanes.push(makeLane('road', diff));
    } else if (roll < 0.82) {
      lanes.push(makeLane('water', diff));
    } else {
      lanes.push(makeLane('rail', diff));
    }
  }
}

// ── Game init ──────────────────────────────────────────────────
function initGame() {
  score   = 0;
  maxRow  = SPAWN_ROW;
  // Start camera so frog appears at 65% down the screen
  const startWorldY = SPAWN_ROW * TILE + TILE / 2;
  camY       = startWorldY - H * 0.65;
  targetCamY = camY;
  particles  = [];
  lanes   = buildLanes(ROWS + 10);
  ensureLanes(30);
  resetPlayer();
  scoreVal.textContent = 0;
  bestVal.textContent  = bestScore;
  scoreCard.classList.remove('active-x');
}

// ── Show / hide screens ─────────────────────────────────────────
function showScreen(which) {
  gameState = which === 'playing' ? 'playing' : which;
  [startScreen, gameScreen, deadScreen].forEach(s => s.classList.remove('active'));

  if (which === 'start') {
    startScreen.classList.add('active');
    bestDisp.textContent = bestScore;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  } else if (which === 'playing') {
    gameScreen.classList.add('active');
  } else if (which === 'dead') {
    deadScreen.classList.add('active');
    finalScore.textContent = score;
    finalBest.textContent  = bestScore;
    // restart dead screen animation
    const inner = deadScreen.querySelector('.screen-inner');
    inner.style.animation = 'none';
    void inner.offsetWidth;
    inner.style.animation = '';
  }
}

function startGame() {
  initGame();
  showScreen('playing');
  loop();
}

// ── Input ──────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (gameState !== 'playing') return;
  const map = {
    ArrowUp: [0,-1], ArrowDown: [0,1], ArrowLeft: [-1,0], ArrowRight: [1,0],
    w: [0,-1], s: [0,1], a: [-1,0], d: [1,0],
    W: [0,-1], S: [0,1], A: [-1,0], D: [1,0],
  };
  const dir = map[e.key];
  if (dir) { e.preventDefault(); move(dir[0], dir[1]); }
});

function move(dc, dr) {
  if (player.dead || player.animating) return;

  const nc = player.col + dc;
  const nr = player.row + dr;

  if (nc < 0 || nc >= COLS) return;        // wall
  if (nr > SPAWN_ROW)       return;        // can't go behind start

  // clamp upward movement to lanes available
  const laneIdx = laneIndexFor(nr);
  if (laneIdx < 0) return;

  player.col = nc;
  player.row = nr;
  player.tx  = nc * TILE + TILE / 2;
  player.ty  = nr * TILE + TILE / 2;   // world-space Y target
  player.animating = true;
  player.animT     = 0;
  player.onLog     = null;

  Sounds.hop();

  // Always track camera to frog — screen_y = world_y - camY, pin at 65% down
  targetCamY = (nr * TILE + TILE / 2) - H * 0.65;

  // Score — moving forward (up)
  if (nr < maxRow) {
    maxRow = nr;
    score++;
    scoreVal.textContent = score;
    scoreCard.classList.add('active-x');
    setTimeout(() => scoreCard.classList.remove('active-x'), 300);
    Sounds.score();
  }

  ensureLanes(SPAWN_ROW - nr + ROWS + 10);
}

// ── Lane index helper ──────────────────────────────────────────
// player.row 0 = safe spawn (SPAWN_ROW), decreasing row = moving forward
// lanes[0] = safe row, lanes[1] = first challenge row, etc.
function laneIndexFor(row) {
  return SPAWN_ROW - row;  // converts from grid row to lane array index
}

// ── Collision helpers ──────────────────────────────────────────
function playerPixelX() { return player.x; }
function playerPixelY() { return player.y; }  // world space

function vehicleScreenX(v, laneDir, wrapW) {
  // vehicles wrap; return canonical x
  return v.x;
}

function overlap1D(ax, aw, bx, bw, margin = 4) {
  return ax + margin < bx + bw && ax + aw - margin > bx;
}

// ── Death ──────────────────────────────────────────────────────
function killPlayer(reason) {
  if (player.dead) return;
  player.dead = true;

  const px = player.x;
  const py = player.y;  // world space

  if (reason === 'car' || reason === 'train') {
    spawnParticles(px, py, C.orange, 18);
    triggerShake(reason === 'train' ? 9 : 6);
    Sounds.hit();
  } else if (reason === 'water') {
    spawnParticles(px, py, C.cyan, 14);
    Sounds.splash();
  }

  setTimeout(() => {
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem('crossy_best', bestScore);
    }
    showScreen('dead');
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }, 900);
}

// ── Update ─────────────────────────────────────────────────────
let lastTime = 0;

function update(dt) {
  if (player.dead) return;

  // Smooth camera
  camY += (targetCamY - camY) * 0.12;

  // Animate player hop
  if (player.animating) {
    player.animT += dt * 8;
    if (player.animT >= 1) {
      player.animT     = 1;
      player.animating = false;
    }
    const t  = player.animT;
    const et = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; // ease in-out cubic
    player.x = lerp(player.x, player.tx, 0.25);
    player.y = lerp(player.y, player.ty, 0.25);
  }

  // Update trail
  player.trail.push({ x: player.x, y: player.y });
  if (player.trail.length > 8) player.trail.shift();

  // Update vehicles
  lanes.forEach((lane, li) => {
    if (lane.type === 'grass') return;
    const wrapW = W + 200;

    lane.vehicles.forEach(v => {
      v.x += lane.dir * lane.speed;

      // Wrap around
      if (lane.dir > 0 && v.x > W + 100)       v.x = -v.w - 100;
      if (lane.dir < 0 && v.x + v.w < -100)    v.x = W + 100;
    });
  });

  // ── Collision check ────────────────────────────────────────
  const laneIdx = laneIndexFor(player.row);
  if (laneIdx < 0 || laneIdx >= lanes.length) return;
  const lane = lanes[laneIdx];

  const px = player.x - TILE * 0.32;
  const pw = TILE * 0.64;

  if (lane.type === 'road' || lane.type === 'rail') {
    for (const v of lane.vehicles) {
      if (overlap1D(px, pw, v.x, v.w, 6)) {
        killPlayer(lane.type === 'rail' ? 'train' : 'car');
        return;
      }
    }
  }

  if (lane.type === 'water') {
    // Must be on a log
    let onLog = false;
    for (const v of lane.vehicles) {
      if (overlap1D(px, pw, v.x, v.w, -4)) {
        onLog = true;
        player.onLog = v;
        break;
      }
    }
    if (!onLog) {
      killPlayer('water');
      return;
    }
    // Ride the log
    if (player.onLog) {
      player.x += lane.dir * lane.speed;
      player.tx  = player.x;
      // Check if washed off screen
      if (player.x < TILE * 0.4 || player.x > W - TILE * 0.4) {
        killPlayer('water');
        return;
      }
      player.col = Math.round((player.x - TILE / 2) / TILE);
    }
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }

// ── Draw ───────────────────────────────────────────────────────
function draw(ts) {
  ctx.clearRect(0, 0, W, H);

  // Apply camera + optional shake via a single translate
  ctx.save();
  const scrollY = Math.round(camY);
  ctx.translate(shake.t > 0 ? shake.x : 0, (shake.t > 0 ? shake.y : 0) - scrollY);

  if (shake.t > 0) {
    shake.t--;
    shake.x *= 0.7;
    shake.y *= 0.7;
  }

  // ── Draw lanes (world space) ──────────────────────────────
  for (let li = 0; li < lanes.length; li++) {
    const lane = lanes[li];
    // lanes[0] = SPAWN_ROW, lanes[1] = SPAWN_ROW-1, etc.
    const rowIndex = SPAWN_ROW - li;
    const worldY   = rowIndex * TILE;          // world-space top of this row

    // Cull rows outside visible window (world-space check)
    if (worldY + TILE < scrollY || worldY > scrollY + H) continue;

    drawLaneBg(lane, worldY, li);

    lane.vehicles.forEach(v => {
      drawVehicle(lane, v, worldY);
    });
  }

  // ── Draw player (world space) ─────────────────────────────
  const px = player.x;
  const py = player.y;   // already in world space

  drawTrail(ctx, { x: px, y: py, trail: [...player.trail], r: TILE * 0.28 }, C.orange);

  if (!player.dead) {
    drawFrog(ctx, px, py, TILE * 0.4, ts);
  }

  // Particles drawn in world space too
  drawParticles(ctx);

  ctx.restore();
}

// ── Lane background ─────────────────────────────────────────────
function drawLaneBg(lane, sy, li) {
  const stripe = li % 2 === 0;
  if (lane.type === 'grass') {
    ctx.fillStyle = stripe ? C.grass : C.grass2;
    ctx.fillRect(0, sy, W, TILE);
    // Draw little grass tufts
    ctx.fillStyle = 'rgba(40,80,50,0.4)';
    for (let gx = TILE * 0.25; gx < W; gx += TILE) {
      ctx.beginPath();
      ctx.ellipse(gx + (li * 7 % 20), sy + TILE * 0.7, 4, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (lane.type === 'road') {
    ctx.fillStyle = stripe ? C.road : C.road2;
    ctx.fillRect(0, sy, W, TILE);
    // Road dashes
    ctx.fillStyle = 'rgba(100,116,139,0.18)';
    ctx.fillRect(0, sy + TILE * 0.48, W, 2);
  } else if (lane.type === 'water') {
    ctx.fillStyle = stripe ? C.water : C.water2;
    ctx.fillRect(0, sy, W, TILE);
    // Water shimmer
    const shimmerX = (Date.now() * 0.04) % (TILE * 2);
    ctx.fillStyle = 'rgba(56,189,248,0.07)';
    for (let wx = -TILE + shimmerX; wx < W + TILE; wx += TILE * 2) {
      ctx.beginPath();
      ctx.ellipse(wx, sy + TILE * 0.5, TILE * 0.7, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (lane.type === 'rail') {
    ctx.fillStyle = stripe ? C.rail : '#202030';
    ctx.fillRect(0, sy, W, TILE);
    // Rail tracks
    ctx.fillStyle = 'rgba(100,116,139,0.3)';
    ctx.fillRect(0, sy + TILE * 0.30, W, 4);
    ctx.fillRect(0, sy + TILE * 0.65, W, 4);
    // Rail ties
    ctx.fillStyle = 'rgba(80,60,40,0.35)';
    for (let tx = 4; tx < W; tx += 28) {
      ctx.fillRect(tx, sy + TILE * 0.26, 10, TILE * 0.46);
    }
  }
}

// ── Vehicle draw ────────────────────────────────────────────────
function drawVehicle(lane, v, sy) {
  const vy = sy + TILE * 0.5;

  if (v.isLog) {
    // Log
    const r = 6;
    ctx.fillStyle = C.log;
    roundRect(ctx, v.x, sy + TILE * 0.22, v.w, TILE * 0.55, r);
    ctx.fill();
    // Wood grain
    ctx.fillStyle = C.log2;
    for (let lx = v.x + 10; lx < v.x + v.w - 8; lx += 14) {
      ctx.beginPath();
      ctx.ellipse(lx, sy + TILE * 0.5, 3, TILE * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // End caps
    ctx.fillStyle = 'rgba(180,120,60,0.25)';
    ctx.beginPath(); ctx.ellipse(v.x + 6, sy + TILE * 0.5, 5, TILE * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(v.x + v.w - 6, sy + TILE * 0.5, 5, TILE * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    return;
  }

  if (v.isTrain) {
    // Train
    const h = v.h;
    const ty = sy + (TILE - h) * 0.5;
    ctx.fillStyle = C.orange;
    roundRect(ctx, v.x, ty, v.w, h, 5);
    ctx.fill();
    // Windows
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    const wCount = Math.floor(v.w / TILE);
    for (let wi = 0; wi < wCount; wi++) {
      ctx.fillRect(v.x + wi * TILE + TILE * 0.15, ty + h * 0.18, TILE * 0.65, h * 0.38);
    }
    // Stripe
    ctx.fillStyle = 'rgba(249,115,22,0.5)';
    ctx.fillRect(v.x, ty + h * 0.62, v.w, h * 0.1);
    return;
  }

  // Car
  const dir = lane.dir;
  const carH = v.h;
  const cy = sy + (TILE - carH) * 0.5;

  // Car colour cycles
  const hue = (laneColourFor(lane) + v.w * 0.3) % 360;
  ctx.fillStyle = dir > 0 ? lighten(C.orange, 0.1) : lighten(C.cyan, 0.1);
  roundRect(ctx, v.x, cy, v.w, carH, 5);
  ctx.fill();

  // Windshield
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  if (dir > 0) {
    ctx.fillRect(v.x + v.w * 0.58, cy + carH * 0.12, v.w * 0.28, carH * 0.45);
  } else {
    ctx.fillRect(v.x + v.w * 0.14, cy + carH * 0.12, v.w * 0.28, carH * 0.45);
  }

  // Headlights
  ctx.fillStyle = 'rgba(255,240,180,0.85)';
  const hlX = dir > 0 ? v.x + v.w - 6 : v.x + 2;
  ctx.beginPath(); ctx.arc(hlX, cy + carH * 0.28, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(hlX, cy + carH * 0.72, 3, 0, Math.PI * 2); ctx.fill();

  // Tail lights
  ctx.fillStyle = 'rgba(249,115,22,0.7)';
  const tlX = dir > 0 ? v.x + 2 : v.x + v.w - 6;
  ctx.beginPath(); ctx.arc(tlX, cy + carH * 0.28, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(tlX, cy + carH * 0.72, 2.5, 0, Math.PI * 2); ctx.fill();
}

let _laneColMap = new WeakMap();
function laneColourFor(lane) {
  if (!_laneColMap.has(lane)) _laneColMap.set(lane, Math.random() * 360);
  return _laneColMap.get(lane);
}

function lighten(hex, amt) { return hex; } // placeholder — colours already set by palette

// ── Frog draw ──────────────────────────────────────────────────
function drawFrog(ctx, cx, cy, r, ts) {
  const bob = Math.sin(ts * 0.003) * 1.5;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.85 + bob, r * 0.7, r * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = C.orange;
  ctx.beginPath();
  ctx.ellipse(cx, cy + bob, r * 0.78, r * 0.68, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly
  ctx.fillStyle = 'rgba(255,200,140,0.55)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.12 + bob, r * 0.42, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes (cyan)
  const eyeY = cy - r * 0.22 + bob;
  ctx.fillStyle = C.cyan;
  ctx.beginPath(); ctx.arc(cx - r * 0.32, eyeY, r * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.32, eyeY, r * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0a0a0f';
  ctx.beginPath(); ctx.arc(cx - r * 0.30, eyeY, r * 0.11, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.30, eyeY, r * 0.11, 0, Math.PI * 2); ctx.fill();
  // Eye shine
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.arc(cx - r * 0.26, eyeY - r * 0.07, r * 0.05, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.34, eyeY - r * 0.07, r * 0.05, 0, Math.PI * 2); ctx.fill();

  // Legs
  ctx.strokeStyle = C.orange;
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = 'round';
  // Back legs
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.5, cy + r * 0.4 + bob);
  ctx.lineTo(cx - r * 0.9, cy + r * 0.75 + bob);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.5, cy + r * 0.4 + bob);
  ctx.lineTo(cx + r * 0.9, cy + r * 0.75 + bob);
  ctx.stroke();
}

// ── Trail ──────────────────────────────────────────────────────
function drawTrail(ctx, obj, baseColor) {
  if (!obj.trail || !obj.trail.length) return;
  obj.trail.forEach((point, i) => {
    const progress = i / obj.trail.length;
    const alpha = Math.floor(progress * 0.3 * 255).toString(16).padStart(2, '0');
    ctx.beginPath();
    ctx.arc(point.x, point.y, obj.r * progress * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = baseColor + alpha;
    ctx.fill();
  });
}

// ── roundRect helper ───────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Game loop ──────────────────────────────────────────────────
function loop(ts = 0) {
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  update(dt);
  draw(ts);

  rafId = requestAnimationFrame(loop);
}

// ── Boot ───────────────────────────────────────────────────────
showScreen('start');