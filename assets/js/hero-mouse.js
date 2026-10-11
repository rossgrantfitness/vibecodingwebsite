// Homepage hero: the Mousecapades mouse running a tiny endless strip, using the game's own
// sprite and font code. Click, tap or press Space/↑ on the stage to jump. Also hosts the
// Konami-code easter egg (cheese rain).
import { drawPlayer } from '../../games/mousecapades/js/render.js';
import { makeSprites, blit } from '../../games/mousecapades/js/sprites.js';
import { drawText } from '../../games/mousecapades/js/font.js';

const W = 256;
const H = 120;
const FLOOR = 96;

const canvas = document.getElementById('hero-stage');
const sp = makeSprites();
const chipUrl = sp.chip.img.toDataURL();
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (canvas) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const city = skyline();

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
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d0820'); g.addColorStop(0.7, '#2a1440'); g.addColorStop(1, '#3a1a4a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const off = -Math.round(scroll * 0.3) % city.width;
    for (let x = off; x < W; x += city.width) ctx.drawImage(city, x, FLOOR - city.height + 4);

    // Ground strip in the game's tile colours.
    const gOff = -Math.round(scroll) % 16;
    for (let x = gOff; x < W; x += 16) {
      ctx.fillStyle = ((x - gOff) / 16) % 2 ? '#3b3454' : '#363050';
      ctx.fillRect(x, FLOOR, 16, H - FLOOR);
    }
    ctx.fillStyle = '#8f7fd0'; ctx.fillRect(0, FLOOR, W, 2);
    ctx.fillStyle = '#5c4f8f'; ctx.fillRect(0, FLOOR + 2, W, 1);

    for (const c of chips) blit(ctx, sp.chip, c.x, c.y + Math.round(Math.sin((t + c.bob * 10) * 0.08) * 1.5));
    ctx.fillStyle = '#ffd95e';
    for (const s of sparks) ctx.fillRect(Math.round(s.x), Math.round(s.y), s.life > 8 ? 2 : 1, s.life > 8 ? 2 : 1);
    drawPlayer(ctx, mouse, Math.round(mouse.x), Math.round(mouse.y), true, t);

    blit(ctx, sp.chip, 8, 8);
    drawText(ctx, `×${String(score).padStart(3, '0')}`, 20, 10);
  }

  if (reduceMotion) {
    draw();
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

// Small procedural skyline, same idea as the game's parallax layer.
function skyline() {
  const c = document.createElement('canvas');
  c.width = 300;
  c.height = 70;
  const g = c.getContext('2d');
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let x = 0;
  while (x < c.width) {
    const w = 12 + Math.floor(rand() * 22);
    const h = 18 + Math.floor(rand() * 48);
    g.fillStyle = '#1a1230';
    g.fillRect(x, c.height - h, w, h);
    for (let wy = c.height - h + 4; wy < c.height - 4; wy += 5) {
      for (let wx = x + 3; wx < x + w - 3; wx += 4) {
        if (rand() < 0.12) { g.fillStyle = rand() < 0.5 ? '#ff4fd8' : '#ffd95e'; g.fillRect(wx, wy, 1, 2); }
      }
    }
    x += w + Math.floor(rand() * 3);
  }
  return c;
}
