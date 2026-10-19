import './style.css';
import { createSession } from './game/session.js';
import { RADII, PHYSICS, AUDIO } from './game/config.js';
import snapshot from './data/teams.json';
import { validateTeams, assetUrl, loadRouteImages } from './data/team-data.js';
import { createProgression } from './game/progression.js';
import { createRenderer } from './game/renderer.js';
import { createAnthemPlayer, anthemLevelAfterMerge } from './game/anthem.js';
import { createMergeFeedback } from './game/merge-feedback.js';
import { createRoundAnalytics } from './game/analytics.js';

const canvas = document.querySelector('#arena'), score = document.querySelector('#score');
const status = document.querySelector('#status'), pauseButton = document.querySelector('#pause');
const scoreFeedback = document.querySelector('#score-feedback');
const gainPanel = document.querySelector('.gain-panel'), gainTotal = document.querySelector('#gain-total'), gainLabel = document.querySelector('#gain-label');
const readyFill = document.querySelector('#ready-fill'), fullscreenButton = document.querySelector('#fullscreen');
const nextPreview = document.querySelector('#next-preview'), nextIcon = document.querySelector('#next-icon');
const nextName = document.querySelector('#next-name'), nextLevel = document.querySelector('#next-level');
const arenaMessage = document.querySelector('#arena-message'), arenaTitle = document.querySelector('#arena-message-title'), arenaCopy = document.querySelector('#arena-message-copy');
const lifetime = new AbortController();
const teams = validateTeams(snapshot), base = import.meta.env.BASE_URL;
const picker = document.querySelector('#picker'), game = document.querySelector('.game'), startButton = document.querySelector('#start');
const soundButton = document.querySelector('#sound'), favoriteName = document.querySelector('#favorite-name'), favoriteIcon = document.querySelector('#favorite-icon');
const musicVersionButton = document.querySelector('#music-version');
let selectedId = null, route = null, anthem = null, muted = false, musicError = null;
let anthemLevel = AUDIO.initialLevel, musicMode = 'normal';
const anthemPositions = new Map();
let session = null, disposed = false, pageSuspended = false, previous = {}, announcement = null;
const mergeFeedback = createMergeFeedback(), finalChoice = document.querySelector('#final-choice');
const finalContinue = document.querySelector('#final-continue');
let feedbackKey = '', pulse = 0, fullscreenError = null, finalPending = false;
const roundAnalytics = createRoundAnalytics(event => window.KPLAnalytics?.trackEvent(event));
function updateMusicControls() {
  const currentVersion = musicMode === 'child' ? '小孩版' : '正常版';
  const nextVersion = musicMode === 'child' ? '正常版' : '小孩版';
  musicVersionButton.setAttribute('aria-label', `正常版 / 小孩版：当前${currentVersion}，点击切换${nextVersion}`);
  musicVersionButton.setAttribute('aria-pressed', String(musicMode === 'child'));
  if (!route) return;
  const team = route[anthemLevel], child = musicMode === 'child' && team.childAnthem;
  const fallback = musicMode === 'child' && !team.childAnthem ? '（本队暂无小孩版，使用正常版）' : '';
  const title = `L${anthemLevel} ${team.shortName}${child ? '小孩版' : '正常版'}战歌${fallback} · 持续到首次合成更高等级`;
  musicVersionButton.title = title; soundButton.title = musicError ?? title;
}
function playCurrentAnthem() {
  updateMusicControls();
  if (disposed || pageSuspended || game.hidden || document.hidden || !session || (session.isPaused() && !finalPending) || session.physics.state().phase !== 'playing') return;
  anthem?.play(route[anthemLevel], anthemLevel, musicMode);
}
function update(state) {
  if (state.phase === 'over') roundAnalytics.gameover();
  if (state.next !== previous.next) {
    const team = route[state.next];
    nextIcon.src = assetUrl(team.icon, base);
    nextName.textContent = team.shortName; nextLevel.textContent = `L${state.next}`;
    nextPreview.dataset.level = String(state.next); nextPreview.dataset.team = team.id;
    nextPreview.style.setProperty('--next-diameter', String(RADII[state.next] * 2));
    nextPreview.setAttribute('aria-label', `下一球：${team.shortName}，L${state.next}`);
  }
  if (state.score !== previous.score) {
    score.textContent = state.score.toLocaleString('en-US'); score.dataset.long = String(score.textContent.length > 6);
    if (state.score > (previous.score ?? 0)) { pulse++; score.dataset.pulse = gainPanel.dataset.pulse = pulse % 2 ? 'a' : 'b'; }
  }
  const feedback = mergeFeedback.state(), scoreEvents = feedback.events;
  const key = scoreEvents.map(event => `${event.tick}:${event.outputId}`).join(',');
  if (key !== feedbackKey) {
    scoreFeedback.replaceChildren(...scoreEvents.map(event => {
      const badge = document.createElement('span'); badge.textContent = `+${event.points}`;
      badge.className = event.level === 7 ? 'score-gain final-gain' : 'score-gain'; return badge;
    }));
    feedbackKey = key;
    if (scoreEvents.length) {
      gainTotal.textContent = `+${feedback.total.toLocaleString('en-US')}`; gainTotal.dataset.long = String(gainTotal.textContent.length > 6);
      gainLabel.textContent = '连锁得分';
    }
  }
  const text = state.phase === 'over' ? 'Game Over · 点击 Restart 再来一局'
    : state.phase === 'settling' ? '持续越线 · 停止投放，等待球体稳定'
    : session?.isPaused() ? '已暂停'
    : fullscreenError ? fullscreenError
    : musicError ? musicError
    : announcement && state.now - announcement.time < PHYSICS.feedbackMs ? announcement.text
    : state.danger.warning ? '注意：球体接近危险线，持续堆积会结束'
    : state.canDrop ? '可投放' : '投放冷却中';
  if (status.textContent !== text) status.textContent = text;
  const meter = Math.round(state.cooldownProgress * 100);
  if (meter !== Math.round((previous.cooldownProgress ?? -1) * 100)) readyFill.style.transform = `scaleX(${meter / 100})`;
  const paused = session?.isPaused() ?? false;
  const overlay = !finalPending && (paused || state.phase === 'over' || state.phase === 'settling');
  arenaMessage.hidden = !overlay;
  if (overlay) {
    const title = state.phase === 'over' ? 'Game Over' : state.phase === 'settling' ? '堆积越线' : '已暂停';
    const copy = state.phase === 'over' ? `本局得分 ${score.textContent} · 点击重开再来一局` : state.phase === 'settling' ? '等待球体稳定' : '点击继续，回到游戏';
    if (arenaTitle.textContent !== title) arenaTitle.textContent = title;
    if (arenaCopy.textContent !== copy) arenaCopy.textContent = copy;
  }
  canvas.dataset.phase = state.phase; canvas.dataset.current = String(state.current); canvas.dataset.next = String(state.next);
  canvas.inert = finalPending; finalChoice.hidden = !finalPending; pauseButton.disabled = finalPending;
  previous = state;
}
function restart(rng = Math.random, reason = 'start') {
  if (disposed || !selectedId) return;
  roundAnalytics.cancel();
  session?.destroy(); anthem?.destroy();
  route = createProgression(teams, selectedId, rng);
  const images = loadRouteImages(route, base);
  favoriteName.textContent = route[7].shortName; favoriteIcon.src = assetUrl(route[7].icon, base);
  picker.hidden = true; game.hidden = false;
  musicError = null; anthemLevel = AUDIO.initialLevel; musicMode = 'normal';
  anthem = createAnthemPlayer({ base, muted, positions: anthemPositions, onStatus: result => {
    musicError = result === 'error' ? '战歌暂时无法播放，可以继续游戏' : null;
    updateMusicControls();
  } });
  previous = {}; announcement = null; mergeFeedback.reset(); feedbackKey = ''; fullscreenError = null; finalPending = false; finalChoice.hidden = true; canvas.inert = false; scoreFeedback.replaceChildren();
  delete score.dataset.pulse; delete gainPanel.dataset.pulse; gainTotal.textContent = '—'; gainLabel.textContent = '连锁得分';
  session = createSession(canvas, { rng, renderer: createRenderer(canvas, { route, images, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }), onChange: update,
    onDrop: ball => { mergeFeedback.finish(); canvas.dataset.team = route[ball.level].id; }, onStop: () => { if (!finalPending || document.hidden || pageSuspended) anthem.stop(); else playCurrentAnthem(); }, onResume: playCurrentAnthem, onMerge(event) {
    if (event.level === 7) roundAnalytics.favorite();
    mergeFeedback.record(event);
    anthemLevel = anthemLevelAfterMerge(anthemLevel, event.level);
    if (event.level === 7 && !finalPending) {
      finalPending = true;
      document.querySelector('#final-team').textContent = `${route[7].shortName}本命达成`;
      document.querySelector('#final-icon').src = assetUrl(route[7].icon, base);
      session.pause(); finalContinue.focus({ preventScroll: true });
    }
    playCurrentAnthem();
    announcement = { time: event.time, text: event.level === 7 ? `${route[7].shortName}本命达成！+${event.points} · 可以继续合成` : `${route[event.level].shortName} +${event.points}` };
  } });
  roundAnalytics.begin(reason);
  pauseButton.textContent = '暂停'; pauseButton.setAttribute('aria-label', '暂停物理模拟');
  update(session.physics.state());
  playCurrentAnthem();
}
const grid = document.querySelector('#team-grid');
for (const team of teams) {
  const button = document.createElement('button'), image = document.createElement('img'), label = document.createElement('span');
  button.type = 'button'; button.dataset.team = team.id; button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', team.name);
  image.alt = ''; image.width = image.height = 80; label.textContent = team.shortName;
  let retried = false;
  image.addEventListener('error', () => {
    if (!retried) { retried = true; image.src = `${assetUrl(team.icon, base)}?retry=1`; }
    else image.alt = `${team.shortName}队徽`;
  }, { signal: lifetime.signal });
  image.src = assetUrl(team.icon, base);
  button.append(image, label); grid.append(button);
}
grid.addEventListener('click', event => {
  const button = event.target.closest('button[data-team]'); if (!button) return;
  selectedId = button.dataset.team;
  for (const item of grid.children) item.setAttribute('aria-pressed', String(item === button));
  startButton.disabled = false; document.querySelector('#picker-status').textContent = `最终目标：${teams.find(team => team.id === selectedId).name}`;
}, { signal: lifetime.signal });
startButton.addEventListener('click', () => { restart(); canvas.focus({ preventScroll: true }); }, { signal: lifetime.signal });
document.querySelector('#change-team').addEventListener('click', () => {
  roundAnalytics.cancel();
  session?.destroy(); anthem?.destroy(); game.hidden = true; picker.hidden = false;
  finalPending = false; finalChoice.hidden = true;
  grid.querySelector(`[data-team="${selectedId}"]`)?.focus({ preventScroll: true });
}, { signal: lifetime.signal });
musicVersionButton.addEventListener('click', () => {
  musicMode = musicMode === 'normal' ? 'child' : 'normal';
  playCurrentAnthem();
}, { signal: lifetime.signal });
soundButton.addEventListener('click', () => {
  muted = !muted; anthem?.setMuted(muted);
  soundButton.setAttribute('aria-pressed', String(!muted)); soundButton.setAttribute('aria-label', muted ? '开启合成战歌' : '关闭合成战歌');
  if (!muted) playCurrentAnthem();
}, { signal: lifetime.signal });
document.querySelector('#restart').addEventListener('click', () => restart(Math.random, 'restart'), { signal: lifetime.signal });
finalContinue.addEventListener('click', () => { finalPending = false; mergeFeedback.finish(); session?.pause(false); pauseButton.textContent = '暂停'; canvas.focus({ preventScroll: true }); }, { signal: lifetime.signal });
document.querySelector('#final-restart').addEventListener('click', () => { restart(Math.random, 'restart'); canvas.focus({ preventScroll: true }); }, { signal: lifetime.signal });
document.addEventListener('keydown', event => {
  if (!finalPending || event.key !== 'Tab') return;
  event.preventDefault();
  const other = document.querySelector('#final-restart');
  (document.activeElement === finalContinue ? other : finalContinue).focus({ preventScroll: true });
}, { signal: lifetime.signal });
pauseButton.addEventListener('click', () => {
  if (!session) return; const paused = !session.isPaused(); session.pause(paused);
  pauseButton.textContent = paused ? '继续' : '暂停'; pauseButton.setAttribute('aria-label', paused ? '继续物理模拟' : '暂停物理模拟');
}, { signal: lifetime.signal });
fullscreenButton.addEventListener('click', async () => {
  try {
    fullscreenError = null;
    if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen();
  } catch { fullscreenError = '浏览器未允许全屏，可继续在窗口游玩'; }
  if (!disposed && session) update(session.physics.state());
}, { signal: lifetime.signal });
document.addEventListener('fullscreenchange', () => {
  const full = Boolean(document.fullscreenElement); fullscreenButton.textContent = full ? '退出全屏' : '全屏'; fullscreenButton.setAttribute('aria-label', full ? '退出全屏' : '进入全屏');
}, { signal: lifetime.signal });
if (!document.fullscreenEnabled) fullscreenButton.hidden = true;
function destroy() { if (!disposed) { disposed = true; session?.destroy(); anthem?.destroy(); anthemPositions.clear(); mergeFeedback.reset(); finalPending = false; finalChoice.hidden = true; scoreFeedback.replaceChildren(); delete score.dataset.pulse; delete gainPanel.dataset.pulse; lifetime.abort(); } }
// BFCache freezes the same session. Only explicit Restart may randomize its route or reset its score.
window.addEventListener('pagehide', event => {
  if (!event.persisted) { destroy(); return; }
  pageSuspended = true;
  session?.suspend(); anthem?.stop();
}, { signal: lifetime.signal });
window.addEventListener('pageshow', event => {
  if (!event.persisted || disposed || !pageSuspended) return;
  pageSuspended = false;
  session?.resume(); playCurrentAnthem();
}, { signal: lifetime.signal });
if (import.meta.hot) import.meta.hot.dispose(destroy);

