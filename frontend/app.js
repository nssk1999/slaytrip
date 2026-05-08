const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:8005/api'
    : '/api';

// ─── Firebase ────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword,
    createUserWithEmailAndPassword, signInWithPopup,
    GoogleAuthProvider, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    getFirestore, doc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAF3qwO8ZxCFiYyq5ZHN1v9VwnrPtBkofI",
    authDomain: "nssk1999promptwars.firebaseapp.com",
    projectId: "nssk1999promptwars",
    storageBucket: "nssk1999promptwars.firebasestorage.app",
    messagingSenderId: "1013229880593",
    appId: "1:1013229880593:web:8fc42d589ad64c05a4f8b0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

async function authFetch(url, opts = {}) {
    const user = auth.currentUser;
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (user) {
        const token = await user.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(url, { ...opts, headers });
}

// ─── Theme ───────────────────────────────────────────────────────
const themes = [
    { name: "Indigo Night", primary: "#6366f1", primaryHover: "#4f46e5", bg: "#0f172a", sidebar: "#1e1b4b", accent: "#818cf8" },
    { name: "Ocean Blue",   primary: "#3b82f6", primaryHover: "#2563eb", bg: "#0f172a", sidebar: "#1e3a5f", accent: "#60a5fa" },
    { name: "Crimson Dark",  primary: "#ef4444", primaryHover: "#dc2626", bg: "#0f172a", sidebar: "#450a0a", accent: "#f87171" },
    { name: "Emerald Dusk",  primary: "#10b981", primaryHover: "#059669", bg: "#0f172a", sidebar: "#064e3b", accent: "#34d399" }
];
function applyRandomTheme() {
    const t = themes[Math.floor(Math.random() * themes.length)];
    const r = document.documentElement;
    r.style.setProperty('--primary-color', t.primary);
    r.style.setProperty('--primary-hover', t.primaryHover);
    r.style.setProperty('--bg-dark', t.bg);
    r.style.setProperty('--sidebar-bg', t.sidebar);
    r.style.setProperty('--accent-color', t.accent);
}

// ─── State ───────────────────────────────────────────────────────
let currentUser = null;
let currentRole = 'customer';
let isSignUpMode = false;
let pendingAction = null; // callback after successful login
let selectedDestination = 'Goa';
let selectedStyles = [];
let lastGeneratedTrip = null;

// ─── Auth Observer ───────────────────────────────────────────────
function initAuthObserver() {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (user) {
            const snap = await getDoc(doc(db, "users", user.uid));
            if (snap.exists()) currentRole = snap.data().role || 'customer';
            onLoginSuccess();
        } else {
            onLogout();
        }
    });
}

function onLoginSuccess() {
    // Update sidebar: show profile, hide guest CTA
    document.getElementById('sidebar-guest').classList.add('hidden');
    document.getElementById('sidebar-user').classList.remove('hidden');
    document.getElementById('signout-btn').classList.remove('hidden');
    // Hide guest banner
    const banner = document.getElementById('guest-banner');
    if (banner) banner.style.display = 'none';
    // Remove lock badges
    document.querySelectorAll('.lock-badge').forEach(b => b.style.display = 'none');
    // Update avatar
    updateUserAvatar();
    updateSidebarForRole();
    updateSaveTripArea();
    // Execute pending action if any
    if (pendingAction) { const fn = pendingAction; pendingAction = null; fn(); }
    // Close modal
    closeAuthModal();
}

function onLogout() {
    document.getElementById('sidebar-guest').classList.remove('hidden');
    document.getElementById('sidebar-user').classList.add('hidden');
    document.getElementById('signout-btn').classList.add('hidden');
    document.querySelectorAll('.lock-badge').forEach(b => b.style.display = '');
    updateSaveTripArea();
}

function updateUserAvatar() {
    if (!currentUser) return;
    const name = currentUser.displayName || currentUser.email || 'User';
    document.getElementById('user-name').textContent = name;
    const img = document.getElementById('user-avatar');
    img.src = currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;
}

