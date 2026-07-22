/* ════════════════════════════════════════════════════════
   TETRIS
   7 tetrominoes, 7-bag randomiser, rotation with simple wall
   kicks, ghost piece, hold, next preview, line-clear scoring,
   levels that speed up gravity, soft/hard drop.
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

const COLS = 10, ROWS = 20;
const $ = id => document.getElementById(id);
const boardCanvas = $('board');
const bctx = boardCanvas.getContext('2d');
const nextCanvas = $('next'), nctx = nextCanvas.getContext('2d');
const holdCanvas = $('hold'), hctx = holdCanvas.getContext('2d');

const scoreEl = $('score-display');
const linesEl = $('lines-display');
const levelEl = $('level-display');
const bestEl  = $('best-display');
const overlay = $('overlay');
const overlayTitle = $('overlay-title');
const overlaySub = $('overlay-sub');
const startBtn = $('start-btn');

const CELL = boardCanvas.width / COLS; // 30

/* ── Tetromino definitions (rotation states as 4x4 coords) ── */
const COLORS = {
  I:'#38bdf8', O:'#facc15', T:'#a78bfa', S:'#22c55e',
  Z:'#ef4444', J:'#3b82f6', L:'#f97316',
};
// each shape: array of rotation states; each state is list of [x,y] filled cells in a 4x4 box
const SHAPES = {
  I: [ [[0,1],[1,1],[2,1],[3,1]], [[2,0],[2,1],[2,2],[2,3]], [[0,2],[1,2],[2,2],[3,2]], [[1,0],[1,1],[1,2],[1,3]] ],
  O: [ [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]] ],
  T: [ [[1,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[2,1],[1,2]], [[1,0],[0,1],[1,1],[1,2]] ],
  S: [ [[1,0],[2,0],[0,1],[1,1]], [[1,0],[1,1],[2,1],[2,2]], [[1,1],[2,1],[0,2],[1,2]], [[0,0],[0,1],[1,1],[1,2]] ],
  Z: [ [[0,0],[1,0],[1,1],[2,1]], [[2,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[1,2],[2,2]], [[1,0],[0,1],[1,1],[0,2]] ],
  J: [ [[0,0],[0,1],[1,1],[2,1]], [[1,0],[2,0],[1,1],[1,2]], [[0,1],[1,1],[2,1],[2,2]], [[1,0],[1,1],[0,2],[1,2]] ],
  L: [ [[2,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[1,2],[2,2]], [[0,1],[1,1],[2,1],[0,2]], [[0,0],[1,0],[1,1],[1,2]] ],
};
const KICKS = [ [0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[0,1] ]; // simple kick attempts

/* ── State ── */
let grid = [];        // ROWS x COLS, null or color
let cur = null;       // {type, rot, x, y}
let nextType = null, holdType = null, holdUsed = false;
let bag = [];
let score = 0, lines = 0, level = 1;
let best = parseInt(localStorage.getItem('tetris_best') || '0');
let dropTimer = 0, dropInterval = 800; // ms
let running = false, paused = false, over = false;
let lastTime = 0, frameId = null;
let keys = {};
let clearingRows = [], clearAnim = 0;

/* ── Audio ── */
let audioCtx = null;
function tone(freq, type='square', dur=0.07, vol=0.05, freqEnd) {
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
  move: () => tone(300,'square',0.03,0.02),
  rotate: () => tone(440,'square',0.04,0.03,520),
  lock: () => tone(200,'square',0.06,0.04,140),
  clear1: () => tone(600,'triangle',0.15,0.07,800),
  clear4: () => [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,'triangle',0.2,0.07),i*60)),
  drop: () => tone(160,'square',0.06,0.05,90),
  over: () => [330,247,196,131].forEach((f,i)=>setTimeout(()=>tone(f,'sawtooth',0.3,0.07),i*120)),
  hold: () => tone(400,'sine',0.06,0.04,300),
};

/* ── 7-bag randomiser ── */
function refillBag() {
  bag = ['I','O','T','S','Z','J','L'];
  for (let i=bag.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [bag[i],bag[j]]=[bag[j],bag[i]]; }
}
function nextFromBag() {
  if (!bag.length) refillBag();
  return bag.pop();
}

/* ── Grid ── */
function emptyGrid() {
  grid = Array.from({length:ROWS}, () => new Array(COLS).fill(null));
}

function cellsFor(type, rot, ox, oy) {
  return SHAPES[type][rot].map(([x,y]) => [x+ox, y+oy]);
}

function collides(type, rot, ox, oy) {
  for (const [x,y] of cellsFor(type, rot, ox, oy)) {
    if (x < 0 || x >= COLS || y >= ROWS) return true;
    if (y >= 0 && grid[y][x]) return true;
  }
  return false;
}

function spawn(type) {
  cur = { type, rot:0, x:3, y:-1 };
  // if immediate collision at spawn → game over
  if (collides(cur.type, cur.rot, cur.x, cur.y+1) && collides(cur.type, cur.rot, cur.x, cur.y)) {
    // try nudge up once
    if (collides(cur.type, cur.rot, cur.x, cur.y)) { endGame(); return false; }
  }
  holdUsed = false;
  return true;
}

function newPiece() {
  const t = nextType || nextFromBag();
  nextType = nextFromBag();
  drawPreview(nctx, nextCanvas, nextType);
  return spawn(t);
}

/* ── Movement ── */
function move(dx, dy) {
  if (!cur) return false;
  if (!collides(cur.type, cur.rot, cur.x+dx, cur.y+dy)) {
    cur.x += dx; cur.y += dy;
    return true;
  }
  return false;
}

function rotate(dir) {
  if (!cur) return;
  const newRot = (cur.rot + dir + 4) % 4;
  for (const [kx,ky] of KICKS) {
    if (!collides(cur.type, newRot, cur.x+kx, cur.y+ky)) {
      cur.rot = newRot; cur.x += kx; cur.y += ky;
      Sfx.rotate();
      return;
    }
  }
}

function hardDrop() {
  if (!cur) return;
  let dist = 0;
  while (!collides(cur.type, cur.rot, cur.x, cur.y+1)) { cur.y++; dist++; }
  score += dist * 2;
  Sfx.drop();
  lockPiece();
}

function softDrop() {
  if (move(0,1)) { score += 1; dropTimer = 0; }
}

function ghostY() {
  let gy = cur.y;
  while (!collides(cur.type, cur.rot, cur.x, gy+1)) gy++;
  return gy;
}

/* ── Hold ── */
function holdPiece() {
  if (!cur || holdUsed) return;
  Sfx.hold();
  if (holdType === null) {
    holdType = cur.type;
    newPiece();
  } else {
    const tmp = holdType;
    holdType = cur.type;
    spawn(tmp);
  }
  holdUsed = true;
  drawPreview(hctx, holdCanvas, holdType);
}

/* ── Lock + line clears ── */
function lockPiece() {
  for (const [x,y] of cellsFor(cur.type, cur.rot, cur.x, cur.y)) {
    if (y >= 0 && y < ROWS && x >=0 && x < COLS) grid[y][x] = COLORS[cur.type];
    if (y < 0) { endGame(); return; } // locked above the top
  }
  Sfx.lock();
  // find full rows
  const full = [];
  for (let y=0;y<ROWS;y++) if (grid[y].every(c => c)) full.push(y);
  if (full.length) {
    clearingRows = full;
    clearAnim = 1;
    // scoring (classic-ish)
    const table = [0, 100, 300, 500, 800];
    score += table[full.length] * level;
    lines += full.length;
    if (full.length === 4) Sfx.clear4(); else Sfx.clear1();
    // level up every 10 lines
    const newLevel = Math.floor(lines/10) + 1;
    if (newLevel !== level) { level = newLevel; dropInterval = Math.max(80, 800 - (level-1)*70); }
    updateHud();
    // actual removal happens after the flash animation
    setTimeout(() => {
      clearingRows.sort((a,b)=>a-b).forEach(row => {
        grid.splice(row, 1);
        grid.unshift(new Array(COLS).fill(null));
      });
      clearingRows = [];
      if (!newPiece()) return;
    }, 160);
  } else {
    updateHud();
    cur = null;
    if (!newPiece()) return;
  }
  cur = cur; // no-op guard
}

/* ── Drawing ── */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}
function drawBlock(ctx, px, py, size, color, alpha=1, ghost=false) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (ghost) {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = 0.5;
    roundRect(ctx, px+2, py+2, size-4, size-4, 4); ctx.stroke();
  } else {
    roundRect(ctx, px+1, py+1, size-2, size-2, 4);
    ctx.fillStyle = color; ctx.fill();
    // top-left highlight
    ctx.globalAlpha = alpha*0.28; ctx.fillStyle = '#ffffff';
    roundRect(ctx, px+2, py+2, size-4, (size-4)*0.42, 3); ctx.fill();
    // subtle border
    ctx.globalAlpha = alpha; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth=1;
    roundRect(ctx, px+1, py+1, size-2, size-2, 4); ctx.stroke();
  }
  ctx.restore();
}

