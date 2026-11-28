import { state } from './state.js';
import { TASKS, createNewWeekHeaders } from './constants.js';
import { toArray, normalizeSchedule, showToast, sanitizeNoticeHtml } from './utils.js';
import { updateClassFields, saveCellToCloud } from './firebase-save.js';
import { renderAll, clearTapSelection } from './ui-common.js';
import { renderSchedule } from './schedule.js';

window.updateStudentList = () => {
  if (!state.isAdmin) return;
  if (!state.currentClassId) {
    showToast("Vui lòng tạo ít nhất 1 lớp trước khi thao tác!", "warning");
    return;
  }
  const raw = document.getElementById("studentInput").value;
  state.currentClassData.students = raw.split("\n").map(s => s.trim()).filter(Boolean);
  // Reset any tap-to-assign selection (student may have been removed)
  clearTapSelection();
  // Remove orphaned students from the schedule (students no longer in the list)
  const validNames = new Set(state.currentClassData.students);
  const schedule = normalizeSchedule(state.currentClassData.schedule);
  Object.keys(schedule).forEach(cellKey => {
    const filtered = schedule[cellKey].filter(n => validNames.has(n));
    if (filtered.length) {
      schedule[cellKey] = filtered;
    } else {
      delete schedule[cellKey];
    }
  });
  state.currentClassData.schedule = schedule;
  if (state.classesData[state.currentClassId]) {
    state.classesData[state.currentClassId].students = state.currentClassData.students;
    state.classesData[state.currentClassId].schedule = schedule;
  }
  renderAll();
  updateClassFields(state.currentClassId, { students: state.currentClassData.students, schedule: state.currentClassData.schedule });
};

window.autoAssignRandom = () => {
  if (!state.isAdmin) return;
  if (!state.currentClassId || !state.classesData[state.currentClassId]) {
    showToast("Vui lòng tạo ít nhất 1 lớp trước khi thao tác!", "warning");
    return;
  }
  if (state.currentClassData.students.length === 0) {
    showToast("Danh sách học sinh đang trống! Vui lòng nhập danh sách học sinh trước.", "warning");
    return;
  }
  const shuffled = [...state.currentClassData.students];
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

  state.currentClassData.schedule = newSchedule;
  state.classesData[state.currentClassId].schedule = newSchedule;
  renderAll();
  updateClassFields(state.currentClassId, { schedule: state.currentClassData.schedule });
};

window.clearSchedule = () => {
  if (!state.isAdmin) return;
  if (!state.currentClassId || !state.classesData[state.currentClassId]) {
    showToast("Vui lòng tạo ít nhất 1 lớp trước khi thao tác!", "warning");
    return;
  }
  state.currentClassData.schedule = {};
  state.classesData[state.currentClassId].schedule = {};
  renderAll();
  updateClassFields(state.currentClassId, { schedule: state.currentClassData.schedule });
};

window.saveClassNotice = () => {
  if (!state.isAdmin) return;
  if (!state.currentClassId || !state.classesData[state.currentClassId]) {
    showToast("Vui lòng tạo ít nhất 1 lớp trước khi thao tác!", "warning");
    return;
  }
  const noticeInput = document.getElementById("noticeInput");
  const content = sanitizeNoticeHtml(noticeInput.innerHTML.trim());
  state.currentClassData.notice = content || "Chưa có thông tin báo bài mới.";
  state.classesData[state.currentClassId].notice = state.currentClassData.notice;
  renderAll();
  updateClassFields(state.currentClassId, { notice: state.currentClassData.notice });
  showToast("Đã lưu báo bài!", "success");
};

window.startNewCycle = () => {
  if (!state.isAdmin) return;
  if (!state.currentClassId || !state.classesData[state.currentClassId]) {
    showToast("Vui lòng tạo ít nhất 1 lớp trước khi thao tác!", "warning");
    return;
  }
  if (!confirm("Bạn có chắc muốn xóa bảng hiện tại và cập nhật 6 tuần mới bắt đầu từ tuần này không?")) return;

  state.currentClassData.weekHeaders = createNewWeekHeaders();
  state.currentClassData.schedule = {};
  state.classesData[state.currentClassId].weekHeaders = state.currentClassData.weekHeaders;
  state.classesData[state.currentClassId].schedule = {};

  renderAll();
  updateClassFields(state.currentClassId, { weekHeaders: state.currentClassData.weekHeaders, schedule: {} });
};

window.removeStudentFromCell = (cellKey, studentIndex) => {
  if (!state.isAdmin || !state.currentClassId || !state.classesData[state.currentClassId]) return;
  if (!state.currentClassData.schedule[cellKey]) return;
  const arr = toArray(state.currentClassData.schedule[cellKey]);
  arr.splice(studentIndex, 1);
  state.currentClassData.schedule[cellKey] = arr;
  state.classesData[state.currentClassId].schedule = state.currentClassData.schedule;
  renderAll();
  saveCellToCloud(cellKey);
};