function updateSidebarForRole() {
    const labels = { customer: 'Pro Explorer', provider: 'Service Partner', manager: 'Travel Manager' };
    document.getElementById('user-role').textContent = labels[currentRole] || 'User';

    // Show/Hide role specific tabs
    document.querySelectorAll('.role-provider-only').forEach(el => {
        el.classList.toggle('hidden', currentRole !== 'provider');
    });
    document.querySelectorAll('.role-manager-only').forEach(el => {
        el.classList.toggle('hidden', currentRole !== 'manager');
    });
}

// ─── Save Trip CTA (changes based on auth state) ────────────────
function updateSaveTripArea() {
    const area = document.getElementById('save-trip-area');
    if (!area) return;
    if (currentUser) {
        area.innerHTML = `
            <button class="btn-primary" onclick="saveCurrentTrip()"><i class="fas fa-bookmark"></i> Save Trip</button>
            <button class="btn-outline" onclick="shareTrip()"><i class="fas fa-share"></i> Share</button>`;
    } else {
        area.innerHTML = `
            <button class="btn-primary" onclick="openAuthModal('save')"><i class="fas fa-lock"></i> Sign In to Save</button>
            <button class="btn-outline" onclick="shareTrip()"><i class="fas fa-share"></i> Share</button>`;
    }
}

// ─── Auth Modal ──────────────────────────────────────────────────
const contextMessages = {
    save:     { icon: 'fa-bookmark',      text: 'Sign in to save your trip' },
    trips:    { icon: 'fa-map-marked-alt', text: 'Sign in to view your saved trips' },
    security: { icon: 'fa-shield-halved',  text: 'Sign in to access security settings' },
    sidebar:  { icon: 'fa-bolt',           text: 'Unlock the full SlayTrip experience' },
    banner:   { icon: 'fa-sparkles',       text: 'Sign in to personalise your travels' },
};

window.openAuthModal = function(context, callback) {
    const overlay = document.getElementById('auth-modal-overlay');
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    const ctx = contextMessages[context] || contextMessages.sidebar;
    document.querySelector('#modal-context-banner i').className = `fas ${ctx.icon}`;
    document.getElementById('modal-context-text').textContent = ctx.text;
    if (callback) pendingAction = callback;
    setAuthError('');
};

window.closeAuthModal = function() {
    document.getElementById('auth-modal-overlay').classList.add('hidden');
    document.body.style.overflow = '';
};

function setAuthError(msg) {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
}

function setAuthLoading(loading) {
    const btn = document.querySelector('.login-btn');
    if (btn) btn.innerHTML = loading ? '<i class="fas fa-spinner fa-spin"></i> Please wait...' : (isSignUpMode ? 'Create Account' : 'Sign In');
    const g = document.getElementById('btn-google-signin');
    if (g) g.disabled = loading;
}

async function saveUserProfile(user, role, displayName) {
    await setDoc(doc(db, "users", user.uid), {
        email: user.email, displayName: displayName || user.displayName || '',
        role, createdAt: new Date().toISOString(), photoURL: user.photoURL || ''
    }, { merge: true });
}

function friendlyError(code) {
    const m = {
        'auth/invalid-email': 'Invalid email address.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/email-already-in-use': 'Email already registered. Sign in instead.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/too-many-requests': 'Too many attempts. Try again later.',
        'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
        'auth/invalid-credential': 'Invalid credentials. Check email/password.',
        'auth/network-request-failed': 'Network error. Check your connection.',
    };
    return m[code] || `Auth error: ${code}`;
}

