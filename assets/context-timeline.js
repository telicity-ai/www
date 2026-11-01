const clamp = value => Math.max(0, Math.min(1, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const phase = (value, start, end) => clamp((value - start) / (end - start));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const easeOut = value => 1 - (1 - clamp(value)) ** 3;

// One scroll position reconstructs the point, the growing mark, and its context.
export function contextSceneFrame(progress, { reducedMotion = false, mobile = false } = {}) {
  const p = reducedMotion ? 1 : clamp(finite(progress));
  const mark = smooth(phase(p, 0.12, 0.34));
  const destination = mobile ? 0.4 : 0.5;
  return {
    progress: p,
    dotOpacity: 1 - mark,
    markOpacity: mark,
    coreScale: 0.1 + mark * 0.9,
    coreY: 0.22 + (destination - 0.22) * smooth(phase(p, 0.14, 0.4)),
    coreOpacity: 1,
    introOpacity: 1 - smooth(phase(p, 0.18, 0.4)),
    copyOpacity: smooth(phase(p, 0.75, 0.88)),
  };
}

// Each card departs from the same point on a slightly different curved path.
// Small independent currents and bounded pointer influence continue after it lands.
export function contextPose({ progress = 1, time = 0, index = 0, base = {}, center = {}, pointer = null, rotation = 0, depth = 1, intensity = 1, reducedMotion = false } = {}) {
  const angle = finite(rotation);
  if (reducedMotion) return { x: 0, y: 0, rotation: angle, scale: 1, opacity: 1 };
  const item = Math.max(0, Math.min(6, Math.floor(finite(index))));
  const start = 0.34 + item * 0.035;
  const reveal = easeOut(phase(clamp(finite(progress)), start, start + 0.24));
  const strength = Math.max(0.25, Math.min(1.4, finite(depth, 1))) * clamp(finite(intensity, 1));
  const clock = Math.max(0, finite(time)) / 1000;
  const current = clock * 0.67 + item * 1.43;
  let dx = (Math.sin(current) * 2.4 + Math.sin(current * 0.63 + item) * 0.7) * strength;
  let dy = (Math.cos(current * 0.84) * 3 + Math.sin(current * 0.42 + item) * 0.8) * strength;
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
  const origin = { x: finite(center.x) - finite(base.x), y: finite(center.y) - finite(base.y) };
  const distance = Math.hypot(origin.x, origin.y);
  const side = item % 2 ? -1 : 1;
  const bend = reveal === 0 || reveal === 1 ? 0 : Math.sin(Math.PI * reveal) * Math.min(20, distance * 0.08) * side;
  const normal = distance > 0 ? { x: origin.y / distance, y: -origin.x / distance } : { x: 0, y: 0 };
  return {
    x: origin.x * (1 - reveal) + normal.x * bend + dx * reveal,
    y: origin.y * (1 - reveal) + normal.y * bend + dy * reveal,
    rotation: angle * reveal + Math.sin(current * 0.7) * 0.55 * strength * reveal,
    scale: 0.18 + reveal * 0.82,
    opacity: smooth(phase(reveal, 0.04, 0.3)),
  };
}
