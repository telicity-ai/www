// A transient viewport position shared by the visitor label and the demo.
// Nothing is persisted or sent anywhere.
let pointer = null;

export function recordPointerPosition(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0) return;
  pointer = { x: point.x, y: point.y };
}

export function getPointerPosition() {
  return pointer ? { ...pointer } : null;
}

export function clearPointerPosition() {
  pointer = null;
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'mouse') recordPointerPosition({ x: event.clientX, y: event.clientY });
    else clearPointerPosition();
  }, { passive: true });
  document.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse') clearPointerPosition();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', clearPointerPosition);
  document.addEventListener('pointercancel', clearPointerPosition);
  window.addEventListener('blur', clearPointerPosition);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearPointerPosition();
  });
}
