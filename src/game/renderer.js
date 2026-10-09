import { PHYSICS, GAME_OVER, RADII, COLORS, LOGO } from './config.js';

export function createRenderer(canvas, { reducedMotion = false, route = null, images = [] } = {}) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器不支持 Canvas 2D');
  let effects = [], destroyed = false;
  const impacts = new Map();
  function resize() {
    const rect = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
    context.setTransform(canvas.width / PHYSICS.width, 0, 0, canvas.height / PHYSICS.height, 0, 0);
  }
  function circle(level, x, y, radius, alpha = 1, impact = null, now = 0, merge = null) {
    context.globalAlpha = alpha;
    context.fillStyle = COLORS[level]; context.strokeStyle = '#232323'; context.lineWidth = 1;
    context.save(); context.translate(x, y);
    if (merge && !reducedMotion) {
      const pop = 1 + .10 * Math.sin(Math.min(1, (now - merge.time) / PHYSICS.mergeEffectMs) * Math.PI);
      context.scale(pop, pop);
    }
    if (impact && !reducedMotion) {
      // 只变绘制形状，真实碰撞半径不变；面积保持，180ms后复原。
      const fraction = Math.min(1, (now - impact.time) / PHYSICS.impactMs);
      const squeeze = 1 - Math.sin(fraction * Math.PI) * Math.min(.16, impact.speed * .018);
      context.rotate(impact.angle); context.scale(squeeze, 1 / squeeze); context.rotate(-impact.angle);
    }
    if (!route) { context.beginPath(); context.arc(0, 0, radius, 0, Math.PI * 2); context.fill(); context.stroke(); }
    if (!route && merge && now - merge.time < 160) {
      context.globalAlpha = alpha * .35 * (reducedMotion ? 1 : 1 - (now - merge.time) / 160);
      context.fillStyle = '#FFFFFF'; context.fill(); context.globalAlpha = alpha;
    }
    const image = images[level];
    if (route && image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      // 队徽整体占满球体直径，保留宽高比与原图，不添加底板/圆框；物理仍为圆。
      const size = radius * LOGO.diameterFactor, scale = size / Math.max(image.naturalWidth, image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      context.drawImage(image, -width / 2, -height / 2, width, height); context.restore(); context.globalAlpha = 1; return;
    }
    context.restore();
    context.fillStyle = level === 7 ? '#FFFFFF' : '#232323';
    if (route) context.fillStyle = '#232323';
    context.font = `600 ${Math.max(12, Math.min(32, radius * 0.7))}px system-ui`;
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(route ? route[level].shortName : `L${level}`, x, y, radius * 1.6);
    context.globalAlpha = 1;
  }
  function draw(physics) {
    if (destroyed) return;
    const state = physics.state();
    context.clearRect(0, 0, PHYSICS.width, PHYSICS.height);
    context.fillStyle = '#FFFCF6'; context.fillRect(0, 0, PHYSICS.width, PHYSICS.height);
    if (state.danger.warning) {
      context.strokeStyle = '#A52B3F'; context.lineWidth = 2; context.setLineDash([6, 5]);
      context.beginPath(); context.moveTo(0, GAME_OVER.dangerY); context.lineTo(PHYSICS.width, GAME_OVER.dangerY); context.stroke(); context.setLineDash([]);
      context.fillStyle = '#A52B3F'; context.fillRect(0, GAME_OVER.dangerY + 3, PHYSICS.width * state.danger.progress, 3);
    }
    effects = effects.filter(effect => state.now - effect.time < PHYSICS.mergeEffectMs);
    const liveIds = new Set();
    for (const ball of physics.balls()) {
      liveIds.add(ball.id);
      const merge = effects.findLast(effect => effect.outputId === ball.id);
      circle(ball.level, ball.position.x, ball.position.y, ball.radius, 1, impacts.get(ball.id), state.now, merge);
    }
    for (const [id, impact] of impacts) if (!liveIds.has(id) || state.now - impact.time >= PHYSICS.impactMs) impacts.delete(id);
    if (state.phase === 'playing') {
      circle(state.current, state.previewX, PHYSICS.spawnY, RADII[state.current], state.canDrop ? 0.85 : 0.4);
    }
  }
  function impact(event) {
    if (destroyed || reducedMotion) return;
    impacts.set(event.id, event);
    if (impacts.size > PHYSICS.maxImpacts) impacts.delete(impacts.keys().next().value);
  }
  resize();
  return { resize, draw,
    feedback(event) { if (!destroyed) { effects.push(event); if (effects.length > PHYSICS.maxFeedback) effects.shift(); } },
    impact, release(ball, time) { impact({ id: ball.id, speed: 6, angle: Math.PI / 2, time }); },
    destroy() { destroyed = true; effects.length = 0; impacts.clear(); images.length = 0; context.clearRect(0, 0, PHYSICS.width, PHYSICS.height); },
    inspect: () => ({ destroyed, effects: effects.length, impacts: impacts.size, reducedMotion })
  };
}
