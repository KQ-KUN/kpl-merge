import Matter from 'matter-js';
import { PHYSICS, GAME_OVER, RADII, assertLevel, clamp } from './config.js';
import { createSpawnQueue } from './spawn.js';
import { planMerges } from './merge.js';
import { createDangerDetector } from './game-over.js';

const { Engine, Bodies, Body, Composite, Events } = Matter;

export function createPhysics({ rng = Math.random, onMerge = () => {}, onImpact = () => {}, onChange = () => {} } = {}) {
  const engine = Engine.create({ enableSleeping: false, positionIterations: PHYSICS.positionIterations, velocityIterations: PHYSICS.velocityIterations });
  engine.gravity.y = PHYSICS.gravity; engine.gravity.scale = PHYSICS.gravityScale;
  const wall = PHYSICS.wallThickness;
  Composite.add(engine.world, [
    Bodies.rectangle(-wall / 2, 0, wall, PHYSICS.height * 2, { isStatic: true }),
    Bodies.rectangle(PHYSICS.width + wall / 2, 0, wall, PHYSICS.height * 2, { isStatic: true }),
    Bodies.rectangle(PHYSICS.width / 2, PHYSICS.height + wall / 2, PHYSICS.width + wall * 2, wall, { isStatic: true })
  ]);
  const balls = new Map(), candidates = [], impacts = [], queue = createSpawnQueue(rng), detector = createDangerDetector();
  let now = 0, tick = 0, phase = 'playing', score = 0, finalCount = 0, maxLevel = 0;
  let previewX = PHYSICS.width / 2, lastDropAt = -Infinity, settleUntil = 0;
  let danger = { warning: false, progress: 0, loserId: null };
  let notify = onChange, mergeCallback = onMerge, impactCallback = onImpact;

  const collect = event => {
    if (phase !== 'playing') return;
    for (const pair of event.pairs) {
      const a = pair.bodyA, b = pair.bodyB;
      if (balls.has(a.id) && balls.has(b.id)) candidates.push([a.id, b.id]);
      if (event.name !== 'collisionStart' || impacts.length >= PHYSICS.maxImpacts) continue;
      const normal = pair.collision.normal;
      const speed = Math.abs((a.velocity.x - b.velocity.x) * normal.x + (a.velocity.y - b.velocity.y) * normal.y);
      if (speed < PHYSICS.minImpactSpeed) continue;
      for (const body of [a, b]) if (balls.has(body.id)) impacts.push({ id: body.id, speed, angle: Math.atan2(normal.y, normal.x), time: now });
    }
  };
  Events.on(engine, 'collisionStart', collect);
  Events.on(engine, 'collisionActive', collect);

  function addBall(level, x, y = PHYSICS.spawnY, { velocity = { x: 0, y: 0 }, graceMs = GAME_OVER.spawnGraceMs } = {}) {
    if (phase !== 'playing') throw new Error('当前状态不能新增球');
    assertLevel(level);
    if (![x, y, velocity.x, velocity.y, graceMs].every(Number.isFinite) || graceMs < 0) throw new Error('球参数非法');
    const radius = RADII[level];
    const body = Bodies.circle(clamp(x, radius + 1, PHYSICS.width - radius - 1), Math.min(y, PHYSICS.height - radius - 1), radius, {
      restitution: PHYSICS.restitution, friction: PHYSICS.friction, frictionStatic: PHYSICS.frictionStatic,
      frictionAir: PHYSICS.frictionAir, density: PHYSICS.density, label: `L${level}`
    });
    Body.setVelocity(body, velocity);
    const ball = { id: body.id, body, level, radius, released: true, releasedAt: now, graceUntil: now + graceMs, consumed: false,
      get position() { return body.position; }, get velocity() { return body.velocity; }, get mass() { return body.mass; } };
    Composite.add(engine.world, body); balls.set(body.id, ball);
    maxLevel = Math.max(maxLevel, level);
    return ball;
  }
  function state() {
    return { phase, score, finalCount, maxLevel, now, tick, ballCount: balls.size, previewX,
      ...queue.peek(), canDrop: phase === 'playing' && now - lastDropAt + 1e-6 >= PHYSICS.dropCooldownMs,
      cooldownProgress: clamp((now - lastDropAt) / PHYSICS.dropCooldownMs, 0, 1), danger: { ...danger } };
  }
  function move(x) {
    if (!Number.isFinite(x) || phase !== 'playing') return;
    const radius = RADII[queue.peek().current];
    previewX = clamp(x, radius + 1, PHYSICS.width - radius - 1);
  }
  function drop(x = previewX) {
    if (!state().canDrop || !Number.isFinite(x)) return null;
    const level = queue.take(maxLevel);
    const ball = addBall(level, x);
    lastDropAt = now;
    move(x); notify(state());
    return ball;
  }
  function step() {
    if (phase === 'destroyed' || phase === 'over') return;
    candidates.length = 0; impacts.length = 0;
    tick += 1; now = tick * PHYSICS.stepMs;
    Engine.update(engine, PHYSICS.stepMs);
    for (const ball of balls.values()) {
      const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
      if (speed > PHYSICS.maxSpeed) Body.setVelocity(ball.body, { x: ball.velocity.x * PHYSICS.maxSpeed / speed, y: ball.velocity.y * PHYSICS.maxSpeed / speed });
    }
    if (phase === 'settling') {
      if (now + 1e-6 >= settleUntil) { phase = 'over'; notify(state()); }
      return;
    }
    const plans = planMerges(candidates, balls);
    candidates.length = 0;
    const committed = [];
    for (const plan of plans) {
      // 已统一认领后再改 world；输出球直到下一 Engine.update 才能成为候选。
      for (const id of plan.inputIds) { Composite.remove(engine.world, balls.get(id).body); balls.delete(id); }
      const output = addBall(plan.level, plan.x, plan.y, { velocity: plan.velocity, graceMs: GAME_OVER.mergeGraceMs });
      score += plan.points;
      if (plan.level === 7) finalCount += 1;
      committed.push({ ...plan, outputId: output.id, x: output.position.x, y: output.position.y, time: now, tick });
    }
    // 先完成本 tick 事务，再对外通知，避免 UI 回调介入半完成的 world。
    danger = detector.update(balls.values(), now);
    if (danger.loserId !== null) { phase = 'settling'; settleUntil = now + PHYSICS.settlingMs; }
    for (const event of committed) mergeCallback(event);
    for (const event of impacts) if (balls.has(event.id)) impactCallback(event);
    impacts.length = 0;
    notify(state());
  }
  function destroy() {
    if (phase === 'destroyed') return;
    phase = 'destroyed';
    Events.off(engine, 'collisionStart', collect); Events.off(engine, 'collisionActive', collect);
    Composite.clear(engine.world, false, true); Engine.clear(engine);
    balls.clear(); candidates.length = 0; impacts.length = 0; detector.clear();
    notify = () => {}; mergeCallback = () => {}; impactCallback = () => {};
  }
  return {
    state, move, drop, step, addBall, destroy,
    balls: () => balls.values(),
    // B 验证接口：只读统计 + 测试可访问的实际 Matter engine；生产 UI 不暴露调试入口。
    engine,
    inspect: () => ({ ...state(), worldBodies: Composite.allBodies(engine.world).length,
      engineListeners: Object.values(engine.events ?? {}).reduce((sum, listeners) => sum + listeners.length, 0),
      candidateCount: candidates.length, dangerTracks: detector.size(), pairs: engine.pairs.list.length, detectorBodies: engine.detector.bodies.length })
  };
}
