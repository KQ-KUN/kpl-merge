import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSeason, candidateIds, identity, inspectPng } from '../scripts/audit-teams.mjs';

const format = ids => ({ regular_format: { type: 'kpl_3round' }, teams_by_group: { S: ids }, rounds: [{ type: 'round_robin', matches: [{ a_id: ids[0], b_id: ids[1], status: 4 }] }] });
const seasons = [{ season_id: 'KPL2026S1', start_time: '2026-01-14' }, { season_id: 'KPL2026S2', start_time: '2026-06-17' }, { season_id: 'KPL2027S1', start_time: '2027-01-01' }, { season_id: 'KCC2026', start_time: '2026-08-01' }];
const formats = Object.fromEntries(seasons.map(season => [season.season_id, format(['1', '2'])]));

test('按日期选择最新已开始的常规联赛，排除杯赛和未来赛季', () => {
  assert.equal(selectSeason([...seasons].reverse(), formats, '2026-10-06').season_id, 'KPL2026S2');
  assert.equal(selectSeason(seasons, formats, '2026-05-01').season_id, 'KPL2026S1');
});
test('只有未来赛季或没有已赛常规赛时拒绝猜测', () => {
  assert.throws(() => selectSeason(seasons, {}, '2026-10-06'));
  assert.throws(() => selectSeason(seasons, formats, '2020-01-01'));
  assert.throws(() => selectSeason(seasons, formats, 'invalid'));
  assert.throws(() => selectSeason(seasons, formats, '2026-02-31'));
});
test('开始日期相同的最新赛季歧义不能静默选一条', () => {
  assert.throws(() => selectSeason([...seasons, { season_id: 'KPL2026S3', start_time: '2026-06-17' }], { ...formats, KPL2026S3: format(['1', '2']) }, '2026-10-06'), /歧义/);
});
test('队伍必须同时在分组和已赛常规赛中，去重并排除历史/未参赛项', () => {
  const f = format(['1', '2', '3', '1']);
  f.teams_by_group.A = ['2', '4'];
  f.rounds.push({ type: 'playoff', matches: [{ a_id: '4', b_id: '5', status: 4 }] });
  f.rounds[0].matches.push({ a_id: '3', b_id: '4', status: 0 });
  assert.deepEqual(candidateIds(f), ['1', '2']);
});
test('身份与简称保持 canonical 值，没有简称时只回退当前名称', () => {
  const franchise = { franchise_id: '001', current_names: ['名称'], abbreviations: ['简称'], seasons: ['KPL2026S2'] };
  assert.deepEqual(identity([franchise], '001', 'KPL2026S2'), { id: '001', name: '名称', shortName: '简称', icon: '/team-icons/001.png' });
  assert.equal(identity([{ ...franchise, abbreviations: [] }], '001', 'KPL2026S2').shortName, '名称');
});
test('未知/重复 ID、名称歧义、赛季关联缺失都拒绝', () => {
  const f = { franchise_id: '1', current_names: ['名称'], seasons: ['KPL2026S2'] };
  for (const rows of [[], [f, f], [{ ...f, current_names: [] }], [{ ...f, current_names: ['甲', '乙'] }], [{ ...f, seasons: [] }]]) assert.throws(() => identity(rows, '1', 'KPL2026S2'));
});
test('PNG 校验接受有效数据，拒绝非图片、损坏 CRC 和截断', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==', 'base64');
  // 独立生成的 1px RGBA 标准 PNG，测试不依赖 kpl2k。
  const metadata = inspectPng(png);
  assert.equal(metadata.width, 1); assert.equal(metadata.height, 1);
  assert.equal(metadata.bytes, png.length); assert.match(metadata.sha256, /^[a-f0-9]{64}$/);
  const corrupt = Buffer.from(png); corrupt[40] ^= 1;
  assert.throws(() => inspectPng(Buffer.from('not png')));
  assert.throws(() => inspectPng(corrupt));
  assert.throws(() => inspectPng(png.subarray(0, 25)));
});
test('年总选最新已开始的annual赛季，12队来自擂台赛而非八队淘汰赛', () => {
  const ids = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const annual = { regular_format: { type: 'annual', masters: 6, elite: 6 }, teams_by_group: { S: ids.slice(0, 6), A: [...ids.slice(6), ids[0]] }, rounds: [
    { type: 'other', matches: ids.map((id, i) => ({ a_id: id, b_id: ids[(i + 1) % 12], status: 4 })) },
    { type: 'playoffs', matches: [{ a_id: '1', b_id: '2', status: 4 }] }
  ] };
  const annualSeasons = [...seasons, { season_id: 'KPL2025S3', start_time: '2025-09-28' }, { season_id: 'KPL2026S3', start_time: '2026-10-10' }];
  const all = { ...formats, KPL2025S3: annual, KPL2026S3: annual };
  assert.equal(selectSeason(annualSeasons, all, '2026-10-07', 'annual').season_id, 'KPL2025S3');
  assert.deepEqual(candidateIds(annual, 'annual'), [...ids].sort());
  assert.throws(() => candidateIds({ ...annual, rounds: annual.rounds.slice(1) }, 'annual'));
  assert.throws(() => candidateIds({ ...annual, regular_format: { type: 'annual', masters: 8, elite: 4 } }, 'annual'));
  assert.throws(() => selectSeason(annualSeasons, all, '2026-10-07', 'unknown'));
});
