import { app } from '../core/app.js';
import { emit } from '../core/events.js';
import { makeCanvas, cloneCanvas } from '../core/document.js';
import { beginPixelEdit, structural } from '../core/history.js';
import { opt, rectFrom, constrainSquare } from './common.js';

// ---- Floating pixels ------------------------------------------------------------------------------
// The selected pixels (or the whole layer) lifted into their own bitmap with a transform:
// centre (cx, cy), scale (sx, sy; negative = flipped) and rotation `rot` in radians.
// The layer itself is untouched until commit; until then the document shows a live preview.
class Floater {
  constructor(layer) {
    const doc = app.doc;
    const sel = app.selection;
    this.layer = layer;
    this.lifted = sel.active;
    let b = sel.active ? sel.bounds : contentBounds(layer.canvas);
    if (!b) b = { x: 0, y: 0, w: doc.width, h: doc.height };
    this.bounds = b;
    this.img = makeCanvas(b.w, b.h);
    const g = this.img.getContext('2d');
    g.drawImage(layer.canvas, -b.x, -b.y);
    if (this.lifted) {
      this.maskImg = makeCanvas(b.w, b.h);
      this.maskImg.getContext('2d').drawImage(sel.mask, -b.x, -b.y);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(this.maskImg, 0, 0);
    }
    this.cx = b.x + b.w / 2;
    this.cy = b.y + b.h / 2;
    this.sx = 1;
    this.sy = 1;
    this.rot = 0;
    const self = this;
    doc.preview = {
      layerId: layer.id,
      apply(ctx) {
        self.cutOut(ctx);
        self.draw(ctx);
      },
    };
    app.redraw();
  }

  get w() { return this.img.width * Math.abs(this.sx); }
  get h() { return this.img.height * Math.abs(this.sy); }
  get changed() {
    return Math.abs(this.cx - (this.bounds.x + this.bounds.w / 2)) > 0.01 || Math.abs(this.cy - (this.bounds.y + this.bounds.h / 2)) > 0.01
      || this.sx !== 1 || this.sy !== 1 || this.rot !== 0;
  }

  cutOut(ctx) {
    ctx.save();
    if (this.lifted) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(this.maskImg, this.bounds.x, this.bounds.y);
    } else {
      ctx.clearRect(0, 0, app.doc.width, app.doc.height);
    }
    ctx.restore();
  }

  draw(ctx, img = this.img) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = opt(transformTool, 'smooth') !== false && (this.rot !== 0 || Math.abs(this.sx) !== 1 || Math.abs(this.sy) !== 1);
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.scale(this.sx, this.sy);
    const ox = this.rot === 0 && this.sx === 1 && this.sy === 1 ? Math.round(this.cx - img.width / 2) - (this.cx - img.width / 2) : 0;
    const oy = this.rot === 0 && this.sx === 1 && this.sy === 1 ? Math.round(this.cy - img.height / 2) - (this.cy - img.height / 2) : 0;
    ctx.drawImage(img, -img.width / 2 + ox, -img.height / 2 + oy);
    ctx.restore();
  }

  // Corners of the transformed box in document space.
  corners() {
    const hw = (this.img.width * this.sx) / 2, hh = (this.img.height * this.sy) / 2;
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({ x: this.cx + x * c - y * s, y: this.cy + x * s + y * c }));
  }

  toLocal(p) {
    const dx = p.x - this.cx, dy = p.y - this.cy, c = Math.cos(-this.rot), s = Math.sin(-this.rot);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  }

  commit(label) {
    const doc = app.doc;
    doc.preview = null;
    if (!this.changed) { app.redraw(); return; }
    const pts = this.corners();
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    const b = this.bounds;
    const x0 = Math.min(b.x, ...xs) - 2, y0 = Math.min(b.y, ...ys) - 2;
    const x1 = Math.max(b.x + b.w, ...xs) + 2, y1 = Math.max(b.y + b.h, ...ys) + 2;
    const edit = beginPixelEdit(app, this.layer, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, label);
    this.cutOut(this.layer.ctx);
    this.draw(this.layer.ctx);
    edit.commit();
    if (this.lifted) {
      const mask = this.maskImg;
      app.selection.combine((ctx) => this.draw(ctx, mask), 'replace');
    }
  }

  cancel() {
    app.doc.preview = null;
    app.redraw();
  }
}

