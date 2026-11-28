import { state } from './state.js';

/**
 * Convert Firebase object back to array (Firebase converts arrays with holes to objects)
 */
function toArray(val) {
  if (Array.isArray(val)) return val.filter(item => item !== undefined && item !== null);
  if (val && typeof val === 'object') {
    return Object.keys(val)
      .sort((a, b) => Number(a) - Number(b))
      .map(key => val[key])
      .filter(item => item !== undefined && item !== null);
  }
  return [];
}

/**
 * Normalize schedule object - convert cell values from Firebase objects to arrays
 */
function normalizeSchedule(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const result = {};
  Object.keys(raw).forEach(key => {
    result[key] = toArray(raw[key]);
  });
  return result;
}

/**
 * Parse a week header string like "17/11 - 21/11" or "30/12/2025 - 3/1/2026"
 * and return the start Date, or null if unparseable.
 */
function parseWeekStart(weekStr) {
  if (typeof weekStr !== "string") return null;
  const startPart = weekStr.split("-")[0].trim();
  const dm = startPart.split("/");
  if (dm.length < 2) return null;
  const day = parseInt(dm[0], 10);
  const month = parseInt(dm[1], 10) - 1;
  if (isNaN(day) || isNaN(month)) return null;
  let year;
  if (dm.length >= 3) {
    year = parseInt(dm[2], 10);
  } else {
    // No year in string: infer. If the week is in December but today is Jan,
    // the year should be last year (cross-year handling).
    const now = new Date();
    year = now.getFullYear();
    if (month === 11 && now.getMonth() === 0) year -= 1; // Dec week, currently Jan
    else if (month === 0 && now.getMonth() === 11) year += 1; // Jan week, currently Dec
  }
  if (isNaN(year)) return null;
  const d = new Date(year, month, day);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Determine which week index (0-5) contains today's date.
 * Returns -1 if none match.
 */
function getCurrentWeekIndex() {
  const headers = toArray(state.currentClassData.weekHeaders);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < headers.length; i++) {
    const start = parseWeekStart(headers[i]);
    if (!start) continue;
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    if (today >= start && today <= end) return i;
  }
  return -1;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Toast notification system
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-message">${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}


function sanitizeNoticeHtml(html) {
  if (typeof html !== "string") return "";
  
  const allowedTags = new Set([
    "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "H1", "H2", "H3", "H4",
    "P", "DIV", "BR", "UL", "OL", "LI", "BLOCKQUOTE", "SPAN", "FONT", "A",
    "CODE", "PRE", "HR"
  ]);
  const dropTags = new Set(["SCRIPT", "IFRAME", "STYLE", "OBJECT", "EMBED", "LINK", "META"]);
  const allowedAttrs = new Set(["href", "target", "rel", "color", "face", "size", "style"]);
  
  // Whitelist of safe CSS properties for style attribute
  const safeStyleProps = new Set([
    "color", "background-color", "font-family", "font-size", "text-align"
  ]);
  
  // Validate a style attribute value - only allow safe properties with bounded values
  function sanitizeStyle(styleStr) {
    if (!styleStr || typeof styleStr !== "string") return "";
    const declarations = styleStr.split(";");
    const safe = [];
    for (const decl of declarations) {
      const colonIdx = decl.indexOf(":");
      if (colonIdx === -1) continue;
      const prop = decl.substring(0, colonIdx).trim().toLowerCase();
      let value = decl.substring(colonIdx + 1).trim();
      // Only allow whitelisted properties with safe values
      if (safeStyleProps.has(prop) && value) {
        // Block dangerous values (including CSS escape sequences like \75 rl())
        if (/\\/.test(value)) continue;
        if (/url\s*\(/i.test(value) || /expression\s*\(/i.test(value) || /javascript:/i.test(value)) continue;
        if (/@import/i.test(value)) continue;
        // Bound font-size to a sane range (12px - 32px)
        if (prop === "font-size") {
          const pxMatch = value.match(/^(\d+(?:\.\d+)?)px$/i);
          if (pxMatch) {
            const px = parseFloat(pxMatch[1]);
            if (px < 10 || px > 32) continue; // skip out-of-range sizes
          } else {
            continue; // only allow px font sizes
          }
        }
        safe.push(`${prop}: ${value}`);
      }
    }
    return safe.join("; ");
  }

  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();

  const clean = (parent) => {
    Array.from(parent.childNodes).forEach((node) => {
      if (node.nodeType === Node.COMMENT_NODE) {
        node.remove();
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      if (dropTags.has(node.tagName)) {
        node.remove();
        return;
      }

      if (!allowedTags.has(node.tagName)) {
        const frag = document.createDocumentFragment();
        while (node.firstChild) frag.appendChild(node.firstChild);
        node.replaceWith(frag);
        return;
      }

      Array.from(node.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || !allowedAttrs.has(name)) {
          node.removeAttribute(attr.name);
          return;
        }
        // Sanitize style attribute with whitelist
        if (name === "style") {
          const safe = sanitizeStyle(attr.value);
          if (safe) {
            node.setAttribute("style", safe);
          } else {
            node.removeAttribute("style");
          }
        }
      });

      if (node.tagName === "A") {
        const href = (node.getAttribute("href") || "").trim();
        let valid = false;
        try {
          const url = new URL(href, window.location.origin);
          if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
            valid = true;
          }
        } catch (e) {
          valid = false;
        }
        if (!valid) {
          node.removeAttribute("href");
        } else {
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noopener noreferrer");
        }
      }

      clean(node);
    });
  };

  clean(tpl.content);
  return tpl.innerHTML;
}

export {
  toArray,
  normalizeSchedule,
  parseWeekStart,
  getCurrentWeekIndex,
  escapeHtml,
  showToast,
  sanitizeNoticeHtml
};
