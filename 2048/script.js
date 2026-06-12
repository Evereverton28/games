(() => {
  /* ── State ── */
  const SIZE = 4;
  let grid, score, best, gameOver, won;

  /* ── DOM refs ── */
  const tilesEl  = document.getElementById('tiles');
  const scoreEl  = document.getElementById('score');
  const bestEl   = document.getElementById('best');
  const scoreBox = document.getElementById('score-box');
  const overlay  = document.getElementById('overlay');
  const overlayMsg = document.getElementById('overlay-msg');

  document.getElementById('btn-new').addEventListener('click', init);
  document.getElementById('btn-retry').addEventListener('click', init);

  /* ── Init ── */
  function init() {
    grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    score = 0;
    gameOver = false;
    won = false;
    best = parseInt(localStorage.getItem('2048-best') || '0', 10);
    updateScoreDisplay();
    overlay.classList.add('hidden');
    addTile();
    addTile();
    render();
  }

  /* ── Tile spawning ── */
  function emptyCells() {
    const cells = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (grid[r][c] === 0) cells.push([r, c]);
    return cells;
  }

  function addTile() {
    const cells = emptyCells();
    if (!cells.length) return;
    const [r, c] = cells[Math.floor(Math.random() * cells.length)];
    grid[r][c] = Math.random() < 0.9 ? 2 : 4;
  }

  /* ── Move logic ── */
  function slideRow(row) {
    let arr = row.filter(v => v !== 0);
    let gained = 0;
    for (let i = 0; i < arr.length - 1; i++) {
      if (arr[i] === arr[i + 1]) {
        arr[i] *= 2;
        gained += arr[i];
        arr.splice(i + 1, 1);
      }
    }
    while (arr.length < SIZE) arr.push(0);
    return { arr, gained };
  }

  function rotate90(g) {
    // rotate clockwise
    return g[0].map((_, c) => g.map(row => row[c]).reverse());
  }

  function move(dir) {
    // Normalise: always slide left after optional rotation
    let rotations = { left: 0, down: 1, right: 2, up: 3 }[dir];
    let g = grid.map(r => [...r]);
    for (let i = 0; i < rotations; i++) g = rotate90(g);

    let moved = false;
    let totalGained = 0;
    const mergedPositions = []; // track for animation

    for (let r = 0; r < SIZE; r++) {
      const { arr, gained } = slideRow(g[r]);
      if (arr.join() !== g[r].join()) moved = true;
      g[r] = arr;
      totalGained += gained;
      if (gained > 0) {
        // find merged cell position (after slide)
        for (let c = 0; c < SIZE; c++) {
          if (arr[c] !== 0 && arr[c] === gained) {
            mergedPositions.push([r, c, arr[c]]);
          }
        }
      }
    }

    // Rotate back
    const backRots = (4 - rotations) % 4;
    for (let i = 0; i < backRots; i++) g = rotate90(g);

    if (!moved) return false;

    grid = g;
    score += totalGained;
    if (score > best) {
      best = score;
      localStorage.setItem('2048-best', best);
    }
    updateScoreDisplay();

    addTile();
    render();
    checkEnd();
    return true;
  }

  /* ── End check ── */
  function checkEnd() {
    // Win
    if (!won) {
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
          if (grid[r][c] === 2048) { won = true; showOverlay('You win!'); return; }
    }
    // Lose
    if (emptyCells().length > 0) return;
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        if (c < SIZE - 1 && grid[r][c] === grid[r][c + 1]) return;
        if (r < SIZE - 1 && grid[r][c] === grid[r + 1][c]) return;
      }
    gameOver = true;
    showOverlay('Game over');
  }

  function showOverlay(msg) {
    overlayMsg.textContent = msg;
    overlay.classList.remove('hidden');
  }

  /* ── Render ── */
  function render() {
    tilesEl.innerHTML = '';
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const val = grid[r][c];
        if (val === 0) continue;
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.dataset.val = val;
        tile.style.setProperty('--row', r + 1);
        tile.style.setProperty('--col', c + 1);
        tile.textContent = val;
        tilesEl.appendChild(tile);
      }
    }
  }

  /* ── Score display ── */
  function updateScoreDisplay() {
    scoreEl.textContent = score;
    bestEl.textContent  = best;
    scoreBox.classList.remove('bump');
    // force reflow to restart animation
    void scoreBox.offsetWidth;
    scoreBox.classList.add('bump');
  }

  /* ── Keyboard ── */
  const keyMap = {
    ArrowLeft: 'left', ArrowRight: 'right',
    ArrowUp: 'up',     ArrowDown: 'down',
  };

  document.addEventListener('keydown', e => {
    const dir = keyMap[e.key];
    if (!dir || gameOver) return;
    e.preventDefault();
    move(dir);
  });

  /* ── Touch / swipe ── */
  let touchStartX = 0, touchStartY = 0;

  document.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (gameOver) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    if (Math.max(absDx, absDy) < 20) return; // too short
    if (absDx > absDy) move(dx > 0 ? 'right' : 'left');
    else               move(dy > 0 ? 'down'  : 'up');
  }, { passive: true });

  /* ── Start ── */
  init();
})();