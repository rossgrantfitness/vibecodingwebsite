// Dust, sparks and hit stars. Purely cosmetic; driven by events from the player and the game.

export class FX {
  constructor() {
    this.parts = [];
    this.bursts = [];
    this.tick = 0;
  }

  // Impact star where a hit lands; heavy hits get a bigger star and a ring of sparks.
  burst(x, y, heavy) {
    this.bursts.push({ x, y, t: 0, life: heavy ? 9 : 6, r: heavy ? 7 : 5 });
    const n = heavy ? 7 : 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      this.add(x, y, Math.cos(a) * 1.6, Math.sin(a) * 1.4 - 0.4, 10 + (Math.random() * 6 | 0), i % 2 ? '#fff6c8' : '#e9f06a');
    }
  }

  emit(type, p, arg = 0) {
    const fx = p.x + p.w / 2;
    const fy = p.y + p.h;
    switch (type) {
      case 'jump':
        this.puff(fx, fy, 4, 0.8, 0.3);
        break;
      case 'land':
        if (arg > 1.5) this.puff(fx, fy, Math.round(2 + arg * 1.5), 0.4 + arg * 0.25, 0.25);
        break;
      case 'skid':
        if ((this.tick & 3) === 0) this.add(fx + p.facing * 4, fy - 1, p.facing * 0.6, -0.4 - Math.random() * 0.4, 14);
        break;
      case 'bump':
        for (let i = 0; i < 4; i++) this.add(fx, p.y, (i - 1.5) * 0.6, -Math.random() * 0.8, 10, '#ffe27a');
        break;
      case 'stomp':
        for (let i = 0; i < 6; i++) {
          const a = Math.PI + (i / 5) * Math.PI;
          this.add(fx, p.y + 2, Math.cos(a) * 1.4, Math.sin(a) * 1.2, 12, '#ffffff');
        }
        break;
    }
  }

  sparkle(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const s = 0.8 + Math.random() * 0.8;
      this.add(x, y, Math.cos(a) * s, Math.sin(a) * s - 0.3, 14 + (Math.random() * 8 | 0), color);
    }
  }

  puff(x, y, n, speed, lift) {
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      this.add(x + side * 3, y - 1, side * speed * (0.4 + Math.random()), -lift - Math.random() * lift, 12 + (Math.random() * 8 | 0));
    }
  }

  add(x, y, vx, vy, life, color = '#b7aecf') {
    this.parts.push({ x, y, vx, vy, life, max: life, color });
  }

  update() {
    this.tick++;
    for (const q of this.parts) {
      q.x += q.vx;
      q.y += q.vy;
      q.vx *= 0.9;
      q.vy += 0.03;
      q.life--;
    }
    this.parts = this.parts.filter((q) => q.life > 0);
    for (const b of this.bursts) b.t++;
    this.bursts = this.bursts.filter((b) => b.t < b.life);
  }

  draw(ctx, camX, camY) {
    for (const b of this.bursts) {
      const x = Math.round(b.x - camX), y = Math.round(b.y - camY);
      const r = b.t < 2 ? b.r + 1 : b.r - (b.t >> 2);
      // Eight-point star: long arms on the axes, short ones on the diagonals, hot core.
      ctx.fillStyle = b.t < 2 ? '#ffffff' : '#e9f06a';
      ctx.fillRect(x - r, y, r * 2 + 1, 1);
      ctx.fillRect(x, y - r, 1, r * 2 + 1);
      const d = Math.max(1, (r * 0.6) | 0);
      for (let i = 1; i <= d; i++) {
        ctx.fillRect(x - i, y - i, 1, 1); ctx.fillRect(x + i, y - i, 1, 1);
        ctx.fillRect(x - i, y + i, 1, 1); ctx.fillRect(x + i, y + i, 1, 1);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 1, y - 1, 3, 3);
    }
    for (const q of this.parts) {
      ctx.globalAlpha = Math.min(1, (q.life / q.max) * 1.5);
      ctx.fillStyle = q.color;
      const s = q.life > q.max * 0.5 ? 2 : 1;
      ctx.fillRect(Math.round(q.x - camX), Math.round(q.y - camY), s, s);
    }
    ctx.globalAlpha = 1;
  }
}
