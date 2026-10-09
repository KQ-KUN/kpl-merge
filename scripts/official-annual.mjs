import { createHash } from 'node:crypto';

// 官方年总名单补充游戏快照；只按唯一canonical当前名称映射，不修改2K主数据。
export function officialAnnualSelection(official, canonicalTeams, asOf) {
  if (official?.schemaVersion !== 1 || official.meta?.result !== 0 || official.schedule?.result !== 0) throw new Error('官方年总快照格式无效');
  const { league, season } = official;
  if (season?.seasonid !== 'KPL2026S3' || season.season_year !== 2026 || league?.cc_league_id !== season.seasonid || league.year !== 2026 || !/年度总决赛/.test(league.league_name) || league.start_time.slice(0, 10) > asOf) throw new Error('需要已开始的2026年总，不回退其他年份');
  const groups = { S: new Set(), A: new Set() }, participating = new Map();
  const matches = official.schedule.data?.list;
  if (!Array.isArray(matches)) throw new Error('官方赛程缺失');
  for (const match of matches.filter(match => match.stageid === 'lts')) {
    if (match.seasonid !== season.seasonid) throw new Error('擂台赛混入其他年份');
    for (const side of ['a', 'b']) {
      const id = match[`team_${side}_id`], name = match[`team_${side}_name`], group = match[`team_${side}_group`];
      if (!groups[group] || typeof id !== 'string' || !id.startsWith(`${season.seasonid}_`) || !name || name === '待定' || participating.has(id) && participating.get(id) !== name) throw new Error('官方参赛队或分组歧义');
      groups[group].add(id); participating.set(id, name);
    }
  }
  if (groups.S.size !== 6 || groups.A.size !== 6 || participating.size !== 12 || [...groups.S].some(id => groups.A.has(id))) throw new Error('2026年总必须大师/精英各6队，共12队');
  if (!matches.some(match => match.stageid === 'lts' && match.schedule_status === 4)) throw new Error('官方年总尚无已赛证据');
  const teams = [], mappings = [];
  for (const [officialId, name] of participating) {
    const officialTeams = official.meta.data?.teams?.filter(team => team.teamid === officialId && team.team_name === name) ?? [];
    const canonical = canonicalTeams.filter(team => team.name === name);
    if (officialTeams.length !== 1 || canonical.length !== 1) throw new Error(`${name}: 官方身份或canonical映射缺失/歧义`);
    teams.push(canonical[0]); mappings.push({ officialId, officialName: name, canonicalId: canonical[0].id });
  }
  if (new Set(teams.map(team => team.id)).size !== 12) throw new Error('canonical ID重复');
  return { teams: teams.sort((a, b) => a.id.localeCompare(b.id)), mappings,
    selection: { pool: 'annual', rule: 'explicit KPL2026S3 official opening-stage roster; 6 masters + 6 elite; exactly 12 unique canonical-name matches with local icons', seasonId: season.seasonid, seasonName: league.league_name, seasonStart: league.start_time.slice(0, 10), candidateCount: 12, eligibleCount: 12 } };
}
export const sourceHash = buffer => createHash('sha256').update(buffer).digest('hex');