function contentBounds(canvas) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3]) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// ---- Move tool ------------------------------------------------------------------------------------
export const moveTool = {
  id: 'move', name: 'Move', icon: 'ph-arrows-out-cardinal', key: 'V',
  options: [],
  hint: 'Drag to move the layer, or the selection’s pixels. Arrow keys nudge by 1px (Shift: 10px).',
  down(p) {
    const layer = app.doc.active;
    if (!layer.visible) { app.toast('The active layer is hidden.'); return false; }
    this.float = new Floater(layer);
    this.start = p;
    this.origin = { x: this.float.cx, y: this.float.cy };
    return true;
  },
  move(p, e) {
    if (!this.float) return;
    let dx = p.x - this.start.x, dy = p.y - this.start.y;
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    this.float.cx = this.origin.x + Math.round(dx);
    this.float.cy = this.origin.y + Math.round(dy);
    app.redraw();
  },
  up() {
    if (!this.float) return;
    this.float.commit('Move');
    this.float = null;
  },
  cancel() { this.float?.cancel(); this.float = null; },
  onKey(e) {
    const step = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d || this.float) return false;
    const f = new Floater(app.doc.active);
    f.cx += d[0];
    f.cy += d[1];
    f.commit('Nudge');
    return true;
  },
};

// ---- Free transform ------------------------------------------------------------------------------
// Not on the toolbar: entered from Edit ▸ Free Transform (or Ctrl/Cmd+T, Ctrl+Alt+T).
const HANDLES = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

