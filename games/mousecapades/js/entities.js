import { TILE } from './config.js';
import { Body } from './body.js';

// Ground enemy. Scuttlebots can be stomped; Spikebots can't. Cautious ones turn at ledges.
export class Walker extends Body {
  constructor(level, spec) {
    super(level, spec.c * TILE + 2, spec.r * TILE - 10, 12, 10);
    this.spiky = !!spec.spiky;
    this.cautious = !!spec.cautious;
    this.stompable = !this.spiky;
    this.speed = this.spiky ? 0.4 : 0.5;
    this.dir = spec.dir || -1;
    this.vy = 0;
    this.alive = true;
    this.active = false;
    this.dead = null; // 'squash' | 'knock'
    this.timer = 0;
    this.anim = 0;
  }

  update() {
    this.savePrev();
    if (this.dead) return deadUpdate(this);
    this.anim += 0.12;
    if (this.cautious && this.onGround() && !this.groundAhead()) this.dir *= -1;
    if (this.moveX(this.dir * this.speed)) this.dir *= -1;
    this.vy = Math.min(4, this.vy + 0.25);
    if (this.moveY(this.vy)) this.vy = 0;
    if (this.y > this.level.height + 32) this.remove = true;
  }

  groundAhead() {
    const x = this.dir > 0 ? this.x + this.w : this.x - 1;
    const below = this.y + this.h;
    return this.level.solidAt(x, below, 1, 1) || this.level.semiBelow(x, this.y, 1, this.h);
  }

  stomp() {
    this.alive = false;
    this.dead = 'squash';
    this.timer = 30;
  }

  knock(dir) { knockOut(this, dir); }
}

// Flying enemy that patrols along a sine wave (axis 'x' or 'y'). Ignores tiles.
export class Drone extends Body {
  constructor(level, spec) {
    super(level, spec.c * TILE + 2, spec.r * TILE + 3, 12, 9);
    this.baseX = this.x;
    this.baseY = this.y;
    this.axis = spec.axis || 'y';
    this.range = (spec.range ?? 1.5) * TILE;
    this.period = spec.period || 150;
    this.t = spec.phase || 0;
    this.stompable = true;
    this.alive = true;
    this.active = false;
    this.dead = null;
    this.dir = -1;
    this.anim = 0;
  }

  update() {
    this.savePrev();
    if (this.dead) return deadUpdate(this);
    this.anim += 0.5;
    this.t++;
    const s = Math.sin((this.t / this.period) * Math.PI * 2) * this.range;
    if (this.axis === 'x') {
      const nx = Math.round(this.baseX + s);
      if (nx !== this.x) this.dir = Math.sign(nx - this.x);
      this.x = nx;
      this.y = Math.round(this.baseY + Math.sin(this.t / 12) * 1.5);
    } else {
      this.y = Math.round(this.baseY + s);
    }
  }

  // Stomped drones lose their rotor and drop; bumped ones get flung.
  stomp() { knockOut(this, 0); this.vy = 0.5; }
  knock(dir) { knockOut(this, dir); }
}

function knockOut(e, dir) {
  e.alive = false;
  e.dead = 'knock';
  e.vx = dir * 1.2;
  e.vy = -3.5;
}

// Dead enemies don't collide: squashed ones linger flat, knocked ones tumble off screen.
function deadUpdate(e) {
  if (e.dead === 'squash') {
    if (--e.timer <= 0) e.remove = true;
    return;
  }
  e.x += e.vx;
  e.vy = Math.min(5, e.vy + 0.25);
  e.y += e.vy;
  if (e.y > e.level.height + 32) e.remove = true;
}

export function makeEnemy(level, spec) {
  return spec.type === 'drone' ? new Drone(level, spec) : new Walker(level, spec);
}