function initAuth() {
    // Role tabs
    document.querySelectorAll('.role-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.role-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            currentRole = opt.getAttribute('data-role');
        });
    });

    // Email form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        setAuthError(''); setAuthLoading(true);
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        const displayName = document.getElementById('auth-name')?.value.trim() || '';
        try {
            if (isSignUpMode) {
                const cred = await createUserWithEmailAndPassword(auth, email, password);
                if (displayName) await updateProfile(cred.user, { displayName });
                await saveUserProfile(cred.user, currentRole, displayName);
            } else {
                const cred = await signInWithEmailAndPassword(auth, email, password);
                await saveUserProfile(cred.user, currentRole, '');
            }
        } catch (err) { setAuthError(friendlyError(err.code)); }
        finally { setAuthLoading(false); }
    });

    // Google
    document.getElementById('btn-google-signin').addEventListener('click', async () => {
        setAuthError(''); setAuthLoading(true);
        try {
            const res = await signInWithPopup(auth, googleProvider);
            const user = res.user;
            
            // Check if user already exists in Firestore to preserve role
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (!userDoc.exists()) {
                // New user: set default role or currently selected role
                await saveUserProfile(user, currentRole, user.displayName);
            } else {
                // Existing user: just update profile info but NOT the role
                await setDoc(doc(db, "users", user.uid), {
                    email: user.email,
                    displayName: user.displayName,
                    photoURL: user.photoURL,
                    lastLogin: new Date().toISOString()
                }, { merge: true });
            }
        } catch (err) { 
            console.error("Google Auth Error:", err);
            setAuthError(friendlyError(err.code)); 
        }
        finally { setAuthLoading(false); }
    });

    // Toggle mode
    document.getElementById('toggle-mode').addEventListener('click', (e) => {
        e.preventDefault(); isSignUpMode = !isSignUpMode; toggleAuthMode();
    });

    // Close modal on backdrop click
    document.getElementById('auth-modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeAuthModal();
    });
}

function toggleAuthMode() {
    const nameField = document.getElementById('name-field');
    const loginBtn = document.querySelector('.login-btn');
    const heading = document.getElementById('modal-heading');
    const sub = document.getElementById('modal-subheading');
    const link = document.querySelector('.signup-link');

    if (isSignUpMode) {
        nameField.style.display = 'flex';
        loginBtn.textContent = 'Create Account';
        heading.textContent = 'Join SlayTrip ⚡';
        sub.textContent = 'Start your slaying journey';
        link.innerHTML = 'Already have an account? <a href="#" id="toggle-mode">Sign in instead</a>';
    } else {
        nameField.style.display = 'none';
        loginBtn.textContent = 'Sign In';
        heading.textContent = 'Welcome to SlayTrip';
        sub.textContent = 'Create an account or sign in to continue';
        link.innerHTML = 'Don\'t have an account? <a href="#" id="toggle-mode">Create one</a>';
    }
    document.getElementById('toggle-mode').addEventListener('click', (e) => {
        e.preventDefault(); isSignUpMode = !isSignUpMode; toggleAuthMode();
    });
    setAuthError('');
}

window.signOutUser = async function() { await signOut(auth); };

// ─── Tab Switching ───────────────────────────────────────────────
const tabs = document.querySelectorAll('.nav-links li');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-tab');
        const isProtected = tab.getAttribute('data-protected') === 'true';

        // If protected and not logged in → show auth modal
        if (isProtected && !currentUser) {
            openAuthModal(target, () => switchToTab(target));
            return;
        }
        switchToTab(target);
    });
});

function switchToTab(target) {
    tabs.forEach(t => t.classList.remove('active'));
    const tab = document.querySelector(`[data-tab="${target}"]`);
    if (tab) tab.classList.add('active');
    tabContents.forEach(c => { c.classList.remove('active'); if (c.id === target) c.classList.add('active'); });
    loadTabData(target);
    
    // Mobile: Close sidebar after selection
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        overlay.classList.add('hidden');
    }
}

async function loadTabData(tab) {
    switch (tab) {
        case 'explore': await fetchDestinations(); break;
        case 'planner': initPlannerWizard(); break;
        case 'updates': await fetchUpdates(); break;
        case 'trips':   await renderTripsTab(); break;
        case 'security': renderSecurityTab(); break;
        case 'bookings': break; // Placeholder for future provider logic
        case 'manager-view': break; // Placeholder for future manager logic
    }
}

// ─── Public Data Fetchers ────────────────────────────────────────
async function fetchDestinations() {
    try {
        const res = await fetch(`${API_BASE_URL}/destinations`);
        if (!res.ok) throw new Error(res.status);
        renderDestinations(await res.json());
    } catch (e) { console.error('Destinations error:', e); }
}

