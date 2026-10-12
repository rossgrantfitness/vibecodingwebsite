// Keyboard + gamepad, sampled once per fixed step so "pressed" means "pressed this step".

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  KeyZ: 'jump', Space: 'jump', KeyK: 'jump',
  KeyX: 'run', ShiftLeft: 'run', ShiftRight: 'run', KeyJ: 'run',
  KeyC: 'punch', KeyL: 'punch',
  KeyV: 'kick', Semicolon: 'kick',
  Enter: 'start', Escape: 'start',
};

const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'run', 'punch', 'kick', 'start'];
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
    this.touch = {};          // on-screen buttons currently held
    for (const a of ACTIONS) this.held[a] = this.pressed[a] = this.released[a] = this.touch[a] = false;

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

  // Wire on-screen buttons (elements with data-action). Each tracks its own pointer, so
  // holding run while tapping jump works with two thumbs.
  bindTouch(root) {
    root.querySelectorAll('[data-action]').forEach((el) => {
      const action = el.dataset.action;
      const press = (e) => {
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
        this.touch[action] = true;
        this.latched.add(action);
        el.classList.add('on');
      };
      const release = () => {
        this.touch[action] = false;
        el.classList.remove('on');
      };
      el.addEventListener('pointerdown', press);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  // Floating joystick: the first touch in `zone` drops the stick under the thumb; dragging past
  // its rim drags the whole stick along, so it never runs out of travel. Maps to left/right/up/down.
  bindJoystick(zone) {
    const stick = zone.querySelector('.stick');
    const knob = zone.querySelector('.knob');
    const R = 44;        // knob travel, px
    const DEAD = 12;     // horizontal dead zone
    const VERT = 26;     // up/down need a deliberate push, so walking never ducks by accident
    let id = null, ox = 0, oy = 0;
    const place = (x, y) => {
      const r = zone.getBoundingClientRect();
      stick.style.left = `${x - r.left}px`;
      stick.style.top = `${y - r.top}px`;
    };
    const rest = () => {
      const r = zone.getBoundingClientRect();
      place(r.left + 76, r.bottom - 92);
    };
    const set = (dx, dy) => {
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const ax = Math.abs(dx), ay = Math.abs(dy);
      const vertical = ay > VERT && ay > ax;
      this.touch.left = dx < -DEAD && ax >= ay * 0.5;
      this.touch.right = dx > DEAD && ax >= ay * 0.5;
      this.touch.down = vertical && dy > 0;
      this.touch.up = vertical && dy < 0;
    };
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      try { zone.setPointerCapture(id); } catch { /* synthetic pointer */ }
      ox = e.clientX;
      oy = e.clientY;
      place(ox, oy);
      stick.classList.add('on');
      set(0, 0);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { // follow the thumb
        ox += (dx / d) * (d - R);
        oy += (dy / d) * (d - R);
        place(ox, oy);
        dx = e.clientX - ox;
        dy = e.clientY - oy;
      }
      set(dx, dy);
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      stick.classList.remove('on');
      set(0, 0);
      rest();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => { if (id === null) rest(); });
    return rest; // call once the controls are visible
  }

  update() {
    const pad = readGamepads();
    for (const a of ACTIONS) {
      let down = pad[a] || this.touch[a];
      if (!down) for (const c of this.codes) if (KEYS[c] === a) { down = true; break; }
      const was = this.held[a];
      this.pressed[a] = (down && !was) || this.latched.has(a);
      this.released[a] = !down && was;
      this.held[a] = down;
    }
    this.latched.clear();
  }
}

// Standard mapping: bottom face = jump (SNES B), left face, shoulders or triggers = run (SNES Y),
// top face = punch, right face = kick.
function readGamepads() {
  const out = { left: false, right: false, up: false, down: false, jump: false, run: false, punch: false, kick: false, start: false };
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
    out.jump ||= b(0);
    out.run ||= b(2) || b(4) || b(5) || b(6) || b(7);
    out.punch ||= b(3);
    out.kick ||= b(1);
    out.start ||= b(9);
  }
  return out;
}
