/* =========================================================
   app.js — bootstrap, toolbar wiring, render orchestration
   ========================================================= */
(function () {
  'use strict';
  const ALS = (window.ALS = window.ALS || {});
  const $ = ALS.$;

  /* -------------------------------------------------- range fill */

  function fillRange(el) {
    if (!el) return;
    const min = parseFloat(el.min) || 0, max = parseFloat(el.max) || 100;
    const v = parseFloat(el.value);
    const pct = ((v - min) / (max - min)) * 100;
    el.style.setProperty('--fill', pct.toFixed(1) + '%');
  }

  /* -------------------------------------------------- status bar */

  function renderStatus() {
    const ui = ALS.state.ui;
    const pages = ALS.docPages();
    const page = ALS.currentPage();
    const sel = ALS.selected();

    let left = 'Page ' + (ui.page + 1) + ' of ' + pages.length;
    if (page) left += ' · ' + page.rows + '×' + page.cols + ' grid · ' + page.slots.length + ' slots';
    $('#statusLeft').textContent = left;

    let mid = ALS.filledSlots() + ' image' + (ALS.filledSlots() === 1 ? '' : 's') + ' in document';
    if (sel) {
      const slotTxt = 'Slot ' + (sel.index + 1);
      mid = sel.slot.imageId
        ? slotTxt + ' selected — ' + (ALS.state.doc.images[sel.slot.imageId].name || 'image')
        : slotTxt + ' selected (empty)';
    } else if (ui.cropMode) {
      mid += ' · crop mode';
    }
    $('#statusMid').textContent = mid;

    const geom = ALS.view.pageGeom;
    let right = Math.round(ui.zoom * 100) + '%';
    if (geom) right += ' · ' + ALS.round(geom.pw, 1) + ' × ' + ALS.round(geom.ph, 1) + ' mm';
    $('#statusRight').textContent = right;
  }

  /* -------------------------------------------------- toolbar sync */

  function syncToolbar() {
    const ui = ALS.state.ui;
    $('#btnUndo').disabled = ALS.hist.undo.length === 0;
    $('#btnRedo').disabled = ALS.hist.redo.length === 0;

    const zr = $('#zoomRange');
    const zv = Math.round(ui.zoom * 100);
    if (document.activeElement !== zr) zr.value = String(Math.min(300, zv));
    fillRange(zr);
    $('#zoomValue').textContent = zv + '%';

    ['#imgZoom', '#posX', '#posY'].forEach(s => fillRange($(s)));

    $('#btnFullscreen').classList.toggle('on', !!ui.fullscreen);
  }

  /* -------------------------------------------------- renderAll */

  ALS.renderAll = function () {
    ALS.syncLeftPanel();
    ALS.syncProps();
    ALS.renderPreview();
    ALS.renderStrip();
    renderStatus();
    syncToolbar();
  };

  /* -------------------------------------------------- fullscreen */

  ALS.toggleFullscreen = function () {
    const ui = ALS.state.ui;
    ui.fullscreen = !ui.fullscreen;
    $('#app').classList.toggle('fs', ui.fullscreen);
    try {
      if (ui.fullscreen && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (!ui.fullscreen && document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (e) { /* ignore */ }
    ALS.requestRender();
  };

  document.addEventListener('fullscreenchange', () => {
    const on = !!document.fullscreenElement;
    if (ALS.state.ui.fullscreen !== on) {
      ALS.state.ui.fullscreen = on;
      $('#app').classList.toggle('fs', on);
      ALS.requestRender();
    }
  });

  /* -------------------------------------------------- toolbar binding */

  function bindToolbar() {
    $('#btnUndo').addEventListener('click', ALS.undo);
    $('#btnRedo').addEventListener('click', ALS.redo);

    $('#zoomRange').addEventListener('input', e => {
      ALS.setZoom(parseFloat(e.target.value) / 100);
    });
    $('#btnZoomIn').addEventListener('click', () => ALS.setZoom(ALS.state.ui.zoom * 1.15));
    $('#btnZoomOut').addEventListener('click', () => ALS.setZoom(ALS.state.ui.zoom / 1.15));
    $('#btnZoomFit').addEventListener('click', ALS.zoomFit);

    $('#btnSaveProject').addEventListener('click', ALS.exportProjectJSON);
    $('#btnLoadProject').addEventListener('click', () => $('#projectInput').click());
    $('#projectInput').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        await ALS.importProjectFile(f);
      } catch (err) {
        console.error(err);
        ALS.toast('Import failed: ' + (err.message || 'invalid file'), 3000);
      }
    });

    $('#btnPrint').addEventListener('click', () => ALS.pdf.print());
    $('#btnExportPdf').addEventListener('click', () => ALS.pdf.export().catch(err => {
      console.error(err);
      ALS.toast('PDF export failed: ' + (err.message || err), 3500);
    }));

    $('#btnFullscreen').addEventListener('click', ALS.toggleFullscreen);

    $('#btnResetDoc').addEventListener('click', async () => {
      const hasImages = ALS.imageCount() > 0;
      const ok = await ALS.confirm('Reset document?',
        hasImages
          ? 'All pages, settings and ' + ALS.imageCount() + ' image(s) will be discarded and a fresh A4 document created.'
          : 'All page and document settings will be discarded and a fresh A4 document created.',
        'Reset');
      if (!ok) return;
      ALS.tx(() => {
        ALS.state.doc = ALS.newDoc();
        ALS.state.ui.page = 0;
        ALS.state.ui.selectedSlotId = null;
        ALS.state.ui.cropMode = false;
      }, 'reset document');
      ALS.toast('Document reset');
    });
  }

  /* -------------------------------------------------- resize */

  let resizeTimer = null;
  function bindResize() {
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => ALS.requestRender(), 90);
    });
  }

  /* -------------------------------------------------- print hook */

  function bindPrint() {
    window.addEventListener('beforeprint', () => {
      try { ALS.pdf.buildPrintRoot(); } catch (e) { console.warn(e); }
    });
  }

  /* -------------------------------------------------- boot */

  async function boot() {
    // restore first — before any listener can mutate state — so a slow
    // IndexedDB read can never overwrite work the user has just done
    const restored = await ALS.loadAutosave();

    ALS.bindLeftPanel();
    ALS.bindProps();
    ALS.media.bindInputs();
    ALS.media.bindDnD();
    ALS.media.bindPaste();
    ALS.bindShortcuts();
    bindToolbar();
    bindResize();
    bindPrint();

    ALS.renderNow();
    if (restored) ALS.toast('Autosaved project restored', 2600);

    ALS.booted = true;

    // expose a tiny debug handle
    window.ALS = ALS;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
