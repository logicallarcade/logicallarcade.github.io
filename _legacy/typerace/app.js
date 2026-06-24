// Logicall Type Race - Game Controller & Multiplayer Sync with Supabase Presence
const SUPABASE_URL = 'https://xoopahkzmfibfnxzmqfk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_pSbbyCzo8R0oPeyK_xwGtg_C81049id';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- INDONESIAN QUOTE POOL ---
const QUOTES_POOL = [
    "Belajar tanpa berpikir itu tidak berguna, berpikir tanpa belajar itu sangat berbahaya.",
    "Hari esok adalah halaman kosong, tulislah kisah terbaikmu di sana dengan penuh semangat.",
    "Kemajuan teknologi harus diimbangi dengan peningkatan kebijaksanaan dalam pemanfaatannya.",
    "Kegagalan hanyalah kesempatan untuk memulai lagi dengan cara yang lebih cerdas dan matang.",
    "Semua impian kita bisa menjadi nyata jika kita memiliki keberanian untuk mengejarnya tanpa lelah.",
    "Masa depan adalah milik mereka yang percaya pada keindahan mimpi-mimpi mereka sendiri.",
    "Pendidikan adalah tiket hari esok, karena hari esok dimiliki oleh orang-orang yang mempersiapkan diri hari ini.",
    "Kita tidak bisa memecahkan masalah dengan menggunakan jenis pemikiran yang sama seperti saat kita menciptakannya.",
    "Kehidupan yang baik adalah kehidupan yang diinspirasikan oleh cinta dan dipandu oleh pengetahuan.",
    "Keberhasilan tidak diukur dari apa yang Anda capai, melainkan dari rintangan yang Anda hadapi untuk mencapainya.",
    "Jangan pernah menunda pekerjaanmu sampai besok jika kamu bisa menyelesaikannya hari ini.",
    "Untuk mencapai hal-hal besar, kita tidak hanya harus bertindak, tetapi juga bermimpi dan percaya.",
    "Bagian terbaik dari hidup seseorang adalah perbuatan-perbuatan baiknya yang kecil dan tanpa nama.",
    "Disiplin adalah jembatan antara cita-cita dan pencapaian nyata di dunia.",
    "Meskipun tidak ada orang yang bisa kembali ke masa lalu untuk membuat awal yang baru, siapa pun bisa mulai sekarang untuk membuat akhir yang baru.",
    "Hanya orang yang berani menghadapi kegagalan besar yang dapat mencapai keberhasilan besar.",
    "Keberhasilan bukanlah akhir, kegagalan bukanlah hal yang fatal: itu adalah keberanian untuk melanjutkan yang penting.",
    "Setiap tindakan kecil dari kebaikan akan menciptakan gelombang yang kembali kepada kita dalam bentuk yang tak terduga.",
    "Bekerja keras dalam diam dan biarkan kesuksesan Anda yang menjadi suara bising di sekitar Anda.",
    "Kunci untuk menjadi bahagia adalah menerima keadaan hari ini sambil terus berusaha membangun masa depan yang cerah."
];

// --- GAME CONFIG & STATE ---
let currentQuote = "";
let quoteWords = [];
let totalCharacters = 0;

// Typing trackers
let currentWordIndex = 0;
let typedCorrectCharsCount = 0;
let isTypingActive = false;
let gameStartTime = null;
let timerInterval = null;
let gameDuration = 60; // dynamic seconds
let remainingSeconds = 60;

// User state
let myUsername = "Pemain 1";
const myClientId = Math.random().toString(36).substring(2, 10);
let isMultiplayer = false;
let isHost = false;
let roomCode = "";
let maxPlayers = 4;
let isSharedToLobby = false;
let isLeavingRoom = false;

// Sync Channels
let roomChannel = null;
let lobbyChannel = null;

// Players & Bots lists
let playersList = []; // Real multiplayer players
let opponents = []; // Active opponents (bots or real players) in track display
let leaderboard = []; // Podium final rankings
let myFinishedState = null;

// SwAl dark mode settings
const swalDark = {
    background: '#0f1623',
    color: '#e5e7eb',
    confirmButtonColor: '#f59e0b',
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

    // 2. Setup Solo Lanes initially
    setupSoloLanes();

    // 3. Setup Input Listeners
    const typingInput = document.getElementById('typing-input');
    if (typingInput) {
        typingInput.addEventListener('input', handleTypingInput);
        // Focus handler for keyboard keys animation (active passive visual)
        typingInput.addEventListener('keydown', handleKeyDownAnimation);
        typingInput.addEventListener('keyup', handleKeyUpAnimation);
    }

    // 4. Check for room code parameter
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
        document.getElementById('room-code-input').value = roomParam.trim().toUpperCase();
        setTimeout(() => {
            joinVersusRoomByCode();
        }, 300);
    } else {
        // Init a fresh passage as guide
        resetGameSession();
    }
});

// --- VISUAL KEYBOARD INTERACTIVITY (Optional micro-animation feedback) ---
function handleKeyDownAnimation(e) {
    const key = e.key.toUpperCase();
    const keyBtn = document.querySelector(`.key-btn[data-key="${key === ' ' ? 'ENTER' : key}"]`);
    if (keyBtn) {
        keyBtn.classList.add('active');
    }
    const keyboard = document.getElementById('keyboard-container');
    if (keyboard) {
        keyboard.classList.add('active');
    }
}
function handleKeyUpAnimation(e) {
    const key = e.key.toUpperCase();
    const keyBtn = document.querySelector(`.key-btn[data-key="${key === ' ' ? 'ENTER' : key}"]`);
    if (keyBtn) {
        keyBtn.classList.remove('active');
    }
}