export const transformTool = {
  id: 'transform', name: 'Free Transform', icon: 'ph-bounding-box', hidden: true,
  options: [
    { id: 'smooth', label: 'Smooth (bilinear)', type: 'checkbox', value: true },
  ],
  hint: 'Drag inside to move, corners/edges to scale (Shift: free aspect, Alt: from centre), outside to rotate (Shift: 15°). Enter applies, Esc cancels.',
  previousTool: 'move',
  begin(prev) {
    this.previousTool = prev || 'move';
    this.float = new Floater(app.doc.active);
    emit('tool');
  },
  activate() { if (!this.float) this.float = new Floater(app.doc.active); },
  deactivate() { if (this.float) this.apply(false); },
  apply(switchBack = true) {
    const f = this.float;
    this.float = null;
    f?.commit('Free Transform');
    if (switchBack) app.setTool(this.previousTool);
  },
  cancelTransform() {
    const f = this.float;
    this.float = null;
    f?.cancel();
    app.setTool(this.previousTool);
  },
  onKey(e) {
    if (e.key === 'Enter') { this.apply(); return true; }
    if (e.key === 'Escape') { this.cancelTransform(); return true; }
    return false;
  },
  hit(p) {
    const f = this.float, view = app.view;
    const tol = 7 / view.zoom;
    const hw = (f.img.width * f.sx) / 2, hh = (f.img.height * f.sy) / 2;
    const l = f.toLocal(p);
    for (const [ux, uy] of HANDLES) {
      if (Math.abs(l.x - ux * hw) < tol && Math.abs(l.y - uy * hh) < tol) return { type: 'scale', ux, uy };
    }
    if (Math.abs(l.x) <= Math.abs(hw) && Math.abs(l.y) <= Math.abs(hh)) return { type: 'move' };
    return { type: 'rotate' };
  },
  down(p, e) {
    const f = this.float;
    if (!f) return false;
    if (e.detail >= 2 && this.hit(p).type === 'move') { this.apply(); return false; }
    this.drag = { ...this.hit(p), start: p, cx: f.cx, cy: f.cy, sx: f.sx, sy: f.sy, rot: f.rot, a0: Math.atan2(p.y - f.cy, p.x - f.cx) };
    return true;
  },
  hover(p) {
    if (!this.float) return;
    const h = this.hit(p);
    app.view.canvas.style.cursor = h.type === 'move' ? 'move' : h.type === 'rotate' ? 'alias' : 'nwse-resize';
  },
  move(p, e) {
    const f = this.float, d = this.drag;
    if (!f || !d) return;
    if (d.type === 'move') {
      f.cx = d.cx + (p.x - d.start.x);
      f.cy = d.cy + (p.y - d.start.y);
    } else if (d.type === 'rotate') {
      let r = d.rot + Math.atan2(p.y - d.cy, p.x - d.cx) - d.a0;
      if (e.shiftKey) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12);
      f.rot = r;
    } else {
      const { ux, uy } = d;
      const W = f.img.width, H = f.img.height;
      const hw0 = (W * d.sx) / 2, hh0 = (H * d.sy) / 2;
      // Work in the box's local frame as it was when the drag started.
      const c = Math.cos(-d.rot), s = Math.sin(-d.rot);
      const lx = (p.x - d.cx) * c - (p.y - d.cy) * s, ly = (p.x - d.cx) * s + (p.y - d.cy) * c;
      const fromCenter = e.altKey;
      const ax = fromCenter ? 0 : -ux * hw0, ay = fromCenter ? 0 : -uy * hh0;
      let nhw = hw0, nhh = hh0;
      if (ux) nhw = fromCenter ? lx * ux : ((lx - ax) * ux) / 2;
      if (uy) nhh = fromCenter ? ly * uy : ((ly - ay) * uy) / 2;
      if (ux && uy && !e.shiftKey) {
        // Corners keep the aspect ratio unless Shift is held.
        const k = ((nhw / hw0) + (nhh / hh0)) / 2;
        nhw = hw0 * k;
        nhh = hh0 * k;
      }
      f.sx = (2 * nhw) / W;
      f.sy = (2 * nhh) / H;
      if (Math.abs(f.sx) < 0.01) f.sx = 0.01 * Math.sign(f.sx || 1);
      if (Math.abs(f.sy) < 0.01) f.sy = 0.01 * Math.sign(f.sy || 1);
      if (!fromCenter) {
        // Keep the opposite handle fixed: move the centre by half the change, in world space.
        const mx = ux ? ax + ux * nhw : 0, my = uy ? ay + uy * nhh : 0;
        const cr = Math.cos(d.rot), sr = Math.sin(d.rot);
        f.cx = d.cx + mx * cr - my * sr;
        f.cy = d.cy + mx * sr + my * cr;
      }
    }
    emit('tool');
    app.redraw();
  },
  up() { this.drag = null; },
  overlay(ctx, view) {
    const f = this.float;
    if (!f) return;
    const pts = f.corners().map((q) => view.toScreen(q.x, q.y));
    ctx.strokeStyle = '#a7bd6c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.stroke();
    const hw = (f.img.width * f.sx) / 2, hh = (f.img.height * f.sy) / 2;
    const c = Math.cos(f.rot), s = Math.sin(f.rot);
    for (const [ux, uy] of HANDLES) {
      const q = view.toScreen(f.cx + ux * hw * c - uy * hh * s, f.cy + ux * hw * s + uy * hh * c);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#1a1612';
      ctx.fillRect(q.x - 4, q.y - 4, 8, 8);
      ctx.strokeRect(q.x - 4.5, q.y - 4.5, 9, 9);
    }
  },
  readout() {
    const f = this.float;
    if (!f) return '';
    return `W ${Math.round(f.sx * 100)}%   H ${Math.round(f.sy * 100)}%   ∠ ${Math.round((f.rot * 180) / Math.PI)}°`;
  },
  flip(axis) {
    if (!this.float) return;
    if (axis === 'h') this.float.sx *= -1; else this.float.sy *= -1;
    app.redraw();
  },
};

