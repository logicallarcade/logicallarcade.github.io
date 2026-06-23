// Wordle Bahasa Indonesia Game Logic with Supabase Backend

// Local Fallbacks (Used if offline or Supabase fails)
const FALLBACK_WORDS = [
    "MAKAN", "MINUM", "TANAH", "RUMAH", "BUNGA", "PINTU", "HIDUP", "CINTA", "KUAT", "LEMAH",
    "PAGI", "SIANG", "MALAM", "DUNIA", "SURYA", "KAPAL", "BULAN", "AWAN", "SENJA", "HUJAN"
];

// --- MULTIPLAYER STATE (SUPABASE) ---
const SUPABASE_URL = 'https://xoopahkzmfibfnxzmqfk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_pSbbyCzo8R0oPeyK_xwGtg_C81049id';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- GAME STATE ---
let secretWord = "";
let currentRow = 0;
let currentTile = 0;
let gameActive = true;
let isAnimating = false;

// --- MULTIPLAYER STATE VARIABLES ---
let isMultiplayer = false;
let isHost = false;
let roomChannel = null;
let lobbyChannel = null;
let isSharedToLobby = false;
let roomCode = "";
let opponentGuesses = [];
let myClientId = Math.random().toString(36).substring(2, 9);
let opponentName = "";
let myFinished = false;
let opponentFinished = false;
let opponentOutcome = "";
let opponentFinalRow = 0;

// --- USERNAME SYNC ---
let myUsername = 'Pemain 1';

// --- STATS SYSTEM ---
let stats = {
    played: 0,
    won: 0,
    streak: 0,
    maxStreak: 0,
    distribution: [0, 0, 0, 0, 0, 0] // guesses 1 to 6
};

document.addEventListener('DOMContentLoaded', () => {
    // Sync username from localStorage
    const savedName = localStorage.getItem('logicall_username');
    if (savedName) {
        myUsername = savedName;
    } else {
        myUsername = 'User_' + Math.floor(100 + Math.random() * 900);
        localStorage.setItem('logicall_username', myUsername);
    }
    document.getElementById('player-username').textContent = myUsername;

    // Load stats
    loadStatsFromStorage();

    // Check for ?room= URL param (join from lobby)
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
        // Pre-fill room code input and auto-join as guest
        const input = document.getElementById('room-code-input');
        if (input) input.value = roomParam.trim().toUpperCase();
        // Wait for DOM to settle, then auto-join
        setTimeout(() => {
            joinVersusRoomByCode();
        }, 300);
        // Skip first-time tutorial when joining from lobby
        return;
    }

    // Init the game
    initGame();

    // Setup input listeners
    setupKeyboardListeners();

    // First time player? Show instructions modal
    if (!localStorage.getItem('logicall_wordle_played_before')) {
        toggleHelpModal(true);
        localStorage.setItem('logicall_wordle_played_before', 'true');
    }
});

async function initGame() {
    gameActive = false;
    isAnimating = true;

    // Reset grid content and state visually
    const cells = document.querySelectorAll('.grid-cell');
    cells.forEach(cell => {
        cell.textContent = "";
        cell.className = "grid-cell";
    });

    // Reset opponent grid content and state visually
    const oppCells = document.querySelectorAll('#wordle-board-opponent .grid-cell');
    oppCells.forEach(cell => {
        cell.textContent = "";
        cell.className = "grid-cell";
    });

    // Reset keyboard keys
    const keys = document.querySelectorAll('.key-btn');
    keys.forEach(key => {
        key.classList.remove('correct', 'present', 'absent');
    });

    currentRow = 0;
    currentTile = 0;
    opponentGuesses = [];

    // Close stats modals
    document.getElementById('answer-reveal-area').classList.add('hidden');
    
    // Hide multiplayer result message if exists
    const resultMsgDiv = document.getElementById('multiplayer-result-msg');
    if (resultMsgDiv) resultMsgDiv.classList.add('hidden');

    if (isMultiplayer) {
        // In multiplayer, host will fetch word via startVersusGame. Guest waits.
        secretWord = "";
        console.log("Multiplayer game initialized. Waiting for host to start.");
        isAnimating = false;
        
        // Reset opponent mask status
        const mask = document.getElementById('opponent-mask');
        if (mask) {
            mask.classList.remove('revealed');
            document.getElementById('opponent-status-text').textContent = isHost ? "Menunggu lawan bergabung..." : "Menunggu Host memulai game...";
        }
        return;
    }

    // Fetch new secret word from Supabase RPC (Solo Mode)
    try {
        const { data, error } = await supabaseClient.rpc('get_random_wordle_word');
        if (error) throw error;
        if (!data) throw new Error("No data returned");
        secretWord = data.toUpperCase();
    } catch (err) {
        console.error("Failed to load secret word from Supabase. Using fallback.", err);
        secretWord = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
    }

    console.log("Game initialized.");
    
    // Unlock game interaction
    gameActive = true;
    isAnimating = false;
}

// --- LOGIC KEYBOARD ---
function setupKeyboardListeners() {
    // Screen keyboard click
    const keys = document.querySelectorAll('.key-btn');
    keys.forEach(key => {
        key.addEventListener('click', () => {
            if (!gameActive || isAnimating) return;
            const keyValue = key.getAttribute('data-key');
            handleKeyPress(keyValue);
        });
    });

    // Physical keyboard press
    document.addEventListener('keydown', (e) => {
        if (!gameActive || isAnimating) return;
        
        // Ignore typing when in inputs/modals
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        const key = e.key.toUpperCase();
        if (key === 'ENTER') {
            handleKeyPress('ENTER');
        } else if (key === 'BACKSPACE' || key === 'BACK') {
            handleKeyPress('BACKSPACE');
        } else if (/^[A-Z]$/.test(key)) {
            handleKeyPress(key);
        }
    });
}

