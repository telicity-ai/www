import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../assets/brand-intro-boot.js', import.meta.url), 'utf8');

test('both entry pages load the bootstrap before styles under the deployed self-only script policy', () => {
  const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  const policy = config.headers.flatMap(rule => rule.headers).find(header => header.key === 'Content-Security-Policy').value;
  assert.match(policy, /script-src 'self'(?:;|$)/);
  for (const page of ['index.html', 'ko/index.html']) {
    const html = readFileSync(new URL('../../' + page, import.meta.url), 'utf8');
    const firstScript = html.match(/<script\b[^>]*>/)[0];
    assert.match(firstScript, /src="\/assets\/brand-intro-boot\.js\?/);
    assert.doesNotMatch(firstScript, /\b(?:async|defer|type)=?/);
    assert.ok(html.indexOf(firstScript) < html.indexOf('rel="stylesheet"'));
  }
});

function environment({ hash = '', reduced = false, navigation = 'navigate', scrollY = 0, failure = null } = {}) {
  let time = 0;
  let sequence = 0;
  const timers = new Map();
  const listeners = new Map();
  const classes = new Set(['theme-light']);
  const root = { classList: {
    add: (...names) => names.forEach(name => classes.add(name)),
    remove: (...names) => names.forEach(name => classes.delete(name)),
  } };
  const doc = {
    documentElement: root,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
  };
  const win = {
    location: { hash }, scrollY,
    performance: { getEntriesByType: () => [{ type: navigation }] },
    matchMedia() {
      if (failure === 'media') throw new Error('Media lookup unavailable');
      return { matches: reduced };
    },
    setTimeout(callback, delay) {
      if (failure === 'timer') throw new Error('Timer unavailable');
      const id = ++sequence;
      timers.set(id, { callback, due: time + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  runInNewContext(source, { document: doc, window: win });
  return {
    classes, timers, listeners,
    ready() { [...(listeners.get('telicity:intro-ready') || [])].forEach(listener => listener()); },
    advance(ms) {
      time += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.due <= time) { timers.delete(id); timer.callback(); }
      }
    },
  };
}

test('a normal first navigation opts into the cover with one bounded module watchdog', () => {
  const env = environment();
  assert.equal(env.classes.has('intro-pending'), true);
  assert.equal(env.timers.size, 1);
  assert.equal(env.listeners.get('telicity:intro-ready').size, 1);
  env.advance(3499);
  assert.equal(env.classes.has('intro-pending'), true);
});

test('a ready animation takes ownership without a competing bootstrap timeout', () => {
  const env = environment();
  env.ready();
  assert.equal(env.timers.size, 0);
  assert.equal(env.listeners.get('telicity:intro-ready').size, 0);
  env.advance(1000);
  assert.equal(env.classes.has('intro-pending'), true);
  // The animation's own completion removes its cover; bootstrap stays out of it.
  env.classes.delete('intro-pending');
  env.advance(60000);
  assert.deepEqual([...env.classes], ['theme-light']);
  assert.doesNotThrow(() => env.ready());
});

test('a missing or unready module releases every intro class after 3.5 seconds', () => {
  const env = environment();
  env.classes.add('intro-revealing');
  env.advance(3500);
  assert.deepEqual([...env.classes], ['theme-light']);
  assert.equal(env.timers.size, 0);
  assert.equal(env.listeners.get('telicity:intro-ready').size, 0);
  env.ready();
  env.advance(60000);
  assert.deepEqual([...env.classes], ['theme-light']);
});

test('anchor links, reduced motion, history returns and restored scrolling show the ordinary page', () => {
  for (const options of [{ hash: '#together' }, { hash: '#waitlist' }, { reduced: true }, { navigation: 'back_forward' }, { scrollY: 200 }]) {
    const env = environment(options);
    assert.equal(env.classes.has('intro-pending'), false);
    assert.equal(env.timers.size, 0);
    assert.equal(env.listeners.size, 0);
    assert.deepEqual([...env.classes], ['theme-light']);
  }
});

test('an unavailable bootstrap API cannot leave a hidden page or a ready listener behind', () => {
  for (const failure of ['media', 'timer']) {
    const env = environment({ failure });
    assert.equal(env.classes.has('intro-pending'), false);
    assert.equal(env.timers.size, 0);
    assert.ok([...env.listeners.values()].every(listeners => listeners.size === 0));
    assert.deepEqual([...env.classes], ['theme-light']);
  }
});
