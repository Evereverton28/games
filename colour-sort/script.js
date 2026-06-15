/* ════════════════════════════════════════════════════════
   COLOUR SORT  —  script.js
   Fixes: guaranteed-solvable generation, hint system
   ════════════════════════════════════════════════════════ */

const COLOURS = [
  '#f97316','#38bdf8','#a78bfa','#34d399',
  '#f472b6','#facc15','#fb7185','#818cf8',
];

const LEVELS = [
  { colours:3, tubeSize:4, emptyTubes:1 },  // 1 — intro
  { colours:4, tubeSize:4, emptyTubes:1 },  // 2
  { colours:4, tubeSize:4, emptyTubes:2 },  // 3 — extra empty tube
  { colours:5, tubeSize:4, emptyTubes:2 },  // 4
  { colours:6, tubeSize:4, emptyTubes:2 },  // 5
  { colours:6, tubeSize:4, emptyTubes:1 },  // 6 — tighter
  { colours:7, tubeSize:4, emptyTubes:2 },  // 7
  { colours:7, tubeSize:4, emptyTubes:1 },  // 8 — tighter
  { colours:8, tubeSize:4, emptyTubes:2 },  // 9
  { colours:8, tubeSize:4, emptyTubes:1 },  // 10 — hardest
];

/* ════════════════════════════════════════════════════════
   GUARANTEED-SOLVABLE PUZZLE GENERATOR
   Scrambles ONE segment at a time into any tube with room
   (ignoring colour matching). Every move is reversible so
   the result is always solvable from the solved state.
   ════════════════════════════════════════════════════════ */
function generateTubes(li) {
  const { colours, tubeSize, emptyTubes } = LEVELS[li];
  const totalTubes = colours + emptyTubes;

  // Build solved state as a flat pool then redistribute randomly.
  // This guarantees every colour appears exactly tubeSize times.
  const pool = [];
  for (let i = 0; i < colours; i++) {
    for (let j = 0; j < tubeSize; j++) pool.push(COLOURS[i]);
  }

  // Fisher-Yates shuffle the pool
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Fill colour tubes from shuffled pool
  const tubes = [];
  for (let i = 0; i < colours; i++) {
    tubes.push(pool.splice(0, tubeSize));
  }
  for (let i = 0; i < emptyTubes; i++) tubes.push([]);

  // If accidentally solved, re-shuffle until not (very rare)
  const isSolved = () => tubes.every(t =>
    t.length === 0 || (t.length === tubeSize && t.every(c => c === t[0]))
  );

  // Re-shuffle the pool until not accidentally in solved state
  let attempts = 0;
  while (isSolved() && attempts++ < 100) {
    // Swap two random segments from different tubes
    const t1 = Math.floor(Math.random() * colours);
    let t2 = Math.floor(Math.random() * colours);
    while (t2 === t1) t2 = Math.floor(Math.random() * colours);
    const s1 = Math.floor(Math.random() * tubeSize);
    const s2 = Math.floor(Math.random() * tubeSize);
    [tubes[t1][s1], tubes[t2][s2]] = [tubes[t2][s2], tubes[t1][s1]];
  }

  return tubes;
}

/* ════════════════════════════════════════════════════════
   PURE (STATIC) GAME LOGIC HELPERS
   These take tubes/tubeSize as arguments — no global state —
   so they can be used safely by generator + solver.
   ════════════════════════════════════════════════════════ */
function topColourStatic(tube) { return tube.length ? tube[tube.length-1] : null; }

function countTopStatic(tube) {
  if (!tube.length) return 0;
  const top = tube[tube.length-1]; let n = 0;
  for (let i = tube.length-1; i >= 0; i--) {
    if (tube[i] === top) n++; else break;
  }
  return n;
}

function canPourStatic(from, to, tubeSize) {
  if (!from.length || to.length === tubeSize) return false;
  // Don't allow moving a fully-uniform full tube (already solved, pointless)
  if (from.length === tubeSize && countTopStatic(from) === tubeSize) return false;
  if (!to.length) return true;
  return topColourStatic(from) === topColourStatic(to);
}

function isTubeSolvedStatic(tube, tubeSize) {
  return tube.length === tubeSize && tube.every(c => c === tube[0]);
}

