import { T, TILE, VIEW_W, VIEW_H, PLAYER_H, MAX_HP } from './config.js';
import { BLOCK, USED, METAL } from './level.js';
import { Player } from './player.js';
import { Camera } from './camera.js';
import { FX } from './fx.js';
import { makeEnemy, Frog } from './entities.js';
import { sfx, unlockAudio } from './audio.js';

const BEST_KEY = 'mousecapades.best.v1';
const MULTI_CHIPS = 6;
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// States: title → play ⇄ dying → clear → win. Pausing freezes play.
// Brawl zones lock the screen until every wave of enemies is beaten, then flash GO.
export class Game {
  constructor(buildLevel, { skipTitle = false, trackBest = true } = {}) {
    this.buildLevel = buildLevel;
    this.trackBest = trackBest;
    this.T = T;
    this.fx = new FX();
    this.opts = { hitboxes: false, juice: true, timeScale: 1 };
    this.paused = false;
    this.frame = 0;
    this.best = loadBest();
    this.emit = (type, body, arg) => this.onEvent(type, body, arg);
    this.load();
    this.setState(skipTitle ? 'play' : 'title');
  }

  setState(s) {
    this.state = s;
    this.t = 0;
  }

  // Build a fresh copy of the level and everything in it.
  load() {
    const L = (this.level = this.buildLevel());
    this.player = new Player(L);
    this.camera = new Camera(L);
    this.fx.parts = [];
    this.pickups = [];
    this.enemySpecs = [];
    this.checkpoint = null;
    this.goal = null;
    let golds = 0;
    for (const e of L.entities) {
      if (e.type === 'chip') this.pickups.push({ kind: 'chip', x: e.c * TILE + 4, y: Math.round(e.r * TILE + 4), w: 8, h: 8 });
      else if (e.type === 'gold') this.pickups.push({ kind: 'gold', index: golds++, x: e.c * TILE + 2, y: e.r * TILE + 2, w: 12, h: 12 });
      else if (e.type === 'checkpoint') this.checkpoint = { x: e.c * TILE + 6, y: e.r * TILE - 32, w: 4, h: 32, groundY: e.r * TILE, active: false };
      else if (e.type === 'goal') this.goal = { x: e.c * TILE, y: e.r * TILE - 96, w: 36, h: 96, groundY: e.r * TILE };
      else this.enemySpecs.push(e);
    }
    this.blockLeft = new Map([...L.blockItems].map(([k, v]) => [k, v === 'multi' ? MULTI_CHIPS : 1]));
    const blockChips = [...this.blockLeft.values()].reduce((a, b) => a + b, 0);
    this.stats = {
      chips: 0,
      chipsTotal: this.pickups.filter((p) => p.kind === 'chip').length + blockChips,
      gold: Array(golds).fill(false),
      deaths: 0,
      stomps: 0,
      kos: 0,
      frames: 0,
    };
    this.respawnAt = { ...L.spawn };
    this.bumps = [];
    this.popups = [];
    this.hitstop = 0;
    this.shake = 0;
    this.go = 0;
    this.target = null; // last enemy hit, for the HUD health bar
    this.arenas = (L.arenas || []).map((a) => ({ ...a, x: a.c0 * TILE, state: 'idle' }));
    this.arena = null;
    this.newBest = false;
    this.spawnEnemies();
    this.camera.snap(this.player, T);
  }

  spawnEnemies() {
    this.enemies = this.enemySpecs.map((s) => makeEnemy(this.level, s));
  }

  startPlay() {
    this.paused = false;
    this.load();
    this.setState('play');
  }

  step(input, force = false) {
    this.frame++;
    if (this.state === 'play' && input.pressed.start) {
      this.paused = !this.paused;
      sfx('pause');
    }
    if (this.paused && !force) return;
    this.t++;
    if (this.state === 'title') this.stepTitle(input);
    else if (this.state === 'play') this.stepPlay(input);
    else if (this.state === 'dying') this.stepDying();
    else if (this.state === 'clear') this.stepClear();
    else if (this.state === 'win') this.stepWin(input);
    this.fx.update();
  }

