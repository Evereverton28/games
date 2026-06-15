// ============================================================
//  HIGHWAY BLITZ  —  script.js  v4
//  Features: lane-snap, phases, combo, near-miss, power-ups,
//            shop/upgrades, floating text, skid marks, pause,
//            mobile buttons, stats breakdown, tutorial toasts
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
  slowmo   : () => tone(180,'sine',0.2,0.07),
  magnet   : () => tone(550,'triangle',0.1,0.07),
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
];

// ── Constants ──────────────────────────────────────────────
const LANES      = 4;
const BASE_SPEED = 3.0;
const MAX_SPEED  = 11.0;
const NITRO_MUL  = 1.45;
const SPEED_INC  = 0.00055;
const CAR_W = 32, CAR_H = 58;
const TRUCK_W = 37, TRUCK_H = 80;
const COIN_R = 9;
const NEAR_MISS_DIST = 18;   // px — how close counts as near-miss
const LANE_GAP       = 240;  // min gap before another car spawns in same lane

// Phase definitions
const PHASES = [
  { name:'HIGHWAY',   minScore:0,    maxEnemies:3, spawnBase:1500, bg:'#0c0c13', roadTint:0   },
  { name:'CITY RUSH', minScore:300,  maxEnemies:4, spawnBase:1100, bg:'#090c10', roadTint:0.03},
  { name:'NIGHT JAM', minScore:700,  maxEnemies:5, spawnBase:850,  bg:'#06090f', roadTint:0.06},
  { name:'STORM',     minScore:1200, maxEnemies:6, spawnBase:650,  bg:'#040608', roadTint:0.09},
];

const ENEMY_PALETTE = [
  { body:'#7c3aed', roof:'#5b21b6', glass:'#a78bfa' },
  { body:'#0284c7', roof:'#0369a1', glass:'#7dd3fc' },
  { body:'#059669', roof:'#047857', glass:'#6ee7b7' },
  { body:'#d97706', roof:'#b45309', glass:'#fcd34d' },
  { body:'#db2777', roof:'#be185d', glass:'#f9a8d4' },
  { body:'#0891b2', roof:'#0e7490', glass:'#67e8f9' },
  { body:'#65a30d', roof:'#4d7c0f', glass:'#bef264' },
  { body:'#9333ea', roof:'#7e22ce', glass:'#d8b4fe' },
];

// Power-up types
const POWERUP_TYPES = [
  { type:'shield',  icon:'🛡️', color:'#38bdf8', label:'SHIELD',  dur:5000 },
  { type:'slowmo',  icon:'🐢', color:'#a855f7', label:'SLOW-MO', dur:4000 },
  { type:'magnet',  icon:'🧲', color:'#facc15', label:'MAGNET',  dur:5000 },
  { type:'ghost',   icon:'👻', color:'#94a3b8', label:'GHOST',   dur:3500 },
];

const C = {
  bg:'#0a0a0f', road:'#0c0c13', border:'#1e1e2e', surface:'#13131a',
  orange:'#f97316', cyan:'#38bdf8', danger:'#ef4444',
  muted:'#64748b', text:'#e2e8f0', yellow:'#facc15', green:'#22c55e',
  purple:'#a855f7',
};

// ── State ──────────────────────────────────────────────────
let W, H, laneW, roadLeft, roadRight, roadW;
let running = false, paused = false;
let keys = {};

let score, lives, speed, nitro, nitroActive;
let playerLane, playerX, playerTargetX, playerY;
let laneChanging = false, laneChangeCooldown = 0;

let enemies, coins, powerups, particles, roadMarks, skidMarks, floatingTexts;
let frameId, lastTime;
let shakeX = 0, shakeY = 0, shakeTimer = 0;
let invincible = 0;
let distTravelled = 0;
let spawnTimer = 0, nextSpawnAt = 1500;
let coinTimer  = 0, nextCoinAt  = 2800;
let puTimer    = 0, nextPuAt    = 6000;

// Combo / near-miss
let combo = 0, comboTimer = 0;
const COMBO_TIMEOUT = 4000;

// Active power-up
let activePowerup = null, powerupTimer = 0;

// Session stats
let statCars = 0, statCoins = 0, statMaxSpeed = 0, statCoinsEarned = 0;

// Phase
let currentPhase = 0;

// Tutorial
let tutorialStep = 0;
const TUTORIALS = [
  { msg:'← → TO CHANGE LANE', delay:1200, dur:2800 },
  { msg:'HOLD SHIFT FOR NITRO', delay:4500, dur:2800 },
  { msg:'DODGE CARS • GRAB COINS', delay:7800, dur:2800 },
];
let tutorialEl = null;

