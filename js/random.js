import { state } from './state.js';
import {
  CORAL_COLORS, createCoralSVG, RANDOM_BRANCH_LEFT_SVG, RANDOM_BRANCH_RIGHT_SVG,
  RANDOM_BF_SVG, RANDOM_BF_HUES, RANDOM_MAX_BUTTERFLIES
} from './constants.js';
import { toArray, escapeHtml, showToast } from './utils.js';

function stopRandomDraw() {
  state.randomSpinning = false;
  if (state.randomRAF) { cancelAnimationFrame(state.randomRAF); state.randomRAF = null; }
  if (state.randomDrawTimer) { clearTimeout(state.randomDrawTimer); state.randomDrawTimer = null; }
  if (state.randomCountdownTimer) { clearInterval(state.randomCountdownTimer); state.randomCountdownTimer = null; }
}

function renderRandomBoard() {
  const board = document.getElementById("randomBoard");
  if (!board) return;
  stopRandomDraw();
  board.innerHTML = "";
  state.randomNames = toArray(state.currentClassData.students);
  state.randomFlowers = [];
  state.randomButterflies = [];

  // Seaweed on both sides
  const branches = document.createElement("div");
  branches.className = "random-branches";
  branches.innerHTML = RANDOM_BRANCH_LEFT_SVG + RANDOM_BRANCH_RIGHT_SVG;
  board.appendChild(branches);

  if (state.randomNames.length === 0) {
    const empty = document.createElement("p");
    empty.className = "random-empty";
    empty.textContent = "Chưa có học sinh trong lớp này.";
    board.appendChild(empty);
  } else {
    // Each student = a coral with a name tag (fish gathering target)
    const shuffledColors = [...CORAL_COLORS].sort(() => Math.random() - 0.5);
    const positions = computeScatterPositions(state.randomNames.length);
    state.randomNames.forEach((name, i) => {
      const color = shuffledColors[i % shuffledColors.length];
      const container = document.createElement("div");
      container.className = "flower-container coral-container";
      container.dataset.name = name;
      container.dataset.idx = i;
      container.style.left = positions[i].x + "%";
      container.style.top = positions[i].y + "%";
      container.style.transform = "translate(-50%, -50%)";
      container.style.opacity = "1";
      
      const coral = document.createElement("div");
      coral.className = "coral-svg-wrap";
      coral.innerHTML = createCoralSVG(color, i);
      container.appendChild(coral);
      
      const tag = document.createElement("span");
      tag.className = "flower-tag coral-tag";
      tag.textContent = name;
      tag.style.background = color;
      container.appendChild(tag);
      
      const badge = document.createElement("span");
      badge.className = "perch-count";
      badge.textContent = "0";
      container.appendChild(badge);
      
      board.appendChild(container);
      state.randomFlowers.push({
        el: container, flowerEl: coral, tagEl: tag, badgeEl: badge,
        name: name, color: color, idx: i
      });
    });
  }

  // Fish layer (above corals)
  const layer = document.createElement("div");
  layer.id = "randomButterflies";
  layer.className = "random-butterflies random-fish-layer";
  board.appendChild(layer);

  // Countdown timer badge
  const timerEl = document.createElement("div");
  timerEl.id = "randomTimer";
  timerEl.className = "random-timer hidden";
  timerEl.setAttribute("aria-live", "polite");
  board.appendChild(timerEl);

  buildButterflyPool();
}

function buildButterflyPool() {
  const layer = document.getElementById("randomButterflies");
  if (!layer) return;
  for (let i = 0; i < RANDOM_MAX_BUTTERFLIES; i++) {
    const el = document.createElement("div");
    el.className = "random-bf random-fish";
    el.innerHTML = RANDOM_BF_SVG;
    const color = RANDOM_BF_HUES[i % RANDOM_BF_HUES.length];
    const size = 34 + (i % 3) * 4;
    el.style.width = size + "px";
    el.style.height = size + "px";
    el.style.color = color;
    el.style.filter = `drop-shadow(0 2px 3px rgba(0,0,0,0.35))`;
    el.style.display = "none";
    layer.appendChild(el);
    state.randomButterflies.push({
      el, x: -100, y: -100, vx: 0, vy: 0, tx: 0, ty: 0,
      mode: "perched", phase: Math.random() * Math.PI * 2,
      size, hue: i, color, assigned: -1, fakeIdx: -1, retarget: 0,
      landStartTime: 0, landEndTime: 0, landStartX: 0, landStartY: 0,
      landOffX: 0, landOffY: 0, rot: 0, landed: false
    });
  }
}

