// Logicall Game Portal & Sudoku Logic

// --- GAME STATE ---
let gridValues = Array(9).fill(null).map(() => Array(9).fill(0));
let initialValues = Array(9).fill(null).map(() => Array(9).fill(0));
let solutionValues = Array(9).fill(null).map(() => Array(9).fill(0));
let hintBoard = Array(9).fill(null).map(() => Array(9).fill(false));

// Notes matrix: 9x9 array where each cell contains a Set of active note numbers (1-9)
let pencilNotes = Array(9).fill(null).map(() => Array(9).fill(null).map(() => new Set()));

let selectedCell = null; // { r: row_index, c: col_index }
let notesModeActive = false;
let gameDifficulty = 'medium';
let isGameActive = false;

let hintsRemaining = 6;
let maxHints = 6;
let wasKickedByHost = false;
let mistakesCount = 0;




// Timer variables
let secondsElapsed = 0;
let timerInterval = null;

// --- MULTIPLAYER STATE ---
let isMultiplayer = false;
let isHost = false;
let activeConnection = null;
let remoteSelectedCell = null;
let peerInstance = null;
let myUsername = 'Pemain 1';
let remoteUsername = '';

// --- DOM ELEMENTS ---
const menuView = document.getElementById('menu-view');
const gameView = document.getElementById('game-view');
const timerDisplay = document.getElementById('timer-display');
const bestTimeDisplay = document.getElementById('best-time-display');
const globalBestTime = document.getElementById('global-best-time');
const sudokuGrid = document.getElementById('sudoku-grid');
const difficultySelect = document.getElementById('difficulty-select');


const btnNotes = document.getElementById('btn-notes');
const notesBadge = document.getElementById('notes-badge');

// Coming Soon Modal Elements
const comingSoonModal = document.getElementById('coming-soon-modal');
const comingSoonGameName = document.getElementById('coming-soon-game-name');

// Win Modal Elements
const winModal = document.getElementById('win-modal');
const winDifficulty = document.getElementById('win-difficulty');
const winTime = document.getElementById('win-time');
const newRecordBanner = document.getElementById('new-record-banner');

// About Modal Elements
const aboutModal = document.getElementById('about-modal');

// Game Over Modal Elements
const gameOverModal = document.getElementById('game-over-modal');

// Modal Display Helpers using tailwind class 'hidden'
function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('hidden');
    // Force a browser reflow to ensure CSS transitions trigger correctly
    void modalEl.offsetWidth;
    modalEl.classList.remove('pointer-events-none', 'opacity-0');
    if (modalEl.firstElementChild) {
        modalEl.firstElementChild.classList.remove('scale-95');
        modalEl.firstElementChild.classList.add('scale-100');
    }
}

function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('pointer-events-none', 'opacity-0');
    if (modalEl.firstElementChild) {
        modalEl.firstElementChild.classList.remove('scale-100');
        modalEl.firstElementChild.classList.add('scale-95');
    }
    // Wait for transition to complete before adding hidden (display: none)
    setTimeout(() => {
        if (modalEl.classList.contains('opacity-0')) {
            modalEl.classList.add('hidden');
        }
    }, 300);
}

// --- INIT & UTILS ---

document.addEventListener('DOMContentLoaded', () => {
    // Initial Setup
    createGridCells();
    updateGlobalBestTimeHeader();
    setupKeyboardListeners();
    setupMobileInputTrigger();
    
    // Load username from localStorage
    const savedName = localStorage.getItem('logicall_username');
    if (savedName) {
        myUsername = savedName;
    } else {
        myUsername = 'User_' + Math.floor(100 + Math.random() * 900);
        localStorage.setItem('logicall_username', myUsername);
    }
    document.getElementById('global-username-input').value = myUsername;
    
    // Restoring saved game if not joining room
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (!roomParam) {
        const activeGame = localStorage.getItem('logicall_sudoku_active_game');
        if (activeGame === 'true') {
            loadSavedGame();
            
            const savedView = localStorage.getItem('logicall_active_view');
            if (savedView === 'game') {
                // Show game view directly without transition
                menuView.classList.add('hidden', 'hidden-fade');
                menuView.classList.remove('visible-fade');
                gameView.classList.remove('hidden', 'hidden-fade');
                gameView.classList.add('visible-fade');
                
                resumeTimer();
                
                if (selectedCell) {
                    selectCell(selectedCell.r, selectedCell.c);
                }
            }
        }
    }
    
    checkRoomParameter();
});

// View Navigation Transitions
function enterSudokuGame() {
    switchView(menuView, gameView);
    // Auto start a new game if not already active
    if (!isGameActive) {
        initNewGame();
    } else {
        resumeTimer();
        loadBestTime();
    }
}

function backToMenu() {
    pauseTimer();
    switchView(gameView, menuView);
    updateGlobalBestTimeHeader();
}

function switchView(fromView, toView) {
    fromView.classList.remove('visible-fade');
    fromView.classList.add('hidden-fade');
    
    // Save view state
    if (toView === gameView) {
        localStorage.setItem('logicall_active_view', 'game');
    } else {
        localStorage.setItem('logicall_active_view', 'menu');
    }
    
    setTimeout(() => {
        fromView.classList.add('hidden');
        toView.classList.remove('hidden');
        setTimeout(() => {
            toView.classList.remove('hidden-fade');
            toView.classList.add('visible-fade');
            // Recalculate layout or select default cell on game load
            if (toView === gameView && !selectedCell) {
                selectCell(4, 4); // Select center cell initially
            }
        }, 50);
    }, 300);
}

// Coming Soon Modal control
function showComingSoon(gameName) {
    comingSoonGameName.textContent = gameName;
    openModal(comingSoonModal);
}

function hideComingSoon() {
    closeModal(comingSoonModal);
}

// About Modal Control
function toggleAboutModal() {
    const isHidden = aboutModal.classList.contains('hidden') || aboutModal.classList.contains('opacity-0');
    if (isHidden) {
        openModal(aboutModal);
    } else {
        closeModal(aboutModal);
    }
}

// --- SUDOKU ENGINE (SOLVER & GENERATOR) ---

// Checks if placing num at cell (row, col) is valid on the given board
function isValidPlacement(board, row, col, num) {
    // Check row and column
    for (let i = 0; i < 9; i++) {
        if (board[row][i] === num && i !== col) return false;
        if (board[i][col] === num && i !== row) return false;
    }
    
    // Check 3x3 block
    const boxRowStart = Math.floor(row / 3) * 3;
    const boxColStart = Math.floor(col / 3) * 3;
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const curRow = boxRowStart + r;
            const curCol = boxColStart + c;
            if (board[curRow][curCol] === num && (curRow !== row || curCol !== col)) {
                return false;
            }
        }
    }
    
    return true;
}

// Shuffles an array in place
function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

