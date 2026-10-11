// Dust and sparks. Purely cosmetic; driven by events the player emits.

export class FX {
  constructor() {
    this.parts = [];
    this.tick = 0;
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
  }

  draw(ctx, camX, camY) {
    for (const q of this.parts) {
      ctx.globalAlpha = Math.min(1, (q.life / q.max) * 1.5);
      ctx.fillStyle = q.color;
      const s = q.life > q.max * 0.5 ? 2 : 1;
      ctx.fillRect(Math.round(q.x - camX), Math.round(q.y - camY), s, s);
    }
    ctx.globalAlpha = 1;
  }
}
