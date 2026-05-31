// ─── DOM refs ─────────────────────────────────────────
const boardEl    = document.getElementById('board');
const overlay    = document.getElementById('overlay');
const msg        = document.getElementById('msg');
const sub        = document.getElementById('sub');
const startBtn   = document.getElementById('startBtn');
const mistakesEl = document.getElementById('mistakesEl');
const timeEl     = document.getElementById('timeEl');
const numpad     = document.getElementById('numpad');
const eraseBtn   = document.getElementById('eraseBtn');
const noteBtn    = document.getElementById('noteBtn');
const hintBtn    = document.getElementById('hintBtn');

// ─── State ────────────────────────────────────────────
const MAX_MISTAKES = 3;
let solution   = [];
let puzzle     = [];
let userGrid   = [];
let notesGrid  = [];
let given      = [];
let selected   = null;
let mistakes   = 0;
let hintsLeft  = 3;
let noteMode   = false;
let difficulty = 'easy';
let timerInterval, elapsed, gameActive;

const REMOVE_COUNT = { easy: 36, medium: 46, hard: 56 };

function generateSolution() {
  const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
  solveSudoku(grid);
  return grid;
}

function solveSudoku(grid) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) {
        const nums = shuffle([1,2,3,4,5,6,7,8,9]);
        for (const n of nums) {
          if (isValid(grid, r, c, n)) {
            grid[r][c] = n;
            if (solveSudoku(grid)) return true;
            grid[r][c] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

function isValid(grid, r, c, n) {
  for (let i = 0; i < 9; i++) {
    if (grid[r][i] === n) return false;
    if (grid[i][c] === n) return false;
    const br = 3 * Math.floor(r / 3) + Math.floor(i / 3);
    const bc = 3 * Math.floor(c / 3) + (i % 3);
    if (grid[br][bc] === n) return false;
  }
  return true;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createPuzzle(sol, removeCount) {
  const puz = sol.map(r => [...r]);
  const cells = shuffle([...Array(81).keys()]);
  let removed = 0;
  for (const idx of cells) {
    if (removed >= removeCount) break;
    const r = Math.floor(idx / 9), c = idx % 9;
    puz[r][c] = 0;
    removed++;
  }
  return puz;
}

function newGame() {
  clearInterval(timerInterval);
  elapsed   = 0;
  mistakes  = 0;
  hintsLeft = 3;
  noteMode  = false;
  selected  = null;
  gameActive = true;

  solution = generateSolution();
  puzzle   = createPuzzle(solution, REMOVE_COUNT[difficulty]);

  userGrid  = puzzle.map(r => [...r]);
  notesGrid = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => new Set())
  );
  given = puzzle.map(r => r.map(v => v !== 0));

  mistakesEl.textContent = `0 / ${MAX_MISTAKES}`;
  timeEl.textContent     = '00:00';
  hintBtn.textContent    = `💡 Hint (${hintsLeft})`;
  hintBtn.classList.remove('exhausted');
  noteBtn.classList.remove('active');

  overlay.classList.add('hidden');
  renderBoard();
  buildNumpad();
  startTimer();
}

function renderBoard() {
  boardEl.innerHTML = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;

      if (c === 2 || c === 5) cell.classList.add('box-right');
      if (r === 2 || r === 5) cell.classList.add('box-bottom');

      if (given[r][c]) {
        cell.classList.add('given');
        cell.textContent = puzzle[r][c];
      }

      cell.addEventListener('click', () => selectCell(r, c));
      boardEl.appendChild(cell);
    }
  }
}

function refreshBoard() {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      updateCellEl(r, c);
    }
  }
  buildNumpad();
}

function updateCellEl(r, c) {
  const el = getCellEl(r, c);
  if (!el) return;

  const classes = ['cell'];
  if (c === 2 || c === 5) classes.push('box-right');
  if (r === 2 || r === 5) classes.push('box-bottom');
  if (given[r][c])         classes.push('given');

  if (selected) {
    const { r: sr, c: sc } = selected;
    if (r === sr && c === sc) {
      classes.push('selected');
    } else if (r === sr || c === sc || (Math.floor(r/3) === Math.floor(sr/3) && Math.floor(c/3) === Math.floor(sc/3))) {
      classes.push('highlight');
    }
    const selVal = userGrid[sr][sc];
    if (selVal !== 0 && userGrid[r][c] === selVal) {
      classes.push('same-num');
    }
  }

  el.className = classes.join(' ');

  if (given[r][c]) {
    el.textContent = puzzle[r][c];
    return;
  }

  const val   = userGrid[r][c];
  const notes = notesGrid[r][c];

  el.innerHTML = '';

  if (val !== 0) {
    el.textContent = val;
    if (val === solution[r][c]) {
      el.classList.add('user-correct');
    } else {
      el.classList.add('user-wrong');
    }
  } else if (notes.size > 0) {
    const noteDiv = document.createElement('div');
    noteDiv.className = 'notes';
    for (let n = 1; n <= 9; n++) {
      const nd = document.createElement('div');
      nd.className = 'note-num';
      nd.textContent = notes.has(n) ? n : '';
      noteDiv.appendChild(nd);
    }
    el.appendChild(noteDiv);
  }
}

function getCellEl(r, c) {
  return boardEl.children[r * 9 + c];
}

function selectCell(r, c) {
  selected = { r, c };
  refreshBoard();
}

