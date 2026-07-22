/* ════════════════════════════════════════════════════════
   SPACE INVADERS
   Player ship, descending invader fleet, bullets both ways,
   destructible bunkers, escalating waves, lives, high score.
   ════════════════════════════════════════════════════════ */

/* ─── Safe storage shim ─── */
(function () {
  try { const t="__ls__"; localStorage.setItem(t,"1"); localStorage.removeItem(t); }
  catch (e) {
    let m={}; const safe={getItem:k=>k in m?m[k]:null,setItem:(k,v)=>m[k]=String(v),
      removeItem:k=>delete m[k],clear:()=>m={},key:i=>Object.keys(m)[i]||null,get length(){return Object.keys(m).length;}};
    try { Object.defineProperty(window,"localStorage",{value:safe,configurable:true}); } catch(e2){ window.localStorage=safe; }
  }
})();

const $ = id => document.getElementById(id);
const canvas = $('gameCanvas');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const scoreEl = $('score-display');
const waveEl  = $('wave-display');
const livesEl = $('lives-display');
const bestEl  = $('best-display');
const overlay = $('overlay');
const overlayTitle = $('overlay-title');
const overlaySub = $('overlay-sub');
const startBtn = $('start-btn');

const C = {
  cyan:'#38bdf8', orange:'#f97316', danger:'#ef4444', text:'#e2e8f0',
  muted:'#64748b', green:'#22c55e', purple:'#a78bfa', yellow:'#facc15',
};

/* ── Audio ── */
let audioCtx = null;
function tone(freq, type='square', dur=0.08, vol=0.05, freqEnd) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination); o.type=type;
    o.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, audioCtx.currentTime+dur);
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+dur);
    o.start(); o.stop(audioCtx.currentTime+dur);
  } catch(_){}
}
const Sfx = {
  shoot:   () => tone(880,'square',0.08,0.04,440),
  hit:     () => tone(220,'square',0.09,0.06,120),
  explode: () => tone(90,'sawtooth',0.25,0.09,50),
  wave:    () => [440,554,659].forEach((f,i)=>setTimeout(()=>tone(f,'triangle',0.2,0.06),i*90)),
  over:    () => [330,247,165].forEach((f,i)=>setTimeout(()=>tone(f,'sawtooth',0.3,0.08),i*130)),
};

/* ── Game state ── */
let running = false, paused = false, over = false;
let score = 0, wave = 1, lives = 3;
let best = parseInt(localStorage.getItem('si_best') || '0');
let keys = {};
let frameId = null, lastTime = 0;

const player = { x: W/2, y: H-46, w: 46, h: 22, speed: 6, cooldown: 0 };
let bullets = [];      // player shots {x,y,vy}
let enemyBullets = []; // {x,y,vy}
let invaders = [];     // {x,y,w,h,type,alive,col,phase}
let bunkers = [];      // {x,y,blocks:[[..]]}
let particles = [];
let stars = [];

let fleetDir = 1;      // 1 = right, -1 = left
let fleetSpeed = 0.5;
let fleetDrop = 0;     // pending drop
let stepTimer = 0, stepInterval = 34;  // animation frames between "steps"
let animFrame = 0;
let enemyFireTimer = 0;
let shakeT = 0, shakeX = 0, shakeY = 0;

const INVADER_ROWS = 5, INVADER_COLS = 8;
const INVADER_TYPES = [
  { row:0, col:C.purple, pts:30 },
  { row:1, col:C.cyan,   pts:20 },
  { row:2, col:C.cyan,   pts:20 },
  { row:3, col:C.orange, pts:10 },
  { row:4, col:C.orange, pts:10 },
];

/* ── Init stars ── */
function initStars() {
  stars = [];
  for (let i=0;i<50;i++) stars.push({ x:Math.random()*W, y:Math.random()*H, r:Math.random()*1.4+0.3, tw:Math.random()*Math.PI*2 });
}

/* ── Build a wave ── */
function buildWave() {
  invaders = [];
  const marginX = 70, marginTop = 70;
  const gapX = (W - marginX*2) / (INVADER_COLS-1);
  const gapY = 42;
  for (let r=0;r<INVADER_ROWS;r++) {
    for (let c=0;c<INVADER_COLS;c++) {
      const t = INVADER_TYPES[r];
      invaders.push({
        x: marginX + c*gapX, y: marginTop + r*gapY,
        w: 30, h: 22, type:r, col:t.col, pts:t.pts,
        alive:true, phase:0,
      });
    }
  }
  fleetDir = 1;
  fleetSpeed = 0.4 + wave*0.12;
  stepInterval = Math.max(10, 34 - wave*3);
  stepTimer = 0;
  enemyBullets = [];
  bullets = [];
}

