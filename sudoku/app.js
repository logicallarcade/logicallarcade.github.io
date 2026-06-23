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

// --- MULTIPLAYER STATE (SUPABASE) ---
const SUPABASE_URL = 'https://xoopahkzmfibfnxzmqfk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_pSbbyCzo8R0oPeyK_xwGtg_C81049id';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let isMultiplayer = false;
let isHost = false;
let roomMinPlayers = 2;
let roomMaxPlayers = 5;
let roomChannel = null;
let roomCode = "";
let lobbyChannel = null;
let isSharedToLobby = false;
const myClientId = Math.random().toString(36).substring(2);

let activeConnection = null;
let remoteSelectedCell = null;
let peerInstance = null;
let myUsername = 'Pemain 1';
let remoteUsername = '';
let roomPlayers = [];
let remoteSelectedCells = {};
let seenClientIds = new Set();

// --- DOM ELEMENTS ---
const menuView = document.getElementById('menu-view');
const gameView = document.getElementById('game-view');
const timerDisplay = document.getElementById('timer-display');
const bestTimeDisplay = document.getElementById('best-time-display');
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
    
    // Standalone Sudoku: Always force game view visible
    menuView.classList.add('hidden', 'hidden-fade');
    menuView.classList.remove('visible-fade');
    gameView.classList.remove('hidden', 'hidden-fade');
    gameView.classList.add('visible-fade');
    
    // Restoring saved game if not joining room
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (!roomParam) {
        const activeGame = localStorage.getItem('logicall_sudoku_active_game');
        if (activeGame === 'true') {
            loadSavedGame();
            
            // Resume timer if active
            resumeTimer();
            if (selectedCell) {
                selectCell(selectedCell.r, selectedCell.c);
            }
        } else {
            // No active game, initialize new game directly
            initNewGame();
        }
    }
    
    checkRoomParameter();
});

// Auto-join from lobby URL param (?room=XXXX)
function checkRoomParameter() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
        const code = roomParam.trim().toUpperCase();
        const input = document.getElementById('room-code-input');
        if (input) input.value = code;
        setTimeout(() => joinRoomByCode(), 400);
    }
}

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
    hideAllGameModals();
    
    if (isMultiplayer) {
        if (isHost) {
            sendToPeer({ type: 'close-room' });
            setTimeout(() => {
                cleanupMultiplayerSession();
                window.location.href = '../';
            }, 200); // Beri jeda 200ms agar pesan close-room terkirim ke Supabase
        } else {
            cleanupMultiplayerSession();
            window.location.href = '../';
        }
    } else {
        window.location.href = '../';
    }
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
    Swal.fire({
        background: '#0f1623', color: '#e5e7eb', confirmButtonColor: '#8b5cf6',
        title: '<i class="fa-solid fa-circle-info" style="color:#8b5cf6;margin-right:6px"></i>Tentang Logicall',
        html: `
            <div style="text-align:left;font-size:0.82rem;color:#9ca3af;line-height:1.8">
                <p><strong style="color:#fff">Logicall</strong> adalah portal game asah otak minimalis modern, terinspirasi dari konsep Friv Grid klasik.</p>
                <p style="margin-top:10px">Mainkan <strong style="color:#a78bfa">Sudoku Pro</strong> dan <strong style="color:#10b981">Wordle Indonesia</strong> secara solo atau multiplayer bersama teman secara realtime.</p>
            </div>`,
        confirmButtonText: 'Mengerti',
        width: 400,
    });
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
        Swal.fire({
            background: '#0f1623', color: '#e5e7eb', confirmButtonColor: '#8b5cf6',
            title: 'Hanya Host', html: 'Hanya Host yang bisa memulai game baru!',
            icon: 'warning', iconColor: '#f59e0b', confirmButtonText: 'OK',
        });
        return;
    }

    const btnNewGame = document.getElementById('btn-new-game');
    if (btnNewGame) {
        btnNewGame.disabled = true;
        btnNewGame.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Game Baru';
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

    if (btnNewGame) {
        btnNewGame.disabled = false;
        btnNewGame.innerHTML = '<i class="fa-solid fa-plus"></i> Game Baru';
    }
}

