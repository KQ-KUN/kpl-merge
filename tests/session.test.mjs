import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/game/session.js';

class TrackedTarget extends EventTarget {
  listeners = new Map();
  addEventListener(type, handler, options) {
    super.addEventListener(type, handler, options);
    const list = this.listeners.get(type) ?? new Set(); list.add(handler); this.listeners.set(type, list);
    options?.signal?.addEventListener('abort', () => { list.delete(handler); }, { once: true });
  }
  count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}
function harness() {
  const canvas = new TrackedTarget(), win = new TrackedTarget(), doc = new TrackedTarget();
  doc.hidden = false;
  let focused = false, captured = null;
  Object.assign(canvas, { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 600 }),
    dataset: {},
    focus: () => { focused = true; }, setPointerCapture: id => { captured = id; }, hasPointerCapture: id => captured === id,
    releasePointerCapture: () => { captured = null; } });
  const frames = new Map(); let nextFrame = 0, feedback = [], disconnected = false, draws = 0;
  const scheduler = { request(callback) { const id = ++nextFrame; frames.set(id, callback); return id; }, cancel(id) { frames.delete(id); } };
  const renderer = { resize() {}, draw() { draws++; }, feedback(event) { feedback.push(event); }, destroy() { feedback = []; }, inspect: () => ({ effects: feedback.length }) };
  const create = (options = {}) => { disconnected = false; return createSession(canvas, { rng: () => .1, ...options, environment: { window: win, document: doc }, scheduler, renderer,
    observerFactory: () => ({ observe() {}, disconnect() { disconnected = true; } }) }); };
  const event = (type, properties) => { const e = new Event(type, { cancelable: true }); Object.assign(e, properties); canvas.dispatchEvent(e); return e; };
  const frame = time => { const [id, cb] = frames.entries().next().value ?? []; assert.ok(cb, 'RAF 存在'); frames.delete(id); cb(time); };
  return { canvas, win, doc, create, event, frames, frame, disconnected: () => disconnected, focused: () => focused, draws: () => draws };
}
test('Restart 50 次：旧 world/body/listener/RAF/Observer/动画均清空', () => {
  const h = harness(); let prior;
  for (let round = 0; round < 50; round++) {
    prior?.destroy(); if (prior) assert.equal(prior.inspect().physics.worldBodies, 0);
    const s = h.create(); assert.equal(h.frames.size, 1); assert.equal(h.canvas.count() + h.win.count() + h.doc.count(), 8);
    s.physics.addBall(0, 195, 400); s.physics.addBall(0, 205, 400);
    h.frame(round * 100); h.frame(round * 100 + 20);
    assert.equal(s.physics.state().score, 6);
    s.destroy(); s.destroy();
    assert.equal(h.frames.size, 0); assert.equal(h.canvas.count() + h.win.count() + h.doc.count(), 0); assert.ok(h.disconnected());
    const stats = s.inspect(); assert.equal(stats.physics.engineListeners, 0); assert.equal(stats.physics.worldBodies, 0); assert.equal(stats.renderer.effects, 0);
    assert.equal(stats.listeners, 0); assert.equal(stats.rafPending, 0); assert.equal(stats.timers, 0);
    prior = s;
  }
});
test('合成本命时可立即暂停，同帧剩余物理子步和投放均锁定，继续后可恢复', () => {
  const h = harness(); let s;
  s = h.create({ onMerge: event => { if (event.level === 7) s.pause(); } });
  s.physics.addBall(6, 180, 400); s.physics.addBall(6, 220, 400);
  h.frame(0); h.frame(100);
  assert.equal(s.physics.state().finalCount, 1); assert.equal(s.physics.state().tick, 1);
  assert.equal(s.isPaused(), true); assert.equal(h.frames.size, 0);
  h.event('keydown', { code: 'Space' }); assert.equal(s.physics.state().ballCount, 1);
  s.pause(false); assert.equal(h.frames.size, 1); h.frame(1000); h.frame(1020);
  assert.equal(s.physics.state().tick, 2); s.destroy(); assert.equal(h.frames.size, 0);
});
test('投放与合成独立回调，重复release/冷却不重复回调，暂停/hidden/destroy停止', () => {
  const h = harness(), drops = [], merges = []; let stops = 0, resumes = 0;
  const s = h.create({ onDrop: ball => drops.push(ball.level), onMerge: event => merges.push(event.level), onStop: () => stops++, onResume: () => resumes++ });
  h.event('keydown', { code: 'Space' }); h.event('keydown', { code: 'Space' });
  h.event('pointerdown', { pointerId: 1, isPrimary: true, button: 0, clientX: 200 });
  h.event('pointerup', { pointerId: 1, clientX: 200 }); h.event('pointerup', { pointerId: 1, clientX: 200 });
  assert.deepEqual(drops, [0]);
  s.physics.addBall(1, 195, 400); s.physics.addBall(1, 205, 400); h.frame(0); h.frame(20);
  assert.equal(s.physics.state().score, 26); assert.deepEqual(drops, [0]); assert.deepEqual(merges, [2]);
  s.pause(); assert.equal(stops, 1); s.pause(false); h.doc.hidden = true; h.doc.dispatchEvent(new Event('visibilitychange')); assert.equal(stops, 2);
  assert.equal(resumes, 1); h.doc.hidden = false; h.doc.dispatchEvent(new Event('visibilitychange')); assert.equal(resumes, 2);
  s.destroy(); assert.equal(stops, 3); s.destroy(); assert.equal(stops, 3);
  h.doc.dispatchEvent(new Event('visibilitychange')); assert.equal(resumes, 2);
});
test('真实合成L1到L7均发出对应输出等级事件，L7相碰不产生切歌事件', () => {
  for (let output = 1; output <= 7; output++) {
    const h = harness(), merges = [], s = h.create({ onMerge: event => merges.push(event.level) });
    s.physics.addBall(output - 1, 195, 400); s.physics.addBall(output - 1, 205, 400); h.frame(0); h.frame(20);
    assert.deepEqual(merges, [output]); s.destroy();
  }
  const h = harness(), merges = [], s = h.create({ onMerge: event => merges.push(event.level) });
  s.physics.addBall(7, 190, 400); s.physics.addBall(7, 210, 400); h.frame(0); h.frame(20);
  assert.deepEqual(merges, []); s.destroy();
});
test('mouse hover 定位、pointer release 投放一次，cancel/第二指针不投放', () => {
  const h = harness(), s = h.create();
  h.event('pointermove', { pointerType: 'mouse', pointerId: 1, isPrimary: true, clientX: 345 }); assert.equal(s.physics.state().previewX, 345);
  const down = h.event('pointerdown', { pointerType: 'touch', pointerId: 2, isPrimary: true, button: 0, clientX: 30 });
  assert.ok(down.defaultPrevented); assert.ok(h.focused());
  h.event('pointerdown', { pointerType: 'touch', pointerId: 3, isPrimary: false, button: 0, clientX: 350 });
  h.event('pointermove', { pointerType: 'touch', pointerId: 2, isPrimary: true, clientX: 310 });
  h.event('pointerup', { pointerId: 2, clientX: 310 }); h.event('pointerup', { pointerId: 2, clientX: 310 });
  assert.equal(s.physics.state().ballCount, 1); assert.equal([...s.physics.balls()][0].position.x, 310);
  h.event('pointerdown', { pointerId: 4, isPrimary: true, button: 0, clientX: 100 }); h.event('pointercancel', {});
  h.event('pointerup', { pointerId: 4, clientX: 100 }); assert.equal(s.physics.state().ballCount, 1);
  s.destroy();
});
test('暂停/hidden 清除 RAF、冻结模拟时钟，恢复无现实时间补步', () => {
  const h = harness(), s = h.create(); h.frame(0); h.frame(20);
  const now = s.physics.state().now;
  s.pause(); assert.equal(h.frames.size, 0);
  h.event('keydown', { code: 'Space' }); assert.equal(s.physics.state().ballCount, 0);
  s.pause(false); h.frame(100000); assert.equal(s.physics.state().now, now);
  h.doc.hidden = true; h.doc.dispatchEvent(new Event('visibilitychange')); assert.equal(h.frames.size, 0);
  h.doc.hidden = false; h.doc.dispatchEvent(new Event('visibilitychange')); h.frame(200000); assert.equal(s.physics.state().now, now);
  h.frame(200020); assert.ok(s.physics.state().now > now); s.destroy();
});
test('destroy 后人为执行旧 RAF 回调也不运行旧物理或重排 RAF', () => {
  const h = harness(), s = h.create(), callback = [...h.frames.values()][0];
  s.destroy(); const draws = h.draws(); callback(1000);
  assert.equal(h.draws(), draws); assert.equal(h.frames.size, 0); assert.equal(s.physics.state().tick, 0);
});

