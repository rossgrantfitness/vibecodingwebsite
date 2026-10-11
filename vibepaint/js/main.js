import { app } from './core/app.js';
import { on } from './core/events.js';
import { Viewport } from './core/viewport.js';
import { paintTools } from './tools/brush.js';
import { selectTools } from './tools/select.js';
import { transformTools, transformTool } from './tools/transform.js';
import { miscTools } from './tools/misc.js';
import { initToolbar, initOptionsBar, initColorPanel, initLayersPanel, initHistoryPanel, initPanelChrome, initStatusBar } from './ui/panels.js';
import { initMenus, showShortcuts } from './ui/menus.js';
import { dialogOpen, runFilter } from './ui/dialogs.js';
import { ADJUSTMENTS } from './filters/adjust.js';
import * as cmd from './commands.js';
import * as io from './io.js';

// ---- Boot ------------------------------------------------------------------------------------------
for (const t of [...paintTools, ...selectTools, ...transformTools, ...miscTools]) app.tools.set(t.id, t);

app.newDocument(1200, 800, { background: '#ffffff', name: 'Untitled' });
const canvas = document.getElementById('view');
const stage = document.getElementById('stage');
app.view = new Viewport(canvas, app);
app.setTool('brush');

initMenus();
initToolbar();
initOptionsBar();
initColorPanel();
initLayersPanel();
initHistoryPanel();
initPanelChrome();
initStatusBar();
io.initDropAndPaste(stage);
// Embedded in a case study: the back link should leave the frame, not load the portfolio inside it.
if (window.self !== window.top) document.querySelector('.back').target = '_top';
io.initAutosave();
io.offerRestore();

for (const ev of ['pixels', 'doc', 'layer', 'selection', 'history']) on(ev, () => app.redraw());
on('doc', () => { if (app.tool === transformTool && !transformTool.float) app.setTool('move'); });

// ---- Pointer input -----------------------------------------------------------------------------------
let active = null;      // { tool, pointerId } while a tool owns the pointer
let panning = null;     // { sx, sy } while panning with Space / middle button
let spaceDown = false;
const touches = new Map();
let pinch = null;

function point(e) {
  const { sx, sy } = app.view.eventPoint(e);
  const d = app.view.toDoc(sx, sy);
  const pressure = e.pointerType === 'pen' ? (e.pressure || 0.5) : 1;
  return { x: d.x, y: d.y, sx, sy, pressure };
}

function updateCursor() {
  const t = app.tool;
  if (panning || spaceDown) canvas.style.cursor = panning ? 'grabbing' : 'grab';
  else if (t?.cursorless) canvas.style.cursor = 'none';
  else canvas.style.cursor = t?.cursor || 'crosshair';
}
on('tool', updateCursor);

canvas.addEventListener('pointerdown', (e) => {
  canvas.focus?.();
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, app.view.eventPoint(e));
    if (touches.size === 2) {
      // Second finger: cancel any stroke and start pinch-zoom / two-finger pan.
      if (active) { active.tool.cancel?.(); active = null; }
      const [a, b] = [...touches.values()];
      pinch = { dist: Math.hypot(a.sx - b.sx, a.sy - b.sy), zoom: app.view.zoom, mid: { sx: (a.sx + b.sx) / 2, sy: (a.sy + b.sy) / 2 } };
      return;
    }
  }
  if (e.button === 1 || (e.button === 0 && spaceDown)) {
    panning = { sx: e.clientX, sy: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    updateCursor();
    e.preventDefault();
    return;
  }
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  const tool = app.tool;
  const p = point(e);
  if (tool.down?.(p, e)) {
    active = { tool, pointerId: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
  }
  app.view.requestRender();
});

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
    touches.set(e.pointerId, app.view.eventPoint(e));
    if (pinch && touches.size === 2) {
      const [a, b] = [...touches.values()];
      const mid = { sx: (a.sx + b.sx) / 2, sy: (a.sy + b.sy) / 2 };
      app.view.pan(mid.sx - pinch.mid.sx, mid.sy - pinch.mid.sy);
      app.view.setZoom(pinch.zoom * (Math.hypot(a.sx - b.sx, a.sy - b.sy) / pinch.dist), mid.sx, mid.sy);
      pinch.mid = mid;
      return;
    }
  }
  if (panning) {
    app.view.pan(e.clientX - panning.sx, e.clientY - panning.sy);
    panning = { sx: e.clientX, sy: e.clientY };
    return;
  }
  app.view.pointer = app.view.eventPoint(e);
  if (active && active.pointerId === e.pointerId) {
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ce of events.length ? events : [e]) active.tool.move?.(point(ce), e);
  } else {
    app.tool.hover?.(point(e), e);
  }
  app.view.requestRender();
});

