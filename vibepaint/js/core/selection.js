import { makeCanvas } from './document.js';
import { emit } from './events.js';

// The selection is an alpha mask the size of the document (white = selected, soft edges allowed).
// Every painting tool, fill and filter clips to it. `edges` is a Path2D of the mask boundary in
// document pixels, used to draw the marching ants.
export class Selection {
  constructor(w, h) {
    this.resize(w, h);
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.mask = makeCanvas(w, h);
    this.ctx = this.mask.getContext('2d', { willReadFrequently: true });
    this.active = false;
    this.bounds = null;
    this.edges = null;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.active = false;
    this.bounds = null;
    this.edges = null;
    emit('selection');
  }

  selectAll() {
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(0, 0, this.w, this.h);
    this.update({ x: 0, y: 0, w: this.w, h: this.h });
  }

  // Combine a shape into the mask. `draw(ctx)` must fill the shape in white.
  // mode: 'replace' | 'add' | 'subtract' | 'intersect'
  combine(draw, mode = 'replace', feather = 0) {
    let src = makeCanvas(this.w, this.h);
    const s = src.getContext('2d');
    s.fillStyle = '#fff';
    draw(s);
    if (feather > 0) src = blurred(src, feather);
    const c = this.ctx;
    c.save();
    if (mode === 'replace' || !this.active) c.clearRect(0, 0, this.w, this.h);
    c.globalCompositeOperation = mode === 'subtract' ? 'destination-out' : mode === 'intersect' && this.active ? 'destination-in' : 'source-over';
    c.drawImage(src, 0, 0);
    c.restore();
    this.update();
  }

  // Set from a Uint8Array of per-pixel coverage (0–255), e.g. from the magic wand.
  combineData(alpha, mode = 'replace', feather = 0) {
    this.combine((ctx) => {
      const img = ctx.createImageData(this.w, this.h);
      for (let i = 0, j = 3; i < alpha.length; i++, j += 4) {
        img.data[j - 3] = img.data[j - 2] = img.data[j - 1] = 255;
        img.data[j] = alpha[i];
      }
      ctx.putImageData(img, 0, 0);
    }, mode, feather);
  }

  invert() {
    const c = this.ctx;
    const tmp = makeCanvas(this.w, this.h);
    const t = tmp.getContext('2d');
    t.fillStyle = '#fff';
    t.fillRect(0, 0, this.w, this.h);
    t.globalCompositeOperation = 'destination-out';
    t.drawImage(this.mask, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    c.drawImage(tmp, 0, 0);
    this.update();
  }

  feather(radius) {
    if (!this.active || radius <= 0) return;
    const b = blurred(this.mask, radius);
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.ctx.drawImage(b, 0, 0);
    this.update();
  }

  // Grow (positive) or shrink (negative) by `px` using a square max/min filter on the mask.
  modify(px) {
    if (!this.active || !px) return;
    const img = this.ctx.getImageData(0, 0, this.w, this.h);
    const a = new Uint8Array(this.w * this.h);
    for (let i = 0; i < a.length; i++) a[i] = img.data[i * 4 + 3];
    const r = Math.abs(Math.round(px));
    const grow = px > 0;
    const pass = (src, horizontal) => {
      const out = new Uint8Array(src.length);
      const W = this.w, H = this.h;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let v = grow ? 0 : 255;
          for (let k = -r; k <= r; k++) {
            const xx = horizontal ? x + k : x, yy = horizontal ? y : y + k;
            const s = xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : src[yy * W + xx];
            v = grow ? Math.max(v, s) : Math.min(v, s);
          }
          out[y * W + x] = v;
        }
      }
      return out;
    };
    this.combineData(pass(pass(a, true), false), 'replace');
  }

  contains(x, y) {
    if (!this.active) return true;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.ctx.getImageData(x | 0, y | 0, 1, 1).data[3] > 127;
  }

  // Clip a document-sized canvas to the selection (no-op when nothing is selected).
  clip(canvas) {
    if (!this.active) return;
    const c = canvas.getContext('2d');
    c.save();
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(this.mask, 0, 0);
    c.restore();
  }

  // Mask coverage (0–255) for a rectangle, or null when nothing is selected.
  alphaFor(r) {
    if (!this.active) return null;
    const d = this.ctx.getImageData(r.x, r.y, r.w, r.h).data;
    const a = new Uint8Array(r.w * r.h);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    return a;
  }

  // Shift the whole mask (used when moving selected pixels).
  translate(dx, dy) {
    if (!this.active) return;
    const tmp = makeCanvas(this.w, this.h);
    tmp.getContext('2d').drawImage(this.mask, 0, 0);
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.ctx.drawImage(tmp, Math.round(dx), Math.round(dy));
    this.update();
  }

  snapshot() {
    return { active: this.active, mask: this.active ? this.ctx.getImageData(0, 0, this.w, this.h) : null };
  }

  restoreSnapshot(s) {
    this.ctx.clearRect(0, 0, this.w, this.h);
    if (s.active && s.mask && s.mask.width === this.w && s.mask.height === this.h) {
      this.ctx.putImageData(s.mask, 0, 0);
      this.update();
    } else {
      this.clear();
    }
  }

  // Recompute bounds and the marching-ants outline from the mask.
  update() {
    const { w, h } = this;
    const d = this.ctx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 127;
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        if (d[row + x * 4 + 3] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) { this.clear(); return; }
    this.active = true;
    this.bounds = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    // Boundary segments between selected and unselected pixels, merged into runs.
    const p = new Path2D();
    for (let y = minY; y <= maxY + 1; y++) {
      let start = -1;
      for (let x = minX; x <= maxX + 1; x++) {
        const edge = on(x, y) !== on(x, y - 1);
        if (edge && start < 0) start = x;
        if (!edge && start >= 0) { p.moveTo(start, y); p.lineTo(x, y); start = -1; }
      }
    }
    for (let x = minX; x <= maxX + 1; x++) {
      let start = -1;
      for (let y = minY; y <= maxY + 1; y++) {
        const edge = on(x, y) !== on(x - 1, y);
        if (edge && start < 0) start = y;
        if (!edge && start >= 0) { p.moveTo(x, start); p.lineTo(x, y); start = -1; }
      }
    }
    this.edges = p;
    emit('selection');
  }
}

// Canvas blur via the 2D filter API, with a manual fallback for browsers without ctx.filter.
export function blurred(src, radius) {
  const out = makeCanvas(src.width, src.height);
  const o = out.getContext('2d');
  if ('filter' in o) {
    o.filter = `blur(${radius / 2}px)`;
    o.drawImage(src, 0, 0);
    o.filter = 'none';
  } else {
    o.drawImage(src, 0, 0);
  }
  return out;
}