test('BFCache suspend/resume 保留同一 world、分数、球体和队列，重复恢复仅一个 RAF', () => {
  const h = harness(); let stops = 0, resumes = 0;
  const s = h.create({ onStop: () => stops++, onResume: () => resumes++ });
  s.physics.addBall(1, 195, 400); s.physics.addBall(1, 205, 400);
  h.frame(0); h.frame(20);
  h.event('keydown', { code: 'Space' });
  const before = s.physics.state(), bodies = [...s.physics.balls()], stale = [...h.frames.values()][0];
  assert.equal(before.score, 26);
  for (let round = 0; round < 3; round++) {
    s.suspend(); s.suspend();
    assert.equal(h.frames.size, 0); assert.equal(s.inspect().suspended, true);
    h.event('keydown', { code: 'Enter' });
    assert.deepEqual(s.physics.state(), before); assert.deepEqual([...s.physics.balls()], bodies);
    s.resume(); s.resume();
    assert.equal(h.frames.size, 1); assert.equal(s.inspect().listeners, 8);
    assert.deepEqual(s.physics.state(), before);
  }
  stale(100000); assert.equal(h.frames.size, 1, '取消的旧回调不覆盖恢复后的 RAF');
  h.frame(200000); assert.deepEqual(s.physics.state(), before, '离开期间不追赶模拟时间');
  assert.equal(stops, 3); assert.equal(resumes, 3);
  h.frame(200020); assert.ok(s.physics.state().now > before.now);
  s.destroy(); s.resume(); assert.equal(h.frames.size, 0);
  assert.equal(s.inspect().listeners, 0); assert.equal(s.inspect().physics.worldBodies, 0);
});

