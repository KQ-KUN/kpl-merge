import { LOWEST_TEAM_IDS } from './config.js';

export function createProgression(teams, selectedId, rng = Math.random) {
  if (!Array.isArray(teams) || teams.length < 8 || teams.some(team => !team || typeof team.id !== 'string') || new Set(teams.map(team => team.id)).size !== teams.length) throw new Error('需要至少8支不重复的有效队伍');
  const favorite = teams.find(team => team.id === selectedId);
  if (!favorite) throw new Error('本命队伍不在合格池');
  const lowestPool = LOWEST_TEAM_IDS.map(id => teams.find(team => team.id === id && id !== selectedId)).filter(Boolean);
  const randomIndex = length => {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('RNG必须返回[0,1)');
    return Math.floor(value * length);
  };
  const lowest = lowestPool.length ? lowestPool[randomIndex(lowestPool.length)] : null;
  const pool = teams.filter(team => team.id !== selectedId && team.id !== lowest?.id);
  const slots = lowest ? [1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5, 6];
  const route = Array(8); route[7] = favorite;
  if (lowest) route[0] = lowest;
  // 部分 Fisher-Yates：抽样和次序同时无偏，不改源池。
  for (let i = 0; i < slots.length; i++) {
    const j = i + randomIndex(pool.length - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
    route[slots[i]] = pool[i];
  }
  return Object.freeze(route.map(team => Object.freeze({ ...team })));
}
