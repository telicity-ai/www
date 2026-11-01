import test from 'node:test';
import assert from 'node:assert/strict';
import { initContextField } from '../../assets/context-field.js';

function host() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
    dispatch(name, values = {}) {
      const event = { defaultPrevented: false, ...values, preventDefault() { this.defaultPrevented = true; } };
      [...(listeners.get(name) || [])].forEach(callback => callback(event));
      return event;
    },
  };
}

class Element {
  constructor(kind, parent = null) {
    Object.assign(this, host());
    this.kind = kind;
    this.parentElement = parent;
    this.dataset = {};
    this.attributes = new Map();
    const values = new Map();
    this.style = { values, setProperty: (name, value) => values.set(name, value), getPropertyValue: name => values.get(name) || '' };
    const classes = new Set();
    this.classList = { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name) };
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.overflowY = 'visible';
  }
  contains(element) {
    for (let current = element; current; current = current.parentElement) if (current === this) return true;
    return false;
  }
  closest(selector) {
    for (let current = this; current; current = current.parentElement) {
      if (selector === '.context-section' && current.kind === 'section') return current;
      if (selector === '.panel-content' && current.kind === 'panel') return current;
      if (selector.includes('input,textarea') && current.kind === 'input') return current;
      if (selector.includes('button') && current.kind === 'button') return current;
      if (selector === 'a[href]' && current.kind === 'anchor') return current;
    }
    return null;
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
}

function environment({ height = 900, width = 1280, reduced = false, tour = null } = {}) {
  let time = 0;
  let nextFrame = 0;
  const frames = new Map();
  const scrolls = [];
  const resizeObservers = [];
  const fontCallbacks = [];
  const body = new Element('body');
  const section = new Element('section', body);
  const field = new Element('field', section);
  const track = new Element('track', section);
  const stage = new Element('stage', track);
  const copy = new Element('copy', field);
  const header = new Element('header', body);
  const items = Array.from({ length: 7 }, (_, index) => {
    const item = new Element('button', field);
    item.dataset = { index: String(index), rotation: String(index - 3), depth: '1' };
    item.offsetLeft = 140 + index * 140;
    item.offsetTop = 70 + index * 80;
    return item;
  });
  const reducedMedia = { ...host(), matches: reduced };
  const fineMedia = { ...host(), matches: true };
  const win = {
    ...host(), Element, innerWidth: width, innerHeight: height, scrollY: 0,
    performance: { now: () => time },
    matchMedia: query => query.includes('reduced-motion') ? reducedMedia : fineMedia,
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    scrollTo({ top }) { this.scrollY = top; scrolls.push(top); },
    getComputedStyle(element) { return { overflowY: element.overflowY, getPropertyValue: name => element.style.getPropertyValue(name) }; },
    IntersectionObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; resizeObservers.push(this); }
      observe() {}
      disconnect() {}
    },
  };
  const doc = {
    ...host(), body, activeElement: body, visibilityState: 'visible', documentElement: { clientWidth: width },
    fonts: { ready: { then(callback) { fontCallbacks.push(callback); } } },
    querySelector: selector => selector === '.site-header' ? header : selector === '#tour-track.is-enhanced' ? tour : null,
  };
  header.getBoundingClientRect = () => ({ height: 88 });
  track.getBoundingClientRect = () => ({ top: 1000 - win.scrollY });
  field.getBoundingClientRect = () => {
    const enhanced = section.classList.contains('is-enhanced');
    const fieldHeight = enhanced ? Number.parseFloat(section.style.getPropertyValue('--context-stage-height')) : 600;
    const pinTop = Number.parseFloat(section.style.getPropertyValue('--context-sticky-top')) || 0;
    return { left: 40, top: enhanced ? Math.max(pinTop, 1000 - win.scrollY) : 1000 - win.scrollY, width: win.innerWidth - 80, height: fieldHeight };
  };
  section.querySelector = selector => ({ '.context-track': track, '.context-stage': stage, '.context-copy': copy })[selector] || null;
  field.querySelectorAll = selector => selector === '[data-context-item]' ? items : [];
  const dispose = initContextField(field, win, doc);
  return {
    win, doc, field, section, items, frames, scrolls, dispose, reducedMedia,
    advance(ms = 16) {
      time += ms;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback(time));
    },
    wheel(deltaY, target = body) { return win.dispatch('wheel', { deltaY, deltaX: 0, deltaMode: 0, target }); },
    focus(index = 0) { doc.activeElement = items[index]; field.dispatch('focusin', { target: items[index] }); },
    notifyResize() { resizeObservers.forEach(observer => observer.callback([{ target: header }])); },
    fontsReady() { fontCallbacks.forEach(callback => callback()); },
    panel({ overflow = 'auto', content = 300, viewport = 300 } = {}) {
      const panel = new Element('panel', body);
      panel.overflowY = overflow;
      panel.scrollHeight = content;
      panel.clientHeight = viewport;
      return panel;
    },
  };
}

