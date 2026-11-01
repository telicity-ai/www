import test from 'node:test';
import assert from 'node:assert/strict';
import { collaborationFrame, previewProgress, mousePath, confettiParticle, workPose, votePose } from '../../assets/collaboration.js';
import { recordPointerPosition, getPointerPosition, clearPointerPosition } from '../../assets/pointer-position.js';

const frames = Array.from({ length: 1001 }, (_, index) => collaborationFrame(index / 1000));
const distinct = values => values.filter((value, index) => index === 0 || value !== values[index - 1]);
const coordinates = point => ({ x: point.x, y: point.y });

test('the pointer approaches and clicks the brief before Home opens Pocket', () => {
  assert.deepEqual(distinct(frames.map(frame => frame.scene)), [0, 1, 2]);
  const firstPocket = frames.findIndex(frame => frame.scene === 1);
  assert.ok(frames.slice(0, firstPocket).some(frame => frame.beat === 'approach'));
  assert.ok(frames.slice(0, firstPocket).some(frame => frame.pressed));
  assert.ok(frames.filter(frame => frame.pressed).every(frame => frame.scene === 0));
  assert.equal(frames[firstPocket].pressed, false);
});

test('working together precedes voting on the same proposal', () => {
  const working = frames.findIndex(frame => frame.beat === 'collaborate');
  const proposal = frames.findIndex(frame => frame.scene === 2);
  const firstVote = frames.findIndex(frame => frame.voteCount > 0);
  assert.ok(working > 0 && working < proposal && proposal < firstVote);
  assert.ok(frames.filter(frame => frame.scene < 2).every(frame => frame.voteCount === 0));
});

test('the three cursor votes arrive individually before unanimous agreement', () => {
  assert.deepEqual(distinct(frames.map(frame => frame.voteCount)), [0, 1, 2, 3]);
  assert.ok(frames.some(frame => frame.voteCount === 3 && !frame.agreed));
  for (const frame of frames.filter(frame => frame.agreed)) {
    assert.equal(frame.voteCount, 3);
    assert.ok(frame.votes.every(Boolean));
  }
});

test('vote bubbles reveal each cursor vote separately and never before its vote', () => {
  const starts = [0, 1, 2].map(agent => frames.findIndex(frame => frame.voteSignals[agent] > 0));
  assert.ok(starts[0] > 0 && starts[0] < starts[1] && starts[1] < starts[2]);
  for (const frame of frames) {
    assert.equal(frame.voteSignals.length, 3);
    frame.voteSignals.forEach((amount, index) => {
      assert.ok(amount >= 0 && amount <= 1);
      if (amount > 0) assert.ok(frame.votes[index]);
    });
  }
  assert.deepEqual(collaborationFrame(1).voteSignals, [1, 1, 1]);
});

test('the progress circle fills as votes arrive and completes before the celebration', () => {
  let previousProgress = 0;
  for (const frame of frames) {
    assert.ok(frame.voteProgress >= previousProgress && frame.voteProgress <= 1);
    assert.equal(frame.voteProgress, frame.voteSignals.reduce((sum, value) => sum + value, 0) / 3);
    if (frame.voteCount === 0) assert.equal(frame.voteProgress, 0);
    if (frame.agreed || frame.celebration > 0) assert.equal(frame.voteProgress, 1);
    previousProgress = frame.voteProgress;
  }
  assert.ok(frames.some(frame => frame.voteProgress > 0 && frame.voteProgress < 1));
  assert.ok(frames.some(frame => frame.voteProgress === 1 && !frame.agreed && frame.celebration === 0));
});

test('each cursor fills its own circle slot only after arriving', () => {
  for (let index = 0; index < 3; index++) {
    const arrival = frames.findIndex(frame => frame.votes[index]);
    const firstFill = frames.findIndex(frame => frame.voteSignals[index] > 0);
    const fullSlot = frames.findIndex(frame => frame.voteSignals[index] === 1);
    assert.ok(arrival > 0 && firstFill >= arrival && fullSlot > firstFill);
    assert.equal(frames[arrival - 1].voteSignals[index], 0);
    assert.ok(frames[fullSlot].votes[index]);
    assert.ok(frames[fullSlot].progress < frames.find(frame => frame.agreed).progress, 'each slot must finish filling before the shared agreement');
  }
});

