import { sanitizeNoticeHtml, showToast } from './utils.js';

function initNoticeToolbar() {
  const toolbar = document.getElementById('noticeToolbar');
  const editor = document.getElementById('noticeInput');
  const fontFamilySelect = document.getElementById('fontFamilySelect');
  const fontSizeSelect = document.getElementById('fontSizeSelect');
  const textColorSelect = document.getElementById('textColorSelect');
  
  if (!toolbar || !editor) return;
  
  try { document.execCommand('styleWithCSS', false, false); } catch (e) {}
  
  // Save selection before interacting with toolbar
  let savedSelection = null;
  
  function saveSelection() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      // Only save selection if it's inside the notice editor
      if (editor.contains(range.commonAncestorContainer)) {
        savedSelection = range.cloneRange();
      }
    }
  }
  
  function restoreSelection() {
    if (savedSelection) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedSelection);
    }
  }
  
  // Save selection on mouseup in editor
  editor.addEventListener('mouseup', saveSelection);
  editor.addEventListener('keyup', saveSelection);
  
  // Format buttons
  toolbar.querySelectorAll('.toolbar-btn[data-format]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      restoreSelection();
      
      const format = btn.dataset.format;
      const value = btn.dataset.value || null;
      
      if (format === 'heading') {
        const currentFormat = document.queryCommandValue('formatBlock').toLowerCase();
        if (currentFormat === 'h2') {
          document.execCommand('formatBlock', false, 'div');
        } else {
          document.execCommand('formatBlock', false, 'h2');
        }
      } else if (format === 'blockquote') {
        const currentFormat = document.queryCommandValue('formatBlock').toLowerCase();
        if (currentFormat === 'blockquote') {
          document.execCommand('formatBlock', false, 'div');
        } else {
          document.execCommand('formatBlock', false, 'blockquote');
        }
      } else if (format === 'removeFormat') {
        document.execCommand('removeFormat', false, null);
        document.execCommand('formatBlock', false, 'div');
      } else {
        document.execCommand(format, false, value);
      }
      
      updateToolbarState();
      editor.focus();
    });
  });
  
  // Font family select - preserve selection
  if (fontFamilySelect) {
    fontFamilySelect.addEventListener('mousedown', saveSelection);
    fontFamilySelect.addEventListener('change', () => {
      restoreSelection();
      const value = fontFamilySelect.value;
      if (value) {
        document.execCommand('fontName', false, value);
      }
      fontFamilySelect.value = '';
      editor.focus();
    });
  }
  
  // Font size select
  if (fontSizeSelect) {
    fontSizeSelect.addEventListener('mousedown', saveSelection);
    fontSizeSelect.addEventListener('change', () => {
      restoreSelection();
      const value = fontSizeSelect.value;
      if (value) {
        const sizeMap = {
          '12px': '1', '14px': '2', '16px': '3', '18px': '4', '20px': '5', '24px': '6'
        };
        document.execCommand('fontSize', false, sizeMap[value] || '3');
      }
      fontSizeSelect.value = '';
      editor.focus();
    });
  }
  
  // Text color select
  if (textColorSelect) {
    textColorSelect.addEventListener('mousedown', saveSelection);
    textColorSelect.addEventListener('change', () => {
      restoreSelection();
      const value = textColorSelect.value;
      if (value) {
        document.execCommand('foreColor', false, value);
      }
      textColorSelect.value = '';
      editor.focus();
    });
  }
  
  // Keyboard shortcuts
  editor.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          document.execCommand('bold', false, null);
          updateToolbarState();
          break;
        case 'i':
          e.preventDefault();
          document.execCommand('italic', false, null);
          updateToolbarState();
          break;
        case 'u':
          e.preventDefault();
          document.execCommand('underline', false, null);
          updateToolbarState();
          break;
      }
    }
  });
  
  editor.addEventListener('input', updateToolbarState);
  editor.addEventListener('keyup', updateToolbarState);
  editor.addEventListener('click', updateToolbarState);
  
  function updateToolbarState() {
    toolbar.querySelectorAll('.toolbar-btn[data-format]').forEach(btn => {
      const format = btn.dataset.format;
      if (format === 'removeFormat') return;
      
      let isActive = false;
      if (format === 'heading') {
        isActive = document.queryCommandValue('formatBlock').toLowerCase() === 'h2';
      } else if (format === 'blockquote') {
        isActive = document.queryCommandValue('formatBlock').toLowerCase() === 'blockquote';
      } else {
        isActive = document.queryCommandState(format);
      }
      
      btn.classList.toggle('active', isActive);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initNoticeToolbar();
});



export { initNoticeToolbar };
