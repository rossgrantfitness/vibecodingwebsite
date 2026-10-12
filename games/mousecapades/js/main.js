import { STEP, VIEW_W, VIEW_H } from './config.js';
import { Input, isFormField } from './input.js';
import { buildTestLevel } from './level.js';
import { buildLevel1 } from './level1.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { createDebugPanel } from './debug.js';
import { unlockAudio, toggleMute } from './audio.js';

// ?level=test opens the movement test course; ?play skips the title screen.
const params = new URLSearchParams(location.search);
const testCourse = params.get('level') === 'test';
const game = new Game(testCourse ? buildTestLevel : buildLevel1, {
  skipTitle: testCourse || params.has('play'),
  trackBest: !testCourse,
});

const canvas = document.getElementById('game');
const input = new Input();
const renderer = new Renderer(canvas);
const debug = createDebugPanel(game);

// Touch devices get on-screen buttons (shown on the first touch, or up front on coarse pointers).
const touchUI = document.querySelector('.touch');
input.bindTouch(touchUI);
function enableTouch() {
  if (!touchUI.hidden) return;
  touchUI.hidden = false;
  document.body.classList.add('touch-ui');
  fit();
}
if (window.matchMedia('(pointer: coarse)').matches) enableTouch();
window.addEventListener('touchstart', () => { unlockAudio(); enableTouch(); }, { passive: true });

// One fixed 60 Hz simulation step.
function step(force = false) {
  input.update();
  game.step(input, force);
}

window.addEventListener('keydown', (e) => {
  unlockAudio();
  if (isFormField(e.target)) return;
  if (e.code === 'Backquote') debug.toggle();
  else if (e.code === 'KeyR') game.restart();
  else if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyP' && game.state === 'play') game.paused = !game.paused;
  else if (e.code === 'KeyN' && game.paused) step(true);
});
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('blur', () => { if (game.state === 'play') game.paused = true; });

// Fixed timestep with render interpolation: physics is identical at 60, 120 or 144 Hz.
let last = performance.now();
let acc = 0;
let frames = 0, fps = 0, fpsTime = last;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt * game.opts.timeScale;
  let steps = 0;
  while (acc >= STEP && steps < 5) { step(); acc -= STEP; steps++; }
  if (steps === 5) acc = 0;
  renderer.draw(game, game.paused ? 1 : acc / STEP);

  frames++;
  if (now - fpsTime >= 500) { fps = Math.round((frames * 1000) / (now - fpsTime)); frames = 0; fpsTime = now; }
  debug.update(fps);
  requestAnimationFrame(frame);
}

// Integer scaling keeps every pixel square; very small screens fall back to fractional.
function fit() {
  // In portrait with touch controls, keep the bottom clear for the buttons.
  const touching = document.body.classList.contains('touch-ui');
  const reserve = touching && window.innerHeight > window.innerWidth ? 230 : 0;
  document.documentElement.style.setProperty('--reserve', `${reserve}px`);
  const s = Math.min(window.innerWidth / VIEW_W, (window.innerHeight - reserve) / VIEW_H);
  const scale = s >= 2 ? Math.floor(s) : s;
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
}
window.addEventListener('resize', fit);
fit();
requestAnimationFrame(frame);

// Handle for poking at the game from the console.
window.mousecapades = { game, step };
