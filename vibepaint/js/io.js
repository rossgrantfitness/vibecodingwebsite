import { app } from './core/app.js';
import { emit, on } from './core/events.js';
import { Layer, makeCanvas } from './core/document.js';
import { structural } from './core/history.js';
import { openDialog, confirmDialog } from './ui/dialogs.js';
import { paste } from './commands.js';

const MAX = 8000;
const PRESETS = [
  ['1920x1080', 'HD 1920 × 1080'], ['1080x1080', 'Square post 1080 × 1080'], ['1080x1350', 'Portrait post 1080 × 1350'],
  ['1200x800', 'Web image 1200 × 800'], ['2480x3508', 'A4 at 300 dpi'], ['320x180', 'Pixel art 320 × 180'],
  ['64x64', 'Sprite 64 × 64'], ['32x32', 'Icon 32 × 32'], ['custom', 'Custom'],
];

export function newDocumentDialog() {
  openDialog({
    title: 'New document',
    fields: [
      { id: 'preset', label: 'Preset', type: 'select', value: '1200x800', choices: PRESETS },
      { id: 'w', label: 'Width (px)', type: 'number', min: 1, max: MAX, value: 1200 },
      { id: 'h', label: 'Height (px)', type: 'number', min: 1, max: MAX, value: 800 },
      { id: 'bg', label: 'Background', type: 'select', value: 'white', choices: [['white', 'White'], ['bg', 'Background color'], ['transparent', 'Transparent']] },
    ],
    onOk: async (v) => {
      let w = v.w, h = v.h;
      w = Math.min(MAX, Math.max(1, Math.round(w)));
      h = Math.min(MAX, Math.max(1, Math.round(h)));
      if (!(await okToDiscard())) return;
      const bg = v.bg === 'white' ? '#ffffff' : v.bg === 'bg' ? `rgb(${app.bg.r},${app.bg.g},${app.bg.b})` : null;
      app.newDocument(w, h, { background: bg, name: 'Untitled' });
    },
  });
  // Picking a preset fills in the size fields.
  setTimeout(() => {
    const sel = document.querySelector('.dialog select');
    const inputs = document.querySelectorAll('.dialog input[type=number]');
    sel?.addEventListener('change', () => {
      if (sel.value === 'custom') return;
      const [w, h] = sel.value.split('x');
      inputs[0].value = w; inputs[1].value = h;
      inputs[0].dispatchEvent(new Event('input')); inputs[1].dispatchEvent(new Event('input'));
    });
  }, 0);
}

async function okToDiscard() {
  if (app.history.entries.length <= 1) return true;
  return confirmDialog('Replace the current document?', 'Your current image will be replaced. It is autosaved in this browser until you start the next one.', 'Continue');
}

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

export async function openFile(file) {
  file = file || (await pickFile('image/*,.vpaint,application/json'));
  if (!file) return;
  if (file.name.endsWith('.vpaint') || file.type === 'application/json') { await openProject(file); return; }
  try {
    const img = await loadImage(file);
    if (!(await okToDiscard())) return;
    let w = img.naturalWidth, h = img.naturalHeight;
    const k = Math.min(1, MAX / Math.max(w, h));
    w = Math.round(w * k); h = Math.round(h * k);
    app.newDocument(w, h, { background: null, name: file.name.replace(/\.[^.]+$/, ''), historyLabel: 'Open' });
    const l = app.doc.layers[0];
    l.name = 'Background';
    l.ctx.drawImage(img, 0, 0, w, h);
    app.redraw();
    emit('pixels', l);
    emit('doc');
  } catch (e) { app.toast(e.message); }
}

export async function placeFile(file) {
  file = file || (await pickFile('image/*'));
  if (!file) return;
  try {
    const img = await loadImage(file);
    const d = app.doc;
    let w = img.naturalWidth, h = img.naturalHeight;
    const k = Math.min(1, d.width / w, d.height / h);
    w = Math.round(w * k); h = Math.round(h * k);
    const c = makeCanvas(w, h);
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    paste(c, { x: Math.round((d.width - w) / 2), y: Math.round((d.height - h) / 2) });
    app.doc.active.name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Placed image';
    emit('layer');
  } catch (e) { app.toast(e.message); }
}

// ---- Project files (.vpaint): JSON with each layer as a PNG data URL -------------------------------
function serialize() {
  const d = app.doc;
  return {
    app: 'VibePaint', version: 1, name: d.name, width: d.width, height: d.height,
    activeIndex: d.activeIndex,
    layers: d.layers.map((l) => ({ name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, lockAlpha: l.lockAlpha, png: l.canvas.toDataURL('image/png') })),
  };
}

