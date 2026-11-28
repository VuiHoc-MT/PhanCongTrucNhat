import { renderPostsList, loadPosts } from './bao.js';
import { updateChatIdentityUI, loadChat } from './chat.js';
import { stopRandomDraw } from './random.js';
import { showLoginPage } from './auth.js';
import { state } from './state.js';
import { ensureWeekButterfly, stopWeekButterfly } from './butterfly.js';
import { renderRandomBoard } from './random.js';
import { renderBaoBaibai } from './bao.js';

state.currentTab = 'about';
state.publicBrowsing = false;
state.pendingHashTab = (window.location.hash || '').replace('#', '');

function switchTab(tabName) {
  // Ignore invalid tabs (e.g. stray hash like #mainContent) so we never hide all panels
  const validTabs = ['about', 'home', 'request', 'random', 'chat', 'bao', 'admin-guests'];
  if (!validTabs.includes(tabName)) return;
  if (tabName === state.currentTab) return;
  
  // Protected tabs require login (home/random/chat/bao/admin-guests); about & request are public
  const protectedTabs = ['home', 'random', 'chat', 'bao', 'admin-guests'];
  if (protectedTabs.includes(tabName) && !state.isAdmin && !state.isGuest) {
    showLoginPage();
    return;
  }
  if (tabName === 'admin-guests' && !state.isAdmin) {
    return;
  }
  
  document.querySelectorAll('.nav-tab').forEach(btn => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });
  
  document.querySelectorAll('.tab-panel').forEach(panel => {
    const isActive = panel.id === `panel-${tabName}`;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
    if (isActive) {
      // Remove tabindex to avoid focus outline on section
      panel.removeAttribute('tabindex');
    }
  });
  
  state.currentTab = tabName;
  // Sync URL hash so reload keeps the current tab
  try { history.replaceState(null, "", "#" + tabName); } catch (e) {}
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  // Lazy-render feature pages when opened
  if (tabName === 'home') {
    ensureWeekButterfly();
  } else {
    stopWeekButterfly();
    // Leaving the random tab cancels any in-progress draw
    if (tabName !== 'random') {
      stopRandomDraw();
    }
    if (tabName === 'random') {
      renderRandomBoard();
    } else if (tabName === 'chat') {
      updateChatIdentityUI();
      loadChat();
      setTimeout(() => {
        const ci = document.getElementById("chatInput");
        if (ci) ci.focus();
      }, 100);
    } else if (tabName === 'bao') {
      renderBaoBaibai();
      loadPosts();
      renderPostsList(state.baoLatestPostsVal);
    }
  }
  
  setTimeout(() => {
    observeRevealElements();
    animateCounters();
    // Fallback for about page: ensure feature cards become visible
    if (tabName === 'about') {
      setTimeout(() => {
        document.querySelectorAll('#panel-about .scroll-reveal:not(.revealed)').forEach(el => {
          el.classList.add('revealed');
        });
      }, 500);
    }
  }, 50);
}

window.switchTab = switchTab;

document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.querySelector('.nav-brand').addEventListener('click', (e) => {
  e.preventDefault();
  switchTab((state.isAdmin || state.isGuest) ? 'home' : 'about');
});



export { switchTab };
