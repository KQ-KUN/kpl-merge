import { OPENING_LEVEL, SPAWN_WEIGHTS, SPAWN_STAGES, assertLevel } from './config.js';

export function validateWeights(weights) {
  if (!Array.isArray(weights) || weights.length < 3 || weights.length > 5) throw new Error('自然生成配置必须覆盖 L0～L2，最多到 L4');
  const levels = new Set();
  for (const row of weights) {
    if (!row || !Number.isInteger(row.level) || row.level < 0 || row.level > 4 || levels.has(row.level)
      || !Number.isFinite(row.weight) || row.weight < 0) throw new Error('非法生成权重');
    levels.add(row.level);
  }
  if (![0, 1, 2].every(level => levels.has(level))) throw new Error('必须保留 L0～L2');
  if (Math.abs(weights.reduce((sum, row) => sum + row.weight, 0) - 1) > 1e-9) throw new Error('生成权重总和必须为 1');
}
export function sampleLevel(rng, weights = SPAWN_WEIGHTS) {
  validateWeights(weights);
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('RNG 必须返回 [0,1)');
  let cumulative = 0;
  for (const row of weights) {
    cumulative += row.weight;
    if (value < cumulative) return row.level;
  }
  return weights.findLast(row => row.weight > 0).level;
}
export function weightsForProgress(maxLevel = 0) {
  assertLevel(maxLevel);
  return SPAWN_STAGES.findLast(stage => maxLevel >= stage.minLevel).weights;
}
export function createSpawnQueue(rng = Math.random, weights = null) {
  if (weights !== null) validateWeights(weights);
  // 首球固定最低阶；开局音乐独立从 L1 开始。
  let current = OPENING_LEVEL, next = sampleLevel(rng, weights ?? SPAWN_WEIGHTS);
  return {
    peek: () => ({ current, next }),
    take(maxLevel = 0) {
      // 先抽未来球：注入 RNG 失败时不推进队列。
      const future = sampleLevel(rng, weights ?? weightsForProgress(maxLevel)), dropped = current;
      current = next; next = future;
      return dropped;
    }
  };
}
