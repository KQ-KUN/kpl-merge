import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const validId = id => typeof id === 'string' && /^\d+$/.test(id);

// 默认选有常规赛证据的联赛；显式annual选年度总决赛，不把未来赛程当已开始赛季。
export function selectSeason(seasons, formats, asOf, pool = 'regular') {
  if (!['regular', 'annual'].includes(pool)) throw new Error('未知队伍池');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(Date.parse(asOf)) || new Date(asOf).toISOString().slice(0, 10) !== asOf) throw new Error('无效 as-of 日期');
  const candidates = seasons.filter(season => {
    const format = formats[season.season_id];
    return /^KPL\d{4}S\d+$/.test(season.season_id) && typeof season.start_time === 'string'
      && season.start_time <= asOf && format?.regular_format
      && (pool === 'annual' ? format.regular_format.type === 'annual' : true)
      && format.rounds?.some(round => round.type === (pool === 'annual' ? 'other' : 'round_robin') && round.matches?.some(match => match.status === 4));
  }).sort((a, b) => b.start_time.localeCompare(a.start_time) || a.season_id.localeCompare(b.season_id));
  if (!candidates.length) throw new Error(`没有可确定的 KPL ${pool === 'annual' ? '年度总决赛' : '常规赛'}赛季`);
  if (candidates[1]?.start_time === candidates[0].start_time) throw new Error('最新赛季日期歧义，需核查 canonical');
  return candidates[0];
}

export function candidateIds(format, pool = 'regular') {
  if (!['regular', 'annual'].includes(pool)) throw new Error('未知队伍池');
  const groups = new Set(Object.values(format.teams_by_group ?? {}).flat());
  // 年总取擂台赛（首个other阶段），不能把八队淘汰赛当全部参赛队。
  const rounds = pool === 'annual' ? [format.rounds.find(round => round.type === 'other')].filter(Boolean) : format.rounds.filter(round => round.type === 'round_robin');
  const played = new Set(rounds
    .flatMap(round => round.matches.filter(match => match.status === 4).flatMap(match => [match.a_id, match.b_id])));
  const ids = [...groups].filter(id => validId(id) && played.has(id)).sort();
  if (pool === 'annual' && (format.regular_format?.type !== 'annual' || format.regular_format.masters !== 6 || format.regular_format.elite !== 6 || ids.length !== 12)) throw new Error('年总必须有大师/精英各6队及完整12队擂台赛证据');
  return ids;
}

export function identity(franchises, id, seasonId) {
  const matches = franchises.filter(team => team.franchise_id === id);
  if (matches.length !== 1) throw new Error(`${id}: franchise_id 缺失或重复`);
  const team = matches[0];
  if (!Array.isArray(team.current_names) || team.current_names.length !== 1 || !team.current_names[0]?.trim()) throw new Error(`${id}: 当前名称缺失或歧义`);
  if (!team.seasons?.includes(seasonId)) throw new Error(`${id}: franchise 赛季关联缺失`);
  const shortName = team.abbreviations?.find(value => typeof value === 'string' && value.trim()) ?? team.current_names[0];
  return { id, name: team.current_names[0], shortName, icon: `/team-icons/${id}.png` };
}

// 校验所有 PNG chunk 的 CRC 和压缩数据；这不是视觉验收。
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function inspectPng(buffer) {
  if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('队徽不是 PNG');
  let offset = 8, width = 0, height = 0, ended = false;
  const chunks = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset), end = offset + 12 + length;
    if (end > buffer.length) throw new Error('PNG 截断');
    const kind = buffer.toString('ascii', offset + 4, offset + 8);
    if (crc32(buffer.subarray(offset + 4, end - 4)) !== buffer.readUInt32BE(end - 4)) throw new Error('PNG CRC 错误');
    if (offset === 8 && kind !== 'IHDR') throw new Error('PNG 首块不是 IHDR');
    if (kind === 'IHDR') {
      if (length !== 13 || width) throw new Error('PNG IHDR 非法');
      width = buffer.readUInt32BE(offset + 8); height = buffer.readUInt32BE(offset + 12);
      if (!width || !height || width > 4096 || height > 4096) throw new Error('队徽尺寸非法');
    }
    if (kind === 'IDAT') chunks.push(buffer.subarray(offset + 8, end - 4));
    offset = end;
    if (kind === 'IEND') { if (length !== 0) throw new Error('PNG IEND 非法'); ended = true; break; }
  }
  if (!ended || !width || !chunks.length || offset !== buffer.length) throw new Error('PNG 不完整');
  const inflated = inflateSync(Buffer.concat(chunks), { maxOutputLength: 64 * 1024 * 1024 });
  if (!inflated.length) throw new Error('PNG 没有图像数据');
  return { width, height, bytes: buffer.length, sha256: hash(buffer) };
}

