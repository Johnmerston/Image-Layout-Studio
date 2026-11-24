# Image Layout & PDF Studio

A standalone, browser-based application for building custom image layouts — insert, resize,
crop and position images inside a configurable grid of slots, then print or export the result
as a high-quality, multi-page PDF.

Everything runs locally: no backend, no database, no login, no internet connection required
after the initial files are on disk.

**Live demo:** <https://johnmerston.github.io/Image-Layout-Studio/>

---

## Setup

### Use the hosted app (any device)

The site is published with GitHub Pages at
<https://johnmerston.github.io/Image-Layout-Studio/> — open it on any device with a modern
browser. Your work is autosaved in that browser's own storage (IndexedDB / localStorage) and
can be moved between devices with **Save JSON** / **Import JSON**.

### Quick start (recommended)

```bash
cd image-layout-studio
python -m http.server 8765
```

Then open <http://localhost:8765/>.

Any static file server works (`npx serve`, nginx, …).

### Run from a local folder

Double-click `index.html` (or drag it into Chrome/Edge). The app is plain HTML + CSS +
vanilla JavaScript with no build step and no ES modules, so it runs directly from `file://`.
If your browser blocks local storage for `file://` pages, autosave degrades gracefully —
use **Save JSON** to keep your work.

### Requirements

- A modern desktop browser — Chrome or Edge recommended (also works in Firefox/Safari).
- Nothing else: jsPDF is vendored in `vendor/jspdf.umd.min.js`.

---

## Features

### Document settings (left panel)

- **Page size**: A4, A3, A5, Letter, Legal or Custom (mm), with Portrait / Landscape orientation.
- **Page background colour** and independent **Top / Right / Bottom / Left margins** (mm).
- **Spacing between slots** (mm).
- **Grid**: rows × columns with live total, `− / +` steppers for rows and columns, and a
  **Total slots** field that sets the exact slot count (a partial last row is allowed).
- **Apply grid to all pages**.
- **Pages**: add, duplicate, delete; pages are also created automatically when images
  exceed the available slots.

### Live preview (centre)

- Real-proportion paper preview with subtle page shadow and a checkered work surface.
- Every slot has a visible boundary; empty slots show a drop target.
- Click to select a slot (distinct accent outline); the selected slot drives the properties panel.
- **Drag an image within its slot** to reposition it (mouse or trackpad).
- Hover a filled slot for quick controls: a **⠿ drag handle** (reorder) and **✕** (remove).
- Zoom slider, `+ / −` buttons and **Fit** (zoom 100 % = fit page to workspace).
- Page navigation strip with **thumbnails** — click to jump, hover for duplicate/delete,
  and **drop an image onto a thumbnail to move it to that page**.

### Image management

Supported formats: **JPG / JPEG, PNG, WEBP, GIF (static frame), BMP, SVG**.

Insertion methods:

1. **Add images** button or `Ctrl + O` (multi-file).
2. **Drag & drop** files onto the preview or directly onto a slot.
3. **Paste** an image with `Ctrl + V` (lands in the selected empty slot when possible).
4. **Double-click** a slot to fill or replace it.

Multiple images populate the available slots **sequentially**; if there are more images than
slots, additional pages are generated automatically.

Per-image commands: **Replace**, **Duplicate**, **Remove**, **Clear all images**, plus
drag-and-drop reordering between slots (swap when the target is occupied, move when empty).
Image bytes are never recompressed or downsampled.

### Image properties (right panel)

- **Fit mode**: Contain / Cover.
- **Displayed size** (mm) with **Maintain aspect ratio** lock.
- **Fit to slot** / **Fill slot** buttons.
- **Scale** (%) field and **Zoom** slider.
- **Position** sliders (horizontal / vertical, 0–100 %).
- **Rotate** 90° left, 90° right, 180°.
- **Crop…** — an interactive crop overlay with 8 handles and exact percentage fields.
  Cropping never modifies the original file.
- **Reset** all image adjustments.
- **Slot styling**: custom slot size (mm), border thickness, border colour, border radius,
  background colour (or ∅ for transparent) and slot padding.
- **Move** the selected image to another page.

### Captions (right panel)

Every image can carry its own caption, shown as a reserved strip **below** the picture inside
its slot (the image box shrinks to make room — the caption never overlaps the picture).

- **Text** — free text, multi-line (Shift+Enter for a new line). Leave it empty to remove the
  strip and give the full slot height back to the image.
- **Font** — Sans (Helvetica), Serif (Times) or Mono (Courier). These are the PDF base-14
  fonts, so captions use the same faces in the preview, in print and in the exported PDF.
