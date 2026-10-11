import { app } from '../core/app.js';
import { makeCanvas } from '../core/document.js';
import { beginPixelEdit, structural } from '../core/history.js';
import { floodMask, maskBounds } from '../core/pixels.js';
import { rgba } from '../core/color.js';
import { opt, sampleColor, constrainAngle, constrainSquare, rectFrom, dashedPath } from './common.js';

const opacityOpt = { id: 'opacity', label: 'Opacity', type: 'range', min: 1, max: 100, step: 1, value: 100, unit: '%' };

// Draw a document-sized canvas onto the active layer, clipped to the selection, as one undo step.
function applyCanvas(canvas, label, rect, opacity = 1) {
  const layer = app.doc.active;
  app.selection.clip(canvas);
  const edit = beginPixelEdit(app, layer, rect || { x: 0, y: 0, w: app.doc.width, h: app.doc.height }, label);
  const ctx = layer.ctx;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = layer.lockAlpha ? 'source-atop' : 'source-over';
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
  edit.commit();
}

// ---- Paint bucket ---------------------------------------------------------------------------------
export const bucketTool = {
  id: 'bucket', name: 'Paint Bucket', icon: 'ph-paint-bucket', key: 'G',
  options: [
    { id: 'tolerance', label: 'Tolerance', type: 'range', min: 0, max: 255, step: 1, value: 32 },
    { id: 'contiguous', label: 'Contiguous', type: 'checkbox', value: true },
    { id: 'merged', label: 'Sample all layers', type: 'checkbox', value: false },
    opacityOpt,
  ],
  down(p) {
    const doc = app.doc;
    const x = Math.floor(p.x), y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return false;
    if (!app.selection.contains(x, y)) return false;
    const src = opt(bucketTool, 'merged') ? doc.render() : doc.active.canvas;
    const img = src.getContext('2d').getImageData(0, 0, doc.width, doc.height);
    const mask = floodMask(img, x, y, opt(bucketTool, 'tolerance'), opt(bucketTool, 'contiguous'));
    const b = maskBounds(mask, doc.width, doc.height);
    if (!b) return false;
    const fill = makeCanvas(doc.width, doc.height);
    const f = fill.getContext('2d');
    const out = f.createImageData(doc.width, doc.height);
    const { r, g, b: bl } = app.fg;
    for (let i = 0, j = 0; i < mask.length; i++, j += 4) {
      if (!mask[i]) continue;
      out.data[j] = r; out.data[j + 1] = g; out.data[j + 2] = bl; out.data[j + 3] = 255;
    }
    f.putImageData(out, 0, 0);
    applyCanvas(fill, 'Paint Bucket', b, opt(bucketTool, 'opacity') / 100);
    return false;
  },
};

