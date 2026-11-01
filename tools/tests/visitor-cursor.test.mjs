import test from 'node:test';
import assert from 'node:assert/strict';
import { initVisitorCursor } from '../../assets/cursor.js';

function eventHost() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    dispatch(type, values = {}) {
      const event = { type, ...values };
      [...(listeners.get(type) || [])].forEach(callback => callback(event));
    },
  };
}

function element(kind) {
  const classes = new Set();
  return {
    ...eventHost(), kind, style: {}, parentElement: null,
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle(name, enabled) {
        const next = enabled === undefined ? !classes.has(name) : enabled;
        if (next) classes.add(name); else classes.delete(name);
        return next;
      },
    },
    append(child) { child.parentElement = this; },
    closest() { return ['input', 'textarea', 'select', 'editable'].includes(this.kind) ? this : null; },
  };
}

function environment({ width = 800, height = 600, arrowWidth = 26, search = '?city=Seoul', fine = true } = {}) {
  let nextFrame = 0;
  const frames = new Map();
  const observers = [];
  const body = element('body');
  const root = element('html');
  root.clientWidth = width;
  const cursor = element('cursor');
  const arrow = element('arrow');
  arrow.getBoundingClientRect = () => ({ width: arrowWidth });
  const label = element('label');
  label.offsetWidth = 92;
  label.offsetHeight = 24;
  const name = element('name');
  const dialog = element('dialog');
  const input = element('input');
  const finePointer = { ...eventHost(), matches: fine };
  const forcedColors = { ...eventHost(), matches: false };
  let hit = body;
  let open = false;
  const selection = { isCollapsed: true };
  body.append(cursor);
  cursor.querySelector = selector => ({ '.collab-arrow': arrow, '.visitor-label': label, '[data-cursor-name]': name })[selector] || null;
  const doc = {
    ...eventHost(), body, documentElement: root, hidden: false,
    querySelector: selector => selector === '.visitor-cursor' ? cursor : selector === 'dialog[open]' && open ? dialog : null,
    elementFromPoint: () => hit,
    getSelection: () => selection,
  };
  const win = {
    ...eventHost(), innerHeight: height,
    location: { hostname: 'localhost', protocol: 'http:', search },
    matchMedia: query => query.includes('forced-colors') ? forcedColors : finePointer,
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target, options) { this.target = target; this.options = options; }
      disconnect() { this.disconnected = true; }
    },
    fetch() { assert.fail('local city identity must not fetch a location'); },
  };
  const dispose = initVisitorCursor(doc, win);
  const advance = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback());
  };
  return {
    doc, win, root, body, cursor, arrow, label, name, dialog, input,
    finePointer, forcedColors, selection, frames, observers, dispose, advance,
    hit(target) { hit = target; },
    pointer(x = 300, y = 200, values = {}) {
      doc.dispatch('pointermove', { pointerType: 'mouse', clientX: x, clientY: y, buttons: 0, ...values });
      advance();
    },
    openDialog() {
      open = true;
      observers.filter(observer => !observer.disconnected).forEach(observer => observer.callback());
    },
    closeDialog() { open = false; doc.dispatch('close', { target: dialog }); },
  };
}

const active = env => env.root.classList.contains('has-visitor-cursor');
const visible = env => env.cursor.classList.contains('is-visible');
const native = env => env.cursor.classList.contains('is-native');

test('the arrow keeps the real pointer position while only the label fits each corner', () => {
  for (const arrowWidth of [26, 20]) {
    const env = environment({ arrowWidth });
    for (const [x, y] of [[0, 0], [799, 0], [799, 599], [0, 599], [400.25, 300.5]]) {
      env.pointer(x, y);
      assert.equal(env.cursor.style.transform, `translate3d(${x}px, ${y}px, 0)`);
      const left = x + Number.parseFloat(env.label.style.left);
      const top = y + Number.parseFloat(env.label.style.top);
      assert.ok(left >= 8 && left + env.label.offsetWidth <= 792);
      assert.ok(top >= 8 && top + env.label.offsetHeight <= 592);
      assert.equal(active(env), true);
    }
    env.dispose();
  }
});

test('editable targets keep the native pointer and ordinary content restores the agent arrow', () => {
  const env = environment();
  env.pointer();
  assert.equal(active(env), true);
  assert.equal(native(env), false);
  for (const kind of ['input', 'textarea', 'select', 'editable']) {
    env.hit(element(kind));
    env.pointer();
    assert.equal(active(env), false);
    assert.equal(native(env), true);
    assert.equal(visible(env), true);
  }
  env.hit(env.body);
  env.pointer();
  assert.equal(active(env), true);
  assert.equal(native(env), false);
  env.dispose();
});

