import { cityIdentity } from './city-name.mjs';
import './pointer-position.js';

// A city label accompanies the native pointer across the whole landing page.
// It never replaces the system cursor, intercepts clicks, or stores a location.
const cursor = document.querySelector('.visitor-cursor');
if (cursor) {
  const label = cursor.querySelector('[data-cursor-name]');
  let point = null;
  let frame = 0;
  let visible = false;

  function positionCursor() {
    frame = 0;
    if (!point || !visible) return;
    const width = cursor.offsetWidth;
    const height = cursor.offsetHeight;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    let x = point.x + 14;
    let y = point.y + 20;
    if (x + width > viewportWidth - 8) x = point.x - width - 12;
    if (y + height > viewportHeight - 8) y = point.y - height - 12;
    x = Math.max(8, Math.min(x, viewportWidth - width - 8));
    y = Math.max(8, Math.min(y, viewportHeight - height - 8));
    cursor.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    cursor.classList.add('is-visible');
  }

  function schedulePosition() {
    if (!frame) frame = requestAnimationFrame(positionCursor);
  }

  function hideCursor() {
    visible = false;
    cancelAnimationFrame(frame);
    frame = 0;
    cursor.classList.remove('is-visible');
  }

  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') {
      hideCursor();
      return;
    }
    point = { x: event.clientX, y: event.clientY };
    visible = true;
    // Native dialogs use the top layer; keep the label visible there as well.
    const host = event.target.closest('dialog[open]') || document.body;
    if (cursor.parentElement !== host) host.append(cursor);
    schedulePosition();
  }, { passive: true });
  document.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse') hideCursor();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', hideCursor);
  document.addEventListener('pointercancel', hideCursor);
  window.addEventListener('blur', hideCursor);
  window.addEventListener('resize', schedulePosition);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hideCursor();
  });
  document.addEventListener('close', event => {
    if (event.target.contains(cursor)) {
      document.body.append(cursor);
      schedulePosition();
    }
  }, true);

  function displayCity(city) {
    label.textContent = cityIdentity(city).label;
    schedulePosition();
  }

  // Vercel supplies city metadata in production. Local previews deliberately
  // remain generic unless a developer explicitly opens ?city=Seoul, etc.
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname) || location.hostname.endsWith('.localhost');
  if (local) {
    displayCity(new URLSearchParams(location.search).get('city'));
  } else if (location.protocol === 'https:' || location.protocol === 'http:') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    fetch('/api/location/', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    })
      .then(response => response.ok ? response.json() : null)
      .then(data => displayCity(data?.city))
      .catch(() => displayCity(null))
      .finally(() => clearTimeout(timeout));
  }
}
