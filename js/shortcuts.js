/* =========================================================
   shortcuts.js — keyboard shortcuts & global key handling
   ========================================================= */
(function () {
  'use strict';
  const ALS = (window.ALS = window.ALS || {});

  function editing() {
    const a = document.activeElement;
    if (!a) return false;
    const tag = (a.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (a.isContentEditable) return true;
    return false;
  }

  ALS.bindShortcuts = function () {
    document.addEventListener('keydown', e => {
      const mod = e.ctrlKey || e.metaKey;
      const inField = editing();
      const a = document.activeElement;
      const texty = !!a && (a.tagName === 'TEXTAREA' ||
        (a.tagName === 'INPUT' && ['text', 'number', 'search', 'url', 'email', 'password'].indexOf(a.type) >= 0));

      /* ---- undo / redo (let the browser undo inside text fields) ---- */
      if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        if (texty) return;
        e.preventDefault(); ALS.undo(); return;
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); ALS.redo(); return; }
      if (mod && e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); ALS.redo(); return; }

      /* ---- global app actions (work even while a field is focused) ---- */
      if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); ALS.exportProjectJSON(); return; }
      if (mod && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); document.getElementById('fileInput').click(); return; }
      if (mod && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); ALS.pdf.print(); return; }

      if (inField) return; // everything below is for the workspace

      /* ---- zoom ---- */
      if (mod && e.key === '0') { e.preventDefault(); ALS.zoomFit(); return; }
      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); ALS.setZoom(ALS.state.ui.zoom * 1.15); return; }
      if (mod && (e.key === '-' || e.key === '_')) { e.preventDefault(); ALS.setZoom(ALS.state.ui.zoom / 1.15); return; }

      /* ---- fullscreen ---- */
      if (mod && e.shiftKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); ALS.toggleFullscreen(); return; }

      /* ---- duplicate ---- */
      if (mod && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); ALS.media.duplicateSelected(); return; }

      /* ---- delete selection ---- */
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = ALS.selected();
        if (sel && sel.slot.imageId) { e.preventDefault(); ALS.media.removeSelected(); }
        return;
      }

      /* ---- escape ---- */
      if (e.key === 'Escape') {
        if (ALS.state.ui.cropMode) { ALS.state.ui.cropMode = false; ALS.requestRender(); return; }
        if (ALS.state.ui.fullscreen) { ALS.toggleFullscreen(); return; }
        if (ALS.state.ui.selectedSlotId) {
          ALS.state.ui.selectedSlotId = null;
          ALS.state.ui.cropMode = false;
          ALS.requestRender();
        }
        return;
      }

      /* ---- page navigation ---- */
      if (e.key === 'PageDown') { e.preventDefault(); ALS.pages.go(1); return; }
      if (e.key === 'PageUp') { e.preventDefault(); ALS.pages.go(-1); return; }

      /* ---- arrow-key nudging of the selected image ---- */
      if (e.key.indexOf('Arrow') === 0) {
        const sel = ALS.selected();
        if (!sel || !sel.slot.imageId) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        ALS.tx(() => {
          const t = sel.slot.img;
          if (e.key === 'ArrowLeft') t.ox = ALS.clamp(t.ox - step, 0, 100);
          if (e.key === 'ArrowRight') t.ox = ALS.clamp(t.ox + step, 0, 100);
          if (e.key === 'ArrowUp') t.oy = ALS.clamp(t.oy - step, 0, 100);
          if (e.key === 'ArrowDown') t.oy = ALS.clamp(t.oy + step, 0, 100);
        }, 'position image');
        return;
      }
    });
  };
})();