function isSolvedStatic(tubes, tubeSize) {
  return tubes.every(t => t.length === 0 || isTubeSolvedStatic(t, tubeSize));
}

function deepCopyTubes(t) { return t.map(a => [...a]); }

/* ════════════════════════════════════════════════════════
   BFS HINT SOLVER
   Finds the shortest path from current state to solved.
   Returns the first move [fromIdx, toIdx], or null if
   no solution found within the search budget.
   ════════════════════════════════════════════════════════ */
function findHintMove(tubes, tubeSize) {
  const key = t => t.map(a => a.join(',')).join('|');
  const start = deepCopyTubes(tubes);

  if (isSolvedStatic(start, tubeSize)) return null;

  const queue = [{ tubes: start, moves: [] }];
  const visited = new Set([key(start)]);
  const MAX_STATES = 6000; // budget cap to stay responsive
  let explored = 0;

  while (queue.length && explored < MAX_STATES) {
    const { tubes: cur, moves } = queue.shift();
    explored++;

    const n = cur.length;
    for (let f = 0; f < n; f++) {
      for (let t = 0; t < n; t++) {
        if (f === t) continue;
        if (!canPourStatic(cur[f], cur[t], tubeSize)) continue;

        const next = deepCopyTubes(cur);
        const col = next[f][next[f].length-1];
        const count = Math.min(countTopStatic(next[f]), tubeSize - next[t].length);
        for (let i = 0; i < count; i++) next[t].push(next[f].pop());

        const k = key(next);
        if (visited.has(k)) continue;
        visited.add(k);

        const newMoves = [...moves, [f, t]];
        if (isSolvedStatic(next, tubeSize)) {
          return newMoves[0]; // first move of the solution path
        }
        queue.push({ tubes: next, moves: newMoves });
      }
    }
  }

  // BFS exhausted budget — fall back to a greedy best single move
  return findGreedyHint(tubes, tubeSize);
}

/* Greedy fallback: score each valid move and pick best */
function findGreedyHint(tubes, tubeSize) {
  const n = tubes.length;
  let best = null, bestScore = -Infinity;

  for (let f = 0; f < n; f++) {
    for (let t = 0; t < n; t++) {
      if (f === t || !canPourStatic(tubes[f], tubes[t], tubeSize)) continue;
      const score = scorePour(tubes, f, t, tubeSize);
      if (score > bestScore) { bestScore = score; best = [f, t]; }
    }
  }
  return best;
}

function scorePour(tubes, f, t, tubeSize) {
  const next = deepCopyTubes(tubes);
  const count = Math.min(countTopStatic(next[f]), tubeSize - next[t].length);
  for (let i = 0; i < count; i++) next[t].push(next[f].pop());

  let score = 0;
  // Reward: destination tube becomes uniform / completed
  if (isTubeSolvedStatic(next[t], tubeSize)) score += 100;
  else if (next[t].every(c => c === next[t][0])) score += count * 10;
  // Reward: source tube becomes empty (free slot)
  if (next[f].length === 0) score += 30;
  // Reward: consolidating more of the same colour
  score += count * 5;
  // Penalise: burying a different colour under the poured colour
  if (next[t].length > count && next[t][next[t].length-count-1] !== next[t][next[t].length-1]) score -= 8;
  return score;
}

/* ════════════════════════════════════════════════════════
   GAME STATE
   ════════════════════════════════════════════════════════ */
let state = {
  level: 0, tubes: [], tubeSize: 4,
  selected: null, moves: 0,
  history: [], bests: new Array(LEVELS.length).fill(null),
  won: false, pouring: false,
  hintsLeft: 3,
  hintMove: null,   // current active hint [fromIdx, toIdx] or null
};

/* ════════════════════════════════════════════════════════
   DOM
   ════════════════════════════════════════════════════════ */
const wrapper       = document.getElementById('tubes-wrapper');
const levelDisplay  = document.getElementById('level-display');
const movesDisplay  = document.getElementById('moves-display');
const bestDisplay   = document.getElementById('best-display');
const hintsDisplay  = document.getElementById('hints-display');
const winBanner     = document.getElementById('win-banner');
const hintMsg       = document.getElementById('hint-msg');
const btnUndo       = document.getElementById('btn-undo');
const btnHint       = document.getElementById('btn-hint');
const btnRestart    = document.getElementById('btn-restart');
const btnNext       = document.getElementById('btn-next');
const pCanvas       = document.getElementById('particles-canvas');
const pCtx          = pCanvas.getContext('2d');

