import { app } from '../core/app.js';
import { on, emit } from '../core/events.js';
import { BLEND_MODES } from '../core/document.js';
import { layerProps, structural } from '../core/history.js';
import { toHex, fromHex, rgbToHsv, hsvToRgb, rgba } from '../core/color.js';
import * as cmd from '../commands.js';
import { transformTool, cropTool } from '../tools/transform.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined) e[k] = v;
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
};
const icon = (name) => el('i', { class: `ph ${name}` });

// ---- Toolbar --------------------------------------------------------------------------------------
const TOOL_ORDER = [
  'move', 'marquee', 'ellipse-select', 'lasso', 'poly-lasso', 'wand', 'crop', 'eyedropper', '|',
  'brush', 'pencil', 'eraser', 'clone', 'smudge', 'focus', 'dodge', 'bucket', 'gradient', '|',
  'shape', 'text', 'hand', 'zoom',
];

export function initToolbar() {
  const bar = $('toolbar');
  for (const id of TOOL_ORDER) {
    if (id === '|') { bar.appendChild(el('div', { class: 'tool-sep' })); continue; }
    const t = app.tools.get(id);
    const b = el('button', { class: 'tool-btn', type: 'button', title: `${t.name}${t.key ? ` (${t.key})` : ''}`, ariaLabel: t.name, onclick: () => app.setTool(id) }, icon(t.icon));
    b.dataset.tool = id;
    bar.appendChild(b);
  }
  const fgChip = el('button', { class: 'chip fg', type: 'button', title: 'Foreground color (click to edit)', onclick: () => setTarget('fg') });
  const bgChip = el('button', { class: 'chip bg', type: 'button', title: 'Background color (click to edit)', onclick: () => setTarget('bg') });
  const swap = el('button', { class: 'mini swap', type: 'button', title: 'Swap colors (X)', onclick: () => app.swapColors() }, icon('ph-arrows-left-right'));
  const reset = el('button', { class: 'mini reset', type: 'button', title: 'Default colors (D)', onclick: () => app.resetColors() }, icon('ph-drop-half'));
  bar.appendChild(el('div', { class: 'swatch-pair' }, fgChip, bgChip, swap, reset));
  const sync = () => {
    fgChip.style.background = rgba(app.fg);
    bgChip.style.background = rgba(app.bg);
    bar.querySelectorAll('.tool-btn').forEach((b) => b.classList.toggle('on', b.dataset.tool === app.tool?.id));
  };
  on('color', sync);
  on('tool', sync);
  sync();
}

// ---- Options bar ----------------------------------------------------------------------------------
let renderedTool = null;
const syncers = [];

export function initOptionsBar() {
  on('tool', () => {
    if (app.tool !== renderedTool) renderOptions();
    else syncers.forEach((s) => s());
  });
  renderOptions();
}

function logSlider(o) {
  // Size sliders feel better on a log scale: fine control for small brushes.
  const min = Math.log(o.min), max = Math.log(o.max);
  return { toSlider: (v) => ((Math.log(Math.max(o.min, v)) - min) / (max - min)) * 1000, fromSlider: (s) => Math.round(Math.exp(min + (s / 1000) * (max - min))) };
}