  // The level drifts by behind the logo.
  stepTitle(input) {
    const cam = this.camera;
    cam.px = cam.x;
    cam.py = cam.y;
    const span = this.level.width - VIEW_W;
    const d = (this.t * 0.4) % (span * 2);
    cam.x = d > span ? span * 2 - d : d;
    cam.y = this.level.height - VIEW_H;
    if (Math.abs(cam.x - cam.px) > 2) cam.px = cam.x; // no smear at the turnaround
    if (this.t > 20 && (input.pressed.jump || input.pressed.start)) {
      unlockAudio();
      sfx('start');
      this.startPlay();
    }
  }

  stepPlay(input) {
    if (this.shake > 0) this.shake--;
    if (this.hitstop > 0) {
      this.hitstop--;
      this.freeze();
      return;
    }
    const p = this.player;
    this.stats.frames++;
    if (this.go > 0) this.go--;
    if (this.target && --this.target.t <= 0) this.target = null;
    p.update(input, T, this.emit);
    if (p.y > this.level.height + 8) return this.die('pit');
    if (this.arena) this.holdInArena(p);
    this.updateWorld(true);
    this.resolveAttacks();
    this.collideEnemies(input);
    if (this.state !== 'play') return;
    this.collect();
    this.updateArena();
    this.camera.update(p, T);
    if (this.goal && p.x + p.w > this.goal.x + 8) this.clear();
  }

  // Death: a short freeze, then the classic hop off the bottom of the screen.
  stepDying() {
    const p = this.player;
    this.freeze();
    if (this.deathCause !== 'pit') {
      if (this.t === 24) p.vy = -4.2;
      if (this.t > 24) {
        p.vy = Math.min(5, p.vy + 0.22);
        p.y += p.vy;
      }
    }
    if (this.t >= (this.deathCause === 'pit' ? 50 : 110)) this.respawn();
  }

  stepClear() {
    const p = this.player;
    const walking = p.x < this.goal.x + this.goal.w + 24;
    p.update({ held: { right: walking }, pressed: {} }, T, this.emit);
    this.updateWorld(false);
    this.camera.update(p, T);
    if (this.t > 170) this.setState('win');
  }

  stepWin(input) {
    if (this.t > 40 && (input.pressed.jump || input.pressed.start)) {
      sfx('start');
      this.startPlay();
    }
  }

  // Keep render interpolation still while the simulation is held.
  freeze() {
    this.player.savePrev();
    this.camera.px = this.camera.x;
    this.camera.py = this.camera.y;
    for (const e of this.enemies) e.savePrev();
  }

  updateWorld(enemiesMove) {
    const mid = this.camera.x + VIEW_W / 2;
    for (const e of this.enemies) {
      if (!e.active && Math.abs(e.x - mid) < VIEW_W / 2 + 32) e.active = true;
      if (e.active && enemiesMove) e.update(this);
      else e.savePrev();
      // Knocked-out frogs leave a heart behind (unless they went down a pit).
      if (e.remove && e.drop && e.y < this.level.height) {
        this.pickups.push({ kind: 'heal', amount: e.drop, x: Math.round(e.x + e.w / 2 - 4), y: e.y + e.h - 9, w: 9, h: 8 });
      }
    }
    if (this.arena) for (const e of this.arena.mine) this.holdInArena(e, 12);
    this.enemies = this.enemies.filter((e) => !e.remove);
    for (const b of this.bumps) b.t++;
    this.bumps = this.bumps.filter((b) => b.t < 10);
    for (const c of this.popups) {
      c.y += c.vy;
      c.vy += 0.25;
      c.t++;
    }
    this.popups = this.popups.filter((c) => c.t < 22);
  }

