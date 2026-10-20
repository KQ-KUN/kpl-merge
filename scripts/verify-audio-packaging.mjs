import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { serveRoots } from './local-server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { chromium } = createRequire(import.meta.url)(process.env.KPL_PLAYWRIGHT_PATH || 'playwright');
const baselineArg = process.argv[process.argv.indexOf('--baseline') + 1];
if (!process.argv.includes('--baseline') || !baselineArg) throw Error('Provide --baseline <frozen Merge dist directory> explicitly');
const server = await serveRoots({ before: path.resolve(baselineArg), after: path.join(root, 'dist') });
const browser = await chromium.launch({ ...(process.env.KPL_BROWSER_CHANNEL ? { channel: process.env.KPL_BROWSER_CHANNEL } : {}), headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const report = { browser: browser.version(), environment: 'local static HTTP supports Range and ETag; no production or network throttling', runs: [], media: [], checks: [], pageErrors: [], businessEvents: [], blocked: [] };
await fs.mkdir(path.join(root, 'reports'), { recursive: true });
try {
  for (const width of [390, 1440]) for (const version of ['before', 'after']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: width === 390 ? 'reduce' : 'no-preference' });
    await context.addInitScript(() => {
      Math.random = () => .1;
      window.__businessEvents = []; window.KPLAnalytics = { trackEvent: event => __businessEvents.push(event) };
      const NativeAudio = window.Audio; window.__audios = [];
      window.Audio = function() { const audio = new NativeAudio(); __audios.push(audio); return audio; };
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1' || /\/(?:api|__event|analytics|telemetry)(?:\/|$)/.test(url.pathname) || !['GET','HEAD'].includes(route.request().method())) { report.blocked.push(url.pathname); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
    const cdp = await context.newCDPSession(page); await cdp.send('Network.enable'); let bodyBytes = 0;
    cdp.on('Network.dataReceived', event => { bodyBytes += event.encodedDataLength; });
    const measure = async () => ({ ...await page.evaluate(() => ({ domElements: document.querySelectorAll('*').length, durationMs: performance.now(),
      requestCount: performance.getEntriesByType('resource').length, transferBytes: performance.getEntriesByType('resource').reduce((sum, entry) => sum + entry.transferSize, 0),
      audioResources: performance.getEntriesByType('resource').filter(entry => entry.name.includes('team-audio/')).map(entry => ({ path: new URL(entry.name).pathname, transferSize: entry.transferSize, durationMs: entry.duration })),
      audioInstances: __audios.length })), cdpReceivedBodyBytes: bodyBytes });
    await page.goto(`${server.url}/${version}/`); await page.locator('#team-grid button').first().waitFor(); await page.waitForLoadState('networkidle');
    const startup = await measure(); assert.equal(startup.audioInstances, 0); assert.equal(startup.audioResources.length, 0);
    await page.locator('#team-grid button').first().click(); await page.locator('#start').click();
    await page.waitForFunction(() => __audios.length === 1 && !__audios[0].paused && __audios[0].currentTime > .1);
    await page.waitForTimeout(500); const playing = await measure();
    assert.equal(playing.audioInstances, 1); assert.equal(new Set(playing.audioResources.map(resource => resource.path)).size, 1);
    await page.locator('#pause').click(); assert.equal(await page.evaluate(() => __audios[0].getAttribute('src')), null);
    await page.locator('#pause').click(); await page.waitForFunction(() => !__audios[0].paused);
    await page.locator('#sound').click(); assert.equal(await page.evaluate(() => __audios[0].getAttribute('src')), null);
    await page.locator('#sound').click(); await page.waitForFunction(() => !__audios[0].paused);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(root, 'reports', `audio-${version}-${width}.png`), fullPage: true });
    report.runs.push({ version, width, reducedMotion: width === 390, startup, playing });
    report.businessEvents.push(...await page.evaluate(() => __businessEvents));
    await context.close();
  }
  const snapshot = JSON.parse(await fs.readFile(path.join(root, 'src/data/teams.json')));
  const context = await browser.newContext(); const page = await context.newPage();
  await page.goto(`${server.url}/after/`); await page.locator('body').click({ position: { x: 5, y: 5 } });
  report.media = await page.evaluate(async resources => {
    const audio = new Audio(), results = [];
    const wait = async condition => { const start = performance.now(); while (!condition()) { if (performance.now() - start > 7000) throw Error('media progress timeout'); await new Promise(resolve => setTimeout(resolve, 25)); } };
    for (const resource of resources) {
      audio.preload = 'none'; audio.src = resource.path; await audio.play(); await wait(() => Number.isFinite(audio.duration));
      audio.currentTime = resource.cue; await wait(() => !audio.seeking && audio.currentTime > resource.cue + .05);
      const cueTime = audio.currentTime, duration = audio.duration, seek = duration * .75;
      audio.currentTime = seek; await wait(() => !audio.seeking && audio.currentTime > seek + .05);
      results.push({ ...resource, durationSeconds: duration, cuePlayedAt: cueTime, seekTarget: seek, seekPlayedAt: audio.currentTime });
      audio.pause(); audio.removeAttribute('src'); audio.load();
    }
    return results;
  }, snapshot.teams.flatMap(team => [{ path: team.anthem, cue: team.anthemStartSeconds }, ...(team.childAnthem ? [{ path: team.childAnthem, cue: team.childAnthemStartSeconds }] : [])]));
  assert.equal(report.media.length, 20);
  const resource = snapshot.teams[0].anthem;
  const range = await page.evaluate(async resource => {
    const first = await fetch(resource, { headers: { Range: 'bytes=0-1023' }, cache: 'no-store' }); const bytes = (await first.arrayBuffer()).byteLength;
    const cached = await fetch(resource); const etag = cached.headers.get('etag'); await cached.arrayBuffer();
    const conditional = await fetch(resource, { headers: { 'If-None-Match': etag }, cache: 'no-store' });
    return { status: first.status, range: first.headers.get('content-range'), bytes, etag, conditionalStatus: conditional.status };
  }, resource);
  assert.equal(range.status, 206); assert.equal(range.bytes, 1024); assert.match(range.range, /^bytes 0-1023\//); assert.equal(range.conditionalStatus, 304);
  report.range = range;
  report.checks.push('390/1440视口、390reduced-motion：选队页0Audio/0音源请求，开局单Audio仅当前曲，暂停/继续/静音保留语义', '20首运行音源真实解码，原歌词起点播放、75%时点seek继续播放通过', '仅本地服务器Range206/1024bytes/Content-Range和条件缓存304通过；不代表线上CDN');
  await context.close(); assert.deepEqual(report.pageErrors, []);
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  report.requests = server.requests;
  await fs.writeFile(path.join(root, 'reports/audio-packaging-browser.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ checks: report.checks, runs: report.runs.length, media: report.media.length, failure: report.failure }));
  await browser.close(); await server.close();
}
