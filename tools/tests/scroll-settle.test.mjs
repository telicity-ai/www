import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollSettleFrame, createScrollSettler } from '../../assets/scroll-settle.js';

const almost = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

function harness(overrides = {}) {
  let time = 0;
  let nextId = 0;
  const pending = new Map();
  const callbacks = new Map();
  const frames = [];
  const finishes = [];
  const settler = createScrollSettler({
    now: () => time,
    requestFrame(callback) { const id = ++nextId; pending.set(id, callback); callbacks.set(id, callback); return id; },
    cancelFrame(id) { pending.delete(id); },
    onFrame(position) { frames.push(position); },
    onFinish(state) { finishes.push(state); },
    ...overrides,
  });
  return {
    settler, frames, finishes, pending, callbacks,
    advance(duration) {
      time += duration;
      const jobs = [...pending.values()];
      pending.clear();
      jobs.forEach(callback => callback(time));
    },
  };
}

test('the page starts at its current position and ends at the exact owned anchor', () => {
  assert.deepEqual(scrollSettleFrame(0, { from: 400, to: 800 }), { position: 400, done: false });
  assert.deepEqual(scrollSettleFrame(920, { from: 400, to: 800 }), { position: 800, done: true });
  assert.deepEqual(scrollSettleFrame(100000, { from: 400, to: 800 }), { position: 800, done: true });
  assert.deepEqual(scrollSettleFrame(220, { from: 800, to: 800 }), { position: 800, done: true });
});

test('arrival crosses the anchor slightly and then settles rather than stopping abruptly', () => {
  const positions = Array.from({ length: 921 }, (_, time) => scrollSettleFrame(time, { from: 400, to: 800 }).position);
  const peak = Math.max(...positions);
  const peakTime = positions.indexOf(peak);
  assert.ok(peak > 804 && peak < 812, 'a normal entry should exceed the target by one to three percent');
  assert.ok(peakTime > 250 && peakTime < 600);
  assert.ok(positions[700] < peak);
  assert.ok(Math.abs(positions[919] - 800) < 0.5);
  for (let time = 1; time < positions.length; time++) assert.ok(Math.abs(positions[time] - positions[time - 1]) < 3);
});

test('large gestures cannot overshoot by more than sixteen pixels', () => {
  for (const [from, to] of [[0, 10000], [10000, 0], [800, 900], [900, 800]]) {
    const direction = Math.sign(to - from);
    const values = Array.from({ length: 921 }, (_, time) => scrollSettleFrame(time, { from, to }).position);
    assert.ok(values.every(position => (position - to) * direction <= 16));
    assert.ok(values.some(position => (position - to) * direction > 0));
  }
});

test('the same arrival works in both directions and at a custom duration', () => {
  for (let time = 0; time <= 1400; time += 7) {
    const forward = scrollSettleFrame(time, { from: 400, to: 800, duration: 1400 });
    const reverse = scrollSettleFrame(time, { from: 800, to: 400, duration: 1400 });
    almost(forward.position + reverse.position, 1200);
    assert.equal(forward.done, reverse.done);
  }
  assert.equal(scrollSettleFrame(920, { from: 0, to: 800, duration: 1400 }).done, false);
  assert.deepEqual(scrollSettleFrame(1400, { from: 0, to: 800, duration: 1400 }), { position: 800, done: true });
});

test('invalid endpoints and clocks remain finite and zero duration finishes immediately', () => {
  for (const invalid of [NaN, Infinity, -Infinity, undefined]) {
    const frame = scrollSettleFrame(invalid, { from: invalid, to: 500 });
    assert.deepEqual(frame, { position: 500, done: true });
    assert.deepEqual(scrollSettleFrame(0, { from: 200, to: invalid }), { position: 200, done: true });
    assert.deepEqual(scrollSettleFrame(invalid, { from: 200, to: 500 }), { position: 200, done: false });
  }
  assert.deepEqual(scrollSettleFrame(-100, { from: 200, to: 500 }), { position: 200, done: false });
  assert.deepEqual(scrollSettleFrame(0, { from: 200, to: 500, duration: 0 }), { position: 500, done: true });
  assert.deepEqual(scrollSettleFrame(0, { from: -1e308, to: 1e308 }), { position: 1e308, done: true });
});

