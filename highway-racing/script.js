/* ─── Safe storage shim (falls back to in-memory if localStorage is blocked) ─── */
(function () {
  try {
    var t = "__ls_test__";
    window.localStorage.setItem(t, "1");
    window.localStorage.removeItem(t);
  } catch (e) {
    var _mem = {};
    var safe = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(_mem, k) ? _mem[k] : null; },
      setItem: function (k, v) { _mem[k] = String(v); },
      removeItem: function (k) { delete _mem[k]; },
      clear: function () { _mem = {}; },
      key: function (i) { return Object.keys(_mem)[i] || null; },
      get length() { return Object.keys(_mem).length; }
    };
    try { Object.defineProperty(window, "localStorage", { value: safe, configurable: true }); }
    catch (e2) { window.localStorage = safe; }
  }
})();

// ============================================================
//  HIGHWAY BLITZ  —  script.js  v5
//  Continuous steering, perspective road with real speed feel,
//  phases, combo, near-miss, power-ups, shop/upgrades, mobile.
// ============================================================

// ── Audio ──────────────────────────────────────────────────
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function tone(freq, type = 'square', dur = 0.08, vol = 0.09, delay = 0) {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = type;
    o.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
    g.gain.setValueAtTime(vol, audioCtx.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + dur);
    o.start(audioCtx.currentTime + delay);
    o.stop(audioCtx.currentTime + delay + dur + 0.01);
  } catch(e) {}
}
const SFX = {
  overtake : () => tone(660,'triangle',0.07,0.07),
  hit      : () => { tone(100,'sawtooth',0.22,0.15); tone(60,'square',0.25,0.10,0.05); },
  coin     : () => tone(880,'sine',0.08,0.06),
  nitro    : () => { for(let i=0;i<4;i++) tone(180+i*70,'sawtooth',0.06,0.07,i*0.04); },
  powerup  : () => { tone(440,'sine',0.12,0.08); tone(660,'sine',0.12,0.06,0.08); },
  nearMiss : () => tone(330,'triangle',0.05,0.06),
  shield   : () => tone(220,'square',0.15,0.08),
  purchase : () => { tone(440,'sine',0.1,0.08); tone(550,'sine',0.1,0.06,0.1); tone(660,'sine',0.15,0.06,0.2); },
  error    : () => tone(120,'square',0.15,0.1),
};

// ── DOM refs ───────────────────────────────────────────────
const $ = id => document.getElementById(id);
const canvas         = $('game-canvas');
const ctx            = canvas.getContext('2d');
const hudScore       = $('hud-score');
const hudLives       = $('hud-lives');
const hudSpeed       = $('hud-speed');
const hudCombo       = $('hud-combo');
const hudPhase       = $('hud-phase-label');
const speedBarFill   = $('speed-bar-fill');
const nitroBarFill   = $('nitro-bar-fill');
const powerupHud     = $('powerup-hud');
const goScore        = $('go-score');
const goBest         = $('go-best');
const goStats        = $('go-stats');
const goCoinsEarned  = $('go-coins-earned');
const titleCoinCount = $('title-coin-count');
const shopCoinCount  = $('shop-coin-count');
const shopGrid       = $('shop-grid');

// ── Persistent bank ────────────────────────────────────────
let bank = parseInt(localStorage.getItem('hb_bank') || '0');
let best = parseInt(localStorage.getItem('hb_best') || '0');
let upgrades = JSON.parse(localStorage.getItem('hb_upgrades') || '{}');

function saveBank() { localStorage.setItem('hb_bank', bank); }
function saveBest()  { localStorage.setItem('hb_best', best); }
function saveUpgrades() { localStorage.setItem('hb_upgrades', JSON.stringify(upgrades)); }

// ── Upgrade definitions ────────────────────────────────────
const UPGRADE_DEFS = [
  { id:'extraLife',   name:'EXTRA LIFE',   icon:'❤️',  desc:'Start each run with +1 life (max 5)',         costs:[150,300], effect:'lives',   max:2 },
  { id:'nitroRegen',  name:'NITRO REGEN',  icon:'⚡',  desc:'Nitro recharges 30% faster per level',        costs:[100,200], effect:'nitro',   max:2 },
  { id:'magnet',      name:'COIN MAGNET',  icon:'🧲',  desc:'Coins are attracted from wider range',         costs:[120,250], effect:'magnet',  max:2 },
  { id:'shieldTime',  name:'SHIELD TIME',  icon:'🛡️', desc:'Shield power-up lasts 2s longer per level',    costs:[120,240], effect:'shield',  max:2 },
  { id:'grip',        name:'RACE GRIP',    icon:'🏎️', desc:'Sharper steering & tighter handling per level',costs:[110,220], effect:'grip',    max:2 },
];

// ── Constants ──────────────────────────────────────────────
const BASE_SPEED = 3.2;
const MAX_SPEED  = 12.0;
const NITRO_MUL  = 1.5;
const SPEED_INC  = 0.00055;
const CAR_W = 40, CAR_H = 68;
const TRUCK_W = 48, TRUCK_H = 100;
const COIN_R = 10;
const NEAR_MISS_DIST = 22;

// Perspective: fraction of road width at the horizon vs at the player
const HORIZON_FRAC   = 0.28;   // road is 28% as wide at the vanishing point
const HORIZON_Y_FRAC = 0.0;    // horizon at very top

