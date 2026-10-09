import test from 'node:test';
import assert from 'node:assert/strict';
import { createMergeFeedback } from '../src/game/merge-feedback.js';

const event = (level, points, outputId, inputIds, tick, time = tick * 16.67) => ({ level, points, outputId, inputIds, tick, time });
test('两次+26再+32保留逐项得分和84总分，每级独立计分', () => {
  const f = createMergeFeedback();
  f.record(event(2, 26, 5, [1, 2], 1)); f.record(event(2, 26, 6, [3, 4], 1));
  const result = f.record(event(3, 32, 7, [5, 6], 2));
  assert.deepEqual(result.events.map(e => e.points), [26, 26, 32]);
  assert.equal(result.total, 84); assert.equal(result.maxLevel, 3); assert.equal(result.chain, true);
  assert.deepEqual(f.state(), result); // 读状态不让上一组得分过期。
});
test('同批高等级之后发生低等级合成时，音乐等级仍取最高输出', () => {
  const f = createMergeFeedback();
  f.record(event(5, 335, 10, [8, 9], 1));
  const result = f.record(event(1, 6, 13, [11, 12], 2));
  assert.equal(result.maxLevel, 5); assert.equal(result.total, 341);
  const next = f.record(event(1, 6, 16, [14, 15], 100, 2000));
  assert.equal(next.total, 6); assert.equal(next.maxLevel, 1);
  f.reset(); assert.deepEqual(f.state().events, []); assert.equal(f.state().total, 0);
});
test('真实输入输出相连时，即使间隔较长仍属于同一连锁', () => {
  const f = createMergeFeedback(); f.record(event(2, 26, 3, [1, 2], 1));
  const result = f.record(event(3, 32, 5, [3, 4], 100, 2000));
  assert.equal(result.total, 58); assert.equal(result.chain, true);
});
test('继续游玩或新投球标记上一组结束，得分仍保留，下一组才替换', () => {
  const f = createMergeFeedback(); f.record(event(7, 5408, 3, [1, 2], 1)); f.finish();
  assert.equal(f.state().total, 5408);
  const next = f.record(event(1, 6, 6, [4, 5], 2));
  assert.equal(next.maxLevel, 1); assert.equal(next.total, 6);
});
