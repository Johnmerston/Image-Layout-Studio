/* =========================================================
   leftpanel.js — document settings, grid, page commands
   ========================================================= */
(function () {
  'use strict';
  const ALS = (window.ALS = window.ALS || {});
  const $ = ALS.$;

  /* -------------------------------------------------- helpers */

  function num(el, fallback) {
    const v = parseFloat(el.value);
    return isNaN(v) ? fallback : v;
  }

  /** Set a page's grid, preserving images by slot index. */
  function setGrid(page, rows, cols, label) {
    rows = ALS.clamp(Math.round(rows) || 1, 1, 50);
    cols = ALS.clamp(Math.round(cols) || 1, 1, 50);
    const old = page.slots;
    let dropped = 0;
    const next = [];
    for (let i = 0; i < rows * cols; i++) {
      if (old[i]) next.push(old[i]);
      else next.push(ALS.newSlot());
    }
    for (let i = rows * cols; i < old.length; i++) {
      if (old[i].imageId) dropped++;
    }
    page.rows = rows;
    page.cols = cols;
    page.slots = next;
    return dropped;
  }

  ALS.setPageGrid = setGrid;

  /** Resize a page to exactly `total` slots (partial last row allowed). */
  function setTotal(page, total) {
    total = ALS.clamp(Math.round(total) || 1, 1, 2500);
    const cols = ALS.clamp(page.cols || 1, 1, 50);
    const rows = Math.max(1, Math.ceil(total / cols));
    let dropped = 0;
    const next = [];
    for (let i = 0; i < total; i++) {
      if (page.slots[i]) next.push(page.slots[i]);
      else next.push(ALS.newSlot());
    }
    for (let i = total; i < page.slots.length; i++) if (page.slots[i].imageId) dropped++;
    page.rows = rows;
    page.cols = cols;
    page.slots = next;
    return dropped;
  }

  ALS.setPageTotal = setTotal;

  function guardDropped(n) {
    if (n > 0) ALS.toast(n + ' image' + (n > 1 ? 's' : '') + ' removed with the slot' + (n > 1 ? 's' : '') + ' — Ctrl+Z to undo', 3200);
  }

  /* -------------------------------------------------- binding */

  ALS.bindLeftPanel = function () {
    /* --- page size --- */
    $('#pageSize').addEventListener('change', e => {
      ALS.tx(() => {
        ALS.state.doc.page.size = e.target.value;
        if (e.target.value === 'Custom') {
          const s = ALS.pageSizeMM(ALS.state.doc.page);
          ALS.state.doc.page.customW = Math.round(s.w);
          ALS.state.doc.page.customH = Math.round(s.h);
        }
      }, 'page size');
    });

    const customHandler = key => {
      const apply = e => {
        const v = parseFloat(e.target.value);
        if (isNaN(v)) return;
        ALS.tx(() => { ALS.state.doc.page[key] = ALS.clamp(v, 20, 2000); }, 'custom size');
      };
      return apply;
    };
    ['input', 'change'].forEach(evt => {
      $('#customW').addEventListener(evt, customHandler('customW'));
      $('#customH').addEventListener(evt, customHandler('customH'));
    });

    /* --- orientation --- */
    ALS.$$('#orientation button').forEach(b => {
      b.addEventListener('click', () => {
        ALS.tx(() => { ALS.state.doc.page.orientation = b.dataset.value; }, 'orientation');
      });
    });

    /* --- background colour --- */
    const bg = $('#pageBg'), bgHex = $('#pageBgHex');
    bg.addEventListener('input', () => {
      ALS.tx(() => { ALS.state.doc.page.background = bg.value; }, 'page background');
      bgHex.value = bg.value;
    });
    bgHex.addEventListener('change', () => {
      const v = ALS.normHex(bgHex.value, ALS.state.doc.page.background);
      ALS.tx(() => { ALS.state.doc.page.background = v; }, 'page background');
      bg.value = v; bgHex.value = v;
    });

    /* --- margins --- */
    const margins = { mTop: 'top', mRight: 'right', mBottom: 'bottom', mLeft: 'left' };
    Object.keys(margins).forEach(id => {
      $('#' + id).addEventListener('input', e => {
        const v = parseFloat(e.target.value);
        if (isNaN(v) || v < 0) return;
        ALS.tx(() => { ALS.state.doc.page.margins[margins[id]] = ALS.clamp(v, 0, 200); }, 'margins');
      });
    });

    /* --- slot spacing --- */
    $('#slotGap').addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      if (isNaN(v) || v < 0) return;
      ALS.tx(() => { ALS.state.doc.page.gap = ALS.clamp(v, 0, 50); }, 'slot spacing');
    });

    /* --- grid steppers --- */
    ALS.$$('[data-step]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [which, delta] = btn.dataset.step.split(':');
        const p = ALS.currentPage();
        const rows = which === 'rows' ? p.rows + Number(delta) : p.rows;
        const cols = which === 'cols' ? p.cols + Number(delta) : p.cols;
        if (rows < 1 || cols < 1 || rows > 50 || cols > 50) return;
        ALS.tx(() => guardDropped(setGrid(p, rows, cols)), which === 'rows' ? 'rows' : 'columns');
      });
    });

    $('#gridRows').addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      if (isNaN(v) || v < 1) return;
      const p = ALS.currentPage();
      ALS.tx(() => guardDropped(setGrid(p, v, p.cols)), 'rows');
    });

    $('#gridCols').addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      if (isNaN(v) || v < 1) return;
      const p = ALS.currentPage();
      ALS.tx(() => guardDropped(setGrid(p, p.rows, v)), 'columns');
    });

    $('#gridTotal').addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      if (isNaN(v) || v < 1) return;
      const p = ALS.currentPage();
      ALS.tx(() => guardDropped(setTotal(p, v)), 'total slots');
    });

    $('#btnGridAll').addEventListener('click', () => {
      const src = ALS.currentPage();
      ALS.tx(() => {
        ALS.docPages().forEach(p => {
          if (p === src) return;
          setGrid(p, src.rows, src.cols);
        });
      }, 'apply grid to all pages');
      ALS.toast('Grid applied to all pages');
    });

    /* --- page commands --- */
    $('#btnAddPage').addEventListener('click', () => ALS.pages.addPage());
    $('#stripAdd').addEventListener('click', () => ALS.pages.addPage());
    $('#btnDupPage').addEventListener('click', () => ALS.pages.duplicatePage());
    $('#btnDelPage').addEventListener('click', () => ALS.pages.deletePage());
    $('#stripPrev').addEventListener('click', () => ALS.pages.go(-1));
    $('#stripNext').addEventListener('click', () => ALS.pages.go(1));
  };

  /* -------------------------------------------------- sync */

  ALS.syncLeftPanel = function () {
    const doc = ALS.state.doc;
    const p = doc.page;
    const active = document.activeElement;

    const set = (sel, val) => {
      const el = $(sel);
      if (!el || el === active) return;
      if (el.value !== String(val)) el.value = val;
    };

    set('#pageSize', p.size);
    $('#customSizeRow').hidden = p.size !== 'Custom';
    set('#customW', ALS.round(p.customW, 1));
    set('#customH', ALS.round(p.customH, 1));

    ALS.$$('#orientation button').forEach(b => {
      b.classList.toggle('on', b.dataset.value === p.orientation);
    });

    if (active !== $('#pageBg')) $('#pageBg').value = ALS.normHex(p.background, '#ffffff');
    if (active !== $('#pageBgHex')) $('#pageBgHex').value = ALS.normHex(p.background, '#ffffff');

    set('#mTop', p.margins.top);
    set('#mRight', p.margins.right);
    set('#mBottom', p.margins.bottom);
    set('#mLeft', p.margins.left);
    set('#slotGap', p.gap);

    const cur = ALS.currentPage();
    if (cur) {
      set('#gridRows', cur.rows);
      set('#gridCols', cur.cols);
      set('#gridTotal', cur.slots.length);
      $('#gridCalc').textContent = cur.slots.length + ' slot' + (cur.slots.length === 1 ? '' : 's') +
        (cur.rows * cur.cols !== cur.slots.length ? ' (partial last row)' : '');

      const pi = ALS.state.ui.page;
      $('#pageInfo').textContent = 'Page ' + (pi + 1) + ' of ' + ALS.docPages().length;
      $('#pageSlotsInfo').textContent = cur.slots.length + ' slots · ' + ALS.filledSlots() + ' filled';
    }
  };
})();
