/* ═══════════════════════════════════════════════════════════════
   CHESS.JS  –  Full chess engine + UI
   Features: two-player | vs AI (minimax+alpha-beta)
             legal move highlights | captured pieces
             move history (algebraic) | undo | check/checkmate/stalemate
═══════════════════════════════════════════════════════════════ */

/* ── Piece constants ─────────────────────────────────────────── */
const PIECE = {
  wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
  bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟'
};
const PIECE_VALUE = { K:20000, Q:900, R:500, B:330, N:320, P:100 };
const WHITE_PIECES = new Set(['wK','wQ','wR','wB','wN','wP']);
const BLACK_PIECES = new Set(['bK','bQ','bR','bB','bN','bP']);

function color(p)  { return p ? p[0] : null; }
function type(p)   { return p ? p[1] : null; }
function isWhite(p){ return p && p[0]==='w'; }
function isBlack(p){ return p && p[0]==='b'; }
function enemy(p)  { return p ? (p[0]==='w'?'b':'w') : null; }

/* ── Game State ─────────────────────────────────────────────── */
let state = {};   // full mutable state
let gameMode = 'human';   // 'human' | 'ai'
let playerColor = 'white'; // human side when vs AI
let aiDepth = 2;
let aiThinking = false;

/* ── Board initialisation ───────────────────────────────────── */
function initialBoard() {
  const b = Array(64).fill(null);
  const backRow = ['R','N','B','Q','K','B','N','R'];
  for (let c=0;c<8;c++) {
    b[c]      = 'b'+backRow[c];
    b[8+c]    = 'bP';
    b[48+c]   = 'wP';
    b[56+c]   = 'w'+backRow[c];
  }
  return b;
}

function freshState() {
  return {
    board: initialBoard(),
    turn: 'w',
    castling: { wK:true, wQ:true, bK:true, bQ:true },
    enPassant: null,      // target square index
    halfMove: 0,
    fullMove: 1,
    history: [],          // [{from,to,piece,captured,promotion,castled,enPassant,san, boardSnap, castlingSnap, epSnap}]
    selected: null,
    legalCache: null,
    gameOver: false,
    whiteCaps: [],
    blackCaps: [],
  };
}

/* ══════════════════════════════════════════════════════════════
   MOVE GENERATION
══════════════════════════════════════════════════════════════ */
function idx(r,c){ return r*8+c; }
function row(i)  { return Math.floor(i/8); }
function col(i)  { return i%8; }

