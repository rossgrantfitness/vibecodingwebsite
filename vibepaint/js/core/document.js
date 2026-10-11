// Document model: an ordered stack of raster layers (index 0 = bottom) plus the compositor that
// flattens them into one canvas for display, export and "sample all layers" tools.

let nextId = 1;

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function cloneCanvas(src) {
  const c = makeCanvas(src.width, src.height);
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

export const BLEND_MODES = [
  ['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'],
  ['darken', 'Darken'], ['lighten', 'Lighten'], ['color-dodge', 'Color Dodge'], ['color-burn', 'Color Burn'],
  ['hard-light', 'Hard Light'], ['soft-light', 'Soft Light'], ['difference', 'Difference'], ['exclusion', 'Exclusion'],
  ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Color'], ['luminosity', 'Luminosity'],
];

export class Layer {
  constructor(w, h, name = 'Layer') {
    this.id = nextId++;
    this.name = name;
    this.canvas = makeCanvas(w, h);
    this.ctx = this.canvas.getContext('2d');
    this.visible = true;
    this.opacity = 1;
    this.blend = 'source-over';
    this.lockAlpha = false;
  }
}

export class Doc {
  constructor(w, h, { background = '#ffffff', name = 'Untitled' } = {}) {
    this.width = Math.round(w);
    this.height = Math.round(h);
    this.name = name;
    this.layers = [];
    this.composite = makeCanvas(w, h);
    this.scratch = makeCanvas(w, h);
    // While a tool is mid-gesture it can preview its effect on one layer without touching pixels:
    // { layerId, apply(ctx) } is drawn on a copy of that layer at composite time.
    this.preview = null;
    this.dirty = true;
    const bg = this.addLayer(background ? 'Background' : 'Layer 1');
    if (background) {
      bg.ctx.fillStyle = background;
      bg.ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  get active() { return this.layers.find((l) => l.id === this.activeId) || this.layers[this.layers.length - 1]; }
  get activeIndex() { return this.layers.indexOf(this.active); }
  layerById(id) { return this.layers.find((l) => l.id === id); }

  addLayer(name, index = this.layers.length) {
    const layer = new Layer(this.width, this.height, name || `Layer ${this.layers.length + 1}`);
    this.layers.splice(index, 0, layer);
    this.activeId = layer.id;
    this.dirty = true;
    return layer;
  }

  removeLayer(id) {
    if (this.layers.length <= 1) return;
    const i = this.layers.findIndex((l) => l.id === id);
    if (i < 0) return;
    this.layers.splice(i, 1);
    this.activeId = this.layers[Math.max(0, i - 1)].id;
    this.dirty = true;
  }

  moveLayer(id, to) {
    const i = this.layers.findIndex((l) => l.id === id);
    if (i < 0) return;
    to = Math.max(0, Math.min(this.layers.length - 1, to));
    const [l] = this.layers.splice(i, 1);
    this.layers.splice(to, 0, l);
    this.dirty = true;
  }

  nextLayerName() {
    let n = this.layers.length + 1;
    while (this.layers.some((l) => l.name === `Layer ${n}`)) n++;
    return `Layer ${n}`;
  }

  // Flatten visible layers (optionally a subset) into `target`.
  renderTo(target, layers = this.layers) {
    const ctx = target.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, target.width, target.height);
    for (const layer of layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      let src = layer.canvas;
      if (this.preview && this.preview.layerId === layer.id) {
        const s = this.scratch.getContext('2d');
        s.save();
        s.globalCompositeOperation = 'source-over';
        s.globalAlpha = 1;
        s.clearRect(0, 0, this.width, this.height);
        s.drawImage(layer.canvas, 0, 0);
        this.preview.apply(s, layer);
        s.restore();
        src = this.scratch;
      }
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = layer.blend;
      ctx.drawImage(src, 0, 0);
    }
    ctx.restore();
  }

  render() {
    if (!this.dirty) return this.composite;
    this.renderTo(this.composite);
    this.dirty = false;
    return this.composite;
  }

  // Full copy of the document, used for undo on structural changes (layers added, canvas resized…).
  snapshot() {
    return {
      width: this.width,
      height: this.height,
      activeId: this.activeId,
      layers: this.layers.map((l) => ({
        id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, lockAlpha: l.lockAlpha,
        canvas: cloneCanvas(l.canvas),
      })),
    };
  }

  restore(snap) {
    if (snap.width !== this.width || snap.height !== this.height) this.resize(snap.width, snap.height);
    this.layers = snap.layers.map((s) => {
      const l = new Layer(snap.width, snap.height, s.name);
      Object.assign(l, { id: s.id, visible: s.visible, opacity: s.opacity, blend: s.blend, lockAlpha: s.lockAlpha });
      l.ctx.drawImage(s.canvas, 0, 0);
      return l;
    });
    this.activeId = snap.activeId;
    this.dirty = true;
  }

  // Resize the working buffers (layers are rebuilt by the caller).
  resize(w, h) {
    this.width = Math.round(w);
    this.height = Math.round(h);
    this.composite = makeCanvas(w, h);
    this.scratch = makeCanvas(w, h);
    this.dirty = true;
  }

  // Rebuild every layer through `draw(oldCanvas, newCtx)` at a new size.
  transformAll(w, h, draw) {
    const old = this.layers.map((l) => l.canvas);
    this.resize(w, h);
    this.layers.forEach((l, i) => {
      l.canvas = makeCanvas(w, h);
      l.ctx = l.canvas.getContext('2d');
      draw(old[i], l.ctx, l);
    });
  }
}