test('layout notifications and focus never accumulate parallel visual RAF loops', () => {
  const env = environment();
  assert.equal(env.frames.size, 1);
  for (let index = 0; index < 5; index++) {
    env.notifyResize();
    env.fontsReady();
    env.win.dispatch('resize');
    env.advance();
    assert.equal(env.frames.size, 1, 'configuration must cancel its older visual frame');
    env.focus(index);
    assert.equal(env.frames.size, 1, 'an immediate focus paint must replace, rather than duplicate, the visual loop');
    env.advance();
    assert.equal(env.frames.size, 1);
  }
  env.dispose();
  assert.equal(env.frames.size, 0);
  assert.ok([...env.win.listeners.values()].every(listeners => listeners.size === 0));
});

test('downward entry owns the spring arrival and corrects inertia, while upward input releases it', () => {
  const env = environment();
  assert.equal(env.wheel(1000).defaultPrevented, true);
  assert.equal(env.section.dataset.entry, 'settling');
  env.advance(300);
  const ownedPosition = env.win.scrollY;
  assert.ok(ownedPosition > 0 && ownedPosition < 920);
  env.win.scrollY += 150;
  env.win.dispatch('scroll');
  assert.equal(env.win.scrollY, ownedPosition, 'native gesture tails must return to the current spring position');
  const up = env.wheel(-100);
  assert.equal(up.defaultPrevented, false);
  assert.equal(env.section.dataset.entry, 'free');
  const writes = env.scrolls.length;
  env.win.scrollY = ownedPosition - 200;
  env.win.dispatch('scroll');
  assert.equal(env.scrolls.length, writes, 'released upward scrolling must not be pulled back');
  env.advance();
  assert.equal(env.frames.size, 1);
  env.dispose();
});

test('ordinary panels may enter the scene, but actual scrollable panels keep their input', () => {
  for (const panelConfig of [{}, { overflow: 'hidden', content: 700, viewport: 200 }]) {
    const env = environment();
    assert.equal(env.wheel(1000, env.panel(panelConfig)).defaultPrevented, true);
    assert.equal(env.section.dataset.entry, 'settling');
    env.dispose();
  }
  for (const overflow of ['auto', 'scroll']) {
    const env = environment();
    assert.equal(env.wheel(1000, env.panel({ overflow, content: 700, viewport: 200 })).defaultPrevented, false);
    assert.notEqual(env.section.dataset.entry, 'settling');
    assert.equal(env.scrolls.length, 0);
    env.dispose();
  }
});