- **Size (pt)** — 4–96 pt in 0.5 pt steps.
- **Style** — bold and/or italic toggles.
- **Colour** — colour picker plus editable hex field.
- **Alignment** — left / centre / right within the strip.
- Wrapping is computed once (canvas `measureText`, greedy word wrap with character-breaking
  for over-long words) and shared by all outputs, so line breaks are identical everywhere.
- Long captions are clipped at 50 % of the slot height rather than squeezing the picture.
- Captions travel with their image on **duplicate**, **move/swap** and **move to page**, and
  are stored with the project (autosave and JSON export/import).
- In **PDF export** the caption is drawn as vector text on top of the rasterised slot, so it
  stays crisp at any zoom.

### Printing and PDF export

- **Print** — opens the browser's native print dialog. The application UI is hidden, every
  document page is emitted as exactly one physical page (`@page` is injected with your page
  size, `margin: 0`, `page-break-after: always`), and all controls are excluded from output.
  Use the browser's *Save as PDF* option.
- **Export PDF** — generates a genuine multi-page PDF with jsPDF. Each slot is rasterised at
  300 DPI from the same geometry code that drives the preview, so positions, cropping,
  rotation, margins and spacing match the preview exactly; borders are drawn as vectors.

### Productivity

- **Undo / Redo** (gesture-aware: a whole slider drag or crop drag undoes as one step).
- **Reset document** and **Clear images**, both behind confirmation dialogs.
- **Autosave** to IndexedDB (localStorage fallback) — the project is restored on next launch.
- **Save JSON / Import JSON** for portable project files.
- **Full-screen workspace** (`Ctrl + Shift + F`) hides the panels for focused editing.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + V` | Paste image into the selected slot |
| `Ctrl + Z` | Undo |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Redo |
| `Delete` / `Backspace` | Remove the selected image |
| `Ctrl + S` | Save project as JSON |
| `Ctrl + O` | Add images |
| `Ctrl + P` | Print / Save as PDF |
| `Ctrl + 0` | Fit page to workspace |
| `Ctrl + +` / `Ctrl + −` | Zoom preview in / out |
| `Ctrl + D` | Duplicate the selected image |
| `Ctrl + Shift + F` | Toggle full-screen workspace |
| `Page Up` / `Page Down` | Previous / next page |
| `Arrow keys` | Nudge the selected image (`Shift` = larger step) |
| `Escape` | Exit crop mode, then deselect |

---

## Architecture

```
image-layout-studio/
├── index.html            markup: toolbar, three panels, page strip, dialogs
├── styles.css            design system + preview + print styles
├── app.js                bootstrap, toolbar wiring, render orchestration
├── js/
│   ├── utils.js          helpers, DOM builder, toast, confirm, image decoding
│   ├── sizes.js          paper sizes (mm) and orientation resolution
│   ├── state.js          document model, undo/redo, autosave, JSON I/O
│   ├── layout.js         geometry engine (mm) shared by preview/print/PDF
│   ├── render.js         live preview, selection, panning, crop overlay
│   ├── leftpanel.js      document settings, grid and page commands
│   ├── pages.js          page navigation strip, thumbnails, page moves
│   ├── props.js          image + slot properties panel
│   ├── media.js          uploads, paste, drag & drop, reorder, cleanup
│   ├── pdf.js            print renderer and jsPDF exporter
│   └── shortcuts.js      keyboard handling
└── vendor/
    └── jspdf.umd.min.js  PDF generation (jsPDF 2.5.2, MIT)
```

Design notes:

- **One geometry engine** (`layout.js`) computes every slot rectangle and image placement in
  millimetres. The preview scales it to pixels, the print renderer uses it directly in `mm`,
  and the PDF exporter rasterises with it — so all three agree to sub-pixel accuracy
  (verified at ≤ 0.0001 mm deviation between preview and print).
- **Plain scripts, no modules** — files share a single `ALS` namespace and load in dependency
  order, which is what allows `file://` usage without a server.
- **Transactional state** — every mutation runs through `ALS.tx(fn, label)`, which
  checkpoints for undo, coalesces same-label gestures, triggers autosave and schedules a render.
- Browser-native APIs only: File API, Clipboard API, Drag & Drop API, Canvas API,
  Blob/Object URL, IndexedDB / localStorage.

---

## Development

The build followed the six phases from the specification (interface → image input →
transformations → pages → print/PDF → productivity), with each phase tested before the next:
grid geometry, multi-upload and auto-pagination, transforms and cropping, page management,
preview↔print↔PDF parity, and undo/autosave/import/export.

### Deployment

The site is served by GitHub Pages from the `main` branch (root) — there is no build step.
To publish changes: `git add -A && git commit && git push`, then Pages rebuilds automatically
(typically within a minute; check the *Actions* tab or
<https://github.com/Johnmerston/Image-Layout-Studio> for the live badge).
