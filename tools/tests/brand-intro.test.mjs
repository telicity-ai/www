import test from 'node:test';
import assert from 'node:assert/strict';
import { brandIntroFrame, initBrandIntro } from '../../assets/brand-intro.js';

const options = {
  viewport: { width: 1280, height: 720 },
  target: { left: 613, top: 156, width: 54, height: 54 },
};
const center = frame => ({ x: frame.x + frame.size / 2, y: frame.y + frame.size / 2 });

test('the lower-lobe opening point is centered before the full mark recognition hold', () => {
  const first = brandIntroFrame(0, options);
  const grown = brandIntroFrame(800, options);
  assert.equal(first.size, 192);
  assert.equal(grown.size, 192);
  const point = {
    x: first.x + first.size * 0.6944001039797363,
    y: first.y + first.size * 0.7770594717603514,
  };
  assert.deepEqual(point, { x: 640, y: 360 });
  assert.deepEqual(center(grown), { x: 640, y: 360 });
  assert.deepEqual(center(brandIntroFrame(1099, options)), { x: 640, y: 360 });
  assert.equal(first.pageOpacity, 0);
  assert.equal(first.backgroundOpacity, 1);
});

test('one opaque mark expands from its lower lobe without a crossfade', () => {
  const point = brandIntroFrame(0, options);
  assert.equal(point.phase, 'dot');
  assert.equal(point.markOpacity, 1);
  assert.equal(point.markReveal, 0);
  assert.equal(point.clipRadius, 4);
  const dot = brandIntroFrame(350, options);
  assert.equal(dot.phase, 'emerging');
  assert.equal(dot.clipRadius, 10);
  const middle = brandIntroFrame(575, options);
  assert.equal(middle.markReveal, 0.5);
  assert.equal(middle.markOpacity, 1);
  assert.ok(middle.clipRadius > 10 && middle.clipRadius < 192 * 1.05);
  assert.equal(Object.hasOwn(middle, 'dotOpacity'), false);
  const ready = brandIntroFrame(800, options);
  assert.equal(ready.phase, 'holding');
  assert.equal(ready.markReveal, 1);
  assert.equal(ready.clipRadius, 192 * 1.05);
  assert.equal(ready.size, 192);
  assert.deepEqual(center(ready), { x: 640, y: 360 });
  assert.deepEqual(center(brandIntroFrame(1100, options)), center(ready));
  let previousRadius = 0;
  for (let time = 0; time <= 2300; time += 10) {
    const frame = brandIntroFrame(time, options);
    assert.equal(frame.markOpacity, 1);
    assert.ok(frame.clipRadius >= previousRadius);
    previousRadius = frame.clipRadius;
  }
});

test('the handoff converges on the actual hero mark without overshoot', () => {
  for (let time = 1100; time <= 2200; time++) {
    const frame = brandIntroFrame(time, options);
    const point = center(frame);
    assert.equal(point.x, 640);
    assert.ok(point.y >= 183 && point.y <= 360);
    assert.ok(frame.size >= 54 && frame.size <= 192);
  }
  const settled = brandIntroFrame(2200, options);
  assert.deepEqual(center(settled), { x: 640, y: 183 });
  assert.equal(settled.size, 54);
  assert.equal(settled.x, 613);
  assert.equal(settled.y, 156);
  assert.equal(settled.phase, 'settled');
});

test('the page appears as the paper cover clears, before the handoff ends', () => {
  let previousPage = 0;
  let previousCover = 1;
  for (let time = 0; time <= 2300; time += 10) {
    const frame = brandIntroFrame(time, options);
    assert.ok(frame.pageOpacity >= previousPage && frame.pageOpacity <= 1);
    assert.ok(frame.backgroundOpacity <= previousCover && frame.backgroundOpacity >= 0);
    previousPage = frame.pageOpacity;
    previousCover = frame.backgroundOpacity;
  }
  assert.ok(brandIntroFrame(1600, options).pageOpacity > 0);
  assert.ok(brandIntroFrame(1600, options).backgroundOpacity < 1);
  assert.equal(brandIntroFrame(2050, options).pageOpacity, 1);
  assert.equal(brandIntroFrame(2050, options).backgroundOpacity, 0);
});

test('late frames finish at exactly the hero geometry within 2.3 seconds', () => {
  const end = brandIntroFrame(2300, options);
  assert.equal(end.done, true);
  assert.equal(end.x, 613);
  assert.equal(end.y, 156);
  assert.equal(end.scale, 54 / 192);
  assert.equal(brandIntroFrame(2299, options).done, false);
  assert.deepEqual(brandIntroFrame(5000, options), end);
});

test('mobile and off-center hero marks use measured coordinates rather than fixed offsets', () => {
  const mobile = { viewport: { width: 375, height: 812 }, target: { left: 166.5, top: 122, width: 42, height: 42 } };
  const first = brandIntroFrame(0, mobile);
  assert.deepEqual({ x: first.x + first.size * 0.6944001039797363, y: first.y + first.size * 0.7770594717603514 }, { x: 187.5, y: 406 });
  const end = brandIntroFrame(2300, mobile);
  assert.deepEqual(center(end), { x: 187.5, y: 143 });
  const shifted = brandIntroFrame(2300, { ...options, target: { left: 45, top: 116, width: 64, height: 64 } });
  assert.deepEqual(center(shifted), { x: 77, y: 148 });
});

