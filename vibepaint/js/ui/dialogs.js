import { app } from '../core/app.js';
import { emit } from '../core/events.js';
import { clampRect } from '../core/history.js';
import { blendByMask } from '../core/pixels.js';
import { curveLUT, histogram } from '../filters/adjust.js';

const root = () => document.getElementById('dialog-root');
let openDialogEl = null;
export const dialogOpen = () => !!openDialogEl;

// Generic modal dialog.
// fields: [{ id, label, type: range|number|select|checkbox|text|curve|histogram|anchor|note, ... }]
// onChange(values) fires live (debounced to one per frame); onOk/onCancel close it.
export function openDialog({ title, fields = [], okLabel = 'OK', onChange, onOk, onCancel, preview = false, histogramSource }) {
  closeDialog();
  const values = {};
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop' + (preview ? ' preview' : '');
  const dlg = document.createElement('div');
  dlg.className = 'dialog';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-label', title);
  dlg.innerHTML = `<h3></h3>`;
  dlg.querySelector('h3').textContent = title;
  const redrawers = [];

  let raf = 0;
  const changed = () => {
    if (!onChange || raf) return;
    raf = requestAnimationFrame(() => { raf = 0; if (previewOn) onChange({ ...values }); });
  };
  let previewOn = true;

  for (const f of fields) {
    values[f.id] = f.value;
    const row = document.createElement('div');
    if (f.type === 'note') {
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = f.text;
      dlg.appendChild(p);
      continue;
    }
    if (f.type === 'checkbox') {
      row.className = 'field check';
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!f.value;
      cb.onchange = () => { values[f.id] = cb.checked; changed(); };
      label.append(cb, document.createTextNode(f.label));
      row.appendChild(label);
      dlg.appendChild(row);
      continue;
    }
    if (f.type === 'histogram') {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 80;
      c.className = 'curve-editor';
      c.style.aspectRatio = '256 / 80';
      c.style.marginBottom = '10px';
      const draw = () => drawHistogram(c, histogramSource, values.channel);
      redrawers.push(draw);
      draw();
      dlg.appendChild(c);
      continue;
    }
    if (f.type === 'curve') {
      dlg.appendChild(curveEditor(values, f.id, changed, histogramSource, redrawers));
      continue;
    }
    row.className = 'field' + (f.type === 'range' ? '' : ' wide');
    const label = document.createElement('label');
    label.textContent = f.label;
    row.appendChild(label);
    if (f.type === 'range') {
      const r = document.createElement('input');
      r.type = 'range';
      Object.assign(r, { min: f.min, max: f.max, step: f.step || 1, value: f.value });
      const n = document.createElement('input');
      n.type = 'number';
      Object.assign(n, { min: f.min, max: f.max, step: f.step || 1, value: f.value });
      const set = (v) => { values[f.id] = Number(v); r.value = v; n.value = v; changed(); };
      r.oninput = () => set(r.value);
      n.onchange = () => set(Math.min(f.max, Math.max(f.min, Number(n.value) || 0)));
      row.append(r, n);
    } else if (f.type === 'select') {
      const s = document.createElement('select');
      for (const [v, t] of f.choices) s.add(new Option(t, v));
      s.value = f.value;
      s.onchange = () => { values[f.id] = s.value; redrawers.forEach((d) => d()); changed(); };
      row.appendChild(s);
    } else if (f.type === 'anchor') {
      const grid = document.createElement('div');
      grid.className = 'anchor-grid';
      for (let i = 0; i < 9; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', `Anchor ${i + 1}`);
        if (i === f.value) b.classList.add('on');
        b.onclick = () => { values[f.id] = i; grid.querySelectorAll('button').forEach((x, j) => x.classList.toggle('on', j === i)); };
        grid.appendChild(b);
      }
      row.appendChild(grid);
    } else {
      const inp = document.createElement('input');
      inp.type = f.type === 'number' ? 'number' : 'text';
      if (f.type === 'number') Object.assign(inp, { min: f.min ?? '', max: f.max ?? '', step: f.step || 1 });
      inp.value = f.value;
      inp.oninput = () => { values[f.id] = f.type === 'number' ? Number(inp.value) : inp.value; f.onInput?.(values, setValue); changed(); };
      row.appendChild(inp);
      row.dataset.field = f.id;
    }
    dlg.appendChild(row);
  }

  // Lets linked fields (e.g. width/height with "keep proportions") update each other.
  function setValue(id, v) {
    values[id] = v;
    const inp = dlg.querySelector(`[data-field="${id}"] input`);
    if (inp) inp.value = v;
  }

  const actions = document.createElement('div');
  actions.className = 'actions';
  if (preview) {
    const left = document.createElement('label');
    left.className = 'left';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.onchange = () => { previewOn = cb.checked; onChange?.(previewOn ? { ...values } : null); };
    left.append(cb, document.createTextNode('Preview'));
    actions.appendChild(left);
  }
  const cancel = document.createElement('button');
  cancel.className = 'btn';
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  const ok = document.createElement('button');
  ok.className = 'btn primary';
  ok.type = 'submit';
  ok.textContent = okLabel;
  actions.append(cancel, ok);
  dlg.appendChild(actions);

  const close = () => { cancelAnimationFrame(raf); backdrop.remove(); openDialogEl = null; document.removeEventListener('keydown', onKey, true); };
  const doCancel = () => { close(); onCancel?.(); };
  const doOk = () => { close(); onOk?.({ ...values }); };
  cancel.onclick = doCancel;
  ok.onclick = doOk;
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); doCancel(); }
    else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); e.stopPropagation(); doOk(); }
    else e.stopPropagation();
  };
  document.addEventListener('keydown', onKey, true);
  if (!preview) backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) doCancel(); });
  backdrop.appendChild(dlg);
  root().appendChild(backdrop);
  openDialogEl = backdrop;
  setTimeout(() => (dlg.querySelector('input, select') || ok).focus(), 0);
  if (onChange && preview) onChange({ ...values });
  return { values, close };
}

