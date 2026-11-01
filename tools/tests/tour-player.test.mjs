import test from 'node:test';
import assert from 'node:assert/strict';
import { STEP_RANGES, STEP_DURATIONS, createStepPlayer, createGestureGate } from '../../assets/tour-player.js';
import { collaborationFrame } from '../../assets/collaboration.js';

function harness() {
  let time = 0;
  let nextId = 0;
  const pending = new Map();
  const callbacks = new Map();
  const frames = [];
  const states = [];
  const player = createStepPlayer({
    now: () => time,
    requestFrame(callback) {
      const id = ++nextId;
      pending.set(id, callback);
      callbacks.set(id, callback);
      return id;
    },
    cancelFrame(id) { pending.delete(id); },
    onFrame(progress, step) { frames.push({ progress, step }); },
    onState(state) { states.push(state); },
  });
  return {
    player, frames, states, pending, callbacks,
    advance(milliseconds) {
      time += milliseconds;
      const jobs = [...pending.values()];
      pending.clear();
      jobs.forEach(callback => callback(time));
    },
  };
}

test('construction is silent and exposes an independent initial state snapshot', () => {
  const h = harness();
  assert.deepEqual(h.player.getState(), { progress: 0, step: 0, completed: 0, busy: false });
  assert.equal(h.frames.length, 0);
  assert.equal(h.states.length, 0);
  const snapshot = h.player.getState();
  snapshot.progress = 1;
  assert.equal(h.player.getState().progress, 0);
});

test('the first scene plays through the campaign click and opens Pocket', () => {
  const h = harness();
  h.player.play(0);
  assert.deepEqual(h.frames.at(-1), { progress: 0, step: 0 });
  assert.equal(h.player.getState().busy, true);
  h.advance(STEP_DURATIONS[0] / 2);
  assert.equal(h.player.getState().progress, 0.15);
  h.advance(STEP_DURATIONS[0] / 2);
  assert.deepEqual(h.player.getState(), { progress: 0.30, step: 0, completed: 1, busy: false });
  assert.equal(collaborationFrame(h.player.getState().progress).scene, 1);
  assert.equal(h.pending.size, 0);
});

test('one work scene completes on its own clock while preserving its logical step', () => {
  const h = harness();
  h.player.play(1);
  const elapsed = Math.floor(STEP_DURATIONS[1] * 0.4);
  h.advance(elapsed);
  assert.ok(Math.abs(h.player.getState().progress - (0.30 + 0.27 * elapsed / STEP_DURATIONS[1])) < 1e-12);
  assert.equal(h.frames.at(-1).step, 1);
  assert.equal(h.player.getState().completed, 1);
  h.advance(STEP_DURATIONS[1] - elapsed);
  assert.deepEqual(h.player.getState(), { progress: 0.57, step: 1, completed: 2, busy: false });
  assert.deepEqual(h.states.map(state => state.busy), [true, false]);
});

test('the final scene reaches all three votes, celebration, and completed reactions', () => {
  const h = harness();
  h.player.play(2);
  h.advance(STEP_DURATIONS[2]);
  const frame = collaborationFrame(h.player.getState().progress);
  assert.equal(frame.voteCount, 3);
  assert.equal(frame.voteProgress, 1);
  assert.equal(frame.celebration, 1);
  assert.deepEqual(frame.reactions, [1, 1, 1]);
  assert.deepEqual(h.player.getState(), { progress: 1, step: 2, completed: 3, busy: false });
});

test('reverse playback returns to the previous completed step without a jump', () => {
  const h = harness();
  h.player.play(2, { reverse: true });
  assert.deepEqual(h.frames.at(-1), { progress: 1, step: 2 });
  h.advance(STEP_DURATIONS[2] / 2);
  assert.ok(Math.abs(h.player.getState().progress - 0.785) < 1e-12);
  h.advance(STEP_DURATIONS[2] / 2);
  assert.deepEqual(h.player.getState(), { progress: 0.57, step: 1, completed: 2, busy: false });
  h.player.play(1, { reverse: true });
  h.advance(STEP_DURATIONS[1]);
  assert.deepEqual(h.player.getState(), { progress: 0.30, step: 0, completed: 1, busy: false });
  h.player.play(0, { reverse: true });
  h.advance(STEP_DURATIONS[0]);
  assert.deepEqual(h.player.getState(), { progress: 0, step: 0, completed: 0, busy: false });
});

test('each scroll step finishes within 1.5 seconds in either direction', () => {
  for (let step = 0; step < STEP_RANGES.length; step++) {
    assert.ok(STEP_DURATIONS[step] > 0 && STEP_DURATIONS[step] <= 1500, 'a gesture may not start an animation longer than 1.5 seconds');
    for (const reverse of [false, true]) {
      const h = harness();
      h.player.play(step, { reverse });
      h.advance(STEP_DURATIONS[step] - 1);
      assert.equal(h.player.getState().busy, true, 'a step should play its full intended motion');
      h.advance(1);
      const state = h.player.getState();
      assert.equal(state.busy, false);
      assert.equal(state.progress, STEP_RANGES[step][reverse ? 0 : 1]);
      assert.equal(h.pending.size, 0);
    }
  }
});

