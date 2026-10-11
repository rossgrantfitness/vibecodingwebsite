import { app } from './core/app.js';
import { emit } from './core/events.js';
import { makeCanvas, cloneCanvas, BLEND_MODES } from './core/document.js';
import { beginPixelEdit, structural, layerProps, clampRect } from './core/history.js';
import { rgba } from './core/color.js';
import { openDialog } from './ui/dialogs.js';
import { transformTool, cropDocument } from './tools/transform.js';

// Every menu item and shortcut calls into here.

const doc = () => app.doc;
const layer = () => app.doc.active;
const needSelection = () => {
  if (!app.selection.active) { app.toast('Make a selection first.'); return false; }
  return true;
};

// ---- Edit -----------------------------------------------------------------------------------------
let clipboard = null; // { canvas, x, y }

export function copy({ merged = false, silent = false } = {}) {
  const d = doc();
  const sel = app.selection;
  const src = merged ? cloneCanvas(d.render()) : cloneCanvas(layer().canvas);
  sel.clip(src);
  const r = sel.active ? sel.bounds : { x: 0, y: 0, w: d.width, h: d.height };
  const c = makeCanvas(r.w, r.h);
  c.getContext('2d').drawImage(src, -r.x, -r.y);
  clipboard = { canvas: c, x: r.x, y: r.y };
  // Best effort: also put a PNG on the system clipboard.
  try {
    c.toBlob((blob) => {
      if (blob && navigator.clipboard && window.ClipboardItem) navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {});
    });
  } catch { /* ignore */ }
  if (!silent) app.toast(merged ? 'Copied merged.' : 'Copied.');
}

export function cut() {
  if (!needSelection()) return;
  copy({ silent: true });
  clear('Cut');
}

export function paste(canvas = clipboard?.canvas, at = null) {
  if (!canvas) { app.toast('Nothing to paste. Copy something, or paste an image from another app.'); return; }
  const d = doc();
  let x, y;
  if (at) ({ x, y } = at);
  else if (clipboard && canvas === clipboard.canvas && clipboard.x + canvas.width <= d.width && clipboard.y + canvas.height <= d.height) ({ x, y } = clipboard);
  else {
    const v = app.view;
    const c = v.toDoc(v.cssW / 2, v.cssH / 2);
    x = Math.round(c.x - canvas.width / 2);
    y = Math.round(c.y - canvas.height / 2);
  }
  structural(app, 'Paste', () => {
    const l = d.addLayer(d.nextLayerName(), d.activeIndex + 1);
    l.ctx.drawImage(canvas, x, y);
  });
  app.selection.clear();
}

export function clear(label = 'Clear') {
  if (!needSelection()) return;
  const l = layer();
  const edit = beginPixelEdit(app, l, app.selection.bounds, label);
  l.ctx.save();
  if (l.lockAlpha) {
    // With transparency locked, clearing fills with the background colour instead (like Photoshop).
    const fill = makeCanvas(doc().width, doc().height);
    const f = fill.getContext('2d');
    f.fillStyle = rgba(app.bg);
    f.fillRect(0, 0, fill.width, fill.height);
    app.selection.clip(fill);
    l.ctx.globalCompositeOperation = 'source-atop';
    l.ctx.drawImage(fill, 0, 0);
  } else {
    l.ctx.globalCompositeOperation = 'destination-out';
    l.ctx.drawImage(app.selection.mask, 0, 0);
  }
  l.ctx.restore();
  edit.commit();
}

// Fill the selection (or the whole layer) with a colour.
export function fillWith(color, opacity = 1, label = 'Fill') {
  const d = doc(), l = layer();
  const fill = makeCanvas(d.width, d.height);
  const f = fill.getContext('2d');
  f.fillStyle = rgba(color);
  f.fillRect(0, 0, d.width, d.height);
  app.selection.clip(fill);
  const edit = beginPixelEdit(app, l, app.selection.active ? app.selection.bounds : { x: 0, y: 0, w: d.width, h: d.height }, label);
  l.ctx.save();
  l.ctx.globalAlpha = opacity;
  l.ctx.globalCompositeOperation = l.lockAlpha ? 'source-atop' : 'source-over';
  l.ctx.drawImage(fill, 0, 0);
  l.ctx.restore();
  edit.commit();
}