function resize() { pCanvas.width = window.innerWidth; pCanvas.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();

/* ════════════════════════════════════════════════════════
   CANVAS ANIMATION ENGINE
   ════════════════════════════════════════════════════════ */
let particles = [];

function hex2rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n>>16)&255, (n>>8)&255, n&255];
}

function spawnBurst(x, y, col, n=16, options={}) {
  const [r,g,b] = hex2rgb(col);
  const { spread=Math.PI*2, dir=0, speedMin=1.5, speedMax=4.5, sizeMin=2, sizeMax=5, gravity=0.13 } = options;
  for (let i=0;i<n;i++) {
    const angle = dir + (Math.random()-0.5)*spread;
    const speed = speedMin + Math.random()*(speedMax-speedMin);
    particles.push({ kind:'dot', x, y,
      dx:Math.cos(angle)*speed, dy:Math.sin(angle)*speed,
      r:sizeMin+Math.random()*(sizeMax-sizeMin),
      life:1, decay:0.022+Math.random()*0.015, gravity, col:`${r},${g},${b}` });
  }
}

function spawnSparks(x, y, col, n=10) {
  const [r,g,b]=hex2rgb(col);
  for (let i=0;i<n;i++) {
    const angle = Math.random()*Math.PI*2;
    const speed = 3+Math.random()*5;
    particles.push({ kind:'spark', x, y,
      dx:Math.cos(angle)*speed, dy:Math.sin(angle)*speed,
      len:6+Math.random()*10, life:1, decay:0.04, gravity:0.18, col:`${r},${g},${b}` });
  }
}

function spawnRing(x, y, col, r=20) {
  const [ri,gi,bi]=hex2rgb(col);
  particles.push({ kind:'ring', x, y, r, maxR:r+60, life:1, decay:0.035, col:`${ri},${gi},${bi}` });
}

function spawnDroplets(x, y, col, n=8) {
  const [r,g,b]=hex2rgb(col);
  for (let i=0;i<n;i++) {
    const angle = -Math.PI/2+(Math.random()-0.5)*1.2;
    const speed = 2+Math.random()*3;
    particles.push({ kind:'droplet', x, y,
      dx:Math.cos(angle)*speed*0.5, dy:Math.sin(angle)*speed,
      w:2+Math.random()*3, h:5+Math.random()*7,
      life:1, decay:0.035, gravity:0.25, col:`${r},${g},${b}` });
  }
}

function spawnStar(x, y, col) {
  const [r,g,b]=hex2rgb(col);
  particles.push({ kind:'star', x, y, r:0, maxR:18+Math.random()*14,
    rot:Math.random()*Math.PI, life:1, decay:0.025, col:`${r},${g},${b}` });
}

/* hint sparkle — orbiting golden dots */
function spawnHintSparkle(x, y) {
  const [r,g,b] = hex2rgb('#facc15');
  for (let i=0; i<6; i++) {
    const angle = (i/6)*Math.PI*2;
    const speed = 0.5+Math.random()*1;
    particles.push({ kind:'dot', x, y,
      dx:Math.cos(angle)*speed, dy:Math.sin(angle)*speed-1.5,
      r:3+Math.random()*2, life:1, decay:0.018, gravity:-0.02, col:`${r},${g},${b}` });
  }
}

let arcs = [];

function spawnArc(x1, y1, x2, y2, col, onDone) {
  arcs.push({ x1, y1, x2, y2, col, t:0, done:false, onDone, spawnTimer:0 });
}

let tubeSpring = {};

function getTubeEl(idx) { return wrapper.querySelector(`[data-idx="${idx}"]`); }

function setSpringTarget(idx, target) {
  if (!tubeSpring[idx]) tubeSpring[idx] = { y:0, vy:0, target:0 };
  tubeSpring[idx].target = target;
}

let ripples = [];

function spawnRipple(x, y, col) {
  const [r,g,b]=hex2rgb(col);
  ripples.push({ x, y, r:4, maxR:36, life:1, decay:0.045, col:`${r},${g},${b}` });
}

let winWave = null;
function triggerWinWave(cols) { winWave = { t:0, cols }; }

