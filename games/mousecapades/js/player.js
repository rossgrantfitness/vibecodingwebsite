import { TILE, PLAYER_W, PLAYER_H, PLAYER_DUCK_H, MAX_HP } from './config.js';
import { Body } from './body.js';

const W = PLAYER_W;
const STAND_H = PLAYER_H;
const DUCK_H = PLAYER_DUCK_H;
const NO_INPUT = { held: {}, pressed: {} };

// Beat-'em-up moves. Times are frames: the hitbox is live from `on` to `off`, and the move can be
// cancelled into the next one (or a jump) from `off + 2`. `box` is [x, y, w, h], with x measured
// outward from her front edge and y up from her feet. `frames` lists [until t, anim, index].
export const MOVES = {
  jab:     { dur: 13, on: 3, off: 6, box: [-2, -13, 12, 6], dmg: 1, next: 'cross', frames: [[3, 'punch', 3], [99, 'punch', 0]] },
  cross:   { dur: 13, on: 3, off: 6, box: [-2, -12, 13, 6], dmg: 1, next: 'upper', frames: [[3, 'punch', 3], [99, 'punch', 1]] },
  upper:   { dur: 24, on: 4, off: 9, box: [-3, -21, 13, 16], dmg: 2, knock: true, step: 1.1, frames: [[4, 'punch', 3], [99, 'punch', 2]] },
  kick:    { dur: 22, on: 6, off: 10, box: [-1, -9, 14, 6], dmg: 2, push: 2.6, frames: [[6, 'kick', 0], [17, 'kick', 1], [99, 'kick', 0]] },
  sweep:   { dur: 24, on: 6, off: 11, box: [-2, -4, 16, 4], dmg: 1, knock: true, frames: [[5, 'kick', 0], [99, 'kick', 2]] },
  flykick: { dur: 30, on: 3, off: 24, box: [-2, -10, 12, 9], dmg: 2, knock: true, air: true, frames: [[99, 'kick', 3]] },
};

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
    this.hp = MAX_HP;
    this.invuln = 0;    // i-frames after a hit (she flickers)
    this.hurtT = 0;     // knocked back, no control
    this.attack = null; // { kind, t, hits }
    this.queued = null; // attack button pressed early, kept for a few frames
    this.comboT = 0;    // window to chain into the next punch
    this.lastMove = null;
    this.airAttacked = false;
    this.sx = 1; // squash & stretch, visual only
    this.sy = 1;
    this.grounded = this.onGround();
  }

  update(rawInput, T, emit) {
    this.savePrev();
    if (this.invuln > 0) this.invuln--;
    const stunned = this.hurtT > 0;
    if (stunned) this.hurtT--;
    const input = stunned ? NO_INPUT : rawInput;

    this.updateAttack(input, T, emit);
    const atk = this.attack;
    const move = atk && MOVES[atk.kind];
    const planted = !!move && !move.air; // ground moves root her feet
    const facing = this.facing;
    const dir = planted ? 0 : (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);

    // Duck starts only on the ground and ends when down is released and there's headroom.
    if (!atk) {
      if (input.held.down && this.grounded && !this.ducking) this.setDuck(true);
      else if (!input.held.down && this.ducking) this.setDuck(false);
    }

    // --- Horizontal: SMW-style momentum. Accelerate toward a top speed set by walk/run/P-meter,
    // skid hard when pushing against your motion, coast to a stop with friction.
    const walkDir = this.ducking && this.grounded ? 0 : dir;
    const top = !input.held.run ? T.walkSpeed
      : this.pMeter >= T.pMeterFrames ? T.sprintSpeed : T.runSpeed;
    const speed = Math.abs(this.vx);
    const moving = Math.sign(this.vx);
    this.skidding = false;

    if (planted && this.grounded) {
      this.vx = atk.t === move.on && move.step ? facing * move.step : this.vx * 0.8;
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
    } else if (this.grounded) {
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
    if (planted && this.jumpBuffer > 0 && atk.t >= move.off) this.attack = null; // jump cancels recovery
    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0) && !(planted && this.attack)) {
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
    if (move?.air) this.facing = facing; // a flying kick keeps its direction

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
      this.airAttacked = false;
      if (move?.air) this.attack = null;
    } else if (planted && this.attack) {
      this.attack = null; // walked or got pushed off a ledge mid-punch
    }

    // --- Presentation state.
    this.sx += (1 - this.sx) * 0.2;
    this.sy += (1 - this.sy) * 0.2;
    const absVx = Math.abs(this.vx);
    if (this.hurtT > 0) this.state = 'hurt';
    else if (this.attack) this.state = 'attack';
    else if (this.ducking) this.state = 'duck';
    else if (!this.grounded) this.state = this.vy < 0 ? 'jump' : 'fall';
    else if (this.skidding) this.state = 'skid';
    else if (absVx < 0.05) this.state = 'idle';
    else if (this.pMeter >= T.pMeterFrames && absVx > T.runSpeed) this.state = 'sprint';
    else this.state = absVx > T.walkSpeed + 0.05 ? 'run' : 'walk';
    if (this.grounded && absVx >= 0.05) this.anim += 0.08 + absVx * 0.07;
    else if (!this.grounded) this.anim += 0.1;
  }

  // Start, advance, chain and finish attacks. Punch chains jab → cross → uppercut; kick is a heavy
  // front kick. Down + punch is an uppercut, down + kick a sweep, either button in the air (or kick
  // at a run) is a flying kick.
  updateAttack(input, T, emit) {
    const btn = input.pressed.punch ? 'punch' : input.pressed.kick ? 'kick' : null;
    if (btn) this.queued = { btn, t: 8 };
    else if (this.queued && --this.queued.t < 0) this.queued = null;

    const a = this.attack;
    if (a) {
      a.t++;
      const m = MOVES[a.kind];
      if (this.queued && !m.air && a.t >= m.off + 2) {
        const next = this.queued.btn === 'punch' ? m.next : a.kind === 'kick' || a.kind === 'sweep' ? null : 'kick';
        if (next) return this.startAttack(next, emit);
      }
      if (a.t < m.dur) return;
      this.attack = null;
      this.lastMove = a.kind;
      this.comboT = 14;
    }
    if (this.comboT > 0) this.comboT--;
    if (!this.queued) return;

    const { btn: b } = this.queued;
    const low = this.grounded && (input.held.down || this.ducking);
    let kind;
    if (!this.grounded) {
      if (this.airAttacked) return;
      kind = 'flykick';
    } else if (low) {
      kind = b === 'kick' ? 'sweep' : 'upper';
    } else if (b === 'kick' && Math.abs(this.vx) >= T.runSpeed - 0.05) {
      kind = 'flykick'; // running jump kick: a short hop that keeps all her momentum
      this.vy = -3;
      this.grounded = false;
      this.coyote = 0;
    } else if (b === 'kick') {
      kind = 'kick';
    } else {
      kind = this.comboT > 0 && MOVES[this.lastMove]?.next || 'jab';
    }
    this.startAttack(kind, emit);
  }

  startAttack(kind, emit) {
    if (this.ducking) this.setDuck(false);
    this.attack = { kind, t: 0, hits: new Set() };
    this.queued = null;
    this.comboT = 0;
    if (kind === 'flykick') this.airAttacked = true;
    emit('attack', this, kind);
  }

  // The live hitbox in world pixels, or null outside the active frames.
  attackBox() {
    const a = this.attack;
    if (!a) return null;
    const m = MOVES[a.kind];
    if (a.t < m.on || a.t > m.off) return null;
    const [bx, by, bw, bh] = m.box;
    const x = this.facing > 0 ? this.x + this.w + bx : this.x - bx - bw;
    return { x, y: this.y + this.h + by, w: bw, h: bh, move: m, hits: a.hits };
  }

  // Took a hit: lose a heart, get knocked back, flicker for a while. Returns false if invulnerable.
  hurt(dir) {
    if (this.invuln > 0 || this.hurtT > 0) return false;
    this.hp--;
    this.invuln = 90;
    this.hurtT = 22;
    this.attack = null;
    this.queued = null;
    if (this.ducking) this.setDuck(false);
    this.vx = dir * 1.6;
    this.vy = -2.6;
    this.grounded = false;
    this.jumpHeld = false;
    return true;
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
