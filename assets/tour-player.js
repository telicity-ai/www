export const STEP_RANGES = Object.freeze([
  Object.freeze([0, 0.30]),
  Object.freeze([0.30, 0.57]),
  Object.freeze([0.57, 1]),
]);
export const STEP_DURATIONS = Object.freeze([1350, 1450, 1480]);

const clamp = value => Math.max(0, Math.min(1, value));
const stepIndex = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(2, Math.floor(Number(value)))) : 0;
const completionCount = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(3, Math.floor(Number(value)))) : 0;

// A gesture starts one complete scene. Its timeline remains linear because the
// cursor paths and individual actions already contain their own easing.
export function createStepPlayer({
  onFrame,
  onState,
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = id => cancelAnimationFrame(id),
  now = () => performance.now(),
} = {}) {
  let state = { progress: 0, step: 0, completed: 0, busy: false };
  let frameId = null;
  let generation = 0;
  const getState = () => ({ ...state });
  const notifyState = () => onState?.(getState());

  function stopFrames() {
    generation += 1;
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
    return generation;
  }

  function notifyFrame(token) {
    onFrame?.(state.progress, state.step);
    return token === generation;
  }

  function play(value, { reverse = false, instant = false } = {}) {
    const index = stepIndex(value);
    const token = stopFrames();
    const [begin, end] = STEP_RANGES[index];
    const from = reverse ? end : begin;
    const to = reverse ? begin : end;
    state = { progress: from, step: index, completed: reverse ? index + 1 : index, busy: !instant };
    const startedAt = now();

    function finish() {
      state = {
        progress: to,
        step: reverse ? Math.max(0, index - 1) : index,
        completed: reverse ? index : index + 1,
        busy: false,
      };
      if (notifyFrame(token)) notifyState();
    }

    function tick() {
      if (token !== generation || !state.busy) return;
      frameId = null;
      const amount = clamp((now() - startedAt) / STEP_DURATIONS[index]);
      if (amount === 1) {
        finish();
        return;
      }
      state.progress = from + (to - from) * amount;
      if (!notifyFrame(token) || !state.busy) return;
      frameId = requestFrame(tick);
    }

    if (instant) finish();
    else if (notifyFrame(token)) {
      notifyState();
      if (token === generation && state.busy) frameId = requestFrame(tick);
    }
    return getState();
  }

  function show(value, progress, completed) {
    const index = stepIndex(value);
    const token = stopFrames();
    state = {
      progress: Number.isFinite(progress) ? clamp(progress) : STEP_RANGES[index][1],
      step: index,
      completed: completed === undefined ? index + 1 : completionCount(completed),
      busy: false,
    };
    if (notifyFrame(token)) notifyState();
    return getState();
  }

  function cancel() {
    const wasBusy = state.busy;
    stopFrames();
    state.busy = false;
    if (wasBusy) notifyState();
    return getState();
  }

  return { getState, play, show, reset: () => show(0, 0, 0), cancel };
}

// Trackpads emit many wheel events for a single gesture, including momentum.
// Events received during playback can be consumed without queuing another step.
export function createGestureGate(idle = 220) {
  const interval = Number.isFinite(idle) ? Math.max(0, idle) : 220;
  let lastEvent = null;
  return {
    consume(time) {
      if (!Number.isFinite(time) || (lastEvent !== null && time < lastEvent)) return false;
      const first = lastEvent === null || time - lastEvent >= interval;
      lastEvent = time;
      return first;
    },
    reset() { lastEvent = null; },
  };
}
