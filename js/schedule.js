import { state } from './state.js';
import { TASKS, DAYS } from './constants.js';
import { toArray, normalizeSchedule, escapeHtml, getCurrentWeekIndex, showToast } from './utils.js';
import { saveCellToCloud } from './firebase-save.js';
import { updateStudentDragList, clearTapSelection, renderAll } from './ui-common.js';
import { ensureWeekButterfly, stopWeekButterfly } from './butterfly.js';

function renderSchedule() {
  const tbody = document.getElementById("scheduleBody");
  const trHeader = document.getElementById("tableHeader");

  while (trHeader.children.length > 1) {
    trHeader.removeChild(trHeader.lastChild);
  }

  const headers = toArray(state.currentClassData.weekHeaders);
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
      if (state.isAdmin && state.tapSelectedStudent) {
        td.classList.add('tap-ready');
      }

      if (state.isAdmin) {
        td.ondragover = (e) => { e.preventDefault(); td.classList.add("drag-over"); };
        td.ondragleave = () => td.classList.remove("drag-over");
        td.ondrop = (e) => {
          e.preventDefault();
          td.classList.remove("drag-over");
          if (!state.isAdmin || !state.currentClassId || !state.classesData[state.currentClassId]) return;

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
        if (payload.fromCell !== null && state.currentClassData.schedule[payload.fromCell]) {
          const fromArr = toArray(state.currentClassData.schedule[payload.fromCell]);
          const removeIdx = fromArr.indexOf(payload.name);
          if (removeIdx !== -1) fromArr.splice(removeIdx, 1);
          scheduleUpdates[payload.fromCell] = fromArr.length ? fromArr : null;
          state.currentClassData.schedule[payload.fromCell] = fromArr;
        }
        
        // Add to destination cell
        if (!state.currentClassData.schedule[cellKey]) state.currentClassData.schedule[cellKey] = [];
        const toArr = toArray(state.currentClassData.schedule[cellKey]);
        toArr.push(payload.name);
        state.currentClassData.schedule[cellKey] = toArr;
        scheduleUpdates[cellKey] = toArr;
        
        state.classesData[state.currentClassId].schedule = state.currentClassData.schedule;
        
        renderAll();
        
        // Single atomic update to Firebase
        if (state.isAdmin && state.currentClassId) {
          const statusEl = document.getElementById("syncStatus");
          if (statusEl) { statusEl.textContent = "● Đang lưu..."; statusEl.className = "sync-status syncing"; }
          update(ref(db, `trucNhatLop/classes/${state.currentClassId}/schedule`), scheduleUpdates)
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
          if (!state.isAdmin || !state.currentClassId || !state.classesData[state.currentClassId]) return;
          if (e.target.closest('.assigned-tag') || e.target.closest('.tag-remove')) return;
          if (!state.tapSelectedStudent) return;
          
          const studentName = state.tapSelectedStudent;
          
          if (!state.currentClassData.schedule[cellKey]) state.currentClassData.schedule[cellKey] = [];
          const arr = toArray(state.currentClassData.schedule[cellKey]);
          arr.push(studentName);
          state.currentClassData.schedule[cellKey] = arr;
          state.classesData[state.currentClassId].schedule = state.currentClassData.schedule;
          
          renderAll();
          saveCellToCloud(cellKey);
          // Note: state.tapSelectedStudent is preserved so Admin can assign same student to multiple cells
        };
      }

      const assigned = toArray(state.currentClassData.schedule[cellKey] || []);
      const wrap = document.createElement("div");
      wrap.className = "cell-content";

      if (assigned.length === 0 && !state.isAdmin) {
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

        if (state.isAdmin) {
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



export { renderSchedule };