/* ── Build bunkers ── */
function buildBunkers() {
  bunkers = [];
  const count = 4;
  const shape = [
    [0,1,1,1,1,1,0],
    [1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1],
    [1,1,0,0,0,1,1],
    [1,0,0,0,0,0,1],
  ];
  const blockSize = 9;
  const bunkerW = shape[0].length * blockSize;
  const spacing = W / count;
  for (let b=0;b<count;b++) {
    const bx = spacing*b + spacing/2 - bunkerW/2;
    const by = H - 130;
    const blocks = shape.map(row => row.slice());
    bunkers.push({ x:bx, y:by, blocks, blockSize });
  }
}

/* ── Particles ── */
function boom(x,y,col,n=14) {
  for (let i=0;i<n;i++) {
    const a=Math.random()*Math.PI*2, s=Math.random()*3+0.5;
    particles.push({ x,y, vx:Math.cos(a)*s, vy:Math.sin(a)*s, life:1, decay:0.03+Math.random()*0.03, r:2+Math.random()*2.5, col });
  }
}

/* ── Reset / flow ── */
function resetGame() {
  score = 0; wave = 1; lives = 3; over = false;
  player.x = W/2; player.cooldown = 0;
  particles = [];
  initStars();
  buildWave(); buildBunkers();
  updateHud();
}
function startGame() {
  try{ if(!audioCtx) audioCtx=new(window.AudioContext||window.webkitAudioContext)(); }catch(_){}
  resetGame();
  running = true; paused = false; over = false;
  overlay.classList.add('hidden');
  lastTime = 0;
  cancelAnimationFrame(frameId);
  frameId = requestAnimationFrame(loop);
}

/* ── Player shooting ── */
function fire() {
  if (player.cooldown > 0) return;
  bullets.push({ x: player.x, y: player.y - player.h/2, vy: -9, w:4, h:14 });
  player.cooldown = 16;
  Sfx.shoot();
}

/* ── Collision helpers ── */
function rectHit(ax,ay,aw,ah,bx,by,bw,bh) {
  return Math.abs(ax-bx) < (aw+bw)/2 && Math.abs(ay-by) < (ah+bh)/2;
}

/* Damage a bunker block at world point; returns true if a block was hit */
function hitBunker(px, py) {
  for (const bk of bunkers) {
    const localX = px - bk.x, localY = py - bk.y;
    if (localX < 0 || localY < 0) continue;
    const col = Math.floor(localX / bk.blockSize);
    const row = Math.floor(localY / bk.blockSize);
    if (row>=0 && row<bk.blocks.length && col>=0 && col<bk.blocks[0].length) {
      if (bk.blocks[row][col]) {
        bk.blocks[row][col] = 0;
        // chip a couple neighbours for a nicer crater sometimes
        if (Math.random()<0.4 && bk.blocks[row][col+1]) bk.blocks[row][col+1]=0;
        return true;
      }
    }
  }
  return false;
}

