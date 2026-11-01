const clamp = value => Math.max(0, Math.min(1, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const easeOut = value => 1 - (1 - clamp(value)) ** 3;

// Scroll unfolds the context; small independent currents keep it alive.
// Pointer influence is local and bounded, so an option never runs away.
export function contextPose({ progress = 1, time = 0, index = 0, base = {}, center = {}, pointer = null, rotation = 0, depth = 1, intensity = 1, reducedMotion = false } = {}) {
  const angle = finite(rotation);
  if (reducedMotion) return { x: 0, y: 0, rotation: angle, scale: 1, opacity: 1 };
  const item = Math.max(0, Math.min(6, Math.floor(finite(index))));
  const start = 0.06 + item * 0.045;
  const reveal = easeOut((clamp(finite(progress)) - start) / 0.24);
  const strength = Math.max(0.25, Math.min(1.4, finite(depth, 1))) * clamp(finite(intensity, 1));
  const clock = Math.max(0, finite(time)) / 1000;
  const phase = clock * 0.67 + item * 1.43;
  let dx = (Math.sin(phase) * 2.4 + Math.sin(phase * 0.63 + item) * 0.7) * strength;
  let dy = (Math.cos(phase * 0.84) * 3 + Math.sin(phase * 0.42 + item) * 0.8) * strength;
  if (pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y)) {
    const x = finite(base.x) - pointer.x;
    const y = finite(base.y) - pointer.y;
    const distance = Math.hypot(x, y);
    const influence = clamp(1 - distance / 160) ** 2;
    const directionX = distance > 0 ? x / distance : Math.cos(item * 1.4);
    const directionY = distance > 0 ? y / distance : Math.sin(item * 1.4);
    dx += directionX * influence * 8 * strength;
    dy += directionY * influence * 8 * strength;
  }
  return {
    x: (finite(center.x) - finite(base.x)) * (1 - reveal) + dx * reveal,
    y: (finite(center.y) - finite(base.y)) * (1 - reveal) + dy * reveal,
    rotation: angle * reveal + Math.sin(phase * 0.7) * 0.55 * strength * reveal,
    scale: 0.82 + reveal * 0.18,
    opacity: clamp(reveal / 0.45),
  };
}

export function initContextField(field, win = globalThis.window, doc = globalThis.document) {
  if (!field || !win || field.dataset.motionReady) return () => {};
  field.dataset.motionReady = 'true';
  const items = [...field.querySelectorAll('[data-context-item]')];
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = win.matchMedia('(hover: hover) and (pointer: fine)');
  const values = new Map();
  let pointer = null;
  let visible = true;
  let raf = null;
  let lastTime = null;
  let disposed = false;
  const removers = [];
  const listen = (host, name, callback, options) => {
    host.addEventListener(name, callback, options);
    removers.push(() => host.removeEventListener(name, callback, options));
  };
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
    const focused = field.contains(doc.activeElement);
    const progress = focused ? 1 : clamp((win.innerHeight * 0.92 - bounds.top) / ((win.innerHeight + bounds.height) * 0.55));
    const mobile = win.innerWidth <= 560;
    const intensity = mobile ? bounds.width < 320 ? 0.5 : 0.65 : 1;
    const cursor = pointer && finePointer.matches && !mobile ? { x: pointer.x - bounds.left, y: pointer.y - bounds.top } : null;
    const delta = lastTime === null ? 16 : Math.max(1, Math.min(64, now - lastTime));
    const blend = reduced.matches ? 1 : 1 - Math.exp(-delta / 105);
    lastTime = now;
    items.forEach((item, index) => {
      const target = contextPose({
        progress, time: now, index,
        base: { x: item.offsetLeft, y: item.offsetTop },
        center: { x: bounds.width / 2, y: bounds.height * 0.53 },
        pointer: cursor, rotation: Number(item.dataset.rotation), depth: Number(item.dataset.depth), intensity,
        reducedMotion: reduced.matches || item.contains(doc.activeElement),
      });
      const pose = values.get(item) || { ...target };
      for (const key of Object.keys(target)) pose[key] += (target[key] - pose[key]) * blend;
      values.set(item, pose);
      item.style.setProperty('--context-x', `${pose.x.toFixed(3)}px`);
      item.style.setProperty('--context-y', `${pose.y.toFixed(3)}px`);
      item.style.setProperty('--context-rotate', `${pose.rotation.toFixed(3)}deg`);
      item.style.setProperty('--context-scale', pose.scale.toFixed(4));
      item.style.setProperty('--context-opacity', pose.opacity.toFixed(4));
    });
    if (!reduced.matches) schedule();
  }
  const observer = typeof win.IntersectionObserver === 'function' ? new win.IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) schedule();
    else cancelFrame();
  }, { rootMargin: '120px 0px' }) : null;
  observer?.observe(field);
  listen(win, 'pointermove', event => {
    pointer = event.pointerType === 'mouse' ? { x: event.clientX, y: event.clientY } : null;
    schedule();
  }, { passive: true });
  listen(win, 'blur', () => { pointer = null; schedule(); });
  listen(win, 'scroll', schedule, { passive: true });
  listen(win, 'resize', () => { values.clear(); schedule(); }, { passive: true });
  listen(field, 'focusin', () => { visible = true; cancelFrame(); paint(win.performance.now()); });
  listen(field, 'focusout', schedule);
  listen(reduced, 'change', () => { values.clear(); cancelFrame(); schedule(); });
  listen(doc, 'visibilitychange', () => {
    if (doc.visibilityState === 'hidden') cancelFrame();
    else schedule();
  });
  paint(win.performance.now());
  return () => {
    disposed = true;
    cancelFrame();
    observer?.disconnect();
    removers.forEach(remove => remove());
    delete field.dataset.motionReady;
  };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') initContextField(document.querySelector('.context-field'));
