import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, update, get, onValue, push, remove, query, orderByChild, limitToLast, serverTimestamp, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signInAnonymously, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDeO2BkAXLVRUG5tW2uOX1aQ3VIPSAmobE",
  authDomain: "web-lop-35a2d.firebaseapp.com",
  databaseURL: "https://web-lop-35a2d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "web-lop-35a2d",
  storageBucket: "web-lop-35a2d.appspot.com",
  messagingSenderId: "977812003616",
  appId: "1:977812003616:web:56a37856a1745a55891545"
};

const TASKS = [
  "Quét lớp",
  "Lau bảng",
  "Xếp bàn ghế",
  "Tắt các thiết bị điện",
  "Dọn bàn ăn"
];

let DAYS = ["tuan_0", "tuan_1", "tuan_2", "tuan_3", "tuan_4", "tuan_5"];

function createNewWeekHeaders() {
  let curr = new Date();
  let first = curr.getDate() - curr.getDay() + 1;
  if (curr.getDay() === 0) first = curr.getDate() - 6;
  let monday = new Date(curr.setDate(first));
  let header = [];
    
  for (let i = 0; i < 6; i++) {
    let start = new Date(monday);
    start.setDate(monday.getDate() + i * 7);
    let end = new Date(start);
    end.setDate(start.getDate() + 4);
  
    // Always store full DD/MM/YYYY format for reliable parsing
    const startStr = `${start.getDate()}/${start.getMonth() + 1}/${start.getFullYear()}`;
    const endStr = `${end.getDate()}/${end.getMonth() + 1}/${end.getFullYear()}`;
    header.push(`${startStr} - ${endStr}`);
  }
  return header;
}

let weekHeaders = createNewWeekHeaders();

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

/**
 * Convert Firebase object back to array (Firebase converts arrays with holes to objects)
 */
function toArray(val) {
  if (Array.isArray(val)) return val.filter(item => item !== undefined && item !== null);
  if (val && typeof val === 'object') {
    return Object.keys(val)
      .sort((a, b) => Number(a) - Number(b))
      .map(key => val[key])
      .filter(item => item !== undefined && item !== null);
  }
  return [];
}

/**
 * Normalize schedule object - convert cell values from Firebase objects to arrays
 */
function normalizeSchedule(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const result = {};
  Object.keys(raw).forEach(key => {
    result[key] = toArray(raw[key]);
  });
  return result;
}

/**
 * Parse a week header string like "17/11 - 21/11" or "30/12/2025 - 3/1/2026"
 * and return the start Date, or null if unparseable.
 */
function parseWeekStart(weekStr) {
  if (typeof weekStr !== "string") return null;
  const startPart = weekStr.split("-")[0].trim();
  const dm = startPart.split("/");
  if (dm.length < 2) return null;
  const day = parseInt(dm[0], 10);
  const month = parseInt(dm[1], 10) - 1;
  if (isNaN(day) || isNaN(month)) return null;
  let year;
  if (dm.length >= 3) {
    year = parseInt(dm[2], 10);
  } else {
    // No year in string: infer. If the week is in December but today is Jan,
    // the year should be last year (cross-year handling).
    const now = new Date();
    year = now.getFullYear();
    if (month === 11 && now.getMonth() === 0) year -= 1; // Dec week, currently Jan
    else if (month === 0 && now.getMonth() === 11) year += 1; // Jan week, currently Dec
  }
  if (isNaN(year)) return null;
  const d = new Date(year, month, day);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Determine which week index (0-5) contains today's date.
 * Returns -1 if none match.
 */
function getCurrentWeekIndex() {
  const headers = toArray(currentClassData.weekHeaders);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < headers.length; i++) {
    const start = parseWeekStart(headers[i]);
    if (!start) continue;
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    if (today >= start && today <= end) return i;
  }
  return -1;
}

// ===========================================
// FIREBASE INIT
// ===========================================

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const classesRef = ref(db, "trucNhatLop/classes");
const currentClassRef = ref(db, "trucNhatLop/currentClassId");
const chatRef = ref(db, "trucNhatLop/chatMessages");
const guestsRef = ref(db, "trucNhatLop/guests");
const postsRef = ref(db, "trucNhatLop/posts");
const accessRequestsRef = ref(db, "accessRequests");
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let isAdmin = false;
let isGuest = false;
let guestName = null;
let currentUser = null;
let classesData = {};
let currentClassId = null;
let currentClassData = {
  students: [],
  schedule: {},
  weekHeaders: weekHeaders,
  notice: "Chưa có thông tin báo bài mới."
};
let currentClassListener = null;
let classesListListener = null;
let authCheckSeq = 0;
let tapSelectedStudent = null; // Name of student selected for tap-to-assign (mobile)
let randomSpinning = false;
let randomNames = [];
let randomFlowers = [];
let randomButterflies = [];
let randomRAF = null;
let randomDrawStart = 0;
let randomDrawState = null;
let randomDrawTimer = null;
let randomCountdownTimer = null;
let weekButterflyEls = [];
let weekButterflyStates = [];
let weekButterflyRAF = null;
let weekButterflyLast = 0;
// Cache of the flight bounds to avoid getBoundingClientRect every frame
let weekButterflyCache = { dirty: true, bounds: null };
function markWeekButterflyDirty() { weekButterflyCache.dirty = true; }
window.addEventListener('resize', markWeekButterflyDirty);
window.addEventListener('scroll', markWeekButterflyDirty, { passive: true });
const WEEK_BUTTERFLY_SVG = '<svg viewBox="0 0 64 64" width="38" height="38"><g class="bf-wing bf-wing-l"><path d="M32 30C22 12 6 10 8 24c1 8 10 10 20 10-8 2-12 8-8 12 4 4 10-2 12-10z" fill="#f472b6"/><path d="M32 30C24 16 12 14 13 24c1 6 8 8 16 8z" fill="#ec4899"/></g><g class="bf-wing bf-wing-r"><path d="M32 30c10-18 26-20 24-6-1 8-10 10-20 10 8 2 12 8 8 12-4 4-10-2-12-10z" fill="#f9a8d4"/><path d="M32 30c8-14 20-16 19-6-1 6-8 8-16 8z" fill="#f472b6"/></g><ellipse cx="32" cy="32" rx="2.4" ry="9" fill="#7c2d12"/><path d="M31 24c-2-4-5-5-7-4M33 24c2-4 5-5 7-4" stroke="#7c2d12" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>';
// Per-butterfly flight personalities: size, speed, hue shift, wing-flap speed, bob intensity
const WEEK_BUTTERFLY_CONFIGS = [
  { scale: 1.00, speed: 1.00, hue: 0,   flap: 0.30, bob: 1.00 },
  { scale: 0.78, speed: 1.30, hue: 45,  flap: 0.24, bob: 1.35 },
  { scale: 1.18, speed: 0.82, hue: -35, flap: 0.34, bob: 0.80 },
  { scale: 0.90, speed: 1.12, hue: 95,  flap: 0.27, bob: 1.15 },
  { scale: 0.68, speed: 1.45, hue: -70, flap: 0.22, bob: 1.45 }
];
// ===== Random page (ocean + coral + fish) =====
// Coral colors (ocean reef palette, no duplicates)
const CORAL_COLORS = [
  '#f472b6', '#ec4899', '#f43f5e', '#fb7185', '#f9a8d4',
  '#fb923c', '#f97316', '#f59e0b', '#fbbf24', '#fcd34d',
  '#a78bfa', '#8b5cf6', '#a855f7', '#c084fc', '#d946ef',
  '#2dd4bf', '#14b8a6', '#22d3ee', '#06b6d4', '#38bdf8',
  '#34d399', '#4ade80', '#a3e635', '#f87171', '#e879f9',
  '#fb7185', '#fdba74', '#fde047', '#c4b5fd', '#67e8f9',
  '#6ee7b7', '#bef264', '#fca5a5', '#f0abfc', '#7dd3fc',
  '#5eead4', '#86efac', '#fdba74', '#f9a8d4', '#c4b5fd',
  '#fcd34d', '#fda4af', '#d8b4fe', '#a5f3fc', '#6ee7b7',
  '#fef08a', '#fecaca', '#e9d5ff', '#cffafe', '#dcfce7'
];

function createCoralSVG(color, variant = 0) {
  const base = '<ellipse cx="32" cy="67" rx="22" ry="5" fill="#0c4a6e" opacity="0.3"/>';
  if (variant % 3 === 1) {
    // Sea fan coral
    return `<svg class="coral-svg" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg">
      ${base}
      <g stroke="${color}" stroke-linecap="round" fill="none">
        <path d="M32 67 L32 50" stroke-width="5"/>
        <path d="M32 52 C 18 46, 12 32, 16 20" stroke-width="4"/>
        <path d="M32 52 C 24 42, 22 28, 26 16" stroke-width="4"/>
        <path d="M32 52 C 40 42, 42 28, 38 16" stroke-width="4"/>
        <path d="M32 52 C 46 46, 52 32, 48 20" stroke-width="4"/>
      </g>
      <g fill="${color}">
        <circle cx="16" cy="20" r="3.5"/><circle cx="26" cy="16" r="3.5"/>
        <circle cx="38" cy="16" r="3.5"/><circle cx="48" cy="20" r="3.5"/>
      </g>
    </svg>`;
  } else if (variant % 3 === 2) {
    // Dome / brain coral
    return `<svg class="coral-svg" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg">
      ${base}
      <path d="M12 67 C 12 44, 20 30, 32 30 C 44 30, 52 44, 52 67 Z" fill="${color}" opacity="0.92"/>
      <g stroke="#ffffff" stroke-width="2" fill="none" opacity="0.35" stroke-linecap="round">
        <path d="M18 52 C 22 46, 26 46, 30 52"/>
        <path d="M30 52 C 34 46, 38 46, 42 52"/>
        <path d="M24 60 C 28 54, 32 54, 36 60"/>
        <path d="M36 60 C 40 54, 44 54, 48 60"/>
      </g>
    </svg>`;
  }
  // Staghorn (branching) coral
  return `<svg class="coral-svg" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg">
    ${base}
    <g stroke="${color}" stroke-linecap="round" fill="none">
      <path d="M32 67 L32 42" stroke-width="6"/>
      <path d="M32 52 C 22 46, 18 34, 20 22" stroke-width="5"/>
      <path d="M32 48 C 42 42, 46 30, 44 18" stroke-width="5"/>
      <path d="M32 58 C 26 54, 22 48, 24 40" stroke-width="4" opacity="0.7"/>
      <path d="M32 56 C 38 52, 42 46, 40 38" stroke-width="4" opacity="0.7"/>
    </g>
    <g fill="${color}">
      <circle cx="20" cy="22" r="4.5"/><circle cx="44" cy="18" r="4.5"/>
      <circle cx="24" cy="40" r="3.5" opacity="0.85"/><circle cx="40" cy="38" r="3.5" opacity="0.85"/>
    </g>
  </svg>`;
}

// Seaweed decoration SVGs on both sides (replaces tree branches)
const RANDOM_BRANCH_LEFT_SVG = '<svg class="random-branch branch-left" viewBox="0 0 100 500" preserveAspectRatio="none" aria-hidden="true"><path d="M20 510 C 8 400, 32 300, 18 200 C 8 120, 28 60, 20 -10" fill="none" stroke="#0d9488" stroke-width="11" stroke-linecap="round" opacity="0.65"/><path d="M44 510 C 54 400, 32 300, 48 200 C 58 120, 42 60, 50 -10" fill="none" stroke="#14b8a6" stroke-width="9" stroke-linecap="round" opacity="0.55"/><path d="M70 510 C 60 420, 80 340, 68 260 C 60 200, 74 140, 68 80" fill="none" stroke="#0f766e" stroke-width="10" stroke-linecap="round" opacity="0.6"/></svg>';
const RANDOM_BRANCH_RIGHT_SVG = '<svg class="random-branch branch-right" viewBox="0 0 100 500" preserveAspectRatio="none" aria-hidden="true"><path d="M20 510 C 8 400, 32 300, 18 200 C 8 120, 28 60, 20 -10" fill="none" stroke="#0d9488" stroke-width="11" stroke-linecap="round" opacity="0.65"/><path d="M44 510 C 54 400, 32 300, 48 200 C 58 120, 42 60, 50 -10" fill="none" stroke="#14b8a6" stroke-width="9" stroke-linecap="round" opacity="0.55"/><path d="M70 510 C 60 420, 80 340, 68 260 C 60 200, 74 140, 68 80" fill="none" stroke="#0f766e" stroke-width="10" stroke-linecap="round" opacity="0.6"/></svg>';

// Fish SVG for the random page (faces RIGHT; swims and gathers at corals)
const RANDOM_BF_SVG = '<svg viewBox="0 0 64 64"><g class="fish-tail"><path d="M14 32 L2 22 L6 32 L2 42 Z" fill="currentColor" opacity="0.9"/></g><path d="M58 32 C 50 18, 24 18, 14 32 C 24 46, 50 46, 58 32 Z" fill="currentColor"/><path d="M36 20 Q 32 11, 27 20" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M36 44 Q 32 53, 27 44" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="46" cy="28" r="3.5" fill="#0c4a6e"/><circle cx="45.2" cy="27.2" r="1.3" fill="#ffffff"/></svg>';
// Fish body colors (ocean fish palette)
const RANDOM_BF_HUES = ['#f97316', '#3b82f6', '#facc15', '#06b6d4', '#ef4444', '#8b5cf6', '#10b981', '#ec4899', '#0ea5e9', '#f43f5e', '#a855f7', '#14b8a6', '#f59e0b', '#6366f1', '#22c55e', '#e879f9'];
const RANDOM_MAX_BUTTERFLIES = 16;

function getDefaultClassData() {
  return {
    students: [],
    schedule: {},
    weekHeaders: createNewWeekHeaders(),
    notice: "Chưa có thông tin báo bài mới.",
    createdAt: Date.now()
  };
}

function renderAll() {
  renderClassSelector();
  renderClassList();
  renderSchedule();
  renderNotice();
  updateStudentDragList();
  updateStudentCount();
  // Refresh random board if that tab is currently open
  const randomPanel = document.getElementById("panel-random");
  if (randomPanel && randomPanel.classList.contains("active") && !randomSpinning) {
    renderRandomBoard();
  }
  // Refresh the báo bài on the Báo page when it is open
  renderBaoBaibai();
}