test('the confetti burst begins after agreement and ends before thumb reactions', () => {
  const celebrationFrames = frames.filter(frame => frame.celebration > 0);
  assert.ok(celebrationFrames.length > 0);
  for (const frame of celebrationFrames) {
    assert.ok(frame.agreed);
    assert.equal(frame.voteCount, 3);
    assert.equal(frame.voteProgress, 1);
    assert.ok(frame.celebration <= 1);
  }
  assert.equal(collaborationFrame(0).celebration, 0);
  assert.equal(collaborationFrame(1).celebration, 1);
  for (const frame of frames.filter(frame => frame.celebration > 0 && frame.celebration < 1)) {
    assert.deepEqual(frame.reactions, [0, 0, 0]);
  }
});

test('agents react with thumbs one at a time after the burst and keep their reactions', () => {
  const starts = [0, 1, 2].map(agent => frames.findIndex(frame => frame.reactions[agent] > 0));
  const finishes = [0, 1, 2].map(agent => frames.findIndex(frame => frame.reactions[agent] === 1));
  assert.ok(starts[0] > 0 && finishes[0] < starts[1] && finishes[1] < starts[2]);
  for (const frame of frames) {
    frame.reactions.forEach(amount => {
      assert.ok(amount >= 0 && amount <= 1);
      if (amount > 0) {
        assert.ok(frame.agreed);
        assert.equal(frame.celebration, 1);
      }
    });
  }
  assert.deepEqual(collaborationFrame(1).reactions, [1, 1, 1]);
});

test('reverse scrolling removes reactions, celebration, agreement and votes in order', () => {
  const reversed = [...frames].reverse().map(frame => collaborationFrame(frame.progress));
  assert.deepEqual(distinct(reversed.map(frame => frame.voteCount)), [3, 2, 1, 0]);
  assert.deepEqual(distinct(reversed.map(frame => frame.reactions.filter(amount => amount > 0).length)), [3, 2, 1, 0]);
  assert.equal(reversed.at(-1).scene, 0);
  assert.equal(reversed.at(-1).agreed, false);
  assert.equal(reversed.at(-1).celebration, 0);
  assert.equal(reversed.at(-1).voteProgress, 0);
  assert.deepEqual(reversed.at(-1).voteSignals, [0, 0, 0]);
});

test('fast jumps reconstruct the destination without intermediate timers', () => {
  const end = collaborationFrame(1);
  collaborationFrame(0.12);
  collaborationFrame(0.95);
  assert.deepEqual(collaborationFrame(1), end);
  assert.equal(end.scene, 2);
  assert.equal(end.voteCount, 3);
  assert.equal(collaborationFrame(0).pressed, false);
});

test('manual previews match their scenes and show a complete final agreement', () => {
  for (let scene = 0; scene < 3; scene++) assert.equal(collaborationFrame(previewProgress(scene)).scene, scene);
  const finalPreview = collaborationFrame(previewProgress(2));
  assert.ok(finalPreview.agreed);
  assert.equal(finalPreview.voteCount, 3);
  assert.equal(finalPreview.voteProgress, 1);
  assert.deepEqual(finalPreview.voteSignals, [1, 1, 1]);
  assert.deepEqual(finalPreview.reactions, [1, 1, 1]);
});

test('invalid progress cannot create an invalid story state', () => {
  assert.deepEqual(collaborationFrame(-1), collaborationFrame(0));
  assert.deepEqual(collaborationFrame(2), collaborationFrame(1));
  assert.deepEqual(collaborationFrame(NaN), collaborationFrame(0));
  for (const frame of frames) {
    assert.ok(frame.voteSignals.every(amount => amount >= 0 && amount <= 1));
    assert.ok(frame.reactions.every(amount => amount >= 0 && amount <= 1));
    assert.ok(frame.celebration >= 0 && frame.celebration <= 1);
    assert.ok(frame.voteProgress >= 0 && frame.voteProgress <= 1);
    assert.ok([0, 1, 2].includes(frame.scene));
  }
});

