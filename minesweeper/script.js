const boardEl  = document.getElementById('board');
const overlay  = document.getElementById('overlay');
const msg      = document.getElementById('msg');
const sub      = document.getElementById('sub');
const startBtn = document.getElementById('startBtn');
const mineEl   = document.getElementById('mineEl');
const timeEl   = document.getElementById('timeEl');

// ─── Difficulty presets ───────────────────────────────

const PRESETS = {
  easy:   { cols: 9,  rows: 9,  mines: 10 },
  medium: { cols: 16, rows: 12, mines: 30 },
  hard:   { cols: 20, rows: 14, mines: 60 },
};

let difficulty = 'easy';
let grid = [], cols, rows, totalMines;
let flagCount, revealedCount, firstClick, gameOver;
let timerInterval, elapsed;

// ─── Difficulty buttons ───────────────────────────────

document.querySelectorAll('.diff').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    difficulty = btn.dataset.d;
    newGame();
  });
});

startBtn.addEventListener('click', newGame);

// ─── Build grid ───────────────────────────────────────

function newGame() {
  const preset = PRESETS[difficulty];
  cols = preset.cols;
  rows = preset.rows;
  totalMines = preset.mines;
  flagCount = 0;
  revealedCount = 0;
  firstClick = true;
  gameOver = false;
  elapsed = 0;

  clearInterval(timerInterval);
  mineEl.textContent = '💣 ' + totalMines;
  timeEl.textContent = '⏱ 0';

  // Build cell data
  grid = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      grid[r][c] = { mine: false, revealed: false, flagged: false, neighbors: 0 };
    }
  }

  renderBoard();
  overlay.classList.add('hidden');
}

// ─── Place mines after first click ───────────────────

function placeMines(safeR, safeC) {
  let placed = 0;
  while (placed < totalMines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (!grid[r][c].mine && !(Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1)) {
      grid[r][c].mine = true;
      placed++;
    }
  }
  // Count neighbor mines
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!grid[r][c].mine) {
        grid[r][c].neighbors = getNeighbors(r, c).filter(([nr, nc]) => grid[nr][nc].mine).length;
      }
    }
  }
}

function getNeighbors(r, c) {
  const ns = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) ns.push([nr, nc]);
    }
  }
  return ns;
}

// ─── Render ───────────────────────────────────────────

function renderBoard() {
  boardEl.style.gridTemplateColumns = `repeat(${cols}, 34px)`;
  boardEl.innerHTML = '';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.addEventListener('click', onLeftClick);
      cell.addEventListener('contextmenu', onRightClick);
      boardEl.appendChild(cell);
    }
  }
}

function updateCell(r, c) {
  const cell = boardEl.children[r * cols + c];
  const data = grid[r][c];

  cell.className = 'cell';
  cell.textContent = '';

  if (data.revealed) {
    if (data.mine) {
      cell.classList.add('revealed', 'exploded');
      cell.textContent = '💣';
    } else {
      cell.classList.add('revealed');
      if (data.neighbors > 0) {
        cell.textContent = data.neighbors;
        cell.classList.add('n' + data.neighbors);
      }
    }
  } else if (data.flagged) {
    cell.classList.add('flagged');
    cell.textContent = '🚩';
  }
}

// ─── Click handlers ───────────────────────────────────

function onLeftClick(e) {
  if (gameOver) return;
  const r = +e.currentTarget.dataset.r;
  const c = +e.currentTarget.dataset.c;
  const data = grid[r][c];
  if (data.revealed || data.flagged) return;

  if (firstClick) {
    firstClick = false;
    placeMines(r, c);
    startTimer();
  }

  if (data.mine) {
    revealAll();
    grid[r][c].revealed = true;
    updateCell(r, c);
    endGame(false);
    return;
  }

  floodReveal(r, c);
  checkWin();
}

function onRightClick(e) {
  e.preventDefault();
  if (gameOver) return;
  const r = +e.currentTarget.dataset.r;
  const c = +e.currentTarget.dataset.c;
  const data = grid[r][c];
  if (data.revealed) return;

  data.flagged = !data.flagged;
  flagCount += data.flagged ? 1 : -1;
  mineEl.textContent = '💣 ' + (totalMines - flagCount);
  updateCell(r, c);
}

// ─── Flood fill reveal ────────────────────────────────

function floodReveal(r, c) {
  const stack = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    const cell = grid[cr][cc];
    if (cell.revealed || cell.flagged || cell.mine) continue;
    cell.revealed = true;
    revealedCount++;
    updateCell(cr, cc);
    if (cell.neighbors === 0) {
      stack.push(...getNeighbors(cr, cc));
    }
  }
}

function revealAll() {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].mine && !grid[r][c].flagged) {
        grid[r][c].revealed = true;
        updateCell(r, c);
      }
    }
  }
}

// ─── Win / lose ───────────────────────────────────────

function checkWin() {
  const safe = rows * cols - totalMines;
  if (revealedCount >= safe) endGame(true);
}

function endGame(won) {
  gameOver = true;
  clearInterval(timerInterval);
  setTimeout(() => {
    msg.textContent      = won ? '🎉 YOU WIN!' : '💥 BOOM!';
    sub.textContent      = won
      ? 'Cleared in ' + elapsed + 's · ' + difficulty
      : 'Better luck next time!';
    startBtn.textContent = 'Play Again ▶';
    overlay.classList.remove('hidden');
  }, won ? 300 : 600);
}

// ─── Timer ───────────────────────────────────────────

function startTimer() {
  timerInterval = setInterval(() => {
    elapsed++;
    timeEl.textContent = '⏱ ' + elapsed;
  }, 1000);
}

// ─── Boot ────────────────────────────────────────────
newGame();
overlay.classList.remove('hidden');
msg.textContent      = 'MINESWEEPER';
sub.textContent      = 'Left-click to reveal · Right-click to flag';
startBtn.textContent = 'New Game ▶';
