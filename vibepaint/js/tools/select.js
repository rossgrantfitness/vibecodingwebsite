import { app } from '../core/app.js';
import { floodMask } from '../core/pixels.js';
import { opt, selectionMode, constrainSquare, rectFrom, dashedPath } from './common.js';

const modeOpt = { id: 'mode', label: 'Mode', type: 'seg', value: 'replace', choices: [['replace', 'New'], ['add', 'Add'], ['subtract', 'Subtract'], ['intersect', 'Intersect']] };
const featherOpt = { id: 'feather', label: 'Feather', type: 'number', min: 0, max: 250, step: 1, value: 0, unit: 'px' };

// Rectangle and ellipse marquees. Shift/Alt at the start of a drag pick add/subtract; holding Shift
// during the drag (when it didn't pick the mode) makes a square or circle; Alt draws from the centre.
function marquee(id, name, icon, key, ellipse) {
  const tool = {
    id, name, icon, key,
    options: [modeOpt, featherOpt],
    down(p, e) {
      this.start = p;
      this.end = p;
      this.mode = selectionMode(e, opt(tool, 'mode'));
      this.modKeyUsed = e.shiftKey || e.altKey;
      return true;
    },
    move(p, e) {
      if (!this.start) return;
      let end = p;
      if (e.shiftKey && !this.modKeyUsed) end = constrainSquare(this.start, end);
      this.fromCenter = e.altKey && !this.modKeyUsed;
      this.end = end;
      app.view.requestRender();
    },
    rect() {
      const { start, end } = this;
      if (this.fromCenter) {
        const dx = end.x - start.x, dy = end.y - start.y;
        return rectFrom({ x: start.x - dx, y: start.y - dy }, end);
      }
      return rectFrom(start, end);
    },
    up() {
      if (!this.start) return;
      const r = this.rect();
      this.start = null;
      if (r.w < 1 && r.h < 1) {
        if (this.mode === 'replace') app.selection.clear();
        return;
      }
      app.selection.combine((ctx) => {
        ctx.beginPath();
        if (ellipse) ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
        else ctx.rect(Math.round(r.x), Math.round(r.y), Math.round(r.x + r.w) - Math.round(r.x), Math.round(r.y + r.h) - Math.round(r.y));
        ctx.fill();
      }, this.mode, opt(tool, 'feather'));
    },
    cancel() { this.start = null; app.view.requestRender(); },
    overlay(ctx, view) {
      if (!this.start) return;
      const r = this.rect();
      const a = view.toScreen(r.x, r.y);
      const w = r.w * view.zoom, h = r.h * view.zoom;
      dashedPath(ctx, (c) => {
        if (ellipse) c.ellipse(a.x + w / 2, a.y + h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
        else c.rect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(w), Math.round(h));
      });
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.font = '11px "Plus Jakarta Sans", sans-serif';
      const label = `${Math.round(r.w)} × ${Math.round(r.h)}`;
      ctx.fillRect(a.x + w + 6, a.y + h + 6, ctx.measureText(label).width + 10, 18);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, a.x + w + 11, a.y + h + 19);
    },
  };
  return tool;
}

export const marqueeRect = marquee('marquee', 'Rectangular Marquee', 'ph-selection', 'M', false);
export const marqueeEllipse = marquee('ellipse-select', 'Elliptical Marquee', 'ph-circle-dashed', 'Shift+M', true);

// Freehand lasso.
export const lassoTool = {
  id: 'lasso', name: 'Lasso', icon: 'ph-lasso', key: 'L',
  options: [modeOpt, featherOpt],
  down(p, e) {
    this.points = [p];
    this.mode = selectionMode(e, opt(lassoTool, 'mode'));
    return true;
  },
  move(p) {
    if (!this.points) return;
    const last = this.points[this.points.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) * app.view.zoom > 1.5) this.points.push(p);
    app.view.requestRender();
  },
  up() {
    const pts = this.points;
    this.points = null;
    if (!pts || pts.length < 3) { if (this.mode === 'replace') app.selection.clear(); return; }
    commitPolygon(pts, this.mode, opt(lassoTool, 'feather'));
  },
  cancel() { this.points = null; app.view.requestRender(); },
  overlay(ctx, view) { if (this.points) drawPolyline(ctx, view, this.points, true); },
};

// Polygonal lasso: click to add points; double-click, Enter or clicking the first point closes it.
export const polyLassoTool = {
  id: 'poly-lasso', name: 'Polygonal Lasso', icon: 'ph-polygon', key: 'Shift+L', animated: true,
  options: [modeOpt, featherOpt],
  down(p, e) {
    if (!this.points) {
      this.points = [p];
      this.mode = selectionMode(e, opt(polyLassoTool, 'mode'));
      return false;
    }
    const first = this.points[0];
    const closeDist = 8 / app.view.zoom;
    if ((e.detail >= 2 || Math.hypot(p.x - first.x, p.y - first.y) < closeDist) && this.points.length >= 3) {
      this.finish();
      return false;
    }
    this.points.push(p);
    return false;
  },
  hover(p) { this.cursor = p; },
  onKey(e) {
    if (!this.points) return false;
    if (e.key === 'Enter') { this.finish(); return true; }
    if (e.key === 'Escape') { this.cancel(); return true; }
    if (e.key === 'Backspace') { this.points.pop(); if (!this.points.length) this.points = null; app.view.requestRender(); return true; }
    return false;
  },
  finish() {
    const pts = this.points;
    this.points = null;
    if (pts && pts.length >= 3) commitPolygon(pts, this.mode, opt(polyLassoTool, 'feather'));
  },
  cancel() { this.points = null; app.view.requestRender(); },
  deactivate() { this.cancel(); },
  overlay(ctx, view) {
    if (!this.points) return;
    const pts = this.cursor ? [...this.points, this.cursor] : this.points;
    drawPolyline(ctx, view, pts, false);
  },
};

function commitPolygon(pts, mode, feather) {
  app.selection.combine((ctx) => {
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.fill();
  }, mode, feather);
}

function drawPolyline(ctx, view, pts, close) {
  dashedPath(ctx, (c) => {
    pts.forEach((q, i) => {
      const s = view.toScreen(q.x, q.y);
      if (i) c.lineTo(s.x, s.y); else c.moveTo(s.x, s.y);
    });
    if (close) c.closePath();
  });
}

// Magic wand: select similar colours, contiguous or across the whole layer.
export const wandTool = {
  id: 'wand', name: 'Magic Wand', icon: 'ph-magic-wand', key: 'W',
  options: [
    modeOpt,
    { id: 'tolerance', label: 'Tolerance', type: 'range', min: 0, max: 255, step: 1, value: 32 },
    { id: 'contiguous', label: 'Contiguous', type: 'checkbox', value: true },
    { id: 'merged', label: 'Sample all layers', type: 'checkbox', value: false },
    featherOpt,
  ],
  down(p, e) {
    const doc = app.doc;
    const x = Math.floor(p.x), y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return false;
    const src = opt(wandTool, 'merged') ? doc.render() : doc.active.canvas;
    const img = src.getContext('2d').getImageData(0, 0, doc.width, doc.height);
    const mask = floodMask(img, x, y, opt(wandTool, 'tolerance'), opt(wandTool, 'contiguous'));
    app.selection.combineData(mask, selectionMode(e, opt(wandTool, 'mode')), opt(wandTool, 'feather'));
    return false;
  },
};

export const selectTools = [marqueeRect, marqueeEllipse, lassoTool, polyLassoTool, wandTool];