export function closeDialog() {
  if (openDialogEl) { openDialogEl.remove(); openDialogEl = null; }
}

export function confirmDialog(title, text, okLabel = 'OK') {
  return new Promise((resolve) => {
    openDialog({ title, fields: [{ type: 'note', text }], okLabel, onOk: () => resolve(true), onCancel: () => resolve(false) });
  });
}

function drawHistogram(canvas, src, channel = 'rgb') {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (!src) return;
  const h = histogram(src);
  const data = channel === 'r' ? h.r : channel === 'g' ? h.g : channel === 'b' ? h.b : h.l;
  const max = Math.max(1, ...Array.from(data).slice(1, 255));
  g.fillStyle = channel === 'r' ? '#cf6f7b' : channel === 'g' ? '#a7bd6c' : channel === 'b' ? '#9d8fd0' : '#c9c0b3';
  for (let i = 0; i < 256; i++) {
    const v = Math.min(1, data[i] / max) * canvas.height;
    g.fillRect(i, canvas.height - v, 1, v);
  }
}

// Curves editor: click to add a point, drag to move, drag a point off the graph to delete it.
function curveEditor(values, key, changed, src, redrawers) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  c.className = 'curve-editor';
  const pts = () => values[key];
  let drag = -1;
  const draw = () => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    if (src) {
      const h = histogram(src);
      const ch = values.channel;
      const data = ch === 'r' ? h.r : ch === 'g' ? h.g : ch === 'b' ? h.b : h.l;
      const max = Math.max(1, ...Array.from(data).slice(1, 255));
      g.fillStyle = 'rgba(201,192,179,0.18)';
      for (let i = 0; i < 256; i++) { const v = Math.min(1, data[i] / max) * 256; g.fillRect(i, 256 - v, 1, v); }
    }
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.beginPath();
    for (let i = 64; i < 256; i += 64) { g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); }
    g.moveTo(0, 256); g.lineTo(256, 0);
    g.stroke();
    const lut = curveLUT(pts());
    g.strokeStyle = '#a7bd6c';
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < 256; i++) i ? g.lineTo(i, 255 - lut[i]) : g.moveTo(i, 255 - lut[i]);
    g.stroke();
    g.fillStyle = '#fff';
    for (const [x, y] of pts()) g.fillRect(x - 3, 252 - y, 7, 7);
  };
  redrawers.push(draw);
  const pos = (e) => {
    const r = c.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 255), Math.round(255 - ((e.clientY - r.top) / r.height) * 255)];
  };
  c.addEventListener('pointerdown', (e) => {
    const [x, y] = pos(e);
    const list = pts();
    drag = list.findIndex(([px, py]) => Math.abs(px - x) < 8 && Math.abs(py - y) < 8);
    if (drag < 0) { list.push([x, y]); list.sort((a, b) => a[0] - b[0]); drag = list.findIndex((p) => p[0] === x && p[1] === y); }
    c.setPointerCapture(e.pointerId);
    draw(); changed();
  });
  c.addEventListener('pointermove', (e) => {
    if (drag < 0) return;
    const list = pts();
    let [x, y] = pos(e);
    y = Math.max(0, Math.min(255, y));
    const isEnd = drag === 0 || drag === list.length - 1;
    const outside = x < -20 || x > 275;
    if (outside && !isEnd && list.length > 2) { list.splice(drag, 1); drag = -1; draw(); changed(); return; }
    const lo = drag > 0 ? list[drag - 1][0] + 1 : 0, hi = drag < list.length - 1 ? list[drag + 1][0] - 1 : 255;
    list[drag] = [Math.max(lo, Math.min(hi, x)), y];
    draw(); changed();
  });
  c.addEventListener('pointerup', () => { drag = -1; });
  values[key] = values[key].map((p) => [...p]);
  draw();
  const wrap = document.createElement('div');
  wrap.style.marginBottom = '10px';
  wrap.appendChild(c);
  return wrap;
}

