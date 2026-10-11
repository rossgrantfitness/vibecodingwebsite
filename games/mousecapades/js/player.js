import { TILE } from './config.js';
import { Body } from './body.js';

const W = 10;
const STAND_H = 14;
const DUCK_H = 9;

export class Player extends Body {
  constructor(level) {
    super(level, level.spawn.x, level.spawn.y, W, STAND_H);
    this.reset(level.spawn.x, level.spawn.y);
  }

  reset(x, y) {
    this.place(x, y);
    this.w = W;
    this.h = STAND_H;
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
    this.grounded = this.onGround();
  }

  update(input, T, emit) {
    const L = this.level;
    this.savePrev();
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
    if (this.moveX(this.vx)) this.vx = 0;
    const fall = this.vy;
    if (this.moveY(this.vy, T.cornerCorrection)) {
      this.vy = 0;
      if (fall < 0) {
        this.jumpHeld = false;
        emit('bump', this, this.headTile());
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
    else if (!this.grounded) this.anim += 0.1;
  }

  // Bounce off a stomped enemy. Holding jump gives the higher, floatier bounce.
  bounce(T, held) {
    this.vy = -T.stompBounce;
    this.jumpHeld = held;
    this.grounded = false;
    this.coyote = 0;
    this.sx = 0.8;
    this.sy = 1.25;
  }

  // The tile the player's head just hit: the one above her centre, else whichever corner hit.
  headTile() {
    const r = Math.floor((this.y - 1) / TILE);
    const cx = Math.floor((this.x + this.w / 2) / TILE);
    if (this.level.isSolid(cx, r)) return { c: cx, r };
    const cl = Math.floor(this.x / TILE);
    return { c: this.level.isSolid(cl, r) ? cl : Math.floor((this.x + this.w - 1) / TILE), r };
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
}
