/* =========================================================
   layout.js — physical geometry.
   Single source of truth for slot rectangles and image
   placement, used by the on-screen preview, the print
   renderer and the PDF exporter so all three agree.
   All units are millimetres unless noted.
   ========================================================= */
(function () {
  'use strict';
  const ALS = (window.ALS = window.ALS || {});

  /**
   * Page-level geometry.
   * @returns {{pw:number, ph:number, content:{x,y,w,h}, gap:number, rows:number, cols:number, cellW:number, cellH:number}}
   */
  ALS.pageGeom = function (page) {
    const cfg = ALS.state.doc.page;
    const { w: pw, h: ph } = ALS.pageSizeMM(cfg);
    const m = cfg.margins;
    const content = {
      x: Number(m.left) || 0,
      y: Number(m.top) || 0,
      w: Math.max(1, pw - (Number(m.left) || 0) - (Number(m.right) || 0)),
      h: Math.max(1, ph - (Number(m.top) || 0) - (Number(m.bottom) || 0))
    };
    const gap = Math.max(0, Number(cfg.gap) || 0);
    const rows = page.rows, cols = page.cols;
    const cellW = Math.max(1, (content.w - gap * (cols - 1)) / cols);
    const cellH = Math.max(1, (content.h - gap * (rows - 1)) / rows);
    return { pw, ph, content, gap, rows, cols, cellW, cellH };
  };

  /** Grid cell rectangle for slot index `i`. */
  ALS.cellRect = function (geom, i) {
    const r = Math.floor(i / geom.cols), c = i % geom.cols;
    return {
      x: geom.content.x + c * (geom.cellW + geom.gap),
      y: geom.content.y + r * (geom.cellH + geom.gap),
      w: geom.cellW,
      h: geom.cellH
    };
  };

  /**
   * Final rectangle of slot `i` (honours per-slot size override,
   * centred inside its grid cell and clamped to the content box).
   */
  ALS.slotRect = function (geom, page, i) {
    const cell = ALS.cellRect(geom, i);
    const slot = page.slots[i];
    if (slot && slot.size && Number(slot.size.w) > 0 && Number(slot.size.h) > 0) {
      const w = Math.min(Number(slot.size.w), geom.content.w);
      const h = Math.min(Number(slot.size.h), geom.content.h);
      return {
        x: ALS.clamp(cell.x + (cell.w - w) / 2, geom.content.x, geom.content.x + geom.content.w - w),
        y: ALS.clamp(cell.y + (cell.h - h) / 2, geom.content.y, geom.content.y + geom.content.h - h),
        w, h
      };
    }
    return cell;
  };

  /**
   * Inner content box of a slot (inside border + padding).
   * Returns everything the renderers need to draw the frame.
   */
  ALS.slotInner = function (rect, slot) {
    const st = slot.style;
    const border = Math.max(0, Number(st.border) || 0);
    const padding = Math.max(0, Number(st.padding) || 0);
    const radius = Math.max(0, Number(st.radius) || 0);
    const x = rect.x + border + padding;
    const y = rect.y + border + padding;
    const w = Math.max(0.5, rect.w - 2 * (border + padding));
    const h = Math.max(0.5, rect.h - 2 * (border + padding));
    return { x, y, w, h, border, padding, radius, borderColor: st.borderColor, background: st.background };
  };

  /**
   * Image placement inside a slot's content box.
   *
   * Returns a plan in content-local mm coordinates:
   *   bw,bh      base fit box (contain/cover) for the cropped source
   *   dw,dh      displayed size of the *cropped* region (fit × zoom × stretch)
   *   VW,VH      visual size after rotation (what occupies the box)
   *   VX,VY      top-left of the visual box inside the content box
   *   winX,winY  top-left of the un-rotated "window" element
   *   cx,cy      window centre (rotation pivot)
   *   imgW,imgH  full (uncropped) image element size
   *   imgX,imgY  image element top-left inside the window
   *   rot        rotation degrees 0/90/180/270
   */
  ALS.imagePlan = function (slot, asset, boxW, boxH, opts) {
    opts = opts || {};
    const t = slot.img || ALS.defaultImg();
    const crop = t.crop || { x: 0, y: 0, w: 1, h: 1 };
    const nw = asset.natW || 1000, nh = asset.natH || 1000;

    // source region (uncropped reference for fit = the crop box)
    const ew = Math.max(1e-6, nw * crop.w);
    const eh = Math.max(1e-6, nh * crop.h);

    const fit = opts.fit || t.fit;
    const zoom = opts.zoom != null ? opts.zoom : t.zoom;
    const sx = opts.sx != null ? opts.sx : t.sx;
    const sy = opts.sy != null ? opts.sy : t.sy;
    const rot = ((opts.rotation != null ? opts.rotation : t.rotation) % 360 + 360) % 360;
    const ox = opts.ox != null ? opts.ox : t.ox;
    const oy = opts.oy != null ? opts.oy : t.oy;

    // 1. base fit of the crop box into the content box.
    //    When rotated 90/270 the footprint is swapped, so fit against
    //    the swapped box — otherwise "fill" would leak outside the slot.
    const swap = rot === 90 || rot === 270;
    const fitW = swap ? boxH : boxW;
    const fitH = swap ? boxW : boxH;
    const k = fit === 'cover' ? Math.max(fitW / ew, fitH / eh) : Math.min(fitW / ew, fitH / eh);
    // 2. displayed size of the cropped region
    const dw = Math.max(0.01, ew * k * zoom * sx);
    const dh = Math.max(0.01, eh * k * zoom * sy);

    // 3. visual footprint after rotation
    const VW = swap ? dh : dw;
    const VH = swap ? dw : dh;

    // 4. place the footprint using object-position style offsets
    const VX = (boxW - VW) * (ox / 100);
    const VY = (boxH - VH) * (oy / 100);
    const cx = VX + VW / 2;
    const cy = VY + VH / 2;

    // 5. un-rotated window + full image element
    const winX = cx - dw / 2;
    const winY = cy - dh / 2;
    const imgW = dw / Math.max(1e-6, crop.w);   // full source width at this scale
    const imgH = dh / Math.max(1e-6, crop.h);
    const imgX = -crop.x * imgW;
    const imgY = -crop.y * imgH;

    return {
      crop, nw, nh, fit, zoom, sx, sy, rot, ox, oy,
      k, dw, dh, VW, VH, VX, VY, cx, cy,
      winX, winY, imgW, imgH, imgX, imgY,
      boxW, boxH
    };
  };

  /**
   * Layout used while cropping: the *whole* image is shown, fit to
   * the content box and centred, so the crop rect can be dragged
   * over the entire picture.
   */
  ALS.cropPreviewPlan = function (slot, asset, boxW, boxH) {
    const t = slot.img || ALS.defaultImg();
    const fake = Object.assign({}, t, {
      fit: 'contain', zoom: 1, sx: 1, sy: 1, ox: 50, oy: 50, rotation: 0,
      crop: { x: 0, y: 0, w: 1, h: 1 }
    });
    const tmp = { img: fake };
    return ALS.imagePlan(tmp, asset, boxW, boxH);
  };

  /**
   * Crop rectangle in content-local mm, given a plan made by
   * cropPreviewPlan (which uses the full, uncropped image).
   */
  ALS.cropRectMM = function (plan, crop) {
    return {
      x: plan.winX + crop.x * plan.dw,
      y: plan.winY + crop.y * plan.dh,
      w: crop.w * plan.dw,
      h: crop.h * plan.dh
    };
  };

  /** Convert a content-local mm point into crop fractions. */
  ALS.cropFromPoint = function (plan, mmX, mmY) {
    return {
      x: (mmX - plan.winX) / plan.dw,
      y: (mmY - plan.winY) / plan.dh
    };
  };

  /** Human readable summary of an image plan. */
  ALS.planSummary = function (plan) {
    return { w: plan.VW, h: plan.VH };
  };

  /* ================================================================
     CAPTIONS
     One measurement path (canvas measureText) feeds the preview line
     rendering and the PDF text drawing, so wrapped lines are identical
     in every output. All sizes are pt in the model (CSS pt === jsPDF pt).
     ================================================================ */

  const MM_PER_PT = 0.352778;
  ALS.MM_PER_PT = MM_PER_PT;

  // base-14 PDF families -> metrics-close system fonts for measuring
  const CAP_FONT_CSS = { helvetica: 'Arial', times: 'Times New Roman', courier: 'Courier New' };
  ALS.CAP_FAMILIES = ['helvetica', 'times', 'courier'];

  let _mctx = null;
  function measureCtx() {
    if (!_mctx) _mctx = document.createElement('canvas').getContext('2d');
    return _mctx;
  }

  /** CSS font shorthand for a caption (size numerically = pt). */
  ALS.captionFont = function (cap) {
    return (cap.italic ? 'italic ' : '') + (cap.bold ? 'bold ' : '') +
      cap.size + 'px ' + (CAP_FONT_CSS[cap.family] || CAP_FONT_CSS.helvetica);
  };

  /**
   * Greedy word wrap of `text` to `maxWmm` millimetres.
   * Over-long words are broken by character; explicit newlines are kept.
   * @returns {string[]} lines
   */
  ALS.wrapCaption = function (text, maxWmm, cap) {
    const maxW = Math.max(1, maxWmm / MM_PER_PT);   // mm -> the pt-sized measurement unit
    const ctx = measureCtx();
    ctx.font = ALS.captionFont(cap);

    const lines = [];
    String(text).split(/\r?\n/).forEach(par => {
      const words = par.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); return; }

      // 1. split words that alone exceed the width into character chunks
      const tokens = [];
      words.forEach(w => {
        if (ctx.measureText(w).width <= maxW) { tokens.push({ t: w, c: false }); return; }
        let chunk = '', first = true;
        for (const ch of w) {
          if (chunk && ctx.measureText(chunk + ch).width > maxW) {
            tokens.push({ t: chunk, c: !first });
            chunk = ch; first = false;
          } else chunk += ch;
        }
        tokens.push({ t: chunk, c: !first });
      });

      // 2. greedy join
      let cur = '';
      tokens.forEach(tk => {
        if (!cur) { cur = tk.t; return; }
        const sep = tk.c ? '' : ' ';
        if (ctx.measureText(cur + sep + tk.t).width <= maxW) cur += sep + tk.t;
        else { lines.push(cur); cur = tk.t; }
      });
      if (cur) lines.push(cur);
    });

    return lines.length ? lines : [''];
  };

  /**
   * Full caption layout for a slot's content box.
   * The strip is reserved *below* the image and never takes more than
   * half the box height (extra lines are clipped, not shrunk).
   * @returns {{visible:boolean, lines:string[], height:number, lineH:number, size:number, cap:Object}}
   */
  ALS.captionLayout = function (slot, boxW, boxH) {
    const base = slot.caption || ALS.defaultCaption();
    if (!String(base.text || '').trim()) {
      return { visible: false, lines: [], height: 0, lineH: 0, size: 0, cap: base };
    }
    const size = ALS.clamp(Number(base.size) || 9, 4, 96);
    const cap = Object.assign({}, base, { size });
    const lineH = size * 1.25 * MM_PER_PT;          // 125 % leading
    let lines = ALS.wrapCaption(cap.text, boxW, cap);

    const maxLines = Math.max(1, Math.floor((boxH * 0.5) / lineH));
    if (lines.length > maxLines) lines = lines.slice(0, maxLines);

    return {
      visible: true,
      lines,
      height: lines.length * lineH,
      lineH,
      size,
      cap
    };
  };

  /**
   * Split a slot's content box into the image box and the caption strip.
   * Coordinates are content-local mm (0,0 = top-left of the content box).
   * @returns {{caption:Object, image:{x,y,w,h}, captionBox:{x,y,w,h}}}
   */
  ALS.slotBoxes = function (slot, boxW, boxH) {
    const caption = ALS.captionLayout(slot, boxW, boxH);
    const imgH = Math.max(1, boxH - caption.height);
    return {
      caption,
      image: { x: 0, y: 0, w: boxW, h: imgH },
      captionBox: { x: 0, y: imgH, w: boxW, h: caption.height }
    };
  };
})();
