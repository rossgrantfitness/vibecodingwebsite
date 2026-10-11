// Tiny event bus. Events used across the app:
//   'doc'        document replaced or layer list changed
//   'pixels'     some layer pixels changed (redraw + thumbnails)
//   'layer'      active layer or layer properties changed
//   'history'    history stack changed
//   'tool'       active tool or tool options changed
//   'color'      foreground/background colour changed
//   'selection'  selection changed
//   'view'       zoom/pan changed
const handlers = new Map();

export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, new Set());
  handlers.get(name).add(fn);
  return () => handlers.get(name).delete(fn);
}

export function emit(name, data) {
  const set = handlers.get(name);
  if (set) for (const fn of [...set]) fn(data);
}
