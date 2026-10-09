import { PHYSICS } from './config.js';

// 留存上一组合成；只有新组合成替换它，时间流逝不清空得分。
export function createMergeFeedback() {
  let events = [], complete = false;
  return {
    record(event) {
      const linked = events.some(prior => event.inputIds.includes(prior.outputId));
      if (events.length && (complete || event.time - events.at(-1).time > PHYSICS.feedbackMs) && !linked) events = [];
      complete = false;
      events.push(event);
      return this.state();
    },
    state: () => ({ events: [...events], total: events.reduce((sum, event) => sum + event.points, 0),
      maxLevel: events.reduce((level, event) => Math.max(level, event.level), 0),
      chain: events.some(event => events.some(prior => prior.tick < event.tick && event.inputIds.includes(prior.outputId))) }),
    finish() { complete = true; },
    reset() { events = []; complete = false; }
  };
}