if (import.meta.env.DEV) {
  const panel = document.querySelector('#debug-panel'); panel.hidden = false;
  function loadScene(name) {
    if (!selectedId) return; restart(Math.random, 'debug');
    const p = session.physics;
    if (name === 'triple') {
      const r = RADII[1]; [200 - r * 1.8, 200, 200 + r * 1.8].forEach(x => p.addBall(1, x, 430));
    } else if (name === 'chain') {
      const a = RADII[1], b = RADII[2];
      p.addBall(1, 200 - a * 0.9, 400); p.addBall(1, 200 + a * 0.9, 400); p.addBall(2, 200, 400 + b * 1.8);
    } else if (name === 'final') {
      for (const x of [100, 300]) { const r = RADII[6]; p.addBall(6, x - r * 0.96, 400); p.addBall(6, x + r * 0.96, 400); }
    } else if (name === 'danger') {
      // 开发固定静态支撑，不属于正常自然投放；真实危险球依然是动态圆体。
      const supportY = 78 + RADII[7] + RADII[0];
      const support = p.addBall(7, 200, supportY, { graceMs: 0 });
      support.released = false;
      import('matter-js').then(({ default: Matter }) => {
        if (disposed || session.physics !== p || p.state().phase !== 'playing') return;
        Matter.Body.setStatic(support.body, true); p.addBall(0, 200, 78, { graceMs: 0 });
      });
    }
  }
  panel.addEventListener('click', event => { const button = event.target.closest('[data-scene]'); if (button) loadScene(button.dataset.scene); }, { signal: lifetime.signal });
  window.__KPL_MERGE__ = { current: () => session, route: () => route, audio: () => anthem, restart, loadScene, destroy };
}