function renderOptions() {
  const bar = $('optionsbar');
  const tool = app.tool;
  renderedTool = tool;
  syncers.length = 0;
  bar.replaceChildren();
  if (!tool) return;
  bar.appendChild(el('span', { class: 'tool-name', title: tool.hint || '' }, icon(tool.icon), tool.name));
  for (const o of tool.options || []) {
    bar.appendChild(el('span', { class: 'opt-sep' }));
    const get = () => app.opt(tool.id, o.id);
    const set = (v) => app.setOpt(tool.id, o.id, v);
    if (o.type === 'range') {
      const out = el('output');
      const map = o.log ? logSlider(o) : null;
      const r = el('input', { type: 'range', min: map ? 0 : o.min, max: map ? 1000 : o.max, step: map ? 1 : o.step || 1 });
      r.addEventListener('input', () => set(map ? map.fromSlider(Number(r.value)) : Number(r.value)));
      const sync = () => { const v = get(); r.value = map ? map.toSlider(v) : v; out.textContent = `${v}${o.unit || ''}`; };
      syncers.push(sync);
      sync();
      bar.appendChild(el('label', { class: 'opt' }, o.label, r, out));
    } else if (o.type === 'number') {
      const n = el('input', { type: 'number', min: o.min, max: o.max, step: o.step || 1 });
      n.addEventListener('change', () => set(Math.min(o.max, Math.max(o.min, Number(n.value) || o.min))));
      const sync = () => { if (document.activeElement !== n) n.value = get(); };
      syncers.push(sync);
      sync();
      bar.appendChild(el('label', { class: 'opt' }, o.label, n, o.unit ? el('span', {}, o.unit) : null));
    } else if (o.type === 'select') {
      const s = el('select');
      for (const [v, t] of o.choices) s.add(new Option(t, v));
      s.addEventListener('change', () => { set(s.value); s.blur(); });
      const sync = () => { s.value = get(); };
      syncers.push(sync);
      sync();
      bar.appendChild(el('label', { class: 'opt' }, o.label, s));
    } else if (o.type === 'checkbox') {
      const c = el('input', { type: 'checkbox' });
      c.addEventListener('change', () => { set(c.checked); c.blur(); });
      const sync = () => { c.checked = !!get(); };
      syncers.push(sync);
      sync();
      bar.appendChild(el('label', { class: 'opt' }, c, o.label));
    } else if (o.type === 'seg') {
      const seg = el('span', { class: 'seg', role: 'group', ariaLabel: o.label });
      for (const [v, t] of o.choices) {
        seg.appendChild(el('button', { type: 'button', textContent: t, dataset: { v }, onclick: (e) => { set(v); e.currentTarget.blur(); } }));
      }
      const sync = () => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === get()));
      syncers.push(sync);
      sync();
      bar.appendChild(el('span', { class: 'opt' }, o.label, seg));
    }
  }
  if (tool === transformTool) {
    const read = el('span', { class: 'opt' });
    const sync = () => { read.textContent = transformTool.readout(); };
    syncers.push(sync);
    sync();
    bar.append(
      el('span', { class: 'opt-sep' }), read,
      el('button', { class: 'btn', type: 'button', textContent: 'Flip H', onclick: () => transformTool.flip('h') }),
      el('button', { class: 'btn', type: 'button', textContent: 'Flip V', onclick: () => transformTool.flip('v') }),
      el('button', { class: 'btn', type: 'button', textContent: 'Cancel', onclick: () => transformTool.cancelTransform() }),
      el('button', { class: 'btn primary', type: 'button', textContent: 'Apply', onclick: () => transformTool.apply() }),
    );
  }
  if (tool === cropTool) {
    bar.append(
      el('span', { class: 'opt-sep' }),
      el('button', { class: 'btn', type: 'button', textContent: 'Cancel', onclick: () => { cropTool.rect = null; app.view.requestRender(); } }),
      el('button', { class: 'btn primary', type: 'button', textContent: 'Crop', onclick: () => cropTool.apply() }),
    );
  }
  if (tool.hint) bar.appendChild(el('span', { class: 'opt', style: 'opacity:.75' }, el('span', { class: 'opt-sep' }), tool.hint));
}

// ---- Colour panel ---------------------------------------------------------------------------------
let target = 'fg';
let setTargetFn = () => {};
function setTarget(t) { target = t; setTargetFn(); }

const DEFAULT_SWATCHES = [
  '#000000', '#3a3a3a', '#7a7a7a', '#b5b5b5', '#ffffff', '#221c17', '#4a3426', '#7a5230', '#b07a45', '#e7c79a',
  '#f3eee4', '#556b2f', '#8f9f74', '#2c4027', '#a7bd6c', '#7a2531', '#cf6f7b', '#d99a1e', '#f0b43c', '#e8572e',
  '#ff4fa3', '#ff4fd8', '#9d5bd0', '#3df0ff', '#2bb38a', '#ffd95e', '#c62d4a', '#5b3c88', '#1a1230', '#0d0820',
];
const SWATCH_KEY = 'vibepaint.swatches.v1';