  // Her punches and kicks. Each move hits each enemy at most once.
  resolveAttacks() {
    const p = this.player;
    const box = p.attackBox();
    if (!box) return;
    for (const e of this.enemies) {
      if (!e.active || !e.hittable || box.hits.has(e) || !overlap(box, e)) continue;
      box.hits.add(e);
      const m = box.move;
      const r = e.hit(m.dmg, p.facing, !!m.knock, m.push || 1.6);
      const heavy = r !== 'hit';
      const hx = p.facing > 0 ? Math.min(box.x + box.w, e.x + 3) : Math.max(box.x, e.x + e.w - 3);
      const hy = Math.max(e.y + 2, Math.min(e.y + e.h - 2, box.y + box.h / 2));
      this.fx.burst(hx, hy, heavy);
      this.hitstop = Math.max(this.hitstop, heavy ? 7 : 4);
      if (heavy) this.shake = 6;
      this.target = { e, t: 150 };
      if (r === 'ko') this.knockedOut(e);
      else sfx(heavy ? 'smash' : 'hit');
    }
  }

  knockedOut(e) {
    this.stats.kos++;
    if (e instanceof Frog) e.drop = e.big ? 3 : 1;
    sfx('ko');
  }

  // Touching an enemy: land on it from above to stomp it (Mario rules), otherwise it hurts.
  collideEnemies(input) {
    const p = this.player;
    let bounced = false;
    for (const e of this.enemies) {
      if (!e.alive || !e.active || !p.overlaps(e)) continue;
      const fromAbove = bounced || (p.vy > 0 && p.py + p.h <= e.py + 6);
      if (fromAbove && e.stompable && !e.down) {
        const r = e.stomp();
        bounced = true;
        p.y = Math.min(p.y, e.y - p.h);
        p.ry = 0;
        p.bounce(T, input.held.jump);
        this.stats.stomps++;
        this.hitstop = 3;
        this.target = { e, t: 150 };
        this.fx.emit('stomp', e);
        sfx('stomp');
        if (r === 'ko' && e.dead !== 'squash' && e.dead !== 'knock') this.knockedOut(e);
        else if (r === 'ko') this.stats.kos++;
      } else if (e.harmful && p.hurt(Math.sign(p.x + p.w / 2 - (e.x + e.w / 2)) || -p.facing)) {
        this.hitstop = 5;
        this.shake = 5;
        this.fx.burst(p.x + p.w / 2, p.y + 6, false);
        sfx('hurt');
        if (p.hp <= 0) return this.die('hit');
      }
    }
  }

  // Brawl zones: walking into one locks the camera; waves drop in from the rooftops above until
  // the zone is clear.
  updateArena() {
    const p = this.player;
    if (!this.arena) {
      const a = this.arenas.find((z) => z.state === 'idle' && p.x >= z.x + 120 && p.x < z.x + VIEW_W - 40);
      if (!a) return;
      Object.assign(a, { state: 'fight', wave: 0, delay: 30, mine: [] });
      this.arena = a;
      this.camera.lock(a.x);
      return;
    }
    const a = this.arena;
    a.mine = a.mine.filter((e) => e.alive && !e.remove);
    if (a.mine.length) return;
    if (a.wave < a.waves.length) {
      if (--a.delay > 0) return;
      a.waves[a.wave].forEach((s, i) => this.spawnInArena(a, s, i));
      a.wave++;
      a.delay = 45;
      return;
    }
    a.state = 'cleared';
    this.arena = null;
    this.camera.unlock();
    this.go = 150;
    sfx('go');
  }

  spawnInArena(a, spec, i) {
    const e = makeEnemy(this.level, { ...spec, c: 0, r: 0, chase: true });
    const left = spec.side === 'left';
    const x = left ? a.x + 8 + i * 20 : a.x + VIEW_W - 8 - e.w - i * 20;
    e.place(Math.round(x), Math.round(this.camera.y) - e.h - 6 - i * 24);
    e.dir = left ? 1 : -1;
    e.active = true;
    this.enemies.push(e);
    a.mine.push(e);
  }

