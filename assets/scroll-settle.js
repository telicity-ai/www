const DEFAULT_DURATION = 920;
const finite = Number.isFinite;
const durationOf = value => finite(value) ? Math.max(0, value) : DEFAULT_DURATION;

// An underdamped arrival gives the page one small, soft correction. Its
// overshoot is compressed smoothly, so a long wheel gesture cannot fling it.
export function scrollSettleFrame(elapsed, { from, to, duration = DEFAULT_DURATION } = {}) {
  if (!finite(from) || !finite(to)) return { position: finite(to) ? to : finite(from) ? from : 0, done: true };
  const distance = to - from;
  const length = durationOf(duration);
  const time = finite(elapsed) ? Math.max(0, elapsed) : 0;
  if (!finite(distance) || distance === 0 || length === 0 || time >= length) return { position: to, done: true };
  const amount = time / length;
  const damping = 0.75;
  const frequency = 11.5;
  const damped = Math.sqrt(1 - damping * damping);
  const response = Math.max(0, 1 - Math.exp(-damping * frequency * amount) * (
    Math.cos(frequency * damped * amount) + damping / damped * Math.sin(frequency * damped * amount)
  ));
  const position = response > 1
    ? to + Math.sign(distance) * 16 * Math.tanh((response - 1) * Math.abs(distance) / 16)
    : from + distance * response;
  return { position, done: false };
}

export function createScrollSettler({
  onFrame,
  onFinish,
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = id => cancelAnimationFrame(id),
  now = () => performance.now(),
} = {}) {
  let state = { busy: false, position: 0 };
  let frameId = null;
  let generation = 0;
  const getState = () => ({ ...state });

  function cancel() {
    generation += 1;
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
    state.busy = false;
    return getState();
  }

  function start(from, to, { duration = DEFAULT_DURATION } = {}) {
    cancel();
    if (!finite(from) || !finite(to)) return getState();
    const token = generation;
    const length = durationOf(duration);
    const started = now();
    let elapsed = 0;
    state = { busy: true, position: from };

    function paint(time) {
      const frame = scrollSettleFrame(time, { from, to, duration: length });
      state = { busy: !frame.done, position: frame.position };
      onFrame?.(state.position);
      if (token !== generation) return;
      if (frame.done) onFinish?.(getState());
      else frameId = requestFrame(tick);
    }

    function tick() {
      if (token !== generation || !state.busy) return;
      frameId = null;
      const time = now();
      // A stalled clock must fail open, while an older timestamp may not
      // rewind a gesture that has already reached its owned position.
      elapsed = finite(time) ? Math.max(elapsed, time - started, 0) : length;
      paint(elapsed);
    }

    paint(finite(started) ? 0 : length);
    return getState();
  }

  return { start, cancel, getState };
}
