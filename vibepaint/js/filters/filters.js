import { clamp, luma } from '../core/color.js';
import { gaussianBlur, convolve, sampleBilinear } from '../core/pixels.js';

// Filter menu. Same contract as adjustments: fn(src, params, info) → ImageData of the same size.

function copy(src) { const o = new ImageData(src.width, src.height); o.data.set(src.data); return o; }

// Map every output pixel back to a source position (for distortions).
function displace(src, map) {
  const { width: w, height: h } = src;
  const out = new ImageData(w, h);
  const o = out.data, px = [0, 0, 0, 0], pos = { x: 0, y: 0 };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    pos.x = x; pos.y = y;
    map(pos, x, y);
    sampleBilinear(src, pos.x, pos.y, px);
    const i = (y * w + x) * 4;
    o[i] = px[0]; o[i + 1] = px[1]; o[i + 2] = px[2]; o[i + 3] = px[3];
  }
  return out;
}

// Smooth value noise for Clouds.
function noise2(seed) {
  const perm = new Uint8Array(512);
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const p = Array.from({ length: 256 }, (_, i) => i).sort(() => rand() - 0.5);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const vals = Float32Array.from({ length: 256 }, rand);
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = fade(x - xi), yf = fade(y - yi);
    const v = (a, b) => vals[perm[(perm[a & 255] + b) & 255]];
    const top = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * xf;
    const bot = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * xf;
    return top + (bot - top) * yf;
  };
}

