import { state } from './state.js';
import { db, ref, set, update, remove, onValue, guestsRef } from './firebase.js';
import { showToast, escapeHtml } from './utils.js';

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

function loadGuestsList() {
  if (!state.isAdmin || state.guestsListener) return;
  state.guestsListener = onValue(guestsRef, (snapshot) => {
    const emailListEl = document.getElementById("guestEmailList");
    const passListEl = document.getElementById("guestPasswordList");
    if (!emailListEl && !passListEl) return;
    const val = snapshot.val();
    if (emailListEl) emailListEl.innerHTML = "";
    if (passListEl) passListEl.innerHTML = "";

    let emailCount = 0;
    let passCount = 0;

    if (val) {
      Object.keys(val).sort().forEach((key) => {
        const entry = val[key];
        const isEmail = (entry && typeof entry === "object" && entry.type === "email") || (entry === true && key.includes("@"));
        const targetEl = isEmail ? emailListEl : passListEl;
        if (!targetEl) return;

        let label = key;
        if (isEmail) {
          label = (entry && typeof entry === "object" && entry.email) ? entry.email : key.replace(/,/g, ".");
          emailCount++;
        } else {
          label = (entry && typeof entry === "object" && entry.name) ? entry.name : key;
          passCount++;
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
          if (isEmail) {
            const next = prompt("Nhập email mới:", label);
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
              createdAt: (entry && entry.createdAt) ? entry.createdAt : Date.now()
            })
              .then(() => {
                if (newKey !== key) return remove(ref(db, `trucNhatLop/guests/${key}`));
              })
              .then(() => showToast(`Đã cập nhật email thành "${newEmail}"`, "success"))
              .catch(() => showToast("Không thể cập nhật email!", "error"));
          } else {
            const newPass = prompt(`Nhập mật khẩu mới cho "${label}" (tối thiểu 4 ký tự):`);
            if (newPass === null) return;
            if (!newPass || newPass.length < 4) {
              showToast("Mật khẩu phải có ít nhất 4 ký tự!", "warning");
              return;
            }
            set(ref(db, `trucNhatLop/guests/${key}`), {
              type: "password",
              name: label,
              passwordHash: sha256(`${label}:${newPass}`),
              createdAt: (entry && entry.createdAt) ? entry.createdAt : Date.now()
            })
              .then(() => showToast(`Đã cập nhật mật khẩu cho "${label}"`, "success"))
              .catch(() => showToast("Không thể cập nhật mật khẩu!", "error"));
          }
        };
        item.querySelector(".guest-del-btn").onclick = () => {
          remove(ref(db, `trucNhatLop/guests/${key}`))
            .then(() => showToast(`Đã xóa khách "${label}"`, "success"))
            .catch(() => showToast("Không thể xóa khách!", "error"));
        };
        targetEl.appendChild(item);
      });
    }

    if (emailListEl && emailCount === 0) {
      emailListEl.innerHTML = '<p class="text-sm text-slate-500 text-center py-4">Chưa có email nào được cấp phép.</p>';
    }
    if (passListEl && passCount === 0) {
      passListEl.innerHTML = '<p class="text-sm text-slate-500 text-center py-4">Chưa có tài khoản tên nào.</p>';
    }
  });
}

function addAllowedGuestEmail() {
  if (!state.isAdmin) return;
  const input = document.getElementById("newGuestEmailInput");
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) {
    showToast("Vui lòng nhập ít nhất 1 email!", "warning");
    input.focus();
    return;
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const parts = raw.split(/[\n,;]+/);
  const updates = {};
  let validCount = 0;
  let invalidCount = 0;

  parts.forEach((part) => {
    let token = part.trim();
    if (!token) return;
    const angleMatch = token.match(/<([^>]+)>/);
    if (angleMatch) token = angleMatch[1].trim();
    const email = token.toLowerCase();
    if (!emailRe.test(email) || /[,#$\[\]\/]/.test(email)) {
      invalidCount++;
      return;
    }
    const emailKey = encodeEmailKey(email);
    if (!updates[emailKey]) {
      updates[emailKey] = {
        type: "email",
        email: email,
        createdAt: Date.now()
      };
      validCount++;
    }
  });

  if (validCount === 0) {
    showToast("Không có email hợp lệ nào trong danh sách!", "warning");
    input.focus();
    return;
  }

  update(guestsRef, updates)
    .then(() => {
      input.value = "";
      const msg = invalidCount > 0
        ? `Đã cấp quyền cho ${validCount} email (bỏ qua ${invalidCount} mục không hợp lệ)`
        : `Đã cấp quyền cho ${validCount} email`;
      showToast(msg, "success");
    })
    .catch(() => showToast("Không thể thêm danh sách email khách!", "error"));
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
  if (addEmailBtn) addEmailBtn.addEventListener("click", addAllowedGuestEmail);

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
  encodeEmailKey,
  sha256,
  loadGuestsList,
  addAllowedGuestEmail,
  addAllowedGuest
};