function handleKeyPress(key) {
    if (key === 'ENTER') {
        submitGuess();
    } else if (key === 'BACKSPACE') {
        deleteLetter();
    } else {
        addLetter(key);
    }
}

function addLetter(char) {
    if (currentTile >= 5) return;
    
    const cell = document.getElementById(`cell-${currentRow}-${currentTile}`);
    if (cell) {
        cell.textContent = char;
        cell.classList.add('typed');
        currentTile++;
    }
}

function deleteLetter() {
    if (currentTile <= 0) return;
    
    currentTile--;
    const cell = document.getElementById(`cell-${currentRow}-${currentTile}`);
    if (cell) {
        cell.textContent = "";
        cell.classList.remove('typed');
    }
}

async function submitGuess() {
    if (currentTile < 5) {
        showToast("Huruf kurang!");
        shakeRow(currentRow);
        return;
    }

    // Build the guess string
    let guess = "";
    for (let c = 0; c < 5; c++) {
        const cell = document.getElementById(`cell-${currentRow}-${c}`);
        guess += cell.textContent.toUpperCase();
    }

    // Lock board and keyboard during server check
    isAnimating = true;

    // Validate guess word against Supabase words database
    let isValid = false;
    try {
        const { data, error } = await supabaseClient
            .from('wordle_words')
            .select('word')
            .eq('word', guess)
            .maybeSingle();

        if (error) throw error;
        isValid = (data !== null);
    } catch (err) {
        console.error("Supabase validation error. Falling back to local check.", err);
        // Offline fallback
        isValid = FALLBACK_WORDS.includes(guess) || guess.length === 5;
    }

    if (!isValid) {
        showToast("Tidak ada dalam kamus!");
        shakeRow(currentRow);
        isAnimating = false;
        return;
    }

    // Grade guess
    const grades = gradeWord(guess, secretWord);

    // Apply color changes with staggered 3D flips
    let delay = 0;
    for (let c = 0; c < 5; c++) {
        const cell = document.getElementById(`cell-${currentRow}-${c}`);
        
        setTimeout(() => {
            cell.classList.add('flip-in');
            
            // Halfway through the flip, swap class states and apply style
            setTimeout(() => {
                cell.classList.remove('typed', 'flip-in');
                cell.classList.add(grades[c], 'flip-out');
                
                // End flip out animation
                setTimeout(() => {
                    cell.classList.remove('flip-out');
                }, 300);
            }, 150);
            
        }, delay);
        delay += 200;
    }

    // Once all cells finish flipping, run logic checking
    setTimeout(() => {
        // Highlight Virtual Keyboard Keys
        updateKeyboardColors(guess, grades);

        // Check Win/Lose
        const myWin = (guess === secretWord);
        const myLose = (!myWin && currentRow === 5);

        // If multiplayer, broadcast guess and game end (if finished) before showing local overlay
        if (isMultiplayer && roomChannel) {
            roomChannel.send({
                type: 'broadcast',
                event: 'versus-guess',
                payload: {
                    clientId: myClientId,
                    row: currentRow,
                    guess: guess,
                    grades: grades
                }
            });

            if (myWin) {
                roomChannel.send({
                    type: 'broadcast',
                    event: 'versus-end',
                    payload: {
                        clientId: myClientId,
                        outcome: 'win',
                        row: currentRow,
                        guess: guess,
                        grades: grades
                    }
                });
            } else if (myLose) {
                roomChannel.send({
                    type: 'broadcast',
                    event: 'versus-end',
                    payload: {
                        clientId: myClientId,
                        outcome: 'lose',
                        row: currentRow,
                        guess: guess,
                        grades: grades
                    }
                });
            }
        }

        if (myWin) {
            if (isMultiplayer) {
                myFinished = true;
                gameActive = false;
                
                updateOpponentMaskVisibility();
                renderOpponentGuessesLive();

                endVersusMatch();
            } else {
                handleWin();
            }
        } else if (myLose) {
            if (isMultiplayer) {
                myFinished = true;
                gameActive = false;

                updateOpponentMaskVisibility();
                renderOpponentGuessesLive();

                if (opponentFinished) {
                    endVersusMatch();
                } else {
                    showToast("Menunggu lawan menyelesaikan...");
                }
            } else {
                handleLoss();
            }
        } else {
            // Move to next row
            currentRow++;
            currentTile = 0;
            isAnimating = false;
        }
    }, delay + 300);
}

// Helper to check correct, present and absent letters correctly matching duplicates
function gradeWord(guess, secret) {
    const grades = Array(5).fill('absent');
    const secretLetters = secret.split('');
    const guessLetters = guess.split('');
    
    // Track count of letters available in secret
    const letterCounts = {};
    for (let l of secretLetters) {
        letterCounts[l] = (letterCounts[l] || 0) + 1;
    }

    // First Pass: Match exact positions (correct/green)
    for (let i = 0; i < 5; i++) {
        if (guessLetters[i] === secretLetters[i]) {
            grades[i] = 'correct';
            letterCounts[guessLetters[i]]--;
        }
    }

    // Second Pass: Match letters that exist in other positions (present/yellow)
    for (let i = 0; i < 5; i++) {
        if (grades[i] === 'correct') continue;
        
        const char = guessLetters[i];
        if (letterCounts[char] && letterCounts[char] > 0) {
            grades[i] = 'present';
            letterCounts[char]--;
        }
    }

    return grades;
}

