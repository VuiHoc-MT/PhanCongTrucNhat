import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, update, get, onValue, push, remove, query, orderByChild } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const classesRef = ref(db, "trucNhatLop/classes");
const currentClassRef = ref(db, "trucNhatLop/currentClassId");
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let isAdmin = false;
let currentUser = null;
let classesData = {}; // { classId: { name, createdAt, students?, schedule?, weekHeaders?, notice? } }
let currentClassId = null;
let currentClassData = {
  students: [],
  schedule: {},
  weekHeaders: weekHeaders,
  notice: "Chưa có thông tin báo bài mới."
};
let currentClassListener = null; // Track active listener for cleanup

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
  updateStudentCount();
}

function updateStudentPool() {
  const pool = document.getElementById("studentPool");
  if (pool) {
    pool.innerHTML = "";
    currentClassData.students.forEach((name) => {
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

function updateStudentCount() {
  const countEl = document.getElementById("studentCount");
  if (countEl) {
    countEl.textContent = `${currentClassData.students.length} học sinh`;
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
  
  // Set current class name
  if (currentClassId && classesData[currentClassId]) {
    nameEl.textContent = classesData[currentClassId].name;
  } else if (classIds.length > 0) {
    // Auto-select first class if none selected
    currentClassId = classIds[0];
    loadClassData(currentClassId);
    nameEl.textContent = classesData[currentClassId].name;
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
  saveCurrentClassId();
  loadSingleClass(classId);
  renderClassSelector();
  closeDropdown();
}

function loadClassData(classId) {
  const cls = classesData[classId];
  if (cls) {
    currentClassData.students = cls.students || [];
    currentClassData.schedule = cls.schedule || {};
    currentClassData.weekHeaders = cls.weekHeaders || createNewWeekHeaders();
    currentClassData.notice = cls.notice || "Chưa có thông tin báo bài mới.";
    
    // Update student input textarea (admin panel)
    const studentInput = document.getElementById("studentInput");
    if (studentInput) {
      studentInput.value = currentClassData.students.join("\n");
    }
  }
}

function saveCurrentClassId() {
  if (currentClassId) {
    set(currentClassRef, currentClassId).catch(() => {});
  }
}

// Dropdown handlers
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

function saveClassToFirebase(classId, data) {
  if (!isAdmin) return;
  const statusEl = document.getElementById("syncStatus");
  statusEl.textContent = "● Đang lưu...";
  statusEl.className = "sync-status syncing";
  
  const classRef = ref(db, `trucNhatLop/classes/${classId}`);
  set(classRef, {
    name: data.name,
    students: data.students,
    schedule: data.schedule,
    weekHeaders: data.weekHeaders,
    notice: data.notice,
    createdAt: data.createdAt
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
    // Use currentClassData (full data) for saving, only update name from classesData
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

function saveToCloud() {
  if (!isAdmin || !currentClassId) return;
  saveCurrentClassData();
}

window.loginWithGoogle = () => {
  signInWithPopup(auth, provider).catch((error) => {
    alert("Đăng nhập thất bại: " + error.message);
  });
};

window.logoutAdmin = () => {
  signOut(auth);
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      currentUser = user;
      const [dbAdminRes, coreAdminRes] = await Promise.allSettled([
        get(ref(db, "admins/" + user.uid)),
        get(ref(db, "coreAdmins/" + user.uid))
      ]);
      
      const isDbAdmin = dbAdminRes.status === "fulfilled" && dbAdminRes.value.exists() && dbAdminRes.value.val() === true;
      const isCoreAdmin = coreAdminRes.status === "fulfilled";
      
      if (isDbAdmin || isCoreAdmin) {
        isAdmin = true;
        document.getElementById("adminSidebar").classList.remove("hidden");
        document.getElementById("adminToolbar").classList.remove("hidden");
        document.getElementById("logoutBtn").classList.remove("hidden");
        document.getElementById("loginBtn").classList.add("hidden");
        document.getElementById("mainLayout").classList.remove("layout-grid--guest");
        const roleBadge = document.getElementById("roleBadge");
        roleBadge.textContent = "Admin: " + user.email;
        roleBadge.className = "role-badge admin";
        
        // Show admin notice elements
        const saveNoticeBtn = document.getElementById("saveNoticeBtn");
        const noticeInput = document.getElementById("noticeInput");
        const noticeDisplay = document.getElementById("noticeDisplay");
        if (saveNoticeBtn && noticeInput && noticeDisplay) {
          saveNoticeBtn.classList.remove("hidden");
          noticeInput.classList.remove("hidden");
          noticeDisplay.classList.add("hidden");
        }
        
        // Show class selector immediately
        renderClassSelector();
        
        // Load classes from Firebase
        loadClassesFromFirebase();
      } else {
        isAdmin = false;
        alert("Tài khoản " + user.email + " không có quyền Admin! Bạn chỉ có thể xem lịch.");
        signOut(auth);
      }
    } catch (error) {
      isAdmin = false;
      alert("Lỗi kết nối khi kiểm tra quyền Admin!");
      signOut(auth);
    }
  } else {
    // Cleanup listener khi logout
    if (currentClassListener) {
      currentClassListener();
      currentClassListener = null;
    }
    
    currentUser = null;
    isAdmin = false;
    classesData = {};
    currentClassId = null;
    currentClassData = getDefaultClassData();
    
    document.getElementById("adminSidebar").classList.add("hidden");
    document.getElementById("adminToolbar").classList.add("hidden");
    document.getElementById("logoutBtn").classList.add("hidden");
    document.getElementById("loginBtn").classList.remove("hidden");
    document.getElementById("mainLayout").classList.add("layout-grid--guest");
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
    
    // Load classes for guests too (read-only)
    loadClassesFromFirebase();
    
    renderAll();
  }
});

// Initial render for immediate UI (before auth resolves)
renderAll();

function loadClassesFromFirebase() {
  // 1. Chỉ load metadata (name, createdAt) - nhẹ, nhanh
  const classesMetaRef = query(classesRef, orderByChild('createdAt'));
  
  onValue(classesMetaRef, (snapshot) => {
    const val = snapshot.val();
    if (val) {
      // Chỉ lưu metadata để hiển thị dropdown
      classesData = {};
      Object.entries(val).forEach(([id, data]) => {
        classesData[id] = { 
          name: data.name, 
          createdAt: data.createdAt 
        };
      });
      
      // 2. Load currentClassId song song
      get(currentClassRef).then((snap) => {
        if (snap.exists() && classesData[snap.val()]) {
          currentClassId = snap.val();
        } else {
          currentClassId = Object.keys(classesData)[0] || null;
        }
        
        // 3. Chỉ load FULL data của lớp hiện tại
        if (currentClassId) {
          loadSingleClass(currentClassId);
        } else {
          renderAll();
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

// Load full data cho 1 lớp duy nhất (realtime)
function loadSingleClass(classId) {
  // Cleanup listener cũ
  if (currentClassListener) {
    currentClassListener();
  }
  
  const classRef = ref(db, `trucNhatLop/classes/${classId}`);
  currentClassListener = onValue(classRef, (snapshot) => {
    const val = snapshot.val();
    if (val && classesData[classId]) {
      // Merge metadata + full data
      classesData[classId] = { ...classesData[classId], ...val };
      loadClassData(classId);
      renderAll();
    }
  }, (error) => {
    const statusEl = document.getElementById("syncStatus");
    statusEl.textContent = "● Lỗi tải lớp: " + error.message;
    statusEl.className = "sync-status error";
  });
}

// Class Management Modal
let modalMode = null; // 'add' | 'rename'
let modalTargetClassId = null;

function openClassModal(mode, classId = null) {
  const modal = document.getElementById("classModal");
  const title = document.getElementById("classModalTitle");
  const newNameInput = document.getElementById("newClassNameInput");
  const renameGroup = document.getElementById("renameClassGroup");
  const renameInput = document.getElementById("renameClassInput");
  const confirmBtn = document.getElementById("classModalConfirm");
  
  modalMode = mode;
  modalTargetClassId = classId;
  
  if (mode === "add") {
    title.textContent = "Thêm lớp mới (nhân bản)";
    newNameInput.value = "";
    newNameInput.placeholder = "VD: 12A1, 11B2...";
    renameGroup.style.display = "none";
    confirmBtn.textContent = "Tạo lớp";
  } else if (mode === "rename" && classId && classesData[classId]) {
    title.textContent = "Đổi tên lớp";
    newNameInput.value = "";
    renameGroup.style.display = "block";
    renameInput.value = classesData[classId].name;
    renameInput.placeholder = "Nhập tên mới";
    confirmBtn.textContent = "Lưu thay đổi";
  }
  
  modal.hidden = false;
  // Force reflow for animation
  modal.offsetHeight;
  modal.classList.add("visible");
  newNameInput.focus();
}

function closeClassModal() {
  const modal = document.getElementById("classModal");
  modal.classList.remove("visible");
  setTimeout(() => {
    modal.hidden = true;
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
  
  // Clone current class data
  const newClassData = {
    name: name,
    students: [...currentClassData.students],
    schedule: JSON.parse(JSON.stringify(currentClassData.schedule)),
    weekHeaders: [...currentClassData.weekHeaders],
    notice: currentClassData.notice,
    createdAt: Date.now()
  };
  
  // Push to Firebase to get new ID
  const newClassRef = push(classesRef);
  const newClassId = newClassRef.key;
  
  set(newClassRef, newClassData).then(() => {
    classesData[newClassId] = newClassData;
    currentClassId = newClassId;
    loadClassData(newClassId);
    saveCurrentClassId();
    renderAll();
  }).catch(() => {
    alert("Không thể tạo lớp mới!");
  });
}

function renameClass(classId, newName) {
  if (!isAdmin || !classesData[classId]) return;
  
  const cls = classesData[classId];
  // Get full data for saving - use currentClassData if it's the current class
  const fullData = {
    name: newName,
    students: (classId === currentClassId) ? currentClassData.students : (cls.students || []),
    schedule: (classId === currentClassId) ? currentClassData.schedule : (cls.schedule || {}),
    weekHeaders: (classId === currentClassId) ? currentClassData.weekHeaders : (cls.weekHeaders || []),
    notice: (classId === currentClassId) ? currentClassData.notice : (cls.notice || ""),
    createdAt: cls.createdAt
  };
  
  classesData[classId].name = newName;
  saveClassToFirebase(classId, fullData);
  
  if (classId === currentClassId) {
    renderAll();
  } else {
    renderClassSelector();
  }
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
    const item = document.createElement("div");
    item.className = `class-list-item ${id === currentClassId ? "current" : ""}`;
    item.innerHTML = `
      <div class="class-info">
        <div class="class-avatar">${escapeHtml(cls.name).charAt(0).toUpperCase()}</div>
        <div class="class-details">
          <span class="class-name">${escapeHtml(cls.name)}</span>
          <span class="class-meta">${(cls.students || []).length} học sinh • ${Object.keys(cls.schedule || {}).length} ô đã phân công</span>
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
  
  // Add event listeners
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

window.updateStudentList = () => {
  if (!isAdmin || !currentClassId) return;
  const raw = document.getElementById("studentInput").value;
  currentClassData.students = raw.split("\n").map(s => s.trim()).filter(Boolean);
  classesData[currentClassId].students = currentClassData.students;
  renderAll();
  saveCurrentClassData();
};

window.autoAssignRandom = () => {
  if (!isAdmin || !currentClassId || currentClassData.students.length === 0) return;
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
  if (!isAdmin || !currentClassId) return;
  currentClassData.schedule = {};
  classesData[currentClassId].schedule = {};
  renderAll();
  saveCurrentClassData();
};

window.saveClassNotice = () => {
  if (!isAdmin || !currentClassId) return;
  const content = document.getElementById("noticeInput").value.trim();
  currentClassData.notice = content || "Chưa có thông tin báo bài mới.";
  classesData[currentClassId].notice = currentClassData.notice;
  renderAll();
  saveCurrentClassData();
};

window.startNewCycle = () => {
  if (!isAdmin || !currentClassId) return;
  if (!confirm("Bạn có chắc muốn xóa bảng hiện tại và cập nhật 6 tuần mới bắt đầu từ tuần này không?")) return;

  currentClassData.weekHeaders = createNewWeekHeaders();
  currentClassData.schedule = {};
  classesData[currentClassId].weekHeaders = currentClassData.weekHeaders;
  classesData[currentClassId].schedule = {};

  renderAll();
  saveCurrentClassData();
};

window.removeStudentFromCell = (cellKey, studentIndex) => {
  if (!isAdmin || !currentClassId || !currentClassData.schedule[cellKey]) return;
  currentClassData.schedule[cellKey].splice(studentIndex, 1);
  classesData[currentClassId].schedule = currentClassData.schedule;
  renderAll();
  saveCellToCloud(cellKey);
};

function renderSchedule() {
  const tbody = document.getElementById("scheduleBody");
  const trHeader = document.getElementById("tableHeader");

  while (trHeader.children.length > 1) {
    trHeader.removeChild(trHeader.lastChild);
  }

  currentClassData.weekHeaders.forEach(weekStr => {
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

      if (isAdmin) {
        td.ondragover = (e) => { e.preventDefault(); td.classList.add("drag-over"); };
        td.ondragleave = () => td.classList.remove("drag-over");
        td.ondrop = (e) => {
          e.preventDefault();
          td.classList.remove("drag-over");

          let payload;
          try {
            payload = JSON.parse(e.dataTransfer.getData("text/plain"));
          } catch (err) {
            return;
          }
        
          if (!payload || !payload.name) return;
        
          if (payload.fromCell !== null && currentClassData.schedule[payload.fromCell]) {
            currentClassData.schedule[payload.fromCell].splice(payload.fromIdx, 1);
            saveCellToCloud(payload.fromCell);
          }
          if (!currentClassData.schedule[cellKey]) currentClassData.schedule[cellKey] = [];
          currentClassData.schedule[cellKey].push(payload.name);
          classesData[currentClassId].schedule = currentClassData.schedule;

          renderAll();
          saveCellToCloud(cellKey);
        };
      }

      const assigned = currentClassData.schedule[cellKey] || [];
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

function renderNotice() {
  const noticeDisplay = document.getElementById("noticeDisplay");
  const noticeInput = document.getElementById("noticeInput");
  if (noticeDisplay) {
    noticeDisplay.textContent = currentClassData.notice || "Chưa có thông tin báo bài mới.";
  }
  if (noticeInput && isAdmin) {
    noticeInput.value = currentClassData.notice || "";
  }
}

// ===========================================
// NAVIGATION & SCROLL ANIMATIONS
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
      panel.setAttribute('tabindex', '0');
      panel.focus({ preventScroll: true });
    } else {
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

// Class selector dropdown events
document.addEventListener('DOMContentLoaded', () => {
  const dropdownBtn = document.getElementById("classDropdownBtn");
  const dropdownMenu = document.getElementById("classDropdownMenu");
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
      openClassModal("add");
    });
  }
  
  if (modalClose) modalClose.addEventListener('click', closeClassModal);
  if (modalCancel) modalCancel.addEventListener('click', closeClassModal);
  if (modalConfirm) modalConfirm.addEventListener('click', confirmClassModal);
  
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeClassModal();
    });
  }
  
  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById("classSelector");
    const menu = document.getElementById("classDropdownMenu");
    const btn = document.getElementById("classDropdownBtn");
    if (dropdown && menu && btn && !dropdown.contains(e.target)) {
      closeDropdown();
    }
  });
  
  // Escape key to close modal/dropdown
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeClassModal();
      closeDropdown();
    }
  });
});

// ===========================================
// SCROLL PROGRESS & NAV SHADOW
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
// SCROLL REVEAL (IntersectionObserver)
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
  }
});

window.addEventListener('hashchange', () => {
  if (window.location.hash === '#about') {
    switchTab('about');
  } else if (window.location.hash === '#home' || window.location.hash === '') {
    switchTab('home');
  }
});