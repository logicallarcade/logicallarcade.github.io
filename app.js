// Logicall Arcade Portal App Controller

const SUPABASE_URL = 'https://xoopahkzmfibfnxzmqfk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_pSbbyCzo8R0oPeyK_xwGtg_C81049id';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let myUsername = 'Pemain 1';
const myClientId = Math.random().toString(36).substring(2, 10);
let lobbyChannel = null;

// ─── SweetAlert2 dark theme defaults ───────────────────────────────────────
const swalDark = {
    background: '#0f1623',
    color: '#e5e7eb',
    confirmButtonColor: '#8b5cf6',
    cancelButtonColor: '#374151',
};
// ─── Auto-Refresh Lobby Timer ──────────────────────────────────────────────
let lobbyRefreshSeconds = 10;
let lobbyRefreshInterval = null;

function startLobbyAutoRefresh() {
    if (lobbyRefreshInterval) clearInterval(lobbyRefreshInterval);
    
    lobbyRefreshSeconds = 10;
    updateRefreshCountdownUI();
    
    lobbyRefreshInterval = setInterval(() => {
        lobbyRefreshSeconds--;
        if (lobbyRefreshSeconds <= 0) {
            refreshLobby();
            lobbyRefreshSeconds = 10;
        }
        updateRefreshCountdownUI();
    }, 1000);
}

function updateRefreshCountdownUI() {
    const el = document.getElementById('lobby-refresh-countdown');
    if (el) {
        el.textContent = `⟳ ${lobbyRefreshSeconds}s`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const savedName = localStorage.getItem('logicall_username');
    if (savedName) {
        myUsername = savedName;
    } else {
        myUsername = 'User_' + Math.floor(100 + Math.random() * 900);
        localStorage.setItem('logicall_username', myUsername);
    }
    const nameInput = document.getElementById('global-username-input');
    if (nameInput) nameInput.value = myUsername;
    setupLobby();
    
    // Start auto-refresh countdown
    startLobbyAutoRefresh();

    // Show cache-clear guide the first time a user opens the site
    if (!localStorage.getItem('logicall_cache_notice_shown')) {
        setTimeout(showCacheNotif, 1200);
    }
});

