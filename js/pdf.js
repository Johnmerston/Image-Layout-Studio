/* =========================================================
   pdf.js — Option A: native print (Save as PDF)
             Option B: multi-page PDF export via jsPDF.
   Both reuse layout.js so geometry matches the preview.
   ========================================================= */
(function () {
  'use strict';
  const ALS = (window.ALS = window.ALS || {});
  const $ = ALS.$;

  const pdf = {};
  ALS.pdf = pdf;

  /* -------------------------------------------------- colour utils */

  function hexRgb(hex) {
    const h = ALS.normHex(hex, '#000000').replace('#', '');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }
  pdf.hexRgb = hexRgb;

  /* -------------------------------------------------- shared drawing plan */

  /** Rounded-rect path on a 2d context (mm -> px via k). */
  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /**
   * Rasterise one slot's content box to a JPEG data URL.
   * The canvas carries the slot background + the transformed image,
   * so the PDF and the preview share the exact same maths.
   */
  pdf.rasterSlot = async function (slot, asset, rect, inner) {
    const imgEl = await cachedImage(asset.src);
    const ibox = ALS.slotBoxes(slot, inner.w, inner.h).image;
    const plan = ALS.imagePlan(slot, asset, ibox.w, ibox.h);

    const DPI = 300;
    let cw = Math.round((inner.w / 25.4) * DPI);
    let ch = Math.round((inner.h / 25.4) * DPI);
    const CAP = 3200;
    const over = Math.max(1, cw / CAP, ch / CAP);
    cw = Math.max(8, Math.round(cw / over));
    ch = Math.max(8, Math.round(ch / over));

    const k = cw / inner.w;                 // px per mm
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const doc = ALS.state.doc;
    const transparent = v => !v || v === 'transparent';

    // 1. page colour behind everything (keeps the canvas opaque for JPEG)
    ctx.fillStyle = ALS.normHex(doc.page.background, '#ffffff');
    ctx.fillRect(0, 0, cw, ch);

    // 2. clip to the content box, honouring the (inner) corner radius
    const innerRadius = Math.max(0, (Number(slot.style.radius) || 0) - inner.border - inner.padding);
    ctx.save();
    roundRectPath(ctx, 0, 0, cw, ch, innerRadius * k);
    ctx.clip();

    // 3. slot background
    if (!transparent(inner.background)) {
      ctx.fillStyle = ALS.normHex(inner.background, '#ffffff');
      ctx.fillRect(0, 0, cw, ch);
    }

    // 4. the image, using the shared plan
    ctx.save();
    ctx.translate(plan.cx * k, plan.cy * k);
    if (plan.rot) ctx.rotate((plan.rot * Math.PI) / 180);
    const ix = (plan.imgX - plan.dw / 2) * k;
    const iy = (plan.imgY - plan.dh / 2) * k;
    try {
      ctx.drawImage(imgEl, ix, iy, plan.imgW * k, plan.imgH * k);
    } catch (e) { console.warn('drawImage failed', e); }
    ctx.restore();
    ctx.restore();

    return canvas.toDataURL('image/jpeg', 0.94);
  };

  const imgCache = new Map();
  function cachedImage(src) {
    if (imgCache.has(src)) return imgCache.get(src);
    const p = ALS.decodeImage(src).then(res => res.el);
    imgCache.set(src, p);
    p.catch(() => imgCache.delete(src));
    return p;
  }

  /**
   * Draw a slot's caption as vector text (crisp at any zoom).
   * Baseline maths mirrors CSS half-leading so it lands exactly where
   * the preview's line-height centres the glyphs.
   */
  function drawCaption(doc, slot, inner) {
    const capL = ALS.captionLayout(slot, inner.w, inner.h);
    if (!capL.visible) return;
    const c = capL.cap;
    const fam = ALS.CAP_FAMILIES.indexOf(c.family) >= 0 ? c.family : 'helvetica';
    const style = c.bold && c.italic ? 'bolditalic' : c.bold ? 'bold' : c.italic ? 'italic' : 'normal';
    const col = hexRgb(ALS.normHex(c.color, '#000000'));

    const sizeMm = capL.size * ALS.MM_PER_PT;
    const lineH = capL.lineH;                       // 1.25 × size, in mm
    // CSS half-leading: baseline = lineTop + lineH/2 + (ascent−descent)/2
    // Arial metrics (0.905 / 0.212 em) give 0.3465 em.
    const baseline0 = lineH / 2 + 0.3465 * sizeMm;

    doc.setFont(fam, style);
    doc.setFontSize(capL.size);
    doc.setTextColor(col.r, col.g, col.b);

    const align = c.align === 'left' ? 'left' : c.align === 'right' ? 'right' : 'center';
    const x = align === 'left' ? inner.x
      : align === 'right' ? inner.x + inner.w
        : inner.x + inner.w / 2;

    capL.lines.forEach((line, i) => {
      if (!line) return;
      const top = inner.y + (inner.h - capL.height);   // caption strip top
      const y = top + i * lineH + baseline0;
      doc.text(line, x, y, { align, baseline: 'alphabetic' });
    });
  }
  pdf.drawCaption = drawCaption;

  /* ================================================================
     OPTION A — PRINT
     ================================================================ */

  function ensurePrintStyles(w, h) {
    let st = document.getElementById('pageRule');
    if (!st) {
      st = document.createElement('style');
      st.id = 'pageRule';
      document.head.appendChild(st);
    }
    st.textContent = '@page { size: ' + ALS.round(w, 2) + 'mm ' + ALS.round(h, 2) + 'mm; margin: 0; }\n' +
      '@media print { html, body { margin: 0 !important; padding: 0 !important; } }';
  }

  /** Build the hidden print DOM (one exactly-sized page per document page). */
  pdf.buildPrintRoot = function () {
    const root = $('#printRoot');
    root.textContent = '';
    const cfg = ALS.state.doc.page;
    const { w: pw, h: ph } = ALS.pageSizeMM(cfg);
    ensurePrintStyles(pw, ph);

    ALS.docPages().forEach(page => {
      const geom = ALS.pageGeom(page);
      const pageEl = ALS.el('div', {
        class: 'print-page',
        style: {
          width: pw + 'mm',
          height: ph + 'mm',
          background: ALS.normHex(cfg.background, '#ffffff')
        }
      });

      page.slots.forEach((slot, i) => {
        if (!slot.imageId || !ALS.state.doc.images[slot.imageId]) return;
        const rect = ALS.slotRect(geom, page, i);
        const inner = ALS.slotInner(rect, slot);
        const asset = ALS.state.doc.images[slot.imageId];
        const boxes = ALS.slotBoxes(slot, inner.w, inner.h);
        const plan = ALS.imagePlan(slot, asset, boxes.image.w, boxes.image.h);

        const slotEl = ALS.el('div', {
          class: 'slot filled',
          dataset: { slotId: slot.id, pageIndex: String(ALS.docPages().indexOf(page)), slotIndex: String(i) },
          style: {
            left: rect.x + 'mm', top: rect.y + 'mm',
            width: rect.w + 'mm', height: rect.h + 'mm'
          }
        });
        const frame = ALS.el('div', {
          class: 'slot-frame',
          style: {
            // padding carries border+padding so the content box lands exactly on `inner`
            padding: (inner.border + inner.padding) + 'mm',
            borderRadius: inner.radius + 'mm',
            background: (!inner.background || inner.background === 'transparent') ? 'transparent' : inner.background
          }
        });
        const content = ALS.el('div', { class: 'slot-content' });
        const win = ALS.el('div', {
          class: 'img-window',
          style: {
            left: plan.winX + 'mm', top: plan.winY + 'mm',
            width: plan.dw + 'mm', height: plan.dh + 'mm',
            transform: plan.rot ? 'rotate(' + plan.rot + 'deg)' : 'none'
          }
        });
        const img = ALS.el('img', {
          src: asset.src,
          style: {
            left: plan.imgX + 'mm', top: plan.imgY + 'mm',
            width: plan.imgW + 'mm', height: plan.imgH + 'mm'
          }
        });
        win.appendChild(img);
        content.appendChild(win);
        if (boxes.caption.visible) {
          content.appendChild(ALS.buildCaption(boxes.caption, inner, v => v + 'mm'));
        }
        frame.appendChild(content);
        if (inner.border > 0) {
          frame.appendChild(ALS.el('div', {
            class: 'slot-border',
            style: {
              borderWidth: inner.border + 'mm',
              borderColor: inner.borderColor || '#000000',
              borderRadius: inner.radius + 'mm'
            }
          }));
        }
        slotEl.appendChild(frame);
        pageEl.appendChild(slotEl);
      });

      root.appendChild(pageEl);
    });
    return root;
  };

  /** Open the native print dialog (Save as PDF supported by the browser). */
  pdf.print = async function () {
    try {
      await Promise.all(Object.values(ALS.state.doc.images).map(a => cachedImage(a.src).catch(() => null)));
      pdf.buildPrintRoot();
      ALS.toast('Opening print dialog…', 1400);
      setTimeout(() => window.print(), 60);
    } catch (e) {
      console.error(e);
      ALS.toast('Print failed — ' + e.message);
    }
  };

  /* ================================================================
     OPTION B — EXPORT PDF (jsPDF)
     ================================================================ */

  pdf.export = async function () {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      ALS.toast('PDF library not available — check vendor/jspdf.umd.min.js');
      return null;
    }
    const J = window.jspdf.jsPDF;
    const cfg = ALS.state.doc.page;
    const { w: pw, h: ph } = ALS.pageSizeMM(cfg);

    ALS.toast('Building PDF…', 1500);

    try {
      await Promise.all(Object.values(ALS.state.doc.images).map(a => cachedImage(a.src)));
    } catch (e) {
      /* continue — missing images are skipped below */
    }

    const doc = new J({ unit: 'mm', format: [pw, ph], orientation: 'portrait', compress: true });
    doc.setProperties({
      title: 'Image Layout',
      subject: 'Image layout document',
      creator: 'Image Layout & PDF Studio'
    });

    const bg = hexRgb(ALS.normHex(cfg.background, '#ffffff'));
    const pages = ALS.docPages();
    let first = true;

    for (const page of pages) {
      if (!first) doc.addPage([pw, ph]);
      first = false;

      // page background
      doc.setFillColor(bg.r, bg.g, bg.b);
      doc.rect(0, 0, pw, ph, 'F');

      const geom = ALS.pageGeom(page);
      for (let i = 0; i < page.slots.length; i++) {
        const slot = page.slots[i];
        if (!slot.imageId) continue;
        const asset = ALS.state.doc.images[slot.imageId];
        if (!asset) continue;

        const rect = ALS.slotRect(geom, page, i);
        const inner = ALS.slotInner(rect, slot);

        // 1. slot background (whole slot box, under the picture)
        const sbg = slot.style.background;
        if (sbg && sbg !== 'transparent') {
          const c = hexRgb(sbg);
          const r = Math.min(Number(slot.style.radius) || 0, rect.w / 2, rect.h / 2);
          doc.setFillColor(c.r, c.g, c.b);
          doc.roundedRect(rect.x, rect.y, rect.w, rect.h, r, r, 'F');
        }

        // 2. rasterised picture (matches the preview exactly)
        try {
          const dataUrl = await pdf.rasterSlot(slot, asset, rect, inner);
          doc.addImage(dataUrl, 'JPEG', inner.x, inner.y, inner.w, inner.h, undefined, 'FAST');
        } catch (e) {
          console.warn('PDF image failed', e);
        }

        // 2b. caption as vector text (crisp at any zoom)
        drawCaption(doc, slot, inner);

        // 3. border on top
        const bw = Number(slot.style.border) || 0;
        if (bw > 0) {
          const c = hexRgb(ALS.normHex(slot.style.borderColor, '#000000'));
          const r = Math.max(0, (Number(slot.style.radius) || 0) - bw / 2);
          doc.setDrawColor(c.r, c.g, c.b);
          doc.setLineWidth(bw);
          doc.roundedRect(
            rect.x + bw / 2, rect.y + bw / 2,
            rect.w - bw, rect.h - bw,
            r, r, 'S'
          );
        }
      }
    }

    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const name = `layout_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.pdf`;

    const blob = doc.output('blob');
    ALS.download(blob, name);
    ALS.toast('PDF exported (' + pages.length + ' page' + (pages.length > 1 ? 's' : '') + ')');
    return blob;
  };

  /** Export page-by-page PNGs of the preview (debug helper). */
  pdf.pageCount = () => ALS.docPages().length;
})();
