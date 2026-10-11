import { clamp, rgbToHsl, hslToRgb, luma } from '../core/color.js';

// Image ▸ Adjustments. Each `fn(src, params, info)` returns a new ImageData the same size as `src`.
// Alpha is always preserved.

function mapLUT(src, lut, perChannel = null) {
  const out = new ImageData(src.width, src.height);
  const s = src.data, o = out.data;
  const [lr, lg, lb] = perChannel || [lut, lut, lut];
  for (let i = 0; i < s.length; i += 4) {
    o[i] = lr[s[i]]; o[i + 1] = lg[s[i + 1]]; o[i + 2] = lb[s[i + 2]]; o[i + 3] = s[i + 3];
  }
  return out;
}

function eachPixel(src, f) {
  const out = new ImageData(src.width, src.height);
  const s = src.data, o = out.data;
  const px = [0, 0, 0];
  for (let i = 0; i < s.length; i += 4) {
    px[0] = s[i]; px[1] = s[i + 1]; px[2] = s[i + 2];
    f(px, s[i + 3]);
    o[i] = px[0]; o[i + 1] = px[1]; o[i + 2] = px[2]; o[i + 3] = s[i + 3];
  }
  return out;
}

const lutFrom = (f) => { const l = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) l[i] = f(i); return l; };

// Monotone cubic interpolation through curve points → 256-entry LUT.
export function curveLUT(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  const n = pts.length;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (!d[i]) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return lutFrom((x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  });
}

export function histogram(img) {
  const h = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256), l: new Uint32Array(256) };
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    h.r[d[i]]++; h.g[d[i + 1]]++; h.b[d[i + 2]]++;
    h.l[Math.round(luma(d[i], d[i + 1], d[i + 2]))]++;
  }
  return h;
}