test('construction is silent and state snapshots cannot change playback', () => {
  const h = harness();
  assert.deepEqual(h.settler.getState(), { busy: false, position: 0 });
  assert.equal(h.frames.length, 0);
  const state = h.settler.getState();
  state.busy = true;
  state.position = 1000;
  assert.deepEqual(h.settler.getState(), { busy: false, position: 0 });
});

test('the driver finishes once, including after a delayed animation frame', () => {
  const h = harness();
  h.settler.start(400, 800);
  assert.deepEqual(h.frames, [400]);
  assert.equal(h.settler.getState().busy, true);
  h.advance(400);
  assert.ok(h.settler.getState().position > 800);
  h.advance(10000);
  assert.deepEqual(h.settler.getState(), { busy: false, position: 800 });
  assert.deepEqual(h.finishes, [{ busy: false, position: 800 }]);
  assert.equal(h.pending.size, 0);
  h.advance(10000);
  assert.equal(h.finishes.length, 1);
});

test('cancel stops frame and finish callbacks, including a stale delivered job', () => {
  const h = harness();
  h.settler.start(400, 800);
  h.advance(300);
  const stale = [...h.pending.values()][0];
  const position = h.settler.getState().position;
  h.settler.cancel();
  const count = h.frames.length;
  stale();
  h.advance(5000);
  assert.equal(h.frames.length, count);
  assert.equal(h.finishes.length, 0);
  assert.deepEqual(h.settler.getState(), { busy: false, position });
});

test('starting another entry supersedes the old generation without queued callbacks', () => {
  const h = harness();
  h.settler.start(400, 800);
  const stale = [...h.callbacks.values()][0];
  h.advance(200);
  h.settler.start(h.settler.getState().position, 1200);
  const current = h.settler.getState();
  const count = h.frames.length;
  stale();
  assert.deepEqual(h.settler.getState(), current);
  assert.equal(h.frames.length, count);
  assert.equal(h.pending.size, 1);
  h.advance(920);
  assert.deepEqual(h.finishes, [{ busy: false, position: 1200 }]);
});

test('cancellation inside the first position callback cannot schedule another frame', () => {
  let settler;
  const pending = [];
  settler = createScrollSettler({
    now: () => 0,
    requestFrame(callback) { pending.push(callback); return 1; },
    cancelFrame() {},
    onFrame() { settler.cancel(); },
    onFinish() { assert.fail('cancelled entry cannot finish'); },
  });
  settler.start(400, 800);
  assert.equal(pending.length, 0);
  assert.equal(settler.getState().busy, false);
});

test('instant and zero-distance entries finish synchronously without an animation job', () => {
  const h = harness();
  h.settler.start(400, 800, { duration: 0 });
  h.settler.start(800, 800);
  assert.deepEqual(h.frames, [800, 800]);
  assert.equal(h.finishes.length, 2);
  assert.equal(h.pending.size, 0);
});

test('an invalid new entry cancels old playback without moving the page', () => {
  const h = harness();
  h.settler.start(400, 800);
  h.advance(250);
  const position = h.settler.getState().position;
  const count = h.frames.length;
  h.settler.start(NaN, 1000);
  assert.deepEqual(h.settler.getState(), { busy: false, position });
  assert.equal(h.frames.length, count);
  assert.equal(h.finishes.length, 0);
  assert.equal(h.pending.size, 0);
});

test('regressing or stalled clocks cannot rewind or trap an entry forever', () => {
  const h = harness();
  h.settler.start(400, 800);
  h.advance(300);
  const position = h.settler.getState().position;
  h.advance(-100);
  assert.equal(h.settler.getState().position, position);
  h.advance(Infinity);
  assert.deepEqual(h.settler.getState(), { busy: false, position: 800 });
  assert.equal(h.finishes.length, 1);
});
