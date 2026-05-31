/* ═══════════════════════════════════════════════════════════════
   CHECKERS — script.js
   Rules: standard 8×8 English draughts
   • Mandatory jumps (single + multi-jump)
   • King promotion
   • vs Human or AI (minimax + alpha-beta)
   • Move history, captured pieces, undo
═══════════════════════════════════════════════════════════════ */

/* ── Constants ─────────────────────────────────────────────── */
const EMPTY  = 0;
const R      = 1;   // red man
const RK     = 2;   // red king
const B      = 3;   // black man
const BK     = 4;   // black king

function isRed(p)   { return p===R||p===RK; }
function isBlack(p) { return p===B||p===BK; }
function isKing(p)  { return p===RK||p===BK; }
function colorOf(p) { return isRed(p)?'red':(isBlack(p)?'black':null); }
function enemy(c)   { return c==='red'?'black':'red'; }

/* ── Game state ─────────────────────────────────────────────── */
let G = {};
let gameMode    = 'human';
let playerColor = 'red';
let aiDepth     = 4;
let aiThinking  = false;

function freshBoard() {
  const b = Array(64).fill(EMPTY);
  for (let r=0;r<3;r++) for (let c=0;c<8;c++) if ((r+c)%2!==0) b[r*8+c]=B;
  for (let r=5;r<8;r++) for (let c=0;c<8;c++) if ((r+c)%2!==0) b[r*8+c]=R;
  return b;
}

function freshState() {
  return {
    board: freshBoard(),
    turn: 'red',
    selected: null,
    legalDests: [],       // squares the selected piece can move to
    mandatoryFrom: null,  // if mid-multi-jump, locked to this square
    history: [],
    redCaps: 0,
    blackCaps: 0,
    moveCount: 0,
    gameOver: false,
  };
}

/* ══════════════════════════════════════════════════════════════
   MOVE GENERATION
══════════════════════════════════════════════════════════════ */
function idx(r,c) { return r*8+c; }
function row(i)   { return Math.floor(i/8); }
function col(i)   { return i%8; }

// Returns all jumps from `from` in the board, recursively (multi-jump chains)
// Each returned jump: { path: [sq, ...], captured: [sq, ...] }
function getJumps(board, from, c, visited=new Set()) {
  const p = board[from];
  const dirs = [];
  if (c==='red'  || isKing(p)) dirs.push([-1,-1],[-1,1]);
  if (c==='black'|| isKing(p)) dirs.push([ 1,-1],[ 1,1]);

  const results = [];
  const r=row(from), f=col(from);
  for (const [dr,dc] of dirs) {
    const mr=r+dr, mc=f+dc;   // mid (enemy)
    const lr=r+2*dr, lc=f+2*dc; // landing
    if (lr<0||lr>=8||lc<0||lc>=8) continue;
    const mid=idx(mr,mc), land=idx(lr,lc);
    if (!isEnemy(board[mid],c)) continue;
    if (board[land]!==EMPTY && land!==from) continue;
    if (visited.has(mid)) continue;

    // Apply tentative move
    const nb = [...board];
    const orig = nb[from];
    nb[land] = orig;
    nb[from] = EMPTY;
    nb[mid]  = EMPTY;
    // Promote if king is earned mid-jump? Standard rules: only at end of turn
    const v2 = new Set([...visited, mid]);
    const further = getJumps(nb, land, c, v2);
    if (further.length===0) {
      results.push({ path:[from,land], captured:[mid] });
    } else {
      for (const f2 of further) {
        results.push({ path:[from,...f2.path], captured:[mid,...f2.captured] });
      }
    }
  }
  return results;
}

function isEnemy(piece, c) {
  return c==='red' ? isBlack(piece) : isRed(piece);
}

// Simple (non-jump) moves
function getSimpleMoves(board, from, c) {
  const p=board[from];
  const dirs=[];
  if (c==='red'  ||isKing(p)) dirs.push([-1,-1],[-1,1]);
  if (c==='black'||isKing(p)) dirs.push([ 1,-1],[ 1,1]);
  const r=row(from),f=col(from);
  const moves=[];
  for (const [dr,dc] of dirs) {
    const nr=r+dr,nc=f+dc;
    if(nr<0||nr>=8||nc<0||nc>=8) continue;
    const ti=idx(nr,nc);
    if(board[ti]===EMPTY) moves.push({path:[from,ti],captured:[]});
  }
  return moves;
}

// All legal moves for a color (mandatory jumps enforced)
function allMoves(board, c) {
  const jumps=[], simples=[];
  for(let i=0;i<64;i++) {
    if(colorOf(board[i])!==c) continue;
    jumps.push(...getJumps(board,i,c));
    simples.push(...getSimpleMoves(board,i,c));
  }
  return jumps.length>0 ? jumps : simples;
}