// ---- Gradient -------------------------------------------------------------------------------------
export const gradientTool = {
  id: 'gradient', name: 'Gradient', icon: 'ph-gradient', key: 'Shift+G',
  options: [
    { id: 'type', label: 'Type', type: 'seg', value: 'linear', choices: [['linear', 'Linear'], ['radial', 'Radial'], ['reflected', 'Reflected']] },
    { id: 'colors', label: 'Colors', type: 'select', value: 'fgbg', choices: [['fgbg', 'Foreground → Background'], ['fgclear', 'Foreground → Transparent']] },
    { id: 'reverse', label: 'Reverse', type: 'checkbox', value: false },
    opacityOpt,
  ],
  down(p) { this.a = p; this.b = p; return true; },
  move(p, e) { if (!this.a) return; this.b = e.shiftKey ? constrainAngle(this.a, p) : p; app.view.requestRender(); },
  up() {
    const { a, b } = this;
    this.a = null;
    if (!a || Math.hypot(b.x - a.x, b.y - a.y) < 1) return;
    const doc = app.doc;
    const canvas = makeCanvas(doc.width, doc.height);
    const g = canvas.getContext('2d');
    let c0 = rgba(app.fg), c1 = opt(gradientTool, 'colors') === 'fgclear' ? rgba({ ...app.fg, a: 0 }) : rgba(app.bg);
    if (opt(gradientTool, 'reverse')) [c0, c1] = [c1, c0];
    const type = opt(gradientTool, 'type');
    let grad;
    if (type === 'radial') {
      grad = g.createRadialGradient(a.x, a.y, 0, a.x, a.y, Math.hypot(b.x - a.x, b.y - a.y));
      grad.addColorStop(0, c0); grad.addColorStop(1, c1);
    } else if (type === 'reflected') {
      grad = g.createLinearGradient(2 * a.x - b.x, 2 * a.y - b.y, b.x, b.y);
      grad.addColorStop(0, c1); grad.addColorStop(0.5, c0); grad.addColorStop(1, c1);
    } else {
      grad = g.createLinearGradient(a.x, a.y, b.x, b.y);
      grad.addColorStop(0, c0); grad.addColorStop(1, c1);
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, doc.width, doc.height);
    applyCanvas(canvas, 'Gradient', null, opt(gradientTool, 'opacity') / 100);
  },
  cancel() { this.a = null; app.view.requestRender(); },
  overlay(ctx, view) {
    if (!this.a) return;
    const s = view.toScreen(this.a.x, this.a.y), e = view.toScreen(this.b.x, this.b.y);
    dashedPath(ctx, (c) => { c.moveTo(s.x, s.y); c.lineTo(e.x, e.y); });
    for (const q of [s, e]) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  },
};

// ---- Shapes ---------------------------------------------------------------------------------------
export const shapeTool = {
  id: 'shape', name: 'Shapes', icon: 'ph-shapes', key: 'U',
  options: [
    { id: 'shape', label: 'Shape', type: 'seg', value: 'rect', choices: [['rect', 'Rect'], ['rounded', 'Rounded'], ['ellipse', 'Ellipse'], ['line', 'Line'], ['triangle', 'Triangle']] },
    { id: 'fill', label: 'Fill', type: 'select', value: 'fg', choices: [['fg', 'Foreground'], ['bg', 'Background'], ['none', 'None']] },
    { id: 'stroke', label: 'Stroke', type: 'select', value: 'none', choices: [['none', 'None'], ['fg', 'Foreground'], ['bg', 'Background']] },
    { id: 'width', label: 'Stroke width', type: 'number', min: 1, max: 200, step: 1, value: 4, unit: 'px' },
    { id: 'radius', label: 'Corner radius', type: 'number', min: 0, max: 500, step: 1, value: 16, unit: 'px' },
    { id: 'newLayer', label: 'New layer', type: 'checkbox', value: true },
  ],
  hint: 'Shift constrains (square / circle / 45°), Alt draws from the centre.',
  down(p) { this.a = p; this.b = p; return true; },
  move(p, e) {
    if (!this.a) return;
    const line = opt(shapeTool, 'shape') === 'line';
    this.b = e.shiftKey ? (line ? constrainAngle(this.a, p) : constrainSquare(this.a, p)) : p;
    this.center = e.altKey && !line;
    app.view.requestRender();
  },
  geometry() {
    const { a, b } = this;
    if (this.center) return rectFrom({ x: 2 * a.x - b.x, y: 2 * a.y - b.y }, b);
    return rectFrom(a, b);
  },
  draw(ctx) {
    const shape = opt(shapeTool, 'shape');
    const pick = (k) => (k === 'fg' ? rgba(app.fg) : k === 'bg' ? rgba(app.bg) : null);
    const fill = pick(opt(shapeTool, 'fill'));
    let stroke = pick(opt(shapeTool, 'stroke'));
    const lw = opt(shapeTool, 'width');
    const r = this.geometry();
    ctx.beginPath();
    if (shape === 'line') {
      ctx.moveTo(this.a.x, this.a.y);
      ctx.lineTo(this.b.x, this.b.y);
      stroke = stroke || rgba(app.fg);
    } else if (shape === 'ellipse') ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
    else if (shape === 'rounded') ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(opt(shapeTool, 'radius'), r.w / 2, r.h / 2));
    else if (shape === 'triangle') { ctx.moveTo(r.x + r.w / 2, r.y); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.lineTo(r.x, r.y + r.h); ctx.closePath(); }
    else ctx.rect(r.x, r.y, r.w, r.h);
    if (fill && shape !== 'line') { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }
  },
  up() {
    if (!this.a) return;
    const r = this.geometry();
    const isLine = opt(shapeTool, 'shape') === 'line';
    if (r.w < 1 && r.h < 1 && !isLine) { this.a = null; return; }
    const doc = app.doc;
    const canvas = makeCanvas(doc.width, doc.height);
    this.draw(canvas.getContext('2d'));
    this.a = null;
    if (opt(shapeTool, 'newLayer')) {
      structural(app, 'Shape', () => {
        const layer = doc.addLayer(`Shape ${doc.layers.length}`, doc.activeIndex + 1);
        app.selection.clip(canvas);
        layer.ctx.drawImage(canvas, 0, 0);
      });
    } else {
      applyCanvas(canvas, 'Shape');
    }
  },
  cancel() { this.a = null; app.view.requestRender(); },
  overlay(ctx, view) {
    if (!this.a) return;
    ctx.save();
    ctx.translate(view.panX, view.panY);
    ctx.scale(view.zoom, view.zoom);
    ctx.globalAlpha = 0.85;
    this.draw(ctx);
    ctx.restore();
  },
};