  holdInArena(b, slack = 0) {
    const lo = this.arena.x - slack;
    const hi = this.arena.x + VIEW_W - b.w + slack;
    if (b.x < lo || b.x > hi) {
      b.x = Math.max(lo, Math.min(hi, b.x));
      b.rx = 0;
      if (b === this.player) b.vx = 0;
      else b.dir = b.x <= lo ? 1 : -1;
    }
  }

  collect() {
    const p = this.player;
    for (const it of this.pickups) {
      if (it.taken || !overlap(p, it)) continue;
      it.taken = true;
      if (it.kind === 'chip') {
        this.stats.chips++;
        this.fx.sparkle(it.x + 4, it.y + 4, '#ffd95e', 5);
        sfx('chip');
      } else if (it.kind === 'heal') {
        p.hp = Math.min(MAX_HP, p.hp + it.amount);
        this.fx.sparkle(it.x + 4, it.y + 4, '#ff4fd8', 10);
        sfx('heal');
      } else {
        p.hp = MAX_HP; // a Golden Cheese also patches her up
        this.stats.gold[it.index] = true;
        this.fx.sparkle(it.x + 6, it.y + 6, '#ffb21e', 14);
        this.hitstop = 6;
        sfx('gold');
      }
    }
    const cp = this.checkpoint;
    if (cp && !cp.active && p.x + p.w > cp.x) {
      cp.active = true;
      this.respawnAt = { x: cp.x - 4, y: cp.groundY - PLAYER_H };
      this.fx.sparkle(cp.x + 2, cp.y + 4, '#3df0ff', 10);
      sfx('checkpoint');
    }
  }

  onEvent(type, body, arg) {
    this.fx.emit(type, body, arg);
    if (type === 'jump') sfx('jump');
    else if (type === 'attack') sfx('whiff');
    else if (type === 'bump') this.bumpTile(arg.c, arg.r);
  }

  // Head-bumped tile: item blocks pay out a chip; anything standing on top gets knocked off.
  bumpTile(c, r) {
    const L = this.level;
    const t = L.get(c, r);
    if (t === BLOCK || t === METAL) this.bumps.push({ c, r, t: 0 });
    const above = { x: c * TILE, y: (r - 1) * TILE, w: TILE, h: TILE };
    for (const e of this.enemies) {
      if (e.alive && overlap(e, above)) {
        e.knock(Math.sign(e.x + e.w / 2 - (c * TILE + 8)) || 1);
        this.stats.stomps++;
        sfx('kick');
      }
    }
    if (t === BLOCK) {
      const key = `${c},${r}`;
      const left = this.blockLeft.get(key) - 1;
      this.blockLeft.set(key, left);
      if (left <= 0) L.set(c, r, USED);
      this.stats.chips++;
      this.popups.push({ x: c * TILE + 4, y: r * TILE - 10, vy: -3.2, t: 0 });
      sfx('block');
    } else {
      sfx('bump');
    }
  }

  die(cause) {
    if (this.state !== 'play') return;
    this.setState('dying');
    this.deathCause = cause;
    this.stats.deaths++;
    const p = this.player;
    p.vx = 0;
    p.vy = 0;
    p.state = 'hurt';
    sfx('die');
  }

  respawn() {
    this.player.reset(this.respawnAt.x, this.respawnAt.y);
    for (const a of this.arenas) if (a.state === 'fight') a.state = 'idle';
    this.arena = null;
    this.target = null;
    this.pickups = this.pickups.filter((it) => it.kind !== 'heal');
    this.spawnEnemies();
    this.bumps = [];
    this.popups = [];
    this.camera.snap(this.player, T);
    this.setState('play');
  }

  clear() {
    this.setState('clear');
    const f = this.stats.frames;
    if (this.trackBest && (!this.best || f < this.best)) {
      this.best = f;
      this.newBest = true;
      try { localStorage.setItem(BEST_KEY, String(f)); } catch { /* ignore */ }
    }
    sfx('clear');
  }

  restart() {
    if (this.state !== 'title') this.startPlay();
  }
}

function loadBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
