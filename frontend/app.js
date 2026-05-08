const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:8005/api'
    : '/api';

// ─── Firebase Config ──────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "REDACTED_API_KEY",
    authDomain: "nssk1999promptwars.firebaseapp.com",
    projectId: "nssk1999promptwars",
    storageBucket: "nssk1999promptwars.firebasestorage.app",
    messagingSenderId: "1013229880593",
    appId: "1:1013229880593:web:8fc42d589ad64c05a4f8b0"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();

// ─── Theme Switching Logic ────────────────────────────────────────
const themes = [
    { name: "Indigo Night", primary: "#6366f1", primaryHover: "#4f46e5", bg: "#0f172a", sidebar: "#1e1b4b", accent: "#818cf8" },
    { name: "Ocean Blue", primary: "#3b82f6", primaryHover: "#2563eb", bg: "#0f172a", sidebar: "#1e3a5f", accent: "#60a5fa" },
    { name: "Crimson Dark", primary: "#ef4444", primaryHover: "#dc2626", bg: "#0f172a", sidebar: "#450a0a", accent: "#f87171" },
    { name: "Emerald Dusk", primary: "#10b981", primaryHover: "#059669", bg: "#0f172a", sidebar: "#064e3b", accent: "#34d399" }
];

function applyRandomTheme() {
    const theme = themes[Math.floor(Math.random() * themes.length)];
    const root = document.documentElement;
    root.style.setProperty('--primary-color', theme.primary);
    root.style.setProperty('--primary-hover', theme.primaryHover);
    root.style.setProperty('--bg-dark', theme.bg);
    root.style.setProperty('--sidebar-bg', theme.sidebar);
    root.style.setProperty('--accent-color', theme.accent);
    console.log(`Theme: ${theme.name}`);
}

// ─── Session State ────────────────────────────────────────────────
let currentUser = null;
let currentRole = 'customer';
let isSignUpMode = false;

// ─── Auth State Observer (auto login if session exists) ──────────
function initAuthObserver() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            // Load role from Firestore
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                currentRole = userDoc.data().role || 'customer';
            }
            showApp();
        } else {
            currentUser = null;
            showLoginScreen();
        }
    });
}

// ─── UI State Helpers ─────────────────────────────────────────────
function showApp() {
    document.getElementById('login-overlay').classList.add('hidden');
    document.querySelector('.sidebar').classList.remove('hidden');
    document.querySelector('.content').classList.remove('hidden');
    updateSidebarForRole();
    updateUserAvatar();
    loadTabData('explore');
}

function showLoginScreen() {
    document.getElementById('login-overlay').classList.remove('hidden');
    document.querySelector('.sidebar').classList.add('hidden');
    document.querySelector('.content').classList.add('hidden');
}

function updateUserAvatar() {
    if (!currentUser) return;
    const name = currentUser.displayName || currentUser.email || 'User';
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    document.querySelector('.profile-info .name').textContent = name;
    const avatar = document.querySelector('.profile-preview img');
    if (currentUser.photoURL) {
        avatar.src = currentUser.photoURL;
    } else {
        avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;
    }
}

function updateSidebarForRole() {
    const roleLabels = { customer: 'Pro Explorer', provider: 'Service Partner', manager: 'Travel Manager' };
    document.querySelector('.profile-info .status').textContent = roleLabels[currentRole] || 'User';
}

function setAuthError(msg) {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
}

function setAuthLoading(loading) {
    const btn = document.querySelector('.login-btn');
    if (btn) btn.innerHTML = loading
        ? '<i class="fas fa-spinner fa-spin"></i> Please wait...'
        : (isSignUpMode ? 'Create Account' : 'Sign In');
    const btn2 = document.querySelector('.btn-google');
    if (btn2) btn2.disabled = loading;
}

// ─── Save user profile to Firestore ──────────────────────────────
async function saveUserProfile(user, role, displayName) {
    await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        displayName: displayName || user.displayName || '',
        role: role,
        createdAt: new Date().toISOString(),
        photoURL: user.photoURL || ''
    }, { merge: true });
}

// ─── Auth Event Handlers ──────────────────────────────────────────
function initAuth() {
    const roleOptions = document.querySelectorAll('.role-option');
    roleOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            roleOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            currentRole = opt.getAttribute('data-role');
        });
    });

    // Email/Password form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        setAuthError('');
        setAuthLoading(true);

        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        const displayName = document.getElementById('auth-name')?.value.trim() || '';

        try {
            let userCred;
            if (isSignUpMode) {
                userCred = await createUserWithEmailAndPassword(auth, email, password);
                if (displayName) await updateProfile(userCred.user, { displayName });
                await saveUserProfile(userCred.user, currentRole, displayName);
            } else {
                userCred = await signInWithEmailAndPassword(auth, email, password);
                // Update role in Firestore on each login
                await saveUserProfile(userCred.user, currentRole, '');
            }
        } catch (err) {
            setAuthError(friendlyError(err.code));
        } finally {
            setAuthLoading(false);
        }
    });

    // Google Sign-In
    document.querySelector('.btn-google').addEventListener('click', async () => {
        setAuthError('');
        setAuthLoading(true);
        try {
            const result = await signInWithPopup(auth, googleProvider);
            await saveUserProfile(result.user, currentRole, result.user.displayName);
        } catch (err) {
            setAuthError(friendlyError(err.code));
        } finally {
            setAuthLoading(false);
        }
    });

    // Toggle Sign Up / Sign In
    document.getElementById('toggle-mode').addEventListener('click', (e) => {
        e.preventDefault();
        isSignUpMode = !isSignUpMode;
        toggleAuthMode();
    });
}

