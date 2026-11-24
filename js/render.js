/* =========================================================
   render.js — centre-panel live preview.
   Renders the current page at real proportions, including
   slots, images, selection state, the crop overlay and
   interactive panning.
   ========================================================= */
(function () {
  'use strict';
  const ALS = (window.ALS = window.ALS || {});
  const $ = ALS.$;

  ALS.view = { scale: 1, fitScale: 1 };

  /* -------------------------------------------------------
     Zoom: ui.zoom === 1 means "fit the page to the workspace"
     ------------------------------------------------------- */
  ALS.computeScale = function () {
    const scroll = $('#previewScroll');
    const page = ALS.currentPage();
    if (!scroll || !page) return;
    const geom = ALS.pageGeom(page);
    const availW = Math.max(120, scroll.clientWidth - 56);
    const availH = Math.max(120, scroll.clientHeight - 56);
    const fit = Math.min(availW / geom.pw, availH / geom.ph);
    ALS.view.fitScale = fit;
    ALS.view.scale = fit * ALS.state.ui.zoom;
    ALS.view.pageGeom = geom;
  };

  ALS.setZoom = function (z, label) {
    ALS.state.ui.zoom = ALS.clamp(z, 0.2, 3);
    ALS.computeScale();
    ALS.requestRender();
    ALS.scheduleAutosave();
  };

  ALS.zoomFit = function () {
    ALS.state.ui.zoom = 1;
    ALS.computeScale();
    ALS.requestRender();
    ALS.scheduleAutosave();
  };

  const px = mm => mm * ALS.view.scale;

  /* -------------------------------------------------------
     Main preview render
     ------------------------------------------------------- */
  ALS.renderPreview = function () {
    const stage = $('#previewStage');
    if (!stage) return;
    ALS.computeScale();

    const ui = ALS.state.ui;
    const page = ALS.currentPage();
    const idx = ui.page;
    stage.textContent = '';
    if (!page) return;

    const geom = ALS.pageGeom(page);
    const S = ALS.view.scale;

    const pageEl = ALS.el('div', {
      class: 'page',
      dataset: { page: String(idx) },
      style: {
        width: px(geom.pw) + 'px',
        height: px(geom.ph) + 'px',
        background: ALS.state.doc.page.background || '#ffffff'
      }
    });

    const selId = ui.selectedSlotId;

    page.slots.forEach((slot, i) => {
      const rect = ALS.slotRect(geom, page, i);
      const hasImg = !!slot.imageId && !!ALS.state.doc.images[slot.imageId];
      const selected = slot.id === selId;

      const slotEl = ALS.el('div', {
        class: 'slot' + (hasImg ? ' filled' : ' empty') + (selected ? ' selected' : ''),
        dataset: { slotId: slot.id, pageIndex: String(idx), slotIndex: String(i) },
        style: {
          left: px(rect.x) + 'px',
          top: px(rect.y) + 'px',
          width: px(rect.w) + 'px',
          height: px(rect.h) + 'px'
        }
      });

      if (hasImg) {
        const inner = ALS.slotInner(rect, slot);
        const asset = ALS.state.doc.images[slot.imageId];

        const frame = ALS.el('div', {
          class: 'slot-frame',
          style: {
            // padding carries border+padding so the content box lands exactly
            // on `inner` without the browser's device-pixel border snapping
            padding: px(inner.border + inner.padding) + 'px',
            borderRadius: px(inner.radius) + 'px',
            background: (inner.background && inner.background !== 'transparent') ? inner.background : 'transparent'
          }
        });

        const content = ALS.el('div', { class: 'slot-content' });
        const cw = px(inner.w), ch = px(inner.h);

        // image box + caption strip (shared with print/PDF via layout.js)
        const boxes = ALS.slotBoxes(slot, inner.w, inner.h);
        const ibox = boxes.image;
        const capL = boxes.caption;

        const cropMode = ui.cropMode && selected;
        let plan;
        if (cropMode) {
          plan = ALS.cropPreviewPlan(slot, asset, ibox.w, ibox.h);
        } else {
          plan = ALS.imagePlan(slot, asset, ibox.w, ibox.h);
        }

        const win = ALS.el('div', {
          class: 'img-window',
          style: {
            left: px(plan.winX) + 'px',
            top: px(plan.winY) + 'px',
            width: px(plan.dw) + 'px',
            height: px(plan.dh) + 'px',
            transform: plan.rot ? 'rotate(' + plan.rot + 'deg)' : 'none'
          }
        });

        const img = ALS.el('img', {
          src: asset.src,
          alt: asset.name || 'image',
          draggable: 'false',
          style: {
            left: px(plan.imgX) + 'px',
            top: px(plan.imgY) + 'px',
            width: px(plan.imgW) + 'px',
            height: px(plan.imgH) + 'px'
          }
        });
        win.appendChild(img);
        content.appendChild(win);

        if (capL.visible) content.appendChild(buildCaption(capL, inner));

        if (cropMode) buildCropOverlay(content, slot, asset, inner, ibox, cw, ch);

        frame.appendChild(content);
        if (inner.border > 0) {
          frame.appendChild(ALS.el('div', {
            class: 'slot-border',
            style: {
              borderWidth: px(inner.border) + 'px',
              borderColor: inner.borderColor || '#000000',
              borderRadius: px(inner.radius) + 'px'
            }
          }));
        }
        slotEl.appendChild(frame);

        // hover controls: drag-to-reorder handle + quick remove
        slotEl.appendChild(ALS.el('div', {
          class: 'slot-tools',
          title: 'Drag to reorder, click to select'
        }, [
          ALS.el('span', { class: 'grip', draggable: 'true', dataset: { dragSlot: slot.id }, text: '⠿', title: 'Drag to another slot or page to reorder' }),
          ALS.el('button', {
            class: 'minibtn', text: '✕', title: 'Remove image (Delete)',
            onclick: e => { e.stopPropagation(); ALS.media && ALS.media.removeImage(slot.id); }
          })
        ]));
      }

      pageEl.appendChild(slotEl);
    });

    const cap = ALS.el('div', { class: 'page-number', text: 'Page ' + (idx + 1) + ' of ' + ALS.docPages().length + ' · ' + ALS.round(geom.pw, 1) + ' × ' + ALS.round(geom.ph, 1) + ' mm' });
    const wrap = ALS.el('div', { class: 'page-wrap', style: { position: 'relative' } }, [pageEl, cap]);
    stage.appendChild(wrap);

    ALS.bindPagePointerInteractions(pageEl, page, geom);
  };

  /* -------------------------------------------------------
     Caption strip (below the image, inside the content box)
     `toLen` converts mm to a CSS length (px for preview, mm for print)
     ------------------------------------------------------- */
  ALS.buildCaption = function (capL, inner, toLen) {
    toLen = toLen || (v => px(v) + 'px');
    const c = capL.cap;
    const fam = { helvetica: 'Helvetica, Arial, sans-serif', times: '"Times New Roman", Times, serif', courier: '"Courier New", Courier, monospace' };
    const box = ALS.el('div', {
      class: 'slot-caption',
      dataset: { cap: '1' },
      style: {
        left: '0px',
        top: toLen(inner.h - capL.height),
        width: toLen(inner.w),
        height: toLen(capL.height),
        fontFamily: fam[c.family] || fam.helvetica,
        fontSize: c.size + 'pt',
        color: ALS.normHex(c.color, '#000000'),
        fontWeight: c.bold ? '700' : '400',
        fontStyle: c.italic ? 'italic' : 'normal',
        textAlign: c.align || 'center',
        lineHeight: toLen(capL.lineH)
      }
    });
    capL.lines.forEach(line => {
      box.appendChild(ALS.el('span', { class: 'cap-line', text: line || ' ' }));
    });
    return box;
  };
  function buildCaption(capL, inner) { return ALS.buildCaption(capL, inner); }

  /* -------------------------------------------------------
     Crop overlay (built inside the image box of the slot)
     ------------------------------------------------------- */
  function buildCropOverlay(content, slot, asset, inner, ibox, cw, ch) {
    const plan = ALS.cropPreviewPlan(slot, asset, ibox.w, ibox.h);
    const crop = (slot.img && slot.img.crop) || { x: 0, y: 0, w: 1, h: 1 };
    const r = ALS.cropRectMM(plan, crop);

    const mask = ALS.el('div', {
      class: 'cropmask',
      style: {
        left: '0px', top: '0px',
        width: px(ibox.w) + 'px',
        height: px(ibox.h) + 'px',
        right: 'auto', bottom: 'auto'
      }
    });
    const rect = ALS.el('div', {
      class: 'croprect',
      dataset: { cropRect: '1' },
      style: {
        left: px(r.x) + 'px', top: px(r.y) + 'px',
        width: px(r.w) + 'px', height: px(r.h) + 'px'
      }
    });
    ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(h => {
      rect.appendChild(ALS.el('span', { class: 'h', dataset: { h } }));
    });
    mask.appendChild(rect);
    content.appendChild(mask);
    content._cropPlan = plan;
  }

  /* -------------------------------------------------------
     Pointer interactions: select, pan image, crop drag
     ------------------------------------------------------- */
  ALS.bindPagePointerInteractions = function (pageEl, page, geom) {
    pageEl.addEventListener('pointerdown', onPointerDown);

    function onPointerDown(e) {
      if (e.button !== 0) return;
      const slotEl = e.target.closest('.slot');
      if (!slotEl) return;

      const slotId = slotEl.dataset.slotId;
      const found = ALS.findSlot(slotId);
      if (!found) return;

      // --- hover tool buttons / grip: let them behave natively ---
      if (e.target.closest('.grip')) return;
      if (e.target.closest('.minibtn')) return;

      // --- select the slot ---
      const ui = ALS.state.ui;
      const changedSel = ui.selectedSlotId !== slotId;
      if (changedSel) {
        ui.selectedSlotId = slotId;
        if (!ui.cropMode) { /* keep crop mode tied to selection */ }
        ALS.requestRender();
      }

      const slot = found.slot;
      if (!slot.imageId) return;

      // --- crop overlay handles ---
      const cropHandle = e.target.closest('.croprect');
      if (ui.cropMode && cropHandle) {
        e.preventDefault();
        startCropDrag(e, slotEl, slot, cropHandle.classList.contains('h') ? cropHandle.dataset.h : 'move');
        return;
      }
      if (ui.cropMode) return; // mask swallows the rest

      // --- pan the image inside the slot ---
      const content = slotEl.querySelector('.slot-content');
      if (!content) return;
      e.preventDefault();
      startPan(e, slotEl, slot, content);
    }

    /* ---------- panning ---------- */
    function startPan(e, slotEl, slot, content) {
      const asset = ALS.state.doc.images[slot.imageId];
      if (!asset) return;
      const rect = ALS.slotRect(geom, page, page.slots.indexOf(slot));
      const inner = ALS.slotInner(rect, slot);
      const ibox = ALS.slotBoxes(slot, inner.w, inner.h).image;
      const plan = ALS.imagePlan(slot, asset, ibox.w, ibox.h);

      const startX = e.clientX, startY = e.clientY;
      let ox0 = plan.ox, oy0 = plan.oy;
      let moved = false;
      const rangeX = ibox.w - plan.VW;
      const rangeY = ibox.h - plan.VH;

      const onMove = ev => {
        const dx = (ev.clientX - startX) / ALS.view.scale; // mm
        const dy = (ev.clientY - startY) / ALS.view.scale;
        if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 3) return;
        moved = true;
        let nox = ox0, noy = oy0;
        if (Math.abs(rangeX) > 0.01) nox = ALS.clamp(ox0 + (dx / rangeX) * 100, 0, 100);
        if (Math.abs(rangeY) > 0.01) noy = ALS.clamp(oy0 + (dy / rangeY) * 100, 0, 100);
        if (nox === slot.img.ox && noy === slot.img.oy) return;
        ALS.tx(() => {
          slot.img.ox = Math.round(nox * 10) / 10;
          slot.img.oy = Math.round(noy * 10) / 10;
        }, 'move image');
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        ALS.tx.endGesture && ALS.tx.endGesture();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }

    /* ---------- crop dragging ---------- */
    function startCropDrag(e, slotEl, slot, mode) {
      const asset = ALS.state.doc.images[slot.imageId];
      const content = slotEl.querySelector('.slot-content');
      if (!asset || !content || !content._cropPlan) return;
      const plan = content._cropPlan;
      const box = content.getBoundingClientRect();

      const startX = e.clientX, startY = e.clientY;
      const c0 = Object.assign({}, slot.img.crop);
      const minS = 0.02; // 2 % minimum
      const pxToMM = v => v / ALS.view.scale;

      const onMove = ev => {
        const dx = pxToMM(ev.clientX - startX);
        const dy = pxToMM(ev.clientY - startY);
        const dFx = dx / plan.dw, dFy = dy / plan.dh;
        let { x, y, w, h } = c0;

        if (mode === 'move') {
          x = ALS.clamp(c0.x + dFx, 0, 1 - c0.w);
          y = ALS.clamp(c0.y + dFy, 0, 1 - c0.h);
        } else {
          let x2 = c0.x + c0.w, y2 = c0.y + c0.h;
          if (mode.includes('w')) { x = ALS.clamp(c0.x + dFx, 0, x2 - minS); }
          if (mode.includes('n')) { y = ALS.clamp(c0.y + dFy, 0, y2 - minS); }
          if (mode.includes('e')) { x2 = ALS.clamp(x2 + dFx, x + minS, 1); }
          if (mode.includes('s')) { y2 = ALS.clamp(y2 + dFy, y + minS, 1); }
          w = x2 - x; h = y2 - y;
        }

        const nc = {
          x: Math.round(x * 1000) / 1000,
          y: Math.round(y * 1000) / 1000,
          w: Math.round(w * 1000) / 1000,
          h: Math.round(h * 1000) / 1000
        };
        if (nc.x === c0.x && nc.y === c0.y && nc.w === c0.w && nc.h === c0.h) return;
        ALS.tx(() => { Object.assign(slot.img.crop, nc); }, 'crop image');
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        ALS.tx.endGesture && ALS.tx.endGesture();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }
  };
})();