function drawBoard() {
  bctx.clearRect(0,0,boardCanvas.width,boardCanvas.height);
  // grid lines
  bctx.strokeStyle = 'rgba(30,30,46,0.6)'; bctx.lineWidth = 1;
  for (let x=1;x<COLS;x++){ bctx.beginPath(); bctx.moveTo(x*CELL,0); bctx.lineTo(x*CELL,ROWS*CELL); bctx.stroke(); }
  for (let y=1;y<ROWS;y++){ bctx.beginPath(); bctx.moveTo(0,y*CELL); bctx.lineTo(COLS*CELL,y*CELL); bctx.stroke(); }

  // settled blocks
  for (let y=0;y<ROWS;y++) {
    for (let x=0;x<COLS;x++) {
      if (grid[y][x]) {
        const flashing = clearingRows.includes(y);
        drawBlock(bctx, x*CELL, y*CELL, CELL, flashing ? '#ffffff' : grid[y][x], flashing ? (0.4+Math.random()*0.6) : 1);
      }
    }
  }

  // ghost + current
  if (cur) {
    const gy = ghostY();
    for (const [x,y] of cellsFor(cur.type, cur.rot, cur.x, gy)) {
      if (y >= 0) drawBlock(bctx, x*CELL, y*CELL, CELL, COLORS[cur.type], 1, true);
    }
    for (const [x,y] of cellsFor(cur.type, cur.rot, cur.x, cur.y)) {
      if (y >= 0) drawBlock(bctx, x*CELL, y*CELL, CELL, COLORS[cur.type]);
    }
  }

  if (paused) {
    bctx.fillStyle = 'rgba(8,8,13,0.72)';
    bctx.fillRect(0,0,boardCanvas.width,boardCanvas.height);
    bctx.fillStyle = '#e2e8f0';
    bctx.font = "600 26px 'Bebas Neue', sans-serif";
    bctx.textAlign='center'; bctx.textBaseline='middle';
    bctx.fillText('PAUSED', boardCanvas.width/2, boardCanvas.height/2);
  }
}