export function initColorPanel() {
  const root = $('color-panel');
  let hsv = rgbToHsv(app.fg);
  const seg = el('span', { class: 'seg', style: 'margin-bottom:8px' },
    el('button', { type: 'button', textContent: 'Foreground', dataset: { t: 'fg' }, onclick: () => setTarget('fg') }),
    el('button', { type: 'button', textContent: 'Background', dataset: { t: 'bg' }, onclick: () => setTarget('bg') }));
  const sv = el('div', { class: 'cp-sv' });
  const svCanvas = el('canvas', { width: 256, height: 160 });
  const svKnob = el('div', { class: 'cp-knob' });
  sv.append(svCanvas, svKnob);
  const hue = el('div', { class: 'cp-strip' });
  const hueCanvas = el('canvas', { width: 256, height: 12 });
  const hueBar = el('div', { class: 'cp-bar' });
  hue.append(hueCanvas, hueBar);
  const hex = el('input', { type: 'text', spellcheck: false, ariaLabel: 'Hex color' });
  const rIn = el('input', { type: 'number', min: 0, max: 255, ariaLabel: 'Red' });
  const gIn = el('input', { type: 'number', min: 0, max: 255, ariaLabel: 'Green' });
  const bIn = el('input', { type: 'number', min: 0, max: 255, ariaLabel: 'Blue' });
  const fields = el('div', { class: 'cp-fields' }, hex, rIn, gIn, bIn);
  const swatches = el('div', { class: 'swatches' });
  root.append(seg, sv, hue, fields, swatches);

  // Hue strip.
  const hg = hueCanvas.getContext('2d');
  const grad = hg.createLinearGradient(0, 0, 256, 0);
  for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, `hsl(${i * 60},100%,50%)`);
  hg.fillStyle = grad;
  hg.fillRect(0, 0, 256, 12);

  const drawSV = () => {
    const g = svCanvas.getContext('2d');
    const c = hsvToRgb(hsv.h, 1, 1);
    g.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
    g.fillRect(0, 0, 256, 160);
    const w = g.createLinearGradient(0, 0, 256, 0);
    w.addColorStop(0, '#fff'); w.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = w; g.fillRect(0, 0, 256, 160);
    const b = g.createLinearGradient(0, 0, 0, 160);
    b.addColorStop(0, 'rgba(0,0,0,0)'); b.addColorStop(1, '#000');
    g.fillStyle = b; g.fillRect(0, 0, 256, 160);
  };
  const place = () => {
    svKnob.style.left = `${hsv.s * 100}%`;
    svKnob.style.top = `${(1 - hsv.v) * 100}%`;
    hueBar.style.left = `${(hsv.h / 360) * 100}%`;
  };
  const current = () => app[target];
  const syncFields = () => {
    const c = current();
    if (document.activeElement !== hex) hex.value = toHex(c);
    rIn.value = Math.round(c.r); gIn.value = Math.round(c.g); bIn.value = Math.round(c.b);
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === target));
  };
  const fromColor = () => { const h = hsv.h; hsv = rgbToHsv(current()); if (hsv.s === 0 || hsv.v === 0) hsv.h = h; drawSV(); place(); syncFields(); };
  const commit = () => { const c = hsvToRgb(hsv.h, hsv.s, hsv.v); updating = true; app.setColor(target, { ...c, a: 1 }); updating = false; place(); syncFields(); };
  let updating = false;
  setTargetFn = fromColor;

  const drag = (elem, fn) => {
    elem.addEventListener('pointerdown', (e) => {
      elem.setPointerCapture(e.pointerId);
      const move = (ev) => { const r = elem.getBoundingClientRect(); fn(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))); };
      move(e);
      elem.onpointermove = move;
      elem.onpointerup = () => { elem.onpointermove = null; };
    });
  };
  drag(sv, (x, y) => { hsv.s = x; hsv.v = 1 - y; commit(); });
  drag(hue, (x) => { hsv.h = Math.min(359.9, x * 360); drawSV(); commit(); });
  hex.addEventListener('change', () => { const c = fromHex(hex.value); if (c) app.setColor(target, c); });
  for (const [inp, k] of [[rIn, 'r'], [gIn, 'g'], [bIn, 'b']]) {
    inp.addEventListener('change', () => app.setColor(target, { ...current(), [k]: Math.min(255, Math.max(0, Number(inp.value) || 0)) }));
  }
  on('color', () => { if (!updating) fromColor(); else syncFields(); });

  // Swatches: click = foreground, Alt-click = background, right-click removes a custom one.
  let list;
  try { list = JSON.parse(localStorage.getItem(SWATCH_KEY)) || DEFAULT_SWATCHES; } catch { list = DEFAULT_SWATCHES; }
  const save = () => { try { localStorage.setItem(SWATCH_KEY, JSON.stringify(list)); } catch { /* ignore */ } };
  const renderSwatches = () => {
    swatches.replaceChildren();
    list.forEach((h, i) => swatches.appendChild(el('button', {
      type: 'button', title: `${h} (Alt-click: background, right-click: remove)`, style: `background:${h}`,
      onclick: (e) => app.setColor(e.altKey ? 'bg' : 'fg', fromHex(h)),
      oncontextmenu: (e) => { e.preventDefault(); list.splice(i, 1); save(); renderSwatches(); },
    })));
    swatches.appendChild(el('button', { class: 'add', type: 'button', title: 'Add the foreground color', textContent: '+', onclick: () => { list.push(toHex(app.fg)); save(); renderSwatches(); } }));
  };
  renderSwatches();
  fromColor();
}

