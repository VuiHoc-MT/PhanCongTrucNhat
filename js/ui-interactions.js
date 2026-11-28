import { clearTapSelection, renderAll, updateStudentDragList } from './ui-common.js';
import { confirmClassModal, openClassModal } from './classes.js';
import { switchTab } from './navigation.js';
import { state } from './state.js';
import { toggleDropdown, closeDropdown } from './ui-common.js';
import { closeClassModal } from './classes.js';
import { closeRandomWinner } from './random.js';
import { closeBaoEditor, closeBaoView } from './bao.js';
import { hideLoginPage } from './auth.js';

// ===========================================
// DROPDOWN EVENTS
// ===========================================
document.addEventListener('DOMContentLoaded', () => {
  const dropdownBtn = document.getElementById("classDropdownBtn");
  const addClassBtn = document.getElementById("addClassBtn");
  const manageClassesBtn = document.getElementById("manageClassesBtn");
  const modal = document.getElementById("classModal");
  const modalClose = document.getElementById("classModalClose");
  const modalCancel = document.getElementById("classModalCancel");
  const modalConfirm = document.getElementById("classModalConfirm");
  
  if (dropdownBtn) {
    dropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown();
    });
  }
  
  if (addClassBtn) {
    addClassBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeDropdown();
      openClassModal("add");
    });
  }
  
  if (manageClassesBtn) {
    manageClassesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeDropdown();
      openClassModal("manage");
    });
  }
  
  if (modalClose) modalClose.addEventListener('click', closeClassModal);
  if (modalCancel) modalCancel.addEventListener('click', closeClassModal);
  if (modalConfirm) modalConfirm.addEventListener('click', confirmClassModal);
  
  // Enter key confirms modal input
  const newClassNameInputEl = document.getElementById("newClassNameInput");
  const renameClassInputEl = document.getElementById("renameClassInput");
  [newClassNameInputEl, renameClassInputEl].forEach(input => {
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmClassModal();
        }
      });
    }
  });
  
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeClassModal();
    });
  }
  
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById("classSelector");
    const menu = document.getElementById("classDropdownMenu");
    const btn = document.getElementById("classDropdownBtn");
    if (dropdown && menu && btn && !dropdown.contains(e.target)) {
      closeDropdown();
    }
  });
});

// ===========================================
// ADMIN PANEL TOGGLE
// ===========================================
const adminPanelToggle = document.getElementById("adminPanelToggle");
const adminPanel = document.getElementById("adminPanel");
const adminPanelOpenBtn = document.getElementById("adminPanelOpenBtn");
if (adminPanelToggle && adminPanel) {
  adminPanelToggle.addEventListener('click', () => {
    const isOpen = adminPanel.classList.toggle("is-open");
    adminPanelToggle.setAttribute("aria-expanded", isOpen);
    adminPanelToggle.setAttribute("aria-label", isOpen ? "Đóng bảng điều khiển" : "Mở bảng điều khiển");
    adminPanel.inert = !isOpen;
    if (adminPanelOpenBtn) {
      adminPanelOpenBtn.classList.toggle("hidden", isOpen);
    }
  });
}

if (adminPanelOpenBtn && adminPanel) {
  adminPanelOpenBtn.addEventListener('click', () => {
    adminPanel.classList.add("is-open");
    adminPanel.inert = false;
    adminPanelOpenBtn.classList.add("hidden");
    if (adminPanelToggle) {
      adminPanelToggle.setAttribute("aria-expanded", "true");
      adminPanelToggle.setAttribute("aria-label", "Đóng bảng điều khiển");
    }
  });
}

// ===========================================
// ADMIN PANEL TABS
// ===========================================
document.addEventListener('DOMContentLoaded', () => {
  const adminTabs = document.querySelectorAll('.admin-panel-tab');
  const adminTabPanels = document.querySelectorAll('.admin-tabpanel');
  
  adminTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.adminTab;
      
      adminTabs.forEach(t => {
        const isActive = t.dataset.adminTab === targetTab;
        t.classList.toggle('active', isActive);
        t.setAttribute('aria-selected', isActive);
      });
      
      adminTabPanels.forEach(panel => {
        const isActive = panel.id === `admin-tab-${targetTab}`;
        panel.classList.toggle('active', isActive);
        panel.hidden = !isActive;
      });
      
      if (targetTab === 'dragdrop') {
        updateStudentDragList();
      }
    });
  });
});



// SCROLL UI
// ===========================================
const topNav = document.getElementById('topNav');
const scrollProgress = document.getElementById('scrollProgress');
const backToTop = document.getElementById('backToTop');

