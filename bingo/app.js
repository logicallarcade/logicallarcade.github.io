// Bingo Royale - Game Controller & Multiplayer Sync with Supabase presence

// Local fallback settings
const SUPABASE_URL = 'https://xoopahkzmfibfnxzmqfk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_pSbbyCzo8R0oPeyK_xwGtg_C81049id';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Game config ranges: B (1-15), I (16-30), N (31-45), G (46-60), O (61-75)
const GRID_COLUMNS = ['B', 'I', 'N', 'G', 'O'];
const COL_RANGES = {
    'B': { min: 1, max: 15 },
    'I': { min: 16, max: 30 },
    'N': { min: 31, max: 45 },
    'G': { min: 46, max: 60 },
    'O': { min: 61, max: 75 }
};

// --- GAME STATE ---
let myBoard = []; // 2D array, 5 rows x 5 cols
let myMarked = Array(5).fill(null).map(() => Array(5).fill(false)); // 2D bool array
let numbersPool = []; // drawn order, 1 to 75 shuffled
let drawnNumbers = []; // numbers drawn so far
let drawnSet = new Set(); // drawn numbers set
let currentStage = 1; // 1 = Single Line, 2 = Double Line, 3 = Full House
let gameActive = false;
let autoDrawInterval = null;
let drawSpeedMs = 7500; // 7.5 seconds between balls (slightly slower as requested)
let ttsMuted = false;

// --- USER AND ROOM SETTINGS ---
let myUsername = "Pemain 1";
let myClientId = Math.random().toString(36).substring(2, 9);
let isMultiplayer = false;
let isHost = false;
let roomCode = "";
let maxPlayers = 4; // configured capacity for multiplayer (2-8)
let isSharedToLobby = false;
let isLeavingRoom = false;

// --- SYNC CHANNELS ---
let roomChannel = null;
let lobbyChannel = null;

// --- OPPONENTS (PLAYERS & BOTS) ---
let playersList = []; // list of players in the multiplayer room
let opponents = []; // list of active opponent states (bots or real players)

// SwAl dark mode settings
const swalDark = {
    background: '#0f1623',
    color: '#e5e7eb',
    confirmButtonColor: '#06b6d4',
    cancelButtonColor: '#374151',
};

// --- DOM READY ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Sync Username
    const savedName = localStorage.getItem('logicall_username');
    if (savedName) {
        myUsername = savedName;
    } else {
        myUsername = 'User_' + Math.floor(100 + Math.random() * 900);
        localStorage.setItem('logicall_username', myUsername);
    }
    const globalUsernameInput = document.getElementById('global-username-input');
    if (globalUsernameInput) {
        globalUsernameInput.value = myUsername;
    }

    // Load audio preference
    const audioPref = localStorage.getItem('logicall_bingo_tts_muted');
    if (audioPref !== null) {
        ttsMuted = (audioPref === 'true');
        updateTtsMuteIcon();
    }

    // N-FREE marked automatically
    myMarked[2][2] = true; 

    // 2. Setup Solo Bots by Default (Solo is always 1 vs 1)
    opponents = generateBots(1);
    updateOpponentCountUI();
    renderOpponentBoards();

    // 3. Check for room code parameter
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
        document.getElementById('room-code-input').value = roomParam.trim().toUpperCase();
        setTimeout(() => {
            joinVersusRoomByCode();
        }, 300);
    } else {
        // Init a fresh solo card
        generateBingoCard();
        renderBingoCard();
    }
});

// --- AUDIO SPEECH CONTROLLER ---
function toggleTtsMute() {
    ttsMuted = !ttsMuted;
    localStorage.setItem('logicall_bingo_tts_muted', ttsMuted);
    updateTtsMuteIcon();
    showToast(ttsMuted ? "Suara AI Dinonaktifkan" : "Suara AI Diaktifkan");
}

function updateTtsMuteIcon() {
    const icon = document.getElementById('tts-volume-icon');
    if (icon) {
        icon.className = ttsMuted ? "fa-solid fa-volume-xmark text-rose-400" : "fa-solid fa-volume-high text-cyan-400 animate-pulse";
    }
}

function announceNumber(letter, val) {
    if (ttsMuted) return;
    try {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel(); // Stop current speech
            const utterance = new SpeechSynthesisUtterance(`${letter}, ${val}`);
            utterance.lang = 'id-ID';
            utterance.rate = 1.0;
            utterance.pitch = 1.1;
            window.speechSynthesis.speak(utterance);
        }
    } catch (e) {
        console.error("Speech Synthesis failed:", e);
    }
}

function announceVoice(text) {
    if (ttsMuted) return;
    try {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'id-ID';
            utterance.rate = 0.95;
            window.speechSynthesis.speak(utterance);
        }
    } catch (e) {
        console.error("Speech Synthesis failed:", e);
    }
}

// --- CARD GENERATION AND RENDER ---
function generateBingoCard() {
    myBoard = [];
    myMarked = Array(5).fill(null).map(() => Array(5).fill(false));
    myMarked[2][2] = true; // Center FREE tile

    const colPulls = {};
    GRID_COLUMNS.forEach(col => {
        const { min, max } = COL_RANGES[col];
        const pool = [];
        for (let i = min; i <= max; i++) pool.push(i);
        // Shuffle pool
        shuffle(pool);
        colPulls[col] = pool.slice(0, 5); // Take 5 numbers
    });

    // Populate board row by row (5 rows)
    for (let r = 0; r < 5; r++) {
        const rowData = [];
        GRID_COLUMNS.forEach((col, cIdx) => {
            if (r === 2 && cIdx === 2) {
                rowData.push('FREE');
            } else {
                rowData.push(colPulls[col][r]);
            }
        });
        myBoard.push(rowData);
    }
}