function updateStudentDragList() {
  const list = document.getElementById("studentDragList");
  if (!list) return;
  
  const usageCount = {};
  const schedule = normalizeSchedule(currentClassData.schedule);
  Object.values(schedule).forEach(arr => {
    toArray(arr).forEach(name => {
      usageCount[name] = (usageCount[name] || 0) + 1;
    });
  });
  
  list.innerHTML = "";
  const students = toArray(currentClassData.students);
  students.forEach((name, idx) => {
    const count = usageCount[name] || 0;
    const item = document.createElement("div");
    item.className = "student-drag-item";
    item.setAttribute("role", "listitem");
    item.draggable = isAdmin;
    item.dataset.studentIndex = idx;
    item.dataset.studentName = name;
    item.innerHTML = `
      <span class="student-drag-handle" aria-label="Kéo học sinh ${escapeHtml(name)}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </span>
      <span class="student-drag-name">${escapeHtml(name)}</span>
      <span class="student-drag-count" aria-label="${count} lượt trực">${count}</span>
    `;
    
    item.ondragstart = (e) => {
      e.dataTransfer.setData("text/plain", JSON.stringify({ name, fromCell: null, fromIdx: null }));
      item.classList.add("dragging");
    };
    item.ondragend = () => item.classList.remove("dragging");
    
    // Restore selection state after re-render
    if (tapSelectedStudent === name) {
      item.classList.add('selected');
      item.dataset.tapSelected = 'true';
    }
    
    // Tap-to-assign: tap to select/deselect, then tap a cell to assign
    item.onclick = () => {
      if (!isAdmin) return;
      
      if (tapSelectedStudent === name) {
        // Tapping the selected student again deselects
        tapSelectedStudent = null;
        item.classList.remove('selected');
        item.dataset.tapSelected = 'false';
        document.querySelectorAll('.cell.tap-ready').forEach(cell => cell.classList.remove('tap-ready'));
        hideTapNotifyBar();
      } else {
        // Select this student
        tapSelectedStudent = name;
        document.querySelectorAll('.student-drag-item.selected').forEach(el => {
          el.classList.remove('selected');
          el.dataset.tapSelected = 'false';
        });
        item.classList.add('selected');
        item.dataset.tapSelected = 'true';
        // Mark all cells as tap-ready
        document.querySelectorAll('.cell').forEach(cell => cell.classList.add('tap-ready'));
        // Show tap notification bar
        showTapNotifyBar(name);
        
        // On mobile, auto-collapse admin panel to reveal the schedule
        if (window.matchMedia('(max-width: 768px)').matches) {
          collapseAdminPanelForMobile();
        }
      }
    };
    
    list.appendChild(item);
  });
}

function showTapNotifyBar(name) {
  const bar = document.getElementById("tapNotifyBar");
  const nameEl = document.getElementById("tapNotifyName");
  if (bar && nameEl) {
    nameEl.textContent = name;
    bar.classList.remove("hidden");
  }
}

function hideTapNotifyBar() {
  const bar = document.getElementById("tapNotifyBar");
  if (bar) bar.classList.add("hidden");
}

// Collapse admin panel on mobile so the schedule is tappable
function collapseAdminPanelForMobile() {
  const panel = document.getElementById("adminPanel");
  const toggle = document.getElementById("adminPanelToggle");
  if (panel && panel.classList.contains("is-open")) {
    panel.classList.remove("is-open");
    panel.inert = true;
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Mở bảng điều khiển");
    }
    const openBtn = document.getElementById("adminPanelOpenBtn");
    if (openBtn) openBtn.classList.remove("hidden");
  }
}

// Clear tap selection and reset cell highlights
function clearTapSelection() {
  tapSelectedStudent = null;
  document.querySelectorAll('.student-drag-item.selected').forEach(el => {
    el.classList.remove('selected');
    el.dataset.tapSelected = 'false';
  });
  document.querySelectorAll('.cell.tap-ready').forEach(cell => cell.classList.remove('tap-ready'));
  hideTapNotifyBar();
}

function updateStudentCount() {
  const countEl = document.getElementById("studentCount");
  if (countEl) {
    const students = toArray(currentClassData.students);
    countEl.textContent = `${students.length} học sinh`;
  }
}

function renderClassSelector() {
  const selector = document.getElementById("classSelector");
  const btn = document.getElementById("classDropdownBtn");
  const nameEl = document.getElementById("currentClassName");
  const menu = document.getElementById("classDropdownMenu");
  const list = document.getElementById("classList");
  const addClassBtn = document.getElementById("addClassBtn");
  const manageClassesBtn = document.getElementById("manageClassesBtn");
  
  if (!selector || !btn || !nameEl || !menu || !list) return;
  
  const classIds = Object.keys(classesData);
  
  if (classIds.length === 0) {
    nameEl.textContent = "Chưa có lớp";
    list.innerHTML = '<div class="dropdown-item" style="justify-content: center; color: var(--text-muted); cursor: default;">Chưa có lớp nào</div>';
    if (addClassBtn) addClassBtn.style.display = isAdmin ? "flex" : "none";
    if (manageClassesBtn) manageClassesBtn.style.display = isAdmin ? "flex" : "none";
    selector.classList.remove("hidden");
    return;
  }
  
  // Set current class name - DON'T auto-select here
  if (currentClassId && classesData[currentClassId]) {
    nameEl.textContent = classesData[currentClassId].name;
  } else if (classIds.length > 0 && !currentClassId) {
    // Only set display name, don't auto-select (handled in loadClassesFromFirebase)
    nameEl.textContent = classesData[classIds[0]].name;
  }
  
  // Show/hide admin-only buttons
  if (addClassBtn) addClassBtn.style.display = isAdmin ? "flex" : "none";
  if (manageClassesBtn) manageClassesBtn.style.display = isAdmin ? "flex" : "none";
  
  selector.classList.remove("hidden");
  
  // Render class list
  list.innerHTML = "";
  classIds.forEach(id => {
    const cls = classesData[id];
    const item = document.createElement("button");
    item.type = "button";
    item.className = `dropdown-item ${id === currentClassId ? "active" : ""}`;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", id === currentClassId);
    item.innerHTML = `
      <span class="item-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
      </span>
      <span>${escapeHtml(cls.name)}</span>
      ${id === currentClassId ? '<span class="current-badge" style="margin-left: auto;">Đang xem</span>' : ''}
    `;
    item.onclick = () => switchClass(id);
    list.appendChild(item);
  });
}

function switchClass(classId) {
  if (classId === currentClassId) {
    closeDropdown();
    return;
  }
  
  currentClassId = classId;
  clearTapSelection();
  
  // Load data immediately for smooth transition (no blank flash since data is preserved)
  loadClassData(classId);
  renderAll();
  
  saveCurrentClassId();
  loadSingleClass(classId);
  renderClassSelector();
  closeDropdown();
}

function loadClassData(classId) {
  const cls = classesData[classId];
  if (cls) {
    currentClassData.students = toArray(cls.students);
    currentClassData.schedule = normalizeSchedule(cls.schedule);
    currentClassData.weekHeaders = toArray(cls.weekHeaders).length ? toArray(cls.weekHeaders) : createNewWeekHeaders();
    currentClassData.notice = cls.notice || "Chưa có thông tin báo bài mới.";
    
    const studentInput = document.getElementById("studentInput");
    if (studentInput) {
      studentInput.value = currentClassData.students.join("\n");
    }
  }
}

function saveCurrentClassId() {
  if (currentClassId) {
    localStorage.setItem("selectedClassId", currentClassId);
    if (isAdmin) {
      set(currentClassRef, currentClassId).catch(() => {});
    }
  }
}

function closeDropdown() {
  const btn = document.getElementById("classDropdownBtn");
  const menu = document.getElementById("classDropdownMenu");
  if (btn) {
    btn.setAttribute("aria-expanded", "false");
  }
  if (menu) {
    menu.classList.add("hidden");
  }
}

function toggleDropdown() {
  const btn = document.getElementById("classDropdownBtn");
  const menu = document.getElementById("classDropdownMenu");
  if (!btn || !menu) return;
  
  const isOpen = !menu.classList.contains("hidden");
  if (isOpen) {
    closeDropdown();
  } else {
    menu.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Toast notification system
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-message">${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ===========================================
// SECURITY: XSS SANITIZATION
// ===========================================
function sanitizeNoticeHtml(html) {
  if (typeof html !== "string") return "";
  
  const allowedTags = new Set([
    "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "H1", "H2", "H3", "H4",
    "P", "DIV", "BR", "UL", "OL", "LI", "BLOCKQUOTE", "SPAN", "FONT", "A",
    "CODE", "PRE", "HR"
  ]);
  const dropTags = new Set(["SCRIPT", "IFRAME", "STYLE", "OBJECT", "EMBED", "LINK", "META"]);
  const allowedAttrs = new Set(["href", "target", "rel", "color", "face", "size", "style"]);
  
  // Whitelist of safe CSS properties for style attribute
  const safeStyleProps = new Set([
    "color", "background-color", "font-family", "font-size", "text-align"
  ]);
  
  // Validate a style attribute value - only allow safe properties with bounded values
  function sanitizeStyle(styleStr) {
    if (!styleStr || typeof styleStr !== "string") return "";
    const declarations = styleStr.split(";");
    const safe = [];
    for (const decl of declarations) {
      const colonIdx = decl.indexOf(":");
      if (colonIdx === -1) continue;
      const prop = decl.substring(0, colonIdx).trim().toLowerCase();
      let value = decl.substring(colonIdx + 1).trim();
      // Only allow whitelisted properties with safe values
      if (safeStyleProps.has(prop) && value) {
        // Block dangerous values (including CSS escape sequences like \75 rl())
        if (/\\/.test(value)) continue;
        if (/url\s*\(/i.test(value) || /expression\s*\(/i.test(value) || /javascript:/i.test(value)) continue;
        if (/@import/i.test(value)) continue;
        // Bound font-size to a sane range (12px - 32px)
        if (prop === "font-size") {
          const pxMatch = value.match(/^(\d+(?:\.\d+)?)px$/i);
          if (pxMatch) {
            const px = parseFloat(pxMatch[1]);
            if (px < 10 || px > 32) continue; // skip out-of-range sizes
          } else {
            continue; // only allow px font sizes
          }
        }
        safe.push(`${prop}: ${value}`);
      }
    }
    return safe.join("; ");
  }

  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();

  const clean = (parent) => {
    Array.from(parent.childNodes).forEach((node) => {
      if (node.nodeType === Node.COMMENT_NODE) {
        node.remove();
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      if (dropTags.has(node.tagName)) {
        node.remove();
        return;
      }

      if (!allowedTags.has(node.tagName)) {
        const frag = document.createDocumentFragment();
        while (node.firstChild) frag.appendChild(node.firstChild);
        node.replaceWith(frag);
        return;
      }

      Array.from(node.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || !allowedAttrs.has(name)) {
          node.removeAttribute(attr.name);
          return;
        }
        // Sanitize style attribute with whitelist
        if (name === "style") {
          const safe = sanitizeStyle(attr.value);
          if (safe) {
            node.setAttribute("style", safe);
          } else {
            node.removeAttribute("style");
          }
        }
      });

      if (node.tagName === "A") {
        const href = (node.getAttribute("href") || "").trim();
        let valid = false;
        try {
          const url = new URL(href, window.location.origin);
          if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
            valid = true;
          }
        } catch (e) {
          valid = false;
        }
        if (!valid) {
          node.removeAttribute("href");
        } else {
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noopener noreferrer");
        }
      }

      clean(node);
    });
  };

  clean(tpl.content);
  return tpl.innerHTML;
}

// ===========================================
// FIREBASE SAVE FUNCTIONS
// ===========================================
// Update only specific fields of a class (avoids overwriting concurrent edits)
function updateClassFields(classId, fields) {
  if (!isAdmin || !classId) return;
  const statusEl = document.getElementById("syncStatus");
  if (statusEl) { statusEl.textContent = "● Đang lưu..."; statusEl.className = "sync-status syncing"; }
  update(ref(db, `trucNhatLop/classes/${classId}`), fields)
    .then(() => {
      if (statusEl) { statusEl.textContent = "● Đã đồng bộ trực tuyến"; statusEl.className = "sync-status"; }
    })
    .catch(() => {
      showToast("Không có quyền ghi hoặc dữ liệu không hợp lệ!", "error");
      if (statusEl) statusEl.className = "sync-status error";
    });
}

function saveCellToCloud(cellKey) {
  if (!isAdmin || !currentClassId) return;
  const statusEl = document.getElementById("syncStatus");
  statusEl.textContent = "● Đang lưu...";
  statusEl.className = "sync-status syncing";
  const arr = currentClassData.schedule[cellKey];
  set(ref(db, `trucNhatLop/classes/${currentClassId}/schedule/${cellKey}`),
      arr && arr.length ? arr : null)
    .then(() => {
      statusEl.textContent = "● Đã đồng bộ trực tuyến";
      statusEl.className = "sync-status";
    })
    .catch(() => {
      showToast("Không có quyền ghi hoặc dữ liệu không hợp lệ!", "error");
      statusEl.className = "sync-status error";
    });
}

// ===========================================
// AUTH
// ===========================================
window.loginWithGoogle = async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error.code === 'auth/popup-blocked' || 
        error.code === 'auth/operation-not-supported-in-this-environment' ||
        error.code === 'auth/unauthorized-domain') {
      // Fallback to redirect for mobile browsers
      await signInWithRedirect(auth, provider);
    } else {
      showToast("Đăng nhập thất bại: " + error.message, "error");
    }
  }
};

window.logoutAdmin = () => {
  signOut(auth);
};

// Login page management
function showLoginPage() {
  const page = document.getElementById("loginPage");
  if (page) page.classList.remove("hidden");
  const statusEl = document.getElementById("loginStatus");
  if (statusEl) statusEl.textContent = "Đăng nhập để truy cập";
  // Reset form state from previous open
  const errorEl = document.getElementById("guestError");
  if (errorEl) errorEl.textContent = "";
  const nameInput = document.getElementById("guestNameInput");
  if (nameInput) nameInput.value = "";
}

function hideLoginPage() {
  const page = document.getElementById("loginPage");
  if (page) page.classList.add("hidden");
}

async function guestLogin() {
  const input = document.getElementById("guestNameInput");
  const errorEl = document.getElementById("guestError");
  if (!input) return;
  const name = input.value.trim().toLowerCase();
  if (!name) {
    if (errorEl) errorEl.textContent = "Vui lòng nhập tên!";
    return;
  }
  // Firebase keys cannot contain . # $ [ ] /
  if (/[.#$\[\]\/]/.test(name)) {
    if (errorEl) errorEl.textContent = "Tên không được chứa ký tự đặc biệt (. # $ [ ] /).";
    return;
  }
  if (errorEl) errorEl.textContent = "Đang kiểm tra...";
  try {
    // Verify the guest name exists (one specific node read)
    const guestRef = ref(db, `trucNhatLop/guests/${name}`);
    const snap = await get(guestRef);
    if (snap.exists() && snap.val() === true) {
      // Set sessionStorage BEFORE auth so onAuthStateChanged sees it immediately
      guestName = name;
      sessionStorage.setItem("guestName", name);
      try {
        await signInAnonymously(auth);
        // onAuthStateChanged handles the rest (setup + loadClassesFromFirebase)
      } catch (e) {
        // Anonymous auth failed - do NOT grant guest access
        console.warn("Anonymous auth failed:", e);
        sessionStorage.removeItem("guestName");
        guestName = null;
        if (errorEl) errorEl.textContent = "Không thể khởi tạo phiên đăng nhập. Vui lòng thử lại.";
      }
    } else {
      if (errorEl) errorEl.textContent = "Tên không hợp lệ hoặc chưa được cấp phép.";
    }
  } catch (e) {
    sessionStorage.removeItem("guestName");
    guestName = null;
    if (errorEl) errorEl.textContent = "Lỗi kết nối. Vui lòng thử lại.";
  }
}

function cleanupAppData() {
  if (currentClassListener) { currentClassListener(); currentClassListener = null; }
  if (classesListListener) { classesListListener(); classesListListener = null; }
  if (chatListener) { chatListener(); chatListener = null; }
  if (postsListener) { postsListener(); postsListener = null; }
  classesData = {};
  currentClassId = null;
  currentClassData = getDefaultClassData();
  
  // Reset posts cache
  baoLatestPostsVal = null;
  baoPostsCache = {};
  const chatMessagesEl = document.getElementById("chatMessages");
  if (chatMessagesEl) chatMessagesEl.innerHTML = '<div class="chat-empty">Chưa có tin nhắn. Hãy là người đầu tiên!</div>';
  const baoPostsListEl = document.getElementById("baoPostsList");
  if (baoPostsListEl) baoPostsListEl.innerHTML = '<div class="bao-empty">Chưa có bài báo nào.</div>';
  
  // Stop animations and clear tap selection
  clearTapSelection();
  stopWeekButterfly();
  
  const adminPanel = document.getElementById("adminPanel");
  if (adminPanel) { adminPanel.classList.remove("is-open"); adminPanel.hidden = true; adminPanel.inert = true; }
  const adminPanelToggle = document.getElementById("adminPanelToggle");
  const adminPanelOpenBtn = document.getElementById("adminPanelOpenBtn");
  if (adminPanelToggle) { adminPanelToggle.setAttribute("aria-expanded", "false"); adminPanelToggle.setAttribute("aria-label", "Mở bảng điều khiển"); }
  if (adminPanelOpenBtn) adminPanelOpenBtn.classList.add("hidden");
  document.getElementById("adminToolbar")?.classList.add("hidden");
  document.getElementById("logoutBtn")?.classList.add("hidden");
  document.getElementById("loginBtn")?.classList.remove("hidden");
  
  // Reset logout button to admin mode
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) { logoutBtn.textContent = "Thoát Admin"; logoutBtn.onclick = window.logoutAdmin; }
  
  // Hide admin-only elements
  document.getElementById("baoNewPostBtn")?.classList.add("hidden");
  document.getElementById("noticeToolbar")?.classList.add("hidden");
  
  const saveNoticeBtn = document.getElementById("saveNoticeBtn");
  const noticeInput = document.getElementById("noticeInput");
  const noticeDisplay = document.getElementById("noticeDisplay");
  if (saveNoticeBtn && noticeInput && noticeDisplay) {
    saveNoticeBtn.classList.add("hidden");
    noticeInput.classList.add("hidden");
    noticeDisplay.classList.remove("hidden");
  }
  
  const roleBadge = document.getElementById("roleBadge");
  if (roleBadge) { roleBadge.textContent = "Chế độ: Khách (Chỉ xem)"; roleBadge.className = "role-badge guest"; }
  updateChatIdentityUI();
  
  // Hide class selector and clear the student input
  const classSelector = document.getElementById("classSelector");
  if (classSelector) classSelector.classList.add("hidden");
  const studentInput = document.getElementById("studentInput");
  if (studentInput) studentInput.value = "";
  
  // Re-render and return to the about page
  renderAll();
  switchTab('about');
}