function endPointer(e) {
  if (e.pointerType === 'touch') {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
  }
  if (panning) { panning = null; updateCursor(); return; }
  if (active && active.pointerId === e.pointerId) {
    const tool = active.tool;
    active = null;
    tool.up?.(point(e), e);
    app.view.requestRender();
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { app.view.pointer = null; app.view.requestRender(); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const { sx, sy } = app.view.eventPoint(e);
  if (e.ctrlKey || e.metaKey || e.altKey) {
    app.view.setZoom(app.view.zoom * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025)), sx, sy);
  } else {
    app.view.pan(-(e.shiftKey ? e.deltaY : e.deltaX), -(e.shiftKey ? 0 : e.deltaY));
  }
}, { passive: false });

// ---- Keyboard ----------------------------------------------------------------------------------------
const toolKeys = new Map();
for (const t of app.tools.values()) if (t.key) toolKeys.set(t.key.toUpperCase(), t.id);

const adj = (id) => () => runFilter(ADJUSTMENTS.find((a) => a.id === id));
const COMBOS = {
  'Ctrl+Z': () => app.history.undo(),
  'Ctrl+Shift+Z': () => app.history.redo(),
  'Ctrl+Y': () => app.history.redo(),
  'Ctrl+A': cmd.selectAll,
  'Ctrl+D': cmd.deselect,
  'Ctrl+Shift+D': cmd.reselect,
  'Ctrl+Shift+I': cmd.inverse,
  'Ctrl+C': () => cmd.copy(),
  'Ctrl+Shift+C': () => cmd.copy({ merged: true }),
  'Ctrl+X': cmd.cut,
  'Ctrl+J': () => cmd.layerVia(false),
  'Ctrl+Shift+J': () => cmd.layerVia(true),
  'Ctrl+Shift+N': cmd.newLayer,
  'Ctrl+E': cmd.mergeDown,
  'Ctrl+Shift+E': cmd.mergeVisible,
  'Ctrl+T': cmd.freeTransform,
  'Ctrl+Alt+T': cmd.freeTransform,
  'Ctrl+]': () => cmd.moveLayer(1),
  'Ctrl+[': () => cmd.moveLayer(-1),
  'Ctrl+Shift+]': () => cmd.moveLayer('top'),
  'Ctrl+Shift+[': () => cmd.moveLayer('bottom'),
  'Ctrl+I': adj('invert'),
  'Ctrl+L': adj('levels'),
  'Ctrl+M': adj('curves'),
  'Ctrl+U': adj('hue-saturation'),
  'Ctrl+Shift+U': adj('black-white'),
  'Ctrl+Shift+L': adj('auto-tone'),
  'Ctrl+Alt+I': cmd.imageSizeDialog,
  'Ctrl+Alt+C': cmd.canvasSizeDialog,
  'Ctrl+S': io.saveProject,
  'Ctrl+Shift+S': io.exportDialog,
  'Ctrl+Alt+S': () => io.exportImage('png'),
  'Ctrl+O': () => io.openFile(),
  'Ctrl+Shift+P': () => io.placeFile(),
  'Alt+N': io.newDocumentDialog,
  'Ctrl+Alt+N': io.newDocumentDialog,
  'Ctrl+0': () => app.view.fit(),
  'Ctrl+1': () => app.view.setZoom(1),
  'Ctrl+=': () => app.view.zoomStep(1),
  'Ctrl++': () => app.view.zoomStep(1),
  'Ctrl+-': () => app.view.zoomStep(-1),
  "Ctrl+'": cmd.toggleGrid,
  'Alt+Backspace': () => cmd.fillWith(app.fg, 1, 'Fill'),
  'Ctrl+Backspace': () => cmd.fillWith(app.bg, 1, 'Fill'),
  'Shift+F5': cmd.fillDialog,
  'Shift+F6': () => cmd.modifyDialog('feather'),
};

