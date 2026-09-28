// ==========================================
// CONFIGURATION & STATE
// ==========================================
const API_BASE = "http://127.0.0.1:5000/api";
let selectedTabs = new Set(); // Stores URLs of checked tabs
let totalVisibleTabs = 0;

// DOM Elements
const els = {
    statusBadge: document.getElementById('backend-status'),
    statusText: document.getElementById('status-text'),
    offlineBanner: document.getElementById('offline-banner'),
    container: document.getElementById('sessions-container'),
    btnRestore: document.getElementById('btn-restore'),
    restoreCount: document.getElementById('restore-count'),
    btnNewSession: document.getElementById('btn-new-session'),
    btnRefresh: document.getElementById('btn-refresh'),
    checkSelectAll: document.getElementById('checkbox-select-all'),
    selectionCounter: document.getElementById('selection-counter'),
    
    // Theme Element
    themeSelect: document.getElementById('theme-select'),

    // Anti-Gravity Elements
    mainHeader: document.getElementById('main-header'),
    selectionBar: document.getElementById('selection-bar'),
    mainContent: document.getElementById('main-content'),
    agView: document.getElementById('anti-gravity-view'),
    btnPanic: document.getElementById('btn-panic'),
    btnExitAg: document.getElementById('btn-exit-ag'),
    btnAgComic: document.getElementById('btn-ag-comic')
};

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    checkHealth();
    fetchSessions();
});

// ==========================================
// THEME CONTROLLER
// ==========================================
function applyTheme(theme) {
    if (!theme) return;
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
}

function initTheme() {
    const savedTheme = localStorage.getItem("tabTrackerTheme") || "archive";
    applyTheme(savedTheme);

    const select = els.themeSelect || document.getElementById('theme-select');
    if (select) {
        select.value = savedTheme;
        if (!select.dataset.listenerAttached) {
            select.dataset.listenerAttached = "true";
            select.addEventListener('change', (e) => {
                const theme = e.target.value;
                applyTheme(theme);
                localStorage.setItem("tabTrackerTheme", theme);
            });
        }
    }
}

// Apply saved theme immediately as soon as popup.js loads to prevent theme flash
initTheme();

// ==========================================
// API & DATA FETCHING
// ==========================================
async function checkHealth() {
    try {
        const res = await fetch(`${API_BASE}/health`);
        if (res.ok) {
            els.statusBadge.classList.remove('offline');
            els.statusText.textContent = "Online";
            els.offlineBanner.style.display = "none";
        }
    } catch (e) {
        els.statusBadge.classList.add('offline');
        els.statusText.textContent = "Offline";
        els.offlineBanner.style.display = "block";
    }
}

async function fetchSessions() {
    try {
        const res = await fetch(`${API_BASE}/get_sessions`);
        if (!res.ok) throw new Error("Failed to fetch");
        
        const data = await res.json();
        renderSessions(data.sessions || {});
        checkHealth(); // Update to online if fetch worked
    } catch (e) {
        els.container.innerHTML = `<div class="empty-state">Unable to load sessions. Is the server running?</div>`;
        checkHealth();
    }
}

