import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
import { createPhysics } from '../src/game/physics.js';
import { planMerges } from '../src/game/merge.js';
import { RADII, PHYSICS, GAME_OVER, MERGE_SCORES } from '../src/game/config.js';

const { Body, Bodies, Composite, Events } = Matter;
const advance = (physics, ms) => { for (let index = 0; index < Math.ceil(ms / PHYSICS.stepMs); index++) physics.step(); };
const setup = t => { const p = createPhysics({ rng: () => 0.1 }); t.after(() => p.destroy()); return p; };

for (const [level, expected] of [[0, 6], [1, 26], [2, 32], [3, 219], [4, 335], [5, 606], [6, 5408]]) {
  test(`真实 Matter: L${level}+L${level} → L${level + 1}，+${expected}，旧体彻底移除`, t => {
    const events = [], p = createPhysics({ onMerge: event => events.push(event) }); t.after(() => p.destroy());
    const radius = RADII[level];
    // Matter 的 circle 使用内接多边形近似，fixture 需有真实接触，不能只按绘制圆相切。
    const a = p.addBall(level, 200 - radius * 0.9, 420), b = p.addBall(level, 200 + radius * 0.9, 420);
    p.step();
    assert.equal(p.state().score, expected); assert.equal(p.state().ballCount, 1);
    assert.equal([...p.balls()][0].level, level + 1); assert.equal(events.length, 1);
    assert.equal(events[0].points, expected); assert.equal(p.inspect().worldBodies, 4);
    assert.ok(!Composite.allBodies(p.engine.world).some(body => body.id === a.id || body.id === b.id));
    assert.ok(a.consumed && b.consumed);
    advance(p, 1000); assert.equal(p.state().score, expected);
    if (level === 6) { assert.equal(p.state().finalCount, 1); assert.equal(p.state().phase, 'playing'); }
  });
}
test('不同等级接触永不合并', t => {
  const p = setup(t); p.addBall(0, 190, 400); p.addBall(1, 210, 400);
  advance(p, 1000); assert.equal(p.state().score, 0); assert.equal(p.state().ballCount, 2);
});
test('L7 不能继续合并，继续投放且一局可存在两个 L7', t => {
  const p = setup(t), r = RADII[6];
  for (const x of [100, 300]) { p.addBall(6, x - r * 0.96, 400); p.addBall(6, x + r * 0.96, 400); }
  p.step(); assert.equal(p.state().score, 10816); assert.equal(p.state().finalCount, 2);
  const finals = [...p.balls()]; assert.deepEqual(finals.map(ball => ball.level), [7, 7]);
  Body.setPosition(finals[0].body, { x: 150, y: 430 }); Body.setPosition(finals[1].body, { x: 248, y: 430 });
  advance(p, 800); assert.equal(p.state().ballCount, 2); assert.equal(p.state().score, 10816);
  assert.equal(p.state().phase, 'playing'); assert.ok(p.drop(200)); assert.equal(p.state().ballCount, 3);
});
test('归一化排序不依赖碰撞返回顺序，三球共享 body 仅消费一次', () => {
  const make = () => new Map([11, 20, 30].map(id => [id, { id, level: 1, consumed: false, mass: 1, position: { x: id, y: 400 }, velocity: { x: 0, y: 0 } }]));
  const a = make(), b = make();
  const forward = planMerges([[11, 20], [20, 30], [20, 11]], a);
  const reverse = planMerges([[30, 20], [20, 11], [11, 20]], b);
  assert.deepEqual(forward, reverse); assert.deepEqual(forward.map(plan => plan.inputIds), [[11, 20]]);
  assert.equal(a.get(30).consumed, false); assert.deepEqual(planMerges([[11, 20], [20, 30]], a), []);
});
test('真实 Matter 三球同 tick 接触：两条碰撞共享中间球，仅一个事务', t => {
  const p = setup(t), r = RADII[1], seen = [];
  Events.on(p.engine, 'collisionStart', event => seen.push(...event.pairs.filter(pair => !pair.bodyA.isStatic && !pair.bodyB.isStatic)));
  const balls = [160, 160 + r * 1.8, 160 + r * 3.6].map(x => p.addBall(1, x, 430));
  p.step(); assert.equal(seen.length, 2); assert.equal(p.state().score, 26); assert.equal(p.state().ballCount, 2);
  assert.deepEqual(balls.map(ball => ball.consumed), [true, true, false]);
  assert.equal(p.inspect().worldBodies, 5); advance(p, 1200); assert.equal(p.state().score, 26);
});
test('真实 Matter 连锁：新 L2 再接触已有 L2，逐级 +26/+32 = 58', t => {
  const events = [], p = createPhysics({ onMerge: event => events.push(event) }); t.after(() => p.destroy());
  const a = RADII[1], b = RADII[2];
  p.addBall(1, 200 - a * 0.9, 400); p.addBall(1, 200 + a * 0.9, 400); p.addBall(2, 200, 400 + b * 1.8);
  p.step(); assert.equal(p.state().score, 26);
  advance(p, 200); assert.equal(p.state().score, 58);
  assert.deepEqual(events.map(event => event.points), [26, 32]); assert.ok(events[1].tick > events[0].tick);
  assert.equal([...p.balls()][0].level, 3); assert.equal(p.inspect().worldBodies, 4);
});
test('collisionStart 与 collisionActive 同 tick 重复候选不会重复结算', t => {
  const p = setup(t), a = p.addBall(2, 180, 400), b = p.addBall(2, 218, 400);
  Events.on(p.engine, 'beforeUpdate', () => {
    const pairs = [{ bodyA: b.body, bodyB: a.body, collision: { normal: { x: 1, y: 0 } } }];
    Events.trigger(p.engine, 'collisionStart', { pairs }); Events.trigger(p.engine, 'collisionActive', { pairs });
  });
  p.step(); assert.equal(p.state().score, 32); p.step(); assert.equal(p.state().score, 32);
});
test('自然投放 0 分、冷却不会推进 next、墙边坐标 clamp', t => {
  const sequence = [0.6, 0.9, 0.1, 0.1], p = createPhysics({ rng: () => sequence.shift() ?? 0.1 }); t.after(() => p.destroy());
  assert.deepEqual([p.state().current, p.state().next], [0, 1]);
  const first = p.drop(-1000); assert.equal(first.level, 0); assert.ok(first.position.x >= first.radius);
  assert.deepEqual([p.state().current, p.state().next], [1, 1]);
  assert.equal(p.drop(900), null); assert.deepEqual([p.state().current, p.state().next], [1, 1]);
  advance(p, 500); const second = p.drop(900); assert.equal(second.level, 1); assert.ok(second.position.x <= PHYSICS.width - second.radius);
  assert.equal(p.state().current, 1); assert.equal(p.state().score, 0);
});
test('只有 preview、无真实球时不会 Game Over', t => {
  const p = setup(t); advance(p, 12000);
  assert.equal(p.state().ballCount, 0); assert.equal(p.state().phase, 'playing'); assert.equal(p.inspect().dangerTracks, 0);
});
test('真实动态球投放后落回危险线下，不误判', t => {
  const p = setup(t); p.drop(); advance(p, 4000);
  assert.equal(p.state().phase, 'playing'); assert.equal(p.state().danger.warning, false);
});
test('真实 Matter 合成输出向上弹高后落回，merge grace 不误判', t => {
  const p = setup(t), r = RADII[1];
  p.addBall(1, 200 - r * .9, 25, { velocity: { x: 0, y: -8 }, graceMs: 0 });
  p.addBall(1, 200 + r * .9, 25, { velocity: { x: 0, y: -8 }, graceMs: 0 });
  p.step(); assert.equal(p.state().score, 26);
  advance(p, 3500); assert.equal(p.state().phase, 'playing'); assert.equal(p.state().danger.warning, false);
});
test('真实 Matter 轻微抖动的堆积球仍在有限时间内 Game Over', t => {
  const p = setup(t);
  Composite.add(p.engine.world, Bodies.rectangle(200, 90, 160, 12, { isStatic: true }));
  const a = p.addBall(0, 200, 70, { graceMs: 0 });
  for (let tick = 0; tick < 300 && p.state().phase === 'playing'; tick++) {
    Body.setVelocity(a.body, { x: tick % 2 ? .04 : -.04, y: .02 }); p.step();
  }
  assert.equal(p.state().phase, 'settling'); assert.ok(p.state().now < 5000);
});
test('真实动态圆堆在静态平台上持续越线，最终停止投放/计分并稳定结束', t => {
  const p = setup(t);
  Composite.add(p.engine.world, Bodies.rectangle(200, 90, 160, 12, { isStatic: true }));
  p.addBall(0, 200, 70, { graceMs: 0 });
  advance(p, GAME_OVER.windowMs + GAME_OVER.stableDurationMs + 1000);
  assert.equal(p.state().phase, 'over'); assert.equal(p.drop(), null);
  const before = p.state(); advance(p, 1000); assert.equal(p.state().now, before.now); assert.equal(p.state().score, before.score);
});
test('模拟时钟驱动 spawn/merge grace，不消耗现实隐藏时间', t => {
  const p = setup(t), a = p.addBall(0, 200, 70);
  assert.equal(a.graceUntil, GAME_OVER.spawnGraceMs); assert.equal(p.state().now, 0);
  p.addBall(0, 200, 85); p.step(); const output = [...p.balls()][0];
  assert.equal(output.graceUntil, p.state().now + GAME_OVER.mergeGraceMs);
});
test('destroy 幂等，清空 world/body/碰撞监听/pairs/detector/危险计时', () => {
  const p = createPhysics(); p.addBall(0, 200, 400); p.addBall(0, 211, 400); p.step();
  assert.equal(p.inspect().engineListeners, 2); p.destroy(); p.destroy(); p.step();
  const stats = p.inspect();
  for (const key of ['ballCount', 'worldBodies', 'engineListeners', 'candidateCount', 'dangerTracks', 'pairs', 'detectorBodies']) assert.equal(stats[key], 0, key);
  assert.equal(stats.phase, 'destroyed'); assert.equal(p.drop(), null);
});
test('固定分数表不能发生数学序列替换', () => assert.deepEqual(Object.values(MERGE_SCORES), [6, 26, 32, 219, 335, 606, 5408]));
test('投放进度条跟随同一个模拟时钟，拒绝投放不重新开始冷却', t => {
  const p = setup(t); assert.equal(p.state().cooldownProgress, 1);
  p.drop(); assert.equal(p.state().cooldownProgress, 0);
  advance(p, 250); assert.ok(Math.abs(p.state().cooldownProgress - .5) < .04);
  const before = p.state().cooldownProgress; assert.equal(p.drop(), null); assert.equal(p.state().cooldownProgress, before);
  advance(p, 250); assert.equal(p.state().cooldownProgress, 1);
});
test('实际落地有回弹：反向速度和离地高度，以及一次碰撞反馈', t => {
  const hits = [], p = createPhysics({ onImpact: hit => hits.push(hit) }); t.after(() => p.destroy());
  const a = p.drop(); let landed = false, upward = false, minY = PHYSICS.height;
  for (let i = 0; i < 240; i++) {
    p.step();
    if (a.position.y > PHYSICS.height - a.radius - 3) landed = true;
    if (landed && a.velocity.y < -1) upward = true;
    if (upward) minY = Math.min(minY, a.position.y);
  }
  assert.ok(upward, '撞地后真实反向弹起');
  assert.ok(PHYSICS.height - a.radius - minY > 18, '回弹至少18世界像素');
  assert.ok(hits.some(hit => hit.id === a.id && hit.speed > PHYSICS.minImpactSpeed));
});
test('升级后的投放采用后期权重，但保持已显示队列并限制大球在墙内', t => {
  const p = createPhysics({ rng: () => .999 }); t.after(() => p.destroy());
  const first = p.state(); p.addBall(7, 200, 500);
  assert.deepEqual([p.state().current, p.state().next], [first.current, first.next]);
  p.drop(0); assert.equal(p.state().current, first.next); assert.equal(p.state().next, 4);
  advance(p, 500); p.drop(400); advance(p, 500);
  const large = p.drop(-1000); assert.equal(large.level, 4);
  assert.ok(large.position.x >= large.radius + 1); assert.ok(large.position.y >= large.radius);
});
test('真实合成L6/L7后才分别抽L3/L4，里程碑前及已显示队列不被升级替换', t => {
  for (const [input, expected] of [[3, 2], [5, 3], [6, 4]]) {
    const p = createPhysics({ rng: () => .999 }); t.after(() => p.destroy());
    p.addBall(input, 180, 440); p.drop(0);
    assert.equal(p.state().next, input === 3 ? 1 : input === 5 ? 2 : 3, '达到下一个里程碑之前，最多抽上一个已解锁等级');
    p.addBall(input, 220, 440); const shown = p.state(); p.step();
    assert.equal(p.state().maxLevel, input + 1); assert.equal(p.state().score, MERGE_SCORES[input + 1]);
    assert.deepEqual([p.state().current, p.state().next], [shown.current, shown.next]);
    advance(p, 500); const drop = p.drop(400);
    assert.equal(drop.level, shown.current); assert.equal(p.state().next, expected);
  }
});
