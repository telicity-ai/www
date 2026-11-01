const SELECT_AT = 0.39;
const TYPE_AT = 0.415;
const COMPLETE_AT = 0.52;
const CARET_UNTIL = 0.535;

const scripts = {
  ko: { leading: '', removed: '함께', inserted: '당신의 방식으로', trailing: ' 시작하는 봄.' },
  en: { leading: 'A spring ', removed: 'for everyone.', inserted: 'that starts your way.', trailing: '' },
};

// Keep whole graphemes together and vary the gaps just enough to feel typed.
// The same progress always reconstructs the same edit without timers.
for (const [language, script] of Object.entries(scripts)) {
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(language, { granularity: 'grapheme' }) : null;
  script.characters = segmenter
    ? [...segmenter.segment(script.inserted)].map(part => part.segment)
    : Array.from(script.inserted);
  const cadence = [1, 0.78, 1.12, 0.9, 1.22, 0.86];
  const weights = script.characters.map((character, index) =>
    cadence[index % cadence.length] * (script.characters[index - 1] === ' ' ? 1.35 : character === ' ' ? 0.8 : 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let accumulated = 0;
  script.thresholds = weights.map(weight => (accumulated += weight) / total);
}

export function documentEditFrame(progress, language = 'ko') {
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const script = scripts[language === 'en' ? 'en' : 'ko'];
  const complete = p >= COMPLETE_AT;
  let changing = script.removed;
  if (p >= TYPE_AT) {
    const amount = Math.max(0, Math.min(1, (p - TYPE_AT) / (COMPLETE_AT - TYPE_AT)));
    const count = complete ? script.characters.length : script.thresholds.filter(threshold => amount >= threshold).length;
    changing = script.characters.slice(0, count).join('');
  }
  return {
    leading: script.leading,
    changing,
    trailing: script.trailing,
    selected: p >= SELECT_AT && p < TYPE_AT,
    caret: p >= SELECT_AT && p < CARET_UNTIL,
    complete,
    text: script.leading + changing + script.trailing,
  };
}
