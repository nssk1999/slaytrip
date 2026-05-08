const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:8005/api'
    : '/api';

// Theme Switching Logic
const themes = [
    {
        name: 'indigo-slate',
        primary: '#6366f1',
        primaryHover: '#4f46e5',
        bg: '#0f172a',
        sidebar: '#1e293b',
        accent: '#f43f5e'
    },
    {
        name: 'blue-black',
        primary: '#3b82f6',
        primaryHover: '#2563eb',
        bg: '#000000',
        sidebar: '#111111',
        accent: '#60a5fa'
    },
    {
        name: 'red-black',
        primary: '#ef4444',
        primaryHover: '#dc2626',
        bg: '#000000',
        sidebar: '#111111',
        accent: '#f87171'
    },
    {
        name: 'emerald-dark',
        primary: '#10b981',
        primaryHover: '#059669',
        bg: '#022c22',
        sidebar: '#064e3b',
        accent: '#34d399'
    }
];

// Session State
let currentUser = null;
let currentRole = 'customer';

function applyRandomTheme() {
    const theme = themes[Math.floor(Math.random() * themes.length)];
    const root = document.documentElement;
    
    root.style.setProperty('--primary-color', theme.primary);
    root.style.setProperty('--primary-hover', theme.primaryHover);
    root.style.setProperty('--bg-dark', theme.bg);
    root.style.setProperty('--sidebar-bg', theme.sidebar);
    root.style.setProperty('--accent-color', theme.accent);
    
    console.log(`Applied theme: ${theme.name}`);
}

// Login & Auth Logic
function initAuth() {
    const loginForm = document.getElementById('login-form');
    const roleOptions = document.querySelectorAll('.role-option');
    const loginOverlay = document.getElementById('login-overlay');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.content');

    roleOptions.forEach(option => {
        option.addEventListener('click', () => {
            roleOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            currentRole = option.getAttribute('data-role');
        });
    });

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = e.target.querySelector('input[type="text"]').value;
        
        // Mock Login Success
        currentUser = { username, role: currentRole };
        
        loginOverlay.classList.add('hidden');
        sidebar.classList.remove('hidden');
        mainContent.classList.remove('hidden');
        
        updateSidebarForRole();
        loadTabData('explore');
    });
}

function updateSidebarForRole() {
    const statusText = document.querySelector('.profile-info .status');
    const roleLabels = {
        'customer': 'Pro Explorer',
        'provider': 'Service Partner',
        'manager': 'Travel Manager'
    };
    statusText.textContent = roleLabels[currentRole] || 'User';
}

// Initial Load
window.addEventListener('DOMContentLoaded', () => {
    applyRandomTheme();
    initAuth();
});

// Tab Switching Logic
const tabs = document.querySelectorAll('.nav-links li');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-tab');
        
        // Update Active Tab Link
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Show Correct Content
        tabContents.forEach(content => {
            content.classList.remove('active');
            if (content.id === target) {
                content.classList.add('active');
            }
        });

        // Load data if needed
        loadTabData(target);
    });
});

async function loadTabData(tab) {
    switch (tab) {
        case 'explore': await fetchDestinations(); break;
        case 'planner': initPlannerWizard(); break;
        case 'updates': await fetchUpdates(); break;
        case 'security': break;
    }
}

// ─── FETCH ───────────────────────────────────────
async function fetchDestinations() {
    try {
        const res = await fetch(`${API_BASE_URL}/destinations`);
        renderDestinations(await res.json());
    } catch (e) { console.error('Destinations error:', e); }
}

async function fetchUpdates() {
    try {
        const res = await fetch(`${API_BASE_URL}/updates`);
        renderUpdates(await res.json());
    } catch (e) { console.error('Updates error:', e); }
}