function toggleAuthMode() {
    const nameField = document.getElementById('name-field');
    const toggleLink = document.getElementById('toggle-mode');
    const signupMsg = document.querySelector('.signup-link');
    const loginBtn = document.querySelector('.login-btn');
    const heading = document.querySelector('.login-header h2');
    const subheading = document.querySelector('.login-header p');

    if (isSignUpMode) {
        if (nameField) nameField.style.display = 'flex';
        loginBtn.textContent = 'Create Account';
        heading.textContent = 'Join SlayTrip ⚡';
        subheading.textContent = 'Start your slaying journey';
        toggleLink.textContent = 'Sign in instead';
        signupMsg.innerHTML = 'Already have an account? <a href="#" id="toggle-mode">Sign in instead</a>';
    } else {
        if (nameField) nameField.style.display = 'none';
        loginBtn.textContent = 'Sign In';
        heading.textContent = 'Welcome to SlayTrip';
        subheading.textContent = 'Select your role to continue';
        toggleLink.textContent = 'Create one';
        signupMsg.innerHTML = 'Don\'t have an account? <a href="#" id="toggle-mode">Create one</a>';
    }
    // Re-attach toggle listener after innerHTML rewrite
    document.getElementById('toggle-mode').addEventListener('click', (e) => {
        e.preventDefault();
        isSignUpMode = !isSignUpMode;
        toggleAuthMode();
    });
    setAuthError('');
}

function friendlyError(code) {
    const map = {
        'auth/invalid-email': 'Invalid email address.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/email-already-in-use': 'Email already registered. Sign in instead.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/too-many-requests': 'Too many attempts. Try again later.',
        'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
        'auth/invalid-credential': 'Invalid credentials. Check email and password.',
        'auth/network-request-failed': 'Network error. Check your connection.',
    };
    return map[code] || `Authentication error: ${code}`;
}

// ─── Sign Out ─────────────────────────────────────────────────────
window.signOutUser = async function() {
    await signOut(auth);
};

// ─── Initial Load ─────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    applyRandomTheme();
    initAuth();
    initAuthObserver();
});

// ─── Tab Switching Logic ──────────────────────────────────────────
const tabs = document.querySelectorAll('.nav-links li');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-tab');
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        tabContents.forEach(content => {
            content.classList.remove('active');
            if (content.id === target) content.classList.add('active');
        });
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
            const style = card.getAttribute('data-style');
            if (card.classList.contains('selected')) {
                if (!selectedStyles.includes(style)) selectedStyles.push(style);
            } else {
                selectedStyles = selectedStyles.filter(s => s !== style);
            }
        });
    });

    const today = new Date();
    const plus7 = new Date(today); plus7.setDate(today.getDate() + 7);
    const plus10 = new Date(today); plus10.setDate(today.getDate() + 10);
    document.getElementById('start-date').value = formatDate(plus7);
    document.getElementById('end-date').value = formatDate(plus10);
}

function formatDate(d) { return d.toISOString().split('T')[0]; }

window.goToStep = function(stepNum) {
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
    document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`step-${stepNum}`).classList.add('active');
    document.querySelectorAll('.wizard-step').forEach((ws, idx) => {
        ws.classList.remove('active', 'done');
        if (idx + 1 < stepNum) ws.classList.add('done');
        if (idx + 1 === stepNum) ws.classList.add('active');
    });
};

window.generateTrip = async function() {
    const btn = document.getElementById('generate-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Building your trip...';
    btn.disabled = true;

    const constraints = Array.from(document.querySelectorAll('.constraint-card input:checked')).map(cb => cb.value);

    const payload = {
        destination: selectedDestination,
        start_date: document.getElementById('start-date').value,
        end_date: document.getElementById('end-date').value,
        budget_level: document.getElementById('budget-level').value,
        travel_style: selectedStyles.length > 0 ? selectedStyles : ['culture'],
        group_type: document.getElementById('group-type').value,
        constraints
    };

    try {
        const res = await fetch(`${API_BASE_URL}/plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const itinerary = await res.json();
        renderItinerary(itinerary);
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
};

function renderItinerary(data) {
    const budgetLabels = { budget: '🎒 Backpacker', mid: '✈️ Comfort', luxury: '💎 Luxury' };
    const groupLabels = { solo: '🧍 Solo', couple: '👫 Couple', family: '👨‍👩‍👧 Family', group: '👥 Group' };
    const INR = n => '₹' + n.toLocaleString('en-IN');

    const constraintBadges = data.applied_constraints.map(c => `<span class="constraint-badge">${c}</span>`).join('');

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

window.resetPlanner = function() {
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
};

window.prefillPlannerFromCard = function(destName) {
    document.querySelectorAll('.nav-links li').forEach(t => t.classList.remove('active'));
    document.querySelector('[data-tab="planner"]').classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('planner').classList.add('active');
    initPlannerWizard();
    setTimeout(() => {
        document.querySelectorAll('.dest-chip').forEach(c => {
            c.classList.remove('active');
            if (c.getAttribute('data-dest') === destName) {
                c.classList.add('active');
                selectedDestination = destName;
            }
        });
    }, 50);
};