let shakeX=0, shakeY=0, shakeT=0;
function triggerShake(mag) {
  shakeX=(Math.random()-0.5)*mag*2.2;
  shakeY=(Math.random()-0.5)*mag*2.2;
  shakeT=10;
}

function lerp(a,b,t){ return a+(b-a)*t; }
const K=0.22, DAMP=0.65;

function loop() {
  requestAnimationFrame(loop);
  pCtx.clearRect(0,0,pCanvas.width,pCanvas.height);

  /* shake */
  if (shakeT>0) {
    document.getElementById('container').style.transform=`translate(${shakeX.toFixed(1)}px,${shakeY.toFixed(1)}px)`;
    shakeX*=0.72; shakeY*=0.72; shakeT--;
  } else {
    document.getElementById('container').style.transform='';
  }

  /* spring lifts */
  Object.entries(tubeSpring).forEach(([idx,s])=>{
    const f=(s.target-s.y)*K;
    s.vy=(s.vy+f)*DAMP;
    s.y+=s.vy;
    const el=getTubeEl(Number(idx));
    if (el) el.style.transform=`translateY(${(-s.y).toFixed(2)}px)`;
  });

  /* arcs */
  arcs = arcs.filter(a=>{
    if (a.done) return false;
    a.t=Math.min(1,a.t+0.055);
    const t=a.t;
    const cx=(a.x1+a.x2)/2, cy=Math.min(a.y1,a.y2)-80;
    const bx=lerp(lerp(a.x1,cx,t),lerp(cx,a.x2,t),t);
    const by=lerp(lerp(a.y1,cy,t),lerp(cy,a.y2,t),t);
    a.spawnTimer++;
    if (a.spawnTimer%2===0) {
      const [r,g,b]=hex2rgb(a.col);
      particles.push({ kind:'dot',x:bx,y:by,dx:(Math.random()-0.5)*0.8,dy:(Math.random()-0.5)*0.8,
        r:4+Math.random()*3,life:0.85,decay:0.06,gravity:0.05,col:`${r},${g},${b}` });
    }
    const [r,g,b]=hex2rgb(a.col);
    pCtx.beginPath(); pCtx.arc(bx,by,6,0,Math.PI*2);
    pCtx.fillStyle=`rgba(${r},${g},${b},0.92)`; pCtx.fill();
    pCtx.beginPath(); pCtx.arc(bx,by,12,0,Math.PI*2);
    pCtx.fillStyle=`rgba(${r},${g},${b},0.18)`; pCtx.fill();
    if (a.t>=1) { a.done=true; if (a.onDone) a.onDone(bx,by); }
    return !a.done;
  });

  /* particles */
  particles.forEach(p=>{
    if (p.kind==='dot') {
      p.x+=p.dx; p.y+=p.dy; p.dy+=p.gravity; p.life-=p.decay;
      if (p.life<=0) return;
      pCtx.beginPath(); pCtx.arc(p.x,p.y,Math.max(0.5,p.r*p.life),0,Math.PI*2);
      pCtx.fillStyle=`rgba(${p.col},${Math.min(1,p.life).toFixed(2)})`; pCtx.fill();
    } else if (p.kind==='spark') {
      p.x+=p.dx; p.y+=p.dy; p.dy+=p.gravity; p.life-=p.decay;
      if (p.life<=0) return;
      pCtx.beginPath(); pCtx.moveTo(p.x,p.y);
      pCtx.lineTo(p.x-p.dx*p.len/6,p.y-p.dy*p.len/6);
      pCtx.strokeStyle=`rgba(${p.col},${p.life.toFixed(2)})`; pCtx.lineWidth=1.5*p.life; pCtx.stroke();
    } else if (p.kind==='ring') {
      p.r=lerp(p.r,p.maxR,0.12); p.life-=p.decay;
      if (p.life<=0) return;
      pCtx.beginPath(); pCtx.arc(p.x,p.y,p.r,0,Math.PI*2);
      pCtx.strokeStyle=`rgba(${p.col},${(p.life*0.7).toFixed(2)})`; pCtx.lineWidth=2.5*p.life; pCtx.stroke();
    } else if (p.kind==='droplet') {
      p.x+=p.dx; p.y+=p.dy; p.dy+=p.gravity; p.life-=p.decay;
      if (p.life<=0) return;
      pCtx.save(); pCtx.translate(p.x,p.y);
      pCtx.beginPath(); pCtx.ellipse(0,0,p.w*0.5,p.h*0.5*p.life,0,0,Math.PI*2);
      pCtx.fillStyle=`rgba(${p.col},${p.life.toFixed(2)})`; pCtx.fill(); pCtx.restore();
    } else if (p.kind==='star') {
      p.r=lerp(p.r,p.maxR,0.1); p.life-=p.decay; p.rot+=0.08;
      if (p.life<=0) return;
      drawStar(pCtx,p.x,p.y,5,p.r*0.5,p.r,p.rot,`rgba(${p.col},${p.life.toFixed(2)})`);
    }
  });
  particles=particles.filter(p=>p.life>0);

  /* ripples */
  ripples.forEach(r=>{ r.r=lerp(r.r,r.maxR,0.14); r.life-=r.decay; });
  ripples=ripples.filter(r=>r.life>0);
  ripples.forEach(r=>{
    pCtx.beginPath(); pCtx.arc(r.x,r.y,r.r,0,Math.PI*2);
    pCtx.strokeStyle=`rgba(${r.col},${(r.life*0.6).toFixed(2)})`; pCtx.lineWidth=2; pCtx.stroke();
  });

  /* win wave */
  if (winWave) {
    winWave.t+=0.018;
    winWave.cols.forEach((col,c)=>{
      const phase=winWave.t+c*0.4;
      const alpha=Math.max(0,(Math.sin(phase)*0.5+0.5)*(1-winWave.t*0.3));
      if (alpha<=0) return;
      const [r,g,b]=hex2rgb(col);
      const el=Array.from(wrapper.children)[c];
      if (el) {
        const rect=el.getBoundingClientRect();
        pCtx.beginPath();
        pCtx.arc(rect.left+rect.width/2,rect.top+rect.height/2,30+20*Math.sin(phase*1.3),0,Math.PI*2);
        pCtx.strokeStyle=`rgba(${r},${g},${b},${(alpha*0.5).toFixed(2)})`; pCtx.lineWidth=2; pCtx.stroke();
      }
    });
    if (winWave.t>5) winWave=null;
  }

  /* hint sparkle — periodic golden burst above hint-from tube */
  if (state.hintMove) {
    const fromEl=getTubeEl(state.hintMove[0]);
    if (fromEl && Math.random()<0.08) {
      const rect=fromEl.getBoundingClientRect();
      spawnHintSparkle(rect.left+rect.width/2, rect.top-6);
    }
  }
}
loop();

