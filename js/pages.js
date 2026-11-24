/* =========================================================
   pages.js — page navigation strip, add/duplicate/delete,
   and drop-a-image-onto-a-page reordering.
   ========================================================= */
(function () {
  'use strict';
  const ALS = (window.ALS = window.ALS || {});
  const $ = ALS.$;

  const api = {};
  ALS.pages = api;

  /* ---------------- navigation ---------------- */

  api.go = function (delta) {
    const n = ALS.docPages().length;
    const next = ALS.clamp(ALS.state.ui.page + delta, 0, n - 1);
    if (next === ALS.state.ui.page) return;
    ALS.state.ui.page = next;
    // selection may point at another page — keep it if it still exists
    const sel = ALS.selected();
    if (sel && sel.pageIndex !== next) ALS.state.ui.selectedSlotId = null;
    ALS.state.ui.cropMode = false;
    ALS.requestRender();
    ALS.scheduleAutosave();
  };

  api.goto = function (index) {
    const n = ALS.docPages().length;
    const next = ALS.clamp(index, 0, n - 1);
    if (next === ALS.state.ui.page) return;
    ALS.state.ui.page = next;
    const sel = ALS.selected();
    if (sel && sel.pageIndex !== next) ALS.state.ui.selectedSlotId = null;
    ALS.state.ui.cropMode = false;
    ALS.requestRender();
    ALS.scheduleAutosave();
  };

  /* ---------------- commands ---------------- */

  api.addPage = function (rows, cols) {
    const ref = ALS.currentPage();
    ALS.tx(() => {
      const p = ALS.newPage(rows || ref.rows, cols || ref.cols);
      ALS.docPages().push(p);
      ALS.state.ui.page = ALS.docPages().length - 1;
      ALS.state.ui.selectedSlotId = null;
      ALS.state.ui.cropMode = false;
    }, 'add page');
    ALS.toast('Page added');
  };

  api.duplicatePage = function () {
    const src = ALS.currentPage();
    ALS.tx(() => {
      const copy = ALS.deepClone(src);
      copy.id = ALS.uid('page');
      // keep the 1 asset ↔ 1 slot invariant: duplicate shared assets too
      copy.slots.forEach(s => {
        s.id = ALS.uid('slot');
        if (s.imageId && ALS.state.doc.images[s.imageId]) {
          const orig = ALS.state.doc.images[s.imageId];
          const nid = ALS.uid('img');
          ALS.state.doc.images[nid] = Object.assign({}, orig, { id: nid });
          s.imageId = nid;
        }
      });
      const at = ALS.state.ui.page + 1;
      ALS.docPages().splice(at, 0, copy);
      ALS.state.ui.page = at;
      ALS.state.ui.selectedSlotId = null;
      ALS.state.ui.cropMode = false;
    }, 'duplicate page');
    ALS.toast('Page duplicated');
  };

  api.deletePage = async function () {
    const pages = ALS.docPages();
    const idx = ALS.state.ui.page;
    const p = pages[idx];
    if (!p) return;
    const imgs = p.slots.filter(s => s.imageId).length;
    if (pages.length === 1) {
      if (imgs) {
        const ok = await ALS.confirm('Delete all images?', 'This is the only page — deleting it will remove its ' + imgs + ' image(s) and start a fresh page.', 'Delete page');
        if (!ok) return;
        ALS.tx(() => {
          ALS.state.doc = ALS.newDoc();
          ALS.state.ui.page = 0;
          ALS.state.ui.selectedSlotId = null;
          ALS.state.ui.cropMode = false;
        }, 'reset document');
      } else {
        ALS.tx(() => {
          ALS.state.doc.pages[0] = ALS.newPage(3, 2);
          ALS.state.ui.selectedSlotId = null;
        }, 'reset page');
      }
      ALS.toast('Page reset');
      return;
    }
    if (imgs) {
      const ok = await ALS.confirm('Delete page ' + (idx + 1) + '?',
        'This page holds ' + imgs + ' image' + (imgs > 1 ? 's' : '') + '. They will be removed from the document.', 'Delete page');
      if (!ok) return;
    }
    ALS.tx(() => {
      ALS.docPages().splice(idx, 1);
      ALS.state.ui.page = ALS.clamp(idx, 0, ALS.docPages().length - 1);
      ALS.state.ui.selectedSlotId = null;
      ALS.state.ui.cropMode = false;
    }, 'delete page');
    ALS.toast('Page deleted');
  };

  /** Move an image to the first free slot on page `target` (swap if full). */
  api.moveImageToPage = function (slotId, targetIndex) {
    const src = ALS.findSlot(slotId);
    if (!src || !src.slot.imageId) return false;
    const pages = ALS.docPages();
    if (targetIndex < 0 || targetIndex >= pages.length || targetIndex === src.pageIndex) return false;

    ALS.tx(() => {
      const tp = pages[targetIndex];
      const empty = tp.slots.find(s => !s.imageId);
      if (empty) {
        empty.imageId = src.slot.imageId;
        empty.img = src.slot.img;
        empty.caption = src.slot.caption;
        src.slot.imageId = null;
        src.slot.img = null;
        src.slot.caption = ALS.defaultCaption();
      } else {
        // swap with the slot at the same position
        const i = src.page.slots.indexOf(src.slot);
        const other = tp.slots[Math.min(i, tp.slots.length - 1)];
        const tId = other.imageId, tImg = other.img, tCap = other.caption;
        other.imageId = src.slot.imageId;
        other.img = src.slot.img;
        other.caption = src.slot.caption;
        src.slot.imageId = tId;
        src.slot.img = tImg;
        src.slot.caption = tCap;
      }
      // follow the image
      ALS.state.ui.page = targetIndex;
      ALS.state.ui.selectedSlotId = (ALS.findSlot(slotId) || {}).slot ? slotId : null;
      ALS.state.ui.cropMode = false;
    }, 'move image to page');
    ALS.toast('Moved to page ' + (targetIndex + 1));
    return true;
  };

  /* ---------------- thumbnail rendering ---------------- */

  function buildThumb(page, index) {
    const geom = ALS.pageGeom(page);
    const W = 52;
    const H = Math.round(W * (geom.ph / geom.pw));
    const el = ALS.el('div', {
      class: 'thumb' + (index === ALS.state.ui.page ? ' current' : ''),
      dataset: { page: String(index) },
      title: 'Page ' + (index + 1) + ' — click to open, drag an image here to move it'
    });

    const sheet = ALS.el('div', { class: 'sheet', style: { width: W + 'px', height: H + 'px', background: ALS.state.doc.page.background || '#fff' } });

    page.slots.forEach((s, i) => {
      const r = ALS.slotRect(geom, page, i);
      const mini = ALS.el('div', {
        class: 'mini-slot' + (s.imageId ? ' has-img' : ''),
        style: {
          left: ((r.x / geom.pw) * 100) + '%',
          top: ((r.y / geom.ph) * 100) + '%',
          width: ((r.w / geom.pw) * 100) + '%',
          height: ((r.h / geom.ph) * 100) + '%'
        }
      });
      sheet.appendChild(mini);
    });

    const tools = ALS.el('div', { class: 'tl' }, [
      ALS.el('button', { text: '⧉', title: 'Duplicate page', onclick: e => { e.stopPropagation(); ALS.pages.goto(index); ALS.pages.duplicatePage(); } }),
      ALS.el('button', { text: '✕', title: 'Delete page', onclick: e => { e.stopPropagation(); ALS.pages.goto(index); ALS.pages.deletePage(); } })
    ]);

    const cap = ALS.el('div', { class: 'cap', text: String(index + 1) });
    el.appendChild(sheet);
    el.appendChild(tools);
    el.appendChild(cap);

    el.addEventListener('click', () => api.goto(index));

    /* drop a dragged image onto this page */
    el.addEventListener('dragover', e => {
      if (!hasSlotPayload(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('drop-on');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-on'));
    el.addEventListener('drop', e => {
      el.classList.remove('drop-on');
      const slotId = getSlotPayload(e);
      if (!slotId) return;
      e.preventDefault();
      api.moveImageToPage(slotId, index);
    });

    return el;
  }

  function hasSlotPayload(e) {
    const types = e.dataTransfer && e.dataTransfer.types;
    if (!types) return false;
    return Array.from(types).indexOf('text/plain') >= 0;
  }
  function getSlotPayload(e) {
    try {
      const v = e.dataTransfer.getData('text/plain');
      return v && v.startsWith('slot:') ? v.slice(5) : null;
    } catch (err) { return null; }
  }

  ALS.renderStrip = function () {
    const strip = $('#stripPages');
    if (!strip) return;
    strip.textContent = '';
    ALS.docPages().forEach((p, i) => strip.appendChild(buildThumb(p, i)));
    const cur = strip.children[ALS.state.ui.page];
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
})();
