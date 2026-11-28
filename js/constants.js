const TASKS = [
  "Quét lớp",
  "Lau bảng",
  "Xếp bàn ghế",
  "Tắt các thiết bị điện",
  "Dọn bàn ăn"
];

let DAYS = ["tuan_0", "tuan_1", "tuan_2", "tuan_3", "tuan_4", "tuan_5"];

function createNewWeekHeaders() {
  let curr = new Date();
  let first = curr.getDate() - curr.getDay() + 1;
  if (curr.getDay() === 0) first = curr.getDate() - 6;
  let monday = new Date(curr.setDate(first));
  let header = [];
    
  for (let i = 0; i < 6; i++) {
    let start = new Date(monday);
    start.setDate(monday.getDate() + i * 7);
    let end = new Date(start);
    end.setDate(start.getDate() + 4);
  
    // Always store full DD/MM/YYYY format for reliable parsing
    const startStr = `${start.getDate()}/${start.getMonth() + 1}/${start.getFullYear()}`;
    const endStr = `${end.getDate()}/${end.getMonth() + 1}/${end.getFullYear()}`;
    header.push(`${startStr} - ${endStr}`);
  }
  return header;
}

let weekHeaders = createNewWeekHeaders();


export { TASKS, DAYS, createNewWeekHeaders, weekHeaders };
const WEEK_BUTTERFLY_SVG = '<svg viewBox="0 0 64 64" width="38" height="38"><g class="bf-wing bf-wing-l"><path d="M32 30C22 12 6 10 8 24c1 8 10 10 20 10-8 2-12 8-8 12 4 4 10-2 12-10z" fill="#f472b6"/><path d="M32 30C24 16 12 14 13 24c1 6 8 8 16 8z" fill="#ec4899"/></g><g class="bf-wing bf-wing-r"><path d="M32 30c10-18 26-20 24-6-1 8-10 10-20 10 8 2 12 8 8 12-4 4-10-2-12-10z" fill="#f9a8d4"/><path d="M32 30c8-14 20-16 19-6-1 6-8 8-16 8z" fill="#f472b6"/></g><ellipse cx="32" cy="32" rx="2.4" ry="9" fill="#7c2d12"/><path d="M31 24c-2-4-5-5-7-4M33 24c2-4 5-5 7-4" stroke="#7c2d12" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>';
// Per-butterfly flight personalities: size, speed, hue shift, wing-flap speed, bob intensity
const WEEK_BUTTERFLY_CONFIGS = [
  { scale: 1.00, speed: 1.00, hue: 0,   flap: 0.30, bob: 1.00 },
  { scale: 0.78, speed: 1.30, hue: 45,  flap: 0.24, bob: 1.35 },
  { scale: 1.18, speed: 0.82, hue: -35, flap: 0.34, bob: 0.80 },
  { scale: 0.90, speed: 1.12, hue: 95,  flap: 0.27, bob: 1.15 },
  { scale: 0.68, speed: 1.45, hue: -70, flap: 0.22, bob: 1.45 }
];
// ===== Random page (ocean + coral + fish) =====
// Coral colors (ocean reef palette, no duplicates)
const CORAL_COLORS = [
  '#f472b6', '#ec4899', '#f43f5e', '#fb7185', '#f9a8d4',
  '#fb923c', '#f97316', '#f59e0b', '#fbbf24', '#fcd34d',
  '#a78bfa', '#8b5cf6', '#a855f7', '#c084fc', '#d946ef',
  '#2dd4bf', '#14b8a6', '#22d3ee', '#06b6d4', '#38bdf8',
  '#34d399', '#4ade80', '#a3e635', '#f87171', '#e879f9',
  '#fb7185', '#fdba74', '#fde047', '#c4b5fd', '#67e8f9',
  '#6ee7b7', '#bef264', '#fca5a5', '#f0abfc', '#7dd3fc',
  '#5eead4', '#86efac', '#fdba74', '#f9a8d4', '#c4b5fd',
  '#fcd34d', '#fda4af', '#d8b4fe', '#a5f3fc', '#6ee7b7',
  '#fef08a', '#fecaca', '#e9d5ff', '#cffafe', '#dcfce7'
];

