import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../src/game/renderer.js';
import { PHYSICS, RADII } from '../src/game/config.js';

function harness(reducedMotion = false, options = {}) {
  const calls = [], ctx = {};
  for (const name of ['setTransform', 'clearRect', 'fillRect', 'setLineDash', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'save', 'translate', 'rotate', 'scale', 'arc', 'fill', 'restore', 'fillText', 'drawImage']) ctx[name] = (...args) => calls.push({ name, args });
  const prior = globalThis.window; globalThis.window = { devicePixelRatio: 1 };
  const renderer = createRenderer({ getContext: () => ctx, getBoundingClientRect: () => ({ width: 400, height: 600 }) }, { reducedMotion, ...options });
  if (prior === undefined) delete globalThis.window; else globalThis.window = prior;
  let now = 0, warning = false;
  const ball = { id: 1, level: 0, position: { x: 200, y: 570 }, radius: 18 };
  const physics = { state: () => ({ now, phase: 'playing', danger: { warning, progress: .5 }, current: 0, previewX: 200, canDrop: true }), balls: () => [ball] };
  return { renderer, calls, physics, clock(value) { now = value; }, warning(value) { warning = value; } };
}
test('场内无落点辅助线/加分文字，危险线只在警告时显示', () => {
  const h = harness();
  h.renderer.feedback({ outputId: 1, level: 1, points: 6, x: 200, y: 570, time: 0 }); h.renderer.draw(h.physics);
  assert.equal(h.calls.filter(call => call.name === 'lineTo').length, 0);
  assert.ok(h.calls.filter(call => call.name === 'fillText').every(call => !String(call.args[0]).includes('+')));
  h.calls.length = 0; h.warning(true); h.renderer.draw(h.physics);
  assert.deepEqual(h.calls.filter(call => call.name === 'lineTo').map(call => call.args), [[400, 90]]);
  h.renderer.destroy();
});
test('队徽占满原碰撞直径且无额外圆框；preview与真实球同队，失败回退简称', () => {
  const route = Array.from({ length: 8 }, () => ({ shortName: '狼队' })), image = { complete: true, naturalWidth: 300, naturalHeight: 600 };
  const h = harness(false, { route, images: [image] }); h.renderer.draw(h.physics);
  const drawings = h.calls.filter(call => call.name === 'drawImage'); assert.equal(drawings.length, 2);
  for (const draw of drawings) assert.equal(draw.args[3] / draw.args[4], .5);
  assert.deepEqual(drawings.map(draw => draw.args[4]), [36, RADII[0] * 2]);
  assert.equal(h.calls.filter(call => call.name === 'arc' || call.name === 'stroke').length, 0);
  assert.equal([...h.physics.balls()][0].radius, 18);
  h.calls.length = 0; image.naturalWidth = 0; h.renderer.draw(h.physics);
  assert.ok(h.calls.filter(call => call.name === 'fillText').every(call => call.args[0] === '狼队')); h.renderer.destroy();
});
test('真实队徽沿用碰撞挤压与合成弹动，reduced-motion取消变形且不画圆框', () => {
  const options = { route: Array.from({ length: 8 }, () => ({ shortName: '狼队' })), images: [{ complete: true, naturalWidth: 256, naturalHeight: 256 }] };
  for (const reduced of [false, true]) {
    const h = harness(reduced, { ...options, images: [...options.images] }); h.renderer.impact({ id: 1, speed: 9, angle: 0, time: 0 });
    h.renderer.feedback({ outputId: 1, level: 1, time: 0 }); h.clock(90); h.renderer.draw(h.physics);
    assert.equal(h.calls.some(call => call.name === 'scale' && call.args[0] < 1), !reduced);
    assert.equal(h.calls.filter(call => call.name === 'drawImage').length, 2);
    assert.equal(h.calls.filter(call => call.name === 'arc').length, 0); h.renderer.destroy();
  }
});
test('碰撞挤压/合成弹动按模拟时钟过期，数量有界且destroy清空', () => {
  const h = harness();
  h.renderer.impact({ id: 1, speed: 9, angle: Math.PI / 2, time: 0 });
  h.renderer.feedback({ level: 1, x: 200, y: 550, time: 0 }); h.clock(90); h.renderer.draw(h.physics);
  assert.ok(h.calls.some(call => call.name === 'scale' && call.args[0] < 1 && call.args[1] > 1));
  h.clock(500); h.renderer.draw(h.physics); assert.equal(h.renderer.inspect().impacts, 0); assert.equal(h.renderer.inspect().effects, 0);
  for (let id = 0; id < 100; id++) { h.renderer.impact({ id, speed: 9, angle: 0, time: 500 }); h.renderer.feedback({ time: 500 }); }
  assert.equal(h.renderer.inspect().impacts, PHYSICS.maxImpacts); assert.equal(h.renderer.inspect().effects, PHYSICS.maxFeedback);
  h.renderer.destroy(); assert.equal(h.renderer.inspect().effects, 0); assert.equal(h.renderer.inspect().impacts, 0);
});
test('reduced-motion取消变形，合成不绘制任何额外光圈', () => {
  const h = harness(true);
  h.renderer.impact({ id: 1, speed: 9, angle: 0, time: 0 }); h.renderer.feedback({ outputId: 1, level: 1, x: 200, y: 550, time: 0 });
  h.clock(90); h.renderer.draw(h.physics);
  assert.equal(h.renderer.inspect().impacts, 0); assert.equal(h.calls.filter(call => call.name === 'scale').length, 0);
  assert.deepEqual(h.calls.filter(call => call.name === 'arc').map(call => call.args[2]), [18, RADII[0]]); h.renderer.destroy();
});
test('合成反馈只让输出球弹动，不在周围绘制蓝色或其他光圈', () => {
  const h = harness(); h.renderer.feedback({ outputId: 1, level: 3, time: 0 });
  h.clock(100); h.renderer.draw(h.physics);
  assert.ok(h.calls.some(call => call.name === 'scale' && call.args[0] === call.args[1] && call.args[0] > 1));
  assert.equal(h.calls.filter(call => call.name === 'arc').length, 2, '真实球+当前preview，无额外圆环');
  h.renderer.release({ id: 1 }, 100); assert.equal(h.renderer.inspect().impacts, 1);
  h.renderer.destroy(); assert.equal(h.renderer.inspect().impacts, 0);
});
