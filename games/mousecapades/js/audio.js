// Tiny Web Audio synth for sound effects. No files: every sound is a few oscillator sweeps.

const MUTE_KEY = 'mousecapades.muted';
let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* ignore */ }

// Browsers only allow audio after a user gesture; call this from a key/button handler.
export function unlockAudio() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.2;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { ctx = null; return; }
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.2;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
  return muted;
}

export const isMuted = () => muted;

function tone(f0, f1, dur, type = 'square', vol = 0.3, at = 0) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.3, at = 0, freq = 1200) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur);
}

const notes = (seq, type, vol, len) => seq.forEach((f, i) => tone(f, f, len, type, vol, i * len * 0.8));

const SOUNDS = {
  jump: () => tone(240, 560, 0.13, 'square', 0.18),
  chip: () => { tone(1046, 1046, 0.05, 'square', 0.16); tone(1568, 1568, 0.16, 'square', 0.16, 0.05); },
  stomp: () => { tone(520, 140, 0.12, 'square', 0.3); noise(0.08, 0.25, 0, 900); },
  bump: () => tone(160, 90, 0.09, 'triangle', 0.45),
  block: () => { tone(220, 110, 0.06, 'triangle', 0.4); SOUNDS.chip(); },
  kick: () => { tone(300, 900, 0.1, 'square', 0.22); noise(0.06, 0.2, 0, 2000); },
  gold: () => notes([784, 988, 1175, 1568, 1976], 'square', 0.16, 0.07),
  checkpoint: () => notes([523, 659, 784, 1046], 'triangle', 0.35, 0.09),
  die: () => { tone(880, 110, 0.6, 'square', 0.22); notes([392, 330, 262], 'triangle', 0.3, 0.16); },
  pause: () => tone(660, 660, 0.06, 'square', 0.15),
  start: () => notes([392, 523, 659, 784], 'square', 0.15, 0.07),
  clear: () => {
    notes([523, 659, 784, 1046, 784, 1046], 'square', 0.14, 0.12);
    notes([262, 330, 392, 523, 392, 523], 'triangle', 0.3, 0.12);
  },
};

export function sfx(name) {
  if (!ctx || muted || !SOUNDS[name]) return;
  try { SOUNDS[name](); } catch { /* never let audio break the game */ }
}