function butterflyLayerRect() {
  const layer = document.getElementById("randomButterflies");
  const board = document.getElementById("randomBoard");
  const el = layer || board;
  return el ? el.getBoundingClientRect() : { width: 0, height: 0, left: 0, top: 0 };
}

function applyButterflyTransform(bf) {
  const half = bf.size / 2;
  bf.el.style.transform = `translate(${bf.x - half}px, ${bf.y - half}px) rotate(${bf.rot}deg)`;
}

function updateButterflyMove(bf, dt, bounds) {
  const maxSpeed = 80;
  const dx = bf.tx - bf.x;
  const dy = bf.ty - bf.y;
  const d = Math.hypot(dx, dy) || 1;
  const desiredVx = (dx / d) * maxSpeed;
  const desiredVy = (dy / d) * maxSpeed;
  const steer = Math.min(1, dt * 3);
  bf.vx += (desiredVx - bf.vx) * steer;
  bf.vy += (desiredVy - bf.vy) * steer;

  bf.phase += dt * (9 + (bf.hue % 5));
  const sp = Math.hypot(bf.vx, bf.vy) || 1;
  const perpX = -bf.vy / sp;
  const perpY = bf.vx / sp;
  const wobble = Math.sin(bf.phase) * 11;

  let nx = bf.x + (bf.vx + perpX * wobble) * dt;
  let ny = bf.y + (bf.vy + perpY * wobble) * dt;

  if (nx < 6) { nx = 6; bf.vx = Math.abs(bf.vx); }
  if (nx > bounds.w - 6) { nx = bounds.w - 6; bf.vx = -Math.abs(bf.vx); }
  if (ny < 6) { ny = 6; bf.vy = Math.abs(bf.vy); }
  if (ny > bounds.h - 6) { ny = bounds.h - 6; bf.vy = -Math.abs(bf.vy); }
  bf.x = nx;
  bf.y = ny;
  bf.rot = Math.atan2(bf.vy, bf.vx) * 180 / Math.PI + Math.sin(bf.phase) * 9;
}

// Compute non-overlapping-ish scatter positions (percent) on the board
function computeScatterPositions(count) {
  const positions = [];
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ r, c });
    }
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const padX = 10, padY = 12;
  const usableW = 100 - padX * 2;
  const usableH = 100 - padY * 2;
  for (let i = 0; i < count; i++) {
    const cell = cells[i % cells.length];
    const jitterX = (Math.random() - 0.5) * (usableW / cols) * 0.5;
    const jitterY = (Math.random() - 0.5) * (usableH / rows) * 0.5;
    const x = padX + (cell.c + 0.5) * (usableW / cols) + jitterX;
    const y = padY + (cell.r + 0.5) * (usableH / rows) + jitterY;
    positions.push({
      x: Math.max(6, Math.min(85, x)),
      y: Math.max(8, Math.min(88, y)),
      r: (Math.random() - 0.5) * 12
    });
  }
  return positions;
}

// Recompute flower positions on resize/orientation change during a draw
window.addEventListener('resize', () => {
  if (state.randomSpinning && state.randomDrawState && state.randomDrawState.recomputeFlowerPositions) {
    state.randomDrawState.recomputeFlowerPositions();
  }
});