function inputNumber(n) {
  if (!selected || !gameActive) return;
  const { r, c } = selected;
  if (given[r][c]) return;

  if (noteMode) {
    const notes = notesGrid[r][c];
    if (notes.has(n)) notes.delete(n); else notes.add(n);
    userGrid[r][c] = 0;
    updateCellEl(r, c);
    return;
  }

  notesGrid[r][c].clear();
  userGrid[r][c] = n;

  if (n !== solution[r][c]) {
    mistakes++;
    mistakesEl.textContent = `${mistakes} / ${MAX_MISTAKES}`;
    updateCellEl(r, c);
    const el = getCellEl(r, c);
    el.style.animation = 'none';
    requestAnimationFrame(() => { el.style.animation = ''; el.classList.add('user-wrong'); });
    if (mistakes >= MAX_MISTAKES) {
      setTimeout(() => endGame(false), 400);
    }
  } else {
    clearNoteInPeers(r, c, n);
    updateCellEl(r, c);
    const el = getCellEl(r, c);
    el.classList.add('complete-flash');
    setTimeout(() => el.classList.remove('complete-flash'), 500);
    checkWin();
  }

  buildNumpad();
}

function clearNoteInPeers(r, c, n) {
  for (let i = 0; i < 9; i++) {
    notesGrid[r][i].delete(n);
    notesGrid[i][c].delete(n);
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) {
    notesGrid[br + dr][bc + dc].delete(n);
  }
}

function eraseCell() {
  if (!selected || !gameActive) return;
  const { r, c } = selected;
  if (given[r][c]) return;
  userGrid[r][c] = 0;
  notesGrid[r][c].clear();
  updateCellEl(r, c);
  buildNumpad();
}

function giveHint() {
  if (!gameActive || hintsLeft <= 0) return;
  const empties = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (!given[r][c] && userGrid[r][c] !== solution[r][c]) {
        empties.push({ r, c });
      }
    }
  }
  if (empties.length === 0) return;

  let target = empties[0];
  if (selected && !given[selected.r][selected.c] && userGrid[selected.r][selected.c] !== solution[selected.r][selected.c]) {
    target = selected;
  }

  notesGrid[target.r][target.c].clear();
  userGrid[target.r][target.c] = solution[target.r][target.c];
  hintsLeft--;
  hintBtn.textContent = `💡 Hint (${hintsLeft})`;
  if (hintsLeft === 0) hintBtn.classList.add('exhausted');

  clearNoteInPeers(target.r, target.c, solution[target.r][target.c]);
  selected = target;
  refreshBoard();
  checkWin();
}

function buildNumpad() {
  numpad.innerHTML = '';
  for (let n = 1; n <= 9; n++) {
    const btn = document.createElement('button');
    btn.className = 'num-btn';
    btn.textContent = n;
    let count = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (userGrid[r][c] === n && solution[r][c] === n) count++;
    }
    if (count >= 9) btn.classList.add('exhausted');
    btn.addEventListener('click', () => inputNumber(n));
    numpad.appendChild(btn);
  }
}

function checkWin() {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (userGrid[r][c] !== solution[r][c]) return;
    }
  }
  endGame(true);
}

function endGame(won) {
  gameActive = false;
  clearInterval(timerInterval);
  selected = null;
  refreshBoard();

  setTimeout(() => {
    msg.textContent      = won ? '🎉 SOLVED!' : '💥 GAME OVER';
    sub.textContent      = won
      ? `Completed in ${formatTime(elapsed)} · ${difficulty}`
      : `${mistakes} mistakes — try again!`;
    startBtn.textContent = 'New Game ▶';
    overlay.classList.remove('hidden');
  }, won ? 400 : 500);
}

function startTimer() {
  timerInterval = setInterval(() => {
    elapsed++;
    timeEl.textContent = formatTime(elapsed);
  }, 1000);
}

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

window.addEventListener('keydown', (e) => {
  if (!gameActive) return;

  if (e.key >= '1' && e.key <= '9') {
    inputNumber(+e.key);
    return;
  }

  if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
    eraseCell();
    return;
  }

  if (e.key === 'n' || e.key === 'N') {
    toggleNoteMode();
    return;
  }

  if (!selected) return;
  const moves = { ArrowUp: [-1,0], ArrowDown: [1,0], ArrowLeft: [0,-1], ArrowRight: [0,1] };
  const move = moves[e.key];
  if (move) {
    e.preventDefault();
    const nr = Math.max(0, Math.min(8, selected.r + move[0]));
    const nc = Math.max(0, Math.min(8, selected.c + move[1]));
    selectCell(nr, nc);
  }
});

eraseBtn.addEventListener('click', eraseCell);
noteBtn.addEventListener('click', toggleNoteMode);
hintBtn.addEventListener('click', giveHint);

function toggleNoteMode() {
  noteMode = !noteMode;
  noteBtn.classList.toggle('active', noteMode);
}

document.querySelectorAll('.diff').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    difficulty = btn.dataset.d;
    newGame();
  });
});

startBtn.addEventListener('click', newGame);

overlay.classList.remove('hidden');
msg.textContent      = 'SUDOKU';
sub.textContent      = 'Fill the grid so every row,\ncolumn and 3×3 box has 1–9';
startBtn.textContent = 'New Game ▶';
buildNumpad();