// ---- Running filters and adjustments --------------------------------------------------------------
// Applies `def.fn` to the active layer (inside the selection), with a live-preview dialog when the
// filter has parameters, as a single undo step.
export function runFilter(def) {
  const doc = app.doc;
  const layer = doc.active;
  if (!layer.visible) { app.toast('The active layer is hidden.'); return; }
  const sel = app.selection;
  const rect = clampRect(sel.active ? sel.bounds : { x: 0, y: 0, w: doc.width, h: doc.height }, doc.width, doc.height);
  if (!rect) return;
  const src = layer.ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  const mask = sel.alphaFor(rect);
  const info = { rect, fg: app.fg, bg: app.bg, doc };
  const show = (img) => { layer.ctx.putImageData(img, rect.x, rect.y); doc.dirty = true; app.view.requestRender(); };
  const apply = (params) => blendByMask(src, def.fn(src, params, info), mask);
  const commit = (result) => {
    show(result);
    const id = layer.id;
    const put = (img) => { const l = app.doc.layerById(id); if (!l) return; l.ctx.putImageData(img, rect.x, rect.y); app.doc.dirty = true; emit('pixels', l); };
    app.history.push({ label: def.name.replace('…', ''), undo: () => put(src), redo: () => put(result) });
    emit('pixels', layer);
  };

  if (!def.fields?.length) {
    app.busy(`${def.name.replace('…', '')}…`, () => commit(apply({})));
    return;
  }
  const big = rect.w * rect.h > 1.5e6;
  let last = null;
  let timer = 0;
  openDialog({
    title: def.name.replace('…', ''),
    fields: def.fields.map((f) => ({ ...f, value: Array.isArray(f.value) ? f.value.map((p) => [...p]) : f.value })),
    preview: true,
    histogramSource: src,
    onChange(values) {
      if (!values) { show(src); return; }
      if (big) {
        // Large images: preview after the slider settles.
        clearTimeout(timer);
        timer = setTimeout(() => { last = apply(values); show(last); }, 120);
      } else {
        last = apply(values);
        show(last);
      }
    },
    onOk(values) { clearTimeout(timer); app.busy(def.name.replace('…', ''), () => commit(apply(values))); },
    onCancel() { clearTimeout(timer); show(src); },
  });
}
