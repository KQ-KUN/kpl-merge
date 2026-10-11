import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)(process.env.KPL_PLAYWRIGHT_PATH || 'playwright');
const built = process.argv.includes('--built');
const url = process.env.KPL_MERGE_URL || `http://127.0.0.1:${built ? 4198 : 4197}/`;
const directory = new URL(`../reports/audio-mode-${built ? 'built' : 'dev'}/`, import.meta.url);
await fs.mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const checks = [], errors = [];
async function open(width = 1440, height = 900) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    window.__rngValue = .1;
    Math.random = () => window.__rngValue;
    const NativeAudio = window.Audio;
    window.__media = [];
    window.Audio = function () {
      const audio = new NativeAudio(), load = audio.load.bind(audio);
      audio.testLoads = 0;
      audio.load = () => { audio.testLoads++; return load(); };
      window.__media.push(audio); return audio;
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(url);
  await page.locator('#team-grid [data-team="10001"]').click(); await page.locator('#start').click();
  await page.waitForFunction(() => __media.at(-1)?.src.includes('/normal/') && !__media.at(-1).paused);
  return { context, page };
}
const media = page => page.evaluate(() => {
  const audio = __media.at(-1);
  return { source: audio.getAttribute('src'), time: audio.currentTime, paused: audio.paused, loads: audio.testLoads };
});
async function waitTrack(page, variant) {
  await page.waitForFunction(variant => __media.at(-1).src.includes(`/team-audio/${variant}/`) && !__media.at(-1).paused, variant);
}
async function assertMode(page, mode) {
  const button = page.locator('#music-version');
  assert.equal(await button.textContent(), '正常版 / 小孩版');
  assert.equal(await button.getAttribute('aria-pressed'), String(mode === 'child'));
  assert.match(await button.getAttribute('aria-label'), new RegExp(`当前${mode === 'child' ? '小孩版' : '正常版'}`));
  const styles = await button.evaluate(element => ['normal', 'child'].map(version => {
    const style = getComputedStyle(element.querySelector(`.music-${version}`));
    return { color: style.color, underline: style.textDecorationLine };
  }));
  assert.notEqual(styles[0].color, styles[1].color);
  assert.equal(styles[mode === 'child' ? 1 : 0].underline, 'underline');
  assert.equal(styles[mode === 'child' ? 0 : 1].underline, 'none');
}
async function assertSound(page, enabled) {
  const button = page.locator('#sound');
  assert.equal((await button.textContent()).trim(), '');
  assert.equal(await button.getAttribute('aria-pressed'), String(enabled));
  assert.equal(await button.getAttribute('aria-label'), enabled ? '关闭合成战歌' : '开启合成战歌');
  assert.equal(await button.locator('.sound-waves').isVisible(), enabled);
  assert.equal(await button.locator('.sound-off').isVisible(), !enabled);
}
try {
  for (const [width, height] of [[320, 568], [360, 800], [390, 844], [430, 932], [768, 900], [1440, 900]]) {
    const { context, page } = await open(width, height);
    await assertMode(page, 'normal'); await assertSound(page, true);
    await page.waitForLoadState('networkidle');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const arena = await page.locator('#arena').boundingBox();
    assert.ok(arena.y + arena.height <= height + 1, `arena ${width}x${height}`);
    const controls = await page.locator('#controls').boundingBox();
    assert.ok(arena.y + arena.height <= controls.y + 1, `arena overlaps controls ${width}x${height}`);
    const versionBox = await page.locator('#music-version').boundingBox();
    for (const selector of ['#music-version', '#sound', '#pause', '#restart', '#fullscreen']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
      assert.equal(box.y, versionBox.y, `toolbar wraps ${width}x${height}`);
    }
    const before = await media(page);
    await page.locator('#music-version').click();
    const after = await media(page);
    await assertMode(page, 'child');
    assert.match(await page.locator('#music-version').getAttribute('title'), /暂无小孩版/);
    assert.equal(after.source, before.source); assert.equal(after.loads, before.loads); assert.ok(after.time >= before.time);
    await page.locator('#music-version').focus(); await page.keyboard.press('Space');
    await assertMode(page, 'normal');
    await page.locator('#sound').focus(); await page.keyboard.press('Space');
    await assertSound(page, false); assert.equal((await media(page)).source, null);
    await page.screenshot({ path: fileURLToPath(new URL(`${width}-muted.png`, directory)), fullPage: true });
    await page.keyboard.press('Space'); await waitTrack(page, 'normal'); await assertSound(page, true);
    await page.screenshot({ path: fileURLToPath(new URL(`${width}.png`, directory)), fullPage: true });
    checks.push(`${width}x${height}: 两版文字常显、当前版高亮及下划线、声音/静音图标正确；按钮44px且无水平溢出，游戏箱完整；缺少小孩版不重载，键盘可切换`);
    await context.close();
  }
  const { context, page } = await open();
  if (built) {
    const box = await page.locator('#arena').boundingBox();
    // 保持已显示的两个L0；只让后续抽样为L1，在墙边形成可重复的真实合成。
    await page.evaluate(() => { window.__rngValue = .9; });
    for (let count = 0; count < 4; count++) {
      await page.mouse.click(box.x + (count < 2 ? box.width - 5 : 5), box.y + box.height / 2);
      await page.waitForTimeout(1200);
    }
    await page.screenshot({ path: fileURLToPath(new URL('natural-merge.png', directory)), fullPage: true });
    await page.waitForFunction(() => Number(document.querySelector('#score').textContent) >= 26, undefined, { timeout: 10000 });
  } else {
    await page.evaluate(() => { const p = __KPL_MERGE__.current().physics; p.addBall(1, 180, 400); p.addBall(1, 220, 400); });
    await page.waitForFunction(() => __KPL_MERGE__.audio().inspect().level === 2 && __KPL_MERGE__.audio().inspect().playing);
  }
  await waitTrack(page, 'normal');
  await page.evaluate(() => { __media.at(-1).currentTime += 2; });
  const normal = await media(page);
  await page.locator('#music-version').click(); await waitTrack(page, 'child');
  await page.waitForTimeout(300); const child = await media(page);
  assert.notEqual(child.source, normal.source);
  await page.locator('#music-version').click(); await waitTrack(page, 'normal');
  assert.equal((await media(page)).source, normal.source); assert.ok((await media(page)).time >= normal.time);
  await page.locator('#pause').click();
  await page.locator('#music-version').click(); assert.equal((await media(page)).source, null);
  await page.locator('#pause').click(); await waitTrack(page, 'child'); assert.ok((await media(page)).time >= child.time);
  await page.locator('#sound').click(); await assertSound(page, false); await page.locator('#music-version').click();
  assert.equal((await media(page)).source, null);
  await page.locator('#sound').click(); await waitTrack(page, 'normal'); await assertSound(page, true);
  checks.push('中间等级可播放小孩版；两版独立续播，暂停/静音时切换不启动音频，恢复采用新版本');
  await page.locator('#music-version').click(); await waitTrack(page, 'child');
  if (!built) {
    const before = await media(page), score = await page.locator('#score').textContent();
    await page.evaluate(() => { const p = __KPL_MERGE__.current().physics; p.addBall(0, 65, 200); p.addBall(0, 100, 200); });
    await page.waitForFunction(prior => __KPL_MERGE__.current().physics.state().score > prior, Number(score));
    const after = await media(page);
    assert.equal(after.source, before.source); assert.equal(after.loads, before.loads);
    assert.equal(await page.evaluate(() => __KPL_MERGE__.audio().inspect().level), 2);
    checks.push('小孩版模式低等级合成不切歌、不重载，最高等级仍为L2');
  }
  await page.locator('#restart').click(); await waitTrack(page, 'normal');
  await assertMode(page, 'normal');
  if (!built) {
    await page.evaluate(() => { const p = __KPL_MERGE__.current().physics; p.addBall(6, 180, 400); p.addBall(6, 220, 400); });
    await page.locator('#final-choice').waitFor(); await waitTrack(page, 'normal');
    assert.equal(await page.evaluate(() => __KPL_MERGE__.audio().inspect().level), 7);
    await page.locator('#final-continue').click(); await page.locator('#music-version').click(); await waitTrack(page, 'child');
    checks.push('正常版L7不自动切小孩版，本命弹窗继续播放；继续游玩后可切换小孩版');
  }
  await page.locator('#change-team').click(); await page.locator('#start').click(); await waitTrack(page, 'normal');
  await assertMode(page, 'normal');
  checks.push('重开及返回选队重新开始均恢复正常版');
  await context.close(); assert.deepEqual(errors, []);
  await fs.writeFile(new URL('results.json', directory), JSON.stringify({ built, url, checks, errors, physicalDevice: false }, null, 2) + '\n');
  console.log(JSON.stringify({ built, checks: checks.length, errors, directory: directory.href }));
} finally { await browser.close(); }
