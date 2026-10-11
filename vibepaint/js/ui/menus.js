import { app } from '../core/app.js';
import * as cmd from '../commands.js';
import * as io from '../io.js';
import { runFilter, openDialog } from './dialogs.js';
import { ADJUSTMENTS } from '../filters/adjust.js';
import { FILTERS } from '../filters/filters.js';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const pretty = (sc) => (sc ? (isMac ? sc.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧') : sc) : '');
const adj = (id) => ADJUSTMENTS.find((a) => a.id === id);

// [label, shortcut, action, enabled?] | '-' | { group }
export function menuDefinitions() {
  const sel = () => app.selection?.active;
  return [
    ['File', [
      ['New…', 'Alt+N', io.newDocumentDialog],
      ['Open…', 'Ctrl+O', () => io.openFile()],
      ['Place Image as Layer…', 'Shift+Ctrl+P', () => io.placeFile()],
      '-',
      ['Save Project (.vpaint)', 'Ctrl+S', io.saveProject],
      ['Export Image…', 'Ctrl+Shift+S', io.exportDialog],
      ['Quick Export PNG', 'Ctrl+Alt+S', () => io.exportImage('png')],
    ]],
    ['Edit', [
      ['Undo', 'Ctrl+Z', () => app.history.undo(), () => app.history.canUndo],
      ['Redo', 'Ctrl+Shift+Z', () => app.history.redo(), () => app.history.canRedo],
      '-',
      ['Cut', 'Ctrl+X', cmd.cut, sel],
      ['Copy', 'Ctrl+C', () => cmd.copy()],
      ['Copy Merged', 'Ctrl+Shift+C', () => cmd.copy({ merged: true })],
      ['Paste', 'Ctrl+V', io.pasteFromMenu],
      ['Clear', 'Delete', () => cmd.clear(), sel],
      '-',
      ['Fill…', 'Shift+F5', cmd.fillDialog],
      ['Fill with Foreground', 'Alt+Backspace', () => cmd.fillWith(app.fg, 1, 'Fill')],
      ['Fill with Background', 'Ctrl+Backspace', () => cmd.fillWith(app.bg, 1, 'Fill')],
      ['Stroke Selection…', '', cmd.strokeDialog, sel],
      '-',
      ['Free Transform', 'Ctrl+T', cmd.freeTransform],
      ['Flip Layer Horizontal', '', () => cmd.flipLayer('h')],
      ['Flip Layer Vertical', '', () => cmd.flipLayer('v')],
    ]],
    ['Image', [
      { group: 'Adjustments' },
      ...ADJUSTMENTS.map((a) => [a.name, a.shortcut || '', () => runFilter(a)]),
      '-',
      ['Image Size…', 'Ctrl+Alt+I', cmd.imageSizeDialog],
      ['Canvas Size…', 'Ctrl+Alt+C', cmd.canvasSizeDialog],
      ['Rotate 90° Clockwise', '', () => cmd.rotateCanvas(90)],
      ['Rotate 90° Counter-clockwise', '', () => cmd.rotateCanvas(-90)],
      ['Rotate 180°', '', () => cmd.rotateCanvas(180)],
      ['Flip Canvas Horizontal', '', () => cmd.flipCanvas('h')],
      ['Flip Canvas Vertical', '', () => cmd.flipCanvas('v')],
      '-',
      ['Crop to Selection', '', cmd.cropToSelection, sel],
      ['Trim Transparent Edges', '', cmd.trim],
    ]],
    ['Layer', [
      ['New Layer', 'Ctrl+Shift+N', cmd.newLayer],
      ['Duplicate Layer', '', cmd.duplicateLayer],
      ['Layer via Copy', 'Ctrl+J', () => cmd.layerVia(false)],
      ['Layer via Cut', 'Ctrl+Shift+J', () => cmd.layerVia(true), sel],
      ['Delete Layer', '', cmd.deleteLayer],
      ['Layer Properties…', '', cmd.layerPropertiesDialog],
      ['Lock Transparent Pixels', '/', cmd.toggleLockAlpha],
      '-',
      ['Bring to Front', 'Ctrl+Shift+]', () => cmd.moveLayer('top')],
      ['Bring Forward', 'Ctrl+]', () => cmd.moveLayer(1)],
      ['Send Backward', 'Ctrl+[', () => cmd.moveLayer(-1)],
      ['Send to Back', 'Ctrl+Shift+[', () => cmd.moveLayer('bottom')],
      '-',
      ['Merge Down', 'Ctrl+E', cmd.mergeDown],
      ['Merge Visible', 'Ctrl+Shift+E', cmd.mergeVisible],
      ['Flatten Image', '', cmd.flatten],
    ]],
    ['Select', [
      ['All', 'Ctrl+A', cmd.selectAll],
      ['Deselect', 'Ctrl+D', cmd.deselect, sel],
      ['Reselect', 'Ctrl+Shift+D', cmd.reselect],
      ['Inverse', 'Ctrl+Shift+I', cmd.inverse],
      '-',
      ['Expand…', '', () => cmd.modifyDialog('grow'), sel],
      ['Contract…', '', () => cmd.modifyDialog('shrink'), sel],
      ['Feather…', 'Shift+F6', () => cmd.modifyDialog('feather'), sel],
      '-',
      ['Select Layer Pixels', 'Ctrl+click thumbnail', cmd.selectLayerAlpha],
    ]],
    ['Filter', FILTERS.map((f) => (f.group ? { group: f.group } : [f.name, '', () => runFilter(f)]))],
    ['View', [
      ['Zoom In', 'Ctrl+=', () => app.view.zoomStep(1)],
      ['Zoom Out', 'Ctrl+-', () => app.view.zoomStep(-1)],
      ['Fit on Screen', 'Ctrl+0', () => app.view.fit()],
      ['Actual Pixels (100%)', 'Ctrl+1', () => app.view.setZoom(1)],
      '-',
      ['Toggle Pixel Grid (zoomed in)', "Ctrl+'", cmd.toggleGrid],
    ]],
    ['Help', [
      ['Keyboard Shortcuts', '?', showShortcuts],
      ['About VibePaint', '', showAbout],
      ['Back to Portfolio', '', () => { location.href = '../index.html'; }],
    ]],
  ];
}

export function initMenus() {
  const bar = document.getElementById('menubar');
  let open = null;
  const closeAll = () => { open?.classList.remove('open'); open = null; };
  for (const [title, items] of menuDefinitions()) {
    const menu = document.createElement('div');
    menu.className = 'menu';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = title;
    btn.setAttribute('aria-haspopup', 'true');
    const list = document.createElement('div');
    list.className = 'menu-list';
    list.setAttribute('role', 'menu');
    const build = () => {
      list.replaceChildren();
      for (const it of items) {
        if (it === '-') { list.appendChild(Object.assign(document.createElement('div'), { className: 'menu-sep' })); continue; }
        if (it.group) { list.appendChild(Object.assign(document.createElement('div'), { className: 'menu-group', textContent: it.group })); continue; }
        const [label, sc, action, enabled] = it;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'menu-item';
        b.setAttribute('role', 'menuitem');
        b.disabled = enabled ? !enabled() : false;
        b.innerHTML = '<span></span><span class="sc"></span>';
        b.firstChild.textContent = label;
        b.lastChild.textContent = pretty(sc);
        b.addEventListener('click', () => { closeAll(); action(); });
        list.appendChild(b);
      }
    };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (open === menu) { closeAll(); return; }
      closeAll();
      build();
      menu.classList.add('open');
      open = menu;
    });
    btn.addEventListener('pointerenter', () => {
      if (open && open !== menu) { closeAll(); build(); menu.classList.add('open'); open = menu; }
    });
    menu.append(btn, list);
    bar.appendChild(menu);
  }
  document.addEventListener('pointerdown', (e) => { if (open && !open.contains(e.target)) closeAll(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) closeAll(); });
}

