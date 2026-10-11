import { TILE, VIEW_W, VIEW_H } from './config.js';
import { GROUND, SEMI, BLOCK, USED, METAL } from './level.js';
import { drawText } from './font.js';
import { makeSprites, blit } from './sprites.js';
import { isMuted } from './audio.js';
import { Drone } from './entities.js';
import { spriteReady, pickFrame, drawFrame, portrait } from './mouse-sprite.js';

const lerp = (a, b, t) => a + (b - a) * t;
const blink = (frame, on = 40, period = 60) => frame % period < on;

export function formatTime(frames, centis = true) {
  const total = frames / 60;
  const m = Math.floor(total / 60);
  const s = String(Math.floor(total % 60)).padStart(2, '0');
  const cs = String(Math.floor((total * 100) % 100)).padStart(2, '0');
  return centis ? `${m}:${s}.${cs}` : `${m}:${s}`;
}

export class Renderer {
  constructor(canvas) {
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.sky = this.ctx.createLinearGradient(0, 0, 0, VIEW_H);
    this.sky.addColorStop(0, '#0d0820');
    this.sky.addColorStop(0.6, '#24123d');
    this.sky.addColorStop(1, '#3a1a4a');
    this.far = skyline(480, 0.55, 0x51ed, '#1a1230', '#ff4fd8');
    this.near = skyline(400, 0.8, 0x7a3, '#120c22', '#3df0ff');
    this.sp = makeSprites();
    this.portrait = document.createElement('canvas');
    this.portrait.width = 24;
    this.portrait.height = 24;
  }

  draw(game, alpha) {
    const cam = game.camera;
    const cx = Math.round(lerp(cam.px, cam.x, alpha));
    const cy = Math.round(lerp(cam.py, cam.y, alpha));
    this.world(game, cx, cy, alpha);

    if (game.state === 'title') this.title(game);
    else {
      this.hud(game);
      if (game.state === 'play' && game.stats.frames < 150 && game.stats.deaths === 0) this.banner(game.stats.frames);
      if (game.state === 'clear' && game.t > 15) drawText(this.ctx, 'COURSE CLEAR!', VIEW_W / 2, 50, { scale: 2, big: true, color: '#3df0ff', align: 'center' });
      if (game.state === 'win') this.winScreen(game);
    }
    if (game.paused) this.pauseScreen(game);
  }

  // ---- World ---------------------------------------------------------------

  world(game, cx, cy, alpha) {
    const { ctx } = this;
    const { level, player: p, fx, opts } = game;
    ctx.fillStyle = this.sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.parallax(this.far, cx * 0.15, cy * 0.05);
    this.parallax(this.near, cx * 0.35, cy * 0.12);

    if (game.goal) this.goal(game.goal, cx, cy, game.frame);
    if (game.checkpoint) this.checkpoint(game.checkpoint, cx, cy, game.frame);

    const bumped = new Map(game.bumps.map((b) => [`${b.c},${b.r}`, Math.round(Math.sin((b.t / 10) * Math.PI) * 5)]));
    const c0 = Math.floor(cx / TILE), c1 = Math.floor((cx + VIEW_W) / TILE);
    const r0 = Math.floor(cy / TILE), r1 = Math.floor((cy + VIEW_H) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = level.get(c, r);
        if (c < 0 || c >= level.cols || !t) continue;
        const x = c * TILE - cx;
        const y = r * TILE - cy - (bumped.get(`${c},${r}`) || 0);
        if (t === GROUND) this.groundTile(level, x, y, c, r);
        else if (t === SEMI) this.semiTile(x, y);
        else if (t === BLOCK) this.itemBlock(x, y, game.frame);
        else if (t === USED) this.usedBlock(x, y);
        else if (t === METAL) this.metalTile(x, y);
      }
    }

    for (const it of game.pickups) {
      if (it.taken || it.x + 16 < cx || it.x - 16 > cx + VIEW_W) continue;
      const bob = Math.round(Math.sin(game.frame * 0.08 + it.x * 0.05) * 1.5);
      if (it.kind === 'chip') blit(ctx, this.sp.chip, it.x - cx, it.y - cy + bob);
      else this.goldPickup(it.x - cx, it.y - cy + bob, game.frame);
    }

    for (const e of game.enemies) this.enemy(e, lerp(e.px, e.x + e.rx, alpha) - cx, lerp(e.py, e.y + e.ry, alpha) - cy);

    for (const c of game.popups) {
      if (c.t % 4 < 3) blit(ctx, this.sp.chip, c.x - cx, c.y - cy);
    }

