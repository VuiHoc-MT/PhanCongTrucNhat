import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, update, get, onValue, push, remove, query, orderByChild } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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
  
    if (start.getFullYear() !== end.getFullYear()) {
      header.push(`${start.getDate()}/${start.getMonth() + 1}/${start.getFullYear()} - ${end.getDate()}/${end.getMonth() + 1}/${end.getFullYear()}`);
    } else {
      header.push(`${start.getDate()}/${start.getMonth() + 1} - ${end.getDate()}/${end.getMonth() + 1}`);
    }
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
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') {
    return Object.keys(val)
      .sort((a, b) => Number(a) - Number(b))
      .map(key => val[key]);
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

// ===========================================
// FIREBASE INIT
// ===========================================

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const classesRef = ref(db, "trucNhatLop/classes");
const currentClassRef = ref(db, "trucNhatLop/currentClassId");
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let isAdmin = false;
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
let isLoadingClass = false;
let tapSelectedStudent = null; // Name of student selected for tap-to-assign (mobile)

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
  updateStudentPool();
  updateStudentDragList();
  updateStudentCount();
}

function updateStudentPool() {
  const pool = document.getElementById("studentPool");
  if (pool) {
    pool.innerHTML = "";
    const students = toArray(currentClassData.students);
    students.forEach((name) => {
      const chip = document.createElement("div");
      chip.textContent = name;
      chip.className = "student-chip";
      chip.setAttribute("role", "listitem");
      chip.draggable = isAdmin;
      chip.ondragstart = (e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify({ name, fromCell: null, fromIdx: null }));
        chip.classList.add("dragging");
      };
      chip.ondragend = () => chip.classList.remove("dragging");
      pool.appendChild(chip);
    });
  }
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
        // Remove tap-ready highlights from cells
        document.querySelectorAll('.cell.tap-ready').forEach(cell => cell.classList.remove('tap-ready'));
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
        
        // On mobile, auto-collapse admin panel to reveal the schedule
        if (window.matchMedia('(max-width: 768px)').matches) {
          collapseAdminPanelForMobile();
        }
      }
    };
    
    list.appendChild(item);
  });
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
  
  isLoadingClass = true;
  currentClassId = classId;
  clearTapSelection();
  
  // Load data immediately for smooth transition (no blank flash since data is preserved)
  loadClassData(classId);
  renderAll();
  
  saveCurrentClassId();
  loadSingleClass(classId);
  renderClassSelector();
  closeDropdown();
  // isLoadingClass is released in loadSingleClass onValue callback
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
  const allowedAttrs = new Set(["href", "target", "rel", "color", "face", "size"]);

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
      });

      if (node.tagName === "A") {
        const href = (node.getAttribute("href") || "").trim();
        if (!/^(https?:|mailto:)/i.test(href)) {
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
function saveClassToFirebase(classId, data) {
  if (!isAdmin || !currentClassId) return;
  const statusEl = document.getElementById("syncStatus");
  statusEl.textContent = "● Đang lưu...";
  statusEl.className = "sync-status syncing";
  
  const classRef = ref(db, `trucNhatLop/classes/${classId}`);
  // Firebase rejects undefined values - provide fallbacks for every field
  set(classRef, {
    name: data.name || "",
    students: Array.isArray(data.students) ? data.students : [],
    schedule: (data.schedule && typeof data.schedule === "object") ? data.schedule : {},
    weekHeaders: Array.isArray(data.weekHeaders) && data.weekHeaders.length ? data.weekHeaders : createNewWeekHeaders(),
    notice: typeof data.notice === "string" && data.notice ? data.notice : "Chưa có thông tin báo bài mới.",
    createdAt: data.createdAt || Date.now()
  }).then(() => {
    statusEl.textContent = "● Đã đồng bộ trực tuyến";
    statusEl.className = "sync-status";
  }).catch(() => {
    alert("Không có quyền ghi hoặc dữ liệu không hợp lệ!");
    statusEl.className = "sync-status error";
  });
}

function saveCurrentClassData() {
  if (!isAdmin || !currentClassId) return;
  const cls = classesData[currentClassId];
  if (cls) {
    const fullData = {
      name: cls.name,
      students: currentClassData.students,
      schedule: currentClassData.schedule,
      weekHeaders: currentClassData.weekHeaders,
      notice: currentClassData.notice,
      createdAt: cls.createdAt
    };
    saveClassToFirebase(currentClassId, fullData);
  }
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
      alert("Không có quyền ghi hoặc dữ liệu không hợp lệ!");
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
      alert("Đăng nhập thất bại: " + error.message);
    }
  }
};