function resetBoard() {
    if (!isGameActive) return;
    if (isMultiplayer && !isHost) {
        Swal.fire({
            background: '#0f1623', color: '#e5e7eb', confirmButtonColor: '#8b5cf6',
            title: 'Hanya Host', html: 'Hanya Host yang bisa me-reset game!',
            icon: 'warning', iconColor: '#f59e0b', confirmButtonText: 'OK',
        });
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
        let remotePlayerCell = null;
        for (let cid in remoteSelectedCells) {
            const sel = remoteSelectedCells[cid];
            if (sel.r === r && sel.c === c) {
                remotePlayerCell = sel;
                break; // Show the first one we find on this cell
            }
        }

        if (isMultiplayer && remotePlayerCell) {
            cell.classList.add('remote-selected');
            cell.setAttribute('data-player-name', remotePlayerCell.username || 'Teman');
        } else {
            cell.classList.remove('remote-selected');
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
        sendToPeer({ type: 'select', r: row, c: col, clientId: myClientId, username: myUsername });
    }

    // Auto-focus mobile input trigger if editable cell (removed to prevent virtual keyboard popup on mobile)
    /*
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
    */
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

// --- MULTIPLAYER P2P (SUPABASE REALTIME) LOGIC ---

// Updates connection state visual badges
function setConnectionStatus(status, text) {
    const badge = document.getElementById('connection-status-badge');
    const dot = document.getElementById('connection-status-dot');
    const statusText = document.getElementById('connection-status-text');
    
    badge.className = 'flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold shadow-inner transition-colors duration-300 h-[38px] w-full';
    
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
        connectToMultiplayerRoom(roomParam);
    }
}

// Send JSON data to peer using Supabase Broadcast
function sendToPeer(data) {
    if (roomChannel) {
        roomChannel.send({
            type: 'broadcast',
            event: 'game-event',
            payload: data
        });
    }
}

// Set up Supabase Realtime Channel (Broadcast & Presence)
function setupSupabaseChannel(code) {
    roomCode = code;
    if (roomChannel) {
        roomChannel.unsubscribe();
    }
    
    roomChannel = supabaseClient.channel('room-' + roomCode);
    
    // Listen for broadcast events
    roomChannel.on('broadcast', { event: 'game-event' }, ({ payload }) => {
        handleIncomingData(payload);
    });
    
    // Listen for presence events
    roomChannel.on('presence', { event: 'sync' }, () => {
        const state = roomChannel.presenceState();
        
        // --- 5-PLAYER CAPACITY LIMIT CHECK ---
        const players = [];
        Object.keys(state).forEach(key => {
            const presences = state[key];
            presences.forEach(p => {
                players.push(p);
            });
        });

        // Sort: HOST first, then Guests chronologically
        players.sort((a, b) => {
            if (a.role === 'HOST' && b.role !== 'HOST') return -1;
            if (a.role !== 'HOST' && b.role === 'HOST') return 1;
            
            const timeA = a.online_at ? new Date(a.online_at).getTime() : Date.now();
            const timeB = b.online_at ? new Date(b.online_at).getTime() : Date.now();
            return timeA - timeB;
        });

        const hostPresence = players.find(p => p.role === 'HOST');
        const currentMaxPlayers = hostPresence && hostPresence.maxPlayers ? hostPresence.maxPlayers : (isHost ? roomMaxPlayers : 5);
        const currentMinPlayers = hostPresence && hostPresence.minPlayers ? hostPresence.minPlayers : (isHost ? roomMinPlayers : 2);

        const isMeTracked = players.some(p => p.clientId === myClientId);
        if (!isMeTracked) {
            if (players.length >= currentMaxPlayers) {
                Swal.fire({
                    background: '#0f1623', color: '#e5e7eb', confirmButtonColor: '#ef4444',
                    title: 'Room Penuh!', html: `Room ini sudah penuh (maksimal ${currentMaxPlayers} pemain).`,
                    icon: 'error', iconColor: '#ef4444', confirmButtonText: 'OK',
                }).then(() => { cleanupMultiplayerSession(); backToMenu(); });
                return;
            }
            
            // Track ourselves
            roomChannel.track({
                clientId: myClientId,
                username: myUsername,
                role: isHost ? 'HOST' : 'TAMU',
                online_at: new Date().toISOString(),
                minPlayers: isHost ? roomMinPlayers : undefined,
                maxPlayers: isHost ? roomMaxPlayers : undefined
            });
            return;
        }

        const myIdx = players.findIndex(p => p.clientId === myClientId);
        if (myIdx >= currentMaxPlayers) {
            Swal.fire({
                background: '#0f1623', color: '#e5e7eb', confirmButtonColor: '#ef4444',
                title: 'Room Penuh!', html: `Room ini sudah penuh (maksimal ${currentMaxPlayers} pemain).`,
                icon: 'error', iconColor: '#ef4444', confirmButtonText: 'OK',
            }).then(() => { cleanupMultiplayerSession(); backToMenu(); });
            return;
        }

        // Slice to active players only (max currentMaxPlayers)
        const activePlayers = players.slice(0, currentMaxPlayers);
        roomPlayers = activePlayers;

        // Update lobby room player count in real-time
        if (isHost && isSharedToLobby && lobbyChannel) {
            lobbyChannel.track({
                roomCode: roomCode,
                game: 'sudoku',
                hostName: myUsername,
                playerCount: activePlayers.length,
                maxPlayers: roomMaxPlayers,
                updatedAt: new Date().toISOString()
            });
        }

        // --- CHECK IF HOST LEFT THE ROOM ---
        const hostPresent = activePlayers.some(p => p.role === 'HOST');
        if (!isHost && !hostPresent && activePlayers.length > 0) {
            Swal.fire({
                background: '#0f1623', color: '#e5e7eb', confirmButtonColor: '#8b5cf6',
                title: 'Room Ditutup', html: 'Host telah menutup room ini.',
                icon: 'info', iconColor: '#6366f1', confirmButtonText: 'OK',
            }).then(() => { cleanupMultiplayerSession(); backToMenu(); });
            return;
        }

        // Clean up remote selections for players who left
        const activeClientIds = new Set(activePlayers.map(p => p.clientId));
        Object.keys(remoteSelectedCells).forEach(cid => {
            if (!activeClientIds.has(cid)) {
                delete remoteSelectedCells[cid];
            }
        });

        // Determine connection status based on activePlayers
        if (isHost) {
            if (activePlayers.length < currentMinPlayers) {
                setConnectionStatus('waiting', `Menunggu teman... (${activePlayers.length}/${currentMinPlayers} Terhubung)`);
                activeConnection = null;
            } else {
                setConnectionStatus('connected', `Terhubung (${activePlayers.length} Pemain - Siap!)`);
                activeConnection = {
                    open: true,
                    close: () => {
                        cleanupMultiplayerSession();
                    }
                };
            }
        } else {
            const hostPresent = activePlayers.some(p => p.role === 'HOST');
            if (hostPresent) {
                if (activePlayers.length < currentMinPlayers) {
                    setConnectionStatus('waiting', `Menunggu pemain... (${activePlayers.length}/${currentMinPlayers})`);
                } else {
                    setConnectionStatus('connected', `Terhubung (${activePlayers.length} Pemain)`);
                }
                activeConnection = {
                    open: true,
                    close: () => {
                        cleanupMultiplayerSession();
                    }
                };
            } else {
                setConnectionStatus('waiting', 'Menunggu Host terhubung...');
                activeConnection = null;
            }
        }

        // Host authoritative initialization of new guests in activePlayers
        if (isHost) {
            let newPlayersJoined = false;
            activePlayers.forEach(p => {
                if (p.clientId !== myClientId && !seenClientIds.has(p.clientId)) {
                    seenClientIds.add(p.clientId);
                    newPlayersJoined = true;
                }
            });

            // Clean up old client IDs from seenClientIds
            seenClientIds.forEach(cid => {
                if (!activeClientIds.has(cid)) {
                    seenClientIds.delete(cid);
                }
            });

            if (newPlayersJoined) {
                setTimeout(() => {
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
                }, 500); // Wait for the channel to be ready on guest end
            }
        }

        updatePlayerListUI();
        renderBoard();
    });
    
    // Subscribe ke channel
    roomChannel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setConnectionStatus('error', 'Gagal terhubung ke channel');
        }
    });
}

