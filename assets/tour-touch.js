// Native mobile panning can cross the demo after the finger has lifted.
// Remember only that entry intent; page position never selects a tour step.
export function createTouchEntry({ now = () => performance.now(), momentumMs = 1500 } = {}) {
  const momentum = Number.isFinite(momentumMs) ? Math.max(0, momentumMs) : 1500;
  const validRange = range => range && Number.isFinite(range.start) && Number.isFinite(range.end) && range.end >= range.start;
  let pending = null;

  function cancel() { pending = null; }

  return {
    begin(position, range) {
      cancel();
      if (!Number.isFinite(position) || !validRange(range)) return;
      const direction = position < range.start ? 1 : position > range.end ? -1 : 0;
      if (direction) pending = { direction, position, active: true, until: null };
    },
    end() {
      if (!pending?.active) return;
      const time = now();
      if (!Number.isFinite(time)) { cancel(); return; }
      pending.active = false;
      pending.until = time + momentum;
    },
    cancel,
    consume(position, range) {
      if (!pending) return 0;
      if (!Number.isFinite(position) || !validRange(range)) { cancel(); return 0; }
      if (!pending.active) {
        const time = now();
        if (!Number.isFinite(time) || time >= pending.until) { cancel(); return 0; }
      }
      const { direction } = pending;
      const movingInward = (position - pending.position) * direction > 0;
      pending.position = position;
      const reached = direction > 0 ? position >= range.start : position <= range.end;
      if (!movingInward || !reached) return 0;
      cancel();
      return direction;
    },
  };
}