function renderBingoCard() {
    const board = document.getElementById('bingo-board');
    if (!board) return;

    // Preserve grid headers (B I N G O)
    const headers = Array.from(board.querySelectorAll('.bingo-header'));
    board.innerHTML = "";
    headers.forEach(h => board.appendChild(h));

    // Append cells
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            const cellVal = myBoard[r][c];
            const isFree = (cellVal === 'FREE');
            
            const cell = document.createElement('div');
            cell.className = 'bingo-cell' + (isFree ? ' free marked' : '');
            cell.setAttribute('data-row', r);
            cell.setAttribute('data-col', c);
            
            if (isFree) {
                cell.textContent = "FREE";
            } else {
                cell.textContent = cellVal;
                // Add click listener
                cell.addEventListener('click', () => handleCellClick(r, c));
            }
            board.appendChild(cell);
        }
    }
}

// --- BOT GENERATION (SOLO MODE) ---
function generateBots(count) {
    const names = ["Andi Bot", "Budi Bot", "Citra Bot", "Dedi Bot", "Elisa Bot", "Feri Bot", "Gita Bot"];
    const botArray = [];

    for (let i = 0; i < count; i++) {
        const botName = names[i % names.length];
        const botCard = [];
        const botMarked = Array(5).fill(null).map(() => Array(5).fill(false));
        botMarked[2][2] = true; // Free tile

        const colPulls = {};
        GRID_COLUMNS.forEach(col => {
            const { min, max } = COL_RANGES[col];
            const pool = [];
            for (let i = min; i <= max; i++) pool.push(i);
            shuffle(pool);
            colPulls[col] = pool.slice(0, 5);
        });

        for (let r = 0; r < 5; r++) {
            const rowData = [];
            GRID_COLUMNS.forEach((col, cIdx) => {
                if (r === 2 && cIdx === 2) {
                    rowData.push('FREE');
                } else {
                    rowData.push(colPulls[col][r]);
                }
            });
            botCard.push(rowData);
        }

        botArray.push({
            clientId: `bot-${i}`,
            username: botName,
            board: botCard,
            marked: botMarked,
            isBot: true,
            status: 'playing',
            stageCompleted: 0
        });
    }
    return botArray;
}

function updateOpponentCountUI() {
    const el = document.getElementById('opp-count-badge');
    if (el) el.textContent = opponents.length;
}

function renderOpponentBoards() {
    // Note: Opponent boards visual sidebar removed as requested: "papan lawan ga usah ada"
    // However, the bots logic still runs in the background in Solo mode.
}

// --- GAMEPLAY MECHANICS ---
function adjustBotCount(val) {
    if (isMultiplayer) return;
    const botCount = parseInt(val);
    opponents = generateBots(botCount);
    updateOpponentCountUI();
    renderOpponentBoards();
}

function handleCellClick(row, col) {
    if (!gameActive) return;
    const cellVal = myBoard[row][col];
    
    // Check if number was drawn
    if (!drawnSet.has(cellVal)) {
        showToast(`Angka ${cellVal} belum ditarik oleh AI!`);
        return;
    }

    if (myMarked[row][col]) return; // already marked

    // Mark locally
    myMarked[row][col] = true;
    
    // Find cell in DOM & apply class
    const cell = document.querySelector(`.bingo-cell[data-row="${row}"][data-col="${col}"]`);
    if (cell) {
        cell.classList.add('marked');
    }

    // Broadcast board status to others in multiplayer
    if (isMultiplayer && roomChannel) {
        roomChannel.send({
            type: 'broadcast',
            event: 'bingo-board-update',
            payload: {
                clientId: myClientId,
                marked: myMarked
            }
        });
    }

    // Verify current stage win condition
    checkWinProgress();
}

// Helper to check horizontal, vertical, and diagonal lines
function getCompletedLines(markedGrid) {
    let completedLines = 0;

    // Check rows
    for (let r = 0; r < 5; r++) {
        if (markedGrid[r].every(val => val)) completedLines++;
    }

    // Check columns
    for (let c = 0; c < 5; c++) {
        let colFilled = true;
        for (let r = 0; r < 5; r++) {
            if (!markedGrid[r][c]) {
                colFilled = false;
                break;
            }
        }
        if (colFilled) completedLines++;
    }

    // Check main diagonal (top-left to bottom-right)
    let diag1Filled = true;
    for (let i = 0; i < 5; i++) {
        if (!markedGrid[i][i]) {
            diag1Filled = false;
            break;
        }
    }
    if (diag1Filled) completedLines++;

    // Check secondary diagonal (top-right to bottom-left)
    let diag2Filled = true;
    for (let i = 0; i < 5; i++) {
        if (!markedGrid[i][4 - i]) {
            diag2Filled = false;
            break;
        }
    }
    if (diag2Filled) completedLines++;

    return completedLines;
}

function checkWinProgress() {
    const lines = getCompletedLines(myMarked);
    const isFullHouse = myMarked.every(row => row.every(val => val));

    if (currentStage === 1 && lines >= 1) {
        triggerStageCompletion(1, myUsername, myClientId);
    } else if (currentStage === 2 && lines >= 2) {
        triggerStageCompletion(2, myUsername, myClientId);
    } else if (currentStage === 3 && isFullHouse) {
        triggerStageCompletion(3, myUsername, myClientId);
    }
}

