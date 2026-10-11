import { T, DEFAULTS, PARAMS, saveTuning, resetTuning } from './config.js';

// Live tuning panel (toggle with `). Sliders write straight into T, so changes apply next frame.
export function createDebugPanel(game) {
  const panel = document.createElement('aside');
  panel.id = 'tuning';
  panel.hidden = true;
  panel.innerHTML = `
    <header>
      <strong>Movement tuning</strong>
      <button type="button" data-act="close" aria-label="Close">✕</button>
    </header>
    <pre class="readout"></pre>
    <div class="row-buttons">
      <button type="button" data-act="copy">Copy values</button>
      <button type="button" data-act="reset">Reset all</button>
    </div>
    <div class="toggles">
      <label><input type="checkbox" data-opt="hitboxes"> Hitboxes</label>
      <label><input type="checkbox" data-opt="juice" checked> Squash &amp; stretch</label>
      <label>Speed <select data-opt="timeScale">
        <option value="1">1×</option><option value="0.5">½×</option><option value="0.25">¼×</option>
      </select></label>
    </div>
    <div class="params"></div>
    <textarea class="copy-fallback" hidden readonly></textarea>
  `;
  document.body.appendChild(panel);

  const params = panel.querySelector('.params');
  const rows = [];
  for (const { group, items } of PARAMS) {
    const h = document.createElement('h3');
    h.textContent = group;
    params.appendChild(h);
    for (const [key, min, max, step, label] of items) {
      const row = document.createElement('label');
      row.className = 'param';
      row.innerHTML = `<span class="name"></span><output></output><input type="range">`;
      row.querySelector('.name').textContent = label;
      row.title = key;
      const input = row.querySelector('input');
      Object.assign(input, { min, max, step });
      const out = row.querySelector('output');
      const sync = () => {
        input.value = T[key];
        out.textContent = +T[key].toFixed(4);
        row.classList.toggle('changed', T[key] !== DEFAULTS[key]);
      };
      input.addEventListener('input', () => { T[key] = +input.value; sync(); saveTuning(); });
      // Hand focus back to the game so arrow keys move the mouse, not the slider.
      input.addEventListener('pointerup', () => input.blur());
      input.addEventListener('change', () => input.blur());
      params.appendChild(row);
      rows.push(sync);
      sync();
    }
  }

  const syncAll = () => rows.forEach((s) => s());
  const fallback = panel.querySelector('.copy-fallback');

  panel.addEventListener('click', async (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (!act) return;
    e.target.closest('button').blur();
    if (act === 'close') toggle(false);
    if (act === 'reset') { resetTuning(); syncAll(); }
    if (act === 'copy') {
      const text = JSON.stringify(T, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        flash(e.target, 'Copied!');
      } catch {
        fallback.hidden = false;
        fallback.value = text;
        fallback.select();
      }
    }
  });

  panel.querySelectorAll('[data-opt]').forEach((el) => {
    const key = el.dataset.opt;
    el.addEventListener('change', () => {
      game.opts[key] = el.type === 'checkbox' ? el.checked : +el.value;
      el.blur();
    });
  });

  const readout = panel.querySelector('.readout');
  function toggle(force) {
    panel.hidden = force === undefined ? !panel.hidden : !force;
  }

  function update(fps) {
    if (panel.hidden) return;
    const p = game.player;
    const meter = T.pMeterFrames > 0 ? Math.round((p.pMeter / T.pMeterFrames) * 10) : 10;
    readout.textContent =
      `state    ${p.state}${p.grounded ? ' (ground)' : ''}\n` +
      `vx ${p.vx.toFixed(2).padStart(6)}   vy ${p.vy.toFixed(2).padStart(6)}\n` +
      `P-meter  ${'■'.repeat(meter)}${'·'.repeat(10 - meter)}\n` +
      `coyote ${p.coyote}  buffer ${p.jumpBuffer}\n` +
      `tile   ${(p.x / 16).toFixed(1)}, ${(p.y / 16).toFixed(1)}   ${fps} fps`;
  }

  return { toggle, update };
}

function flash(button, text) {
  const old = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = old; }, 1000);
}
