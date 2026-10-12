// Homepage hero: the Mousecapades mouse running an endless rooftop, drawn with the game's own
// sprite, font, skyline and rooftop code so the hero always matches the game. Click, tap or
// press Space/↑ on the stage to jump. Also hosts the Konami-code easter egg (cheese rain).
import { drawPlayer } from '../../games/mousecapades/js/render.js';
import { makeSprites, blit } from '../../games/mousecapades/js/sprites.js';
import { drawText } from '../../games/mousecapades/js/font.js';
import { spriteReady } from '../../games/mousecapades/js/mouse-sprite.js';
import { Backdrop } from '../../games/mousecapades/js/backdrop.js';
import { buildScenery, drawLights } from '../../games/mousecapades/js/scenery.js';
import { Level, builder } from '../../games/mousecapades/js/level.js';

const W = 320;
const H = 180;
const FLOOR = 148;
const ROOF_ROW = 9; // rooftop surface row in the strip below (9 × 16 = 144 px)

const canvas = document.getElementById('hero-stage');
const sp = makeSprites();
const chipUrl = sp.chip.img.toDataURL();
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (canvas) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const backdrop = new Backdrop();
  const roof = rooftop();

  const mouse = { x: 40, y: FLOOR - 17, w: 10, h: 17, vx: 0, vy: 0, facing: 1, grounded: true, anim: 0, sx: 1, sy: 1, state: 'idle', ducking: false };
  const chips = [];
  const sparks = [];
  let score = 0;
  let t = 0;
  let dir = 1;
  let scroll = 0;
  let jumpQueued = false;

  const spawnChip = () => chips.push({ x: W + 10 + Math.random() * 60, y: FLOOR - 22 - Math.floor(Math.random() * 3) * 14, bob: Math.random() * 6 });
  for (let i = 0; i < 3; i++) spawnChip();
  chips.forEach((c, i) => { c.x = 90 + i * 70; });

  const jump = () => { jumpQueued = true; };
  canvas.addEventListener('pointerdown', jump);
  canvas.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') { e.preventDefault(); jump(); }
  });

  function step() {
    t++;
    // Run toward the right two-thirds of the stage, turn with a skid at either end.
    const target = dir * 1.6;
    const skidding = Math.sign(mouse.vx) === -dir && Math.abs(mouse.vx) > 0.2;
    mouse.vx += Math.sign(target - mouse.vx) * Math.min(Math.abs(target - mouse.vx), skidding ? 0.12 : 0.05);
    if (mouse.x > W * 0.62) dir = -1;
    if (mouse.x < W * 0.12) dir = 1;
    mouse.facing = mouse.vx === 0 ? mouse.facing : Math.sign(mouse.vx);

    // Auto-hop toward chips that are just ahead and above, plus visitor jumps.
    const ahead = chips.find((c) => c.y < FLOOR - 18 && Math.abs(c.x - (mouse.x + 5 + mouse.facing * 18)) < 6);
    if (mouse.grounded && (jumpQueued || (ahead && Math.random() < 0.6))) {
      mouse.vy = -4.1;
      mouse.grounded = false;
      mouse.sx = 0.75; mouse.sy = 1.3;
    }
    jumpQueued = false;
    if (!mouse.grounded) {
      mouse.vy += 0.24;
      mouse.y += mouse.vy;
      if (mouse.y >= FLOOR - mouse.h) {
        mouse.y = FLOOR - mouse.h;
        mouse.vy = 0;
        mouse.grounded = true;
        mouse.sx = 1.3; mouse.sy = 0.75;
      }
    }
    mouse.x += mouse.vx;
    mouse.sx += (1 - mouse.sx) * 0.2;
    mouse.sy += (1 - mouse.sy) * 0.2;
    mouse.state = !mouse.grounded ? 'jump' : skidding ? 'skid' : Math.abs(mouse.vx) > 0.1 ? 'run' : 'idle';
    mouse.anim += mouse.grounded ? 0.08 + Math.abs(mouse.vx) * 0.07 : 0.1;

    // The world scrolls left; chips drift with it.
    scroll += 0.6;
    for (const c of chips) c.x -= 0.6;
    for (let i = chips.length - 1; i >= 0; i--) {
      const c = chips[i];
      const hit = c.x < mouse.x + mouse.w && c.x + 8 > mouse.x && c.y < mouse.y + mouse.h && c.y + 8 > mouse.y;
      if (hit || c.x < -12) {
        if (hit) {
          score++;
          for (let k = 0; k < 6; k++) sparks.push({ x: c.x + 4, y: c.y + 4, vx: Math.cos(k) * 1.2, vy: Math.sin(k) * 1.2 - 0.4, life: 16 });
        }
        chips.splice(i, 1);
        spawnChip();
      }
    }
    for (const s of sparks) { s.x += s.vx; s.y += s.vy; s.vy += 0.05; s.life--; }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
  }

  function draw() {
    backdrop.draw(ctx, Math.round(scroll), 60, t);
    // The rooftop strip tiles sideways; its lamps blink like the game's.
    const rw = roof.canvas.width;
    const rOff = Math.round(scroll) % rw;
    const dy = FLOOR - ROOF_ROW * 16;
    for (let x = -rOff; x < W; x += rw) {
      ctx.drawImage(roof.canvas, x, dy);
      drawLights(ctx, roof.lights, -x, -dy, t);
    }

    for (const c of chips) blit(ctx, sp.chip, c.x, c.y + Math.round(Math.sin((t + c.bob * 10) * 0.08) * 1.5));
    ctx.fillStyle = '#ffd95e';
    for (const s of sparks) ctx.fillRect(Math.round(s.x), Math.round(s.y), s.life > 8 ? 2 : 1, s.life > 8 ? 2 : 1);
    drawPlayer(ctx, mouse, Math.round(mouse.x), Math.round(mouse.y), true, t);

    blit(ctx, sp.chip, 8, 8);
    drawText(ctx, `×${String(score).padStart(3, '0')}`, 20, 10);
  }

  if (reduceMotion) {
    // One still frame, redrawn once the sprite sheet has loaded.
    draw();
    const wait = setInterval(() => { if (spriteReady()) { draw(); clearInterval(wait); } }, 100);
    setTimeout(() => clearInterval(wait), 5000);
  } else {
    let visible = true;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
    let last = performance.now();
    let acc = 0;
    const loop = (now) => {
      acc = Math.min(acc + (now - last), 100);
      last = now;
      if (visible && !document.hidden) {
        while (acc >= 1000 / 60) { step(); acc -= 1000 / 60; }
        draw();
      }
      requestAnimationFrame(loop);
    };
    draw();
    requestAnimationFrame(loop);
  }
}

// ↑ ↑ ↓ ↓ ← → ← → B A: it rains cheese.
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
let progress = 0;
window.addEventListener('keydown', (e) => {
  progress = e.code === KONAMI[progress] ? progress + 1 : (e.code === KONAMI[0] ? 1 : 0);
  if (progress === KONAMI.length) { progress = 0; cheeseRain(); }
});

function cheeseRain() {
  if (reduceMotion) return;
  const layer = document.createElement('div');
  layer.className = 'cheese-rain';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 40; i++) {
    const img = document.createElement('img');
    img.src = chipUrl;
    img.alt = '';
    img.style.left = `${Math.random() * 100}vw`;
    img.style.animationDuration = `${2.2 + Math.random() * 2}s`;
    img.style.animationDelay = `${Math.random() * 1.2}s`;
    img.style.setProperty('--spin', `${(Math.random() - 0.5) * 720}deg`);
    layer.appendChild(img);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 5000);
}

// A flat stretch of roof baked with the game's scenery painter (40 tiles, then it repeats).
function rooftop() {
  const L = new Level(40, 12);
  builder(L, ROOF_ROW).ground(0, 39);
  return buildScenery(L);
}