function triggerStageCompletion(stage, achieverName, achieverId) {
    if (!gameActive) return;

    if (isMultiplayer && roomChannel) {
        roomChannel.send({
            type: 'broadcast',
            event: 'bingo-stage-complete',
            payload: {
                stage: stage,
                achieverName: achieverName,
                achieverId: achieverId
            }
        });
    }

    // Resolve stage locally
    resolveStageComplete(stage, achieverName, achieverId);
}

function resolveStageComplete(stage, achieverName, achieverId) {
    const isMe = (achieverId === myClientId);

    // Pause timer draws immediately
    if (autoDrawInterval) {
        clearInterval(autoDrawInterval);
        autoDrawInterval = null;
    }

    // Voice announcement immediately
    // "Bingo! Pemain 1 Bingo!"
    announceVoice(`Bingo! ${isMe ? 'Anda' : achieverName} Bingo!`);

    if (stage === 1 && currentStage === 1) {
        currentStage = 2;
        updateStageUI();
        updateOpponentStatus(achieverId, 'bingo1');

        Swal.fire({
            ...swalDark,
            title: 'BINGO!',
            html: `<div class="p-3 text-center"><h3 class="text-xl font-extrabold text-cyan-400 mb-2">${escapeHTML(achieverName)} BINGO!</h3><p class="text-xs text-gray-400">Berhasil menyelesaikan <b>Tahap 1 (1 Baris)</b>.<br><br>Game otomatis dilanjutkan ke target baru:<br><b class="text-cyan-400">Tahap 2: 2 Baris Bingo</b>!</p></div>`,
            icon: 'success',
            showConfirmButton: false, // Auto-close, no OK button
            timer: 10000,
            timerProgressBar: true,
            allowOutsideClick: false,
            allowEscapeKey: false
        }).then(() => {
            // Auto resume drawing on close
            if (gameActive) {
                startDrawnTimer();
            }
        });
        
    } else if (stage === 2 && currentStage === 2) {
        currentStage = 3;
        updateStageUI();
        updateOpponentStatus(achieverId, 'bingo2');

        Swal.fire({
            ...swalDark,
            title: 'BINGO!',
            html: `<div class="p-3 text-center"><h3 class="text-xl font-extrabold text-cyan-400 mb-2">${escapeHTML(achieverName)} BINGO!</h3><p class="text-xs text-gray-400">Berhasil menyelesaikan <b>Tahap 2 (2 Baris)</b>.<br><br>Game otomatis dilanjutkan ke target final:<br><b class="text-rose-400 animate-pulse font-extrabold">Tahap 3: Full House (Coret Semua Kotak)</b>!</p></div>`,
            icon: 'success',
            showConfirmButton: false, // Auto-close, no OK button
            timer: 10000,
            timerProgressBar: true,
            allowOutsideClick: false,
            allowEscapeKey: false
        }).then(() => {
            if (gameActive) {
                startDrawnTimer();
            }
        });
        
    } else if (stage === 3 && currentStage === 3) {
        gameActive = false;
        updateOpponentStatus(achieverId, 'won');
        
        // Reset Solo Start Button visual
        resetSoloStartButton();

        const isMultiplayerGuest = isMultiplayer && !isHost;

        Swal.fire({
            ...swalDark,
            title: isMe ? '🏆 Kemenangan!' : '💀 Game Selesai!',
            html: `<div class="p-3 text-center"><h3 class="text-xl font-black text-cyan-400 mb-2">${escapeHTML(achieverName)} BINGO!</h3><p class="text-xs text-gray-400">Berhasil mencentang seluruh angka kartu <b>(Full House)</b>!</p></div>`,
            icon: isMe ? 'success' : 'error',
            showCancelButton: true,
            confirmButtonText: isMultiplayerGuest ? 'Menunggu Host...' : 'Main Lagi',
            cancelButtonText: 'Menu Utama',
            reverseButtons: true,
            allowOutsideClick: false,
            allowEscapeKey: false,
            didOpen: () => {
                if (isMultiplayerGuest) {
                    const confirmBtn = Swal.getConfirmButton();
                    if (confirmBtn) {
                        confirmBtn.disabled = true;
                        confirmBtn.classList.add('opacity-50', 'pointer-events-none');
                    }
                }
            }
        }).then((res) => {
            if (res.isConfirmed) {
                if (isMultiplayer) {
                    if (isHost) {
                        startVersusGame();
                    }
                } else {
                    startSoloGame();
                }
            } else if (res.dismiss === Swal.DismissReason.cancel) {
                backToMenu();
            }
        });
    }
}

function updateOpponentStatus(clientId, status) {
    if (clientId === myClientId) return;
    const opp = opponents.find(o => o.clientId === clientId);
    if (opp) {
        opp.status = status;
        renderOpponentBoards();
    }
}

function updateStageUI() {
    const title = document.getElementById('stage-title');
    const desc = document.getElementById('stage-desc');
    
    if (currentStage === 1) {
        title.textContent = "Tahap 1: 1 Baris Bingo!";
        desc.textContent = "Mencari 1 baris terisi penuh (vertikal, horizontal, atau diagonal).";
    } else if (currentStage === 2) {
        title.textContent = "Tahap 2: 2 Baris Bingo!";
        desc.textContent = "Mencari 2 baris terisi penuh secara bersamaan.";
    } else if (currentStage === 3) {
        title.textContent = "Tahap Final: Full House!";
        desc.textContent = "Coret seluruh 25 kotak angka pada kartu Anda untuk menang!";
    }
}