window.logoutAdmin = () => {
  signOut(auth);
};

// Check for redirect result on page load
getRedirectResult(auth).catch(() => {});

const ADMIN_EMAIL = "";

window.submitAdminRequest = () => {
  const input = document.getElementById("requestEmail");
  if (!input) return;
  const email = input.value.trim();
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRe.test(email)) {
    alert("Vui lòng nhập email hợp lệ.");
    input.focus();
    return;
  }
  if (ADMIN_EMAIL) {
    const subject = encodeURIComponent("Yêu cầu ủy quyền Admin - " + email);
    const body = encodeURIComponent(
      "Tôi là " + email + " xin được cấp quyền admin cho ứng dụng Phân công trực nhật lớp."
    );
    window.location.href = `mailto:${ADMIN_EMAIL}?subject=${subject}&body=${body}`;
  } else {
    alert(
      "Chức năng gửi email đang được hoàn thiện. Vui lòng liên hệ chủ web (PMT) qua GitHub:\nhttps://github.com/VuiHoc-MT/phancongtrucnhat/"
    );
  }
};

// ===========================================
// AUTH STATE
// ===========================================
onAuthStateChanged(auth, async (user) => {
  const seq = ++authCheckSeq;
  
  if (user) {
    try {
      currentUser = user;
      
      // Only check admins/${user.uid} - no coreAdminCheck vulnerability
      const dbAdminRes = await get(ref(db, "admins/" + user.uid));
      
      // Check if this is still the latest auth check
      if (seq !== authCheckSeq) return;
      
      const isDbAdmin = dbAdminRes.exists() && dbAdminRes.val() === true;
      
      if (isDbAdmin) {
        isAdmin = true;
        const adminPanel = document.getElementById("adminPanel");
        if (adminPanel) {
          adminPanel.hidden = false;
          adminPanel.classList.add("is-open");
          adminPanel.inert = false;
        }
        const adminPanelToggle = document.getElementById("adminPanelToggle");
        const adminPanelOpenBtn = document.getElementById("adminPanelOpenBtn");
        if (adminPanelToggle) {
          adminPanelToggle.setAttribute("aria-expanded", "true");
          adminPanelToggle.setAttribute("aria-label", "Đóng bảng điều khiển");
        }
        if (adminPanelOpenBtn) {
          adminPanelOpenBtn.classList.remove("hidden");
        }
        document.getElementById("adminToolbar").classList.remove("hidden");
        document.getElementById("logoutBtn").classList.remove("hidden");
        document.getElementById("loginBtn").classList.add("hidden");
        const roleBadge = document.getElementById("roleBadge");
        roleBadge.textContent = "Admin: " + user.email;
        roleBadge.className = "role-badge admin";
        
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
      } else {
        isAdmin = false;
        alert("Tài khoản " + user.email + " không có quyền Admin! Bạn chỉ có thể xem lịch.");
        signOut(auth);
      }
    } catch (error) {
      if (seq !== authCheckSeq) return;
      isAdmin = false;
      alert("Lỗi kết nối khi kiểm tra quyền Admin!");
      signOut(auth);
    }
  } else {
    // Cleanup
    if (currentClassListener) {
      currentClassListener();
      currentClassListener = null;
    }
    if (classesListListener) {
      classesListListener();
      classesListListener = null;
    }
    
    currentUser = null;
    isAdmin = false;
    classesData = {};
    currentClassId = null;
    currentClassData = getDefaultClassData();
    
    const adminPanel = document.getElementById("adminPanel");
    if (adminPanel) {
      adminPanel.classList.remove("is-open");
      adminPanel.hidden = true;
      adminPanel.inert = true;
    }
    const adminPanelToggle = document.getElementById("adminPanelToggle");
    const adminPanelOpenBtn = document.getElementById("adminPanelOpenBtn");
    if (adminPanelToggle) {
      adminPanelToggle.setAttribute("aria-expanded", "false");
      adminPanelToggle.setAttribute("aria-label", "Mở bảng điều khiển");
    }
    if (adminPanelOpenBtn) {
      adminPanelOpenBtn.classList.add("hidden");
    }
    document.getElementById("adminToolbar").classList.add("hidden");
    document.getElementById("logoutBtn").classList.add("hidden");
    document.getElementById("loginBtn").classList.remove("hidden");
    const roleBadge = document.getElementById("roleBadge");
    roleBadge.textContent = "Chế độ: Khách (Chỉ xem)";
    roleBadge.className = "role-badge guest";
  
    const saveNoticeBtn = document.getElementById("saveNoticeBtn");
    const noticeInput = document.getElementById("noticeInput");
    const noticeDisplay = document.getElementById("noticeDisplay");
    if (saveNoticeBtn && noticeInput && noticeDisplay) {
      saveNoticeBtn.classList.add("hidden");
      noticeInput.classList.add("hidden");
      noticeDisplay.classList.remove("hidden");
    }
    
    loadClassesFromFirebase();
    renderAll();
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
    // Release the switch lock now that realtime data has arrived
    isLoadingClass = false;
  }, (error) => {
    isLoadingClass = false;
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
      alert("Vui lòng nhập tên lớp");
      return;
    }
    addNewClass(name);
  } else if (modalMode === "rename" && modalTargetClassId) {
    const name = renameInput.value.trim();
    if (!name) {
      alert("Vui lòng nhập tên mới");
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
    alert("Không thể tạo lớp mới!");
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
      alert("Không thể đổi tên lớp!");
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
    alert("Không thể xóa lớp!");
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
    alert("Vui lòng tạo ít nhất 1 lớp trước khi thao tác!");
    return;
  }
  const raw = document.getElementById("studentInput").value;
  currentClassData.students = raw.split("\n").map(s => s.trim()).filter(Boolean);
  classesData[currentClassId].students = currentClassData.students;
  renderAll();
  saveCurrentClassData();
};

window.autoAssignRandom = () => {
  if (!isAdmin) return;
  if (!currentClassId) {
    alert("Vui lòng tạo ít nhất 1 lớp trước khi thao tác!");
    return;
  }
  if (currentClassData.students.length === 0) {
    alert("Danh sách học sinh đang trống! Vui lòng nhập danh sách học sinh trước.");
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
  saveCurrentClassData();
};

window.clearSchedule = () => {
  if (!isAdmin) return;
  if (!currentClassId) {
    alert("Vui lòng tạo ít nhất 1 lớp trước khi thao tác!");
    return;
  }
  currentClassData.schedule = {};
  classesData[currentClassId].schedule = {};
  renderAll();
  saveCurrentClassData();
};

window.saveClassNotice = () => {
  if (!isAdmin) return;
  if (!currentClassId) {
    alert("Vui lòng tạo ít nhất 1 lớp trước khi thao tác!");
    return;
  }
  const noticeInput = document.getElementById("noticeInput");
  const content = sanitizeNoticeHtml(noticeInput.innerHTML.trim());
  currentClassData.notice = content || "Chưa có thông tin báo bài mới.";
  classesData[currentClassId].notice = currentClassData.notice;
  renderAll();
  saveCurrentClassData();
};

window.startNewCycle = () => {
  if (!isAdmin) return;
  if (!currentClassId) {
    alert("Vui lòng tạo ít nhất 1 lớp trước khi thao tác!");
    return;
  }
  if (!confirm("Bạn có chắc muốn xóa bảng hiện tại và cập nhật 6 tuần mới bắt đầu từ tuần này không?")) return;

  currentClassData.weekHeaders = createNewWeekHeaders();
  currentClassData.schedule = {};
  classesData[currentClassId].weekHeaders = currentClassData.weekHeaders;
  classesData[currentClassId].schedule = {};

  renderAll();
  saveCurrentClassData();
};

window.removeStudentFromCell = (cellKey, studentIndex) => {
  if (!isAdmin || !currentClassId) return;
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
  headers.forEach(weekStr => {
    const th = document.createElement("th");
    th.className = "border border-slate-200 p-3 text-center";
    th.textContent = weekStr;
    th.scope = "col";
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

    DAYS.forEach((day) => {
      const cellKey = `${rIdx}_${day}`;
      const td = document.createElement("td");
      td.className = "cell border border-slate-200 p-2 align-top min-h-[72px] transition";
      td.setAttribute("role", "gridcell");
      td.dataset.cellKey = cellKey;
      
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
          if (!isAdmin || !currentClassId) return;

          let payload;
          try {
            payload = JSON.parse(e.dataTransfer.getData("text/plain"));
          } catch (err) {
            return;
          }
        
          if (!payload || !payload.name) return;
        
          if (payload.fromCell !== null && currentClassData.schedule[payload.fromCell]) {
            const fromArr = toArray(currentClassData.schedule[payload.fromCell]);
            fromArr.splice(payload.fromIdx, 1);
            currentClassData.schedule[payload.fromCell] = fromArr;
            saveCellToCloud(payload.fromCell);
          }
          if (!currentClassData.schedule[cellKey]) currentClassData.schedule[cellKey] = [];
          const toArr = toArray(currentClassData.schedule[cellKey]);
          toArr.push(payload.name);
          currentClassData.schedule[cellKey] = toArr;
          classesData[currentClassId].schedule = currentClassData.schedule;

          renderAll();
          saveCellToCloud(cellKey);
        };
        
        // Tap-to-assign: tap a cell to assign the currently selected student
        td.onclick = (e) => {
          if (!isAdmin || !currentClassId) return;
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
}

// ===========================================
// RENDER NOTICE
// ===========================================
function renderNotice() {
  const noticeDisplay = document.getElementById("noticeDisplay");
  const noticeInput = document.getElementById("noticeInput");
  const noticeToolbar = document.getElementById("noticeToolbar");
  
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
  } else if (noticeInput) {
    noticeInput.classList.add("hidden");
    if (noticeToolbar) noticeToolbar.classList.add("hidden");
  }
  
  if (noticeDisplay && isAdmin) {
    noticeDisplay.classList.add("hidden");
  } else if (noticeDisplay) {
    noticeDisplay.classList.remove("hidden");
  }
}

// ===========================================
// NAVIGATION
// ===========================================
let currentTab = 'home';

function switchTab(tabName) {
  if (tabName === currentTab) return;
  
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
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  setTimeout(() => {
    observeRevealElements();
    animateCounters();
  }, 50);
}

window.switchTab = switchTab;

document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.querySelector('.nav-brand').addEventListener('click', (e) => {
  e.preventDefault();
  switchTab('home');
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
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeClassModal();
      closeDropdown();
      clearTapSelection();
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
    if (el.dataset.animated === 'true') return;
    
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
  
  if (e.key === 'Escape' && currentTab !== 'home') {
    switchTab('home');
    document.querySelector('.nav-tab[data-tab="home"]').focus();
  }
});

// ===========================================
// INITIALIZATION
// ===========================================
document.addEventListener('DOMContentLoaded', () => {
  observeRevealElements();
  animateCounters();
  updateScrollUI();
  
  if (window.location.hash === '#about') {
    switchTab('about');
  } else if (window.location.hash === '#request') {
    switchTab('request');
  }
});