function drawPreview(ctx, canvas, type) {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if (!type) return;
  const cells = SHAPES[type][0];
  // compute bounds
  let minX=4,maxX=0,minY=4,maxY=0;
  cells.forEach(([x,y])=>{ minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y); });
  const w = maxX-minX+1, h = maxY-minY+1;
  const size = 20;
  const offX = (canvas.width - w*size)/2 - minX*size;
  const offY = (canvas.height - h*size)/2 - minY*size;
  cells.forEach(([x,y]) => drawBlock(ctx, offX+x*size, offY+y*size, size, COLORS[type]));
}

/* ── HUD ── */
function bump(el){ el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
function updateHud() {
  scoreEl.textContent = score; bump(scoreEl);
  linesEl.textContent = lines;
  levelEl.textContent = level;
  bestEl.textContent = Math.max(best, score);
}

/* ── Loop ── */
function loop(ts) {
  if (!running) return;
  frameId = requestAnimationFrame(loop);
  const dt = ts - (lastTime || ts);
  lastTime = ts;

  if (!paused && !over && cur && !clearingRows.length) {
    dropTimer += dt;
    if (dropTimer >= dropInterval) {
      dropTimer = 0;
      if (!move(0,1)) lockPiece();
    }
  }
  drawBoard();
}

/* ── Flow ── */
function startGame() {
  try{ if(!audioCtx) audioCtx=new(window.AudioContext||window.webkitAudioContext)(); }catch(_){}
  emptyGrid();
  bag = []; refillBag();
  score=0; lines=0; level=1; dropInterval=800; dropTimer=0;
  holdType=null; nextType=null; holdUsed=false; clearingRows=[];
  over=false; paused=false; running=true;
  drawPreview(hctx, holdCanvas, null);
  newPiece();
  updateHud();
  overlay.classList.add('hidden');
  lastTime=0;
  cancelAnimationFrame(frameId);
  frameId = requestAnimationFrame(loop);
}

function endGame() {
  running=false; over=true; cur=null;
  cancelAnimationFrame(frameId);
  Sfx.over();
  if (score > best) { best = score; localStorage.setItem('tetris_best', String(best)); }
  updateHud();
  overlayTitle.textContent = 'GAME OVER';
  overlaySub.innerHTML = `Score <strong style="color:var(--x-color)">${score}</strong> · ${lines} lines` +
    (score>=best && score>0 ? '<br>New best! 🏆' : `<br>Best: ${best}`);
  startBtn.textContent = 'PLAY AGAIN';
  overlay.classList.remove('hidden');
  drawBoard();
}

/* ── Input ── */
let dasTimer = 0;
window.addEventListener('keydown', e => {
  if (!running || over) {
    if (e.code === 'Enter') startGame();
    return;
  }
  switch (e.code) {
    case 'ArrowLeft':  if (move(-1,0)) Sfx.move(); e.preventDefault(); break;
    case 'ArrowRight': if (move(1,0)) Sfx.move(); e.preventDefault(); break;
    case 'ArrowDown':  softDrop(); e.preventDefault(); break;
    case 'ArrowUp':
    case 'KeyX':       rotate(1); e.preventDefault(); break;
    case 'KeyZ':       rotate(-1); e.preventDefault(); break;
    case 'Space':      hardDrop(); e.preventDefault(); break;
    case 'KeyC':       holdPiece(); e.preventDefault(); break;
    case 'KeyP':       paused = !paused; e.preventDefault(); break;
  }
});

/* Mobile buttons */
function bindTap(id, fn, repeat) {
  const el = $(id); if (!el) return;
  let iv = null;
  const press = e => {
    e.preventDefault();
    el.classList.add('pressed');
    if (!running || over || paused) return;
    fn();
    if (repeat) { iv = setInterval(() => { if(running&&!over&&!paused) fn(); }, 110); }
  };
  const release = () => { el.classList.remove('pressed'); if (iv){ clearInterval(iv); iv=null; } };
  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointerleave', release);
  el.addEventListener('pointercancel', release);
}
bindTap('m-left',  () => { if(move(-1,0)) Sfx.move(); }, true);
bindTap('m-right', () => { if(move(1,0)) Sfx.move(); }, true);
bindTap('m-down',  () => softDrop(), true);
bindTap('m-rot',   () => rotate(1), false);
bindTap('m-drop',  () => hardDrop(), false);

startBtn.addEventListener('click', startGame);

/* ── Boot idle ── */
emptyGrid();
drawBoard();
drawPreview(nctx, nextCanvas, null);
drawPreview(hctx, holdCanvas, null);
bestEl.textContent = best;