async function fetchUpdates() {
    try {
        const res = await fetch(`${API_BASE_URL}/updates`);
        if (!res.ok) throw new Error(res.status);
        renderUpdates(await res.json());
    } catch (e) { console.error('Updates error:', e); }
}

// ─── Render: Explore ─────────────────────────────────────────────
function renderDestinations(destinations) {
    const c = document.getElementById('destinations-container');
    c.innerHTML = destinations.map(d => `
        <div class="card" onclick="prefillPlannerFromCard('${d.name}')">
            <img src="${d.image}" alt="${d.name}" class="card-img" loading="lazy">
            <div class="card-body">
                <span class="card-tag">${d.location}</span>
                <h3 class="card-title">${d.name}</h3>
                <p style="color:var(--text-muted);font-size:0.9rem;line-height:1.5;">${d.description}</p>
                <div class="card-meta">
                    <span class="price">${d.price}</span>
                    <span class="rating"><i class="fas fa-star"></i> ${d.rating}</span>
                </div>
                <button class="btn-primary" style="width:100%;margin-top:1rem;font-size:0.85rem;padding:0.6rem;">Plan This Trip ⚡</button>
            </div>
        </div>`).join('');
}

// ─── Render: Updates ─────────────────────────────────────────────
function renderUpdates(updates) {
    const icons = { Weather: 'fa-cloud-sun', Flight: 'fa-plane-departure', Tip: 'fa-lightbulb', Alert: 'fa-triangle-exclamation' };
    document.getElementById('updates-container').innerHTML = updates.map(u => `
        <div class="update-card">
            <div class="update-icon"><i class="fas ${icons[u.type] || 'fa-info-circle'}"></i></div>
            <div class="update-content">
                <h4 style="margin-bottom:0.25rem;">${u.type}</h4>
                <p style="color:var(--text-muted);font-size:0.95rem;">${u.content}</p>
            </div>
        </div>`).join('');
}

// ─── Render: My Trips (protected) ────────────────────────────────
async function renderTripsTab() {
    const c = document.getElementById('trips-content');
    c.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Fetching your slayed trips...</div>';
    
    try {
        const res = await authFetch(`${API_BASE_URL}/my-trips`);
        if (!res.ok) throw new Error("Failed to fetch trips");
        const trips = await res.json();
        
        if (trips.length === 0) {
            c.innerHTML = `
                <header class="tab-header">
                    <h1>My Saved Trips</h1>
                    <p>All your generated itineraries in one place</p>
                </header>
                <div class="empty-state">
                    <i class="fas fa-suitcase-rolling"></i>
                    <h3>No trips saved yet</h3>
                    <p>Generate a trip in the Planner and save it here!</p>
                    <button class="btn-primary" onclick="switchToTab('planner')"><i class="fas fa-calendar-alt"></i> Go to Planner</button>
                </div>`;
            return;
        }

        c.innerHTML = `
            <header class="tab-header">
                <h1>My Saved Trips</h1>
                <p>You have slayed ${trips.length} itineraries</p>
            </header>
            <div class="trips-grid">
                ${trips.map(t => `
                    <div class="trip-summary-card" onclick="viewSavedTrip(${JSON.stringify(t).replace(/"/g, '&quot;')})">
                        <div class="trip-badge">${t.destination}</div>
                        <h3>Trip to ${t.destination}</h3>
                        <p>${t.start_date} · ${t.num_days} days</p>
                        <div class="trip-meta">
                            <span>₹${t.budget_breakdown.total.toLocaleString()}</span>
                            <span><i class="fas fa-chevron-right"></i></span>
                        </div>
                    </div>
                `).join('')}
            </div>`;
    } catch (e) {
        c.innerHTML = `<div class="error-state">Failed to load trips. ${e.message}</div>`;
    }
}

window.viewSavedTrip = function(trip) {
    switchToTab('planner');
    renderItinerary(trip);
    document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('step-result').classList.add('active');
    document.querySelector('.wizard-header').style.display = 'none';
};

