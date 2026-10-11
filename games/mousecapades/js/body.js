// Shared tile-collision body. Position is an integer pixel (top-left of the hitbox) plus a
// sub-pixel remainder; movement steps one pixel at a time, so collisions are exact at any speed.
export class Body {
  constructor(level, x, y, w, h) {
    this.level = level;
    this.place(x, y);
    this.w = w;
    this.h = h;
  }

  place(x, y) {
    this.x = x;
    this.y = y;
    this.rx = 0;
    this.ry = 0;
    this.px = x; // previous-step position, for render interpolation
    this.py = y;
  }

  savePrev() {
    this.px = this.x + this.rx;
    this.py = this.y + this.ry;
  }

  onGround() {
    return this.level.solidAt(this.x, this.y + 1, this.w, this.h) || this.level.semiBelow(this.x, this.y, this.w, this.h);
  }

  overlaps(o) {
    return this.x < o.x + o.w && this.x + this.w > o.x && this.y < o.y + o.h && this.y + this.h > o.y;
  }

  // Returns true if blocked (velocity handling is up to the caller).
  moveX(amount) {
    this.rx += amount;
    let move = Math.round(this.rx);
    if (move === 0) return false;
    this.rx -= move;
    const s = Math.sign(move);
    while (move !== 0) {
      if (this.level.solidAt(this.x + s, this.y, this.w, this.h)) {
        this.rx = 0;
        return true;
      }
      this.x += s;
      move -= s;
    }
    return false;
  }

  // Returns true if blocked. Rising into a block corner nudges sideways up to `corner` px instead.
  moveY(amount, corner = 0) {
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