test('compact viewports expose the finished stationary composition without capturing scrolling', () => {
  const env = environment({ width: 375, height: 500 });
  assert.equal(env.section.classList.contains('is-enhanced'), false);
  assert.equal(env.section.dataset.progress, '1.0000');
  assert.equal(env.section.style.getPropertyValue('--core-reveal'), '1');
  assert.equal(env.section.style.getPropertyValue('--core-anchor-offset'), '0');
  assert.equal(env.section.style.getPropertyValue('--scene-copy-opacity'), '1');
  assert.ok(env.items.every(item => item.style.getPropertyValue('--context-opacity') === '1.0000'));
  assert.equal(env.frames.size, 0);
  assert.equal(env.wheel(1000).defaultPrevented, false);
  env.notifyResize();
  env.fontsReady();
  env.advance();
  assert.equal(env.frames.size, 0);
  env.dispose();
});

test('small browser-chrome resizes wait for a captured arrival to release', () => {
  const env = environment();
  env.wheel(1000);
  env.advance(100);
  const previousHeight = env.section.style.getPropertyValue('--context-stage-height');
  env.win.innerHeight = 850;
  env.win.dispatch('resize');
  assert.equal(env.section.style.getPropertyValue('--context-stage-height'), previousHeight);
  assert.equal(env.section.dataset.entry, 'settling');
  env.advance(1000);
  assert.equal(env.section.dataset.entry, 'held');
  assert.equal(env.section.style.getPropertyValue('--context-stage-height'), previousHeight);
  assert.equal(env.wheel(-100).defaultPrevented, false);
  env.advance();
  assert.equal(env.section.style.getPropertyValue('--context-stage-height'), '750px');
  assert.equal(env.section.dataset.entry, 'free');
  assert.equal(env.frames.size, 1);
  env.dispose();
});

test('enabling reduced motion during a captured arrival immediately releases into static content', () => {
  const env = environment();
  env.wheel(1000);
  env.advance(100);
  assert.equal(env.section.dataset.entry, 'settling');
  env.reducedMedia.matches = true;
  env.reducedMedia.dispatch('change', { matches: true });
  env.advance();
  assert.equal(env.section.dataset.entry, 'free');
  assert.equal(env.section.classList.contains('is-enhanced'), false);
  assert.equal(env.section.dataset.progress, '1.0000');
  assert.equal(env.frames.size, 0);
  assert.equal(env.wheel(1000).defaultPrevented, false);
  const writes = env.scrolls.length;
  env.win.scrollY += 200;
  env.win.dispatch('scroll');
  env.advance();
  assert.equal(env.scrolls.length, writes, 'the released guard must not pull native scrolling back');
  assert.equal(env.frames.size, 0);
  env.dispose();
});

test('an active earlier tour keeps its input until completion and a fresh gesture', () => {
  const tour = new Element('tour');
  tour.dataset = { playback: 'playing', captured: 'true', completed: '2' };
  tour.style.setProperty('--tour-sticky-top', '100px');
  let env;
  tour.getBoundingClientRect = () => ({ top: 300 - (env?.win.scrollY || 0) });
  env = environment({ tour });
  env.win.scrollY = 500;
  assert.equal(env.wheel(1000).defaultPrevented, false);
  tour.dataset.playback = 'idle';
  assert.equal(env.wheel(1000).defaultPrevented, false);
  assert.equal(env.scrolls.length, 0);
  tour.dataset.completed = '3';
  env.advance(300);
  assert.equal(env.wheel(1000).defaultPrevented, true);
  assert.equal(env.section.dataset.entry, 'settling');
  env.dispose();
});

test('native touch overshoot enters once and an upward swipe releases the spring', () => {
  const env = environment();
  env.win.dispatch('touchstart', { target: env.doc.body, touches: [{ clientX: 100, clientY: 500 }] });
  env.win.scrollY = 1000;
  env.win.dispatch('scroll');
  assert.equal(env.section.dataset.entry, 'settling');
  env.advance(300);
  const up = env.win.dispatch('touchmove', { touches: [{ clientX: 100, clientY: 550 }] });
  assert.equal(up.defaultPrevented, false);
  assert.equal(env.section.dataset.entry, 'free');
  const writes = env.scrolls.length;
  env.win.scrollY -= 100;
  env.win.dispatch('scroll');
  assert.equal(env.scrolls.length, writes);
  env.dispose();
});