// ─── Render: Security (protected) ────────────────────────────────
function renderSecurityTab() {
    const c = document.getElementById('security-content');
    const name = currentUser?.displayName || currentUser?.email || 'User';
    c.innerHTML = `
        <header class="tab-header">
            <h1>Security Center</h1>
            <p>Protect your journeys and data</p>
        </header>
        <div class="security-grid">
            <div class="security-card">
                <div class="security-info">
                    <h3>Account</h3>
                    <p>Signed in as <strong>${currentUser?.email}</strong></p>
                </div>
                <span class="badge-active">Active</span>
            </div>
            <div class="security-card">
                <div class="security-info">
                    <h3>Digital Vault</h3>
                    <p>Securely store your passport and travel docs.</p>
                </div>
                <button class="btn-outline">Access Vault</button>
            </div>
            <div class="security-card">
                <div class="security-info">
                    <h3>Device Management</h3>
                    <p>Currently logged in on this device.</p>
                </div>
                <button class="btn-outline">View Details</button>
            </div>
            <div class="security-card danger-zone">
                <div class="security-info">
                    <h3>Privacy Mode</h3>
                    <p>Hide your current trip from public feeds.</p>
                </div>
                <label class="switch"><input type="checkbox"><span class="slider round"></span></label>
            </div>
        </div>`;
}

// ─── Planner Wizard ──────────────────────────────────────────────
function initPlannerWizard() {
    document.querySelectorAll('.dest-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.dest-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            selectedDestination = chip.getAttribute('data-dest');
        });
    });
    document.querySelectorAll('.style-card').forEach(card => {
        card.addEventListener('click', () => {
            card.classList.toggle('selected');
            const s = card.getAttribute('data-style');
            if (card.classList.contains('selected')) { if (!selectedStyles.includes(s)) selectedStyles.push(s); }
            else { selectedStyles = selectedStyles.filter(x => x !== s); }
        });
    });
    const today = new Date();
    const p7 = new Date(today); p7.setDate(today.getDate() + 7);
    const p10 = new Date(today); p10.setDate(today.getDate() + 10);
    document.getElementById('start-date').value = p7.toISOString().split('T')[0];
    document.getElementById('end-date').value = p10.toISOString().split('T')[0];
}

window.goToStep = function(n) {
    if (n === 2) {
        const s = document.getElementById('start-date').value, e = document.getElementById('end-date').value;
        if (!s || !e || new Date(e) <= new Date(s)) { alert('Pick valid dates!'); return; }
    }
    if (n === 3 && selectedStyles.length === 0) { alert('Pick at least one travel style!'); return; }
    document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`step-${n}`).classList.add('active');
    document.querySelectorAll('.wizard-step').forEach((ws, i) => {
        ws.classList.remove('active', 'done');
        if (i + 1 < n) ws.classList.add('done');
        if (i + 1 === n) ws.classList.add('active');
    });
};