test('working cursors stay at the last edit until their own voting turn', () => {
  const points = {
    initial: { x: 60, y: 80 },
    base: { x: 140, y: 190 },
    start: { x: 260, y: 180 },
    end: { x: 304, y: 186 },
  };
  for (let index = 0; index < 3; index++) {
    const beforeBoundary = coordinates(workPose(0.5699, index, points));
    const atBoundary = coordinates(workPose(0.57, index, points));
    assert.deepEqual(atBoundary, points.end);
    assert.ok(Math.hypot(beforeBoundary.x - atBoundary.x, beforeBoundary.y - atBoundary.y) < 1, 'the working cursor must settle at the final edit, without returning to its entry position');
    const target = { x: 370 + index * 18, y: 300 + index * 12 };
    assert.deepEqual(coordinates(votePose(0.57, index, atBoundary, target)), points.end);
    assert.deepEqual(coordinates(workPose(0.8, index, points)), points.end);
  }
});

test('cursors depart at their own times and their flights overlap naturally', () => {
  const positions = [{ x: 145, y: 235 }, { x: 150, y: 170 }, { x: 242, y: 124 }];
  const targets = [{ x: 265, y: 320 }, { x: 284, y: 346 }, { x: 316, y: 325 }];
  const firstMovement = [null, null, null];
  const seenMoving = new Set();
  let maximumMoving = 0;
  for (let step = 570; step <= 840; step++) {
    const progress = step / 1000;
    const moving = positions.flatMap((position, index) => {
      const pose = votePose(progress, index, position, targets[index]);
      const fromStart = Math.hypot(pose.x - position.x, pose.y - position.y);
      const fromTarget = Math.hypot(pose.x - targets[index].x, pose.y - targets[index].y);
      assert.ok(Number.isFinite(pose.x) && Number.isFinite(pose.y));
      if (firstMovement[index] === null && fromStart > 0.001) firstMovement[index] = progress;
      if (collaborationFrame(progress).votes[index]) assert.ok(fromTarget <= 4.001, 'a vote must happen only after its cursor reaches the circle');
      if (fromStart > 0.05 && fromTarget > 4.001) {
        seenMoving.add(index);
        return [index];
      }
      return [];
    });
    maximumMoving = Math.max(maximumMoving, moving.length);
  }
  assert.equal(seenMoving.size, 3);
  assert.ok(maximumMoving >= 2, 'another teammate should already be moving before the first teammate finishes');
  assert.equal(new Set(firstMovement).size, 3, 'the three cursors should not launch on the same frame');
  assert.ok(Math.max(...firstMovement) - Math.min(...firstMovement) >= 0.01, 'departure offsets should be visible rather than differing only by rounding');
});

test('each cursor reaches its circle position, clicks, and stays for the reactions', () => {
  const positions = [{ x: 145, y: 235 }, { x: 150, y: 170 }, { x: 242, y: 124 }];
  const targets = [{ x: 265, y: 320 }, { x: 284, y: 346 }, { x: 316, y: 325 }];
  const agreement = frames.find(frame => frame.agreed).progress;
  for (let index = 0; index < positions.length; index++) {
    const position = positions[index];
    const target = targets[index];
    const arrival = frames.find(frame => frame.votes[index]).progress;
    assert.deepEqual(coordinates(votePose(0.57, index, position, target)), position);
    let hasFlight = false;
    for (let step = 570; step < Math.round(arrival * 1000); step++) {
      const pose = votePose(step / 1000, index, position, target);
      hasFlight ||= Math.hypot(pose.x - position.x, pose.y - position.y) > 4 && Math.hypot(pose.x - target.x, pose.y - target.y) > 4;
    }
    assert.ok(hasFlight, 'a teammate should travel from the last edit to the shared circle');
    let clicked = false;
    for (let step = Math.round(arrival * 1000); step <= 1000; step++) {
      const pose = votePose(step / 1000, index, position, target);
      const distance = Math.hypot(pose.x - target.x, pose.y - target.y);
      assert.ok(Number.isFinite(pose.x) && Number.isFinite(pose.y));
      assert.ok(distance <= 4.001, 'after arrival, only the small vote click may move the cursor');
      clicked ||= distance > 0.01;
    }
    assert.ok(clicked, 'arrival should be followed by a small visible click');
    assert.deepEqual(coordinates(votePose(agreement, index, position, target)), target);
    assert.deepEqual(coordinates(votePose(1, index, position, target)), target);
  }
});

