import test from 'node:test';
import assert from 'node:assert/strict';
import { createTouchEntry } from '../../assets/tour-touch.js';

const range = { start: 1000, end: 1240 };

function harness(options = {}) {
  let time = 0;
  return {
    entry: createTouchEntry({ now: () => time, ...options }),
    advance(duration) { time += duration; },
  };
}

test('native swipe from above enters once, even if it overshoots the entire demo', () => {
  const { entry } = harness();
  entry.begin(700, range);
  assert.equal(entry.consume(900, range), 0);
  assert.equal(entry.consume(1600, range), 1);
  assert.equal(entry.consume(1100, range), 0);
  assert.equal(entry.consume(1650, range), 0);
  entry.end();
  assert.equal(entry.consume(1700, range), 0);
});

test('native swipe from below reports reverse entry without choosing a stage', () => {
  const { entry } = harness();
  entry.begin(1550, range);
  assert.equal(entry.consume(1300, range), 0);
  assert.equal(entry.consume(1240, range), -1);
  assert.equal(entry.consume(900, range), 0);
});

test('a short swipe can enter during its remaining momentum after touchend', () => {
  const { entry, advance } = harness();
  entry.begin(700, range);
  assert.equal(entry.consume(850, range), 0);
  entry.end();
  advance(1499);
  assert.equal(entry.consume(1000, range), 1);
  assert.equal(entry.consume(1100, range), 0);
});

test('momentum expires instead of treating a later unrelated scroll as entry', () => {
  const { entry, advance } = harness();
  entry.begin(700, range);
  entry.end();
  advance(1500);
  assert.equal(entry.consume(1100, range), 0);
  assert.equal(entry.consume(1200, range), 0);
});

test('an active swipe is not limited by the momentum timeout', () => {
  const { entry, advance } = harness();
  entry.begin(700, range);
  advance(3000);
  assert.equal(entry.consume(1000, range), 1);
});

test('cancel clears native entry and its pending momentum', () => {
  const { entry } = harness();
  for (const finish of [() => {}, () => entry.end()]) {
    entry.begin(700, range);
    finish();
    entry.cancel();
    assert.equal(entry.consume(1100, range), 0);
  }
});

test('a swipe starting inside or on either edge belongs to normal step input', () => {
  const { entry } = harness();
  for (const position of [1000, 1120, 1240]) {
    entry.begin(position, range);
    assert.equal(entry.consume(1600, range), 0);
    assert.equal(entry.consume(700, range), 0);
  }
});

test('movement away from the demo and a stationary geometry change do not enter', () => {
  const { entry } = harness();
  entry.begin(700, range);
  assert.equal(entry.consume(650, range), 0);
  assert.equal(entry.consume(650, { start: 600, end: 840 }), 0);
  entry.begin(1500, range);
  assert.equal(entry.consume(1600, range), 0);
  assert.equal(entry.consume(1600, { start: 1500, end: 1740 }), 0);
});

test('a new touch replaces any pending entry from the previous gesture', () => {
  const { entry } = harness();
  entry.begin(700, range);
  entry.end();
  entry.begin(1120, range);
  assert.equal(entry.consume(1300, range), 0);
  entry.begin(1500, range);
  assert.equal(entry.consume(1200, range), -1);
});

test('invalid positions or bounds cannot keep a stale native entry', () => {
  const { entry } = harness();
  for (const invalid of [undefined, {}, { start: NaN, end: 1200 }, { start: 1000, end: Infinity }, { start: 1200, end: 1000 }]) {
    entry.begin(700, invalid);
    assert.equal(entry.consume(1100, range), 0);
    entry.begin(700, range);
    assert.equal(entry.consume(1100, invalid), 0);
    assert.equal(entry.consume(1200, range), 0);
  }
  for (const invalid of [NaN, Infinity, undefined]) {
    entry.begin(invalid, range);
    assert.equal(entry.consume(1100, range), 0);
    entry.begin(700, range);
    assert.equal(entry.consume(invalid, range), 0);
    assert.equal(entry.consume(1100, range), 0);
  }
});

test('end cannot extend an already pending momentum window', () => {
  const { entry, advance } = harness({ momentumMs: 100 });
  entry.begin(700, range);
  entry.end();
  advance(80);
  entry.end();
  advance(20);
  assert.equal(entry.consume(1100, range), 0);
});
