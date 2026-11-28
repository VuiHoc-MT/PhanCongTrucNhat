import { state } from './state.js';
import { db, ref, set, update } from './firebase.js';
import { showToast } from './utils.js';

function updateClassFields(classId, fields) {
  if (!state.isAdmin || !classId) return;
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
  if (!state.isAdmin || !state.currentClassId) return;
  const statusEl = document.getElementById("syncStatus");
  statusEl.textContent = "● Đang lưu...";
  statusEl.className = "sync-status syncing";
  const arr = state.currentClassData.schedule[cellKey];
  set(ref(db, `trucNhatLop/classes/${state.currentClassId}/schedule/${cellKey}`),
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

export { updateClassFields, saveCellToCloud };