// Backtracking solver to fill grid. Shuffles choices to ensure randomness.
function fillGridRandomly(board) {
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (board[r][c] === 0) {
                const numbers = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9]);
                for (let num of numbers) {
                    if (isValidPlacement(board, r, c, num)) {
                        board[r][c] = num;
                        if (fillGridRandomly(board)) {
                            return true;
                        }
                        board[r][c] = 0;
                    }
                }
                return false;
            }
        }
    }
    return true;
}

// Counts number of solutions for a Sudoku board (up to limit)
function countGridSolutions(board, limit = 2) {
    let count = 0;
    
    function solve() {
        if (count >= limit) return;
        
        let row = -1;
        let col = -1;
        let isEmpty = false;
        
        // Find first empty cell
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (board[r][c] === 0) {
                    row = r;
                    col = c;
                    isEmpty = true;
                    break;
                }
            }
            if (isEmpty) break;
        }
        
        // No empty cells means a solution found
        if (!isEmpty) {
            count++;
            return;
        }
        
        for (let val = 1; val <= 9; val++) {
            if (isValidPlacement(board, row, col, val)) {
                board[row][col] = val;
                solve();
                board[row][col] = 0;
            }
        }
    }
    
    solve();
    return count;
}

// Generates a new Sudoku board based on difficulty
function generateSudoku(difficulty) {
    // 1. Create completely solved board
    const board = Array(9).fill(null).map(() => Array(9).fill(0));
    
    // Fill diagonal 3x3 blocks to optimize solver seed
    for (let i = 0; i < 9; i += 3) {
        const nums = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        let idx = 0;
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                board[i + r][i + c] = nums[idx++];
            }
        }
    }
    
    fillGridRandomly(board);
    
    // Save solved board as global solution
    solutionValues = board.map(row => [...row]);
    
    // 2. Remove numbers to create the puzzle, keeping it unique
    const puzzle = board.map(row => [...row]);
    
    // Set target clue levels
    let targetBlanks = 36; // Default to Easy
    if (difficulty === 'medium') targetBlanks = 46;
    if (difficulty === 'hard') targetBlanks = 54;
    if (difficulty === 'expert') targetBlanks = 60;
    
    // Create coordinate array & shuffle it
    const cells = [];
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            cells.push({ r, c });
        }
    }
    const shuffledCells = shuffleArray(cells);
    
    let blanks = 0;
    for (let i = 0; i < 81; i++) {
        if (blanks >= targetBlanks) break;
        
        const { r, c } = shuffledCells[i];
        const backupValue = puzzle[r][c];
        puzzle[r][c] = 0;
        
        // Check if solution remains unique
        // We create a temporary copy to check
        const tempGrid = puzzle.map(row => [...row]);
        if (countGridSolutions(tempGrid, 2) === 1) {
            blanks++;
        } else {
            puzzle[r][c] = backupValue; // Restore value
        }
    }
    
    return puzzle;
}

// --- GAME ACTIONS ---

function initNewGame() {
    if (isMultiplayer && !isHost) {
        alert("Hanya Host yang bisa memulai game baru!");
        return;
    }

    hideAllGameModals();
    isGameActive = true;
    gameDifficulty = difficultySelect.value;
    
    // Reset mistakes
    mistakesCount = 0;
    updateMistakesUI();
    
    // Set hint limits
    if (gameDifficulty === 'easy') {
        maxHints = 8;
    } else if (gameDifficulty === 'medium') {
        maxHints = 6;
    } else if (gameDifficulty === 'hard') {
        maxHints = 4;
    } else { // expert
        maxHints = 3;
    }
    hintsRemaining = maxHints;
    updateHintButtonUI();
    
    // Reset hint marks and note sets
    hintBoard = Array(9).fill(null).map(() => Array(9).fill(false));
    pencilNotes = Array(9).fill(null).map(() => Array(9).fill(null).map(() => new Set()));
    
    // Set notes mode inactive by default
    notesModeActive = false;
    btnNotes.classList.remove('bg-gray-700', 'border-amber-500/50');
    notesBadge.classList.add('hidden');
    
    // Generate new boards
    const newPuzzle = generateSudoku(gameDifficulty);
    gridValues = newPuzzle.map(row => [...row]);
    initialValues = newPuzzle.map(row => [...row]);
    
    // Reset timer
    resetTimer();
    startTimer();
    
    // Load local best scores
    loadBestTime();
    
    // Render
    selectedCell = { r: 4, c: 4 };
    renderBoard();
    
    // Save solo game progress
    saveGameProgress();

    // Sync Host game generation to Guest
    if (isMultiplayer && activeConnection && activeConnection.open) {
        sendToPeer({
            type: 'new-game',
            gridValues,
            initialValues,
            solutionValues,
            gameDifficulty
        });
    }
}

function resetBoard() {
    if (!isGameActive) return;
    if (isMultiplayer && !isHost) {
        alert("Hanya Host yang bisa me-reset game!");
        return;
    }
    
    // Revert all user entries and clear hints/notes
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            gridValues[r][c] = initialValues[r][c];
            hintBoard[r][c] = false;
            pencilNotes[r][c].clear();
        }
    }
    
    // Reset mistakes
    mistakesCount = 0;
    updateMistakesUI();
    
    // Reset hint limit
    hintsRemaining = maxHints;
    updateHintButtonUI();
    
    renderBoard();
    saveGameProgress();

    // Sync board reset
    if (isMultiplayer && activeConnection && activeConnection.open) {
        sendToPeer({
            type: 'undo-redo',
            grid: gridValues,
            notes: pencilNotes.map(row => row.map(cellSet => [...cellSet])),
            hints: hintBoard,
            hintsRemaining,
            mistakesCount
        });
    }
}

function changeDifficulty() {
    initNewGame();
}

// --- RENDERING & INTERFACES ---

// Dynamically injects cell grids
function createGridCells() {
    sudokuGrid.innerHTML = '';
    
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            const cell = document.createElement('div');
            cell.className = 'sudoku-cell';
            cell.dataset.row = r;
            cell.dataset.col = c;
            
            // Interaction click
            cell.addEventListener('click', () => {
                selectCell(r, c);
            });
            
            // Build note grid element
            const noteGrid = document.createElement('div');
            noteGrid.className = 'note-grid';
            
            for (let n = 1; n <= 9; n++) {
                const noteCell = document.createElement('div');
                noteCell.className = `note-cell note-${n}`;
                noteCell.textContent = n;
                noteGrid.appendChild(noteCell);
            }
            
            cell.appendChild(noteGrid);
            
            // Number container element
            const valSpan = document.createElement('span');
            valSpan.className = 'num-span z-10';
            cell.appendChild(valSpan);
            
            sudokuGrid.appendChild(cell);
        }
    }
}