function changeUsername(value) {
    if (value.trim()) {
        myUsername = value.trim();
        localStorage.setItem('logicall_username', myUsername);
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

// ─── Cache Notification (first visit) ─────────────────────────────────────
function showCacheNotif() {
    Swal.fire({
        ...swalDark,
        title: 'Tips: Selalu Tampilan Terbaru',
        html: `
            <div style="text-align:left;font-size:0.8rem;color:#9ca3af;line-height:1.7">
                <p style="margin-bottom:10px">Jika tampilan terlihat <b style="color:#f3f4f6">tidak update</b>, hapus cache browser dulu:</p>
                <div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:10px;padding:10px 14px;margin-bottom:10px">
                    <p style="font-size:0.72rem;font-weight:800;color:#a78bfa;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Chrome / Edge (PC)</p>
                    <p style="margin:0">Tekan <kbd style="background:#1e293b;border:1px solid #475569;padding:1px 6px;border-radius:4px;font-family:monospace">Ctrl</kbd> + <kbd style="background:#1e293b;border:1px solid #475569;padding:1px 6px;border-radius:4px;font-family:monospace">Shift</kbd> + <kbd style="background:#1e293b;border:1px solid #475569;padding:1px 6px;border-radius:4px;font-family:monospace">Del</kbd> → pilih <b style="color:#f3f4f6">Cached images and files</b> → klik <b style="color:#10b981">Clear data</b></p>
                </div>
                <div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:10px 14px;margin-bottom:10px">
                    <p style="font-size:0.72rem;font-weight:800;color:#34d399;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Chrome (HP Android)</p>
                    <p style="margin:0">Buka <b style="color:#f3f4f6">⋮ → Setelan → Privasi → Hapus data browser</b> → centang <b style="color:#f3f4f6">Gambar & file dalam cache</b> → Hapus</p>
                </div>
                <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:10px 14px">
                    <p style="font-size:0.72rem;font-weight:800;color:#818cf8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Cara Cepat (Hard Refresh)</p>
                    <p style="margin:0">Tekan <kbd style="background:#1e293b;border:1px solid #475569;padding:1px 6px;border-radius:4px;font-family:monospace">Ctrl</kbd> + <kbd style="background:#1e293b;border:1px solid #475569;padding:1px 6px;border-radius:4px;font-family:monospace">Shift</kbd> + <kbd style="background:#1e293b;border:1px solid #475569;padding:1px 6px;border-radius:4px;font-family:monospace">R</kbd> — langsung reload tanpa cache!</p>
                </div>
            </div>`,
        confirmButtonText: 'Mengerti!',
        width: 480,
        showCloseButton: true,
    }).then(() => {
        localStorage.setItem('logicall_cache_notice_shown', '1');
    });
}

// ─── Refresh Lobby Room List ────────────────────────────────────────────────
function refreshLobby() {
    const icon = document.getElementById('refresh-lobby-icon');
    const btn  = document.getElementById('btn-refresh-lobby');
    if (btn) { btn.disabled = true; }
    if (icon) { icon.classList.add('animate-spin'); }

    // Re-subscribe: unsubscribe and re-setup the lobby channel
    if (lobbyChannel) {
        supabaseClient.removeChannel(lobbyChannel);
        lobbyChannel = null;
    }

    // Reset countdown seconds back to 10 when manually triggered
    lobbyRefreshSeconds = 10;
    updateRefreshCountdownUI();

    setTimeout(() => {
        setupLobby();
        if (icon) { icon.classList.remove('animate-spin'); }
        if (btn)  { btn.disabled = false; }
    }, 900);
}

function setupLobby() {
    if (typeof supabase === 'undefined' || !supabaseClient) {
        console.error('Supabase client is not loaded.');
        return;
    }

    lobbyChannel = supabaseClient.channel('arcade-lobby', {
        config: { presence: { key: myClientId } },
    });

    // Re-render on any presence change (sync covers all edge cases,
    // join/leave give faster visual feedback)
    const onPresenceChange = () => renderLobby(lobbyChannel.presenceState());

    lobbyChannel
        .on('presence', { event: 'sync' },  onPresenceChange)
        .on('presence', { event: 'join' },  onPresenceChange)
        .on('presence', { event: 'leave' }, onPresenceChange)
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
        presenceState[key].forEach(p => allPresences.push(p));
    });

    const countEl = document.getElementById('lobby-online-count');
    if (countEl) countEl.textContent = allPresences.length;

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
            <div class="flex-1 flex flex-col items-center justify-center py-8 text-center px-2">
                <i class="fa-solid fa-gamepad text-gray-700 text-2xl mb-2 block"></i>
                <p class="text-gray-500 text-[10px] leading-relaxed">Belum ada room dibagikan.<br>Buat room &amp; klik "Bagikan ke Lobby"!</p>
            </div>`;
    } else {
        container.innerHTML = activeRooms.map(room => {
            const gameKey = room.game.toLowerCase();
            const isWordle = gameKey === 'wordle';
            const isSudoku = gameKey === 'sudoku';
            const isBingo = gameKey === 'bingo';

            const gameLabel = isWordle ? 'Wordle' : (isSudoku ? 'Sudoku' : 'Bingo');
            const gameIconHtml = isWordle 
                ? '<i class="fa-solid fa-font"></i>' 
                : (isSudoku ? '<span class="font-black font-mono tracking-tighter text-[10px] mr-1">123</span>' : '<i class="fa-solid fa-circle-dot"></i>');
            const iconBg = isWordle ? 'border-emerald-500/30 bg-emerald-500/10' : (isSudoku ? 'border-brandPurple/30 bg-brandPurple/10' : 'border-cyan-500/30 bg-cyan-500/10');
            const iconColor = isWordle ? 'text-emerald-400' : (isSudoku ? 'text-brandPurple' : 'text-cyan-400');
            const badgeClass = isWordle
                ? 'lobby-badge--wordle'
                : (isSudoku ? 'lobby-badge--sudoku' : 'lobby-badge--bingo');

            const maxPlayers = room.maxPlayers || (isWordle ? 2 : (isSudoku ? 5 : 8));
            const currentCount = room.playerCount || 1;
            const isFull = currentCount >= maxPlayers;

            const joinUrl = `./${gameKey}/?room=${encodeURIComponent(room.roomCode)}`;

            const btnClass = isFull
                ? 'px-3 py-1.5 rounded-lg bg-gray-800 text-gray-500 border border-gray-700/30 cursor-not-allowed text-[10px] font-bold flex-shrink-0'
                : 'px-3 py-1.5 rounded-lg bg-gradient-to-r from-brandPurple to-brandIndigo text-white text-[10px] font-bold flex-shrink-0 transition-all hover:opacity-90 active:scale-95';
            const btnAction = isFull ? '' : `onclick="window.location.href='${joinUrl}'"`;

            return `
                <div class="lobby-room-card">
                    <!-- Header: game badge + player count -->
                    <div class="flex items-center justify-between mb-2">
                        <span class="lobby-badge ${badgeClass}">
                            ${gameIconHtml} ${gameLabel}
                        </span>
                        <span class="lobby-players ${isFull ? 'lobby-players--full' : 'lobby-players--open'}">
                            <span class="lobby-dot ${isFull ? 'lobby-dot--full' : 'lobby-dot--open'}"></span>
                            ${currentCount}/${maxPlayers}
                        </span>
                    </div>
                    <!-- Host name -->
                    <p class="lobby-hostname">${escapeHTML(room.hostName || 'Host')}</p>
                    <!-- Room code -->
                    <p class="lobby-code">${escapeHTML(room.roomCode)}</p>
                    <!-- Join button -->
                    <button ${btnAction} ${isFull ? 'disabled' : ''}
                        class="lobby-join-btn ${isFull ? 'lobby-join-btn--full' : 'lobby-join-btn--open'}">
                        ${isFull
                            ? '<i class="fa-solid fa-lock"></i> Penuh'
                            : '<i class="fa-solid fa-right-to-bracket"></i> Gabung'
                        }
                    </button>
                </div>`;

        }).join('');
    }
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// ─── SweetAlert2 Modal Controllers ─────────────────────────────────────────

function toggleAboutModal() {
    Swal.fire({
        ...swalDark,
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

function showComingSoon(gameName) {
    Swal.fire({
        ...swalDark,
        title: 'Segera Hadir!',
        html: `Game <strong style="color:#8b5cf6">${escapeHTML(gameName)}</strong> sedang dikembangkan.<br><br><span style="color:#6b7280;font-size:0.8rem">Tunggu pembaruan berikutnya!</span>`,
        confirmButtonText: 'Siap, Ditunggu!',
        width: 360,
    });
}

function hideComingSoon() {
    Swal.close();
}
