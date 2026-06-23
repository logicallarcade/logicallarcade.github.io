// Logicall Arcade Portal App Controller

let myUsername = 'Pemain 1';

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
});

// Change username handler
function changeUsername(value) {
    if (value.trim()) {
        myUsername = value.trim();
        localStorage.setItem('logicall_username', myUsername);
    }
}

// Hard reload / reset data
function triggerHardReload() {
    if (confirm('Apakah Anda yakin ingin menyetel ulang semua data rekor dan nama pengguna?')) {
        localStorage.clear();
        window.location.reload();
    }
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