function startRandomDraw() {
  if (state.randomSpinning) return;
  const board = document.getElementById("randomBoard");
  const winnerBox = document.getElementById("randomWinner");
  if (!board) return;

  const names = toArray(state.currentClassData.students);
  if (names.length === 0 || state.randomFlowers.length === 0) {
    showToast("Chưa có học sinh trong lớp này!", "warning");
    return;
  }

  const durSelect = document.getElementById("randomDuration");
  const durationSec = durSelect ? (parseInt(durSelect.value, 10) || 5) : 5;
  const totalMs = durationSec * 1000;

  state.randomSpinning = true;
  if (winnerBox) winnerBox.classList.remove("show");
  state.randomFlowers.forEach(f => {
    f.el.classList.remove("winner");
    if (f.badgeEl) { f.badgeEl.textContent = "0"; f.badgeEl.classList.remove("show"); }
  });

  // Number of butterflies scales with duration
  let N = Math.round(4 + durationSec * 0.8);
  N = Math.max(3, Math.min(RANDOM_MAX_BUTTERFLIES, N));
  // Handle single student: just 1 butterfly
  if (state.randomFlowers.length === 1) N = 1;
  else N = Math.max(3, Math.min(N, state.randomFlowers.length * 2));

  const winnerIdx = Math.floor(Math.random() * state.randomFlowers.length);

  // Distribute butterflies: winner flower gets a plurality
  const winnerCount = Math.max(2, Math.ceil(N * 0.4));
  const assignments = [];
  for (let i = 0; i < winnerCount; i++) assignments.push(winnerIdx);
  const counts = {};
  counts[winnerIdx] = winnerCount;
  let remaining = N - winnerCount;
  while (remaining > 0) {
    const candidates = [];
    for (let t = 0; t < state.randomFlowers.length; t++) {
      if (t === winnerIdx) continue;
      if ((counts[t] || 0) < winnerCount - 1) candidates.push(t);
    }
    if (candidates.length === 0) { assignments.push(winnerIdx); remaining--; continue; }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    assignments.push(pick);
    counts[pick] = (counts[pick] || 0) + 1;
    remaining--;
  }
  for (let i = assignments.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [assignments[i], assignments[j]] = [assignments[j], assignments[i]];
  }

  // Flower positions relative to butterfly layer
  const rect = butterflyLayerRect();
  const bounds = { w: rect.width, h: rect.height };
  const flowerPositions = {};
  state.randomFlowers.forEach((f, idx) => {
    const r = f.el.getBoundingClientRect();
    flowerPositions[idx] = {
      x: r.left - rect.left + r.width / 2,
      y: r.top - rect.top + r.height * 0.32
    };
  });

  const startTime = performance.now();
  state.randomDrawStart = startTime;

  // Timing: wander then land; fake landing in the last 2 seconds
  const wanderMs = totalMs * 0.35;
  const landingMs = totalMs - wanderMs;
  const fakeStart = Math.max(wanderMs, totalMs - 2000); // last 2 seconds

  const timerEl = document.getElementById("randomTimer");
  if (timerEl) { timerEl.classList.remove("hidden"); timerEl.textContent = "⏱ " + durationSec + "s"; }

  state.randomButterflies.forEach((bf, i) => {
    if (i < N) {
      bf.el.style.display = "block";
      bf.el.classList.remove("landed");
      bf.landed = false;
      bf.finalStarted = false;
      bf.mode = "flying";
      bf.assigned = assignments[i];
      bf.phase = Math.random() * Math.PI * 2;
      bf.vx = 0; bf.vy = 0;
      bf.x = 20 + Math.random() * Math.max(1, bounds.w - 40);
      bf.y = 20 + Math.random() * Math.max(1, bounds.h - 40);
      bf.tx = 20 + Math.random() * Math.max(1, bounds.w - 40);
      bf.ty = 20 + Math.random() * Math.max(1, bounds.h - 40);
      bf.retarget = 0.3 + Math.random() * 0.6;
      // Fake landing: pick a different flower to hover near before the real one
      bf.fakeIdx = (assignments[i] + 1 + Math.floor(Math.random() * (state.randomFlowers.length - 1))) % state.randomFlowers.length;
      bf.landStartTime = wanderMs;
      const p = N === 1 ? 1 : (i + 1) / N;
      // Ensure each butterfly has at least 500ms to approach its flower
      bf.landEndTime = Math.max(wanderMs + 500, wanderMs + p * landingMs);
      bf.landOffX = (Math.random() - 0.5) * 22;
      bf.landOffY = (Math.random() - 0.5) * 10;
      bf.landStartX = bf.x;
      bf.landStartY = bf.y;
      applyButterflyTransform(bf);
    } else {
      bf.el.style.display = "none";
      bf.mode = "perched";
    }
  });

  state.randomDrawState = { N, winnerIdx, bounds, flowerPositions, fakeStart, totalMs, last: 0 };
  // Expose recompute function for resize handling
  state.randomDrawState.recomputeFlowerPositions = () => {
    const rect2 = butterflyLayerRect();
    state.randomDrawState.bounds = { w: rect2.width, h: rect2.height };
    state.randomFlowers.forEach((f, idx) => {
      const r = f.el.getBoundingClientRect();
      state.randomDrawState.flowerPositions[idx] = {
        x: r.left - rect2.left + r.width / 2,
        y: r.top - rect2.top + r.height * 0.32
      };
    });
  };

  if (state.randomDrawTimer) { clearTimeout(state.randomDrawTimer); state.randomDrawTimer = null; }
  if (state.randomCountdownTimer) { clearInterval(state.randomCountdownTimer); state.randomCountdownTimer = null; }
  state.randomDrawTimer = setTimeout(() => { forceFinishRandom(); }, totalMs + 200);
  const countStart = Date.now();
  state.randomCountdownTimer = setInterval(() => {
    const remain = Math.max(0, totalMs - (Date.now() - countStart));
    if (timerEl) timerEl.textContent = "⏱ " + (remain / 1000).toFixed(1) + "s";
    if (remain <= 0 && state.randomCountdownTimer) { clearInterval(state.randomCountdownTimer); state.randomCountdownTimer = null; }
  }, 100);

  if (state.randomRAF) cancelAnimationFrame(state.randomRAF);
  state.randomRAF = requestAnimationFrame(drawLoop);
}

