document.addEventListener('DOMContentLoaded', function () {
  const boardEl  = document.getElementById('board');
  const statusEl = document.getElementById('status');
  const resetBtn = document.getElementById('reset');
  const scoreXEl = document.getElementById('score-x-val');
  const scoreOEl = document.getElementById('score-o-val');
  const scoreTEl = document.getElementById('score-tie-val');
  const cardX    = document.getElementById('score-x');
  const cardO    = document.getElementById('score-o');

  const WINS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  let board   = Array(9).fill('');
  let current = 'X';
  let active  = true;
  let locked  = false;
  let scores  = { X: 0, O: 0, T: 0 };
  let cells   = [];

  // --- Build cells ---
  function buildBoard() {
    boardEl.innerHTML = '';
    cells = [];
    boardEl.classList.remove('board-locked');

    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.classList.add('cell');
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('aria-label', 'Cell ' + (i + 1) + ', empty');
      cell.dataset.index = i;

      cell.addEventListener('click', function () { handleMove(i); });
      cell.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleMove(i);
        }
      });

      boardEl.appendChild(cell);
      cells.push(cell);
    }
  }

  // --- Handle move ---
  function handleMove(i) {
    if (!active || locked || board[i]) return;

    locked = true;
    board[i] = current;

    const cell = cells[i];
    cell.textContent = current;
    cell.classList.add(current.toLowerCase(), 'taken');
    cell.setAttribute('aria-label', 'Cell ' + (i + 1) + ', ' + current);

    setTimeout(function () { locked = false; }, 200);

    const winner = getWinner();
    if (winner) {
      endGame(winner);
    } else if (board.every(function (v) { return v; })) {
      endGame(null);
    } else {
      current = current === 'X' ? 'O' : 'X';
      updateStatus();
    }
  }

  // --- Winner check ---
  function getWinner() {
    for (let i = 0; i < WINS.length; i++) {
      const a = WINS[i][0], b = WINS[i][1], c = WINS[i][2];
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { player: board[a], line: [a, b, c] };
      }
    }
    return null;
  }

  // --- End game ---
  function endGame(result) {
    active = false;
    boardEl.classList.add('board-locked');

    if (result) {
      result.line.forEach(function (i) { cells[i].classList.add('winner-cell'); });
      statusEl.textContent = 'Player ' + result.player + ' wins!';
      statusEl.className = 'winner';
      scores[result.player]++;
      updateScores();
    } else {
      statusEl.textContent = "It's a tie!";
      statusEl.className = '';
      scores.T++;
      updateScores();
    }
  }

  // --- Status ---
  function updateStatus() {
    statusEl.textContent = "Player " + current + "'s turn";
    statusEl.className = current === 'X' ? 'x-turn' : 'o-turn';
    cardX.className = 'score-card' + (current === 'X' ? ' active-x' : '');
    cardO.className = 'score-card' + (current === 'O' ? ' active-o' : '');
  }

  // --- Scores ---
  function updateScores() {
    scoreXEl.textContent = scores.X;
    scoreOEl.textContent = scores.O;
    scoreTEl.textContent = scores.T;
  }

  // --- Reset ---
  function resetGame() {
    board   = Array(9).fill('');
    active  = true;
    locked  = false;
    current = 'X';
    buildBoard();
    updateStatus();
  }

  resetBtn.addEventListener('click', resetGame);

  // --- Init ---
  buildBoard();
  updateStatus();
});