// Host Room creation
function createMultiplayerRoom() {
    if (typeof supabase === 'undefined' || !supabaseClient) {
        Swal.fire({
            background: '#0f1623', color: '#e5e7eb', confirmButtonColor: '#8b5cf6',
            title: 'Gagal Terhubung', html: 'Gagal memuat sistem multiplayer. Periksa koneksi internet Anda.',
            icon: 'error', iconColor: '#ef4444', confirmButtonText: 'OK',
        });
        return;
    }
    
    const btnCreate = document.getElementById('btn-create-room');
    btnCreate.disabled = true;
    btnCreate.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Membuka Room...';
    
    setConnectionStatus('connecting', 'Membuka room...');
    
    roomCode = generateShortCode();
    
    isMultiplayer = true;
    isHost = true;
    
    // Read co-op capacity settings
    roomMinPlayers = 2; // Default to 2
    const maxSelect = document.getElementById('coop-max-select');
    roomMaxPlayers = maxSelect ? parseInt(maxSelect.value) : 5;
    
    // Hide co-op settings area
    const coopSettings = document.getElementById('coop-settings-area');
    if (coopSettings) coopSettings.classList.add('hidden');
    
    // Hide create and join buttons, show room info
    btnCreate.classList.add('hidden');
    document.getElementById('join-room-area').classList.add('hidden');
    document.getElementById('room-info-area').classList.remove('hidden');
    document.getElementById('room-info-label').textContent = 'Kode Room Anda:';
    document.getElementById('player-role-badge').classList.remove('hidden');
    document.getElementById('player-role-badge').textContent = 'HOST';
    
    document.getElementById('share-link-input').value = roomCode;

    // Reset share button to lobby state
    isSharedToLobby = false;
    const shareBtn = document.getElementById('btn-share-lobby');
    if (shareBtn) {
        shareBtn.classList.remove('hidden');
        shareBtn.disabled = false;
        shareBtn.innerHTML = '<i class="fa-solid fa-share-nodes"></i> Bagikan ke Lobby';
        shareBtn.className = "w-full py-1.5 bg-brandPurple/20 hover:bg-brandPurple/30 text-brandPurple border border-brandPurple/20 rounded text-[10px] font-bold transition active:scale-95 flex items-center justify-center gap-1";
    }
    
    setConnectionStatus('waiting', 'Menunggu teman bergabung...');
    
    // Set up channel Supabase
    setupSupabaseChannel(roomCode);
    
    // Automatically open the Sudoku gameplay view
    enterSudokuGame();
}

