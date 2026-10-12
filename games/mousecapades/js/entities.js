import { TILE } from './config.js';
import { Body } from './body.js';
import { sfx } from './audio.js';

// Shared beat-'em-up reactions. A hit either staggers an enemy (short hitstun and a shove), knocks
// it down (it flies back, lies still, gets up) or, at 0 hp, knocks it out (flies back, blinks out).
class Enemy extends Body {
  constructor(level, x, y, w, h, hp) {
    super(level, x, y, w, h);
    this.hp = this.maxHp = hp;
    this.alive = true;
    this.active = false;
    this.dead = null; // 'squash' | 'knock' (tumbles off screen) | 'ko' (lies there, blinks out)
    this.stun = 0;
    this.down = 0;
    this.flash = 0;
    this.vx = 0;
    this.vy = 0;
    this.dir = -1;
    this.anim = 0;
    this.timer = 0;
  }

  get harmful() { return this.alive && !this.stun && !this.down; }
  get hittable() { return this.alive && !this.down; }

  // dir is the direction of the blow. Returns 'hit' | 'down' | 'ko'.
  hit(dmg, dir, knock, push = 1.6) {
    this.hp -= dmg;
    this.flash = 10;
    this.dir = -dir || this.dir; // turn to face whoever hit it
    if (this.hp <= 0) {
      this.alive = false;
      this.dead = 'ko';
      this.timer = 60;
      this.vx = dir * 2.2;
      this.vy = -3;
      return 'ko';
    }
    if (knock) {
      this.down = 55;
      this.vx = dir * 1.9;
      this.vy = -2.6;
      return 'down';
    }
    this.stun = 16;
    this.vx = dir * push;
    return 'hit';
  }

  // Bumped from below through a block: out in one.
  knock(dir) {
    this.hp = 0;
    this.alive = false;
    this.dead = 'knock';
    this.vx = dir * 1.2;
    this.vy = -3.5;
  }

  // Shoved, knocked down or knocked out: slide and fall with tile collision.
  react() {
    if (this.dead === 'knock' || this.dead === 'squash') return deadUpdate(this);
    if (this.flash) this.flash--;
    const grounded = this.vy >= 0 && this.onGround();
    this.vx *= grounded ? 0.8 : 0.98;
    if (Math.abs(this.vx) < 0.05) this.vx = 0;
    if (this.moveX(this.vx)) this.vx = 0;
    this.vy = Math.min(4, this.vy + 0.25);
    if (this.moveY(this.vy)) this.vy = 0;
    if (this.y > this.level.height + 32) { this.alive = false; this.remove = true; return; }
    if (this.dead === 'ko') {
      if (--this.timer <= 0) this.remove = true;
    } else if (this.stun) {
      this.stun--;
    } else if (this.down && grounded) {
      this.down--;
    }
  }

  get reacting() { return !!(this.dead || this.stun || this.down); }

  facePlayer(world, deadzone = 6) {
    const p = world?.player;
    if (!p) return;
    const dx = p.x + p.w / 2 - (this.x + this.w / 2);
    if (Math.abs(dx) > deadzone) this.dir = Math.sign(dx);
  }
}

// Ground enemy. Scuttlebots can be stomped; Spikebots can't, so punch them. Cautious ones turn
// at ledges; chasers (brawl-zone spawns) keep turning toward the player.
export class Walker extends Enemy {
  constructor(level, spec) {
    const spiky = !!spec.spiky;
    super(level, spec.c * TILE + 2, spec.r * TILE - 10, 12, 10, spiky ? 3 : 2);
    this.kind = spiky ? 'spike' : 'scuttle';
    this.spiky = spiky;
    this.cautious = !!spec.cautious;
    this.chase = !!spec.chase;
    this.stompable = !spiky;
    this.speed = spiky ? 0.4 : 0.5;
    this.dir = spec.dir || -1;
  }

  update(world) {
    this.savePrev();
    if (this.reacting) return this.react();
    if (this.flash) this.flash--;
    this.anim += 0.12;
    if (this.chase && ++this.timer % 40 === 0) this.facePlayer(world);
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
    return 'ko';
  }
}

