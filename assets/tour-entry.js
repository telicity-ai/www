// Page position can drift while a captured wheel/touch gesture is settling.
// Keep it at the owned boundary; only explicit input may advance the player.
export function createTourEntryGuard({ onAlign } = {}) {
  let position = null;
  const validBoundary = value => Number.isFinite(value) && value >= 0;

  return {
    capture(value) {
      if (validBoundary(value)) position = value;
    },
    update(value) {
      if (position !== null && validBoundary(value)) position = value;
    },
    release() { position = null; },
    getState() { return { captured: position !== null, position }; },
    handleScroll(actual) {
      if (position === null) return false;
      if (Number.isFinite(actual) && Math.abs(actual - position) > 4) onAlign?.(position);
      return true;
    },
  };
}