function comboOf(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let k = e.key;
  if (e.code.startsWith('Key')) k = e.code.slice(3);
  else if (e.code.startsWith('Digit')) k = e.code.slice(5);
  else if (e.code === 'BracketLeft') k = '[';
  else if (e.code === 'BracketRight') k = ']';
  else if (e.code === 'Equal') k = '=';
  else if (e.code === 'Minus') k = '-';
  else if (e.code === 'Quote') k = "'";
  else if (k.length === 1) k = k.toUpperCase();
  parts.push(k);
  return parts.join('+');
}

window.addEventListener('keydown', (e) => {
  if (dialogOpen()) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;

  if (app.tool?.onKey?.(e)) { e.preventDefault(); return; }

  if (e.code === 'Space') {
    if (!spaceDown) { spaceDown = true; updateCursor(); }
    e.preventDefault();
    return;
  }
  const combo = comboOf(e);
  const fn = COMBOS[combo];
  if (fn) { e.preventDefault(); fn(); return; }
  if (e.ctrlKey || e.metaKey) return; // leave other browser shortcuts alone

  const t = app.tool;
  const hasOpt = (id) => t?.options?.some((o) => o.id === id);
  if (combo === '[' || combo === ']') {
    if (hasOpt('size')) {
      const s = app.opt(t.id, 'size');
      const step = s < 10 ? 1 : s < 50 ? 5 : s < 200 ? 10 : 25;
      app.setOpt(t.id, 'size', Math.max(1, Math.min(1000, s + (combo === ']' ? step : -step))));
    }
    e.preventDefault();
    return;
  }
  if (combo === 'Shift+[' || combo === 'Shift+]') {
    if (hasOpt('hardness')) app.setOpt(t.id, 'hardness', Math.max(0, Math.min(100, app.opt(t.id, 'hardness') + (combo === 'Shift+]' ? 10 : -10))));
    e.preventDefault();
    return;
  }
  if (/^[0-9]$/.test(combo) && hasOpt('opacity')) {
    app.setOpt(t.id, 'opacity', combo === '0' ? 100 : Number(combo) * 10);
    return;
  }
  if (combo === 'X') { app.swapColors(); return; }
  if (combo === 'D') { app.resetColors(); return; }
  if (combo === '/') { cmd.toggleLockAlpha(); return; }
  if (combo === 'Shift+?' || e.key === '?') { showShortcuts(); return; }
  if (combo === 'Delete' || combo === 'Backspace') { if (app.selection.active) { cmd.clear(); e.preventDefault(); } return; }
  if (combo === 'Escape') { app.tool?.cancel?.(); return; }
  const toolId = toolKeys.get(combo);
  if (toolId) {
    if (active) { active.tool.cancel?.(); active = null; }
    app.setTool(toolId);
    e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') { spaceDown = false; updateCursor(); }
});
window.addEventListener('blur', () => { spaceDown = false; updateCursor(); });

// Handle for debugging and automated tests.
window.vibepaint = { app, cmd, io };
