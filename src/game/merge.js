import { MERGE_SCORES, PHYSICS } from './config.js';

// 只负责稳定认领与输出描述，不读 Matter/DOM，不移除世界对象。
export function planMerges(pairs, balls) {
  const normalized = new Map();
  for (const pair of pairs) {
    const [a, b] = pair[0] < pair[1] ? pair : [pair[1], pair[0]];
    if (a !== b) normalized.set(`${a}:${b}`, [a, b]);
  }
  const ordered = [...normalized.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const plans = [];
  for (const [aId, bId] of ordered) {
    const a = balls.get(aId), b = balls.get(bId);
    if (!a || !b || a.consumed || b.consumed || a.level !== b.level || a.level >= 7) continue;
    a.consumed = true; b.consumed = true;
    const mass = a.mass + b.mass;
    let vx = (a.velocity.x * a.mass + b.velocity.x * b.mass) / mass;
    let vy = (a.velocity.y * a.mass + b.velocity.y * b.mass) / mass;
    const speed = Math.hypot(vx, vy), scale = speed > PHYSICS.maxSpeed ? PHYSICS.maxSpeed / speed : 1;
    vx *= scale; vy *= scale;
    const level = a.level + 1;
    plans.push({ inputIds: [aId, bId], level, points: MERGE_SCORES[level],
      x: (a.position.x + b.position.x) / 2, y: (a.position.y + b.position.y) / 2, velocity: { x: vx, y: vy } });
  }
  return plans;
}
