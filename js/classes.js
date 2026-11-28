import { state } from './state.js';
import {
  db, ref, set, get, push, remove, query, orderByChild, onValue,
  classesRef, currentClassRef
} from './firebase.js';
import { toArray, normalizeSchedule, escapeHtml, showToast } from './utils.js';
import { createNewWeekHeaders } from './constants.js';
import { getDefaultClassData } from './state.js';
import { renderAll, renderClassSelector, loadClassData, switchClass, clearTapSelection, saveCurrentClassId } from './ui-common.js';

function loadClassesFromFirebase() {
  if (state.classesListListener) {
    state.classesListListener();
    state.classesListListener = null;
  }
  
  const classesMetaRef = query(classesRef, orderByChild('createdAt'));
  
  state.classesListListener = onValue(classesMetaRef, (snapshot) => {
    const val = snapshot.val();
    if (val) {
      // Preserve detailed data - prefer freshly loaded snapshot data, fall back to existing
      const nextClasses = {};
      Object.entries(val).forEach(([id, data]) => {
        const existing = state.classesData[id] || {};
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
      state.classesData = nextClasses;
      
      const statusEl = document.getElementById("syncStatus");
      if (statusEl) {
        statusEl.textContent = "● Đã đồng bộ trực tuyến";
        statusEl.className = "sync-status";
      }
      
      get(currentClassRef).then((snap) => {
        const savedLocalId = localStorage.getItem("selectedClassId");
        let targetId = null;

        if (!state.isAdmin && savedLocalId && state.classesData[savedLocalId]) {
          targetId = savedLocalId;
        } else if (snap.exists() && state.classesData[snap.val()]) {
          targetId = snap.val();
        } else {
          targetId = Object.keys(state.classesData)[0] || null;
        }

        if (state.isAdmin && state.currentClassId && state.classesData[state.currentClassId]) {
          renderClassSelector();
          renderClassList();
        } else if (targetId && targetId !== state.currentClassId) {
          state.currentClassId = targetId;
          loadSingleClass(state.currentClassId);
        } else if (!targetId) {
          state.currentClassId = null;
          renderAll();
        } else {
          renderClassSelector();
          renderClassList();
        }
      });
    } else {
      // No classes left - cleanup any active class listener
      if (state.currentClassListener) { state.currentClassListener(); state.currentClassListener = null; }
      state.classesData = {};
      state.currentClassId = null;
      state.currentClassData = getDefaultClassData();
      renderAll();
    }
  }, (error) => {
    const statusEl = document.getElementById("syncStatus");
    statusEl.textContent = "● Lỗi kết nối Firebase: " + error.message;
    statusEl.className = "sync-status error";
  });
}

function loadSingleClass(classId) {
  if (state.currentClassListener) {
    state.currentClassListener();
  }
  
  const classRef = ref(db, `trucNhatLop/classes/${classId}`);
  state.currentClassListener = onValue(classRef, (snapshot) => {
    const val = snapshot.val();
    if (val && state.classesData[classId]) {
      // Normalize fields explicitly so deleted empty branches ({}/[]) don't
      // resurrect stale data from the previous state.classesData entry.
      const normalizedStudents = toArray(val.students);
      const normalizedSched = normalizeSchedule(val.schedule);
      state.classesData[classId] = {
        ...state.classesData[classId],
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
  } else if (mode === "rename" && classId && state.classesData[classId]) {
    title.textContent = "Đổi tên lớp";
    newNameInput.closest(".form-group").style.display = "none";
    renameGroup.style.display = "block";
    renameInput.value = state.classesData[classId].name;
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
  } else if (mode === "rename" && classId && state.classesData[classId]) {
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
  if (!state.isAdmin) return;
  
  const newClassData = {
    name: name,
    students: [...toArray(state.currentClassData.students)],
    schedule: JSON.parse(JSON.stringify(normalizeSchedule(state.currentClassData.schedule))),
    weekHeaders: [...toArray(state.currentClassData.weekHeaders)],
    notice: state.currentClassData.notice,
    createdAt: Date.now()
  };
  
  const newClassRef = push(classesRef);
  const newClassId = newClassRef.key;
  
  set(newClassRef, newClassData).then(() => {
    state.classesData[newClassId] = newClassData;
    state.currentClassId = newClassId;
    saveCurrentClassId();
    loadSingleClass(newClassId);
  }).catch(() => {
    showToast("Không thể tạo lớp mới!", "error");
  });
}

function renameClass(classId, newName) {
  if (!state.isAdmin || !state.classesData[classId]) return;
  
  state.classesData[classId].name = newName;
  update(ref(db, `trucNhatLop/classes/${classId}`), { name: newName })
    .then(() => {
      renderClassSelector();
      if (classId === state.currentClassId) {
        renderAll();
      }
    })
    .catch(() => {
      showToast("Không thể đổi tên lớp!", "error");
    });
}

function deleteClass(classId) {
  if (!state.isAdmin || !state.classesData[classId]) return;
  
  if (!confirm(`Xóa lớp "${state.classesData[classId].name}"? Hành động này không thể hoàn tác.`)) return;
  
  const classRef = ref(db, `trucNhatLop/classes/${classId}`);
  remove(classRef).then(() => {
    delete state.classesData[classId];
    
    if (state.currentClassId === classId) {
      const remainingIds = Object.keys(state.classesData);
      if (remainingIds.length > 0) {
        state.currentClassId = remainingIds[0];
        loadSingleClass(state.currentClassId);
      } else {
        // Last class deleted — cancel any active listener on the removed node
        if (state.currentClassListener) { state.currentClassListener(); state.currentClassListener = null; }
        state.currentClassId = null;
        state.currentClassData = getDefaultClassData();
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
  
  const classIds = Object.keys(state.classesData);
  
  if (classIds.length === 0) {
    if (emptyState) emptyState.style.display = "block";
    container.innerHTML = '<p class="text-sm text-slate-500 text-center py-4" id="emptyClassState">Chưa có lớp nào. Tạo lớp đầu tiên!</p>';
    return;
  }
  
  if (emptyState) emptyState.style.display = "none";
  
  container.innerHTML = "";
  classIds.forEach(id => {
    const cls = state.classesData[id];
    const totalStudents = Array.isArray(cls.students) ? cls.students.length : (cls.studentsCount || 0);
    const totalAssigned = cls.schedule
      ? Object.values(cls.schedule).filter(arr => toArray(arr).length > 0).length
      : (cls.assignedCount || 0);
    const item = document.createElement("div");
    item.className = `class-list-item ${id === state.currentClassId ? "current" : ""}`;
    item.innerHTML = `
      <div class="class-info">
        <div class="class-avatar">${escapeHtml(cls.name).charAt(0).toUpperCase()}</div>
        <div class="class-details">
          <span class="class-name">${escapeHtml(cls.name)}</span>
          <span class="class-meta">${totalStudents} học sinh • ${totalAssigned} ô đã phân công</span>
        </div>
        ${id === state.currentClassId ? '<span class="current-badge">Đang xem</span>' : ''}
      </div>
      <div class="class-actions">
        <button type="button" class="class-action-btn" data-action="select" data-class-id="${id}" aria-label="Chọn lớp này" ${id === state.currentClassId ? "disabled" : ""}>
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



export {
  loadClassesFromFirebase,
  loadSingleClass,
  openClassModal,
  closeClassModal,
  confirmClassModal,
  addNewClass,
  renameClass,
  deleteClass,
  renderClassList
};
