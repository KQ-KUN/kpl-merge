import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// 浏览器验证使用现有 Playwright；不成为游戏运行或 build 依赖。
const { chromium } = createRequire(import.meta.url)(process.env.KPL_PLAYWRIGHT_PATH || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const built = process.argv.includes('--built');
const url = process.env.KPL_MERGE_URL || `http://127.0.0.1:${built ? 4197 : 4196}/`;
const directory = path.join(root, 'reports', built ? 'browser-gameplay-revision-built' : 'browser-gameplay-revision');
const snapshot = JSON.parse(await fs.readFile(path.join(root, 'src/data/teams.json'), 'utf8'));
await fs.mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: process.env.KPL_BROWSER_CHANNEL || 'msedge', headless: true });
const errors = [], checks = [];
const state = page => page.evaluate(() => window.__KPL_MERGE__.current().physics.state());
async function context(options) {
  const ctx = await browser.newContext(options);
  await ctx.addInitScript(() => {
    Math.random = () => .1;
    const NativeAudio = window.Audio; window.__testAudio = [];
    window.Audio = function() { const audio = new NativeAudio(); window.__testAudio.push(audio); return audio; };
    const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window), pending = new Set();
    window.requestAnimationFrame = callback => {
      const id = request(time => { pending.delete(id); callback(time); }); pending.add(id); return id;
    };
    window.cancelAnimationFrame = id => { pending.delete(id); cancel(id); };
    window.__testRafCount = () => pending.size;
  });
  ctx.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  });
  return ctx;
}
async function openGame(page) {
  await page.goto(url);
  await page.locator('#team-grid button').first().waitFor();
  assert.equal(await page.locator('#team-grid button').count(), 12);
  assert.equal(await page.locator('#pool-caption').count(), 0);
  assert.equal(await page.locator('#picker header p').count(), 0);
  assert.equal(await page.locator('#team-grid [data-team="10007"], #team-grid [data-team="10008"]').count(), 2);
  assert.equal(await page.locator('#team-grid [data-team="10016"], #team-grid [data-team="10903"]').count(), 0);
  assert.equal(await page.evaluate(() => __testRafCount()), 0, '选队前无物理RAF');
  await page.waitForFunction(() => [...document.querySelectorAll('#team-grid img')].every(image => image.complete && image.naturalWidth > 0));
  assert.ok(await page.locator('#team-grid img').evaluateAll(images => images.every(image => !image.hidden && getComputedStyle(image).display !== 'none')));
  assert.equal((await page.locator('#team-grid img').first().boundingBox()).width, page.viewportSize().width < 760 ? 64 : 80);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '选队页无水平溢出');
  assert.equal(await page.locator('#picker .hub-link').getAttribute('href'), 'https://kplgame.cn/');
  assert.ok(await page.locator('#picker .hub-link').isVisible());
  assert.equal(await page.evaluate(() => __testAudio.length), 0, '选队封面不自动播放');
  if ([390, 1440].includes(page.viewportSize().width)) await page.screenshot({ path: path.join(directory, `picker-${page.viewportSize().width}.png`), fullPage: true });
  await page.locator('#team-grid [data-team="10001"]').click(); await page.locator('#start').click();
  await page.locator('#arena').waitFor();
  assert.equal(await page.locator('#favorite-name').textContent(), '狼队');
  assert.equal(await page.locator('#arena').getAttribute('data-current'), '0', '每局首球固定最低阶L0');
  assert.ok(['0', '1'].includes(await page.locator('#arena').getAttribute('data-next')), '初期不投放第三级L2');
}
try {
  const mediaContext = await context({ viewport: { width: 1440, height: 900 } }), mediaPage = await mediaContext.newPage();
  await mediaPage.goto(url); await mediaPage.locator('body').click({ position: { x: 5, y: 5 } });
  const decoded = await mediaPage.evaluate(async resources => {
    const results = [];
    for (const { resource, startSeconds } of resources) {
      const audio = new Audio(), controller = new AbortController(); audio.src = new URL(resource, location.href).href;
      let timer;
      try {
        const duration = await Promise.race([
          (async () => {
            await audio.play(); audio.currentTime = startSeconds;
            await new Promise((resolve, reject) => {
              const progressed = () => { if (audio.currentTime > startSeconds + .05 && !audio.paused && !audio.seeking) resolve(); };
              audio.addEventListener('timeupdate', progressed, { signal: controller.signal });
              audio.addEventListener('error', () => reject(new Error(`媒体错误：${resource}`)), { signal: controller.signal }); progressed();
            });
            return audio.duration;
          })(),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`媒体加载超时：${resource}`)), 15000); })
        ]);
        if (!Number.isFinite(duration) || duration <= 1) throw new Error(`音频时长无效：${resource}`);
        results.push({ resource, duration, startSeconds });
      } finally { clearTimeout(timer); controller.abort(); audio.pause(); audio.removeAttribute('src'); audio.load(); }
    }
    return results;
  }, snapshot.teams.flatMap(team => [{ resource: team.anthem, startSeconds: team.anthemStartSeconds }, ...(team.childAnthem ? [{ resource: team.childAnthem, startSeconds: team.childAnthemStartSeconds }] : [])]));
  assert.equal(decoded.length, 20); checks.push('12首正常版从各自歌词进入秒数播放，8首小孩版保持原起点；全部真实解码和时钟推进');
  await mediaContext.close();
  // 模拟四张队徽首次解码失败；复查重试真实本地PNG后都可见，不永久隐藏。
  const recovery = await browser.newContext({ viewport: { width: 1440, height: 900 } }), cover = await recovery.newPage();
  const failed = new Set(), targets = new Set(['10002', '10007', '10008', '10031']);
  await cover.route('**/team-icons/*.png*', async request => {
    const id = new URL(request.request().url()).pathname.match(/(\d+)\.png$/)?.[1];
    if (targets.has(id) && !failed.has(id)) { failed.add(id); await request.fulfill({ status: 200, contentType: 'image/png', body: 'invalid png' }); }
    else await request.continue();
  });
  await cover.goto(url);
  await cover.waitForFunction(() => document.querySelectorAll('#team-grid img').length === 12 && [...document.querySelectorAll('#team-grid img')].every(image => !image.hidden && image.complete && image.naturalWidth > 0));
  assert.equal(failed.size, 4); assert.equal(await cover.locator('#team-grid img[src$="?retry=1"]').count(), 4);
  checks.push('四张封面队徽首次加载失败后各重试一次，12张真实PNG全部显示');
  await recovery.close();
  for (const { width, height } of [{ width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 900 }, { width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1024, height: 600 }, { width: 1920, height: 1080 }, { width: 390, height: 667 }]) {
    const ctx = await context({ viewport: { width, height }, isMobile: width < 600, hasTouch: width < 600, deviceScaleFactor: width < 600 ? 3 : 1 });
    const page = await ctx.newPage(); await openGame(page);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), `vertical overflow ${width}x${height}`);
    const dims = await page.locator('#arena').evaluate(canvas => ({ width: canvas.width, css: canvas.getBoundingClientRect().width, dpr: devicePixelRatio }));
    assert.ok(dims.width >= dims.css * Math.min(dims.dpr, 3) - 1, `DPR ${width}`);
    assert.equal(await page.locator('#arena').evaluate(canvas => getComputedStyle(canvas).touchAction), 'none');
    assert.ok((await page.locator('#restart').boundingBox()).height >= 44);
    for (const selector of ['#change-team', '.side-nav .hub-link']) {
      assert.ok(await page.locator(selector).isVisible());
      assert.ok((await page.locator(selector).boundingBox()).height >= 44);
    }
    assert.equal(await page.locator('#change-team').textContent(), '选择战队');
    assert.equal(await page.locator('.side-nav .hub-link').getAttribute('href'), 'https://kplgame.cn/');
    const scoreBox = await page.locator('.score-panel').boundingBox(), gainBox = await page.locator('.gain-panel').boundingBox(), arenaBox = await page.locator('#arena').boundingBox();
    assert.ok(arenaBox.y >= 0 && arenaBox.y + arenaBox.height <= height, '整个游戏箱在窗口内');
    assert.equal(await page.locator('#final-count, #next-ball').count(), 0);
    if (width >= 760) {
      assert.ok(scoreBox.x + scoreBox.width < arenaBox.x && gainBox.x >= arenaBox.x + arenaBox.width, '总分与加分分别在两侧');
    } else {
      assert.ok(Math.max(scoreBox.y + scoreBox.height, gainBox.y + gainBox.height) < arenaBox.y, '手机记分不遮球体');
    }
    await page.screenshot({ path: path.join(directory, `viewport-${width}-${height}.png`), fullPage: true });
    checks.push(`${width}x${height}: 游戏箱完整可见、记分无重叠、游戏中心/选择战队可见、DPR和44px控件`);
    if (width === 390 && height === 844) {
      await page.locator('#arena').scrollIntoViewIfNeeded();
      const sticky = await page.locator('.scoreboard').boundingBox(), currentArena = await page.locator('#arena').boundingBox();
      assert.ok(sticky.y >= 0 && sticky.y + sticky.height <= height);
      assert.ok(sticky.y + sticky.height < currentArena.y, '计分区不遮住当前preview');
      await page.screenshot({ path: path.join(directory, 'mobile-play.png') });
      checks.push('390px 整局不需滚动，分数与当前preview同时可见');
      if (!built) {
        await page.evaluate(() => window.__KPL_MERGE__.loadScene('chain'));
        await page.waitForFunction(() => window.__KPL_MERGE__.current().physics.state().score === 58);
        assert.deepEqual(await page.locator('#score-feedback .score-gain').allTextContents(), ['+26', '+32']);
        assert.equal(await page.locator('#gain-total').textContent(), '+58');
        const activeGain = await page.locator('.gain-panel').boundingBox(), header = await page.locator('.topbar').boundingBox(), activeArena = await page.locator('#arena').boundingBox();
        assert.ok(activeGain.y >= header.y + header.height && activeGain.y + activeGain.height < activeArena.y, '手机连锁记分不碰标题或游戏箱');
        await page.waitForTimeout(200); await page.screenshot({ path: path.join(directory, 'mobile-chain.png') });
        checks.push('390px 连锁的+26/+32在上方可读，不覆盖球体');
      }
    }
    await ctx.close();
  }
  const desktop = await context({ viewport: { width: 1440, height: 1000 } });
  const page = await desktop.newPage(); await openGame(page);
  const arena = await page.locator('#arena').boundingBox();
  await page.waitForFunction(() => __testAudio.at(-1).currentTime > 1.05 && !__testAudio.at(-1).paused);
  assert.ok(await page.evaluate(() => __testAudio.at(-1).src.endsWith('/team-audio/normal/10031.m4a')));
  assert.ok(await page.evaluate(start => __testAudio.at(-1).currentTime >= start, snapshot.teams.find(team => team.id === '10031').anthemStartSeconds));
  checks.push('首球最低阶LGD，点击开始播放本局L0 LGD正常版战歌，选队封面无自动播放');
  const beforeDrop = await page.evaluate(() => __testAudio.at(-1).currentTime);
  await page.mouse.move(arena.x + arena.width * .8, arena.y + arena.height * .6);
  if (!built) assert.ok(Math.abs((await state(page)).previewX - 320) < 3);
  await page.mouse.click(arena.x + arena.width * .8, arena.y + arena.height * .6);
  await page.waitForFunction(() => __testAudio.at(-1).currentTime > 1.05 && !__testAudio.at(-1).paused);
  assert.ok(await page.evaluate(saved => __testAudio.at(-1).src.endsWith('/team-audio/normal/10031.m4a') && __testAudio.at(-1).currentTime >= saved, beforeDrop));
  assert.equal(await page.locator('#arena').getAttribute('data-team'), '10031');
  checks.push('首球最低阶LGD，投放不中断开局L0音乐');
  if (!built) assert.equal((await state(page)).ballCount, 1);
  await page.waitForFunction(() => __testAudio.at(-1).currentTime > 3.3 && !__testAudio.at(-1).paused);
  const cursor = await page.evaluate(() => __testAudio.at(-1).currentTime);
  await page.waitForTimeout(650);
  await page.mouse.click(arena.x + arena.width * .2, arena.y + arena.height * .6);
  assert.ok(await page.evaluate(saved => __testAudio.at(-1).currentTime >= saved && !__testAudio.at(-1).paused, cursor));
  await page.waitForTimeout(650);
  assert.equal(await page.locator('#score').textContent(), '0');
  assert.ok(await page.evaluate(() => __testAudio.at(-1).src.endsWith('/team-audio/normal/10031.m4a')));
  checks.push('第二球初期只有L0/L1，没有新合成时L0音乐持续播放');
  await page.evaluate(() => { const audio = __testAudio.at(-1); audio.currentTime = audio.duration - .15; });
  await page.waitForFunction(() => __testAudio.at(-1).currentTime < __testAudio.at(-1).duration - 1 && !__testAudio.at(-1).paused);
  await page.waitForFunction(start => __testAudio.at(-1).currentTime >= start && !__testAudio.at(-1).paused, snapshot.teams.find(team => team.id === '10031').anthemStartSeconds);
  checks.push('整曲结束后原生循环，等待下一次合成期间不会断歌');
  await page.locator('#sound').click(); assert.equal(await page.evaluate(() => __testAudio.at(-1).getAttribute('src')), null);
  await page.locator('#sound').click();
  await page.waitForFunction(() => __testAudio.at(-1).getAttribute('src') !== null && !__testAudio.at(-1).paused);
  assert.ok(await page.evaluate(() => __testAudio.at(-1).src.endsWith('/team-audio/normal/10031.m4a')));
  await page.locator('#pause').click(); assert.equal(await page.evaluate(() => __testAudio.at(-1).getAttribute('src')), null);
  await page.locator('#pause').click();
  await page.waitForFunction(() => __testAudio.at(-1).getAttribute('src') !== null && !__testAudio.at(-1).paused);
  checks.push('取消静音和暂停后继续均立即续播当前合成等级战歌，不等待投球');
  assert.equal(await page.locator('#arena').evaluate(canvas => getComputedStyle(canvas).outlineStyle), 'none', '指针投放无蓝色/其他焦点圈');
  assert.equal(await page.locator('#arena').getAttribute('data-input'), 'pointer');
  await page.locator('#restart').click();
  assert.equal(await page.locator('#arena').getAttribute('data-current'), '0', '重开首球仍为最低阶');
  await page.locator('#arena').focus(); await page.keyboard.press('ArrowLeft');
  if (!built) assert.equal((await state(page)).previewX, 188);
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#arena').getAttribute('data-input'), 'keyboard');
  assert.equal(await page.locator('#arena').evaluate(canvas => getComputedStyle(canvas).outlineColor), 'rgb(35, 35, 35)');
  if (!built) assert.equal((await state(page)).ballCount, 1);
  checks.push('鼠标 hover/释放投放、键盘横移/Space 投放、Restart');
  await page.locator('#fullscreen').click(); await page.waitForFunction(() => Boolean(document.fullscreenElement) && document.querySelector('#fullscreen').textContent === '退出全屏');
  assert.equal(await page.locator('#fullscreen').textContent(), '退出全屏');
  await page.locator('#fullscreen').click(); await page.waitForFunction(() => !document.fullscreenElement && document.querySelector('#fullscreen').textContent === '全屏');
  checks.push('全屏按钮进入/退出正常，指针投放无蓝圈、键盘深色焦点保留');

  const mobile = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const phone = await mobile.newPage(); await openGame(phone);
  await phone.locator('#arena').scrollIntoViewIfNeeded();
  const box = await phone.locator('#arena').boundingBox(), scroll = await phone.evaluate(() => scrollY);
  const cdp = await mobile.newCDPSession(phone), startY = box.y + box.height * .4;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 30, y: startY }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width - 20, y: startY - 90 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await phone.evaluate(() => scrollY), scroll);
  if (!built) {
    await page.evaluate(() => window.__KPL_MERGE__.restart(() => .2));
    await page.locator('#arena').focus(); await page.keyboard.press('Space');
    await page.waitForFunction(() => __testAudio.at(-1).currentTime > .05 && !__testAudio.at(-1).paused);
    assert.equal(await page.locator('#arena').getAttribute('data-team'), await page.evaluate(() => window.__KPL_MERGE__.route()[0].id));
    assert.equal(await page.evaluate(() => window.__KPL_MERGE__.audio().inspect().teamId), await page.evaluate(() => window.__KPL_MERGE__.route()[0].id));
    await page.locator('#pause').click(); assert.equal(await page.evaluate(() => __testAudio.at(-1).getAttribute('src')), null);
    checks.push('重新随机路线首球最低阶，开局音乐与首球同为L0，暂停清空媒体源');
    const stats = await state(phone); assert.equal(stats.ballCount, 1);
    const ball = await phone.evaluate(() => [...window.__KPL_MERGE__.current().physics.balls()][0]);
    assert.ok(ball.position.x >= ball.radius && ball.position.x <= 400 - ball.radius);
  }
  checks.push('390px CDP 触控拖动/松手投放；页面 scrollY 不变，球在墙内');
  await mobile.close();

  await page.locator('#change-team').click(); await page.locator('#picker').waitFor();
  assert.equal(await page.evaluate(() => __testRafCount()), 0);
  assert.ok(await page.evaluate(() => __testAudio.every(audio => audio.getAttribute('src') === null)));
  await page.locator('#team-grid [data-team="10031"]').click(); await page.locator('#start').click();
  await page.waitForFunction(() => __testAudio.at(-1).src.endsWith('/team-audio/normal/10020.m4a') && !__testAudio.at(-1).paused);
  assert.ok(await page.evaluate(start => __testAudio.at(-1).currentTime >= start, snapshot.teams.find(team => team.id === '10020').anthemStartSeconds));
  await page.locator('#arena').focus(); await page.keyboard.press('Space');
  assert.equal(await page.locator('#arena').getAttribute('data-team'), '10020');
  checks.push('LGD为本命时，首球最低阶JDG，开局立即播放JDG正常版且从歌词进入点开始');
  await page.locator('#change-team').click(); await page.locator('#picker').waitFor();
  await page.locator('#team-grid [data-team="10005"]').click(); await page.locator('#start').click();
  assert.equal(await page.locator('#favorite-name').textContent(), 'KSG');
  checks.push('明确的选择战队按钮返回首页，释放旧音源和RAF，再选KSG开始新局');

  if (!built) {
    for (const level of [2, 5, 6, 7]) {
      await page.evaluate(level => { window.__KPL_MERGE__.restart(); const p = window.__KPL_MERGE__.current().physics; p.addBall(level - 1, 180, 400); p.addBall(level - 1, 220, 400); }, level);
      await page.waitForFunction(level => { const app = window.__KPL_MERGE__; return app.current().physics.balls().some(ball => ball.level === level) && app.audio().inspect().teamId === app.route()[level].id && app.audio().inspect().playing; }, level);
      const target = await page.evaluate(level => { const team = window.__KPL_MERGE__.route()[level]; return team.anthem; }, level);
      assert.equal(await page.evaluate(() => window.__KPL_MERGE__.audio().inspect().variant), 'normal');
      assert.ok(await page.evaluate(target => __testAudio.at(-1).src.endsWith(`/${target}`) && !__testAudio.at(-1).paused, target));
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => window.__KPL_MERGE__.audio().inspect().teamId), await page.evaluate(level => window.__KPL_MERGE__.route()[level].id, level));
      checks.push(`真实合成L${level}后播放对应等级战歌并保持，音源实际解码播放`);
      if (level === 7) await page.locator('#final-continue').click();
    }
    await page.waitForTimeout(1600);
    await page.evaluate(() => { const p = window.__KPL_MERGE__.current().physics; p.addBall(0, 65, 200); p.addBall(0, 100, 200); });
    await page.waitForFunction(() => { const app = window.__KPL_MERGE__; return app.current().physics.state().score === 5414 && app.audio().inspect().teamId === app.route()[7].id && app.audio().inspect().playing; });
    checks.push('L7之后再次合成L1仍续播L7战歌，战歌等级在本局只升不降');
    for (const id of ['10002', '10003', '10018', '10020', '10031']) {
      await page.locator('#change-team').click(); await page.locator(`#team-grid [data-team="${id}"]`).click(); await page.locator('#start').click();
      await page.evaluate(() => { const p = window.__KPL_MERGE__.current().physics; p.addBall(6, 180, 400); p.addBall(6, 220, 400); });
      await page.waitForFunction(id => { const app = window.__KPL_MERGE__; return app.current().physics.state().score === 5408 && app.audio().inspect().teamId === id && app.audio().inspect().level === 7 && app.audio().inspect().playing; }, id);
      const expected = snapshot.teams.find(team => team.id === id);
      await page.locator('#final-continue').click(); await page.locator('#music-version').click();
      await page.waitForFunction(() => window.__KPL_MERGE__.audio().inspect().playing);
      assert.ok(await page.evaluate(resource => __testAudio.at(-1).src.endsWith(`/${resource}`), expected.childAnthem ?? expected.anthem));
      assert.equal(await page.evaluate(() => window.__KPL_MERGE__.audio().inspect().variant), expected.childAnthem ? 'child' : 'normal');
      assert.ok(!await page.evaluate(() => __testAudio.at(-1).src.includes('default')));
      checks.push(`${expected.shortName}本命L7切换小孩版模式后实际播放${expected.childAnthem ? '小孩版' : '本队正常版回退'}，无默认曲`);
    }
    await page.evaluate(() => window.__KPL_MERGE__.loadScene('triple'));
    await page.waitForFunction(() => window.__KPL_MERGE__.current().physics.state().score === 26);
    assert.equal((await state(page)).ballCount, 2); checks.push('浏览器真实三球碰撞：一次 +26，留下两个球');
    await page.evaluate(() => window.__KPL_MERGE__.loadScene('chain'));
    await page.waitForFunction(() => window.__KPL_MERGE__.current().physics.state().score === 58);
    assert.equal((await state(page)).ballCount, 1); checks.push('浏览器真实连锁：+26/+32=58，留下 L3');
    await page.waitForFunction(() => { const app = window.__KPL_MERGE__; return app.audio().inspect().teamId === app.route()[3].id && app.audio().inspect().playing; });
    checks.push('L1→L2→L3真实连锁后持续播放最后合成的L3战歌');
    assert.deepEqual(await page.locator('#score-feedback .score-gain').allTextContents(), ['+26', '+32']);
    assert.equal(await page.locator('#gain-total').textContent(), '+58');
    assert.equal(await page.locator('#gain-label').textContent(), '连锁得分');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(directory, 'chain.png'), fullPage: true });
    checks.push('连锁右侧大字+58与独立+26/+32，数字弹动，不覆盖小球');
    await page.waitForTimeout(1600);
    assert.equal(await page.locator('#score').textContent(), '58'); assert.equal(await page.locator('#gain-total').textContent(), '+58');
    assert.equal(await page.locator('#gain-label').textContent(), '连锁得分'); assert.deepEqual(await page.locator('#score-feedback .score-gain').allTextContents(), ['+26', '+32']);
    const termsBox = await page.locator('#score-feedback').boundingBox(), totalBox = await page.locator('.gain-summary').boundingBox();
    assert.ok(termsBox.y + termsBox.height <= totalBox.y, '逐次得分在第一行，总分在下一行');
    await page.evaluate(() => { const p = window.__KPL_MERGE__.current().physics; p.addBall(0, 65, 320); p.addBall(0, 100, 320); });
    await page.waitForFunction(() => window.__KPL_MERGE__.current().physics.state().score === 64);
    assert.equal(await page.locator('#gain-total').textContent(), '+6');
    assert.equal(await page.evaluate(() => window.__KPL_MERGE__.audio().inspect().level), 3);
    checks.push('无新合成时逐次+26+32与连锁+58均持续保留，新一轮合成才更新为+6');
    await page.evaluate(() => {
      window.__KPL_MERGE__.restart(); const p = window.__KPL_MERGE__.current().physics;
      [170,190,210,230].forEach(x => p.addBall(1,x,400));
    });
    await page.waitForFunction(() => window.__KPL_MERGE__.current().physics.state().score === 84);
    assert.deepEqual(await page.locator('#score-feedback .score-gain').allTextContents(), ['+26','+26','+32']);
    assert.equal(await page.locator('#gain-total').textContent(), '+84');
    await page.waitForTimeout(1600);
    assert.equal(await page.locator('#score-feedback').textContent(), '+26+26+32');
    assert.equal(await page.evaluate(() => window.__KPL_MERGE__.audio().inspect().level), 3);
    await page.screenshot({ path: path.join(directory, 'double-chain.png'), fullPage: true });
    checks.push('真实四球连锁+26+26+32，第一行持续保留逐项、第二行+84，播放最高输出L3');
    await page.evaluate(() => {
      window.__KPL_MERGE__.restart(); const p = window.__KPL_MERGE__.current().physics;
      p.addBall(4,80,420); p.addBall(4,150,420); p.addBall(0,300,250); p.addBall(0,335,250);
    });
    await page.waitForFunction(() => window.__KPL_MERGE__.current().physics.state().score === 341);
    assert.equal(await page.evaluate(() => window.__KPL_MERGE__.audio().inspect().level), 5);
    assert.deepEqual(await page.locator('#score-feedback .score-gain').allTextContents(), ['+335','+6']);
    checks.push('同tick先合成L5再L1仍播放最高输出L5，得分累计341');
    await page.evaluate(() => {
      window.__KPL_MERGE__.restart(); window.__KPL_MERGE__.current().physics.addBall(2, 200, 470);
    });
    await page.waitForFunction(() => {
      const session = window.__KPL_MERGE__.current(), ball = [...session.physics.balls()][0];
      if (session.inspect().renderer.impacts > 0 && ball.velocity.y < 0) { session.pause(); return true; }
      return false;
    });
    assert.ok(await page.evaluate(() => [...window.__KPL_MERGE__.current().physics.balls()][0].velocity.y < 0));
    await page.screenshot({ path: path.join(directory, 'bounce.png'), fullPage: true });
    checks.push('真实落地后向上回弹，绘制碰撞挤压反馈');
    await page.evaluate(() => {
      window.__KPL_MERGE__.restart(() => .999); const s = window.__KPL_MERGE__.current(); s.pause();
      const p = s.physics; p.addBall(7, 200, 460);
      p.drop(0); for (let i = 0; i < 30; i++) p.step(); p.drop(400); for (let i = 0; i < 30; i++) p.step();
      const shown = p.state(); const ball = p.drop(0);
      window.__lateSpawn = { shown: shown.current, actual: ball.level, x: ball.position.x, radius: ball.radius };
    });
    const lateSpawn = await page.evaluate(() => window.__lateSpawn);
    assert.equal(lateSpawn.shown, 4); assert.equal(lateSpawn.actual, 4); assert.ok(lateSpawn.x >= lateSpawn.radius);
    checks.push('后期队列自然抽到L4：显示/投放一致，墙边大球安全');
    await page.evaluate(() => window.__KPL_MERGE__.loadScene('final'));
    await page.waitForFunction(() => window.__KPL_MERGE__.current().physics.state().finalCount === 2);
    assert.equal((await state(page)).phase, 'playing'); assert.equal((await state(page)).score, 10816);
    assert.equal(await page.locator('#final-choice').isVisible(), true);
    const frozen = (await state(page)).now; await page.waitForTimeout(500);
    assert.equal((await state(page)).now, frozen); assert.equal(await page.evaluate(() => __testRafCount()), 0);
    await page.screenshot({ path: path.join(directory, 'final-choice.png'), fullPage: true });
    await page.locator('#final-continue').click();
    await page.locator('#arena').focus(); await page.keyboard.press('Enter'); assert.equal((await state(page)).ballCount, 3);
    checks.push('本命达成画面立即锁定且0RAF，继续游玩恢复，两颗L7共10816分，未产生L8');
    await page.evaluate(() => window.__KPL_MERGE__.loadScene('final')); await page.locator('#final-choice').waitFor();
    await page.locator('#final-restart').click();
    assert.equal((await state(page)).score, 0); assert.equal((await state(page)).ballCount, 0); assert.equal((await state(page)).current, 0);
    assert.equal(await page.locator('#final-choice').isVisible(), false); checks.push('本命弹窗再来一局清空上一局并恢复最低阶首球');
    await page.evaluate(() => window.__KPL_MERGE__.loadScene('danger'));
    await page.waitForFunction(() => window.__KPL_MERGE__.current().physics.state().phase === 'over');
    assert.equal(await page.evaluate(() => __testRafCount()), 0);
    await page.screenshot({ path: path.join(directory, 'gameover.png'), fullPage: true });
    checks.push('真实动态球长期越线后 Game Over，结束后无 RAF');
    const old = await page.evaluate(() => {
      const stats = [];
      for (let round = 0; round < 30; round++) {
        const prior = window.__KPL_MERGE__.current(); window.__KPL_MERGE__.restart(); stats.push(prior.inspect());
      }
      return { stats, pendingRaf: __testRafCount(), current: window.__KPL_MERGE__.current().inspect(), oldAudio: __testAudio.slice(0, -1).map(audio => audio.getAttribute('src')) };
    });
    for (const prior of old.stats) {
      assert.equal(prior.listeners, 0); assert.equal(prior.rafPending, 0); assert.equal(prior.renderer.effects, 0);
      for (const key of ['worldBodies', 'engineListeners', 'ballCount', 'pairs', 'detectorBodies']) assert.equal(prior.physics[key], 0);
    }
    assert.equal(await page.evaluate(() => window.__KPL_MERGE__.audio().inspect().timers), 0);
    assert.equal(old.pendingRaf, 1); assert.equal(old.current.listeners, 8); assert.equal(old.current.physics.worldBodies, 3);
    assert.ok(old.oldAudio.every(source => source === null));
    await page.locator('#arena').focus(); await page.keyboard.press('Space'); assert.equal((await state(page)).ballCount, 1);
    checks.push('浏览器 Restart 30次：旧 world/listener/RAF/feedback 清零；新局仅1个RAF、投放1球');
    await page.locator('#pause').click(); const paused = (await state(page)).now;
    assert.equal(await page.locator('#arena-message-title').textContent(), '已暂停');
    await page.waitForTimeout(100); assert.equal((await state(page)).now, paused); assert.equal(await page.evaluate(() => __testRafCount()), 0);
    await page.locator('#pause').click(); checks.push('暂停冻结模拟时钟与RAF，继续恢复');
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.locator('#restart').click();
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    assert.equal((await page.evaluate(() => window.__KPL_MERGE__.current().inspect())).renderer.reducedMotion, true);
    await page.evaluate(() => window.__KPL_MERGE__.loadScene('chain'));
    await page.waitForFunction(() => window.__KPL_MERGE__.current().physics.state().score === 58); checks.push('reduced-motion 下继续物理与计分');
    assert.equal(await page.locator('#score').evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.evaluate(() => window.__KPL_MERGE__.destroy());
    assert.equal(await page.evaluate(() => __testRafCount()), 0); assert.equal((await page.evaluate(() => window.__KPL_MERGE__.current().inspect())).physics.worldBodies, 0);
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    checks.push('真实浏览器 destroy 取消剩余 RAF、world 和会话资源');
  } else {
    assert.equal(await page.evaluate(() => typeof window.__KPL_MERGE__), 'undefined');
    assert.equal(await page.locator('#debug-panel').isVisible(), false);
    await page.locator('#restart').click();
    assert.equal(await page.locator('#arena').getAttribute('data-current'), '0');
    await page.mouse.click(arena.x + arena.width * .2, arena.y + arena.height * .6);
    await page.waitForTimeout(650);
    await page.mouse.click(arena.x + arena.width * .8, arena.y + arena.height * .6);
    await page.waitForTimeout(650);
    await page.mouse.click(arena.x + arena.width * .8, arena.y + arena.height * .6);
    await page.waitForFunction(() => document.querySelector('#score').textContent === '6');
    checks.push('构建产物中无调试入口；首球最低阶，后两颗自然L0实际合成 +6；资源无404');
    await page.waitForTimeout(1600);
    assert.equal(await page.locator('#score').textContent(), '6'); assert.equal(await page.locator('#gain-total').textContent(), '+6');
    checks.push('实际构建中没有新合成时，总分与上次合成+6持续保留');
    await page.locator('#change-team').click(); await page.locator('#picker').waitFor();
    assert.ok(await page.evaluate(() => __testAudio.every(audio => audio.getAttribute('src') === null)));
    await page.locator('#team-grid [data-team="10005"]').click(); await page.locator('#start').click();
    assert.equal(await page.locator('#favorite-name').textContent(), 'KSG');
    assert.equal(await page.locator('#arena').getAttribute('data-current'), '0', '换本命后首球仍为最低阶');
    await page.reload(); assert.equal(await page.locator('#picker').isVisible(), true); checks.push('独立构建可更换本命，清理旧音源，刷新返回选队');
  }
  await desktop.close(); assert.deepEqual(errors, []);
  await fs.writeFile(path.join(directory, 'results.json'), JSON.stringify({ stage: 'lowest LGD/JDG + delayed L2 + persistent terms + highest chain anthem + lyrics entry + final dialog', built, url, browser: browser.version(), decodedAudio: decoded, checks, errors, physicalDevice: false }, null, 2) + '\n');
  console.log(JSON.stringify({ built, checks: checks.length, errors, directory }));
} finally { await browser.close(); }