// Moves for a specific piece (respecting mandatory jump rule)
function movesFrom(board, from, c, allMovesCache) {
  const cache = allMovesCache || allMoves(board,c);
  return cache.filter(m=>m.path[0]===from);
}

/* ── Apply a move ───────────────────────────────────────────── */
function applyMove(board, move) {
  const nb=[...board];
  const from=move.path[0], to=move.path[move.path.length-1];
  const piece=nb[from];
  for(const c of move.captured) nb[c]=EMPTY;
  nb[to]=piece; nb[from]=EMPTY;
  // Promotion
  if(piece===R && row(to)===0) nb[to]=RK;
  if(piece===B && row(to)===7) nb[to]=BK;
  return nb;
}

function promotionHappened(board, move) {
  const to=move.path[move.path.length-1];
  const piece=board[move.path[0]];
  return (piece===R&&row(to)===0)||(piece===B&&row(to)===7);
}

/* ── Move notation ──────────────────────────────────────────── */
function sqName(i) { return 'abcdefgh'[col(i)]+(8-row(i)); }
function moveSAN(move) {
  const sep = move.captured.length>0 ? 'x' : '-';
  if(move.path.length===2) return sqName(move.path[0])+sep+sqName(move.path[1]);
  return move.path.map(sqName).join(sep);
}

/* ══════════════════════════════════════════════════════════════
   AI (Minimax + Alpha-Beta)
══════════════════════════════════════════════════════════════ */
const PST_MAN = [
   0, 4, 0, 4, 0, 4, 0, 4,
   4, 0, 3, 0, 3, 0, 3, 0,
   0, 3, 0, 2, 0, 2, 0, 3,
   4, 0, 2, 0, 1, 0, 2, 0,
   0, 2, 0, 1, 0, 2, 0, 4,
   3, 0, 2, 0, 2, 0, 3, 0,
   0, 3, 0, 3, 0, 3, 0, 4,
   4, 0, 4, 0, 4, 0, 4, 0,
];

function evaluate(board) {
  let score=0;
  for(let i=0;i<64;i++) {
    const p=board[i];
    if(p===EMPTY) continue;
    const pstR = PST_MAN[i];
    const pstB = PST_MAN[63-i];
    if(p===R)  score += 100 + pstR;
    if(p===RK) score += 280;
    if(p===B)  score -= (100 + pstB);
    if(p===BK) score -= 280;
  }
  return score;
}

function minimax(board, depth, alpha, beta, maximizing, color) {
  const moves = allMoves(board, color);
  if(depth===0||moves.length===0) {
    if(moves.length===0) return maximizing ? -99999 : 99999;
    return evaluate(board);
  }
  // Order: jumps first
  moves.sort((a,b2)=>b2.captured.length-a.captured.length);

  if(maximizing) {
    let best=-Infinity;
    for(const m of moves) {
      const nb=applyMove(board,m);
      const v=minimax(nb,depth-1,alpha,beta,false,enemy(color));
      best=Math.max(best,v); alpha=Math.max(alpha,v);
      if(beta<=alpha) break;
    }
    return best;
  } else {
    let best=Infinity;
    for(const m of moves) {
      const nb=applyMove(board,m);
      const v=minimax(nb,depth-1,alpha,beta,true,enemy(color));
      best=Math.min(best,v); beta=Math.min(beta,v);
      if(beta<=alpha) break;
    }
    return best;
  }
}

function getBestMove(board, c, depth) {
  const moves=allMoves(board,c);
  if(!moves.length) return null;
  moves.sort((a,b2)=>b2.captured.length-a.captured.length);
  const max=c==='red';
  let best=null, bestVal=max?-Infinity:Infinity;
  for(const m of moves) {
    const nb=applyMove(board,m);
    const v=minimax(nb,depth-1,-Infinity,Infinity,!max,enemy(c));
    if(max?v>bestVal:v<bestVal){bestVal=v;best=m;}
  }
  return best;
}

/* ══════════════════════════════════════════════════════════════
   UI
══════════════════════════════════════════════════════════════ */
const $board    = document.getElementById('board');
const $history  = document.getElementById('move-history');
const $scoreR   = document.getElementById('score-red');
const $scoreB   = document.getElementById('score-black');
const $trayR    = document.getElementById('tray-red');
const $trayB    = document.getElementById('tray-black');
const $turn     = document.getElementById('turn-indicator');
const $status   = document.getElementById('status-bar');
const $cardR    = document.getElementById('score-card-red');
const $cardB    = document.getElementById('score-card-black');

