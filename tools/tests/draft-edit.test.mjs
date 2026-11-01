import test from 'node:test';
import assert from 'node:assert/strict';
import { documentEditFrame } from '../../assets/draft-edit.js';

const copy = {
  ko: { original: '함께 시작하는 봄.', final: '당신의 방식으로 시작하는 봄.', inserted: '당신의 방식으로' },
  en: { original: 'A spring for everyone.', final: 'A spring that starts your way.', inserted: 'that starts your way.' },
};

for (const [language, expected] of Object.entries(copy)) {
  test(`${language}: select the existing words before replacing them`, () => {
    const resting = documentEditFrame(0.38, language);
    assert.equal(resting.text, expected.original);
    assert.equal(resting.selected, false);
    assert.equal(resting.caret, false);
    assert.equal(resting.complete, false);
    for (const progress of [0.39, 0.40, 0.4149]) {
      const frame = documentEditFrame(progress, language);
      assert.equal(frame.text, expected.original);
      assert.equal(frame.selected, true);
      assert.equal(frame.caret, true);
    }
    const replacement = documentEditFrame(0.415, language);
    assert.equal(replacement.changing, '');
    assert.equal(replacement.selected, false);
    assert.equal(replacement.caret, true);
  });

  test(`${language}: replace the selected words progressively without rewriting the surrounding line`, () => {
    let previousLength = 0;
    const seen = new Set();
    for (let step = 4150; step < 5200; step++) {
      const frame = documentEditFrame(step / 10000, language);
      assert.ok(expected.inserted.startsWith(frame.changing));
      assert.ok(Array.from(frame.changing).length >= previousLength);
      assert.equal(frame.text, frame.leading + frame.changing + frame.trailing);
      assert.equal(frame.complete, false);
      assert.equal(frame.selected, false);
      assert.equal(frame.caret, true);
      previousLength = Array.from(frame.changing).length;
      seen.add(frame.changing);
    }
    assert.ok(seen.size > 4, 'the edit should have several visible intermediate phrases');
    const middle = documentEditFrame(0.47, language);
    assert.ok(middle.changing.length > 0 && middle.changing.length < expected.inserted.length);
    assert.equal(documentEditFrame(0.52, language).text, expected.final);
  });

  test(`${language}: finish before the voting handoff and settle the caret`, () => {
    for (const progress of [0.52, 0.5349, 0.54, 0.57, 0.8, 1]) {
      const frame = documentEditFrame(progress, language);
      assert.equal(frame.text, expected.final);
      assert.equal(frame.changing, expected.inserted);
      assert.equal(frame.complete, true);
      assert.equal(frame.selected, false);
      assert.equal(frame.caret, progress < 0.535);
    }
  });

  test(`${language}: character arrivals use a deterministic, varied typing rhythm`, () => {
    const arrivals = [];
    let previous = '';
    for (let step = 4150; step <= 5200; step++) {
      const changing = documentEditFrame(step / 10000, language).changing;
      if (changing !== previous) arrivals.push(step);
      previous = changing;
    }
    assert.equal(arrivals.length, Array.from(expected.inserted).length);
    const gaps = arrivals.map((arrival, index) => arrival - (index ? arrivals[index - 1] : 4150));
    assert.ok(new Set(gaps).size >= 3, 'word boundaries and individual letters should not arrive in uniform gaps');
  });

  test(`${language}: reverse playback and jumps reconstruct the same draft`, () => {
    const progress = [0, 0.38, 0.39, 0.414, 0.415, 0.442, 0.47, 0.512, 0.52, 0.535, 0.57, 1];
    const forward = progress.map(value => documentEditFrame(value, language));
    const reversed = [...progress].reverse().map(value => documentEditFrame(value, language)).reverse();
    assert.deepEqual(forward, reversed);
    const end = documentEditFrame(1, language);
    documentEditFrame(0.42, language);
    documentEditFrame(0.4, language);
    assert.deepEqual(documentEditFrame(1, language), end);
    assert.equal(documentEditFrame(0, language).text, expected.original);
  });
}

test('invalid progress is safe and finite progress clamps to the scene endpoints', () => {
  for (const language of ['ko', 'en']) {
    assert.deepEqual(documentEditFrame(-1, language), documentEditFrame(0, language));
    assert.deepEqual(documentEditFrame(2, language), documentEditFrame(1, language));
    for (const invalid of [NaN, Infinity, -Infinity, undefined, null, '0.5']) {
      assert.deepEqual(documentEditFrame(invalid, language), documentEditFrame(0, language));
    }
  }
  assert.deepEqual(documentEditFrame(0.47), documentEditFrame(0.47, 'ko'));
  assert.deepEqual(documentEditFrame(0.47, 'unknown'), documentEditFrame(0.47, 'ko'));
});
