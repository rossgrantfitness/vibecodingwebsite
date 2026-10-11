// Character sprite atlas: one row per animation, 32×32 cells, feet on the bottom row and the body
// centred on x = 16, facing right. Falls back to the code-drawn mouse until the image has loaded.
const CELL = 32;
const ROWS = { idle: 0, walk: 1, run: 2, jump: 3, hurt: 4, die: 5, face: 6 };

const atlas = new Image();
let ready = false;
atlas.onload = () => { ready = true; };
atlas.src = new URL('../assets/mouse.png', import.meta.url).href;

export const portrait = new Image();
portrait.src = new URL('../assets/mouse-portrait.png', import.meta.url).href;

export const spriteReady = () => ready;

// Which animation frame to show for the player's current state. `clock` is a frame counter.
export function pickFrame(p, clock) {
  switch (p.state) {
    case 'hurt': return ['hurt', Math.floor(clock / 8) % 3];
    case 'duck': return ['jump', 0];
    case 'skid': return ['jump', 4];
    case 'jump': return ['jump', p.vy < -2.5 ? 1 : 2];
    case 'fall': return ['jump', p.vy < 1.5 ? 2 : 3];
    case 'walk': return ['walk', Math.floor(p.anim) % 8];
    case 'run':
    case 'sprint': return ['run', Math.floor(p.anim) % 8];
    default: return ['idle', Math.floor(clock / 9) % 8];
  }
}

// Draw one cell with its feet at (cx, bottom). sx/sy squash and stretch around the feet.
export function drawFrame(ctx, anim, index, cx, bottom, flip = false, sx = 1, sy = 1) {
  const w = Math.max(1, Math.round(CELL * sx));
  const h = Math.max(1, Math.round(CELL * sy));
  const dx = Math.round(cx - w / 2);
  const dy = Math.round(bottom - h);
  const srcX = index * CELL;
  const srcY = ROWS[anim] * CELL;
  if (flip) {
    ctx.save();
    ctx.translate(dx + w, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(atlas, srcX, srcY, CELL, CELL, 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(atlas, srcX, srcY, CELL, CELL, dx, dy, w, h);
  }
}
