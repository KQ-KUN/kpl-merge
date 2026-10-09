// B 手感修订参数；半径未冻结，C 加队徽后仍需检查辨识度。
export const RADII = Object.freeze([20, 28, 38, 50, 64, 82, 104, 132]);
export const MERGE_SCORES = Object.freeze({ 1: 6, 2: 26, 3: 32, 4: 219, 5: 335, 6: 606, 7: 5408 });
export const OPENING_LEVEL = 0;
export const LOWEST_TEAM_IDS = Object.freeze(['10031', '10020']);
export const AUDIO = Object.freeze({ initialLevel: OPENING_LEVEL, startSeconds: 1, volume: .3 });
export const LOGO = Object.freeze({ diameterFactor: 2 });
export const SPAWN_WEIGHTS = Object.freeze([
  Object.freeze({ level: 0, weight: 10 / 17 }),
  Object.freeze({ level: 1, weight: 7 / 17 }),
  Object.freeze({ level: 2, weight: 0 })
]);
// 延后里程碑：首次合成L6后才抽L3，首次合成L7后才抽L4；L5～L7只能合成。
export const SPAWN_STAGES = Object.freeze([
  Object.freeze({ minLevel: 0, weights: SPAWN_WEIGHTS }),
  Object.freeze({ minLevel: 4, weights: Object.freeze([.50, .35, .15].map((weight, level) => Object.freeze({ level, weight }))) }),
  Object.freeze({ minLevel: 6, weights: Object.freeze([.35, .30, .25, .10].map((weight, level) => Object.freeze({ level, weight }))) }),
  Object.freeze({ minLevel: 7, weights: Object.freeze([.26, .26, .26, .14, .08].map((weight, level) => Object.freeze({ level, weight }))) })
]);
export const PHYSICS = Object.freeze({
  width: 400, height: 600, wallThickness: 40, spawnY: 72,
  stepMs: 1000 / 60, maxFrameSteps: 5, dropCooldownMs: 500,
  gravity: 1, gravityScale: 0.001, restitution: 0.42,
  friction: 0.1, frictionStatic: 0.2, frictionAir: 0.008,
  density: 0.001, maxSpeed: 12, positionIterations: 8, velocityIterations: 8,
  settlingMs: 600, feedbackMs: 1200, maxFeedback: 32,
  impactMs: 180, mergeEffectMs: 420, minImpactSpeed: 1.6, maxImpacts: 40
});
export const GAME_OVER = Object.freeze({
  dangerY: 90, hysteresis: 6, stableDurationMs: 1800,
  windowMs: 300, stableSpeed: 1, maxTravel: 8, jitterTravel: 2,
  minOverflowFraction: 0.5,
  unstableToleranceMs: 200, spawnGraceMs: 1000, mergeGraceMs: 500
});
// 每个占位球都有 L 标签，颜色仅作辅助。
export const COLORS = Object.freeze(['#E8B9A5', '#E0CF92', '#BED3AD', '#A6CDD0', '#ACC1DD', '#C5B5D9', '#D8AAC2', '#A52B3F']);
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function assertLevel(level) {
  if (!Number.isInteger(level) || level < 0 || level >= RADII.length) throw new RangeError('Level 必须为 0～7');
}