async function generateTrip() {
    const btn = document.getElementById('generate-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Building your trip...';
    btn.disabled = true;
    const payload = {
        destination: selectedDestination,
        start_date: document.getElementById('start-date').value,
        end_date: document.getElementById('end-date').value,
        budget_level: document.getElementById('budget-level').value,
        travel_style: selectedStyles.length > 0 ? selectedStyles : ['culture'],
        group_type: document.getElementById('group-type').value,
        constraints: Array.from(document.querySelectorAll('.constraint-card input:checked')).map(cb => cb.value)
    };
    try {
        const res = await fetch(`${API_BASE_URL}/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || res.status); }
        const data = await res.json();
        lastGeneratedTrip = data; // Store for saving
        renderItinerary(data);
        document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('step-result').classList.add('active');
        document.querySelector('.wizard-header').style.display = 'none';
        updateSaveTripArea();
    } catch (e) { alert('Could not generate trip. ' + e.message); console.error(e); }
    finally { btn.innerHTML = '<i class="fas fa-magic"></i> Generate My Trip'; btn.disabled = false; }
}
window.generateTrip = generateTrip;

function renderItinerary(data) {
    const bL = { budget: '🎒 Backpacker', mid: '✈️ Comfort', luxury: '💎 Luxury' };
    const gL = { solo: '🧍 Solo', couple: '👫 Couple', family: '👨‍👩‍👧 Family', group: '👥 Group' };
    const INR = n => '₹' + n.toLocaleString('en-IN');
    const badges = data.applied_constraints.map(c => `<span class="constraint-badge">${c}</span>`).join('');
    const days = data.days.map(day => `
        <div class="day-block"><div class="day-label"><h3>Day ${day.day_number}</h3><span class="day-date">${day.date}</span></div>
        <div class="itinerary-timeline">${day.activities.map(a => `
            <div class="itin-item"><div class="itin-meta"><span class="itin-time"><i class="fas fa-clock"></i> ${a.time}</span><span class="itin-status ${a.status.toLowerCase()}">${a.status}</span></div>
            <div class="itin-title">${a.title}</div>
            <div class="itin-footer"><span class="itin-location"><i class="fas fa-location-dot"></i> ${a.location} · ${a.duration}</span><span class="itin-cost">${INR(a.cost)}</span></div></div>`).join('')}
        </div></div>`).join('');

    document.getElementById('itinerary-output').innerHTML = `
        <div class="itinerary-hero"><div><h2>${data.destination}</h2><p>${data.start_date} → ${data.end_date} · ${data.num_days} days</p><p>${gL[data.group_type]} · ${bL[data.budget_level]}</p></div>
        <div class="budget-pills"><span class="budget-pill">🏃 Activities: ${INR(data.budget_breakdown.activities)}</span><span class="budget-pill">🏨 Hotel: ${INR(data.budget_breakdown.hotel)}</span><span class="budget-pill">🚗 Transport: ${INR(data.budget_breakdown.transport)}</span><span class="budget-pill total">Total: ${INR(data.budget_breakdown.total)}</span></div></div>
        ${badges ? `<div class="constraint-badges">${badges}</div>` : ''}
        <div class="hotel-card"><div><h4>🏨 ${data.hotel.name}</h4><p>${data.hotel.type} · ${INR(data.hotel.per_night)}/night × ${data.num_days} nights</p></div><span class="price-tag">${INR(data.hotel.total)}</span></div>
        ${days}`;
}

window.resetPlanner = function() {
    selectedStyles = [];
    document.querySelectorAll('.style-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.dest-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('.dest-chip').classList.add('active');
    selectedDestination = 'Goa';
    document.querySelector('.wizard-header').style.display = 'flex';
    document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('step-1').classList.add('active');
    document.querySelectorAll('.wizard-step').forEach((ws, i) => { ws.classList.remove('active', 'done'); if (i === 0) ws.classList.add('active'); });
};

window.prefillPlannerFromCard = function(destName) {
    switchToTab('planner');
    setTimeout(() => {
        document.querySelectorAll('.dest-chip').forEach(c => {
            c.classList.remove('active');
            if (c.getAttribute('data-dest') === destName) { c.classList.add('active'); selectedDestination = destName; }
        });
    }, 50);
};

window.saveCurrentTrip = async function() {
    if (!lastGeneratedTrip) return;
    const btn = document.querySelector('#save-trip-area .btn-primary');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    try {
        const res = await authFetch(`${API_BASE_URL}/save-trip`, {
            method: 'POST',
            body: JSON.stringify(lastGeneratedTrip)
        });
        if (!res.ok) throw new Error("Failed to save trip");
        btn.innerHTML = '<i class="fas fa-check"></i> Saved!';
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }, 2000);
    } catch (e) {
        alert(e.message);
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
};
window.shareTrip = function() { navigator.clipboard?.writeText(window.location.href); alert('Link copied!'); };
window.switchToTab = switchToTab;

window.signOutUser = async function() { await signOut(auth); };

// ─── Init ────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    applyRandomTheme();
    initAuth();
    initAuthObserver();
    loadTabData('planner');
    initMobileSidebar();
});

function initMobileSidebar() {
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (toggle && sidebar && overlay) {
        toggle.addEventListener('click', () => {
            sidebar.classList.add('open');
            overlay.classList.remove('hidden');
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.add('hidden');
        });
    }
}
