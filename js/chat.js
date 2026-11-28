import { state } from './state.js';
import { db, ref, push, onValue, limitToLast, query, serverTimestamp, chatRef } from './firebase.js';
import { escapeHtml, showToast } from './utils.js';

state.chatListener = null;
let chatNickname = localStorage.getItem("chatNickname") || "";

// Non-admins cannot impersonate "admin" in their chat nickname
function isImpersonatingAdmin(name) {
  if (state.isAdmin) return false;
  return typeof name === "string" && name.toLowerCase().includes("admin");
}

function getChatNickname() {
  if (chatNickname) return chatNickname;
  // Use a typed-but-unsaved value from the inline input if present
  const input = document.getElementById("chatNicknameInput");
  if (input && input.value.trim()) {
    const trimmed = input.value.trim().slice(0, 30);
    if (isImpersonatingAdmin(trimmed)) {
      showToast("Không được đặt tên trùng với Admin!", "warning");
      input.value = "";
      showChatNicknameInput();
      return null;
    }
    chatNickname = trimmed;
    localStorage.setItem("chatNickname", chatNickname);
    input.classList.add("hidden");
    setChatNicknameToggleText(false);
    updateChatIdentityUI();
    return chatNickname;
  }
  // No nickname yet — reveal the inline input instead of using prompt()
  showChatNicknameInput();
  return null;
}

function setChatNicknameToggleText(open) {
  const toggle = document.getElementById("chatNicknameToggle");
  if (toggle) toggle.textContent = open ? "Lưu tên" : "Đổi tên";
}

function showChatNicknameInput() {
  const input = document.getElementById("chatNicknameInput");
  if (input) {
    input.classList.remove("hidden");
    input.value = chatNickname || "";
    setChatNicknameToggleText(true);
    input.focus();
    input.select();
  }
}

function saveChatNicknameFromInput() {
  const input = document.getElementById("chatNicknameInput");
  if (!input) return;
  const trimmed = input.value.trim().slice(0, 30);
  if (trimmed) {
    if (isImpersonatingAdmin(trimmed)) {
      showToast("Không được đặt tên trùng với Admin!", "warning");
      input.value = chatNickname || "";
      return; // don't save, keep input open
    }
    chatNickname = trimmed;
    localStorage.setItem("chatNickname", chatNickname);
  } else {
    chatNickname = "";
    localStorage.removeItem("chatNickname");
  }
  input.classList.add("hidden");
  setChatNicknameToggleText(false);
  updateChatIdentityUI();
}

function setChatNickname() {
  // Toggle the inline nickname input in the chat header (replaces prompt())
  const input = document.getElementById("chatNicknameInput");
  if (!input) return;
  if (input.classList.contains("hidden")) {
    showChatNicknameInput();
  } else {
    saveChatNicknameFromInput();
  }
}

function updateChatIdentityUI() {
  const nameEl = document.getElementById("chatMyName");
  if (nameEl) {
    if (state.isAdmin) {
      nameEl.innerHTML = '🦋 <span class="chat-admin-tag">Admin</span>';
    } else {
      nameEl.textContent = chatNickname ? ("Bạn: " + chatNickname) : "Bạn: (chưa đặt tên)";
    }
  }
}

function loadChat() {
  if (state.chatListener) return; // already listening
  // Limit to last 100 messages to avoid loading thousands
  const chatQuery = query(chatRef, limitToLast(100));
  state.chatListener = onValue(chatQuery, (snapshot) => {
    renderChatMessages(snapshot.val());
  }, (error) => {
    console.error("Chat load error:", error);
  });
}

function renderChatMessages(val) {
  const list = document.getElementById("chatMessages");
  if (!list) return;
  list.innerHTML = "";
  if (!val) {
    list.innerHTML = '<div class="chat-empty">Chưa có tin nhắn. Hãy là người đầu tiên!</div>';
    return;
  }
  const msgs = Object.entries(val)
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  msgs.forEach(m => {
    const isAdminMsg = m.isAdmin === true;
    const row = document.createElement("div");
    row.className = "chat-msg" + (isAdminMsg ? " is-admin" : "");
    const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "";
    row.innerHTML = `
      <div class="chat-msg-head">
        <span class="chat-msg-name">${isAdminMsg ? '🦋 <span class="chat-admin-tag">Admin</span>' : escapeHtml(m.name || "Ẩn danh")}</span>
        <span class="chat-msg-time">${escapeHtml(time)}</span>
      </div>
      <div class="chat-msg-text">${escapeHtml(m.text || "")}</div>
    `;
    list.appendChild(row);
  });
  list.scrollTop = list.scrollHeight;
}

let lastChatSendTime = 0;
function sendChatMessage() {
  const now = Date.now();
  if (now - lastChatSendTime < 500) return; // 500ms cooldown
  const input = document.getElementById("chatInput");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  lastChatSendTime = now;
  const name = state.isAdmin ? "Admin" : getChatNickname();
  if (!name) return;
  // Non-admins cannot send messages under an "admin" impersonation name
  if (!state.isAdmin && isImpersonatingAdmin(name)) {
    showToast("Không được đặt tên trùng với Admin!", "warning");
    return;
  }
  const msg = {
    uid: auth.currentUser ? auth.currentUser.uid : "guest",
    name: name,
    text: text.slice(0, 500),
    isAdmin: state.isAdmin === true,
    timestamp: serverTimestamp()
  };
  push(chatRef, msg).catch(() => {
    showToast("Không gửi được tin nhắn!", "error");
  });
  input.value = "";
  input.focus();
}





export {
  isImpersonatingAdmin,
  getChatNickname,
  setChatNicknameToggleText,
  showChatNicknameInput,
  saveChatNicknameFromInput,
  setChatNickname,
  updateChatIdentityUI,
  loadChat,
  renderChatMessages,
  sendChatMessage
};
