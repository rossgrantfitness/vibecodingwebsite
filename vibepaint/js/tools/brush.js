import { app } from '../core/app.js';
import { emit } from '../core/events.js';
import { makeCanvas, cloneCanvas } from '../core/document.js';
import { beginPixelEdit } from '../core/history.js';
import { opt, sampleColor, dist } from './common.js';

// ---- Brush tips -----------------------------------------------------------------------------------
const tipCache = new Map();

// Soft or hard round tip of diameter `d`, coloured `color` ({r,g,b}).
function roundTip(d, hardness, color) {
  d = Math.max(1, Math.round(d * 2) / 2);
  const key = `${d}|${hardness}|${color.r | 0},${color.g | 0},${color.b | 0}`;
  let tip = tipCache.get(key);
  if (tip) return tip;
  const size = Math.ceil(d) + 2;
  tip = makeCanvas(size, size);
  const g = tip.getContext('2d');
  const c = size / 2, r = d / 2;
  const rgb = `${color.r | 0},${color.g | 0},${color.b | 0}`;
  if (hardness >= 0.99 || d <= 2) {
    g.fillStyle = `rgb(${rgb})`;
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.fill();
  } else {
    const grad = g.createRadialGradient(c, c, 0, c, c, r);
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(hardness, `rgba(${rgb},1)`);
    for (let i = 1; i <= 6; i++) {
      const u = i / 6;
      grad.addColorStop(hardness + (1 - hardness) * u, `rgba(${rgb},${0.5 * (1 + Math.cos(Math.PI * u))})`);
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  if (tipCache.size > 96) tipCache.delete(tipCache.keys().next().value);
  tipCache.set(key, tip);
  return tip;
}

// Aliased tip for the pencil: hard pixels only, so pixel art stays crisp.
function pixelTip(n, square, color) {
  n = Math.max(1, Math.round(n));
  const key = `px|${n}|${square}|${color.r | 0},${color.g | 0},${color.b | 0}`;
  let tip = tipCache.get(key);
  if (tip) return tip;
  tip = makeCanvas(n, n);
  const g = tip.getContext('2d');
  const img = g.createImageData(n, n);
  const c = (n - 1) / 2, rr = (n / 2) * (n / 2);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (square || n <= 2 || (x - c) ** 2 + (y - c) ** 2 <= rr) {
      const i = (y * n + x) * 4;
      img.data[i] = color.r; img.data[i + 1] = color.g; img.data[i + 2] = color.b; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  tipCache.set(key, tip);
  return tip;
}

// Falloff 0–1 for a point at normalised distance t from the centre (used by direct-pixel tools).
function falloff(t, hardness) {
  if (t >= 1) return 0;
  if (t <= hardness) return 1;
  const u = (t - hardness) / (1 - hardness || 1);
  return 0.5 * (1 + Math.cos(Math.PI * u));
}

// ---- Stroke input: spacing, pressure, smoothing ------------------------------------------------
// Feeds evenly spaced dabs to `dab(x, y, pressure)` along the pointer path.
class DabPath {
  constructor({ spacing, smoothing = 0, pixel = false, dab }) {
    this.spacing = spacing; // function(pressure) → px between dabs
    this.smoothing = smoothing;
    this.pixel = pixel;
    this.dab = dab;
    this.last = null;
    this.smoothed = null;
    this.residual = 0;
  }

  start(p) {
    this.last = { ...p };
    this.smoothed = { ...p };
    this.residual = 0;
    this.dab(p.x, p.y, p.pressure);
  }

  to(p, final = false) {
    let target = p;
    if (this.smoothing > 0 && !final) {
      const k = 1 - this.smoothing;
      this.smoothed = {
        x: this.smoothed.x + (p.x - this.smoothed.x) * k,
        y: this.smoothed.y + (p.y - this.smoothed.y) * k,
        pressure: this.smoothed.pressure + (p.pressure - this.smoothed.pressure) * k,
      };
      target = this.smoothed;
    }
    const a = this.last;
    const len = dist(a, target);
    if (this.pixel) {
      // One dab per pixel step (Bresenham-style) so pencil lines have no gaps or doubles.
      const steps = Math.max(Math.abs(Math.floor(target.x) - Math.floor(a.x)), Math.abs(Math.floor(target.y) - Math.floor(a.y)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        this.dab(a.x + (target.x - a.x) * t, a.y + (target.y - a.y) * t, a.pressure + (target.pressure - a.pressure) * t);
      }
      if (steps) this.last = { ...target };
      return;
    }
    if (len === 0) return;
    let d = this.spacing(a.pressure) - this.residual;
    while (d <= len) {
      const t = d / len;
      const pr = a.pressure + (target.pressure - a.pressure) * t;
      this.dab(a.x + (target.x - a.x) * t, a.y + (target.y - a.y) * t, pr);
      d += this.spacing(pr);
    }
    this.residual = len - (d - this.spacing(target.pressure));
    this.last = { ...target };
  }
}

// ---- Stroke-canvas tools (brush, pencil, eraser, clone) ----------------------------------------
// Dabs build up on a separate canvas at "flow"; the finished stroke is applied once at "opacity",
// like Photoshop. While painting, the document shows it as a live preview on the active layer.
let strokeCanvas = null;
let clipCanvas = null;
function strokeBuffers(doc) {
  if (!strokeCanvas || strokeCanvas.width !== doc.width || strokeCanvas.height !== doc.height) {
    strokeCanvas = makeCanvas(doc.width, doc.height);
    clipCanvas = makeCanvas(doc.width, doc.height);
  }
  strokeCanvas.getContext('2d').clearRect(0, 0, doc.width, doc.height);
  return strokeCanvas;
}

// The stroke as it should be applied: clipped to the selection.
function clippedStroke(sc) {
  if (!app.selection.active) return sc;
  const c = clipCanvas.getContext('2d');
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, clipCanvas.width, clipCanvas.height);
  c.drawImage(sc, 0, 0);
  app.selection.clip(clipCanvas);
  return clipCanvas;
}

function makeStrokeTool(def) {
  const tool = {
    ...def,
    cursorless: true,
    down(p, e) {
      if (def.altPick !== false && e.altKey) {
        const c = sampleColor(p.x, p.y);
        if (c) app.setColor('fg', c);
        return false;
      }
      if (def.beforeDown && def.beforeDown(p, e) === false) return false;
      const doc = app.doc;
      const layer = doc.active;
      if (!layer.visible) { app.toast('The active layer is hidden.'); return false; }
      const sc = strokeBuffers(doc);
      const sctx = sc.getContext('2d');
      const size = () => opt(tool, 'size');
      const pixel = def.pixel?.() || false;
      const hardness = (opt(tool, 'hardness') ?? 100) / 100;
      const flow = (opt(tool, 'flow') ?? 100) / 100;
      const pSize = opt(tool, 'pressureSize') ?? false;
      const pOpacity = opt(tool, 'pressureOpacity') ?? false;
      const erase = def.erase && !layer.lockAlpha;
      const color = def.erase ? (layer.lockAlpha ? app.bg : { r: 0, g: 0, b: 0 }) : app.fg;
      const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      const ctxState = def.prepare?.(p, layer, doc) || {};
      this.stroke = { layer, sc, bounds };

      const dab = (x, y, pr) => {
        const d = Math.max(1, size() * (pSize ? Math.max(0.05, pr) : 1));
        const alpha = flow * (pOpacity ? pr : 1);
        const r = d / 2 + 2;
        bounds.minX = Math.min(bounds.minX, x - r); bounds.minY = Math.min(bounds.minY, y - r);
        bounds.maxX = Math.max(bounds.maxX, x + r); bounds.maxY = Math.max(bounds.maxY, y + r);
        sctx.save();
        sctx.globalAlpha = alpha;
        if (def.dab) def.dab(sctx, x, y, d, hardness, ctxState);
        else if (pixel) {
          const n = Math.max(1, Math.round(d));
          sctx.imageSmoothingEnabled = false;
          sctx.drawImage(pixelTip(n, opt(tool, 'shape') === 'square', color), Math.floor(x - n / 2 + 0.5), Math.floor(y - n / 2 + 0.5));
        } else {
          const tip = roundTip(d, hardness, color);
          sctx.drawImage(tip, x - tip.width / 2, y - tip.height / 2);
        }
        sctx.restore();
      };

      const spacingPct = (opt(tool, 'spacing') ?? 10) / 100;
      this.path = new DabPath({
        spacing: (pr) => Math.max(pixel ? 1 : 0.5, size() * (pSize ? Math.max(0.05, pr) : 1) * spacingPct),
        smoothing: (opt(tool, 'smoothing') ?? 0) / 100 * 0.92,
        pixel,
        dab,
      });

      const opacity = (opt(tool, 'opacity') ?? 100) / 100;
      const op = erase ? 'destination-out' : layer.lockAlpha ? 'source-atop' : 'source-over';
      doc.preview = {
        layerId: layer.id,
        apply(ctx) {
          ctx.globalAlpha = opacity;
          ctx.globalCompositeOperation = op;
          ctx.drawImage(clippedStroke(sc), 0, 0);
        },
      };
      this.commitInfo = { opacity, op };

      if (e.shiftKey && app.lastPoint && app.lastPoint.layerId === layer.id) {
        this.path.start({ ...app.lastPoint, pressure: p.pressure });
        this.path.to(p, true);
      } else {
        this.path.start(p);
      }
      app.redraw();
      return true;
    },
    move(p) {
      if (!this.path) return;
      this.path.to(p);
      app.redraw();
    },
    up(p) {
      if (!this.path) return;
      this.path.to(p, true);
      const doc = app.doc;
      const { layer, sc, bounds } = this.stroke;
      const rect = { x: bounds.minX, y: bounds.minY, w: bounds.maxX - bounds.minX, h: bounds.maxY - bounds.minY };
      const edit = beginPixelEdit(app, layer, rect, def.label);
      const ctx = layer.ctx;
      ctx.save();
      ctx.globalAlpha = this.commitInfo.opacity;
      ctx.globalCompositeOperation = this.commitInfo.op;
      ctx.drawImage(clippedStroke(sc), 0, 0);
      ctx.restore();
      doc.preview = null;
      edit.commit();
      app.lastPoint = { x: p.x, y: p.y, layerId: layer.id };
      this.path = null;
      this.stroke = null;
      def.afterUp?.();
    },
    cancel() {
      if (!this.path) return;
      app.doc.preview = null;
      this.path = null;
      app.redraw();
    },
    overlay(ctx, view) {
      if (def.overlay) def.overlay(ctx, view, tool);
      view.drawBrushCursor(ctx, opt(tool, 'size'), def.pixel?.() && opt(tool, 'shape') === 'square');
    },
  };
  return tool;
}

const sizeOpt = (value, max = 1000) => ({ id: 'size', label: 'Size', type: 'range', min: 1, max, step: 1, value, unit: 'px', log: true });
const hardOpt = (value) => ({ id: 'hardness', label: 'Hardness', type: 'range', min: 0, max: 100, step: 1, value, unit: '%' });
const opacityOpt = { id: 'opacity', label: 'Opacity', type: 'range', min: 1, max: 100, step: 1, value: 100, unit: '%' };
const flowOpt = { id: 'flow', label: 'Flow', type: 'range', min: 1, max: 100, step: 1, value: 100, unit: '%' };

export const brushTool = makeStrokeTool({
  id: 'brush', name: 'Brush', icon: 'ph-paint-brush', key: 'B', label: 'Brush',
  options: [
    sizeOpt(24), hardOpt(80), opacityOpt, flowOpt,
    { id: 'spacing', label: 'Spacing', type: 'range', min: 1, max: 100, step: 1, value: 10, unit: '%' },
    { id: 'smoothing', label: 'Smoothing', type: 'range', min: 0, max: 100, step: 1, value: 0, unit: '%' },
    { id: 'pressureSize', label: 'Pressure → size', type: 'checkbox', value: true },
    { id: 'pressureOpacity', label: 'Pressure → opacity', type: 'checkbox', value: false },
  ],
});

export const pencilTool = makeStrokeTool({
  id: 'pencil', name: 'Pencil', icon: 'ph-pencil-simple', key: 'Shift+B', label: 'Pencil',
  pixel: () => true,
  options: [
    sizeOpt(1, 200),
    { id: 'shape', label: 'Shape', type: 'select', value: 'square', choices: [['square', 'Square'], ['round', 'Round']] },
    opacityOpt,
  ],
});

export const eraserTool = makeStrokeTool({
  id: 'eraser', name: 'Eraser', icon: 'ph-eraser', key: 'E', label: 'Eraser', erase: true, altPick: false,
  pixel: () => opt(eraserTool, 'mode') === 'pencil',
  options: [
    { id: 'mode', label: 'Mode', type: 'select', value: 'brush', choices: [['brush', 'Brush'], ['pencil', 'Pencil']] },
    sizeOpt(40), hardOpt(80), opacityOpt, flowOpt,
    { id: 'pressureSize', label: 'Pressure → size', type: 'checkbox', value: true },
  ],
});

// Clone stamp: Alt-click to set the source, then paint.
let cloneSource = null;   // { x, y } in document space
let cloneOffset = null;   // source − destination, kept between strokes when "aligned"
export const cloneTool = makeStrokeTool({
  id: 'clone', name: 'Clone Stamp', icon: 'ph-stamp', key: 'S', label: 'Clone Stamp', altPick: false,
  options: [
    sizeOpt(40), hardOpt(60), opacityOpt, flowOpt,
    { id: 'aligned', label: 'Aligned', type: 'checkbox', value: true },
    { id: 'sample', label: 'Sample', type: 'select', value: 'layer', choices: [['layer', 'Current layer'], ['all', 'All layers']] },
  ],
  beforeDown(p, e) {
    if (e.altKey) {
      cloneSource = { x: p.x, y: p.y };
      cloneOffset = null;
      app.toast('Clone source set. Now paint somewhere else.');
      return false;
    }
    if (!cloneSource) { app.toast('Alt-click (Option-click) to set a clone source first.'); return false; }
    if (!cloneOffset || !opt(cloneTool, 'aligned')) cloneOffset = { x: cloneSource.x - p.x, y: cloneSource.y - p.y };
    return true;
  },
  prepare(p, layer, doc) {
    const src = opt(cloneTool, 'sample') === 'all' ? cloneCanvas(doc.render()) : cloneCanvas(layer.canvas);
    return { src, tmp: makeCanvas(8, 8) };
  },
  dab(sctx, x, y, d, hardness, s) {
    const size = Math.ceil(d) + 2;
    if (s.tmp.width < size) { s.tmp.width = size; s.tmp.height = size; }
    const t = s.tmp.getContext('2d');
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, s.tmp.width, s.tmp.height);
    t.drawImage(s.src, x + cloneOffset.x - size / 2, y + cloneOffset.y - size / 2, size, size, 0, 0, size, size);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(roundTip(d, hardness, { r: 0, g: 0, b: 0 }), 0, 0);
    sctx.drawImage(s.tmp, 0, 0, size, size, x - size / 2, y - size / 2, size, size);
  },
  overlay(ctx, view) {
    const off = cloneOffset;
    const p = view.pointer;
    let at = null;
    if (p && off) { const d = view.toDoc(p.sx, p.sy); at = view.toScreen(d.x + off.x, d.y + off.y); }
    else if (cloneSource) at = view.toScreen(cloneSource.x, cloneSource.y);
    if (!at) return;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(at.x - 7, at.y); ctx.lineTo(at.x + 7, at.y);
    ctx.moveTo(at.x, at.y - 7); ctx.lineTo(at.x, at.y + 7);
    ctx.stroke();
  },
});

// ---- Direct-pixel tools (smudge, dodge/burn, blur/sharpen) --------------------------------------
// These read and write the layer under each dab, so they work on ImageData regions.
function makeDirectTool(def) {
  const tool = {
    ...def,
    cursorless: true,
    down(p, e) {
      const doc = app.doc;
      const layer = doc.active;
      if (!layer.visible) { app.toast('The active layer is hidden.'); return false; }
      this.layer = layer;
      this.backup = cloneCanvas(layer.canvas);
      this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      this.state = {};
      const size = opt(tool, 'size');
      const hardness = (opt(tool, 'hardness') ?? 50) / 100;
      const strength = (opt(tool, 'strength') ?? 50) / 100;
      this.path = new DabPath({
        spacing: () => Math.max(1, size * 0.15),
        dab: (x, y) => this.dabAt(x, y, size, hardness, strength),
      });
      this.path.start(p);
      app.redraw();
      return true;
    },
    dabAt(x, y, size, hardness, strength) {
      const doc = app.doc;
      const r = size / 2;
      const pad = def.pad || 0;
      const x0 = Math.max(0, Math.floor(x - r - pad)), y0 = Math.max(0, Math.floor(y - r - pad));
      const x1 = Math.min(doc.width, Math.ceil(x + r + pad)), y1 = Math.min(doc.height, Math.ceil(y + r + pad));
      if (x1 <= x0 || y1 <= y0) return;
      const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      const img = this.layer.ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
      const sel = app.selection.alphaFor(rect);
      const weight = (px, py) => {
        const t = Math.hypot(px + rect.x + 0.5 - x, py + rect.y + 0.5 - y) / r;
        let w = falloff(t, hardness) * strength;
        if (sel) w *= sel[py * rect.w + px] / 255;
        return w;
      };
      def.process(img, weight, this.state, { x, y, rect, size });
      this.layer.ctx.putImageData(img, rect.x, rect.y);
      const b = this.bounds;
      b.minX = Math.min(b.minX, x0); b.minY = Math.min(b.minY, y0); b.maxX = Math.max(b.maxX, x1); b.maxY = Math.max(b.maxY, y1);
    },
    move(p) {
      if (!this.path) return;
      this.path.to(p);
      app.redraw();
    },
    up(p) {
      if (!this.path) return;
      this.path.to(p, true);
      const b = this.bounds;
      if (b.maxX > b.minX) {
        const rect = { x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY };
        beginPixelEdit(app, this.layer, rect, def.label, this.backup).commit();
      }
      this.path = null;
      this.backup = null;
    },
    cancel() { if (this.path) this.up(this.path.last); },
    overlay(ctx, view) { view.drawBrushCursor(ctx, opt(tool, 'size')); },
  };
  return tool;
}

// Premultiplied lerp of pixel i in `dst` toward colour (r,g,b,a) by w.
function lerpPixel(d, i, r, g, b, a, w) {
  const a0 = d[i + 3];
  const na = a0 + (a - a0) * w;
  if (na <= 0) { d[i + 3] = 0; return; }
  d[i] = (d[i] * a0 + (r * a - d[i] * a0) * w) / na;
  d[i + 1] = (d[i + 1] * a0 + (g * a - d[i + 1] * a0) * w) / na;
  d[i + 2] = (d[i + 2] * a0 + (b * a - d[i + 2] * a0) * w) / na;
  d[i + 3] = na;
}

export const smudgeTool = makeDirectTool({
  id: 'smudge', name: 'Smudge', icon: 'ph-hand-swipe-right', key: 'P', label: 'Smudge',
  options: [sizeOpt(30, 300), hardOpt(40), { id: 'strength', label: 'Strength', type: 'range', min: 1, max: 100, step: 1, value: 50, unit: '%' }],
  // Picks up the colour under the first dab and drags it along, blending as it goes. The carried
  // colour lives in a buffer the size of the dab, indexed relative to the dab's top-left corner.
  process(img, weight, state) {
    const d = img.data;
    const w = img.width, h = img.height;
    if (!state.buf || state.w !== w || state.h !== h) {
      state.buf = new Float32Array(d);
      state.w = w;
      state.h = h;
      return;
    }
    const buf = state.buf;
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const wt = weight(px, py);
      if (wt > 0) lerpPixel(d, i, buf[i], buf[i + 1], buf[i + 2], buf[i + 3], wt);
      buf[i] = d[i]; buf[i + 1] = d[i + 1]; buf[i + 2] = d[i + 2]; buf[i + 3] = d[i + 3];
    }
  },
});

export const dodgeTool = makeDirectTool({
  id: 'dodge', name: 'Dodge / Burn', icon: 'ph-sun-dim', key: 'O', label: 'Dodge/Burn',
  options: [
    { id: 'mode', label: 'Mode', type: 'select', value: 'dodge', choices: [['dodge', 'Dodge (lighten)'], ['burn', 'Burn (darken)']] },
    { id: 'range', label: 'Range', type: 'select', value: 'mid', choices: [['shadows', 'Shadows'], ['mid', 'Midtones'], ['highlights', 'Highlights']] },
    sizeOpt(60, 500), hardOpt(30),
    { id: 'strength', label: 'Exposure', type: 'range', min: 1, max: 100, step: 1, value: 25, unit: '%' },
  ],
  process(img, weight) {
    const burn = opt(dodgeTool, 'mode') === 'burn';
    const range = opt(dodgeTool, 'range');
    const d = img.data;
    for (let py = 0; py < img.height; py++) for (let px = 0; px < img.width; px++) {
      const w = weight(px, py) * 0.25;
      if (w <= 0) continue;
      const i = (py * img.width + px) * 4;
      const l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
      const rw = range === 'shadows' ? (1 - l) ** 2 : range === 'highlights' ? l * l : 1 - Math.abs(2 * l - 1) * 0.6;
      const k = w * rw;
      for (let c = 0; c < 3; c++) d[i + c] = burn ? d[i + c] * (1 - k) : d[i + c] + (255 - d[i + c]) * k;
    }
  },
});

export const focusTool = makeDirectTool({
  id: 'focus', name: 'Blur / Sharpen', icon: 'ph-drop', key: 'R', label: 'Blur/Sharpen', pad: 2,
  options: [
    { id: 'mode', label: 'Mode', type: 'select', value: 'blur', choices: [['blur', 'Blur'], ['sharpen', 'Sharpen']] },
    sizeOpt(40, 300), hardOpt(30),
    { id: 'strength', label: 'Strength', type: 'range', min: 1, max: 100, step: 1, value: 50, unit: '%' },
  ],
  process(img, weight) {
    const sharpen = opt(focusTool, 'mode') === 'sharpen';
    const { width: w, height: h, data: d } = img;
    const src = new Float32Array(d.length);
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] / 255;
      src[i] = d[i] * a; src[i + 1] = d[i + 1] * a; src[i + 2] = d[i + 2] * a; src[i + 3] = d[i + 3];
    }
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const wgt = weight(x, y) * (sharpen ? 0.6 : 0.5);
      if (wgt <= 0) continue;
      const i = (y * w + x) * 4;
      const avg = [0, 0, 0, 0];
      for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) {
        const j = ((y + ky) * w + x + kx) * 4;
        for (let c = 0; c < 4; c++) avg[c] += src[j + c] / 9;
      }
      const out = [];
      for (let c = 0; c < 4; c++) out[c] = sharpen ? src[i + c] + (src[i + c] - avg[c]) * wgt * 2 : src[i + c] + (avg[c] - src[i + c]) * wgt;
      const a = Math.max(0, Math.min(255, out[3]));
      const k = a > 0 ? 255 / a : 0;
      d[i] = out[0] * k; d[i + 1] = out[1] * k; d[i + 2] = out[2] * k; d[i + 3] = a;
    }
  },
});

export const paintTools = [brushTool, pencilTool, eraserTool, cloneTool, smudgeTool, dodgeTool, focusTool];

// Keep thumbnails and dependents in sync after any direct pixel stroke.
export function notifyPixels(layer) { emit('pixels', layer); }