// Phase definitions (scenery colour shifts)
const PHASES = [
  { name:'HIGHWAY',   minScore:0,    maxEnemies:4, spawnBase:1300, sky:'#0c1220', grass:'#0a1a12', road:'#15161d' },
  { name:'CITY RUSH', minScore:300,  maxEnemies:5, spawnBase:1000, sky:'#0d0b1a', grass:'#141024', road:'#17151f' },
  { name:'NIGHT JAM', minScore:700,  maxEnemies:6, spawnBase:820,  sky:'#060811', grass:'#0a0e18', road:'#101019' },
  { name:'STORM',     minScore:1200, maxEnemies:7, spawnBase:640,  sky:'#04060a', grass:'#070a10', road:'#0c0d14' },
];

const ENEMY_PALETTE = [
  { body:'#7c3aed', roof:'#5b21b6', glass:'#a78bfa' },
  { body:'#0284c7', roof:'#0369a1', glass:'#7dd3fc' },
  { body:'#059669', roof:'#047857', glass:'#6ee7b7' },
  { body:'#d97706', roof:'#b45309', glass:'#fcd34d' },
  { body:'#db2777', roof:'#be185d', glass:'#f9a8d4' },
  { body:'#0891b2', roof:'#0e7490', glass:'#67e8f9' },
  { body:'#65a30d', roof:'#4d7c0f', glass:'#bef264' },
  { body:'#e11d48', roof:'#9f1239', glass:'#fda4af' },
];

const POWERUP_TYPES = [
  { type:'shield',  icon:'🛡️', color:'#38bdf8', label:'SHIELD',  dur:5000 },
  { type:'slowmo',  icon:'🐢', color:'#a855f7', label:'SLOW-MO', dur:4000 },
  { type:'magnet',  icon:'🧲', color:'#facc15', label:'MAGNET',  dur:5000 },
  { type:'ghost',   icon:'👻', color:'#94a3b8', label:'GHOST',   dur:3500 },
];

const C = {
  bg:'#0a0a0f', border:'#1e1e2e', surface:'#13131a',
  orange:'#f97316', cyan:'#38bdf8', danger:'#ef4444',
  muted:'#64748b', text:'#e2e8f0', yellow:'#facc15', green:'#22c55e',
  purple:'#a855f7',
};

// ── State ──────────────────────────────────────────────────
let W, H, roadLeft, roadRight, roadW, horizonY;
let running = false, paused = false;
let keys = {};

let score, lives, speed, nitro, nitroActive;
let playerX, playerVX, playerY, playerBank; // continuous steering

let enemies, coins, powerups, particles, dashes, rumbles, streaks, floatingTexts;
let frameId, lastTime;
let shakeX = 0, shakeY = 0, shakeTimer = 0;
let invincible = 0;
let distTravelled = 0, scrollY = 0;
let spawnTimer = 0, nextSpawnAt = 1300;
let coinTimer  = 0, nextCoinAt  = 2800;
let puTimer    = 0, nextPuAt    = 6000;

let combo = 0, comboTimer = 0;
const COMBO_TIMEOUT = 4000;

let activePowerup = null, powerupTimer = 0;
let statCars = 0, statCoins = 0, statMaxSpeed = 0, statCoinsEarned = 0;
let currentPhase = 0;
let tutorialEl = null;

const TUTORIALS = [
  { msg:'HOLD ← → TO STEER',      dur:2800, delay:900  },
  { msg:'HOLD SHIFT FOR NITRO',   dur:2800, delay:4200 },
  { msg:'DODGE CARS • GRAB COINS',dur:2800, delay:7500 },
];

// ── Resize ─────────────────────────────────────────────────
function resize() {
  canvas.width  = Math.min(560, window.innerWidth);
  canvas.height = Math.max(320, window.innerHeight
    - $('hud').offsetHeight
    - $('sub-bar').offsetHeight
    - $('mobile-controls').offsetHeight);
  W = canvas.width; H = canvas.height;
  roadW    = W * 0.82;
  roadLeft = (W - roadW) / 2;
  roadRight = roadLeft + roadW;
  horizonY = H * HORIZON_Y_FRAC;
}

// ── Perspective helpers ────────────────────────────────────
// t = 0 at horizon (top), 1 at bottom (player plane)
function perspScale(t) { return HORIZON_FRAC + (1 - HORIZON_FRAC) * t; }
function yToT(y) { return (y - horizonY) / (H - horizonY); }
// Road left/right edge x at a given screen y
function roadEdgeAt(y, side) {
  const t = Math.max(0, Math.min(1, yToT(y)));
  const s = perspScale(t);
  const cx = W / 2;
  const halfW = (roadW / 2) * s;
  return side < 0 ? cx - halfW : cx + halfW;
}
// Scale a world object based on its screen y (things near horizon are smaller)
function depthScale(y) { return perspScale(Math.max(0, Math.min(1, yToT(y)))); }

// ── Scrolling road furniture ───────────────────────────────
function initRoadFurniture() {
  dashes = [];
  const gap = 60;
  for (let y = horizonY; y < H + gap; y += gap) dashes.push({ y });
  rumbles = [];
  const rgap = 34;
  for (let y = horizonY; y < H + rgap; y += rgap) rumbles.push({ y, on: Math.floor(y/rgap)%2===0 });
}
function updateRoadFurniture(dt, sp) {
  const dY = sp * dt * 60;
  scrollY += dY;
  dashes.forEach(m => {
    // move faster as they approach the player (perspective)
    m.y += dY * (0.35 + yToT(m.y) * 1.2);
    if (m.y > H + 40) m.y = horizonY - Math.random()*30;
  });
  rumbles.forEach(m => {
    m.y += dY * (0.35 + yToT(m.y) * 1.2);
    if (m.y > H + 20) { m.y = horizonY - 10; m.on = !m.on; }
  });
}