// Main rendering engine
function renderBoard() {
    const cells = sudokuGrid.children;
    const conflicts = getBoardConflicts(gridValues);
    
    const selVal = selectedCell ? gridValues[selectedCell.r][selectedCell.c] : 0;
    
    for (let i = 0; i < 81; i++) {
        const cell = cells[i];
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        const val = gridValues[r][c];
        const isGiven = initialValues[r][c] !== 0;
        const isHint = hintBoard[r][c];
        const noteGrid = cell.querySelector('.note-grid');
        const valSpan = cell.querySelector('.num-span');
        
        // Reset classes
        cell.className = 'sudoku-cell';
        
        // Base content and styling logic
        if (val !== 0) {
            valSpan.textContent = val;
            noteGrid.style.display = 'none'; // hide note grid if a number is present
            
            if (isGiven) {
                cell.classList.add('given');
            } else if (isHint) {
                cell.classList.add('hint');
            } else {
                cell.classList.add('user');
            }
        } else {
            valSpan.textContent = '';
            noteGrid.style.display = 'grid'; // show note grid for empty cell
            
            // Update individual note visibility
            const notes = pencilNotes[r][c];
            const noteCells = noteGrid.children;
            for (let n = 1; n <= 9; n++) {
                const noteCell = noteCells[n - 1];
                if (notes.has(n)) {
                    noteCell.classList.add('active');
                } else {
                    noteCell.classList.remove('active');
                }
            }
        }
        
        // Apply highlight styles
        if (selectedCell) {
            const inSameRow = (r === selectedCell.r);
            const inSameCol = (c === selectedCell.c);
            const inSameBox = (Math.floor(r / 3) === Math.floor(selectedCell.r / 3) &&
                               Math.floor(c / 3) === Math.floor(selectedCell.c / 3));
            
            if (r === selectedCell.r && c === selectedCell.c) {
                cell.classList.add('selected');
            } else if (inSameRow || inSameCol || inSameBox) {
                cell.classList.add('highlighted-peer');
            }
            
            // Same values highlighting
            if (val !== 0 && val === selVal && (r !== selectedCell.r || c !== selectedCell.c)) {
                cell.classList.add('same-value');
            }
        }
        
        // Remote Player Selection Highlight (Co-op)
        if (isMultiplayer && remoteSelectedCell && r === remoteSelectedCell.r && c === remoteSelectedCell.c) {
            cell.classList.add('remote-selected');
            cell.setAttribute('data-player-name', remoteUsername || 'Teman');
        } else {
            cell.removeAttribute('data-player-name');
        }
        
        // Validation conflict markers
        if (conflicts[r][c]) {
            cell.classList.add('error');
        }
    }
}

// Select cell coordinates
function selectCell(row, col) {
    selectedCell = { r: row, c: col };
    renderBoard();
    
    // Sync active selection/cursor
    if (isMultiplayer && activeConnection && activeConnection.open) {
        sendToPeer({ type: 'select', r: row, c: col });
    }

    // Auto-focus mobile input trigger if editable cell
    const trigger = document.getElementById('mobile-input-trigger');
    if (trigger) {
        if (initialValues[row][col] === 0 && !hintBoard[row][col]) {
            const cellIndex = row * 9 + col;
            const cellEl = sudokuGrid.children[cellIndex];
            if (cellEl) {
                cellEl.appendChild(trigger);
                setTimeout(() => {
                    trigger.focus();
                }, 10);
            }
        } else {
            if (document.activeElement === trigger) {
                trigger.blur();
            }
        }
    }
}

// Analyzes the current grid to identify duplicate values in rows, cols, and 3x3 box environments
function getBoardConflicts(board) {
    const conflicts = Array(9).fill(null).map(() => Array(9).fill(false));
    
    // Row check
    for (let r = 0; r < 9; r++) {
        const seen = {};
        for (let c = 0; c < 9; c++) {
            const val = board[r][c];
            if (val !== 0) {
                if (seen[val] !== undefined) {
                    conflicts[r][c] = true;
                    conflicts[r][seen[val]] = true;
                } else {
                    seen[val] = c;
                }
            }
        }
    }
    
    // Column check
    for (let c = 0; c < 9; c++) {
        const seen = {};
        for (let r = 0; r < 9; r++) {
            const val = board[r][c];
            if (val !== 0) {
                if (seen[val] !== undefined) {
                    conflicts[r][c] = true;
                    conflicts[seen[val]][c] = true;
                } else {
                    seen[val] = r;
                }
            }
        }
    }
    
    // 3x3 Box check
    for (let box = 0; box < 9; box++) {
        const seen = {};
        const startRow = Math.floor(box / 3) * 3;
        const startCol = (box % 3) * 3;
        
        for (let i = 0; i < 9; i++) {
            const r = startRow + Math.floor(i / 3);
            const c = startCol + (i % 3);
            const val = board[r][c];
            
            if (val !== 0) {
                if (seen[val] !== undefined) {
                    conflicts[r][c] = true;
                    const prevIdx = seen[val];
                    const prevRow = startRow + Math.floor(prevIdx / 3);
                    const prevCol = startCol + (prevIdx % 3);
                    conflicts[prevRow][prevCol] = true;
                } else {
                    seen[val] = i;
                }
            }
        }
    }
    
    return conflicts;
}

// --- CELL VALUE INPUT CONTROLS ---

// Virtual/Keyboard Entry handler
function inputNumber(num) {
    if (!isGameActive || !selectedCell) return;
    
    const { r, c } = selectedCell;
    
    // Cannot modify initial puzzle numbers or hints
    if (initialValues[r][c] !== 0 || hintBoard[r][c]) return;
    
    if (notesModeActive) {
        // Toggle note
        if (gridValues[r][c] === 0) { // Only note empty cells
            const notes = pencilNotes[r][c];
            if (notes.has(num)) {
                notes.delete(num);
            } else {
                notes.add(num);
            }
            
            // Sync note modification
            if (isMultiplayer && activeConnection && activeConnection.open) {
                sendToPeer({
                    type: 'edit',
                    r, c,
                    isNote: true,
                    noteVal: num,
                    notes: [...notes]
                });
            }
        }
    } else {
        // Solid Value Mode
        if (gridValues[r][c] === num) {
            gridValues[r][c] = 0; // Deselect same number to clear it
        } else {
            gridValues[r][c] = num;
            pencilNotes[r][c].clear(); // Clear all note values for this cell
            
            // Auto clean notes of same value in row, column, and box
            cleanIntersectingNotes(r, c, num);
            
            // Check mistakes
            if (num !== solutionValues[r][c]) {
                mistakesCount++;
                updateMistakesUI();
                
                if (mistakesCount >= 3) {
                    handleGameOver();
                    return;
                }
            }
        }
        
        // Sync solid value edit
        if (isMultiplayer && activeConnection && activeConnection.open) {
            sendToPeer({
                type: 'edit',
                r, c,
                val: gridValues[r][c],
                isNote: false,
                clearNotes: true
            });
        }
    }
    
    renderBoard();
    saveGameProgress();
    
    // Check solve state
    if (!notesModeActive && checkWinCondition()) {
        handleWin();
    }
}