// ---- Text -----------------------------------------------------------------------------------------
export const FONTS = [
  ['Plus Jakarta Sans', 'Plus Jakarta Sans'], ['Fraunces', 'Fraunces'], ['Georgia', 'Georgia'], ['Arial', 'Arial'],
  ['Helvetica', 'Helvetica'], ['Times New Roman', 'Times New Roman'], ['Courier New', 'Courier New'],
  ['Impact', 'Impact'], ['Trebuchet MS', 'Trebuchet MS'], ['Verdana', 'Verdana'], ['monospace', 'Monospace'],
];

export const textTool = {
  id: 'text', name: 'Text', icon: 'ph-text-t', key: 'T',
  options: [
    { id: 'font', label: 'Font', type: 'select', value: 'Plus Jakarta Sans', choices: FONTS },
    { id: 'size', label: 'Size', type: 'number', min: 4, max: 1000, step: 1, value: 48, unit: 'px' },
    { id: 'bold', label: 'Bold', type: 'checkbox', value: false },
    { id: 'italic', label: 'Italic', type: 'checkbox', value: false },
    { id: 'align', label: 'Align', type: 'seg', value: 'left', choices: [['left', 'Left'], ['center', 'Center'], ['right', 'Right']] },
  ],
  hint: 'Click to place text. Ctrl/Cmd+Enter or clicking elsewhere commits it as a new layer; Esc cancels.',
  font(scale = 1) {
    return `${opt(textTool, 'italic') ? 'italic ' : ''}${opt(textTool, 'bold') ? '700' : '400'} ${opt(textTool, 'size') * scale}px "${opt(textTool, 'font')}"`;
  },
  down(p) {
    if (this.editor) { this.commit(); return false; }
    this.at = p;
    const view = app.view;
    const s = view.toScreen(p.x, p.y);
    const ta = document.createElement('textarea');
    ta.className = 'text-editor';
    ta.style.left = `${s.x}px`;
    ta.style.top = `${s.y}px`;
    ta.style.font = this.font(view.zoom);
    ta.style.color = rgba(app.fg);
    ta.style.textAlign = opt(textTool, 'align');
    ta.rows = 1;
    ta.spellcheck = false;
    const grow = () => {
      ta.style.width = '10px';
      ta.style.height = '10px';
      ta.style.width = `${ta.scrollWidth + 8}px`;
      ta.style.height = `${ta.scrollHeight + 2}px`;
    };
    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.cancel();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.commit();
    });
    view.canvas.parentElement.appendChild(ta);
    this.editor = ta;
    grow();
    setTimeout(() => ta.focus(), 0);
    return false;
  },
  commit() {
    const ta = this.editor;
    if (!ta) return;
    const text = ta.value;
    ta.remove();
    this.editor = null;
    if (!text.trim()) return;
    const doc = app.doc;
    structural(app, 'Text', () => {
      const layer = doc.addLayer(`Text: ${text.split('\n')[0].slice(0, 24)}`, doc.activeIndex + 1);
      const ctx = layer.ctx;
      const size = opt(textTool, 'size');
      ctx.font = this.font();
      ctx.fillStyle = rgba(app.fg);
      ctx.textBaseline = 'top';
      const lines = text.split('\n');
      const align = opt(textTool, 'align');
      const widths = lines.map((l) => ctx.measureText(l).width);
      const maxW = Math.max(...widths);
      lines.forEach((line, i) => {
        const dx = align === 'center' ? (maxW - widths[i]) / 2 : align === 'right' ? maxW - widths[i] : 0;
        ctx.fillText(line, this.at.x + dx, this.at.y + i * size * 1.2);
      });
    });
  },
  cancel() { this.editor?.remove(); this.editor = null; },
  deactivate() { this.commit(); },
};