// Register an active guest session so Database Rules allow read access
async function registerActiveGuest(name, uid) {
  if (!uid) return;
  try {
    const sessionRef = ref(db, `trucNhatLop/activeGuests/${uid}`);
    await set(sessionRef, { name: name, timestamp: serverTimestamp() });
    // Auto-remove the session if the connection drops
    onDisconnect(sessionRef).remove().catch(() => {});
  } catch (e) {
    console.warn("Could not register active guest:", e);
  }
}

function logoutGuest() {
  cleanupAppData();
  isGuest = false;
  isAdmin = false;
  guestName = null;
  sessionStorage.removeItem("guestName");
  // Remove the active guest session mapping
  if (auth.currentUser) {
    remove(ref(db, `trucNhatLop/activeGuests/${auth.currentUser.uid}`)).catch(() => {});
    signOut(auth).catch(() => {});
  }
  showLoginPage();
}

// Expose to global scope
window.guestLogin = guestLogin;
window.showLoginPage = showLoginPage;
window.hideLoginPage = hideLoginPage;
window.logoutGuest = logoutGuest;

// Check for redirect result on page load
getRedirectResult(auth).catch(() => {});

const ADMIN_EMAIL = "";

window.submitAdminRequest = () => {
  const input = document.getElementById("requestEmail");
  if (!input) return;
  const email = input.value.trim();
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRe.test(email)) {
    showToast("Vui lòng nhập email hợp lệ.", "warning");
    input.focus();
    return;
  }
  // Save the access request to Firebase so the web owner can review it
  const req = {
    email: email,
    className: (currentClassId && classesData[currentClassId]) ? classesData[currentClassId].name : "",
    message: "Yêu cầu cấp quyền Admin",
    timestamp: serverTimestamp()
  };
  push(accessRequestsRef, req)
    .then(() => {
      showToast("Đã gửi yêu cầu cấp quyền! Admin sẽ xem xét và phản hồi qua email.", "success", 5000);
      input.value = "";
    })
    .catch(() => {
      showToast("Không gửi được yêu cầu. Vui lòng thử lại.", "error");
    });
};