// ── Particles ──────────────────────────────────────────────
function spawnParticles(x, y, color, n=8, spd=2.5) {
  for (let i=0;i<n;i++) {
    const a=Math.random()*Math.PI*2, s=Math.random()*spd+0.5;
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,
      life:1,decay:0.022+Math.random()*0.03,size:3+Math.random()*4,color});
  }
}
function spawnExhaust(x, y) {
  particles.push({
    x:x+(Math.random()-0.5)*6, y,
    vx:(Math.random()-0.5)*0.4,
    vy: nitroActive ? 2.4+Math.random() : 0.5+Math.random()*0.6,
    life:1, decay:0.05+Math.random()*0.05,
    size: nitroActive ? 8+Math.random()*5 : 2+Math.random()*2.5,
    color: nitroActive ? C.orange : C.muted,
  });
}

function addFloatingText(x, y, text, color='#facc15', size=18) {
  floatingTexts.push({ x, y, text, color, size, life:1, decay:0.018 });
}

// ── Init ───────────────────────────────────────────────────
function initGame() {
  const upg = lv => parseInt(upgrades[lv] || 0);

  score=0; distTravelled=0; scrollY=0; speed=BASE_SPEED; nitro=1; nitroActive=false;
  invincible=0; shakeX=shakeY=shakeTimer=0;
  spawnTimer=0; nextSpawnAt=1300;
  coinTimer=0;  nextCoinAt=2800;
  puTimer=0;    nextPuAt=6000;
  combo=0; comboTimer=0;
  activePowerup=null; powerupTimer=0;
  currentPhase=0;
  statCars=0; statCoins=0; statMaxSpeed=0; statCoinsEarned=0;

  lives = 3 + upg('extraLife');

  playerX = W / 2;
  playerVX = 0;
  playerBank = 0;
  playerY = H - 96;

  enemies=[]; coins=[]; powerups=[]; particles=[]; floatingTexts=[];
  initRoadFurniture();

  TUTORIALS.forEach(t => setTimeout(() => { if (running) showToast(t.msg, t.dur); }, t.delay));
}

// ── Tutorial toast ─────────────────────────────────────────
function showToast(msg, dur=2500) {
  if (tutorialEl) { tutorialEl.remove(); tutorialEl=null; }
  const el = document.createElement('div');
  el.id='tutorial-toast'; el.textContent=msg;
  document.body.appendChild(el);
  tutorialEl = el;
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => { if(tutorialEl===el){el.remove(); tutorialEl=null;} }, 450);
  }, dur);
}

// ── Spawn helpers (continuous positions across road) ───────
// Keep a notion of columns just to avoid overlaps, but positions are continuous.
function randomRoadX(margin) {
  const m = margin || CAR_W*0.7;
  return roadLeft + m + Math.random() * (roadW - 2*m);
}
function spotClear(x, minDist) {
  return enemies.every(e => !(e.y < 140 && Math.abs(e.x - x) < minDist));
}
function trySpawnEnemy() {
  const phase = PHASES[currentPhase];
  if (enemies.length >= phase.maxEnemies) return;
  const isTruck = Math.random() < 0.2;
  const w = isTruck?TRUCK_W:CAR_W, h = isTruck?TRUCK_H:CAR_H;
  let x=0, ok=false;
  for (let tries=0; tries<8; tries++) {
    x = randomRoadX(w*0.7);
    if (spotClear(x, w*1.6)) { ok=true; break; }
  }
  if (!ok) return;
  enemies.push({
    x, y: horizonY - h, w, h, isTruck,
    pal: ENEMY_PALETTE[Math.floor(Math.random()*ENEMY_PALETTE.length)],
    passed:false, nearMissed:false,
    speedMul: 0.30 + Math.random()*0.22,   // enemy world speed relative to scroll
  });
}
function spawnCoin() {
  coins.push({ x:randomRoadX(), y:horizonY-COIN_R, pulse:0, collected:false });
}
function spawnPowerup() {
  const def = POWERUP_TYPES[Math.floor(Math.random()*POWERUP_TYPES.length)];
  powerups.push({ x:randomRoadX(), y:horizonY-20, def, pulse:0, collected:false });
}

function updatePhase() {
  for (let i = PHASES.length-1; i >= 0; i--) {
    if (score >= PHASES[i].minScore) {
      if (i !== currentPhase) { currentPhase = i; showToast('⚡ ' + PHASES[i].name, 2000); }
      break;
    }
  }
}

function applyPowerup(def) {
  activePowerup = def.type;
  const upg = parseInt(upgrades['shieldTime']||0);
  const bonus = def.type==='shield' ? upg*2000 : 0;
  powerupTimer = def.dur + bonus;
  SFX.powerup();
  addFloatingText(playerX, playerY-40, def.label, def.color, 20);
}