export const FILTERS = [
  { group: 'Blur' },
  {
    id: 'gaussian-blur', name: 'Gaussian Blur…',
    fields: [{ id: 'radius', label: 'Radius', type: 'range', min: 0.5, max: 100, step: 0.5, value: 4, unit: 'px' }],
    fn(src, p) { return gaussianBlur(src, p.radius); },
  },
  {
    id: 'motion-blur', name: 'Motion Blur…',
    fields: [
      { id: 'angle', label: 'Angle', type: 'range', min: -180, max: 180, value: 0, unit: '°' },
      { id: 'distance', label: 'Distance', type: 'range', min: 1, max: 120, value: 20, unit: 'px' },
    ],
    fn(src, p) {
      const { width: w, height: h, data: s } = src;
      const out = new ImageData(w, h), o = out.data;
      const a = (p.angle * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
      const n = Math.max(1, Math.round(p.distance));
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, al = 0;
        for (let k = -n / 2; k <= n / 2; k++) {
          const xx = clamp(Math.round(x + dx * k), 0, w - 1), yy = clamp(Math.round(y + dy * k), 0, h - 1);
          const i = (yy * w + xx) * 4, wa = s[i + 3];
          r += s[i] * wa; g += s[i + 1] * wa; b += s[i + 2] * wa; al += wa;
        }
        const i = (y * w + x) * 4, cnt = n + 1;
        o[i] = al ? r / al : 0; o[i + 1] = al ? g / al : 0; o[i + 2] = al ? b / al : 0; o[i + 3] = al / cnt;
      }
      return out;
    },
  },
  {
    id: 'radial-blur', name: 'Radial (Zoom) Blur…',
    fields: [{ id: 'amount', label: 'Amount', type: 'range', min: 1, max: 100, value: 20 }],
    fn(src, p) {
      const { width: w, height: h, data: s } = src;
      const out = new ImageData(w, h), o = out.data;
      const cx = w / 2, cy = h / 2, steps = 16, amt = p.amount / 400;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let k = 0; k < steps; k++) {
          const t = 1 - (k / steps) * amt;
          const i = (clamp(Math.round(cy + (y - cy) * t), 0, h - 1) * w + clamp(Math.round(cx + (x - cx) * t), 0, w - 1)) * 4;
          r += s[i]; g += s[i + 1]; b += s[i + 2]; a += s[i + 3];
        }
        const i = (y * w + x) * 4;
        o[i] = r / steps; o[i + 1] = g / steps; o[i + 2] = b / steps; o[i + 3] = a / steps;
      }
      return out;
    },
  },
  { group: 'Sharpen' },
  {
    id: 'unsharp-mask', name: 'Unsharp Mask…',
    fields: [
      { id: 'amount', label: 'Amount', type: 'range', min: 1, max: 500, value: 100, unit: '%' },
      { id: 'radius', label: 'Radius', type: 'range', min: 0.5, max: 50, step: 0.5, value: 2, unit: 'px' },
      { id: 'threshold', label: 'Threshold', type: 'range', min: 0, max: 255, value: 0 },
    ],
    fn(src, p) {
      const blur = gaussianBlur(src, p.radius);
      const out = copy(src), o = out.data, s = src.data, b = blur.data, k = p.amount / 100;
      for (let i = 0; i < s.length; i += 4) for (let c = 0; c < 3; c++) {
        const diff = s[i + c] - b[i + c];
        if (Math.abs(diff) >= p.threshold) o[i + c] = s[i + c] + diff * k;
      }
      return out;
    },
  },
  { id: 'sharpen', name: 'Sharpen', fn(src) { return convolve(src, [0, -1, 0, -1, 5, -1, 0, -1, 0]); } },
  { group: 'Noise' },
  {
    id: 'add-noise', name: 'Add Noise…',
    fields: [
      { id: 'amount', label: 'Amount', type: 'range', min: 1, max: 100, value: 12, unit: '%' },
      { id: 'mono', label: 'Monochromatic', type: 'checkbox', value: true },
    ],
    fn(src, p) {
      const out = copy(src), o = out.data, a = p.amount * 2.55;
      for (let i = 0; i < o.length; i += 4) {
        const n = (Math.random() + Math.random() + Math.random() - 1.5) * a;
        o[i] += n;
        o[i + 1] += p.mono ? n : (Math.random() + Math.random() + Math.random() - 1.5) * a;
        o[i + 2] += p.mono ? n : (Math.random() + Math.random() + Math.random() - 1.5) * a;
      }
      return out;
    },
  },
  {
    id: 'median', name: 'Reduce Noise (Median)…',
    fields: [{ id: 'radius', label: 'Radius', type: 'range', min: 1, max: 4, value: 1, unit: 'px' }],
    fn(src, p) {
      const { width: w, height: h, data: s } = src;
      const out = copy(src), o = out.data, r = p.radius;
      const buf = [[], [], []];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        buf[0].length = buf[1].length = buf[2].length = 0;
        for (let ky = -r; ky <= r; ky++) for (let kx = -r; kx <= r; kx++) {
          const i = (clamp(y + ky, 0, h - 1) * w + clamp(x + kx, 0, w - 1)) * 4;
          buf[0].push(s[i]); buf[1].push(s[i + 1]); buf[2].push(s[i + 2]);
        }
        const i = (y * w + x) * 4, mid = buf[0].length >> 1;
        for (let c = 0; c < 3; c++) o[i + c] = buf[c].sort((a, b) => a - b)[mid];
      }
      return out;
    },
  },
  { group: 'Pixelate' },
  {
    id: 'mosaic', name: 'Mosaic…',
    fields: [{ id: 'cell', label: 'Cell size', type: 'range', min: 2, max: 200, value: 12, unit: 'px' }],
    fn(src, p) {
      const { width: w, height: h, data: s } = src;
      const out = new ImageData(w, h), o = out.data, n = p.cell;
      for (let by = 0; by < h; by += n) for (let bx = 0; bx < w; bx += n) {
        let r = 0, g = 0, b = 0, a = 0, cnt = 0;
        for (let y = by; y < Math.min(h, by + n); y++) for (let x = bx; x < Math.min(w, bx + n); x++) {
          const i = (y * w + x) * 4, wa = s[i + 3];
          r += s[i] * wa; g += s[i + 1] * wa; b += s[i + 2] * wa; a += wa; cnt++;
        }
        for (let y = by; y < Math.min(h, by + n); y++) for (let x = bx; x < Math.min(w, bx + n); x++) {
          const i = (y * w + x) * 4;
          o[i] = a ? r / a : 0; o[i + 1] = a ? g / a : 0; o[i + 2] = a ? b / a : 0; o[i + 3] = a / cnt;
        }
      }
      return out;
    },
  },
  {
    id: 'halftone', name: 'Color Halftone…',
    fields: [{ id: 'cell', label: 'Dot size', type: 'range', min: 3, max: 60, value: 8, unit: 'px' }],
    fn(src, p) {
      const { width: w, height: h, data: s } = src;
      const out = new ImageData(w, h), o = out.data, n = p.cell;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const cx = Math.floor(x / n) * n + n / 2, cy = Math.floor(y / n) * n + n / 2;
        const ci = (clamp(Math.floor(cy), 0, h - 1) * w + clamp(Math.floor(cx), 0, w - 1)) * 4;
        const i = (y * w + x) * 4, d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / (n * 0.71);
        for (let c = 0; c < 3; c++) o[i + c] = d < 1 - s[ci + c] / 255 ? 0 : 255;
        o[i + 3] = s[i + 3];
      }
      return out;
    },
  },
  { group: 'Stylize' },
  {
    id: 'emboss', name: 'Emboss…',
    fields: [{ id: 'gray', label: 'Gray', type: 'checkbox', value: true }],
    fn(src, p) {
      return p.gray
        ? convolve(src, [-1, -1, 0, -1, 0, 1, 0, 1, 1], { divisor: 1, offset: 128, gray: true })
        : convolve(src, [-2, -1, 0, -1, 1, 1, 0, 1, 2], { divisor: 1 });
    },
  },
  {
    id: 'find-edges', name: 'Find Edges',
    fn(src) {
      const { width: w, height: h, data: s } = src;
      const out = copy(src), o = out.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const g = (xx, yy) => { const i = (clamp(yy, 0, h - 1) * w + clamp(xx, 0, w - 1)) * 4; return luma(s[i], s[i + 1], s[i + 2]); };
        const gx = -g(x - 1, y - 1) - 2 * g(x - 1, y) - g(x - 1, y + 1) + g(x + 1, y - 1) + 2 * g(x + 1, y) + g(x + 1, y + 1);
        const gy = -g(x - 1, y - 1) - 2 * g(x, y - 1) - g(x + 1, y - 1) + g(x - 1, y + 1) + 2 * g(x, y + 1) + g(x + 1, y + 1);
        const v = 255 - clamp(Math.hypot(gx, gy), 0, 255);
        const i = (y * w + x) * 4;
        o[i] = o[i + 1] = o[i + 2] = v;
      }
      return out;
    },
  },
  {
    id: 'sepia', name: 'Sepia',
    fn(src) {
      const out = copy(src), o = out.data;
      for (let i = 0; i < o.length; i += 4) {
        const r = o[i], g = o[i + 1], b = o[i + 2];
        o[i] = r * 0.393 + g * 0.769 + b * 0.189; o[i + 1] = r * 0.349 + g * 0.686 + b * 0.168; o[i + 2] = r * 0.272 + g * 0.534 + b * 0.131;
      }
      return out;
    },
  },
  {
    id: 'vignette', name: 'Vignette…',
    fields: [
      { id: 'amount', label: 'Amount', type: 'range', min: 0, max: 100, value: 50, unit: '%' },
      { id: 'size', label: 'Size', type: 'range', min: 10, max: 150, value: 80, unit: '%' },
    ],
    fn(src, p) {
      const { width: w, height: h } = src;
      const out = copy(src), o = out.data, cx = w / 2, cy = h / 2, rmax = Math.hypot(cx, cy) * (p.size / 100);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const t = clamp(Math.hypot(x - cx, y - cy) / rmax, 0, 1);
        const k = 1 - (p.amount / 100) * t * t;
        const i = (y * w + x) * 4;
        o[i] *= k; o[i + 1] *= k; o[i + 2] *= k;
      }
      return out;
    },
  },
  { group: 'Distort' },
  {
    id: 'twirl', name: 'Twirl…',
    fields: [{ id: 'angle', label: 'Angle', type: 'range', min: -720, max: 720, value: 120, unit: '°' }],
    fn(src, p) {
      const cx = src.width / 2, cy = src.height / 2, R = Math.min(cx, cy), a0 = (p.angle * Math.PI) / 180;
      return displace(src, (pos, x, y) => {
        const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
        if (r >= R) return;
        const a = Math.atan2(dy, dx) + a0 * (1 - r / R) ** 2;
        pos.x = cx + Math.cos(a) * r; pos.y = cy + Math.sin(a) * r;
      });
    },
  },
  {
    id: 'wave', name: 'Wave…',
    fields: [
      { id: 'amplitude', label: 'Amplitude', type: 'range', min: 1, max: 100, value: 10, unit: 'px' },
      { id: 'wavelength', label: 'Wavelength', type: 'range', min: 4, max: 400, value: 60, unit: 'px' },
      { id: 'dir', label: 'Direction', type: 'select', value: 'h', choices: [['h', 'Horizontal'], ['v', 'Vertical'], ['both', 'Both']] },
    ],
    fn(src, p) {
      const k = (Math.PI * 2) / p.wavelength;
      return displace(src, (pos, x, y) => {
        if (p.dir !== 'v') pos.x = x + Math.sin(y * k) * p.amplitude;
        if (p.dir !== 'h') pos.y = y + Math.sin(x * k) * p.amplitude;
      });
    },
  },
  {
    id: 'spherize', name: 'Pinch / Spherize…',
    fields: [{ id: 'amount', label: 'Amount', type: 'range', min: -100, max: 100, value: 50, unit: '%' }],
    fn(src, p) {
      const cx = src.width / 2, cy = src.height / 2, R = Math.min(cx, cy), k = p.amount / 100;
      return displace(src, (pos, x, y) => {
        const dx = (x - cx) / R, dy = (y - cy) / R, r = Math.hypot(dx, dy);
        if (r >= 1 || r === 0) return;
        const nr = k >= 0 ? Math.pow(r, 1 + k) : Math.pow(r, 1 / (1 - k));
        pos.x = cx + (dx / r) * nr * R; pos.y = cy + (dy / r) * nr * R;
      });
    },
  },
  {
    id: 'ripple', name: 'Ripple…',
    fields: [
      { id: 'amplitude', label: 'Amplitude', type: 'range', min: 1, max: 60, value: 8, unit: 'px' },
      { id: 'wavelength', label: 'Wavelength', type: 'range', min: 4, max: 200, value: 30, unit: 'px' },
    ],
    fn(src, p) {
      const cx = src.width / 2, cy = src.height / 2, k = (Math.PI * 2) / p.wavelength;
      return displace(src, (pos, x, y) => {
        const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy) || 1;
        const off = Math.sin(r * k) * p.amplitude;
        pos.x = x + (dx / r) * off; pos.y = y + (dy / r) * off;
      });
    },
  },
  { group: 'Render' },
  {
    id: 'clouds', name: 'Clouds (foreground / background)',
    fn(src, _p, info) {
      const { width: w, height: h } = src;
      const out = new ImageData(w, h), o = out.data;
      const n = noise2((Math.random() * 1e9) | 0);
      const scale = 1 / Math.max(32, Math.min(w, h) / 3);
      const a = info.fg, b = info.bg;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let v = 0, amp = 0.5, f = scale;
        for (let oct = 0; oct < 6; oct++) { v += n(x * f + oct * 17.3, y * f + oct * 9.1) * amp; amp *= 0.5; f *= 2; }
        const i = (y * w + x) * 4;
        o[i] = a.r + (b.r - a.r) * v; o[i + 1] = a.g + (b.g - a.g) * v; o[i + 2] = a.b + (b.b - a.b) * v; o[i + 3] = 255;
      }
      return out;
    },
  },
];