// ---- Layers panel ---------------------------------------------------------------------------------
export function initLayersPanel() {
  const root = $('layers-panel');
  const blend = el('select', { ariaLabel: 'Blend mode' });
  for (const [v, t] of BLEND_MODES) blend.add(new Option(t, v));
  const opacity = el('input', { type: 'range', min: 0, max: 100, ariaLabel: 'Layer opacity' });
  const opOut = el('output', { style: 'min-width:34px;text-align:right' });
  const lock = el('button', { class: 'icon-btn', type: 'button', title: 'Lock transparent pixels', onclick: () => cmd.toggleLockAlpha() }, icon('ph-lock-simple'));
  const controls = el('div', { class: 'layer-controls' },
    blend, lock,
    el('div', { class: 'row', style: 'grid-column:1/-1' }, 'Opacity', opacity, opOut));
  const list = el('div', { class: 'layer-list', role: 'listbox', ariaLabel: 'Layers' });
  const btn = (ic, title, fn) => el('button', { class: 'icon-btn', type: 'button', title, ariaLabel: title, onclick: fn }, icon(ic));
  const actions = el('div', { class: 'layer-actions' },
    btn('ph-plus', 'New layer (Ctrl+Shift+N)', cmd.newLayer),
    btn('ph-copy', 'Duplicate layer (Ctrl+J)', cmd.duplicateLayer),
    btn('ph-arrow-up', 'Move layer up (Ctrl+])', () => cmd.moveLayer(1)),
    btn('ph-arrow-down', 'Move layer down (Ctrl+[)', () => cmd.moveLayer(-1)),
    btn('ph-stack', 'Merge down (Ctrl+E)', cmd.mergeDown),
    btn('ph-trash', 'Delete layer', cmd.deleteLayer));
  root.append(controls, list, actions);

  blend.addEventListener('change', () => { layerProps(app, app.doc.active, 'Blend Mode', { blend: blend.value }); blend.blur(); });
  let opStart = null;
  opacity.addEventListener('input', () => {
    const l = app.doc.active;
    if (opStart === null) opStart = l.opacity;
    l.opacity = Number(opacity.value) / 100;
    opOut.textContent = `${opacity.value}%`;
    app.redraw();
  });
  opacity.addEventListener('change', () => {
    const l = app.doc.active;
    const v = l.opacity;
    l.opacity = opStart ?? v;
    opStart = null;
    layerProps(app, l, 'Layer Opacity', { opacity: v });
    opacity.blur();
  });

  const thumbs = new Map();
  let dragId = null;
  const render = () => {
    const doc = app.doc;
    list.replaceChildren();
    thumbs.clear();
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      const l = doc.layers[i];
      const vis = el('button', { class: `vis${l.visible ? '' : ' off'}`, type: 'button', title: l.visible ? 'Hide layer' : 'Show layer' }, icon(l.visible ? 'ph-eye' : 'ph-eye-slash'));
      vis.addEventListener('click', (e) => { e.stopPropagation(); layerProps(app, l, l.visible ? 'Hide Layer' : 'Show Layer', { visible: !l.visible }); });
      const thumb = el('canvas', { width: 80, height: 60 });
      thumbs.set(l.id, thumb);
      const name = el('span', { class: 'name', textContent: l.name, title: 'Double-click to rename' });
      const badges = [l.lockAlpha ? '🔒' : '', l.blend !== 'source-over' ? BLEND_MODES.find((b) => b[0] === l.blend)?.[1] : '', l.opacity < 1 ? `${Math.round(l.opacity * 100)}%` : ''].filter(Boolean).join(' ');
      const row = el('div', { class: `layer${l.id === doc.activeId ? ' active' : ''}`, role: 'option', draggable: true, ariaSelected: String(l.id === doc.activeId) },
        vis, thumb, name, el('span', { class: 'badge', textContent: badges }));
      row.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey) { doc.activeId = l.id; cmd.selectLayerAlpha(); }
        doc.activeId = l.id;
        emit('layer');
      });
      name.addEventListener('dblclick', () => {
        const input = el('input', { type: 'text', value: l.name, style: 'width:100%' });
        name.replaceWith(input);
        input.focus();
        input.select();
        const done = (ok) => { if (ok && input.value.trim() && input.value !== l.name) layerProps(app, l, 'Rename Layer', { name: input.value.trim() }); else render(); };
        input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
        input.addEventListener('blur', () => done(true));
      });
      row.addEventListener('dragstart', (e) => { dragId = l.id; e.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        if (dragId == null || dragId === l.id) return;
        const id = dragId;
        dragId = null;
        structural(app, 'Arrange Layer', () => doc.moveLayer(id, doc.layers.indexOf(l)));
      });
      list.appendChild(row);
    }
    drawThumbs();
    syncControls();
  };
  const drawThumbs = () => {
    for (const l of app.doc.layers) {
      const c = thumbs.get(l.id);
      if (!c) continue;
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      const k = Math.min(c.width / app.doc.width, c.height / app.doc.height);
      const w = app.doc.width * k, h = app.doc.height * k;
      g.imageSmoothingEnabled = k < 1;
      g.drawImage(l.canvas, (c.width - w) / 2, (c.height - h) / 2, w, h);
    }
  };
  const syncControls = () => {
    const l = app.doc.active;
    blend.value = l.blend;
    if (opStart === null) { opacity.value = Math.round(l.opacity * 100); opOut.textContent = `${opacity.value}%`; }
    lock.classList.toggle('on', l.lockAlpha);
  };
  let thumbTimer = 0;
  on('doc', render);
  on('layer', render);
  on('pixels', () => { clearTimeout(thumbTimer); thumbTimer = setTimeout(drawThumbs, 120); });
  render();
}