// ── Update ─────────────────────────────────────────────────
function update(dt) {
  if (!running || paused) return;

  updatePhase();
  const phase = PHASES[currentPhase];

  speed = Math.min(MAX_SPEED, speed + SPEED_INC*dt*60);
  const sp = nitroActive ? speed*NITRO_MUL : speed;
  const worldSp = activePowerup==='slowmo' ? sp*0.45 : sp;

  distTravelled += sp*dt*60;
  score = Math.floor(distTravelled/10);
  const kmh = Math.round(sp*18);
  if (kmh > statMaxSpeed) statMaxSpeed = kmh;

  // ── Continuous steering with momentum ──
  const gripLv = parseInt(upgrades['grip']||0);
  const accel  = (0.9 + gripLv*0.22);        // steering acceleration
  const maxVX  = (5.2 + gripLv*0.9) * (sp/BASE_SPEED) * 0.5 + 2.4;
  const left  = keys['ArrowLeft']||keys['KeyA']||keys['mobileLeft'];
  const right = keys['ArrowRight']||keys['KeyD']||keys['mobileRight'];
  if (left && !right)      playerVX -= accel * dt * 60;
  else if (right && !left) playerVX += accel * dt * 60;
  else                     playerVX *= Math.pow(0.82, dt*60);   // friction / self-centering
  playerVX = Math.max(-maxVX, Math.min(maxVX, playerVX));
  playerX += playerVX * dt * 60;

  // Clamp to road edges at the player's plane (with soft bounce)
  const edgeL = roadEdgeAt(playerY, -1) + CAR_W*0.5;
  const edgeR = roadEdgeAt(playerY,  1) - CAR_W*0.5;
  if (playerX < edgeL) { playerX = edgeL; playerVX *= -0.3; }
  if (playerX > edgeR) { playerX = edgeR; playerVX *= -0.3; }

  // Car bank (visual tilt toward steer direction)
  const targetBank = Math.max(-1, Math.min(1, playerVX / maxVX));
  playerBank += (targetBank - playerBank) * Math.min(1, 10*dt);

  // Nitro
  const nitroRegenMul = 1 + 0.3*parseInt(upgrades['nitroRegen']||0);
  const nitroHeld = keys['ShiftLeft']||keys['ShiftRight']||keys['mobileNitro'];
  if (nitroActive) {
    nitro = Math.max(0, nitro - 0.004*dt*60);
    if (nitro <= 0) { nitroActive=false; nitro=0; }
  } else if (!nitroHeld) {
    nitro = Math.min(1, nitro + 0.0011*nitroRegenMul*dt*60);
  }
  if (nitroHeld && nitro>0 && !nitroActive) { nitroActive=true; SFX.nitro(); }

  if (invincible>0) invincible-=dt*1000;
  if (combo>0) { comboTimer-=dt*1000; if (comboTimer<=0){combo=0;comboTimer=0;} }
  if (activePowerup) { powerupTimer-=dt*1000; if (powerupTimer<=0){activePowerup=null;powerupTimer=0;} }

  if (Math.random()<0.4) spawnExhaust(playerX-CAR_W*0.2, playerY+CAR_H/2+2);
  if (Math.random()<0.4) spawnExhaust(playerX+CAR_W*0.2, playerY+CAR_H/2+2);

  updateRoadFurniture(dt, worldSp);

  // Spawn enemies
  spawnTimer+=dt*1000;
  if (spawnTimer>=nextSpawnAt) {
    spawnTimer=0;
    nextSpawnAt = Math.max(phase.spawnBase*0.5, phase.spawnBase - score*0.8);
    trySpawnEnemy();
  }

  const magnetRange = 80 + 55*parseInt(upgrades['magnet']||0);

  // Coins
  coinTimer+=dt*1000;
  if (coinTimer>=nextCoinAt) { coinTimer=0; nextCoinAt=2200+Math.random()*1500; spawnCoin(); }
  coins.forEach(c => {
    c.y += worldSp*dt*60 * (0.4 + yToT(c.y)*1.1);
    c.pulse += 0.1*dt*60;
    if (activePowerup==='magnet') {
      const dist=Math.hypot(playerX-c.x,playerY-c.y);
      if (dist<magnetRange) { c.x+=(playerX-c.x)*0.12*dt*60; c.y+=(playerY-c.y)*0.12*dt*60; }
    }
    if (!c.collected && overlap(playerX,playerY,CAR_W,CAR_H,c.x,c.y,COIN_R*2,COIN_R*2)) {
      c.collected=true;
      const val = 20*(1+Math.floor(combo/3));
      score+=val; statCoins++; statCoinsEarned+=val;
      bank+=val; saveBank();
      SFX.coin();
      spawnParticles(c.x,c.y,C.yellow,10,2.5);
      addFloatingText(c.x,c.y-10,'+'+val,C.yellow,16);
    }
  });
  coins=coins.filter(c=>!c.collected&&c.y<H+20);

  // Power-ups
  puTimer+=dt*1000;
  if (puTimer>=nextPuAt) { puTimer=0; nextPuAt=5500+Math.random()*4500; spawnPowerup(); }
  powerups.forEach(p => {
    p.y+=worldSp*dt*60 * (0.4 + yToT(p.y)*1.1); p.pulse+=0.1*dt*60;
    if (!p.collected && overlap(playerX,playerY,CAR_W,CAR_H,p.x,p.y,28,28)) { p.collected=true; applyPowerup(p.def); }
  });
  powerups=powerups.filter(p=>!p.collected&&p.y<H+30);

  // Enemies
  enemies.forEach(e => {
    // Enemies scroll down toward player; relative speed = scroll * (1 - speedMul)
    e.y += worldSp*dt*60 * (1 - e.speedMul) * (0.5 + yToT(e.y)*1.0);

    if (!e.passed && e.y>playerY+CAR_H) {
      e.passed=true; statCars++;
      combo++; comboTimer=COMBO_TIMEOUT;
      const bonus = 5*combo; score+=bonus;
      SFX.overtake();
      addFloatingText(e.x, playerY-30, '+'+bonus+(combo>1?' x'+combo:''), C.cyan, 14);
      hudCombo.classList.remove('pop'); void hudCombo.offsetWidth; hudCombo.classList.add('pop');
    }

    if (!e.nearMissed && !e.passed) {
      const distX = Math.abs(playerX - e.x), distY = Math.abs(playerY - e.y);
      if (distY < CAR_H*1.2 && distX < (CAR_W+e.w)/2 + NEAR_MISS_DIST && distX > (CAR_W+e.w)/2 - 4) {
        e.nearMissed=true; score+=15; SFX.nearMiss();
        addFloatingText(playerX, playerY-50, 'NEAR MISS! +15', '#fb923c', 15);
      }
    }

    const isGhost = activePowerup==='ghost';
    const isShield = activePowerup==='shield';
    if (invincible<=0 && !isGhost && overlap(playerX,playerY,CAR_W,CAR_H,e.x,e.y,e.w,e.h)) {
      if (isShield) {
        activePowerup=null; powerupTimer=0; SFX.shield(); invincible=600;
        spawnParticles(playerX,playerY,C.cyan,18,4);
        addFloatingText(playerX,playerY-40,'SHIELD BLOCKED!',C.cyan,16);
      } else {
        lives--; invincible=2000; combo=0;
        SFX.hit(); triggerShake();
        spawnParticles(playerX,playerY,C.danger,16,4);
        spawnParticles(e.x,e.y,e.pal.body,10,3);
        addFloatingText(playerX,playerY-40,'CRASH!',C.danger,18);
        playerVX *= -0.5;
        if (lives<=0) { endGame(); return; }
      }
    }
  });
  enemies=enemies.filter(e=>e.y<H+e.h+20);

  particles.forEach(p => { p.x+=p.vx*dt*60; p.y-=p.vy*dt*60; p.life-=p.decay*dt*60; });
  particles=particles.filter(p=>p.life>0);

  floatingTexts.forEach(t => { t.y-=0.8*dt*60; t.life-=t.decay*dt*60; });
  floatingTexts=floatingTexts.filter(t=>t.life>0);

  if (shakeTimer>0) { shakeTimer-=dt*1000; shakeX=(Math.random()-0.5)*9; shakeY=(Math.random()-0.5)*9; }
  else shakeX=shakeY=0;
}

