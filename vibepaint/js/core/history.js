import { emit } from './events.js';

// Undo/redo as a list of {label, undo(), redo()} entries. Two helpers build entries for the two
// kinds of change: pixel edits on one layer (cheap, stores only the changed rectangle) and
// structural edits (stores whole-document snapshots).
export class History {
  constructor(limit = 60) {
    this.limit = limit;
    this.entries = [];
    this.index = -1; // index of the last applied entry
  }

  reset(label = 'Open') {
    this.entries = [{ label, undo() {}, redo() {} }];
    this.index = 0;
    emit('history');
  }

  push(entry) {
    this.entries.length = this.index + 1;
    this.entries.push(entry);
    if (this.entries.length > this.limit) this.entries.splice(1, this.entries.length - this.limit);
    this.index = this.entries.length - 1;
    emit('history', entry);
  }

  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.entries.length - 1; }

  undo() {
    if (!this.canUndo) return;
    this.entries[this.index].undo();
    this.index--;
    emit('history');
  }

  redo() {
    if (!this.canRedo) return;
    this.index++;
    this.entries[this.index].redo();
    emit('history');
  }

  jumpTo(i) {
    while (this.index > i) this.undo();
    while (this.index < i) this.redo();
  }
}

export function clampRect(r, w, h) {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(w, Math.ceil(r.x + r.w));
  const y1 = Math.min(h, Math.ceil(r.y + r.h));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Record a pixel edit on `layer`. Call with the rectangle that will change, then `commit()` after
// drawing. `beforeSource` lets callers that already drew read the "before" pixels from a backup.
export function beginPixelEdit(app, layer, rect, label, beforeSource = layer.canvas) {
  const doc = app.doc;
  const r = clampRect(rect, doc.width, doc.height);
  if (!r) return { commit() {}, rect: null };
  const before = beforeSource.getContext('2d').getImageData(r.x, r.y, r.w, r.h);
  return {
    rect: r,
    commit() {
      const after = layer.ctx.getImageData(r.x, r.y, r.w, r.h);
      const id = layer.id;
      const put = (data) => {
        const l = app.doc.layerById(id);
        if (!l) return;
        l.ctx.putImageData(data, r.x, r.y);
        app.doc.dirty = true;
        emit('pixels', l);
      };
      app.history.push({ label, undo: () => put(before), redo: () => put(after) });
      doc.dirty = true;
      emit('pixels', layer);
    },
  };
}

// Record a structural edit: snapshot, run `fn`, snapshot again.
export function structural(app, label, fn) {
  const doc = app.doc;
  const before = doc.snapshot();
  const result = fn();
  if (result === false) return;
  const after = doc.snapshot();
  const apply = (snap) => {
    app.doc.restore(snap);
    app.selection.resize(app.doc.width, app.doc.height);
    emit('doc');
    emit('pixels');
  };
  app.history.push({ label, undo: () => apply(before), redo: () => apply(after) });
  doc.dirty = true;
  emit('doc');
  emit('pixels');
}

// Record a change to layer properties (opacity, blend, name, visibility…).
export function layerProps(app, layer, label, changes) {
  const id = layer.id;
  const before = {};
  for (const k of Object.keys(changes)) before[k] = layer[k];
  Object.assign(layer, changes);
  const set = (vals) => {
    const l = app.doc.layerById(id);
    if (!l) return;
    Object.assign(l, vals);
    app.doc.dirty = true;
    emit('layer');
    emit('pixels');
  };
  app.history.push({ label, undo: () => set(before), redo: () => set(changes) });
  app.doc.dirty = true;
  emit('layer');
  emit('pixels');
}
