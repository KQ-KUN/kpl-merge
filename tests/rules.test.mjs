import test from 'node:test';
import assert from 'node:assert/strict';
import { createDangerDetector } from '../src/game/game-over.js';
import { createSpawnQueue, sampleLevel, validateWeights, weightsForProgress } from '../src/game/spawn.js';
import { GAME_OVER, PHYSICS, SPAWN_WEIGHTS } from '../src/game/config.js';

const ball = (overrides = {}) => ({ id: 1, released: true, consumed: false, radius: 10, graceUntil: 0,
  position: { x: 200, y: 95 }, velocity: { x: 0, y: 0 }, ...overrides });
const simulate = (detector, duration, getBalls) => {
  let result; for (let tick = 0; tick <= Math.ceil(duration / PHYSICS.stepMs); tick++) { const now = tick * PHYSICS.stepMs; result = detector.update(getBalls(now, tick), now); if (result.loserId !== null) break; } return result;
};
test('初期加权 RNG 边界，只生成 L0/L1，队列预览严格一致', () => {
  for (const [value, level] of [[0, 0], [10 / 17 - .0001, 0], [10 / 17, 1], [.999999, 1]]) assert.equal(sampleLevel(() => value), level);
  const rng = [.2, .6, .9, .1], queue = createSpawnQueue(() => rng.shift());
  const preview = queue.peek(); assert.equal(queue.take(), preview.current);
  assert.equal(queue.peek().current, preview.next); assert.equal(queue.take(), preview.next);
});
test('每局首球固定最低阶L0，下一球初期只有L0/L1', () => {
  for (const [value, next] of [[0, 0], [.6, 1], [.99, 1]]) {
    const queue = createSpawnQueue(() => value);
    assert.deepEqual(queue.peek(), { current: 0, next });
    assert.equal(queue.take(), 0);
    assert.deepEqual(queue.peek(), { current: next, next });
    assert.equal(queue.take(), next);
  }
});
test('生成权重和 RNG 信任边界验证', () => {
  for (const weights of [[], [{ level: 0, weight: 1 }], [{ level: 0, weight: .5 }, { level: 1, weight: .35 }, { level: 7, weight: .15 }], SPAWN_WEIGHTS.map(row => ({ ...row, weight: .1 })), SPAWN_WEIGHTS.map(row => ({ ...row, level: 0 }))]) assert.throws(() => validateWeights(weights));
  for (const value of [1, -1, NaN, Infinity]) assert.throws(() => sampleLevel(() => value));
});
test('后期投放随已达最高等级解锁，绝不自然生成 L5～L7', () => {
  for (let maxLevel = 0; maxLevel <= 7; maxLevel++) {
    const weights = weightsForProgress(maxLevel); validateWeights(weights);
    const expectedMax = maxLevel >= 7 ? 4 : maxLevel >= 6 ? 3 : 2;
    const positive = weights.filter(row => row.weight > 0);
    assert.equal(positive.at(-1).level, maxLevel < 4 ? 1 : expectedMax);
    for (let i = 0; i < 1000; i++) assert.ok(sampleLevel(() => i / 1000, weights) <= (maxLevel < 4 ? 1 : expectedMax));
  }
});
test('升级仅影响队列尾部，已显示的当前和下一球绝不改动，RNG失败不推进', () => {
  const values = [.6, .999, .999], q = createSpawnQueue(() => values.shift());
  const first = q.peek(); assert.equal(q.take(7), first.current);
  assert.deepEqual(q.peek(), { current: first.next, next: 4 });
  assert.equal(q.take(7), first.next); assert.deepEqual(q.peek(), { current: 4, next: 4 });
  const before = q.peek(); assert.throws(() => q.take(7)); assert.deepEqual(q.peek(), before);
});
test('preview 未释放，即便永久越线也不判负', () => {
  const d = createDangerDetector(); assert.equal(simulate(d, 10000, () => [ball({ released: false })]).loserId, null); assert.equal(d.size(), 0);
});
test('瞬间弹高再落回，必须清空历史危险计时', () => {
  const d = createDangerDetector();
  assert.equal(simulate(d, 4000, now => [ball({ position: { x: 200, y: now < 500 ? 80 : 150 }, velocity: { x: 0, y: now < 500 ? 5 : 0 } })]).loserId, null);
  assert.equal(d.size(), 0);
});
test('稳定停在线上方最终触发，最早需窗口+1800ms', () => {
  const d = createDangerDetector(); assert.equal(d.update([ball()], 0).loserId, null);
  assert.equal(d.update([ball()], 300).loserId, null); assert.equal(d.update([ball()], 2099).loserId, null);
  assert.equal(d.update([ball()], 2100).loserId, 1);
});
test('危险线上轻微位置/速度抖动不会永远清零', () => {
  const d = createDangerDetector();
  const result = simulate(d, 3000, (_, tick) => [ball({ position: { x: 200 + (tick % 2 ? .2 : -.2), y: 100 + (tick % 2 ? .4 : -.4) }, velocity: { x: 1.2, y: -.9 } })]);
  assert.equal(result.loserId, 1);
});
test('滞回区内永久落到危险线下，不能使用旧越线计时误判', () => {
  const d = createDangerDetector();
  const result = simulate(d, 5000, now => [ball({ position: { x: 200, y: now < 1000 ? 95 : 102 } })]);
  assert.equal(result.loserId, null); assert.equal(result.progress, 0);
});
test('spawn grace 内不计时，grace 后稳定持续才结束', () => {
  const d = createDangerDetector(), a = ball({ graceUntil: 1000 });
  assert.equal(d.update([a], 999).warning, false); d.update([a], 1000); d.update([a], 1300);
  assert.equal(d.update([a], 3099).loserId, null); assert.equal(d.update([a], 3100).loserId, 1);
});
test('merge output 的 grace 与高速度暂时越线不误判', () => {
  const d = createDangerDetector();
  assert.equal(simulate(d, 4000, now => [ball({ graceUntil: 500, position: { x: 200, y: now < 1200 ? 60 + now / 25 : 180 }, velocity: { x: 0, y: now < 1200 ? 6 : 0 } })]).loserId, null);
});
test('连锁造成大幅位移重置稳定窗口，落回后不误判', () => {
  const d = createDangerDetector();
  assert.equal(simulate(d, 4000, now => [ball({ position: { x: 200, y: now < 900 ? 80 : now < 1600 ? 60 + 18 * Math.sin(now / 40) : 180 }, velocity: { x: 0, y: now > 900 && now < 1600 ? 8 : 0 } })]).loserId, null);
});
test('多个越线球逐个计时，无关新球 grace 不阻止堆积球结束', () => {
  const d = createDangerDetector();
  const result = simulate(d, 4000, now => [ball({ id: 8 }), ball({ id: 9, graceUntil: now + 1000 })]);
  assert.equal(result.loserId, 8);
});
test('已消费/已移除球的危险历史彻底移除', () => {
  const d = createDangerDetector(); d.update([ball()], 0); assert.equal(d.size(), 1);
  d.update([ball({ consumed: true })], 100); assert.equal(d.size(), 0);
  d.update([ball()], 200); d.update([], 400); assert.equal(d.size(), 0);
});