test('instant playback presents only the completed frame and schedules no animation', () => {
  const h = harness();
  h.player.play(1, { instant: true });
  assert.deepEqual(h.frames, [{ progress: 0.57, step: 1 }]);
  assert.deepEqual(h.states, [{ progress: 0.57, step: 1, completed: 2, busy: false }]);
  assert.equal(h.pending.size, 0);
  h.player.play(1, { reverse: true, instant: true });
  assert.deepEqual(h.player.getState(), { progress: 0.30, step: 0, completed: 1, busy: false });
});

test('a new scene cancels the old run and ignores an already-delivered stale callback', () => {
  const h = harness();
  h.player.play(0);
  const stale = [...h.callbacks.values()][0];
  h.advance(500);
  h.player.play(2);
  const current = h.player.getState();
  const frameCount = h.frames.length;
  stale();
  assert.deepEqual(h.player.getState(), current);
  assert.equal(h.frames.length, frameCount);
  assert.equal(h.pending.size, 1);
  h.advance(STEP_DURATIONS[2]);
  assert.equal(h.player.getState().progress, 1);
});

test('cancel stops animation and does not render another frame', () => {
  const h = harness();
  h.player.play(2);
  h.advance(800);
  const stale = [...h.pending.values()][0];
  const before = h.player.getState();
  const frameCount = h.frames.length;
  h.player.cancel();
  stale();
  h.advance(10000);
  assert.equal(h.frames.length, frameCount);
  assert.deepEqual(h.player.getState(), { ...before, busy: false });
  assert.equal(h.pending.size, 0);
  assert.equal(h.states.at(-1).busy, false);
});

test('show and reset cancel playback and present explicit completed or initial states', () => {
  const h = harness();
  h.player.play(2);
  const stale = [...h.pending.values()][0];
  h.player.show(1);
  assert.deepEqual(h.player.getState(), { progress: STEP_RANGES[1][1], step: 1, completed: 2, busy: false });
  stale();
  assert.equal(h.pending.size, 0);
  h.player.show(0, 0.18, 0);
  assert.deepEqual(h.player.getState(), { progress: 0.18, step: 0, completed: 0, busy: false });
  h.player.reset();
  assert.deepEqual(h.player.getState(), { progress: 0, step: 0, completed: 0, busy: false });
});

test('large frame delays finish at an exact boundary without overshooting', () => {
  const h = harness();
  h.player.play(1);
  h.advance(100000);
  assert.equal(h.player.getState().progress, 0.57);
  assert.equal(h.player.getState().busy, false);
  assert.equal(h.pending.size, 0);
});

test('callbacks may cancel a run without leaving a hidden animation scheduled', () => {
  let player;
  let scheduled = 0;
  player = createStepPlayer({
    requestFrame: () => ++scheduled,
    cancelFrame: () => {},
    now: () => 0,
    onFrame: () => player.cancel(),
  });
  player.play(0);
  assert.equal(player.getState().busy, false);
  assert.equal(scheduled, 0);
});

test('trackpad momentum is one gesture until there is a full idle interval', () => {
  const gate = createGestureGate();
  assert.equal(gate.consume(0), true);
  assert.equal(gate.consume(40), false);
  assert.equal(gate.consume(150), false);
  assert.equal(gate.consume(300), false);
  assert.equal(gate.consume(519), false);
  assert.equal(gate.consume(739), true);
  assert.equal(gate.consume(750), false);
  gate.reset();
  assert.equal(gate.consume(751), true);
});

test('inputs discarded during a scene do not reserve a gesture for the next scene', () => {
  const gate = createGestureGate();
  const h = harness();
  assert.equal(gate.consume(0), true);
  h.player.play(0);
  const duration = STEP_DURATIONS[0];
  gate.consume(duration * 0.2);
  gate.consume(duration * 0.6);
  gate.consume(duration - 10);
  h.advance(duration);
  assert.equal(gate.consume(duration + 10), false);
  assert.equal(h.player.getState().completed, 1);
  assert.equal(h.pending.size, 0);
  assert.equal(gate.consume(duration + 230), true);
});

test('invalid or stale gesture timestamps cannot prematurely release the latch', () => {
  const gate = createGestureGate(200);
  assert.equal(gate.consume(100), true);
  assert.equal(gate.consume(NaN), false);
  assert.equal(gate.consume(90), false);
  assert.equal(gate.consume(250), false);
  assert.equal(gate.consume(450), true);
});