// Erases contents of selected cell
function eraseSelectedCell() {
    if (!isGameActive || !selectedCell) return;
    
    const { r, c } = selectedCell;
    if (initialValues[r][c] !== 0 || hintBoard[r][c]) return; // cannot erase given or hint values
    
    gridValues[r][c] = 0;
    hintBoard[r][c] = false;
    pencilNotes[r][c].clear();
    
    renderBoard();
    saveGameProgress();
    
    // Sync eraser
    if (isMultiplayer && activeConnection && activeConnection.open) {
        sendToPeer({
            type: 'edit',
            r, c,
            val: 0,
            isNote: false,
            clearNotes: true
        });
    }
}

// Removes a specific note number from intersecting lines/squares when a cell is filled
function cleanIntersectingNotes(row, col, value) {
    // Clean row and column notes
    for (let i = 0; i < 9; i++) {
        pencilNotes[row][i].delete(value);
        pencilNotes[i][col].delete(value);
    }
    
    // Clean 3x3 subgrid notes
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            pencilNotes[startRow + r][startCol + c].delete(value);
        }
    }
}

// Toggle notes pencil write state
function toggleNotesMode() {
    notesModeActive = !notesModeActive;
    
    if (notesModeActive) {
        btnNotes.classList.add('bg-gray-700', 'border-amber-500/50');
        notesBadge.classList.remove('hidden');
    } else {
        btnNotes.classList.remove('bg-gray-700', 'border-amber-500/50');
        notesBadge.classList.add('hidden');
    }
}

// Provides correct solution value for selected cell
function handleHint() {
    if (!isGameActive) return;
    if (hintsRemaining <= 0) return;
    
    // Gather candidates: priority 1 is empty cells, priority 2 is incorrect user entries
    const emptyCandidates = [];
    const incorrectCandidates = [];
    
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (gridValues[r][c] === 0) {
                emptyCandidates.push({ r, c });
            } else if (gridValues[r][c] !== solutionValues[r][c] && initialValues[r][c] === 0) {
                incorrectCandidates.push({ r, c });
            }
        }
    }
    
    let targetCell = null;
    if (emptyCandidates.length > 0) {
        targetCell = emptyCandidates[Math.floor(Math.random() * emptyCandidates.length)];
    } else if (incorrectCandidates.length > 0) {
        targetCell = incorrectCandidates[Math.floor(Math.random() * incorrectCandidates.length)];
    }
    
    if (!targetCell) return; // No empty or wrong cells left
    
    const { r, c } = targetCell;
    
    hintsRemaining--;
    updateHintButtonUI();
    
    const correctVal = solutionValues[r][c];
    gridValues[r][c] = correctVal;
    hintBoard[r][c] = true;
    pencilNotes[r][c].clear();
    
    cleanIntersectingNotes(r, c, correctVal);
    renderBoard();
    saveGameProgress();
    
    // Sync hint placement
    if (isMultiplayer && activeConnection && activeConnection.open) {
        sendToPeer({
            type: 'edit',
            r, c,
            val: correctVal,
            isNote: false,
            isHint: true,
            clearNotes: true
        });
    }
    
    if (checkWinCondition()) {
        handleWin();
    }
}



// --- GAME TIMER & RECORDS ---

function startTimer() {
    timerInterval = setInterval(() => {
        secondsElapsed++;
        timerDisplay.textContent = formatTime(secondsElapsed);
        
        saveGameProgress();

        // Sync authoritative clock seconds from Host to Guest
        if (isMultiplayer && isHost && activeConnection && activeConnection.open) {
            sendToPeer({ type: 'timer', secondsElapsed });
        }
    }, 1000);
}

function pauseTimer() {
    clearInterval(timerInterval);
}

function resumeTimer() {
    if (isGameActive) {
        clearInterval(timerInterval);
        startTimer();
    }
}

function resetTimer() {
    clearInterval(timerInterval);
    secondsElapsed = 0;
    timerDisplay.textContent = '00:00';
}

function formatTime(seconds) {
    const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
    const ss = (seconds % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
}

// Load and show records
function loadBestTime() {
    const best = localStorage.getItem(`logica_best_${gameDifficulty}`);
    if (best) {
        bestTimeDisplay.textContent = formatTime(parseInt(best));
    } else {
        bestTimeDisplay.textContent = '-';
    }
}

function updateGlobalBestTimeHeader() {
    const difficulties = ['easy', 'medium', 'hard', 'expert'];
    let bestTime = Infinity;
    let bestDiff = null;
    
    for (let diff of difficulties) {
        const stored = localStorage.getItem(`logica_best_${diff}`);
        if (stored) {
            const seconds = parseInt(stored);
            if (seconds < bestTime) {
                bestTime = seconds;
                bestDiff = diff;
            }
        }
    }
    
    if (bestDiff) {
        globalBestTime.textContent = `${formatTime(bestTime)} (${bestDiff.toUpperCase()})`;
    } else {
        globalBestTime.textContent = '-';
    }
}

// --- KEYBOARD LISTENERS & WIN ENGINE ---

function setupKeyboardListeners() {
    document.addEventListener('keydown', (e) => {
        // Ignore game shortcuts if typing in any input field (except the mobile hidden trigger input)
        if ((e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') && e.target.id !== 'mobile-input-trigger') {
            return;
        }

        // Stop if not in gameplay screen
        if (gameView.classList.contains('hidden')) return;
        if (!selectedCell) return;
        
        // Disable arrow key scrolling in browser
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
            e.preventDefault();
        }
        
        // 1-9 inputs
        if (e.key >= '1' && e.key <= '9') {
            e.preventDefault();
            inputNumber(parseInt(e.key));
            return;
        }
        
        // Erasing inputs
        if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            eraseSelectedCell();
            return;
        }
        
        // Toggle Notes Mode
        if (e.key === 'n' || e.key === 'N') {
            e.preventDefault();
            toggleNotesMode();
            return;
        }
        
        // Grid arrow movements
        let { r, c } = selectedCell;
        if (e.key === 'ArrowUp') {
            r = Math.max(0, r - 1);
            selectCell(r, c);
        } else if (e.key === 'ArrowDown') {
            r = Math.min(8, r + 1);
            selectCell(r, c);
        } else if (e.key === 'ArrowLeft') {
            c = Math.max(0, c - 1);
            selectCell(r, c);
        } else if (e.key === 'ArrowRight') {
            c = Math.min(8, c + 1);
            selectCell(r, c);
        }
    });
}

function checkWinCondition() {
    // 1. Check if board is fully filled
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (gridValues[r][c] === 0) return false;
        }
    }
    
    // 2. Check conflicts
    const conflicts = getBoardConflicts(gridValues);
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (conflicts[r][c]) return false;
        }
    }
    
    // 3. Match solution
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (gridValues[r][c] !== solutionValues[r][c]) return false;
        }
    }
    
    return true;
}

