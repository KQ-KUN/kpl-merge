import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createAnthemPlayer, anthemForLevel } from '../src/game/anthem.js';
import { AUDIO, OPENING_LEVEL } from '../src/game/config.js';
import { createProgression } from '../src/game/progression.js';
class Media extends EventTarget {
  src = ''; currentTime = 0; duration = 60; plays = []; pauses = 0; loads = 0;
  play() { return new Promise((resolve, reject) => this.plays.push({ source: this.src, start: this.currentTime, resolve, reject })); }
  pause() { this.pauses++; }
  load() { this.loads++; }
  removeAttribute() { this.src = ''; }
  getAttribute() { return this.src || null; }
}
const a = { id: '10001', anthem: 'team-audio/normal/10001.m4a', childAnthem: 'team-audio/child/10001.m4a' }, b = { id: '10003', anthem: 'team-audio/normal/10003.m4a', childAnthem: null };
test('开局音乐与最低阶首球均为L0，LGD/JDG及本命冲突路线播放本队正常版', async () => {
  const { teams } = JSON.parse(await fs.readFile(new URL('../src/data/teams.json', import.meta.url)));
  assert.equal(AUDIO.initialLevel, 0); assert.equal(AUDIO.initialLevel, OPENING_LEVEL);
  for (const favorite of ['10001','10020','10031']) for (const value of [0, .999]) {
    const route = createProgression(teams, favorite, () => value), audio = new Media();
    const player = createAnthemPlayer({ audioFactory: () => audio }); player.play(route[AUDIO.initialLevel]);
    assert.ok(['10020','10031'].includes(player.inspect().teamId));
    assert.equal(player.inspect().teamId, route[0].id); assert.notEqual(player.inspect().teamId, favorite);
    assert.equal(player.inspect().level, 0); assert.equal(player.inspect().variant, 'normal');
    assert.equal(audio.src, `./${route[0].anthem}`); assert.equal(audio.currentTime, route[0].anthemStartSeconds);
    player.destroy();
  }
});
test('12队L0-L6全部使用正常版，仅L7使用本队小孩版，缺少时使用正常版', async () => {
  const { teams } = JSON.parse(await fs.readFile(new URL('../src/data/teams.json', import.meta.url)));
  for (const team of teams) {
    for (let level = 0; level < 7; level++) assert.equal(anthemForLevel(team, level), team.anthem);
    const final = anthemForLevel(team, 7); assert.equal(final, team.childAnthem ?? team.anthem); assert.ok(!final.includes('default'));
  }
  for (const level of [-1, 8, NaN]) assert.throws(() => anthemForLevel(teams[0], level));
});
test('按开局/合成指令切换单个音源，实例不自行播放、旧play失败不覆盖新歌', async () => {
  const audio = new Media(), statuses = [], player = createAnthemPlayer({ audioFactory: () => audio, base: '/merge/', onStatus: status => statuses.push(status) });
  assert.equal(audio.plays.length, 0); player.play(a); player.play(b);
  assert.deepEqual(audio.plays.map(play => play.source), ['/merge/team-audio/normal/10001.m4a', '/merge/team-audio/normal/10003.m4a']);
  audio.plays[1].resolve(); await Promise.resolve(); audio.plays[0].reject(); await Promise.resolve();
  assert.deepEqual(statuses, ['playing']); assert.equal(player.inspect().teamId, b.id); assert.equal(player.inspect().playing, true);
  player.destroy();
});
test('静音/暂停/销毁清空媒体源，旧异步play不能恢复，重复destroy安全', async () => {
  const audio = new Media(), player = createAnthemPlayer({ audioFactory: () => audio });
  player.play(a); player.setMuted(true); audio.plays[0].resolve(); await Promise.resolve();
  assert.equal(player.inspect().playing, false); assert.equal(audio.src, ''); player.play(b); assert.equal(audio.plays.length, 1);
  player.setMuted(false); player.play(b); player.stop(); assert.equal(player.inspect().teamId, null);
  player.destroy(); player.destroy(); audio.plays[1].resolve(); await Promise.resolve(); player.play(a);
  assert.equal(audio.plays.length, 2); assert.equal(player.inspect().listeners, 0); assert.equal(player.inspect().timers, 0); assert.equal(audio.src, '');
});
test('播放受阻/媒体错误安全降级，不产生未处理Promise或销毁后的回调', async () => {
  const audio = new Media(), statuses = [], player = createAnthemPlayer({ audioFactory: () => audio, onStatus: status => statuses.push(status) });
  player.play(a); audio.plays[0].reject(new Error('NotAllowedError')); await Promise.resolve(); assert.deepEqual(statuses, ['error']);
  player.play(a); audio.dispatchEvent(new Event('error')); assert.equal(statuses.length, 2);
  player.destroy(); audio.dispatchEvent(new Event('error')); assert.equal(statuses.length, 2);
});
function harness() {
  const audio = new Media(), positions = new Map(), player = createAnthemPlayer({ audioFactory: () => audio, positions });
  const play = async team => { player.play(team); audio.plays.at(-1).resolve(); await Promise.resolve(); };
  return { audio, player, positions, play };
}
test('没有下一次合成时持续播放，超过原2秒边界也不截断、不创建计时器', async () => {
  const h = harness(); await h.play(a);
  for (const time of [3, 5, 17.4]) {
    h.audio.currentTime = time; h.audio.dispatchEvent(new Event('timeupdate'));
    assert.equal(h.player.inspect().playing, true); assert.equal(h.audio.src, './team-audio/normal/10001.m4a');
    assert.equal(h.audio.currentTime, time); assert.equal(h.player.inspect().timers, 0);
  }
  h.player.destroy(); assert.equal(h.positions.get(a.anthem), 17.4);
});
test('快速切队保存实际播放进度，各队正常版游标独立', async () => {
  const h = harness(); await h.play(a); h.audio.currentTime = 12.6; await h.play(b);
  assert.equal(h.audio.currentTime, 1); h.audio.currentTime = 8.1; await h.play(a);
  assert.equal(h.audio.currentTime, 12.6); assert.equal(h.positions.get(b.anthem), 8.1);
  await h.play(b); assert.equal(h.audio.currentTime, 8.1);
  h.player.destroy();
});
test('同队正常版连续合成保持音源进度，无小孩版的L7也不重载同一正常版', async () => {
  const h = harness(); await h.play(b); h.audio.currentTime = 9.4;
  const before = { plays: h.audio.plays.length, pauses: h.audio.pauses, loads: h.audio.loads };
  h.player.play(b); h.player.play(b, 7);
  assert.equal(h.audio.currentTime, 9.4); assert.equal(h.player.inspect().teamId, '10003');
  assert.equal(h.player.inspect().variant, 'normal'); assert.equal(h.player.inspect().level, 7);
  assert.deepEqual({ plays: h.audio.plays.length, pauses: h.audio.pauses, loads: h.audio.loads }, before);
  h.player.destroy();
});
test('本命小孩版与正常版分别保存进度，离开L7切回正常版，再合成本命续播小孩版', async () => {
  const h = harness(); await h.play(a); h.audio.currentTime = 12.6;
  h.player.play(a, 7); h.audio.plays.at(-1).resolve(); await Promise.resolve();
  assert.equal(h.audio.src, './team-audio/child/10001.m4a'); assert.equal(h.player.inspect().variant, 'child'); assert.equal(h.audio.currentTime, 1);
  h.audio.currentTime = 4.5; await h.play(a); assert.equal(h.audio.currentTime, 12.6);
  h.player.play(a, 7); h.audio.plays.at(-1).resolve(); await Promise.resolve(); assert.equal(h.audio.currentTime, 4.5);
  h.player.destroy(); assert.equal(h.positions.get(a.anthem), 12.6); assert.equal(h.positions.get(a.childAnthem), 4.5);
});
test('暂停保存真实游标、恢复时续播；destroy释放媒体与监听', async () => {
  const h = harness(); await h.play(a); h.audio.currentTime = 16.8; h.player.stop();
  assert.equal(h.audio.src, ''); assert.equal(h.positions.get(a.anthem), 16.8);
  await h.play(b); h.player.stop(); await h.play(a); assert.equal(h.audio.currentTime, 16.8);
  h.player.destroy(); h.audio.dispatchEvent(new Event('loadedmetadata'));
  assert.equal(h.player.inspect().timers, 0); assert.equal(h.player.inspect().listeners, 0); assert.equal(h.audio.src, '');
});
test('整曲通过媒体loop持续播放，保存的越界游标在元数据到达后归位', async () => {
  const h = harness(); assert.equal(h.audio.loop, true);
  h.player.stop(); h.positions.set(a.anthem, 9); h.audio.duration = NaN; h.player.play(a); h.audio.duration = 4; h.audio.dispatchEvent(new Event('loadedmetadata'));
  assert.equal(h.audio.currentTime, 1); h.audio.plays.at(-1).resolve(); await Promise.resolve(); h.player.destroy();
});
test('新媒体实例可接着同一访问期间的歌曲进度，重开不重复开头', async () => {
  const positions = new Map(), first = new Media(), p = createAnthemPlayer({ audioFactory: () => first, positions });
  p.play(a); first.currentTime = 2.4; p.destroy();
  const next = new Media(), q = createAnthemPlayer({ audioFactory: () => next, positions }); q.play(a); assert.equal(next.currentTime, 2.4); q.destroy();
});
test('每队从自己的歌词起点进入，续播和同曲合成保持进度，循环不重播前奏', async () => {
  const audio = new Media(), positions = new Map(); audio.paused = false;
  const team = { ...a, anthemStartSeconds: 15.4, childAnthemStartSeconds: 4.8 };
  const player = createAnthemPlayer({ audioFactory: () => audio, positions });
  player.play(team, 1); assert.equal(audio.currentTime, 15.4);
  audio.plays.at(-1).resolve(); await Promise.resolve();
  audio.currentTime = .2; audio.dispatchEvent(new Event('timeupdate')); assert.equal(audio.currentTime, 15.4);
  audio.currentTime = 22; player.play(team, 2); assert.equal(audio.currentTime, 22);
  player.stop(); player.play(team, 1); assert.equal(audio.currentTime, 22);
  player.play(team, 7); assert.equal(audio.currentTime, 4.8);
  assert.equal(player.inspect().listeners, 3); player.destroy(); assert.equal(player.inspect().listeners, 0);
});
