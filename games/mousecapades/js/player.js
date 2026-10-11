import { TILE } from './config.js';

const W = 10;
const STAND_H = 14;
const DUCK_H = 9;

// Position is an integer pixel (top-left of the hitbox) plus a sub-pixel remainder, and movement
// steps one pixel at a time against the tilemap, so collisions are exact at any speed.
export class Player {
  constructor(level) {
    this.level = level;
    this.reset(level.spawn.x, level.spawn.y);
  }

  reset(x, y) {
    this.w = W;
    this.h = STAND_H;
    this.x = x;
    this.y = y;
    this.rx = 0;
    this.ry = 0;
    this.px = x; // previous-step position, for render interpolation
    this.py = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumpHeld = false;
    this.pMeter = 0;
    this.ducking = false;
    this.skidding = false;
    this.state = 'idle';
    this.anim = 0;
    this.sx = 1; // squash & stretch, visual only
    this.sy = 1;
    this.safeX = x;
    this.safeY = y;
    this.grounded = this.onGround();
  }

  update(input, T, emit) {
    const L = this.level;
    this.px = this.x + this.rx;
    this.py = this.y + this.ry;
    const dir = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);

    // Duck starts only on the ground and ends when down is released and there's headroom.
    if (input.held.down && this.grounded && !this.ducking) this.setDuck(true);
    else if (!input.held.down && this.ducking) this.setDuck(false);

    // --- Horizontal: SMW-style momentum. Accelerate toward a top speed set by walk/run/P-meter,
    // skid hard when pushing against your motion, coast to a stop with friction.
    const walkDir = this.ducking && this.grounded ? 0 : dir;
    const top = !input.held.run ? T.walkSpeed
      : this.pMeter >= T.pMeterFrames ? T.sprintSpeed : T.runSpeed;
    const speed = Math.abs(this.vx);
    const moving = Math.sign(this.vx);
    this.skidding = false;

    if (this.grounded) {
      if (walkDir !== 0) {
        if (moving === -walkDir) {
          this.vx += walkDir * T.skidDecel;
          this.skidding = true;
          emit('skid', this);
        } else if (speed < top) {
          this.vx = walkDir * Math.min(top, speed + T.groundAccel);
        } else {
          this.vx = walkDir * Math.max(top, speed - T.groundFriction);
        }
        this.facing = walkDir;
      } else {
        this.vx = moving * Math.max(0, speed - (this.ducking ? T.duckFriction : T.groundFriction));
      }
    } else if (walkDir !== 0) {
      if (moving === -walkDir) this.vx += walkDir * T.airTurnAccel;
      else if (speed < top) this.vx = walkDir * Math.min(top, speed + T.airAccel);
      // Above top speed in the air (e.g. run released mid-jump): keep the momentum.
      this.facing = walkDir;
    } else {
      this.vx = moving * Math.max(0, speed - T.airFriction);
    }

    // P-meter charges while running flat out on the ground, holds in the air, drains otherwise.
    if (this.grounded) {
      const charging = input.held.run && walkDir !== 0 && moving === walkDir && speed >= T.runSpeed - 0.001;
      this.pMeter = charging ? Math.min(T.pMeterFrames, this.pMeter + 1) : Math.max(0, this.pMeter - 2);
    }