export function fillDialog() {
  openDialog({
    title: 'Fill',
    fields: [
      { id: 'use', label: 'Contents', type: 'select', value: 'fg', choices: [['fg', 'Foreground color'], ['bg', 'Background color'], ['black', 'Black'], ['white', 'White'], ['gray', '50% Gray']] },
      { id: 'opacity', label: 'Opacity', type: 'range', min: 1, max: 100, value: 100, unit: '%' },
    ],
    onOk: ({ use, opacity }) => {
      const c = { fg: app.fg, bg: app.bg, black: { r: 0, g: 0, b: 0 }, white: { r: 255, g: 255, b: 255 }, gray: { r: 128, g: 128, b: 128 } }[use];
      fillWith(c, opacity / 100);
    },
  });
}

export function strokeDialog() {
  if (!needSelection()) return;
  openDialog({
    title: 'Stroke selection',
    fields: [
      { id: 'width', label: 'Width', type: 'range', min: 1, max: 100, value: 3, unit: 'px' },
      { id: 'color', label: 'Color', type: 'select', value: 'fg', choices: [['fg', 'Foreground'], ['bg', 'Background']] },
    ],
    onOk: ({ width, color }) => {
      const l = layer(), sel = app.selection;
      const b = sel.bounds;
      const edit = beginPixelEdit(app, l, { x: b.x - width, y: b.y - width, w: b.w + width * 2, h: b.h + width * 2 }, 'Stroke');
      l.ctx.save();
      l.ctx.strokeStyle = rgba(color === 'fg' ? app.fg : app.bg);
      l.ctx.lineWidth = width;
      l.ctx.lineCap = 'square';
      l.ctx.lineJoin = 'round';
      l.ctx.stroke(sel.edges);
      l.ctx.restore();
      edit.commit();
    },
  });
}

export function freeTransform() {
  if (app.tool === transformTool) return;
  const prev = app.tool?.id;
  transformTool.previousTool = prev;
  app.setTool('transform');
}

export function flipLayer(axis) {
  if (app.tool === transformTool) { transformTool.flip(axis); return; }
  const d = doc(), l = layer();
  const edit = beginPixelEdit(app, l, { x: 0, y: 0, w: d.width, h: d.height }, axis === 'h' ? 'Flip Layer Horizontal' : 'Flip Layer Vertical');
  const copyC = cloneCanvas(l.canvas);
  l.ctx.save();
  l.ctx.clearRect(0, 0, d.width, d.height);
  if (axis === 'h') { l.ctx.translate(d.width, 0); l.ctx.scale(-1, 1); } else { l.ctx.translate(0, d.height); l.ctx.scale(1, -1); }
  l.ctx.drawImage(copyC, 0, 0);
  l.ctx.restore();
  edit.commit();
}

// ---- Image ----------------------------------------------------------------------------------------
export function imageSizeDialog() {
  const d = doc();
  const ratio = d.width / d.height;
  openDialog({
    title: 'Image Size',
    fields: [
      { id: 'w', label: 'Width (px)', type: 'number', min: 1, max: 8000, value: d.width, onInput: (v, set) => { if (v.keep) set('h', Math.max(1, Math.round(v.w / ratio))); } },
      { id: 'h', label: 'Height (px)', type: 'number', min: 1, max: 8000, value: d.height, onInput: (v, set) => { if (v.keep) set('w', Math.max(1, Math.round(v.h * ratio))); } },
      { id: 'keep', label: 'Keep proportions', type: 'checkbox', value: true },
      { id: 'resample', label: 'Resample', type: 'select', value: 'smooth', choices: [['smooth', 'Smooth (best for photos)'], ['nearest', 'Nearest neighbour (pixel art)']] },
    ],
    onOk: ({ w, h, resample }) => {
      w = Math.round(Math.min(8000, Math.max(1, w)));
      h = Math.round(Math.min(8000, Math.max(1, h)));
      structural(app, 'Image Size', () => {
        d.transformAll(w, h, (old, ctx) => {
          ctx.imageSmoothingEnabled = resample === 'smooth';
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(old, 0, 0, w, h);
        });
        app.selection.resize(w, h);
      });
      app.view.fit();
    },
  });
}

export function canvasSizeDialog() {
  const d = doc();
  openDialog({
    title: 'Canvas Size',
    fields: [
      { id: 'w', label: 'Width (px)', type: 'number', min: 1, max: 8000, value: d.width },
      { id: 'h', label: 'Height (px)', type: 'number', min: 1, max: 8000, value: d.height },
      { id: 'anchor', label: 'Anchor', type: 'anchor', value: 4 },
    ],
    onOk: ({ w, h, anchor }) => {
      w = Math.round(Math.min(8000, Math.max(1, w)));
      h = Math.round(Math.min(8000, Math.max(1, h)));
      const ax = anchor % 3, ay = Math.floor(anchor / 3);
      const ox = Math.round(((w - d.width) * ax) / 2), oy = Math.round(((h - d.height) * ay) / 2);
      structural(app, 'Canvas Size', () => {
        d.transformAll(w, h, (old, ctx) => ctx.drawImage(old, ox, oy));
        app.selection.resize(w, h);
      });
      app.view.fit();
    },
  });
}