function renderBoard() {
  $board.innerHTML='';
  const {board, selected, legalDests, history, mandatoryFrom} = G;
  const lastMove = history[history.length-1];

  for(let i=0;i<64;i++) {
    const r=row(i), c=col(i);
    const sq=document.createElement('div');
    sq.className='sq '+((r+c)%2===0?'light':'dark');
    sq.dataset.idx=i;

    if(i===selected)       sq.classList.add('selected');
    if(legalDests.includes(i)) sq.classList.add('legal-move');
    if(lastMove) {
      const lp=lastMove.path;
      if(i===lp[0])              sq.classList.add('last-from');
      if(i===lp[lp.length-1])    sq.classList.add('last-to');
    }

    const p=board[i];
    if(p!==EMPTY) {
      const piece=document.createElement('div');
      piece.className='piece '+(isRed(p)?'red':'black-p')+(isKing(p)?' king':'');
      if(i===selected) piece.classList.add('selected-piece');
      piece.addEventListener('click',()=>onSquareClick(i));
      sq.appendChild(piece);
    }

    // Clickable dark squares
    if((r+c)%2!==0) sq.addEventListener('click',()=>onSquareClick(i));
    $board.appendChild(sq);
  }
}

function renderScores() {
  // Count remaining pieces
  let rc=0,bc=0;
  for(const p of G.board) { if(isRed(p)) rc++; if(isBlack(p)) bc++; }
  $scoreR.textContent = rc;
  $scoreB.textContent = bc;

  // Captured trays
  $trayR.innerHTML=''; $trayB.innerHTML='';
  for(let i=0;i<G.blackCaps;i++) {
    const pip=document.createElement('div');
    pip.className='cap-pip black'; $trayR.appendChild(pip);
  }
  for(let i=0;i<G.redCaps;i++) {
    const pip=document.createElement('div');
    pip.className='cap-pip red'; $trayB.appendChild(pip);
  }

  // Active card glow
  $cardR.classList.remove('active-x','active-o');
  $cardB.classList.remove('active-x','active-o');
  if(!G.gameOver) {
    if(G.turn==='red')   $cardR.classList.add('active-x');
    else                 $cardB.classList.add('active-o');
  }
}

function renderHistory() {
  $history.innerHTML='';
  G.history.forEach((m,i)=>{
    const div=document.createElement('div');
    div.className='move-entry';
    const mn=document.createElement('span'); mn.className='mn';
    mn.textContent=(Math.floor(i/2)+1)+(i%2===0?'.W':'.B')+' ';
    const mt=document.createElement('span'); mt.className='mt';
    mt.textContent=moveSAN(m);
    div.appendChild(mn); div.appendChild(mt);
    $history.appendChild(div);
  });
  $history.scrollTop=$history.scrollHeight;
}

function setTurn() {
  if(G.gameOver){$turn.textContent='Game Over';return;}
  $turn.textContent=(G.turn==='red'?'Red':'Black')+"'s Turn";
}

function setStatus(msg){$status.textContent=msg;}

function showThinking(){
  $status.innerHTML='Computer thinking <span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span>';
}

/* ── Interaction ────────────────────────────────────────────── */
function onSquareClick(i) {
  if(G.gameOver||aiThinking) return;
  if(gameMode==='ai' && G.turn!==playerColor) return;

  const {board, turn, selected, legalDests, mandatoryFrom} = G;
  const p = board[i];

  // If clicking a legal destination → execute move
  if(legalDests.includes(i) && selected!==null) {
    // Find the matching move (first path step = selected, last = i)
    const allM = allMoves(board, turn);
    const candidates = allM.filter(m=>m.path[0]===selected && m.path[m.path.length-1]===i);
    if(candidates.length) executeMove(candidates[0]);
    return;
  }

  // If mandatory-from is active, only allow selecting that piece
  if(mandatoryFrom!==null) {
    if(i===mandatoryFrom) { showLegal(i); }
    return;
  }

  // Select own piece
  if(p!==EMPTY && colorOf(p)===turn) {
    const allM=allMoves(board,turn);
    const fromMoves=movesFrom(board,i,turn,allM);
    if(fromMoves.length===0) { setStatus('No legal moves for this piece.'); return; }
    G.selected=i;
    G.legalDests=fromMoves.map(m=>m.path[m.path.length-1]);
    renderBoard(); setStatus('');
  } else {
    G.selected=null; G.legalDests=[];
    renderBoard();
  }
}

function showLegal(from) {
  const allM=allMoves(G.board, G.turn);
  const fromMoves=movesFrom(G.board,from,G.turn,allM);
  G.selected=from;
  G.legalDests=fromMoves.map(m=>m.path[m.path.length-1]);
  renderBoard();
}

