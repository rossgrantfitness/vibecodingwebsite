import { VIEW_W, VIEW_H } from './config.js';

// Horizontally locked to the player plus a look-ahead offset that pans toward the direction of
// travel. Vertically SMW-style: re-anchors only when standing on something, and follows mid-air
// only as far as needed to keep the player on screen.
export class Camera {
  constructor(level) {
    this.level = level;
    this.x = 0;
    this.y = 0;
    this.px = 0;
    this.py = 0;
    this.offset = 0;
    this.lookDir = 1;
    this.anchorY = 0;
  }

  snap(p, T) {
    this.lookDir = p.facing;
    this.offset = p.facing * T.cameraLookahead;
    this.anchorY = this.groundAnchor(p);
    this.x = this.followX(p);
    this.y = this.anchorY;
    this.clamp(p);
    this.px = this.x;
    this.py = this.y;
  }

  update(p, T) {
    this.px = this.x;
    this.py = this.y;

    if (Math.abs(p.vx) > 0.6) this.lookDir = Math.sign(p.vx);
    const d = this.lookDir * T.cameraLookahead - this.offset;
    this.offset += Math.sign(d) * Math.min(Math.abs(d), T.cameraPanSpeed);
    this.x = this.followX(p);

    if (p.grounded) this.anchorY = this.groundAnchor(p);
    let ty = this.anchorY;
    ty = Math.min(ty, p.y - VIEW_H * 0.25);           // rising toward the top of the screen
    ty = Math.max(ty, p.y + p.h - VIEW_H * 0.85);     // falling toward the bottom
    this.y += (ty - this.y) * T.cameraLerpY;
    this.clamp(p);
  }

  followX(p) { return p.x + p.rx + p.w / 2 + this.offset - VIEW_W / 2; }
  groundAnchor(p) { return p.y + p.h - VIEW_H * 0.72; }

  clamp(p) {
    // Never let the smoothing lose the player off the top or bottom edge.
    this.y = Math.min(this.y, p.y - 8);
    this.y = Math.max(this.y, p.y + p.h - VIEW_H + 8);
    this.x = Math.max(0, Math.min(this.level.width - VIEW_W, this.x));
    this.y = Math.max(0, Math.min(this.level.height - VIEW_H, this.y));
  }
}
