import test from 'node:test';
import assert from 'node:assert/strict';
import { readRecords, recordScore } from '../src/game/records.js';

test('最高分和第一次本命达成在重开与刷新后保留', () => {
  const saved = new Map();
  const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  const empty = readRecords(storage);
  recordScore(storage, empty, 5408, '10027');
  recordScore(storage, empty, 5414, '10028');
  recordScore(storage, empty, 26);
  assert.deepEqual(readRecords(storage), { bestScore: 5414, firstFavorite: { teamId: '10027', score: 5408 } });
});

test('存储不可用时保留当前访问的成绩', () => {
  const first = recordScore(undefined, readRecords(undefined), 5408, '10027');
  assert.deepEqual(recordScore(undefined, first, 5414, '10028'), {
    bestScore: 5414, firstFavorite: { teamId: '10027', score: 5408 },
  });
});