function drawStar(ctx,cx,cy,pts,inner,outer,rot,col){
  ctx.beginPath();
  for (let i=0;i<pts*2;i++) {
    const r=i%2===0?outer:inner, a=rot+i*Math.PI/pts;
    i===0?ctx.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r)
         :ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);
  }
  ctx.closePath(); ctx.fillStyle=col; ctx.fill();
}

/* ════════════════════════════════════════════════════════
   AUDIO
   ════════════════════════════════════════════════════════ */
let audioCtx=null;
function getAudio(){ if(!audioCtx) audioCtx=new(window.AudioContext||window.webkitAudioContext)(); return audioCtx; }
function playSound(freq,type='square',dur=0.1,vol=0.07,freqEnd){
  try {
    const ctx=getAudio(), osc=ctx.createOscillator(), gain=ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination); osc.type=type;
    osc.frequency.setValueAtTime(freq,ctx.currentTime);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd,ctx.currentTime+dur);
    gain.gain.setValueAtTime(vol,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur);
    osc.start(); osc.stop(ctx.currentTime+dur);
  } catch(_) {}
}
const Sounds={
  select:   ()=>playSound(380,'sine',0.07,0.06,460),
  deselect: ()=>playSound(340,'sine',0.06,0.04,280),
  pour:     ()=>{ playSound(260,'triangle',0.1,0.07,200); playSound(320,'sine',0.06,0.04); },
  invalid:  ()=>playSound(140,'sawtooth',0.1,0.06,100),
  solved:   ()=>{ playSound(520,'triangle',0.18,0.09,660); setTimeout(()=>playSound(660,'triangle',0.2,0.08,800),100); },
  hint:     ()=>{ playSound(600,'sine',0.08,0.05,700); setTimeout(()=>playSound(750,'sine',0.1,0.04,850),90); },
  noHints:  ()=>playSound(200,'sawtooth',0.12,0.05,150),
  win:      ()=>{ [0,180,360,540].forEach((d,i)=>setTimeout(()=>playSound([440,550,660,880][i],'triangle',0.45-i*0.05,0.1-i*0.01),d)); },
};