function triggerShake(d=350) { shakeTimer=d; }

function overlap(ax,ay,aw,ah,bx,by,bw,bh) {
  return Math.abs(ax-bx)<(aw+bw)/2-6 && Math.abs(ay-by)<(ah+bh)/2-6;
}

// ════════════════════════════════════════════════════════════
//  DRAWING
// ════════════════════════════════════════════════════════════
function rr(cx,cy,w,h,r,fill,stroke,sw=1.5) {
  const x=cx-w/2, y=cy-h/2;
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.arcTo(x+w,y,x+w,y+r,r); ctx.lineTo(x+w,y+h-r);
  ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
  ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r);
  ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
  if(fill){ ctx.fillStyle=fill; ctx.fill(); }
  if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=sw; ctx.stroke(); }
}

// ── Road with perspective ──────────────────────────────────
function drawRoad() {
  const phase = PHASES[currentPhase];

  // Sky / distance gradient
  const sky = ctx.createLinearGradient(0,horizonY,0,H*0.42);
  sky.addColorStop(0, phase.sky);
  sky.addColorStop(1, C.bg);
  ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);

  // Grass / verge (fills whole area; road drawn on top)
  ctx.fillStyle=phase.grass; ctx.fillRect(0,0,W,H);

  // Road trapezoid (narrow at horizon, wide at bottom)
  const topL = roadEdgeAt(horizonY,-1), topR = roadEdgeAt(horizonY,1);
  const botL = roadEdgeAt(H,-1),        botR = roadEdgeAt(H,1);
  const rg = ctx.createLinearGradient(0,horizonY,0,H);
  rg.addColorStop(0, phase.road);
  rg.addColorStop(1, '#0e0f16');
  ctx.beginPath();
  ctx.moveTo(topL,horizonY); ctx.lineTo(topR,horizonY);
  ctx.lineTo(botR,H); ctx.lineTo(botL,H); ctx.closePath();
  ctx.fillStyle=rg; ctx.fill();

  // Rumble strips (alternating orange/cyan-ish edges) along both sides
  rumbles.forEach(m=>{
    const y=m.y; if (y<horizonY||y>H) return;
    const t=yToT(y);
    const seg = Math.max(3, 26*perspScale(t)); // vertical length scaled
    const lx=roadEdgeAt(y,-1), rx=roadEdgeAt(y,1);
    const wRum=Math.max(2, 10*perspScale(t));
    ctx.fillStyle = m.on ? C.orange : '#f8fafc';
    ctx.fillRect(lx-wRum, y, wRum, seg*0.6);
    ctx.fillStyle = m.on ? C.cyan : '#f8fafc';
    ctx.fillRect(rx, y, wRum, seg*0.6);
  });

  // Centre dashed line (single, down the middle) with perspective width
  dashes.forEach(m=>{
    const y=m.y; if (y<horizonY||y>H) return;
    const t=yToT(y);
    const cx=W/2;
    const wDash=Math.max(1.5, 7*perspScale(t));
    const len=Math.max(6, 34*perspScale(t));
    ctx.fillStyle='rgba(226,232,240,0.85)';
    ctx.fillRect(cx-wDash/2, y, wDash, len*0.5);
  });

  // Quarter lane hints (faint) at 1/4 and 3/4
  dashes.forEach(m=>{
    const y=m.y; if (y<horizonY||y>H) return;
    const t=yToT(y);
    for (const frac of [0.25,0.75]) {
      const lx=roadEdgeAt(y,-1), rx=roadEdgeAt(y,1);
      const x=lx+(rx-lx)*frac;
      const wDash=Math.max(1, 4*perspScale(t));
      ctx.fillStyle='rgba(100,116,139,0.30)';
      ctx.fillRect(x-wDash/2, y, wDash, Math.max(4,20*perspScale(t))*0.5);
    }
  });

  // Storm rain streaks
  if (currentPhase===3) {
    ctx.save(); ctx.globalAlpha=0.08; ctx.strokeStyle='#93c5fd'; ctx.lineWidth=1;
    for(let i=0;i<20;i++){ const rx=Math.random()*W, ry=Math.random()*H;
      ctx.beginPath(); ctx.moveTo(rx,ry); ctx.lineTo(rx-3,ry+20); ctx.stroke(); }
    ctx.restore();
  }
}