// ─── RENDER: Explore ─────────────────────────────
function renderDestinations(destinations) {
    const container = document.getElementById('destinations-container');
    container.innerHTML = destinations.map(dest => `
        <div class="card" onclick="prefillPlannerFromCard('${dest.name}')">
            <img src="${dest.image}" alt="${dest.name}" class="card-img" loading="lazy">
            <div class="card-body">
                <span class="card-tag">${dest.location}</span>
                <h3 class="card-title">${dest.name}</h3>
                <p style="color:var(--text-muted);font-size:0.9rem;line-height:1.5;">${dest.description}</p>
                <div class="card-meta">
                    <span class="price">${dest.price}</span>
                    <span class="rating"><i class="fas fa-star"></i> ${dest.rating}</span>
                </div>
                <button class="btn-primary" style="width:100%;margin-top:1rem;font-size:0.85rem;padding:0.6rem;">Plan This Trip ⚡</button>
            </div>
        </div>
    `).join('');
}

// ─── RENDER: Updates ─────────────────────────────
function renderUpdates(updates) {
    const container = document.getElementById('updates-container');
    const icons = { 'Weather': 'fa-cloud-sun', 'Flight': 'fa-plane-departure', 'Tip': 'fa-lightbulb', 'Alert': 'fa-triangle-exclamation' };
    container.innerHTML = updates.map(u => `
        <div class="update-card">
            <div class="update-icon"><i class="fas ${icons[u.type] || 'fa-info-circle'}"></i></div>
            <div class="update-content">
                <h4 style="margin-bottom:0.25rem;">${u.type}</h4>
                <p style="color:var(--text-muted);font-size:0.95rem;">${u.content}</p>
            </div>
        </div>
    `).join('');
}

// ─── PLANNER WIZARD ──────────────────────────────
let selectedDestination = 'Goa';
let selectedStyles = [];

function initPlannerWizard() {
    // Destination chips
    document.querySelectorAll('.dest-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.dest-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            selectedDestination = chip.getAttribute('data-dest');
        });
    });

    // Style cards (multi-select)
    document.querySelectorAll('.style-card').forEach(card => {
        card.addEventListener('click', () => {
            card.classList.toggle('selected');
            const style = card.getAttribute('data-style');
            if (card.classList.contains('selected')) {
                if (!selectedStyles.includes(style)) selectedStyles.push(style);
            } else {
                selectedStyles = selectedStyles.filter(s => s !== style);
            }
        });
    });

    // Default dates
    const today = new Date();
    const plus7 = new Date(today); plus7.setDate(today.getDate() + 7);
    const plus10 = new Date(today); plus10.setDate(today.getDate() + 10);
    document.getElementById('start-date').value = formatDate(plus7);
    document.getElementById('end-date').value = formatDate(plus10);
}

function formatDate(d) {
    return d.toISOString().split('T')[0];
}

function goToStep(stepNum) {
    // Validate step 1 before advancing
    if (stepNum === 2) {
        const start = document.getElementById('start-date').value;
        const end = document.getElementById('end-date').value;
        if (!start || !end || new Date(end) <= new Date(start)) {
            alert('Please pick valid start and end dates!'); return;
        }
    }
    if (stepNum === 3 && selectedStyles.length === 0) {
        alert('Pick at least one travel style!'); return;
    }

    // Hide all panels
    document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`step-${stepNum}`).classList.add('active');

    // Update step indicators
    document.querySelectorAll('.wizard-step').forEach((ws, idx) => {
        ws.classList.remove('active', 'done');
        if (idx + 1 < stepNum) ws.classList.add('done');
        if (idx + 1 === stepNum) ws.classList.add('active');
    });
}

