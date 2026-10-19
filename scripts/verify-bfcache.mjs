import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Local browser validation only; never visit production or send product analytics.
const root = fileURLToPath(new URL('..', import.meta.url));
const { chromium } = createRequire(import.meta.url)(process.env.KPL_PLAYWRIGHT_PATH || 'playwright');
const reportPath = path.join(root, 'reports', 'first-batch-bfcache.json');
const server = await createServer({ root, server: { host: '127.0.0.1', port: 4198, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ channel: process.env.KPL_BROWSER_CHANNEL || 'msedge', headless: true,
  ignoreDefaultArgs: ['--disable-back-forward-cache'] });
const checks = [], errors = [], blockedAnalytics = [];
const result = { browser: browser.version(), checks, errors, blockedAnalytics, realHistory: [], physicalDevice: false };
try {
  const context = await browser.newContext();
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    // Block transports, not the local analytics.js module needed by current upstream.
    if (url.hostname !== '127.0.0.1' || url.pathname.startsWith('/api/') || /^\/(?:analytics|telemetry|__event)(?:\/|$)/.test(url.pathname)
      || !['GET', 'HEAD'].includes(route.request().method())) {
      blockedAnalytics.push(url.origin + url.pathname); return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript(() => {
    window.__analyticsEvents = [];
    window.KPLAnalytics = { trackEvent: event => __analyticsEvents.push(event) };
    const AudioClass = window.Audio; window.__audioInstances = [];
    window.Audio = function() { const audio = new AudioClass(); __audioInstances.push(audio); return audio; };
    const request = requestAnimationFrame.bind(window), cancel = cancelAnimationFrame.bind(window), pending = new Set();
    window.requestAnimationFrame = callback => { const id = request(time => { pending.delete(id); callback(time); }); pending.add(id); return id; };
    window.cancelAnimationFrame = id => { pending.delete(id); cancel(id); };
    window.__pendingFrames = () => pending.size;
    window.__pageEvents = [];
    for (const type of ['pagehide', 'pageshow']) window.addEventListener(type, event => __pageEvents.push({ type, persisted: event.persisted, trusted: event.isTrusted }));
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4198/');
  await page.locator('#team-grid button').first().click(); await page.locator('#start').click();
  await page.evaluate(() => {
    const app = __KPL_MERGE__, p = app.current().physics;
    p.addBall(1, 195, 400); p.addBall(1, 205, 400);
  });
  await page.waitForFunction(() => __KPL_MERGE__.current().physics.state().score === 26);
  await page.locator('#music-version').click();
  await page.waitForFunction(() => __KPL_MERGE__.audio().inspect().playing);
  await page.locator('#pause').click();
  await page.locator('#sound').click();
  await page.evaluate(() => {
    const app = __KPL_MERGE__, session = app.current(), audio = app.audio(), route = app.route();
    const before = JSON.stringify(session.physics.state()), balls = [...session.physics.balls()];
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    if (session !== app.current() || audio !== app.audio() || route !== app.route()) throw Error('session/audio/route identity changed');
    if (JSON.stringify(session.physics.state()) !== before || [...session.physics.balls()].some((ball, index) => ball !== balls[index])) throw Error('game state changed');
    if (!session.inspect().manuallyPaused || !audio.inspect().muted || __pendingFrames() !== 0) throw Error('paused/muted state lost');
  });
  assert.deepEqual(await page.evaluate(() => __analyticsEvents), ['merge-start'], 'BFCache恢复不重复启动/重开统计');
  assert.equal(await page.locator('#music-version').getAttribute('aria-pressed'), 'true');
  checks.push('合成26分后：合成球、current/next、队伍路线、手动暂停、静音、小孩版模式保留；重复pageshow为0RAF');
  await page.locator('#sound').click(); await page.locator('#pause').click();
  await page.waitForFunction(() => __KPL_MERGE__.audio().inspect().playing);
  for (let round = 0; round < 3; round++) {
    const frozen = await page.evaluate(() => {
      const app = __KPL_MERGE__;
      window.__savedSession = app.current(); window.__savedRoute = app.route(); window.__savedAudio = app.audio();
      const before = app.current().physics.state(), currentTime = app.audio().inspect().currentTime;
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      return { before, currentTime, frames: __pendingFrames(), source: app.audio().inspect().source };
    });
    assert.equal(frozen.frames, 0); assert.equal(frozen.source, null);
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => __KPL_MERGE__.current().physics.state()), frozen.before);
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      const app = __KPL_MERGE__;
      if (app.current() !== __savedSession || app.route() !== __savedRoute || app.audio() !== __savedAudio) throw Error('recreated session');
      if (__pendingFrames() !== 1 || app.current().inspect().listeners !== 8 || __audioInstances.length !== 1) throw Error('duplicate resources');
    });
    await page.waitForFunction(() => __KPL_MERGE__.audio().inspect().playing);
    assert.ok(await page.evaluate(time => __KPL_MERGE__.audio().inspect().currentTime >= time - .1, frozen.currentTime));
  }
  checks.push('真实浏览器合成pagehide/pageshow三次：模拟时钟冻结，同一会话/路线/Audio、8监听、仅1RAF，战歌游标续播');

  // Browser history is separate evidence from synthetic events. Record actual BFCache hits explicitly.
  await page.locator('#pause').click();
  const historyState = await page.evaluate(() => {
    window.__historySession = __KPL_MERGE__.current();
    return { state: __historySession.physics.state(), route: __KPL_MERGE__.route().map(team => team.id),
      balls: [...__historySession.physics.balls()].map(ball => ({ id: ball.id, level: ball.level, x: ball.position.x, y: ball.position.y, vx: ball.velocity.x, vy: ball.velocity.y })) };
  });
  for (let round = 0; round < 2; round++) {
    await page.goto(`http://127.0.0.1:4198/?history-away=${round}`);
    await page.goBack({ waitUntil: 'commit' });
    await page.waitForFunction(() => Boolean(window.__KPL_MERGE__));
    const evidence = await page.evaluate(() => ({ persisted: __pageEvents.filter(event => event.type === 'pageshow' && event.trusted).at(-1)?.persisted === true,
      sameSession: window.__historySession === __KPL_MERGE__.current(), events: __pageEvents,
      state: __KPL_MERGE__.current()?.physics.state(), route: __KPL_MERGE__.route()?.map(team => team.id),
      balls: [...__KPL_MERGE__.current().physics.balls()].map(ball => ({ id: ball.id, level: ball.level, x: ball.position.x, y: ball.position.y, vx: ball.velocity.x, vy: ball.velocity.y })),
      frames: __pendingFrames(), audioInstances: __audioInstances.length }));
    result.realHistory.push(evidence);
    if (!evidence.persisted) { result.realHistoryLimitation = '浏览器实际前进/后退已执行，但本环境未命中 BFCache，不能宣称原生 BFCache 恢复验收通过'; break; }
    assert.equal(evidence.sameSession, true); assert.deepEqual(evidence.state, historyState.state);
    assert.deepEqual(evidence.route, historyState.route); assert.deepEqual(evidence.balls, historyState.balls);
    assert.equal(evidence.frames, 0); assert.equal(evidence.audioInstances, 1);
    await page.goForward({ waitUntil: 'commit' }); await page.goBack({ waitUntil: 'commit' });
    assert.equal(await page.evaluate(() => __historySession === __KPL_MERGE__.current()), true);
  }
  if (result.realHistory.every(item => item.persisted)) checks.push('原生前进/后退与连续返回均命中BFCache：26分、球体、队列、暂停和队伍映射保留，同一session与Audio');
  if (!await page.evaluate(() => Boolean(__KPL_MERGE__.current()))) {
    await page.locator('#team-grid button').first().click(); await page.locator('#start').click();
  }
  await page.evaluate(() => {
    const session = __KPL_MERGE__.current();
    session.physics.addBall(6, 180, 350); session.physics.addBall(6, 220, 350); session.pause(false);
  });
  await page.locator('#final-choice').waitFor();
  await page.waitForFunction(() => __KPL_MERGE__.audio().inspect().playing);
  const finalScore = await page.evaluate(() => {
    const score = __KPL_MERGE__.current().physics.state().score;
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    if (__KPL_MERGE__.audio().inspect().source !== null) throw Error('hidden final dialog still playing');
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    return score;
  });
  await page.waitForFunction(() => __KPL_MERGE__.audio().inspect().playing);
  assert.equal(await page.locator('#final-choice').isVisible(), true);
  assert.equal(await page.evaluate(() => __pendingFrames()), 0);
  assert.equal(await page.evaluate(() => __KPL_MERGE__.current().physics.state().score), finalScore);
  checks.push('本命达成弹窗恢复后继续保留暂停/球体/得分，战歌恢复；离开时战歌停止');
  await page.locator('#final-continue').click();
  await page.locator('#restart').click();
  assert.equal(await page.evaluate(() => __KPL_MERGE__.current().physics.state().score), 0);
  assert.equal(await page.evaluate(() => __KPL_MERGE__.current().physics.state().ballCount), 0);
  assert.equal(await page.evaluate(() => __pendingFrames()), 1);
  assert.equal(await page.locator('#music-version').getAttribute('aria-pressed'), 'false');
  checks.push('明确Restart才清空分数/球体、重置音乐模式，旧局资源释放，新局仅1RAF');
  result.analyticsEvents = await page.evaluate(() => __analyticsEvents);
  assert.deepEqual(result.analyticsEvents, ['merge-start', 'merge-favorite', 'merge-restart', 'merge-start']);
  checks.push('统计仅本地stub收集：BFCache无重复start/restart，本命favorite一次，明确重开才发送restart/start');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
  assert.deepEqual(await page.evaluate(() => ({ frames: __pendingFrames(), listeners: __KPL_MERGE__.current().inspect().listeners,
    bodies: __KPL_MERGE__.current().inspect().physics.worldBodies, audio: __audioInstances.every(item => item.getAttribute('src') === null) })),
  { frames: 0, listeners: 0, bodies: 0, audio: true });
  checks.push('非BFCache退出销毁world/监听/RAF/媒体源');
  assert.deepEqual(errors, []);
  await context.close();
} catch (error) { result.failure = error.stack; process.exitCode = 1; }
finally {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  await browser.close(); server.httpServer?.closeAllConnections(); await server.close();
}
