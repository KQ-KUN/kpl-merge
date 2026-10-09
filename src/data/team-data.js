export function validateTeams(snapshot) {
  if (snapshot?.schemaVersion !== 2 || !Array.isArray(snapshot.teams) || snapshot.teams.length < 8) throw new Error('队伍快照无效');
  const ids = new Set();
  return Object.freeze(snapshot.teams.map(team => {
    if (!/^\d+$/.test(team.id) || ids.has(team.id) || typeof team.name !== 'string' || !team.name.trim() || typeof team.shortName !== 'string' || !team.shortName.trim() || team.icon !== `team-icons/${team.id}.png` || !new RegExp(`^team-audio/normal/${team.id}\\.(m4a|mp3)$`).test(team.anthem) || team.anthemDedicated !== true || typeof team.anthemName !== 'string' || !team.anthemName.trim()
      || !(team.childAnthem === null ? team.childAnthemName === null : team.childAnthem === `team-audio/child/${team.id}.m4a` && typeof team.childAnthemName === 'string' && team.childAnthemName.trim())) throw new Error('队伍字段/本地资源路径无效');
    for (const start of [team.anthemStartSeconds, team.childAnthemStartSeconds]) {
      if (start !== undefined && start !== null && (!Number.isFinite(start) || start < 0)) throw new Error('歌词起点必须为非负秒数');
    }
    if (team.childAnthem === null && team.childAnthemStartSeconds != null) throw new Error('缺少小孩版时不能配置它的起点');
    ids.add(team.id); return Object.freeze({ ...team });
  }));
}
export function assetUrl(asset, base = './') { return `${base}${asset}`; }
export function loadRouteImages(route, base, imageFactory = () => new Image()) {
  return route.map(team => { const image = imageFactory(); image.src = assetUrl(team.icon, base); return image; });
}