function handleWin(fromPeer = false) {
    pauseTimer();
    isGameActive = false;
    clearGameProgress();
    
    // Check and save local records
    const bestRecord = localStorage.getItem(`logica_best_${gameDifficulty}`);
    let isNewRecord = false;
    
    if (!bestRecord || secondsElapsed < parseInt(bestRecord)) {
        localStorage.setItem(`logica_best_${gameDifficulty}`, secondsElapsed.toString());
        isNewRecord = true;
    }
    
    // Setup modal text
    winDifficulty.textContent = gameDifficulty;
    winTime.textContent = formatTime(secondsElapsed);
    
    if (isNewRecord) {
        newRecordBanner.classList.remove('hidden');
    } else {
        newRecordBanner.classList.add('hidden');
    }
    
    // Open Win Modal
    openModal(winModal);

    // Sync Win status to peer
    if (!fromPeer && isMultiplayer && activeConnection && activeConnection.open) {
        sendToPeer({ type: 'win', secondsElapsed });
    }
}

function hideWinModal() {
    closeModal(winModal);
}

// --- MULTIPLAYER P2P (WEBRTC PEERJS) LOGIC ---

// Updates connection state visual badges
function setConnectionStatus(status, text) {
    const badge = document.getElementById('connection-status-badge');
    const dot = document.getElementById('connection-status-dot');
    const statusText = document.getElementById('connection-status-text');
    
    badge.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold shadow-inner transition-colors duration-300';
    
    if (status === 'solo') {
        badge.classList.add('bg-gray-800/80', 'border-gray-700', 'text-gray-400');
        dot.className = 'w-1.5 h-1.5 rounded-full bg-gray-500';
        statusText.textContent = text || 'Mode Solo';
    } else if (status === 'connecting') {
        badge.classList.add('bg-amber-500/10', 'border-amber-500/20', 'text-amber-400');
        dot.className = 'w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse';
        statusText.textContent = text || 'Menghubungkan...';
    } else if (status === 'connected') {
        badge.classList.add('bg-emerald-500/10', 'border-emerald-500/20', 'text-emerald-400');
        dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping';
        statusText.textContent = text || 'Terhubung';
    } else if (status === 'waiting') {
        badge.classList.add('bg-indigo-500/10', 'border-indigo-500/20', 'text-indigo-400');
        dot.className = 'w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse';
        statusText.textContent = text || 'Menunggu Teman...';
    } else if (status === 'error') {
        badge.classList.add('bg-rose-500/10', 'border-rose-500/20', 'text-rose-400');
        dot.className = 'w-1.5 h-1.5 rounded-full bg-rose-500';
        statusText.textContent = text || 'Gagal terhubung';
    }
}

// Check URL query parameters for ?room=xxxx
function checkRoomParameter() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
        let hostId = roomParam;
        if (!hostId.startsWith('logicall-')) {
            hostId = 'logicall-' + hostId;
        }
        connectToMultiplayerRoom(hostId);
    }
}

// Send JSON data to peer
function sendToPeer(data) {
    if (activeConnection && activeConnection.open) {
        activeConnection.send(data);
    }
}

// Host Room creation
function createMultiplayerRoom() {
    if (typeof Peer === 'undefined') {
        alert("Gagal memuat sistem multiplayer. Periksa koneksi internet Anda.");
        return;
    }
    
    const btnCreate = document.getElementById('btn-create-room');
    btnCreate.disabled = true;
    btnCreate.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Membuka Room...';
    
    setConnectionStatus('connecting', 'Membuka room...');
    
    const roomCode = generateShortCode();
    const peerId = 'logicall-' + roomCode;
    
    // Initialize host Peer
    peerInstance = new Peer(peerId);
    
    peerInstance.on('open', (id) => {
        isMultiplayer = true;
        isHost = true;
        
        // Hide create and join buttons, show room info
        btnCreate.classList.add('hidden');
        document.getElementById('join-room-area').classList.add('hidden');
        document.getElementById('room-info-area').classList.remove('hidden');
        document.getElementById('room-info-label').textContent = 'Kode Room Anda:';
        document.getElementById('player-role-badge').classList.remove('hidden');
        document.getElementById('player-role-badge').textContent = 'HOST';
        
        document.getElementById('share-link-input').value = roomCode;
        
        setConnectionStatus('waiting', 'Menunggu teman bergabung...');
        
        // Automatically open the Sudoku gameplay view
        enterSudokuGame();
    });
    
    peerInstance.on('connection', (conn) => {
        activeConnection = conn;
        setupConnectionEvents(conn);
    });
    
    peerInstance.on('error', (err) => {
        console.error(err);
        if (err.type === 'unavailable-id') {
            createMultiplayerRoom();
            return;
        }
        setConnectionStatus('error', 'Peer error');
        btnCreate.disabled = false;
        btnCreate.innerHTML = '<i class="fa-solid fa-users text-brandPurple"></i> Buat Room Co-op';
    });
}

// Guest Room join
function connectToMultiplayerRoom(hostId) {
    if (typeof Peer === 'undefined') {
        alert("Gagal memuat sistem multiplayer. Periksa koneksi internet Anda.");
        return;
    }
    
    setConnectionStatus('connecting', 'Membuka koneksi...');
    
    // Go directly to gameplay view
    enterSudokuGame();
    
    // Show role and hide create and join buttons, show info
    document.getElementById('btn-create-room').classList.add('hidden');
    document.getElementById('join-room-area').classList.add('hidden');
    document.getElementById('room-info-area').classList.remove('hidden');
    document.getElementById('room-info-label').textContent = 'Terhubung ke Room:';
    
    // Extract short code from hostId (removing 'logicall-' prefix if present)
    const displayCode = hostId.startsWith('logicall-') ? hostId.replace('logicall-', '') : hostId;
    document.getElementById('share-link-input').value = displayCode;
    
    document.getElementById('player-role-badge').classList.remove('hidden');
    document.getElementById('player-role-badge').textContent = 'TAMU';
    
    // Disable controls for Guest that only Host should own
    document.getElementById('difficulty-select').disabled = true;
    document.getElementById('btn-new-game').disabled = true;
    document.getElementById('btn-new-game').classList.add('opacity-50', 'pointer-events-none');
    
    // Disable reset game button for Guest
    const btnReset = document.getElementById('btn-reset-board');
    if (btnReset) {
        btnReset.disabled = true;
        btnReset.classList.add('opacity-50', 'pointer-events-none');
    }
    
    // Initialize client Peer
    peerInstance = new Peer();
    
    peerInstance.on('open', (id) => {
        const conn = peerInstance.connect(hostId);
        activeConnection = conn;
        setupConnectionEvents(conn);
    });
    
    peerInstance.on('error', (err) => {
        console.error(err);
        setConnectionStatus('error', 'Koneksi gagal');
    });
}

