import { state, getDefaultClassData } from './state.js';
import {
  auth, db, provider, accessRequestsRef, classesRef, guestsRef,
  signInWithPopup, signInWithRedirect, getRedirectResult, signInAnonymously, signOut, onAuthStateChanged,
  ref, set, get, onValue, push, remove, serverTimestamp, onDisconnect
} from './firebase.js';
import { showToast, escapeHtml } from './utils.js';
import { renderAll, clearTapSelection, renderClassSelector } from './ui-common.js';
import { loadClassesFromFirebase } from './classes.js';
import { loadChat, updateChatIdentityUI } from './chat.js';
import { loadPosts, renderPostsList } from './bao.js';
import { stopWeekButterfly } from './butterfly.js';
import { switchTab } from './navigation.js';

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

function encodeEmailKey(email) {
  return String(email || "").trim().toLowerCase().replace(/\./g, ",");
}

// Pure-JS SHA-256 (with UTF-8 encoding) so password hashing works in both HTTP and HTTPS contexts
function sha256(str) {
  let ascii = unescape(encodeURIComponent(String(str)));
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = "";
  const words = [];
  const asciiBitLength = ascii.length * 8;
  const hash = (sha256.h = sha256.h || []);
  const k = (sha256.k = sha256.k || []);
  let primeCounter = k.length;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += "\x80";
  while ((ascii.length % 64) - 56) ascii += "\x00";
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    if (j >> 8) return "";
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;
  const h = hash.slice(0, 8);
  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = h.slice(0);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = h[0], e = h[4];
      const temp1 =
        h[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & h[5]) ^ (~e & h[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & h[1]) ^ (a & h[2]) ^ (h[1] & h[2]));
      h.unshift((temp1 + temp2) | 0);
      h[4] = (h[4] + temp1) | 0;
      h.pop();
    }
    for (let i = 0; i < 8; i++) h[i] = (h[i] + oldHash[i]) | 0;
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (h[i] >> (j * 8)) & 255;
      result += (b < 16 ? 0 : "") + b.toString(16);
    }
  }
  return result;
}

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



function loadGuestsList() {
  if (!state.isAdmin || state.guestsListener) return;
  state.guestsListener = onValue(guestsRef, (snapshot) => {
    const listEl = document.getElementById("guestAllowedList");
    if (!listEl) return;
    const val = snapshot.val();
    listEl.innerHTML = "";
    if (!val) {
      listEl.innerHTML = '<p class="text-sm text-slate-500 text-center py-4">Chưa có khách nào được cấp phép.</p>';
      return;
    }
    Object.keys(val).sort().forEach((key) => {
      const entry = val[key];
      let label = key;
      if (entry && typeof entry === "object") {
        if (entry.type === "email") {
          label = `Email: ${entry.email || key.replace(/,/g, ".")}`;
        } else if (entry.type === "password") {
          label = `Tên: ${entry.name || key} (có MK)`;
        }
      }
      const item = document.createElement("div");
      item.className = "student-drag-item";
      item.style.cursor = "default";
      item.innerHTML = `
        <span class="student-drag-name">${escapeHtml(label)}</span>
        <div class="flex items-center gap-1" style="margin-left: auto;">
          <button type="button" class="btn btn-ghost btn-sm guest-edit-btn" style="padding: 2px 8px; font-size: 12px;" aria-label="Sửa ${escapeHtml(label)}">Sửa</button>
          <button type="button" class="tag-remove guest-del-btn" aria-label="Xóa ${escapeHtml(label)}">×</button>
        </div>
      `;
      item.querySelector(".guest-edit-btn").onclick = () => {
        if (!state.isAdmin) return;
        if (entry && typeof entry === "object" && entry.type === "email") {
          const currentEmail = entry.email || key.replace(/,/g, ".");
          const next = prompt("Nhập email mới:", currentEmail);
          if (next === null) return;
          const newEmail = next.trim().toLowerCase();
          const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!newEmail || !emailRe.test(newEmail) || /[,#$\[\]\/]/.test(newEmail)) {
            showToast("Email không hợp lệ!", "warning");
            return;
          }
          const newKey = encodeEmailKey(newEmail);
          set(ref(db, `trucNhatLop/guests/${newKey}`), {
            type: "email",
            email: newEmail,
            createdAt: entry.createdAt || Date.now()
          })
            .then(() => {
              if (newKey !== key) return remove(ref(db, `trucNhatLop/guests/${key}`));
            })
            .then(() => showToast(`Đã cập nhật email thành "${newEmail}"`, "success"))
            .catch(() => showToast("Không thể cập nhật email!", "error"));
        } else {
          const accountName = (entry && typeof entry === "object" && entry.name) ? entry.name : key;
          const newPass = prompt(`Nhập mật khẩu mới cho "${accountName}" (tối thiểu 4 ký tự):`);
          if (newPass === null) return;
          if (!newPass || newPass.length < 4) {
            showToast("Mật khẩu phải có ít nhất 4 ký tự!", "warning");
            return;
          }
          set(ref(db, `trucNhatLop/guests/${key}`), {
            type: "password",
            name: accountName,
            passwordHash: sha256(`${accountName}:${newPass}`),
            createdAt: (entry && entry.createdAt) ? entry.createdAt : Date.now()
          })
            .then(() => showToast(`Đã cập nhật mật khẩu cho "${accountName}"`, "success"))
            .catch(() => showToast("Không thể cập nhật mật khẩu!", "error"));
        }
      };
      item.querySelector(".guest-del-btn").onclick = () => {
        remove(ref(db, `trucNhatLop/guests/${key}`))
          .then(() => showToast(`Đã xóa khách "${label}"`, "success"))
          .catch(() => showToast("Không thể xóa khách!", "error"));
      };
      listEl.appendChild(item);
    });
  });
}