function executeMove(move) {
  const {board, turn} = G;
  const promoted = promotionHappened(board, move);
  const nb = applyMove(board, move);

  // Snapshot for undo
  G.history.push({
    ...move,
    san: moveSAN(move),
    boardSnap: [...board],
    redCapsSnap: G.redCaps,
    blackCapsSnap: G.blackCaps,
    turnSnap: turn,
  });

  // Update captures
  if(turn==='red')   G.blackCaps += move.captured.length;
  else               G.redCaps   += move.captured.length;

  G.board = nb;
  G.selected = null;
  G.legalDests = [];
  G.mandatoryFrom = null;
  G.moveCount++;

  // Switch turn
  G.turn = enemy(turn);

  renderBoard(); renderScores(); renderHistory(); setTurn();

  // Check game over
  const nextMoves=allMoves(G.board, G.turn);
  if(nextMoves.length===0) {
    G.gameOver=true;
    const winner=turn==='red'?'Red':'Black';
    setStatus('No moves — '+winner+' wins!');
    renderScores();
    setTimeout(()=>showModal('⬤','Game Over!',winner+' wins — '+enemy(turn)+ ' has no moves left.'),500);
    return;
  }
  // Check if any pieces remain
  let rc=0,bc=0;
  for(const p of G.board){if(isRed(p))rc++;if(isBlack(p))bc++;}
  if(rc===0||bc===0){
    G.gameOver=true;
    const winner=rc>0?'Red':'Black';
    setStatus(winner+' wins by capturing all pieces!');
    renderScores();
    setTimeout(()=>showModal('⬤',winner+' Wins!',winner+' captured all opponent pieces.'),500);
    return;
  }

  setStatus('');

  // AI turn
  if(gameMode==='ai' && G.turn!==playerColor && !G.gameOver) {
    aiThinking=true; showThinking();
    setTimeout(doAIMove, 120);
  }
}

function doAIMove() {
  const best=getBestMove(G.board, G.turn, aiDepth);
  aiThinking=false;
  if(best) executeMove(best);
  else setStatus('');
}

function undoMove() {
  if(G.gameOver) G.gameOver=false;
  const count=(gameMode==='ai')?2:1;
  let c=count;
  while(c-->0 && G.history.length>0) {
    const h=G.history.pop();
    G.board=[...h.boardSnap];
    G.redCaps=h.redCapsSnap;
    G.blackCaps=h.blackCapsSnap;
    G.turn=h.turnSnap;
  }
  G.selected=null; G.legalDests=[]; G.mandatoryFrom=null; G.gameOver=false;
  renderBoard(); renderScores(); renderHistory(); setTurn(); setStatus('');
}

/* ── Modal ────────────────────────────────────────────────────── */
function showModal(icon,title,body){
  document.getElementById('modal-icon').textContent=icon;
  document.getElementById('modal-title').textContent=title;
  document.getElementById('modal-body').textContent=body;
  document.getElementById('modal').classList.remove('hidden');
}

/* ══════════════════════════════════════════════════════════════
   SPLASH / INIT
══════════════════════════════════════════════════════════════ */
let splashMode=null;

document.querySelectorAll('.mode-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    splashMode=btn.dataset.mode;
    const ai=document.getElementById('ai-options');
    splashMode==='ai'?ai.classList.remove('hidden'):ai.classList.add('hidden');
  });
});

document.querySelectorAll('.color-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.color-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    playerColor=btn.dataset.color;
  });
});

document.querySelectorAll('.diff-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.diff-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    aiDepth=parseInt(btn.dataset.depth);
  });
});

document.getElementById('start-btn').addEventListener('click',()=>{
  if(!splashMode) splashMode='human';
  gameMode=splashMode;
  startGame();
});

function startGame(){
  G=freshState();
  aiThinking=false;
  document.getElementById('splash').classList.add('hidden');
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderBoard(); renderScores(); renderHistory(); setTurn(); setStatus('');
  // AI goes first if human plays black
  if(gameMode==='ai' && playerColor==='black'){
    aiThinking=true; showThinking();
    setTimeout(doAIMove,400);
  }
}

function resetToSplash(){
  document.getElementById('app').classList.add('hidden');
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('splash').classList.remove('hidden');
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('selected'));
  document.getElementById('ai-options').classList.add('hidden');
  splashMode=null;
}

document.getElementById('undo-btn').addEventListener('click', undoMove);
document.getElementById('new-game-btn').addEventListener('click', resetToSplash);
document.getElementById('modal-new-btn').addEventListener('click', resetToSplash);