// Shared connection events setup
function setupConnectionEvents(conn) {
    function onConnectionOpened() {
        isMultiplayer = true;
        setConnectionStatus('connected', 'Terhubung (Multiplayer)');
        
        // Disable reset game button for Guest, ensure Host is enabled
        const btnReset = document.getElementById('btn-reset-board');
        if (btnReset) {
            if (!isHost) {
                btnReset.disabled = true;
                btnReset.classList.add('opacity-50', 'pointer-events-none');
            } else {
                btnReset.disabled = false;
                btnReset.classList.remove('opacity-50', 'pointer-events-none');
            }
        }
        
        // Instantly swap username with Peer
        sendToPeer({ type: 'username', username: myUsername });
        updatePlayerListUI();
        
        if (isHost) {
            // Host sends current board state to Guest
            sendToPeer({
                type: 'init',
                gridValues,
                initialValues,
                solutionValues,
                hintBoard,
                pencilNotes: pencilNotes.map(row => row.map(cellSet => [...cellSet])),
                gameDifficulty,
                secondsElapsed,
                hintsRemaining,
                mistakesCount
            });
        }
    }

    if (conn.open) {
        onConnectionOpened();
    } else {
        conn.on('open', onConnectionOpened);
    }
    
    conn.on('data', (data) => {
        handleIncomingData(data);
    });
    
    conn.on('close', () => {
        isMultiplayer = false;
        remoteUsername = '';
        remoteSelectedCell = null;
        
        if (wasKickedByHost) {
            setConnectionStatus('solo', 'Dikeluarkan oleh Host');
            wasKickedByHost = false; // Reset flag
        } else {
            setConnectionStatus('solo', 'Teman terputus');
        }
        updatePlayerListUI();
        
        // Show create and join buttons again, hide room info
        document.getElementById('btn-create-room').classList.remove('hidden');
        document.getElementById('join-room-area').classList.remove('hidden');
        document.getElementById('room-info-area').classList.add('hidden');
        
        // Re-enable Guest controls in case they are playing solo now
        document.getElementById('difficulty-select').disabled = false;
        document.getElementById('btn-new-game').disabled = false;
        document.getElementById('btn-new-game').classList.remove('opacity-50', 'pointer-events-none');
        
        const btnReset = document.getElementById('btn-reset-board');
        if (btnReset) {
            btnReset.disabled = false;
            btnReset.classList.remove('opacity-50', 'pointer-events-none');
        }
    });
    
    conn.on('error', (err) => {
        console.error(err);
        setConnectionStatus('error', 'Kesalahan koneksi');
    });
}

// Handle incoming remote edits/sync messages
function handleIncomingData(data) {
    if (data.type === 'init') {
        gridValues = data.gridValues;
        initialValues = data.initialValues;
        solutionValues = data.solutionValues;
        hintBoard = data.hintBoard;
        pencilNotes = data.pencilNotes.map(row => row.map(arr => new Set(arr)));
        gameDifficulty = data.gameDifficulty;
        secondsElapsed = data.secondsElapsed;
        
        hintsRemaining = data.hintsRemaining !== undefined ? data.hintsRemaining : 6;
        updateHintButtonUI();
        
        mistakesCount = data.mistakesCount !== undefined ? data.mistakesCount : 0;
        updateMistakesUI();
        
        // Set difficulty select UI
        difficultySelect.value = gameDifficulty;
        isGameActive = true;
        
        // Start Guest local clock prediction
        resetTimer();
        secondsElapsed = data.secondsElapsed;
        startTimer();
        
        renderBoard();
    }
    
    else if (data.type === 'edit') {
        const { r, c } = data;
        if (data.isNote) {
            // Sync notes
            pencilNotes[r][c] = new Set(data.notes);
        } else {
            // Sync solid value
            gridValues[r][c] = data.val;
            if (data.clearNotes) pencilNotes[r][c].clear();
            if (data.isHint) {
                hintBoard[r][c] = true;
                hintsRemaining--;
                updateHintButtonUI();
            }
            
            // Clean intersecting notes locally
            if (data.val !== 0) {
                cleanIntersectingNotes(r, c, data.val);
                
                // Check mistakes locally on peer
                if (data.val !== solutionValues[r][c] && !data.isHint) {
                    mistakesCount++;
                    updateMistakesUI();
                    if (mistakesCount >= 3) {
                        handleGameOver();
                    }
                }
            }
        }
        renderBoard();
    }
    
    else if (data.type === 'kick') {
        wasKickedByHost = true;
        alert("Anda telah dikeluarkan dari room oleh Host.");
        if (activeConnection) {
            activeConnection.close();
        }
    }
    
    else if (data.type === 'select') {
        remoteSelectedCell = { r: data.r, c: data.c };
        renderBoard();
    }
    
    else if (data.type === 'username') {
        remoteUsername = data.username;
        updatePlayerListUI();
        renderBoard();
    }
    
    else if (data.type === 'timer') {
        // Correct clock drift from Host authoritative source
        secondsElapsed = data.secondsElapsed;
        timerDisplay.textContent = formatTime(secondsElapsed);
    }
    
    else if (data.type === 'new-game') {
        gridValues = data.gridValues;
        initialValues = data.initialValues;
        solutionValues = data.solutionValues;
        gameDifficulty = data.gameDifficulty;
        
        hideAllGameModals();
        hintBoard = Array(9).fill(null).map(() => Array(9).fill(false));
        pencilNotes = Array(9).fill(null).map(() => Array(9).fill(null).map(() => new Set()));
        
        if (gameDifficulty === 'easy') maxHints = 8;
        else if (gameDifficulty === 'medium') maxHints = 6;
        else if (gameDifficulty === 'hard') maxHints = 4;
        else maxHints = 3;
        hintsRemaining = maxHints;
        updateHintButtonUI();
        
        mistakesCount = 0;
        updateMistakesUI();
        
        difficultySelect.value = gameDifficulty;
        isGameActive = true;
        
        resetTimer();
        startTimer();
        renderBoard();
        
        setConnectionStatus('connected', 'Terhubung (Multiplayer)');
    }
    
    else if (data.type === 'undo-redo') {
        gridValues = data.grid;
        pencilNotes = data.notes.map(row => row.map(arr => new Set(arr)));
        hintBoard = data.hints;
        
        if (data.hintsRemaining !== undefined) {
            hintsRemaining = data.hintsRemaining;
            updateHintButtonUI();
        }
        
        if (data.mistakesCount !== undefined) {
            mistakesCount = data.mistakesCount;
            updateMistakesUI();
        }
        
        renderBoard();
    }
    
    else if (data.type === 'close-room') {
        alert("Host telah menutup room.");
        if (activeConnection) {
            activeConnection.close();
        }
    }
    
    else if (data.type === 'game-over') {
        handleGameOver(true);
    }
    
    else if (data.type === 'request-new-game') {
        if (isHost) {
            initNewGame();
        }
    }
    
    else if (data.type === 'win') {
        secondsElapsed = data.secondsElapsed;
        handleWin(true);
    }
}

