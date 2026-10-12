// Pixel sprites defined as text grids, baked once into small canvases (plus mirrored copies).
// '.' is transparent; every other character is looked up in the palette.

function bake(rows, palette) {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '.') { g.fillStyle = palette[ch]; g.fillRect(x, y, 1, 1); }
  }));
  const f = document.createElement('canvas');
  f.width = c.width;
  f.height = c.height;
  const fg = f.getContext('2d');
  fg.scale(-1, 1);
  fg.drawImage(c, -c.width, 0);
  return { img: c, flip: f, w: c.width, h: c.height };
}

// Draw a baked sprite. Sprites face left by default; flip=true faces right.
export function blit(ctx, s, x, y, flip = false) {
  ctx.drawImage(flip ? s.flip : s.img, Math.round(x), Math.round(y));
}

const CHEESE = [
  '.......k.',
  '.....kkwk',
  '...kkwwYk',
  '.kkwwYYYk',
  'kYYYYoYYk',
  'kYoYYYYYk',
  'kYYYYYoYk',
  '.kkkkkkk.',
];

const GOLD = [
  '..........kk.',
  '........kkwk.',
  '......kkwwwk.',
  '....kkwwwYYk.',
  '..kkwwYYYYYk.',
  'kkwwYYYYYYYYk',
  'kYYYYoYYYYoYk',
  'kYoYYYYYYYYYk',
  'kYYYYYYoYYYYk',
  'kYYYoYYYYYYYk',
  '.kkkkkkkkkkk.',
];

const HEART = [
  '.kk.kk.',
  'kHHkwHk',
  'kHHHHHk',
  '.kHHHk.',
  '..kHk..',
  '...k...',
];
const BIG_HEART = [
  '.kkk.kkk.',
  'kHHHkHwHk',
  'kHHHHHHwk',
  'kHHHHHHHk',
  '.kHHHHHk.',
  '..kHHHk..',
  '...kHk...',
  '....k....',
];

const BOT_BODY = [
  '....kkkk....',
  '..kkmmmmkk..',
  '.kmmlmmmmmk.',
  'kmmllmmmmmmk',
  'kmrrmmmmmmmk',
  'kmrrmmmmmmmk',
  'kmmmmmmmmmmk',
  '.kkkkkkkkkk.',
];
const LEGS_A = ['.k.k....k.k.', 'k...k..k...k'];
const LEGS_B = ['..k.k..k.k..', '..k..kk..k..'];
const SPIKES = ['.s..s..s..s.', 'ksk.sks.ksk.'];
const FLAT = [
  '..kkkkkkkk..',
  '.kmmmmmmmmk.',
  'kmrrmmmmmmmk',
  'kkkkkkkkkkkk',
];

const DRONE_BODY = [
  '.....kk.....',
  '...kkkkkk...',
  '..kmmmmmmk..',
  '.kmyymmlmmk.',
  '.kmyymmmmmk.',
  '..kmmmmmmk..',
  '...kkkkkk...',
  '....k..k....',
];
const ROTOR_A = 'pppppppppppp';
const ROTOR_B = '...pppppp...';

const ink = { k: '#140f1f', w: '#fff3b0', o: '#c98b1c' };
const botPal = { k: ink.k, m: '#6d5a8f', l: '#a99ad0', r: '#ff3b5c' };
const spikePal = { k: ink.k, m: '#8a2f4a', l: '#d0607e', r: '#ffe066', s: '#ff6fae' };
const dronePal = { k: ink.k, m: '#3b5f7a', l: '#8fd3ff', y: '#ffe066', p: '#9ff3ff' };

export function makeSprites() {
  return {
    chip: bake(CHEESE, { ...ink, Y: '#ffd95e' }),
    chipDim: bake(CHEESE, { k: '#2a2340', w: '#3b3456', Y: '#3b3456', o: '#2a2340' }),
    goldIcon: bake(CHEESE, { ...ink, w: '#fff6c8', Y: '#ffb21e', o: '#d06a0a' }),
    gold: bake(GOLD, { ...ink, w: '#fff6c8', Y: '#ffb21e', o: '#d06a0a' }),
    goldDim: bake(GOLD, { k: '#2a2340', w: '#3b3456', Y: '#3b3456', o: '#2a2340' }),
    heart: bake(BIG_HEART, { ...ink, H: '#ff4fd8', w: '#ffd0f2' }),
    heartSmall: bake(HEART, { ...ink, H: '#ff4fd8', w: '#ffd0f2' }),
    heartHot: bake(HEART, { ...ink, H: '#ffffff', w: '#ffffff' }),
    heartEmpty: bake(HEART, { k: '#140f1f', H: '#2a2340', w: '#2a2340' }),
    scuttle: [bake([...BOT_BODY, ...LEGS_A], botPal), bake([...BOT_BODY, ...LEGS_B], botPal)],
    scuttleFlat: bake(FLAT, botPal),
    spike: [bake([...SPIKES, ...BOT_BODY.slice(1), ...LEGS_A], spikePal), bake([...SPIKES, ...BOT_BODY.slice(1), ...LEGS_B], spikePal)],
    drone: [bake([ROTOR_A, ...DRONE_BODY], dronePal), bake([ROTOR_B, ...DRONE_BODY], dronePal)],
  };
}