// Guest Room join
function connectToMultiplayerRoom(hostId) {
    if (typeof supabase === 'undefined' || !supabaseClient) {
        Swal.fire({
            background: '#0f1623', color: '#e5e7eb', confirmButtonColor: '#8b5cf6',
            title: 'Gagal Terhubung', html: 'Gagal memuat sistem multiplayer. Periksa koneksi internet Anda.',
            icon: 'error', iconColor: '#ef4444', confirmButtonText: 'OK',
        });
        return;
    }
    
    setConnectionStatus('connecting', 'Membuka koneksi...');
    
    // Go directly to gameplay view
    enterSudokuGame();
    
    // Show role and hide create and join buttons, show info
    document.getElementById('btn-create-room').classList.add('hidden');
    document.getElementById('join-room-area').classList.add('hidden');
    document.getElementById('room-info-area').classList.remove('hidden');
    
    // Hide co-op settings area
    const coopSettings = document.getElementById('coop-settings-area');
    if (coopSettings) coopSettings.classList.add('hidden');
    document.getElementById('room-info-label').textContent = 'Terhubung ke Room:';
    
    // Extract short code from hostId (removing 'logicall-' prefix if present)
    roomCode = hostId.startsWith('logicall-') ? hostId.replace('logicall-', '') : hostId;
    document.getElementById('share-link-input').value = roomCode;
    
    document.getElementById('player-role-badge').classList.remove('hidden');
    document.getElementById('player-role-badge').textContent = 'TAMU';

    const shareBtn = document.getElementById('btn-share-lobby');
    if (shareBtn) {
        shareBtn.classList.add('hidden');
    }
    
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
    
    isMultiplayer = true;
    isHost = false;
    
    // Set up channel Supabase
    setupSupabaseChannel(roomCode);
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
        if (!data.targetClientId || data.targetClientId === myClientId) {
            wasKickedByHost = true;
            Swal.fire({
                background: '#0f1623', color: '#e5e7eb', confirmButtonColor: '#ef4444',
                title: 'Dikeluarkan!', html: 'Anda telah dikeluarkan dari room oleh Host.',
                icon: 'error', iconColor: '#ef4444', confirmButtonText: 'OK',
            }).then(() => {
                if (activeConnection) activeConnection.close();
                backToMenu();
            });
        }
    }
    
    else if (data.type === 'select') {
        if (data.clientId) {
            remoteSelectedCells[data.clientId] = { r: data.r, c: data.c, username: data.username };
            renderBoard();
        }
    }
    
    else if (data.type === 'username') {
        if (data.clientId) {
            const p = roomPlayers.find(player => player.clientId === data.clientId);
            if (p) {
                p.username = data.username;
            }
            if (remoteSelectedCells[data.clientId]) {
                remoteSelectedCells[data.clientId].username = data.username;
            }
        }
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
        Swal.fire({
            background: '#0f1623', color: '#e5e7eb', confirmButtonColor: '#8b5cf6',
            title: 'Room Ditutup', html: 'Host telah menutup room ini.',
            icon: 'info', iconColor: '#6366f1', confirmButtonText: 'OK',
        }).then(() => {
            if (activeConnection) activeConnection.close();
            backToMenu();
        });
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
    const code = document.getElementById('share-link-input').value;
    
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('btn-copy-link');
        btn.textContent = 'Tersalin!';
        btn.classList.replace('bg-brandPurple', 'bg-emerald-600');
        
        setTimeout(() => {
            btn.textContent = 'Salin';
            btn.classList.replace('bg-emerald-600', 'bg-brandPurple');
        }, 2000);
    }).catch(err => {
        console.error('Gagal menyalin kode: ', err);
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
        sendToPeer({ type: 'username', username: myUsername, clientId: myClientId });
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
    
    // Update player list header text with limits
    const hostPresence = roomPlayers.find(p => p.role === 'HOST');
    const minVal = hostPresence && hostPresence.minPlayers ? hostPresence.minPlayers : (isHost ? roomMinPlayers : 2);
    const maxVal = hostPresence && hostPresence.maxPlayers ? hostPresence.maxPlayers : (isHost ? roomMaxPlayers : 5);
    
    const titleEl = listArea.querySelector('span');
    if (titleEl) {
        titleEl.textContent = `Daftar Pemain (${roomPlayers.length}/${maxVal} - Min: ${minVal})`;
    }
    
    container.innerHTML = '';
    
    roomPlayers.forEach(p => {
        const isMe = p.clientId === myClientId;
        const isHostPlayer = p.role === 'HOST';
        
        const playerDiv = document.createElement('div');
        playerDiv.className = 'flex items-center justify-between bg-slate-900/60 p-2 rounded-lg border border-gray-800/80';
        
        let roleBadgeHtml = '';
        if (isMe) {
            roleBadgeHtml = `<span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-brandPurple/20 text-brandPurple border border-brandPurple/30 uppercase">${isHostPlayer ? 'Host' : 'Tamu'}</span>`;
        } else {
            if (isHost) {
                roleBadgeHtml = `
                    <div class="flex items-center gap-2">
                        <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">Tamu</span>
                        <button onclick="kickGuest('${p.clientId}', '${p.username}')" class="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[9px] font-bold transition flex items-center gap-1">
                            <i class="fa-solid fa-user-minus"></i> Kick
                        </button>
                    </div>
                `;
            } else {
                roleBadgeHtml = `<span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">${isHostPlayer ? 'Host' : 'Tamu'}</span>`;
            }
        }
        
        playerDiv.innerHTML = `
            <span class="flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full ${isMe ? 'bg-brandPurple' : 'bg-emerald-500'} animate-pulse"></span>
                <strong>${p.username}</strong> ${isMe ? '<span class="text-[9px] text-gray-500 font-bold">(Anda)</span>' : ''}
            </span>
            ${roleBadgeHtml}
        `;
        container.appendChild(playerDiv);
    });

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

function kickGuest(clientId, username) {
    if (!isHost || !activeConnection) return;
    
    // Fallback if kickGuest() is called without parameters (legacy calls)
    if (!clientId) {
        const guest = roomPlayers.find(p => p.role !== 'HOST');
        if (guest) {
            clientId = guest.clientId;
            username = guest.username;
        } else {
            return;
        }
    }

    Swal.fire({
        background: '#0f1623', color: '#e5e7eb',
        confirmButtonColor: '#ef4444', cancelButtonColor: '#374151',
        title: 'Keluarkan Pemain?',
        html: `Apakah Anda yakin ingin mengeluarkan <strong style="color:#ef4444">${username || 'Tamu'}</strong> dari room?`,
        icon: 'warning', iconColor: '#f59e0b',
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-user-slash"></i>&nbsp;Keluarkan',
        cancelButtonText: 'Batal',
        reverseButtons: true,
    }).then(result => {
        if (result.isConfirmed) {
            sendToPeer({ type: 'kick', targetClientId: clientId });
        }
    });
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
    let inputVal = input.value.trim();
    if (inputVal.includes('?')) {
        try {
            const urlParams = new URLSearchParams(inputVal.split('?')[1]);
            const roomFromUrl = urlParams.get('room');
            if (roomFromUrl) {
                inputVal = roomFromUrl;
            }
        } catch (e) {
            console.error(e);
        }
    } else if (inputVal.includes('/')) {
        const parts = inputVal.split('/');
        const lastPart = parts[parts.length - 1];
        if (lastPart && lastPart.length >= 5) {
            inputVal = lastPart;
        }
    }
    const sanitized = inputVal.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!sanitized) {
        Swal.fire({
            background: '#0f1623', color: '#e5e7eb', confirmButtonColor: '#8b5cf6',
            title: 'Kode Kosong', html: 'Harap masukkan kode room terlebih dahulu!',
            icon: 'warning', iconColor: '#f59e0b', confirmButtonText: 'OK',
        });
        return;
    }
    if (sanitized.length !== 6) {
        Swal.fire({
            background: '#0f1623', color: '#e5e7eb', confirmButtonColor: '#8b5cf6',
            title: 'Kode Tidak Valid', html: 'Kode room harus terdiri dari <b>6 karakter</b>!',
            icon: 'warning', iconColor: '#f59e0b', confirmButtonText: 'OK',
        });
        return;
    }

    const btnJoin = document.getElementById('btn-join-room');
    if (btnJoin) {
        btnJoin.disabled = true;
        btnJoin.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i>';
    }

    const hostId = 'logicall-' + sanitized;
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
    const title = isHost ? 'Tutup Room?' : 'Keluar Room?';
    const html = isHost
        ? 'Koneksi dengan semua teman Anda akan terputus.'
        : 'Apakah Anda yakin ingin keluar dari room ini?';
    Swal.fire({
        background: '#0f1623', color: '#e5e7eb',
        confirmButtonColor: isHost ? '#ef4444' : '#8b5cf6',
        cancelButtonColor: '#374151',
        title, html,
        icon: 'question', iconColor: '#8b5cf6',
        showCancelButton: true,
        confirmButtonText: isHost ? '<i class="fa-solid fa-rectangle-xmark"></i>&nbsp;Tutup Room' : '<i class="fa-solid fa-arrow-right-from-bracket"></i>&nbsp;Keluar',
        cancelButtonText: 'Batal',
        reverseButtons: true,
    }).then(result => {
        if (result.isConfirmed) {
            if (isHost) {
                sendToPeer({ type: 'close-room' });
                setTimeout(() => cleanupMultiplayerSession(), 100);
            } else {
                cleanupMultiplayerSession();
            }
        }
    });
}

function cleanupMultiplayerSession() {
    if (roomChannel) {
        roomChannel.unsubscribe();
        roomChannel = null;
    }
    if (lobbyChannel) {
        lobbyChannel.unsubscribe();
        lobbyChannel = null;
    }
    isSharedToLobby = false;
    roomCode = "";
    
    activeConnection = null;
    
    isMultiplayer = false;
    isHost = false;
    remoteUsername = '';
    remoteSelectedCell = null;
    roomPlayers = [];
    remoteSelectedCells = {};
    seenClientIds.clear();
    
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
    
    const btnJoin = document.getElementById('btn-join-room');
    if (btnJoin) {
        btnJoin.disabled = false;
        btnJoin.textContent = 'Gabung';
    }
    
    // Show co-op settings area again
    const coopSettings = document.getElementById('coop-settings-area');
    if (coopSettings) coopSettings.classList.remove('hidden');
    const shareBtn = document.getElementById('btn-share-lobby');
    if (shareBtn) {
        shareBtn.classList.add('hidden');
    }
    
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


function shareRoomToLobby() {
    if (typeof supabase === 'undefined' || !supabaseClient || !roomCode || !isHost) return;

    if (lobbyChannel) {
        lobbyChannel.unsubscribe();
        lobbyChannel = null;
    }

    lobbyChannel = supabaseClient.channel('arcade-lobby', {
        config: { presence: { key: myClientId } },
    });

    lobbyChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            isSharedToLobby = true;
            lobbyChannel.track({
                roomCode: roomCode,
                game: 'sudoku',
                hostName: myUsername,
                playerCount: roomPlayers.length || 1,
                maxPlayers: roomMaxPlayers,
                updatedAt: new Date().toISOString()
            });

            const shareBtn = document.getElementById('btn-share-lobby');
            if (shareBtn) {
                shareBtn.disabled = true;
                shareBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Telah Dibagikan';
                shareBtn.className = "w-full py-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-600/20 rounded text-[10px] font-bold cursor-not-allowed flex items-center justify-center gap-1";
            }

            Swal.fire({
                background: '#0f1623', color: '#e5e7eb', confirmButtonColor: '#8b5cf6',
                title: 'Room Dibagikan! 🎉',
                html: `Kode <b style="color:#8b5cf6">${roomCode}</b> kini terlihat di Lobby utama.`,
                icon: 'success', iconColor: '#8b5cf6',
                timer: 2500, timerProgressBar: true, showConfirmButton: false,
            });
        }
    });
}
