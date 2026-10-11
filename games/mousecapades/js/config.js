// Movement tuning. Units are pixels and frames at a fixed 60 Hz step:
// speeds are px/frame, accelerations are px/frame². Every value in DEFAULTS is live-editable
// from the debug panel (` key); once something feels right, copy the values back into DEFAULTS.

export const TILE = 16;
export const VIEW_W = 320;
export const VIEW_H = 180;
export const STEP = 1 / 60;

// Player hitbox (the sprite's ear tips overhang the top a little).
export const PLAYER_W = 10;
export const PLAYER_H = 17;
export const PLAYER_DUCK_H = 11;

export const DEFAULTS = {
  // Ground
  walkSpeed: 1.5,
  runSpeed: 2.5,
  sprintSpeed: 3.25,
  groundAccel: 0.09,
  groundFriction: 0.07,
  skidDecel: 0.25,
  duckFriction: 0.045,
  pMeterFrames: 60,
  // Air
  airAccel: 0.09,
  airTurnAccel: 0.16,
  airFriction: 0.01,
  // Jump
  jumpVelocity: 5.0,
  jumpSpeedBonus: 0.2,
  gravityHeld: 0.17,
  gravity: 0.5,
  apexThreshold: 0.6,
  apexGravityMult: 0.6,
  maxFallSpeed: 4.5,
  stompBounce: 5.0,
  // Assists
  coyoteFrames: 6,
  jumpBufferFrames: 6,
  cornerCorrection: 4,
  // Camera
  cameraLookahead: 40,
  cameraPanSpeed: 1.5,
  cameraLerpY: 0.1,
};

// Debug panel layout: [key, min, max, step, label].
export const PARAMS = [
  { group: 'Ground', items: [
    ['walkSpeed', 0.5, 3, 0.05, 'Walk top speed'],
    ['runSpeed', 1, 4, 0.05, 'Run top speed'],
    ['sprintSpeed', 1, 5, 0.05, 'Sprint top speed (P-meter full)'],
    ['groundAccel', 0.01, 0.4, 0.005, 'Acceleration'],
    ['groundFriction', 0.005, 0.4, 0.005, 'Friction (no input)'],
    ['skidDecel', 0.02, 0.6, 0.01, 'Skid / turnaround'],
    ['duckFriction', 0.005, 0.3, 0.005, 'Duck-slide friction'],
    ['pMeterFrames', 0, 180, 1, 'P-meter charge (frames)'],
  ]},
  { group: 'Air', items: [
    ['airAccel', 0, 0.4, 0.005, 'Air acceleration'],
    ['airTurnAccel', 0, 0.6, 0.01, 'Air turnaround'],
    ['airFriction', 0, 0.2, 0.005, 'Air drag (no input)'],
  ]},
  { group: 'Jump', items: [
    ['jumpVelocity', 2, 9, 0.05, 'Jump launch speed'],
    ['jumpSpeedBonus', 0, 0.8, 0.01, 'Extra launch per run speed'],
    ['gravityHeld', 0.05, 0.8, 0.005, 'Gravity rising (jump held)'],
    ['gravity', 0.1, 1.2, 0.01, 'Gravity (released / falling)'],
    ['apexThreshold', 0, 2, 0.05, 'Apex hang window (|vy| <)'],
    ['apexGravityMult', 0.1, 1, 0.05, 'Apex hang gravity ×'],
    ['maxFallSpeed', 1, 8, 0.1, 'Max fall speed'],
    ['stompBounce', 1, 8, 0.05, 'Stomp bounce speed'],
  ]},
  { group: 'Assists', items: [
    ['coyoteFrames', 0, 15, 1, 'Coyote time (frames)'],
    ['jumpBufferFrames', 0, 15, 1, 'Jump buffer (frames)'],
    ['cornerCorrection', 0, 8, 1, 'Head corner nudge (px)'],
  ]},
  { group: 'Camera', items: [
    ['cameraLookahead', 0, 100, 1, 'Look-ahead (px)'],
    ['cameraPanSpeed', 0.25, 6, 0.25, 'Look-ahead pan speed'],
    ['cameraLerpY', 0.02, 1, 0.01, 'Vertical follow'],
  ]},
];

const STORAGE_KEY = 'mousecapades.tuning.v1';

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') {
      return Object.fromEntries(Object.entries(saved).filter(([k, v]) => k in DEFAULTS && typeof v === 'number'));
    }
  } catch { /* storage unavailable or corrupt: fall back to defaults */ }
  return {};
}

// The live tuning object everything reads from.
export const T = { ...DEFAULTS, ...loadSaved() };

export function saveTuning() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(T)); } catch { /* ignore */ }
}

export function resetTuning() {
  Object.assign(T, DEFAULTS);
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
