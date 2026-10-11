import { clamp } from './color.js';

// ---- Flood fill ------------------------------------------------------------------------------
// Returns a coverage mask (Uint8Array, 0/255) of pixels similar to the seed pixel.
// tolerance 0–255 compares the max channel difference (alpha included).
export function floodMask(img, sx, sy, tolerance, contiguous = true) {
  const { width: w, height: h, data: d } = img;
  const mask = new Uint8Array(w * h);
  sx |= 0; sy |= 0;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return mask;
  const i0 = (sy * w + sx) * 4;
  const r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3];
  const match = (p) => {
    const i = p * 4;
    if (a0 === 0 && d[i + 3] === 0) return true; // all fully transparent pixels match each other
    return Math.max(Math.abs(d[i] - r0), Math.abs(d[i + 1] - g0), Math.abs(d[i + 2] - b0), Math.abs(d[i + 3] - a0)) <= tolerance;
  };
  if (!contiguous) {
    for (let p = 0; p < w * h; p++) if (match(p)) mask[p] = 255;
    return mask;
  }
  // Scanline fill.
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop(), x0 = stack.pop();
    let x = x0;
    while (x >= 0 && !mask[y * w + x] && match(y * w + x)) x--;
    x++;
    let up = false, down = false;
    while (x < w && !mask[y * w + x] && match(y * w + x)) {
      mask[y * w + x] = 255;
      if (y > 0) {
        const m = !mask[(y - 1) * w + x] && match((y - 1) * w + x);
        if (m && !up) { stack.push(x, y - 1); up = true; } else if (!m) up = false;
      }
      if (y < h - 1) {
        const m = !mask[(y + 1) * w + x] && match((y + 1) * w + x);
        if (m && !down) { stack.push(x, y + 1); down = true; } else if (!m) down = false;
      }
      x++;
    }
  }
  return mask;
}

export function maskBounds(mask, w, h) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (mask[y * w + x]) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// ---- Blur ----------------------------------------------------------------------------------------
// Gaussian blur approximated by three box blurs, on premultiplied colour so edges don't halo.
export function gaussianBlur(src, radius) {
  const { width: w, height: h } = src;
  const out = new ImageData(w, h);
  if (radius <= 0) { out.data.set(src.data); return out; }
  const n = w * h;
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const s = src.data;
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const a = s[i + 3] / 255;
    ch[0][p] = s[i] * a; ch[1][p] = s[i + 1] * a; ch[2][p] = s[i + 2] * a; ch[3][p] = s[i + 3];
  }
  const boxes = boxSizes(radius / 2, 3);
  const tmp = new Float32Array(n);
  for (const c of ch) for (const b of boxes) { boxH(c, tmp, w, h, (b - 1) / 2); boxV(tmp, c, w, h, (b - 1) / 2); }
  const o = out.data;
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const a = ch[3][p];
    const k = a > 0 ? 255 / a : 0;
    o[i] = ch[0][p] * k; o[i + 1] = ch[1][p] * k; o[i + 2] = ch[2][p] * k; o[i + 3] = a;
  }
  return out;
}

function boxSizes(sigma, n) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return Array.from({ length: n }, (_, i) => Math.max(1, i < m ? wl : wu));
}

function boxH(src, dst, w, h, r) {
  r = Math.max(0, Math.round(r));
  const iarr = 1 / (r + r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r - 1; k < r; k++) acc += src[row + clamp(k, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      acc += src[row + Math.min(w - 1, x + r)] - src[row + Math.max(0, x - r - 1)];
      dst[row + x] = acc * iarr;
    }
  }
}

function boxV(src, dst, w, h, r) {
  r = Math.max(0, Math.round(r));
  const iarr = 1 / (r + r + 1);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r - 1; k < r; k++) acc += src[clamp(k, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      acc += src[Math.min(h - 1, y + r) * w + x] - src[Math.max(0, y - r - 1) * w + x];
      dst[y * w + x] = acc * iarr;
    }
  }
}

// ---- Sampling ------------------------------------------------------------------------------------
// Bilinear sample with clamped edges into out[0..3].
export function sampleBilinear(img, x, y, out) {
  const { width: w, height: h, data: d } = img;
  x = clamp(x, 0, w - 1); y = clamp(y, 0, h - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
  for (let c = 0; c < 4; c++) {
    const top = d[i00 + c] + (d[i10 + c] - d[i00 + c]) * fx;
    const bot = d[i01 + c] + (d[i11 + c] - d[i01 + c]) * fx;
    out[c] = top + (bot - top) * fy;
  }
  return out;
}

// Apply a 3×3 (or any odd) convolution kernel. Alpha is kept from the source.
export function convolve(src, kernel, { divisor, offset = 0, gray = false } = {}) {
  const { width: w, height: h, data: s } = src;
  const out = new ImageData(w, h);
  const o = out.data;
  const size = Math.sqrt(kernel.length) | 0, half = size >> 1;
  const div = divisor || kernel.reduce((a, b) => a + b, 0) || 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let ky = 0; ky < size; ky++) for (let kx = 0; kx < size; kx++) {
      const xx = clamp(x + kx - half, 0, w - 1), yy = clamp(y + ky - half, 0, h - 1);
      const i = (yy * w + xx) * 4, k = kernel[ky * size + kx];
      r += s[i] * k; g += s[i + 1] * k; b += s[i + 2] * k;
    }
    const i = (y * w + x) * 4;
    r = r / div + offset; g = g / div + offset; b = b / div + offset;
    if (gray) r = g = b = (r + g + b) / 3;
    o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = s[i + 3];
  }
  return out;
}

// Blend `fx` over `src` using a selection coverage mask (Uint8Array) — keeps soft selections soft.
export function blendByMask(src, fx, mask) {
  if (!mask) return fx;
  const s = src.data, f = fx.data;
  const out = new ImageData(src.width, src.height);
  const o = out.data;
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    const m = mask[p] / 255;
    for (let c = 0; c < 4; c++) o[i + c] = s[i + c] + (f[i + c] - s[i + c]) * m;
  }
  return out;
}