async function deserialize(data, label = 'Open project') {
  if (data?.app !== 'VibePaint' || !Array.isArray(data.layers)) throw new Error('That file is not a VibePaint project.');
  app.newDocument(data.width, data.height, { background: null, name: data.name || 'Untitled', historyLabel: label });
  const d = app.doc;
  d.layers = [];
  for (const s of data.layers) {
    const l = new Layer(d.width, d.height, s.name);
    Object.assign(l, { visible: s.visible, opacity: s.opacity, blend: s.blend, lockAlpha: !!s.lockAlpha });
    const img = new Image();
    img.src = s.png;
    await img.decode();
    l.ctx.drawImage(img, 0, 0);
    d.layers.push(l);
  }
  d.activeId = d.layers[Math.min(d.layers.length - 1, data.activeIndex ?? d.layers.length - 1)].id;
  d.dirty = true;
  emit('doc');
  emit('pixels');
  app.redraw();
}

async function openProject(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!(await okToDiscard())) return;
    await deserialize(data);
  } catch (e) { app.toast(e.message || 'Could not open that project.'); }
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const safeName = () => (app.doc.name || 'image').replace(/[^\w\- ]+/g, '').trim() || 'image';

export function saveProject() {
  const blob = new Blob([JSON.stringify(serialize())], { type: 'application/json' });
  download(blob, `${safeName()}.vpaint`);
  app.toast('Project saved as a .vpaint file (keeps your layers).');
}

export function exportDialog() {
  openDialog({
    title: 'Export image',
    fields: [
      { id: 'format', label: 'Format', type: 'select', value: 'png', choices: [['png', 'PNG (lossless, transparency)'], ['jpeg', 'JPEG (photos)'], ['webp', 'WebP (small, transparency)']] },
      { id: 'quality', label: 'Quality (JPEG/WebP)', type: 'range', min: 10, max: 100, value: 90, unit: '%' },
      { id: 'scale', label: 'Scale', type: 'select', value: '1', choices: [['0.25', '25%'], ['0.5', '50%'], ['1', '100%'], ['2', '200%'], ['4', '400% (pixel art)']] },
    ],
    okLabel: 'Export',
    onOk: ({ format, quality, scale }) => exportImage(format, quality / 100, Number(scale)),
  });
}

export function exportImage(format = 'png', quality = 0.92, scale = 1) {
  const d = app.doc;
  const flat = d.render();
  const w = Math.max(1, Math.round(d.width * scale)), h = Math.max(1, Math.round(d.height * scale));
  const out = makeCanvas(w, h);
  const g = out.getContext('2d');
  if (format === 'jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
  g.imageSmoothingEnabled = scale < 1 || scale % 1 !== 0;
  g.imageSmoothingQuality = 'high';
  g.drawImage(flat, 0, 0, w, h);
  out.toBlob((blob) => {
    if (!blob) { app.toast('Export failed in this browser.'); return; }
    download(blob, `${safeName()}.${format === 'jpeg' ? 'jpg' : format}`);
  }, `image/${format}`, quality);
}

// ---- Autosave to IndexedDB ------------------------------------------------------------------------
const DB = 'vibepaint', STORE = 'autosave';
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, value) {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(value, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

export function initAutosave() {
  let timer = 0;
  on('history', () => {
    if (app.history.entries.length <= 1) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { idbSet('last', { savedAt: Date.now(), data: serialize() }).catch(() => {}); } catch { /* storage unavailable */ }
    }, 1500);
  });
}

export async function offerRestore() {
  try {
    const saved = await idbGet('last');
    if (!saved?.data) return;
    const when = new Date(saved.savedAt).toLocaleString();
    app.toast(`Restore your last session (${when})?`, { label: 'Restore', run: () => deserialize(saved.data, 'Restore session').catch((e) => app.toast(e.message)) });
  } catch { /* no IndexedDB (private mode etc.) */ }
}

// ---- Drag & drop and system paste -----------------------------------------------------------------
export function initDropAndPaste(stage) {
  const hint = document.getElementById('drop-hint');
  stage.addEventListener('dragover', (e) => { e.preventDefault(); hint.hidden = false; });
  stage.addEventListener('dragleave', () => { hint.hidden = true; });
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    hint.hidden = true;
    const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/') || f.name.endsWith('.vpaint'));
    if (!file) return;
    if (file.name.endsWith('.vpaint')) openProject(file); else placeFile(file);
  });
  window.addEventListener('paste', (e) => {
    if (e.target.closest?.('input, textarea')) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) {
      e.preventDefault();
      placeFile(item.getAsFile());
    } else {
      paste();
    }
  });
}

// Edit ▸ Paste: try the system clipboard (needs permission), else the internal one.
export async function pasteFromMenu() {
  try {
    if (navigator.clipboard?.read) {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) { await placeFile(new File([await item.getType(type)], 'Pasted image', { type })); return; }
      }
    }
  } catch { /* permission denied or unsupported: fall back */ }
  paste();
}

export { serialize, deserialize, structural };
