import { getPointerPosition } from './pointer-position.js';

const clamp = value => Math.max(0, Math.min(1, value));
const phase = (value, start, end) => clamp((value - start) / (end - start));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const easeOut = value => 1 - (1 - clamp(value)) ** 3;
const agents = ['pm', 'design', 'marketing'];
const entryTimes = [0.27, 0.305, 0.32];
const workArrivals = [0.385, 0.425, 0.44];
const departureTimes = [0.58, 0.605, 0.59];
const voteTimes = [0.70, 0.735, 0.76];
const reactionTimes = [0.905, 0.935, 0.965];

export function scrollTravel(compact = false) {
  return compact ? 240 : 360;
}

// One continuous curved gesture with a gentle arrival. There is no stop and
// restart near the target, even when the whole step takes less than 1.5 seconds.
export function mousePath(from, to, amount, seed = 0) {
  const t = clamp(amount);
  if (t === 0) return { ...from };
  if (t === 1) return { ...to };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (!distance) return { ...to };
  const direction = { x: dx / distance, y: dy / distance };
  const normal = { x: -direction.y, y: direction.x };
  const side = seed % 2 ? -1 : 1;
  const bend = Math.min(42, distance * (0.10 + (Math.abs(seed) % 3) * 0.015)) * side;
  const u = smooth(t);
  const a = 1 - u;
  const c1 = { x: from.x + dx * 0.28 + normal.x * bend, y: from.y + dy * 0.28 + normal.y * bend };
  const c2 = { x: from.x + dx * 0.74 + normal.x * bend * 0.25, y: from.y + dy * 0.74 + normal.y * bend * 0.25 };
  return { x: a ** 3 * from.x + 3 * a * a * u * c1.x + 3 * a * u * u * c2.x + u ** 3 * to.x, y: a ** 3 * from.y + 3 * a * a * u * c1.y + 3 * a * u * u * c2.y + u ** 3 * to.y };
}

// Keep each teammate at their last edit until their own voting turn begins.
export function workPose(progress, index, { initial, start, end }) {
  if (progress < workArrivals[index]) return mousePath(initial, start, phase(progress, entryTimes[index], workArrivals[index]), index + 1);
  return mousePath(start, end, phase(progress, 0.46 + index * 0.009, 0.525 + index * 0.009), index + 5);
}

// Each teammate sets off independently. Their flights overlap, and each slot
// fills on arrival rather than waiting for a serial procession.
export function votePose(progress, index, position, target = position) {
  const time = voteTimes[index];
  const pose = mousePath(position, target, phase(progress, departureTimes[index], time), index + 7);
  const press = progress >= time && progress < time + 0.025 ? Math.sin(Math.PI * phase(progress, time, time + 0.025)) : 0;
  return { x: pose.x + press, y: pose.y + press * 2 };
}

// A single burst expands across the workspace. Pure values keep it reversible.
export function confettiParticle(index, amount, radius = 65) {
  const t = clamp(amount);
  const angle = index * 2.3999632297 - Math.PI / 2;
  const speed = 0.55 + ((index * 17) % 11) / 22;
  const travel = easeOut(t) * radius * speed;
  return {
    x: Math.cos(angle) * travel,
    y: Math.sin(angle) * travel + radius * 0.42 * t * t,
    rotation: index * 41 + t * (index % 2 ? 290 : -240),
    opacity: t === 0 || t === 1 ? 0 : phase(t, 0, 0.09) * (1 - phase(t, 0.55, 1)),
  };
}

export function collaborationFrame(value) {
  const progress = Number.isFinite(value) ? clamp(value) : 0;
  const scene = progress < 0.27 ? 0 : progress < 0.57 ? 1 : 2;
  const votes = voteTimes.map(time => progress >= time);
  const voteCount = votes.filter(Boolean).length;
  const agreed = progress >= 0.79;
  const celebration = phase(progress, 0.80, 0.90);
  const voteSignals = voteTimes.map(time => easeOut(phase(progress, time, time + 0.025)));
  const voteProgress = voteSignals.reduce((sum, signal) => sum + signal, 0) / agents.length;
  const reactions = reactionTimes.map(time => easeOut(phase(progress, time, time + 0.025)));
  let beat;
  if (scene === 0) beat = progress < 0.02 ? 'home' : progress < 0.21 ? 'approach' : 'click';
  else if (scene === 1) beat = progress < 0.37 ? 'open' : progress < 0.51 ? 'collaborate' : 'draft';
  else beat = reactions.some(Boolean) ? 'reactions' : progress > 0.80 && progress < 0.90 ? 'celebration' : agreed ? 'consensus' : voteCount ? `vote-${voteCount}` : 'proposal';
  return {
    progress, scene, beat, votes, voteCount, agreed, voteSignals, voteProgress, celebration, reactions,
    pressed: progress >= 0.21 && progress < 0.25,
    click: progress >= 0.21 && progress < 0.25 ? phase(progress, 0.21, 0.25) : null,
  };
}