function updateKeyboardColors(guess, grades) {
    for (let i = 0; i < 5; i++) {
        const char = guess[i];
        const grade = grades[i];
        const key = document.querySelector(`.key-btn[data-key="${char}"]`);
        
        if (key) {
            // Apply higher precedence colors: correct > present > absent
            if (grade === 'correct') {
                key.classList.remove('present', 'absent');
                key.classList.add('correct');
            } else if (grade === 'present') {
                if (!key.classList.contains('correct')) {
                    key.classList.remove('absent');
                    key.classList.add('present');
                }
            } else if (grade === 'absent') {
                if (!key.classList.contains('correct') && !key.classList.contains('present')) {
                    key.classList.add('absent');
                }
            }
        }
    }
}

// --- WIN & LOSS HANDLERS ---
function handleWin() {
    gameActive = false;
    isAnimating = false;
    
    // Save Stats
    stats.played++;
    stats.won++;
    stats.streak++;
    if (stats.streak > stats.maxStreak) {
        stats.maxStreak = stats.streak;
    }
    stats.distribution[currentRow]++;
    saveStatsToStorage();

    // Show congrats toast
    const praises = ["Luar Biasa!", "Hebat!", "Mantap!", "Bagus Sekali!", "Pintar!", "Berhasil!"];
    showToast(praises[currentRow]);

    setTimeout(() => {
        showGameOverStats(true);
    }, 1000);
}

function handleLoss() {
    gameActive = false;
    isAnimating = false;

    // Save Stats
    stats.played++;
    stats.streak = 0;
    saveStatsToStorage();

    // Show loss toast
    showToast("Kesempatan Habis!");

    setTimeout(() => {
        showGameOverStats(false);
    }, 1000);
}

function showGameOverStats(isWin) {
    // Update Modal Titles
    const badge = document.getElementById('game-status-badge');
    const title = document.getElementById('stats-main-title');
    
    if (isWin) {
        badge.textContent = "KEMENANGAN";
        badge.className = "text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-widest block w-max mx-auto mb-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
        title.textContent = "Pekerjaan Bagus!";
    } else {
        badge.textContent = "KEKALAHAN";
        badge.className = "text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-widest block w-max mx-auto mb-2 bg-rose-500/20 text-rose-400 border border-rose-500/30";
        title.textContent = "Coba Lagi!";
    }

    // Reveal secret word
    document.getElementById('revealed-secret-word').textContent = secretWord;
    document.getElementById('answer-reveal-area').classList.remove('hidden');

    // Populate stats
    updateStatsModalUI();
    toggleStatsModal(true);
}

function updateStatsModalUI() {
    document.getElementById('stat-played').textContent = stats.played;
    
    const winRate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
    document.getElementById('stat-win-rate').textContent = `${winRate}%`;
    document.getElementById('stat-streak').textContent = stats.streak;
    document.getElementById('stat-max-streak').textContent = stats.maxStreak;

    // Render bars
    const maxVal = Math.max(...stats.distribution, 1); // Avoid division by zero
    for (let r = 0; r < 6; r++) {
        const val = stats.distribution[r];
        const bar = document.getElementById(`dist-bar-${r + 1}`);
        if (bar) {
            bar.textContent = val;
            const pct = Math.max(10, Math.round((val / maxVal) * 100)); // Minimum width 10% for layout visibility
            bar.style.width = `${pct}%`;
            
            // Highlight current winning row
            if (!gameActive && currentRow === r && stats.distribution[r] > 0) {
                bar.className = "bg-emerald-500 text-[10px] text-white font-extrabold flex items-center justify-end pr-1.5 transition-all duration-500 h-full w-[0%]";
            } else {
                bar.className = "bg-gray-600 text-[10px] text-white font-extrabold flex items-center justify-end pr-1.5 transition-all duration-500 h-full w-[0%]";
            }
        }
    }
}

// --- STATS STORAGE ---
function loadStatsFromStorage() {
    const stored = localStorage.getItem('logicall_wordle_stats');
    if (stored) {
        try {
            stats = JSON.parse(stored);
        } catch (e) {
            console.error("Error parsing stats", e);
        }
    }
}

function saveStatsToStorage() {
    localStorage.setItem('logicall_wordle_stats', JSON.stringify(stats));
}

// --- POP EFFECTS & MODALS ---
function shakeRow(rowIdx) {
    const row = document.getElementById(`row-${rowIdx}`);
    if (row) {
        row.classList.add('shake-row');
        setTimeout(() => {
            row.classList.remove('shake-row');
        }, 400);
    }
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
    }, 2000);
}

// Dialog Toggles
const helpModal = document.getElementById('help-modal');
const statsModal = document.getElementById('stats-modal');

function toggleHelpModal(show) {
    if (show) {
        helpModal.classList.remove('hidden');
        void helpModal.offsetWidth; // force layout refresh
        helpModal.classList.add('opacity-100');
        if (helpModal.firstElementChild) helpModal.firstElementChild.classList.add('scale-100');
    } else {
        helpModal.classList.remove('opacity-100');
        if (helpModal.firstElementChild) helpModal.firstElementChild.classList.remove('scale-100');
        setTimeout(() => {
            helpModal.classList.add('hidden');
        }, 300);
    }
}

