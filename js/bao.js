import { state } from './state.js';
import { db, ref, push, set, remove, onValue, limitToLast, query, serverTimestamp, postsRef } from './firebase.js';
import { escapeHtml, showToast, sanitizeNoticeHtml } from './utils.js';
import { renderNotice } from './notice.js';

state.postsListener = null;
let baoEditingId = null;
state.baoPostsCache = state.baoPostsCache || {};
state.baoLatestPostsVal = null;
let baoEditTimeoutId = null;
let baoViewTimeoutId = null;

function renderBaoBaibai() {
  const nameEl = document.getElementById("baoClassName");
  if (nameEl) {
    nameEl.textContent = (state.currentClassId && state.classesData[state.currentClassId])
      ? state.classesData[state.currentClassId].name
      : "—";
  }
  // The notice display/editor now lives on the Báo page — refresh it
  renderNotice();
}

function loadPosts() {
  if (state.postsListener) return;
  state.postsListener = onValue(postsRef, (snapshot) => {
    state.baoLatestPostsVal = snapshot.val();
    renderPostsList(state.baoLatestPostsVal);
  }, (error) => {
    console.error("Posts load error:", error);
  });
}

function renderPostsList(val) {
  const list = document.getElementById("baoPostsList");
  if (!list) return;
  // Cache posts for edit/view
  state.baoPostsCache = {};
  if (val) {
    Object.entries(val).forEach(([id, p]) => { state.baoPostsCache[id] = p; });
  }
  list.innerHTML = "";
  if (!val) {
    list.innerHTML = '<div class="bao-empty">Chưa có bài báo nào.</div>';
    return;
  }
  const posts = Object.entries(val)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  posts.forEach(p => {
    const card = document.createElement("article");
    card.className = "bao-post-card";
    const date = p.createdAt ? new Date(p.createdAt).toLocaleDateString("vi-VN") : "";
    const summary = p.summary || (p.content ? String(p.content).replace(/<[^>]+>/g, "").slice(0, 120) : "");
    card.innerHTML = `
      <div class="bao-post-main">
        <h3 class="bao-post-title">${escapeHtml(p.title || "Không tiêu đề")}</h3>
        <p class="bao-post-summary">${escapeHtml(summary)}</p>
        <div class="bao-post-meta">${escapeHtml(p.author || "Admin")} · ${escapeHtml(date)}</div>
      </div>
      <div class="bao-post-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-bao-action="view" data-bao-id="${p.id}">Đọc</button>
        ${state.isAdmin ? `
          <button type="button" class="btn btn-ghost btn-sm" data-bao-action="edit" data-bao-id="${p.id}">Sửa</button>
          <button type="button" class="btn btn-ghost btn-sm" data-bao-action="delete" data-bao-id="${p.id}">Xóa</button>` : ""}
      </div>
    `;
    // Click card body opens the post
    card.querySelector(".bao-post-main").addEventListener("click", () => openBaoView(p.id));
    card.querySelectorAll("[data-bao-action]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.baoAction;
        const id = btn.dataset.baoId;
        if (action === "view") openBaoView(id);
        else if (action === "edit") openBaoEditor(id);
        else if (action === "delete") deleteBaoPost(id);
      });
    });
    list.appendChild(card);
  });
}

function openBaoEditor(id) {
  if (!state.isAdmin) return;
  const modal = document.getElementById("baoEditModal");
  const titleEl = document.getElementById("baoEditTitle");
  const titleInput = document.getElementById("baoPostTitle");
  const summaryInput = document.getElementById("baoPostSummary");
  const contentInput = document.getElementById("baoPostContent");
  if (!modal) return;
  // Clear any pending close timeout to avoid modal auto-hiding
  if (baoEditTimeoutId) { clearTimeout(baoEditTimeoutId); baoEditTimeoutId = null; }
  baoEditingId = id || null;
  if (id) {
    // Edit existing: find post data from cache
    const posts = state.baoPostsCache || {};
    const p = posts[id] || {};
    titleEl.textContent = "Sửa bài báo";
    titleInput.value = p.title || "";
    summaryInput.value = p.summary || "";
    contentInput.value = p.content || "";
  } else {
    titleEl.textContent = "Viết bài báo";
    titleInput.value = "";
    summaryInput.value = "";
    contentInput.value = "";
  }
  modal.hidden = false;
  modal.offsetHeight;
  modal.classList.add("visible");
  titleInput.focus();
}

