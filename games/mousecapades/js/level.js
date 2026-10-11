import { TILE } from './config.js';

export const EMPTY = 0;
export const SOLID = 1;
export const SEMI = 2; // one-way platform: solid only from above

export class Level {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.tiles = new Uint8Array(cols * rows);
    this.spawn = { x: 0, y: 0 };
  }

  get width() { return this.cols * TILE; }
  get height() { return this.rows * TILE; }

  // Off the left/right edge is wall; above and below is open air.
  get(c, r) {
    if (c < 0 || c >= this.cols) return SOLID;
    if (r < 0 || r >= this.rows) return EMPTY;
    return this.tiles[r * this.cols + c];
  }

  fill(c0, r0, c1, r1, type) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) this.tiles[r * this.cols + c] = type;
    }
  }

  // Does the pixel rect overlap any solid tile?
  solidAt(x, y, w, h) {
    const c0 = Math.floor(x / TILE), c1 = Math.floor((x + w - 1) / TILE);
    const r0 = Math.floor(y / TILE), r1 = Math.floor((y + h - 1) / TILE);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (this.get(c, r) === SOLID) return true;
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

// Movement test course: gap ladder, stairs, jump-height pillars, one-way platforms, P-speed runway.
export function buildTestLevel() {
  const L = new Level(220, 17);
  const G = 14; // ground surface row
  const ground = (c0, c1) => L.fill(c0, G, c1, L.rows - 1, SOLID);
  const block = (c, r, w = 1, h = 1) => L.fill(c, r, c + w - 1, r + h - 1, SOLID);
  const pillar = (c, height, w = 2) => L.fill(c, G - height, c + w - 1, G - 1, SOLID);
  const semi = (c, r, w) => L.fill(c, r, c + w - 1, r, SEMI);

  // Start: flat run-up under a low ceiling (head bumps) and a lone block (corner nudge).
  ground(0, 30);
  block(12, 10, 5);
  block(23, 10);

  // Gap ladder: 3 tiles (walk), 5 (run), 7 (full run).
  ground(34, 44);
  ground(50, 60);
  ground(68, 175);

  // Stairs, then pillars 3 / 4 / 5 tiles tall to feel max jump height.
  for (let i = 0; i < 4; i++) pillar(72 + i, i + 1, 1);
  pillar(82, 3);
  pillar(88, 4);
  pillar(94, 5);

  // One-way platforms climbing toward a high ledge (vertical camera).
  semi(100, 11, 4);
  semi(105, 8, 4);
  semi(110, 5, 4);
  block(116, 3, 8, 1);
  semi(126, 9, 6);

  // Long runway (rows 132+) to charge the P-meter, then a 9-tile sprint gap and a 10-tile one.
  ground(185, 195);
  ground(206, 219);

  L.spawn = { x: 3 * TILE, y: G * TILE - 14 };
  return L;
}
