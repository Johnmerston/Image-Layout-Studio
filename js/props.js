/* =========================================================
   props.js — right panel: image adjustments, slot styling,
   page moves. Two-way bound to the selected slot.
   ========================================================= */
(function () {
  'use strict';
  const ALS = (window.ALS = window.ALS || {});
  const $ = ALS.$;

  const isNum = v => !isNaN(v) && isFinite(v);

  /* -------------------------------------------------- binding */

  ALS.bindProps = function () {
    /* ---- image actions ---- */
    $('#btnReplace').addEventListener('click', () => ALS.media.replaceSelected());
    $('#btnDuplicateImg').addEventListener('click', () => ALS.media.duplicateSelected());
    $('#btnRemoveImg').addEventListener('click', () => ALS.media.removeSelected());

    /* ---- fit mode ---- */
    ALS.$$('#fitMode button').forEach(b => {
      b.addEventListener('click', () => {
        const sel = ALS.selected();
        if (!sel || !sel.slot.imageId) return;
        ALS.tx(() => { sel.slot.img.fit = b.dataset.value; }, 'fit mode');
      });
    });

    /* ---- displayed size (mm) ---- */
    const applySize = (which, raw) => {
      const sel = ALS.selected();
      if (!sel || !sel.slot.imageId) return;
      const v = parseFloat(raw);
      if (!isNum(v) || v <= 0) return;
      const asset = ALS.state.doc.images[sel.slot.imageId];
      const rect = ALS.slotRect(ALS.pageGeom(sel.page), sel.page, sel.page.slots.indexOf(sel.slot));
      const inner = ALS.slotInner(rect, sel.slot);
      const ibox = ALS.slotBoxes(sel.slot, inner.w, inner.h).image;
      const plan = ALS.imagePlan(sel.slot, asset, ibox.w, ibox.h);
      const swap = plan.rot === 90 || plan.rot === 270;
      const baseX = Math.max(1e-6, plan.dw / plan.sx);
      const baseY = Math.max(1e-6, plan.dh / plan.sy);

      ALS.tx(() => {
        const t = sel.slot.img;
        if (t.lockAspect) {
          const s = swap
            ? (which === 'w' ? v / baseY : v / baseX)
            : (which === 'w' ? v / baseX : v / baseY);
          t.sx = Math.max(0.01, s);
          t.sy = Math.max(0.01, s);
        } else if (swap) {
          if (which === 'w') t.sy = Math.max(0.01, v / baseY);
          else t.sx = Math.max(0.01, v / baseX);
        } else {
          if (which === 'w') t.sx = Math.max(0.01, v / baseX);
          else t.sy = Math.max(0.01, v / baseY);
        }
      }, 'image size');
    };
    $('#imgW').addEventListener('change', e => applySize('w', e.target.value));
    $('#imgH').addEventListener('change', e => applySize('h', e.target.value));

    /* ---- aspect lock ---- */
    $('#aspectLock').addEventListener('change', e => {
      const sel = ALS.selected();
      if (!sel || !sel.slot.imageId) return;
      ALS.tx(() => {
        const t = sel.slot.img;
        t.lockAspect = e.target.checked;
        if (t.lockAspect) t.sy = t.sx;
      }, 'aspect lock');
    });

    /* ---- fit / fill ---- */
    $('#btnFitSlot').addEventListener('click', () => {
      const sel = ALS.selected();
      if (!sel || !sel.slot.imageId) return;
      ALS.tx(() => Object.assign(sel.slot.img, {
        fit: 'contain', zoom: 1, sx: 1, sy: 1, ox: 50, oy: 50
      }), 'fit to slot');
    });
    $('#btnFillSlot').addEventListener('click', () => {
      const sel = ALS.selected();
      if (!sel || !sel.slot.imageId) return;
      ALS.tx(() => Object.assign(sel.slot.img, {
        fit: 'cover', zoom: 1, sx: 1, sy: 1, ox: 50, oy: 50
      }), 'fill slot');
    });

    /* ---- scale / zoom ---- */
    $('#imgScaleNum').addEventListener('input', e => {
      const sel = ALS.selected();
      const v = parseFloat(e.target.value);
      if (!sel || !sel.slot.imageId || !isNum(v) || v <= 0) return;
      ALS.tx(() => { sel.slot.img.zoom = ALS.clamp(v / 100, 0.05, 10); }, 'scale image');
    });
    $('#imgZoom').addEventListener('input', e => {
      const sel = ALS.selected();
      if (!sel || !sel.slot.imageId) return;
      ALS.tx(() => { sel.slot.img.zoom = ALS.clamp(parseFloat(e.target.value) / 100, 0.05, 4); }, 'scale image');
    });

    /* ---- position ---- */
    $('#posX').addEventListener('input', e => {
      const sel = ALS.selected();
      if (!sel || !sel.slot.imageId) return;
      ALS.tx(() => { sel.slot.img.ox = ALS.clamp(parseFloat(e.target.value), 0, 100); }, 'position image');
    });
    $('#posY').addEventListener('input', e => {
      const sel = ALS.selected();
      if (!sel || !sel.slot.imageId) return;
      ALS.tx(() => { sel.slot.img.oy = ALS.clamp(parseFloat(e.target.value), 0, 100); }, 'position image');
    });

    /* ---- rotation ---- */
    const rotate = deg => {
      const sel = ALS.selected();
      if (!sel || !sel.slot.imageId) return;
      ALS.tx(() => {
        sel.slot.img.rotation = (((sel.slot.img.rotation + deg) % 360) + 360) % 360;
      }, 'rotate image');
    };
    $('#btnRotL').addEventListener('click', () => rotate(-90));
    $('#btnRotR').addEventListener('click', () => rotate(90));
    $('#btnRot180').addEventListener('click', () => rotate(180));

    /* ---- crop ---- */
    $('#btnCrop').addEventListener('click', () => {
      const sel = ALS.selected();
      if (!sel || !sel.slot.imageId) return;
      ALS.state.ui.cropMode = !ALS.state.ui.cropMode;
      ALS.requestRender();
    });
    $('#btnCropDone').addEventListener('click', () => {
      ALS.state.ui.cropMode = false;
      ALS.requestRender();
    });
    $('#btnCropReset').addEventListener('click', () => {
      const sel = ALS.selected();
      if (!sel || !sel.slot.imageId) return;
      ALS.tx(() => { sel.slot.img.crop = { x: 0, y: 0, w: 1, h: 1 }; }, 'crop image');
    });
    const cropField = (id, key) => $('#' + id).addEventListener('change', e => {
      const sel = ALS.selected();
      if (!sel || !sel.slot.imageId) return;
      const v = ALS.clamp(parseFloat(e.target.value) || 0, 0, 100) / 100;
      ALS.tx(() => {
        const c = sel.slot.img.crop;
        if (key === 'x') { c.x = ALS.clamp(v, 0, 1 - c.w); }
        if (key === 'y') { c.y = ALS.clamp(v, 0, 1 - c.h); }
        if (key === 'w') { c.w = ALS.clamp(v, 0.01, 1 - c.x); }
        if (key === 'h') { c.h = ALS.clamp(v, 0.01, 1 - c.y); }
        c.x = Math.round(c.x * 1000) / 1000;
        c.y = Math.round(c.y * 1000) / 1000;
        c.w = Math.round(c.w * 1000) / 1000;
        c.h = Math.round(c.h * 1000) / 1000;
      }, 'crop image');
    });
    cropField('cropX', 'x'); cropField('cropY', 'y');
    cropField('cropW', 'w'); cropField('cropH', 'h');

    /* ---- reset image ---- */
    $('#btnResetImg').addEventListener('click', () => {
      const sel = ALS.selected();
      if (!sel || !sel.slot.imageId) return;
      ALS.tx(() => { sel.slot.img = ALS.defaultImg(); }, 'reset image');
      ALS.toast('Image adjustments reset');
    });

    /* ---- slot size ---- */
    $('#slotCustom').addEventListener('change', e => {
      const sel = ALS.selected();
      if (!sel) return;
      ALS.tx(() => {
        if (e.target.checked) {
          const geom = ALS.pageGeom(sel.page);
          const cell = ALS.cellRect(geom, sel.page.slots.indexOf(sel.slot));
          sel.slot.size = { w: Math.round(cell.w * 10) / 10, h: Math.round(cell.h * 10) / 10 };
        } else {
          sel.slot.size = null;
        }
      }, 'slot size');
    });
    const sizeField = key => $('#' + key).addEventListener('change', e => {
      const sel = ALS.selected();
      const v = parseFloat(e.target.value);
      if (!sel || !isNum(v) || v <= 0) return;
      ALS.tx(() => {
        if (!sel.slot.size) sel.slot.size = { w: 0, h: 0 };
        sel.slot.size[key === 'slotW' ? 'w' : 'h'] = ALS.clamp(v, 1, 2000);
      }, 'slot size');
    });
    sizeField('slotW'); sizeField('slotH');

    /* ---- slot style ---- */
    const styleNum = (id, key, lo, hi, label) => $('#' + id).addEventListener('input', e => {
      const sel = ALS.selected();
      const v = parseFloat(e.target.value);
      if (!sel || !isNum(v) || v < lo) return;
      ALS.tx(() => { sel.slot.style[key] = ALS.clamp(v, lo, hi); }, label);
    });
    styleNum('slotBorder', 'border', 0, 20, 'slot border');
    styleNum('slotRadius', 'radius', 0, 50, 'slot radius');
    styleNum('slotPadding', 'padding', 0, 50, 'slot padding');

    const colorPair = (colorId, hexId, key, label) => {
      const c = $('#' + colorId), h = $('#' + hexId);
      c.addEventListener('input', () => {
        const sel = ALS.selected();
        if (!sel) return;
        ALS.tx(() => { sel.slot.style[key] = c.value; }, label);
        h.value = c.value;
      });
      h.addEventListener('change', () => {
        const sel = ALS.selected();
        if (!sel) return;
        const v = ALS.normHex(h.value, sel.slot.style[key]);
        ALS.tx(() => { sel.slot.style[key] = v; }, label);
        c.value = v; h.value = v;
      });
    };
    colorPair('slotBorderColor', 'slotBorderColorHex', 'borderColor', 'slot border');
    colorPair('slotBg', 'slotBgHex', 'background', 'slot background');

    $('#slotBgClear').addEventListener('click', () => {
      const sel = ALS.selected();
      if (!sel) return;
      ALS.tx(() => { sel.slot.style.background = 'transparent'; }, 'slot background');
    });

    /* ---- caption ---- */
    $('#capText').addEventListener('input', e => {
      const sel = ALS.selected();
      if (!sel) return;
      ALS.tx(() => { sel.slot.caption.text = e.target.value; }, 'caption text');
    });

    $('#capFamily').addEventListener('change', e => {
      const sel = ALS.selected();
      if (!sel) return;
      ALS.tx(() => { sel.slot.caption.family = e.target.value; }, 'caption font');
    });

    $('#capSize').addEventListener('input', e => {
      const sel = ALS.selected();
      const v = parseFloat(e.target.value);
      if (!sel || !isNum(v)) return;
      ALS.tx(() => { sel.slot.caption.size = ALS.clamp(v, 4, 96); }, 'caption size');
    });

    ALS.$$('#capStyle button').forEach(b => {
      b.addEventListener('click', () => {
        const sel = ALS.selected();
        if (!sel) return;
        const key = b.dataset.style;               // 'bold' | 'italic'
        ALS.tx(() => { sel.slot.caption[key] = !sel.slot.caption[key]; }, 'caption style');
      });
    });

    ALS.$$('#capAlign button').forEach(b => {
      b.addEventListener('click', () => {
        const sel = ALS.selected();
        if (!sel) return;
        ALS.tx(() => { sel.slot.caption.align = b.dataset.value; }, 'caption align');
      });
    });

    const capColor = $('#capColor'), capHex = $('#capColorHex');
    capColor.addEventListener('input', () => {
      const sel = ALS.selected();
      if (!sel) return;
      ALS.tx(() => { sel.slot.caption.color = capColor.value; }, 'caption colour');
      capHex.value = capColor.value;
    });
    capHex.addEventListener('change', () => {
      const sel = ALS.selected();
      if (!sel) return;
      const v = ALS.normHex(capHex.value, sel.slot.caption.color || '#000000');
      ALS.tx(() => { sel.slot.caption.color = v; }, 'caption colour');
      capColor.value = v; capHex.value = v;
    });

    /* ---- move to page ---- */
    $('#btnMovePage').addEventListener('click', () => {
      const sel = ALS.selected();
      const target = parseInt($('#movePage').value, 10);
      if (!sel || isNaN(target)) return;
      ALS.pages.moveImageToPage(sel.slot.id, target);
    });
  };

  /* -------------------------------------------------- sync */

  ALS.syncProps = function () {
    const sel = ALS.selected();
    const empty = $('#propsEmpty'), body = $('#propsBody');
    const active = document.activeElement;

    if (!sel) {
      empty.hidden = false;
      body.hidden = true;
      return;
    }
    empty.hidden = true;
    body.hidden = false;

    const slot = sel.slot;
    const hasImg = !!slot.imageId && !!ALS.state.doc.images[slot.imageId];
    $('#grpImage').hidden = !hasImg;
    $('#grpCaption').hidden = !hasImg;
    $('#grpMove').hidden = !hasImg;

    const set = (sel2, val) => {
      const el = $(sel2);
      if (!el || el === active) return;
      const s = String(val);
      if (el.value !== s) el.value = s;
    };

    /* ---- image section ---- */
    if (hasImg) {
      const asset = ALS.state.doc.images[slot.imageId];
      const t = slot.img;
      const nameEl = $('#imgName');
      if (active !== nameEl) {
        nameEl.textContent = asset.name || 'Pasted image';
        nameEl.title = asset.name || 'Pasted image';
      }
      $('#imgDims').textContent = asset.natW + ' × ' + asset.natH + ' px' +
        (asset.size ? ' · ' + ALS.fmtBytes(asset.size) : '');

      ALS.$$('#fitMode button').forEach(b => b.classList.toggle('on', b.dataset.value === t.fit));

      const geom = ALS.pageGeom(sel.page);
      const rect = ALS.slotRect(geom, sel.page, sel.page.slots.indexOf(slot));
      const inner = ALS.slotInner(rect, slot);
      const ibox = ALS.slotBoxes(slot, inner.w, inner.h).image;
      const plan = ALS.imagePlan(slot, asset, ibox.w, ibox.h);

      set('#imgW', ALS.round(plan.VW, 1));
      set('#imgH', ALS.round(plan.VH, 1));
      if (active !== $('#aspectLock')) $('#aspectLock').checked = !!t.lockAspect;

      const scalePct = Math.round(t.zoom * 100);
      set('#imgScaleNum', scalePct);
      set('#imgZoom', Math.min(400, scalePct));
      $('#imgZoomVal').textContent = scalePct + '%';
      set('#posX', Math.round(t.ox));
      set('#posY', Math.round(t.oy));
      $('#posXVal').textContent = Math.round(t.ox);
      $('#posYVal').textContent = Math.round(t.oy);

      const cb = $('#cropBox');
      cb.hidden = !ALS.state.ui.cropMode;
      $('#btnCrop').classList.toggle('on', ALS.state.ui.cropMode);
      if (ALS.state.ui.cropMode) {
        set('#cropX', Math.round(t.crop.x * 100));
        set('#cropY', Math.round(t.crop.y * 100));
        set('#cropW', Math.round(t.crop.w * 100));
        set('#cropH', Math.round(t.crop.h * 100));
      }

      /* ---- caption section ---- */
      const cap = slot.caption || ALS.defaultCaption();
      const capText = $('#capText');
      if (active !== capText && capText.value !== (cap.text || '')) capText.value = cap.text || '';
      if (active !== $('#capFamily')) $('#capFamily').value = cap.family || 'helvetica';
      if (active !== $('#capSize')) {
        const s = String(cap.size == null ? 9 : cap.size);
        if ($('#capSize').value !== s) $('#capSize').value = s;
      }
      ALS.$$('#capStyle button').forEach(b => b.classList.toggle('on', !!cap[b.dataset.style]));
      ALS.$$('#capAlign button').forEach(b => b.classList.toggle('on', b.dataset.value === (cap.align || 'center')));
      const cc = ALS.normHex(cap.color, '#000000');
      if (active !== $('#capColor')) $('#capColor').value = cc;
      if (active !== $('#capColorHex')) $('#capColorHex').value = cc;
    }

    /* ---- slot section ---- */
    const custom = !!slot.size;
    if (active !== $('#slotCustom')) $('#slotCustom').checked = custom;
    $('#slotW').disabled = !custom;
    $('#slotH').disabled = !custom;
    if (custom) { set('#slotW', ALS.round(slot.size.w, 1)); set('#slotH', ALS.round(slot.size.h, 1)); }

    set('#slotBorder', ALS.round(slot.style.border, 2));
    set('#slotRadius', ALS.round(slot.style.radius, 1));
    set('#slotPadding', ALS.round(slot.style.padding, 2));

    const bc = ALS.normHex(slot.style.borderColor, '#000000');
    if (active !== $('#slotBorderColor')) $('#slotBorderColor').value = bc;
    if (active !== $('#slotBorderColorHex')) $('#slotBorderColorHex').value = bc;

    const transparent = !slot.style.background || slot.style.background === 'transparent';
    const bgv = transparent ? '#ffffff' : ALS.normHex(slot.style.background, '#ffffff');
    if (active !== $('#slotBg')) $('#slotBg').value = bgv;
    if (active !== $('#slotBgHex')) $('#slotBgHex').value = transparent ? 'transparent' : bgv;
    $('#slotBgClear').disabled = transparent;

    /* ---- move select ---- */
    const mp = $('#movePage');
    const n = ALS.docPages().length;
    const pi = sel.pageIndex;
    const mpKey = n + ':' + pi;
    if (mp.dataset.key !== mpKey) {
      mp.dataset.key = mpKey;
      mp.textContent = '';
      for (let i = 0; i < n; i++) {
        mp.appendChild(ALS.el('option', { value: String(i), text: 'Page ' + (i + 1) + (i === pi ? ' (current)' : '') }));
      }
      mp.disabled = !hasImg || n < 2;
      $('#btnMovePage').disabled = !hasImg || n < 2;
    }
    if (active !== mp) mp.value = String(ALS.state.ui.page);
  };
})();