/* ── Update ── */
function update() {
  // Player movement
  if (keys['ArrowLeft']||keys['KeyA']||keys['mobileLeft'])  player.x -= player.speed;
  if (keys['ArrowRight']||keys['KeyD']||keys['mobileRight']) player.x += player.speed;
  player.x = Math.max(player.w/2, Math.min(W-player.w/2, player.x));
  if (player.cooldown>0) player.cooldown--;
  if ((keys['Space']||keys['mobileFire'])) fire();

  // Player bullets
  bullets.forEach(b => b.y += b.vy);
  bullets = bullets.filter(b => {
    if (b.y < -20) return false;
    // bunker hit
    if (hitBunker(b.x, b.y)) { boom(b.x,b.y,C.muted,5); return false; }
    // invader hit
    for (const inv of invaders) {
      if (inv.alive && rectHit(b.x,b.y,b.w,b.h,inv.x,inv.y,inv.w,inv.h)) {
        inv.alive = false;
        score += inv.pts;
        boom(inv.x, inv.y, inv.col, 16);
        Sfx.hit();
        bump(scoreEl);
        updateHud();
        return false;
      }
    }
    return true;
  });

  // Fleet movement (stepped)
  const alive = invaders.filter(i => i.alive);
  stepTimer++;
  const aliveRatio = alive.length / (INVADER_ROWS*INVADER_COLS);
  const curInterval = Math.max(6, stepInterval * (0.3 + aliveRatio*0.7)); // speed up as they die
  if (stepTimer >= curInterval) {
    stepTimer = 0;
    animFrame ^= 1;
    // find fleet bounds
    let minX=Infinity, maxX=-Infinity;
    alive.forEach(i => { minX=Math.min(minX,i.x-i.w/2); maxX=Math.max(maxX,i.x+i.w/2); });
    let drop = false;
    if (fleetDir>0 && maxX + fleetSpeed*8 >= W-10) drop = true;
    if (fleetDir<0 && minX - fleetSpeed*8 <= 10)   drop = true;
    if (drop) {
      fleetDir *= -1;
      alive.forEach(i => i.y += 20);
    } else {
      alive.forEach(i => i.x += fleetDir * fleetSpeed * 8);
    }
    // reached player line?
    for (const i of alive) {
      if (i.y + i.h/2 >= player.y - player.h/2) { loseLife(true); break; }
    }
  }

  // Enemy fire
  enemyFireTimer--;
  if (enemyFireTimer <= 0 && alive.length) {
    enemyFireTimer = Math.max(18, 60 - wave*4 - Math.random()*20);
    // pick a random column's bottom-most invader
    const shooter = alive[Math.floor(Math.random()*alive.length)];
    // find bottom-most in that column-ish x
    let bottom = shooter;
    for (const i of alive) if (Math.abs(i.x-shooter.x)<6 && i.y>bottom.y) bottom=i;
    enemyBullets.push({ x:bottom.x, y:bottom.y+bottom.h/2, vy: 3.2+wave*0.25, w:4, h:12 });
  }

  // Enemy bullets
  enemyBullets.forEach(b => b.y += b.vy);
  enemyBullets = enemyBullets.filter(b => {
    if (b.y > H+20) return false;
    if (hitBunker(b.x, b.y)) { boom(b.x,b.y,C.muted,5); return false; }
    if (rectHit(b.x,b.y,b.w,b.h,player.x,player.y,player.w*0.7,player.h)) {
      loseLife(false);
      return false;
    }
    return true;
  });

  // Particles
  particles.forEach(p => { p.x+=p.vx; p.y+=p.vy; p.vy+=0.04; p.life-=p.decay; });
  particles = particles.filter(p => p.life>0);

  // Shake decay
  if (shakeT>0) { shakeT--; shakeX=(Math.random()-0.5)*6; shakeY=(Math.random()-0.5)*6; }
  else { shakeX=shakeY=0; }

  // Wave cleared?
  if (alive.length === 0) {
    wave++;
    Sfx.wave();
    updateHud();
    buildWave();
    // small breather: lift fleet a touch
  }
}

function loseLife(fromFleet) {
  lives--;
  Sfx.explode();
  boom(player.x, player.y, C.orange, 24);
  shakeT = 18;
  updateHud();
  if (lives <= 0) { endGame(); return; }
  if (fromFleet) {
    // push fleet back up a bit so it's not instantly game over again
    invaders.forEach(i => { if(i.alive) i.y -= 40; });
  }
  player.x = W/2;
  enemyBullets = [];
}

function endGame() {
  running = false; over = true;
  cancelAnimationFrame(frameId);
  Sfx.over();
  if (score > best) { best = score; localStorage.setItem('si_best', String(best)); }
  updateHud();
  overlayTitle.textContent = 'GAME OVER';
  overlaySub.innerHTML = `Score <strong style="color:var(--x-color)">${score}</strong> · Wave ${wave}` +
    (score>=best && score>0 ? '<br>New best! 🏆' : `<br>Best: ${best}`);
  startBtn.textContent = 'PLAY AGAIN';
  overlay.classList.remove('hidden');
}

