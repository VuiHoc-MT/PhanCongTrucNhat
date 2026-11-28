import { state } from './state.js';
import { toArray, normalizeSchedule, escapeHtml, showToast } from './utils.js';
import { createNewWeekHeaders } from './constants.js';
import { db, ref, set, currentClassRef } from './firebase.js';

// We import renderers dynamically or from modules
import { renderSchedule } from './schedule.js';
import { renderNotice } from './notice.js';
import { renderRandomBoard } from './random.js';
import { renderBaoBaibai } from './bao.js';
import { renderClassList, loadSingleClass } from './classes.js';

export function markWeekButterflyDirty() {
  state.weekButterflyCache.dirty = true;
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
  if (randomPanel && randomPanel.classList.contains("active") && !state.randomSpinning) {
    renderRandomBoard();
  }
  // Refresh the báo bài on the Báo page when it is open
  renderBaoBaibai();
}

function updateStudentDragList() {
  const list = document.getElementById("studentDragList");
  if (!list) return;
  
  const usageCount = {};
  const schedule = normalizeSchedule(state.currentClassData.schedule);
  Object.values(schedule).forEach(arr => {
    toArray(arr).forEach(name => {
      usageCount[name] = (usageCount[name] || 0) + 1;
    });
  });
  
  list.innerHTML = "";
  const students = toArray(state.currentClassData.students);
  students.forEach((name, idx) => {
    const count = usageCount[name] || 0;
    const item = document.createElement("div");
    item.className = "student-drag-item";
    item.setAttribute("role", "listitem");
    item.draggable = state.isAdmin;
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
    if (state.tapSelectedStudent === name) {
      item.classList.add('selected');
      item.dataset.tapSelected = 'true';
    }
    
    // Tap-to-assign: tap to select/deselect, then tap a cell to assign
    item.onclick = () => {
      if (!state.isAdmin) return;
      
      if (state.tapSelectedStudent === name) {
        // Tapping the selected student again deselects
        state.tapSelectedStudent = null;
        item.classList.remove('selected');
        item.dataset.tapSelected = 'false';
        document.querySelectorAll('.cell.tap-ready').forEach(cell => cell.classList.remove('tap-ready'));
        hideTapNotifyBar();
      } else {
        // Select this student
        state.tapSelectedStudent = name;
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
  state.tapSelectedStudent = null;
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
    const students = toArray(state.currentClassData.students);
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
  
  const classIds = Object.keys(state.classesData);
  
  if (classIds.length === 0) {
    nameEl.textContent = "Chưa có lớp";
    list.innerHTML = '<div class="dropdown-item" style="justify-content: center; color: var(--text-muted); cursor: default;">Chưa có lớp nào</div>';
    if (addClassBtn) addClassBtn.style.display = state.isAdmin ? "flex" : "none";
    if (manageClassesBtn) manageClassesBtn.style.display = state.isAdmin ? "flex" : "none";
    selector.classList.remove("hidden");
    return;
  }
  
  // Set current class name - DON'T auto-select here
  if (state.currentClassId && state.classesData[state.currentClassId]) {
    nameEl.textContent = state.classesData[state.currentClassId].name;
  } else if (classIds.length > 0 && !state.currentClassId) {
    // Only set display name, don't auto-select (handled in loadClassesFromFirebase)
    nameEl.textContent = state.classesData[classIds[0]].name;
  }
  
  // Show/hide admin-only buttons
  if (addClassBtn) addClassBtn.style.display = state.isAdmin ? "flex" : "none";
  if (manageClassesBtn) manageClassesBtn.style.display = state.isAdmin ? "flex" : "none";
  
  selector.classList.remove("hidden");
  
  // Render class list
  list.innerHTML = "";
  classIds.forEach(id => {
    const cls = state.classesData[id];
    const item = document.createElement("button");
    item.type = "button";
    item.className = `dropdown-item ${id === state.currentClassId ? "active" : ""}`;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", id === state.currentClassId);
    item.innerHTML = `
      <span class="item-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
      </span>
      <span>${escapeHtml(cls.name)}</span>
      ${id === state.currentClassId ? '<span class="current-badge" style="margin-left: auto;">Đang xem</span>' : ''}
    `;
    item.onclick = () => switchClass(id);
    list.appendChild(item);
  });
}

function switchClass(classId) {
  if (classId === state.currentClassId) {
    closeDropdown();
    return;
  }
  
  state.currentClassId = classId;
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
  const cls = state.classesData[classId];
  if (cls) {
    state.currentClassData.students = toArray(cls.students);
    state.currentClassData.schedule = normalizeSchedule(cls.schedule);
    state.currentClassData.weekHeaders = toArray(cls.weekHeaders).length ? toArray(cls.weekHeaders) : createNewWeekHeaders();
    state.currentClassData.notice = cls.notice || "Chưa có thông tin báo bài mới.";
    
    const studentInput = document.getElementById("studentInput");
    if (studentInput) {
      studentInput.value = state.currentClassData.students.join("\n");
    }
  }
}

function saveCurrentClassId() {
  if (state.currentClassId) {
    localStorage.setItem("selectedClassId", state.currentClassId);
    if (state.isAdmin) {
      set(currentClassRef, state.currentClassId).catch(() => {});
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


export {
  renderAll,
  updateStudentDragList,
  showTapNotifyBar,
  hideTapNotifyBar,
  collapseAdminPanelForMobile,
  clearTapSelection,
  updateStudentCount,
  renderClassSelector,
  switchClass,
  loadClassData,
  saveCurrentClassId,
  closeDropdown,
  toggleDropdown
};