function pseudoMoves(board, sq, castling, enPassant) {
  const p = board[sq];
  if (!p) return [];
  const c = p[0], t = p[1];
  const moves = [];
  const ally = c==='w' ? WHITE_PIECES : BLACK_PIECES;
  const r = row(sq), f = col(sq);

  const slide = (dirs) => {
    for (const [dr,dc] of dirs) {
      let nr=r+dr, nc=f+dc;
      while(nr>=0&&nr<8&&nc>=0&&nc<8) {
        const ti = idx(nr,nc);
        if (ally.has(board[ti])) break;
        moves.push(ti);
        if (board[ti]) break;
        nr+=dr; nc+=dc;
      }
    }
  };
  const step = (dests) => {
    for (const [nr,nc] of dests) {
      if(nr<0||nr>=8||nc<0||nc>=8) continue;
      const ti = idx(nr,nc);
      if (!ally.has(board[ti])) moves.push(ti);
    }
  };

  if (t==='R') slide([[1,0],[-1,0],[0,1],[0,-1]]);
  if (t==='B') slide([[1,1],[1,-1],[-1,1],[-1,-1]]);
  if (t==='Q') slide([[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]);
  if (t==='N') step([[r-2,f-1],[r-2,f+1],[r+2,f-1],[r+2,f+1],[r-1,f-2],[r-1,f+2],[r+1,f-2],[r+1,f+2]]);
  if (t==='K') step([[r-1,f-1],[r-1,f],[r-1,f+1],[r,f-1],[r,f+1],[r+1,f-1],[r+1,f],[r+1,f+1]]);

  if (t==='P') {
    const dir = c==='w' ? -1 : 1;
    const startRow = c==='w' ? 6 : 1;
    const nr = r+dir;
    if (nr>=0&&nr<8) {
      if (!board[idx(nr,f)]) {
        moves.push(idx(nr,f));
        if (r===startRow && !board[idx(r+2*dir,f)]) moves.push(idx(r+2*dir,f));
      }
      for (const dc of [-1,1]) {
        const nc2=f+dc;
        if(nc2<0||nc2>=8) continue;
        const ti=idx(nr,nc2);
        if(board[ti] && !ally.has(board[ti])) moves.push(ti);
        if(enPassant===ti) moves.push(ti);
      }
    }
    // Castling
  }
  if (t==='K') {
    // Kingside
    if (c==='w' && castling.wK && !board[61]&&!board[62]) moves.push(62);
    if (c==='b' && castling.bK && !board[5]&&!board[6])   moves.push(6);
    // Queenside
    if (c==='w' && castling.wQ && !board[59]&&!board[58]&&!board[57]) moves.push(58);
    if (c==='b' && castling.bQ && !board[3]&&!board[2]&&!board[1])   moves.push(2);
  }
  return moves;
}

function isAttacked(board, sq, byColor) {
  // Check if sq is attacked by any piece of byColor
  for (let i=0;i<64;i++) {
    const p = board[i];
    if (!p || p[0]!==byColor) continue;
    const moves = pseudoMoves(board, i, {wK:false,wQ:false,bK:false,bQ:false}, null);
    // For pawns, attacks only diagonals
    if (p[1]==='P') {
      const dir = byColor==='w' ? -1 : 1;
      const r=row(i), c=col(i);
      for(const dc of [-1,1]) {
        if(c+dc>=0&&c+dc<8) {
          if(idx(r+dir,c+dc)===sq) return true;
        }
      }
      continue;
    }
    if (moves.includes(sq)) return true;
  }
  return false;
}

function findKing(board, c) {
  for(let i=0;i<64;i++) if(board[i]===c+'K') return i;
  return -1;
}

function inCheck(board, c) {
  const k = findKing(board, c);
  return k>=0 && isAttacked(board, k, c==='w'?'b':'w');
}

function applyMove(board, from, to, castling, enPassant, promotion='Q') {
  const b = [...board];
  const piece = b[from];
  const captured = b[to];
  const t = piece[1], c = piece[0];
  let newEP = null;
  let newCastling = {...castling};
  let castled = false;
  let epCapture = null;

  // En passant capture
  if (t==='P' && enPassant===to) {
    const dir = c==='w' ? 1 : -1;
    epCapture = idx(row(to)+dir, col(to));
    b[epCapture] = null;
  }
  // Set en passant
  if (t==='P' && Math.abs(row(to)-row(from))===2) {
    newEP = idx((row(from)+row(to))/2, col(from));
  }
  // Castling rook
  if (t==='K') {
    newCastling[c+'K'] = false; newCastling[c+'Q'] = false;
    const df = col(to)-col(from);
    if (Math.abs(df)===2) {
      castled = true;
      if (df===2) { b[to-1]=b[to+1]; b[to+1]=null; }
      else        { b[to+1]=b[to-2]; b[to-2]=null; }
    }
  }
  if (t==='R') {
    if (from===56) newCastling.wQ=false;
    if (from===63) newCastling.wK=false;
    if (from===0)  newCastling.bQ=false;
    if (from===7)  newCastling.bK=false;
  }
  if (from===56) newCastling.wQ=false;
  if (from===63) newCastling.wK=false;
  if (from===0)  newCastling.bQ=false;
  if (from===7)  newCastling.bK=false;

  b[to] = piece;
  b[from] = null;
  // Promotion
  if (t==='P' && (row(to)===0||row(to)===7)) b[to] = c+promotion;

  return { board: b, captured, newCastling, newEP, castled, epCapture };
}

function legalMoves(board, sq, castling, enPassant) {
  const p = board[sq];
  if (!p) return [];
  const c = p[0];
  const pseudo = pseudoMoves(board, sq, castling, enPassant);
  const legal = [];
  for (const to of pseudo) {
    const {board: nb, castled} = applyMove(board, sq, to, castling, enPassant);
    // Castling: can't castle through check
    if (castled) {
      const df = col(to)-col(sq);
      const midSq = idx(row(sq), col(sq)+(df>0?1:-1));
      if (isAttacked(board, sq, enemy(p)) || isAttacked(nb, midSq, enemy(p))) continue;
    }
    if (!inCheck(nb, c)) legal.push(to);
  }
  return legal;
}

function allLegalMoves(board, c, castling, enPassant) {
  const moves = [];
  for(let i=0;i<64;i++) {
    if(board[i] && board[i][0]===c) {
      const ml = legalMoves(board, i, castling, enPassant);
      for(const to of ml) moves.push({from:i, to});
    }
  }
  return moves;
}

/* ── SAN notation ───────────────────────────────────────────── */
function toAlgebraic(sq) {
  return 'abcdefgh'[col(sq)] + (8-row(sq));
}

function makeSAN(board, from, to, castling, enPassant) {
  const p = board[from];
  const t = p[1], c = p[0];
  const df = col(to)-col(from);
  const {board: nb, captured, castled} = applyMove(board, from, to, castling, enPassant);
  const isCapture = !!captured || (t==='P' && enPassant===to);
  const givesCheck = inCheck(nb, enemy(p));
  const givesCheckmate = givesCheck && allLegalMoves(nb, enemy(p), castling, null).length===0;

  if (castled) return df>0 ? 'O-O' : 'O-O-O';

  let san = '';
  if (t!=='P') san += t;
  // Disambiguation
  if (t!=='P') {
    const ambig = [];
    for(let i=0;i<64;i++) {
      if(i===from) continue;
      if(board[i]===p) {
        const ml = legalMoves(board, i, castling, enPassant);
        if(ml.includes(to)) ambig.push(i);
      }
    }
    if(ambig.length>0) {
      if(ambig.every(i=>col(i)!==col(from))) san += 'abcdefgh'[col(from)];
      else if(ambig.every(i=>row(i)!==row(from))) san += (8-row(from));
      else san += toAlgebraic(from);
    }
  }
  if (t==='P' && isCapture) san += 'abcdefgh'[col(from)];
  if (isCapture) san += 'x';
  san += toAlgebraic(to);
  if (t==='P' && (row(to)===0||row(to)===7)) san += '=Q';
  if (givesCheckmate) san += '#';
  else if (givesCheck) san += '+';
  return san;
}

/* ══════════════════════════════════════════════════════════════
   AI (Minimax + Alpha-Beta)
══════════════════════════════════════════════════════════════ */
// Piece-square tables (white perspective, flipped for black)
const PST = {
  P: [
     0, 0, 0, 0, 0, 0, 0, 0,
    50,50,50,50,50,50,50,50,
    10,10,20,30,30,20,10,10,
     5, 5,10,25,25,10, 5, 5,
     0, 0, 0,20,20, 0, 0, 0,
     5,-5,-10,0,0,-10,-5, 5,
     5,10,10,-20,-20,10,10, 5,
     0, 0, 0, 0, 0, 0, 0, 0
  ],
  N: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
  ],
  B: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20
  ],
  R: [
     0, 0, 0, 0, 0, 0, 0, 0,
     5,10,10,10,10,10,10, 5,
    -5, 0, 0, 0, 0, 0, 0,-5,
    -5, 0, 0, 0, 0, 0, 0,-5,
    -5, 0, 0, 0, 0, 0, 0,-5,
    -5, 0, 0, 0, 0, 0, 0,-5,
    -5, 0, 0, 0, 0, 0, 0,-5,
     0, 0, 0, 5, 5, 0, 0, 0
  ],
  Q: [
    -20,-10,-10,-5,-5,-10,-10,-20,
    -10,  0,  0, 0, 0,  0,  0,-10,
    -10,  0,  5, 5, 5,  5,  0,-10,
     -5,  0,  5, 5, 5,  5,  0, -5,
      0,  0,  5, 5, 5,  5,  0, -5,
    -10,  5,  5, 5, 5,  5,  0,-10,
    -10,  0,  5, 0, 0,  0,  0,-10,
    -20,-10,-10,-5,-5,-10,-10,-20
  ],
  K: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20
  ]
};