// Flying enemy that patrols along a sine wave (axis 'x' or 'y'). Ignores tiles. One hit downs it.
export class Drone extends Enemy {
  constructor(level, spec) {
    super(level, spec.c * TILE + 2, spec.r * TILE + 3, 12, 9, 1);
    this.kind = 'drone';
    this.baseX = this.x;
    this.baseY = this.y;
    this.axis = spec.axis || 'y';
    this.range = (spec.range ?? 1.5) * TILE;
    this.period = spec.period || 150;
    this.t = spec.phase || 0;
    this.stompable = true;
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

  // Punched or kicked drones get flung; stomped ones lose their rotor and drop.
  hit(dmg, dir) { this.knock(dir); this.vx = dir * 2; return 'ko'; }
  stomp() { this.knock(0); this.vy = 0.5; return 'ko'; }
}

// Frog: sits, turns to face you, croaks (the tell), then lunges. Hops closer when you're far away.
// The big toad is the same frog at 2× with more hp and super armour while it's winding up.
export class Frog extends Enemy {
  constructor(level, spec) {
    const s = spec.big ? 2 : 1;
    const w = 14 * s, h = 11 * s;
    super(level, spec.c * TILE + Math.round((TILE - w) / 2), spec.r * TILE - h, w, h, spec.big ? 22 : 4);
    this.kind = spec.big ? 'toad' : 'frog';
    this.big = !!spec.big;
    this.chase = !!spec.chase;
    this.scale = s;
    this.stompable = true;
    this.dir = spec.dir || -1;
    this.state = 'idle';
    this.timer = 40 + ((spec.c * 7) % 40);
  }

  get armored() { return this.big && (this.state === 'croak' || this.state === 'air'); }

  hit(dmg, dir, knock, push) {
    if (this.big && this.hp > dmg) {
      // Too heavy to knock down: big hits just stagger it, and mid-attack it doesn't flinch.
      this.hp -= dmg;
      this.flash = 10;
      if (!this.armored) {
        this.stun = knock ? 22 : 10;
        this.vx = dir * (knock ? 1.4 : 0.6);
        this.state = 'idle';
        this.timer = 30;
      }
      return knock ? 'down' : 'hit';
    }
    const r = super.hit(dmg, dir, knock, push);
    this.state = 'idle';
    this.timer = 50;
    return r;
  }

  stomp() {
    const r = this.hit(2, 0, false, 0);
    if (r === 'ko') this.vx = 0;
    return r;
  }

  update(world) {
    this.savePrev();
    if (this.reacting) return this.react();
    if (this.flash) this.flash--;
    this.anim += 0.04;
    const p = world.player;
    const dx = p.x + p.w / 2 - (this.x + this.w / 2);
    const dy = p.y + p.h - (this.y + this.h);
    const grounded = this.vy >= 0 && this.onGround();

    if (this.state === 'idle') {
      this.vx = 0;
      if (Math.abs(dx) < 200) this.facePlayer(world);
      if (--this.timer <= 0 && grounded) {
        const reach = this.big ? 130 : 100;
        if (Math.abs(dx) < reach && Math.abs(dy) < 56) {
          this.state = 'croak';
          this.timer = this.big ? 42 : 32;
          sfx('croak');
        } else if (Math.abs(dx) < 260 || this.chase) {
          this.leap(0.9, 2.2); // hop closer
        } else {
          this.timer = 30;
        }
      }
    } else if (this.state === 'croak') {
      if (--this.timer <= 0) {
        this.leap(Math.min(2.6, Math.max(1.2, Math.abs(dx) / 30)), this.big ? 3.8 : 3.3);
        sfx('lunge');
      }
    } else if (this.state === 'air') {
      if (grounded && this.vy >= 0 && this.timer++ > 2) {
        this.state = 'land';
        this.timer = this.big ? 34 : 26;
        this.vx = 0;
        sfx('splash');
      }
    } else if (this.state === 'land') {
      if (--this.timer <= 0) {
        this.state = 'idle';
        this.timer = 45 + ((Math.random() * 40) | 0);
      }
    }

    if (this.moveX(this.vx)) this.vx = 0;
    this.vy = Math.min(4, this.vy + 0.2);
    if (this.moveY(this.vy)) this.vy = 0;
    if (this.y > this.level.height + 32) { this.alive = false; this.remove = true; }
  }

  leap(speed, height) {
    this.state = 'air';
    this.timer = 0;
    this.vx = this.dir * speed;
    this.vy = -height;
  }

  // [anim, index] in the frog atlas.
  frame(clock) {
    if (this.dead === 'ko') return ['die', Math.min(2, Math.floor((60 - this.timer) / 6))];
    if (this.down) return ['die', this.down > 12 ? 2 : 1]; // flat out, then pushing back up
    if (this.stun) return ['hurt', this.stun > 8 ? 1 : 0];
    switch (this.state) {
      case 'croak': return ['croak', Math.min(2, Math.floor(((this.big ? 42 : 32) - this.timer) / 8))];
      case 'air': return ['lunge', 0];
      case 'land': return ['lunge', this.timer > 14 ? 1 + ((clock >> 3) & 1) : 3];
      default: return ['idle', Math.floor(this.anim) % 2 ? 3 : 0];
    }
  }
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
  if (spec.type === 'drone') return new Drone(level, spec);
  if (spec.type === 'frog') return new Frog(level, spec);
  return new Walker(level, spec);
}

export const ENEMY_NAMES = { scuttle: 'SCUTTLEBOT', spike: 'SPIKEBOT', drone: 'DRONE', frog: 'GUTTER FROG', toad: 'BIG TOAD' };
