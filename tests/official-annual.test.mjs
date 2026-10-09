import fs from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { officialAnnualSelection, sourceHash } from '../scripts/official-annual.mjs';
const official = JSON.parse(await fs.readFile(new URL('../docs/annual-2026-source.json', import.meta.url)));
const data = JSON.parse(await fs.readFile(new URL('../docs/data-provenance.json', import.meta.url)));
test('官方2026年总13个meta项去掉待定，仅用擂台赛12队，映射canonical不改ID', () => {
  assert.equal(official.meta.data.teams.length, 13);
  const result = officialAnnualSelection(official, data.teams, '2026-10-07');
  assert.equal(result.teams.length, 12); assert.equal(result.selection.seasonId, 'KPL2026S3');
  assert.ok(result.teams.some(team => team.id === '10007') && result.teams.some(team => team.id === '10008'));
  assert.ok(!result.teams.some(team => team.id === '10016' || team.id === '10903'));
});
test('官方年总快照哈希一致，拒绝2025、缺队、未知名称和重复canonical映射', async () => {
  assert.equal(sourceHash(await fs.readFile(new URL('../docs/annual-2026-source.json', import.meta.url))), data.officialAnnual.sha256);
  const old = structuredClone(official); old.season.seasonid = 'KPL2025S3'; assert.throws(() => officialAnnualSelection(old, data.teams, '2026-10-07'));
  assert.throws(() => officialAnnualSelection(official, data.teams.slice(1), '2026-10-07'));
  assert.throws(() => officialAnnualSelection(official, [...data.teams, data.teams[0]], '2026-10-07'));
  const short = structuredClone(official); short.schedule.data.list = short.schedule.data.list.slice(0, 1); assert.throws(() => officialAnnualSelection(short, data.teams, '2026-10-07'));
});