const channelOpt = { id: 'channel', label: 'Channel', type: 'select', value: 'rgb', choices: [['rgb', 'RGB'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue']] };
const perChannel = (channel, lut) => {
  const id = lutFrom((i) => i);
  return channel === 'rgb' ? [lut, lut, lut] : [channel === 'r' ? lut : id, channel === 'g' ? lut : id, channel === 'b' ? lut : id];
};

export const ADJUSTMENTS = [
  {
    id: 'brightness-contrast', name: 'Brightness/Contrast…',
    fields: [
      { id: 'brightness', label: 'Brightness', type: 'range', min: -150, max: 150, value: 0 },
      { id: 'contrast', label: 'Contrast', type: 'range', min: -100, max: 100, value: 0 },
    ],
    fn(src, { brightness, contrast }) {
      const c = contrast >= 0 ? 1 + contrast / 50 : 1 + contrast / 100;
      return mapLUT(src, lutFrom((v) => (v - 128) * c + 128 + brightness));
    },
  },
  {
    id: 'levels', name: 'Levels…', shortcut: 'Ctrl+L',
    fields: [
      channelOpt,
      { id: 'hist', type: 'histogram' },
      { id: 'inBlack', label: 'Input black', type: 'range', min: 0, max: 253, value: 0 },
      { id: 'gamma', label: 'Midtones (gamma)', type: 'range', min: 0.1, max: 4, step: 0.01, value: 1 },
      { id: 'inWhite', label: 'Input white', type: 'range', min: 2, max: 255, value: 255 },
      { id: 'outBlack', label: 'Output black', type: 'range', min: 0, max: 255, value: 0 },
      { id: 'outWhite', label: 'Output white', type: 'range', min: 0, max: 255, value: 255 },
    ],
    fn(src, p) {
      const lut = lutFrom((v) => {
        const t = clamp((v - p.inBlack) / Math.max(1, p.inWhite - p.inBlack), 0, 1);
        return p.outBlack + Math.pow(t, 1 / p.gamma) * (p.outWhite - p.outBlack);
      });
      return mapLUT(src, null, perChannel(p.channel, lut));
    },
  },
  {
    id: 'curves', name: 'Curves…', shortcut: 'Ctrl+M',
    fields: [channelOpt, { id: 'points', type: 'curve', value: [[0, 0], [255, 255]] }],
    fn(src, p) { return mapLUT(src, null, perChannel(p.channel, curveLUT(p.points))); },
  },
  {
    id: 'exposure', name: 'Exposure…',
    fields: [
      { id: 'exposure', label: 'Exposure (stops)', type: 'range', min: -5, max: 5, step: 0.05, value: 0 },
      { id: 'offset', label: 'Offset', type: 'range', min: -0.5, max: 0.5, step: 0.005, value: 0 },
      { id: 'gamma', label: 'Gamma', type: 'range', min: 0.1, max: 3, step: 0.01, value: 1 },
    ],
    fn(src, p) {
      const k = Math.pow(2, p.exposure);
      return mapLUT(src, lutFrom((v) => {
        const lin = Math.pow(v / 255, 2.2) * k + p.offset;
        return Math.pow(clamp(lin, 0, 1), 1 / (2.2 * p.gamma)) * 255;
      }));
    },
  },
  {
    id: 'hue-saturation', name: 'Hue/Saturation…', shortcut: 'Ctrl+U',
    fields: [
      { id: 'hue', label: 'Hue', type: 'range', min: -180, max: 180, value: 0, unit: '°' },
      { id: 'saturation', label: 'Saturation', type: 'range', min: -100, max: 100, value: 0 },
      { id: 'lightness', label: 'Lightness', type: 'range', min: -100, max: 100, value: 0 },
      { id: 'colorize', label: 'Colorize', type: 'checkbox', value: false },
    ],
    fn(src, p) {
      return eachPixel(src, (px) => {
        let [h, s, l] = rgbToHsl(px[0], px[1], px[2]);
        if (p.colorize) { h = (p.hue + 360) % 360; s = 0.25 + p.saturation / 200; }
        else {
          h = (h + p.hue + 360) % 360;
          s = p.saturation >= 0 ? s + (1 - s) * (p.saturation / 100) * s * 1.5 : s * (1 + p.saturation / 100);
          s = clamp(s, 0, 1);
        }
        l = p.lightness >= 0 ? l + (1 - l) * (p.lightness / 100) : l * (1 + p.lightness / 100);
        const rgb = hslToRgb(h, s, l);
        px[0] = rgb[0]; px[1] = rgb[1]; px[2] = rgb[2];
      });
    },
  },
  {
    id: 'vibrance', name: 'Vibrance…',
    fields: [{ id: 'vibrance', label: 'Vibrance', type: 'range', min: -100, max: 100, value: 0 }],
    fn(src, p) {
      const amt = p.vibrance / 100;
      return eachPixel(src, (px) => {
        const max = Math.max(px[0], px[1], px[2]), avg = (px[0] + px[1] + px[2]) / 3;
        const k = (1 - (Math.abs(max - avg) * 2) / 255) * amt * 1.5;
        for (let c = 0; c < 3; c++) px[c] = clamp(px[c] + (px[c] - avg) * k, 0, 255);
      });
    },
  },
  {
    id: 'color-balance', name: 'Color Balance…',
    fields: [
      { id: 'cr', label: 'Cyan ↔ Red', type: 'range', min: -100, max: 100, value: 0 },
      { id: 'mg', label: 'Magenta ↔ Green', type: 'range', min: -100, max: 100, value: 0 },
      { id: 'yb', label: 'Yellow ↔ Blue', type: 'range', min: -100, max: 100, value: 0 },
      { id: 'range', label: 'Tones', type: 'select', value: 'mid', choices: [['shadows', 'Shadows'], ['mid', 'Midtones'], ['highlights', 'Highlights']] },
    ],
    fn(src, p) {
      return eachPixel(src, (px) => {
        const l = luma(px[0], px[1], px[2]) / 255;
        const w = p.range === 'shadows' ? clamp(1 - l * 2, 0, 1) : p.range === 'highlights' ? clamp(l * 2 - 1, 0, 1) : 1 - Math.abs(l * 2 - 1);
        px[0] = clamp(px[0] + p.cr * w * 0.9, 0, 255);
        px[1] = clamp(px[1] + p.mg * w * 0.9, 0, 255);
        px[2] = clamp(px[2] + p.yb * w * 0.9, 0, 255);
      });
    },
  },
  {
    id: 'black-white', name: 'Black & White', shortcut: 'Ctrl+Shift+U',
    fn(src) { return eachPixel(src, (px) => { px[0] = px[1] = px[2] = luma(px[0], px[1], px[2]); }); },
  },
  {
    id: 'invert', name: 'Invert', shortcut: 'Ctrl+I',
    fn(src) { return mapLUT(src, lutFrom((v) => 255 - v)); },
  },
  {
    id: 'threshold', name: 'Threshold…',
    fields: [{ id: 'level', label: 'Level', type: 'range', min: 1, max: 255, value: 128 }],
    fn(src, p) { return eachPixel(src, (px) => { px[0] = px[1] = px[2] = luma(px[0], px[1], px[2]) >= p.level ? 255 : 0; }); },
  },
  {
    id: 'posterize', name: 'Posterize…',
    fields: [{ id: 'levels', label: 'Levels', type: 'range', min: 2, max: 32, value: 6 }],
    fn(src, p) {
      const n = p.levels - 1;
      return mapLUT(src, lutFrom((v) => Math.round((v / 255) * n) * (255 / n)));
    },
  },
  {
    id: 'gradient-map', name: 'Gradient Map (foreground → background)',
    fn(src, _p, info) {
      const a = info.fg, b = info.bg;
      return eachPixel(src, (px) => {
        const t = luma(px[0], px[1], px[2]) / 255;
        px[0] = a.r + (b.r - a.r) * t; px[1] = a.g + (b.g - a.g) * t; px[2] = a.b + (b.b - a.b) * t;
      });
    },
  },
  {
    id: 'auto-tone', name: 'Auto Tone', shortcut: 'Ctrl+Shift+L',
    fn(src) {
      const h = histogram(src);
      const total = h.r.reduce((a, b) => a + b, 0) || 1;
      const clip = total * 0.001;
      const stretch = (hist) => {
        let lo = 0, hi = 255, acc = 0;
        for (; lo < 255; lo++) { acc += hist[lo]; if (acc > clip) break; }
        acc = 0;
        for (; hi > 0; hi--) { acc += hist[hi]; if (acc > clip) break; }
        return lutFrom((v) => ((v - lo) / Math.max(1, hi - lo)) * 255);
      };
      return mapLUT(src, null, [stretch(h.r), stretch(h.g), stretch(h.b)]);
    },
  },
  {
    id: 'auto-contrast', name: 'Auto Contrast',
    fn(src) {
      const h = histogram(src).l;
      const total = h.reduce((a, b) => a + b, 0) || 1, clip = total * 0.001;
      let lo = 0, hi = 255, acc = 0;
      for (; lo < 255; lo++) { acc += h[lo]; if (acc > clip) break; }
      acc = 0;
      for (; hi > 0; hi--) { acc += h[hi]; if (acc > clip) break; }
      return mapLUT(src, lutFrom((v) => ((v - lo) / Math.max(1, hi - lo)) * 255));
    },
  },
];