function toggleStatsModal(show) {
    if (show) {
        updateStatsModalUI();
        
        const leftBtn = document.getElementById('btn-stats-left');
        if (leftBtn) {
            leftBtn.textContent = gameActive ? "Tutup" : "Menu Utama";
        }

        const btnRestart = document.getElementById('btn-restart-game');
        if (btnRestart) {
            if (isMultiplayer && !isHost) {
                btnRestart.disabled = true;
                btnRestart.textContent = "Menunggu Host...";
                btnRestart.className = "flex-1 py-3 rounded-xl bg-gray-800 border border-gray-700/50 text-gray-500 font-bold text-xs tracking-wider transition uppercase cursor-not-allowed opacity-50 pointer-events-none";
            } else {
                btnRestart.disabled = false;
                btnRestart.textContent = "Main Lagi";
                btnRestart.className = "flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-95 text-white font-bold text-xs tracking-wider transition uppercase shadow-lg shadow-emerald-500/20 active:scale-98";
            }
        }

        statsModal.classList.remove('hidden');
        void statsModal.offsetWidth; // force layout refresh
        statsModal.classList.add('opacity-100');
        if (statsModal.firstElementChild) statsModal.firstElementChild.classList.add('scale-100');
    } else {
        statsModal.classList.remove('opacity-100');
        if (statsModal.firstElementChild) statsModal.firstElementChild.classList.remove('scale-100');
        setTimeout(() => {
            statsModal.classList.add('hidden');
        }, 300);
    }
}

function handleStatsLeftClick() {
    if (!gameActive) {
        if (isMultiplayer) {
            leaveVersusRoom();
        }
        window.location.href = '../';
    } else {
        toggleStatsModal(false);
    }
}

function confirmRestartGame() {
    if (isMultiplayer) {
        if (isHost) {
            Swal.fire({
                background: '#0f1623', color: '#e5e7eb',
                confirmButtonColor: '#8b5cf6', cancelButtonColor: '#374151',
                title: 'Mulai Game Baru?',
                html: 'Sesi multiplayer saat ini akan dimulai ulang dengan kata baru.',
                icon: 'question', iconColor: '#8b5cf6',
                showCancelButton: true,
                confirmButtonText: '▶ Ya, Mulai!',
                cancelButtonText: 'Batal',
                reverseButtons: true,
            }).then(result => { if (result.isConfirmed) restartGame(); });
        } else {
            showToast('Hanya Host yang dapat memulai ulang permainan!');
        }
    } else {
        if (!gameActive) {
            restartGame();
        } else {
            Swal.fire({
                background: '#0f1623', color: '#e5e7eb',
                confirmButtonColor: '#8b5cf6', cancelButtonColor: '#374151',
                title: 'Ganti Kata Rahasia?',
                html: 'Permainan yang sedang berjalan akan dihentikan. Statistik tidak terpengaruh.',
                icon: 'question', iconColor: '#8b5cf6',
                showCancelButton: true,
                confirmButtonText: '▶ Ya, Ganti!',
                cancelButtonText: 'Batal',
                reverseButtons: true,
            }).then(result => { if (result.isConfirmed) restartGame(); });
        }
    }
}

function restartGame() {
    toggleStatsModal(false);
    if (isMultiplayer) {
        if (isHost) {
            startVersusGame();
        } else {
            showToast("Menunggu Host memulai game baru...");
        }
    } else {
        initGame();
        showToast("Permainan dimulai!");
    }
}

// --- MULTIPLAYER ROOM CONTROL LOGIC ---

async function createVersusRoom() {
    isMultiplayer = true;
    isHost = true;
    roomCode = generateRoomCode();
    
    // Reset state & UI
    document.getElementById('player-role-badge').textContent = "HOST";
    document.getElementById('player-role-badge').classList.remove('hidden');
    document.getElementById('connection-status-text').textContent = `Host: Room ${roomCode}`;
    document.getElementById('connection-status-dot').className = "w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse";
    
    document.getElementById('room-code-display').textContent = roomCode;
    document.getElementById('btn-create-room').classList.add('hidden');
    document.getElementById('join-room-area').classList.add('hidden');
    document.getElementById('room-info-area').classList.remove('hidden');
    document.getElementById('player-list-area').classList.remove('hidden');
    
    // Reset share button to lobby state
    isSharedToLobby = false;
    const shareBtn = document.getElementById('btn-share-lobby');
    if (shareBtn) {
        shareBtn.classList.remove('hidden');
        shareBtn.disabled = false;
        shareBtn.innerHTML = '<i class="fa-solid fa-share-nodes"></i> Bagikan ke Lobby';
        shareBtn.className = "px-3 py-1.5 bg-brandPurple/20 hover:bg-brandPurple/30 text-brandPurple border border-brandPurple/20 rounded text-[10px] font-bold transition active:scale-95 flex items-center justify-center gap-1";
    }
    
    // Show opponent board
    document.getElementById('opponent-board-wrapper').classList.remove('hidden');
    document.getElementById('opponent-board-wrapper').classList.add('flex');
    document.getElementById('my-board-title').classList.remove('hidden');
    
    // Adjust main container width
    document.getElementById('main-container').classList.add('multiplayer-active');
    
    setupSupabaseVersus();
    initGame();
}

async function joinVersusRoomByCode() {
    const input = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (!input || input.length < 5) {
        showToast("Kode room tidak valid!");
        return;
    }
    
    isMultiplayer = true;
    isHost = false;
    roomCode = input;
    
    // Set temporary connection status, do not transition full UI yet
    document.getElementById('connection-status-text').textContent = "Menghubungkan...";
    document.getElementById('connection-status-dot').className = "w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse";
    
    setupSupabaseVersus();
}

