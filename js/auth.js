import { state, getDefaultClassData } from './state.js';
import {
  auth, db, provider, accessRequestsRef, classesRef, guestsRef,
  signInWithPopup, signInWithRedirect, getRedirectResult, signInAnonymously, signOut, onAuthStateChanged,
  ref, set, update, get, onValue, push, remove, serverTimestamp, onDisconnect
} from './firebase.js';
import { showToast, escapeHtml } from './utils.js';
import { renderAll, clearTapSelection, renderClassSelector } from './ui-common.js';
import { loadClassesFromFirebase } from './classes.js';
import { loadChat, updateChatIdentityUI } from './chat.js';
import { loadPosts, renderPostsList } from './bao.js';
import { stopWeekButterfly } from './butterfly.js';
import { switchTab } from './navigation.js';
import { encodeEmailKey, sha256, loadGuestsList } from './guests.js';

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

function clearGuestStorage() {
  sessionStorage.removeItem("guestName");
  sessionStorage.removeItem("guestPassHash");
}

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
  const passInput = document.getElementById("guestPasswordInput");
  if (passInput) passInput.value = "";
}

function hideLoginPage() {
  const page = document.getElementById("loginPage");
  if (page) page.classList.add("hidden");
}

async function guestLogin() {
  const input = document.getElementById("guestNameInput");
  const passInput = document.getElementById("guestPasswordInput");
  const errorEl = document.getElementById("guestError");
  if (!input || !passInput) return;
  const name = input.value.trim().toLowerCase();
  const password = passInput.value;
  if (!name) {
    if (errorEl) errorEl.textContent = "Vui lòng nhập tên đăng nhập!";
    input.focus();
    return;
  }
  if (!password) {
    if (errorEl) errorEl.textContent = "Đăng nhập bằng tên bắt buộc phải có mật khẩu!";
    passInput.focus();
    return;
  }
  // Firebase keys cannot contain . # $ [ ] /
  if (/[.#$\[\]\/]/.test(name)) {
    if (errorEl) errorEl.textContent = "Tên không được chứa ký tự đặc biệt (. # $ [ ] /).";
    return;
  }
  if (errorEl) errorEl.textContent = "Đang kiểm tra...";
  try {
    const guestRef = ref(db, `trucNhatLop/guests/${name}`);
    const snap = await get(guestRef);
    const val = snap.exists() ? snap.val() : null;
    const passHash = sha256(`${name}:${password}`);
    if (val && typeof val === "object" && val.type === "password" && val.passwordHash === passHash) {
      // Set sessionStorage BEFORE auth so onAuthStateChanged sees it immediately
      state.guestName = name;
      sessionStorage.setItem("guestName", name);
      sessionStorage.setItem("guestPassHash", passHash);
      try {
        await signInAnonymously(auth);
        if (errorEl) errorEl.textContent = "";
        // onAuthStateChanged handles the rest (setup + loadClassesFromFirebase)
      } catch (e) {
        // Anonymous auth failed - do NOT grant guest access
        console.warn("Anonymous auth failed:", e);
        clearGuestStorage();
        state.guestName = null;
        if (errorEl) errorEl.textContent = "Không thể khởi tạo phiên đăng nhập. Vui lòng thử lại.";
      }
    } else if (val === true) {
      if (errorEl) errorEl.textContent = "Tài khoản này chưa có mật khẩu. Vui lòng đăng nhập bằng Email hoặc liên hệ Admin.";
    } else {
      if (errorEl) errorEl.textContent = "Tên đăng nhập hoặc mật khẩu không đúng.";
    }
  } catch (e) {
    clearGuestStorage();
    state.guestName = null;
    if (errorEl) errorEl.textContent = "Lỗi kết nối. Vui lòng thử lại.";
  }
}

function cleanupAppData() {
  if (state.currentClassListener) { state.currentClassListener(); state.currentClassListener = null; }
  if (state.classesListListener) { state.classesListListener(); state.classesListListener = null; }
  if (state.chatListener) { state.chatListener(); state.chatListener = null; }
  if (state.postsListener) { state.postsListener(); state.postsListener = null; }

  if (state.guestsListener) { state.guestsListener(); state.guestsListener = null; }
  
  state.classesData = {};
  state.currentClassId = null;
  state.currentClassData = getDefaultClassData();
  
  // Reset posts cache
  state.baoLatestPostsVal = null;
  state.baoPostsCache = {};
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
  document.getElementById("tab-admin-guests")?.classList.add("hidden");
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
  state.isGuest = false;
  state.isAdmin = false;
  state.guestName = null;
  clearGuestStorage();
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
    className: (state.currentClassId && state.classesData[state.currentClassId]) ? state.classesData[state.currentClassId].name : "",
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



// Auth State Listener
onAuthStateChanged(auth, async (user) => {
  const seq = ++state.authCheckSeq;
  
  // Handle anonymous guest sessions (signInAnonymously from guestLogin with name + password)
  if (user && user.isAnonymous) {
    const savedGuest = sessionStorage.getItem("guestName");
    const savedPassHash = sessionStorage.getItem("guestPassHash");
    if (savedGuest && savedPassHash && !/[.#$\[\]\/]/.test(savedGuest)) {
      // Re-verify the guest and password hash still match before granting access
      try {
        const snap = await get(ref(db, `trucNhatLop/guests/${savedGuest}`));
        const val = snap.exists() ? snap.val() : null;
        if (val && typeof val === "object" && val.type === "password" && val.passwordHash === savedPassHash) {
          state.isGuest = true;
          state.isAdmin = false;
          state.publicBrowsing = false;
          state.guestName = savedGuest;
          state.currentUser = user;
          // Register the active guest session so Database Rules allow data access
          await registerActiveGuest(savedGuest, user.uid);
          hideLoginPage();
          const badge = document.getElementById("roleBadge");
          if (badge) { badge.textContent = "Khách: " + savedGuest; badge.className = "role-badge guest"; }
          const loginBtn = document.getElementById("loginBtn");
          if (loginBtn) loginBtn.classList.add("hidden");
          const logoutBtn = document.getElementById("logoutBtn");
          if (logoutBtn) { logoutBtn.textContent = "Đăng xuất"; logoutBtn.classList.remove("hidden"); logoutBtn.onclick = logoutGuest; }
          updateChatIdentityUI();
          loadClassesFromFirebase();
          
          renderAll();
          if (state.pendingHashTab) { const t = state.pendingHashTab; state.pendingHashTab = null; switchTab(t); } else if (state.currentTab === 'about') { switchTab('home'); }
        } else {
          clearGuestStorage();
          signOut(auth);
        }
      } catch (e) {
        clearGuestStorage();
        signOut(auth);
      }
    } else {
      clearGuestStorage();
      signOut(auth);
    }
    return;
  }
  
  if (user) {
    try {
      state.currentUser = user;
      
      const [dbAdminRes, coreAdminRes] = await Promise.all([
        get(ref(db, "admins/" + user.uid)).catch(() => ({ exists: () => false })),
        get(ref(db, "coreAdminCheck")).catch(() => ({ exists: () => false }))
      ]);
      
      // Check if this is still the latest auth check
      if (seq !== state.authCheckSeq) return;
      
      const isDbAdmin = (dbAdminRes.exists() && dbAdminRes.val() === true) || coreAdminRes.exists();
      
      if (isDbAdmin) {
        state.isAdmin = true;
        state.isGuest = false;
        state.publicBrowsing = false;
        state.guestName = null;
        clearGuestStorage();
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
        document.getElementById("tab-admin-guests")?.classList.remove("hidden");
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
        renderPostsList(state.baoLatestPostsVal);
        
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
        loadGuestsList();
        // Flush pending hash tab now that admin is authenticated; default to home
        if (state.pendingHashTab) { const t = state.pendingHashTab; state.pendingHashTab = null; switchTab(t); } else if (state.currentTab === 'about') { switchTab('home'); }
      } else {
        // Check if this Google email is an allowed Guest
        const emailKey = encodeEmailKey(user.email || "");
        const guestSnap = emailKey ? await get(ref(db, `trucNhatLop/guests/${emailKey}`)).catch(() => null) : null;
        if (seq !== state.authCheckSeq) return;
        const guestVal = guestSnap && guestSnap.exists() ? guestSnap.val() : null;
        const isAllowedGuest = guestVal === true || (guestVal && typeof guestVal === "object" && guestVal.type === "email");

        if (isAllowedGuest) {
          state.isAdmin = false;
          state.isGuest = true;
          state.publicBrowsing = false;
          state.guestName = user.email;
          clearGuestStorage();
          await registerActiveGuest(user.email, user.uid);
          hideLoginPage();
          const badge = document.getElementById("roleBadge");
          if (badge) { badge.textContent = "Khách: " + user.email; badge.className = "role-badge guest"; }
          const loginBtn = document.getElementById("loginBtn");
          if (loginBtn) loginBtn.classList.add("hidden");
          const logoutBtn = document.getElementById("logoutBtn");
          if (logoutBtn) { logoutBtn.textContent = "Đăng xuất"; logoutBtn.classList.remove("hidden"); logoutBtn.onclick = logoutGuest; }
          updateChatIdentityUI();
          loadClassesFromFirebase();
          renderAll();
          if (state.pendingHashTab) { const t = state.pendingHashTab; state.pendingHashTab = null; switchTab(t); } else if (state.currentTab === 'about') { switchTab('home'); }
        } else {
          state.isAdmin = false;
          state.isGuest = false;
          showToast("Email " + (user.email || "") + " chưa được cấp quyền truy cập!", "warning");
          signOut(auth);
        }
      }
    } catch (error) {
      if (seq !== state.authCheckSeq) return;
      state.isAdmin = false;
      showToast("Lỗi kết nối khi kiểm tra quyền Admin!", "error");
      signOut(auth);
    }
  } else {
    // No Firebase user (logged out) — cleanup first
    state.currentUser = null;
    state.isAdmin = false;
    state.isGuest = false;
    cleanupAppData();
    
    // Check for an authorized guest session (name + password)
    const savedGuest = sessionStorage.getItem("guestName");
    const savedPassHash = sessionStorage.getItem("guestPassHash");
    if (savedGuest && savedPassHash && !/[.#$\[\]\/]/.test(savedGuest)) {
      // Restore the anonymous Firebase Auth session; onAuthStateChanged will
      // re-fire with the anonymous user and re-verify the guest.
      signInAnonymously(auth).catch(() => {
        // Could not restore session — clear and go to public browsing
        clearGuestStorage();
        state.guestName = null;
        state.publicBrowsing = true;
        state.pendingHashTab = null;
      });
    } else {
      clearGuestStorage();
      state.guestName = null;
      // Public browsing: no login overlay, stay on about page
      state.publicBrowsing = true;
      state.pendingHashTab = null;
    }
  }
});

renderAll();



export {
  showLoginPage,
  hideLoginPage,
  guestLogin,
  cleanupAppData,
  registerActiveGuest,
  logoutGuest
};