test('overlapping flights reconstruct the same positions when scrolling backwards', () => {
  const anchor = { x: 160, y: 190 };
  const target = { x: 290, y: 330 };
  for (let index = 0; index < 3; index++) {
    const progress = [0.57, 0.59, 0.62, 0.65, 0.67, 0.70, 0.73, 0.75, 0.78, 0.81, 0.82, 0.90, 1];
    const forward = progress.map(value => votePose(value, index, anchor, target));
    const reversed = [...progress].reverse().map(value => votePose(value, index, anchor, target)).reverse();
    assert.deepEqual(forward, reversed);
    assert.deepEqual(anchor, { x: 160, y: 190 });
    assert.deepEqual(target, { x: 290, y: 330 });
  }
});

test('mouse paths start at the captured pointer and land exactly on the button', () => {
  for (const [from, to] of [
    [{ x: 1050, y: 35 }, { x: 380, y: 285 }],
    [{ x: 40, y: 500 }, { x: 190, y: 225 }],
    [{ x: 120, y: 120 }, { x: 120, y: 120 }],
  ]) {
    assert.deepEqual(coordinates(mousePath(from, to, 0)), from);
    assert.deepEqual(coordinates(mousePath(from, to, 1)), to);
  }
});

test('mouse paths are curved, deterministic, and settle smoothly at their targets', () => {
  const from = { x: 80, y: 360 };
  const to = { x: 420, y: 150 };
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const samples = Array.from({ length: 41 }, (_, index) => mousePath(from, to, index / 40, 2));
  assert.deepEqual(samples, Array.from({ length: 41 }, (_, index) => mousePath(from, to, index / 40, 2)));
  const perpendicularDistances = samples.map(point => Math.abs((to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x)) / distance);
  assert.ok(perpendicularDistances.some(distance => distance > 2), 'the flight must not remain on one straight line');
  for (const point of samples) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    assert.ok(Math.hypot(point.x - from.x, point.y - from.y) <= distance * 1.4 + 16);
  }
  const nearArrival = mousePath(from, to, 0.98, 2);
  assert.ok(Math.hypot(nearArrival.x - to.x, nearArrival.y - to.y) <= 16, 'the final curve segment should settle near its target');
});

test('confetti particles scale to the full workspace and disappear after the burst', () => {
  let hasVisibleParticle = false;
  for (let particle = 0; particle < 48; particle++) {
    assert.equal(confettiParticle(particle, 0).opacity, 0);
    assert.equal(confettiParticle(particle, 1).opacity, 0);
    for (const progress of [0.1, 0.3, 0.5, 0.8]) {
      const state = confettiParticle(particle, progress, 650);
      assert.deepEqual(state, confettiParticle(particle, progress, 650));
      assert.ok(Number.isFinite(state.x) && Number.isFinite(state.y) && Number.isFinite(state.rotation));
      assert.ok(state.opacity >= 0 && state.opacity <= 1);
      hasVisibleParticle ||= state.opacity > 0;
    }
  }
  assert.ok(hasVisibleParticle, 'the burst must be visible between its endpoints');
  const spread = Array.from({ length: 48 }, (_, index) => confettiParticle(index, 0.45, 650));
  assert.ok(Math.max(...spread.map(point => point.x)) - Math.min(...spread.map(point => point.x)) > 650, 'the renderer must be able to spread confetti across a workspace, not only around the cursors');
});

test('pointer capture stores copies and rejects invalid coordinates', () => {
  clearPointerPosition();
  assert.equal(getPointerPosition(), null);
  const original = { x: 920, y: 40 };
  recordPointerPosition(original);
  original.x = 1;
  assert.deepEqual(coordinates(getPointerPosition()), { x: 920, y: 40 });
  const returned = getPointerPosition();
  returned.y = 999;
  assert.deepEqual(coordinates(getPointerPosition()), { x: 920, y: 40 });
  for (const invalid of [null, undefined, {}, { x: NaN, y: 3 }, { x: 4, y: Infinity }, { x: '12', y: 4 }]) {
    assert.doesNotThrow(() => recordPointerPosition(invalid));
    assert.deepEqual(coordinates(getPointerPosition()), { x: 920, y: 40 });
  }
  clearPointerPosition();
  assert.equal(getPointerPosition(), null);
});