// --- SETUP RACING TRACKS UI ---
function setupSoloLanes() {
    const botCount = parseInt(document.getElementById('bot-count-select').value);
    
    // Create local opponents (Bots)
    opponents = [];
    const botSpeeds = [35, 45, 58]; // WPM values
    const botNames = ["Racer Andi [Bot]", "Racer Budi [Bot]", "Racer Citra [Bot]"];
    const carIcons = ["fa-solid fa-car-side text-sky-400", "fa-solid fa-car-side text-emerald-400", "fa-solid fa-car-side text-rose-400"];

    for (let i = 0; i < botCount; i++) {
        opponents.push({
            clientId: `bot-${i}`,
            username: botNames[i],
            isBot: true,
            wpm: botSpeeds[i],
            carIcon: carIcons[i],
            progress: 0,
            currentWpm: 0,
            status: 'playing',
            finishedTime: null
        });
    }

    renderRaceTracks();
}

function adjustBotCount(val) {
    if (isMultiplayer) return;
    setupSoloLanes();
}

function renderRaceTracks() {
    const container = document.getElementById('tracks-container');
    if (!container) return;

    // Me/Player track details
    const myProgress = myFinishedState ? 100 : calculateProgressPercent();
    const myWpm = myFinishedState ? myFinishedState.wpm : calculateCurrentWpm();

    let html = `
        <!-- MY LANE -->
        <div class="track-row">
            <div class="track-meta">
                <div class="track-name-wrapper">
                    <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    <span class="track-name">${escapeHTML(myUsername)} <span class="text-[9px] text-amber-500 font-extrabold">(Anda)</span></span>
                </div>
                <span class="track-stats" id="my-lane-stats">${myWpm} WPM - ${myProgress}%</span>
            </div>
            <div class="track-lane">
                <div class="racer-car" style="left: clamp(0px, calc(${myProgress}% - 32px), calc(100% - 36px))">
                    <i class="fa-solid fa-car-side text-amber-400 text-lg"></i>
                </div>
                <div class="finish-line"></div>
            </div>
        </div>
    `;

    // Opponent lanes (Bots or Other Players)
    opponents.forEach(opp => {
        const progress = opp.finishedTime ? 100 : opp.progress;
        const wpm = opp.finishedTime ? opp.wpm : opp.currentWpm;
        const iconClass = opp.carIcon || "fa-solid fa-car-side text-gray-400";
        const roleLabel = opp.isBot ? "Bot" : (opp.isHost ? "Host" : "Tamu");
        const dotColor = opp.isBot ? "bg-gray-500" : "bg-cyan-500";

        html += `
            <div class="track-row">
                <div class="track-meta">
                    <div class="track-name-wrapper">
                        <span class="w-2 h-2 rounded-full ${dotColor}"></span>
                        <span class="track-name">${escapeHTML(opp.username)} <span class="text-[8px] opacity-60 font-bold">(${roleLabel})</span></span>
                    </div>
                    <span class="track-stats">${wpm} WPM - ${progress}%</span>
                </div>
                <div class="track-lane">
                    <div class="racer-car" style="left: clamp(0px, calc(${progress}% - 32px), calc(100% - 36px))">
                        <i class="${iconClass}"></i>
                    </div>
                    <div class="finish-line"></div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// --- GAMEPLAY MECHANICS ---
function resetGameSession() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    isTypingActive = false;
    currentWordIndex = 0;
    typedCorrectCharsCount = 0;
    gameStartTime = null;
    myFinishedState = null;
    leaderboard = [];

    // Clear stats dashboard
    document.getElementById('metric-wpm').textContent = "0";
    document.getElementById('metric-cpm').textContent = "0";
    document.getElementById('metric-progress').textContent = "0%";

    const input = document.getElementById('typing-input');
    if (input) {
        input.value = "";
        input.disabled = true;
        input.placeholder = "Tekan 'Mulai' untuk memulai balapan!";
        input.classList.remove('typo');
    }

    document.getElementById('timer-display').textContent = "--";

    // Set default guide passage
    document.getElementById('passage-container').innerHTML = 
        `<span class="text-gray-500">Paragraf akan muncul di sini setelah hitung mundur dimulai. Ketik secepat mungkin dengan keyboard bawaan device Anda!</span>`;
    
    // Clear bot state progress
    opponents.forEach(opp => {
        opp.progress = 0;
        opp.currentWpm = 0;
        opp.status = 'playing';
        opp.finishedTime = null;
    });

    renderRaceTracks();
}

function selectRandomQuote() {
    const idx = Math.floor(Math.random() * QUOTES_POOL.length);
    currentQuote = QUOTES_POOL[idx];
    quoteWords = currentQuote.split(' ');
    totalCharacters = currentQuote.length;

    // Calculate Dynamic Duration: average typing speed target 20 WPM (100 CPM) + buffer
    // W = wordCount. W / 20 = minutes. e.g. 15 words = 0.75 mins = 45 seconds + 10s buffer
    const wordCount = quoteWords.length;
    gameDuration = Math.max(30, Math.ceil((wordCount / 20) * 60) + 10);
    remainingSeconds = gameDuration;

    document.getElementById('timer-display').textContent = remainingSeconds;
}

function startCountdown(onCompleteCallback) {
    const overlay = document.getElementById('countdown-overlay');
    const text = document.getElementById('countdown-text');
    const dot1 = document.getElementById('dot-1');
    const dot2 = document.getElementById('dot-2');
    const dot3 = document.getElementById('dot-3');

    overlay.classList.remove('hidden');
    
    let count = 5;
    
    const updateCountdownVisuals = () => {
        text.textContent = count > 0 ? `Bersiap... ${count}` : "GO!";
        
        // Traffic light styling
        if (count > 3) {
            // RED
            dot1.className = "w-3.5 h-3.5 rounded-full bg-rose-500 shadow-lg shadow-rose-500/50";
            dot2.className = "w-3.5 h-3.5 rounded-full bg-gray-700";
            dot3.className = "w-3.5 h-3.5 rounded-full bg-gray-700";
        } else if (count > 1) {
            // YELLOW
            dot1.className = "w-3.5 h-3.5 rounded-full bg-rose-500 opacity-40";
            dot2.className = "w-3.5 h-3.5 rounded-full bg-amber-500 shadow-lg shadow-amber-500/50";
            dot3.className = "w-3.5 h-3.5 rounded-full bg-gray-700";
        } else if (count > 0) {
            // PRE-GREEN
            dot1.className = "w-3.5 h-3.5 rounded-full bg-gray-700";
            dot2.className = "w-3.5 h-3.5 rounded-full bg-amber-500 shadow-lg shadow-amber-500/50";
            dot3.className = "w-3.5 h-3.5 rounded-full bg-emerald-500 opacity-40";
        } else {
            // GREEN / GO!
            dot1.className = "w-3.5 h-3.5 rounded-full bg-gray-700";
            dot2.className = "w-3.5 h-3.5 rounded-full bg-gray-700";
            dot3.className = "w-3.5 h-3.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-ping";
        }
    };

    updateCountdownVisuals();
    
    const cdInterval = setInterval(() => {
        count--;
        updateCountdownVisuals();
        
        if (count < 0) {
            clearInterval(cdInterval);
            overlay.classList.add('hidden');
            onCompleteCallback();
        }
    }, 1000);
}

function launchTypingGame() {
    renderPassageHTML();
    
    // Enable & Focus Input
    const input = document.getElementById('typing-input');
    input.disabled = false;
    input.value = "";
    input.placeholder = "Ketik paragraf di atas di sini...";
    input.focus();

    // Start clock timer
    isTypingActive = true;
    gameStartTime = new Date();
    
    timerInterval = setInterval(() => {
        if (!isTypingActive) return;

        remainingSeconds--;
        document.getElementById('timer-display').textContent = remainingSeconds;

        // Update statistics
        updateRealtimeMetrics();

        // Tick Bots if Solo mode
        if (!isMultiplayer) {
            tickBotsSimulation();
        }

        renderRaceTracks();

        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            handleTimeExpired();
        }
    }, 1000);
}

// Render passage with precise character wrapping for glow highlights
function renderPassageHTML() {
    const container = document.getElementById('passage-container');
    if (!container) return;

    let charIndexGlobal = 0;
    const inputVal = document.getElementById('typing-input').value;

    const html = quoteWords.map((word, wIdx) => {
        const isCurrentWord = (wIdx === currentWordIndex);
        const isPastWord = (wIdx < currentWordIndex);
        
        // Wrap word characters
        const wordChars = word.split('').map((char, cIdx) => {
            let className = "text-gray-400";
            
            if (isPastWord) {
                className = "char-correct";
            } else if (isCurrentWord) {
                if (cIdx < inputVal.length) {
                    if (inputVal[cIdx] === char) {
                        className = "char-correct";
                    } else {
                        className = "char-incorrect";
                    }
                } else if (cIdx === inputVal.length) {
                    className = "char-current"; // active cursor highlight
                }
            }
            
            charIndexGlobal++;
            return `<span class="${className}">${char}</span>`;
        }).join('');

        // Space divider logic (do not add space after last word)
        let spaceHtml = '';
        if (wIdx < quoteWords.length - 1) {
            let spaceClass = "text-gray-400";
            if (isPastWord) {
                spaceClass = "char-correct";
            } else if (isCurrentWord && inputVal.length >= word.length) {
                // If they typed the whole current word correctly but haven't pressed space
                if (inputVal === word) {
                    spaceClass = "char-current";
                } else {
                    spaceClass = "char-incorrect";
                }
            }
            spaceHtml = `<span class="${spaceClass}"> </span>`;
        }

        const wordClass = isCurrentWord ? "border-b border-dashed border-amber-500/40 pb-0.5" : "";
        return `<span class="${wordClass}">${wordChars}</span>${spaceHtml}`;
    }).join('');

    container.innerHTML = html;
}

// Handle typing input event
function handleTypingInput(e) {
    if (!isTypingActive) return;

    const input = document.getElementById('typing-input');
    const val = input.value;
    const targetWord = quoteWords[currentWordIndex];
    if (!targetWord) return;

    // Handle space to advance word
    if (val.endsWith(' ')) {
        const trimmedVal = val.trim();
        // Only advance if the trimmed part fully matches the target word
        if (trimmedVal === targetWord) {
            // Count characters typed correctly (word + space)
            typedCorrectCharsCount += targetWord.length + 1;
            currentWordIndex++;
            input.value = "";
            input.classList.remove('typo');

            // Send Realtime Progress in multiplayer
            if (isMultiplayer) {
                broadcastProgress();
            }
        } else {
            // Prevent advancing with wrong word — keep the typo state but remove trailing space
            input.value = trimmedVal;
            input.classList.add('typo');
        }
        renderPassageHTML();
        updateRealtimeMetrics();
        renderRaceTracks();
        return;
    }

    // Last word completion (no space required)
    if (currentWordIndex === quoteWords.length - 1 && val === targetWord) {
        typedCorrectCharsCount += targetWord.length;
        handleGameFinished();
        return;
    }

    // Check for typo in current word (only against what's typed so far)
    const currentTypedSection = val.slice(0, Math.min(val.length, targetWord.length));
    const isTypo = !targetWord.startsWith(currentTypedSection) || val.length > targetWord.length;
    if (isTypo) {
        input.classList.add('typo');
    } else {
        input.classList.remove('typo');
    }

    renderPassageHTML();
    updateRealtimeMetrics();
    renderRaceTracks();
}

function calculateProgressPercent() {
    if (totalCharacters === 0) return 0;
    // Calculate progress as completed characters + current correct typed chars
    let currentCorrectInWord = 0;
    if (quoteWords[currentWordIndex]) {
        const inputVal = document.getElementById('typing-input').value;
        const targetWord = quoteWords[currentWordIndex];
        for (let i = 0; i < inputVal.length; i++) {
            if (inputVal[i] === targetWord[i]) {
                currentCorrectInWord++;
            } else {
                break; // stop counting once typo starts
            }
        }
    }

    const totalTypedCorrect = typedCorrectCharsCount + currentCorrectInWord;
    return Math.min(100, Math.round((totalTypedCorrect / totalCharacters) * 100));
}

function calculateCurrentWpm() {
    if (!gameStartTime) return 0;
    const elapsedSeconds = (new Date() - gameStartTime) / 1000;
    if (elapsedSeconds < 1) return 0;

    // Standard formula: (chars / 5) / minutes
    // chars is the count of correct typed characters
    let currentCorrectInWord = 0;
    if (quoteWords[currentWordIndex]) {
        const inputVal = document.getElementById('typing-input').value;
        const targetWord = quoteWords[currentWordIndex];
        for (let i = 0; i < inputVal.length; i++) {
            if (inputVal[i] === targetWord[i]) {
                currentCorrectInWord++;
            } else {
                break;
            }
        }
    }
    const chars = typedCorrectCharsCount + currentCorrectInWord;
    const wpm = (chars / 5) / (elapsedSeconds / 60);
    return Math.round(wpm);
}

function calculateCurrentCpm() {
    if (!gameStartTime) return 0;
    const elapsedSeconds = (new Date() - gameStartTime) / 1000;
    if (elapsedSeconds < 1) return 0;

    let currentCorrectInWord = 0;
    if (quoteWords[currentWordIndex]) {
        const inputVal = document.getElementById('typing-input').value;
        const targetWord = quoteWords[currentWordIndex];
        for (let i = 0; i < inputVal.length; i++) {
            if (inputVal[i] === targetWord[i]) {
                currentCorrectInWord++;
            } else {
                break;
            }
        }
    }
    const chars = typedCorrectCharsCount + currentCorrectInWord;
    const cpm = chars / (elapsedSeconds / 60);
    return Math.round(cpm);
}

function updateRealtimeMetrics() {
    const wpm = calculateCurrentWpm();
    const cpm = calculateCurrentCpm();
    const progress = calculateProgressPercent();

    document.getElementById('metric-wpm').textContent = wpm;
    document.getElementById('metric-cpm').textContent = cpm;
    document.getElementById('metric-progress').textContent = `${progress}%`;
}

// --- BOT GAMEPLAY ENGINE (SOLO) ---
function tickBotsSimulation() {
    if (!gameStartTime) return;
    const elapsedSeconds = (new Date() - gameStartTime) / 1000;

    opponents.forEach(bot => {
        if (bot.finishedTime) return;

        // Progress based on WPM speed (characters per minute = WPM * 5)
        // target progress = elapsed minutes * CPM / total characters
        const minutesElapsed = elapsedSeconds / 60;
        const botCpm = bot.wpm * 5;
        const typedCharacters = botCpm * minutesElapsed;

        // Add a tiny random fluctuation to simulate human speed variability
        const randomFactor = 1 + (Math.sin(elapsedSeconds + bot.wpm) * 0.1);
        const progress = Math.min(100, Math.round(((typedCharacters * randomFactor) / totalCharacters) * 100));
        
        bot.progress = progress;
        bot.currentWpm = Math.round(bot.wpm * randomFactor);

        if (bot.progress >= 100) {
            bot.progress = 100;
            bot.finishedTime = elapsedSeconds;
            bot.status = 'finished';
        }
    });
}

// --- GAME FINISH RESOLUTION ---
function handleGameFinished() {
    isTypingActive = false;
    if (timerInterval) clearInterval(timerInterval);

    const elapsedSeconds = Math.round((new Date() - gameStartTime) / 1000);
    const finalWpm = calculateCurrentWpm();
    const finalCpm = calculateCurrentCpm();

    myFinishedState = {
        username: myUsername,
        wpm: finalWpm,
        cpm: finalCpm,
        time: elapsedSeconds,
        accuracy: calculateAccuracy(),
        finishedTime: elapsedSeconds
    };

    // Disabled input box
    const input = document.getElementById('typing-input');
    if (input) {
        input.disabled = true;
        input.value = currentQuote;
        input.classList.remove('typo');
    }

    if (isMultiplayer) {
        // Broadcast completion state to room
        if (roomChannel) {
            roomChannel.send({
                type: 'broadcast',
                event: 'typerace-finished',
                payload: myFinishedState
            });
        }
        // Save locally to leaderboard
        addLeaderboardRank(myUsername, myClientId, finalWpm, finalCpm, elapsedSeconds, false);
    } else {
        // Solo mode leaderboard resolution
        opponents.forEach(bot => {
            if (!bot.finishedTime) {
                // If bot hasn't finished, calculate final simulated stats
                bot.finishedTime = Math.round(totalCharacters / (bot.wpm * 5) * 60);
                bot.progress = 100;
            }
        });

        // Compile ranking list
        leaderboard = [];
        leaderboard.push({
            username: myUsername,
            clientId: myClientId,
            wpm: finalWpm,
            cpm: finalCpm,
            time: elapsedSeconds,
            isBot: false
        });

        opponents.forEach(bot => {
            leaderboard.push({
                username: bot.username,
                clientId: bot.clientId,
                wpm: bot.wpm,
                cpm: bot.wpm * 5,
                time: Math.round(bot.finishedTime),
                isBot: true
            });
        });

        // Sort by time ascending
        leaderboard.sort((a, b) => a.time - b.time);

        showVictoryStatsModal();
    }
}

function calculateAccuracy() {
    // Simple mock character mapping: since they cannot proceed with typo,
    // we can record total mistakes and divide by characters. For now, we'll
    // count characters / total characters as 100% since mistakes must be corrected.
    // To make it interesting, let's assume accuracy is 100% or slightly lower based on WPM.
    return 100; // Since mistakes MUST be corrected to proceed, accuracy is effectively 100% at the end.
}

function handleTimeExpired() {
    isTypingActive = false;
    const finalWpm = calculateCurrentWpm();
    const finalCpm = calculateCurrentCpm();
    const progress = calculateProgressPercent();

    myFinishedState = {
        username: myUsername,
        wpm: finalWpm,
        cpm: finalCpm,
        time: gameDuration,
        accuracy: calculateAccuracy(),
        finishedTime: null,
        progress: progress
    };

    const input = document.getElementById('typing-input');
    if (input) {
        input.disabled = true;
    }

    if (isMultiplayer) {
        if (roomChannel) {
            roomChannel.send({
                type: 'broadcast',
                event: 'typerace-finished',
                payload: myFinishedState
            });
        }
        addLeaderboardRank(myUsername, myClientId, finalWpm, finalCpm, gameDuration, true, progress);
    } else {
        leaderboard = [];
        leaderboard.push({
            username: myUsername,
            clientId: myClientId,
            wpm: finalWpm,
            cpm: finalCpm,
            time: gameDuration,
            isBot: false,
            unfinished: true,
            progress: progress
        });

        opponents.forEach(bot => {
            const botFinished = bot.finishedTime !== null;
            leaderboard.push({
                username: bot.username,
                clientId: bot.clientId,
                wpm: bot.wpm,
                cpm: bot.wpm * 5,
                time: botFinished ? Math.round(bot.finishedTime) : gameDuration,
                isBot: true,
                unfinished: !botFinished,
                progress: botFinished ? 100 : bot.progress
            });
        });

        // Sort leaderboard
        leaderboard.sort((a, b) => {
            if (a.unfinished && b.unfinished) return b.progress - a.progress; // higher progress first
            if (a.unfinished) return 1; // unfinished goes last
            if (b.unfinished) return -1;
            return a.time - b.time; // finished fastest first
        });

        showVictoryStatsModal();
    }
}

function addLeaderboardRank(name, clientId, wpm, cpm, time, unfinished, progress = 100) {
    // Avoid double entries
    if (leaderboard.some(l => l.clientId === clientId)) return;

    leaderboard.push({
        username: name,
        clientId: clientId,
        wpm: wpm,
        cpm: cpm,
        time: time,
        isBot: false,
        unfinished: unfinished,
        progress: progress
    });

    // Check if everyone has finished
    const otherRealPlayers = playersList.filter(p => p.clientId !== myClientId);
    const finishedCount = leaderboard.length;
    const totalPlayersCount = playersList.length;

    // Sort leaderboard
    leaderboard.sort((a, b) => {
        if (a.unfinished && b.unfinished) return b.progress - a.progress;
        if (a.unfinished) return 1;
        if (b.unfinished) return -1;
        return a.time - b.time;
    });

    // Show stats modal for final standings once the user finishes
    showVictoryStatsModal();
}

function showVictoryStatsModal() {
    // Save to LocalStorage statistics
    if (myFinishedState) {
        let played = parseInt(localStorage.getItem('logicall_typerace_played') || '0');
        let totalWpm = parseInt(localStorage.getItem('logicall_typerace_total_wpm') || '0');
        let maxWpm = parseInt(localStorage.getItem('logicall_typerace_max_wpm') || '0');
        let maxCpm = parseInt(localStorage.getItem('logicall_typerace_max_cpm') || '0');

        played++;
        totalWpm += myFinishedState.wpm;
        if (myFinishedState.wpm > maxWpm) maxWpm = myFinishedState.wpm;
        if (myFinishedState.cpm > maxCpm) maxCpm = myFinishedState.cpm;

        localStorage.setItem('logicall_typerace_played', played);
        localStorage.setItem('logicall_typerace_total_wpm', totalWpm);
        localStorage.setItem('logicall_typerace_max_wpm', maxWpm);
        localStorage.setItem('logicall_typerace_max_cpm', maxCpm);
    }

    // Populate modal statistics UI
    updateGlobalStatsUI();

    // Populate game specific last perform
    const myRankIdx = leaderboard.findIndex(l => l.clientId === myClientId);
    const myRank = myRankIdx !== -1 ? myRankIdx + 1 : "-";
    document.getElementById('last-rank').innerHTML = myRank === 1 ? `🏆 Juara 1` : `Peringkat ${myRank}`;
    document.getElementById('last-wpm').textContent = `${myFinishedState ? myFinishedState.wpm : 0} WPM / ${myFinishedState ? myFinishedState.cpm : 0} CPM`;
    document.getElementById('last-time').textContent = myFinishedState && myFinishedState.finishedTime ? `${myFinishedState.time} detik` : `Gagal Selesai (${myFinishedState ? myFinishedState.progress : 0}%)`;
    document.getElementById('last-accuracy').textContent = `${myFinishedState ? myFinishedState.accuracy : 0}%`;

    // Populate Podium lists
    const podiumContainer = document.getElementById('podium-list-container');
    const podiumArea = document.getElementById('podium-area');
    
    if (podiumContainer) {
        podiumArea.classList.remove('hidden');
        podiumContainer.innerHTML = leaderboard.map((item, idx) => {
            const isMe = item.clientId === myClientId;
            const rank = idx + 1;
            let rankBadge = `${rank}.`;
            if (rank === 1) rankBadge = "🥇";
            else if (rank === 2) rankBadge = "🥈";
            else if (rank === 3) rankBadge = "🥉";

            const speedText = item.unfinished ? `Gagal (${item.progress}%)` : `${item.wpm} WPM / ${item.time}s`;
            const rowClass = isMe ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-900/60 border-gray-800';

            return `
                <div class="flex items-center justify-between p-2 rounded-lg border ${rowClass} text-xs">
                    <span class="flex items-center gap-1.5">
                        <span class="font-bold w-5">${rankBadge}</span>
                        <strong class="text-white">${escapeHTML(item.username)}</strong>
                        ${isMe ? '<span class="text-[9px] text-amber-500 font-bold">(Anda)</span>' : ''}
                    </span>
                    <span class="font-mono text-[10px] text-gray-400">${speedText}</span>
                </div>
            `;
        }).join('');
    }

    // Toggle Solo Start visual restore
    resetSoloStartButton();

    const isMultiplayerGuest = isMultiplayer && !isHost;

    Swal.fire({
        ...swalDark,
        title: myFinishedState && myFinishedState.finishedTime ? '🏁 Balapan Selesai!' : '⏰ Batas Waktu Habis!',
        html: `<div class="p-3 text-center"><h3 class="text-xl font-extrabold text-amber-400 mb-2">${myFinishedState && myFinishedState.finishedTime ? 'FINIS!' : 'GAME OVER'}</h3><p class="text-xs text-gray-400">Kecepatan Anda: <b>${myFinishedState ? myFinishedState.wpm : 0} WPM</b> dengan peringkat <b>${myRankIdx !== -1 ? myRankIdx + 1 : "-"}</b>.</p></div>`,
        icon: myFinishedState && myFinishedState.finishedTime && myRankIdx === 0 ? 'success' : 'info',
        showCancelButton: true,
        confirmButtonText: isMultiplayerGuest ? 'Menunggu Host...' : 'Balapan Lagi',
        cancelButtonText: 'Tutup Detail',
        reverseButtons: true,
        allowOutsideClick: true,
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
        } else {
            // Simply open stats modal dashboard on screen
            toggleStatsModal(true);
        }
    });
}

function updateGlobalStatsUI() {
    const played = localStorage.getItem('logicall_typerace_played') || '0';
    const totalWpm = parseInt(localStorage.getItem('logicall_typerace_total_wpm') || '0');
    const maxWpm = localStorage.getItem('logicall_typerace_max_wpm') || '0';
    const maxCpm = localStorage.getItem('logicall_typerace_max_cpm') || '0';

    const avgWpm = played > 0 ? Math.round(totalWpm / played) : 0;

    document.getElementById('stat-played').textContent = played;
    document.getElementById('stat-avg-wpm').textContent = avgWpm;
    document.getElementById('stat-max-wpm').textContent = maxWpm;
    document.getElementById('stat-max-cpm').textContent = maxCpm;
}

// --- SOLO START GAME ACTIONS ---
function startSoloGame() {
    if (isMultiplayer) return;

    resetGameSession();
    selectRandomQuote();

    // Re-setup bots
    setupSoloLanes();

    // Start 5s Lamps countdown, then launch
    startCountdown(() => {
        launchTypingGame();
    });

    // Update Solo button state
    const startBtn = document.getElementById('btn-start-solo');
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fa-solid fa-gamepad animate-pulse"></i> Balapan Berjalan';
        startBtn.className = "py-2 px-4 text-xs font-bold bg-slate-800 text-gray-500 border border-gray-700 rounded-xl cursor-not-allowed pointer-events-none";
    }

    showToast("Hitung mundur balapan dimulai!");
}

function resetSoloStartButton() {
    const startBtn = document.getElementById('btn-start-solo');
    if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Mulai Balapan Solo';
        startBtn.className = "py-2 px-4 text-xs font-bold bg-gradient-to-r from-amber-500 to-yellow-600 hover:opacity-95 text-white rounded-xl active:scale-[0.98] transition flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20";
    }
}

// --- RESTART GAME CONFIRMATION ---
function confirmRestartGame() {
    if (isMultiplayer) {
        if (isHost) {
            Swal.fire({
                ...swalDark,
                title: 'Restart Game?',
                html: 'Permainan multiplayer akan dihentikan dan dimulai ulang dengan paragraf baru.',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Ya, Restart!',
                cancelButtonText: 'Batal',
                reverseButtons: true
            }).then(res => {
                if (res.isConfirmed) startVersusGame();
            });
        } else {
            showToast('Hanya Host yang dapat memulai ulang balapan!');
        }
    } else {
        Swal.fire({
            ...swalDark,
            title: 'Mulai Ulang Balapan?',
            html: 'Ketik ulang paragraf dari awal dan kembalikan progress ke 0%.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Ya, Reset!',
            cancelButtonText: 'Batal',
            reverseButtons: true
        }).then(res => {
            if (res.isConfirmed) {
                resetGameSession();
                showToast("Balapan diatur ulang!");
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

    const maxSelect = document.getElementById('room-max-select');
    maxPlayers = maxSelect ? parseInt(maxSelect.value) : 4;

    // Block solo settings
    document.getElementById('solo-settings-area').classList.add('hidden');

    // UI Updates
    document.getElementById('player-role-badge').textContent = "HOST";
    document.getElementById('player-role-badge').classList.remove('hidden');
    document.getElementById('connection-status-text').textContent = `Host: Room ${roomCode}`;
    document.getElementById('connection-status-dot').className = "w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse";

    const linkInput = document.getElementById('share-link-input');
    if (linkInput) {
        linkInput.value = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    }
    document.getElementById('lobby-creation-controls').classList.add('hidden');
    document.getElementById('room-info-area').classList.remove('hidden');
    document.getElementById('player-list-area').classList.remove('hidden');

    isSharedToLobby = false;
    const shareBtn = document.getElementById('btn-share-lobby');
    if (shareBtn) {
        shareBtn.classList.remove('hidden');
        shareBtn.disabled = false;
        shareBtn.innerHTML = '<i class="fa-solid fa-share-nodes"></i> Bagikan ke Lobby Portal';
        shareBtn.className = "flex-1 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/20 rounded text-[10px] font-bold transition active:scale-95 flex items-center justify-center gap-1";
    }

    opponents = [];
    renderRaceTracks();

    setupSupabaseVersus();
    resetGameSession();
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

    document.getElementById('solo-settings-area').classList.add('hidden');
    document.getElementById('connection-status-text').textContent = "Menghubungkan...";
    document.getElementById('connection-status-dot').className = "w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse";

    setupSupabaseVersus();
    resetGameSession();
}

function transitionUIForGuest() {
    document.getElementById('player-role-badge').textContent = "TAMU";
    document.getElementById('player-role-badge').classList.remove('hidden');
    document.getElementById('connection-status-text').textContent = `Tamu: Room ${roomCode}`;
    document.getElementById('connection-status-dot').className = "w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse";

    const linkInput = document.getElementById('share-link-input');
    if (linkInput) {
        linkInput.value = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    }
    document.getElementById('lobby-creation-controls').classList.add('hidden');
    document.getElementById('room-info-area').classList.remove('hidden');
    
    const shareBtn = document.getElementById('btn-share-lobby');
    if (shareBtn) shareBtn.classList.add('hidden');
    
    const startBtn = document.getElementById('btn-start-versus');
    if (startBtn) startBtn.classList.add('hidden');
    
    document.getElementById('player-list-area').classList.remove('hidden');

    opponents = [];
    renderRaceTracks();
}

function leaveVersusRoom() {
    isLeavingRoom = true;
    roomCode = "";
    
    if (roomChannel) {
        supabaseClient.removeChannel(roomChannel);
        roomChannel = null;
    }
    if (lobbyChannel) {
        supabaseClient.removeChannel(lobbyChannel);
        lobbyChannel = null;
    }
    if (timerInterval) clearInterval(timerInterval);

    isMultiplayer = false;
    isHost = false;
    opponents = [];
    playersList = [];

    // UI Restore
    document.getElementById('solo-settings-area').classList.remove('hidden');
    document.getElementById('player-role-badge').classList.add('hidden');
    document.getElementById('connection-status-text').textContent = "Mode Solo";
    document.getElementById('connection-status-dot').className = "w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse";

    document.getElementById('lobby-creation-controls').classList.remove('hidden');
    document.getElementById('room-info-area').classList.add('hidden');
    document.getElementById('player-list-area').classList.add('hidden');

    const btnCreate = document.getElementById('btn-create-room');
    if (btnCreate) {
        btnCreate.disabled = false;
        btnCreate.innerHTML = '<i class="fa-solid fa-users text-amber-400"></i> Buat Room';
    }
    const btnJoin = document.getElementById('btn-join-room');
    if (btnJoin) {
        btnJoin.disabled = false;
        btnJoin.textContent = 'Gabung';
    }

    setupSoloLanes();
    resetGameSession();

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
        .on('broadcast', { event: 'typerace-start' }, ({ payload }) => {
            console.log("Start broadcast received!");
            Swal.close(); // Close any open winner modals

            const { quote, duration } = payload;
            currentQuote = quote;
            quoteWords = currentQuote.split(' ');
            totalCharacters = currentQuote.length;
            gameDuration = duration;
            remainingSeconds = duration;

            resetGameSession();
            currentQuote = quote;
            quoteWords = currentQuote.split(' ');
            totalCharacters = currentQuote.length;
            gameDuration = duration;
            remainingSeconds = duration;

            document.getElementById('passage-container').textContent = currentQuote;
            document.getElementById('timer-display').textContent = remainingSeconds;

            // Wait, we need to show the countdown lamps
            startCountdown(() => {
                launchTypingGame();
            });
        })
        .on('broadcast', { event: 'typerace-progress' }, ({ payload }) => {
            const { clientId, progress, wpm, cpm } = payload;
            const opp = opponents.find(o => o.clientId === clientId);
            if (opp) {
                opp.progress = progress;
                opp.currentWpm = wpm;
                renderRaceTracks();
            }
        })
        .on('broadcast', { event: 'typerace-finished' }, ({ payload }) => {
            const { username, wpm, cpm, time, unfinished, progress } = payload;
            const opp = opponents.find(o => o.clientId === payload.clientId || o.username === username);
            if (opp) {
                opp.progress = progress !== undefined ? progress : 100;
                opp.finishedTime = time;
                opp.wpm = wpm;
                opp.currentWpm = wpm;
                opp.status = unfinished ? 'unfinished' : 'finished';
                renderRaceTracks();
            }
            // Add entry to leaderboard
            addLeaderboardRank(username, payload.clientId || username, wpm, cpm, time, unfinished, progress);
        })
        .on('broadcast', { event: 'typerace-kick' }, ({ payload }) => {
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

    // Sync host limit
    const hostUser = playersList.find(p => p.isHost);
    if (hostUser && hostUser.maxPlayers) {
        maxPlayers = hostUser.maxPlayers;
    }

    // Set opponents list based on other players
    const otherPlayers = playersList.filter(p => p.clientId !== myClientId);
    
    // Convert players into opponent lanes
    opponents = otherPlayers.map(p => {
        const existing = opponents.find(o => o.clientId === p.clientId);
        
        return {
            clientId: p.clientId,
            username: p.username,
            isBot: false,
            wpm: existing ? existing.wpm : 0,
            carIcon: p.isHost ? "fa-solid fa-car-side text-yellow-500 animate-pulse" : "fa-solid fa-car-side text-cyan-400",
            progress: existing ? existing.progress : 0,
            currentWpm: existing ? existing.currentWpm : 0,
            status: existing ? existing.status : 'playing',
            finishedTime: existing ? existing.finishedTime : null
        };
    });

    renderRaceTracks();

    // Render list container
    const container = document.getElementById('player-list-container');
    if (container) {
        container.innerHTML = playersList.map(p => {
            const isMe = p.clientId === myClientId;
            const isHostPlayer = p.isHost;
            
            let roleBadgeHtml = '';
            if (isMe) {
                roleBadgeHtml = `<span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase">${isHostPlayer ? 'Host' : 'Tamu'}</span>`;
            } else {
                if (isHost) {
                    roleBadgeHtml = `
                        <div class="flex items-center gap-1.5">
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
                        <span class="w-1.5 h-1.5 rounded-full ${isMe ? 'bg-amber-500' : 'bg-cyan-500'} animate-pulse"></span>
                        <strong>${escapeHTML(p.username)}</strong> ${isMe ? '<span class="text-[9px] text-gray-500 font-bold">(Anda)</span>' : ''}
                    </span>
                    ${roleBadgeHtml}
                </div>
            `;
        }).join('');
    }

    // Header count
    const listArea = document.getElementById('player-list-area');
    if (listArea) {
        const title = listArea.querySelector('span');
        if (title) title.textContent = `Daftar Pemain (${playersList.length}/${maxPlayers} - Min: 2)`;
    }

    // Leave button text
    const btnLeave = document.getElementById('btn-leave-room');
    if (btnLeave) {
        btnLeave.innerHTML = isHost ? '<i class="fa-solid fa-rectangle-xmark"></i> Tutup Room' : '<i class="fa-solid fa-arrow-right-from-bracket"></i> Keluar Room';
    }

    // Start Game Button trigger
    const startBtn = document.getElementById('btn-start-versus');
    if (startBtn && isHost) {
        if (playersList.length >= 2) {
            startBtn.classList.remove('hidden');
            startBtn.disabled = false;
        } else {
            startBtn.classList.add('hidden');
        }
    }

    if (isHost && isSharedToLobby) {
        trackLobbyPresence();
    }
}