test('BFCache 与 visibility 分开保留用户暂停，隐藏时恢复仍不调度', () => {
  const h = harness(), s = h.create();
  s.pause(); s.suspend(); s.resume();
  assert.equal(s.inspect().manuallyPaused, true); assert.equal(s.isPaused(), true); assert.equal(h.frames.size, 0);
  s.pause(false); assert.equal(h.frames.size, 1);
  s.suspend(); h.doc.hidden = true; h.doc.dispatchEvent(new Event('visibilitychange')); s.resume();
  assert.equal(h.frames.size, 0); assert.equal(s.inspect().manuallyPaused, false);
  h.doc.hidden = false; h.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.frames.size, 1);
  s.suspend(); s.destroy(); s.resume();
  assert.equal(h.frames.size, 0); assert.equal(h.canvas.count() + h.win.count() + h.doc.count(), 0);
});
test('按住/松手的视觉状态即时更新，鼠标与键盘焦点可区分，销毁清理', () => {
  const h = harness(), s = h.create();
  h.event('pointerdown', { pointerId: 1, isPrimary: true, button: 0, clientX: 200 });
  assert.equal(h.canvas.dataset.input, 'pointer'); assert.equal(h.canvas.dataset.aiming, 'true');
  h.event('pointerup', { pointerId: 1, clientX: 200 }); assert.equal(h.canvas.dataset.aiming, undefined);
  h.event('keydown', { code: 'ArrowLeft' }); assert.equal(h.canvas.dataset.input, 'keyboard');
  s.destroy(); assert.equal(h.canvas.dataset.input, undefined); assert.equal(h.canvas.dataset.aiming, undefined);
});