export function rotateCanvas(deg) {
  const d = doc();
  const swap = deg % 180 !== 0;
  const w = swap ? d.height : d.width, h = swap ? d.width : d.height;
  structural(app, deg === 180 ? 'Rotate 180°' : `Rotate 90° ${deg > 0 ? 'CW' : 'CCW'}`, () => {
    d.transformAll(w, h, (old, ctx) => {
      ctx.translate(w / 2, h / 2);
      ctx.rotate((deg * Math.PI) / 180);
      ctx.drawImage(old, -old.width / 2, -old.height / 2);
    });
    app.selection.resize(w, h);
  });
  app.view.fit();
}

export function flipCanvas(axis) {
  const d = doc();
  structural(app, axis === 'h' ? 'Flip Canvas Horizontal' : 'Flip Canvas Vertical', () => {
    d.transformAll(d.width, d.height, (old, ctx) => {
      if (axis === 'h') { ctx.translate(d.width, 0); ctx.scale(-1, 1); } else { ctx.translate(0, d.height); ctx.scale(1, -1); }
      ctx.drawImage(old, 0, 0);
    });
    app.selection.clear();
  });
}

export function cropToSelection() {
  if (!needSelection()) return;
  const b = app.selection.bounds;
  cropDocument(b.x, b.y, b.w, b.h);
}