// ---- Crop -----------------------------------------------------------------------------------------
export const cropTool = {
  id: 'crop', name: 'Crop', icon: 'ph-crop', key: 'C',
  options: [
    { id: 'ratio', label: 'Ratio', type: 'select', value: 'free', choices: [['free', 'Free'], ['1', '1 : 1'], ['1.3333', '4 : 3'], ['1.5', '3 : 2'], ['1.7778', '16 : 9'], ['0.8', '4 : 5']] },
  ],
  hint: 'Drag a crop box, then drag its edges to adjust. Enter or double-click applies, Esc cancels.',
  rect: null,
  deactivate() { this.rect = null; },
  hit(p) {
    const r = this.rect;
    if (!r) return null;
    const tol = 7 / app.view.zoom;
    const nearX = Math.abs(p.x - r.x) < tol ? -1 : Math.abs(p.x - (r.x + r.w)) < tol ? 1 : 0;
    const nearY = Math.abs(p.y - r.y) < tol ? -1 : Math.abs(p.y - (r.y + r.h)) < tol ? 1 : 0;
    const inside = p.x > r.x - tol && p.x < r.x + r.w + tol && p.y > r.y - tol && p.y < r.y + r.h + tol;
    if (inside && (nearX || nearY)) return { type: 'edge', ux: nearX, uy: nearY };
    if (inside) return { type: 'move' };
    return null;
  },
  down(p, e) {
    const h = this.hit(p);
    if (h && h.type === 'move' && e.detail >= 2) { this.apply(); return false; }
    this.drag = h ? { ...h, start: p, rect: { ...this.rect } } : { type: 'new', start: p };
    if (!h) this.rect = { x: p.x, y: p.y, w: 0, h: 0 };
    return true;
  },
  move(p, e) {
    const d = this.drag;
    if (!d) return;
    const ratio = Number(opt(cropTool, 'ratio')) || (e.shiftKey ? 1 : 0);
    if (d.type === 'new') {
      let end = p;
      if (ratio) {
        const dx = p.x - d.start.x, dy = p.y - d.start.y;
        const w = Math.max(Math.abs(dx), Math.abs(dy) * ratio);
        end = { x: d.start.x + Math.sign(dx || 1) * w, y: d.start.y + Math.sign(dy || 1) * (w / ratio) };
      } else if (e.shiftKey) end = constrainSquare(d.start, p);
      this.rect = rectFrom(d.start, end);
    } else if (d.type === 'move') {
      this.rect = { ...d.rect, x: d.rect.x + p.x - d.start.x, y: d.rect.y + p.y - d.start.y };
    } else {
      const r = { ...d.rect };
      if (d.ux < 0) { r.w = r.x + r.w - p.x; r.x = p.x; }
      if (d.ux > 0) r.w = p.x - r.x;
      if (d.uy < 0) { r.h = r.y + r.h - p.y; r.y = p.y; }
      if (d.uy > 0) r.h = p.y - r.y;
      if (r.w < 0) { r.x += r.w; r.w = -r.w; }
      if (r.h < 0) { r.y += r.h; r.h = -r.h; }
      this.rect = r;
    }
    app.view.requestRender();
  },
  up() {
    this.drag = null;
    if (this.rect && (this.rect.w < 2 || this.rect.h < 2)) this.rect = null;
    app.view.requestRender();
  },
  hover(p) {
    const h = this.hit(p);
    app.view.canvas.style.cursor = !h ? 'crosshair' : h.type === 'move' ? 'move' : 'nwse-resize';
  },
  onKey(e) {
    if (!this.rect) return false;
    if (e.key === 'Enter') { this.apply(); return true; }
    if (e.key === 'Escape') { this.rect = null; app.view.requestRender(); return true; }
    return false;
  },
  apply() {
    const r = this.rect;
    this.rect = null;
    if (!r) return;
    const x = Math.round(r.x), y = Math.round(r.y), w = Math.max(1, Math.round(r.w)), h = Math.max(1, Math.round(r.h));
    cropDocument(x, y, w, h);
  },
  overlay(ctx, view) {
    const r = this.rect;
    if (!r) return;
    const a = view.toScreen(r.x, r.y), w = r.w * view.zoom, h = r.h * view.zoom;
    ctx.save();
    ctx.fillStyle = 'rgba(10,8,6,0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, view.cssW, view.cssH);
    ctx.rect(a.x, a.y, w, h);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(a.x + 0.5, a.y + 0.5, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      ctx.moveTo(a.x + (w * i) / 3, a.y); ctx.lineTo(a.x + (w * i) / 3, a.y + h);
      ctx.moveTo(a.x, a.y + (h * i) / 3); ctx.lineTo(a.x + w, a.y + (h * i) / 3);
    }
    ctx.stroke();
    ctx.fillStyle = '#fff';
    for (const [ux, uy] of HANDLES) ctx.fillRect(a.x + ((ux + 1) / 2) * w - 4, a.y + ((uy + 1) / 2) * h - 4, 8, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(a.x, a.y - 22, 86, 18);
    ctx.fillStyle = '#fff';
    ctx.font = '11px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`${Math.round(r.w)} × ${Math.round(r.h)}`, a.x + 6, a.y - 9);
    ctx.restore();
  },
};

export function cropDocument(x, y, w, h) {
  structural(app, 'Crop', () => {
    app.doc.transformAll(w, h, (old, ctx) => ctx.drawImage(old, -x, -y));
    app.selection.resize(w, h);
  });
  app.view.fit();
}

export const transformTools = [moveTool, transformTool, cropTool];
export { Floater, cloneCanvas };
