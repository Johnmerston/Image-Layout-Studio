/* =========================================================
   sizes.js — paper sizes and page geometry resolution
   All physical values are millimetres.
   ========================================================= */
(function () {
  'use strict';
  const ALS = (window.ALS = window.ALS || {});

  ALS.PAGE_SIZES = {
    A4:     { w: 210,    h: 297,    label: 'A4 (210 × 297 mm)' },
    A3:     { w: 297,    h: 420,    label: 'A3 (297 × 420 mm)' },
    A5:     { w: 148,    h: 210,    label: 'A5 (148 × 210 mm)' },
    Letter: { w: 215.9,  h: 279.4,  label: 'Letter (8.5 × 11 in)' },
    Legal:  { w: 215.9,  h: 355.6,  label: 'Legal (8.5 × 14 in)' },
    Custom: { w: null,   h: null,   label: 'Custom' }
  };

  /** Resolve the physical page size (mm) for a page-config, honouring orientation. */
  ALS.pageSizeMM = function (p) {
    let w, h;
    if (p.size === 'Custom') {
      w = ALS.clamp(Number(p.customW) || 210, 20, 2000);
      h = ALS.clamp(Number(p.customH) || 297, 20, 2000);
    } else {
      const s = ALS.PAGE_SIZES[p.size] || ALS.PAGE_SIZES.A4;
      w = s.w; h = s.h;
    }
    if (p.orientation === 'landscape') return { w: Math.max(w, h), h: Math.min(w, h) };
    return { w: Math.min(w, h), h: Math.max(w, h) };
  };

  /** Portrait-true aspect used to decide the orientation toggle state. */
  ALS.pageAspectLabel = function (p) {
    const s = ALS.pageSizeMM(p);
    return s.w <= s.h ? 'portrait' : 'landscape';
  };
})();