function drawLoop(now) {
  if (!state.randomSpinning || !state.randomDrawState) return;
  const st = state.randomDrawState;
  const elapsed = now - state.randomDrawStart;
  const dt = st.last ? Math.min(0.05, (now - st.last) / 1000) : 0.016;
  st.last = now;

  let allLanded = true;
  for (let i = 0; i < st.N; i++) {
    const bf = state.randomButterflies[i];
    if (bf.landed) continue;

    if (bf.mode === "flying") {
      if (elapsed >= bf.landStartTime) {
        bf.mode = "landing";
        bf.landStartX = bf.x;
        bf.landStartY = bf.y;
      } else {
        bf.retarget -= dt;
        const dTarget = Math.hypot(bf.tx - bf.x, bf.ty - bf.y);
        if (bf.retarget <= 0 || dTarget < 24) {
          bf.tx = 20 + Math.random() * Math.max(1, st.bounds.w - 40);
          bf.ty = 20 + Math.random() * Math.max(1, st.bounds.h - 40);
          bf.retarget = 0.4 + Math.random() * 0.8;
        }
        updateButterflyMove(bf, dt, st.bounds);
      }
    }

    if (bf.mode === "landing") {
      const realTgt = st.flowerPositions[bf.assigned] || { x: st.bounds.w / 2, y: st.bounds.h / 2 };
      const realX = realTgt.x + bf.landOffX;
      const realY = realTgt.y + bf.landOffY;

      if (elapsed >= bf.landEndTime) {
        // Settle on the real assigned flower
        bf.x = realX;
        bf.y = realY;
        bf.rot = 0;
        bf.mode = "landed";
        bf.landed = true;
        bf.el.classList.add("landed");
        const flower = state.randomFlowers[bf.assigned];
        if (flower && flower.badgeEl) {
          const c = (parseInt(flower.badgeEl.textContent) || 0) + 1;
          flower.badgeEl.textContent = c;
          flower.badgeEl.classList.add("show");
        }
      } else if (elapsed >= bf.landEndTime - 500) {
        // Final approach (last 500ms): interpolate quickly to the REAL flower
        if (!bf.finalStarted) { bf.finalStarted = true; bf.finalStartX = bf.x; bf.finalStartY = bf.y; }
        const t = Math.max(0, Math.min(1, (elapsed - (bf.landEndTime - 500)) / 500));
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        bf.x = bf.finalStartX + (realX - bf.finalStartX) * e;
        bf.y = bf.finalStartY + (realY - bf.finalStartY) * e;
        const dx = realX - bf.finalStartX, dy = realY - bf.finalStartY;
        bf.rot = Math.atan2(dy, dx) * 180 / Math.PI;
      } else {
        // Before final approach: fake landing (hover near a wrong flower) or home toward assigned
        let targetFlower = bf.assigned;
        if (elapsed >= st.fakeStart) targetFlower = bf.fakeIdx;
        const tgt = st.flowerPositions[targetFlower] || { x: st.bounds.w / 2, y: st.bounds.h / 2 };
        bf.tx = tgt.x + bf.landOffX;
        bf.ty = tgt.y + bf.landOffY;
        updateButterflyMove(bf, dt, st.bounds);
      }
    }

    applyButterflyTransform(bf);

    if (!bf.landed) allLanded = false;
  }

  if (allLanded) {
    finishDraw(st.winnerIdx);
    return;
  }
  state.randomRAF = requestAnimationFrame(drawLoop);
}

