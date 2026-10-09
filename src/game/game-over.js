import { GAME_OVER } from './config.js';

// 带空间滞回和短窗口稳定判断，轻微抖动不会每帧清零计时。
export function createDangerDetector(config = GAME_OVER) {
  const tracked = new Map();
  return {
    update(balls, now) {
      const live = new Set();
      let warning = false, progress = 0, loserId = null;
      for (const ball of balls) {
        if (!ball.released || ball.consumed || now < ball.graceUntil) continue;
        live.add(ball.id);
        const top = ball.position.y - ball.radius;
        let entry = tracked.get(ball.id);
        if (top > config.dangerY + config.hysteresis || (!entry && top >= config.dangerY)) { tracked.delete(ball.id); continue; }
        warning = true;
        if (!entry) { entry = { samples: [], stableSince: null, unstableSince: null }; tracked.set(ball.id, entry); }
        entry.samples.push({ time: now, x: ball.position.x, y: ball.position.y, top, speed: Math.hypot(ball.velocity.x, ball.velocity.y) });
        // 保留窗口之前的一个锚点，使固定步长浮点误差不丢完整窗口。
        while (entry.samples.length > 1 && entry.samples[1].time <= now - config.windowMs) entry.samples.shift();
        const samples = entry.samples;
        if (now - samples[0].time + 1e-6 < config.windowMs) continue;
        const xs = samples.map(sample => sample.x), ys = samples.map(sample => sample.y);
        const travel = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        const averageSpeed = samples.reduce((sum, sample) => sum + sample.speed, 0) / samples.length;
        const overflowFraction = samples.filter(sample => sample.top < config.dangerY).length / samples.length;
        const stable = overflowFraction >= config.minOverflowFraction && travel <= config.maxTravel
          && (averageSpeed <= config.stableSpeed || travel <= config.jitterTravel);
        if (stable) {
          entry.unstableSince = null;
          entry.stableSince ??= now;
        } else {
          entry.unstableSince ??= now;
          if (now - entry.unstableSince >= config.unstableToleranceMs) entry.stableSince = null;
        }
        const elapsed = entry.stableSince === null ? 0 : now - entry.stableSince;
        progress = Math.max(progress, Math.min(1, elapsed / config.stableDurationMs));
        // 不能在正在剧烈移动的容忍帧里结束。
        if (stable && top < config.dangerY && elapsed + 1e-6 >= config.stableDurationMs && loserId === null) loserId = ball.id;
      }
      for (const id of tracked.keys()) if (!live.has(id)) tracked.delete(id);
      return { warning, progress, loserId };
    },
    clear: () => tracked.clear(),
    size: () => tracked.size
  };
}