    // --- Jump, with coyote time (late jumps off ledges) and buffering (early presses before landing).
    if (this.grounded) this.coyote = T.coyoteFrames;
    if (input.pressed.jump) this.jumpBuffer = T.jumpBufferFrames;
    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0)) {
      if (this.ducking) this.setDuck(false);
      this.vy = -(T.jumpVelocity + Math.abs(this.vx) * T.jumpSpeedBonus);
      this.jumpHeld = input.held.jump;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.sx = 0.75;
      this.sy = 1.3;
      emit('jump', this);
    }
    if (!this.grounded) this.coyote = Math.max(0, this.coyote - 1);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - 1);
    if (!input.held.jump || this.vy >= 0) this.jumpHeld = false;

    // Gravity: light while rising with jump held (variable height), lighter still at the apex.
    if (!this.grounded) {
      let g = this.jumpHeld ? T.gravityHeld : T.gravity;
      if (this.jumpHeld && Math.abs(this.vy) < T.apexThreshold) g *= T.apexGravityMult;
      this.vy = Math.min(T.maxFallSpeed, this.vy + g);
    }

    // --- Move and collide.
    this.moveX(this.vx);
    const fall = this.vy;
    if (this.moveY(this.vy, T.cornerCorrection)) {
      this.vy = 0;
      if (fall < 0) {
        this.jumpHeld = false;
        emit('bump', this);
      }
    }

    const wasGrounded = this.grounded;
    this.grounded = this.vy >= 0 && this.onGround();
    if (this.grounded) {
      this.vy = 0;
      this.ry = 0;
      if (!wasGrounded) {
        const k = Math.min(1, Math.max(0.3, fall / T.maxFallSpeed));
        this.sx = 1 + 0.35 * k;
        this.sy = 1 - 0.3 * k;
        emit('land', this, fall);
      }
      // Remember the last spot with solid footing under both edges, for respawning after a fall.
      const row = (this.y + this.h) / TILE;
      if (!this.ducking && L.get(Math.floor(this.x / TILE), row) && L.get(Math.floor((this.x + this.w - 1) / TILE), row)) {
        this.safeX = this.x;
        this.safeY = this.y;
      }
    }

    // --- Presentation state.
    this.sx += (1 - this.sx) * 0.2;
    this.sy += (1 - this.sy) * 0.2;
    const absVx = Math.abs(this.vx);
    if (this.ducking) this.state = 'duck';
    else if (!this.grounded) this.state = this.vy < 0 ? 'jump' : 'fall';
    else if (this.skidding) this.state = 'skid';
    else if (absVx < 0.05) this.state = 'idle';
    else if (this.pMeter >= T.pMeterFrames && absVx > T.runSpeed) this.state = 'sprint';
    else this.state = absVx > T.walkSpeed + 0.05 ? 'run' : 'walk';
    if (this.grounded && absVx >= 0.05) this.anim += 0.08 + absVx * 0.07;
  }

  setDuck(on) {
    const dh = STAND_H - DUCK_H;
    if (on) {
      this.y += dh;
      this.h = DUCK_H;
      this.ducking = true;
    } else if (!this.level.solidAt(this.x, this.y - dh, this.w, STAND_H)) {
      this.y -= dh;
      this.h = STAND_H;
      this.ducking = false;
    }
  }

  onGround() {
    return this.level.solidAt(this.x, this.y + 1, this.w, this.h) || this.level.semiBelow(this.x, this.y, this.w, this.h);
  }

  moveX(amount) {
    this.rx += amount;
    let move = Math.round(this.rx);
    if (move === 0) return false;
    this.rx -= move;
    const s = Math.sign(move);
    while (move !== 0) {
      if (this.level.solidAt(this.x + s, this.y, this.w, this.h)) {
        this.vx = 0;
        this.rx = 0;
        return true;
      }
      this.x += s;
      move -= s;
    }
    return false;
  }

  // Returns true if blocked. Rising into a block corner nudges sideways up to `corner` px instead.
  moveY(amount, corner) {
    const L = this.level;
    this.ry += amount;
    let move = Math.round(this.ry);
    if (move === 0) return false;
    this.ry -= move;
    const s = Math.sign(move);
    while (move !== 0) {
      const blocked = s > 0
        ? L.solidAt(this.x, this.y + 1, this.w, this.h) || L.semiBelow(this.x, this.y, this.w, this.h)
        : L.solidAt(this.x, this.y - 1, this.w, this.h) && !this.cornerNudge(corner);
      if (blocked) {
        this.ry = 0;
        return true;
      }
      this.y += s;
      move -= s;
    }
    return false;
  }

  cornerNudge(max) {
    const L = this.level;
    for (let d = 1; d <= max; d++) {
      for (const dx of [d, -d]) {
        if (!L.solidAt(this.x + dx, this.y - 1, this.w, this.h) && !L.solidAt(this.x + dx, this.y, this.w, this.h)) {
          this.x += dx;
          this.rx = 0;
          return true;
        }
      }
    }
    return false;
  }
}