test('the same time reconstructs the same pose after jumps and reverse sampling', () => {
  const times = [0, 180, 350, 600, 800, 1100, 1600, 2200, 2300];
  const forward = times.map(time => brandIntroFrame(time, options));
  assert.deepEqual([...times].reverse().map(time => brandIntroFrame(time, options)).reverse(), forward);
  brandIntroFrame(900, options);
  assert.deepEqual(brandIntroFrame(2300, options), forward.at(-1));
});

test('reduced motion gives the completed page immediately', () => {
  const frame = brandIntroFrame(0, { ...options, reducedMotion: true });
  assert.equal(frame.done, true);
  assert.equal(frame.pageOpacity, 1);
  assert.equal(frame.backgroundOpacity, 0);
  assert.equal(frame.x, 613);
  assert.equal(frame.y, 156);
});

test('invalid geometry declines animation and invalid time cannot create NaN poses', () => {
  for (const target of [undefined, {}, { left: 0, top: 0, width: 0, height: 54 }, { left: NaN, top: 0, width: 54, height: 54 }]) {
    assert.equal(brandIntroFrame(100, { ...options, target }), null);
  }
  for (const viewport of [undefined, {}, { width: 0, height: 720 }, { width: 375, height: Infinity }]) {
    assert.equal(brandIntroFrame(100, { ...options, viewport }), null);
  }
  for (const time of [-1, NaN, undefined, Infinity]) assert.deepEqual(brandIntroFrame(time, options), brandIntroFrame(0, options));
  assert.doesNotThrow(() => initBrandIntro(undefined, undefined).cancel());
});

function environment({ reduced = false, hash = '', scrollY = 0, navigation = 'navigate', ready = true } = {}) {
  let time = 0;
  let sequence = 0;
  const frames = new Map();
  const timers = new Map();
  const classes = new Set(['intro-pending']);
  const styles = () => {
    const values = new Map();
    return { values, setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key) };
  };
  function host() {
    const listeners = new Map();
    return {
      listeners,
      addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
      removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
      dispatch(name, event = {}) { [...(listeners.get(name) || [])].forEach(callback => callback(event)); },
    };
  }
  const root = { style: styles(), classList: {
    contains: name => classes.has(name),
    remove: (...names) => names.forEach(name => classes.delete(name)),
    toggle(name, active) { if (active) classes.add(name); else classes.delete(name); },
  } };
  const mark = { complete: ready, naturalWidth: ready ? 1000 : 0, style: {}, decode: () => new Promise(() => {}) };
  const target = { ...mark, getBoundingClientRect: () => options.target };
  const overlay = { querySelector: () => mark, style: styles(), dataset: {} };
  const media = { ...host(), matches: reduced };
  const win = {
    ...host(), ...options.viewport,
    innerWidth: options.viewport.width, innerHeight: options.viewport.height,
    location: { hash }, scrollY,
    matchMedia: () => media,
    performance: { now: () => time, getEntriesByType: () => [{ type: navigation }] },
    requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { callback, due: time + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const doc = { ...host(), documentElement: root, visibilityState: 'visible', querySelector: selector => selector === '.brand-intro' ? overlay : target };
  return {
    win, doc, root, overlay, frames, timers, classes,
    advance(ms) {
      time += ms;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback(time));
      for (const [id, timer] of [...timers]) {
        if (timer.due <= time) { timers.delete(id); timer.callback(); }
      }
    },
  };
}

test('history, anchor navigation, restored scrolling, and reduced motion leave the page visible', () => {
  for (const skip of [{ reduced: true }, { hash: '#waitlist' }, { navigation: 'back_forward' }, { scrollY: 500 }]) {
    const env = environment(skip);
    initBrandIntro(env.doc, env.win);
    assert.equal(env.classes.has('intro-pending'), false);
    assert.equal(env.frames.size, 0);
    assert.equal(env.timers.size, 0);
    assert.equal(env.overlay.dataset.phase, 'complete');
  }
});

test('a first input cancels the cover immediately and removes pending work', () => {
  for (const input of ['wheel', 'touchstart', 'keydown', 'pointerdown', 'resize']) {
    const env = environment();
    initBrandIntro(env.doc, env.win);
    env.advance(1600);
    assert.equal(env.classes.has('intro-revealing'), true);
    assert.ok(Number(env.root.style.values.get('--intro-page-opacity')) > 0);
    env.win.dispatch(input);
    assert.equal(env.classes.has('intro-pending'), false);
    assert.equal(env.classes.has('intro-revealing'), false);
    assert.equal(env.frames.size, 0);
    assert.equal(env.timers.size, 0);
    assert.equal(env.root.style.values.has('--intro-page-opacity'), false);
    assert.ok([...env.win.listeners.values()].every(listeners => listeners.size === 0));
  }
});

test('an image that never decodes fails open instead of showing an endless loading screen', () => {
  const env = environment({ ready: false });
  initBrandIntro(env.doc, env.win);
  env.advance(220);
  assert.equal(env.classes.has('intro-pending'), false);
  assert.equal(env.frames.size, 0);
  assert.equal(env.timers.size, 0);
});

test('completion and the independent bootstrap fallback clean up every hidden state', () => {
  for (const removeBootstrap of [false, true]) {
    const env = environment();
    const controller = initBrandIntro(env.doc, env.win);
    env.advance(1600);
    if (removeBootstrap) env.classes.delete('intro-pending');
    env.advance(700);
    assert.equal(env.classes.has('intro-pending'), false);
    assert.equal(env.classes.has('intro-revealing'), false);
    assert.equal(env.frames.size, 0);
    assert.equal(env.timers.size, 0);
    assert.doesNotThrow(() => controller.cancel());
  }
});