// ==========================================
// RENDERING
// ==========================================
function renderSessions(sessionsMap) {
    els.container.innerHTML = "";
    selectedTabs.clear();
    totalVisibleTabs = 0;
    updateSelectionUI();
    els.checkSelectAll.checked = false;

    const sessionIds = Object.keys(sessionsMap);
    if (sessionIds.length === 0) {
        els.container.innerHTML = `<div class="empty-state">No tabs tracked yet. Start browsing!</div>`;
        return;
    }

    sessionIds.forEach((sid, index) => {
        const tabs = sessionsMap[sid];
        const isActive = index === 0; // Assume newest is active for styling
        totalVisibleTabs += tabs.length;

        // 1. Create the Card
        const card = document.createElement('div');
        card.className = `session-card ${isActive ? 'is-active open' : ''}`; // Open the first one by default
        
        // 2. Generate Tabs HTML
        const tabsHtml = tabs.length === 0
            ? `<div style="padding: 12px; color: #94a3b8; font-size: 11px; text-align: center;">No tabs recorded in this session yet.</div>`
            : tabs.map(t => `
            <div class="tab-item">
                <input type="checkbox" class="tab-checkbox" data-url="${escapeHtml(t.url)}">
                <img src="${escapeHtml(t.fav_icon_url) || ''}" class="tab-favicon" onerror="this.style.display='none'">
                <div class="tab-info">
                    <div class="tab-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</div>
                    <div class="tab-meta">
                        <span class="visit-badge">${t.visits} visits</span>
                        <span class="tab-url" title="${escapeHtml(t.url)}">${escapeHtml(t.url)}</span>
                    </div>
                </div>
                <a href="${escapeHtml(t.url)}" target="_blank" class="launch-icon-btn" title="Open Tab">Open</a>
            </div>
        `).join('');

        // 3. Assemble Card HTML using your exact CSS classes
        card.innerHTML = `
            <div class="session-header">
                <div class="session-title-group">
                    <div class="chevron-icon"></div>
                    <div class="session-title">Session: ${sid.split('-')[0]}...</div>
                    <div class="session-badges">
                        ${isActive ? '<span class="tag-active">Active</span>' : ''}
                        <span class="tag-count">${tabs.length} Tabs</span>
                    </div>
                </div>
                <button class="btn-delete-session" data-sid="${sid}" title="Delete Session">Delete</button>
            </div>
            <div class="session-body">
                ${tabsHtml}
            </div>
        `;
        
        els.container.appendChild(card);
    });
}

// ==========================================
// EVENT LISTENERS & INTERACTIVITY
// ==========================================

// Event Delegation for Accordions & Dynamic Buttons
els.container.addEventListener('click', async (e) => {
    const header = e.target.closest('.session-header');
    if (header && !e.target.closest('.btn-delete-session')) {
        const card = header.closest('.session-card');
        card.classList.toggle('open');
    }

    if (e.target.classList.contains('tab-checkbox')) {
        const url = e.target.dataset.url;
        if (e.target.checked) selectedTabs.add(url);
        else selectedTabs.delete(url);
        updateSelectionUI();
    }

    const deleteBtn = e.target.closest('.btn-delete-session');
    if (deleteBtn) {
        const sid = deleteBtn.dataset.sid;
        if(confirm("Permanently delete this session and its tabs?")) {
            await fetch(`${API_BASE}/delete_session/${sid}`, { method: 'DELETE' });
            fetchSessions();
        }
    }
});

// Select All Checkbox
els.checkSelectAll.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.tab-checkbox');
    const isChecked = e.target.checked;
    
    checkboxes.forEach(cb => {
        cb.checked = isChecked;
        if (isChecked) selectedTabs.add(cb.dataset.url);
        else selectedTabs.delete(cb.dataset.url);
    });
    updateSelectionUI();
});

function updateSelectionUI() {
    const count = selectedTabs.size;
    els.restoreCount.textContent = count;
    els.selectionCounter.textContent = `${count} / ${totalVisibleTabs} Selected`;
    els.btnRestore.disabled = count === 0;
}


els.btnRefresh.addEventListener('click', fetchSessions);

els.btnNewSession.addEventListener('click', async () => {
    await fetch(`${API_BASE}/new_session`, { method: 'POST' });
    fetchSessions();
});

els.btnRestore.addEventListener('click', () => {
    selectedTabs.forEach(url => {
        chrome.tabs.create({ url: url, active: false });
    });
});

// ==========================================
// ANTI-GRAVITY PANIC MODE
// ==========================================
function togglePanicMode(enable) {
    if (enable) {
        els.mainHeader.style.display = 'none';
        els.selectionBar.style.display = 'none';
        els.mainContent.style.display = 'none';
        els.agView.style.display = 'block';
        document.body.style.background = "#0B1112"; // Force dark void background
    } else {
        els.mainHeader.style.display = 'block';
        els.selectionBar.style.display = 'flex';
        els.mainContent.style.display = 'block';
        els.agView.style.display = 'none';
        document.body.style.background = ""; // Restore theme background
    }
}

// Panic Triggers
els.btnPanic.addEventListener('click', () => togglePanicMode(true));
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') togglePanicMode(true);
});

// Panic Recover/Decoy
els.btnExitAg.addEventListener('click', () => togglePanicMode(false));
els.btnAgComic.addEventListener('click', () => {
    chrome.tabs.create({ url: "https://xkcd.com/353/" });
});

/**
 * Escapes unsafe characters for safe innerHTML injection.
 */
function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}