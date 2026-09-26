/* ═══════════════════════════════════════════════════════════
   CHESS — rules engine, alpha-beta AI, interface
   Squares 0..63, a8 = 0, h1 = 63. White: uppercase, black: lowercase.
═══════════════════════════════════════════════════════════ */
const { $, sfx } = Kit;
const store = Kit.store('chess', { mode: 'medium', side: 'w' });
Kit.soundToggle($('#sound'));

const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const FILES = 'abcdefgh';
const sqName = i => FILES[i & 7] + (8 - (i >> 3));
const isWhite = p => p && p === p.toUpperCase();
const colorOf = p => p ? (isWhite(p) ? 'w' : 'b') : null;
const lower = p => p.toLowerCase();

function startState() {
  const rows = ['rnbqkbnr', 'pppppppp', '8', '8', '8', '8', 'PPPPPPPP', 'RNBQKBNR'];
  const board = [];
  for (const r of rows) for (const ch of r) { if (ch === '8') board.push(...Array(8).fill(null)); else board.push(ch); }
  return { board, turn: 'w', castle: { K: true, Q: true, k: true, q: true }, ep: -1, half: 0, full: 1 };
}

/* ── Attack detection ── */
const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]], ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
function attacked(b, sq, by) {
  const r = sq >> 3, c = sq & 7, W = by === 'w';
  const at = (rr, cc) => rr >= 0 && rr < 8 && cc >= 0 && cc < 8 ? b[rr * 8 + cc] : undefined;
  // pawns
  const pr = W ? r + 1 : r - 1;
  for (const dc of [-1, 1]) { const p = at(pr, c + dc); if (p === (W ? 'P' : 'p')) return true; }
  for (const [dr, dc] of KN) { const p = at(r + dr, c + dc); if (p === (W ? 'N' : 'n')) return true; }
  for (const [dr, dc] of KG) { const p = at(r + dr, c + dc); if (p === (W ? 'K' : 'k')) return true; }
  for (const [dirs, set] of [[DIAG, W ? 'BQ' : 'bq'], [ORTH, W ? 'RQ' : 'rq']]) {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
        const p = b[rr * 8 + cc];
        if (p) { if (set.includes(p)) return true; break; }
        rr += dr; cc += dc;
      }
    }
  }
  return false;
}
const kingSq = (b, col) => b.indexOf(col === 'w' ? 'K' : 'k');
const inCheck = (s, col) => attacked(s.board, kingSq(s.board, col), col === 'w' ? 'b' : 'w');