// ── Resize ─────────────────────────────────────────────────
function resize() {
  canvas.width  = Math.min(560, window.innerWidth);
  canvas.height = window.innerHeight
    - $('hud').offsetHeight
    - $('sub-bar').offsetHeight
    - $('mobile-controls').offsetHeight;
  W = canvas.width; H = canvas.height;
  roadW    = W * 0.96;
  roadLeft = (W - roadW) / 2;
  roadRight = roadLeft + roadW;
  laneW    = roadW / LANES;
}

// ── Lane helpers ───────────────────────────────────────────
function laneCenter(l)  { return roadLeft + l * laneW + laneW / 2; }
function laneClear(l) {
  return enemies.every(e => e.lane !== l || e.y > LANE_GAP);
}

// ── Road marks ─────────────────────────────────────────────
function initRoadMarks() {
  roadMarks = [];
  const sp = 80;
  for (let y = 0; y < H + sp; y += sp) roadMarks.push({ y });
}
function updateRoadMarks(dt) {
  const sp = nitroActive ? speed * NITRO_MUL : speed;
  roadMarks.forEach(m => {
    m.y += sp * dt * 60;
    if (m.y > H + 80) m.y -= H + 160;
  });
}

// ── Skid marks ─────────────────────────────────────────────
function addSkidMark(x, y) {
  for (const ox of [x - CAR_W*0.25, x + CAR_W*0.25]) {
    skidMarks.push({ x:ox, y, len:50+Math.random()*40, life:1 });
  }
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
  const sp = nitroActive ? speed*NITRO_MUL : speed;
  particles.push({
    x:x+(Math.random()-0.5)*5, y,
    vx:(Math.random()-0.5)*0.4,
    vy: nitroActive ? 2.2+Math.random() : 0.4+Math.random()*0.5,
    life:1, decay:0.05+Math.random()*0.05,
    size: nitroActive ? 8+Math.random()*5 : 2+Math.random()*2.5,
    color: nitroActive ? C.orange : C.muted,
  });
}

// ── Floating text ──────────────────────────────────────────
function addFloatingText(x, y, text, color='#facc15', size=18) {
  floatingTexts.push({ x, y, text, color, size, life:1, decay:0.018 });
}