// ── Speed streaks along the sides (intensify with speed) ───
function drawSpeedStreaks() {
  const frac = (speed-BASE_SPEED)/(MAX_SPEED-BASE_SPEED);
  const intensity = nitroActive ? 1 : frac;
  if (intensity < 0.25 && !nitroActive) return;
  const n = Math.floor(4 + intensity*10);
  ctx.strokeStyle = `rgba(56,189,248,${0.05+intensity*0.14})`;
  ctx.lineWidth = 2;
  for (let i=0;i<n;i++){
    const side = Math.random()<0.5 ? -1 : 1;
    const y = horizonY + Math.random()*(H-horizonY);
    const edge = roadEdgeAt(y, side);
    const off = (10 + Math.random()*40) * side;
    const len = 20 + intensity*60;
    ctx.beginPath(); ctx.moveTo(edge+off, y); ctx.lineTo(edge+off, y+len); ctx.stroke();
  }
}

// ── Player race car (top-down) with banking ────────────────
function drawCar(x, y, scale, bank, pal, isPlayer) {
  const w=CAR_W*scale, h=CAR_H*scale;
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(bank*0.12);          // subtle tilt into turn
  ctx.scale(1 + Math.abs(bank)*0.04, 1); // slight squash

  // Shadow
  ctx.save(); ctx.globalAlpha=0.22; rr(3,5,w+5,h+5,10,'#000',null); ctx.restore();

  const body = isPlayer ? (activePowerup==='shield'?'#0ea5e9':C.cyan) : pal.body;
  const roof = isPlayer ? '#0284c7' : pal.roof;
  const glass= isPlayer ? '#bae6fd' : pal.glass;

  // Main body
  rr(0,0,w,h,9,body,'rgba(0,0,0,0.35)',2);
  // Nose taper (front lighter)
  rr(0,h*0.30,w*0.80,h*0.34,7,isPlayer?'#0ea5e9':pal.roof,null);
  // Racing stripe (player only) / roof panel
  if (isPlayer) {
    ctx.fillStyle='rgba(255,255,255,0.85)';
    ctx.fillRect(-w*0.09, -h*0.42, w*0.18, h*0.84);
  }
  // Cockpit / roof
  rr(0,-h*0.05,w*0.66,h*0.34,7,roof,null);
  // Windshield
  rr(0,h*0.14,w*0.56,h*0.14,4,glass,null);
  // Rear window
  rr(0,-h*0.22,w*0.50,h*0.10,4,glass+'99',null);
  // Side mirrors
  rr(-w*0.55,h*0.06,w*0.14,h*0.05,2,body,null);
  rr( w*0.55,h*0.06,w*0.14,h*0.05,2,body,null);

  // Wheels (dark, poking out)
  const wOX=w*0.5+2*scale, wW=8*scale, wH=15*scale;
  for(const wx of [-wOX,wOX]) for(const wy of [-h*0.28,h*0.28]) {
    rr(wx,wy,wW,wH,3,'#0b0f16',null);
    rr(wx,wy,wW*0.6,wH*0.7,2, isPlayer?'#334155':'#1e293b',null);
  }
  // Rear spoiler
  rr(0,-h*0.46,w*1.05,h*0.09,3, isPlayer?'#0369a1':pal.roof,'rgba(0,0,0,0.4)',1.5);

  // Headlights (front = bottom)
  for(const lx of [-w*0.26,w*0.26]) rr(lx,h*0.5-4*scale,6*scale,4*scale,2,'#fef9c3',null);
  // Taillights (rear = top)
  for(const lx of [-w*0.26,w*0.26]) rr(lx,-h*0.5+4*scale,6*scale,4*scale,2,'#ef4444',null);

  // Shield bubble
  if (isPlayer && activePowerup==='shield') {
    ctx.globalAlpha=0.25+Math.sin(Date.now()/200)*0.1;
    ctx.beginPath(); ctx.ellipse(0,0,w*0.95,h*0.68,0,0,Math.PI*2);
    ctx.strokeStyle=C.cyan; ctx.lineWidth=3; ctx.stroke();
    ctx.globalAlpha=1;
  }
  ctx.restore();
}

function drawTruck(x,y,scale,pal) {
  const w=TRUCK_W*scale, h=TRUCK_H*scale;
  ctx.save(); ctx.translate(x,y);
  ctx.save(); ctx.globalAlpha=0.2; rr(4,6,w+6,h+6,10,'#000',null); ctx.restore();
  // Trailer
  rr(0,h*0.10,w*0.94,h*0.62,5,pal.roof,'rgba(0,0,0,0.4)',2);
  ctx.save(); ctx.globalAlpha=0.12;
  for(let i=-1;i<=1;i++) rr(i*w*0.28,h*0.10,3*scale,h*0.58,1,'#fff',null);
  ctx.restore();
  // Cab
  rr(0,-h*0.30,w,h*0.28,7,pal.body,null);
  rr(0,-h*0.34,w*0.64,h*0.12,4,pal.glass,null);
  // Wheels
  const wOX=w*0.5+2*scale;
  for(const wx of [-wOX,wOX]) for(const wy of [-h*0.30,h*0.05,h*0.30]) {
    rr(wx,wy,9*scale,15*scale,3,'#0b0f16',null);
  }
  for(const lx of [-w*0.26,w*0.26]) rr(lx,h*0.5-5*scale,7*scale,4*scale,2,'#fef9c3',null);
  for(const lx of [-w*0.26,w*0.26]) rr(lx,-h*0.5+4*scale,7*scale,4*scale,2,'#ef4444',null);
  ctx.restore();
}