// --- DRAW AND BINGO TICKER ---
function startDrawnTimer() {
    if (autoDrawInterval) clearInterval(autoDrawInterval);

    // Only host or Solo mode handles the random draw sequence
    if (isMultiplayer && !isHost) {
        console.log("Guest player: waiting for Host to draw numbers.");
        return;
    }

    autoDrawInterval = setInterval(() => {
        if (!gameActive) {
            clearInterval(autoDrawInterval);
            return;
        }

        if (numbersPool.length === 0) {
            clearInterval(autoDrawInterval);
            showToast("Semua 75 angka telah ditarik!");
            return;
        }

        const drawnVal = numbersPool.pop();
        drawnNumbers.push(drawnVal);
        drawnSet.add(drawnVal);

        // Map column letter
        let letter = 'B';
        if (drawnVal <= 15) letter = 'B';
        else if (drawnVal <= 30) letter = 'I';
        else if (drawnVal <= 45) letter = 'N';
        else if (drawnVal <= 60) letter = 'G';
        else letter = 'O';

        // Render locally
        renderDrawnBall(letter, drawnVal);

        // Announce TTS voice
        announceNumber(letter, drawnVal);

        // Update Bots if Solo
        if (!isMultiplayer) {
            tickBots(drawnVal);
        }

        // Broadcast drawn ball to guests
        if (isMultiplayer && roomChannel) {
            roomChannel.send({
                type: 'broadcast',
                event: 'bingo-draw-ball',
                payload: {
                    val: drawnVal,
                    letter: letter,
                    history: drawnNumbers
                }
            });
        }

    }, drawSpeedMs);
}

function renderDrawnBall(letter, val) {
    const ball = document.getElementById('drawn-ball');
    if (ball) {
        ball.textContent = `${letter}-${val}`;
        ball.classList.remove('animate-pulse');
        void ball.offsetWidth;
        ball.classList.add('animate-pulse');
    }

    document.getElementById('called-count').textContent = `Total Angka: ${drawnNumbers.length}/75`;

    // Render 5 recent list (Clean padding circles)
    const historyContainer = document.getElementById('history-balls-container');
    if (historyContainer) {
        const last5 = drawnNumbers.slice(-5).reverse();
        historyContainer.innerHTML = last5.map(v => {
            let l = 'B';
            if (v <= 15) l = 'B';
            else if (v <= 30) l = 'I';
            else if (v <= 45) l = 'N';
            else if (v <= 60) l = 'G';
            else l = 'O';
            return `<div class="history-ball">${l}-${v}</div>`;
        }).join('');
    }
}

// --- BOT GAMEPLAY ENGINE (SOLO) ---
function tickBots(drawnVal) {
    opponents.forEach(bot => {
        if (bot.status === 'won') return;

        // Bots have random chance to mark (simulate human delay/speed)
        const delay = Math.floor(Math.random() * 2000) + 500; // 0.5s - 2.5s
        
        setTimeout(() => {
            if (!gameActive) return;

            // Find if bot card contains drawn value
            let found = false;
            let foundR = 0, foundC = 0;
            
            for (let r = 0; r < 5; r++) {
                for (let c = 0; c < 5; c++) {
                    if (bot.board[r][c] === drawnVal) {
                        found = true;
                        foundR = r;
                        foundC = c;
                        break;
                    }
                }
                if (found) break;
            }

            if (found) {
                bot.marked[foundR][foundC] = true;
                
                // Verify Bot win triggers
                const lines = getCompletedLines(bot.marked);
                const isFullHouse = bot.marked.every(row => row.every(val => val));

                if (currentStage === 1 && lines >= 1 && bot.stageCompleted < 1) {
                    bot.stageCompleted = 1;
                    triggerStageCompletion(1, bot.username, bot.clientId);
                } else if (currentStage === 2 && lines >= 2 && bot.stageCompleted < 2) {
                    bot.stageCompleted = 2;
                    triggerStageCompletion(2, bot.username, bot.clientId);
                } else if (currentStage === 3 && isFullHouse && bot.stageCompleted < 3) {
                    bot.stageCompleted = 3;
                    triggerStageCompletion(3, bot.username, bot.clientId);
                }
            }
        }, delay);
    });
}

// --- SOLO START GAME ACTIONS ---
function startSoloGame() {
    if (isMultiplayer) return;

    currentStage = 1;
    updateStageUI();

    drawnSet.clear();
    drawnNumbers = [];
    
    // Generate fresh pool 1 to 75 shuffled
    numbersPool = [];
    for (let i = 1; i <= 75; i++) numbersPool.push(i);
    shuffle(numbersPool);

    generateBingoCard();
    renderBingoCard();

    // Re-initialize bots (Solo mode is 1 vs 1)
    opponents = generateBots(1);
    updateOpponentCountUI();
    renderOpponentBoards();

    gameActive = true;
    startDrawnTimer();

    // Update Solo Start Button visual state to active
    const soloStartBtn = document.getElementById('btn-start-solo');
    if (soloStartBtn) {
        soloStartBtn.disabled = true;
        soloStartBtn.innerHTML = '<i class="fa-solid fa-gamepad animate-pulse"></i> Game Berjalan';
        soloStartBtn.className = "py-2 px-4 text-xs font-bold bg-slate-800 text-gray-500 border border-gray-700 rounded-xl cursor-not-allowed pointer-events-none";
    }

    showToast("Permainan Solo Dimulai!");
}