function removeOpponent(clientId) {
    opponents = opponents.filter(o => o.clientId !== clientId);
    renderRaceTracks();
}

async function startVersusGame() {
    if (!isHost) return;
    if (playersList.length < 2) {
        showToast("Butuh minimal 2 pemain untuk memulai balapan!");
        return;
    }

    const startBtn = document.getElementById('btn-start-versus');
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.textContent = "Memulai Balapan...";
    }

    // Pick random sentence
    selectRandomQuote();

    // Broadcast event
    await roomChannel.send({
        type: 'broadcast',
        event: 'typerace-start',
        payload: {
            quote: currentQuote,
            duration: gameDuration
        }
    });

    // Reset local state (must re-assign quote after reset clears it)
    const savedQuote = currentQuote;
    const savedDuration = gameDuration;
    resetGameSession();

    // Re-assign quote data after reset
    currentQuote = savedQuote;
    quoteWords = currentQuote.split(' ');
    totalCharacters = currentQuote.length;
    gameDuration = savedDuration;
    remainingSeconds = savedDuration;

    document.getElementById('passage-container').textContent = currentQuote;
    document.getElementById('timer-display').textContent = remainingSeconds;

    // Count down
    startCountdown(() => {
        launchTypingGame();
    });
}

function broadcastProgress() {
    if (!roomChannel) return;
    const progress = calculateProgressPercent();
    const wpm = calculateCurrentWpm();
    const cpm = calculateCurrentCpm();

    roomChannel.send({
        type: 'broadcast',
        event: 'typerace-progress',
        payload: {
            clientId: myClientId,
            progress: progress,
            wpm: wpm,
            cpm: cpm
        }
    });
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
        game: 'Typerace',
        roomCode: roomCode,
        hostName: myUsername,
        playerCount: playersList.length,
        maxPlayers: maxPlayers,
        onlineAt: new Date().toISOString()
    });
}

