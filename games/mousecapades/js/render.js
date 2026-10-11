import { TILE, VIEW_W, VIEW_H } from './config.js';
import { SOLID, SEMI } from './level.js';

const lerp = (a, b, t) => a + (b - a) * t;

// Greybox renderer: placeholder art that is still readable enough to judge motion and speed.
export class Renderer {
  constructor(canvas, level) {
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.level = level;
    this.sky = this.ctx.createLinearGradient(0, 0, 0, VIEW_H);
    this.sky.addColorStop(0, '#0d0820');
    this.sky.addColorStop(0.6, '#24123d');
    this.sky.addColorStop(1, '#3a1a4a');
    this.far = skyline(480, 0.55, 0x51ed, '#1a1230', '#ff4fd8');
    this.near = skyline(400, 0.8, 0x7a3, '#120c22', '#3df0ff');
  }

  draw(game, alpha) {
    const { ctx, level } = this;
    const { player: p, camera: cam, fx, opts } = game;
    const cx = Math.round(lerp(cam.px, cam.x, alpha));
    const cy = Math.round(lerp(cam.py, cam.y, alpha));

    ctx.fillStyle = this.sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.parallax(this.far, cx * 0.15, cy * 0.05);
    this.parallax(this.near, cx * 0.35, cy * 0.12);

    // Tiles in view
    const c0 = Math.floor(cx / TILE), c1 = Math.floor((cx + VIEW_W) / TILE);
    const r0 = Math.floor(cy / TILE), r1 = Math.floor((cy + VIEW_H) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = level.get(c, r);
        if (c < 0 || c >= level.cols || !t) continue;
        const x = c * TILE - cx, y = r * TILE - cy;
        if (t === SOLID) this.solidTile(x, y, c, r);
        else if (t === SEMI) this.semiTile(x, y, c, r);
      }
    }

    fx.draw(ctx, cx, cy);

    if (!game.dead) {
      const x = Math.round(lerp(p.px, p.x + p.rx, alpha)) - cx;
      const y = Math.round(lerp(p.py, p.y + p.ry, alpha)) - cy;
      drawMouse(ctx, p, x, y, opts.juice);
      if (opts.hitboxes) {
        outline(ctx, x, y, p.w, p.h, '#39ff88');
        ctx.fillStyle = '#ff3b6b';
        ctx.fillRect(p.safeX - cx, p.safeY + p.h - cy, 2, 1);
      }
    }

    this.pMeter(p, game.T);
  }

  parallax(layer, ox, oy) {
    const w = layer.width;
    const x = -Math.round(ox) % w;
    const y = VIEW_H - layer.height + 12 - Math.round(oy);
    for (let i = x; i < VIEW_W; i += w) this.ctx.drawImage(layer, i, y);
  }

  solidTile(x, y, c, r) {
    const { ctx, level } = this;
    ctx.fillStyle = (c + r) % 2 ? '#3b3454' : '#363050'; // checker so speed reads clearly
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#2a243d';
    ctx.fillRect(x, y + TILE - 1, TILE, 1);
    ctx.fillRect(x + TILE - 1, y, 1, TILE);
    if (level.get(c, r - 1) !== SOLID) {
      ctx.fillStyle = '#8f7fd0';
      ctx.fillRect(x, y, TILE, 2);
      ctx.fillStyle = '#5c4f8f';
      ctx.fillRect(x, y + 2, TILE, 1);
    }
  }

  semiTile(x, y) {
    const { ctx } = this;
    ctx.fillStyle = '#2bd4c6';
    ctx.fillRect(x, y, TILE, 2);
    ctx.fillStyle = '#167a77';
    ctx.fillRect(x, y + 2, TILE, 2);
    ctx.fillRect(x + 3, y + 4, 1, 3);
    ctx.fillRect(x + 12, y + 4, 1, 3);
  }

  // SMW-style run meter: six arrows, then a flashing P when full.
  pMeter(p, T) {
    const { ctx } = this;
    const fill = T.pMeterFrames > 0 ? p.pMeter / T.pMeterFrames : 1;
    const lit = Math.floor(fill * 6 + 1e-6);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i < lit ? '#3df0ff' : '#2a2340';
      ctx.fillRect(8 + i * 5, 8, 4, 4);
    }
    const full = fill >= 1;
    ctx.fillStyle = full && (Math.floor(performance.now() / 120) % 2) ? '#ff4fd8' : full ? '#ffffff' : '#2a2340';
    ctx.fillRect(39, 7, 7, 6);
  }
}