function transitionUIForGuest() {
    document.getElementById('player-role-badge').textContent = "TAMU";
    document.getElementById('player-role-badge').classList.remove('hidden');
    document.getElementById('connection-status-text').textContent = `Tamu: Room ${roomCode}`;
    document.getElementById('connection-status-dot').className = "w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse";
    
    document.getElementById('room-code-display').textContent = roomCode;
    document.getElementById('btn-create-room').classList.add('hidden');
    document.getElementById('join-room-area').classList.add('hidden');
    document.getElementById('room-info-area').classList.remove('hidden');
    const shareBtn = document.getElementById('btn-share-lobby');
    if (shareBtn) {
        shareBtn.classList.add('hidden');
    }
    document.getElementById('btn-copy-code').classList.remove('hidden');
    document.getElementById('btn-start-versus').classList.add('hidden'); // Guest can't start
    document.getElementById('player-list-area').classList.remove('hidden');
    
    // Show opponent board
    document.getElementById('opponent-board-wrapper').classList.remove('hidden');
    document.getElementById('opponent-board-wrapper').classList.add('flex');
    document.getElementById('my-board-title').classList.remove('hidden');
    
    // Adjust main container width
    document.getElementById('main-container').classList.add('multiplayer-active');
    
    initGame();
}

function leaveVersusRoom(quiet = false) {
    if (roomChannel) {
        supabaseClient.removeChannel(roomChannel);
        roomChannel = null;
    }
    if (lobbyChannel) {
        supabaseClient.removeChannel(lobbyChannel);
        lobbyChannel = null;
    }
    isSharedToLobby = false;
    
    isMultiplayer = false;
    isHost = false;
    roomCode = "";
    opponentGuesses = [];
    opponentName = "";
    
    // Reset UI to solo mode
    document.getElementById('player-role-badge').classList.add('hidden');
    document.getElementById('connection-status-text').textContent = "Mode Solo";
    document.getElementById('connection-status-dot').className = "w-1.5 h-1.5 rounded-full bg-gray-500";
    
    document.getElementById('btn-create-room').classList.remove('hidden');
    document.getElementById('join-room-area').classList.remove('hidden');
    document.getElementById('room-info-area').classList.add('hidden');
    const shareBtn = document.getElementById('btn-share-lobby');
    if (shareBtn) {
        shareBtn.classList.add('hidden');
    }
    document.getElementById('player-list-area').classList.add('hidden');
    document.getElementById('room-code-input').value = "";
    
    // Hide opponent board
    document.getElementById('opponent-board-wrapper').classList.add('hidden');
    document.getElementById('opponent-board-wrapper').classList.remove('flex');
    document.getElementById('my-board-title').classList.add('hidden');
    
    document.getElementById('main-container').classList.remove('multiplayer-active');
    
    opponentBoardVisibleMobile = true;
    const toggleBtn = document.getElementById('btn-toggle-opponent-board');
    if (toggleBtn) {
        toggleBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Sembunyikan Papan Lawan';
        toggleBtn.className = "md:hidden w-full py-1.5 bg-slate-800/80 hover:bg-slate-700 text-emerald-400 border border-gray-700 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-1.5";
    }

    initGame();
    if (!quiet) {
        showToast("Keluar dari Room Multiplayer");
    }
}

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function copyRoomCode() {
    navigator.clipboard.writeText(roomCode).then(() => {
        showToast("Kode Room disalin!");
    }).catch(err => {
        console.error("Gagal menyalin kode", err);
    });
}

function setupSupabaseVersus() {
    if (roomChannel) {
        supabaseClient.removeChannel(roomChannel);
    }
    
    roomChannel = supabaseClient.channel(`room-${roomCode}`, {
        config: {
            presence: {
                key: myClientId,
            },
        },
    });
    
    // Set up presence & broadcast listeners
    roomChannel
        .on('presence', { event: 'sync' }, () => {
            const newState = roomChannel.presenceState();
            handlePresenceSync(newState);
        })
        .on('broadcast', { event: 'versus-start' }, (payload) => {
            console.log("Received versus-start", payload);
            startLocalVersusGame(payload.payload.secretWord);
        })
        .on('broadcast', { event: 'versus-guess' }, (payload) => {
            console.log("Received versus-guess", payload);
            handleVersusGuess(payload);
        })
        .on('broadcast', { event: 'versus-end' }, (payload) => {
            console.log("Received versus-end", payload);
            handleVersusEnd(payload);
        })
        .on('broadcast', { event: 'versus-kick' }, (payload) => {
            console.log("Received versus-kick", payload);
            handleVersusKick(payload);
        });
        
    // Subscribe to channel
    roomChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            console.log(`Subscribed to room-${roomCode} channel.`);
            showToast("Terhubung ke server Realtime!");
        }
    });
}

function shareRoomToLobby() {
    if (typeof supabase === 'undefined' || !supabaseClient || !roomCode || !isHost) return;

    if (lobbyChannel) {
        supabaseClient.removeChannel(lobbyChannel);
        lobbyChannel = null;
    }

    lobbyChannel = supabaseClient.channel('arcade-lobby', {
        config: {
            presence: {
                key: myClientId,
            },
        },
    });

    lobbyChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            isSharedToLobby = true;
            lobbyChannel.track({
                roomCode: roomCode,
                game: 'wordle',
                hostName: myUsername,
                playerCount: 1,
                maxPlayers: 2,
                updatedAt: new Date().toISOString()
            });

            const shareBtn = document.getElementById('btn-share-lobby');
            if (shareBtn) {
                shareBtn.disabled = true;
                shareBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Telah Dibagikan';
                shareBtn.className = "px-3 py-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-600/20 rounded text-[10px] font-bold cursor-not-allowed flex items-center justify-center gap-1";
            }
            showToast("Room berhasil dibagikan ke Lobby!");
        }
    });
}

