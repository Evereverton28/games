// ---- Word lists ----
const VALID_SET = new Set(VALID_WORDS);
const TIERS = { easy: EASY_WORDS, medium: MEDIUM_WORDS, hard: HARD_WORDS };

const ROWS = 6;
const COLS = 5;

let ANSWER = "";
let currentRow = 0;
let currentCol = 0;
let board = [];        // 2D array of letters
let gameOver = false;

const boardEl = document.getElementById("board");
const messageEl = document.getElementById("message");
const keyboardEl = document.getElementById("keyboard");
const restartBtn = document.getElementById("restart");
const changeDifficultyBtn = document.getElementById("changeDifficulty");
const difficultyScreen = document.getElementById("difficultyScreen");
const gameScreen = document.getElementById("gameScreen");
const difficultyLabel = document.getElementById("difficultyLabel");
const diffButtons = document.querySelectorAll(".diff-btn");

// ---- Difficulty selection ----
diffButtons.forEach(btn => {
  btn.addEventListener("click", () => startGame(btn.dataset.difficulty));
});

changeDifficultyBtn.addEventListener("click", () => {
  gameScreen.classList.add("hidden");
  difficultyScreen.classList.remove("hidden");
});

function startGame(level) {
  const pool = TIERS[level];
  ANSWER = pool[Math.floor(Math.random() * pool.length)];

  currentRow = 0;
  currentCol = 0;
  gameOver = false;

  difficultyLabel.textContent = level.toUpperCase();
  difficultyLabel.className = "difficulty-label " + level;

  difficultyScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");

  showMessage("\u00A0");
  buildBoard();
  buildKeyboard();
}

// ---- Build board ----
function buildBoard() {
  boardEl.innerHTML = "";
  board = [];
  for (let r = 0; r < ROWS; r++) {
    const rowEl = document.createElement("div");
    rowEl.className = "row";
    rowEl.dataset.row = r;
    const rowArr = [];
    for (let c = 0; c < COLS; c++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.row = r;
      tile.dataset.col = c;
      rowEl.appendChild(tile);
      rowArr.push("");
    }
    boardEl.appendChild(rowEl);
    board.push(rowArr);
  }
}

// ---- Build keyboard ----
const KEY_ROWS = [
  ["q","w","e","r","t","y","u","i","o","p"],
  ["a","s","d","f","g","h","j","k","l"],
  ["enter","z","x","c","v","b","n","m","back"]
];

function buildKeyboard() {
  keyboardEl.innerHTML = "";
  KEY_ROWS.forEach(rowKeys => {
    const rowEl = document.createElement("div");
    rowEl.className = "keyboard-row";
    rowKeys.forEach(key => {
      const btn = document.createElement("button");
      btn.className = "key";
      btn.dataset.key = key;
      if (key === "enter" || key === "back") btn.classList.add("wide");
      btn.textContent = key === "back" ? "⌫" : (key === "enter" ? "ENTER" : key.toUpperCase());
      btn.addEventListener("click", () => handleKey(key));
      rowEl.appendChild(btn);
    });
    keyboardEl.appendChild(rowEl);
  });
}

// ---- Input handling ----
function handleKey(key) {
  if (gameOver || board.length === 0) return;

  if (key === "enter" || key === "Enter") {
    submitGuess();
  } else if (key === "back" || key === "Backspace") {
    deleteLetter();
  } else if (/^[a-z]$/i.test(key) && key.length === 1) {
    addLetter(key.toLowerCase());
  }
}

function addLetter(letter) {
  if (currentCol >= COLS) return;
  board[currentRow][currentCol] = letter;
  const tile = getTile(currentRow, currentCol);
  tile.textContent = letter;
  tile.classList.add("filled", "pop");
  setTimeout(() => tile.classList.remove("pop"), 200);
  currentCol++;
}

function deleteLetter() {
  if (currentCol <= 0) return;
  currentCol--;
  board[currentRow][currentCol] = "";
  const tile = getTile(currentRow, currentCol);
  tile.textContent = "";
  tile.classList.remove("filled");
}

function getTile(r, c) {
  return boardEl.querySelector(`.tile[data-row="${r}"][data-col="${c}"]`);
}

function getRowEl(r) {
  return boardEl.querySelector(`.row[data-row="${r}"]`);
}

// ---- Guess validation & scoring ----
function submitGuess() {
  if (currentCol < COLS) {
    showMessage("Not enough letters");
    shakeRow(currentRow);
    return;
  }

  const guess = board[currentRow].join("");

  if (!VALID_SET.has(guess)) {
    showMessage("Not in word list");
    shakeRow(currentRow);
    return;
  }

  const result = scoreGuess(guess, ANSWER);

  revealRow(currentRow, result, guess);

  if (guess === ANSWER) {
    setTimeout(() => {
      showMessage("You got it!", true);
      getRowEl(currentRow).classList.add("win");
      gameOver = true;
    }, COLS * 350 + 100);
    return;
  }

  if (currentRow === ROWS - 1) {
    setTimeout(() => {
      showMessage(`The word was ${ANSWER.toUpperCase()}`);
      gameOver = true;
    }, COLS * 350 + 100);
    return;
  }

  currentRow++;
  currentCol = 0;
}

// Returns array of "correct" | "present" | "absent" for each letter
function scoreGuess(guess, answer) {
  const result = new Array(COLS).fill("absent");
  const answerLetters = answer.split("");
  const used = new Array(COLS).fill(false);

  // First pass: correct
  for (let i = 0; i < COLS; i++) {
    if (guess[i] === answerLetters[i]) {
      result[i] = "correct";
      used[i] = true;
    }
  }

  // Second pass: present
  for (let i = 0; i < COLS; i++) {
    if (result[i] === "correct") continue;
    for (let j = 0; j < COLS; j++) {
      if (!used[j] && guess[i] === answerLetters[j]) {
        result[i] = "present";
        used[j] = true;
        break;
      }
    }
  }

  return result;
}

// ---- Reveal animation ----
function revealRow(r, result, guess) {
  for (let c = 0; c < COLS; c++) {
    const tile = getTile(r, c);
    setTimeout(() => {
      tile.classList.add("flip");
      setTimeout(() => {
        tile.classList.add(result[c]);
      }, 250);
    }, c * 350);

    updateKey(guess[c], result[c]);
  }
}

function updateKey(letter, status) {
  const keyBtn = keyboardEl.querySelector(`.key[data-key="${letter}"]`);
  if (!keyBtn) return;
  const priority = { absent: 0, present: 1, correct: 2 };
  const current = keyBtn.dataset.status || "absent";
  if (!keyBtn.dataset.status || priority[status] > priority[current]) {
    keyBtn.classList.remove("absent", "present", "correct");
    keyBtn.classList.add(status);
    keyBtn.dataset.status = status;
  }
}

function shakeRow(r) {
  const rowEl = getRowEl(r);
  rowEl.classList.add("shake");
  setTimeout(() => rowEl.classList.remove("shake"), 400);
}

function showMessage(text, win = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle("win", win);
}

// ---- Restart ----
function restartGame() {
  const level = difficultyLabel.textContent.toLowerCase();
  startGame(level);
}

// ---- Event listeners ----
document.addEventListener("keydown", (e) => {
  handleKey(e.key);
});

restartBtn.addEventListener("click", restartGame);