function evaluate(board) {
  let score = 0;
  for(let i=0;i<64;i++) {
    const p = board[i];
    if (!p) continue;
    const t = p[1], c = p[0];
    const val = PIECE_VALUE[t];
    const pst = PST[t];
    const pstIdx = c==='w' ? i : 63-i;
    const pstVal = pst ? pst[pstIdx] : 0;
    score += c==='w' ? (val+pstVal) : -(val+pstVal);
  }
  return score;
}

function minimax(board, depth, alpha, beta, maximizing, castling, enPassant) {
  const c = maximizing ? 'w' : 'b';
  const moves = allLegalMoves(board, c, castling, enPassant);

  if (depth===0 || moves.length===0) {
    if (moves.length===0) {
      if (inCheck(board,c)) return maximizing ? -99999 : 99999;
      return 0; // stalemate
    }
    return evaluate(board);
  }

  // Move ordering: captures first
  moves.sort((a,b2) => {
    const ca = board[a.to] ? PIECE_VALUE[type(board[a.to])] : 0;
    const cb = board[b2.to] ? PIECE_VALUE[type(board[b2.to])] : 0;
    return cb - ca;
  });

  if (maximizing) {
    let best = -Infinity;
    for (const {from, to} of moves) {
      const {board:nb, newCastling, newEP} = applyMove(board, from, to, castling, enPassant);
      const val = minimax(nb, depth-1, alpha, beta, false, newCastling, newEP);
      best = Math.max(best, val);
      alpha = Math.max(alpha, val);
      if (beta<=alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const {from, to} of moves) {
      const {board:nb, newCastling, newEP} = applyMove(board, from, to, castling, enPassant);
      const val = minimax(nb, depth-1, alpha, beta, true, newCastling, newEP);
      best = Math.min(best, val);
      beta = Math.min(beta, val);
      if (beta<=alpha) break;
    }
    return best;
  }
}

function getBestMove(board, c, castling, enPassant, depth) {
  const moves = allLegalMoves(board, c, castling, enPassant);
  if (!moves.length) return null;
  const maximizing = c==='w';
  let best = null, bestVal = maximizing ? -Infinity : Infinity;
  moves.sort((a,b2) => {
    const ca = board[a.to] ? PIECE_VALUE[type(board[a.to])] : 0;
    const cb = board[b2.to] ? PIECE_VALUE[type(board[b2.to])] : 0;
    return cb - ca;
  });
  for (const m of moves) {
    const {board:nb, newCastling, newEP} = applyMove(board, m.from, m.to, castling, enPassant);
    const val = minimax(nb, depth-1, -Infinity, Infinity, !maximizing, newCastling, newEP);
    if (maximizing ? val>bestVal : val<bestVal) { bestVal=val; best=m; }
  }
  return best;
}

/* ══════════════════════════════════════════════════════════════
   UI RENDERING
══════════════════════════════════════════════════════════════ */
const $board     = document.getElementById('board');
const $history   = document.getElementById('move-history');
const $wCaps     = document.getElementById('white-captures');
const $bCaps     = document.getElementById('black-captures');
const $turn      = document.getElementById('turn-indicator');
const $status    = document.getElementById('status-bar');
const $undoBtn   = document.getElementById('undo-btn');

function buildCoords() {
  const ranks = document.getElementById('rank-labels');
  const files = document.getElementById('file-labels');
  ranks.innerHTML=''; files.innerHTML='';
  for(let r=0;r<8;r++) {
    const d=document.createElement('div'); d.className='coord';
    d.textContent = (8-r); ranks.appendChild(d);
  }
  for(let c=0;c<8;c++) {
    const d=document.createElement('div'); d.className='coord';
    d.textContent = 'abcdefgh'[c]; files.appendChild(d);
  }
}

function renderBoard() {
  $board.innerHTML='';
  const {board, selected, legalCache, history, turn} = state;
  const lastMove = history[history.length-1];
  const kingInCheck = inCheck(board, turn) ? findKing(board, turn) : -1;

  for(let i=0;i<64;i++) {
    const sq = document.createElement('div');
    const r=row(i), c=col(i);
    sq.className = 'sq ' + ((r+c)%2===0 ? 'light' : 'dark');
    sq.dataset.idx = i;

    if (i===selected) sq.classList.add('selected');
    if (legalCache && legalCache.includes(i)) {
      if (board[i]) sq.classList.add('legal-cap');
      else sq.classList.add('legal');
    }
    if (lastMove) {
      if (i===lastMove.from) sq.classList.add('last-from');
      if (i===lastMove.to)   sq.classList.add('last-to');
    }
    if (i===kingInCheck) sq.classList.add('in-check');

    if (board[i]) {
      const piece = document.createElement('span');
      piece.className='piece'; piece.textContent = PIECE[board[i]];
      sq.appendChild(piece);
    }
    sq.addEventListener('click', () => onSquareClick(i));
    $board.appendChild(sq);
  }
}

function renderHistory() {
  $history.innerHTML='';
  const hist = state.history;
  for(let i=0;i<hist.length;i+=2) {
    const div = document.createElement('div'); div.className='move-pair';
    const num = document.createElement('span'); num.className='move-num';
    num.textContent = (i/2+1)+'.';
    const w = document.createElement('span'); w.className='move-san';
    w.textContent = hist[i].san;
    if(i===hist.length-1 || i===hist.length-2) w.classList.add('latest');
    div.appendChild(num); div.appendChild(w);
    if(hist[i+1]) {
      const b2 = document.createElement('span'); b2.className='move-san';
      b2.textContent = hist[i+1].san;
      if(i+1===hist.length-1) b2.classList.add('latest');
      div.appendChild(b2);
    }
    $history.appendChild(div);
  }
  $history.scrollTop=$history.scrollHeight;
}

function renderCaptures() {
  $wCaps.innerHTML = state.whiteCaps.map(p=>PIECE[p]).join('');
  $bCaps.innerHTML = state.blackCaps.map(p=>PIECE[p]).join('');
}

function setTurnIndicator() {
  if(state.gameOver) { $turn.textContent='Game Over'; return; }
  $turn.textContent = (state.turn==='w'?'White':'Black') + "'s Turn";
}

function setStatus(msg) { $status.textContent = msg; }

function showThinking() {
  $status.innerHTML = 'Computer thinking <span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span>';
}

/* ══════════════════════════════════════════════════════════════
   GAME LOGIC
══════════════════════════════════════════════════════════════ */
function onSquareClick(i) {
  if (state.gameOver || aiThinking) return;
  // If vs AI, only allow human color
  if (gameMode==='ai') {
    const humanC = playerColor==='white'?'w':'b';
    if (state.turn !== humanC) return;
  }

  const {board, selected, legalCache, turn, castling, enPassant} = state;

  if (selected===null) {
    // Select piece
    if (!board[i] || board[i][0]!==turn) return;
    state.selected = i;
    state.legalCache = legalMoves(board, i, castling, enPassant);
    renderBoard();
  } else {
    if (legalCache && legalCache.includes(i)) {
      executeMove(selected, i);
    } else if (board[i] && board[i][0]===turn && i!==selected) {
      state.selected = i;
      state.legalCache = legalMoves(board, i, castling, enPassant);
      renderBoard();
    } else {
      state.selected = null; state.legalCache = null;
      renderBoard();
    }
  }
}

function executeMove(from, to, isAI=false) {
  const {board, castling, enPassant, turn} = state;
  const san = makeSAN(board, from, to, castling, enPassant);
  const {board:nb, captured, newCastling, newEP, castled, epCapture} = applyMove(board, from, to, castling, enPassant);

  // Track captures
  let actualCaptured = captured;
  if (!captured && epCapture!==undefined && epCapture!==null) {
    actualCaptured = board[epCapture];
  }
  if (actualCaptured) {
    if (turn==='w') state.whiteCaps.push(actualCaptured);
    else            state.blackCaps.push(actualCaptured);
  }

  state.history.push({
    from, to, piece: board[from], captured: actualCaptured,
    san,
    boardSnap: [...board],
    castlingSnap: {...castling},
    epSnap: enPassant,
    whiteCapsSnap: [...state.whiteCaps],
    blackCapsSnap: [...state.blackCaps],
  });

  state.board = nb;
  state.castling = newCastling;
  state.enPassant = newEP;
  state.turn = turn==='w' ? 'b' : 'w';
  state.selected = null;
  state.legalCache = null;

  renderBoard();
  renderHistory();
  renderCaptures();
  setTurnIndicator();

  // Check game-over conditions
  const nextC = state.turn;
  const nextMoves = allLegalMoves(state.board, nextC, state.castling, state.enPassant);
  const check = inCheck(state.board, nextC);

  if (nextMoves.length===0) {
    state.gameOver = true;
    if (check) {
      const winner = turn==='w'?'White':'Black';
      setStatus('Checkmate!');
      setTimeout(()=>showModal('♛', 'Checkmate!', `${winner} wins by checkmate.`), 400);
    } else {
      setStatus('Stalemate – Draw!');
      setTimeout(()=>showModal('🤝', 'Stalemate', 'The game is a draw by stalemate.'), 400);
    }
    return;
  }
  if (check) setStatus((nextC==='w'?'White':'Black')+' is in check!');
  else setStatus('');

  // AI move
  if (gameMode==='ai' && !state.gameOver) {
    const aiC = playerColor==='white' ? 'b' : 'w';
    if (state.turn===aiC) {
      aiThinking = true;
      showThinking();
      setTimeout(()=>doAIMove(), 80);
    }
  }
}

function doAIMove() {
  const c = playerColor==='white'?'b':'w';
  const best = getBestMove(state.board, c, state.castling, state.enPassant, aiDepth);
  aiThinking = false;
  if (best) executeMove(best.from, best.to, true);
  else setStatus('');
}

function undoMove() {
  if (state.gameOver && state.history.length>0) state.gameOver = false;
  // If vs AI, undo two moves (AI + human)
  let count = (gameMode==='ai') ? 2 : 1;
  while(count-- > 0 && state.history.length > 0) {
    const h = state.history.pop();
    state.board = [...h.boardSnap];
    state.castling = {...h.castlingSnap};
    state.enPassant = h.epSnap;
    state.turn = h.piece[0];
    state.whiteCaps = [...h.whiteCapsSnap];
    state.blackCaps = [...h.blackCapsSnap];
  }
  state.selected = null; state.legalCache = null; state.gameOver = false;
  renderBoard(); renderHistory(); renderCaptures(); setTurnIndicator(); setStatus('');
}

/* ── Modal ────────────────────────────────────────────────────── */
function showModal(icon, title, body) {
  document.getElementById('modal-icon').textContent = icon;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;
  document.getElementById('modal').classList.remove('hidden');
}

/* ══════════════════════════════════════════════════════════════
   INIT / SPLASH
══════════════════════════════════════════════════════════════ */
buildCoords();

// Splash logic
let splashMode = null;
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    splashMode = btn.dataset.mode;
    const aiOpts = document.getElementById('ai-options');
    if (splashMode==='ai') aiOpts.classList.remove('hidden');
    else aiOpts.classList.add('hidden');
  });
});

document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.color-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    playerColor = btn.dataset.color;
  });
});

document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    aiDepth = parseInt(btn.dataset.depth);
  });
});

document.getElementById('start-btn').addEventListener('click', () => {
  if (!splashMode) { splashMode='human'; }
  gameMode = splashMode;
  startGame();
});

function startGame() {
  state = freshState();
  aiThinking = false;
  document.getElementById('splash').classList.add('hidden');
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderBoard();
  renderHistory();
  renderCaptures();
  setTurnIndicator();
  setStatus('');
  // If AI goes first (human=black)
  if (gameMode==='ai' && playerColor==='black') {
    aiThinking = true;
    showThinking();
    setTimeout(()=>doAIMove(), 300);
  }
}

document.getElementById('undo-btn').addEventListener('click', () => undoMove());
document.getElementById('new-game-btn').addEventListener('click', () => {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('splash').classList.remove('hidden');
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('selected'));
  document.getElementById('ai-options').classList.add('hidden');
  splashMode = null;
});
document.getElementById('modal-new-btn').addEventListener('click', () => {
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('splash').classList.remove('hidden');
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('selected'));
  document.getElementById('ai-options').classList.add('hidden');
  splashMode = null;
});