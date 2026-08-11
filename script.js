/* ==========================================================================
   Terminal Minesweeper Logic
   ========================================================================== */

const ROWS = 10;
const COLS = 10;
const TOTAL_MINES = 15;

// Game State Variables
let board = [];
let firstClick = true;
let gameOver = false;
let gameWon = false;
let revealedCount = 0;
let flagsCount = 0;
let timer = 0;
let timerInterval = null;
let soundEnabled = true;

// Web Audio API Context for synthesized retro sounds
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

function playSound(type) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.05);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'flag') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(500, now + 0.08);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'explode') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.35);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'win') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
      osc.frequency.setValueAtTime(1046.50, now + 0.3); // C6
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  } catch (e) {
    // Ignore audio errors if blocked by browser policy
  }
}

// DOM Elements
const boardElement = document.getElementById('board');
const mineCountElement = document.getElementById('mine-count');
const timerElement = document.getElementById('timer');
const gameMessageElement = document.getElementById('game-message');
const resetBtnElement = document.getElementById('reset-btn');
const soundToggleElement = document.getElementById('sound-toggle');
const terminalLogsElement = document.getElementById('terminal-logs');

// Add log entry to terminal console
function addLog(message, type = 'normal') {
  const logLine = document.createElement('p');
  logLine.className = `log-line ${type}`;
  logLine.textContent = `> ${message}`;
  terminalLogsElement.appendChild(logLine);
  terminalLogsElement.scrollTop = terminalLogsElement.scrollHeight;
}

// Initialize / Reset Game
function initGame() {
  clearInterval(timerInterval);
  timer = 0;
  timerInterval = null;
  firstClick = true;
  gameOver = false;
  gameWon = false;
  revealedCount = 0;
  flagsCount = 0;

  // Reset UI Displays
  timerElement.textContent = '000';
  updateMineCountDisplay();
  
  gameMessageElement.textContent = '> SISTEMA PRONTO. SELECIONE UMA CÉLULA PARA INICIAR.';
  gameMessageElement.className = 'game-message status-normal';
  
  const faceIcon = resetBtnElement.querySelector('.face-icon');
  if (faceIcon) faceIcon.textContent = '🙂';

  terminalLogsElement.innerHTML = '';
  addLog('Sistema reinicializado. Tabuleiro 10x10 criado com 15 minas.');
  addLog('Aguardando primeiro clique (segurança garantida)...');

  // Build Board Data Structure
  board = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      row.push({
        mine: false,
        revealed: false,
        flagged: false,
        count: 0
      });
    }
    board.push(row);
  }

  renderBoard();
}

// Render Board DOM
function renderBoard() {
  boardElement.innerHTML = '';
  
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cellBtn = document.createElement('button');
      cellBtn.className = 'cell';
      cellBtn.dataset.r = r;
      cellBtn.dataset.c = c;
      cellBtn.setAttribute('aria-label', `Célula linha ${r+1} coluna ${c+1}`);
      
      // Event Listeners
      cellBtn.addEventListener('click', () => handleCellClick(r, c));
      cellBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        handleRightClick(r, c);
      });

      boardElement.appendChild(cellBtn);
    }
  }
}

// Prevent Context Menu across the entire board
boardElement.addEventListener('contextmenu', (e) => e.preventDefault());

// Place Mines randomly ensuring first click at (safeR, safeC) is NEVER a mine
function generateMines(safeR, safeC) {
  let minesPlaced = 0;
  
  while (minesPlaced < TOTAL_MINES) {
    const randomR = Math.floor(Math.random() * ROWS);
    const randomC = Math.floor(Math.random() * COLS);

    // Ensure cell is not the initial safe cell and doesn't already have a mine
    if ((randomR !== safeR || randomC !== safeC) && !board[randomR][randomC].mine) {
      board[randomR][randomC].mine = true;
      minesPlaced++;
    }
  }

  // Calculate neighbor mine counts
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!board[r][c].mine) {
        board[r][c].count = countNeighborMines(r, c);
      }
    }
  }
}

// Count mines around cell (r, c)
function countNeighborMines(r, c) {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
        if (board[nr][nc].mine) {
          count++;
        }
      }
    }
  }
  return count;
}

// Start Timer
function startTimer() {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    timer++;
    if (timer > 999) timer = 999;
    timerElement.textContent = String(timer).padStart(3, '0');
  }, 1000);
}

// Handle Left Click
function handleCellClick(r, c) {
  if (gameOver || gameWon) return;

  const cell = board[r][c];
  if (cell.flagged || cell.revealed) return;

  // First Click Safety Handling
  if (firstClick) {
    generateMines(r, c);
    startTimer();
    firstClick = false;
    addLog(`Primeiro clique efetuado em (${r + 1}, ${c + 1}). Minas posicionadas!`);
  }

  // Clicked a Mine -> Game Over
  if (cell.mine) {
    triggerGameOver(r, c);
    return;
  }

  // Safe Cell Clicked
  playSound('click');
  revealCell(r, c);

  // If cell has 0 neighboring mines, perform flood fill reveal
  if (cell.count === 0) {
    floodFill(r, c);
  }

  // Check Victory Condition
  checkWinCondition();
}

