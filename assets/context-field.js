import { contextPose, contextSceneFrame } from './context-timeline.js?v=20261101-solid-mark';
import { createScrollSettler } from './scroll-settle.js?v=20261101-solid-mark';
import { createTourEntryGuard } from './tour-entry.js?v=20261101-entry-guard';
import { createTouchEntry } from './tour-touch.js?v=20261101-mobile-entry';
import { createGestureGate } from './tour-player.js?v=20261101-fast-motion-2';
export { contextPose, contextSceneFrame };
const clamp = value => Math.max(0, Math.min(1, value));

export function initContextField(field, win = globalThis.window, doc = globalThis.document) {
  const section = field?.closest('.context-section');
  if (!section || !win || field.dataset.motionReady) return () => {};
  field.dataset.motionReady = 'true';
  const track = section.querySelector('.context-track');
  const stage = section.querySelector('.context-stage');
  const items = [...field.querySelectorAll('[data-context-item]')];
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = win.matchMedia('(hover: hover) and (pointer: fine)');
  const gate = createGestureGate(220);
  const touchEntry = createTouchEntry();
  const poses = new Map();
  const removers = [];
  let geometry = null;
  let pointer = null;
  let visible = true;
  let raf = null;
  let layoutFrame = null;
  let lastTime = null;
  let disposed = false;
  let armed = true;
  let focusOverride = false;
  let touch = null;
  let deferredLayout = false;
  const guard = createTourEntryGuard({ onAlign(position) { win.scrollTo({ top: position, behavior: 'instant' }); } });
  const settler = createScrollSettler({
    now: () => win.performance.now(),
    requestFrame: callback => win.requestAnimationFrame(callback),
    cancelFrame: id => win.cancelAnimationFrame(id),
    onFrame(position) {
      guard.update(position);
      win.scrollTo({ top: position, behavior: 'instant' });
      schedule();
    },
    onFinish() { section.dataset.entry = 'held'; },
  });
  const listen = (host, name, callback, options) => {
    host.addEventListener(name, callback, options);
    removers.push(() => host.removeEventListener(name, callback, options));
  };
  function release() {
    settler.cancel();
    guard.release();
    touchEntry.cancel();
    section.dataset.entry = 'free';
    if (deferredLayout) { deferredLayout = false; layout(); }
  }
  function enter() {
    if (!geometry || reduced.matches) return;
    armed = false;
    focusOverride = false;
    guard.capture(Math.max(0, win.scrollY));
    section.dataset.entry = 'settling';
    settler.start(Math.max(0, win.scrollY), geometry.start);
  }
  function cancelFrame() {
    if (raf !== null) win.cancelAnimationFrame(raf);
    raf = null;
    lastTime = null;
  }
  function schedule() {
    if (!disposed && visible && doc.visibilityState !== 'hidden' && raf === null) raf = win.requestAnimationFrame(paint);
  }
  function paint(now) {
    raf = null;
    const bounds = field.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const mobile = win.innerWidth <= 560;
    const progress = !geometry || focusOverride ? 1 : clamp((win.scrollY - geometry.start) / geometry.travel);
    const scene = contextSceneFrame(progress, { reducedMotion: reduced.matches, mobile });
    section.dataset.progress = progress.toFixed(4);
    section.style.setProperty('--core-y', `${scene.coreY * 100}%`);
    section.style.setProperty('--core-reveal', String(scene.coreReveal));
    section.style.setProperty('--core-anchor-offset', String(scene.coreAnchorOffset));
    section.style.setProperty('--core-opacity', String(scene.coreOpacity));
    section.style.setProperty('--scene-intro-opacity', String(scene.introOpacity));
    section.style.setProperty('--scene-copy-opacity', String(scene.copyOpacity));
    section.querySelector('.context-copy').setAttribute('aria-hidden', String(scene.copyOpacity === 0));
    const intensity = mobile ? bounds.width < 320 ? 0.5 : 0.65 : 1;
    const cursor = pointer && finePointer.matches && !mobile ? { x: pointer.x - bounds.left, y: pointer.y - bounds.top } : null;
    const delta = lastTime === null ? 16 : Math.max(1, Math.min(64, now - lastTime));
    const blend = reduced.matches || !geometry ? 1 : 1 - Math.exp(-delta / 95);
    lastTime = now;
    items.forEach((item, index) => {
      const target = contextPose({
        progress, time: now, index,
        base: { x: item.offsetLeft, y: item.offsetTop },
        center: { x: bounds.width / 2, y: bounds.height * scene.coreY },
        pointer: cursor, rotation: Number(item.dataset.rotation), depth: Number(item.dataset.depth), intensity,
        reducedMotion: reduced.matches || !geometry || item.contains(doc.activeElement),
      });
      const pose = poses.get(item) || { ...target };
      for (const key of Object.keys(target)) pose[key] += (target[key] - pose[key]) * blend;
      poses.set(item, pose);
      item.style.setProperty('--context-x', `${pose.x.toFixed(3)}px`);
      item.style.setProperty('--context-y', `${pose.y.toFixed(3)}px`);
      item.style.setProperty('--context-rotate', `${pose.rotation.toFixed(3)}deg`);
      item.style.setProperty('--context-scale', pose.scale.toFixed(4));
      item.style.setProperty('--context-opacity', pose.opacity.toFixed(4));
    });
    if (!reduced.matches && geometry) schedule();
  }
  function configure() {
    layoutFrame = null;
    cancelFrame();
    const previous = geometry;
    poses.clear();
    const header = doc.querySelector('.site-header').getBoundingClientRect().height;
    const available = win.innerHeight - header - 12;
    const height = Math.floor(available);
    if (reduced.matches || available < 540) {
      release();
      geometry = null;
      section.classList.remove('is-enhanced');
    } else {
      const top = Math.round(Math.max(header + 12, (win.innerHeight - height) / 2));
      const travel = Math.round(height * 2.8);
      section.style.setProperty('--context-stage-height', `${height}px`);
      section.style.setProperty('--context-travel', `${travel}px`);
      section.style.setProperty('--context-sticky-top', `${top}px`);
      section.classList.add('is-enhanced');
      const start = Math.max(0, track.getBoundingClientRect().top + win.scrollY - top);
      geometry = { start, end: start + travel, travel, width: win.innerWidth, viewportHeight: win.innerHeight };
      const unchanged = previous && Math.abs(previous.start - start) < 1 && previous.travel === travel;
      if (!unchanged) release();
    }
    paint(win.performance.now());
  }
  function layout() {
    if (disposed) return;
    if (!reduced.matches && geometry && guard.getState().captured && win.innerWidth === geometry.width && win.innerHeight !== geometry.viewportHeight && Math.abs(win.innerHeight - geometry.viewportHeight) < 140 && win.innerHeight - doc.querySelector('.site-header').getBoundingClientRect().height - 12 >= 540) {
      // Mobile browser chrome can resize the viewport during one swipe.
      // Finish that arrival before applying the small height change.
      deferredLayout = true;
      return;
    }
    if (layoutFrame === null) layoutFrame = win.requestAnimationFrame(configure);
  }
  function protectedTarget(target) {
    if (target.closest('input,textarea,select,dialog,[contenteditable]:not([contenteditable="false"])')) return true;
    const panel = target.closest('.panel-content');
    return panel && panel.scrollHeight > panel.clientHeight + 1 && ['auto', 'scroll'].includes(win.getComputedStyle(panel).overflowY);
  }
  function earlierTourOwns() {
    const tour = doc.querySelector('#tour-track.is-enhanced');
    if (!tour) return false;
    if (tour.dataset.playback === 'playing' || tour.dataset.captured === 'true' && Number(tour.dataset.completed) < 3) return true;
    const top = Number.parseFloat(win.getComputedStyle(tour).getPropertyValue('--tour-sticky-top')) || 0;
    const start = tour.getBoundingClientRect().top + win.scrollY - top;
    return win.scrollY < start - 4;
  }
  function routeDown(distance, fresh, target) {
    if (!geometry || reduced.matches || protectedTarget(target) || earlierTourOwns()) return false;
    if (guard.getState().captured) {
      if (settler.getState().busy || !fresh) return true;
      release();
      return false;
    }
    if (armed && fresh && win.scrollY < geometry.start - 4 && win.scrollY + distance >= geometry.start - 4) {
      enter();
      return true;
    }
    return false;
  }
  listen(win, 'wheel', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || !event.deltaY || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    focusOverride = false;
    touchEntry.cancel();
    if (event.deltaY < 0) { release(); gate.reset(); return; }
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? win.innerHeight : 1;
    const target = event.target instanceof win.Element ? event.target : doc.body;
    const fresh = gate.consume(win.performance.now());
    if (routeDown(event.deltaY * unit, fresh, target)) event.preventDefault();
  }, { passive: false });
  listen(win, 'scroll', () => {
    if (geometry) {
      if (guard.handleScroll(win.scrollY)) { schedule(); return; }
      const direction = touchEntry.consume(win.scrollY, geometry);
      if (direction > 0 && armed) enter();
      if (win.scrollY < geometry.start - 80) armed = true;
    }
    schedule();
  }, { passive: true });
  listen(win, 'touchstart', event => {
    focusOverride = false;
    release();
    touch = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    const target = event.target instanceof win.Element ? event.target : doc.body;
    if (geometry && touch && !protectedTarget(target) && !earlierTourOwns() && win.scrollY < geometry.start - 4) touchEntry.begin(win.scrollY, geometry);
  }, { passive: true });
  listen(win, 'touchmove', event => {
    if (!touch || event.touches.length !== 1) return;
    const point = event.touches[0];
    if (point.clientY > touch.y + 4) { release(); return; }
    if (Math.abs(point.clientX - touch.x) > Math.abs(point.clientY - touch.y)) touchEntry.cancel();
  }, { passive: true });
  listen(win, 'touchend', () => { touchEntry.end(); touch = null; }, { passive: true });
  listen(win, 'touchcancel', () => { touchEntry.cancel(); touch = null; }, { passive: true });
  listen(win, 'keydown', event => {
    const target = event.target instanceof win.Element ? event.target : doc.body;
    if (event.defaultPrevented || protectedTarget(target)) return;
    if (['Escape', 'Home', 'End', 'Tab', 'ArrowUp', 'PageUp'].includes(event.key) || event.key === ' ' && event.shiftKey) { release(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey || target.closest('button,a,summary')) return;
    const distance = event.key === 'ArrowDown' ? 40 : ['PageDown', ' '].includes(event.key) ? win.innerHeight * 0.8 : 0;
    if (distance) {
      focusOverride = false;
      if (routeDown(distance, !event.repeat, target)) event.preventDefault();
    }
  });
  listen(doc, 'click', event => {
    if (event.target instanceof win.Element && event.target.closest('a[href]')) release();
  });
  listen(win, 'pointerdown', event => {
    if (event.pointerType === 'mouse' && event.clientX >= doc.documentElement.clientWidth - 16) { focusOverride = false; release(); }
  }, { capture: true });
  listen(win, 'pointermove', event => {
    pointer = event.pointerType === 'mouse' ? { x: event.clientX, y: event.clientY } : null;
    schedule();
  }, { passive: true });
  listen(win, 'blur', () => { pointer = null; release(); schedule(); });
  listen(win, 'hashchange', release);
  listen(win, 'popstate', release);
  listen(win, 'resize', layout, { passive: true });
  listen(field, 'focusin', () => { focusOverride = true; release(); visible = true; cancelFrame(); paint(win.performance.now()); });
  listen(field, 'focusout', event => { if (!field.contains(event.relatedTarget)) focusOverride = false; schedule(); });
  listen(reduced, 'change', layout);
  listen(doc, 'visibilitychange', () => {
    if (doc.visibilityState === 'hidden') { release(); cancelFrame(); }
    else schedule();
  });
  const observer = typeof win.IntersectionObserver === 'function' ? new win.IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) schedule();
    else cancelFrame();
  }, { rootMargin: '120px 0px' }) : null;
  observer?.observe(section);
  const resizeObserver = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(layout) : null;
  resizeObserver?.observe(doc.querySelector('.site-header'));
  doc.fonts?.ready.then(layout);
  configure();
  return () => {
    disposed = true;
    release();
    cancelFrame();
    if (layoutFrame !== null) win.cancelAnimationFrame(layoutFrame);
    observer?.disconnect();
    resizeObserver?.disconnect();
    removers.forEach(remove => remove());
    delete field.dataset.motionReady;
  };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') initContextField(document.querySelector('.context-field'));
