import { VIEW_W, VIEW_H } from './config.js';
import { drawText } from './font.js';
import { mulberry32 } from './rand.js';

// The city behind the rooftops: a teal haze of far towers, a midtown of neon signs, and dark near
// blocks. Each layer is drawn once to a canvas that tiles horizontally; signs flicker at runtime.

const SIGN_COLORS = ['#ff5fae', '#ff9a4a', '#5ff0e0', '#ffd96a', '#c77dff'];
const WORDS = ['RAMEN', 'TECH', 'HOTEL', '24H', 'BAR', 'NOODLE', 'CHEESE', 'ARCADE', 'SUSHI', 'OPEN'];

export class Backdrop {
  constructor() {
    this.far = farLayer(640, 150, 0x5eed);
    this.mid = midLayer(576, 132, 0xc0ffee);
    this.near = nearLayer(512, 96, 0x7a3);
  }

  draw(ctx, cx, cy, frame) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#162430');
    g.addColorStop(0.55, '#2a4250');
    g.addColorStop(1, '#3b3c5a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.layer(ctx, this.far, cx * 0.08, cy * 0.04, -6, frame);
    haze(ctx, 70, 'rgba(95, 108, 123, 0.18)');
    this.layer(ctx, this.mid, cx * 0.2, cy * 0.1, 0, frame);
    haze(ctx, 110, 'rgba(60, 50, 90, 0.22)');
    this.layer(ctx, this.near, cx * 0.4, cy * 0.18, 10, frame);
  }

  layer(ctx, L, ox, oy, lift, frame) {
    const w = L.canvas.width;
    const x0 = -Math.round(ox) % w;
    const y = VIEW_H - L.canvas.height + 12 - lift - Math.round(oy);
    for (let x = x0 - (x0 > 0 ? w : 0); x < VIEW_W; x += w) {
      ctx.drawImage(L.canvas, x, y);
      // A few signs stutter off now and then, like real neon.
      for (const s of L.signs) {
        const t = (frame + s.phase) % s.period;
        if (t < 4 || (t > 7 && t < 10)) {
          ctx.fillStyle = 'rgba(12, 10, 24, 0.72)';
          ctx.fillRect(x + s.x, y + s.y, s.w, s.h);
        }
      }
    }
  }
}

function haze(ctx, top, color) {
  const g = ctx.createLinearGradient(0, top, 0, VIEW_H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, top, VIEW_W, VIEW_H - top);
}

function makeLayer(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, g: canvas.getContext('2d'), signs: [] };
}

// Far: tall slab towers in teal, dense window grids, the odd red aircraft light.
function farLayer(w, h, seed) {
  const L = makeLayer(w, h);
  const { g } = L;
  const rand = mulberry32(seed);
  let x = 0;
  while (x < w) {
    const bw = 18 + Math.floor(rand() * 30);
    const bh = Math.floor(h * (0.45 + rand() * 0.55));
    const top = h - bh;
    const tone = ['#2c4652', '#31505c', '#365866'][Math.floor(rand() * 3)];
    g.fillStyle = tone;
    g.fillRect(x, top, bw, bh);
    g.fillStyle = '#3f6573';
    g.fillRect(x, top, 1, bh); // lit edge
    if (rand() < 0.5) { // stepped crown
      const sw = Math.floor(bw * 0.5);
      g.fillStyle = tone;
      g.fillRect(x + ((bw - sw) >> 1), top - 6, sw, 6);
    }
    if (rand() < 0.35) {
      g.fillStyle = '#20333d';
      g.fillRect(x + (bw >> 1), top - 14, 1, 14);
      g.fillStyle = '#ff5a5a';
      g.fillRect(x + (bw >> 1), top - 15, 1, 1);
    }
    for (let wy = top + 3; wy < h - 2; wy += 3) {
      for (let wx = x + 2; wx < x + bw - 2; wx += 2) {
        const r = rand();
        if (r < 0.05) g.fillStyle = '#9fd7dc';
        else if (r < 0.08) g.fillStyle = '#e8c9a0';
        else if (r < 0.35) g.fillStyle = '#284049';
        else continue;
        g.fillRect(wx, wy, 1, 1);
      }
    }
    x += bw + Math.floor(rand() * 3);
  }
  return L;
}