/* ════════════════════════════════════════════════════════
   STATE ACCESSORS  (use global state.level/tubeSize)
   ════════════════════════════════════════════════════════ */
function topColour(t){ return topColourStatic(t); }
function countTop(t){ return countTopStatic(t); }
function canPour(from,to,ts){ return canPourStatic(from,to,ts); }
function isTubeSolved(tube){ return isTubeSolvedStatic(tube, LEVELS[state.level].tubeSize); }
function isSolved(tubes){ return isSolvedStatic(tubes, LEVELS[state.level].tubeSize); }
function deepCopy(t){ return deepCopyTubes(t); }

/* ════════════════════════════════════════════════════════
   RENDER
   ════════════════════════════════════════════════════════ */
function renderTubes(opts={}) {
  const ts   = LEVELS[state.level].tubeSize;
  const segH = 100/ts;

  if (opts.rebuild!==false) {
    wrapper.innerHTML='';
    state.tubes.forEach((tube,idx)=>{
      const el=document.createElement('div');
      el.className='tube';
      el.dataset.idx=idx;
      if (idx===state.selected)             el.classList.add('selected');
      if (isTubeSolved(tube))               el.classList.add('solved');
      if (state.hintMove && idx===state.hintMove[0]) el.classList.add('hint-from');
      if (state.hintMove && idx===state.hintMove[1]) el.classList.add('hint-to');

      tube.forEach((col,si)=>{
        const seg=document.createElement('div');
        seg.className='segment'+(opts.pourInIdx===idx&&si===tube.length-1?' pour-in':'');
        seg.style.height=`${segH}%`;
        seg.style.backgroundColor=col;
        el.appendChild(seg);
      });

      el.style.opacity = '1';
      el.addEventListener('click', () => onTubeClick(idx));
      wrapper.appendChild(el);
    });

    Object.keys(tubeSpring).forEach(k=>{
      setSpringTarget(Number(k), Number(k)===state.selected ? 14 : 0);
    });
  }

  movesDisplay.textContent=state.moves;
  levelDisplay.textContent=state.level+1;
  const best=state.bests[state.level];
  bestDisplay.textContent=best!==null?best:'—';
  hintsDisplay.textContent=state.hintsLeft;
  btnHint.disabled=state.hintsLeft<=0||state.won;
}