/* ── Move generation ── */
function pseudo(s, capsOnly = false) {
  const b = s.board, col = s.turn, out = [];
  const own = p => p && colorOf(p) === col, foe = p => p && colorOf(p) !== col;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!own(p)) continue;
    const r = i >> 3, c = i & 7, t = lower(p);
    const add = (to, extra = {}) => out.push(Object.assign({ from: i, to, piece: p, cap: b[to] }, extra));
    if (t === 'p') {
      const dir = col === 'w' ? -1 : 1, start = col === 'w' ? 6 : 1, last = col === 'w' ? 0 : 7;
      const f = i + dir * 8;
      const pushPromo = (to, cap) => { for (const pr of 'qrbn') out.push({ from: i, to, piece: p, cap, promo: col === 'w' ? pr.toUpperCase() : pr }); };
      if (!capsOnly && f >= 0 && f < 64 && !b[f]) {
        if ((f >> 3) === last) pushPromo(f, null); else {
          add(f);
          if (r === start && !b[f + dir * 8]) add(f + dir * 8, { double: true });
        }
      }
      for (const dc of [-1, 1]) {
        const cc = c + dc; if (cc < 0 || cc > 7) continue;
        const to = f + dc;
        if (foe(b[to])) { if ((to >> 3) === last) pushPromo(to, b[to]); else add(to); }
        else if (to === s.ep) add(to, { epCap: true, cap: col === 'w' ? 'p' : 'P' });
      }
    } else if (t === 'n' || t === 'k') {
      for (const [dr, dc] of t === 'n' ? KN : KG) {
        const rr = r + dr, cc = c + dc; if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
        const to = rr * 8 + cc;
        if (!own(b[to]) && (!capsOnly || b[to])) add(to);
      }
      if (t === 'k' && !capsOnly) {
        const enemy = col === 'w' ? 'b' : 'w', home = col === 'w' ? 60 : 4;
        const [KS, QS] = col === 'w' ? ['K', 'Q'] : ['k', 'q'];
        if (i === home && !attacked(b, home, enemy)) {
          if (s.castle[KS] && !b[home + 1] && !b[home + 2] && !attacked(b, home + 1, enemy) && !attacked(b, home + 2, enemy)) add(home + 2, { castle: 'K' });
          if (s.castle[QS] && !b[home - 1] && !b[home - 2] && !b[home - 3] && !attacked(b, home - 1, enemy) && !attacked(b, home - 2, enemy)) add(home - 2, { castle: 'Q' });
        }
      }
    } else {
      const dirs = t === 'b' ? DIAG : t === 'r' ? ORTH : DIAG.concat(ORTH);
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
          const to = rr * 8 + cc;
          if (own(b[to])) break;
          if (!capsOnly || b[to]) add(to);
          if (b[to]) break;
          rr += dr; cc += dc;
        }
      }
    }
  }
  return out;
}
function make(s, m) {
  const b = s.board.slice(), col = s.turn;
  b[m.to] = m.promo || m.piece; b[m.from] = null;
  if (m.epCap) b[m.to + (col === 'w' ? 8 : -8)] = null;
  if (m.castle) {
    const home = col === 'w' ? 60 : 4;
    if (m.castle === 'K') { b[home + 1] = b[home + 3]; b[home + 3] = null; }
    else { b[home - 1] = b[home - 4]; b[home - 4] = null; }
  }
  const castle = Object.assign({}, s.castle);
  const t = lower(m.piece);
  if (t === 'k') { if (col === 'w') castle.K = castle.Q = false; else castle.k = castle.q = false; }
  for (const [sq, key] of [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']]) if (m.from === sq || m.to === sq) castle[key] = false;
  return {
    board: b, turn: col === 'w' ? 'b' : 'w', castle,
    ep: m.double ? (m.from + m.to) / 2 : -1,
    half: t === 'p' || m.cap ? 0 : s.half + 1,
    full: s.full + (col === 'b' ? 1 : 0),
  };
}
function legal(s) { return pseudo(s).filter(m => !inCheck(make(s, m), s.turn)); }
function key(s) { return s.board.map(p => p || '.').join('') + s.turn + Object.entries(s.castle).filter(e => e[1]).map(e => e[0]).join('') + s.ep; }

/* ── Notation ── */
function san(s, m, all) {
  let str;
  if (m.castle) str = m.castle === 'K' ? 'O-O' : 'O-O-O';
  else {
    const t = lower(m.piece);
    const cap = m.cap ? 'x' : '';
    if (t === 'p') str = (cap ? FILES[m.from & 7] : '') + cap + sqName(m.to) + (m.promo ? '=' + m.promo.toUpperCase() : '');
    else {
      const rivals = all.filter(o => o.from !== m.from && o.piece === m.piece && o.to === m.to);
      let dis = '';
      if (rivals.length) {
        const sameFile = rivals.some(o => (o.from & 7) === (m.from & 7)), sameRank = rivals.some(o => (o.from >> 3) === (m.from >> 3));
        dis = !sameFile ? FILES[m.from & 7] : !sameRank ? String(8 - (m.from >> 3)) : sqName(m.from);
      }
      str = t.toUpperCase() + dis + cap + sqName(m.to);
    }
  }
  const n = make(s, m);
  if (inCheck(n, n.turn)) str += legal(n).length ? '+' : '#';
  return str;
}

/* ── Evaluation (piece-square tables, white's perspective, a8 first) ── */
const PST = {
  p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
  ke: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50],
};
function evaluate(s) {
  let score = 0, queens = 0, minors = 0;
  for (const p of s.board) if (p) { const t = lower(p); if (t === 'q') queens++; if (t === 'n' || t === 'b' || t === 'r') minors++; }
  const endgame = queens === 0 || (queens <= 2 && minors <= 2);
  for (let i = 0; i < 64; i++) {
    const p = s.board[i]; if (!p) continue;
    let t = lower(p);
    const tbl = t === 'k' && endgame ? PST.ke : PST[t];
    const w = isWhite(p);
    const v = VAL[t] + tbl[w ? i : (7 - (i >> 3)) * 8 + (i & 7)];
    score += w ? v : -v;
  }
  return s.turn === 'w' ? score : -score;
}

/* ── Search ── */
let nodes, deadline, aborted;
function order(moves) {
  return moves.map(m => ({ m, o: (m.cap ? 10 * VAL[lower(m.cap)] - VAL[lower(m.piece)] + 10000 : 0) + (m.promo ? 9000 : 0) }))
    .sort((a, b) => b.o - a.o).map(x => x.m);
}
function quiesce(s, alpha, beta, depth) {
  const stand = evaluate(s);
  if (stand >= beta) return beta;
  if (alpha < stand) alpha = stand;
  if (depth > 6) return alpha;
  for (const m of order(pseudo(s, true))) {
    const n = make(s, m);
    if (inCheck(n, s.turn)) continue;
    const sc = -quiesce(n, -beta, -alpha, depth + 1);
    if (sc >= beta) return beta;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}
function negamax(s, depth, alpha, beta, ply) {
  if ((++nodes & 1023) === 0 && performance.now() > deadline) aborted = true;
  if (aborted) return 0;
  if (depth <= 0) return quiesce(s, alpha, beta, 0);
  const moves = order(legal(s));
  if (!moves.length) return inCheck(s, s.turn) ? -30000 + ply : 0;
  for (const m of moves) {
    const sc = -negamax(make(s, m), depth - 1, -beta, -alpha, ply + 1);
    if (sc >= beta) return beta;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}
function think(s, level) {
  const moves = order(legal(s));
  if (level === 'easy') {
    // shallow and noisy: sometimes blunders, always legal
    const scored = moves.map(m => ({ m, sc: -quiesce(make(s, m), -1e9, 1e9, 4) + Math.random() * 160 }));
    scored.sort((a, b) => b.sc - a.sc);
    return scored[0].m;
  }
  if (level === 'medium') {
    // Exact scores at depth 2, then vary between moves that are genuinely close
    deadline = performance.now() + 5000; aborted = false; nodes = 0;
    const scored = moves.map(m => ({ m, sc: -negamax(make(s, m), 1, -1e9, 1e9, 1) }));
    const top = Math.max(...scored.map(x => x.sc));
    return Kit.pick(scored.filter(x => x.sc >= top - 15)).m;
  }
  const maxDepth = 4;
  deadline = performance.now() + 1800;
  let best = moves[0];
  for (let d = 1; d <= maxDepth; d++) {
    nodes = 0; aborted = false;
    let alpha = -1e9, bestHere = null;
    // search previous best first
    const list = [best, ...moves.filter(m => m !== best)];
    for (const m of list) {
      const sc = -negamax(make(s, m), d - 1, -1e9, -alpha, 1);
      if (aborted) break;
      if (sc > alpha) { alpha = sc; bestHere = m; }
    }
    if (aborted) break;
    if (bestHere) best = bestHere;
    if (alpha > 29000) break; // found mate
  }
  return best;
}

/* ── Game / UI state ── */
let S, mode, human, flipped, history, sans, keys_, selected, lastMove, over, busy, pendingPromo;
const boardEl = $('#board'), ov = $('#ov');
const sqEls = [];
for (let i = 0; i < 64; i++) { const d = document.createElement('div'); d.setAttribute('role', 'gridcell'); d.addEventListener('click', () => clickSq(+d.dataset.i)); boardEl.appendChild(d); sqEls.push(d); }

const setMode = Kit.segmented($('#mode'), v => { mode = v; store.set('mode', v); askNew(); });

function newGame(side = human) {
  S = startState(); human = side; flipped = side === 'b';
  history = []; sans = []; keys_ = [key(S)]; selected = -1; lastMove = null; over = false; busy = false;
  Kit.overlay(ov, null);
  render();
  maybeAI();
}
function askNew() {
  Kit.overlay(ov, {
    title: 'New game', text: mode === 'pvp' ? 'Two players share this board. White moves first.' : `Playing the computer on ${mode}. Pick your colour.`,
    html: mode === 'pvp' ? '' : `<div class="side-pick"><button class="btn" data-side="w">White</button><button class="btn" data-side="b">Black</button></div>`,
    actions: mode === 'pvp' ? [{ label: 'Start', primary: true, onClick: () => newGame('w') }] : [{ label: 'Cancel', onClick: () => Kit.overlay(ov, null) }],
    bind: el => el.querySelectorAll('[data-side]').forEach(b => b.onclick = () => { store.set('side', b.dataset.side); newGame(b.dataset.side); }),
  });
}

function render(moved) {
  const moves = over ? [] : legal(S);
  const selMoves = moves.filter(m => m.from === selected);
  const checkSq = inCheck(S, S.turn) ? kingSq(S.board, S.turn) : -1;
  for (let v = 0; v < 64; v++) {
    const i = flipped ? 63 - v : v;
    const el = sqEls[v], p = S.board[i], r = i >> 3, c = i & 7;
    el.dataset.i = i;
    el.className = 'sq' + ((r + c) % 2 ? ' dk' : '') + (i === selected ? ' sel' : '') + (lastMove && (lastMove.from === i || lastMove.to === i) ? ' last' : '') + (i === checkSq ? ' check' : '');
    const t = selMoves.find(m => m.to === i);
    if (t) el.classList.add(S.board[i] || t.epCap ? 'hit' : 'dot');
    el.setAttribute('aria-label', `${sqName(i)}${p ? ', ' + (isWhite(p) ? 'white ' : 'black ') + { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' }[lower(p)] : ''}`);
    let html = p ? `<span class="pc ${isWhite(p) ? 'w' : 'b'}${moved === i ? ' moved' : ''}">${GLYPH[lower(p)]}\uFE0E</span>` : '';
    if ((v & 7) === 7) html += `<span class="coord r">${''}</span>`;
    if ((v >> 3) === 7) html += `<span class="coord f">${FILES[c]}</span>`;
    if ((v & 7) === 0) html += `<span class="coord r">${8 - r}</span>`;
    el.innerHTML = html;
  }
  // players
  const topCol = flipped ? 'w' : 'b', botCol = flipped ? 'b' : 'w';
  const name = col => mode === 'pvp' ? (col === 'w' ? 'White' : 'Black') : col === human ? 'You' : `Computer (${mode})`;
  $('#whoTop').textContent = name(topCol); $('#whoBot').textContent = name(botCol);
  $('#whoTop').style.setProperty('--dot', topCol === 'w' ? '#f8fafc' : '#38bdf8');
  $('#whoBot').style.setProperty('--dot', botCol === 'w' ? '#f8fafc' : '#38bdf8');
  $('#whoTop').classList.toggle('turn', S.turn === topCol && !over);
  $('#whoBot').classList.toggle('turn', S.turn === botCol && !over);
  // captured material
  const start = startState().board, count = {};
  for (const p of start) count[p] = (count[p] || 0) + 1;
  for (const p of S.board) if (p) count[p]--;
  let mat = 0;
  for (const p in count) if (p !== 'null') mat += (isWhite(p) ? -1 : 1) * VAL[lower(p)] * count[p];
  const capsBy = col => 'qrbnp'.split('').map(t => GLYPH[t].repeat(Math.max(0, count[col === 'w' ? t : t.toUpperCase()] || 0))).join('');
  const adv = col => { const m = col === 'w' ? mat : -mat; return m > 0 ? `<small>+${Math.round(m / 100)}</small>` : ''; };
  $('#capsTop').innerHTML = capsBy(topCol) + adv(topCol);
  $('#capsBot').innerHTML = capsBy(botCol) + adv(botCol);
  // status & moves
  if (!over) {
    const who = S.turn === 'w' ? 'White' : 'Black';
    $('#status').innerHTML = busy ? `Thinking<small>The computer is choosing a move.</small>` : `${who} to move${checkSq >= 0 ? '<small>Check.</small>' : ''}`;
  }
  const list = $('#moves');
  list.innerHTML = '';
  for (let k = 0; k < sans.length; k += 2) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="n">${k / 2 + 1}.</span><span class="${k === sans.length - 1 ? 'cur' : ''}">${sans[k]}</span><span class="${k + 1 === sans.length - 1 ? 'cur' : ''}">${sans[k + 1] || ''}</span>`;
    list.appendChild(li);
  }
  list.scrollTop = list.scrollHeight;
  $('#undo').disabled = busy || !history.length;
}

function clickSq(i) {
  if (over || busy || !$('#promo').hidden) return;
  if (mode !== 'pvp' && S.turn !== human) return;
  const p = S.board[i];
  if (p && colorOf(p) === S.turn) { selected = selected === i ? -1 : i; sfx.click(); render(); return; }
  if (selected < 0) return;
  const cands = legal(S).filter(m => m.from === selected && m.to === i);
  if (!cands.length) { selected = -1; render(); return; }
  if (cands[0].promo) return choosePromo(cands);
  commit(cands[0]);
}
function choosePromo(cands) {
  const el = $('#promo');
  const white = S.turn === 'w';
  el.innerHTML = `<div class="choices">${'qrbn'.split('').map(t => `<button data-t="${t}" aria-label="${{ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[t]}"><span class="pc ${white ? 'w' : 'b'}">${GLYPH[t]}\uFE0E</span></button>`).join('')}</div>`;
  el.hidden = false;
  el.querySelectorAll('button').forEach(b => b.onclick = () => { el.hidden = true; commit(cands.find(m => lower(m.promo) === b.dataset.t)); });
  el.querySelector('button').focus();
}
function commit(m) {
  const all = legal(S);
  history.push({ S, lastMove, sans: sans.slice(), keys: keys_.slice() });
  sans.push(san(S, m, all));
  S = make(S, m);
  keys_.push(key(S));
  lastMove = m; selected = -1;
  const check = inCheck(S, S.turn);
  if (m.cap) sfx.tone(220, { type: 'triangle', dur: .12, vol: .07, slide: 160 });
  else if (m.castle) sfx.arp([330, 392], { gap: .07, dur: .1, vol: .05 });
  else sfx.tone(300, { type: 'triangle', dur: .06, vol: .05 });
  if (check) sfx.tone(880, { type: 'square', dur: .12, vol: .03 });
  Kit.say(sans[sans.length - 1]);
  render(m.to);
  if (!checkEnd()) maybeAI();
}
function maybeAI() {
  if (over || mode === 'pvp' || S.turn === human) return;
  busy = true; render();
  setTimeout(() => {
    const m = think(S, mode);
    busy = false;
    commit(m);
  }, 320);
}
function checkEnd() {
  const moves = legal(S);
  let title = null, text = '', win = false;
  const mover = S.turn === 'w' ? 'Black' : 'White';
  if (!moves.length) {
    if (inCheck(S, S.turn)) {
      title = 'Checkmate';
      win = mode === 'pvp' || (S.turn !== human);
      text = mode === 'pvp' ? `${mover} wins.` : win ? 'You beat the computer.' : 'The computer wins this one.';
    } else { title = 'Stalemate'; text = `${S.turn === 'w' ? 'White' : 'Black'} has no legal moves but is not in check. Draw.`; }
  } else if (S.half >= 100) { title = 'Draw'; text = '50 moves without a capture or pawn move.'; }
  else if (keys_.filter(k => k === keys_[keys_.length - 1]).length >= 3) { title = 'Draw'; text = 'The same position appeared three times.'; }
  else {
    const rest = S.board.filter(p => p && lower(p) !== 'k').map(lower);
    if (!rest.length || (rest.length === 1 && (rest[0] === 'b' || rest[0] === 'n'))) { title = 'Draw'; text = 'Neither side has enough material to checkmate.'; }
  }
  if (!title) return false;
  over = true;
  $('#status').innerHTML = `${title}<small>${text}</small>`;
  render();
  if (win) { sfx.win(); Kit.confetti(); } else if (title === 'Checkmate') sfx.lose(); else sfx.arp([440, 440], { gap: .15 });
  setTimeout(() => Kit.overlay(ov, {
    title, grad: win, text, stats: [[Math.ceil(sans.length / 2), 'Moves']],
    actions: [{ label: 'Review', onClick: () => Kit.overlay(ov, null) }, { label: 'New game', primary: true, onClick: () => mode === 'pvp' ? newGame('w') : askNew() }],
  }), 700);
  return true;
}

$('#undo').onclick = () => {
  if (busy || !history.length) return;
  let h = history.pop();
  if (mode !== 'pvp' && h.S.turn !== human && history.length) h = history.pop();
  S = h.S; lastMove = h.lastMove; sans = h.sans; keys_ = h.keys; selected = -1; over = false;
  Kit.overlay(ov, null); $('#promo').hidden = true;
  render(); sfx.tone(520, { dur: .1, vol: .04, slide: 320 });
  maybeAI();
};
$('#flip').onclick = () => { flipped = !flipped; render(); };
$('#new').onclick = () => mode === 'pvp' ? newGame('w') : askNew();
addEventListener('keydown', e => { if (e.key === 'Escape') { selected = -1; render(); } });

mode = store.data.mode; setMode(mode);
newGame(store.data.side);
