import { cityIdentity } from './city-name.mjs';
import './pointer-position.js';

// The arrow stays on the real pointer; only its city tag moves at the edges.
export function initVisitorCursor(doc = globalThis.document, win = globalThis.window) {
  const cursor = doc?.querySelector('.visitor-cursor');
  const arrow = cursor?.querySelector('.collab-arrow');
  const label = cursor?.querySelector('.visitor-label');
  const name = cursor?.querySelector('[data-cursor-name]');
  if (!cursor || !arrow || !label || !name || !win) return () => {};
  const finePointer = win.matchMedia('(any-hover: hover) and (any-pointer: fine)');
  const forcedColors = win.matchMedia('(forced-colors: active)');
  const removers = [];
  let point = null;
  let frame = 0;
  let visible = false;
  let buttons = 0;
  let disposed = false;
  let locationController;
  let locationTimeout;

  function listen(host, event, callback, options) {
    host.addEventListener(event, callback, options);
    removers.push(() => host.removeEventListener(event, callback, options));
  }

  function syncHost() {
    const host = doc.querySelector('dialog[open]') || doc.body;
    if (cursor.parentElement !== host) host.append(cursor);
  }

  function positionCursor() {
    frame = 0;
    if (!point || !visible || disposed) return;
    syncHost();
    const target = doc.elementFromPoint(point.x, point.y) || doc.body;
    const selection = doc.getSelection();
    const native = forcedColors.matches || Boolean(target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))
      || Boolean(buttons && selection && !selection.isCollapsed);
    const compact = arrow.getBoundingClientRect().width <= 20;
    const width = label.offsetWidth;
    const height = label.offsetHeight;
    const viewportWidth = doc.documentElement.clientWidth;
    const viewportHeight = win.innerHeight;
    let x = compact ? 9 : 14;
    let y = compact ? 14 : 18;
    if (point.x + x + width > viewportWidth - 8) x = -width - 12;
    if (point.y + y + height > viewportHeight - 8) y = -height - 12;
    x = Math.max(8 - point.x, Math.min(x, viewportWidth - width - 8 - point.x));
    y = Math.max(8 - point.y, Math.min(y, viewportHeight - height - 8 - point.y));
    cursor.style.transform = 'translate3d(' + point.x + 'px, ' + point.y + 'px, 0)';
    label.style.left = x + 'px';
    label.style.top = y + 'px';
    cursor.classList.toggle('is-native', native);
    cursor.classList.add('is-visible');
    // Hide the OS pointer only after its replacement has been positioned.
    doc.documentElement.classList.toggle('has-visitor-cursor', !native);
  }

  function schedulePosition() {
    if (!frame && visible && !disposed) frame = win.requestAnimationFrame(positionCursor);
  }

  function hideCursor() {
    visible = false;
    point = null;
    buttons = 0;
    win.cancelAnimationFrame(frame);
    frame = 0;
    cursor.classList.remove('is-visible', 'is-native');
    doc.documentElement.classList.remove('has-visitor-cursor');
  }

  function trackPointer(event) {
    if (event.pointerType !== 'mouse' || !finePointer.matches) { hideCursor(); return; }
    point = { x: event.clientX, y: event.clientY };
    buttons = event.buttons;
    visible = true;
    schedulePosition();
  }

  listen(doc, 'pointermove', trackPointer, { passive: true });
  listen(doc, 'pointerdown', trackPointer, { passive: true });
  listen(doc, 'pointerup', trackPointer, { passive: true });
  listen(doc.documentElement, 'pointerleave', hideCursor);
  listen(doc, 'pointercancel', hideCursor);
  listen(win, 'blur', hideCursor);
  listen(win, 'resize', schedulePosition);
  listen(win, 'scroll', schedulePosition, { passive: true });
  listen(doc, 'selectionchange', schedulePosition);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) hideCursor(); });
  listen(finePointer, 'change', () => { if (!finePointer.matches) hideCursor(); });
  listen(forcedColors, 'change', schedulePosition);
  listen(doc, 'close', () => { syncHost(); schedulePosition(); }, true);
  // A modal can open without another mouse move; move into the top layer now.
  const observer = new win.MutationObserver(() => { syncHost(); schedulePosition(); });
  observer.observe(doc.body, { subtree: true, attributes: true, attributeFilter: ['open'] });

  function displayCity(city) {
    if (disposed) return;
    name.textContent = cityIdentity(city).label;
    schedulePosition();
  }

  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(win.location.hostname) || win.location.hostname.endsWith('.localhost');
  if (local) {
    displayCity(new URLSearchParams(win.location.search).get('city'));
  } else if (win.location.protocol === 'https:' || win.location.protocol === 'http:') {
    locationController = new AbortController();
    locationTimeout = win.setTimeout(() => locationController.abort(), 4000);
    win.fetch('/api/location/', {
      headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'omit', signal: locationController.signal,
    })
      .then(response => response.ok ? response.json() : null)
      .then(data => displayCity(data?.city))
      .catch(() => displayCity(null))
      .finally(() => win.clearTimeout(locationTimeout));
  }

  return () => {
    disposed = true;
    hideCursor();
    observer.disconnect();
    removers.forEach(remove => remove());
    locationController?.abort();
    if (locationTimeout) win.clearTimeout(locationTimeout);
  };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') initVisitorCursor();
