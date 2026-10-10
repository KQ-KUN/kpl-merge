import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)(process.env.KPL_PLAYWRIGHT_PATH || 'playwright');
const url = process.env.KPL_MERGE_URL || 'http://127.0.0.1:4196/';
const built = process.argv.includes('--built');
const directory = new URL('../reports/next-preview/', import.meta.url);
await fs.mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], checks = [];
try {
  for (const [width, height] of [[390, 844], [430, 932], [768, 900], [1440, 900], [390, 667]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 600, hasTouch: width < 600 });
    await context.addInitScript(() => { Math.random = () => .9; });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.locator('#team-grid [data-team="10001"]').click();
    await page.locator('#start').click();
    await page.waitForFunction(() => document.querySelector('#next-icon').naturalWidth > 0);
    const readPreview = () => page.locator('#next-preview').evaluate(element => ({ level: element.dataset.level, team: element.dataset.team, name: element.querySelector('strong').textContent, icon: element.querySelector('img').src }));
    const preview = await readPreview();
    assert.equal(preview.level, await page.locator('#arena').getAttribute('data-next'));
    assert.ok(preview.name && preview.icon.includes(`${preview.team}.png`));
    const nextBox = await page.locator('#next-preview').boundingBox(), arenaBox = await page.locator('#arena').boundingBox();
    assert.ok(nextBox && nextBox.width > 0);
    assert.ok(width >= 760 ? nextBox.x >= arenaBox.x + arenaBox.width : nextBox.y + nextBox.height < arenaBox.y, '预览不遮挡游戏箱');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1), '窗口无横向或纵向溢出');
    await page.locator('#arena').click({ position: { x: 20, y: 30 } });
    assert.equal(await page.locator('#arena').getAttribute('data-current'), preview.level, '下一球成为当前待投放球');
    await page.waitForTimeout(550);
    await page.locator('#arena').click({ position: { x: arenaBox.width - 20, y: 30 } });
    assert.equal(await page.locator('#arena').getAttribute('data-team'), preview.team, '下一球队徽与实际释放的第二球一致');
    if (!built) {
      await page.evaluate(() => {
        let count = 0;
        window.__KPL_MERGE__.restart(() => ++count % 2 ? .1 : .9);
        window.__KPL_MERGE__.current().pause(true);
      });
      for (let drop = 0; drop < 6; drop++) {
        const result = await page.evaluate(() => {
          const { physics } = window.__KPL_MERGE__.current(), before = physics.state();
          const shown = document.querySelector('#next-preview').dataset.level;
          const ball = physics.drop(60 + before.ballCount * 40);
          const after = physics.state(), visible = document.querySelector('#next-preview');
          for (let tick = 0; tick < 31; tick++) physics.step();
          return { shown, before, after, dropped: ball.level, level: visible.dataset.level, team: visible.dataset.team, expectedTeam: window.__KPL_MERGE__.route()[after.next].id };
        });
        assert.equal(Number(result.shown), result.before.next);
        assert.equal(result.dropped, result.before.current);
        assert.equal(result.after.current, result.before.next);
        assert.equal(Number(result.level), result.after.next);
        assert.equal(result.team, result.expectedTeam);
      }
      await page.locator('#restart').click();
      assert.equal((await readPreview()).level, await page.locator('#arena').getAttribute('data-next'), '重开刷新新局队列');
    }
    if (width === 390 || width === 1440) await page.screenshot({ path: fileURLToPath(new URL(`preview-${width}-${height}.png`, directory)), fullPage: true });
    checks.push(`${width}×${height}：队徽加载、队列一致、实际投放一致、无重叠或溢出${built ? '' : '、连续投放和重开'}`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ url, checks, errors }, null, 2));
} finally { await browser.close(); }
