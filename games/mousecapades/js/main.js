import { T, STEP, VIEW_W, VIEW_H } from './config.js';
import { Input, isFormField } from './input.js';
import { buildTestLevel } from './level.js';
import { Player } from './player.js';
import { Camera } from './camera.js';
import { FX } from './fx.js';
import { Renderer } from './render.js';
import { createDebugPanel } from './debug.js';

const canvas = document.getElementById('game');
const level = buildTestLevel();
const player = new Player(level);
const camera = new Camera(level);
const fx = new FX();
const input = new Input();
const game = {
  T, level, player, camera, fx, input,
  dead: 0,
  opts: { hitboxes: false, juice: true, timeScale: 1, paused: false },
};
const renderer = new Renderer(canvas, level);
const debug = createDebugPanel(game);
const emit = (type, p, arg) => fx.emit(type, p, arg);
camera.snap(player, T);

function respawn(x, y) {
  player.reset(x, y);
  camera.snap(player, T);
  game.dead = 0;
}

// One fixed 60 Hz simulation step.
function step() {
  input.update();
  if (game.dead) {
    if (--game.dead === 0) respawn(player.safeX, player.safeY);
  } else {
    player.update(input, T, emit);
    if (player.y > level.height + 32) game.dead = 40;
    camera.update(player, T);
  }
  fx.update();
}

window.addEventListener('keydown', (e) => {
  if (isFormField(e.target)) return;
  if (e.code === 'Backquote') debug.toggle();
  else if (e.code === 'KeyR') respawn(level.spawn.x, level.spawn.y);
  else if (e.code === 'KeyP') game.opts.paused = !game.opts.paused;
  else if (e.code === 'KeyN' && game.opts.paused) step();
});

// Fixed timestep with render interpolation: physics is identical at 60, 120 or 144 Hz.
let last = performance.now();
let acc = 0;
let frames = 0, fps = 0, fpsTime = last;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!game.opts.paused) acc += dt * game.opts.timeScale;
  let steps = 0;
  while (acc >= STEP && steps < 5) { step(); acc -= STEP; steps++; }
  if (steps === 5) acc = 0;
  renderer.draw(game, acc / STEP);

  frames++;
  if (now - fpsTime >= 500) { fps = Math.round((frames * 1000) / (now - fpsTime)); frames = 0; fpsTime = now; }
  debug.update(fps);
  requestAnimationFrame(frame);
}

// Integer scaling keeps every pixel square; very small screens fall back to fractional.
function fit() {
  const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  const scale = s >= 2 ? Math.floor(s) : s;
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
}
window.addEventListener('resize', fit);
fit();
requestAnimationFrame(frame);

// Handle for poking at the game from the console.
window.mousecapades = { game, step };
