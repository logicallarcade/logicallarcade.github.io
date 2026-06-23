// Logicall Arcade Portal App Controller

const SUPABASE_URL = 'https://xoopahkzmfibfnxzmqfk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_pSbbyCzo8R0oPeyK_xwGtg_C81049id';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let myUsername = 'Pemain 1';
const myClientId = Math.random().toString(36).substring(2, 10);
let lobbyChannel = null;

document.addEventListener('DOMContentLoaded', () => {
    // Load username from localStorage
    const savedName = localStorage.getItem('logicall_username');
    if (savedName) {
        myUsername = savedName;
    } else {
        myUsername = 'User_' + Math.floor(100 + Math.random() * 900);
        localStorage.setItem('logicall_username', myUsername);
    }
    const nameInput = document.getElementById('global-username-input');
    if (nameInput) {
        nameInput.value = myUsername;
    }

    // Setup real-time lobby
    setupLobby();
});

// Change username handler
function changeUsername(value) {
    if (value.trim()) {
        myUsername = value.trim();
        localStorage.setItem('logicall_username', myUsername);
        
        // Update presence tracking if channel is subscribed
        if (lobbyChannel) {
            lobbyChannel.track({
                status: 'lobby',
                username: myUsername,
                clientId: myClientId,
                onlineAt: new Date().toISOString()
            });
        }
    }
}

// Hard reload / reset data
function triggerHardReload() {
    if (confirm('Apakah Anda yakin ingin menyetel ulang semua data rekor dan nama pengguna?')) {
        localStorage.clear();
        window.location.reload();
    }
}

// Supabase Realtime Lobby Sync
function setupLobby() {
    if (typeof supabase === 'undefined' || !supabaseClient) {
        console.error("Supabase client is not loaded.");
        return;
    }

    lobbyChannel = supabaseClient.channel('arcade-lobby', {
        config: {
            presence: {
                key: myClientId,
            },
        },
    });

    lobbyChannel
        .on('presence', { event: 'sync' }, () => {
            const state = lobbyChannel.presenceState();
            renderLobby(state);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                lobbyChannel.track({
                    status: 'lobby',
                    username: myUsername,
                    clientId: myClientId,
                    onlineAt: new Date().toISOString()
                });
            }
        });
}