function closeBaoEditor() {
  const modal = document.getElementById("baoEditModal");
  if (!modal) return;
  modal.classList.remove("visible");
  if (baoEditTimeoutId) clearTimeout(baoEditTimeoutId);
  baoEditTimeoutId = setTimeout(() => { modal.hidden = true; baoEditTimeoutId = null; }, 200);
  baoEditingId = null;
}

function saveBaoPost() {
  if (!state.isAdmin) return;
  const title = document.getElementById("baoPostTitle").value.trim();
  const summary = document.getElementById("baoPostSummary").value.trim();
  const content = document.getElementById("baoPostContent").value.trim();
  if (!title) { showToast("Vui lòng nhập tiêu đề!", "warning"); return; }
  const data = {
    title,
    summary,
    content,
    author: state.currentUser && state.currentUser.email ? state.currentUser.email.split("@")[0] : "Admin",
    createdAt: baoEditingId && state.baoPostsCache[baoEditingId] ? state.baoPostsCache[baoEditingId].createdAt : Date.now(),
    updatedAt: Date.now()
  };
  if (baoEditingId) {
    update(ref(db, `trucNhatLop/posts/${baoEditingId}`), data)
      .then(() => closeBaoEditor())
      .catch(() => showToast("Không lưu được bài!", "error"));
  } else {
    data.createdAt = Date.now();
    push(postsRef, data)
      .then(() => closeBaoEditor())
      .catch(() => showToast("Không đăng được bài!", "error"));
  }
}

function deleteBaoPost(id) {
  if (!state.isAdmin) return;
  if (!confirm("Xóa bài báo này?")) return;
  remove(ref(db, `trucNhatLop/posts/${id}`)).catch(() => showToast("Không xóa được bài!", "error"));
}

function openBaoView(id) {
  const posts = state.baoPostsCache || {};
  const p = posts[id];
  const modal = document.getElementById("baoViewModal");
  if (!p || !modal) return;
  if (baoViewTimeoutId) { clearTimeout(baoViewTimeoutId); baoViewTimeoutId = null; }
  const date = p.createdAt ? new Date(p.createdAt).toLocaleString("vi-VN") : "";
  document.getElementById("baoViewTitle").textContent = p.title || "Không tiêu đề";
  document.getElementById("baoViewMeta").textContent = `${p.author || "Admin"} · ${date}`;
  // Plain-text content: use textContent so <, > and line breaks are preserved
  const bodyContent = p.content ? p.content : (p.summary || "");
  document.getElementById("baoViewBody").textContent = bodyContent;
  modal.hidden = false;
  modal.offsetHeight;
  modal.classList.add("visible");
}

function closeBaoView() {
  const modal = document.getElementById("baoViewModal");
  if (!modal) return;
  modal.classList.remove("visible");
  if (baoViewTimeoutId) clearTimeout(baoViewTimeoutId);
  baoViewTimeoutId = setTimeout(() => { modal.hidden = true; baoViewTimeoutId = null; }, 200);
}



// Wire Báo modals (close buttons, overlay click, Escape)
document.addEventListener('DOMContentLoaded', () => {
  const editModal = document.getElementById("baoEditModal");
  const viewModal = document.getElementById("baoViewModal");
  const editClose = document.getElementById("baoEditClose");
  const viewClose = document.getElementById("baoViewClose");
  if (editClose) editClose.addEventListener('click', closeBaoEditor);
  if (viewClose) viewClose.addEventListener('click', closeBaoView);
  [editModal, viewModal].forEach(m => {
    if (m) m.addEventListener('click', (e) => { if (e.target === m) { if (m === editModal) closeBaoEditor(); else closeBaoView(); } });
  });
  // Enter in title/summary saves
  ["baoPostTitle", "baoPostSummary"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); document.getElementById("baoPostContent").focus(); }
    });
  });
});


export {
  renderBaoBaibai,
  loadPosts,
  renderPostsList,
  openBaoEditor,
  closeBaoEditor,
  saveBaoPost,
  deleteBaoPost,
  openBaoView,
  closeBaoView
};