async function generateTrip() {
    const btn = document.getElementById('generate-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Building your trip...';
    btn.disabled = true;

    const constraints = Array.from(document.querySelectorAll('.constraint-card input:checked'))
        .map(cb => cb.value);

    const payload = {
        destination: selectedDestination,
        start_date: document.getElementById('start-date').value,
        end_date: document.getElementById('end-date').value,
        budget_level: document.getElementById('budget-level').value,
        travel_style: selectedStyles.length > 0 ? selectedStyles : ['culture'],
        group_type: document.getElementById('group-type').value,
        constraints: constraints
    };

    try {
        const res = await fetch(`${API_BASE_URL}/plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const itinerary = await res.json();
        renderItinerary(itinerary);

        // Show result panel
        document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('step-result').classList.add('active');
        document.querySelector('.wizard-header').style.display = 'none';
    } catch (e) {
        alert('Could not generate trip. Is the backend running?');
        console.error(e);
    } finally {
        btn.innerHTML = '<i class="fas fa-magic"></i> Generate My Trip';
        btn.disabled = false;
    }
}

function renderItinerary(data) {
    const budgetLabels = { budget: '🎒 Backpacker', mid: '✈️ Comfort', luxury: '💎 Luxury' };
    const groupLabels = { solo: '🧍 Solo', couple: '👫 Couple', family: '👨‍👩‍👧 Family', group: '👥 Group' };
    const INR = n => '₹' + n.toLocaleString('en-IN');

    const constraintBadges = data.applied_constraints.map(c =>
        `<span class="constraint-badge">${c}</span>`
    ).join('');

    const daysHTML = data.days.map(day => `
        <div class="day-block">
            <div class="day-label">
                <h3>Day ${day.day_number}</h3>
                <span class="day-date">${day.date}</span>
            </div>
            <div class="itinerary-timeline">
                ${day.activities.map(act => `
                    <div class="itin-item">
                        <div class="itin-meta">
                            <span class="itin-time"><i class="fas fa-clock"></i> ${act.time}</span>
                            <span class="itin-status ${act.status.toLowerCase()}">${act.status}</span>
                        </div>
                        <div class="itin-title">${act.title}</div>
                        <div class="itin-footer">
                            <span class="itin-location"><i class="fas fa-location-dot"></i> ${act.location} · ${act.duration}</span>
                            <span class="itin-cost">${INR(act.cost)}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');

    document.getElementById('itinerary-output').innerHTML = `
        <div class="itinerary-hero">
            <div>
                <h2>${data.destination}</h2>
                <p>${data.start_date} → ${data.end_date} · ${data.num_days} days</p>
                <p>${groupLabels[data.group_type]} · ${budgetLabels[data.budget_level]}</p>
            </div>
            <div class="budget-pills">
                <span class="budget-pill">🏃 Activities: ${INR(data.budget_breakdown.activities)}</span>
                <span class="budget-pill">🏨 Hotel: ${INR(data.budget_breakdown.hotel)}</span>
                <span class="budget-pill">🚗 Transport: ${INR(data.budget_breakdown.transport)}</span>
                <span class="budget-pill total">Total: ${INR(data.budget_breakdown.total)}</span>
            </div>
        </div>

        ${constraintBadges ? `<div class="constraint-badges">${constraintBadges}</div>` : ''}

        <div class="hotel-card">
            <div>
                <h4>🏨 ${data.hotel.name}</h4>
                <p>${data.hotel.type} · ${INR(data.hotel.per_night)}/night × ${data.num_days} nights</p>
            </div>
            <span class="price-tag">${INR(data.hotel.total)}</span>
        </div>

        ${daysHTML}
    `;
}

function resetPlanner() {
    selectedStyles = [];
    document.querySelectorAll('.style-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.dest-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('.dest-chip').classList.add('active');
    selectedDestination = 'Goa';
    document.querySelector('.wizard-header').style.display = 'flex';
    document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('step-1').classList.add('active');
    document.querySelectorAll('.wizard-step').forEach((ws, idx) => {
        ws.classList.remove('active', 'done');
        if (idx === 0) ws.classList.add('active');
    });
}

// From Explore: click "Plan This Trip" to jump to planner with destination pre-filled
function prefillPlannerFromCard(destName) {
    // Switch to planner tab
    document.querySelectorAll('.nav-links li').forEach(t => t.classList.remove('active'));
    document.querySelector('[data-tab="planner"]').classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('planner').classList.add('active');
    initPlannerWizard();

    // Pre-select destination
    setTimeout(() => {
        document.querySelectorAll('.dest-chip').forEach(c => {
            c.classList.remove('active');
            if (c.getAttribute('data-dest') === destName) {
                c.classList.add('active');
                selectedDestination = destName;
            }
        });
    }, 50);
}