// Reveal Cell State & Render DOM
function revealCell(r, c) {
  const cell = board[r][c];
  if (cell.revealed) return;

  cell.revealed = true;
  revealedCount++;

  const cellBtn = getCellElement(r, c);
  if (!cellBtn) return;

  cellBtn.classList.add('revealed');

  if (cell.count > 0) {
    cellBtn.textContent = cell.count;
    cellBtn.dataset.count = cell.count;
  } else {
    cellBtn.textContent = '';
  }
}

// Flood Fill Algorithm to reveal contiguous empty areas
function floodFill(startR, startC) {
  const queue = [[startR, startC]];
  
  while (queue.length > 0) {
    const [r, c] = queue.shift();

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;

        const nr = r + dr;
        const nc = c + dc;

        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
          const neighbor = board[nr][nc];
          if (!neighbor.revealed && !neighbor.flagged && !neighbor.mine) {
            revealCell(nr, nc);
            if (neighbor.count === 0) {
              queue.push([nr, nc]);
            }
          }
        }
      }
    }
  }
}

// Handle Right Click (Toggle Flag)
function handleRightClick(r, c) {
  if (gameOver || gameWon) return;

  const cell = board[r][c];
  if (cell.revealed) return;

  const cellBtn = getCellElement(r, c);
  if (!cellBtn) return;

  if (cell.flagged) {
    cell.flagged = false;
    cellBtn.classList.remove('flagged');
    cellBtn.textContent = '';
    flagsCount--;
    playSound('flag');
    addLog(`Bandeira removida de (${r + 1}, ${c + 1}).`);
  } else {
    // Only allow flags up to max mines
    if (flagsCount >= TOTAL_MINES) {
      addLog(`Limite de bandeiras atingido (${TOTAL_MINES})!`, 'warn');
      return;
    }
    cell.flagged = true;
    cellBtn.classList.add('flagged');
    cellBtn.textContent = '🚩';
    flagsCount++;
    playSound('flag');
    addLog(`Bandeira colocada em (${r + 1}, ${c + 1}).`);
  }

  updateMineCountDisplay();
}

// Update Mine Count Display
function updateMineCountDisplay() {
  const remainingMines = TOTAL_MINES - flagsCount;
  const formatted = String(Math.max(0, remainingMines)).padStart(3, '0');
  mineCountElement.textContent = formatted;
}

// Trigger Game Over
function triggerGameOver(explodedR, explodedC) {
  gameOver = true;
  clearInterval(timerInterval);
  playSound('explode');

  const faceIcon = resetBtnElement.querySelector('.face-icon');
  if (faceIcon) faceIcon.textContent = '😵';

  gameMessageElement.textContent = '> ALERTA: MINA DETONADA! FIM DE JOGO.';
  gameMessageElement.className = 'game-message status-lose';

  addLog(`MINA EXPLODIDA em (${explodedR + 1}, ${explodedC + 1})! Jogo encerrado.`, 'error');

  // Reveal all mines
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = board[r][c];
      const cellBtn = getCellElement(r, c);

      if (cell.mine) {
        cellBtn.classList.add('mine');
        cellBtn.textContent = '💣';
        if (r === explodedR && c === explodedC) {
          cellBtn.classList.add('exploded');
          cellBtn.textContent = '💥';
        }
      } else if (cell.flagged && !cell.mine) {
        // Wrong flag indicator
        cellBtn.textContent = '❌';
      }
    }
  }
}

// Check Win Condition
function checkWinCondition() {
  const totalSafeCells = (ROWS * COLS) - TOTAL_MINES;
  
  if (revealedCount === totalSafeCells) {
    gameWon = true;
    clearInterval(timerInterval);
    playSound('win');

    const faceIcon = resetBtnElement.querySelector('.face-icon');
    if (faceIcon) faceIcon.textContent = '😎';

    gameMessageElement.textContent = '> SISTEMA DESARMADO! VOCÊ VENCEU!';
    gameMessageElement.className = 'game-message status-win';

    addLog(`PARABÉNS! Todas as 85 células seguras foram reveladas em ${timer} segundos.`, 'success');

    // Automatically flag all remaining mines
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        if (cell.mine && !cell.flagged) {
          cell.flagged = true;
          const cellBtn = getCellElement(r, c);
          if (cellBtn) {
            cellBtn.classList.add('flagged');
            cellBtn.textContent = '🚩';
          }
        }
      }
    }
    flagsCount = TOTAL_MINES;
    updateMineCountDisplay();
  }
}

// Helper to get DOM cell button element by row & column
function getCellElement(r, c) {
  return boardElement.querySelector(`[data-r="${r}"][data-c="${c}"]`);
}

// Event Listeners for Reset Button & Sound Toggle
resetBtnElement.addEventListener('click', () => {
  initGame();
});

soundToggleElement.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundToggleElement.textContent = soundEnabled ? '🔊' : '🔇';
  addLog(`Áudio ${soundEnabled ? 'ATIVADO' : 'DESATIVADO'}.`);
});

// Keyboard Controls
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' || e.code === 'Space') {
    // Avoid space scrolling the page
    if (e.code === 'Space') e.preventDefault();
    initGame();
  }
});

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initGame();
});