function resetSoloStartButton() {
    const soloStartBtn = document.getElementById('btn-start-solo');
    if (soloStartBtn) {
        soloStartBtn.disabled = false;
        soloStartBtn.innerHTML = '<i class="fa-solid fa-play"></i> Mulai Game Solo';
        soloStartBtn.className = "py-2 px-4 text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-95 text-white rounded-xl active:scale-[0.98] transition flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20";
    }
}

// --- RESTART HANDLER ---
function confirmRestartGame() {
    if (isMultiplayer) {
        if (isHost) {
            Swal.fire({
                ...swalDark,
                title: 'Restart Game?',
                html: 'Sesi multiplayer saat ini akan dihentikan dan dimulai ulang dengan kartu baru.',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Ya, Restart!',
                cancelButtonText: 'Batal',
                reverseButtons: true
            }).then(res => { if (res.isConfirmed) startVersusGame(); });
        } else {
            showToast('Hanya Host yang dapat memulai ulang permainan!');
        }
    } else {
        Swal.fire({
            ...swalDark,
            title: 'Mulai Ulang Kartu?',
            html: 'Kartu Anda saat ini akan diacak ulang dan permainan dimulai dari awal.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Ya, Acak Ulang!',
            cancelButtonText: 'Batal',
            reverseButtons: true
        }).then(res => {
            if (res.isConfirmed) {
                if (autoDrawInterval) {
                    clearInterval(autoDrawInterval);
                    autoDrawInterval = null;
                }

                currentStage = 1;
                updateStageUI();
                generateBingoCard();
                renderBingoCard();
                drawnSet.clear();
                drawnNumbers = [];
                
                // Clear drawn caller ball
                const ball = document.getElementById('drawn-ball');
                if (ball) ball.textContent = '-';
                document.getElementById('called-count').textContent = `Total Angka: 0/75`;
                document.getElementById('history-balls-container').innerHTML = `<span class="text-xs text-gray-600 font-bold">Belum ada angka ditarik</span>`;

                opponents = generateBots(1);
                updateOpponentCountUI();
                renderOpponentBoards();
                
                gameActive = false;
                resetSoloStartButton();

                showToast("Kartu berhasil diacak ulang!");
            }
        });
    }
}

// --- MULTIPLAYER ROOM & SUPABASE SYNC ---
async function createVersusRoom() {
    isMultiplayer = true;
    isHost = true;
    roomCode = generateRoomCode();

    const btnCreate = document.getElementById('btn-create-room');
    if (btnCreate) {
        btnCreate.disabled = true;
        btnCreate.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Buat Room...';
    }

    // Read dynamic capacity select from UI
    const maxSelect = document.getElementById('room-max-select');
    maxPlayers = maxSelect ? parseInt(maxSelect.value) : 4;

    // Block solo settings controls
    document.getElementById('solo-settings-area').classList.add('hidden');

    // UI Updates
    document.getElementById('player-role-badge').textContent = "HOST";
    document.getElementById('player-role-badge').classList.remove('hidden');
    document.getElementById('connection-status-text').textContent = `Host: Room ${roomCode}`;
    document.getElementById('connection-status-dot').className = "w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse";

    const linkInput = document.getElementById('share-link-input');
    if (linkInput) {
        linkInput.value = roomCode;
    }
    document.getElementById('lobby-creation-controls').classList.add('hidden');
    document.getElementById('join-room-area').classList.add('hidden');
    document.getElementById('room-info-area').classList.remove('hidden');
    document.getElementById('player-list-area').classList.remove('hidden');

    // Reset share button state
    isSharedToLobby = false;
    const shareBtn = document.getElementById('btn-share-lobby');
    if (shareBtn) {
        shareBtn.classList.remove('hidden');
        shareBtn.disabled = false;
        shareBtn.innerHTML = '<i class="fa-solid fa-share-nodes"></i> Bagikan';
    }

    opponents = [];
    updateOpponentCountUI();

    setupSupabaseVersus();
    
    // Create card for host
    generateBingoCard();
    renderBingoCard();
}

async function joinVersusRoomByCode() {
    let inputVal = document.getElementById('room-code-input').value.trim();
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
    if (!sanitized || sanitized.length < 5) {
        showToast("Kode room tidak valid!");
        return;
    }

    const btnJoin = document.getElementById('btn-join-room');
    if (btnJoin) {
        btnJoin.disabled = true;
        btnJoin.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i>';
    }

    isMultiplayer = true;
    isHost = false;
    roomCode = sanitized;

    // Block solo settings
    document.getElementById('solo-settings-area').classList.add('hidden');

    document.getElementById('connection-status-text').textContent = "Menghubungkan...";
    document.getElementById('connection-status-dot').className = "w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse";

    setupSupabaseVersus();
}