const SHORTCUTS = [
  ['Move', 'V'], ['Marquee / Ellipse', 'M / Shift+M'], ['Lasso / Polygonal', 'L / Shift+L'], ['Magic Wand', 'W'], ['Crop', 'C'],
  ['Eyedropper', 'I'], ['Brush / Pencil', 'B / Shift+B'], ['Eraser', 'E'], ['Clone Stamp (Alt-click source)', 'S'], ['Smudge', 'P'],
  ['Blur / Sharpen', 'R'], ['Dodge / Burn', 'O'], ['Bucket / Gradient', 'G / Shift+G'], ['Shapes', 'U'], ['Text', 'T'], ['Hand / Zoom', 'H / Z'],
  ['Pan with any tool', 'Hold Space'], ['Brush size', '[ and ]'], ['Brush hardness', 'Shift+[ and Shift+]'], ['Tool opacity', '1 … 0'],
  ['Pick color while painting', 'Alt-click'], ['Straight line', 'Shift-click'], ['Swap / reset colors', 'X / D'],
  ['Undo / Redo', 'Ctrl+Z / Ctrl+Shift+Z'], ['Free Transform', 'Ctrl+T (or Ctrl+Alt+T)'], ['Deselect / Inverse', 'Ctrl+D / Ctrl+Shift+I'],
  ['New layer / Layer via copy', 'Ctrl+Shift+N / Ctrl+J'], ['Merge down', 'Ctrl+E'], ['Levels / Curves / Hue-Sat', 'Ctrl+L / Ctrl+M / Ctrl+U'],
  ['Fit / 100%', 'Ctrl+0 / Ctrl+1'], ['Save project / Export', 'Ctrl+S / Ctrl+Shift+S'],
];

export function showShortcuts() {
  openDialog({ title: 'Keyboard shortcuts', fields: [{ type: 'note', text: 'Browsers reserve a few shortcuts (Ctrl+N, Ctrl+T, Ctrl+W). Use the alternatives shown, or the menus.' }], okLabel: 'Close' });
  const dlg = document.querySelector('.dialog');
  const table = document.createElement('table');
  table.className = 'shortcut-table';
  for (const [a, k] of SHORTCUTS) {
    const tr = table.insertRow();
    tr.insertCell().textContent = a;
    const td = tr.insertCell();
    td.innerHTML = `<kbd></kbd>`;
    td.firstChild.textContent = pretty(k);
  }
  dlg.insertBefore(table, dlg.querySelector('.actions'));
  dlg.querySelector('.actions .btn:not(.primary)')?.remove();
}

function showAbout() {
  openDialog({
    title: 'About VibePaint',
    okLabel: 'Close',
    fields: [{ type: 'note', text: 'A Photoshop-lite image editor that runs entirely in your browser: layers with blend modes, selections, brushes, filters, adjustments and free transform. Nothing is uploaded anywhere. Designed by Ross Grant and built with AI coding tools. Your work autosaves in this browser, and Save Project keeps your layers.' }],
  });
  document.querySelector('.dialog .actions .btn:not(.primary)')?.remove();
}

export { adj };