// ── Init ───────────────────────────────────────────────────
function initGame() {
  const upg = lv => parseInt(upgrades[lv] || 0);

  score=0; distTravelled=0; speed=BASE_SPEED; nitro=1; nitroActive=false;
  invincible=0; shakeX=shakeY=shakeTimer=0;
  spawnTimer=0; nextSpawnAt=1500;
  coinTimer=0;  nextCoinAt=2800;
  puTimer=0;    nextPuAt=6000;
  combo=0; comboTimer=0;
  activePowerup=null; powerupTimer=0;
  currentPhase=0; tutorialStep=0;

  statCars=0; statCoins=0; statMaxSpeed=0; statCoinsEarned=0;

  lives = 3 + upg('extraLife');

  playerLane = 1;
  playerX = laneCenter(playerLane);
  playerTargetX = playerX;
  playerY = H - 110;
  laneChanging = false; laneChangeCooldown = 0;

  enemies=[]; coins=[]; powerups=[]; particles=[];
  roadMarks=[]; skidMarks=[]; floatingTexts=[];
  initRoadMarks();

  // Tutorial toasts
  TUTORIALS.forEach(t => {
    setTimeout(() => showToast(t.msg, t.dur), t.delay);
  });
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

// ── Spawn enemy ────────────────────────────────────────────
function trySpawnEnemy() {
  const phase = PHASES[currentPhase];
  if (enemies.length >= phase.maxEnemies) return;
  const clear = [];
  for (let l=0;l<LANES;l++) if(laneClear(l)) clear.push(l);
  if (!clear.length) return;
  const lane    = clear[Math.floor(Math.random()*clear.length)];
  const pal     = ENEMY_PALETTE[Math.floor(Math.random()*ENEMY_PALETTE.length)];
  const isTruck = Math.random() < 0.22;
  enemies.push({
    x: laneCenter(lane), y: -(isTruck?TRUCK_H:CAR_H)-10,
    lane, pal, isTruck,
    w: isTruck?TRUCK_W:CAR_W, h: isTruck?TRUCK_H:CAR_H,
    passed:false, nearMissed:false,
    // individual speed variation so lanes feel independent
    speedMul: 0.58 + Math.random()*0.22,
  });
}

// ── Spawn coin ─────────────────────────────────────────────
function spawnCoin() {
  const lane = Math.floor(Math.random()*LANES);
  coins.push({ x:laneCenter(lane), y:-COIN_R-10, pulse:0, collected:false });
}

// ── Spawn power-up ─────────────────────────────────────────
function spawnPowerup() {
  const def = POWERUP_TYPES[Math.floor(Math.random()*POWERUP_TYPES.length)];
  const lane = Math.floor(Math.random()*LANES);
  powerups.push({ x:laneCenter(lane), y:-20, def, pulse:0, collected:false });
}

// ── Phase update ───────────────────────────────────────────
function updatePhase() {
  for (let i = PHASES.length-1; i >= 0; i--) {
    if (score >= PHASES[i].minScore) {
      if (i !== currentPhase) {
        currentPhase = i;
        showToast('⚡ ' + PHASES[i].name, 2200);
      }
      break;
    }
  }
}

// ── Apply active power-up ──────────────────────────────────
function applyPowerup(def) {
  activePowerup = def.type;
  const upg = parseInt(upgrades['shieldTime']||0);
  const bonus = def.type==='shield' ? upg*2000 : 0;
  powerupTimer = def.dur + bonus;
  SFX.powerup();
  addFloatingText(playerX, playerY-40, def.label, def.color, 20);
}

// ── Lane-snap move ─────────────────────────────────────────
function tryMoveLeft() {
  if (laneChangeCooldown > 0 || playerLane <= 0) return;
  playerLane--;
  playerTargetX = laneCenter(playerLane);
  laneChangeCooldown = 200;
  laneChanging = true;
}
function tryMoveRight() {
  if (laneChangeCooldown > 0 || playerLane >= LANES-1) return;
  playerLane++;
  playerTargetX = laneCenter(playerLane);
  laneChangeCooldown = 200;
  laneChanging = true;
}

// ── Update ─────────────────────────────────────────────────
function update(dt) {
  if (!running || paused) return;

  // Phase
  updatePhase();
  const phase = PHASES[currentPhase];

  // Speed ramp
  speed = Math.min(MAX_SPEED, speed + SPEED_INC*dt*60);
  const sp = nitroActive ? speed*NITRO_MUL : speed;
  const enemySp = activePowerup==='slowmo' ? sp*0.42 : sp;

  distTravelled += sp*dt*60;
  score = Math.floor(distTravelled/10);
  const kmh = Math.round(sp*18);
  if (kmh > statMaxSpeed) statMaxSpeed = kmh;

  // Nitro
  const nitroRegenMul = 1 + 0.3*parseInt(upgrades['nitroRegen']||0);
  if (nitroActive) {
    nitro = Math.max(0, nitro - 0.004*dt*60);
    if (nitro <= 0) { nitroActive=false; nitro=0; }
  } else if (!keys['ShiftLeft']&&!keys['ShiftRight']&&!keys['mobileNitro']) {
    nitro = Math.min(1, nitro + 0.0011*nitroRegenMul*dt*60);
  }
  if ((keys['ShiftLeft']||keys['ShiftRight']||keys['mobileNitro'])&&nitro>0&&!nitroActive) {
    nitroActive=true; SFX.nitro();
  }

  // Lane change cooldown
  if (laneChangeCooldown > 0) laneChangeCooldown -= dt*1000;

  // Smooth slide to target lane
  const dx = playerTargetX - playerX;
  if (Math.abs(dx) < 1.5) { playerX = playerTargetX; laneChanging=false; }
  else { playerX += dx * Math.min(1, 14*dt); }

  // Arrow / key input
  if (keys['_leftPress'])  { keys['_leftPress']=false;  tryMoveLeft();  }
  if (keys['_rightPress']) { keys['_rightPress']=false; tryMoveRight(); }

  // Invincibility
  if (invincible>0) invincible-=dt*1000;

  // Combo timeout
  if (combo>0) {
    comboTimer-=dt*1000;
    if (comboTimer<=0) { combo=0; comboTimer=0; }
  }

  // Active power-up timer
  if (activePowerup) {
    powerupTimer -= dt*1000;
    if (powerupTimer<=0) { activePowerup=null; powerupTimer=0; }
  }

  // Exhaust
  if (Math.random()<0.35) spawnExhaust(playerX, playerY+CAR_H/2+2);

  updateRoadMarks(dt);

  // ── Spawn enemies
  spawnTimer+=dt*1000;
  if (spawnTimer>=nextSpawnAt) {
    spawnTimer=0;
    nextSpawnAt = Math.max(phase.spawnBase*0.45, phase.spawnBase - score*0.9);
    trySpawnEnemy();
  }

  // Magnet range
  const magnetRange = 70 + 55*parseInt(upgrades['magnet']||0);

  // ── Coins
  coinTimer+=dt*1000;
  if (coinTimer>=nextCoinAt) {
    coinTimer=0; nextCoinAt=2200+Math.random()*1500;
    spawnCoin();
  }
  coins.forEach(c => {
    c.y += enemySp*dt*60*0.7;
    c.pulse += 0.1*dt*60;
    // Magnet
    if (activePowerup==='magnet') {
      const dist=Math.hypot(playerX-c.x,playerY-c.y);
      if (dist<magnetRange) {
        c.x+=(playerX-c.x)*0.12*dt*60;
        c.y+=(playerY-c.y)*0.12*dt*60;
      }
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

  // ── Power-ups
  puTimer+=dt*1000;
  if (puTimer>=nextPuAt) {
    puTimer=0; nextPuAt=5500+Math.random()*4500;
    spawnPowerup();
  }
  powerups.forEach(p => {
    p.y+=enemySp*dt*60*0.7; p.pulse+=0.1*dt*60;
    if (!p.collected && overlap(playerX,playerY,CAR_W,CAR_H,p.x,p.y,26,26)) {
      p.collected=true; applyPowerup(p.def);
    }
  });
  powerups=powerups.filter(p=>!p.collected&&p.y<H+30);

  // ── Enemies
  enemies.forEach(e => {
    e.y += enemySp*dt*60*e.speedMul;

    // Passed player — combo
    if (!e.passed && e.y>playerY+CAR_H) {
      e.passed=true; statCars++;
      combo++; comboTimer=COMBO_TIMEOUT;
      const bonus = 5*combo;
      score+=bonus;
      SFX.overtake();
      addFloatingText(e.x, playerY-30, '+'+bonus+(combo>1?' x'+combo:''), C.cyan, 14);
      // pop combo badge
      hudCombo.classList.remove('pop');
      void hudCombo.offsetWidth;
      hudCombo.classList.add('pop');
    }

    // Near-miss check (only once per enemy, only when passing)
    if (!e.nearMissed && !e.passed) {
      const distX = Math.abs(playerX - e.x);
      const distY = Math.abs(playerY - e.y);
      if (distY < CAR_H*1.3 && distX < CAR_W + NEAR_MISS_DIST && distX > CAR_W*0.5) {
        e.nearMissed=true;
        score+=15; SFX.nearMiss();
        addFloatingText(playerX, playerY-50, 'NEAR MISS! +15', '#fb923c', 15);
      }
    }

    // Collision
    const isGhost = activePowerup==='ghost';
    const isShield = activePowerup==='shield';
    if (invincible<=0 && !isGhost && overlap(playerX,playerY,CAR_W,CAR_H,e.x,e.y,e.w,e.h)) {
      if (isShield) {
        activePowerup=null; powerupTimer=0;
        SFX.shield();
        invincible=600;
        spawnParticles(playerX,playerY,C.cyan,18,4);
        addFloatingText(playerX,playerY-40,'SHIELD BLOCKED!',C.cyan,16);
      } else {
        lives--;
        invincible=2000; combo=0;
        SFX.hit(); triggerShake();
        addSkidMark(playerX, playerY);
        spawnParticles(playerX,playerY,C.danger,16,4);
        spawnParticles(e.x,e.y,e.pal.body,10,3);
        addFloatingText(playerX,playerY-40,'CRASH!',C.danger,18);
        if (lives<=0) { endGame(); return; }
      }
    }
  });
  enemies=enemies.filter(e=>e.y<H+e.h+20);

  // ── Particles
  particles.forEach(p => {
    p.x+=p.vx*dt*60; p.y-=p.vy*dt*60; p.life-=p.decay*dt*60;
  });
  particles=particles.filter(p=>p.life>0);

  // ── Floating texts
  floatingTexts.forEach(t => { t.y-=0.8*dt*60; t.life-=t.decay*dt*60; });
  floatingTexts=floatingTexts.filter(t=>t.life>0);

  // ── Skid marks fade
  skidMarks.forEach(s=>s.life-=0.004*dt*60);
  skidMarks=skidMarks.filter(s=>s.life>0);

  // ── Shake
  if (shakeTimer>0) { shakeTimer-=dt*1000; shakeX=(Math.random()-0.5)*9; shakeY=(Math.random()-0.5)*9; }
  else shakeX=shakeY=0;
}

// ── Shake trigger ──────────────────────────────────────────
function triggerShake(d=350) { shakeTimer=d; }

// ── Collision helper ───────────────────────────────────────
function overlap(ax,ay,aw,ah,bx,by,bw,bh) {
  return Math.abs(ax-bx)<(aw+bw)/2-5 && Math.abs(ay-by)<(ah+bh)/2-5;
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

// ── Player car (top-down, faces up/south) ──────────────────
function drawPlayerCar(x,y) {
  const w=CAR_W, h=CAR_H;
  const isGhost  = activePowerup==='ghost';
  const isShield = activePowerup==='shield';
  ctx.save();
  if (isGhost) ctx.globalAlpha=0.45;

  // Shadow
  ctx.save(); ctx.globalAlpha*=0.2;
  rr(x+3,y+5,w+4,h+4,10,'#000',null); ctx.restore();

  // Body
  rr(x,y,w,h,9,isShield?'#0ea5e9':C.cyan,null);
  // Hood
  rr(x,y+h*0.22,w*0.86,h*0.30,6,'#0ea5e9',null);
  // Roof
  rr(x,y-h*0.08,w*0.70,h*0.32,7,'#0284c7',null);
  // Front glass
  rr(x,y+h*0.18,w*0.60,h*0.15,4,'#bae6fd',null);
  // Rear glass
  rr(x,y-h*0.17,w*0.54,h*0.11,4,'#bae6fd99',null);
  // Side windows
  for(const sx of [x-w*0.28,x+w*0.28]) rr(sx,y-h*0.05,w*0.13,h*0.20,3,'#7dd3fc99',null);

  // Wheels
  const wOX=w/2+3;
  for(const wx of [x-wOX,x+wOX]) {
    for(const wy of [y-h*0.27,y+h*0.27]) {
      rr(wx,wy,8,13,3,'#0f172a',null); rr(wx,wy,5,9,2,'#334155',null);
      ctx.beginPath(); ctx.arc(wx,wy,2,0,Math.PI*2); ctx.fillStyle='#94a3b8'; ctx.fill();
    }
  }
  // Headlights
  for(const lx of [x-w*0.26,x+w*0.26]) {
    rr(lx,y+h/2-5,7,5,2,'#fef9c3',null);
    ctx.save(); ctx.globalAlpha*=0.15;
    ctx.beginPath(); ctx.moveTo(lx-6,y+h/2); ctx.lineTo(lx+6,y+h/2);
    ctx.lineTo(lx+11,y+h/2+26); ctx.lineTo(lx-11,y+h/2+26); ctx.closePath();
    ctx.fillStyle='#fef9c3'; ctx.fill(); ctx.restore();
  }
  // Taillights
  for(const lx of [x-w*0.26,x+w*0.26]) rr(lx,y-h/2+4,7,4,2,'#ef4444',null);

  // Shield bubble
  if (isShield) {
    ctx.save();
    ctx.globalAlpha=0.25+(Math.sin(Date.now()/200)*0.1);
    ctx.beginPath(); ctx.ellipse(x,y,w*0.9,h*0.65,0,0,Math.PI*2);
    ctx.strokeStyle=C.cyan; ctx.lineWidth=3; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ── Enemy car ──────────────────────────────────────────────
function drawEnemyCar(x,y,p) {
  const w=CAR_W, h=CAR_H;
  ctx.save(); ctx.globalAlpha=0.18; rr(x+3,y+5,w+4,h+4,10,'#000',null); ctx.restore();
  rr(x,y,w,h,9,p.body,null);
  rr(x,y,w*0.68,h*0.36,7,p.roof,null);
  rr(x,y-h*0.20,w*0.58,h*0.15,4,p.glass,null);
  rr(x,y+h*0.18,w*0.50,h*0.10,3,p.glass+'88',null);
  for(const sx of [x-w*0.28,x+w*0.28]) rr(sx,y-h*0.04,w*0.13,h*0.20,3,p.glass+'99',null);
  const wOX=w/2+3;
  for(const wx of [x-wOX,x+wOX]) for(const wy of [y-h*0.27,y+h*0.27]) {
    rr(wx,wy,8,13,3,'#0f172a',null); rr(wx,wy,5,9,2,'#1e293b',null);
    ctx.beginPath(); ctx.arc(wx,wy,2,0,Math.PI*2); ctx.fillStyle='#475569'; ctx.fill();
  }
  for(const lx of [x-w*0.26,x+w*0.26]) rr(lx,y+h/2-4,6,4,2,'#fef9c3',null);
  for(const lx of [x-w*0.26,x+w*0.26]) rr(lx,y-h/2+4,6,4,2,'#dc2626',null);
}

// ── Enemy truck ────────────────────────────────────────────
function drawEnemyTruck(x,y,p) {
  const w=TRUCK_W, h=TRUCK_H;
  ctx.save(); ctx.globalAlpha=0.18; rr(x+4,y+6,w+6,h+6,10,'#000',null); ctx.restore();
  rr(x,y+h*0.14,w*0.92,h*0.60,5,p.roof,'#0f172a');
  ctx.save(); ctx.globalAlpha=0.10;
  for(let i=-1;i<=1;i++) rr(x+i*11,y+h*0.14,3,h*0.56,1,'#fff',null);
  ctx.restore();
  rr(x,y-h*0.27,w,h*0.27,8,p.body,null);
  rr(x,y-h*0.31,w*0.66,h*0.12,4,p.glass,null);
  const wOX=w/2+3;
  for(const wx of [x-wOX,x+wOX]) for(const wy of [y-h*0.28,y+h*0.06,y+h*0.32]) {
    rr(wx,wy,9,14,3,'#0f172a',null); rr(wx,wy,6,9,2,'#1e293b',null);
  }
  for(const lx of [x-w*0.26,x+w*0.26]) rr(lx,y+h/2-5,7,5,2,'#fef9c3',null);
  for(const lx of [x-w*0.26,x+w*0.26]) rr(lx,y-h/2+4,7,4,2,'#dc2626',null);
}

// ── Coin ───────────────────────────────────────────────────
function drawCoin(c) {
  const pls=0.9+Math.sin(c.pulse)*0.10;
  ctx.save(); ctx.translate(c.x,c.y); ctx.scale(pls,pls);
  const g=ctx.createRadialGradient(0,0,3,0,0,COIN_R+7);
  g.addColorStop(0,C.yellow); g.addColorStop(1,'rgba(250,204,21,0)');
  ctx.beginPath(); ctx.arc(0,0,COIN_R+7,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
  ctx.beginPath(); ctx.arc(0,0,COIN_R,0,Math.PI*2); ctx.fillStyle=C.yellow; ctx.fill();
  ctx.strokeStyle='#fef08a'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle='#78350f'; ctx.font='bold 10px sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('$',0,0);
  ctx.restore();
}

// ── Power-up pickup ────────────────────────────────────────
function drawPowerup(p) {
  const pls=0.88+Math.sin(p.pulse)*0.12;
  ctx.save(); ctx.translate(p.x,p.y); ctx.scale(pls,pls);
  const g=ctx.createRadialGradient(0,0,4,0,0,18);
  g.addColorStop(0,p.def.color+'cc'); g.addColorStop(1,p.def.color+'00');
  ctx.beginPath(); ctx.arc(0,0,18,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
  rr(0,0,28,28,8,C.surface,p.def.color,2);
  ctx.font='16px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(p.def.icon,0,1);
  ctx.restore();
}

// ── Road ───────────────────────────────────────────────────
function drawRoad() {
  const phase = PHASES[currentPhase];
  const tint  = phase.roadTint;

  ctx.fillStyle='#080810';
  ctx.fillRect(0,0,roadLeft,H); ctx.fillRect(roadRight,0,W-roadRight,H);

  // Sky/road bg shifts per phase
  ctx.fillStyle=phase.bg;
  ctx.fillRect(roadLeft,0,roadW,H);

  // Subtle rain overlay in STORM phase
  if (currentPhase===3) {
    ctx.save(); ctx.globalAlpha=0.07;
    ctx.strokeStyle='#93c5fd'; ctx.lineWidth=1;
    for(let i=0;i<18;i++) {
      const rx=roadLeft+Math.random()*roadW, ry=Math.random()*H;
      ctx.beginPath(); ctx.moveTo(rx,ry); ctx.lineTo(rx-3,ry+18); ctx.stroke();
    }
    ctx.restore();
  }

  // Skid marks
  skidMarks.forEach(s => {
    ctx.save(); ctx.globalAlpha=s.life*0.5;
    ctx.strokeStyle='#1e293b'; ctx.lineWidth=4; ctx.setLineDash([6,8]);
    ctx.beginPath(); ctx.moveTo(s.x,s.y); ctx.lineTo(s.x,s.y+s.len); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  });

  // Edge lines
  ctx.strokeStyle=C.orange; ctx.lineWidth=2.5;
  ctx.shadowColor=C.orange; ctx.shadowBlur=10;
  for(const lx of [roadLeft,roadRight]) {
    ctx.beginPath(); ctx.moveTo(lx,0); ctx.lineTo(lx,H); ctx.stroke();
  }
  ctx.shadowBlur=0;

  // Lane dashes
  for(let l=1;l<LANES;l++) {
    const lx=roadLeft+l*laneW;
    ctx.strokeStyle=C.border; ctx.lineWidth=2; ctx.setLineDash([36,36]);
    roadMarks.forEach(m=>{ ctx.beginPath(); ctx.moveTo(lx,m.y-36); ctx.lineTo(lx,m.y); ctx.stroke(); });
    ctx.setLineDash([]);
  }
}

// ── Particles ──────────────────────────────────────────────
function drawParticles() {
  particles.forEach(p=>{
    ctx.globalAlpha=Math.max(0,p.life);
    ctx.beginPath(); ctx.arc(p.x,p.y,p.size*p.life,0,Math.PI*2);
    ctx.fillStyle=p.color; ctx.fill();
  });
  ctx.globalAlpha=1;
}

// ── Floating texts ─────────────────────────────────────────
function drawFloatingTexts() {
  floatingTexts.forEach(t=>{
    ctx.save();
    ctx.globalAlpha=Math.max(0,t.life);
    ctx.font=`bold ${t.size}px 'Bebas Neue', sans-serif`;
    ctx.fillStyle=t.color; ctx.textAlign='center'; ctx.textBaseline='middle';
    // subtle outline
    ctx.strokeStyle='rgba(0,0,0,0.6)'; ctx.lineWidth=3;
    ctx.strokeText(t.text,t.x,t.y);
    ctx.fillText(t.text,t.x,t.y);
    ctx.restore();
  });
}

// ── Main draw ──────────────────────────────────────────────
function draw() {
  ctx.save();
  if (shakeTimer>0) ctx.translate(shakeX,shakeY);

  ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);
  drawRoad();
  drawParticles();

  // Coins
  coins.forEach(drawCoin);
  // Power-ups
  powerups.forEach(drawPowerup);

  // Enemies
  enemies.forEach(e=>{
    if(e.isTruck) drawEnemyTruck(e.x,e.y,e.pal);
    else          drawEnemyCar(e.x,e.y,e.pal);
  });

  // Player
  const blink = invincible>0 && Math.floor(invincible/130)%2===0;
  if (!blink) drawPlayerCar(playerX,playerY);

  // Nitro flame
  if (nitroActive) {
    const fH=20+Math.random()*14;
    const fg=ctx.createLinearGradient(0,playerY+CAR_H/2,0,playerY+CAR_H/2+fH);
    fg.addColorStop(0,C.yellow); fg.addColorStop(0.5,C.orange); fg.addColorStop(1,'rgba(239,68,68,0)');
    ctx.beginPath(); ctx.ellipse(playerX,playerY+CAR_H/2+fH/2,7,fH/2,0,0,Math.PI*2);
    ctx.fillStyle=fg; ctx.fill();
  }

  // Speed lines
  if (speed>MAX_SPEED*0.6||nitroActive) {
    const a=nitroActive?0.14:0.06;
    ctx.strokeStyle=`rgba(56,189,248,${a})`; ctx.lineWidth=1;
    for(let i=0;i<7;i++){
      const lx=roadLeft+Math.random()*roadW, ly=Math.random()*H, ll=16+Math.random()*32;
      ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(lx,ly+ll); ctx.stroke();
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
  hudLives.textContent = '❤️'.repeat(Math.max(0,lives))+'🖤'.repeat(Math.max(0,(3+parseInt(upgrades['extraLife']||0))-lives));
  nitroBarFill.style.width = `${nitro*100}%`;
  hudCombo.textContent = combo>1?`x${combo}`:'x1';
  hudPhase.textContent = PHASES[currentPhase].name;

  if (activePowerup) {
    const def = POWERUP_TYPES.find(p=>p.type===activePowerup);
    const secs = Math.ceil(powerupTimer/1000);
    powerupHud.textContent = def?`${def.icon} ${secs}s`:'';
  } else { powerupHud.textContent=''; }

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
  paused=true; showScreen('screen-pause');
  cancelAnimationFrame(frameId);
}

function resumeGame() {
  paused=false; showScreen('screen-game');
  lastTime=null; frameId=requestAnimationFrame(loop);
}

function quitToMenu() {
  running=false; paused=false;
  cancelAnimationFrame(frameId);
  if (tutorialEl) { tutorialEl.remove(); tutorialEl=null; }
  titleCoinCount.textContent=bank;
  showScreen('screen-title');
}

function endGame() {
  running=false; cancelAnimationFrame(frameId);
  if (tutorialEl) { tutorialEl.remove(); tutorialEl=null; }
  if (score>best) { best=score; saveBest(); }

  goScore.textContent=score; goBest.textContent=best;

  // Stats breakdown
  goStats.innerHTML='';
  const rows=[
    ['CARS DODGED', statCars],
    ['COINS COLLECTED', statCoins],
    ['MAX SPEED', statMaxSpeed+' km/h'],
    ['BEST COMBO', 'x'+combo],
    ['PHASE REACHED', PHASES[currentPhase].name],
  ];
  rows.forEach(([label,val])=>{
    const row=document.createElement('div');
    row.className='go-stat-row';
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
      }
    `;
    shopGrid.appendChild(card);
  });
}

shopGrid.addEventListener('click', e=>{
  const btn=e.target.closest('.shop-btn');
  if (!btn) return;
  const id=btn.dataset.id;
  const def=UPGRADE_DEFS.find(d=>d.id===id);
  if (!def) return;
  const lv=parseInt(upgrades[id]||0);
  const cost=def.costs[lv];
  if (bank<cost) { SFX.error(); return; }
  bank-=cost; upgrades[id]=lv+1;
  saveBank(); saveUpgrades();
  SFX.purchase();
  buildShop();
  shopCoinCount.textContent=bank; titleCoinCount.textContent=bank;
});

// ── Input ──────────────────────────────────────────────────
window.addEventListener('keydown', e=>{
  if (e.code==='ArrowLeft'||e.code==='KeyA') {
    if (!keys[e.code]) keys['_leftPress']=true;
    keys[e.code]=true; e.preventDefault();
  } else if (e.code==='ArrowRight'||e.code==='KeyD') {
    if (!keys[e.code]) keys['_rightPress']=true;
    keys[e.code]=true; e.preventDefault();
  } else if (e.code==='ShiftLeft'||e.code==='ShiftRight') {
    keys[e.code]=true; e.preventDefault();
  } else if (e.code==='Escape') {
    if (paused) resumeGame(); else if (running) pauseGame();
  } else if (['ArrowUp','ArrowDown','Space'].includes(e.code)) {
    e.preventDefault();
  }
});
window.addEventListener('keyup', e=>{ keys[e.code]=false; });

// Mobile buttons
$('btn-left').addEventListener('pointerdown',  e=>{ e.preventDefault(); keys['_leftPress']=true;  keys['ArrowLeft']=true;  $('btn-left').classList.add('pressed'); });
$('btn-left').addEventListener('pointerup',    e=>{ keys['ArrowLeft']=false;  $('btn-left').classList.remove('pressed'); });
$('btn-left').addEventListener('pointerleave', e=>{ keys['ArrowLeft']=false;  $('btn-left').classList.remove('pressed'); });

$('btn-right').addEventListener('pointerdown',  e=>{ e.preventDefault(); keys['_rightPress']=true; keys['ArrowRight']=true; $('btn-right').classList.add('pressed'); });
$('btn-right').addEventListener('pointerup',    e=>{ keys['ArrowRight']=false; $('btn-right').classList.remove('pressed'); });
$('btn-right').addEventListener('pointerleave', e=>{ keys['ArrowRight']=false; $('btn-right').classList.remove('pressed'); });

$('btn-nitro').addEventListener('pointerdown',  e=>{ e.preventDefault(); keys['mobileNitro']=true;  $('btn-nitro').classList.add('pressed'); });
$('btn-nitro').addEventListener('pointerup',    e=>{ keys['mobileNitro']=false; $('btn-nitro').classList.remove('pressed'); });
$('btn-nitro').addEventListener('pointerleave', e=>{ keys['mobileNitro']=false; $('btn-nitro').classList.remove('pressed'); });

// Screen buttons
$('btn-start').addEventListener('click',    startGame);
$('btn-shop').addEventListener('click',     ()=>{ buildShop(); showScreen('screen-shop'); });
$('btn-shop-back').addEventListener('click',()=>{ titleCoinCount.textContent=bank; showScreen('screen-title'); });
$('btn-resume').addEventListener('click',   resumeGame);
$('btn-quit').addEventListener('click',     quitToMenu);
$('btn-restart').addEventListener('click',  startGame);
$('btn-go-menu').addEventListener('click',  quitToMenu);

window.addEventListener('resize',()=>{ if(running){ resize(); playerY=H-110; } });

// ── Boot ───────────────────────────────────────────────────
resize();
titleCoinCount.textContent=bank;