export function previewProgress(scene) {
  return [0.18, 0.54, 1][Math.max(0, Math.min(2, Number(scene)))];
}

export function createCollaboration({ workspace, language }) {
  const ko = language === 'ko';
  const ensemble = workspace.querySelector('.agent-ensemble');
  const cursors = agents.map(agent => workspace.querySelector(`[data-agent="${agent}"]`));
  const campaign = workspace.querySelector('[data-task="campaign"]');
  const selection = workspace.querySelector('.agent-selection');
  const huddle = workspace.querySelector('.huddle-space');
  const voteSlots = [...workspace.querySelectorAll('.vote-progress-fill')];
  const pieces = [...workspace.querySelectorAll('.confetti-piece')];
  let homeOrigin = null;
  let homeClick = { x: 0.36, y: 0.48 };

  const text = (selector, value) => {
    const element = workspace.querySelector(selector);
    if (element && element.textContent !== value) element.textContent = value;
  };

  function render(frame, { reducedMotion = false, scrollDriven = false } = {}) {
    const { progress: p, scene } = frame;
    const bounds = workspace.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const rect = selector => {
      const element = workspace.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return box.width && box.height ? { x: box.left - bounds.left, y: box.top - bounds.top, width: box.width, height: box.height } : null;
    };
    const point = (selector, x = 0.5, y = 0.5, fallback = { x: bounds.width * 0.45, y: bounds.height * 0.5 }) => {
      const box = rect(selector);
      return box ? { x: box.x + box.width * x, y: box.y + box.height * y } : fallback;
    };
    const textPoint = (selector, x, y, fallback) => {
      const element = workspace.querySelector(selector);
      if (!element) return fallback;
      const box = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const words = range.getBoundingClientRect();
      // Aim at the visible words, rather than empty space in a full-width row.
      const left = Math.max(box.left, words.left);
      const right = Math.min(box.right, words.right);
      const top = Math.max(box.top, words.top);
      const bottom = Math.min(box.bottom, words.bottom);
      if (right <= left || bottom <= top) return fallback;
      return { x: left - bounds.left + (right - left) * x, y: top - bounds.top + (bottom - top) * y };
    };
    const normalized = value => ({ x: value.x * bounds.width, y: value.y * bounds.height });
    if (p < 0.01 || !scrollDriven) homeOrigin = null;
    if (scene === 0) {
      const target = point('[data-task="campaign"] strong', 0.45, 0.6, normalized(homeClick));
      homeClick = { x: target.x / bounds.width, y: target.y / bounds.height };
      if (scrollDriven && p >= 0.015 && !homeOrigin) {
        homeOrigin = getPointerPosition() || { x: bounds.left + bounds.width * 0.88, y: bounds.top + bounds.height * 0.78 };
        cursors[0].dataset.originX = homeOrigin.x.toFixed(2);
        cursors[0].dataset.originY = homeOrigin.y.toFixed(2);
      }
    }

    const doc = rect('.scene-pocket .pocket-document') || { x: bounds.width * 0.18, y: bounds.height * 0.11, width: bounds.width * 0.60, height: bounds.height * 0.88 };
    const inDoc = (x, y) => ({ x: doc.x + doc.width * x, y: doc.y + doc.height * y });
    const compact = bounds.width < 560;
    const bases = [inDoc(0.41, 0.54), inDoc(0.17, 0.30), inDoc(0.80, 0.40)];
    const workEnds = [
      textPoint('.agent-selection p', 0.65, 0.55, bases[0]),
      textPoint('.reference-note > span', 0.50, 0.65, bases[1]),
      textPoint('.document-copy', compact ? 0.68 : 0.92, 0.78, bases[2]),
    ];
    const corrections = [{ x: -8, y: 0 }, { x: 6, y: -1 }, { x: -6, y: 1 }];
    const workStarts = workEnds.map((end, index) => ({ x: end.x + corrections[index].x, y: end.y + corrections[index].y }));
    const hub = point('.huddle-anchor', 0.5, 0.5, inDoc(0.5, 0.75));
    const offsets = compact ? [{ x: -20, y: -10 }, { x: -4, y: 12 }, { x: 20, y: -6 }] : [{ x: -24, y: -12 }, { x: -5, y: 14 }, { x: 27, y: -7 }];
    const poses = agents.map((agent, index) => {
      if (scene === 0) {
        // Static previews must remain attached to the product when the page
        // scrolls away. Only an active scroll sequence hands off the pointer.
        if (!scrollDriven) return { ...normalized(homeClick), opacity: 0 };
        const origin = homeOrigin || { x: bounds.left + bounds.width * 0.88, y: bounds.top + bounds.height * 0.78 };
        const target = normalized(homeClick);
        return { ...mousePath(origin, { x: bounds.left + target.x, y: bounds.top + target.y }, phase(p, 0.02, 0.21), 2), opacity: index === 0 && p >= 0.015 ? 1 : 0, global: index === 0 };
      }
      if (scene === 1) {
        const entry = phase(p, entryTimes[index], entryTimes[index] + 0.03);
        const initial = index === 0 ? normalized(homeClick) : inDoc(index === 1 ? 0.07 : 0.92, 0.08);
        const pose = workPose(p, index, { initial, start: workStarts[index], end: workEnds[index] });
        return { ...pose, opacity: index === 0 ? 1 : entry };
      }
      const target = { x: hub.x + offsets[index].x, y: hub.y + offsets[index].y };
      return { ...votePose(p, index, workEnds[index], target), opacity: 1 };
    });

    workspace.dataset.storyBeat = frame.beat;
    campaign.classList.toggle('is-agent-pressed', frame.pressed && !reducedMotion);
    campaign.classList.toggle('is-agent-hovered', scene === 0 && p >= 0.16);
    const draftOpacity = scene === 1 ? phase(p, 0.385, 0.43) : 1;
    selection.style.opacity = String(reducedMotion ? 1 : draftOpacity);
    selection.setAttribute('aria-hidden', String(scene === 1 && draftOpacity === 0));
    workspace.querySelector('.reference-note').classList.toggle('is-agent-reviewed', scene === 1 && p >= 0.425);
    workspace.querySelector('.document-copy').classList.toggle('is-agent-editing', scene === 1 && p >= 0.44);

    const effectiveVotes = reducedMotion && scene === 2 ? [true, true, true] : frame.votes;
    const effectiveAgreement = reducedMotion && scene === 2 ? true : frame.agreed;
    huddle.dataset.active = String(scene === 2);
    huddle.dataset.agreed = String(effectiveAgreement);
    voteSlots.forEach((slot, index) => {
      slot.style.strokeDashoffset = String(1 - (reducedMotion && scene === 2 ? 1 : frame.voteSignals[index]));
    });
    text('[data-vote-count]', `${effectiveVotes.filter(Boolean).length} / 3`);
    text('[data-consensus-text]', ko ? effectiveAgreement ? '좋아요. 이 방향으로 함께 가요.' : frame.voteCount ? '같은 안에 한 표씩 모으고 있어요.' : '이 문장, 다들 어떻게 생각해요?' : effectiveAgreement ? 'Agreed. Let’s go with this.' : frame.voteCount ? 'One proposal. A vote from each of us.' : 'What do we think of this line?');

    const actions = ko ? scene > 0 ? ['· 방향 살피기', '· 흐름 살피기', '· 메시지 살피기'] : ['', '', ''] : scene > 0 ? ['· checking direction', '· checking flow', '· checking the message'] : ['', '', ''];
    cursors.forEach((cursor, index) => {
      const pose = poses[index];
      const global = Boolean(pose.global);
      const host = global ? document.body : ensemble;
      if (cursor.parentElement !== host) host.append(cursor);
      cursor.setAttribute('aria-hidden', 'true');
      cursor.classList.toggle('is-global', global);
      const x = global ? pose.x : Math.max(6, Math.min(pose.x, bounds.width - 16));
      const y = global ? pose.y : Math.max(30, Math.min(pose.y, bounds.height - 28));
      cursor.style.transform = `translate3d(${(x - 4).toFixed(2)}px, ${(y - 3).toFixed(2)}px, 0)`;
      cursor.style.opacity = String(reducedMotion ? 0 : pose.opacity);
      cursor.dataset.voting = String(scene === 2);
      const goingToVote = scene === 2 && p >= departureTimes[index];
      const arrived = scene === 2 && p >= voteTimes[index];
      cursor.dataset.goingToVote = String(goingToVote);
      cursor.dataset.atVote = String(arrived);
      cursor.dataset.dock = global ? y < 40 ? 'below' : 'above' : arrived ? agents[index] : '';
      if (global) {
        const width = compact ? 26 : 32;
        const labelLeft = Math.max(8, Math.min(x + 18, document.documentElement.clientWidth - width - 8)) - (x - 4);
        cursor.style.setProperty('--handoff-label-left', `${labelLeft.toFixed(2)}px`);
      }
      const action = cursor.querySelector('.collab-action');
      if (action.textContent !== actions[index]) action.textContent = actions[index];
      const label = cursor.querySelector('.collab-label');
      const labelOpacity = scene === 2 ? Math.max(1 - phase(p, departureTimes[index], departureTimes[index] + 0.015), phase(p, voteTimes[index], voteTimes[index] + 0.015)) : 1;
      // Let the colored pointers lead during their overlapping flights, then
      // restore the full name tags as each teammate settles beside the circle.
      label.style.opacity = String(labelOpacity);
      const labelRoom = (compact ? 12 : 18) + label.offsetWidth + (compact ? 30 : 36);
      const startAlignedLeft = workEnds[index].x + labelRoom > doc.x + doc.width - 8;
      cursor.dataset.align = arrived ? index === 0 ? 'left' : 'right' : !global && scene > 0 && x + labelRoom > doc.x + doc.width - 8 ? 'left' : 'right';
      if (goingToVote) {
        // Fan the existing name tag outward during the flight, keeping its
        // text and width stable rather than swapping layouts on arrival.
        const dock = smooth(phase(p, departureTimes[index], voteTimes[index]));
        const start = { x: startAlignedLeft ? (compact ? 9 : 12) - label.offsetWidth : compact ? 12 : 18, y: compact ? 16 : 21 };
        const finish = index === 0 ? { x: -label.offsetWidth - (compact ? 10 : 12), y: -8 } : index === 1 ? { x: -label.offsetWidth / 2, y: 24 } : { x: compact ? 10 : 18, y: -8 };
        cursor.style.setProperty('--vote-label-x', `${(start.x + (finish.x - start.x) * dock).toFixed(2)}px`);
        cursor.style.setProperty('--vote-label-y', `${(start.y + (finish.y - start.y) * dock).toFixed(2)}px`);
      }
      const signal = cursor.querySelector('.cursor-vote');
      const amount = frame.voteSignals[index];
      signal.style.opacity = String(amount);
      signal.style.transform = `scale(${(0.7 + 0.3 * amount).toFixed(3)})`;
      const reaction = cursor.querySelector('.collab-reaction');
      const reactionAmount = frame.reactions[index];
      reaction.style.opacity = String(reactionAmount);
      reaction.style.transform = `translateY(${(6 * (1 - reactionAmount)).toFixed(2)}px) scale(${(0.75 + 0.25 * reactionAmount).toFixed(3)})`;
      cursor.dataset.voted = String(effectiveVotes[index]);
      const ring = cursor.querySelector('.collab-click');
      const press = scene === 0 && index === 0 ? frame.click : null;
      ring.style.opacity = press === null ? '0' : String(Math.sin(Math.PI * press) * 0.8);
      ring.style.transform = `translate(-50%, -50%) scale(${press === null ? 0.5 : 0.5 + press * 1.2})`;
    });

    const burstOrigin = { x: bounds.width * 0.5, y: bounds.height * 0.48 };
    pieces.forEach((piece, index) => {
      const particle = confettiParticle(index, frame.celebration, 1);
      piece.style.opacity = String(reducedMotion ? 0 : particle.opacity);
      piece.style.transform = `translate3d(${(burstOrigin.x + particle.x * bounds.width * 0.68).toFixed(2)}px, ${(burstOrigin.y + particle.y * bounds.height * 0.72).toFixed(2)}px, 0) rotate(${particle.rotation.toFixed(2)}deg)`;
    });
  }

  return { render };
}