// ===========================================
// AUTH STATE
// ===========================================
onAuthStateChanged(auth, async (user) => {
  const seq = ++authCheckSeq;
  
  // Handle anonymous guest sessions (signInAnonymously from guestLogin)
  if (user && user.isAnonymous) {
    const savedGuest = sessionStorage.getItem("guestName");
    if (savedGuest && !/[.#$\[\]\/]/.test(savedGuest)) {
      // Re-verify the guest still exists before granting access
      try {
        const snap = await get(ref(db, `trucNhatLop/guests/${savedGuest}`));
        if (snap.exists() && snap.val() === true) {
          isGuest = true;
          isAdmin = false;
          publicBrowsing = false;
          guestName = savedGuest;
          currentUser = user;
          // Register the active guest session so Database Rules allow data access
          await registerActiveGuest(savedGuest, user.uid);
          hideLoginPage();
          const badge = document.getElementById("roleBadge");
          if (badge) { badge.textContent = "Khách: " + savedGuest; badge.className = "role-badge guest"; }
          const loginBtn = document.getElementById("loginBtn");
          if (loginBtn) loginBtn.classList.add("hidden");
          const logoutBtn = document.getElementById("logoutBtn");
          if (logoutBtn) { logoutBtn.textContent = "Đăng xuất"; logoutBtn.classList.remove("hidden"); logoutBtn.onclick = logoutGuest; }
          loadClassesFromFirebase();
          renderAll();
          if (pendingHashTab) { const t = pendingHashTab; pendingHashTab = null; switchTab(t); } else if (currentTab === 'about') { switchTab('home'); }
        } else {
          sessionStorage.removeItem("guestName");
          signOut(auth);
        }
      } catch (e) {
        sessionStorage.removeItem("guestName");
        signOut(auth);
      }
    } else {
      signOut(auth);
    }
    return;
  }
  
  if (user) {
    try {
      currentUser = user;
      
      // Only admins/${user.uid} grants admin (coreAdminCheck removed)
      const dbAdminRes = await get(ref(db, "admins/" + user.uid));
      
      // Check if this is still the latest auth check
      if (seq !== authCheckSeq) return;
      
      const isDbAdmin = dbAdminRes.exists() && dbAdminRes.val() === true;
      
      if (isDbAdmin) {
        isAdmin = true;
        isGuest = false;
        publicBrowsing = false;
        guestName = null;
        sessionStorage.removeItem("guestName");
        hideLoginPage();
        const adminPanel = document.getElementById("adminPanel");
        // On mobile, keep panel closed by default so it doesn't cover the schedule
        const isMobileView = window.matchMedia('(max-width: 768px)').matches;
        if (adminPanel) {
          adminPanel.hidden = false;
          if (!isMobileView) {
            adminPanel.classList.add("is-open");
            adminPanel.inert = false;
          } else {
            adminPanel.classList.remove("is-open");
            adminPanel.inert = true;
          }
        }
        const adminPanelToggle = document.getElementById("adminPanelToggle");
        const adminPanelOpenBtn = document.getElementById("adminPanelOpenBtn");
        if (adminPanelToggle) {
          const opened = !isMobileView;
          adminPanelToggle.setAttribute("aria-expanded", opened ? "true" : "false");
          adminPanelToggle.setAttribute("aria-label", opened ? "Đóng bảng điều khiển" : "Mở bảng điều khiển");
        }
        if (adminPanelOpenBtn) {
          if (isMobileView) adminPanelOpenBtn.classList.remove("hidden");
          else adminPanelOpenBtn.classList.add("hidden");
        }
        document.getElementById("adminToolbar").classList.remove("hidden");
        document.getElementById("logoutBtn").classList.remove("hidden");
        // Reset logout button to admin mode
        const logoutBtn = document.getElementById("logoutBtn");
        if (logoutBtn) { logoutBtn.textContent = "Thoát Admin"; logoutBtn.onclick = window.logoutAdmin; }
        document.getElementById("loginBtn").classList.add("hidden");
        const roleBadge = document.getElementById("roleBadge");
        roleBadge.textContent = "Admin: " + user.email;
        roleBadge.className = "role-badge admin";
        updateChatIdentityUI();
        const baoNewBtnIn = document.getElementById("baoNewPostBtn");
        if (baoNewBtnIn) baoNewBtnIn.classList.remove("hidden");
        renderPostsList(baoLatestPostsVal);
        
        const saveNoticeBtn = document.getElementById("saveNoticeBtn");
        const noticeInput = document.getElementById("noticeInput");
        const noticeDisplay = document.getElementById("noticeDisplay");
        if (saveNoticeBtn && noticeInput && noticeDisplay) {
          saveNoticeBtn.classList.remove("hidden");
          noticeInput.classList.remove("hidden");
          noticeDisplay.classList.add("hidden");
        }
        
        renderClassSelector();
        loadClassesFromFirebase();
        // Flush pending hash tab now that admin is authenticated; default to home
        if (pendingHashTab) { const t = pendingHashTab; pendingHashTab = null; switchTab(t); } else if (currentTab === 'about') { switchTab('home'); }
      } else {
        isAdmin = false;
        showToast("Tài khoản " + user.email + " không có quyền Admin! Bạn chỉ có thể xem lịch.", "warning");
        signOut(auth);
      }
    } catch (error) {
      if (seq !== authCheckSeq) return;
      isAdmin = false;
      showToast("Lỗi kết nối khi kiểm tra quyền Admin!", "error");
      signOut(auth);
    }
  } else {
    // No Firebase user (logged out) — cleanup first
    currentUser = null;
    isAdmin = false;
    isGuest = false;
    cleanupAppData();
    
    // Check for an authorized guest session
    const savedGuest = sessionStorage.getItem("guestName");
    if (savedGuest && !/[.#$\[\]\/]/.test(savedGuest)) {
      // Restore the anonymous Firebase Auth session; onAuthStateChanged will
      // re-fire with the anonymous user and re-verify the guest.
      signInAnonymously(auth).catch(() => {
        // Could not restore session — clear and go to public browsing
        sessionStorage.removeItem("guestName");
        guestName = null;
        publicBrowsing = true;
        pendingHashTab = null;
      });
    } else {
      sessionStorage.removeItem("guestName");
      guestName = null;
      // Public browsing: no login overlay, stay on about page
      publicBrowsing = true;
      pendingHashTab = null;
    }
  }
});

renderAll();

// ===========================================
// LOAD CLASSES
// ===========================================
function loadClassesFromFirebase() {
  if (classesListListener) {
    classesListListener();
    classesListListener = null;
  }
  
  const classesMetaRef = query(classesRef, orderByChild('createdAt'));
  
  classesListListener = onValue(classesMetaRef, (snapshot) => {
    const val = snapshot.val();
    if (val) {
      // Preserve detailed data - prefer freshly loaded snapshot data, fall back to existing
      const nextClasses = {};
      Object.entries(val).forEach(([id, data]) => {
        const existing = classesData[id] || {};
        const students = toArray(data.students);
        const schedule = normalizeSchedule(data.schedule);
        const weekHeaders = toArray(data.weekHeaders).length ? toArray(data.weekHeaders) : (existing.weekHeaders || []);
        const notice = (typeof data.notice === "string") ? data.notice : "Chưa có thông tin báo bài mới.";
        
        nextClasses[id] = {
          name: data.name || existing.name || "",
          createdAt: data.createdAt || existing.createdAt || Date.now(),
          students: students,
          schedule: schedule,
          weekHeaders: weekHeaders,
          notice: notice,
          studentsCount: students.length,
          assignedCount: Object.values(schedule).filter(arr => toArray(arr).length > 0).length
        };
      });
      classesData = nextClasses;
      
      const statusEl = document.getElementById("syncStatus");
      if (statusEl) {
        statusEl.textContent = "● Đã đồng bộ trực tuyến";
        statusEl.className = "sync-status";
      }
      
      get(currentClassRef).then((snap) => {
        const savedLocalId = localStorage.getItem("selectedClassId");
        let targetId = null;

        if (!isAdmin && savedLocalId && classesData[savedLocalId]) {
          targetId = savedLocalId;
        } else if (snap.exists() && classesData[snap.val()]) {
          targetId = snap.val();
        } else {
          targetId = Object.keys(classesData)[0] || null;
        }

        if (isAdmin && currentClassId && classesData[currentClassId]) {
          renderClassSelector();
          renderClassList();
        } else if (targetId && targetId !== currentClassId) {
          currentClassId = targetId;
          loadSingleClass(currentClassId);
        } else if (!targetId) {
          currentClassId = null;
          renderAll();
        } else {
          renderClassSelector();
          renderClassList();
        }
      });
    } else {
      // No classes left - cleanup any active class listener
      if (currentClassListener) { currentClassListener(); currentClassListener = null; }
      classesData = {};
      currentClassId = null;
      currentClassData = getDefaultClassData();
      renderAll();
    }
  }, (error) => {
    const statusEl = document.getElementById("syncStatus");
    statusEl.textContent = "● Lỗi kết nối Firebase: " + error.message;
    statusEl.className = "sync-status error";
  });
}

function loadSingleClass(classId) {
  if (currentClassListener) {
    currentClassListener();
  }
  
  const classRef = ref(db, `trucNhatLop/classes/${classId}`);
  currentClassListener = onValue(classRef, (snapshot) => {
    const val = snapshot.val();
    if (val && classesData[classId]) {
      // Normalize fields explicitly so deleted empty branches ({}/[]) don't
      // resurrect stale data from the previous classesData entry.
      const normalizedStudents = toArray(val.students);
      const normalizedSched = normalizeSchedule(val.schedule);
      classesData[classId] = {
        ...classesData[classId],
        ...val,
        students: normalizedStudents,
        schedule: normalizedSched,
        weekHeaders: toArray(val.weekHeaders).length ? toArray(val.weekHeaders) : createNewWeekHeaders(),
        notice: typeof val.notice === "string" ? val.notice : "Chưa có thông tin báo bài mới.",
        studentsCount: normalizedStudents.length,
        assignedCount: Object.values(normalizedSched).filter(arr => toArray(arr).length > 0).length
      };
      loadClassData(classId);
      renderAll();
    }
  }, (error) => {
    const statusEl = document.getElementById("syncStatus");
    statusEl.textContent = "● Lỗi tải lớp: " + error.message;
    statusEl.className = "sync-status error";
  });
}

// ===========================================
// CLASS MANAGEMENT MODAL
// ===========================================
let modalMode = null;
let modalTargetClassId = null;
let modalTimeoutId = null;

function openClassModal(mode, classId = null) {
  // Clear any pending timeout from closeClassModal
  if (modalTimeoutId) {
    clearTimeout(modalTimeoutId);
    modalTimeoutId = null;
  }
  
  const modal = document.getElementById("classModal");
  const title = document.getElementById("classModalTitle");
  const newNameInput = document.getElementById("newClassNameInput");
  const renameGroup = document.getElementById("renameClassGroup");
  const renameInput = document.getElementById("renameClassInput");
  const confirmBtn = document.getElementById("classModalConfirm");
  
  modalMode = mode;
  modalTargetClassId = classId;
  
  newNameInput.value = "";
  renameInput.value = "";
  
  if (mode === "add") {
    title.textContent = "Thêm lớp mới (nhân bản)";
    newNameInput.placeholder = "VD: 12A1, 11B2...";
    newNameInput.closest(".form-group").style.display = "block";
    renameGroup.style.display = "none";
    confirmBtn.textContent = "Tạo lớp";
  } else if (mode === "rename" && classId && classesData[classId]) {
    title.textContent = "Đổi tên lớp";
    newNameInput.closest(".form-group").style.display = "none";
    renameGroup.style.display = "block";
    renameInput.value = classesData[classId].name;
    renameInput.placeholder = "Nhập tên mới";
    confirmBtn.textContent = "Lưu thay đổi";
  } else if (mode === "manage") {
    title.textContent = "Quản lý lớp học";
    newNameInput.closest(".form-group").style.display = "none";
    renameGroup.style.display = "none";
    confirmBtn.textContent = "Đóng";
  }
  
  modal.hidden = false;
  modal.offsetHeight;
  modal.classList.add("visible");
  
  if (mode === "add") {
    newNameInput.focus();
  } else if (mode === "rename" && classId && classesData[classId]) {
    renameInput.focus();
  }
}

function closeClassModal() {
  const modal = document.getElementById("classModal");
  modal.classList.remove("visible");
  modalTimeoutId = setTimeout(() => {
    modal.hidden = true;
    modalTimeoutId = null;
  }, 200);
  modalMode = null;
  modalTargetClassId = null;
}

function confirmClassModal() {
  const newNameInput = document.getElementById("newClassNameInput");
  const renameInput = document.getElementById("renameClassInput");
  
  if (modalMode === "add") {
    const name = newNameInput.value.trim();
    if (!name) {
      showToast("Vui lòng nhập tên lớp", "warning");
      return;
    }
    addNewClass(name);
  } else if (modalMode === "rename" && modalTargetClassId) {
    const name = renameInput.value.trim();
    if (!name) {
      showToast("Vui lòng nhập tên mới", "warning");
      return;
    }
    renameClass(modalTargetClassId, name);
  }
  closeClassModal();
}

function addNewClass(name) {
  if (!isAdmin) return;
  
  const newClassData = {
    name: name,
    students: [...toArray(currentClassData.students)],
    schedule: JSON.parse(JSON.stringify(normalizeSchedule(currentClassData.schedule))),
    weekHeaders: [...toArray(currentClassData.weekHeaders)],
    notice: currentClassData.notice,
    createdAt: Date.now()
  };
  
  const newClassRef = push(classesRef);
  const newClassId = newClassRef.key;
  
  set(newClassRef, newClassData).then(() => {
    classesData[newClassId] = newClassData;
    currentClassId = newClassId;
    saveCurrentClassId();
    loadSingleClass(newClassId);
  }).catch(() => {
    showToast("Không thể tạo lớp mới!", "error");
  });
}

function renameClass(classId, newName) {
  if (!isAdmin || !classesData[classId]) return;
  
  classesData[classId].name = newName;
  update(ref(db, `trucNhatLop/classes/${classId}`), { name: newName })
    .then(() => {
      renderClassSelector();
      if (classId === currentClassId) {
        renderAll();
      }
    })
    .catch(() => {
      showToast("Không thể đổi tên lớp!", "error");
    });
}

function deleteClass(classId) {
  if (!isAdmin || !classesData[classId]) return;
  
  if (!confirm(`Xóa lớp "${classesData[classId].name}"? Hành động này không thể hoàn tác.`)) return;
  
  const classRef = ref(db, `trucNhatLop/classes/${classId}`);
  remove(classRef).then(() => {
    delete classesData[classId];
    
    if (currentClassId === classId) {
      const remainingIds = Object.keys(classesData);
      if (remainingIds.length > 0) {
        currentClassId = remainingIds[0];
        loadSingleClass(currentClassId);
      } else {
        currentClassId = null;
        currentClassData = getDefaultClassData();
        localStorage.removeItem("selectedClassId");
        remove(currentClassRef).catch(() => {});
      }
      saveCurrentClassId();
    }
    renderAll();
  }).catch(() => {
    showToast("Không thể xóa lớp!", "error");
  });
}

function renderClassList() {
  const container = document.getElementById("classListContainer");
  const emptyState = document.getElementById("emptyClassState");
  if (!container) return;
  
  const classIds = Object.keys(classesData);
  
  if (classIds.length === 0) {
    if (emptyState) emptyState.style.display = "block";
    container.innerHTML = '<p class="text-sm text-slate-500 text-center py-4" id="emptyClassState">Chưa có lớp nào. Tạo lớp đầu tiên!</p>';
    return;
  }
  
  if (emptyState) emptyState.style.display = "none";
  
  container.innerHTML = "";
  classIds.forEach(id => {
    const cls = classesData[id];
    const totalStudents = Array.isArray(cls.students) ? cls.students.length : (cls.studentsCount || 0);
    const totalAssigned = cls.schedule
      ? Object.values(cls.schedule).filter(arr => toArray(arr).length > 0).length
      : (cls.assignedCount || 0);
    const item = document.createElement("div");
    item.className = `class-list-item ${id === currentClassId ? "current" : ""}`;
    item.innerHTML = `
      <div class="class-info">
        <div class="class-avatar">${escapeHtml(cls.name).charAt(0).toUpperCase()}</div>
        <div class="class-details">
          <span class="class-name">${escapeHtml(cls.name)}</span>
          <span class="class-meta">${totalStudents} học sinh • ${totalAssigned} ô đã phân công</span>
        </div>
        ${id === currentClassId ? '<span class="current-badge">Đang xem</span>' : ''}
      </div>
      <div class="class-actions">
        <button type="button" class="class-action-btn" data-action="select" data-class-id="${id}" aria-label="Chọn lớp này" ${id === currentClassId ? "disabled" : ""}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </button>
        <button type="button" class="class-action-btn" data-action="rename" data-class-id="${id}" aria-label="Đổi tên">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button type="button" class="class-action-btn delete" data-action="delete" data-class-id="${id}" aria-label="Xóa lớp">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;
    container.appendChild(item);
  });
  
  container.querySelectorAll("[data-action]").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const classId = btn.dataset.classId;
      if (action === "select") {
        switchClass(classId);
        closeClassModal();
      } else if (action === "rename") {
        openClassModal("rename", classId);
      } else if (action === "delete") {
        deleteClass(classId);
      }
    };
  });
}

// ===========================================
// ADMIN ACTIONS
// ===========================================
window.updateStudentList = () => {
  if (!isAdmin) return;
  if (!currentClassId) {
    showToast("Vui lòng tạo ít nhất 1 lớp trước khi thao tác!", "warning");
    return;
  }
  const raw = document.getElementById("studentInput").value;
  currentClassData.students = raw.split("\n").map(s => s.trim()).filter(Boolean);
  // Reset any tap-to-assign selection (student may have been removed)
  clearTapSelection();
  // Remove orphaned students from the schedule (students no longer in the list)
  const validNames = new Set(currentClassData.students);
  const schedule = normalizeSchedule(currentClassData.schedule);
  Object.keys(schedule).forEach(cellKey => {
    const filtered = schedule[cellKey].filter(n => validNames.has(n));
    if (filtered.length) {
      schedule[cellKey] = filtered;
    } else {
      delete schedule[cellKey];
    }
  });
  currentClassData.schedule = schedule;
  if (classesData[currentClassId]) {
    classesData[currentClassId].students = currentClassData.students;
    classesData[currentClassId].schedule = schedule;
  }
  renderAll();
  updateClassFields(currentClassId, { students: currentClassData.students, schedule: currentClassData.schedule });
};

window.autoAssignRandom = () => {
  if (!isAdmin) return;
  if (!currentClassId || !classesData[currentClassId]) {
    showToast("Vui lòng tạo ít nhất 1 lớp trước khi thao tác!", "warning");
    return;
  }
  if (currentClassData.students.length === 0) {
    showToast("Danh sách học sinh đang trống! Vui lòng nhập danh sách học sinh trước.", "warning");
    return;
  }
  const shuffled = [...currentClassData.students];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const newSchedule = {};
  let idx = 0;

  TASKS.forEach((_, rIdx) => {
    DAYS.forEach((day) => {
      const key = `${rIdx}_${day}`;
      newSchedule[key] = [shuffled[idx % shuffled.length]];
      idx++;
    });
  });

  currentClassData.schedule = newSchedule;
  classesData[currentClassId].schedule = newSchedule;
  renderAll();
  updateClassFields(currentClassId, { schedule: currentClassData.schedule });
};

window.clearSchedule = () => {
  if (!isAdmin) return;
  if (!currentClassId || !classesData[currentClassId]) {
    showToast("Vui lòng tạo ít nhất 1 lớp trước khi thao tác!", "warning");
    return;
  }
  currentClassData.schedule = {};
  classesData[currentClassId].schedule = {};
  renderAll();
  updateClassFields(currentClassId, { schedule: currentClassData.schedule });
};

window.saveClassNotice = () => {
  if (!isAdmin) return;
  if (!currentClassId || !classesData[currentClassId]) {
    showToast("Vui lòng tạo ít nhất 1 lớp trước khi thao tác!", "warning");
    return;
  }
  const noticeInput = document.getElementById("noticeInput");
  const content = sanitizeNoticeHtml(noticeInput.innerHTML.trim());
  currentClassData.notice = content || "Chưa có thông tin báo bài mới.";
  classesData[currentClassId].notice = currentClassData.notice;
  renderAll();
  updateClassFields(currentClassId, { notice: currentClassData.notice });
  showToast("Đã lưu báo bài!", "success");
};

window.startNewCycle = () => {
  if (!isAdmin) return;
  if (!currentClassId || !classesData[currentClassId]) {
    showToast("Vui lòng tạo ít nhất 1 lớp trước khi thao tác!", "warning");
    return;
  }
  if (!confirm("Bạn có chắc muốn xóa bảng hiện tại và cập nhật 6 tuần mới bắt đầu từ tuần này không?")) return;

  currentClassData.weekHeaders = createNewWeekHeaders();
  currentClassData.schedule = {};
  classesData[currentClassId].weekHeaders = currentClassData.weekHeaders;
  classesData[currentClassId].schedule = {};

  renderAll();
  updateClassFields(currentClassId, { weekHeaders: currentClassData.weekHeaders, schedule: {} });
};

window.removeStudentFromCell = (cellKey, studentIndex) => {
  if (!isAdmin || !currentClassId || !classesData[currentClassId]) return;
  if (!currentClassData.schedule[cellKey]) return;
  const arr = toArray(currentClassData.schedule[cellKey]);
  arr.splice(studentIndex, 1);
  currentClassData.schedule[cellKey] = arr;
  classesData[currentClassId].schedule = currentClassData.schedule;
  renderAll();
  saveCellToCloud(cellKey);
};

// ===========================================
// RENDER SCHEDULE
// ===========================================
function renderSchedule() {
  const tbody = document.getElementById("scheduleBody");
  const trHeader = document.getElementById("tableHeader");

  while (trHeader.children.length > 1) {
    trHeader.removeChild(trHeader.lastChild);
  }

  const headers = toArray(currentClassData.weekHeaders);
  const currentWeekIdx = getCurrentWeekIndex();
  headers.forEach((weekStr, wIdx) => {
    const th = document.createElement("th");
    th.className = "border border-slate-200 p-3 text-center";
    if (wIdx === currentWeekIdx) {
      th.classList.add("current-week-col");
      const label = document.createElement("span");
      label.className = "week-label";
      label.textContent = weekStr;
      th.appendChild(label);
    } else {
      th.textContent = weekStr;
    }
    th.scope = "col";
    th.dataset.weekIndex = wIdx;
    trHeader.appendChild(th);
  });

  if (!tbody) return;
  tbody.innerHTML = "";

  TASKS.forEach((task, rIdx) => {
    const tr = document.createElement("tr");
    tr.style.animationDelay = `${rIdx * 50}ms`;
    tr.className = "fade-in-up";
    
    const tdTask = document.createElement("td");
    tdTask.className = "border border-slate-200 p-3 font-semibold text-slate-700 bg-slate-50/70";
    tdTask.textContent = task;
    tr.appendChild(tdTask);

    DAYS.forEach((day, dIdx) => {
      const cellKey = `${rIdx}_${day}`;
      const td = document.createElement("td");
      td.className = "cell border border-slate-200 p-2 align-top min-h-[72px] transition";
      td.setAttribute("role", "gridcell");
      td.dataset.cellKey = cellKey;
      
      // Highlight current week column
      if (dIdx === currentWeekIdx) {
        td.classList.add('current-week-cell');
      }
      
      // Highlight cells as tap-ready when a student is selected for mobile tap-to-assign
      if (isAdmin && tapSelectedStudent) {
        td.classList.add('tap-ready');
      }

      if (isAdmin) {
        td.ondragover = (e) => { e.preventDefault(); td.classList.add("drag-over"); };
        td.ondragleave = () => td.classList.remove("drag-over");
        td.ondrop = (e) => {
          e.preventDefault();
          td.classList.remove("drag-over");
          if (!isAdmin || !currentClassId || !classesData[currentClassId]) return;

          let payload;
          try {
            payload = JSON.parse(e.dataTransfer.getData("text/plain"));
          } catch (err) {
            return;
          }
        
if (!payload || !payload.name) return;
        
        // Dropping back into the same cell is a no-op (avoid double save)
        if (payload.fromCell === cellKey) return;
        
        // Atomic update of the entire schedule: move student from source to dest in one write
        const scheduleUpdates = {};
        
        // Remove from source cell (find by name, not by index, to be sync-safe)
        if (payload.fromCell !== null && currentClassData.schedule[payload.fromCell]) {
          const fromArr = toArray(currentClassData.schedule[payload.fromCell]);
          const removeIdx = fromArr.indexOf(payload.name);
          if (removeIdx !== -1) fromArr.splice(removeIdx, 1);
          scheduleUpdates[payload.fromCell] = fromArr.length ? fromArr : null;
          currentClassData.schedule[payload.fromCell] = fromArr;
        }
        
        // Add to destination cell
        if (!currentClassData.schedule[cellKey]) currentClassData.schedule[cellKey] = [];
        const toArr = toArray(currentClassData.schedule[cellKey]);
        toArr.push(payload.name);
        currentClassData.schedule[cellKey] = toArr;
        scheduleUpdates[cellKey] = toArr;
        
        classesData[currentClassId].schedule = currentClassData.schedule;
        
        renderAll();
        
        // Single atomic update to Firebase
        if (isAdmin && currentClassId) {
          const statusEl = document.getElementById("syncStatus");
          if (statusEl) { statusEl.textContent = "● Đang lưu..."; statusEl.className = "sync-status syncing"; }
          update(ref(db, `trucNhatLop/classes/${currentClassId}/schedule`), scheduleUpdates)
            .then(() => {
              if (statusEl) { statusEl.textContent = "● Đã đồng bộ trực tuyến"; statusEl.className = "sync-status"; }
            })
            .catch(() => {
              showToast("Không có quyền ghi hoặc dữ liệu không hợp lệ!", "error");
              if (statusEl) statusEl.className = "sync-status error";
            });
        }
      };
        
        // Tap-to-assign: tap a cell to assign the currently selected student
        td.onclick = (e) => {
          if (!isAdmin || !currentClassId || !classesData[currentClassId]) return;
          if (e.target.closest('.assigned-tag') || e.target.closest('.tag-remove')) return;
          if (!tapSelectedStudent) return;
          
          const studentName = tapSelectedStudent;
          
          if (!currentClassData.schedule[cellKey]) currentClassData.schedule[cellKey] = [];
          const arr = toArray(currentClassData.schedule[cellKey]);
          arr.push(studentName);
          currentClassData.schedule[cellKey] = arr;
          classesData[currentClassId].schedule = currentClassData.schedule;
          
          renderAll();
          saveCellToCloud(cellKey);
          // Note: tapSelectedStudent is preserved so Admin can assign same student to multiple cells
        };
      }

      const assigned = toArray(currentClassData.schedule[cellKey] || []);
      const wrap = document.createElement("div");
      wrap.className = "cell-content";

      if (assigned.length === 0 && !isAdmin) {
        const empty = document.createElement("div");
        empty.className = "empty-cell";
        empty.textContent = "—";
        wrap.appendChild(empty);
      }

      assigned.forEach((studentName, sIdx) => {
        const tag = document.createElement("span");
        tag.className = "assigned-tag";
        tag.textContent = studentName;
        tag.style.animationDelay = `${sIdx * 30}ms`;

        if (isAdmin) {
          tag.draggable = true;
          tag.ondragstart = (e) => {
            e.dataTransfer.setData("text/plain", JSON.stringify({ name: studentName, fromCell: cellKey, fromIdx: sIdx }));
            tag.classList.add("dragging");
          };
          tag.ondragend = () => tag.classList.remove("dragging");

          const delBtn = document.createElement("button");
          delBtn.className = "tag-remove";
          delBtn.innerHTML = "×";
          delBtn.setAttribute("aria-label", `Xóa ${studentName}`);
          delBtn.onclick = (e) => {
            e.stopPropagation();
            removeStudentFromCell(cellKey, sIdx);
          };
          tag.appendChild(delBtn);
        }

        wrap.appendChild(tag);
      });

      td.appendChild(wrap);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  // Start/refresh the butterfly that flies around the current-week column
  ensureWeekButterfly();
}

// ===========================================
// WEEK COLUMN BUTTERFLY (5 realistic butterflies around current week)
// ===========================================
function makeButterflyState(cfg) {
  return {
    x: 0, y: 0, vx: 0, vy: 0,
    tx: 0, ty: 0,
    retarget: 0,
    phase: Math.random() * Math.PI * 2,
    cfg: cfg,
    init: false
  };
}

function ensureWeekButterfly() {
  // Only show when the schedule (home) tab is active and a current week exists
  const homePanel = document.getElementById("panel-home");
  const th = document.querySelector(".schedule-table thead th.current-week-col");
  if (!homePanel || !homePanel.classList.contains("active") || !th) {
    stopWeekButterfly();
    return;
  }
  // Respect reduced-motion preference
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    stopWeekButterfly();
    return;
  }
  
  // Create the butterflies once
  if (weekButterflyEls.length === 0) {
    WEEK_BUTTERFLY_CONFIGS.forEach((cfg) => {
      const el = document.createElement("div");
      el.className = "week-fly-butterfly";
      el.setAttribute("aria-hidden", "true");
      el.innerHTML = WEEK_BUTTERFLY_SVG;
      el.style.width = (38 * cfg.scale) + "px";
      el.style.height = (38 * cfg.scale) + "px";
      el.style.filter = `hue-rotate(${cfg.hue}deg) drop-shadow(0 3px 4px rgba(2, 132, 199, 0.4))`;
      // Per-butterfly wing flap speed
      el.querySelectorAll(".bf-wing").forEach(w => { w.style.animationDuration = cfg.flap + "s"; });
      // Start offscreen to avoid a flash at (0,0)
      el.style.transform = "translate(-200px, -200px)";
      document.body.appendChild(el);
      weekButterflyEls.push(el);
      weekButterflyStates.push(makeButterflyState(cfg));
    });
  } else {
    weekButterflyEls.forEach(el => { el.style.display = "block"; });
  }
  
  // If already animating, keep flying (no reset)
  if (weekButterflyRAF) { weekButterflyCache.dirty = true; return; }
  weekButterflyLast = 0;
  weekButterflyCache.dirty = true;
  
  const loop = (now) => {
    const home = document.getElementById("panel-home");
    const currentTh = document.querySelector(".schedule-table thead th.current-week-col");
    if (!home || !home.classList.contains("active") || !currentTh) {
      stopWeekButterfly();
      return;
    }
    
    // Recompute the flight bounds only when dirty (scroll/resize/render)
    if (weekButterflyCache.dirty || !weekButterflyCache.bounds) {
      const thRect = currentTh.getBoundingClientRect();
      const colIndex = currentTh.cellIndex;
      let colBottom = thRect.bottom;
      const rows = document.querySelectorAll("#scheduleBody tr");
      if (rows.length && colIndex >= 0) {
        const lastRow = rows[rows.length - 1];
        const cell = lastRow.children[colIndex];
        if (cell) colBottom = cell.getBoundingClientRect().bottom;
      }
      
      const wrapper = document.querySelector(".table-wrapper");
      const wrapRect = wrapper ? wrapper.getBoundingClientRect() : null;
      
      const padX = 24;
      let minX = thRect.left - padX;
      let maxX = thRect.right + padX;
      let minY = thRect.top - 16;
      let maxY = Math.max(thRect.top + 90, colBottom);
      if (wrapRect) {
        minX = Math.max(minX, wrapRect.left + 4);
        maxX = Math.min(maxX, wrapRect.right - 4);
        minY = Math.max(minY, wrapRect.top + 4);
        maxY = Math.min(maxY, wrapRect.bottom - 4);
      }
      weekButterflyCache.bounds = { minX, maxX, minY, maxY };
      weekButterflyCache.dirty = false;
    }
    
    const bounds = weekButterflyCache.bounds;
    // If the current week column is scrolled out of view, hide butterflies
    if (bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
      weekButterflyEls.forEach(el => { el.style.display = "none"; });
      weekButterflyRAF = requestAnimationFrame(loop);
      return;
    }
    
    const dt = weekButterflyLast ? Math.min(0.05, (now - weekButterflyLast) / 1000) : 0.016;
    weekButterflyLast = now;
    weekButterflyEls.forEach(el => { if (el.style.display === "none") el.style.display = "block"; });
    
    weekButterflyStates.forEach((st, i) => {
      const el = weekButterflyEls[i];
      const cfg = st.cfg;
      
      if (!st.init) {
        st.x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
        st.y = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
        st.tx = st.x;
        st.ty = st.y;
        st.retarget = Math.random() * 0.5;
        st.init = true;
      }
      
      // Pick a new wander target now and then
      st.retarget -= dt;
      const distT = Math.hypot(st.tx - st.x, st.ty - st.y);
      if (st.retarget <= 0 || distT < 10) {
        st.tx = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
        st.ty = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
        st.retarget = 0.7 + Math.random() * 1.8;
      }
      
      // Steer toward target (smooth velocity change)
      const maxSpeed = 62 * cfg.speed; // px per second
      const dx = st.tx - st.x;
      const dy = st.ty - st.y;
      const d = Math.hypot(dx, dy) || 1;
      const desiredVx = (dx / d) * maxSpeed;
      const desiredVy = (dy / d) * maxSpeed;
      const steer = Math.min(1, dt * 2.4);
      st.vx += (desiredVx - st.vx) * steer;
      st.vy += (desiredVy - st.vy) * steer;
      
      // Flutter: perpendicular wobble + vertical bob
      st.phase += dt * (7 + cfg.speed * 2.5);
      const sp = Math.hypot(st.vx, st.vy) || 1;
      const perpX = -st.vy / sp;
      const perpY = st.vx / sp;
      const wobble = Math.sin(st.phase) * 16 * cfg.bob;
      const bob = Math.cos(st.phase * 1.3) * 9 * cfg.bob;
      
      let nx = st.x + (st.vx + perpX * wobble) * dt;
      let ny = st.y + (st.vy + perpY * wobble + bob) * dt;
      
      // Soft bounce against bounds
      if (nx < bounds.minX) { nx = bounds.minX; st.vx = Math.abs(st.vx); }
      if (nx > bounds.maxX) { nx = bounds.maxX; st.vx = -Math.abs(st.vx); }
      if (ny < bounds.minY) { ny = bounds.minY; st.vy = Math.abs(st.vy); }
      if (ny > bounds.maxY) { ny = bounds.maxY; st.vy = -Math.abs(st.vy); }
      st.x = nx;
      st.y = ny;
      
      // Face travel direction (SVG points up by default) + gentle wobble
      const heading = Math.atan2(st.vy, st.vx) * 180 / Math.PI + 90;
      const rot = heading + Math.sin(st.phase * 0.7) * 12;
      const half = 19 * cfg.scale;
      el.style.transform = `translate(${st.x - half}px, ${st.y - half}px) rotate(${rot}deg)`;
    });
    
    weekButterflyRAF = requestAnimationFrame(loop);
  };
  weekButterflyRAF = requestAnimationFrame(loop);
}

function stopWeekButterfly() {
  if (weekButterflyRAF) {
    cancelAnimationFrame(weekButterflyRAF);
    weekButterflyRAF = null;
  }
  weekButterflyLast = 0;
  weekButterflyEls.forEach(el => { el.style.display = "none"; });
  weekButterflyStates.forEach(st => { st.init = false; });
}

// Pause butterfly animation when tab is hidden (save CPU/battery)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (weekButterflyRAF) {
      cancelAnimationFrame(weekButterflyRAF);
      weekButterflyRAF = null;
    }
  } else {
    // Resume if home tab is active
    const homePanel = document.getElementById("panel-home");
    if (homePanel && homePanel.classList.contains("active") && !weekButterflyRAF) {
      ensureWeekButterfly();
    }
  }
});

// ===========================================
// RENDER NOTICE
// ===========================================
function renderNotice() {
  const noticeDisplay = document.getElementById("noticeDisplay");
  const noticeInput = document.getElementById("noticeInput");
  const noticeToolbar = document.getElementById("noticeToolbar");
  const saveNoticeBtn = document.getElementById("saveNoticeBtn");
  
  if (noticeDisplay) {
    if (currentClassData.notice && currentClassData.notice !== "Chưa có thông tin báo bài mới.") {
      noticeDisplay.innerHTML = sanitizeNoticeHtml(currentClassData.notice);
    } else {
      noticeDisplay.textContent = "Chưa có thông tin báo bài mới.";
    }
  }
  
  if (noticeInput && isAdmin) {
    if (document.activeElement !== noticeInput) {
      if (currentClassData.notice && currentClassData.notice !== "Chưa có thông tin báo bài mới.") {
        noticeInput.innerHTML = sanitizeNoticeHtml(currentClassData.notice);
      } else {
        noticeInput.innerHTML = "";
      }
    }
    noticeInput.classList.remove("hidden");
    if (noticeToolbar) noticeToolbar.classList.remove("hidden");
    if (saveNoticeBtn) saveNoticeBtn.classList.remove("hidden");
  } else if (noticeInput) {
    noticeInput.classList.add("hidden");
    if (noticeToolbar) noticeToolbar.classList.add("hidden");
    if (saveNoticeBtn) saveNoticeBtn.classList.add("hidden");
  }
  
  if (noticeDisplay && isAdmin) {
    noticeDisplay.classList.add("hidden");
  } else if (noticeDisplay) {
    noticeDisplay.classList.remove("hidden");
  }
}

// ===========================================
// RANDOM STUDENT PICKER (ocean + fish gathering at corals)
// ===========================================
function stopRandomDraw() {
  randomSpinning = false;
  if (randomRAF) { cancelAnimationFrame(randomRAF); randomRAF = null; }
  if (randomDrawTimer) { clearTimeout(randomDrawTimer); randomDrawTimer = null; }
  if (randomCountdownTimer) { clearInterval(randomCountdownTimer); randomCountdownTimer = null; }
}

function renderRandomBoard() {
  const board = document.getElementById("randomBoard");
  if (!board) return;
  stopRandomDraw();
  board.innerHTML = "";
  randomNames = toArray(currentClassData.students);
  randomFlowers = [];
  randomButterflies = [];

  // Seaweed on both sides
  const branches = document.createElement("div");
  branches.className = "random-branches";
  branches.innerHTML = RANDOM_BRANCH_LEFT_SVG + RANDOM_BRANCH_RIGHT_SVG;
  board.appendChild(branches);

  if (randomNames.length === 0) {
    const empty = document.createElement("p");
    empty.className = "random-empty";
    empty.textContent = "Chưa có học sinh trong lớp này.";
    board.appendChild(empty);
  } else {
    // Each student = a coral with a name tag (fish gathering target)
    const shuffledColors = [...CORAL_COLORS].sort(() => Math.random() - 0.5);
    const positions = computeScatterPositions(randomNames.length);
    randomNames.forEach((name, i) => {
      const color = shuffledColors[i % shuffledColors.length];
      const container = document.createElement("div");
      container.className = "flower-container coral-container";
      container.dataset.name = name;
      container.dataset.idx = i;
      container.style.left = positions[i].x + "%";
      container.style.top = positions[i].y + "%";
      container.style.transform = "translate(-50%, -50%)";
      container.style.opacity = "1";
      
      const coral = document.createElement("div");
      coral.className = "coral-svg-wrap";
      coral.innerHTML = createCoralSVG(color, i);
      container.appendChild(coral);
      
      const tag = document.createElement("span");
      tag.className = "flower-tag coral-tag";
      tag.textContent = name;
      tag.style.background = color;
      container.appendChild(tag);
      
      const badge = document.createElement("span");
      badge.className = "perch-count";
      badge.textContent = "0";
      container.appendChild(badge);
      
      board.appendChild(container);
      randomFlowers.push({
        el: container, flowerEl: coral, tagEl: tag, badgeEl: badge,
        name: name, color: color, idx: i
      });
    });
  }

  // Fish layer (above corals)
  const layer = document.createElement("div");
  layer.id = "randomButterflies";
  layer.className = "random-butterflies random-fish-layer";
  board.appendChild(layer);

  // Countdown timer badge
  const timerEl = document.createElement("div");
  timerEl.id = "randomTimer";
  timerEl.className = "random-timer hidden";
  timerEl.setAttribute("aria-live", "polite");
  board.appendChild(timerEl);

  buildButterflyPool();
}

function buildButterflyPool() {
  const layer = document.getElementById("randomButterflies");
  if (!layer) return;
  for (let i = 0; i < RANDOM_MAX_BUTTERFLIES; i++) {
    const el = document.createElement("div");
    el.className = "random-bf random-fish";
    el.innerHTML = RANDOM_BF_SVG;
    const color = RANDOM_BF_HUES[i % RANDOM_BF_HUES.length];
    const size = 34 + (i % 3) * 4;
    el.style.width = size + "px";
    el.style.height = size + "px";
    el.style.color = color;
    el.style.filter = `drop-shadow(0 2px 3px rgba(0,0,0,0.35))`;
    el.style.display = "none";
    layer.appendChild(el);
    randomButterflies.push({
      el, x: -100, y: -100, vx: 0, vy: 0, tx: 0, ty: 0,
      mode: "perched", phase: Math.random() * Math.PI * 2,
      size, hue: i, color, assigned: -1, fakeIdx: -1, retarget: 0,
      landStartTime: 0, landEndTime: 0, landStartX: 0, landStartY: 0,
      landOffX: 0, landOffY: 0, rot: 0, landed: false
    });
  }
}

function butterflyLayerRect() {
  const layer = document.getElementById("randomButterflies");
  const board = document.getElementById("randomBoard");
  const el = layer || board;
  return el ? el.getBoundingClientRect() : { width: 0, height: 0, left: 0, top: 0 };
}

function applyButterflyTransform(bf) {
  const half = bf.size / 2;
  bf.el.style.transform = `translate(${bf.x - half}px, ${bf.y - half}px) rotate(${bf.rot}deg)`;
}

function updateButterflyMove(bf, dt, bounds) {
  const maxSpeed = 80;
  const dx = bf.tx - bf.x;
  const dy = bf.ty - bf.y;
  const d = Math.hypot(dx, dy) || 1;
  const desiredVx = (dx / d) * maxSpeed;
  const desiredVy = (dy / d) * maxSpeed;
  const steer = Math.min(1, dt * 3);
  bf.vx += (desiredVx - bf.vx) * steer;
  bf.vy += (desiredVy - bf.vy) * steer;

  bf.phase += dt * (9 + (bf.hue % 5));
  const sp = Math.hypot(bf.vx, bf.vy) || 1;
  const perpX = -bf.vy / sp;
  const perpY = bf.vx / sp;
  const wobble = Math.sin(bf.phase) * 11;

  let nx = bf.x + (bf.vx + perpX * wobble) * dt;
  let ny = bf.y + (bf.vy + perpY * wobble) * dt;

  if (nx < 6) { nx = 6; bf.vx = Math.abs(bf.vx); }
  if (nx > bounds.w - 6) { nx = bounds.w - 6; bf.vx = -Math.abs(bf.vx); }
  if (ny < 6) { ny = 6; bf.vy = Math.abs(bf.vy); }
  if (ny > bounds.h - 6) { ny = bounds.h - 6; bf.vy = -Math.abs(bf.vy); }
  bf.x = nx;
  bf.y = ny;
  bf.rot = Math.atan2(bf.vy, bf.vx) * 180 / Math.PI + Math.sin(bf.phase) * 9;
}

// Compute non-overlapping-ish scatter positions (percent) on the board
function computeScatterPositions(count) {
  const positions = [];
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ r, c });
    }
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const padX = 10, padY = 12;
  const usableW = 100 - padX * 2;
  const usableH = 100 - padY * 2;
  for (let i = 0; i < count; i++) {
    const cell = cells[i % cells.length];
    const jitterX = (Math.random() - 0.5) * (usableW / cols) * 0.5;
    const jitterY = (Math.random() - 0.5) * (usableH / rows) * 0.5;
    const x = padX + (cell.c + 0.5) * (usableW / cols) + jitterX;
    const y = padY + (cell.r + 0.5) * (usableH / rows) + jitterY;
    positions.push({
      x: Math.max(6, Math.min(85, x)),
      y: Math.max(8, Math.min(88, y)),
      r: (Math.random() - 0.5) * 12
    });
  }
  return positions;
}

// Recompute flower positions on resize/orientation change during a draw
window.addEventListener('resize', () => {
  if (randomSpinning && randomDrawState && randomDrawState.recomputeFlowerPositions) {
    randomDrawState.recomputeFlowerPositions();
  }
});

function startRandomDraw() {
  if (randomSpinning) return;
  const board = document.getElementById("randomBoard");
  const winnerBox = document.getElementById("randomWinner");
  if (!board) return;

  const names = toArray(currentClassData.students);
  if (names.length === 0 || randomFlowers.length === 0) {
    showToast("Chưa có học sinh trong lớp này!", "warning");
    return;
  }

  const durSelect = document.getElementById("randomDuration");
  const durationSec = durSelect ? (parseInt(durSelect.value, 10) || 5) : 5;
  const totalMs = durationSec * 1000;

  randomSpinning = true;
  if (winnerBox) winnerBox.classList.remove("show");
  randomFlowers.forEach(f => {
    f.el.classList.remove("winner");
    if (f.badgeEl) { f.badgeEl.textContent = "0"; f.badgeEl.classList.remove("show"); }
  });

  // Number of butterflies scales with duration
  let N = Math.round(4 + durationSec * 0.8);
  N = Math.max(3, Math.min(RANDOM_MAX_BUTTERFLIES, N));
  // Handle single student: just 1 butterfly
  if (randomFlowers.length === 1) N = 1;
  else N = Math.max(3, Math.min(N, randomFlowers.length * 2));

  const winnerIdx = Math.floor(Math.random() * randomFlowers.length);

  // Distribute butterflies: winner flower gets a plurality
  const winnerCount = Math.max(2, Math.ceil(N * 0.4));
  const assignments = [];
  for (let i = 0; i < winnerCount; i++) assignments.push(winnerIdx);
  const counts = {};
  counts[winnerIdx] = winnerCount;
  let remaining = N - winnerCount;
  while (remaining > 0) {
    const candidates = [];
    for (let t = 0; t < randomFlowers.length; t++) {
      if (t === winnerIdx) continue;
      if ((counts[t] || 0) < winnerCount - 1) candidates.push(t);
    }
    if (candidates.length === 0) { assignments.push(winnerIdx); remaining--; continue; }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    assignments.push(pick);
    counts[pick] = (counts[pick] || 0) + 1;
    remaining--;
  }
  for (let i = assignments.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [assignments[i], assignments[j]] = [assignments[j], assignments[i]];
  }

  // Flower positions relative to butterfly layer
  const rect = butterflyLayerRect();
  const bounds = { w: rect.width, h: rect.height };
  const flowerPositions = {};
  randomFlowers.forEach((f, idx) => {
    const r = f.el.getBoundingClientRect();
    flowerPositions[idx] = {
      x: r.left - rect.left + r.width / 2,
      y: r.top - rect.top + r.height * 0.32
    };
  });

  const startTime = performance.now();
  randomDrawStart = startTime;

  // Timing: wander then land; fake landing in the last 2 seconds
  const wanderMs = totalMs * 0.35;
  const landingMs = totalMs - wanderMs;
  const fakeStart = Math.max(wanderMs, totalMs - 2000); // last 2 seconds

  const timerEl = document.getElementById("randomTimer");
  if (timerEl) { timerEl.classList.remove("hidden"); timerEl.textContent = "⏱ " + durationSec + "s"; }

  randomButterflies.forEach((bf, i) => {
    if (i < N) {
      bf.el.style.display = "block";
      bf.el.classList.remove("landed");
      bf.landed = false;
      bf.finalStarted = false;
      bf.mode = "flying";
      bf.assigned = assignments[i];
      bf.phase = Math.random() * Math.PI * 2;
      bf.vx = 0; bf.vy = 0;
      bf.x = 20 + Math.random() * Math.max(1, bounds.w - 40);
      bf.y = 20 + Math.random() * Math.max(1, bounds.h - 40);
      bf.tx = 20 + Math.random() * Math.max(1, bounds.w - 40);
      bf.ty = 20 + Math.random() * Math.max(1, bounds.h - 40);
      bf.retarget = 0.3 + Math.random() * 0.6;
      // Fake landing: pick a different flower to hover near before the real one
      bf.fakeIdx = (assignments[i] + 1 + Math.floor(Math.random() * (randomFlowers.length - 1))) % randomFlowers.length;
      bf.landStartTime = wanderMs;
      const p = N === 1 ? 1 : (i + 1) / N;
      // Ensure each butterfly has at least 500ms to approach its flower
      bf.landEndTime = Math.max(wanderMs + 500, wanderMs + p * landingMs);
      bf.landOffX = (Math.random() - 0.5) * 22;
      bf.landOffY = (Math.random() - 0.5) * 10;
      bf.landStartX = bf.x;
      bf.landStartY = bf.y;
      applyButterflyTransform(bf);
    } else {
      bf.el.style.display = "none";
      bf.mode = "perched";
    }
  });

  randomDrawState = { N, winnerIdx, bounds, flowerPositions, fakeStart, totalMs, last: 0 };
  // Expose recompute function for resize handling
  randomDrawState.recomputeFlowerPositions = () => {
    const rect2 = butterflyLayerRect();
    randomDrawState.bounds = { w: rect2.width, h: rect2.height };
    randomFlowers.forEach((f, idx) => {
      const r = f.el.getBoundingClientRect();
      randomDrawState.flowerPositions[idx] = {
        x: r.left - rect2.left + r.width / 2,
        y: r.top - rect2.top + r.height * 0.32
      };
    });
  };

  if (randomDrawTimer) { clearTimeout(randomDrawTimer); randomDrawTimer = null; }
  if (randomCountdownTimer) { clearInterval(randomCountdownTimer); randomCountdownTimer = null; }
  randomDrawTimer = setTimeout(() => { forceFinishRandom(); }, totalMs + 200);
  const countStart = Date.now();
  randomCountdownTimer = setInterval(() => {
    const remain = Math.max(0, totalMs - (Date.now() - countStart));
    if (timerEl) timerEl.textContent = "⏱ " + (remain / 1000).toFixed(1) + "s";
    if (remain <= 0 && randomCountdownTimer) { clearInterval(randomCountdownTimer); randomCountdownTimer = null; }
  }, 100);

  if (randomRAF) cancelAnimationFrame(randomRAF);
  randomRAF = requestAnimationFrame(drawLoop);
}

function drawLoop(now) {
  if (!randomSpinning || !randomDrawState) return;
  const st = randomDrawState;
  const elapsed = now - randomDrawStart;
  const dt = st.last ? Math.min(0.05, (now - st.last) / 1000) : 0.016;
  st.last = now;

  let allLanded = true;
  for (let i = 0; i < st.N; i++) {
    const bf = randomButterflies[i];
    if (bf.landed) continue;

    if (bf.mode === "flying") {
      if (elapsed >= bf.landStartTime) {
        bf.mode = "landing";
        bf.landStartX = bf.x;
        bf.landStartY = bf.y;
      } else {
        bf.retarget -= dt;
        const dTarget = Math.hypot(bf.tx - bf.x, bf.ty - bf.y);
        if (bf.retarget <= 0 || dTarget < 24) {
          bf.tx = 20 + Math.random() * Math.max(1, st.bounds.w - 40);
          bf.ty = 20 + Math.random() * Math.max(1, st.bounds.h - 40);
          bf.retarget = 0.4 + Math.random() * 0.8;
        }
        updateButterflyMove(bf, dt, st.bounds);
      }
    }

    if (bf.mode === "landing") {
      const realTgt = st.flowerPositions[bf.assigned] || { x: st.bounds.w / 2, y: st.bounds.h / 2 };
      const realX = realTgt.x + bf.landOffX;
      const realY = realTgt.y + bf.landOffY;

      if (elapsed >= bf.landEndTime) {
        // Settle on the real assigned flower
        bf.x = realX;
        bf.y = realY;
        bf.rot = 0;
        bf.mode = "landed";
        bf.landed = true;
        bf.el.classList.add("landed");
        const flower = randomFlowers[bf.assigned];
        if (flower && flower.badgeEl) {
          const c = (parseInt(flower.badgeEl.textContent) || 0) + 1;
          flower.badgeEl.textContent = c;
          flower.badgeEl.classList.add("show");
        }
      } else if (elapsed >= bf.landEndTime - 500) {
        // Final approach (last 500ms): interpolate quickly to the REAL flower
        if (!bf.finalStarted) { bf.finalStarted = true; bf.finalStartX = bf.x; bf.finalStartY = bf.y; }
        const t = Math.max(0, Math.min(1, (elapsed - (bf.landEndTime - 500)) / 500));
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        bf.x = bf.finalStartX + (realX - bf.finalStartX) * e;
        bf.y = bf.finalStartY + (realY - bf.finalStartY) * e;
        const dx = realX - bf.finalStartX, dy = realY - bf.finalStartY;
        bf.rot = Math.atan2(dy, dx) * 180 / Math.PI;
      } else {
        // Before final approach: fake landing (hover near a wrong flower) or home toward assigned
        let targetFlower = bf.assigned;
        if (elapsed >= st.fakeStart) targetFlower = bf.fakeIdx;
        const tgt = st.flowerPositions[targetFlower] || { x: st.bounds.w / 2, y: st.bounds.h / 2 };
        bf.tx = tgt.x + bf.landOffX;
        bf.ty = tgt.y + bf.landOffY;
        updateButterflyMove(bf, dt, st.bounds);
      }
    }

    applyButterflyTransform(bf);

    if (!bf.landed) allLanded = false;
  }

  if (allLanded) {
    finishDraw(st.winnerIdx);
    return;
  }
  randomRAF = requestAnimationFrame(drawLoop);
}

function forceFinishRandom() {
  if (!randomSpinning || !randomDrawState) return;
  const st = randomDrawState;
  for (let i = 0; i < st.N; i++) {
    const bf = randomButterflies[i];
    if (!bf.landed) {
      const tgt = st.flowerPositions[bf.assigned] || { x: st.bounds.w / 2, y: st.bounds.h / 2 };
      bf.x = tgt.x + bf.landOffX;
      bf.y = tgt.y + bf.landOffY;
      bf.rot = 0;
      bf.mode = "landed";
      bf.landed = true;
      bf.el.classList.add("landed");
      applyButterflyTransform(bf);
      const flower = randomFlowers[bf.assigned];
      if (flower && flower.badgeEl) {
        const c = (parseInt(flower.badgeEl.textContent) || 0) + 1;
        flower.badgeEl.textContent = c;
        flower.badgeEl.classList.add("show");
      }
    }
  }
  finishDraw(st.winnerIdx);
}

function finishDraw(winnerIdx) {
  randomSpinning = false;
  if (randomRAF) { cancelAnimationFrame(randomRAF); randomRAF = null; }
  if (randomDrawTimer) { clearTimeout(randomDrawTimer); randomDrawTimer = null; }
  if (randomCountdownTimer) { clearInterval(randomCountdownTimer); randomCountdownTimer = null; }
  const timerEl = document.getElementById("randomTimer");
  if (timerEl) timerEl.classList.add("hidden");

  randomFlowers.forEach((f, idx) => {
    if (idx === winnerIdx) {
      f.el.classList.add("winner");
      if (f.badgeEl) { f.badgeEl.textContent = "👑"; f.badgeEl.classList.add("show"); }
    }
  });

  const winnerFlower = randomFlowers[winnerIdx];
  const winnerName = winnerFlower ? winnerFlower.name : "";
  const winnerBox = document.getElementById("randomWinner");
  if (winnerBox) {
    winnerBox.querySelector(".winner-name").textContent = winnerName;
    winnerBox.classList.add("show");
    launchConfetti(winnerBox);
  }
}

function launchConfetti(container) {
  // Clear any leftover confetti from a previous draw
  container.querySelectorAll('.confetti-piece').forEach(el => el.remove());
  const colors = ["#0284c7", "#06b6d4", "#f472b6", "#f59e0b", "#10b981", "#6366f1"];
  for (let i = 0; i < 40; i++) {
    const c = document.createElement("span");
    c.className = "confetti-piece";
    c.style.left = Math.random() * 100 + "%";
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDelay = Math.random() * 0.3 + "s";
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(c);
    setTimeout(() => c.remove(), 2500);
  }
}

function closeRandomWinner() {
  const winnerBox = document.getElementById("randomWinner");
  if (winnerBox) winnerBox.classList.remove("show");
  renderRandomBoard();
}

// ===========================================
// CHAT
// ===========================================
let chatListener = null;
let chatNickname = localStorage.getItem("chatNickname") || "";

// Non-admins cannot impersonate "admin" in their chat nickname
function isImpersonatingAdmin(name) {
  if (isAdmin) return false;
  return typeof name === "string" && name.toLowerCase().includes("admin");
}

function getChatNickname() {
  if (chatNickname) return chatNickname;
  // Use a typed-but-unsaved value from the inline input if present
  const input = document.getElementById("chatNicknameInput");
  if (input && input.value.trim()) {
    const trimmed = input.value.trim().slice(0, 30);
    if (isImpersonatingAdmin(trimmed)) {
      showToast("Không được đặt tên trùng với Admin!", "warning");
      input.value = "";
      showChatNicknameInput();
      return null;
    }
    chatNickname = trimmed;
    localStorage.setItem("chatNickname", chatNickname);
    input.classList.add("hidden");
    setChatNicknameToggleText(false);
    updateChatIdentityUI();
    return chatNickname;
  }
  // No nickname yet — reveal the inline input instead of using prompt()
  showChatNicknameInput();
  return null;
}

function setChatNicknameToggleText(open) {
  const toggle = document.getElementById("chatNicknameToggle");
  if (toggle) toggle.textContent = open ? "Lưu tên" : "Đổi tên";
}

function showChatNicknameInput() {
  const input = document.getElementById("chatNicknameInput");
  if (input) {
    input.classList.remove("hidden");
    input.value = chatNickname || "";
    setChatNicknameToggleText(true);
    input.focus();
    input.select();
  }
}

function saveChatNicknameFromInput() {
  const input = document.getElementById("chatNicknameInput");
  if (!input) return;
  const trimmed = input.value.trim().slice(0, 30);
  if (trimmed) {
    if (isImpersonatingAdmin(trimmed)) {
      showToast("Không được đặt tên trùng với Admin!", "warning");
      input.value = chatNickname || "";
      return; // don't save, keep input open
    }
    chatNickname = trimmed;
    localStorage.setItem("chatNickname", chatNickname);
  } else {
    chatNickname = "";
    localStorage.removeItem("chatNickname");
  }
  input.classList.add("hidden");
  setChatNicknameToggleText(false);
  updateChatIdentityUI();
}

function setChatNickname() {
  // Toggle the inline nickname input in the chat header (replaces prompt())
  const input = document.getElementById("chatNicknameInput");
  if (!input) return;
  if (input.classList.contains("hidden")) {
    showChatNicknameInput();
  } else {
    saveChatNicknameFromInput();
  }
}

function updateChatIdentityUI() {
  const nameEl = document.getElementById("chatMyName");
  if (nameEl) {
    if (isAdmin) {
      nameEl.innerHTML = '🦋 <span class="chat-admin-tag">Admin</span>';
    } else {
      nameEl.textContent = chatNickname ? ("Bạn: " + chatNickname) : "Bạn: (chưa đặt tên)";
    }
  }
}

function loadChat() {
  if (chatListener) return; // already listening
  // Limit to last 100 messages to avoid loading thousands
  const chatQuery = query(chatRef, limitToLast(100));
  chatListener = onValue(chatQuery, (snapshot) => {
    renderChatMessages(snapshot.val());
  }, (error) => {
    console.error("Chat load error:", error);
  });
}

function renderChatMessages(val) {
  const list = document.getElementById("chatMessages");
  if (!list) return;
  list.innerHTML = "";
  if (!val) {
    list.innerHTML = '<div class="chat-empty">Chưa có tin nhắn. Hãy là người đầu tiên!</div>';
    return;
  }
  const msgs = Object.entries(val)
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  msgs.forEach(m => {
    const isAdminMsg = m.isAdmin === true;
    const row = document.createElement("div");
    row.className = "chat-msg" + (isAdminMsg ? " is-admin" : "");
    const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "";
    row.innerHTML = `
      <div class="chat-msg-head">
        <span class="chat-msg-name">${isAdminMsg ? '🦋 <span class="chat-admin-tag">Admin</span>' : escapeHtml(m.name || "Ẩn danh")}</span>
        <span class="chat-msg-time">${escapeHtml(time)}</span>
      </div>
      <div class="chat-msg-text">${escapeHtml(m.text || "")}</div>
    `;
    list.appendChild(row);
  });
  list.scrollTop = list.scrollHeight;
}

let lastChatSendTime = 0;
function sendChatMessage() {
  const now = Date.now();
  if (now - lastChatSendTime < 500) return; // 500ms cooldown
  const input = document.getElementById("chatInput");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  lastChatSendTime = now;
  const name = isAdmin ? "Admin" : getChatNickname();
  if (!name) return;
  // Non-admins cannot send messages under an "admin" impersonation name
  if (!isAdmin && isImpersonatingAdmin(name)) {
    showToast("Không được đặt tên trùng với Admin!", "warning");
    return;
  }
  const msg = {
    uid: auth.currentUser ? auth.currentUser.uid : "guest",
    name: name,
    text: text.slice(0, 500),
    isAdmin: isAdmin === true,
    timestamp: serverTimestamp()
  };
  push(chatRef, msg).catch(() => {
    showToast("Không gửi được tin nhắn!", "error");
  });
  input.value = "";
  input.focus();
}

// Expose to global scope for inline handlers
window.startRandomDraw = startRandomDraw;
window.closeRandomWinner = closeRandomWinner;
window.setChatNickname = setChatNickname;
window.sendChatMessage = sendChatMessage;

// ===========================================
// BÁO (report posts + current class notice)
// ===========================================
let postsListener = null;
let baoEditingId = null;
let baoPostsCache = {};
let baoLatestPostsVal = null;
let baoEditTimeoutId = null;
let baoViewTimeoutId = null;

function renderBaoBaibai() {
  const nameEl = document.getElementById("baoClassName");
  if (nameEl) {
    nameEl.textContent = (currentClassId && classesData[currentClassId])
      ? classesData[currentClassId].name
      : "—";
  }
  // The notice display/editor now lives on the Báo page — refresh it
  renderNotice();
}

function loadPosts() {
  if (postsListener) return;
  postsListener = onValue(postsRef, (snapshot) => {
    baoLatestPostsVal = snapshot.val();
    renderPostsList(baoLatestPostsVal);
  }, (error) => {
    console.error("Posts load error:", error);
  });
}

function renderPostsList(val) {
  const list = document.getElementById("baoPostsList");
  if (!list) return;
  // Cache posts for edit/view
  baoPostsCache = {};
  if (val) {
    Object.entries(val).forEach(([id, p]) => { baoPostsCache[id] = p; });
  }
  list.innerHTML = "";
  if (!val) {
    list.innerHTML = '<div class="bao-empty">Chưa có bài báo nào.</div>';
    return;
  }
  const posts = Object.entries(val)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  posts.forEach(p => {
    const card = document.createElement("article");
    card.className = "bao-post-card";
    const date = p.createdAt ? new Date(p.createdAt).toLocaleDateString("vi-VN") : "";
    const summary = p.summary || (p.content ? String(p.content).replace(/<[^>]+>/g, "").slice(0, 120) : "");
    card.innerHTML = `
      <div class="bao-post-main">
        <h3 class="bao-post-title">${escapeHtml(p.title || "Không tiêu đề")}</h3>
        <p class="bao-post-summary">${escapeHtml(summary)}</p>
        <div class="bao-post-meta">${escapeHtml(p.author || "Admin")} · ${escapeHtml(date)}</div>
      </div>
      <div class="bao-post-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-bao-action="view" data-bao-id="${p.id}">Đọc</button>
        ${isAdmin ? `
          <button type="button" class="btn btn-ghost btn-sm" data-bao-action="edit" data-bao-id="${p.id}">Sửa</button>
          <button type="button" class="btn btn-ghost btn-sm" data-bao-action="delete" data-bao-id="${p.id}">Xóa</button>` : ""}
      </div>
    `;
    // Click card body opens the post
    card.querySelector(".bao-post-main").addEventListener("click", () => openBaoView(p.id));
    card.querySelectorAll("[data-bao-action]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.baoAction;
        const id = btn.dataset.baoId;
        if (action === "view") openBaoView(id);
        else if (action === "edit") openBaoEditor(id);
        else if (action === "delete") deleteBaoPost(id);
      });
    });
    list.appendChild(card);
  });
}

function openBaoEditor(id) {
  if (!isAdmin) return;
  const modal = document.getElementById("baoEditModal");
  const titleEl = document.getElementById("baoEditTitle");
  const titleInput = document.getElementById("baoPostTitle");
  const summaryInput = document.getElementById("baoPostSummary");
  const contentInput = document.getElementById("baoPostContent");
  if (!modal) return;
  // Clear any pending close timeout to avoid modal auto-hiding
  if (baoEditTimeoutId) { clearTimeout(baoEditTimeoutId); baoEditTimeoutId = null; }
  baoEditingId = id || null;
  if (id) {
    // Edit existing: find post data from cache
    const posts = baoPostsCache || {};
    const p = posts[id] || {};
    titleEl.textContent = "Sửa bài báo";
    titleInput.value = p.title || "";
    summaryInput.value = p.summary || "";
    contentInput.value = p.content || "";
  } else {
    titleEl.textContent = "Viết bài báo";
    titleInput.value = "";
    summaryInput.value = "";
    contentInput.value = "";
  }
  modal.hidden = false;
  modal.offsetHeight;
  modal.classList.add("visible");
  titleInput.focus();
}

function closeBaoEditor() {
  const modal = document.getElementById("baoEditModal");
  if (!modal) return;
  modal.classList.remove("visible");
  if (baoEditTimeoutId) clearTimeout(baoEditTimeoutId);
  baoEditTimeoutId = setTimeout(() => { modal.hidden = true; baoEditTimeoutId = null; }, 200);
  baoEditingId = null;
}

function saveBaoPost() {
  if (!isAdmin) return;
  const title = document.getElementById("baoPostTitle").value.trim();
  const summary = document.getElementById("baoPostSummary").value.trim();
  const content = document.getElementById("baoPostContent").value.trim();
  if (!title) { showToast("Vui lòng nhập tiêu đề!", "warning"); return; }
  const data = {
    title,
    summary,
    content,
    author: currentUser && currentUser.email ? currentUser.email.split("@")[0] : "Admin",
    createdAt: baoEditingId && baoPostsCache[baoEditingId] ? baoPostsCache[baoEditingId].createdAt : Date.now(),
    updatedAt: Date.now()
  };
  if (baoEditingId) {
    update(ref(db, `trucNhatLop/posts/${baoEditingId}`), data)
      .then(() => closeBaoEditor())
      .catch(() => showToast("Không lưu được bài!", "error"));
  } else {
    data.createdAt = Date.now();
    push(postsRef, data)
      .then(() => closeBaoEditor())
      .catch(() => showToast("Không đăng được bài!", "error"));
  }
}

function deleteBaoPost(id) {
  if (!isAdmin) return;
  if (!confirm("Xóa bài báo này?")) return;
  remove(ref(db, `trucNhatLop/posts/${id}`)).catch(() => showToast("Không xóa được bài!", "error"));
}

function openBaoView(id) {
  const posts = baoPostsCache || {};
  const p = posts[id];
  const modal = document.getElementById("baoViewModal");
  if (!p || !modal) return;
  if (baoViewTimeoutId) { clearTimeout(baoViewTimeoutId); baoViewTimeoutId = null; }
  const date = p.createdAt ? new Date(p.createdAt).toLocaleString("vi-VN") : "";
  document.getElementById("baoViewTitle").textContent = p.title || "Không tiêu đề";
  document.getElementById("baoViewMeta").textContent = `${p.author || "Admin"} · ${date}`;
  // Plain-text content: use textContent so <, > and line breaks are preserved
  const bodyContent = p.content ? p.content : (p.summary || "");
  document.getElementById("baoViewBody").textContent = bodyContent;
  modal.hidden = false;
  modal.offsetHeight;
  modal.classList.add("visible");
}

function closeBaoView() {
  const modal = document.getElementById("baoViewModal");
  if (!modal) return;
  modal.classList.remove("visible");
  if (baoViewTimeoutId) clearTimeout(baoViewTimeoutId);
  baoViewTimeoutId = setTimeout(() => { modal.hidden = true; baoViewTimeoutId = null; }, 200);
}

// Expose to global scope
window.openBaoEditor = openBaoEditor;
window.closeBaoEditor = closeBaoEditor;
window.saveBaoPost = saveBaoPost;
window.closeBaoView = closeBaoView;

// Wire Báo modals (close buttons, overlay click, Escape)
document.addEventListener('DOMContentLoaded', () => {
  const editModal = document.getElementById("baoEditModal");
  const viewModal = document.getElementById("baoViewModal");
  const editClose = document.getElementById("baoEditClose");
  const viewClose = document.getElementById("baoViewClose");
  if (editClose) editClose.addEventListener('click', closeBaoEditor);
  if (viewClose) viewClose.addEventListener('click', closeBaoView);
  [editModal, viewModal].forEach(m => {
    if (m) m.addEventListener('click', (e) => { if (e.target === m) { if (m === editModal) closeBaoEditor(); else closeBaoView(); } });
  });
  // Enter in title/summary saves
  ["baoPostTitle", "baoPostSummary"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); document.getElementById("baoPostContent").focus(); }
    });
  });
});

// Right-click on the nickname display to change it
document.addEventListener('DOMContentLoaded', () => {
  const nameEl = document.getElementById("chatMyName");
  if (nameEl) {
    nameEl.addEventListener('contextmenu', (e) => {
      if (isAdmin) return; // admin identity is fixed
      e.preventDefault();
      setChatNickname();
    });
  }
  
  // Inline chat nickname input: Enter to save, Escape to cancel, blur to auto-save
  const nickInput = document.getElementById("chatNicknameInput");
  if (nickInput) {
    nickInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); saveChatNicknameFromInput(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); nickInput.classList.add("hidden"); setChatNicknameToggleText(false); }
    });
    nickInput.addEventListener('blur', (e) => {
      // Skip auto-save if focus is moving to the toggle button (it handles the save)
      if (e.relatedTarget && e.relatedTarget.id === 'chatNicknameToggle') return;
      if (!nickInput.classList.contains("hidden")) saveChatNicknameFromInput();
    });
  }
  
  // Login page buttons
  const guestLoginBtn = document.getElementById("guestLoginBtn");
  const adminLoginBtn = document.getElementById("adminLoginBtn");
  const guestNameInput = document.getElementById("guestNameInput");
  const loginCloseBtn = document.getElementById("loginCloseBtn");
  if (guestLoginBtn) guestLoginBtn.addEventListener('click', guestLogin);
  if (adminLoginBtn) adminLoginBtn.addEventListener('click', () => window.loginWithGoogle());
  if (loginCloseBtn) loginCloseBtn.addEventListener('click', () => { hideLoginPage(); publicBrowsing = true; switchTab('about'); });
  if (guestNameInput) {
    guestNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); guestLogin(); }
    });
  }
  
  // Tap notification bar cancel button
  const tapNotifyCancel = document.getElementById("tapNotifyCancel");
  if (tapNotifyCancel) {
    tapNotifyCancel.addEventListener('click', () => {
      clearTapSelection();
      renderAll();
    });
  }
});

// ===========================================
// NAVIGATION
// ===========================================
let currentTab = 'about';
let publicBrowsing = false;
let pendingHashTab = (window.location.hash || '').replace('#', '');

function switchTab(tabName) {
  // Ignore invalid tabs (e.g. stray hash like #mainContent) so we never hide all panels
  const validTabs = ['about', 'home', 'request', 'random', 'chat', 'bao'];
  if (!validTabs.includes(tabName)) return;
  if (tabName === currentTab) return;
  
  // Protected tabs require login (home/random/chat/bao); about & request are public
  const protectedTabs = ['home', 'random', 'chat', 'bao'];
  if (protectedTabs.includes(tabName) && !isAdmin && !isGuest) {
    showLoginPage();
    return;
  }
  
  document.querySelectorAll('.nav-tab').forEach(btn => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });
  
  document.querySelectorAll('.tab-panel').forEach(panel => {
    const isActive = panel.id === `panel-${tabName}`;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
    if (isActive) {
      // Remove tabindex to avoid focus outline on section
      panel.removeAttribute('tabindex');
    }
  });
  
  currentTab = tabName;
  // Sync URL hash so reload keeps the current tab
  try { history.replaceState(null, "", "#" + tabName); } catch (e) {}
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  // Lazy-render feature pages when opened
  if (tabName === 'home') {
    ensureWeekButterfly();
  } else {
    stopWeekButterfly();
    // Leaving the random tab cancels any in-progress draw
    if (tabName !== 'random') {
      stopRandomDraw();
    }
    if (tabName === 'random') {
      renderRandomBoard();
    } else if (tabName === 'chat') {
      updateChatIdentityUI();
      loadChat();
      setTimeout(() => {
        const ci = document.getElementById("chatInput");
        if (ci) ci.focus();
      }, 100);
    } else if (tabName === 'bao') {
      renderBaoBaibai();
      loadPosts();
      renderPostsList(baoLatestPostsVal);
    }
  }
  
  setTimeout(() => {
    observeRevealElements();
    animateCounters();
    // Fallback for about page: ensure feature cards become visible
    if (tabName === 'about') {
      setTimeout(() => {
        document.querySelectorAll('#panel-about .scroll-reveal:not(.revealed)').forEach(el => {
          el.classList.add('revealed');
        });
      }, 500);
    }
  }, 50);
}

window.switchTab = switchTab;

document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.querySelector('.nav-brand').addEventListener('click', (e) => {
  e.preventDefault();
  switchTab((isAdmin || isGuest) ? 'home' : 'about');
});

// ===========================================
// DROPDOWN EVENTS
// ===========================================
document.addEventListener('DOMContentLoaded', () => {
  const dropdownBtn = document.getElementById("classDropdownBtn");
  const addClassBtn = document.getElementById("addClassBtn");
  const manageClassesBtn = document.getElementById("manageClassesBtn");
  const modal = document.getElementById("classModal");
  const modalClose = document.getElementById("classModalClose");
  const modalCancel = document.getElementById("classModalCancel");
  const modalConfirm = document.getElementById("classModalConfirm");
  
  if (dropdownBtn) {
    dropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown();
    });
  }
  
  if (addClassBtn) {
    addClassBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeDropdown();
      openClassModal("add");
    });
  }
  
  if (manageClassesBtn) {
    manageClassesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeDropdown();
      openClassModal("manage");
    });
  }
  
  if (modalClose) modalClose.addEventListener('click', closeClassModal);
  if (modalCancel) modalCancel.addEventListener('click', closeClassModal);
  if (modalConfirm) modalConfirm.addEventListener('click', confirmClassModal);
  
  // Enter key confirms modal input
  const newClassNameInputEl = document.getElementById("newClassNameInput");
  const renameClassInputEl = document.getElementById("renameClassInput");
  [newClassNameInputEl, renameClassInputEl].forEach(input => {
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmClassModal();
        }
      });
    }
  });
  
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeClassModal();
    });
  }
  
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById("classSelector");
    const menu = document.getElementById("classDropdownMenu");
    const btn = document.getElementById("classDropdownBtn");
    if (dropdown && menu && btn && !dropdown.contains(e.target)) {
      closeDropdown();
    }
  });
});

// ===========================================
// ADMIN PANEL TOGGLE
// ===========================================
const adminPanelToggle = document.getElementById("adminPanelToggle");
const adminPanel = document.getElementById("adminPanel");
const adminPanelOpenBtn = document.getElementById("adminPanelOpenBtn");
if (adminPanelToggle && adminPanel) {
  adminPanelToggle.addEventListener('click', () => {
    const isOpen = adminPanel.classList.toggle("is-open");
    adminPanelToggle.setAttribute("aria-expanded", isOpen);
    adminPanelToggle.setAttribute("aria-label", isOpen ? "Đóng bảng điều khiển" : "Mở bảng điều khiển");
    adminPanel.inert = !isOpen;
    if (adminPanelOpenBtn) {
      adminPanelOpenBtn.classList.toggle("hidden", isOpen);
    }
  });
}

if (adminPanelOpenBtn && adminPanel) {
  adminPanelOpenBtn.addEventListener('click', () => {
    adminPanel.classList.add("is-open");
    adminPanel.inert = false;
    adminPanelOpenBtn.classList.add("hidden");
    if (adminPanelToggle) {
      adminPanelToggle.setAttribute("aria-expanded", "true");
      adminPanelToggle.setAttribute("aria-label", "Đóng bảng điều khiển");
    }
  });
}

// ===========================================
// ADMIN PANEL TABS
// ===========================================
document.addEventListener('DOMContentLoaded', () => {
  const adminTabs = document.querySelectorAll('.admin-panel-tab');
  const adminTabPanels = document.querySelectorAll('.admin-tabpanel');
  
  adminTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.adminTab;
      
      adminTabs.forEach(t => {
        const isActive = t.dataset.adminTab === targetTab;
        t.classList.toggle('active', isActive);
        t.setAttribute('aria-selected', isActive);
      });
      
      adminTabPanels.forEach(panel => {
        const isActive = panel.id === `admin-tab-${targetTab}`;
        panel.classList.toggle('active', isActive);
        panel.hidden = !isActive;
      });
      
      if (targetTab === 'dragdrop') {
        updateStudentDragList();
      }
    });
  });
});

// ===========================================
// RICH TEXT EDITOR
// ===========================================
function initNoticeToolbar() {
  const toolbar = document.getElementById('noticeToolbar');
  const editor = document.getElementById('noticeInput');
  const fontFamilySelect = document.getElementById('fontFamilySelect');
  const fontSizeSelect = document.getElementById('fontSizeSelect');
  const textColorSelect = document.getElementById('textColorSelect');
  
  if (!toolbar || !editor) return;
  
  try { document.execCommand('styleWithCSS', false, false); } catch (e) {}
  
  // Save selection before interacting with toolbar
  let savedSelection = null;
  
  function saveSelection() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      // Only save selection if it's inside the notice editor
      if (editor.contains(range.commonAncestorContainer)) {
        savedSelection = range.cloneRange();
      }
    }
  }
  
  function restoreSelection() {
    if (savedSelection) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedSelection);
    }
  }
  
  // Save selection on mouseup in editor
  editor.addEventListener('mouseup', saveSelection);
  editor.addEventListener('keyup', saveSelection);
  
  // Format buttons
  toolbar.querySelectorAll('.toolbar-btn[data-format]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      restoreSelection();
      
      const format = btn.dataset.format;
      const value = btn.dataset.value || null;
      
      if (format === 'heading') {
        const currentFormat = document.queryCommandValue('formatBlock').toLowerCase();
        if (currentFormat === 'h2') {
          document.execCommand('formatBlock', false, 'div');
        } else {
          document.execCommand('formatBlock', false, 'h2');
        }
      } else if (format === 'blockquote') {
        const currentFormat = document.queryCommandValue('formatBlock').toLowerCase();
        if (currentFormat === 'blockquote') {
          document.execCommand('formatBlock', false, 'div');
        } else {
          document.execCommand('formatBlock', false, 'blockquote');
        }
      } else if (format === 'removeFormat') {
        document.execCommand('removeFormat', false, null);
        document.execCommand('formatBlock', false, 'div');
      } else {
        document.execCommand(format, false, value);
      }
      
      updateToolbarState();
      editor.focus();
    });
  });
  
  // Font family select - preserve selection
  if (fontFamilySelect) {
    fontFamilySelect.addEventListener('mousedown', saveSelection);
    fontFamilySelect.addEventListener('change', () => {
      restoreSelection();
      const value = fontFamilySelect.value;
      if (value) {
        document.execCommand('fontName', false, value);
      }
      fontFamilySelect.value = '';
      editor.focus();
    });
  }
  
  // Font size select
  if (fontSizeSelect) {
    fontSizeSelect.addEventListener('mousedown', saveSelection);
    fontSizeSelect.addEventListener('change', () => {
      restoreSelection();
      const value = fontSizeSelect.value;
      if (value) {
        const sizeMap = {
          '12px': '1', '14px': '2', '16px': '3', '18px': '4', '20px': '5', '24px': '6'
        };
        document.execCommand('fontSize', false, sizeMap[value] || '3');
      }
      fontSizeSelect.value = '';
      editor.focus();
    });
  }
  
  // Text color select
  if (textColorSelect) {
    textColorSelect.addEventListener('mousedown', saveSelection);
    textColorSelect.addEventListener('change', () => {
      restoreSelection();
      const value = textColorSelect.value;
      if (value) {
        document.execCommand('foreColor', false, value);
      }
      textColorSelect.value = '';
      editor.focus();
    });
  }
  
  // Keyboard shortcuts
  editor.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          document.execCommand('bold', false, null);
          updateToolbarState();
          break;
        case 'i':
          e.preventDefault();
          document.execCommand('italic', false, null);
          updateToolbarState();
          break;
        case 'u':
          e.preventDefault();
          document.execCommand('underline', false, null);
          updateToolbarState();
          break;
      }
    }
  });
  
  editor.addEventListener('input', updateToolbarState);
  editor.addEventListener('keyup', updateToolbarState);
  editor.addEventListener('click', updateToolbarState);
  
  function updateToolbarState() {
    toolbar.querySelectorAll('.toolbar-btn[data-format]').forEach(btn => {
      const format = btn.dataset.format;
      if (format === 'removeFormat') return;
      
      let isActive = false;
      if (format === 'heading') {
        isActive = document.queryCommandValue('formatBlock').toLowerCase() === 'h2';
      } else if (format === 'blockquote') {
        isActive = document.queryCommandValue('formatBlock').toLowerCase() === 'blockquote';
      } else {
        isActive = document.queryCommandState(format);
      }
      
      btn.classList.toggle('active', isActive);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initNoticeToolbar();
});

// ===========================================
// SCROLL UI
// ===========================================
const topNav = document.getElementById('topNav');
const scrollProgress = document.getElementById('scrollProgress');
const backToTop = document.getElementById('backToTop');

function updateScrollUI() {
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const scrollPercent = scrollHeight > 0 ? scrollTop / scrollHeight : 0;
  
  if (scrollProgress) {
    scrollProgress.style.transform = `scaleX(${scrollPercent})`;
  }
  
  if (topNav) {
    topNav.classList.toggle('scrolled', scrollTop > 20);
  }
  
  if (backToTop) {
    backToTop.hidden = scrollTop < 300;
    backToTop.classList.toggle('visible', scrollTop >= 300);
  }
}

let scrollTicking = false;
window.addEventListener('scroll', () => {
  if (!scrollTicking) {
    requestAnimationFrame(() => {
      updateScrollUI();
      scrollTicking = false;
    });
    scrollTicking = true;
  }
}, { passive: true });

backToTop?.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ===========================================
// SCROLL REVEAL
// ===========================================
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
      revealObserver.unobserve(entry.target);
    }
  });
}, {
  root: null,
  rootMargin: '0px 0px -50px 0px',
  threshold: 0.1
});

function observeRevealElements() {
  document.querySelectorAll('.scroll-reveal:not(.revealed)').forEach(el => {
    revealObserver.observe(el);
  });
}

// ===========================================
// COUNTER ANIMATION
// ===========================================
function animateCounters() {
  document.querySelectorAll('.stat-number[data-count]').forEach(el => {
    if (el.dataset.animated === 'true' || el.dataset.observing === 'true') return;
    
    const target = parseInt(el.dataset.count, 10);
    const duration = 1500;
    const startTime = performance.now();
    
    function updateCounter(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(target * eased);
      el.textContent = current.toLocaleString();
      
      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      } else {
        el.textContent = target.toLocaleString();
        el.dataset.animated = 'true';
      }
    }
    
    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          requestAnimationFrame(updateCounter);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    
    el.dataset.observing = 'true';
    counterObserver.observe(el);
  });
}

// ===========================================
// KEYBOARD NAVIGATION
// ===========================================
document.addEventListener('keydown', (e) => {
  if (e.target.closest('.nav-tabs')) {
    const tabs = Array.from(document.querySelectorAll('.nav-tab'));
    const currentIndex = tabs.findIndex(t => t.classList.contains('active'));
    let nextIndex = currentIndex;
    
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % tabs.length;
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      e.preventDefault();
    } else if (e.key === 'Home') {
      nextIndex = 0;
      e.preventDefault();
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
      e.preventDefault();
    }
    
    if (nextIndex !== currentIndex) {
      tabs[nextIndex].focus();
      switchTab(tabs[nextIndex].dataset.tab);
    }
  }
});

// ===========================================
// GLOBAL ESCAPE HANDLER (single consolidated listener)
// ===========================================
function handleGlobalEscape(e) {
  if (e.key !== 'Escape') return;
  
  // 1. Close open modals (baoEditModal, baoViewModal, classModal, loginPage)
  const baoEdit = document.getElementById("baoEditModal");
  const baoView = document.getElementById("baoViewModal");
  const classModalEl = document.getElementById("classModal");
  const loginPageEl = document.getElementById("loginPage");
  
  if (baoEdit && baoEdit.classList.contains("visible")) { closeBaoEditor(); return; }
  if (baoView && baoView.classList.contains("visible")) { closeBaoView(); return; }
  if (classModalEl && classModalEl.classList.contains("visible")) { closeClassModal(); return; }
  if (loginPageEl && !loginPageEl.classList.contains("hidden")) { hideLoginPage(); publicBrowsing = true; return; }
  
  // 2. Close class dropdown or random winner popup
  const dropdownMenu = document.getElementById("classDropdownMenu");
  if (dropdownMenu && !dropdownMenu.classList.contains("hidden")) { closeDropdown(); return; }
  const winnerPopup = document.getElementById("randomWinner");
  if (winnerPopup && winnerPopup.classList.contains("show")) { closeRandomWinner(); return; }
  
  // 3. Cancel tap-to-assign selection
  if (tapSelectedStudent) { clearTapSelection(); renderAll(); return; }
  
  // 4. Nothing open — switch to home (or about if not logged in)
  if (currentTab !== 'home' && currentTab !== 'about') {
    if (!isAdmin && !isGuest) {
      switchTab('about');
    } else {
      switchTab('home');
      document.querySelector('.nav-tab[data-tab="home"]')?.focus();
    }
  }
}
document.addEventListener('keydown', handleGlobalEscape);

// ===========================================
// INITIALIZATION
// ===========================================
document.addEventListener('DOMContentLoaded', () => {
  observeRevealElements();
  animateCounters();
  updateScrollUI();
  
  // Fallback: ensure scroll-reveal elements become visible after 2s
  setTimeout(() => {
    document.querySelectorAll('.scroll-reveal:not(.revealed)').forEach(el => {
      el.classList.add('revealed');
    });
  }, 2000);
  
  // Restore the correct tab from URL hash.
  // Public tabs switch immediately; pendingHashTab is kept so onAuthStateChanged
  // can still route authenticated users, and is cleared in the no-session branch.
  const publicTabs = ['about', 'request'];
  if (pendingHashTab && publicTabs.includes(pendingHashTab) && pendingHashTab !== currentTab) {
    switchTab(pendingHashTab);
  }
});