function transitionUIForGuest() {
    document.getElementById('player-role-badge').textContent = "TAMU";
    document.getElementById('player-role-badge').classList.remove('hidden');
    document.getElementById('connection-status-text').textContent = `Tamu: Room ${roomCode}`;
    document.getElementById('connection-status-dot').className = "w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse";

    const linkInput = document.getElementById('share-link-input');
    if (linkInput) {
        linkInput.value = roomCode;
    }
    document.getElementById('lobby-creation-controls').classList.add('hidden');
    document.getElementById('join-room-area').classList.add('hidden');
    document.getElementById('room-info-area').classList.remove('hidden');
    
    const shareBtn = document.getElementById('btn-share-lobby');
    if (shareBtn) shareBtn.classList.add('hidden');
    
    const startVersus = document.getElementById('btn-start-versus');
    if (startVersus) startVersus.classList.add('hidden');
    
    document.getElementById('player-list-area').classList.remove('hidden');

    generateBingoCard();
    renderBingoCard();
}

function leaveVersusRoom() {
    isLeavingRoom = true;
    // Clear roomCode first to prevent async CLOSED callbacks from notifying connection lost
    roomCode = "";
    
    if (roomChannel) {
        supabaseClient.removeChannel(roomChannel);
        roomChannel = null;
    }
    if (lobbyChannel) {
        supabaseClient.removeChannel(lobbyChannel);
        lobbyChannel = null;
    }
    if (autoDrawInterval) clearInterval(autoDrawInterval);

    isMultiplayer = false;
    isHost = false;
    drawnSet.clear();
    drawnNumbers = [];
    opponents = [];
    playersList = [];

    // UI Restore
    document.getElementById('solo-settings-area').classList.remove('hidden');
    document.getElementById('player-role-badge').classList.add('hidden');
    document.getElementById('connection-status-text').textContent = "Mode Solo";
    document.getElementById('connection-status-dot').className = "w-1.5 h-1.5 rounded-full bg-cyan-500";

    document.getElementById('lobby-creation-controls').classList.remove('hidden');
    document.getElementById('join-room-area').classList.remove('hidden');
    document.getElementById('room-info-area').classList.add('hidden');
    document.getElementById('player-list-area').classList.add('hidden');

    const btnCreate = document.getElementById('btn-create-room');
    if (btnCreate) {
        btnCreate.disabled = false;
        btnCreate.innerHTML = '<i class="fa-solid fa-users text-cyan-400"></i> Buat Room';
    }
    const btnJoin = document.getElementById('btn-join-room');
    if (btnJoin) {
        btnJoin.disabled = false;
        btnJoin.textContent = 'Gabung';
    }

    // Reset default bot setup (Solo is 1 vs 1)
    opponents = generateBots(1);
    updateOpponentCountUI();

    currentStage = 1;
    updateStageUI();
    
    generateBingoCard();
    renderBingoCard();

    resetSoloStartButton();

    showToast("Keluar dari room. Kembali ke Mode Solo.");
    isLeavingRoom = false;
}

function setupSupabaseVersus() {
    const channelName = `room-${roomCode}`;
    roomChannel = supabaseClient.channel(channelName, {
        config: { presence: { key: myClientId } }
    });

    roomChannel
        .on('presence', { event: 'sync' }, () => {
            const state = roomChannel.presenceState();
            syncRoomPlayers(state);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            newPresences.forEach(p => {
                if (p.clientId !== myClientId) {
                    showToast(`${p.username} bergabung room!`);
                }
            });
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            leftPresences.forEach(p => {
                showToast(`${p.username} meninggalkan room.`);
                removeOpponent(p.clientId);
            });
        })
        .on('broadcast', { event: 'bingo-start' }, ({ payload }) => {
            console.log("Start broadcast received!");
            Swal.close(); // Close any open win/lose/restart modals on guests!
            currentStage = 1;
            updateStageUI();
            
            // Clean local marked board (except FREE N)
            generateBingoCard();
            renderBingoCard();
            
            drawnSet.clear();
            drawnNumbers = [];
            
            // Clear caller ball
            const ball = document.getElementById('drawn-ball');
            if (ball) ball.textContent = '-';
            document.getElementById('called-count').textContent = `Total Angka: 0/75`;
            document.getElementById('history-balls-container').innerHTML = `<span class="text-xs text-gray-600 font-bold">Menunggu tarikan pertama...</span>`;

            opponents.forEach(opp => {
                opp.marked = Array(5).fill(null).map(() => Array(5).fill(false));
                opp.marked[2][2] = true;
                opp.status = 'playing';
            });

            gameActive = true;
            showToast("Bingo Dimulai!");
        })
        .on('broadcast', { event: 'bingo-draw-ball' }, ({ payload }) => {
            // Drawn numbers from Host
            const { val, letter, history } = payload;
            drawnNumbers = history;
            drawnSet.add(val);
            renderDrawnBall(letter, val);
            announceNumber(letter, val);
        })
        .on('broadcast', { event: 'bingo-board-update' }, ({ payload }) => {
            const { clientId, marked } = payload;
            const opp = opponents.find(o => o.clientId === clientId);
            if (opp) {
                opp.marked = marked;
            }
        })
        .on('broadcast', { event: 'bingo-stage-complete' }, ({ payload }) => {
            const { stage, achieverName, achieverId } = payload;
            resolveStageComplete(stage, achieverName, achieverId);
        })
        .on('broadcast', { event: 'bingo-kick' }, ({ payload }) => {
            const { targetClientId } = payload;
            if (targetClientId === myClientId) {
                Swal.fire({
                    background: '#0f1623', color: '#e5e7eb', confirmButtonColor: '#ef4444',
                    title: 'Dikeluarkan!', html: 'Anda telah dikeluarkan dari room oleh Host.',
                    icon: 'error', iconColor: '#ef4444', confirmButtonText: 'OK',
                }).then(() => {
                    leaveVersusRoom();
                });
            }
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                const presences = roomChannel.presenceState();
                let joinedCount = 0;
                Object.keys(presences).forEach(k => joinedCount += presences[k].length);
                
                // Track dynamic host max players limit
                let dynamicLimit = maxPlayers;
                Object.keys(presences).forEach(k => {
                    presences[k].forEach(p => {
                        if (p.isHost && p.maxPlayers) {
                            dynamicLimit = p.maxPlayers;
                        }
                    });
                });
                
                if (joinedCount >= dynamicLimit) {
                    showToast(`Room Penuh! Kapasitas: ${dynamicLimit} pemain.`);
                    leaveVersusRoom();
                    return;
                }

                // Register client with presence maxPlayers dynamic capacity
                await roomChannel.track({
                    clientId: myClientId,
                    username: myUsername,
                    isHost: isHost,
                    maxPlayers: isHost ? maxPlayers : null,
                    joinedAt: new Date().toISOString()
                });

                if (!isHost) {
                    transitionUIForGuest();
                    showToast("Berhasil bergabung room!");
                }
            } else if (status === 'CLOSED') {
                if (roomCode && !isLeavingRoom) {
                    showToast("Koneksi room terputus.");
                    leaveVersusRoom();
                }
            }
        });
}