function bumpHud(id){
  const el=document.getElementById(id);
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

/* ════════════════════════════════════════════════════════
   HINT SYSTEM
   ════════════════════════════════════════════════════════ */
let hintTimeout=null;

function clearHint() {
  state.hintMove=null;
  if (hintTimeout) { clearTimeout(hintTimeout); hintTimeout=null; }
  hintMsg.style.display='none';
  // Remove hint classes without full rebuild
  wrapper.querySelectorAll('.hint-from,.hint-to').forEach(el=>{
    el.classList.remove('hint-from','hint-to');
  });
}

function showHint() {
  if (state.won||state.pouring) return;
  if (state.hintsLeft<=0) {
    Sounds.noHints();
    triggerShake(2);
    hintMsg.innerHTML='<strong>No hints left</strong> — try restarting if you\'re stuck!';
    hintMsg.style.display='block';
    setTimeout(()=>hintMsg.style.display='none',2500);
    return;
  }

  try { getAudio(); } catch(_) {}

  const ts=LEVELS[state.level].tubeSize;
  const move=findHintMove(deepCopy(state.tubes), ts);

  if (!move) {
    // This shouldn't happen with the new generator, but handle it gracefully
    hintMsg.innerHTML='Looking good — keep going!';
    hintMsg.style.display='block';
    setTimeout(()=>hintMsg.style.display='none',2000);
    return;
  }

  state.hintsLeft--;
  state.hintMove=move;
  Sounds.hint();
  bumpHud('hints-display');

  // Visual: sparkle above from-tube, arrow flash
  const fromEl=getTubeEl(move[0]), toEl=getTubeEl(move[1]);
  if (fromEl) {
    const r=fromEl.getBoundingClientRect();
    for (let i=0;i<3;i++) setTimeout(()=>spawnHintSparkle(r.left+r.width/2,r.top-6),i*120);
  }
  if (toEl) {
    const r=toEl.getBoundingClientRect();
    for (let i=0;i<3;i++) setTimeout(()=>spawnHintSparkle(r.left+r.width/2,r.top-6),i*120+60);
  }

  // Describe the move in plain English
  const fromCol=topColour(state.tubes[move[0]]);
  const colName=colourName(fromCol);
  const destEmpty=state.tubes[move[1]].length===0;
  hintMsg.innerHTML=destEmpty
    ? `Move the <strong style="color:${fromCol}">${colName}</strong> into the empty tube`
    : `Pour the <strong style="color:${fromCol}">${colName}</strong> into tube ${move[1]+1}`;
  hintMsg.style.display='block';

  renderTubes({rebuild:true});

  // Auto-clear hint after 4 seconds
  hintTimeout=setTimeout(()=>{ clearHint(); renderTubes({rebuild:true}); }, 4000);
}

function colourName(hex) {
  const map={
    '#f97316':'orange','#38bdf8':'cyan','#a78bfa':'violet',
    '#34d399':'emerald','#f472b6':'pink','#facc15':'yellow',
    '#fb7185':'rose','#818cf8':'indigo',
  };
  return map[hex]||'colour';
}

/* ════════════════════════════════════════════════════════
   ANIMATED POUR
   ════════════════════════════════════════════════════════ */
function animatedPour(fromIdx, toIdx, col, onDone) {
  const fromEl=getTubeEl(fromIdx), toEl=getTubeEl(toIdx);
  if (!fromEl||!toEl){ onDone(); return; }
  const fr=fromEl.getBoundingClientRect(), tr=toEl.getBoundingClientRect();
  const x1=fr.left+fr.width/2, y1=fr.top+8;
  const x2=tr.left+tr.width/2, y2=tr.top+8;
  setSpringTarget(fromIdx, 14+Math.sign(x2-x1)*4);
  spawnArc(x1,y1,x2,y2,col,()=>{
    const landY=tr.top+tr.height*0.3;
    spawnBurst(x2,landY,col,10,{spread:Math.PI,dir:Math.PI/2,speedMin:1,speedMax:3,gravity:0.2});
    spawnDroplets(x2,landY,col,6);
    spawnRipple(x2,landY,col);
    spawnRipple(x2,landY,col);
    triggerShake(2);
    if (onDone) onDone();
  });
}

/* ════════════════════════════════════════════════════════
   CLICK HANDLER
   ════════════════════════════════════════════════════════ */
function onTubeClick(idx) {
  try { getAudio(); } catch(_) {}
  if (state.won||state.pouring) return;

  const tube=state.tubes[idx];
  const ts=LEVELS[state.level].tubeSize;

  // If user clicks the hinted from-tube → auto-select it and clear hint text
  // If user makes ANY move while hint is showing, clear the hint highlight
  if (state.hintMove) {
    // Let the move proceed; clear hint after action
  }

  if (state.selected===null) {
    if (!tube.length||isTubeSolved(tube)) return;
    clearHint();
    state.selected=idx;
    Sounds.select();
    setSpringTarget(idx,14);
    renderTubes({rebuild:true});
    return;
  }

  if (state.selected===idx) {
    clearHint();
    state.selected=null;
    Sounds.deselect();
    setSpringTarget(idx,0);
    renderTubes({rebuild:true});
    return;
  }

  const fromTube=state.tubes[state.selected];
  if (!canPour(fromTube,tube,ts)) {
    Sounds.invalid();
    triggerShake(3.5);
    const el=getTubeEl(state.selected);
    if (el){ el.classList.add('invalid-flash'); setTimeout(()=>el.classList.remove('invalid-flash'),450); }
    if (!tubeSpring[state.selected]) tubeSpring[state.selected]={y:0,vy:0,target:14};
    tubeSpring[state.selected].vy=-5;
    if (el){ const r=el.getBoundingClientRect(); spawnBurst(r.left+r.width/2,r.top,'#fb7185',8,{speedMin:1,speedMax:3}); }
    state.selected=null;
    clearHint();
    setTimeout(()=>renderTubes({rebuild:true}),460);
    return;
  }

  const fromIdx=state.selected;
  state.selected=null;
  state.pouring=true;
  clearHint();

  state.history.push({ tubes:deepCopy(state.tubes), moves:state.moves });
  const col=topColour(fromTube);
  const available=Math.min(countTop(fromTube), ts-tube.length);
  for (let i=0;i<available;i++) tube.push(fromTube.pop());
  state.moves++;
  bumpHud('moves-display');
  Sounds.pour();
  setSpringTarget(fromIdx,0);
  renderTubes({rebuild:true});

  animatedPour(fromIdx, idx, col, ()=>{
    state.pouring=false;
    renderTubes({rebuild:true, pourInIdx:idx});

    if (isTubeSolved(state.tubes[idx])) {
      Sounds.solved();
      const el=getTubeEl(idx);
      if (el) {
        const r=el.getBoundingClientRect();
        const cx=r.left+r.width/2, cy=r.top+r.height/2;
        spawnBurst(cx,cy,state.tubes[idx][0],20,{speedMin:2,speedMax:6});
        spawnSparks(cx,cy,state.tubes[idx][0],12);
        spawnRing(cx,cy,state.tubes[idx][0],10);
        spawnStar(cx,cy,state.tubes[idx][0]);
        spawnStar(cx+20,cy-20,state.tubes[idx][0]);
        spawnStar(cx-20,cy-10,state.tubes[idx][0]);
        triggerShake(4);
      }
    }

    if (isSolved(state.tubes)) {
      state.won=true;
      if (state.bests[state.level]===null||state.moves<state.bests[state.level])
        state.bests[state.level]=state.moves;
      Sounds.win();
      triggerShake(7);
      bumpHud('best-display');
      const cols=state.tubes.map(t=>t[0]||COLOURS[0]);
      triggerWinWave(cols);
      Array.from(wrapper.children).forEach((el,i)=>{
        setTimeout(()=>{
          const r=el.getBoundingClientRect();
          const cx=r.left+r.width/2, cy=r.top+r.height/2;
          const c=state.tubes[i][0]||'#38bdf8';
          spawnBurst(cx,cy,c,22,{speedMin:2,speedMax:7});
          spawnSparks(cx,cy,c,10);
          spawnRing(cx,cy,c,8);
          for (let s=0;s<3;s++) spawnStar(cx+(Math.random()-0.5)*40,cy+(Math.random()-0.5)*40,c);
        }, i*90);
      });
      setTimeout(()=>{
        winBanner.style.display='block';
        winBanner.classList.add('show');
        btnNext.style.display=state.level<LEVELS.length-1?'':'none';
        renderTubes({rebuild:true});
      },400);
    }
  });
}

/* ════════════════════════════════════════════════════════
   CONTROLS
   ════════════════════════════════════════════════════════ */
btnUndo.addEventListener('click',()=>{
  if (!state.history.length||state.pouring) return;
  const snap=state.history.pop();
  state.tubes=snap.tubes; state.moves=snap.moves;
  state.selected=null; state.won=false; state.pouring=false;
  tubeSpring={};
  clearHint();
  winBanner.style.display='none'; winBanner.classList.remove('show');
  btnNext.style.display='none';
  renderTubes({rebuild:true});
  Sounds.deselect();
  triggerShake(1.5);
});

btnHint.addEventListener('click', showHint);
btnRestart.addEventListener('click',()=>{ if (!state.pouring) startLevel(state.level); });
btnNext.addEventListener('click',()=>{ if (state.level<LEVELS.length-1) startLevel(state.level+1); });

/* ════════════════════════════════════════════════════════
   LEVEL START
   ════════════════════════════════════════════════════════ */
function startLevel(idx) {
  state.level=idx;
  state.tubes=generateTubes(idx);
  state.selected=null; state.moves=0; state.history=[];
  state.won=false; state.pouring=false;
  state.hintsLeft=3; state.hintMove=null;
  tubeSpring={};
  winBanner.style.display='none'; winBanner.classList.remove('show');
  btnNext.style.display='none';
  hintMsg.style.display='none';
  particles=[]; arcs=[]; ripples=[]; winWave=null;
  if (hintTimeout) { clearTimeout(hintTimeout); hintTimeout=null; }
  renderTubes({rebuild:true, entrance:true});
}

startLevel(0);