function handlePresenceSync(presenceState) {
    const players = [];
    let opponentFound = false;

    Object.keys(presenceState).forEach(key => {
        const presences = presenceState[key];
        presences.forEach(p => {
            players.push(p);
        });
    });

    // Sort: Host first, then Guests chronologically
    players.sort((a, b) => {
        if (a.role === 'host' && b.role !== 'host') return -1;
        if (a.role !== 'host' && b.role === 'host') return 1;
        
        const timeA = a.onlineAt ? new Date(a.onlineAt).getTime() : Date.now();
        const timeB = b.onlineAt ? new Date(b.onlineAt).getTime() : Date.now();
        return timeA - timeB;
    });

    const isMeTracked = players.some(p => p.clientId === myClientId);
    if (!isMeTracked) {
        if (players.length >= 2) {
            showToast("Room penuh! Maksimal 2 pemain.");
            leaveVersusRoom(true);
            return;
        }
        
        // Track ourselves
        roomChannel.track({
            username: myUsername,
            role: isHost ? 'host' : 'guest',
            clientId: myClientId,
            onlineAt: new Date().toISOString()
        });
        return;
    }

    const myIdx = players.findIndex(p => p.clientId === myClientId);
    if (myIdx >= 2) {
        showToast("Room penuh! Maksimal 2 pemain.");
        leaveVersusRoom(true);
        return;
    }

    // Slice to active players only (max 2)
    const activePlayers = players.slice(0, 2);

    // Update lobby room player count in real-time
    if (isHost && isSharedToLobby && lobbyChannel) {
        lobbyChannel.track({
            roomCode: roomCode,
            game: 'wordle',
            hostName: myUsername,
            playerCount: activePlayers.length,
            maxPlayers: 2,
            updatedAt: new Date().toISOString()
        });
    }

    // --- CHECK IF HOST LEFT THE ROOM ---
    if (!isHost && activePlayers.length > 0 && !activePlayers.some(p => p.role === 'host')) {
        showToast('Host telah menutup room.');
        Swal.fire({
            background: '#0f1623', color: '#e5e7eb', confirmButtonColor: '#8b5cf6',
            title: 'Room Ditutup', html: 'Host telah menutup room ini.',
            icon: 'info', iconColor: '#6366f1', confirmButtonText: 'OK',
        }).then(() => { leaveVersusRoom(true); window.location.href = '../'; });
        return;
    }

    // Transition UI for Guest if we are inside the room and successfully validated
    if (!isHost && document.getElementById('room-info-area').classList.contains('hidden')) {
        transitionUIForGuest();
    }

    activePlayers.forEach(p => {
        if (p.clientId !== myClientId) {
            opponentFound = true;
            opponentName = p.username;
        }
    });

    // --- GUEST LEFT: RESET OPPONENT STATE FOR HOST ---
    if (isHost && !opponentFound) {
        opponentGuesses = [];
        opponentFinished = false;
        opponentName = "";
        
        // Reset opponent grid visually
        const oppCells = document.querySelectorAll('#wordle-board-opponent .grid-cell');
        oppCells.forEach(cell => {
            cell.textContent = "";
            cell.className = "grid-cell";
        });
        
        // Reset mask
        const mask = document.getElementById('opponent-mask');
        if (mask) {
            mask.classList.remove('revealed');
            const statusText = document.getElementById('opponent-status-text');
            if (statusText) statusText.textContent = "Menunggu lawan bergabung...";
        }
    }

    // Update active players list UI
    const container = document.getElementById('player-list-container');
    if (container) {
        container.innerHTML = activePlayers.map(p => {
            const isMe = p.clientId === myClientId;
            let roleBadge = p.role === 'host' ? '<span class="px-1 bg-emerald-500/20 text-emerald-400 rounded text-[8px]">HOST</span>' : '<span class="px-1 bg-amber-500/20 text-amber-400 rounded text-[8px]">TAMU</span>';
            
            if (isHost && !isMe && p.role === 'guest') {
                roleBadge += `
                    <button onclick="kickGuest('${p.clientId}', '${p.username}')" class="ml-1 px-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/20 rounded text-[8px] font-bold transition">
                        Kick
                    </button>
                `;
            }

            return `
                <div class="flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full ${isMe ? 'bg-emerald-500' : 'bg-blue-400'}"></span>
                    <span class="font-bold ${isMe ? 'text-emerald-400' : 'text-gray-300'}">${p.username}</span>
                    ${roleBadge}
                </div>
            `;
        }).join('<span class="text-gray-700">|</span>');
    }

    // Enable/disable start button for Host based on guest presence
    if (isHost) {
        const startBtn = document.getElementById('btn-start-versus');
        if (startBtn) {
            if (opponentFound) {
                startBtn.classList.remove('hidden');
            } else {
                startBtn.classList.add('hidden');
            }
        }
    }
}

async function startVersusGame() {
    if (!isHost || !roomChannel) return;
    
    showToast("Memulai game...");
    
    let word = "";
    try {
        const { data, error } = await supabaseClient.rpc('get_random_wordle_word');
        if (error) throw error;
        word = data.toUpperCase();
    } catch (err) {
        console.error("Gagal mengambil kata dari Supabase", err);
        word = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
    }

    // Broadcast to everyone in the room
    roomChannel.send({
        type: 'broadcast',
        event: 'versus-start',
        payload: { secretWord: word }
    });

    // Start locally for Host
    startLocalVersusGame(word);
}

