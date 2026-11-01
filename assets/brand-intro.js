// Causal's captured reference settles at about 1.9s after the first frame.
// Give the larger Telicity mark a short recognition hold before its handoff.
const INTRO_DURATION = 2300;
const MARK_SIZE = 192;
const clamp = value => Math.max(0, Math.min(1, value));
const phase = (value, start, end) => clamp((value - start) / (end - start));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const easeOut = value => value === 0 || value === 1 ? value : 1 - 2 ** (-10 * value);
const easeInOut = value => value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
const validBox = box => box && ['left', 'top', 'width', 'height'].every(key => Number.isFinite(box[key])) && box.width > 0 && box.height > 0;

// A single elapsed time reconstructs the entire handoff, including late frames.
export function brandIntroFrame(elapsed, { viewport, target, reducedMotion = false } = {}) {
  if (!validBox(target) || !viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) return null;
  const time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const finished = reducedMotion || time >= INTRO_DURATION;
  const destination = { x: target.left + target.width / 2, y: target.top + target.height / 2 };
  const handoff = finished ? 1 : easeInOut(phase(time, 1100, 2200));
  const emerging = easeOut(phase(time, 350, 800));
  const grown = MARK_SIZE * (0.15 + 0.85 * emerging);
  const targetSize = Math.min(target.width, target.height);
  const size = finished ? targetSize : grown + (targetSize - grown) * handoff;
  const centerX = viewport.width / 2 + (destination.x - viewport.width / 2) * handoff;
  const centerY = viewport.height / 2 + (destination.y - viewport.height / 2) * handoff;
  return {
    x: centerX - size / 2,
    y: centerY - size / 2,
    size,
    scale: size / MARK_SIZE,
    dotOpacity: finished ? 0 : 1 - smooth(phase(time, 350, 800)),
    dotScale: 0.4 + 0.6 * easeOut(phase(time, 0, 350)) + 0.65 * smooth(phase(time, 350, 800)),
    markOpacity: finished ? 1 : smooth(phase(time, 350, 680)),
    pageOpacity: finished ? 1 : smooth(phase(time, 1100, 1980)),
    backgroundOpacity: finished ? 0 : 1 - smooth(phase(time, 1100, 2050)),
    revealing: finished || time >= 1100,
    done: finished,
    phase: finished ? 'complete' : time < 350 ? 'dot' : time < 800 ? 'emerging' : time < 1100 ? 'holding' : time < 2200 ? 'moving' : 'settled',
  };
}

// The HTML bootstrap is deliberately bounded and opt-in. Without its class,
// the ordinary page remains visible and this module does nothing.
export function initBrandIntro(doc = globalThis.document, win = globalThis.window) {
  const root = doc?.documentElement;
  const overlay = doc?.querySelector('.brand-intro');
  const mark = overlay?.querySelector('img');
  const target = doc?.querySelector('.hero-mark img');
  if (!root || !win) return { cancel() {} };
  let frameId = null;
  let imageTimeout = null;
  let safetyTimeout = null;
  let finished = false;
  const removers = [];

  function finish() {
    if (finished) return;
    finished = true;
    if (frameId !== null) win.cancelAnimationFrame(frameId);
    if (imageTimeout !== null) win.clearTimeout(imageTimeout);
    if (safetyTimeout !== null) win.clearTimeout(safetyTimeout);
    removers.forEach(remove => remove());
    root.classList.remove('intro-pending', 'intro-revealing');
    root.style.removeProperty('--intro-page-opacity');
    overlay?.style.removeProperty('--intro-background-opacity');
    if (overlay) overlay.dataset.phase = 'complete';
  }

  const controller = { cancel: finish };
  if (!root.classList.contains('intro-pending')) return controller;
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const navigation = win.performance.getEntriesByType?.('navigation')?.[0];
  if (!overlay || !mark || !target || reduced.matches || win.location.hash || win.scrollY > 4 || navigation?.type === 'back_forward') {
    finish();
    return controller;
  }

  function listen(host, name, callback, options) {
    host.addEventListener(name, callback, options);
    removers.push(() => host.removeEventListener(name, callback, options));
  }
  for (const name of ['wheel', 'touchstart', 'keydown', 'pointerdown', 'resize', 'pagehide']) listen(win, name, finish, { passive: true });
  listen(win, 'scroll', () => { if (win.scrollY > 4) finish(); }, { passive: true });
  listen(reduced, 'change', event => { if (event.matches) finish(); });
  listen(doc, 'visibilitychange', () => { if (doc.visibilityState === 'hidden') finish(); });
  // An asset that never becomes drawable must not leave a blank loading page.
  safetyTimeout = win.setTimeout(finish, 3000);

  function start() {
    if (finished || !root.classList.contains('intro-pending')) { finish(); return; }
    if (!mark.complete || !mark.naturalWidth || !target.complete || !target.naturalWidth) { finish(); return; }
    const bounds = target.getBoundingClientRect();
    const viewport = { width: win.innerWidth, height: win.innerHeight };
    if (!validBox(bounds)) { finish(); return; }
    const started = win.performance.now();
    function paint(now) {
      frameId = null;
      if (finished || !root.classList.contains('intro-pending')) { finish(); return; }
      const frame = brandIntroFrame(now - started, { viewport, target: bounds });
      if (!frame || frame.done) { finish(); return; }
      overlay.dataset.phase = frame.phase;
      root.classList.toggle('intro-revealing', frame.revealing);
      root.style.setProperty('--intro-page-opacity', String(frame.pageOpacity));
      overlay.style.setProperty('--intro-background-opacity', String(frame.backgroundOpacity));
      overlay.style.setProperty('--intro-dot-opacity', String(frame.dotOpacity));
      overlay.style.setProperty('--intro-dot-scale', String(frame.dotScale));
      mark.style.opacity = String(frame.markOpacity);
      mark.style.transform = `translate3d(${frame.x.toFixed(3)}px, ${frame.y.toFixed(3)}px, 0) scale(${frame.scale.toFixed(6)})`;
      frameId = win.requestAnimationFrame(paint);
    }
    paint(started);
  }

  if (mark.complete && mark.naturalWidth && target.complete && target.naturalWidth) start();
  else {
    imageTimeout = win.setTimeout(finish, 220);
    const decode = image => typeof image.decode === 'function' ? image.decode() : Promise.reject(new Error('Image is not ready'));
    Promise.all([decode(mark), decode(target)]).then(() => {
      if (imageTimeout !== null) win.clearTimeout(imageTimeout);
      imageTimeout = null;
      start();
    }).catch(finish);
  }
  return controller;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') initBrandIntro(document, window);
