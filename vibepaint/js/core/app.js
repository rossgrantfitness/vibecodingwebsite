import { emit } from './events.js';
import { Doc } from './document.js';
import { History } from './history.js';
import { Selection } from './selection.js';

const OPTIONS_KEY = 'vibepaint.toolOptions.v1';

// The single shared app state. Modules import `app` and read/write through it.
export const app = {
  doc: null,
  history: new History(60),
  selection: null,
  view: null,
  tool: null,
  tools: new Map(),
  fg: { r: 34, g: 28, b: 23, a: 1 },
  bg: { r: 255, g: 255, b: 255, a: 1 },
  toolOptions: loadOptions(),
  lastPoint: null, // end of the last paint stroke (for shift-click straight lines)

  newDocument(w, h, opts = {}) {
    this.doc = new Doc(w, h, opts);
    this.selection = new Selection(this.doc.width, this.doc.height);
    this.history.reset(opts.historyLabel || 'New document');
    this.lastPoint = null;
    if (this.view) { this.view.fit(); }
    emit('doc');
    emit('pixels');
    emit('selection');
    return this.doc;
  },

  setTool(id) {
    const next = this.tools.get(id);
    if (!next || next === this.tool) return;
    this.tool?.deactivate?.();
    this.tool = next;
    next.activate?.();
    emit('tool');
    this.view?.requestRender();
  },

  opt(toolId, key) {
    const tool = this.tools.get(toolId);
    const saved = this.toolOptions[toolId]?.[key];
    if (saved !== undefined) return saved;
    return tool?.options?.find((o) => o.id === key)?.value;
  },

  setOpt(toolId, key, value) {
    (this.toolOptions[toolId] ||= {})[key] = value;
    try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(this.toolOptions)); } catch { /* ignore */ }
    emit('tool');
    this.view?.requestRender();
  },

  setColor(which, c) {
    this[which] = { r: c.r, g: c.g, b: c.b, a: c.a ?? 1 };
    emit('color');
  },

  swapColors() {
    [this.fg, this.bg] = [this.bg, this.fg];
    emit('color');
  },

  resetColors() {
    this.fg = { r: 0, g: 0, b: 0, a: 1 };
    this.bg = { r: 255, g: 255, b: 255, a: 1 };
    emit('color');
  },

  redraw() {
    if (this.doc) this.doc.dirty = true;
    this.view?.requestRender();
  },

  toast(message, action) {
    const el = document.getElementById('toast');
    el.textContent = message;
    if (action) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = action.label;
      b.onclick = () => { el.hidden = true; action.run(); };
      el.appendChild(b);
    }
    el.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.hidden = true; }, action ? 9000 : 2600);
  },

  busy(label, fn) {
    const status = document.getElementById('status-busy');
    if (status) status.textContent = label;
    document.body.style.cursor = 'progress';
    return new Promise((resolve) => setTimeout(() => {
      try { resolve(fn()); } finally {
        if (status) status.textContent = '';
        document.body.style.cursor = '';
      }
    }, 16));
  },
};

function loadOptions() {
  try { return JSON.parse(localStorage.getItem(OPTIONS_KEY)) || {}; } catch { return {}; }
}
