/* =========================================================
   utils.js — shared helpers, namespace bootstrap
   ========================================================= */
(function () {
  'use strict';
  const ALS = (window.ALS = window.ALS || {});

  let seq = 0;
  ALS.uid = function (p) {
    seq += 1;
    return (p || 'id') + '_' + Date.now().toString(36) + '_' + seq.toString(36) + Math.random().toString(36).slice(2, 6);
  };

  ALS.$ = (sel, root) => (root || document).querySelector(sel);
  ALS.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  ALS.clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  ALS.round = (v, d) => { const m = Math.pow(10, d == null ? 2 : d); return Math.round(v * m) / m; };

  ALS.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  };

  ALS.deepClone = function (o) {
    if (typeof structuredClone === 'function') return structuredClone(o);
    return JSON.parse(JSON.stringify(o));
  };

  ALS.isHex = s => /^#[0-9a-fA-F]{6}$/.test(String(s || '').trim());
  ALS.normHex = function (s, fallback) {
    s = String(s || '').trim();
    if (!s) return fallback;
    if (/^[0-9a-fA-F]{6}$/.test(s)) s = '#' + s;
    if (/^[0-9a-fA-F]{3}$/.test(s)) s = '#' + s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return ALS.isHex(s) ? s.toLowerCase() : fallback;
  };

  /* ---------- tiny DOM builder ---------- */
  ALS.el = function (tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(n.dataset, v);
        else n.setAttribute(k, v === true ? '' : v);
      }
    }
    if (kids != null) {
      (Array.isArray(kids) ? kids : [kids]).forEach(c => {
        if (c == null) return;
        n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return n;
  };

  /* ---------- toast ---------- */
  let toastTimer = null;
  ALS.toast = function (msg, ms) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => { t.hidden = true; }, 220);
    }, ms || 2200);
  };

  /* ---------- confirm modal ---------- */
  ALS.confirm = function (title, text, okLabel) {
    return new Promise(resolve => {
      const m = document.getElementById('modal');
      const ok = document.getElementById('modalOk');
      const cancel = document.getElementById('modalCancel');
      document.getElementById('modalTitle').textContent = title || 'Are you sure?';
      document.getElementById('modalText').textContent = text || '';
      ok.textContent = okLabel || 'Confirm';
      m.hidden = false;
      const done = v => {
        m.hidden = true;
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey, true);
        resolve(v);
      };
      const onOk = () => done(true);
      const onCancel = () => done(false);
      const onKey = e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
      };
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey, true);
      cancel.focus();
    });
  };

  /* ---------- download helper ---------- */
  ALS.download = function (blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  /* ---------- image decoding ---------- */
  ALS.imageCache = new Map(); // dataURL -> Promise<{el, w, h}>

  ALS.decodeImage = function (src) {
    if (ALS.imageCache.has(src)) return ALS.imageCache.get(src);
    const p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ el: img, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
      img.onerror = () => reject(new Error('Image decode failed'));
      img.src = src;
    });
    ALS.imageCache.set(src, p);
    p.catch(() => ALS.imageCache.delete(src));
    return p;
  };

  /* ---------- file -> dataURL ---------- */
  ALS.fileToDataURL = function (file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(new Error('File read failed'));
      fr.readAsDataURL(file);
    });
  };

  ALS.isImageFile = function (f) {
    if (!f) return false;
    if (f.type && f.type.startsWith('image/')) return true;
    return /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(f.name || '');
  };

  ALS.fmtBytes = function (n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  };

  ALS.fmtMM = v => (Math.round(v * 100) / 100).toString();
})();