function syncRoomPlayers(presenceState) {
    const list = [];
    Object.keys(presenceState).forEach(key => {
        presenceState[key].forEach(p => list.push(p));
    });

    playersList = list;

    // Track host player configuration changes dynamically
    const hostUser = playersList.find(p => p.isHost);
    if (hostUser && hostUser.maxPlayers) {
        maxPlayers = hostUser.maxPlayers;
    }

    // Set opponents list based on other players
    const otherPlayers = playersList.filter(p => p.clientId !== myClientId);
    
    opponents = otherPlayers.map(p => {
        const existing = opponents.find(o => o.clientId === p.clientId);
        
        return {
            clientId: p.clientId,
            username: p.username,
            marked: existing ? existing.marked : Array(5).fill(null).map((_, r) => Array(5).fill(null).map((_, c) => r === 2 && c === 2)),
            board: existing ? existing.board : Array(5).fill(null).map(() => Array(5).fill(0)), // placeholder
            isBot: false,
            status: existing ? existing.status : 'playing',
            stageCompleted: existing ? existing.stageCompleted : 0
        };
    });

    updateOpponentCountUI();

    // Render vertical player list styled like Sudoku Master
    const container = document.getElementById('player-list-container');
    if (container) {
        container.innerHTML = playersList.map(p => {
            const isMe = p.clientId === myClientId;
            const isHostPlayer = p.isHost;
            
            let roleBadgeHtml = '';
            if (isMe) {
                roleBadgeHtml = `<span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 uppercase">${isHostPlayer ? 'Host' : 'Tamu'}</span>`;
            } else {
                if (isHost) {
                    roleBadgeHtml = `
                        <div class="flex items-center gap-2">
                            <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 uppercase">Tamu</span>
                            <button onclick="kickGuest('${p.clientId}', '${escapeHTML(p.username)}')" class="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[9px] font-bold transition flex items-center gap-1">
                                <i class="fa-solid fa-user-minus"></i> Kick
                            </button>
                        </div>
                    `;
                } else {
                    roleBadgeHtml = `<span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 uppercase">${isHostPlayer ? 'Host' : 'Tamu'}</span>`;
                }
            }
            
            return `
                <div class="w-full flex items-center justify-between bg-slate-900/60 p-2 rounded-lg border border-gray-800/80">
                    <span class="flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full ${isMe ? 'bg-cyan-500' : 'bg-emerald-500'} animate-pulse"></span>
                        <strong>${escapeHTML(p.username)}</strong> ${isMe ? '<span class="text-[9px] text-gray-500 font-bold">(Anda)</span>' : ''}
                    </span>
                    ${roleBadgeHtml}
                </div>
            `;
        }).join('');
    }

    // Update player list header count dynamically
    const playerListArea = document.getElementById('player-list-area');
    if (playerListArea) {
        const titleEl = playerListArea.querySelector('span');
        if (titleEl) {
            titleEl.textContent = `Daftar Pemain (${playersList.length}/${maxPlayers} - Min: 2)`;
        }
    }

    // Update leave room button text dynamically
    const btnLeave = document.getElementById('btn-leave-room');
    if (btnLeave) {
        if (isHost) {
            btnLeave.innerHTML = '<i class="fa-solid fa-rectangle-xmark"></i> Tutup Room';
        } else {
            btnLeave.innerHTML = '<i class="fa-solid fa-arrow-right-from-bracket"></i> Keluar Room';
        }
    }

    // Toggle start game button for Host
    const startBtn = document.getElementById('btn-start-versus');
    if (startBtn && isHost) {
        if (playersList.length >= 2) {
            startBtn.classList.remove('hidden');
            startBtn.disabled = false;
            startBtn.textContent = "Mulai Game";
        } else {
            startBtn.classList.add('hidden');
        }
    }

    // Re-track/sync to Lobby if shared
    if (isHost && isSharedToLobby) {
        trackLobbyPresence();
    }
}

function removeOpponent(clientId) {
    opponents = opponents.filter(o => o.clientId !== clientId);
    updateOpponentCountUI();
}