function startLocalVersusGame(word) {
    if (lobbyChannel) {
        supabaseClient.removeChannel(lobbyChannel);
        lobbyChannel = null;
    }
    isSharedToLobby = false;

    secretWord = word;
    currentRow = 0;
    currentTile = 0;
    gameActive = true;
    isAnimating = false;
    opponentGuesses = [];
    myFinished = false;
    opponentFinished = false;
    opponentOutcome = "";
    opponentFinalRow = 0;

    // Reset local grid
    const cells = document.querySelectorAll('#wordle-board .grid-cell');
    cells.forEach(cell => {
        cell.textContent = "";
        cell.className = "grid-cell";
    });

    // Reset opponent grid
    const oppCells = document.querySelectorAll('#wordle-board-opponent .grid-cell');
    oppCells.forEach(cell => {
        cell.textContent = "";
        cell.className = "grid-cell";
    });

    // Reset keyboard keys
    const keys = document.querySelectorAll('.key-btn');
    keys.forEach(key => {
        key.classList.remove('correct', 'present', 'absent');
    });

    // Hide modals
    helpModal.classList.add('hidden');
    statsModal.classList.add('hidden');
    document.getElementById('answer-reveal-area').classList.add('hidden');

    // Setup mask
    const mask = document.getElementById('opponent-mask');
    if (mask) {
        mask.classList.remove('revealed');
        document.getElementById('opponent-status-text').textContent = "Sedang bermain... Tebakan 0/6";
    }

    showToast("Permainan Versus Dimulai!");
}

function handleVersusGuess(data) {
    const payload = data.payload;
    if (payload.clientId === myClientId) return; // Ignore own broadcast

    const row = payload.row;
    opponentGuesses[row] = {
        guess: payload.guess,
        grades: payload.grades
    };

    // Re-render opponent board
    renderOpponentGuessesLive();

    // Update mask visibility and text
    updateOpponentMaskVisibility();
    
    // If mask is still active, update status text with progress row count
    const mask = document.getElementById('opponent-mask');
    if (mask && !mask.classList.contains('revealed')) {
        const maskText = document.getElementById('opponent-status-text');
        if (maskText) {
            let myLastGuess = "";
            for (let c = 0; c < 5; c++) {
                const cell = document.getElementById(`cell-${currentRow}-${c}`);
                if (cell) myLastGuess += cell.textContent;
            }
            const myWin = (myFinished && myLastGuess === secretWord);
            if (myFinished && myWin) {
                maskText.textContent = `Anda menang! Lawan tebakan ${row + 1}/6...`;
            } else {
                maskText.textContent = `Lawan sedang menebak... Tebakan ${row + 1}/6`;
            }
        }
    }
}

function handleVersusEnd(data) {
    const payload = data.payload;
    if (payload.clientId === myClientId) return; // Ignore own broadcast

    opponentFinished = true;
    opponentOutcome = payload.outcome;
    opponentFinalRow = payload.row;

    // Store final guess
    opponentGuesses[payload.row] = {
        guess: payload.guess,
        grades: payload.grades
    };

    // Update mask visibility and re-render board
    updateOpponentMaskVisibility();
    renderOpponentGuessesLive();

    showToast("Lawan telah selesai!");

    // NEW RULE: If one player wins first, the entire game ends immediately for both!
    if (payload.outcome === 'win') {
        myFinished = true;
        gameActive = false;
        endVersusMatch();
        return;
    }

    // Check if we are also finished. If yes, end the match!
    if (myFinished) {
        endVersusMatch();
    }
}

function updateOpponentMaskVisibility() {
    const mask = document.getElementById('opponent-mask');
    if (!mask) return;

    let myLastGuess = "";
    for (let c = 0; c < 5; c++) {
        const cell = document.getElementById(`cell-${currentRow}-${c}`);
        if (cell) myLastGuess += cell.textContent;
    }
    const myWin = (myFinished && myLastGuess === secretWord);

    // Opponent board is visible if I finished and I lost, or if both of us finished
    const shouldUnmaskOpponent = myFinished && (!myWin || opponentFinished);

    if (shouldUnmaskOpponent) {
        mask.classList.add('revealed');
    } else {
        mask.classList.remove('revealed');
        // Update mask text based on state
        const maskText = document.getElementById('opponent-status-text');
        if (maskText) {
            if (myFinished && myWin) {
                maskText.textContent = "Anda menang! Menunggu lawan selesai...";
            } else if (!gameActive && !myFinished) {
                maskText.textContent = "Menunggu host memulai...";
            } else {
                maskText.textContent = "Sedang bermain...";
            }
        }
    }
}

function renderOpponentGuessesLive() {
    let myLastGuess = "";
    for (let c = 0; c < 5; c++) {
        const cell = document.getElementById(`cell-${currentRow}-${c}`);
        if (cell) myLastGuess += cell.textContent;
    }
    const myWin = (myFinished && myLastGuess === secretWord);
    
    // We can see details if I finished and I failed, or if both of us finished
    const canSeeDetails = myFinished && (!myWin || opponentFinished);

    for (let r = 0; r < 6; r++) {
        const rowEl = document.getElementById(`opp-row-${r}`);
        if (!rowEl) continue;
        const cells = rowEl.querySelectorAll('.grid-cell');
        const guessObj = opponentGuesses[r];

        if (guessObj) {
            if (canSeeDetails) {
                const guessWord = guessObj.guess;
                const grades = guessObj.grades;
                cells.forEach((cell, idx) => {
                    cell.textContent = guessWord[idx];
                    cell.className = `grid-cell ${grades[idx]}`;
                });
            } else {
                // Show neutral progress boxes
                cells.forEach((cell, idx) => {
                    cell.textContent = "";
                    cell.className = "grid-cell typed";
                });
            }
        } else {
            // Empty row
            cells.forEach(cell => {
                cell.textContent = "";
                cell.className = "grid-cell";
            });
        }
    }
}