export async function auditTeams(source, asOf, pool = 'regular') {
  const inputFiles = ['data/processed/seasons.json', 'data/processed/formats.json', 'data/processed/franchises.json', 'app/data/team_icons.json', 'app/data/manifest.json', 'tools/build_web.py'];
  const raw = await Promise.all(inputFiles.map(file => fs.readFile(path.join(source, file))));
  const [seasonData, formatData, franchiseData, iconData, manifest] = raw.slice(0, 5).map(buffer => JSON.parse(buffer));
  const season = selectSeason(seasonData.seasons, formatData.seasons, asOf, pool);
  const ids = candidateIds(formatData.seasons[season.season_id], pool);
  const teams = [], excluded = [];
  for (const id of ids) {
    try {
      const team = identity(franchiseData.franchises, id, season.season_id);
      const png = await fs.readFile(path.join(source, 'app/assets/team_icons', `${id}.png`));
      const embedded = iconData.icons?.[id];
      if (typeof embedded !== 'string' || !embedded.startsWith('data:image/png;base64,')) throw new Error('本地 icon index 无有效 PNG');
      const indexed = Buffer.from(embedded.slice('data:image/png;base64,'.length), 'base64');
      const asset = inspectPng(png), indexedAsset = inspectPng(indexed);
      teams.push({ ...team, asset: { source: `app/assets/team_icons/${id}.png`, ...asset, indexedWidth: indexedAsset.width, indexedHeight: indexedAsset.height, indexedSha256: hash(indexed), matchesIndex: hash(indexed) === asset.sha256 } });
    } catch (error) { excluded.push({ id, reason: error.message }); }
  }
  if (teams.length < 8) throw new Error('合格队伍不足 8，不能实现本命+7队');
  if (pool === 'annual' && teams.length !== 12) throw new Error('年总12队有身份/队徽缺失，不能静默缩小队伍池');
  const displayed = new Set(manifest.teams2026.map(team => team.id));
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
  const relevantDirty = execFileSync('git', ['status', '--porcelain', '--', ...inputFiles, 'app/assets/team_icons'], { cwd: source, encoding: 'utf8' }).trim();
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), asOf,
    source: { repo: 'KQ-KUN/kpl2k', commit: sourceCommit, relevantDirty: Boolean(relevantDirty), files: Object.fromEntries(inputFiles.map((file, index) => [file, hash(raw[index])])) },
    selection: { pool, rule: pool === 'annual' ? 'latest-started-KPL-annual-finals; 6 masters + 6 elite; grouped-and-played opening-stage IDs; exactly 12 valid canonical teams with local icons' : 'latest-started-KPL-regular-season-with-played-matches; grouped-and-played IDs; unique current canonical identity; valid local PNG and icon index', seasonId: season.season_id, seasonName: season.name, seasonStart: season.start_time, candidateCount: ids.length, eligibleCount: teams.length },
    existingDisplayPool: { field: 'app/data/manifest.json:teams2026', sourceSeason: 'KPL2026S1', evidence: 'tools/build_web.py:262 explicitly selects formats KPL2026S1', count: displayed.size, onlyInDisplayPool: [...displayed].filter(id => !ids.includes(id)).sort(), onlyInLatestSeason: ids.filter(id => !displayed.has(id)) },
    teams, excluded,
    limitations: ['本地最新可用赛季快照，不是现实当天活跃名单证明。', '名称/身份原样来自 canonical，不校正现实品牌变化。', 'PNG CRC/压缩结构检查不替代浏览器视觉验收。', '队徽品牌权利不由参考代码许可证授权。']
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    if (!['--source', '--as-of', '--output'].includes(key) || !process.argv[index + 1] || options[key]) throw new Error('用法：--source <kpl2k> --as-of YYYY-MM-DD --output <json>');
    options[key] = process.argv[index + 1];
  }
  if (!options['--source'] || !options['--as-of'] || !options['--output']) throw new Error('必须提供 source/as-of/output');
  const output = path.resolve(options['--output']);
  const project = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  if (!output.startsWith(project + path.sep)) throw new Error('审计输出必须位于本游戏目录');
  const result = await auditTeams(path.resolve(options['--source']), options['--as-of']);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(`${result.selection.seasonId}: ${result.selection.eligibleCount}/${result.selection.candidateCount} teams; excluded ${result.excluded.length}; source dirty=${result.source.relevantDirty}`);
}
