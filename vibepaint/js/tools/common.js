import { app } from '../core/app.js';

// Shared helpers for tools.

export const opt = (tool, key) => app.opt(tool.id, key);

// Read a colour from the document (merged) or the active layer, averaging a size×size square.
export function sampleColor(x, y, { merged = true, size = 1 } = {}) {
  const doc = app.doc;
  const src = merged ? doc.render() : doc.active.canvas;
  const h = Math.floor(size / 2);
  const x0 = Math.max(0, Math.floor(x) - h), y0 = Math.max(0, Math.floor(y) - h);
  const x1 = Math.min(doc.width, Math.floor(x) + h + 1), y1 = Math.min(doc.height, Math.floor(y) + h + 1);
  if (x1 <= x0 || y1 <= y0) return null;
  const d = src.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
  let r = 0, g = 0, b = 0, a = 0;
  for (let i = 0; i < d.length; i += 4) {
    const w = d[i + 3];
    r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; a += w;
  }
  if (!a) return null;
  return { r: r / a, g: g / a, b: b / a, a: 1 };
}

// Selection mode from modifier keys, falling back to the tool's option.
export function selectionMode(e, fallback = 'replace') {
  if (e.shiftKey && e.altKey) return 'intersect';
  if (e.shiftKey) return 'add';
  if (e.altKey) return 'subtract';
  return fallback;
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Constrain a drag from a→b to a square (or circle) when shift is held.
export function constrainSquare(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const s = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: a.x + Math.sign(dx || 1) * s, y: a.y + Math.sign(dy || 1) * s };
}

// Snap a line from a→b to 45° steps.
export function constrainAngle(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.hypot(dx, dy);
  return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
}

export function rectFrom(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

// Dashed screen-space outline helper for tool overlays.
export function dashedPath(ctx, build) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#000';
  ctx.beginPath();
  build(ctx);
  ctx.stroke();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.restore();
}