function updateScrollUI() {
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const scrollPercent = scrollHeight > 0 ? scrollTop / scrollHeight : 0;
  
  if (scrollProgress) {
    scrollProgress.style.transform = `scaleX(${scrollPercent})`;
  }
  
  if (topNav) {
    topNav.classList.toggle('scrolled', scrollTop > 20);
  }
  
  if (backToTop) {
    backToTop.hidden = scrollTop < 300;
    backToTop.classList.toggle('visible', scrollTop >= 300);
  }
}

let scrollTicking = false;
window.addEventListener('scroll', () => {
  if (!scrollTicking) {
    requestAnimationFrame(() => {
      updateScrollUI();
      scrollTicking = false;
    });
    scrollTicking = true;
  }
}, { passive: true });

backToTop?.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ===========================================
// SCROLL REVEAL
// ===========================================
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
      revealObserver.unobserve(entry.target);
    }
  });
}, {
  root: null,
  rootMargin: '0px 0px -50px 0px',
  threshold: 0.1
});

function observeRevealElements() {
  document.querySelectorAll('.scroll-reveal:not(.revealed)').forEach(el => {
    revealObserver.observe(el);
  });
}

// ===========================================
// COUNTER ANIMATION
// ===========================================
function animateCounters() {
  document.querySelectorAll('.stat-number[data-count]').forEach(el => {
    if (el.dataset.animated === 'true' || el.dataset.observing === 'true') return;
    
    const target = parseInt(el.dataset.count, 10);
    const duration = 1500;
    const startTime = performance.now();
    
    function updateCounter(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(target * eased);
      el.textContent = current.toLocaleString();
      
      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      } else {
        el.textContent = target.toLocaleString();
        el.dataset.animated = 'true';
      }
    }
    
    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          requestAnimationFrame(updateCounter);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    
    el.dataset.observing = 'true';
    counterObserver.observe(el);
  });
}

// ===========================================
// KEYBOARD NAVIGATION
// ===========================================
document.addEventListener('keydown', (e) => {
  if (e.target.closest('.nav-tabs')) {
    const tabs = Array.from(document.querySelectorAll('.nav-tab'));
    const currentIndex = tabs.findIndex(t => t.classList.contains('active'));
    let nextIndex = currentIndex;
    
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % tabs.length;
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      e.preventDefault();
    } else if (e.key === 'Home') {
      nextIndex = 0;
      e.preventDefault();
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
      e.preventDefault();
    }
    
    if (nextIndex !== currentIndex) {
      tabs[nextIndex].focus();
      switchTab(tabs[nextIndex].dataset.tab);
    }
  }
});

// ===========================================
// GLOBAL ESCAPE HANDLER (single consolidated listener)
// ===========================================
function handleGlobalEscape(e) {
  if (e.key !== 'Escape') return;
  
  // 1. Close open modals (baoEditModal, baoViewModal, classModal, loginPage)
  const baoEdit = document.getElementById("baoEditModal");
  const baoView = document.getElementById("baoViewModal");
  const classModalEl = document.getElementById("classModal");
  const loginPageEl = document.getElementById("loginPage");
  
  if (baoEdit && baoEdit.classList.contains("visible")) { closeBaoEditor(); return; }
  if (baoView && baoView.classList.contains("visible")) { closeBaoView(); return; }
  if (classModalEl && classModalEl.classList.contains("visible")) { closeClassModal(); return; }
  if (loginPageEl && !loginPageEl.classList.contains("hidden")) { hideLoginPage(); state.publicBrowsing = true; return; }
  
  // 2. Close class dropdown or random winner popup
  const dropdownMenu = document.getElementById("classDropdownMenu");
  if (dropdownMenu && !dropdownMenu.classList.contains("hidden")) { closeDropdown(); return; }
  const winnerPopup = document.getElementById("randomWinner");
  if (winnerPopup && winnerPopup.classList.contains("show")) { closeRandomWinner(); return; }
  
  // 3. Cancel tap-to-assign selection
  if (state.tapSelectedStudent) { clearTapSelection(); renderAll(); return; }
  
  // 4. Nothing open — switch to home (or about if not logged in)
  if (state.currentTab !== 'home' && state.currentTab !== 'about') {
    if (!state.isAdmin && !state.isGuest) {
      switchTab('about');
    } else {
      switchTab('home');
      document.querySelector('.nav-tab[data-tab="home"]')?.focus();
    }
  }
}
document.addEventListener('keydown', handleGlobalEscape);



export {
  updateScrollUI,
  observeRevealElements,
  animateCounters,
  handleGlobalEscape
};
