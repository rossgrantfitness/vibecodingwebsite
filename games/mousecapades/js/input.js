// Keyboard + gamepad, sampled once per fixed step so "pressed" means "pressed this step".

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  KeyZ: 'jump', Space: 'jump', KeyK: 'jump',
  KeyX: 'run', ShiftLeft: 'run', ShiftRight: 'run', KeyJ: 'run',
  Enter: 'start', Escape: 'start',
};

const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'run', 'start'];
const DEADZONE = 0.4;

export function isFormField(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
}

export class Input {
  constructor() {
    this.codes = new Set();   // physical keys currently down
    this.latched = new Set(); // actions pressed since the last step, so sub-frame taps still register
    this.held = {};
    this.pressed = {};
    this.released = {};
    for (const a of ACTIONS) this.held[a] = this.pressed[a] = this.released[a] = false;

    window.addEventListener('keydown', (e) => {
      const action = KEYS[e.code];
      if (!action || isFormField(e.target)) return;
      e.preventDefault();
      if (e.repeat) return;
      this.codes.add(e.code);
      this.latched.add(action);
    });
    window.addEventListener('keyup', (e) => this.codes.delete(e.code));
    window.addEventListener('blur', () => this.codes.clear());
  }

  update() {
    const pad = readGamepads();
    for (const a of ACTIONS) {
      let down = pad[a];
      if (!down) for (const c of this.codes) if (KEYS[c] === a) { down = true; break; }
      const was = this.held[a];
      this.pressed[a] = (down && !was) || this.latched.has(a);
      this.released[a] = !down && was;
      this.held[a] = down;
    }
    this.latched.clear();
  }
}

// Standard mapping: bottom/right face = jump (SNES B/A), left/top face or triggers = run (SNES Y/X).
function readGamepads() {
  const out = { left: false, right: false, up: false, down: false, jump: false, run: false, start: false };
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p || !p.connected) continue;
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    const ax = p.axes[0] || 0;
    const ay = p.axes[1] || 0;
    out.left ||= b(14) || ax < -DEADZONE;
    out.right ||= b(15) || ax > DEADZONE;
    out.up ||= b(12) || ay < -DEADZONE;
    out.down ||= b(13) || ay > DEADZONE;
    out.jump ||= b(0) || b(1);
    out.run ||= b(2) || b(3) || b(6) || b(7);
    out.start ||= b(9);
  }
  return out;
}
