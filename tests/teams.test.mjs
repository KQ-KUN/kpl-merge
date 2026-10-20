import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createProgression } from '../src/game/progression.js';
import { validateTeams, assetUrl, loadRouteImages } from '../src/data/team-data.js';

const snapshot = JSON.parse(await fs.readFile(new URL('../src/data/teams.json', import.meta.url)));
const teams = validateTeams(snapshot);
test('2026年总12队快照、12首正常版/8首小孩版哈希一致，不含默认曲', async () => {
  const provenance = JSON.parse(await fs.readFile(new URL('../docs/data-provenance.json', import.meta.url)));
  assert.equal(teams.length, 12); assert.equal(snapshot.seasonId, 'KPL2026S3'); assert.equal(snapshot.pool, 'annual');
  assert.equal(teams.filter(team => team.anthemDedicated).length, 12); assert.equal(teams.filter(team => team.childAnthem).length, 8);
  assert.deepEqual(teams.filter(team => !team.childAnthem).map(team => team.id), ['10003','10018','10020','10031']);
  assert.deepEqual(teams.map(team => team.id), ['10001','10002','10003','10005','10007','10008','10017','10018','10020','10027','10028','10031']);
  assert.equal((await fs.readdir(new URL('../public/team-icons/', import.meta.url))).length, 12);
  assert.deepEqual((await fs.readdir(new URL('../public/team-audio/', import.meta.url))).sort(), ['child', 'normal']);
  assert.equal((await fs.readdir(new URL('../public/team-audio/normal/', import.meta.url))).length, 12);
  assert.equal((await fs.readdir(new URL('../public/team-audio/child/', import.meta.url))).length, 8);
  const hash = buffer => createHash('sha256').update(buffer).digest('hex');
  for (const team of teams) {
    const bytes = await fs.readFile(new URL(`../public/${team.icon}`, import.meta.url));
    assert.equal(hash(bytes), provenance.teams.find(item => item.id === team.id).asset.sha256);
  }
  assert.equal(Object.keys(provenance.audio.files).length, 20); assert.equal(provenance.audio.defaultTrack, null);
  for (const [name, asset] of Object.entries(provenance.audio.files)) {
    assert.equal(hash(await fs.readFile(new URL(`../public/team-audio/${name}`, import.meta.url))), asset.sha256);
    assert.ok(asset.media.durationSeconds > 0); assert.ok(!name.includes('default'));
  }
});
test('本命固定L7，七队互异、源池不变、路线和Team冻结，RNG可复现', () => {
  const a = createProgression(teams, '10001', () => .1), b = createProgression(teams, '10001', () => .1);
  assert.deepEqual(a, b); assert.equal(a[7].id, '10001'); assert.equal(new Set(a.map(team => team.id)).size, 8);
  assert.ok(Object.isFrozen(a) && a.every(Object.isFrozen)); assert.equal(teams[0].id, '10001');
  assert.throws(() => { a[0].id = 'new'; }, TypeError);
  assert.equal(createProgression(teams, '10001', () => 0)[0].id, '10031');
  assert.equal(createProgression(teams, '10001', () => .999999)[0].id, '10020');
});
test('12首正常版歌词起点与本曲哈希/时长匹配，小孩版保持原起点', async () => {
  const cues = JSON.parse(await fs.readFile(new URL('../docs/AUDIO_CUES_CURRENT.json', import.meta.url)));
  const provenance = JSON.parse(await fs.readFile(new URL('../docs/data-provenance.json', import.meta.url)));
  assert.equal(cues.cues.length, 12);
  for (const team of teams) {
    const cue = cues.cues.find(row => row.id === team.id), asset = provenance.audio.files[team.anthem.slice('team-audio/'.length)];
    assert.equal(team.anthemStartSeconds, cue.startSeconds); assert.equal(cue.sha256, asset.sha256);
    assert.ok(team.anthemStartSeconds >= 0 && team.anthemStartSeconds < asset.media.durationSeconds);
    assert.equal(team.childAnthemStartSeconds, team.childAnthem ? 1 : null);
  }
  for (const value of [-1, Infinity, '5', NaN]) assert.throws(() => validateTeams({ ...snapshot, teams: [{ ...teams[0], anthemStartSeconds: value }, ...teams.slice(1)] }));
});
test('默认LGD/JDG随机最低阶，本命冲突时选另一队且八队互异', () => {
  for (const favorite of teams) for (const rng of [() => 0, () => .999]) {
    const route = createProgression(teams, favorite.id, rng);
    assert.ok(['10031', '10020'].includes(route[0].id));
    assert.notEqual(route[0].id, favorite.id); assert.equal(route[7].id, favorite.id);
    assert.equal(new Set(route.map(team => team.id)).size, 8);
  }
});
test('八队池穷举7!条等概率选择路径，所有七队排列恰好一次', () => {
  const pool = teams.slice(0, 8), outcomes = new Set();
  function enumerate(values, remaining) {
    if (!remaining) { let i = 0; const result = createProgression(pool, pool[0].id, () => values[i++]); outcomes.add(result.slice(0, 7).map(team => team.id).join(',')); return; }
    for (let j = 0; j < remaining; j++) enumerate([...values, (j + .5) / remaining], remaining - 1);
  }
  enumerate([], 7); assert.equal(outcomes.size, 5040);
});
test('未知本命、重复ID、不足8队、非法RNG与非法资源路径均拒绝', () => {
  assert.throws(() => createProgression(teams, 'missing'));
  assert.throws(() => createProgression(teams.slice(0, 7), teams[0].id));
  assert.throws(() => createProgression([...teams, teams[0]], teams[0].id));
  for (const value of [-1, 1, NaN, Infinity]) assert.throws(() => createProgression(teams, teams[0].id, () => value));
  for (const override of [{ icon: '../secret.png' }, { anthem: 'https://remote/song.m4a' }, { anthem: 'team-audio/default.m4a' }, { childAnthem: 'team-audio/child/10002.m4a' }, { childAnthem: null }, { id: 'x' }, { name: '' }]) assert.throws(() => validateTeams({ ...snapshot, teams: [{ ...teams[0], ...override }, ...teams.slice(1)] }));
  assert.throws(() => validateTeams({ ...snapshot, schemaVersion: 1 }));
});
test('子路径资源URL与预加载只限本局八队，未联网依赖2K', () => {
  const route = createProgression(teams, '10001', () => .5), images = loadRouteImages(route, '/nested/merge/', () => ({}));
  assert.equal(images.length, 8); assert.equal(images[7].src, '/nested/merge/team-icons/10001.png');
  assert.equal(assetUrl(route[0].anthem, './'), `./${route[0].anthem}`);
});
