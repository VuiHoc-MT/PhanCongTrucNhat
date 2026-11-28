import { state } from './state.js';
import { WEEK_BUTTERFLY_SVG, WEEK_BUTTERFLY_CONFIGS } from './constants.js';

function makeButterflyState(cfg) {
  return {
    x: 0, y: 0, vx: 0, vy: 0,
    tx: 0, ty: 0,
    retarget: 0,
    phase: Math.random() * Math.PI * 2,
    cfg: cfg,
    init: false
  };
}

function ensureWeekButterfly() {
  // Only show when the schedule (home) tab is active and a current week exists
  const homePanel = document.getElementById("panel-home");
  const th = document.querySelector(".schedule-table thead th.current-week-col");
  if (!homePanel || !homePanel.classList.contains("active") || !th) {
    stopWeekButterfly();
    return;
  }
  // Respect reduced-motion preference
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    stopWeekButterfly();
    return;
  }
  
  // Create the butterflies once
  if (state.weekButterflyEls.length === 0) {
    WEEK_BUTTERFLY_CONFIGS.forEach((cfg) => {
      const el = document.createElement("div");
      el.className = "week-fly-butterfly";
      el.setAttribute("aria-hidden", "true");
      el.innerHTML = WEEK_BUTTERFLY_SVG;
      el.style.width = (38 * cfg.scale) + "px";
      el.style.height = (38 * cfg.scale) + "px";
      el.style.filter = `hue-rotate(${cfg.hue}deg) drop-shadow(0 3px 4px rgba(2, 132, 199, 0.4))`;
      // Per-butterfly wing flap speed
      el.querySelectorAll(".bf-wing").forEach(w => { w.style.animationDuration = cfg.flap + "s"; });
      // Start offscreen to avoid a flash at (0,0)
      el.style.transform = "translate(-200px, -200px)";
      document.body.appendChild(el);
      state.weekButterflyEls.push(el);
      state.weekButterflyStates.push(makeButterflyState(cfg));
    });
  } else {
    state.weekButterflyEls.forEach(el => { el.style.display = "block"; });
  }
  
  // If already animating, keep flying (no reset)
  if (state.weekButterflyRAF) { state.weekButterflyCache.dirty = true; return; }
  state.weekButterflyLast = 0;
  state.weekButterflyCache.dirty = true;
  
  const loop = (now) => {
    const home = document.getElementById("panel-home");
    const currentTh = document.querySelector(".schedule-table thead th.current-week-col");
    if (!home || !home.classList.contains("active") || !currentTh) {
      stopWeekButterfly();
      return;
    }
    
    // Recompute the flight bounds only when dirty (scroll/resize/render)
    if (state.weekButterflyCache.dirty || !state.weekButterflyCache.bounds) {
      const thRect = currentTh.getBoundingClientRect();
      const colIndex = currentTh.cellIndex;
      let colBottom = thRect.bottom;
      const rows = document.querySelectorAll("#scheduleBody tr");
      if (rows.length && colIndex >= 0) {
        const lastRow = rows[rows.length - 1];
        const cell = lastRow.children[colIndex];
        if (cell) colBottom = cell.getBoundingClientRect().bottom;
      }
      
      const wrapper = document.querySelector(".table-wrapper");
      const wrapRect = wrapper ? wrapper.getBoundingClientRect() : null;
      
      const padX = 24;
      let minX = thRect.left - padX;
      let maxX = thRect.right + padX;
      let minY = thRect.top - 16;
      let maxY = Math.max(thRect.top + 90, colBottom);
      if (wrapRect) {
        minX = Math.max(minX, wrapRect.left + 4);
        maxX = Math.min(maxX, wrapRect.right - 4);
        minY = Math.max(minY, wrapRect.top + 4);
        maxY = Math.min(maxY, wrapRect.bottom - 4);
      }
      state.weekButterflyCache.bounds = { minX, maxX, minY, maxY };
      state.weekButterflyCache.dirty = false;
    }
    
    const bounds = state.weekButterflyCache.bounds;
    // If the current week column is scrolled out of view, hide butterflies
    if (bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
      state.weekButterflyEls.forEach(el => { el.style.display = "none"; });
      state.weekButterflyRAF = requestAnimationFrame(loop);
      return;
    }
    
    const dt = state.weekButterflyLast ? Math.min(0.05, (now - state.weekButterflyLast) / 1000) : 0.016;
    state.weekButterflyLast = now;
    state.weekButterflyEls.forEach(el => { if (el.style.display === "none") el.style.display = "block"; });
    
    state.weekButterflyStates.forEach((st, i) => {
      const el = state.weekButterflyEls[i];
      const cfg = st.cfg;
      
      if (!st.init) {
        st.x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
        st.y = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
        st.tx = st.x;
        st.ty = st.y;
        st.retarget = Math.random() * 0.5;
        st.init = true;
      }
      
      // Pick a new wander target now and then
      st.retarget -= dt;
      const distT = Math.hypot(st.tx - st.x, st.ty - st.y);
      if (st.retarget <= 0 || distT < 10) {
        st.tx = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
        st.ty = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
        st.retarget = 0.7 + Math.random() * 1.8;
      }
      
      // Steer toward target (smooth velocity change)
      const maxSpeed = 62 * cfg.speed; // px per second
      const dx = st.tx - st.x;
      const dy = st.ty - st.y;
      const d = Math.hypot(dx, dy) || 1;
      const desiredVx = (dx / d) * maxSpeed;
      const desiredVy = (dy / d) * maxSpeed;
      const steer = Math.min(1, dt * 2.4);
      st.vx += (desiredVx - st.vx) * steer;
      st.vy += (desiredVy - st.vy) * steer;
      
      // Flutter: perpendicular wobble + vertical bob
      st.phase += dt * (7 + cfg.speed * 2.5);
      const sp = Math.hypot(st.vx, st.vy) || 1;
      const perpX = -st.vy / sp;
      const perpY = st.vx / sp;
      const wobble = Math.sin(st.phase) * 16 * cfg.bob;
      const bob = Math.cos(st.phase * 1.3) * 9 * cfg.bob;
      
      let nx = st.x + (st.vx + perpX * wobble) * dt;
      let ny = st.y + (st.vy + perpY * wobble + bob) * dt;
      
      // Soft bounce against bounds
      if (nx < bounds.minX) { nx = bounds.minX; st.vx = Math.abs(st.vx); }
      if (nx > bounds.maxX) { nx = bounds.maxX; st.vx = -Math.abs(st.vx); }
      if (ny < bounds.minY) { ny = bounds.minY; st.vy = Math.abs(st.vy); }
      if (ny > bounds.maxY) { ny = bounds.maxY; st.vy = -Math.abs(st.vy); }
      st.x = nx;
      st.y = ny;
      
      // Face travel direction (SVG points up by default) + gentle wobble
      const heading = Math.atan2(st.vy, st.vx) * 180 / Math.PI + 90;
      const rot = heading + Math.sin(st.phase * 0.7) * 12;
      const half = 19 * cfg.scale;
      el.style.transform = `translate(${st.x - half}px, ${st.y - half}px) rotate(${rot}deg)`;
    });
    
    state.weekButterflyRAF = requestAnimationFrame(loop);
  };
  state.weekButterflyRAF = requestAnimationFrame(loop);
}

function stopWeekButterfly() {
  if (state.weekButterflyRAF) {
    cancelAnimationFrame(state.weekButterflyRAF);
    state.weekButterflyRAF = null;
  }
  state.weekButterflyLast = 0;
  state.weekButterflyEls.forEach(el => { el.style.display = "none"; });
  state.weekButterflyStates.forEach(st => { st.init = false; });
}

// Pause butterfly animation when tab is hidden (save CPU/battery)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state.weekButterflyRAF) {
      cancelAnimationFrame(state.weekButterflyRAF);
      state.weekButterflyRAF = null;
    }
  } else {
    // Resume if home tab is active
    const homePanel = document.getElementById("panel-home");
    if (homePanel && homePanel.classList.contains("active") && !state.weekButterflyRAF) {
      ensureWeekButterfly();
    }
  }
});



export { makeButterflyState, ensureWeekButterfly, stopWeekButterfly };
