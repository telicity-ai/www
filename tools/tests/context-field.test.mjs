import test from 'node:test';
import assert from 'node:assert/strict';
import { contextPose } from '../../assets/context-field.js';

const input = { base: { x: 90, y: 120 }, center: { x: 265, y: 286 }, rotation: -8, depth: 1.2 };

test('context unfolds from the twin and settles before the next section', () => {
  const beginning = contextPose({ ...input, progress: 0 });
  assert.equal(beginning.opacity, 0);
  assert.equal(beginning.scale, 0.18);
  assert.equal(beginning.x, 175);
  assert.equal(beginning.y, 166);
  for (let index = 0; index < 7; index++) {
    const end = contextPose({ ...input, index, progress: 1 });
    assert.equal(end.opacity, 1);
    assert.equal(end.scale, 1);
    assert.ok(Math.abs(end.x) < 5 && Math.abs(end.y) < 6);
  }
});

test('cards unfold at different points instead of appearing as one block', () => {
  const poses = [0, 1, 2, 3, 4, 5, 6].map(index => contextPose({ ...input, progress: 0.45, index }));
  assert.ok(poses[0].opacity > 0);
  assert.equal(poses.at(-1).opacity, 0);
  assert.ok(new Set(poses.map(pose => pose.x)).size >= 4);
});

test('nearby pointer motion is small, continuous, and pushes away from the cursor', () => {
  const resting = contextPose({ ...input, progress: 1 });
  const near = contextPose({ ...input, progress: 1, pointer: { x: 80, y: 120 } });
  assert.ok(near.x > resting.x);
  assert.ok(near.x - resting.x < 10);
  assert.equal(near.y, resting.y);
  const farther = contextPose({ ...input, progress: 1, pointer: { x: 79.9, y: 120 } });
  assert.ok(Math.abs(farther.x - near.x) < 0.02);
  assert.deepEqual(contextPose({ ...input, progress: 1, pointer: { x: 1000, y: 120 } }), resting);
  assert.ok(Object.values(contextPose({ ...input, pointer: input.base })).every(Number.isFinite));
});

test('idle currents stay within the mobile movement budget and have independent rhythms', () => {
  const samples = Array.from({ length: 501 }, (_, index) => contextPose({ ...input, progress: 1, time: index * 40, intensity: 0.5 }));
  assert.ok(samples.every(pose => Math.abs(pose.x) <= 2 && Math.abs(pose.y) <= 2.3));
  assert.ok(new Set(samples.map(pose => pose.x)).size > 100);
  assert.notDeepEqual(contextPose({ ...input, time: 1000, index: 1 }), contextPose({ ...input, time: 1000, index: 2 }));
});

test('motion reduction is fully visible and stationary regardless of progress or pointer', () => {
  for (const progress of [0, 0.2, 1]) {
    assert.deepEqual(contextPose({ ...input, progress, time: 9000, pointer: input.base, reducedMotion: true }), { x: 0, y: 0, rotation: -8, scale: 1, opacity: 1 });
  }
});

test('reversing and jumping reconstruct the same context at the same instant', () => {
  const values = [0, 0.1, 0.3, 0.6, 1];
  const forward = values.map(progress => contextPose({ ...input, progress, time: 4000 }));
  assert.deepEqual([...values].reverse().map(progress => contextPose({ ...input, progress, time: 4000 })).reverse(), forward);
  assert.deepEqual(contextPose({ ...input, progress: 1, time: 4000 }), forward.at(-1));
});

test('invalid pointer and timeline data never create unusable transforms', () => {
  for (const value of [NaN, Infinity, -Infinity, undefined]) {
    const pose = contextPose({ progress: value, time: value, index: value, rotation: value, depth: value, base: { x: value }, pointer: { x: value, y: value } });
    assert.ok(Object.values(pose).every(Number.isFinite));
  }
});