// ---- History panel --------------------------------------------------------------------------------
export function initHistoryPanel() {
  const root = $('history-panel');
  const list = el('div', { class: 'history-list' });
  root.appendChild(list);
  const render = () => {
    list.replaceChildren();
    app.history.entries.forEach((e, i) => {
      const cls = i === app.history.index ? ' current' : i > app.history.index ? ' future' : '';
      list.appendChild(el('button', { class: `history-item${cls}`, type: 'button', textContent: e.label, onclick: () => app.history.jumpTo(i) }));
    });
    list.scrollTop = list.scrollHeight;
  };
  on('history', render);
  render();
}

// ---- Collapsible panels & mobile drawer ------------------------------------------------------------
export function initPanelChrome() {
  document.querySelectorAll('.panel h2').forEach((h) => h.addEventListener('click', () => h.parentElement.classList.toggle('collapsed')));
  $('panel-toggle').addEventListener('click', () => $('panels').classList.toggle('open'));
}

// ---- Status bar -----------------------------------------------------------------------------------
export function initStatusBar() {
  const bar = $('statusbar');
  const zoom = el('span');
  const size = el('span');
  const pos = el('span');
  const busy = el('span', { class: 'busy', id: 'status-busy' });
  bar.append(zoom, size, pos, busy);
  const sync = () => {
    const d = app.doc;
    zoom.innerHTML = `Zoom <b>${Math.round(app.view.zoom * 1000) / 10}%</b>`;
    size.innerHTML = `<b>${d.width} × ${d.height}</b> px · ${d.layers.length} layer${d.layers.length > 1 ? 's' : ''}`;
    $('doc-title').textContent = d.name || 'Untitled';
  };
  on('view', sync);
  on('doc', sync);
  on('history', sync);
  sync();
  app.view.canvas.addEventListener('pointermove', (e) => {
    const p = app.view.toDoc(...Object.values(app.view.eventPoint(e)));
    const inside = p.x >= 0 && p.y >= 0 && p.x < app.doc.width && p.y < app.doc.height;
    pos.innerHTML = inside ? `X <b>${Math.floor(p.x)}</b> Y <b>${Math.floor(p.y)}</b>` : '';
  });
}