test('touch, pen and every page exit restore the native pointer and cancel pending movement', () => {
  const exits = [
    env => env.doc.dispatch('pointermove', { pointerType: 'touch' }),
    env => env.doc.dispatch('pointerdown', { pointerType: 'pen' }),
    env => env.win.dispatch('blur'),
    env => env.root.dispatch('pointerleave'),
    env => env.doc.dispatch('pointercancel'),
    env => { env.doc.hidden = true; env.doc.dispatch('visibilitychange'); },
    env => { env.finePointer.matches = false; env.finePointer.dispatch('change'); },
  ];
  for (const exit of exits) {
    const env = environment();
    env.pointer();
    env.doc.dispatch('pointermove', { pointerType: 'mouse', clientX: 310, clientY: 220, buttons: 0 });
    assert.equal(env.frames.size, 1);
    exit(env);
    env.advance();
    assert.equal(active(env), false);
    assert.equal(visible(env), false);
    assert.equal(native(env), false);
    assert.equal(env.frames.size, 0);
    env.dispose();
  }
});

test('opening and closing a modal moves the stationary cursor into and out of the top layer', () => {
  const env = environment();
  env.pointer(500, 350);
  const position = env.cursor.style.transform;
  env.openDialog();
  assert.equal(env.cursor.parentElement, env.dialog, 'opening must not require another pointermove');
  env.advance();
  assert.equal(active(env), true);
  assert.equal(env.cursor.style.transform, position);
  env.closeDialog();
  assert.equal(env.cursor.parentElement, env.body);
  env.advance();
  assert.equal(active(env), true);
  assert.equal(env.cursor.style.transform, position);
  env.dispose();
});

test('scrolling updates the target beneath a stationary pointer without changing its position', () => {
  const env = environment();
  env.pointer(230.5, 170.25);
  const position = env.cursor.style.transform;
  env.hit(env.input);
  env.win.dispatch('scroll');
  env.advance();
  assert.equal(native(env), true);
  assert.equal(active(env), false);
  assert.equal(env.cursor.style.transform, position);
  env.hit(env.body);
  env.win.dispatch('scroll');
  env.advance();
  assert.equal(active(env), true);
  assert.equal(native(env), false);
  env.dispose();
});

test('text dragging and forced colors keep native interaction, then recover the arrow', () => {
  const env = environment();
  env.pointer(300, 200, { buttons: 1 });
  env.selection.isCollapsed = false;
  env.doc.dispatch('selectionchange');
  env.advance();
  assert.equal(active(env), false);
  assert.equal(native(env), true);
  env.doc.dispatch('pointerup', { pointerType: 'mouse', clientX: 300, clientY: 200, buttons: 0 });
  env.advance();
  assert.equal(active(env), true);
  env.forcedColors.matches = true;
  env.forcedColors.dispatch('change');
  env.advance();
  assert.equal(active(env), false);
  assert.equal(native(env), true);
  env.forcedColors.matches = false;
  env.forcedColors.dispatch('change');
  env.advance();
  assert.equal(active(env), true);
  env.dispose();
});

test('cleanup cancels pending frames and removes listeners, observers and native hiding', () => {
  const env = environment();
  env.pointer();
  env.win.dispatch('resize');
  assert.equal(env.frames.size, 1);
  env.dispose();
  env.advance();
  assert.equal(active(env), false);
  assert.equal(visible(env), false);
  assert.equal(env.frames.size, 0);
  assert.ok(env.observers.every(observer => observer.disconnected));
  for (const host of [env.doc, env.win, env.root, env.finePointer, env.forcedColors]) {
    assert.ok([...host.listeners.values()].every(listeners => listeners.size === 0));
  }
  env.pointer();
  env.openDialog();
  assert.equal(visible(env), false);
  assert.equal(env.frames.size, 0);
});

test('local previews preserve city labels without fetching or activating an idle cursor', () => {
  for (const [search, expected] of [['?city=Seoul', 'teliseoul'], ['?city=Tokyo', 'telitokyo'], ['', 'telicity']]) {
    const env = environment({ search });
    assert.equal(env.name.textContent, expected);
    assert.equal(active(env), false);
    assert.equal(visible(env), false);
    assert.equal(env.frames.size, 0);
    env.pointer();
    assert.equal(env.name.textContent, expected);
    env.dispose();
  }
});
