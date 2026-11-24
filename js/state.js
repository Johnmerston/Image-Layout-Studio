/* =========================================================
   state.js — document model, history (undo/redo),
   autosave (IndexedDB) and JSON project import/export.
   ========================================================= */
(function () {
  'use strict';
  const ALS = (window.ALS = window.ALS || {});

  const DEFAULTS = {
    page: {
      size: 'A4',
      customW: 210,
      customH: 297,
      orientation: 'portrait',
      background: '#ffffff',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      gap: 4
    }
  };

  ALS.DEFAULTS = DEFAULTS;

  /* ---------------- model factories ---------------- */

  ALS.defaultSlotStyle = () => ({
    border: 0,
    borderColor: '#000000',
    radius: 0,
    background: '#ffffff',
    padding: 0
  });

  ALS.defaultImg = () => ({
    fit: 'contain',   // 'contain' | 'cover'
    zoom: 1,          // multiplier on top of the fit box
    sx: 1,            // horizontal stretch (aspect-lock = sx === sy)
    sy: 1,
    ox: 50,           // horizontal position 0..100
    oy: 50,           // vertical position 0..100
    rotation: 0,      // 0 | 90 | 180 | 270
    crop: { x: 0, y: 0, w: 1, h: 1 },
    lockAspect: true
  });

  ALS.defaultCaption = () => ({
    text: '',         // empty string = no caption strip
    size: 9,          // font size in pt (matches CSS pt and jsPDF pt)
    family: 'helvetica',
    color: '#000000',
    bold: false,
    italic: false,
    align: 'center'
  });

  ALS.newSlot = function () {
    return {
      id: ALS.uid('slot'),
      imageId: null,
      size: null,                    // {w,h} mm override or null (grid-derived)
      style: ALS.defaultSlotStyle(),
      caption: ALS.defaultCaption(),
      img: null                      // set when an image is assigned
    };
  };

  ALS.newPage = function (rows, cols) {
    rows = ALS.clamp(Math.round(rows) || 1, 1, 50);
    cols = ALS.clamp(Math.round(cols) || 1, 1, 50);
    const slots = [];
    for (let i = 0; i < rows * cols; i++) slots.push(ALS.newSlot());
    return { id: ALS.uid('page'), rows, cols, slots };
  };

  ALS.newDoc = function () {
    return {
      page: ALS.deepClone(DEFAULTS.page),
      pages: [ALS.newPage(3, 2)],
      images: {}                     // assetId -> {id,name,mime,src,natW,natH,size}
    };
  };

  /* ---------------- live state ---------------- */

  ALS.state = {
    doc: ALS.newDoc(),
    ui: {
      page: 0,                       // current page index
      selectedSlotId: null,
      zoom: 1,                       // preview scale (1 = fit)
      cropMode: false,
      fullscreen: false
    }
  };

  ALS.snapshot = function () {
    return { doc: ALS.deepClone(ALS.state.doc), ui: ALS.deepClone(ALS.state.ui) };
  };

  ALS.restore = function (snap) {
    ALS.state.doc = ALS.deepClone(snap.doc);
    const ui = ALS.deepClone(snap.ui);
    // keep view-level preferences, restore selection context
    ALS.state.ui.page = ALS.clamp(ui.page | 0, 0, ALS.state.doc.pages.length - 1);
    ALS.state.ui.selectedSlotId = ui.selectedSlotId;
    ALS.state.ui.cropMode = !!ui.cropMode;
    const p = ALS.state.doc.pages[ALS.state.ui.page];
    if (ALS.state.ui.selectedSlotId && !p.slots.some(s => s.id === ALS.state.ui.selectedSlotId)) {
      // selection may live on another page — keep it if it still exists anywhere
      const found = ALS.docPages().some(pg => pg.slots.some(s => s.id === ALS.state.ui.selectedSlotId));
      if (!found) ALS.state.ui.selectedSlotId = null;
    }
  };

  /* ---------------- change notification ---------------- */

  let scheduled = false;
  let fallbackTimer = null;
  ALS.requestRender = function () {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      if (!scheduled) return;
      scheduled = false;
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
      if (typeof ALS.renderAll === 'function') ALS.renderAll();
    };
    requestAnimationFrame(run);
    // rAF is throttled in background/occluded windows — never let a
    // pending render starve; this timer no-ops if rAF already ran.
    if (!fallbackTimer) fallbackTimer = setTimeout(run, 50);
  };

  ALS.renderNow = function () {
    if (typeof ALS.renderAll === 'function') ALS.renderAll();
  };

  /* ---------------- history (undo / redo) ---------------- */

  const HIST_CAP = 60;
  ALS.hist = { undo: [], redo: [], busy: false };

  /**
   * Run a state mutation with automatic checkpointing.
   *   ALS.tx(() => { ...mutate... }, 'optional label')
   * Consecutive same-label mutations inside a short window (slider
   * drags, pointer pans) coalesce into a single undo step.
   */
  ALS.tx = function (fn, label) {
    if (ALS.hist.busy) { fn(); ALS.requestRender(); return; }
    const before = ALS.snapshot();
    fn();
    const after = ALS.snapshot();
    if (JSON.stringify(before.doc) === JSON.stringify(after.doc) &&
        JSON.stringify(before.ui) === JSON.stringify(after.ui)) return;

    const now = Date.now();
    const g = ALS.tx._gesture;
    const coalesce = !!(label && g && g.label === label && (now - g.at) < 1200);

    if (!coalesce) {
      ALS.hist.undo.push({ snap: before, label: label || null });
      if (ALS.hist.undo.length > HIST_CAP) ALS.hist.undo.shift();
      ALS.hist.redo.length = 0;
    }
    ALS.tx._gesture = { label: label || null, at: now };

    ALS.requestRender();
    ALS.scheduleAutosave();
  };

  /** End the current coalescing gesture (call on pointerup / blur). */
  ALS.tx.endGesture = function () {
    ALS.tx._gesture = null;
  };

  ALS.undo = function () {
    const u = ALS.hist.undo;
    if (!u.length) return;
    const entry = u.pop();
    ALS.hist.redo.push({ snap: ALS.snapshot(), label: entry.label });
    ALS.hist.busy = true;
    ALS.restore(entry.snap);
    ALS.hist.busy = false;
    ALS.tx._gesture = null;
    ALS.toast('Undo' + (entry.label ? ': ' + entry.label : ''));
    ALS.requestRender();
    ALS.scheduleAutosave();
  };

  ALS.redo = function () {
    const r = ALS.hist.redo;
    if (!r.length) return;
    const entry = r.pop();
    ALS.hist.undo.push({ snap: ALS.snapshot(), label: entry.label });
    ALS.hist.busy = true;
    ALS.restore(entry.snap);
    ALS.hist.busy = false;
    ALS.tx._gesture = null;
    ALS.toast('Redo' + (entry.label ? ': ' + entry.label : ''));
    ALS.requestRender();
    ALS.scheduleAutosave();
  };

  ALS.clearHistory = function () {
    ALS.hist.undo.length = 0;
    ALS.hist.redo.length = 0;
    ALS.tx._gesture = null;
    ALS.requestRender();
  };

  /* ---------------- document access helpers ---------------- */

  ALS.docPages = () => ALS.state.doc.pages;
  ALS.currentPage = () => ALS.state.doc.pages[ALS.state.ui.page] || ALS.state.doc.pages[0];

  ALS.findSlot = function (slotId) {
    const pages = ALS.docPages();
    for (let pi = 0; pi < pages.length; pi++) {
      const s = pages[pi].slots.find(x => x.id === slotId);
      if (s) return { slot: s, page: pages[pi], pageIndex: pi };
    }
    return null;
  };

  ALS.selected = function () {
    const id = ALS.state.ui.selectedSlotId;
    if (!id) return null;
    return ALS.findSlot(id);
  };

  ALS.slotOfImage = function (imageId) {
    const pages = ALS.docPages();
    for (let pi = 0; pi < pages.length; pi++) {
      const s = pages[pi].slots.find(x => x.imageId === imageId);
      if (s) return { slot: s, page: pages[pi], pageIndex: pi };
    }
    return null;
  };

  ALS.totalSlots = function () {
    return ALS.docPages().reduce((n, p) => n + p.slots.length, 0);
  };

  ALS.filledSlots = function () {
    let n = 0;
    ALS.docPages().forEach(p => p.slots.forEach(s => { if (s.imageId) n++; }));
    return n;
  };

  ALS.imageCount = function () {
    return Object.keys(ALS.state.doc.images).length;
  };

  /** Ensure a page exists at `index`. */
  ALS.ensurePage = function (index) {
    while (ALS.docPages().length <= index) ALS.docPages().push(ALS.newPage(3, 2));
  };

  /** Add `n` empty slots worth of capacity by creating pages with the reference grid. */
  ALS.addPagesFor = function (neededSlots, refPage) {
    refPage = refPage || ALS.currentPage();
    let added = 0;
    while (ALS.filledSlots() < neededSlots && added < 500) {
      const p = ALS.newPage(refPage.rows, refPage.cols);
      ALS.docPages().push(p);
      added++;
    }
    return added;
  };

  /* ---------------- IndexedDB autosave ---------------- */

  const DB_NAME = 'image-layout-studio';
  const STORE = 'projects';
  const LS_KEY = 'image-layout-studio.autosave';
  let dbPromise = null;
  let saveTimer = null;
  let warnedNoStorage = false;
  let storageMode = 'idb';   // 'idb' | 'ls' | 'none'

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    });
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  function idbPut(key, value) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  function idbGet(key) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  ALS.scheduleAutosave = function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(ALS.autosave, 700);
  };

  function lsSave(payload) {
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  }
  function lsLoad() {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  ALS.autosave = function () {
    if (storageMode === 'none') return Promise.resolve();
    const payload = { version: 1, savedAt: Date.now(), doc: ALS.state.doc, ui: ALS.state.ui };

    if (storageMode === 'ls') {
      try { lsSave(payload); } catch (e) { markNoStorage(e); }
      return Promise.resolve();
    }
    return idbPut('current', payload)
      .catch(() => {
        // IndexedDB unavailable (e.g. some file:// contexts) -> localStorage
        try {
          lsSave(payload);
          storageMode = 'ls';
        } catch (e) {
          markNoStorage(e);
        }
      });
  };

  function markNoStorage(err) {
    storageMode = 'none';
    if (!warnedNoStorage) {
      warnedNoStorage = true;
      ALS.toast('Autosave unavailable — use “Save JSON” to keep your work', 3600);
      console.warn('autosave unavailable', err);
    }
  }

  ALS.loadAutosave = function () {
    if (ALS.hist.undo.length) return Promise.resolve(false); // user already acted
    return idbGet('current')
      .catch(() => null)
      .then(p => {
        if (!p || !p.doc) { storageMode = 'ls'; p = lsLoad(); }
        if (p && p.doc && Array.isArray(p.doc.pages) && p.doc.pages.length) {
          ALS.state.doc = p.doc;
          ALS.state.ui.page = ALS.clamp((p.ui && p.ui.page) | 0, 0, p.doc.pages.length - 1);
          ALS.state.ui.zoom = 1;
          ALS.state.ui.selectedSlotId = null;
          return true;
        }
        return false;
      })
      .catch(() => false);
  };

  ALS.wipeAutosave = function () {
    try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ }
    return idbPut('current', null).catch(() => {});
  };

  /* ---------------- JSON project import / export ---------------- */

  ALS.exportProjectJSON = function () {
    const data = {
      app: 'image-layout-studio',
      version: 1,
      exportedAt: new Date().toISOString(),
      doc: ALS.state.doc
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const name = `layout-project_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
    ALS.download(blob, name);
    ALS.toast('Project saved as JSON');
  };

  ALS.validateProject = function (data) {
    if (!data || typeof data !== 'object') return null;
    const doc = data.doc || data;
    if (!doc.page || !Array.isArray(doc.pages) || !doc.pages.length) return null;
    // structural repair
    doc.images = doc.images || {};
    doc.pages.forEach(p => {
      if (!Array.isArray(p.slots)) p.slots = [];
      p.rows = ALS.clamp(p.rows || Math.max(1, Math.ceil(p.slots.length / (p.cols || 1))), 1, 50);
      p.cols = ALS.clamp(p.cols || 1, 1, 50);
      p.id = p.id || ALS.uid('page');
      p.slots.forEach(s => {
        s.id = s.id || ALS.uid('slot');
        s.style = Object.assign(ALS.defaultSlotStyle(), s.style || {});
        s.caption = Object.assign(ALS.defaultCaption(), s.caption || {});
        if (s.imageId && s.img) s.img = Object.assign(ALS.defaultImg(), s.img);
        if (!doc.images[s.imageId]) { s.imageId = null; s.img = null; }
        else if (s.img) {
          s.img.crop = Object.assign({ x: 0, y: 0, w: 1, h: 1 }, s.img.crop || {});
        }
      });
      // repair grid size mismatch (a short final row is legal)
      const expect = p.rows * p.cols;
      if (p.slots.length > expect) p.slots = p.slots.slice(0, expect);
      p.rows = Math.max(1, Math.ceil(p.slots.length / Math.max(1, p.cols)));
    });
    doc.page = Object.assign(ALS.deepClone(ALS.DEFAULTS.page), doc.page);
    doc.page.margins = Object.assign({ top: 10, right: 10, bottom: 10, left: 10 }, doc.page.margins || {});
    return doc;
  };

  ALS.importProjectFile = function (file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = async () => {
        try {
          const data = JSON.parse(fr.result);
          const doc = ALS.validateProject(data);
          if (!doc) { reject(new Error('Not a valid project file')); return; }
          // verify every referenced image still decodes
          const ids = new Set();
          doc.pages.forEach(p => p.slots.forEach(s => { if (s.imageId) ids.add(s.imageId); }));
          for (const id of Array.from(ids)) {
            try { await ALS.decodeImage(doc.images[id].src); }
            catch (e) { doc.images[id] = null; delete doc.images[id]; }
          }
          doc.pages.forEach(p => p.slots.forEach(s => {
            if (s.imageId && !doc.images[s.imageId]) { s.imageId = null; s.img = null; }
          }));
          ALS.tx(() => {
            ALS.state.doc = doc;
            ALS.state.ui.page = 0;
            ALS.state.ui.selectedSlotId = null;
            ALS.state.ui.cropMode = false;
          }, 'import project');
          ALS.toast('Project imported');
          resolve();
        } catch (e) { reject(e); }
      };
      fr.onerror = () => reject(new Error('File read failed'));
      fr.readAsText(file);
    });
  };
})();
