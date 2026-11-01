import test from 'node:test';
import assert from 'node:assert/strict';
import { contextSceneFrame, contextPose } from '../../assets/context-timeline.js';

const input = { base: { x: 90, y: 120 }, center: { x: 265, y: 286 }, rotation: -8, depth: 1.2 };
const samples = Array.from({ length: 1001 }, (_, index) => contextSceneFrame(index / 1000));
const atArt = progress => 0.26 + 0.74 * progress;

test('the scene starts as one point with no cards or final copy', () => {
  assert.deepEqual(contextSceneFrame(0), {
    progress: 0, textProgress: 0, coreReveal: 0, coreAnchorOffset: 1,
    coreY: 0.22, coreOpacity: 1, introOpacity: 1, copyOpacity: 0,
  });
  for (let index = 0; index < 7; index++) {
    const pose = contextPose({ ...input, index, progress: 0 });
    assert.equal(pose.x, 175);
    assert.equal(pose.y, 166);
    assert.equal(pose.opacity, 0);
    assert.equal(pose.scale, 0.18);
  }
});

test('the value statement fills completely before the mark expands or cards depart', () => {
  assert.equal(contextSceneFrame(0.12).textProgress, 0.5);
  assert.equal(contextSceneFrame(0.24).textProgress, 1);
  assert.equal(contextSceneFrame(0.30).introOpacity, 1);
  assert.equal(contextSceneFrame(0.40).introOpacity, 0);
  assert.ok(contextSceneFrame(0.40).coreReveal > 0);
  assert.ok(contextPose({ ...input, progress: 0.52 }).opacity > 0);
  for (const frame of samples) {
    const card = contextPose({ ...input, progress: frame.progress });
    if (frame.progress <= 0.30) {
      assert.equal(frame.coreReveal, 0);
      assert.equal(frame.introOpacity, 1);
      assert.equal(card.opacity, 0);
    }
    if (frame.coreReveal > 0 || card.opacity > 0) assert.equal(frame.textProgress, 1);
    if (frame.progress < 0.51) assert.equal(card.opacity, 0);
  }
});

test('one opaque lower lobe uncovers the mark continuously before context spreads', () => {
  assert.equal(contextSceneFrame(atArt(0.12)).coreReveal, 0);
  assert.equal(contextSceneFrame(atArt(0.34)).coreReveal, 1);
  const middle = contextSceneFrame(atArt(0.23));
  assert.ok(middle.coreReveal > 0 && middle.coreReveal < 1);
  assert.equal(middle.coreAnchorOffset + middle.coreReveal, 1);
  assert.equal(middle.coreOpacity, 1);
  for (const edge of [0.24, 0.26, 0.30, 0.40, ...[0.12, 0.14, 0.34, 0.4, 0.75, 0.88].map(atArt)]) {
    const before = contextSceneFrame(edge - 0.000001);
    const after = contextSceneFrame(edge + 0.000001);
    for (const key of ['textProgress', 'coreReveal', 'coreAnchorOffset', 'coreY', 'introOpacity', 'copyOpacity']) {
      assert.ok(Math.abs(before[key] - after[key]) < 0.0001, `${key} must not jump at ${edge}`);
    }
  }
});

test('the core settles before final copy and all reveal values stay ordered', () => {
  assert.equal(contextSceneFrame(atArt(0.4)).coreY, 0.5);
  assert.equal(contextSceneFrame(atArt(0.4), { mobile: true }).coreY, 0.4);
  assert.equal(contextSceneFrame(0.4).introOpacity, 0);
  assert.equal(contextSceneFrame(atArt(0.75)).copyOpacity, 0);
  assert.equal(contextSceneFrame(atArt(0.88)).copyOpacity, 1);
  let previous = samples[0];
  for (const frame of samples) {
    for (const key of ['textProgress', 'coreReveal', 'coreY', 'copyOpacity']) assert.ok(frame[key] >= previous[key]);
    for (const key of ['coreAnchorOffset', 'introOpacity']) assert.ok(frame[key] <= previous[key]);
    assert.ok(Object.values(frame).every(value => Number.isFinite(value) && value >= 0 && value <= 1));
    assert.equal(frame.coreOpacity, 1);
    assert.equal(frame.coreAnchorOffset + frame.coreReveal, 1);
    previous = frame;
  }
});

test('individual cards depart in order and all reach full size by the copy reveal', () => {
  const starts = [];
  for (let index = 0; index < 7; index++) {
    const start = atArt(0.34 + index * 0.035);
    assert.equal(contextPose({ ...input, index, progress: start }).opacity, 0);
    starts.push(Array.from({ length: 1001 }, (_, step) => step / 1000).find(progress => contextPose({ ...input, index, progress }).opacity > 0));
    const end = contextPose({ ...input, index, progress: atArt(0.79) });
    assert.equal(end.opacity, 1);
    assert.equal(end.scale, 1);
  }
  assert.equal(new Set(starts).size, 7);
  assert.ok(starts.every((value, index) => index === 0 || value > starts[index - 1]));
  assert.ok(contextSceneFrame(atArt(0.79)).copyOpacity < 1);
});