function endVersusMatch() {
    gameActive = false;
    isAnimating = false;

    // Both are done, unmask and render everything fully
    const mask = document.getElementById('opponent-mask');
    if (mask) {
        mask.classList.add('revealed');
    }

    // Force detail visibility
    opponentFinished = true;
    renderOpponentGuessesLive();

    // Determine outcomes
    let myLastGuess = "";
    for (let c = 0; c < 5; c++) {
        const cell = document.getElementById(`cell-${currentRow}-${c}`);
        if (cell) myLastGuess += cell.textContent;
    }
    const myWin = (myLastGuess === secretWord);
    const oppWin = (opponentOutcome === 'win');
    const myLose = (!myWin && currentRow === 5);

    let titleText = "Hasil Pertandingan";
    let messageText = "";

    if (myWin && oppWin) {
        if (currentRow < opponentFinalRow) {
            titleText = "Anda Menang!";
            messageText = `Selamat! Anda berhasil menebak dalam ${currentRow + 1} baris, sedangkan lawan dalam ${opponentFinalRow + 1} baris.`;
        } else if (currentRow > opponentFinalRow) {
            titleText = "Lawan Menang!";
            messageText = `${opponentName || 'Lawan'} berhasil menebak dalam ${opponentFinalRow + 1} baris, sedangkan Anda dalam ${currentRow + 1} baris.`;
        } else {
            titleText = "Hasil Seri!";
            messageText = `Kedua pemain berhasil menebak kata rahasia dalam ${currentRow + 1} baris!`;
        }
    } else if (myWin) {
        titleText = "Anda Menang!";
        messageText = `Selamat! Anda berhasil menebak kata rahasia [${secretWord}], sedangkan lawan gagal!`;
    } else if (oppWin) {
        titleText = "Lawan Menang!";
        messageText = `${opponentName || 'Lawan'} berhasil menebak kata rahasia [${secretWord}], sedangkan Anda gagal!`;
    } else {
        titleText = "Permainan Selesai!";
        messageText = `Kedua pemain gagal menebak kata rahasia [${secretWord}].`;
    }

    // Update stats
    if (myWin) {
        stats.played++;
        stats.won++;
        stats.streak++;
        if (stats.streak > stats.maxStreak) {
            stats.maxStreak = stats.streak;
        }
        stats.distribution[currentRow]++;
        saveStatsToStorage();
    } else if (myLose || oppWin) {
        stats.played++;
        stats.streak = 0;
        saveStatsToStorage();
    }

    showToast(titleText);
    
    // Show stats modal after 4 seconds
    setTimeout(() => {
        const badge = document.getElementById('game-status-badge');
        const title = document.getElementById('stats-main-title');
        
        badge.textContent = "MULTIPLAYER";
        badge.className = "text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-widest block w-max mx-auto mb-2 bg-blue-500/20 text-blue-400 border border-blue-500/30";
        title.textContent = titleText;
        
        document.getElementById('revealed-secret-word').textContent = secretWord;
        document.getElementById('answer-reveal-area').classList.remove('hidden');

        let resultMsgDiv = document.getElementById('multiplayer-result-msg');
        if (!resultMsgDiv) {
            resultMsgDiv = document.createElement('div');
            resultMsgDiv.id = 'multiplayer-result-msg';
            resultMsgDiv.className = 'w-full p-3 rounded-xl bg-blue-950/40 border border-blue-900/30 text-xs text-blue-200 mb-4 text-center font-medium leading-relaxed';
            const statsTitleArea = document.getElementById('stats-title-area');
            statsTitleArea.parentNode.insertBefore(resultMsgDiv, statsTitleArea.nextSibling);
        }
        resultMsgDiv.textContent = messageText;
        resultMsgDiv.classList.remove('hidden');

        updateStatsModalUI();
        toggleStatsModal(true);
    }, 4000);
}

function handleVersusKick(data) {
    const payload = data.payload;
    if (payload.targetClientId === myClientId) {
        showToast('Anda telah dikeluarkan dari room oleh Host.');
        Swal.fire({
            background: '#0f1623', color: '#e5e7eb', confirmButtonColor: '#ef4444',
            title: 'Dikeluarkan!', html: 'Anda telah dikeluarkan dari room oleh Host.',
            icon: 'error', iconColor: '#ef4444', confirmButtonText: 'OK',
        }).then(() => { leaveVersusRoom(true); window.location.href = '../'; });
    }
}

function kickGuest(clientId, username) {
    if (!isHost || !roomChannel) return;
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
            roomChannel.send({
                type: 'broadcast',
                event: 'versus-kick',
                payload: { targetClientId: clientId }
            });
        }
    });
}

let opponentBoardVisibleMobile = true;

function toggleOpponentBoardMobile() {
    opponentBoardVisibleMobile = !opponentBoardVisibleMobile;
    const oppBoardWrapper = document.getElementById('opponent-board-wrapper');
    const toggleBtn = document.getElementById('btn-toggle-opponent-board');
    
    if (!oppBoardWrapper || !toggleBtn) return;
    
    if (opponentBoardVisibleMobile) {
        oppBoardWrapper.classList.remove('hidden');
        oppBoardWrapper.classList.add('flex');
        toggleBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Sembunyikan Papan Lawan';
        toggleBtn.classList.remove('text-gray-400');
        toggleBtn.classList.add('text-emerald-400');
    } else {
        oppBoardWrapper.classList.add('hidden');
        oppBoardWrapper.classList.remove('flex');
        toggleBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Tampilkan Papan Lawan';
        toggleBtn.classList.remove('text-emerald-400');
        toggleBtn.classList.add('text-gray-400');
    }
}
