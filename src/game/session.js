import { PHYSICS } from './config.js';
import { createPhysics } from './physics.js';
import { createRenderer } from './renderer.js';

// 每局统一拥有物理、渲染、输入、RAF、Observer；重开先销毁再新建。
export function createSession(canvas, {
  rng = Math.random, onChange = () => {}, onMerge = () => {}, onDrop = () => {}, onStop = () => {}, onResume = () => {},
  environment = { window, document },
  scheduler = { request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id) },
  renderer = createRenderer(canvas, { reducedMotion: environment.window.matchMedia('(prefers-reduced-motion: reduce)').matches }),
  observerFactory = callback => new ResizeObserver(callback)
} = {}) {
  const controller = new AbortController();
  const physics = createPhysics({ rng, onChange,
    onImpact: event => renderer.impact?.(event),
    onMerge: event => { renderer.feedback(event); onMerge(event); } });
  let rafId = null, lastTime = null, accumulator = 0, destroyed = false, manuallyPaused = false, suspended = false, frameEpoch = 0;
  let pointerId = null, listenerCount = 0;
  let priorPhase = 'playing';
  const observer = observerFactory(() => { if (!destroyed) { renderer.resize(); renderer.draw(physics); } });
  observer.observe(canvas);
  const isPaused = () => manuallyPaused || suspended || environment.document.hidden;
  const bind = (target, event, listener, options = {}) => { target.addEventListener(event, listener, { ...options, signal: controller.signal }); listenerCount += 1; };
  const xAt = event => { const rect = canvas.getBoundingClientRect(); return (event.clientX - rect.left) * PHYSICS.width / rect.width; };
  function cancelGesture() {
    if (pointerId !== null && canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture(pointerId);
    pointerId = null;
    if (canvas.dataset) delete canvas.dataset.aiming;
  }
  function dropAt(x) {
    const ball = physics.drop(x);
    if (ball) { renderer.release?.(ball, physics.state().now); onDrop(ball); }
    renderer.draw(physics);
  }
  function schedule() {
    if (!destroyed && !isPaused() && physics.state().phase !== 'over' && rafId === null) {
      const epoch = frameEpoch;
      rafId = scheduler.request(time => frame(time, epoch));
    }
  }
  function frame(time, epoch) {
    if (epoch !== frameEpoch) return;
    rafId = null;
    if (destroyed || isPaused()) return;
    if (lastTime !== null) accumulator += Math.min(Math.max(0, time - lastTime), PHYSICS.stepMs * PHYSICS.maxFrameSteps);
    lastTime = time;
    let steps = 0;
    while (!isPaused() && accumulator + 1e-6 >= PHYSICS.stepMs && steps < PHYSICS.maxFrameSteps) {
      physics.step(); accumulator = Math.max(0, accumulator - PHYSICS.stepMs); steps += 1;
    }
    renderer.draw(physics);
    const phase = physics.state().phase;
    if (phase !== 'playing' && priorPhase === 'playing') onStop();
    priorPhase = phase; schedule();
  }
  function syncPause() {
    cancelGesture(); lastTime = null; accumulator = 0; frameEpoch++;
    if (rafId !== null) { scheduler.cancel(rafId); rafId = null; }
    schedule(); onChange(physics.state());
    if (isPaused()) onStop();
    else if (physics.state().phase === 'playing') onResume();
  }
  bind(canvas, 'pointerdown', event => {
    if (destroyed || isPaused() || pointerId !== null || event.isPrimary === false || event.button !== 0 || physics.state().phase !== 'playing') return;
    event.preventDefault(); canvas.focus({ preventScroll: true }); pointerId = event.pointerId;
    if (canvas.dataset) { canvas.dataset.input = 'pointer'; canvas.dataset.aiming = 'true'; }
    physics.move(xAt(event)); canvas.setPointerCapture(event.pointerId); renderer.draw(physics);
  });
  bind(canvas, 'pointermove', event => {
    if (destroyed || isPaused() || event.isPrimary === false || (pointerId !== null && pointerId !== event.pointerId)) return;
    if (pointerId === event.pointerId || event.pointerType === 'mouse' || event.pointerType === 'pen') { physics.move(xAt(event)); renderer.draw(physics); }
  });
  bind(canvas, 'pointerup', event => {
    if (pointerId !== event.pointerId) return;
    event.preventDefault(); const x = xAt(event); cancelGesture();
    if (!destroyed && !isPaused()) dropAt(x);
  });
  bind(canvas, 'pointercancel', cancelGesture);
  bind(canvas, 'lostpointercapture', () => { pointerId = null; });
  bind(canvas, 'keydown', event => {
    if (destroyed || isPaused() || event.altKey || event.ctrlKey || event.metaKey) return;
    if (['ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(event.code)) {
      if (canvas.dataset) canvas.dataset.input = 'keyboard';
      event.preventDefault();
      if (event.code.startsWith('Arrow')) physics.move(physics.state().previewX + (event.code === 'ArrowLeft' ? -12 : 12));
      else if (!event.repeat) dropAt();
      renderer.draw(physics);
    }
  });
  bind(environment.document, 'visibilitychange', syncPause);
  bind(environment.window, 'blur', cancelGesture);
  renderer.draw(physics); onChange(physics.state()); schedule();
  return {
    physics,
    pause(value = true) { if (!destroyed) { manuallyPaused = value; syncPause(); } },
    // BFCache retains this world and route; page lifecycle must not change the user's pause choice.
    suspend() { if (!destroyed && !suspended) { suspended = true; syncPause(); } },
    resume() { if (!destroyed && suspended) { suspended = false; syncPause(); } },
    isPaused,
    destroy() {
      if (destroyed) return;
      destroyed = true; frameEpoch++; cancelGesture(); controller.abort(); listenerCount = 0;
      if (canvas.dataset) delete canvas.dataset.input;
      if (rafId !== null) scheduler.cancel(rafId);
      rafId = null; lastTime = null; accumulator = 0; observer.disconnect();
      physics.destroy(); renderer.destroy();
      onStop();
    },
    inspect: () => ({ destroyed, paused: isPaused(), manuallyPaused, suspended, rafPending: rafId === null ? 0 : 1, listeners: listenerCount,
      timers: 0, observerActive: !destroyed, physics: physics.inspect(), renderer: renderer.inspect() })
  };
}