test('a card follows a small curved flight from the point and lands exactly', () => {
  const config = { ...input, intensity: 0, index: 0 };
  const beginning = contextPose({ ...config, progress: atArt(0.34) });
  for (const [key, value] of Object.entries({ x: 175, y: 166, rotation: 0, scale: 0.18, opacity: 0 })) {
    assert.ok(Math.abs(beginning[key] - value) < 1e-10, `${key} must begin at the shared point`);
  }
  assert.deepEqual(contextPose({ ...config, progress: atArt(0.58) }), { x: 0, y: 0, rotation: -8, scale: 1, opacity: 1 });
  const pose = contextPose({ ...config, progress: atArt(0.46) });
  const distanceFromLine = Math.abs(175 * pose.y - 166 * pose.x) / Math.hypot(175, 166);
  assert.ok(distanceFromLine > 2 && distanceFromLine <= 20);
  assert.ok(pose.x >= -20 && pose.x <= 195 && pose.y >= -20 && pose.y <= 186);
});

test('landed cards preserve the bounded local pointer response', () => {
  const resting = contextPose({ ...input, progress: 1 });
  const near = contextPose({ ...input, progress: 1, pointer: { x: 80, y: 120 } });
  assert.ok(near.x > resting.x);
  assert.ok(near.x - resting.x < 10);
  assert.equal(near.y, resting.y);
  const next = contextPose({ ...input, progress: 1, pointer: { x: 79.9, y: 120 } });
  assert.ok(Math.abs(next.x - near.x) < 0.02);
  assert.deepEqual(contextPose({ ...input, pointer: { x: 1000, y: 120 } }), resting);
  assert.ok(Object.values(contextPose({ ...input, pointer: input.base })).every(Number.isFinite));
});

test('mobile idle motion stays small and each card has its own current', () => {
  const poses = Array.from({ length: 501 }, (_, index) => contextPose({ ...input, progress: 1, time: index * 40, intensity: 0.5 }));
  assert.ok(poses.every(pose => Math.abs(pose.x) <= 2 && Math.abs(pose.y) <= 2.3));
  assert.ok(poses.every(pose => Math.abs(pose.rotation - input.rotation) <= 0.34));
  assert.ok(new Set(poses.map(pose => pose.x)).size > 100);
  assert.notDeepEqual(contextPose({ ...input, time: 1000, index: 1 }), contextPose({ ...input, time: 1000, index: 2 }));
});

test('reduced motion exposes the complete stationary composition', () => {
  for (const progress of [0, 0.3, 1]) {
    const frame = contextSceneFrame(progress, { reducedMotion: true });
    assert.equal(frame.progress, 1);
    assert.equal(frame.textProgress, 1);
    assert.equal(frame.coreReveal, 1);
    assert.equal(frame.coreAnchorOffset, 0);
    assert.equal(frame.coreY, 0.5);
    assert.equal(frame.copyOpacity, 1);
    assert.equal(frame.introOpacity, 0);
    assert.equal(contextSceneFrame(progress, { reducedMotion: true, mobile: true }).coreY, 0.4);
    assert.deepEqual(contextPose({ ...input, progress, time: 9000, pointer: input.base, reducedMotion: true }), { x: 0, y: 0, rotation: -8, scale: 1, opacity: 1 });
  }
});

test('reverse playback and fast jumps reconstruct the same text fill, point, and cards', () => {
  const values = [0, 0.12, 0.24, 0.26, 0.30, 0.3488, 0.38, 0.4, 0.52, 0.75, 0.9112, 1];
  const forward = values.map(progress => ({ frame: contextSceneFrame(progress), pose: contextPose({ ...input, progress, time: 4000 }) }));
  assert.deepEqual([...values].reverse().map(progress => ({ frame: contextSceneFrame(progress), pose: contextPose({ ...input, progress, time: 4000 }) })).reverse(), forward);
  assert.deepEqual({ frame: contextSceneFrame(1), pose: contextPose({ ...input, progress: 1, time: 4000 }) }, forward.at(-1));
});

test('invalid timeline or pointer values cannot leak into transforms', () => {
  for (const value of [NaN, Infinity, -Infinity, undefined]) {
    assert.ok(Object.values(contextSceneFrame(value)).every(Number.isFinite));
    const pose = contextPose({ progress: value, time: value, index: value, rotation: value, depth: value, base: { x: value }, pointer: { x: value, y: value } });
    assert.ok(Object.values(pose).every(Number.isFinite));
  }
  assert.deepEqual(contextSceneFrame(-1), contextSceneFrame(0));
  assert.deepEqual(contextSceneFrame(2), contextSceneFrame(1));
});
