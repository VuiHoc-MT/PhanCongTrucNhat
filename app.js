/**
 * TRỰC NHẬT LỚP - APP CONTROLLER
 * File trung tâm điều phối và kết nối các module tính năng
 */

// 1. Core State & Firebase
import { state } from './js/state.js';
import { auth, onAuthStateChanged, db, ref, set } from './js/firebase.js';

// 2. Constants & Utilities
import { TASKS, DAYS, weekHeaders } from './js/constants.js';
import { toArray, normalizeSchedule, showToast, escapeHtml } from './js/utils.js';

// 3. Feature Modules
import { updateClassFields, saveCellToCloud } from './js/firebase-save.js';
import {
  showLoginPage, hideLoginPage, guestLogin, cleanupAppData,
  registerActiveGuest, logoutGuest, loadGuestsList, addAllowedGuest
} from './js/auth.js';
import {
  renderAll, updateStudentDragList, showTapNotifyBar, hideTapNotifyBar,
  collapseAdminPanelForMobile, clearTapSelection, updateStudentCount,
  renderClassSelector, switchClass, loadClassData, saveCurrentClassId,
  closeDropdown, toggleDropdown, markWeekButterflyDirty
} from './js/ui-common.js';
import {
  loadClassesFromFirebase, loadSingleClass, openClassModal, closeClassModal,
  confirmClassModal, addNewClass, renameClass, deleteClass, renderClassList
} from './js/classes.js';
import './js/admin-actions.js';
import { renderSchedule } from './js/schedule.js';
import { makeButterflyState, ensureWeekButterfly, stopWeekButterfly } from './js/butterfly.js';
import { renderNotice } from './js/notice.js';
import {
  stopRandomDraw, renderRandomBoard, buildButterflyPool, butterflyLayerRect,
  applyButterflyTransform, updateButterflyMove, computeScatterPositions,
  startRandomDraw, drawLoop, forceFinishRandom, finishDraw, launchConfetti, closeRandomWinner
} from './js/random.js';
import {
  isImpersonatingAdmin, getChatNickname, setChatNicknameToggleText,
  showChatNicknameInput, saveChatNicknameFromInput, setChatNickname,
  updateChatIdentityUI, loadChat, renderChatMessages, sendChatMessage
} from './js/chat.js';
import {
  renderBaoBaibai, loadPosts, renderPostsList, openBaoEditor, closeBaoEditor,
  saveBaoPost, deleteBaoPost, openBaoView, closeBaoView
} from './js/bao.js';
import { switchTab } from './js/navigation.js';
import { initNoticeToolbar } from './js/editor.js';
import {
  updateScrollUI, observeRevealElements, animateCounters, handleGlobalEscape
} from './js/ui-interactions.js';

// Export state and methods to window for inline HTML onclick/onkeydown handlers
Object.assign(window, {
  // Navigation & Tabs
  switchTab,

  // Auth & Guest
  showLoginPage,
  hideLoginPage,
  guestLogin,
  logoutGuest,

  // Schedule & Class
  switchClass,
  toggleDropdown,
  closeDropdown,
  clearTapSelection,

  // Random Draw
  startRandomDraw,
  closeRandomWinner,

  // Chat
  sendChatMessage,
  setChatNickname,

  // Bao (Reports / Posts)
  openBaoEditor,
  closeBaoEditor,
  saveBaoPost,
  closeBaoView,
  openBaoView,

  // State inspection (for debugging if needed)
  __APP_STATE__: state
});

// Window listeners for butterfly bounds
window.addEventListener('resize', markWeekButterflyDirty);
window.addEventListener('scroll', markWeekButterflyDirty, { passive: true });

// ===========================================
// INITIALIZATION / BOOTSTRAP
// ===========================================
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
  // Public tabs switch immediately; state.pendingHashTab is kept so onAuthStateChanged
  // can still route authenticated users, and is cleared in the no-session branch.
  const publicTabs = ['about', 'request'];
  if (state.pendingHashTab && publicTabs.includes(state.pendingHashTab) && state.pendingHashTab !== state.currentTab) {
    switchTab(state.pendingHashTab);
  }
});



// Nickname, Login, and Tap cancel wireup
document.addEventListener('DOMContentLoaded', () => {
  const nameEl = document.getElementById("chatMyName");
  if (nameEl) {
    nameEl.addEventListener('contextmenu', (e) => {
      if (state.isAdmin) return; // admin identity is fixed
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
  const guestPasswordInput = document.getElementById("guestPasswordInput");
  const loginCloseBtn = document.getElementById("loginCloseBtn");
  if (guestLoginBtn) guestLoginBtn.addEventListener('click', guestLogin);
  if (adminLoginBtn) adminLoginBtn.addEventListener('click', () => window.loginWithGoogle());
  if (loginCloseBtn) loginCloseBtn.addEventListener('click', () => { hideLoginPage(); state.publicBrowsing = true; switchTab('about'); });
  if (guestNameInput) {
    guestNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (guestPasswordInput && !guestPasswordInput.value) guestPasswordInput.focus();
        else guestLogin();
      }
    });
  }
  if (guestPasswordInput) {
    guestPasswordInput.addEventListener('keydown', (e) => {
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