// Mid: darker blocks, warm and cool window rows, and the neon: vertical blade signs with
// glyph-like strokes, and boxed word signs.
function midLayer(w, h, seed) {
  const L = makeLayer(w, h);
  const { g } = L;
  const rand = mulberry32(seed);
  let x = 0;
  let word = 0;
  while (x < w) {
    const bw = 26 + Math.floor(rand() * 36);
    const bh = Math.floor(h * (0.4 + rand() * 0.5));
    const top = h - bh;
    g.fillStyle = rand() < 0.5 ? '#282743' : '#2f2f4c';
    g.fillRect(x, top, bw, bh);
    g.fillStyle = '#3d3f5e';
    g.fillRect(x, top, bw, 1);
    g.fillStyle = '#1f1d37';
    g.fillRect(x + bw - 2, top, 2, bh);
    for (let wy = top + 4; wy < h - 3; wy += 5) {
      const lit = rand();
      for (let wx = x + 3; wx < x + bw - 4; wx += 4) {
        if (rand() > (lit < 0.3 ? 0.7 : 0.25)) continue;
        g.fillStyle = rand() < 0.6 ? '#ddb6b0' : '#75b3be';
        g.fillRect(wx, wy, 2, 2);
      }
    }
    // Vertical blade sign hanging off the building's edge.
    if (rand() < 0.7 && bh > 50) {
      const color = SIGN_COLORS[Math.floor(rand() * SIGN_COLORS.length)];
      const sx = x + (rand() < 0.5 ? 1 : bw - 9);
      const sy = top + 6 + Math.floor(rand() * 10);
      const sh = 22 + Math.floor(rand() * 20);
      bladeSign(g, sx, sy, 8, sh, color, rand);
      L.signs.push({ x: sx, y: sy, w: 8, h: sh, phase: Math.floor(rand() * 600), period: 300 + Math.floor(rand() * 500) });
    }
    // Boxed word sign across the facade.
    if (rand() < 0.55 && bw > 30) {
      const text = WORDS[word++ % WORDS.length];
      const tw = text.length * 4 + 5;
      if (tw < bw - 4) {
        const color = SIGN_COLORS[Math.floor(rand() * SIGN_COLORS.length)];
        const sx = x + Math.floor((bw - tw) / 2);
        const sy = top + 14 + Math.floor(rand() * Math.max(1, bh - 40));
        g.fillStyle = '#120f1e';
        g.fillRect(sx, sy, tw, 11);
        g.globalAlpha = 0.35;
        g.fillStyle = color;
        g.fillRect(sx - 1, sy - 1, tw + 2, 13);
        g.globalAlpha = 1;
        g.fillStyle = '#120f1e';
        g.fillRect(sx, sy, tw, 11);
        g.strokeStyle = color;
        g.strokeRect(sx + 0.5, sy + 0.5, tw - 1, 10);
        drawText(g, text, sx + 3, sy + 3, { color, shadow: null });
        L.signs.push({ x: sx - 1, y: sy - 1, w: tw + 2, h: 13, phase: Math.floor(rand() * 900), period: 400 + Math.floor(rand() * 700) });
      }
    }
    // Rooftop clutter: water tank or antenna.
    const r = rand();
    if (r < 0.3) {
      g.fillStyle = '#23223b';
      g.fillRect(x + 4, top - 8, 9, 6);
      g.fillRect(x + 5, top - 2, 1, 2);
      g.fillRect(x + 11, top - 2, 1, 2);
      g.fillStyle = '#34345a';
      g.fillRect(x + 4, top - 8, 9, 1);
    } else if (r < 0.55) {
      g.fillStyle = '#23223b';
      g.fillRect(x + bw - 6, top - 18, 1, 18);
      g.fillRect(x + bw - 8, top - 12, 5, 1);
    }
    x += bw + 2 + Math.floor(rand() * 6);
  }
  return L;
}

function bladeSign(g, x, y, w, h, color, rand) {
  g.globalAlpha = 0.3;
  g.fillStyle = color;
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.globalAlpha = 1;
  g.fillStyle = '#120f1e';
  g.fillRect(x, y, w, h);
  g.fillStyle = color;
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x, y, 1, h);
  g.fillRect(x + w - 1, y, 1, h);
  // Stacked glyphs: little 4×4 stroke patterns, one per cell.
  for (let gy = y + 2; gy + 4 < y + h - 1; gy += 6) {
    const bits = Math.floor(rand() * 0xffff) | 0x0f00;
    for (let i = 0; i < 16; i++) if (bits & (1 << i)) g.fillRect(x + 2 + (i % 4), gy + (i >> 2), 1, 1);
  }
}

// Near: dark silhouettes with sparse teal windows and fire-escape ladders.
function nearLayer(w, h, seed) {
  const L = makeLayer(w, h);
  const { g } = L;
  const rand = mulberry32(seed);
  let x = 0;
  while (x < w) {
    const bw = 30 + Math.floor(rand() * 40);
    const bh = Math.floor(h * (0.35 + rand() * 0.5));
    const top = h - bh;
    g.fillStyle = '#1a1830';
    g.fillRect(x, top, bw, bh);
    g.fillStyle = '#26243f';
    g.fillRect(x, top, bw, 2);
    for (let wy = top + 6; wy < h - 4; wy += 6) {
      for (let wx = x + 4; wx < x + bw - 4; wx += 5) {
        const r = rand();
        if (r < 0.07) { g.fillStyle = '#75e0e6'; g.fillRect(wx, wy, 1, 1); }
        else if (r < 0.1) { g.fillStyle = '#4b7584'; g.fillRect(wx, wy, 1, 1); }
      }
    }
    if (rand() < 0.4) { // fire escape
      const fx = x + 6 + Math.floor(rand() * (bw - 14));
      g.fillStyle = '#2c2a48';
      for (let fy = top + 8; fy < h; fy += 10) g.fillRect(fx, fy, 8, 1);
      g.fillRect(fx, top + 8, 1, bh - 8);
      g.fillRect(fx + 7, top + 8, 1, bh - 8);
    }
    if (rand() < 0.4) {
      g.fillStyle = '#1a1830';
      g.fillRect(x + 6, top - 7, 12, 7);
    }
    x += bw + Math.floor(rand() * 10);
  }
  return L;
}