// Copy link function
function copyShareLink() {
    const input = document.getElementById('share-link-input');
    input.select();
    input.setSelectionRange(0, 99999);
    
    navigator.clipboard.writeText(input.value).then(() => {
        const btn = document.getElementById('btn-copy-link');
        btn.textContent = 'Tersalin!';
        btn.classList.replace('bg-brandPurple', 'bg-emerald-600');
        
        setTimeout(() => {
            btn.textContent = 'Salin';
            btn.classList.replace('bg-emerald-600', 'bg-brandPurple');
        }, 2000);
    }).catch(err => {
        console.error('Gagal menyalin tautan: ', err);
    });
}

// Change username function
function changeUsername(val) {
    const sanitized = val.trim();
    if (!sanitized) return;
    
    myUsername = sanitized;
    localStorage.setItem('logicall_username', myUsername);
    
    // Sync with peer
    if (isMultiplayer && activeConnection && activeConnection.open) {
        sendToPeer({ type: 'username', username: myUsername });
    }
    
    updatePlayerListUI();
}

// Update Active Player List UI
function updatePlayerListUI() {
    const listArea = document.getElementById('player-list-area');
    const container = document.getElementById('player-list-container');
    
    if (!isMultiplayer) {
        listArea.classList.add('hidden');
        return;
    }
    
    listArea.classList.remove('hidden');
    container.innerHTML = '';
    
    // Me (Anda)
    const meDiv = document.createElement('div');
    meDiv.className = 'flex items-center justify-between bg-slate-900/60 p-2 rounded-lg border border-gray-800/80';
    meDiv.innerHTML = `
        <span class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-brandPurple animate-pulse"></span>
            <strong>${myUsername}</strong> <span class="text-[9px] text-gray-500 font-bold">(Anda)</span>
        </span>
        <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-brandPurple/20 text-brandPurple border border-brandPurple/30 uppercase">${isHost ? 'Host' : 'Tamu'}</span>
    `;
    container.appendChild(meDiv);
    
    // Peer (Teman)
    const peerDiv = document.createElement('div');
    peerDiv.className = 'flex items-center justify-between bg-slate-900/60 p-2 rounded-lg border border-gray-800/80';
    
    let actionHtml = `<span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">${isHost ? 'Tamu' : 'Host'}</span>`;
    if (isHost) {
        actionHtml = `
            <div class="flex items-center gap-2">
                <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">Tamu</span>
                <button onclick="kickGuest()" class="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[9px] font-bold transition flex items-center gap-1">
                    <i class="fa-solid fa-user-minus"></i> Kick
                </button>
            </div>
        `;
    }
    
    peerDiv.innerHTML = `
        <span class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <strong>${remoteUsername || (isHost ? 'Tamu' : 'Host')}</strong>
        </span>
        ${actionHtml}
    `;
    container.appendChild(peerDiv);

    // Update leave room button text dynamically
    const btnLeave = document.getElementById('btn-leave-room');
    if (btnLeave) {
        if (isHost) {
            btnLeave.innerHTML = '<i class="fa-solid fa-rectangle-xmark"></i> Tutup Room';
        } else {
            btnLeave.innerHTML = '<i class="fa-solid fa-arrow-right-from-bracket"></i> Keluar Room';
        }
    }
}

// --- NEW HELPERS FOR HINTS, KICK, NATIVE MOBILE INPUT & AUTO-RECOVERY ---

function updateHintButtonUI() {
    const btnHint = document.getElementById('btn-hint');
    if (!btnHint) return;
    const textSpan = btnHint.querySelector('span');
    if (textSpan) {
        textSpan.textContent = `Hint (${hintsRemaining})`;
    }
    if (hintsRemaining <= 0) {
        btnHint.disabled = true;
        btnHint.classList.add('opacity-50', 'pointer-events-none');
    } else {
        btnHint.disabled = false;
        btnHint.classList.remove('opacity-50', 'pointer-events-none');
    }
}

function kickGuest() {
    if (!isHost || !activeConnection) return;
    
    if (confirm(`Apakah Anda yakin ingin mengeluarkan ${remoteUsername || 'Tamu'} dari room?`)) {
        sendToPeer({ type: 'kick' });
        setTimeout(() => {
            if (activeConnection) {
                activeConnection.close();
            }
        }, 100);
    }
}

function setupMobileInputTrigger() {
    const trigger = document.getElementById('mobile-input-trigger');
    if (!trigger) return;
    
    trigger.value = '0';
    
    trigger.addEventListener('input', (e) => {
        if (!selectedCell || !isGameActive) return;
        const { r, c } = selectedCell;
        if (initialValues[r][c] !== 0 || hintBoard[r][c]) return;
        
        const val = trigger.value;
        if (val === '') {
            eraseSelectedCell();
            trigger.value = '0';
        } else {
            const digits = val.replace(/0/g, '');
            if (digits.length > 0) {
                const lastDigit = parseInt(digits[digits.length - 1]);
                if (lastDigit >= 1 && lastDigit <= 9) {
                    inputNumber(lastDigit);
                }
            }
            trigger.value = '0';
        }
    });

    trigger.addEventListener('focus', () => {
        trigger.value = '0';
    });
}

function saveGameProgress() {
    if (isMultiplayer) return;
    if (!isGameActive) return;
    
    localStorage.setItem('logicall_sudoku_active_game', 'true');
    localStorage.setItem('logicall_sudoku_grid', JSON.stringify(gridValues));
    localStorage.setItem('logicall_sudoku_initial', JSON.stringify(initialValues));
    localStorage.setItem('logicall_sudoku_solution', JSON.stringify(solutionValues));
    localStorage.setItem('logicall_sudoku_hints_board', JSON.stringify(hintBoard));
    
    const serializedNotes = pencilNotes.map(row => row.map(cellSet => Array.from(cellSet)));
    localStorage.setItem('logicall_sudoku_notes', JSON.stringify(serializedNotes));
    
    localStorage.setItem('logicall_sudoku_difficulty', gameDifficulty);
    localStorage.setItem('logicall_sudoku_time', secondsElapsed.toString());
    localStorage.setItem('logicall_sudoku_hints_remaining', hintsRemaining.toString());
    localStorage.setItem('logicall_sudoku_mistakes', mistakesCount.toString());
    
    if (selectedCell) {
        localStorage.setItem('logicall_sudoku_selected_cell', JSON.stringify(selectedCell));
    }
}

function clearGameProgress() {
    localStorage.removeItem('logicall_sudoku_active_game');
    localStorage.removeItem('logicall_sudoku_grid');
    localStorage.removeItem('logicall_sudoku_initial');
    localStorage.removeItem('logicall_sudoku_solution');
    localStorage.removeItem('logicall_sudoku_hints_board');
    localStorage.removeItem('logicall_sudoku_notes');
    localStorage.removeItem('logicall_sudoku_difficulty');
    localStorage.removeItem('logicall_sudoku_time');
    localStorage.removeItem('logicall_sudoku_hints_remaining');
    localStorage.removeItem('logicall_sudoku_mistakes');
    localStorage.removeItem('logicall_sudoku_selected_cell');
}