function forceFinishRandom() {
  if (!state.randomSpinning || !state.randomDrawState) return;
  const st = state.randomDrawState;
  for (let i = 0; i < st.N; i++) {
    const bf = state.randomButterflies[i];
    if (!bf.landed) {
      const tgt = st.flowerPositions[bf.assigned] || { x: st.bounds.w / 2, y: st.bounds.h / 2 };
      bf.x = tgt.x + bf.landOffX;
      bf.y = tgt.y + bf.landOffY;
      bf.rot = 0;
      bf.mode = "landed";
      bf.landed = true;
      bf.el.classList.add("landed");
      applyButterflyTransform(bf);
      const flower = state.randomFlowers[bf.assigned];
      if (flower && flower.badgeEl) {
        const c = (parseInt(flower.badgeEl.textContent) || 0) + 1;
        flower.badgeEl.textContent = c;
        flower.badgeEl.classList.add("show");
      }
    }
  }
  finishDraw(st.winnerIdx);
}

function finishDraw(winnerIdx) {
  state.randomSpinning = false;
  if (state.randomRAF) { cancelAnimationFrame(state.randomRAF); state.randomRAF = null; }
  if (state.randomDrawTimer) { clearTimeout(state.randomDrawTimer); state.randomDrawTimer = null; }
  if (state.randomCountdownTimer) { clearInterval(state.randomCountdownTimer); state.randomCountdownTimer = null; }
  const timerEl = document.getElementById("randomTimer");
  if (timerEl) timerEl.classList.add("hidden");

  state.randomFlowers.forEach((f, idx) => {
    if (idx === winnerIdx) {
      f.el.classList.add("winner");
      if (f.badgeEl) { f.badgeEl.textContent = "👑"; f.badgeEl.classList.add("show"); }
    }
  });

  const winnerFlower = state.randomFlowers[winnerIdx];
  const winnerName = winnerFlower ? winnerFlower.name : "";
  const winnerBox = document.getElementById("randomWinner");
  if (winnerBox) {
    winnerBox.querySelector(".winner-name").textContent = winnerName;
    winnerBox.classList.add("show");
    launchConfetti(winnerBox);
  }
}

function launchConfetti(container) {
  // Clear any leftover confetti from a previous draw
  container.querySelectorAll('.confetti-piece').forEach(el => el.remove());
  const colors = ["#0284c7", "#06b6d4", "#f472b6", "#f59e0b", "#10b981", "#6366f1"];
  for (let i = 0; i < 40; i++) {
    const c = document.createElement("span");
    c.className = "confetti-piece";
    c.style.left = Math.random() * 100 + "%";
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDelay = Math.random() * 0.3 + "s";
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(c);
    setTimeout(() => c.remove(), 2500);
  }
}

function closeRandomWinner() {
  const winnerBox = document.getElementById("randomWinner");
  if (winnerBox) winnerBox.classList.remove("show");
  renderRandomBoard();
}



export {
  stopRandomDraw,
  renderRandomBoard,
  buildButterflyPool,
  butterflyLayerRect,
  applyButterflyTransform,
  updateButterflyMove,
  computeScatterPositions,
  startRandomDraw,
  drawLoop,
  forceFinishRandom,
  finishDraw,
  launchConfetti,
  closeRandomWinner
};