function drawCoin(c) {
  const s=depthScale(c.y);
  const pls=(0.9+Math.sin(c.pulse)*0.10)*s;
  ctx.save(); ctx.translate(c.x,c.y); ctx.scale(pls,pls);
  const g=ctx.createRadialGradient(0,0,3,0,0,COIN_R+7);
  g.addColorStop(0,C.yellow); g.addColorStop(1,'rgba(250,204,21,0)');
  ctx.beginPath(); ctx.arc(0,0,COIN_R+7,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
  ctx.beginPath(); ctx.arc(0,0,COIN_R,0,Math.PI*2); ctx.fillStyle=C.yellow; ctx.fill();
  ctx.strokeStyle='#fef08a'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle='#78350f'; ctx.font='bold 11px sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('$',0,0);
  ctx.restore();
}

function drawPowerup(p) {
  const s=depthScale(p.y);
  const pls=(0.9+Math.sin(p.pulse)*0.12)*s;
  ctx.save(); ctx.translate(p.x,p.y); ctx.scale(pls,pls);
  const g=ctx.createRadialGradient(0,0,4,0,0,18);
  g.addColorStop(0,p.def.color+'cc'); g.addColorStop(1,p.def.color+'00');
  ctx.beginPath(); ctx.arc(0,0,18,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
  rr(0,0,28,28,8,C.surface,p.def.color,2);
  ctx.font='16px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(p.def.icon,0,1);
  ctx.restore();
}

function drawParticles() {
  particles.forEach(p=>{
    ctx.globalAlpha=Math.max(0,p.life);
    ctx.beginPath(); ctx.arc(p.x,p.y,p.size*p.life,0,Math.PI*2);
    ctx.fillStyle=p.color; ctx.fill();
  });
  ctx.globalAlpha=1;
}

function drawFloatingTexts() {
  floatingTexts.forEach(t=>{
    ctx.save();
    ctx.globalAlpha=Math.max(0,t.life);
    ctx.font=`bold ${t.size}px 'Bebas Neue', sans-serif`;
    ctx.fillStyle=t.color; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.strokeStyle='rgba(0,0,0,0.6)'; ctx.lineWidth=3;
    ctx.strokeText(t.text,t.x,t.y); ctx.fillText(t.text,t.x,t.y);
    ctx.restore();
  });
}

// ── Main draw ──────────────────────────────────────────────
function draw() {
  ctx.save();
  if (shakeTimer>0) ctx.translate(shakeX,shakeY);

  ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);
  drawRoad();
  drawSpeedStreaks();
  drawParticles();

  coins.forEach(drawCoin);
  powerups.forEach(drawPowerup);

  // Enemies (scaled by depth)
  enemies.forEach(e=>{
    const s=depthScale(e.y);
    if(e.isTruck) drawTruck(e.x,e.y,s,e.pal);
    else          drawCar(e.x,e.y,s,0,e.pal,false);
  });

  // Player
  const blink = invincible>0 && Math.floor(invincible/130)%2===0;
  if (!blink) drawCar(playerX,playerY,1,playerBank,null,true);

  // Nitro flame
  if (nitroActive) {
    const fH=22+Math.random()*14;
    const fg=ctx.createLinearGradient(0,playerY+CAR_H/2,0,playerY+CAR_H/2+fH);
    fg.addColorStop(0,C.yellow); fg.addColorStop(0.5,C.orange); fg.addColorStop(1,'rgba(239,68,68,0)');
    for (const ox of [-CAR_W*0.2, CAR_W*0.2]) {
      ctx.beginPath(); ctx.ellipse(playerX+ox,playerY+CAR_H/2+fH/2,6,fH/2,0,0,Math.PI*2);
      ctx.fillStyle=fg; ctx.fill();
    }
  }

  drawFloatingTexts();
  ctx.restore();
}

// ── HUD update ─────────────────────────────────────────────
function updateHUD() {
  hudScore.textContent = score;
  const sp = nitroActive ? speed*NITRO_MUL : speed;
  hudSpeed.textContent = Math.round(sp*18);
  speedBarFill.style.width = `${((speed-BASE_SPEED)/(MAX_SPEED-BASE_SPEED))*100}%`;
  const maxLives = 3+parseInt(upgrades['extraLife']||0);
  hudLives.textContent = '❤️'.repeat(Math.max(0,lives))+'🖤'.repeat(Math.max(0,maxLives-lives));
  nitroBarFill.style.width = `${nitro*100}%`;
  hudCombo.textContent = combo>1?`x${combo}`:'x1';
  hudPhase.textContent = PHASES[currentPhase].name;
  if (activePowerup) {
    const def = POWERUP_TYPES.find(p=>p.type===activePowerup);
    const secs = Math.ceil(powerupTimer/1000);
    powerupHud.textContent = def?`${def.icon} ${secs}s`:'';
  } else powerupHud.textContent='';
  titleCoinCount.textContent = bank;
  shopCoinCount.textContent  = bank;
}

// ── Loop ───────────────────────────────────────────────────
function loop(ts) {
  if (!running) return;
  const dt = Math.min((ts-(lastTime||ts))/1000, 0.05);
  lastTime=ts;
  update(dt); draw(); updateHUD();
  frameId=requestAnimationFrame(loop);
}

// ── Screen management ──────────────────────────────────────
const SCREENS=['screen-title','screen-shop','screen-game','screen-pause','screen-gameover'];
function showScreen(id) {
  SCREENS.forEach(s=>{ const el=$(s); if(el) el.classList.remove('active'); });
  const el=$(id); if(el) el.classList.add('active');
}

// ── Game flow ──────────────────────────────────────────────
function startGame() {
  ensureAudio(); resize(); initGame();
  running=true; paused=false;
  showScreen('screen-game');
  lastTime=null; frameId=requestAnimationFrame(loop);
}
function pauseGame() {
  if (!running) return;
  paused=true; showScreen('screen-pause'); cancelAnimationFrame(frameId);
}
function resumeGame() {
  paused=false; showScreen('screen-game'); lastTime=null; frameId=requestAnimationFrame(loop);
}
function quitToMenu() {
  running=false; paused=false; cancelAnimationFrame(frameId);
  if (tutorialEl) { tutorialEl.remove(); tutorialEl=null; }
  titleCoinCount.textContent=bank; showScreen('screen-title');
}
function endGame() {
  running=false; cancelAnimationFrame(frameId);
  if (tutorialEl) { tutorialEl.remove(); tutorialEl=null; }
  if (score>best) { best=score; saveBest(); }
  goScore.textContent=score; goBest.textContent=best;
  goStats.innerHTML='';
  const rows=[
    ['CARS DODGED', statCars],
    ['COINS COLLECTED', statCoins],
    ['MAX SPEED', statMaxSpeed+' km/h'],
    ['BEST COMBO', 'x'+combo],
    ['PHASE REACHED', PHASES[currentPhase].name],
  ];
  rows.forEach(([label,val])=>{
    const row=document.createElement('div'); row.className='go-stat-row';
    row.innerHTML=`<span>${label}</span><span class="go-stat-val">${val}</span>`;
    goStats.appendChild(row);
  });
  goCoinsEarned.innerHTML=`<span class="coin-icon">🪙</span> +${statCoinsEarned} COINS`;
  setTimeout(()=>showScreen('screen-gameover'),500);
}

// ── Shop ───────────────────────────────────────────────────
function buildShop() {
  shopGrid.innerHTML='';
  UPGRADE_DEFS.forEach(def=>{
    const lv=parseInt(upgrades[def.id]||0);
    const maxed=lv>=def.max;
    const cost=maxed?0:def.costs[lv];
    const card=document.createElement('div');
    card.className='shop-card'+(maxed?' maxed':'');
    card.innerHTML=`
      <div class="shop-card-icon">${def.icon}</div>
      <div class="shop-card-name">${def.name}</div>
      <div class="shop-card-desc">${def.desc}</div>
      <div class="shop-card-level">LEVEL ${lv}/${def.max}</div>
      ${maxed
        ? `<div class="shop-card-cost" style="color:var(--green)">✓ MAX</div>`
        : `<div class="shop-card-cost"><span class="coin-icon">🪙</span>${cost}</div>
           <button class="shop-btn" data-id="${def.id}" ${bank<cost?'disabled':''}>BUY</button>`
      }`;
    shopGrid.appendChild(card);
  });
}
shopGrid.addEventListener('click', e=>{
  const btn=e.target.closest('.shop-btn'); if (!btn) return;
  const id=btn.dataset.id; const def=UPGRADE_DEFS.find(d=>d.id===id); if (!def) return;
  const lv=parseInt(upgrades[id]||0); const cost=def.costs[lv];
  if (bank<cost) { SFX.error(); return; }
  bank-=cost; upgrades[id]=lv+1; saveBank(); saveUpgrades();
  SFX.purchase(); buildShop();
  shopCoinCount.textContent=bank; titleCoinCount.textContent=bank;
});

// ── Input ──────────────────────────────────────────────────
window.addEventListener('keydown', e=>{
  if (['ArrowLeft','KeyA','ArrowRight','KeyD','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','Space'].includes(e.code)) {
    keys[e.code]=true; e.preventDefault();
  } else if (e.code==='Escape') {
    if (paused) resumeGame(); else if (running) pauseGame();
  }
});
window.addEventListener('keyup', e=>{ keys[e.code]=false; });

// Mobile buttons — hold to steer
function bindHold(id, on, off) {
  const el=$(id); if (!el) return;
  el.addEventListener('pointerdown', e=>{ e.preventDefault(); on(); el.classList.add('pressed'); });
  const release = ()=>{ off(); el.classList.remove('pressed'); };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointerleave', release);
  el.addEventListener('pointercancel', release);
}
bindHold('btn-left',  ()=>keys['mobileLeft']=true,  ()=>keys['mobileLeft']=false);
bindHold('btn-right', ()=>keys['mobileRight']=true, ()=>keys['mobileRight']=false);
bindHold('btn-nitro', ()=>keys['mobileNitro']=true, ()=>keys['mobileNitro']=false);

// Screen buttons
$('btn-start').addEventListener('click',    startGame);
$('btn-shop').addEventListener('click',     ()=>{ buildShop(); showScreen('screen-shop'); });
$('btn-shop-back').addEventListener('click',()=>{ titleCoinCount.textContent=bank; showScreen('screen-title'); });
$('btn-resume').addEventListener('click',   resumeGame);
$('btn-quit').addEventListener('click',     quitToMenu);
$('btn-restart').addEventListener('click',  startGame);
$('btn-go-menu').addEventListener('click',  quitToMenu);

window.addEventListener('resize',()=>{ if(running){ resize(); playerY=H-96; } });

// ── Boot ───────────────────────────────────────────────────
titleCoinCount.textContent = bank;
resize();
