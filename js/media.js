/* =========================================================
   media.js — image management:
   file browsing, multi-upload, clipboard paste, drag & drop
   (files and slot-to-slot reordering), replace/remove/
   duplicate/clear, and automatic page generation.
   ========================================================= */
(function () {
  'use strict';
  const ALS = (window.ALS = window.ALS || {});
  const $ = ALS.$;

  const media = {};
  ALS.media = media;

  /* -------------------------------------------------- helpers */

  function flatSlots() {
    const out = [];
    ALS.docPages().forEach((page, pageIndex) => {
      page.slots.forEach((slot, index) => out.push({ slot, page, pageIndex, index }));
    });
    return out;
  }

  function refGrid() {
    const p = ALS.currentPage();
    return { rows: p.rows, cols: p.cols };
  }

  /** Decode with an SVG fallback for missing intrinsic sizes. */
  async function decodeAsset(src, file) {
    const res = await ALS.decodeImage(src);
    let w = res.w, h = res.h;
    if (!w || !h) {
      if ((file && /\.svg$/i.test(file.name)) || /^data:image\/svg/.test(src)) {
        try {
          const txt = await readFileText(src);
          const vb = /viewBox\s*=\s*["']([\d.\-\s,e]+)["']/i.exec(txt);
          const rw = /\bwidth\s*=\s*["']([\d.]+)(?:px)?["']/i.exec(txt);
          const rh = /\bheight\s*=\s*["']([\d.]+)(?:px)?["']/i.exec(txt);
          if (rw && rh) { w = parseFloat(rw[1]); h = parseFloat(rh[1]); }
          else if (vb) {
            const p = vb[1].trim().split(/[\s,]+/).map(Number);
            if (p.length === 4) { w = p[2]; h = p[3]; }
          }
        } catch (e) { /* fall through */ }
      }
      if (!w || !h) { w = w || 1000; h = h || 1000; }
    }
    return { w: Math.round(w), h: Math.round(h) };
  }

  function readFileText(src) {
    if (src.startsWith('data:')) {
      try {
        const i = src.indexOf(',');
        const meta = src.slice(0, i);
        const data = src.slice(i + 1);
        if (base64(meta)) return decodeURIComponent(escape(atob(data)));
        return decodeURIComponent(data);
      } catch (e) { return Promise.reject(e); }
    }
    return fetch(src).then(r => r.text());
  }
  const base64 = meta => /;base64/i.test(meta);

  /* -------------------------------------------------- insertion */

  /**
   * Insert files into the document.
   * @param {File[]} files
   * @param {Object} [target] {slotId} exact slot, and/or {pageIndex} to start from
   */
  media.insertFiles = async function (files, target) {
    target = target || {};
    const imgs = Array.from(files || []).filter(ALS.isImageFile);
    if (!imgs.length) { ALS.toast('No supported image files found'); return; }

    const assets = [];
    let failed = 0;
    for (const f of imgs) {
      try {
        const src = await ALS.fileToDataURL(f);
        const dim = await decodeAsset(src, f);
        assets.push({
          id: ALS.uid('img'),
          name: f.name || 'Pasted image',
          mime: f.type || '',
          src,
          natW: dim.w,
          natH: dim.h,
          size: f.size || 0
        });
      } catch (e) {
        failed++;
        console.warn('failed to read', f && f.name, e);
      }
    }
    if (!assets.length) { ALS.toast('Could not read the image' + (failed > 1 ? 's' : '')); return; }

    let firstId = null, firstPage = 0;
    ALS.tx(() => {
      const doc = ALS.state.doc;
      const grid = refGrid();
      let refs = flatSlots();

      // choose the starting slot
      let startIdx = 0;
      let firstForced = false;
      if (target.slotId) {
        const i = refs.findIndex(r => r.slot.id === target.slotId);
        if (i >= 0) { startIdx = i; firstForced = true; }   // first file replaces that slot
      } else if (target.pageIndex != null) {
        let i = refs.findIndex(r => r.pageIndex === target.pageIndex && !r.slot.imageId);
        if (i < 0) i = refs.findIndex(r => r.pageIndex === target.pageIndex);
        startIdx = i >= 0 ? i : 0;
      } else {
        const i = refs.findIndex(r => !r.slot.imageId);
        startIdx = i >= 0 ? i : refs.length;                // no free slot -> new page
      }

      /** next free slot at/after `from`, wrapping once, then creating pages */
      const nextFree = from => {
        for (let i = from; i < refs.length; i++) if (!refs[i].slot.imageId) return i;
        for (let i = 0; i < from; i++) if (!refs[i].slot.imageId) return i;
        doc.pages.push(ALS.newPage(grid.rows, grid.cols));
        refs = flatSlots();
        return refs.length - 1;                             // first slot of the new page
      };

      let cursor = startIdx;
      assets.forEach((a, ai) => {
        doc.images[a.id] = a;
        const idx = (ai === 0 && firstForced) ? startIdx : nextFree(cursor);
        const ref = refs[idx];
        const s = ref.slot;
        if (s.imageId && doc.images[s.imageId]) delete doc.images[s.imageId]; // replace
        s.imageId = a.id;
        s.img = ALS.defaultImg();
        s.caption = ALS.defaultCaption();   // a new image starts without a caption
        if (firstId == null) { firstId = s.id; firstPage = ref.pageIndex; }
        cursor = idx + 1;
      });

      ALS.state.ui.selectedSlotId = firstId;
      ALS.state.ui.page = firstPage;
      ALS.state.ui.cropMode = false;
    }, 'add images');

    const n = assets.length;
    ALS.toast(n + ' image' + (n > 1 ? 's' : '') + ' inserted' + (failed ? ' (' + failed + ' failed)' : ''));
    ALS.renderNow();
  };

  /* -------------------------------------------------- per-slot actions */

  media.removeImage = function (slotId) {
    const found = ALS.findSlot(slotId);
    if (!found || !found.slot.imageId) return;
    ALS.tx(() => {
      delete ALS.state.doc.images[found.slot.imageId];
      found.slot.imageId = null;
      found.slot.img = null;
      found.slot.caption = ALS.defaultCaption();
      if (ALS.state.ui.selectedSlotId === slotId) ALS.state.ui.cropMode = false;
    }, 'remove image');
    ALS.toast('Image removed');
  };

  media.removeSelected = function () {
    const sel = ALS.selected();
    if (!sel || !sel.slot.imageId) { ALS.toast('No image selected'); return; }
    media.removeImage(sel.slot.id);
  };

  let pendingReplaceSlot = null;
  media.replaceSelected = function () {
    const sel = ALS.selected();
    if (!sel || !sel.slot.imageId) { ALS.toast('No image selected'); return; }
    pendingReplaceSlot = sel.slot.id;
    $('#replaceInput').click();
  };

  media.duplicateSelected = function () {
    const sel = ALS.selected();
    if (!sel || !sel.slot.imageId) { ALS.toast('No image selected'); return; }
    const assetId = sel.slot.imageId;
    ALS.tx(() => {
      const doc = ALS.state.doc;
      const orig = doc.images[assetId];
      const copy = Object.assign({}, orig, { id: ALS.uid('img') });
      doc.images[copy.id] = copy;

      const grid = refGrid();
      let refs = flatSlots();
      // first empty slot after the current one (wrapping, adding pages as needed)
      const from = refs.findIndex(r => r.slot.id === sel.slot.id);
      let target = null;
      for (let k = from + 1; k < refs.length; k++) if (!refs[k].slot.imageId) { target = refs[k]; break; }
      if (!target) {
        for (let k = 0; k < from; k++) if (!refs[k].slot.imageId) { target = refs[k]; break; }
      }
      if (!target) {
        doc.pages.push(ALS.newPage(grid.rows, grid.cols));
        refs = flatSlots();
        target = refs[refs.length - 1];
      }
      target.slot.imageId = copy.id;
      target.slot.img = ALS.deepClone(sel.slot.img);
      target.slot.caption = ALS.deepClone(sel.slot.caption || ALS.defaultCaption());
      ALS.state.ui.selectedSlotId = target.slot.id;
      ALS.state.ui.page = target.pageIndex;
    }, 'duplicate image');
    ALS.toast('Image duplicated');
  };

  media.clearAll = async function () {
    if (!ALST_count()) { ALS.toast('No images to clear'); return; }
    const ok = await ALS.confirm('Clear all images?',
      'This removes every image from the document (layouts and pages are kept).', 'Clear images');
    if (!ok) return;
    ALS.tx(() => {
      ALS.state.doc.images = {};
      ALS.docPages().forEach(p => p.slots.forEach(s => {
        s.imageId = null; s.img = null; s.caption = ALS.defaultCaption();
      }));
      ALS.state.ui.selectedSlotId = null;
      ALS.state.ui.cropMode = false;
    }, 'clear images');
    ALS.toast('All images cleared');
  };

  function ALST_count() { return ALS.imageCount(); }

  /* -------------------------------------------------- move / swap */

  media.moveOrSwap = function (srcId, dstId) {
    if (!srcId || !dstId || srcId === dstId) return;
    const A = ALS.findSlot(srcId), B = ALS.findSlot(dstId);
    if (!A || !B) return;
    if (!A.slot.imageId) return;
    ALS.tx(() => {
      const aId = A.slot.imageId, aImg = A.slot.img, aCap = A.slot.caption;
      const bId = B.slot.imageId, bImg = B.slot.img, bCap = B.slot.caption;
      B.slot.imageId = aId; B.slot.img = aImg; B.slot.caption = aCap;
      A.slot.imageId = bId; A.slot.img = bImg; A.slot.caption = bCap;
      ALS.state.ui.selectedSlotId = B.slot.id;
      ALS.state.ui.page = B.pageIndex;
      ALS.state.ui.cropMode = false;
    }, 'move image');
  };

  /* -------------------------------------------------- input elements */

  media.bindInputs = function () {
    $('#fileInput').addEventListener('change', e => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      media.insertFiles(files, {});
    });

    $('#replaceInput').addEventListener('change', async e => {
      const files = Array.from(e.target.files || []);
      const slotId = pendingReplaceSlot;
      pendingReplaceSlot = null;
      e.target.value = '';
      if (!files.length || !slotId) return;
      const f = files[0];
      if (!ALST_isImage(f)) { ALS.toast('Not a supported image'); return; }
      try {
        const src = await ALS.fileToDataURL(f);
        const dim = await decodeAsset(src, f);
        ALS.tx(() => {
          const found = ALS.findSlot(slotId);
          if (!found || !found.slot.imageId) return;
          const asset = ALS.state.doc.images[found.slot.imageId];
          asset.src = src;
          asset.natW = dim.w;
          asset.natH = dim.h;
          asset.name = f.name || asset.name;
          asset.mime = f.type || asset.mime;
          asset.size = f.size || 0;
          // reset geometry so the new picture starts sane, keep fit mode
          const fit = found.slot.img ? found.slot.img.fit : 'contain';
          found.slot.img = Object.assign(ALS.defaultImg(), { fit });
          found.slot.caption = ALS.defaultCaption();   // new picture -> fresh caption
        }, 'replace image');
        ALS.toast('Image replaced');
      } catch (err) {
        ALS.toast('Could not read that image');
      }
    });

    $('#btnAddImages').addEventListener('click', () => $('#fileInput').click());
    $('#btnClearAll').addEventListener('click', () => media.clearAll());
  };
  const ALST_isImage = ALS.isImageFile;

  /* -------------------------------------------------- clipboard paste */

  media.bindPaste = function () {
    document.addEventListener('paste', e => {
      const cd = e.clipboardData;
      if (!cd) return;
      const items = Array.from(cd.items || []);
      const files = [];
      items.forEach(it => {
        if (it.kind === 'file') {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      });
      if (!files.length) return;
      e.preventDefault();

      // paste into the selected empty slot when possible
      const sel = ALS.selected();
      const target = {};
      if (sel && !sel.slot.imageId) target.slotId = sel.slot.id;
      else if (sel) target.pageIndex = sel.pageIndex;
      media.insertFiles(files, target);
    });
  };

  /* -------------------------------------------------- drag & drop */

  function typesOf(dt) {
    try { return Array.from(dt.types || []); } catch (e) { return []; }
  }

  function clearDragStyles() {
    document.body.classList.remove('dragging-file');
    ALS.$$('.slot.drop-target').forEach(el => el.classList.remove('drop-target'));
    ALS.$$('.slot.dragging').forEach(el => el.classList.remove('dragging'));
  }

  media.bindDnD = function () {
    /* starting a slot-to-slot drag from the grip handle */
    document.addEventListener('dragstart', e => {
      const grip = e.target.closest && e.target.closest('[data-drag-slot]');
      if (!grip) return;
      e.dataTransfer.setData('text/plain', 'slot:' + grip.dataset.dragSlot);
      e.dataTransfer.effectAllowed = 'move';
      const slotEl = grip.closest('.slot');
      if (slotEl) slotEl.classList.add('dragging');
    });

    document.addEventListener('dragend', clearDragStyles);

    document.addEventListener('dragover', e => {
      const t = typesOf(e.dataTransfer);
      const slotEl = e.target.closest && e.target.closest('.slot');

      if (t.indexOf('Files') >= 0) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        document.body.classList.add('dragging-file');
        ALS.$$('.slot.drop-target').forEach(el => { if (el !== slotEl) el.classList.remove('drop-target'); });
        if (slotEl) slotEl.classList.add('drop-target');
        return;
      }
      if (t.indexOf('text/plain') >= 0) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        ALS.$$('.slot.drop-target').forEach(el => { if (el !== slotEl) el.classList.remove('drop-target'); });
        if (slotEl) slotEl.classList.add('drop-target');
      }
    });

    document.addEventListener('dragleave', e => {
      if (e.target === document.body || e.target === document.documentElement) clearDragStyles();
    });

    document.addEventListener('drop', e => {
      const t = typesOf(e.dataTransfer);
      const slotEl = e.target.closest && e.target.closest('.slot');
      const pageEl = e.target.closest && e.target.closest('.page');
      clearDragStyles();

      if (t.indexOf('Files') >= 0) {
        e.preventDefault();
        const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
        if (!files.length) return;
        const target = {};
        if (slotEl) target.slotId = slotEl.dataset.slotId;
        else if (pageEl) target.pageIndex = parseInt(pageEl.dataset.page, 10);
        media.insertFiles(files, target);
        return;
      }

      let data = '';
      try { data = e.dataTransfer.getData('text/plain'); } catch (err) { data = ''; }
      if (data && data.indexOf('slot:') === 0) {
        if (slotEl) {
          e.preventDefault();
          media.moveOrSwap(data.slice(5), slotEl.dataset.slotId);
        }
      }
    });

    /* double-click: browse for an image into / replace the slot */
    document.addEventListener('dblclick', e => {
      const slotEl = e.target.closest && e.target.closest('.slot');
      if (!slotEl) return;
      const found = ALS.findSlot(slotEl.dataset.slotId);
      if (!found) return;
      if (found.slot.imageId) {
        pendingReplaceSlot = found.slot.id;
      } else {
        // remember where the picked files should land
        pendingAddSlot = found.slot.id;
      }
      (found.slot.imageId ? $('#replaceInput') : $('#fileInput')).click();
    });
  };

  let pendingAddSlot = null;

  /* wrap insertFiles so dblclick targets are honoured */
  const origInsert = media.insertFiles;
  media.insertFiles = function (files, target) {
    if (pendingAddSlot) {
      target = Object.assign({ slotId: pendingAddSlot }, target || {});
      pendingAddSlot = null;
    }
    return origInsert.call(this, files, target);
  };
})();
