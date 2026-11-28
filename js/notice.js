import { state } from './state.js';
import { sanitizeNoticeHtml, showToast } from './utils.js';
import { updateClassFields } from './firebase-save.js';

function renderNotice() {
  const noticeDisplay = document.getElementById("noticeDisplay");
  const noticeInput = document.getElementById("noticeInput");
  const noticeToolbar = document.getElementById("noticeToolbar");
  const saveNoticeBtn = document.getElementById("saveNoticeBtn");
  
  if (noticeDisplay) {
    if (state.currentClassData.notice && state.currentClassData.notice !== "Chưa có thông tin báo bài mới.") {
      noticeDisplay.innerHTML = sanitizeNoticeHtml(state.currentClassData.notice);
    } else {
      noticeDisplay.textContent = "Chưa có thông tin báo bài mới.";
    }
  }
  
  if (noticeInput && state.isAdmin) {
    if (document.activeElement !== noticeInput) {
      if (state.currentClassData.notice && state.currentClassData.notice !== "Chưa có thông tin báo bài mới.") {
        noticeInput.innerHTML = sanitizeNoticeHtml(state.currentClassData.notice);
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
  
  if (noticeDisplay && state.isAdmin) {
    noticeDisplay.classList.add("hidden");
  } else if (noticeDisplay) {
    noticeDisplay.classList.remove("hidden");
  }
}



export { renderNotice };