// ---- Eyedropper, hand, zoom -----------------------------------------------------------------------
export const eyedropperTool = {
  id: 'eyedropper', name: 'Eyedropper', icon: 'ph-eyedropper', key: 'I',
  options: [
    { id: 'size', label: 'Sample size', type: 'select', value: '1', choices: [['1', 'Point'], ['3', '3 × 3 average'], ['5', '5 × 5 average'], ['11', '11 × 11 average']] },
    { id: 'merged', label: 'Sample all layers', type: 'checkbox', value: true },
  ],
  hint: 'Click to pick the foreground colour; Alt-click picks the background.',
  pick(p, e) {
    const c = sampleColor(p.x, p.y, { merged: opt(eyedropperTool, 'merged'), size: Number(opt(eyedropperTool, 'size')) });
    if (c) app.setColor(e.altKey ? 'bg' : 'fg', c);
  },
  down(p, e) { this.pick(p, e); return true; },
  move(p, e) { this.pick(p, e); },
  up() {},
};

export const handTool = {
  id: 'hand', name: 'Hand', icon: 'ph-hand', key: 'H', cursor: 'grab',
  options: [],
  hint: 'Drag to pan. Hold Space with any tool to pan; scroll to move, Ctrl/Cmd+scroll to zoom.',
  down(p) { this.last = { sx: p.sx, sy: p.sy }; app.view.canvas.style.cursor = 'grabbing'; return true; },
  move(p) {
    if (!this.last) return;
    app.view.pan(p.sx - this.last.sx, p.sy - this.last.sy);
    this.last = { sx: p.sx, sy: p.sy };
  },
  up() { this.last = null; app.view.canvas.style.cursor = 'grab'; },
};

export const zoomTool = {
  id: 'zoom', name: 'Zoom', icon: 'ph-magnifying-glass', key: 'Z', cursor: 'zoom-in',
  options: [],
  hint: 'Click to zoom in, Alt-click to zoom out. Ctrl/Cmd+0 fits, Ctrl/Cmd+1 shows actual pixels.',
  down(p, e) { app.view.zoomStep(e.altKey ? -1 : 1, p.sx, p.sy); return false; },
};

export const miscTools = [bucketTool, gradientTool, shapeTool, textTool, eyedropperTool, handTool, zoomTool];