async function startVersusGame() {
    if (!isHost) return;
    if (playersList.length < 2) {
        showToast("Butuh minimal 2 pemain untuk memulai!");
        return;
    }

    const startBtn = document.getElementById('btn-start-versus');
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.textContent = "Memulai...";
    }

    // Broadcast trigger start event
    await roomChannel.send({
        type: 'broadcast',
        event: 'bingo-start',
        payload: {}
    });

    // Start local draws
    currentStage = 1;
    updateStageUI();
    
    drawnSet.clear();
    drawnNumbers = [];
    
    // Generate fresh pool 1 to 75 shuffled
    numbersPool = [];
    for (let i = 1; i <= 75; i++) numbersPool.push(i);
    shuffle(numbersPool);

    generateBingoCard();
    renderBingoCard();

    // Clear caller ball
    const ball = document.getElementById('drawn-ball');
    if (ball) ball.textContent = '-';
    document.getElementById('called-count').textContent = `Total Angka: 0/75`;
    document.getElementById('history-balls-container').innerHTML = `<span class="text-xs text-gray-600 font-bold">Menunggu tarikan pertama...</span>`;

    opponents.forEach(opp => {
        opp.marked = Array(5).fill(null).map(() => Array(5).fill(false));
        opp.marked[2][2] = true;
        opp.status = 'playing';
    });

    gameActive = true;
    startDrawnTimer();
}

// --- LOBBY BROADCAST SHARE ---
async function shareRoomToLobby() {
    if (!isHost || !roomCode) return;
    
    isSharedToLobby = true;
    const shareBtn = document.getElementById('btn-share-lobby');
    if (shareBtn) {
        shareBtn.disabled = true;
        shareBtn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Membagikan...';
    }

    // Setup second global lobby channel to track presence
    lobbyChannel = supabaseClient.channel('arcade-lobby', {
        config: { presence: { key: myClientId } }
    });

    lobbyChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            await trackLobbyPresence();
            
            showToast("Room dibagikan ke lobby portal utama!");
            if (shareBtn) {
                shareBtn.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400"></i> Dibagikan';
                shareBtn.className = "py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded text-[10px] font-bold cursor-not-allowed flex items-center justify-center gap-1 flex-1";
            }
        }
    });
}

async function trackLobbyPresence() {
    if (!lobbyChannel) return;
    await lobbyChannel.track({
        status: 'playing',
        game: 'Bingo',
        roomCode: roomCode,
        hostName: myUsername,
        playerCount: playersList.length,
        maxPlayers: maxPlayers,
        onlineAt: new Date().toISOString()
    });
}

// --- UTILITY METHODS ---
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function copyRoomCode() {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode).then(() => {
        showToast("Kode room disalin!");
    }).catch(err => {
        console.error("Clipboard copy failed:", err);
    });
}

function copyRoomLink() {
    const input = document.getElementById('share-link-input');
    if (input) {
        navigator.clipboard.writeText(input.value).then(() => {
            showToast("Link undangan disalin!");
            const btn = document.getElementById('btn-copy-link');
            if (btn) {
                btn.textContent = 'Tersalin!';
                btn.className = "px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-[10px] font-bold text-white transition active:scale-95";
                setTimeout(() => {
                    btn.textContent = 'Salin';
                    btn.className = "px-3 py-1 bg-cyan-600 hover:bg-cyan-500 rounded text-[10px] font-bold text-white transition active:scale-95";
                }, 2000);
            }
        }).catch(err => {
            console.error("Clipboard copy failed:", err);
        });
    }
}

async function changeUsername(val) {
    const sanitized = val.trim();
    if (!sanitized) return;
    myUsername = sanitized;
    localStorage.setItem('logicall_username', myUsername);
    
    if (isMultiplayer && roomChannel) {
        await roomChannel.track({
            clientId: myClientId,
            username: myUsername,
            isHost: isHost,
            maxPlayers: isHost ? maxPlayers : null,
            joinedAt: new Date().toISOString()
        });
    }
}

function kickGuest(clientId, username) {
    if (!isHost || !roomChannel) return;
    
    Swal.fire({
        background: '#0f1623', color: '#e5e7eb',
        confirmButtonColor: '#ef4444', cancelButtonColor: '#374151',
        title: 'Keluarkan Pemain?',
        html: `Apakah Anda yakin ingin mengeluarkan <strong style="color:#ef4444">${escapeHTML(username) || 'Tamu'}</strong> dari room?`,
        icon: 'warning', iconColor: '#f59e0b',
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-user-slash"></i>&nbsp;Keluarkan',
        cancelButtonText: 'Batal',
        reverseButtons: true,
    }).then(result => {
        if (result.isConfirmed) {
            roomChannel.send({
                type: 'broadcast',
                event: 'bingo-kick',
                payload: { targetClientId: clientId }
            });
        }
    });
}

function backToMenu() {
    if (isMultiplayer) {
        leaveVersusRoom();
    }
    window.location.href = '../';
}

function toggleHelpModal(show) {
    const modal = document.getElementById('help-modal');
    if (show) {
        modal.classList.remove('hidden');
        void modal.offsetWidth; // force layout refresh
        modal.classList.add('opacity-100');
        if (modal.firstElementChild) modal.firstElementChild.classList.add('scale-100');
    } else {
        modal.classList.remove('opacity-100');
        if (modal.firstElementChild) modal.firstElementChild.classList.remove('scale-100');
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 250);
    }
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 2200);
}
