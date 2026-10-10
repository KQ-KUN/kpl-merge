import { AUDIO, assertLevel } from './config.js';

export function anthemLevelAfterMerge(currentLevel, outputLevel) {
  assertLevel(currentLevel); assertLevel(outputLevel);
  return Math.max(currentLevel, outputLevel);
}

export function anthemForLevel(team, level, mode = 'normal') {
  assertLevel(level);
  if (!['normal', 'child'].includes(mode)) throw new Error('无效战歌版本');
  return mode === 'child' && team.childAnthem ? team.childAnthem : team.anthem;
}

// 版本由全局模式决定；缺少小孩版时回退本队正常版，两版进度独立。
export function createAnthemPlayer({ base = './', muted = false, audioFactory = () => new Audio(), onStatus = () => {},
  positions = new Map() } = {}) {
  const audio = audioFactory(); audio.preload = 'none'; audio.volume = AUDIO.volume; audio.loop = true;
  let destroyed = false, sequence = 0, track = null, playing = false;
  const controller = new AbortController();
  function stop() {
    sequence++;
    if (track) positions.set(track.key, Number.isFinite(audio.currentTime) && audio.currentTime >= 0 ? audio.currentTime : track.start);
    audio.pause(); audio.removeAttribute('src'); audio.load(); track = null; playing = false;
  }
  function seek() {
    if (!track) return;
    const duration = audio.duration;
    if (Number.isFinite(duration) && duration > 0) {
      if (track.start >= duration - .02) track.start = duration > track.entry ? track.entry : 0;
    }
    audio.currentTime = track.start;
  }
  audio.addEventListener('loadedmetadata', seek, { signal: controller.signal });
  audio.addEventListener('timeupdate', () => {
    // 原生整曲循环回到0时跳过前奏；暂停、切歌和旧音源不参与。
    if (track && playing && !audio.paused && audio.currentTime < track.entry - .1) audio.currentTime = track.entry;
  }, { signal: controller.signal });
  audio.addEventListener('error', () => { if (track) { stop(); onStatus('error'); } }, { signal: controller.signal });
  return {
    play(team, level = AUDIO.initialLevel, mode = 'normal') {
      if (destroyed || muted) return;
      const key = anthemForLevel(team, level, mode), variant = key === team.childAnthem ? 'child' : 'normal';
      if (track?.key === key) { track.teamId = team.id; track.level = level; track.variant = variant; return; }
      stop(); const token = sequence;
      const entry = (variant === 'child' ? team.childAnthemStartSeconds : team.anthemStartSeconds) ?? AUDIO.startSeconds;
      const saved = positions.get(key), start = Number.isFinite(saved) && saved >= entry ? saved : entry;
      track = { key, teamId: team.id, start, entry, level, variant };
      audio.src = `${base}${key}`;
      // 开局手势先启动媒体；之后合成复用该实例，旧Promise不能覆盖新曲。
      try { seek(); Promise.resolve(audio.play()).then(() => { if (!destroyed && token === sequence) { playing = true; onStatus('playing', team); } }, () => { if (!destroyed && token === sequence) { stop(); onStatus('error', team); } }); }
      catch { if (!destroyed && token === sequence) { stop(); onStatus('error', team); } }
    },
    stop() { if (!destroyed) stop(); },
    setMuted(value) { muted = Boolean(value); if (muted && !destroyed) stop(); },
    destroy() { if (!destroyed) { stop(); destroyed = true; controller.abort(); } },
    inspect: () => ({ destroyed, muted, playing, teamId: track?.teamId ?? null, source: audio.getAttribute('src'), currentTime: audio.currentTime,
      level: track?.level ?? null, variant: track?.variant ?? null, entrySeconds: track?.entry ?? null, positions: Object.fromEntries(positions), listeners: destroyed ? 0 : 3, timers: 0 })
  };
}