function addAllowedGuestEmail() {
  if (!state.isAdmin) return;
  const input = document.getElementById("newGuestEmailInput");
  if (!input) return;
  const email = input.value.trim().toLowerCase();
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRe.test(email) || /[,#$\[\]\/]/.test(email)) {
    showToast("Vui lòng nhập email hợp lệ!", "warning");
    input.focus();
    return;
  }
  const emailKey = encodeEmailKey(email);
  set(ref(db, `trucNhatLop/guests/${emailKey}`), {
    type: "email",
    email: email,
    createdAt: Date.now()
  })
    .then(() => {
      input.value = "";
      showToast(`Đã cấp quyền cho email "${email}"`, "success");
    })
    .catch(() => showToast("Không thể thêm email khách!", "error"));
}

function addAllowedGuest() {
  if (!state.isAdmin) return;
  const input = document.getElementById("newGuestNameInput");
  const passInput = document.getElementById("newGuestPasswordInput");
  if (!input || !passInput) return;
  const name = input.value.trim().toLowerCase();
  const password = passInput.value;
  if (!name) {
    showToast("Vui lòng nhập tên đăng nhập!", "warning");
    input.focus();
    return;
  }
  if (!password || password.length < 4) {
    showToast("Mật khẩu phải có ít nhất 4 ký tự!", "warning");
    passInput.focus();
    return;
  }
  if (/[.#$\[\]\/]/.test(name)) {
    showToast("Tên không được chứa ký tự . # $ [ ] /", "warning");
    return;
  }
  set(ref(db, `trucNhatLop/guests/${name}`), {
    type: "password",
    name: name,
    passwordHash: sha256(`${name}:${password}`),
    createdAt: Date.now()
  })
    .then(() => {
      input.value = "";
      passInput.value = "";
      showToast(`Đã tạo tài khoản "${name}" (có mật khẩu)`, "success");
    })
    .catch(() => showToast("Không thể thêm tài khoản khách!", "error"));
}

document.addEventListener("DOMContentLoaded", () => {
  const addEmailBtn = document.getElementById("addGuestEmailBtn");
  const emailInput = document.getElementById("newGuestEmailInput");
  if (addEmailBtn) addEmailBtn.addEventListener("click", addAllowedGuestEmail);
  if (emailInput) {
    emailInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addAllowedGuestEmail(); }
    });
  }

  const addBtn = document.getElementById("addGuestBtn");
  const guestInput = document.getElementById("newGuestNameInput");
  const guestPassInput = document.getElementById("newGuestPasswordInput");
  if (addBtn) addBtn.addEventListener("click", addAllowedGuest);
  if (guestInput) {
    guestInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); if (guestPassInput) guestPassInput.focus(); }
    });
  }
  if (guestPassInput) {
    guestPassInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addAllowedGuest(); }
    });
  }
});

export {
  showLoginPage,
  hideLoginPage,
  guestLogin,
  cleanupAppData,
  registerActiveGuest,
  logoutGuest,
  loadGuestsList,
  addAllowedGuest
};