/* ── Draw ── */
function drawShip(x,y) {
  ctx.save();
  ctx.translate(x,y);
  // glow
  ctx.shadowColor = C.cyan; ctx.shadowBlur = 12;
  ctx.fillStyle = C.cyan;
  // hull
  ctx.beginPath();
  ctx.moveTo(0,-12);
  ctx.lineTo(6,-2);
  ctx.lineTo(20,8);
  ctx.lineTo(8,8);
  ctx.lineTo(6,4);
  ctx.lineTo(-6,4);
  ctx.lineTo(-8,8);
  ctx.lineTo(-20,8);
  ctx.lineTo(-6,-2);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  // cockpit
  ctx.fillStyle = '#bae6fd';
  ctx.beginPath(); ctx.arc(0,-2,3.5,0,Math.PI*2); ctx.fill();
  // thruster glow
  ctx.fillStyle = C.orange;
  ctx.globalAlpha = 0.6 + Math.random()*0.3;
  ctx.beginPath(); ctx.moveTo(-4,8); ctx.lineTo(0,14+Math.random()*4); ctx.lineTo(4,8); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawInvader(inv) {
  const x=inv.x, y=inv.y, s=inv.w/2;
  ctx.save();
  ctx.translate(x,y);
  ctx.fillStyle = inv.col;
  ctx.shadowColor = inv.col; ctx.shadowBlur = 8;
  // simple pixel-ish alien; legs alternate with animFrame
  const f = animFrame;
  // body
  ctx.fillRect(-s*0.7, -s*0.5, s*1.4, s*0.9);
  // head bump
  ctx.fillRect(-s*0.45, -s*0.85, s*0.9, s*0.4);
  // eyes (cut-out)
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#06060b';
  ctx.fillRect(-s*0.35, -s*0.45, s*0.22, s*0.28);
  ctx.fillRect( s*0.13, -s*0.45, s*0.22, s*0.28);
  // legs
  ctx.fillStyle = inv.col;
  const legY = s*0.4;
  if (f===0) {
    ctx.fillRect(-s*0.6, legY, s*0.25, s*0.4);
    ctx.fillRect( s*0.35, legY, s*0.25, s*0.4);
  } else {
    ctx.fillRect(-s*0.45, legY, s*0.25, s*0.4);
    ctx.fillRect( s*0.2, legY, s*0.25, s*0.4);
  }
  ctx.restore();
}

function drawBunkers() {
  for (const bk of bunkers) {
    for (let r=0;r<bk.blocks.length;r++) {
      for (let c=0;c<bk.blocks[0].length;c++) {
        if (bk.blocks[r][c]) {
          ctx.fillStyle = C.green;
          ctx.globalAlpha = 0.9;
          ctx.fillRect(bk.x + c*bk.blockSize, bk.y + r*bk.blockSize, bk.blockSize-1, bk.blockSize-1);
        }
      }
    }
  }
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.save();
  if (shakeT>0) ctx.translate(shakeX, shakeY);

  ctx.clearRect(-10,-10,W+20,H+20);

  // stars
  stars.forEach(s => {
    s.tw += 0.05;
    ctx.globalAlpha = 0.4 + Math.sin(s.tw)*0.3;
    ctx.fillStyle = '#93c5fd';
    ctx.fillRect(s.x, s.y, s.r, s.r);
  });
  ctx.globalAlpha = 1;

  drawBunkers();

  invaders.forEach(i => { if (i.alive) drawInvader(i); });

  // player bullets
  ctx.fillStyle = C.cyan;
  ctx.shadowColor = C.cyan; ctx.shadowBlur = 8;
  bullets.forEach(b => ctx.fillRect(b.x-2, b.y-7, 4, 14));
  ctx.shadowBlur = 0;

  // enemy bullets
  ctx.fillStyle = C.orange;
  enemyBullets.forEach(b => {
    ctx.fillRect(b.x-2, b.y-6, 4, 12);
  });

  // player
  if (!over) drawShip(player.x, player.y);

  // particles
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0,p.life);
    ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r*p.life,0,Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha = 1;

  // pause veil
  if (paused) {
    ctx.fillStyle = 'rgba(6,6,11,0.6)';
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle = C.text;
    ctx.font = "600 28px 'Bebas Neue', sans-serif";
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('PAUSED', W/2, H/2);
  }

  ctx.restore();
}

/* ── HUD ── */
function bump(el){ el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
function updateHud() {
  scoreEl.textContent = score;
  waveEl.textContent = wave;
  livesEl.textContent = lives>0 ? '♥'.repeat(lives) : '—';
  bestEl.textContent = Math.max(best, score);
}

/* ── Loop ── */
function loop(ts) {
  if (!running) return;
  frameId = requestAnimationFrame(loop);
  if (!paused) update();
  draw();
}

/* ── Input ── */
window.addEventListener('keydown', e => {
  if (['ArrowLeft','ArrowRight','KeyA','KeyD','Space'].includes(e.code)) { keys[e.code]=true; e.preventDefault(); }
  else if (e.code==='KeyP') { if (running && !over) { paused=!paused; } }
});
window.addEventListener('keyup', e => { keys[e.code]=false; });

function bindHold(id, key) {
  const el = $(id); if (!el) return;
  const on = e => { e.preventDefault(); keys[key]=true; el.classList.add('pressed'); };
  const off = () => { keys[key]=false; el.classList.remove('pressed'); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointerleave', off);
  el.addEventListener('pointercancel', off);
}
bindHold('btn-left','mobileLeft');
bindHold('btn-right','mobileRight');
bindHold('btn-fire','mobileFire');

startBtn.addEventListener('click', startGame);

/* ── Boot: draw an idle starfield behind the overlay ── */
initStars();
buildWave(); buildBunkers();
updateHud();
(function idleDraw(){
  if (!running) {
    draw();
    requestAnimationFrame(idleDraw);
  }
})();