function createCoralSVG(color, variant = 0) {
  const base = '<ellipse cx="32" cy="67" rx="22" ry="5" fill="#0c4a6e" opacity="0.3"/>';
  if (variant % 3 === 1) {
    // Sea fan coral
    return `<svg class="coral-svg" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg">
      ${base}
      <g stroke="${color}" stroke-linecap="round" fill="none">
        <path d="M32 67 L32 50" stroke-width="5"/>
        <path d="M32 52 C 18 46, 12 32, 16 20" stroke-width="4"/>
        <path d="M32 52 C 24 42, 22 28, 26 16" stroke-width="4"/>
        <path d="M32 52 C 40 42, 42 28, 38 16" stroke-width="4"/>
        <path d="M32 52 C 46 46, 52 32, 48 20" stroke-width="4"/>
      </g>
      <g fill="${color}">
        <circle cx="16" cy="20" r="3.5"/><circle cx="26" cy="16" r="3.5"/>
        <circle cx="38" cy="16" r="3.5"/><circle cx="48" cy="20" r="3.5"/>
      </g>
    </svg>`;
  } else if (variant % 3 === 2) {
    // Dome / brain coral
    return `<svg class="coral-svg" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg">
      ${base}
      <path d="M12 67 C 12 44, 20 30, 32 30 C 44 30, 52 44, 52 67 Z" fill="${color}" opacity="0.92"/>
      <g stroke="#ffffff" stroke-width="2" fill="none" opacity="0.35" stroke-linecap="round">
        <path d="M18 52 C 22 46, 26 46, 30 52"/>
        <path d="M30 52 C 34 46, 38 46, 42 52"/>
        <path d="M24 60 C 28 54, 32 54, 36 60"/>
        <path d="M36 60 C 40 54, 44 54, 48 60"/>
      </g>
    </svg>`;
  }
  // Staghorn (branching) coral
  return `<svg class="coral-svg" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg">
    ${base}
    <g stroke="${color}" stroke-linecap="round" fill="none">
      <path d="M32 67 L32 42" stroke-width="6"/>
      <path d="M32 52 C 22 46, 18 34, 20 22" stroke-width="5"/>
      <path d="M32 48 C 42 42, 46 30, 44 18" stroke-width="5"/>
      <path d="M32 58 C 26 54, 22 48, 24 40" stroke-width="4" opacity="0.7"/>
      <path d="M32 56 C 38 52, 42 46, 40 38" stroke-width="4" opacity="0.7"/>
    </g>
    <g fill="${color}">
      <circle cx="20" cy="22" r="4.5"/><circle cx="44" cy="18" r="4.5"/>
      <circle cx="24" cy="40" r="3.5" opacity="0.85"/><circle cx="40" cy="38" r="3.5" opacity="0.85"/>
    </g>
  </svg>`;
}

// Seaweed decoration SVGs on both sides (replaces tree branches)
const RANDOM_BRANCH_LEFT_SVG = '<svg class="random-branch branch-left" viewBox="0 0 100 500" preserveAspectRatio="none" aria-hidden="true"><path d="M20 510 C 8 400, 32 300, 18 200 C 8 120, 28 60, 20 -10" fill="none" stroke="#0d9488" stroke-width="11" stroke-linecap="round" opacity="0.65"/><path d="M44 510 C 54 400, 32 300, 48 200 C 58 120, 42 60, 50 -10" fill="none" stroke="#14b8a6" stroke-width="9" stroke-linecap="round" opacity="0.55"/><path d="M70 510 C 60 420, 80 340, 68 260 C 60 200, 74 140, 68 80" fill="none" stroke="#0f766e" stroke-width="10" stroke-linecap="round" opacity="0.6"/></svg>';
const RANDOM_BRANCH_RIGHT_SVG = '<svg class="random-branch branch-right" viewBox="0 0 100 500" preserveAspectRatio="none" aria-hidden="true"><path d="M20 510 C 8 400, 32 300, 18 200 C 8 120, 28 60, 20 -10" fill="none" stroke="#0d9488" stroke-width="11" stroke-linecap="round" opacity="0.65"/><path d="M44 510 C 54 400, 32 300, 48 200 C 58 120, 42 60, 50 -10" fill="none" stroke="#14b8a6" stroke-width="9" stroke-linecap="round" opacity="0.55"/><path d="M70 510 C 60 420, 80 340, 68 260 C 60 200, 74 140, 68 80" fill="none" stroke="#0f766e" stroke-width="10" stroke-linecap="round" opacity="0.6"/></svg>';

// Fish SVG for the random page (faces RIGHT; swims and gathers at corals)
const RANDOM_BF_SVG = '<svg viewBox="0 0 64 64"><g class="fish-tail"><path d="M14 32 L2 22 L6 32 L2 42 Z" fill="currentColor" opacity="0.9"/></g><path d="M58 32 C 50 18, 24 18, 14 32 C 24 46, 50 46, 58 32 Z" fill="currentColor"/><path d="M36 20 Q 32 11, 27 20" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M36 44 Q 32 53, 27 44" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="46" cy="28" r="3.5" fill="#0c4a6e"/><circle cx="45.2" cy="27.2" r="1.3" fill="#ffffff"/></svg>';
// Fish body colors (ocean fish palette)
const RANDOM_BF_HUES = ['#f97316', '#3b82f6', '#facc15', '#06b6d4', '#ef4444', '#8b5cf6', '#10b981', '#ec4899', '#0ea5e9', '#f43f5e', '#a855f7', '#14b8a6', '#f59e0b', '#6366f1', '#22c55e', '#e879f9'];
const RANDOM_MAX_BUTTERFLIES = 16;


export {
  WEEK_BUTTERFLY_SVG,
  WEEK_BUTTERFLY_CONFIGS,
  CORAL_COLORS,
  createCoralSVG,
  RANDOM_BRANCH_LEFT_SVG,
  RANDOM_BRANCH_RIGHT_SVG,
  RANDOM_BF_SVG,
  RANDOM_BF_HUES,
  RANDOM_MAX_BUTTERFLIES
};
