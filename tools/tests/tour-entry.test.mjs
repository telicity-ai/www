import test from 'node:test';
import assert from 'node:assert/strict';
import { createTourEntryGuard } from '../../assets/tour-entry.js';
import { createStepPlayer, STEP_DURATIONS } from '../../assets/tour-player.js';

function harness() {
  let time = 0;
  let nextId = 0;
  const pending = new Map();
  const aligned = [];
  const player = createStepPlayer({
    now: () => time,
    requestFrame(callback) { pending.set(++nextId, callback); return nextId; },
    cancelFrame(id) { pending.delete(id); },
  });
  const guard = createTourEntryGuard({ onAlign: position => aligned.push(position) });
  return {
    player, guard, aligned,
    advance(duration) {
      time += duration;
      const frames = [...pending.values()];
      pending.clear();
      frames.forEach(frame => frame());
    },
  };
}

test('entry inertia cannot turn the first playback into the final step', () => {
  const h = harness();
  h.guard.capture(1120); // First boundary in a track starting at 1000.
  h.player.play(0);
  h.advance(STEP_DURATIONS[0] / 2);
  const before = h.player.getState();
  assert.equal(h.guard.handleScroll(1350), true); // Formerly rounded to step 3.
  assert.deepEqual(h.aligned, [1120]);
  assert.deepEqual(h.player.getState(), before);
  assert.equal(h.player.getState().busy, true);
  assert.equal(h.player.getState().completed, 0);
  h.advance(STEP_DURATIONS[0] / 2);
  assert.equal(h.player.getState().completed, 1);
  assert.equal(h.player.getState().progress, 0.30);
});

test('gesture tails after completion stay on step one until another explicit play', () => {
  const h = harness();
  h.guard.capture(1120);
  h.player.play(0);
  h.advance(STEP_DURATIONS[0]);
  for (const raw of [1360, 1410, 1100, 1120]) assert.equal(h.guard.handleScroll(raw), true);
  assert.deepEqual(h.aligned, [1120, 1120, 1120]);
  assert.equal(h.player.getState().completed, 1);
  assert.equal(h.player.getState().busy, false);
  h.guard.update(1240);
  h.player.play(1);
  h.advance(STEP_DURATIONS[1]);
  assert.equal(h.player.getState().completed, 2);
  assert.equal(h.guard.getState().position, 1240);
});

test('matching alignment events are consumed without causing a correction loop', () => {
  const aligned = [];
  const guard = createTourEntryGuard({ onAlign: value => {
    aligned.push(value);
    assert.equal(guard.handleScroll(value), true);
  } });
  guard.capture(1120.25);
  for (const raw of [1120, 1120.25, 1124.25]) assert.equal(guard.handleScroll(raw), true);
  assert.deepEqual(aligned, []);
  assert.equal(guard.handleScroll(1250), true);
  assert.deepEqual(aligned, [1120.25]);
});

test('release allows native navigation without changing the current playback state', () => {
  const h = harness();
  h.guard.capture(1120);
  h.player.play(0);
  h.advance(STEP_DURATIONS[0]);
  h.guard.release();
  assert.equal(h.guard.handleScroll(1600), false);
  assert.deepEqual(h.aligned, []);
  assert.equal(h.player.getState().completed, 1);
  assert.deepEqual(h.guard.getState(), { captured: false, position: null });
});

test('resize updates the captured boundary but cannot acquire a released page', () => {
  const h = harness();
  h.guard.update(900);
  assert.equal(h.guard.handleScroll(1000), false);
  h.guard.capture(1120);
  h.guard.update(980);
  assert.equal(h.guard.handleScroll(1120), true);
  assert.deepEqual(h.aligned, [980]);
  h.guard.release();
  h.guard.update(600);
  assert.equal(h.guard.handleScroll(1120), false);
});

test('invalid boundaries are ignored and captured overscroll is still corrected', () => {
  const h = harness();
  for (const value of [NaN, Infinity, -1, undefined]) h.guard.capture(value);
  assert.equal(h.guard.handleScroll(1200), false);
  h.guard.capture(0);
  for (const value of [NaN, Infinity, -1, undefined]) h.guard.update(value);
  assert.equal(h.guard.handleScroll(-20), true);
  assert.equal(h.guard.handleScroll(NaN), true);
  assert.deepEqual(h.aligned, [0]);
  const snapshot = h.guard.getState();
  snapshot.position = 900;
  assert.equal(h.guard.getState().position, 0);
});