// Placeholder mouse: body, round ears, tail, eye, scarf. Squash/stretch scales around the feet.
function drawMouse(ctx, p, x, y, juice) {
  const sx = juice ? p.sx : 1;
  const sy = juice ? p.sy : 1;
  const w = Math.max(4, Math.round(p.w * sx));
  const h = Math.max(4, Math.round(p.h * sy));
  const left = x + Math.round((p.w - w) / 2);
  const top = y + p.h - h;
  const f = p.facing;
  const fur = p.state === 'sprint' ? '#c9fbff' : '#d9d1ea';
  const dark = '#8c84a6';

  // Tail
  const back = f > 0 ? left - 1 : left + w;
  const wag = Math.round(Math.sin(p.anim * 1.3)) ;
  ctx.fillStyle = '#f19bc0';
  for (let i = 0; i < 4; i++) ctx.fillRect(back - f * i, top + h - 5 - (i >> 1) + (i === 3 ? wag : 0), 1, 1);

  // Ears
  const earY = top - (p.ducking ? 1 : 3);
  for (const ex of [left - 1, left + w - 3]) {
    ctx.fillStyle = fur;
    ctx.fillRect(ex, earY, 4, 4);
    ctx.fillStyle = '#f19bc0';
    ctx.fillRect(ex + 1, earY + 1, 2, 2);
  }

  // Body (rounded corners) and feet
  ctx.fillStyle = fur;
  ctx.fillRect(left + 1, top, w - 2, h - 1);
  ctx.fillRect(left, top + 1, w, h - 3);
  ctx.fillStyle = dark;
  const step = p.grounded && p.state !== 'idle' && p.state !== 'skid' ? (Math.floor(p.anim) % 2) : 0;
  ctx.fillRect(left + 1 + step * f, top + h - 1, 3, 1);
  ctx.fillRect(left + w - 4 - step * f, top + h - 1, 3, 1);

  // Scarf
  ctx.fillStyle = '#ff4fa3';
  ctx.fillRect(left, top + Math.min(h - 3, 7), w, 2);
  if (!p.grounded || Math.abs(p.vx) > 1) ctx.fillRect(f > 0 ? left - 2 : left + w, top + Math.min(h - 3, 7), 2, 1);

  // Face
  ctx.fillStyle = '#1a1424';
  const eyeX = f > 0 ? left + w - 4 : left + 2;
  ctx.fillRect(eyeX, top + 3, 2, p.state === 'skid' ? 1 : 2);
  ctx.fillStyle = '#f19bc0';
  ctx.fillRect(f > 0 ? left + w : left - 1, top + 5, 1, 1);
}

function outline(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
}

// Procedural city silhouette with a scatter of lit windows, drawn once to an offscreen canvas.
function skyline(width, heightFrac, seed, body, light) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.round(VIEW_H * heightFrac);
  const g = c.getContext('2d');
  const rand = mulberry32(seed);
  let x = 0;
  while (x < width) {
    const w = 14 + Math.floor(rand() * 26);
    const h = Math.floor(c.height * (0.35 + rand() * 0.6));
    g.fillStyle = body;
    g.fillRect(x, c.height - h, Math.min(w, width - x), h);
    if (rand() < 0.3) g.fillRect(x + (w >> 1), c.height - h - 8, 1, 8); // antenna
    g.fillStyle = light;
    for (let wy = c.height - h + 4; wy < c.height - 4; wy += 5) {
      for (let wx = x + 3; wx < x + w - 3 && wx < width; wx += 4) if (rand() < 0.12) g.fillRect(wx, wy, 1, 2);
    }
    x += w + Math.floor(rand() * 4);
  }
  return c;
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