function renderLobby(presenceState) {
    const allPresences = [];
    Object.keys(presenceState).forEach(key => {
        presenceState[key].forEach(p => {
            allPresences.push(p);
        });
    });

    // Update online player count
    const countEl = document.getElementById('lobby-online-count');
    if (countEl) {
        countEl.textContent = allPresences.length;
    }

    // Extract active shared rooms
    const activeRooms = [];
    const seenRooms = new Set();
    allPresences.forEach(p => {
        if (p.roomCode && p.game && !seenRooms.has(p.roomCode)) {
            seenRooms.add(p.roomCode);
            activeRooms.push(p);
        }
    });

    const container = document.getElementById('lobby-rooms-container');
    if (!container) return;

    if (activeRooms.length === 0) {
        container.innerHTML = `
            <div class="flex-1 flex flex-col items-center justify-center py-10 text-center">
                <div class="w-12 h-12 rounded-2xl bg-gray-800/60 flex items-center justify-center mb-3 border border-gray-700/30">
                    <i class="fa-solid fa-gamepad text-gray-600 text-lg"></i>
                </div>
                <p class="text-gray-400 text-sm font-medium">Belum ada room yang dibagikan</p>
                <p class="text-gray-500 text-xs mt-1 max-w-[240px] leading-relaxed">Buat room multiplayer di Sudoku atau Wordle, lalu klik "Bagikan ke Lobby"!</p>
            </div>
        `;
    } else {
        container.innerHTML = activeRooms.map(room => {
            const isWordle = room.game.toLowerCase() === 'wordle';
            const gameLabel = isWordle ? 'Wordle' : 'Sudoku';
            const gameIcon = isWordle ? 'fa-font' : 'fa-grid-3x3';
            const gameColorClass = isWordle 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : 'bg-brandPurple/10 border-brandPurple/30 text-brandPurple';
            const gameIconColor = isWordle ? 'text-emerald-400' : 'text-brandPurple';
            
            const maxPlayers = room.maxPlayers || (isWordle ? 2 : 5);
            const currentCount = room.playerCount || 1;
            const isFull = currentCount >= maxPlayers;
            
            const joinUrl = isWordle 
                ? `./wordle/?room=${encodeURIComponent(room.roomCode)}` 
                : `./sudoku/?room=${encodeURIComponent(room.roomCode)}`;
            
            const btnClass = isFull 
                ? 'px-3 py-1.5 rounded-lg bg-gray-800 text-gray-500 border border-gray-700/30 cursor-not-allowed text-[10px] font-bold flex-shrink-0' 
                : 'px-3 py-1.5 rounded-lg bg-gradient-to-r from-brandPurple to-brandIndigo text-white text-[10px] font-bold flex-shrink-0 transition-all hover:opacity-90 active:scale-95';
            const btnText = isFull ? 'Penuh' : 'Gabung';
            const btnAction = isFull ? '' : `onclick="window.location.href='${joinUrl}'"`;

            return `
                <div class="flex items-center gap-3 p-3 rounded-xl border border-gray-800/60 bg-gray-900/40 hover:border-gray-700/50 transition-all duration-200">
                    <!-- Game Icon -->
                    <div class="w-9 h-9 flex-shrink-0 rounded-lg ${gameColorClass.replace('text-', 'bg-').replace('text-emerald-400','').replace('text-brandPurple','').trim()} border ${gameColorClass.includes('emerald') ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-brandPurple/30 bg-brandPurple/10'} flex items-center justify-center">
                        <i class="fa-solid ${gameIcon} ${gameIconColor} text-sm"></i>
                    </div>
                    <!-- Info -->
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5 mb-0.5">
                            <span class="text-[9px] font-bold border uppercase tracking-wider px-1.5 py-0.5 rounded ${gameColorClass}">${gameLabel}</span>
                            <span class="text-[9px] text-gray-500 flex items-center gap-1">
                                <span class="w-1 h-1 rounded-full ${isFull ? 'bg-red-400' : 'bg-emerald-400'}"></span>
                                ${currentCount}/${maxPlayers}
                            </span>
                        </div>
                        <p class="text-white text-xs font-semibold truncate">${escapeHTML(room.hostName || 'Host')}</p>
                        <p class="text-gray-500 text-[10px] font-mono">${escapeHTML(room.roomCode)}</p>
                    </div>
                    <!-- Join Button -->
                    <button ${btnAction} ${isFull ? 'disabled' : ''} class="${btnClass}">
                        ${isFull ? 'Penuh' : '<i class="fa-solid fa-right-to-bracket mr-1"></i>Gabung'}
                    </button>
                </div>
            `;
        }).join('');
    }
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}



// Modal Controllers
const aboutModal = document.getElementById('about-modal');
const comingSoonModal = document.getElementById('coming-soon-modal');
const comingSoonGameName = document.getElementById('coming-soon-game-name');

function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('hidden');
    void modalEl.offsetWidth; // Reflow
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
    setTimeout(() => {
        if (modalEl.classList.contains('opacity-0')) {
            modalEl.classList.add('hidden');
        }
    }, 300);
}

function toggleAboutModal() {
    if (aboutModal.classList.contains('hidden')) {
        openModal(aboutModal);
    } else {
        closeModal(aboutModal);
    }
}

function showComingSoon(gameName) {
    if (comingSoonGameName) {
        comingSoonGameName.textContent = gameName;
    }
    openModal(comingSoonModal);
}

function hideComingSoon() {
    closeModal(comingSoonModal);
}