function loadSavedGame() {
    try {
        gridValues = JSON.parse(localStorage.getItem('logicall_sudoku_grid'));
        initialValues = JSON.parse(localStorage.getItem('logicall_sudoku_initial'));
        solutionValues = JSON.parse(localStorage.getItem('logicall_sudoku_solution'));
        hintBoard = JSON.parse(localStorage.getItem('logicall_sudoku_hints_board'));
        
        const parsedNotes = JSON.parse(localStorage.getItem('logicall_sudoku_notes'));
        pencilNotes = parsedNotes.map(row => row.map(arr => new Set(arr)));
        
        gameDifficulty = localStorage.getItem('logicall_sudoku_difficulty') || 'medium';
        difficultySelect.value = gameDifficulty;
        
        secondsElapsed = parseInt(localStorage.getItem('logicall_sudoku_time')) || 0;
        
        const storedHints = localStorage.getItem('logicall_sudoku_hints_remaining');
        if (storedHints !== null) {
            hintsRemaining = parseInt(storedHints);
        } else {
            hintsRemaining = 6;
        }
        
        mistakesCount = parseInt(localStorage.getItem('logicall_sudoku_mistakes')) || 0;
        updateMistakesUI();
        
        if (gameDifficulty === 'easy') maxHints = 8;
        else if (gameDifficulty === 'medium') maxHints = 6;
        else if (gameDifficulty === 'hard') maxHints = 4;
        else maxHints = 3;
        
        const storedCell = localStorage.getItem('logicall_sudoku_selected_cell');
        if (storedCell) {
            selectedCell = JSON.parse(storedCell);
        } else {
            selectedCell = { r: 4, c: 4 };
        }
        
        isGameActive = true;
        
        updateHintButtonUI();
        loadBestTime();
        timerDisplay.textContent = formatTime(secondsElapsed);
        renderBoard();
    } catch (e) {
        console.error("Gagal memuat game tersimpan:", e);
        clearGameProgress();
    }
}

// --- ROOM CODE JOIN FLOW & GENERATOR ---

function generateShortCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function joinRoomByCode() {
    const input = document.getElementById('room-code-input');
    if (!input) return;
    
    const code = input.value.trim().toUpperCase();
    if (!code) {
        alert("Harap masukkan kode room terlebih dahulu!");
        return;
    }
    
    if (code.length !== 6) {
        alert("Kode room harus terdiri dari 6 karakter!");
        return;
    }
    
    const hostId = 'logicall-' + code;
    connectToMultiplayerRoom(hostId);
}

// --- NEW HELPERS FOR MISTAKES, ROOM CLOSURE & CLEANUP ---

function updateMistakesUI() {
    const el = document.getElementById('mistakes-display');
    if (el) {
        el.textContent = `${mistakesCount}/3`;
    }
}

function handleGameOver(fromPeer = false) {
    pauseTimer();
    isGameActive = false;
    clearGameProgress();
    
    // Open Game Over Modal
    openModal(gameOverModal);
    
    // Disable/Enable Coba Lagi button based on multiplayer role
    const btnRestart = document.getElementById('btn-game-over-restart');
    if (btnRestart) {
        if (isMultiplayer && !isHost) {
            btnRestart.disabled = true;
            btnRestart.textContent = 'Menunggu Host...';
            btnRestart.classList.add('opacity-50', 'pointer-events-none');
        } else {
            btnRestart.disabled = false;
            btnRestart.textContent = 'Coba Lagi';
            btnRestart.classList.remove('opacity-50', 'pointer-events-none');
        }
    }

    // Sync Game Over status to peer
    if (!fromPeer && isMultiplayer && activeConnection && activeConnection.open) {
        sendToPeer({ type: 'game-over' });
    }
}

function hideGameOverModal() {
    closeModal(gameOverModal);
}

function leaveOrDestroyRoom() {
    if (!isMultiplayer) return;
    
    const confirmMsg = isHost 
        ? "Apakah Anda yakin ingin menutup room multiplayer ini? Koneksi dengan teman Anda akan terputus."
        : "Apakah Anda yakin ingin keluar dari room multiplayer ini?";
        
    if (confirm(confirmMsg)) {
        if (isHost) {
            sendToPeer({ type: 'close-room' });
            setTimeout(() => {
                cleanupMultiplayerSession();
            }, 100);
        } else {
            cleanupMultiplayerSession();
        }
    }
}

function cleanupMultiplayerSession() {
    if (activeConnection) {
        activeConnection.close();
        activeConnection = null;
    }
    if (peerInstance) {
        peerInstance.destroy();
        peerInstance = null;
    }
    
    isMultiplayer = false;
    isHost = false;
    remoteUsername = '';
    remoteSelectedCell = null;
    
    setConnectionStatus('solo', 'Keluar dari room');
    updatePlayerListUI();
    
    // Show create and join buttons again, hide room info
    const btnCreate = document.getElementById('btn-create-room');
    if (btnCreate) {
        btnCreate.disabled = false;
        btnCreate.innerHTML = '<i class="fa-solid fa-plus"></i> Buat Room Co-op';
        btnCreate.classList.remove('hidden');
    }
    document.getElementById('join-room-area').classList.remove('hidden');
    document.getElementById('room-info-area').classList.add('hidden');
    
    // Re-enable Guest controls in case they are playing solo now
    document.getElementById('difficulty-select').disabled = false;
    document.getElementById('btn-new-game').disabled = false;
    document.getElementById('btn-new-game').classList.remove('opacity-50', 'pointer-events-none');
    
    const btnReset = document.getElementById('btn-reset-board');
    if (btnReset) {
        btnReset.disabled = false;
        btnReset.classList.remove('opacity-50', 'pointer-events-none');
    }
}

// --- NEW HELPERS FOR NEW GAME REQUESTS, MODAL CLEARANCE & HARD RELOAD ---

function hideAllGameModals() {
    hideWinModal();
    hideGameOverModal();
}

function requestNewGameFromModal() {
    hideAllGameModals();
    if (isMultiplayer && !isHost) {
        // Guest requests Host to start new game
        sendToPeer({ type: 'request-new-game' });
        setConnectionStatus('connecting', 'Meminta game baru...');
    } else {
        // Solo or Host can initialize new game directly
        initNewGame();
    }
}

function triggerHardReload() {
    if (confirm("Apakah Anda yakin ingin melakukan Reset Total? Ini akan menghapus progres game aktif dan memuat ulang halaman secara bersih.")) {
        clearGameProgress();
        localStorage.removeItem('logicall_active_view');
        window.location.href = window.location.origin + window.location.pathname;
    }
}
