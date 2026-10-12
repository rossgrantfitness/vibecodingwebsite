import { TILE, PLAYER_H } from './config.js';
import { Level, builder } from './level.js';

// Sector 1: Gutter District. Roughly 2–3 minutes; a checkpoint near the middle and two brawl
// zones where the screen locks until every wave is beaten.
// Coordinates are tiles. Ground surface is row 12; a standing jump clears about 4 tiles up,
// a running jump about 7 tiles across.
export function buildLevel1() {
  const L = new Level(252, 15);
  const b = builder(L, 12);
  const { G } = b;
  const walker = (c, opts) => b.add('walker', c, G, opts);
  const frog = (c, opts) => b.add('frog', c, G, opts);

  // A. Start: an arc of chips to teach jumping, a row of item blocks, the first Scuttlebot.
  b.ground(0, 24);
  b.chips(6, 10, 5, 1.5);
  b.block(12, 8);
  b.metal(13, 8);
  b.block(14, 8, 'multi');
  b.metal(15, 8);
  b.block(16, 8);
  b.add('gold', 14, 4);
  walker(22);

  // B. Vent stacks: pillars of rising height with Scuttlebots patrolling between them.
  b.ground(27, 58);
  b.pillar(31, 2);
  b.pillar(37, 3);
  b.pillar(44, 4);
  b.chips(31, 9, 2);
  b.chips(37, 8, 2);
  b.chips(44, 7, 2);
  walker(35);
  walker(41);
  b.chips(48, 11, 3);
  frog(51);
  walker(56, { spiky: true });

  // C. Neon awnings: one-way platforms climbing to a Golden Cheese; a drone over the far side.
  b.ground(62, 92);
  b.chips(59, 10, 3, 1.5);
  b.semi(65, 9, 4);
  b.semi(70, 6, 4);
  b.semi(75, 3, 4);
  b.chips(65, 8, 4);
  b.chips(70, 5, 4);
  b.add('gold', 77, 1);
  walker(72);
  walker(80);
  frog(89);
  b.semi(83, 8, 4);
  b.add('drone', 88, 7, { axis: 'x', range: 2.5, period: 200 });

  // D. Gap islands: arcs of chips mark the jumps; a drone bobs over the widest gap.
  b.chips(92, 10, 4, 2);
  b.ground(96, 99);
  b.chips(99, 10, 5, 2.5);
  b.ground(104, 107);
  b.block(105, 8);
  b.add('drone', 109, 6, { axis: 'y', range: 1, period: 120 });
  b.metal(109, 10, 2);
  b.ground(112, 130);
  b.add('checkpoint', 116, G);
  // Brawl zone 1: a warm-up pair, then a frog with backup from both sides.
  b.arena(112, [
    [{ type: 'walker', side: 'right' }, { type: 'walker', side: 'right' }],
    [{ type: 'frog', side: 'right' }, { type: 'walker', side: 'left' }],
    [{ type: 'walker', side: 'left', spiky: true }, { type: 'walker', side: 'right' }],
  ]);

  // E. Runway: room to fill the P-meter. Bounce off the drone (hold jump) for the Golden Cheese.
  b.ground(131, 160);
  b.chips(134, 11, 8);
  b.add('drone', 148, 8, { axis: 'y', range: 0.5, period: 90 });
  b.add('gold', 148, 3);
  b.chips(158, 10, 7, 2.5); // across the 5-tile gap

  // F. Gauntlet: item blocks, mixed enemies, stairs up to a long awning bridge.
  b.ground(166, 200);
  b.block(171, 8);
  b.metal(172, 8);
  b.block(173, 8, 'multi');
  b.metal(174, 8);
  b.block(175, 8);
  walker(177);
  walker(180);
  b.add('drone', 182, 6, { axis: 'x', range: 3, period: 220 });
  walker(186, { spiky: true });
  for (let i = 0; i < 4; i++) b.pillar(192 + i, i + 1, 1);
  b.pillar(196, 4, 5);
  b.semi(201, 8, 10);
  b.chips(202, 7, 8);
  b.add('drone', 205, 6, { axis: 'x', range: 2, period: 160 });

  // G. Home stretch: the last brawl (the Big Toad waits at the end), the classic end staircase,
  // the exit gate.
  b.ground(207, 251);
  b.arena(207, [
    [{ type: 'frog', side: 'right' }, { type: 'walker', side: 'left' }],
    [{ type: 'walker', side: 'right', spiky: true }, { type: 'frog', side: 'left' }, { type: 'walker', side: 'right' }],
    [{ type: 'frog', side: 'right', big: true }],
  ]);
  for (let i = 0; i < 6; i++) b.pillar(228 + i, i + 1, 1);
  b.pillar(234, 6, 2);
  b.chips(236, 6, 4, 2);
  b.add('goal', 246, G);

  L.spawn = { x: 3 * TILE, y: G * TILE - PLAYER_H };
  return L;
}