export function trim() {
  const d = doc();
  const data = d.render().getContext('2d').getImageData(0, 0, d.width, d.height).data;
  let minX = d.width, minY = d.height, maxX = -1, maxY = -1;
  for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) {
    if (data[(y * d.width + x) * 4 + 3]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  if (maxX < 0) { app.toast('Nothing to trim: the image is empty.'); return; }
  if (minX === 0 && minY === 0 && maxX === d.width - 1 && maxY === d.height - 1) { app.toast('No transparent edges to trim.'); return; }
  cropDocument(minX, minY, maxX - minX + 1, maxY - minY + 1);
}

// ---- Layer ----------------------------------------------------------------------------------------
export function newLayer() {
  structural(app, 'New Layer', () => { const d = doc(); d.addLayer(d.nextLayerName(), d.activeIndex + 1); });
}

export function duplicateLayer() {
  const d = doc(), src = layer();
  structural(app, 'Duplicate Layer', () => {
    const l = d.addLayer(`${src.name} copy`, d.activeIndex + 1);
    Object.assign(l, { opacity: src.opacity, blend: src.blend, visible: src.visible, lockAlpha: src.lockAlpha });
    l.ctx.drawImage(src.canvas, 0, 0);
  });
}

// Ctrl+J: with a selection, copy (or cut) just the selected pixels to a new layer.
export function layerVia(cutIt = false) {
  if (!app.selection.active) { duplicateLayer(); return; }
  const d = doc(), src = layer();
  structural(app, cutIt ? 'Layer via Cut' : 'Layer via Copy', () => {
    const pix = cloneCanvas(src.canvas);
    app.selection.clip(pix);
    if (cutIt) {
      src.ctx.save();
      src.ctx.globalCompositeOperation = 'destination-out';
      src.ctx.drawImage(app.selection.mask, 0, 0);
      src.ctx.restore();
    }
    const l = d.addLayer(d.nextLayerName(), d.activeIndex + 1);
    l.ctx.drawImage(pix, 0, 0);
  });
}

export function deleteLayer() {
  const d = doc();
  if (d.layers.length <= 1) { app.toast('A document needs at least one layer.'); return; }
  structural(app, 'Delete Layer', () => d.removeLayer(d.active.id));
}

export function moveLayer(dir) {
  const d = doc();
  const i = d.activeIndex;
  const to = dir === 'top' ? d.layers.length - 1 : dir === 'bottom' ? 0 : i + dir;
  if (to === i || to < 0 || to >= d.layers.length) return;
  structural(app, 'Arrange Layer', () => d.moveLayer(d.active.id, to));
}

export function mergeDown() {
  const d = doc();
  const i = d.activeIndex;
  if (i <= 0) { app.toast('There is no layer below to merge into.'); return; }
  structural(app, 'Merge Down', () => {
    const top = d.layers[i], below = d.layers[i - 1];
    if (top.visible) {
      below.ctx.save();
      below.ctx.globalAlpha = top.opacity;
      below.ctx.globalCompositeOperation = top.blend;
      below.ctx.drawImage(top.canvas, 0, 0);
      below.ctx.restore();
    }
    d.layers.splice(i, 1);
    d.activeId = below.id;
  });
}

export function mergeVisible() {
  const d = doc();
  const visible = d.layers.filter((l) => l.visible);
  if (visible.length < 2) { app.toast('Need at least two visible layers to merge.'); return; }
  structural(app, 'Merge Visible', () => {
    const merged = makeCanvas(d.width, d.height);
    d.renderTo(merged, visible);
    const keep = visible[0];
    keep.ctx.clearRect(0, 0, d.width, d.height);
    keep.ctx.drawImage(merged, 0, 0);
    Object.assign(keep, { opacity: 1, blend: 'source-over' });
    d.layers = d.layers.filter((l) => !l.visible || l === keep);
    d.activeId = keep.id;
  });
}

export function flatten() {
  const d = doc();
  structural(app, 'Flatten Image', () => {
    const merged = makeCanvas(d.width, d.height);
    d.renderTo(merged);
    const keep = d.layers[0];
    keep.ctx.fillStyle = '#fff';
    keep.ctx.globalCompositeOperation = 'source-over';
    keep.ctx.fillRect(0, 0, d.width, d.height);
    keep.ctx.drawImage(merged, 0, 0);
    Object.assign(keep, { name: 'Background', opacity: 1, blend: 'source-over', visible: true });
    d.layers = [keep];
    d.activeId = keep.id;
  });
}

export function layerPropertiesDialog() {
  const l = layer();
  openDialog({
    title: 'Layer Properties',
    fields: [
      { id: 'name', label: 'Name', type: 'text', value: l.name },
      { id: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 100, value: Math.round(l.opacity * 100), unit: '%' },
      { id: 'blend', label: 'Blend mode', type: 'select', value: l.blend, choices: BLEND_MODES },
      { id: 'lockAlpha', label: 'Lock transparent pixels', type: 'checkbox', value: l.lockAlpha },
    ],
    onOk: (v) => layerProps(app, l, 'Layer Properties', { name: v.name || l.name, opacity: v.opacity / 100, blend: v.blend, lockAlpha: v.lockAlpha }),
  });
}

export function toggleLockAlpha() {
  const l = layer();
  layerProps(app, l, l.lockAlpha ? 'Unlock Transparency' : 'Lock Transparency', { lockAlpha: !l.lockAlpha });
}

// ---- Select ---------------------------------------------------------------------------------------
let lastSelection = null;
export function selectAll() { app.selection.selectAll(); }
export function deselect() {
  if (app.selection.active) lastSelection = app.selection.snapshot();
  app.selection.clear();
}
export function reselect() { if (lastSelection) app.selection.restoreSnapshot(lastSelection); }
export function inverse() { if (app.selection.active) app.selection.invert(); else app.selection.selectAll(); }

export function modifyDialog(kind) {
  if (!needSelection()) return;
  const label = { grow: 'Expand Selection', shrink: 'Contract Selection', feather: 'Feather Selection' }[kind];
  openDialog({
    title: label,
    fields: [{ id: 'px', label: kind === 'feather' ? 'Feather radius' : kind === 'grow' ? 'Expand by' : 'Contract by', type: 'range', min: 1, max: 100, value: kind === 'feather' ? 8 : 4, unit: 'px' }],
    onOk: ({ px }) => app.busy(label, () => {
      if (kind === 'feather') app.selection.feather(px);
      else app.selection.modify(kind === 'grow' ? px : -px);
    }),
  });
}

export function selectLayerAlpha() {
  const l = layer();
  app.selection.combine((ctx) => ctx.drawImage(l.canvas, 0, 0), 'replace');
  if (!app.selection.active) app.toast('That layer is empty.');
}

// ---- View -----------------------------------------------------------------------------------------
export function toggleGrid() {
  app.view.showGrid = !app.view.showGrid;
  app.view.requestRender();
  emit('view');
}

export function selectionOrDoc() {
  const d = doc();
  return clampRect(app.selection.active ? app.selection.bounds : { x: 0, y: 0, w: d.width, h: d.height }, d.width, d.height);
}
