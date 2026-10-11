import { emit } from './events.js';

// Owns the on-screen canvas: zoom/pan, coordinate mapping, and drawing the document plus overlays
// (marching ants, tool previews, brush cursor).
export class Viewport {
  constructor(canvas, app) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.app = app;
    this.zoom = 1;
    this.panX = 0; // screen position (CSS px) of the document's top-left corner
    this.panY = 0;
    this.pointer = null; // last pointer position in screen px, for the brush cursor
    this.showGrid = true;
    this.antsOffset = 0;
    this.pending = false;
    this.checker = null;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    const tick = () => {
      // Marching ants keep moving while something is selected.
      if (app.selection?.active || app.tool?.animated) {
        this.antsOffset = (this.antsOffset + 0.4) % 16;
        this.requestRender();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.cssW = Math.max(1, r.width);
    this.cssH = Math.max(1, r.height);
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    if (!this.fitted && this.app.doc) { this.fit(); this.fitted = true; }
    this.requestRender();
  }

  fit() {
    const doc = this.app.doc;
    const pad = 40;
    const z = Math.min((this.cssW - pad * 2) / doc.width, (this.cssH - pad * 2) / doc.height, 4);
    this.zoom = Math.max(0.02, z);
    this.center();
  }

  center() {
    const doc = this.app.doc;
    this.panX = Math.round((this.cssW - doc.width * this.zoom) / 2);
    this.panY = Math.round((this.cssH - doc.height * this.zoom) / 2);
    emit('view');
    this.requestRender();
  }

  setZoom(z, sx = this.cssW / 2, sy = this.cssH / 2) {
    z = Math.min(64, Math.max(0.02, z));
    const d = this.toDoc(sx, sy);
    this.zoom = z;
    this.panX = sx - d.x * z;
    this.panY = sy - d.y * z;
    emit('view');
    this.requestRender();
  }

  // Step through friendly zoom levels.
  zoomStep(dir, sx, sy) {
    const levels = [0.05, 0.0833, 0.125, 0.1667, 0.25, 0.333, 0.5, 0.667, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];
    const z = this.zoom;
    const next = dir > 0 ? levels.find((l) => l > z * 1.001) : [...levels].reverse().find((l) => l < z * 0.999);
    this.setZoom(next ?? z, sx, sy);
  }

  pan(dx, dy) {
    this.panX += dx;
    this.panY += dy;
    emit('view');
    this.requestRender();
  }

  toDoc(sx, sy) { return { x: (sx - this.panX) / this.zoom, y: (sy - this.panY) / this.zoom }; }
  toScreen(x, y) { return { x: x * this.zoom + this.panX, y: y * this.zoom + this.panY }; }

  eventPoint(e) {
    const r = this.canvas.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  }

  requestRender() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => { this.pending = false; this.render(); });
  }

  render() {
    const { ctx, app } = this;
    const doc = app.doc;
    if (!doc) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#1a1612';
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    const w = doc.width * this.zoom, h = doc.height * this.zoom;
    const x = Math.round(this.panX), y = Math.round(this.panY);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    // Transparency checkerboard (fixed 8px squares on screen).
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = this.checkerPattern();
    ctx.translate(x, y);
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    const composite = doc.render();
    ctx.save();
    ctx.imageSmoothingEnabled = this.zoom < 2;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(composite, x, y, w, h);
    ctx.restore();

    if (this.showGrid && this.zoom >= 10) this.drawGrid(x, y);

    // Overlays drawn in document coordinates.
    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);
    const sel = app.selection;
    if (sel.active && sel.edges && !app.tool?.hideAnts) {
      ctx.lineWidth = 1 / this.zoom;
      ctx.strokeStyle = '#fff';
      ctx.setLineDash([]);
      ctx.stroke(sel.edges);
      ctx.strokeStyle = '#000';
      ctx.setLineDash([4 / this.zoom, 4 / this.zoom]);
      ctx.lineDashOffset = -this.antsOffset / this.zoom;
      ctx.stroke(sel.edges);
      ctx.setLineDash([]);
    }
    ctx.restore();

    // Tool overlays in screen coordinates.
    ctx.save();
    app.tool?.overlay?.(ctx, this);
    ctx.restore();
  }

  drawGrid(x, y) {
    const { ctx } = this;
    const doc = this.app.doc;
    const z = this.zoom;
    const x0 = Math.max(0, Math.floor(-x / z)), x1 = Math.min(doc.width, Math.ceil((this.cssW - x) / z));
    const y0 = Math.max(0, Math.floor(-y / z)), y1 = Math.min(doc.height, Math.ceil((this.cssH - y) / z));
    ctx.save();
    ctx.strokeStyle = 'rgba(128,128,128,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = x0; i <= x1; i++) { const sx = Math.round(x + i * z) + 0.5; ctx.moveTo(sx, y + y0 * z); ctx.lineTo(sx, y + y1 * z); }
    for (let j = y0; j <= y1; j++) { const sy = Math.round(y + j * z) + 0.5; ctx.moveTo(x + x0 * z, sy); ctx.lineTo(x + x1 * z, sy); }
    ctx.stroke();
    ctx.restore();
  }

  checkerPattern() {
    if (!this.checker) {
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      const g = c.getContext('2d');
      g.fillStyle = '#c9c0b3';
      g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#9a9288';
      g.fillRect(0, 0, 8, 8);
      g.fillRect(8, 8, 8, 8);
      this.checker = this.ctx.createPattern(c, 'repeat');
    }
    return this.checker;
  }

  // Brush-size circle at the pointer, in screen space.
  drawBrushCursor(ctx, size, square = false) {
    if (!this.pointer) return;
    const r = (size * this.zoom) / 2;
    const { sx, sy } = this.pointer;
    ctx.save();
    ctx.lineWidth = 1;
    if (r < 3) {
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(sx - 6, sy); ctx.lineTo(sx + 6, sy);
      ctx.moveTo(sx, sy - 6); ctx.lineTo(sx, sy + 6);
      ctx.stroke();
    } else {
      for (const [color, off] of [['rgba(0,0,0,0.8)', 0.5], ['rgba(255,255,255,0.9)', -0.5]]) {
        ctx.strokeStyle = color;
        ctx.beginPath();
        if (square) ctx.rect(sx - r + off, sy - r + off, r * 2, r * 2);
        else ctx.arc(sx, sy, Math.max(1, r + off), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
