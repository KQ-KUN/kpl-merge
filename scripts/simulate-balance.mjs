import fs from 'node:fs/promises';
import { createPhysics } from '../src/game/physics.js';
import { PHYSICS, RADII, SPAWN_STAGES } from '../src/game/config.js';

// 固定种子与输入策略，比较操作影响；不是人类难度/真机手感验收。
function simulate(seed, policy) {
  let value = seed >>> 0;
  const rng = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
  const p = createPhysics({ rng }); let drops = 0;
  for (let i = 0; i < 60 * 120 && p.state().phase === 'playing'; i++) {
    if (p.state().canDrop) {
      const same = [...p.balls()].filter(ball => ball.level === p.state().current).sort((a, b) => a.position.y - b.position.y || a.id - b.id)[0];
      p.drop(policy === 'aim-same-level' && same ? same.position.x : 200); drops++;
    }
    p.step();
  }
  for (let i = 0; i < 60 * 10 && p.state().phase !== 'over'; i++) p.step();
  const { phase, maxLevel, score, finalCount, now, ballCount } = p.state(); p.destroy();
  return { seed, policy, drops, phase, maxLevel, score, finalCount, ballCount, seconds: Math.round(now / 1000) };
}
const rows = [];
for (const policy of ['fixed-center', 'aim-same-level']) for (let seed = 1; seed <= 20; seed++) rows.push(simulate(seed, policy));
const summary = ['fixed-center', 'aim-same-level'].map(policy => {
  const subset = rows.filter(row => row.policy === policy), scores = subset.map(row => row.score).sort((a, b) => a - b);
  return { policy, runs: subset.length, gameOvers: subset.filter(row => row.phase === 'over').length,
    reachedL7: subset.filter(row => row.finalCount > 0).length, medianScore: (scores[9] + scores[10]) / 2,
    maxLevelRange: [Math.min(...subset.map(row => row.maxLevel)), Math.max(...subset.map(row => row.maxLevel))] };
});
await fs.mkdir(new URL('../reports/', import.meta.url), { recursive: true });
await fs.writeFile(new URL('../reports/balance.json', import.meta.url), JSON.stringify({ parameters: PHYSICS, radii: RADII, spawnStages: SPAWN_STAGES, summary, rows, humanAcceptance: false }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
