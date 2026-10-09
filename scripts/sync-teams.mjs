import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { auditTeams } from './audit-teams.mjs';
import { officialAnnualSelection, sourceHash } from './official-annual.mjs';

// 显式维护命令；install/build 永远不读取源仓库。
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (!['--source', '--as-of', '--pool', '--annual-source'].includes(process.argv[i]) || !process.argv[i + 1] || options[process.argv[i]]) throw new Error('用法：--source <kpl2k> --as-of YYYY-MM-DD [--pool annual|regular] [--annual-source <游戏内官方快照>]');
  options[process.argv[i]] = process.argv[i + 1];
}
if (!options['--source'] || !options['--as-of']) throw new Error('必须指定 source/as-of');
const source = path.resolve(options['--source']), project = fileURLToPath(new URL('..', import.meta.url));
const pool = options['--pool'] ?? 'annual';
if (options['--annual-source'] && pool !== 'annual') throw new Error('官方年总快照只适用于annual');
const officialPath = options['--annual-source'] ? path.resolve(options['--annual-source']) : path.join(project, 'docs/annual-2026-source.json');
const officialRaw = pool === 'annual' ? await fs.readFile(officialPath) : null;
const audit = await auditTeams(source, options['--as-of'], officialRaw ? 'regular' : pool);
if (officialRaw) {
  const official = JSON.parse(officialRaw), selected = officialAnnualSelection(official, audit.teams, options['--as-of']);
  audit.canonicalSelection = audit.selection;
  audit.selection = selected.selection; audit.teams = selected.teams;
  audit.officialAnnual = { snapshot: path.relative(project, officialPath).replaceAll(path.sep, '/'), sha256: sourceHash(officialRaw), retrievedAt: official.retrievedAt, sources: official.sources, mappings: selected.mappings };
  audit.limitations = ['2026年总参赛名单来自已保存的腾讯官方赛季/擂台赛接口快照。', 'canonical名称/ID和本地队徽仍来自2K；未修改2K主数据库。', '运行时不联网，维护更新须显式获取/同步新快照。'];
}
const previous = JSON.parse(await fs.readFile(path.join(project, 'src/data/teams.json'), 'utf8').catch(error => { if (error.code === 'ENOENT') return '{"teams":[]}'; throw error; }));
const catalogPath = 'app/data/team_anthems.json', catalogBytes = await fs.readFile(path.join(source, catalogPath));
const catalog = JSON.parse(catalogBytes);
if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.teams) || new Set(catalog.teams.map(team => team.id)).size !== catalog.teams.length) throw new Error('战歌数据库无效或ID重复');
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const files = new Map(), teams = [];
async function copyAudio(asset, id, variant) {
  const validPath = variant === 'normal' ? new RegExp(`^assets/audio/normal/${id}\\.(m4a|mp3)$`) : /^assets\/audio\/[^/\\]+\.m4a$/;
  if (!asset || asset.variant !== variant || typeof asset.file !== 'string' || !validPath.test(asset.file) || typeof asset.title !== 'string' || !asset.title.trim()) throw new Error(`${id}缺少合法${variant}战歌`);
  const target = path.resolve(source, 'app', asset.file), root = path.resolve(source, 'app/assets/audio') + path.sep;
  if (!target.startsWith(root)) throw new Error('战歌源路径越界');
  const buffer = await fs.readFile(target), extension = path.extname(asset.file);
  if (hash(buffer) !== asset.sha256 || buffer.length !== asset.bytes) throw new Error(`${id}音源与数据库哈希不符`);
  if (extension === '.m4a' ? buffer.toString('ascii', 4, 8) !== 'ftyp' : !(buffer.toString('ascii', 0, 3) === 'ID3' || buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) throw new Error(`${id}音频容器与扩展名不符`);
  const name = `${variant}/${id}${extension}`;
  files.set(name, { buffer, source: `app/${asset.file}`, bytes: buffer.length, sha256: hash(buffer), title: asset.title, variant, media: asset.media, processing: asset.processing });
  return `team-audio/${name}`;
}
for (const team of audit.teams) {
  const entry = catalog.teams.find(item => item.id === team.id);
  if (!entry || entry.name !== team.name) throw new Error(`${team.id}战歌数据库身份不符或缺失`);
  const anthem = await copyAudio(entry.normal, team.id, 'normal');
  const childAnthem = entry.child ? await copyAudio(entry.child, team.id, 'child') : null;
  teams.push({ id: team.id, name: team.name, shortName: team.shortName, icon: `team-icons/${team.id}.png`, anthem, anthemName: entry.normal.title, anthemDedicated: true,
    childAnthem, childAnthemName: entry.child?.title ?? null,
    anthemStartSeconds: entry.normal.playbackStartSeconds ?? 1,
    childAnthemStartSeconds: entry.child ? entry.child.playbackStartSeconds ?? 1 : null });
  for (const asset of [entry.normal, entry.child].filter(Boolean)) {
    const start = asset.playbackStartSeconds ?? 1;
    if (!Number.isFinite(start) || start < 0 || start >= asset.media.durationSeconds) throw new Error(`${team.id}歌词起点非法`);
  }
}
await fs.mkdir(path.join(project, 'src/data'), { recursive: true });
await fs.mkdir(path.join(project, 'public/team-icons'), { recursive: true });
await fs.mkdir(path.join(project, 'public/team-audio'), { recursive: true });
for (const team of audit.teams) await fs.copyFile(path.join(source, team.asset.source), path.join(project, 'public/team-icons', `${team.id}.png`));
for (const [name, asset] of files) { const target = path.join(project, 'public/team-audio', name); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, asset.buffer); }
// 只清理上一快照明确管理且新快照不再引用的文件，未知文件不碰。
const retained = new Set(teams.flatMap(team => [team.icon, team.anthem, team.childAnthem]).filter(Boolean));
for (const resource of new Set(previous.teams.flatMap(team => [team.icon, team.anthem, team.childAnthem]).filter(Boolean))) {
  if (retained.has(resource)) continue;
  if (!/^(team-icons\/\d+\.png|team-audio\/(?:(?:normal|child)\/)?(?:\d+|default)\.(?:m4a|mp3))$/.test(resource)) throw new Error('上一快照资源路径非法');
  const target = path.resolve(project, 'public', resource), root = path.resolve(project, 'public') + path.sep;
  if (!target.startsWith(root)) throw new Error('清理路径越界');
  await fs.unlink(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
await fs.writeFile(path.join(project, 'src/data/teams.json'), JSON.stringify({ schemaVersion: 2, seasonId: audit.selection.seasonId, seasonName: audit.selection.seasonName, pool: audit.selection.pool, teams }, null, 2) + '\n');
await fs.writeFile(path.join(project, 'docs/data-provenance.json'), JSON.stringify({ ...audit, audio: { catalogSource: catalogPath, catalogSha256: hash(catalogBytes), files: Object.fromEntries([...files].map(([name, { buffer, ...asset }]) => [name, asset])), normalTeams: teams.map(team => team.id), childTeams: teams.filter(team => team.childAnthem).map(team => team.id), defaultTrack: null } }, null, 2) + '\n');
console.log(`${audit.selection.seasonId}: ${teams.length} logos, ${teams.length} normal + ${teams.filter(team => team.childAnthem).length} child anthems; no default anthem`);
