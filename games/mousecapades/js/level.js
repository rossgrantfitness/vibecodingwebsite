import { TILE, PLAYER_H } from './config.js';

export const EMPTY = 0;
export const GROUND = 1;
export const SEMI = 2;  // one-way platform: solid only from above
export const BLOCK = 3; // item block: bump from below for its contents
export const USED = 4;  // emptied item block
export const METAL = 5; // floating solid block

const solid = (t) => t === GROUND || t >= BLOCK;

export class Level {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.tiles = new Uint8Array(cols * rows);
    this.spawn = { x: 0, y: 0 };
    this.entities = [];         // { type, c, r, ...options } in tile coordinates
    this.blockItems = new Map(); // "c,r" -> 'chip' | 'multi'
    this.arenas = [];            // brawl zones: { c0, waves: [[{ type, side, ... }]] }
  }

  get width() { return this.cols * TILE; }
  get height() { return this.rows * TILE; }

  // Off the left/right edge is wall; above and below is open air.
  get(c, r) {
    if (c < 0 || c >= this.cols) return GROUND;
    if (r < 0 || r >= this.rows) return EMPTY;
    return this.tiles[r * this.cols + c];
  }

  set(c, r, type) {
    if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) this.tiles[r * this.cols + c] = type;
  }

  fill(c0, r0, c1, r1, type) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.set(c, r, type);
  }

  isSolid(c, r) { return solid(this.get(c, r)); }

  // Does the pixel rect overlap any solid tile?
  solidAt(x, y, w, h) {
    const c0 = Math.floor(x / TILE), c1 = Math.floor((x + w - 1) / TILE);
    const r0 = Math.floor(y / TILE), r1 = Math.floor((y + h - 1) / TILE);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (solid(this.get(c, r))) return true;
    }
    return false;
  }

  // Is the rect's bottom edge resting exactly on top of a one-way platform?
  semiBelow(x, y, w, h) {
    const bottom = y + h;
    if (bottom % TILE !== 0) return false;
    const r = bottom / TILE;
    const c0 = Math.floor(x / TILE), c1 = Math.floor((x + w - 1) / TILE);
    for (let c = c0; c <= c1; c++) if (this.get(c, r) === SEMI) return true;
    return false;
  }
}

// Shared authoring helpers so level files read like a description of the layout.
export function builder(L, groundRow) {
  const G = groundRow;
  return {
    G,
    ground: (c0, c1, top = G) => L.fill(c0, top, c1, L.rows - 1, GROUND),
    pillar: (c, height, w = 2) => L.fill(c, G - height, c + w - 1, G - 1, GROUND),
    metal: (c, r, w = 1, h = 1) => L.fill(c, r, c + w - 1, r + h - 1, METAL),
    semi: (c, r, w) => L.fill(c, r, c + w - 1, r, SEMI),
    block: (c, r, item = 'chip') => { L.set(c, r, BLOCK); L.blockItems.set(`${c},${r}`, item); },
    add: (type, c, r, opts = {}) => L.entities.push({ type, c, r, ...opts }),
    // A one-screen brawl zone starting at column c0 (needs 20 flat columns).
    arena: (c0, waves) => L.arenas.push({ c0, waves }),
    // A row of chips, or an arc of chips rising `lift` tiles in the middle.
    chips: (c, r, n, lift = 0) => {
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0.5;
        L.entities.push({ type: 'chip', c: c + i, r: r - lift * Math.sin(t * Math.PI) });
      }
    },
  };
}

// Movement test course (open with ?level=test): gap ladder, stairs, jump-height pillars,
// one-way platforms, P-speed runway.
export function buildTestLevel() {
  const L = new Level(220, 17);
  const b = builder(L, 14);
  b.ground(0, 30);
  b.metal(12, 10, 5);
  b.metal(23, 10);
  b.ground(34, 44);
  b.ground(50, 60);
  b.ground(68, 175);
  for (let i = 0; i < 4; i++) b.pillar(72 + i, i + 1, 1);
  b.pillar(82, 3);
  b.pillar(88, 4);
  b.pillar(94, 5);
  b.semi(100, 11, 4);
  b.semi(105, 8, 4);
  b.semi(110, 5, 4);
  b.metal(116, 3, 8, 1);
  b.semi(126, 9, 6);
  b.ground(185, 195);
  b.ground(206, 219);
  b.add('goal', 214, 14);
  L.spawn = { x: 3 * TILE, y: 14 * TILE - PLAYER_H };
  return L;
}