// --- UTILITY METHODS ---
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
    });
}

function copyRoomLink() {
    const linkInput = document.getElementById('share-link-input');
    if (linkInput) {
        navigator.clipboard.writeText(linkInput.value).then(() => {
            showToast("Link undangan disalin!");
        });
    }
}

async function changeUsername(val) {
    const sanitized = val.trim();
    if (!sanitized) return;
    myUsername = sanitized;
    localStorage.setItem('logicall_username', myUsername);
    
    renderRaceTracks();

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
        confirmButtonText: 'Keluarkan',
        cancelButtonText: 'Batal',
        reverseButtons: true,
    }).then(result => {
        if (result.isConfirmed) {
            roomChannel.send({
                type: 'broadcast',
                event: 'typerace-kick',
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
    if (!modal) return;
    if (show) {
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
}

function toggleStatsModal(show) {
    const modal = document.getElementById('stats-modal');
    if (!modal) return;
    if (show) {
        updateGlobalStatsUI();
        // Hide answer area if not finished
        if (!myFinishedState) {
            document.getElementById('answer-reveal-area').classList.add('hidden');
            document.getElementById('podium-area').classList.add('hidden');
        } else {
            document.getElementById('answer-reveal-area').classList.remove('hidden');
        }
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
}

function handleStatsLeftClick() {
    toggleStatsModal(false);
}

function restartGame() {
    toggleStatsModal(false);
    if (isMultiplayer) {
        if (isHost) {
            startVersusGame();
        }
    } else {
        startSoloGame();
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