    fx.draw(ctx, cx, cy);

    if (game.state !== 'title') {
      const x = Math.round(lerp(p.px, p.x + p.rx, alpha)) - cx;
      const y = Math.round(lerp(p.py, p.y + p.ry, alpha)) - cy;
      drawPlayer(ctx, p, x, y, opts.juice, game.frame);
      if (opts.hitboxes) {
        outline(ctx, x, y, p.w, p.h, '#39ff88');
        for (const e of game.enemies) if (e.alive) outline(ctx, Math.round(e.x - cx), Math.round(e.y - cy), e.w, e.h, '#ff3b6b');
      }
    }
  }

  parallax(layer, ox, oy) {
    const w = layer.width;
    const x = -Math.round(ox) % w;
    const y = VIEW_H - layer.height + 12 - Math.round(oy);
    for (let i = x; i < VIEW_W; i += w) this.ctx.drawImage(layer, i, y);
  }

  groundTile(level, x, y, c, r) {
    const { ctx } = this;
    ctx.fillStyle = (c + r) % 2 ? '#3b3454' : '#363050'; // checker so speed reads clearly
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#2a243d';
    ctx.fillRect(x, y + TILE - 1, TILE, 1);
    ctx.fillRect(x + TILE - 1, y, 1, TILE);
    if (level.get(c, r - 1) !== GROUND) {
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

  metalTile(x, y) {
    const { ctx } = this;
    ctx.fillStyle = '#4a4a66';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#6f6f92';
    ctx.fillRect(x, y, TILE, 1);
    ctx.fillRect(x, y, 1, TILE);
    ctx.fillStyle = '#2a2a3c';
    ctx.fillRect(x, y + TILE - 1, TILE, 1);
    ctx.fillRect(x + TILE - 1, y, 1, TILE);
    ctx.fillStyle = '#9a9ac0';
    for (const [dx, dy] of [[3, 3], [12, 3], [3, 12], [12, 12]]) ctx.fillRect(x + dx, y + dy, 1, 1);
  }

  itemBlock(x, y, frame) {
    const { ctx } = this;
    ctx.fillStyle = '#0b2f33';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#1c8a8f';
    ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
    ctx.fillStyle = '#0f4a50';
    ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
    const glow = ['#3df0ff', '#9ff8ff', '#3df0ff', '#1fb8c4'][Math.floor(frame / 10) % 4];
    drawText(ctx, '?', x + 5, y + 4, { color: glow, shadow: null, scale: 2 });
    ctx.fillStyle = '#9ff8ff';
    ctx.fillRect(x + 1, y + 1, 1, 1);
  }

  usedBlock(x, y) {
    const { ctx } = this;
    ctx.fillStyle = '#1e1a2c';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#3a3550';
    ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
    ctx.fillStyle = '#2a2540';
    ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
  }

  goldPickup(x, y, frame) {
    const { ctx } = this;
    ctx.globalAlpha = 0.18 + 0.12 * Math.sin(frame * 0.1);
    ctx.fillStyle = '#ffb21e';
    ctx.fillRect(x - 4, y - 1, 21, 13);
    ctx.fillRect(x - 1, y - 4, 15, 19);
    ctx.globalAlpha = 1;
    blit(ctx, this.sp.gold, x, y);
    if (blink(frame, 6, 50)) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 9, y + 2, 1, 1);
    }
  }

  checkpoint(cp, cx, cy, frame) {
    const { ctx } = this;
    const x = cp.x - cx;
    const y = cp.y - cy;
    ctx.fillStyle = '#2a243d';
    ctx.fillRect(x - 2, cp.groundY - cy - 2, 8, 2);
    ctx.fillStyle = cp.active ? '#9ff8ff' : '#6b6390';
    ctx.fillRect(x, y, 2, cp.h);
    const color = cp.active ? (blink(frame, 30, 40) ? '#3df0ff' : '#9ff8ff') : '#4a4466';
    const wave = cp.active ? Math.floor(frame / 8) % 2 : 0;
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 1, 10, 6);
    ctx.fillRect(x + 12, y + 2 + wave, 2, 5 - wave);
  }

  goal(goal, cx, cy, frame) {
    const { ctx } = this;
    const x = goal.x - cx;
    const y = goal.y - cy;
    for (const px of [x, x + goal.w - 3]) {
      ctx.fillStyle = '#1a1230';
      ctx.fillRect(px, y, 3, goal.h);
      ctx.fillStyle = '#ff4fd8';
      for (let i = 0; i < goal.h; i += 8) ctx.fillRect(px, y + i + ((frame >> 3) % 8 > 3 ? 4 : 0), 3, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px, y - 2, 3, 2);
    }
    const beamY = y + 10 + Math.round(((Math.sin(frame / 35) + 1) / 2) * (goal.h - 20));
    ctx.fillStyle = '#3df0ff';
    ctx.fillRect(x + 3, beamY, goal.w - 6, 2);
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x + 3, beamY - 1, goal.w - 6, 4);
    ctx.globalAlpha = 1;
    if (blink(frame, 45, 60)) drawText(ctx, 'EXIT', x + goal.w / 2, y - 10, { color: '#ff4fd8', align: 'center' });
  }

  enemy(e, x, y) {
    const { ctx, sp } = this;
    let s;
    if (e instanceof Drone) s = sp.drone[e.dead ? 1 : Math.floor(e.anim) % 2];
    else if (e.dead === 'squash') s = sp.scuttleFlat;
    else s = (e.spiky ? sp.spike : sp.scuttle)[Math.floor(e.anim) % 2];
    const sx = Math.round(x + (e.w - s.w) / 2);
    const sy = Math.round(y + e.h - s.h);
    if (e.dead === 'knock') {
      ctx.save();
      ctx.translate(sx, sy + s.h);
      ctx.scale(1, -1);
      blit(ctx, s, 0, 0, e.dir > 0);
      ctx.restore();
    } else {
      blit(ctx, s, sx, sy, e.dir > 0);
    }
  }

  // ---- HUD & screens -------------------------------------------------------

  hud(game) {
    const { ctx, sp } = this;
    const s = game.stats;
    blit(ctx, sp.chip, 6, 4);
    drawText(ctx, `×${String(s.chips).padStart(3, '0')}`, 17, 6);
    s.gold.forEach((got, i) => blit(ctx, got ? sp.goldIcon : sp.chipDim, VIEW_W / 2 - 16 + i * 12, 4));
    drawText(ctx, formatTime(s.frames, false), VIEW_W - 6, 6, { align: 'right' });
    this.pMeter(game.player, game.T, game.frame);
  }

  // SMW-style run meter: six arrows, then a flashing P when full.
  pMeter(p, T, frame) {
    const { ctx } = this;
    const fill = T.pMeterFrames > 0 ? p.pMeter / T.pMeterFrames : 1;
    const lit = Math.floor(fill * 6 + 1e-6);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i < lit ? '#3df0ff' : '#2a2340';
      ctx.fillRect(7 + i * 4, 15, 3, 3);
    }
    const full = fill >= 1;
    drawText(ctx, 'P', 32, 14, { color: full ? (blink(frame, 4, 8) ? '#ff4fd8' : '#ffffff') : '#2a2340', shadow: null });
  }

  banner(frames) {
    const { ctx } = this;
    ctx.globalAlpha = Math.min(1, (150 - frames) / 30);
    drawText(ctx, 'SECTOR 1', VIEW_W / 2, 44, { scale: 2, big: true, color: '#ffffff', align: 'center' });
    drawText(ctx, 'GUTTER DISTRICT', VIEW_W / 2, 63, { scale: 1, color: '#3df0ff', align: 'center' });
    ctx.globalAlpha = 1;
  }

  title(game) {
    const { ctx } = this;
    const f = game.frame;
    ctx.fillStyle = 'rgba(5, 3, 12, 0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Logo: pink over cyan, split at the middle row, with a hard shadow.
    const y = 22 + Math.round(Math.sin(f / 30) * 2);
    const logo = { scale: 3, big: true, align: 'center', shadow: null };
    drawText(ctx, 'MOUSECAPADES', VIEW_W / 2 + 3, y + 3, { ...logo, color: '#1a0f2e' });
    drawText(ctx, 'MOUSECAPADES', VIEW_W / 2, y, { ...logo, color: '#3df0ff' });
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_W, y + 9);
    ctx.clip();
    drawText(ctx, 'MOUSECAPADES', VIEW_W / 2, y, { ...logo, color: '#ff4fd8' });
    ctx.restore();
    drawText(ctx, 'ONE SMALL MOUSE. ONE BIG NEON CITY.', VIEW_W / 2, y + 31, { color: '#cfc6e8', align: 'center' });

    // Big portrait of the mouse at 2×, bobbing gently.
    if (portrait.complete && portrait.naturalWidth) {
      const pw = portrait.naturalWidth * 2;
      const ph = portrait.naturalHeight * 2;
      ctx.drawImage(portrait, Math.round(VIEW_W / 2 - pw / 2), 140 - ph + Math.round(Math.sin(f / 24)), pw, ph);
    } else {
      const pc = this.portrait.getContext('2d');
      pc.clearRect(0, 0, 24, 24);
      drawMouse(pc, { w: 10, h: 14, facing: 1, state: 'walk', anim: f * 0.12, grounded: true, vx: 0, sx: 1, sy: 1 }, 7, 7, false);
      ctx.drawImage(this.portrait, VIEW_W / 2 - 36, 72, 72, 72);
    }

    if (blink(f)) drawText(ctx, 'PRESS JUMP TO START', VIEW_W / 2, 146, { color: '#ffffff', align: 'center' });
    drawText(ctx, 'ARROWS MOVE  Z JUMP  X RUN  ENTER PAUSE  M SOUND', VIEW_W / 2, 160, { color: '#8c84a6', align: 'center' });
    if (game.best) drawText(ctx, `BEST ${formatTime(game.best)}`, VIEW_W / 2, 170, { color: '#ffb21e', align: 'center' });
  }

  winScreen(game) {
    const { ctx, sp } = this;
    const s = game.stats;
    const f = game.frame;
    ctx.fillStyle = 'rgba(7, 4, 15, 0.82)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawText(ctx, 'SECTOR CLEAR!', VIEW_W / 2, 18, { scale: 2, big: true, color: '#3df0ff', align: 'center' });

    const L = 64, R = VIEW_W - 64;
    const row = (label, value, y, color = '#ffffff') => {
      drawText(ctx, label, L, y, { big: true, color: '#8c84a6' });
      if (value !== null) drawText(ctx, value, R, y, { big: true, color, align: 'right' });
    };
    row('TIME', formatTime(s.frames), 48);
    row('CHIPS', `${s.chips}/${s.chipsTotal}`, 64, s.chips === s.chipsTotal ? '#ffd95e' : '#ffffff');
    row('GOLDEN CHEESE', null, 80);
    s.gold.forEach((got, i) => blit(ctx, got ? sp.gold : sp.goldDim, R - 13 - (s.gold.length - 1 - i) * 16, 78));
    row('DEATHS', String(s.deaths), 96);
    if (game.newBest && blink(f, 20, 30)) drawText(ctx, 'NEW BEST TIME!', VIEW_W / 2, 120, { big: true, color: '#ff4fd8', align: 'center' });
    else if (!game.newBest && game.best) drawText(ctx, `BEST ${formatTime(game.best)}`, VIEW_W / 2, 122, { color: '#ffb21e', align: 'center' });
    if (game.t > 40 && blink(f)) drawText(ctx, 'PRESS JUMP TO PLAY AGAIN', VIEW_W / 2, 154, { color: '#ffffff', align: 'center' });
  }

  pauseScreen() {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(5, 3, 12, 0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawText(ctx, 'PAUSED', VIEW_W / 2, 62, { scale: 2, big: true, align: 'center' });
    drawText(ctx, `ENTER RESUME   R RESTART   M SOUND ${isMuted() ? 'OFF' : 'ON'}`, VIEW_W / 2, 96, { color: '#cfc6e8', align: 'center' });
  }
}

// The player: the sprite-sheet character once it has loaded, the code-drawn mouse before that.
// (x, y) is the top-left of the hitbox on screen; the sprite stands on its bottom edge.
export function drawPlayer(ctx, p, x, y, juice, clock) {
  if (!spriteReady()) return drawMouse(ctx, p, x, y, juice);
  const [anim, i] = pickFrame(p, clock);
  drawFrame(ctx, anim, i, x + p.w / 2, y + p.h, p.facing < 0, juice ? p.sx : 1, juice ? p.sy : 1);
}

// Placeholder mouse: body, round ears, tail, eye, scarf. Squash/stretch scales around the feet.
export function drawMouse(ctx, p, x, y, juice) {
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
  const wag = Math.round(Math.sin(p.anim * 1.3));
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
  if (p.state === 'hurt') {
    ctx.fillRect(eyeX, top + 3, 1, 1);
    ctx.fillRect(eyeX + 1, top + 4, 1, 1);
    ctx.fillRect(eyeX + 1, top + 3, 1, 1);
    ctx.fillRect(eyeX, top + 4, 1, 1);
  } else {
    ctx.fillRect(eyeX, top + 3, 2, p.state === 'skid' ? 1 : 2);
  }
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
