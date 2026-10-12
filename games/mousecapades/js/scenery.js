import { TILE, VIEW_W, VIEW_H } from './config.js';
import { GROUND, SEMI } from './level.js';
import { mulberry32, hash2 } from './rand.js';

// Painted rooftops. The level's static geometry (ground and awnings) is drawn once into a big
// canvas: weathered purple concrete, rust, vents, cables, wall units and clutter behind the
// player. Things that animate (warning lamps, steam from the alleys) are listed for the renderer.

const C = {
  cap: '#8a76a8', capHi: '#a593c4', top: '#776392', face: '#655185', face2: '#594978', deep: '#4a3d60',
  edge: '#3a2d52', rust: '#975768', rust2: '#583a4c', stain: '#3d2639', crack: '#45375e',
  grate: '#2a1d2e', slat: '#6c5686', metal: '#9d98b4', metal2: '#6f6a8a', metal3: '#4a4566',
  propA: '#43385f', propB: '#504372', propDark: '#2e2647',
};
const CABLES = ['#4fb0b8', '#e0508a', '#e08a40', '#c77dff', '#4fb0b8'];

export function buildScenery(level) {
  const w = level.width, h = level.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const rand = mulberry32(0xbeef);
  const lights = [];
  const vents = [];

  const isG = (c, r) => level.get(c, r) === GROUND && c >= 0 && c < level.cols;
  const surface = (c) => { for (let r = 0; r < level.rows; r++) if (isG(c, r)) return r; return -1; };

  // Alleys between buildings: a deep, dark drop with cables strung across and steam rising.
  for (let c = 0; c < level.cols; c++) {
    if (surface(c) !== -1) continue;
    const c0 = c;
    while (c < level.cols && surface(c) === -1) c++;
    const x0 = c0 * TILE, x1 = c * TILE;
    const top = Math.min(surface(c0 - 1), surface(c)) * TILE;
    const grad = g.createLinearGradient(0, top - 10, 0, h);
    grad.addColorStop(0, 'rgba(20, 14, 30, 0)');
    grad.addColorStop(0.35, 'rgba(20, 14, 30, 0.75)');
    grad.addColorStop(1, 'rgba(8, 5, 12, 0.98)');
    g.fillStyle = grad;
    g.fillRect(x0, top - 10, x1 - x0, h - top + 10);
    for (let i = 0; i < 2; i++) {
      cable(g, x0 - 2, top + 18 + i * 9, x1 + 2, top + 20 + i * 7, 10 + i * 6, CABLES[(c0 + i) % CABLES.length]);
    }
    vents.push({ x0, x1, y: h });
  }

  // Concrete, tile by tile: a noisy texture (written straight into pixels), then lip and edges.
  const img = g.getImageData(0, 0, w, h);
  const px = img.data;
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const tones = [C.face, C.face2, C.deep, C.crack, C.top].map(rgb);
  for (let c = 0; c < level.cols; c++) {
    for (let r = 0; r < level.rows; r++) {
      if (!isG(c, r)) continue;
      const d = r - topOfRun(isG, c, r);
      for (let yy = 0; yy < TILE; yy++) {
        const depth = d * TILE + yy;
        const base = depth < 22 ? 0 : depth < 40 ? 1 : 2;
        for (let xx = 0; xx < TILE; xx++) {
          const X = c * TILE + xx, Y = r * TILE + yy;
          const n = hash2(X, Y, 7);
          const t = tones[n < 0.06 ? 3 : n > 0.97 ? 4 : base];
          const i = (Y * w + X) * 4;
          px[i] = t[0]; px[i + 1] = t[1]; px[i + 2] = t[2]; px[i + 3] = 255;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  for (let c = 0; c < level.cols; c++) {
    for (let r = 0; r < level.rows; r++) {
      if (!isG(c, r)) continue;
      const x = c * TILE, y = r * TILE;
      if (!isG(c, r - 1)) { // parapet cap
        g.fillStyle = C.top;
        g.fillRect(x, y, TILE, 4);
        g.fillStyle = C.cap;
        g.fillRect(x, y, TILE, 2);
        g.fillStyle = C.capHi;
        g.fillRect(x, y, TILE, 1);
        g.fillStyle = C.edge;
        g.fillRect(x, y + 4, TILE, 1);
        // rust drips from the lip
        for (let px = 0; px < TILE; px++) {
          if (hash2(x + px, y, 3) < 0.12) {
            const len = 3 + Math.floor(hash2(x + px, y, 4) * 10);
            g.fillStyle = C.rust2;
            g.fillRect(x + px, y + 5, 1, len);
            g.fillStyle = C.rust;
            g.fillRect(x + px, y + 5, 1, Math.ceil(len / 3));
          }
        }
      }
      if (!isG(c - 1, r)) { g.fillStyle = C.capHi; g.fillRect(x, y, 1, TILE); g.fillStyle = C.edge; g.fillRect(x + 1, y + 2, 1, TILE - 2); }
      if (!isG(c + 1, r)) { g.fillStyle = C.edge; g.fillRect(x + TILE - 2, y, 2, TILE); }
    }
  }

  // Facade details and rooftop clutter, per stretch of flat roof.
  for (const run of flatRuns(level, surface)) {
    const top = run.r * TILE;
    const x0 = run.c0 * TILE, x1 = (run.c1 + 1) * TILE;
    const span = x1 - x0;
    // rust stains
    for (let i = 0; i < span / 40; i++) stain(g, x0 + rand() * span, top + 8 + rand() * 30, 4 + rand() * 7, rand);
    if (span >= 64) {
      // vents and wall units along the facade
      let x = x0 + 10 + Math.floor(rand() * 20);
      while (x < x1 - 30) {
        const k = rand();
        if (k < 0.45) vent(g, x, top + 12 + Math.floor(rand() * 10), 18 + Math.floor(rand() * 8), 10);
        else if (k < 0.7) wallUnit(g, x, top + 14 + Math.floor(rand() * 8));
        x += 34 + Math.floor(rand() * 50);
      }
      // cables sagging across the facade
      const n = 1 + Math.floor(span / 140);
      for (let i = 0; i < n; i++) {
        const a = x0 + 4 + rand() * (span - 40);
        const b = Math.min(x1 - 4, a + 40 + rand() * 90);
        const y = top + 8 + rand() * 14;
        for (let k = 0; k < 2 + Math.floor(rand() * 2); k++) {
          cable(g, a, y + k * 2, b, y + 2 + k * 2 + rand() * 4, 6 + rand() * 10, CABLES[Math.floor(rand() * CABLES.length)]);
        }
      }
      // a pipe run with brackets
      if (rand() < 0.6) {
        const py = top + 34 + Math.floor(rand() * 6);
        const a = x0 + 6, b = x1 - 6;
        g.fillStyle = C.metal3; g.fillRect(a, py, b - a, 3);
        g.fillStyle = C.metal2; g.fillRect(a, py, b - a, 1);
        g.fillStyle = C.edge; for (let bx = a + 8; bx < b; bx += 28) g.fillRect(bx, py - 1, 2, 5);
      }
    }
    // warning lamps on the parapet
    for (let lx = x0 + 12 + Math.floor(rand() * 30); lx < x1 - 8; lx += 70 + Math.floor(rand() * 80)) {
      g.fillStyle = C.edge; g.fillRect(lx - 1, top - 1, 5, 2);
      lights.push({ x: lx, y: top - 3, color: rand() < 0.6 ? '#ffb84a' : '#ff4a5a', phase: Math.floor(rand() * 120) });
    }
    // rooftop clutter standing behind the action
    if (span >= 96 && !run.busy) {
      let x = x0 + 24 + Math.floor(rand() * 30);
      while (x < x1 - 40) {
        if (!clearAbove(level, x, run.r, 36)) { x += 24; continue; }
        const k = rand();
        if (k < 0.3) acUnit(g, x, top);
        else if (k < 0.5) hut(g, x, top, lights, rand);
        else if (k < 0.7) tank(g, x, top);
        else if (k < 0.85) railing(g, x, top, 30 + Math.floor(rand() * 30));
        else antenna(g, x, top, lights);
        x += 60 + Math.floor(rand() * 70);
      }
    }
  }

  // One-way awnings: a steel catwalk with a neon underside.
  for (let r = 0; r < level.rows; r++) {
    for (let c = 0; c < level.cols; c++) {
      if (level.get(c, r) !== SEMI) continue;
      const x = c * TILE, y = r * TILE;
      g.fillStyle = '#123c42'; g.fillRect(x, y, TILE, 5);
      g.fillStyle = '#2bd4c6'; g.fillRect(x, y, TILE, 1);
      g.fillStyle = '#1d7f80'; g.fillRect(x, y + 1, TILE, 1);
      g.fillStyle = '#0b2226'; for (let i = 1; i < TILE; i += 3) g.fillRect(x + i, y + 2, 1, 2);
      g.fillStyle = '#ff5fae'; g.fillRect(x, y + 4, TILE, 1);
      g.globalAlpha = 0.25; g.fillRect(x, y + 5, TILE, 2); g.globalAlpha = 1;
      if (level.get(c - 1, r) !== SEMI || level.get(c + 1, r) !== SEMI) {
        g.fillStyle = '#123c42';
        const sx = level.get(c - 1, r) !== SEMI ? x + 2 : x + TILE - 3;
        g.fillRect(sx, y + 5, 1, 6);
      }
    }
  }

  return { canvas, lights, vents };
}

function topOfRun(isG, c, r) {
  while (isG(c, r - 1)) r--;
  return r;
}

// Stretches of roof at one height. `busy` marks runs with blocks or platforms overhead.
function flatRuns(level, surface) {
  const runs = [];
  for (let c = 0; c < level.cols;) {
    const r = surface(c);
    if (r < 0) { c++; continue; }
    let c1 = c;
    while (c1 + 1 < level.cols && surface(c1 + 1) === r) c1++;
    runs.push({ c0: c, c1, r, busy: false });
    c = c1 + 1;
  }
  return runs;
}

function clearAbove(level, x, r, w) {
  const c0 = Math.floor(x / TILE), c1 = Math.floor((x + w) / TILE);
  for (let c = c0; c <= c1; c++) for (let rr = r - 3; rr < r; rr++) if (level.get(c, rr) !== 0) return false;
  for (let c = c0; c <= c1; c++) if (level.get(c, r) !== GROUND) return false;
  return true;
}

function cable(g, x0, y0, x1, y1, sag, color) {
  for (let x = Math.floor(x0); x <= x1; x++) {
    const t = (x - x0) / (x1 - x0);
    const y = Math.round(y0 + (y1 - y0) * t + sag * 4 * t * (1 - t));
    g.fillStyle = 'rgba(20, 10, 24, 0.6)';
    g.fillRect(x, y + 1, 1, 1);
    g.fillStyle = color;
    g.fillRect(x, y, 1, 1);
  }
}

function stain(g, cx, cy, r, rand) {
  for (let i = 0; i < r * r; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r;
    g.fillStyle = d < r * 0.4 ? C.rust : rand() < 0.5 ? C.rust2 : C.stain;
    g.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d * 0.6), 1, 1);
  }
}

function vent(g, x, y, w, h) {
  g.fillStyle = C.stain; g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = C.grate; g.fillRect(x, y, w, h);
  g.fillStyle = C.slat; for (let sy = y + 1; sy < y + h - 1; sy += 2) g.fillRect(x + 1, sy, w - 2, 1);
  g.fillStyle = C.rust; g.fillRect(x, y + h, w, 1);
  g.fillStyle = C.rust2; for (let i = 0; i < w; i += 3) g.fillRect(x + i, y + h + 1, 1, 2 + (i % 4));
}

function wallUnit(g, x, y) {
  g.fillStyle = C.metal3; g.fillRect(x, y, 18, 13);
  g.fillStyle = C.metal; g.fillRect(x + 1, y + 1, 16, 11);
  g.fillStyle = C.metal2; g.fillRect(x + 1, y + 10, 16, 2);
  fan(g, x + 6, y + 6, 4);
  g.fillStyle = C.metal2; for (let i = 0; i < 4; i++) g.fillRect(x + 12, y + 3 + i * 2, 4, 1);
  g.fillStyle = C.edge; g.fillRect(x + 3, y + 13, 1, 3); g.fillRect(x + 14, y + 13, 1, 3);
}

function fan(g, cx, cy, r) {
  for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
    const d = xx * xx + yy * yy;
    if (d > r * r) continue;
    g.fillStyle = d > (r - 1) * (r - 1) ? C.metal3 : (xx + yy) % 2 ? C.grate : C.metal3;
    g.fillRect(cx + xx, cy + yy, 1, 1);
  }
  g.fillStyle = C.metal2; g.fillRect(cx, cy, 1, 1);
}

// Background props sit on the roof (bottom edge at `top`), drawn a shade darker than the
// foreground so they read as scenery, not platforms.
function acUnit(g, x, top) {
  const y = top - 14;
  g.fillStyle = C.propDark; g.fillRect(x, y, 22, 14);
  g.fillStyle = C.propA; g.fillRect(x + 1, y + 1, 20, 12);
  g.fillStyle = C.propB; g.fillRect(x + 1, y + 1, 20, 1);
  for (let yy = -4; yy <= 4; yy++) for (let xx = -4; xx <= 4; xx++) {
    if (xx * xx + yy * yy > 16) continue;
    g.fillStyle = (xx + yy) % 2 ? C.propDark : '#2b2244';
    g.fillRect(x + 7 + xx, y + 7 + yy, 1, 1);
  }
  g.fillStyle = C.propDark; for (let i = 0; i < 4; i++) g.fillRect(x + 14, y + 3 + i * 2, 5, 1);
}

function hut(g, x, top, lights, rand) {
  const w = 26 + Math.floor(rand() * 10), h = 22;
  const y = top - h;
  g.fillStyle = C.propDark; g.fillRect(x, y, w, h);
  g.fillStyle = C.propA; g.fillRect(x + 1, y + 2, w - 2, h - 2);
  g.fillStyle = C.propB; g.fillRect(x, y, w, 2);
  g.fillStyle = C.propDark; g.fillRect(x + 5, y + 7, 9, h - 7); // door
  g.fillStyle = '#2b2244'; g.fillRect(x + 6, y + 8, 7, h - 8);
  g.fillStyle = C.rust2; g.fillRect(x + w - 8, y + 6, 4, 3);
  lights.push({ x: x + 3, y: y - 3, color: '#ffb84a', phase: 0 });
  lights.push({ x: x + w - 6, y: y - 3, color: '#ffb84a', phase: 30 });
  g.fillStyle = C.propDark; g.fillRect(x + 2, y - 1, 5, 1); g.fillRect(x + w - 7, y - 1, 5, 1);
}

function tank(g, x, top) {
  const y = top - 26;
  g.fillStyle = C.propDark;
  g.fillRect(x + 2, y + 16, 1, 10); g.fillRect(x + 15, y + 16, 1, 10); g.fillRect(x + 2, y + 21, 14, 1);
  g.fillRect(x, y, 18, 16);
  g.fillStyle = C.propA; g.fillRect(x + 1, y + 2, 16, 13);
  g.fillStyle = C.propB; g.fillRect(x + 1, y + 2, 16, 1); g.fillRect(x + 1, y + 8, 16, 1);
  g.fillStyle = C.propDark; g.fillRect(x + 3, y - 3, 12, 3);
}

function railing(g, x, top, w) {
  g.fillStyle = C.propB;
  g.fillRect(x, top - 9, w, 1);
  g.fillRect(x, top - 5, w, 1);
  for (let i = 0; i <= w; i += 6) g.fillRect(x + i, top - 9, 1, 9);
}

function antenna(g, x, top, lights) {
  g.fillStyle = C.propDark;
  g.fillRect(x + 4, top - 30, 1, 30);
  g.fillRect(x, top - 22, 9, 1);
  g.fillRect(x + 1, top - 15, 7, 1);
  g.fillRect(x + 2, top - 2, 5, 2);
  lights.push({ x: x + 3, y: top - 33, color: '#ff4a5a', phase: 60 });
}

// Steam drifting up out of the alleys. Owned by the renderer; purely cosmetic.
export class Steam {
  constructor(vents) {
    this.vents = vents;
    this.puffs = [];
    this.rand = mulberry32(99);
  }

  update(cx) {
    for (const v of this.vents) {
      if (v.x1 < cx - 32 || v.x0 > cx + VIEW_W + 32) continue;
      if (this.rand() < 0.18) {
        this.puffs.push({ x: v.x0 + 4 + this.rand() * (v.x1 - v.x0 - 8), y: v.y, vx: (this.rand() - 0.5) * 0.2, vy: -0.5 - this.rand() * 0.5, life: 160 + this.rand() * 80, s: 3 + Math.floor(this.rand() * 4) });
      }
    }
    for (const p of this.puffs) {
      p.x += p.vx + Math.sin((p.y + p.life) * 0.05) * 0.15;
      p.y += p.vy;
      p.life--;
    }
    this.puffs = this.puffs.filter((p) => p.life > 0 && p.y > -10);
  }

  draw(ctx, cx, cy) {
    for (const p of this.puffs) {
      const x = Math.round(p.x - cx), y = Math.round(p.y - cy);
      if (x < -8 || x > VIEW_W + 8 || y < -8 || y > VIEW_H + 8) continue;
      ctx.globalAlpha = Math.min(0.16, p.life / 600);
      ctx.fillStyle = '#c9cfe0';
      ctx.fillRect(x - p.s, y - (p.s >> 1), p.s * 2, p.s);
      ctx.fillRect(x - (p.s >> 1), y - p.s, p.s, p.s * 2);
    }
    ctx.globalAlpha = 1;
  }
}

// Blinking lamps with a soft glow.
export function drawLights(ctx, lights, cx, cy, frame) {
  for (const l of lights) {
    const x = l.x - cx, y = l.y - cy;
    if (x < -8 || x > VIEW_W + 8 || y < -8 || y > VIEW_H + 8) continue;
    const on = (frame + l.phase) % 90 < 60;
    if (on) {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = l.color;
      ctx.fillRect(x - 3, y - 2, 9, 6);
      ctx.fillRect(x - 1, y - 4, 5, 10);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = on ? l.color : '#3a2d52';
    ctx.fillRect(x, y, 3, 2);
    if (on) { ctx.fillStyle = '#fff3d0'; ctx.fillRect(x + 1, y, 1, 1); }
  }
}
