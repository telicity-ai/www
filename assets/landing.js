import { createCollaboration, collaborationFrame, previewProgress, scrollTravel } from './collaboration.js?v=20261101-typing-vote';
import { createStepPlayer, createGestureGate } from './tour-player.js?v=20261101-fast-motion-2';
import { createTourEntryGuard } from './tour-entry.js?v=20261101-entry-guard';
import { createTouchEntry } from './tour-touch.js?v=20261101-mobile-entry';
import { createScrollSettler } from './scroll-settle.js?v=20261101-context-scene';

/* Scroll changes one anchored workspace. Each agent action settles and stops. */
(() => {
  'use strict';
  const ko = document.documentElement.lang === 'ko';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const workspace = $('#workspace');
  if (!workspace) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const copy = ko ? {
    stages: [
      ['시작은, 클릭 한 번에서.', '봄 캠페인 기획안을 열고 함께 일을 시작해요.', 'Home', '오늘의 시작', '· 함께 살펴보는 중'],
      ['각자의 관점으로, 같은 문서 위에서.', 'PM, 디자이너, 마케터가 함께 첫 문장을 다듬어요.', 'Pocket', '봄 캠페인 기획안', '· 문장을 다듬는 중'],
      ['각자의 리듬으로, 함께 고른 방향으로.', '서로 다른 타이밍에 모여, 한 표씩 세 칸을 채워요.', 'Pocket', '봄 캠페인 기획안', '· 함께 결정하는 중'],
    ],
    resting: '· 함께 보는 중',
    tasks: {
      campaign: ['어제 이야기한 캠페인, 같이 이어서 해볼까?', '좋아요. 남겨 둔 메모부터 함께 살펴볼게요.'],
      meeting: ['팀 미팅 전에, 이야기할 내용을 같이 정리해 줘.', '남겨 둔 생각을 모아, 함께 정할 일부터 정리할게요.'],
    },
    feedback: {
      short: ['당신의 봄, 당신의 방식으로.', '당신의 피드백 ‘더 간결하게’를 반영했어요.', '의미는 그대로 두고, 문장의 호흡을 줄였어요.'],
      warm: ['당신다운 봄을, 함께 시작해요.', '당신의 피드백 ‘조금 더 따뜻하게’를 반영했어요.', '혼자보다 함께라는 느낌을 더했어요.'],
    },
    apply: '이 방향으로 할게', applied: '함께 정한 방향', appliedStatus: '예시 문서 v.2에 반영했어요.',
    intent: { tone: '담백하게', context: '맥락을 살피고', review: '함께 결정해요' },
    emptyIntent: '어떤 기준으로 함께 일할까요?', singleTone: '하고 싶은 말을, 담백하게.',
  } : {
    stages: [
      ['It starts with one click.', 'Open the spring campaign brief and start together.', 'Home', 'A fresh start', '· looking things over'],
      ['Different perspectives. The same document.', 'A PM, designer, and marketer shape the first line together.', 'Pocket', 'Spring campaign brief', '· refining the draft'],
      ['Different rhythms. One shared decision.', 'Teammates join in their own time, each filling one of the three slots.', 'Pocket', 'Spring campaign brief', '· deciding together'],
    ],
    resting: '· here with you',
    tasks: {
      campaign: ['Shall we pick up that campaign from yesterday?', 'Let’s start with the notes you left.'],
      meeting: ['Help me get my thoughts together before the team meeting.', 'I’ll gather your notes and the decisions we need to make.'],
    },
    feedback: {
      short: ['Your spring. Your way.', 'Following your feedback: “Keep it concise.”', 'I kept the meaning and shortened the sentence.'],
      warm: ['A spring that’s yours. A start we share.', 'Following your feedback: “A little warmer.”', 'I brought a little more togetherness into the line.'],
    },
    apply: 'Let’s go with this', applied: 'A direction we share', appliedStatus: 'Applied to v.2 of this example.',
    intent: { tone: 'Keep it simple', context: 'Start with context', review: 'Decide together' },
    emptyIntent: 'What matters to you when we work together?', singleTone: 'Your meaning, simply put.',
  };
  let currentStage = 0;
  let paintedStep = null;
  let paintedScene = null;
  let paintedPinned = false;
  let geometry = null;
  let internalPosition = null;
  let bypassTour = false;
  let currentName = 'User';
  const setText = (selector, text) => { const el = $(selector); if (el) el.textContent = text; };

  const collaboration = createCollaboration({ workspace, language: ko ? 'ko' : 'en' });
  const player = createStepPlayer({
    onFrame: paint,
    onState(state) {
      track.dataset.playback = state.busy ? 'playing' : 'idle';
      track.dataset.completed = String(state.completed);
    },
  });

  function paint(progress, step) {
    const frame = collaborationFrame(progress);
    if (step !== paintedStep || frame.scene !== paintedScene) {
      setStage(step, false, frame.scene);
      paintedStep = step;
      paintedScene = frame.scene;
    }
    track.dataset.progress = progress.toFixed(4);
    track.dataset.step = String(step);
    paintedPinned = isPinned();
    collaboration.render(frame, { reducedMotion: reducedMotion.matches, scrollDriven: (paintedPinned || entrySettler.getState().busy) && player.getState().busy, staticPreview: !geometry });
  }

  function presentManualStage(scene) {
    const step = Math.max(0, Math.min(2, Number(scene)));
    wheelGate.reset();
    bypassTour = false;
    if (geometry) runStep(step);
    else if (reducedMotion.matches) player.play(step, { instant: true });
    else showStaticStage(step);
  }

  function showStaticStage(scene) {
    const step = Math.max(0, Math.min(2, Number(scene)));
    releaseCapture();
    alignTour();
    player.show(step, previewProgress(step), step + 1);
  }

  function setStage(value, animate = true, displayScene = Number(value)) {
    const next = Math.max(0, Math.min(2, Number(value)));
    const changed = next !== currentStage;
    const panelIndex = displayScene === 0 ? 0 : 1;
    const focusedPanel = document.activeElement?.closest('[data-panel]');
    const moveFocus = focusedPanel && Number(focusedPanel.dataset.panel) !== panelIndex;
    currentStage = next;
    workspace.dataset.scene = String(displayScene);
    $$('[data-panel]').forEach(panel => {
      panel.hidden = Number(panel.dataset.panel) !== panelIndex;
      panel.classList.remove('is-entering');
      if (!panel.hidden && changed && animate && !reducedMotion.matches) {
        panel.classList.add('is-entering');
      }
    });
    $$('[data-stage]').forEach(button => {
      const active = Number(button.dataset.stage) === next;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-active', active);
    });
    $$('.workspace-menu [data-go-scene]').forEach(button => {
      const active = Number(button.dataset.goScene) === (displayScene === 0 ? 0 : 1);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const [title, description] = copy.stages[next];
    const [, , breadcrumb, location] = copy.stages[displayScene];
    setText('[data-caption-title]', title);
    setText('[data-caption-description]', description);
    setText('[data-breadcrumb]', breadcrumb);
    setText('[data-location]', location);
    if (moveFocus) $(`[data-stage="${next}"]`).focus({ preventScroll: true });

  }

  $$('[data-stage], [data-go-scene]').forEach(button => {
    button.addEventListener('click', () => {
      const next = button.dataset.stage ?? button.dataset.goScene;
      presentManualStage(next);
    });
  });

  const track = $('#tour-track');
  const sticky = $('.tour-sticky', track);
  const caption = $('.tour-caption', track);
  const compactScreen = matchMedia('(max-height: 680px) and (max-width: 560px)');
  const wheelGate = createGestureGate(220);
  const touchEntry = createTouchEntry();
  const entryGuard = createTourEntryGuard({
    onAlign(position) {
      internalPosition = position;
      window.scrollTo({ top: position, behavior: 'instant' });
    },
  });
  const entrySettler = createScrollSettler({
    onFrame(position) {
      internalPosition = position;
      entryGuard.update(position);
      window.scrollTo({ top: position, behavior: 'instant' });
    },
    onFinish() { track.dataset.entry = 'held'; },
  });
  let scrollFrame = 0;
  let layoutFrame = 0;
  let touch = null;

  function releaseCapture() {
    entrySettler.cancel();
    touchEntry.cancel();
    entryGuard.release();
    internalPosition = null;
    track.dataset.captured = 'false';
    track.dataset.entry = 'free';
  }

  function cancelPlayback() {
    const state = player.cancel();
    // Home's pointer lives above the page only during active playback.
    paint(state.progress, state.step);
  }

  function isPinned() {
    return Boolean(geometry && window.scrollY >= geometry.start - 4 && window.scrollY <= geometry.end + 4);
  }

  function alignTour(capture = false, settle = false) {
    if (!geometry) return;
    entrySettler.cancel();
    const owned = entryGuard.getState();
    const position = owned.captured ? owned.position : window.scrollY;
    internalPosition = settle ? geometry.start : Math.max(0, Math.min(geometry.end, Math.max(geometry.start, position)));
    if (settle && !reducedMotion.matches && Math.abs(window.scrollY - internalPosition) > 1) {
      entryGuard.capture(Math.max(0, window.scrollY));
      track.dataset.captured = 'true';
      track.dataset.entry = 'settling';
      entrySettler.start(Math.max(0, window.scrollY), internalPosition);
      return;
    }
    if (capture) entryGuard.capture(internalPosition);
    else entryGuard.update(internalPosition);
    track.dataset.captured = String(entryGuard.getState().captured);
    track.dataset.entry = entryGuard.getState().captured ? 'held' : 'free';
    // Every step owns the same page position. Moving the document between
    // steps would shift the section heading and its green background edge.
    window.scrollTo({ top: internalPosition, behavior: 'instant' });
  }

  function runStep(step, reverse = false, settle = false) {
    touchEntry.cancel();
    alignTour(true, settle);
    player.play(step, { reverse, instant: reducedMotion.matches });
  }

  function reserveCaptionHeight() {
    const title = $('[data-caption-title]');
    const description = $('[data-caption-description]');
    const current = [title.textContent, description.textContent];
    caption.style.minHeight = '0px';
    let height = 0;
    for (const [heading, body] of copy.stages) {
      title.textContent = heading;
      description.textContent = body;
      height = Math.max(height, caption.getBoundingClientRect().height);
    }
    [title.textContent, description.textContent] = current;
    caption.style.minHeight = `${Math.ceil(height)}px`;
  }

  function useStaticLayout() {
    const state = player.getState();
    geometry = null;
    releaseCapture();
    player.cancel();
    track.classList.remove('is-enhanced');
    if (reducedMotion.matches) {
      if (state.busy) player.play(state.step, { instant: true });
      else paint(state.progress, state.step);
    } else player.show(currentStage, previewProgress(currentStage), state.completed);
  }

  function configureScroll() {
    layoutFrame = 0;
    const wasPinned = isPinned() || entryGuard.getState().captured;
    const previousGeometry = geometry;
    reserveCaptionHeight();
    if (reducedMotion.matches || compactScreen.matches) {
      useStaticLayout();
      return;
    }
    const height = Math.ceil(sticky.getBoundingClientRect().height);
    const minimumTop = $('.site-header').getBoundingClientRect().height + 12;
    if (height + minimumTop > window.innerHeight) {
      useStaticLayout();
      return;
    }

    const travel = scrollTravel(matchMedia('(max-width: 560px)').matches);
    const pinTop = Math.round(Math.max(minimumTop, (window.innerHeight - height) / 2));
    track.style.setProperty('--tour-sticky-height', `${height}px`);
    track.style.setProperty('--tour-travel', `${travel}px`);
    track.style.setProperty('--tour-sticky-top', `${pinTop}px`);
    track.classList.add('is-enhanced');
    const start = track.getBoundingClientRect().top + window.scrollY - pinTop;
    geometry = { start, end: start + travel, travel };
    const unchanged = previousGeometry && Math.abs(previousGeometry.start - start) < 1 && previousGeometry.travel === travel;
    if (wasPinned && !(entrySettler.getState().busy && unchanged)) alignTour();
    const state = player.getState();
    paint(state.progress, state.step);
  }

  function scheduleLayout() {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(configureScroll);
  }

  function updatePagePosition() {
    scrollFrame = 0;
    if (!geometry) return;
    const position = window.scrollY;
    // Once a gesture owns the demo, residual native scroll must only correct
    // its position. It must never cancel playback or choose another step.
    if (entryGuard.handleScroll(position)) return;
    // A swipe can begin above the demo and coast through its short track.
    // Native panning is already active, so catch that entry here and keep
    // the whole gesture on one scene rather than cancelling it mid-touch.
    const entryDirection = touchEntry.consume(position, geometry);
    if (entryDirection) {
      if (touch) touch.used = true;
      if (entryDirection > 0) {
        player.reset();
        runStep(0, false, true);
      } else {
        releaseCapture();
        cancelPlayback();
      }
      return;
    }
    if (internalPosition !== null && Math.abs(position - internalPosition) < 4) {
      internalPosition = null;
      return;
    }
    internalPosition = null;
    const pinned = isPinned();
    const state = player.getState();
    if (state.busy) player.cancel();
    if (!pinned) bypassTour = false;
    if (state.busy || paintedPinned !== pinned) paint(state.progress, state.step);
  }

  function schedulePagePosition() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updatePagePosition);
  }

  function editable(target) {
    return target.closest('input,textarea,select,dialog,[contenteditable]:not([contenteditable="false"])');
  }

  function scrollablePanel(target) {
    let node = target.closest('.panel-content');
    if (!node || node.scrollHeight <= node.clientHeight + 1) return false;
    return ['auto', 'scroll'].includes(getComputedStyle(node).overflowY);
  }

  function routeIntent(direction, distance, isFresh, target) {
    if (!geometry || bypassTour || editable(target) || scrollablePanel(target)) return false;
    // Only a downward entry owns a scene. Returning up the page is immediate.
    if (direction < 0) {
      releaseCapture();
      if (player.getState().busy) cancelPlayback();
      return false;
    }
    const position = window.scrollY;
    const captured = entryGuard.getState().captured;
    const entersAbove = direction > 0 && position < geometry.start - 4 && position + distance >= geometry.start - 4;
    if (!captured && !isPinned() && !entersAbove) return false;
    const fresh = isFresh();
    const state = player.getState();
    // After releasing an end of the tour, the rest of that gesture belongs
    // to the page even while it is still inside the short sticky track.
    if (!captured && !state.busy && state.completed === 3 && !entersAbove) return false;
    if (!fresh || state.busy) return true;
    if (!captured && entersAbove) player.reset();
    const { completed } = player.getState();
    if (direction > 0 && completed < 3) {
      runStep(completed, false, !captured && entersAbove);
      return true;
    }
    // At either end a new gesture belongs to the page again.
    releaseCapture();
    return false;
  }

  window.addEventListener('wheel', event => {
    touchEntry.cancel();
    if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || !event.deltaY) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    const delta = event.deltaY * unit;
    const target = event.target instanceof Element ? event.target : document.body;
    if (routeIntent(Math.sign(delta), Math.abs(delta), () => wheelGate.consume(performance.now()), target)) event.preventDefault();
  }, { passive: false });

  window.addEventListener('touchstart', event => {
    const target = event.target instanceof Element ? event.target : document.body;
    const protectedStart = editable(target) || scrollablePanel(target);
    const captured = entryGuard.getState().captured;
    touchEntry.cancel();
    if (geometry && event.touches.length === 1 && !protectedStart && !captured && !isPinned()) {
      if (window.scrollY < geometry.start) {
        releaseCapture();
        player.reset();
      }
      if (window.scrollY < geometry.start) touchEntry.begin(window.scrollY, geometry);
    }
    touch = event.touches.length === 1 ? {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
      lastY: event.touches[0].clientY,
      used: false,
      axis: null,
      capture: (isPinned() || captured) && !bypassTour && !protectedStart,
    } : null;
  }, { passive: true });
  window.addEventListener('touchmove', event => {
    if (!touch || event.touches.length !== 1 || !touch.capture) return;
    const point = event.touches[0];
    const vertical = touch.y - point.clientY;
    if (vertical < 0) {
      releaseCapture();
      if (player.getState().busy) cancelPlayback();
      touch.capture = false;
      return;
    }
    const horizontal = touch.x - point.clientX;
    const distance = Math.abs(touch.lastY - point.clientY);
    touch.lastY = point.clientY;
    if (touch.axis === null) {
      if (Math.abs(horizontal) > Math.abs(vertical)) {
        touch.capture = false;
        return;
      }
      if (!vertical) return;
      const state = player.getState();
      const exitsPage = vertical > 0 ? state.completed === 3 : state.completed === 0;
      if (!state.busy && exitsPage) {
        releaseCapture();
        touch.capture = false;
        return;
      }
      touch.axis = 'y';
    }
    // Prevent the first vertical move before the browser commits to native
    // panning; the distance threshold only decides when to start the step.
    if (Math.abs(vertical) < 14) {
      event.preventDefault();
      return;
    }
    const target = event.target instanceof Element ? event.target : document.body;
    if (routeIntent(Math.sign(vertical), distance, () => !touch.used, target)) {
      touch.used = true;
      event.preventDefault();
    }
  }, { passive: false });
  function endTouch() {
    touchEntry.end();
    touch = null;
  }
  window.addEventListener('touchend', endTouch, { passive: true });
  window.addEventListener('touchcancel', endTouch, { passive: true });

  window.addEventListener('keydown', event => {
    touchEntry.cancel();
    const target = event.target instanceof Element ? event.target : document.body;
    if (editable(target)) return;
    if (event.key === 'Escape' && (isPinned() || entryGuard.getState().captured)) {
      releaseCapture();
      cancelPlayback();
      bypassTour = true;
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (['Home', 'End', 'Tab'].includes(event.key)) { releaseCapture(); cancelPlayback(); return; }
    if (event.key === ' ' && target.closest('button,summary,a[href],[role="button"],[role="checkbox"],[role="switch"],[role="tab"]')) return;
    const direction = ['ArrowDown', 'PageDown'].includes(event.key) || event.key === ' ' && !event.shiftKey ? 1 : ['ArrowUp', 'PageUp'].includes(event.key) || event.key === ' ' && event.shiftKey ? -1 : 0;
    if (direction && routeIntent(direction, event.key.startsWith('Page') || event.key === ' ' ? window.innerHeight * 0.8 : 40, () => !event.repeat, target)) event.preventDefault();
  });

  window.addEventListener('scroll', schedulePagePosition, { passive: true });
  window.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') touchEntry.cancel();
    // A deliberate scrollbar drag is page navigation, rather than a step.
    if (event.pointerType === 'mouse' && event.button === 0 && event.clientX >= document.documentElement.clientWidth - 16) {
      releaseCapture();
      cancelPlayback();
      bypassTour = true;
    }
  }, { capture: true });
  document.addEventListener('click', event => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    const target = new URL(anchor.href, location.href);
    if (target.origin !== location.origin || target.pathname !== location.pathname || !target.hash) return;
    releaseCapture();
    bypassTour = false;
    cancelPlayback();
    if (target.hash === '#together') player.reset();
  });
  window.addEventListener('hashchange', () => {
    releaseCapture();
    bypassTour = false;
    cancelPlayback();
    if (location.hash === '#together') player.reset();
  });
  window.addEventListener('popstate', () => { releaseCapture(); bypassTour = false; cancelPlayback(); });
  window.addEventListener('resize', scheduleLayout);
  reducedMotion.addEventListener('change', scheduleLayout);
  compactScreen.addEventListener('change', scheduleLayout);
  if ('ResizeObserver' in window) {
    const sizeObserver = new ResizeObserver(scheduleLayout);
    sizeObserver.observe(workspace);
    sizeObserver.observe($('.site-header'));
  }
  document.fonts?.ready.then(scheduleLayout);
  player.reset();
  configureScroll();

  $$('[data-task]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.classList.contains('is-selected')));
    if (button.classList.contains('is-selected')) $('.task-check use', button).setAttribute('href', '#i-check');
    button.addEventListener('click', () => {
      $$('[data-task]').forEach(task => {
        const selected = task === button;
        task.classList.toggle('is-selected', selected);
        task.setAttribute('aria-pressed', String(selected));
        $('.task-check use', task).setAttribute('href', selected ? '#i-check' : task.dataset.task === 'campaign' ? '#i-doc' : '#i-chat');
      });
      const [request, answer] = copy.tasks[button.dataset.task];
      setText('[data-home-request]', request);
      setText('[data-home-answer]', answer);
      if (button.dataset.task === 'campaign') presentManualStage(1);
      else showStaticStage(0);
    });
  });
  $$('[data-pane]').forEach(button => button.addEventListener('click', () => {
    $$('[data-pane]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
    $$('[data-pane-content]').forEach(panel => { panel.hidden = panel.dataset.paneContent !== button.dataset.pane; });
  }));

  $$('[data-feedback]').forEach(button => button.addEventListener('click', () => {
    const [revision, context, reply] = copy.feedback[button.dataset.feedback];
    $$('[data-feedback]').forEach(option => {
      const selected = option === button;
      option.setAttribute('aria-pressed', String(selected));
      $('use', option).setAttribute('href', selected ? '#i-check' : '#i-plus');
    });
    setText('[data-revision]', revision);
    setText('[data-revision-context]', context);
    setText('[data-feedback-reply]', reply);
    setText('[data-apply-label]', copy.apply);
    setText('[data-review-version]', 'v.1 → v.2');
    setText('#review-status', '');
    $('#apply-feedback').disabled = false;
    showStaticStage(2);
  }));
  $('#apply-feedback').addEventListener('click', () => {
    setText('[data-apply-label]', copy.applied);
    setText('#review-status', copy.appliedStatus);
    setText('[data-review-version]', 'v.2 ✓');
    $('#apply-feedback').disabled = true;
    showStaticStage(2);
  });
  $('[data-revision-context]').setAttribute('role', 'status');

  $$('[data-intent]').forEach(button => button.addEventListener('click', () => {
    const active = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(active));
    $('use', button).setAttribute('href', active ? '#i-check' : '#i-plus');
    const chosen = $$('[data-intent][aria-pressed="true"]').map(option => option.dataset.intent);
    const result = chosen.length === 0 ? copy.emptyIntent : chosen.length === 1 && chosen[0] === 'tone' ? copy.singleTone : chosen.map(key => copy.intent[key]).join(' · ');
    setText('[data-intent-result]', result);
    const demo = $('#intent-demo');
    demo.dataset.selection = chosen.join(',') || 'none';
  }));

  // Browser profile identity is not available to websites. Only an optional,
  // visitor-provided display name is used, stored for this tab's session.
  function applyName(value) {
    currentName = Array.from(value.trim()).slice(0, 20).join('') || 'User';
    $$('[data-user-name]').forEach(label => { label.textContent = currentName; });
    $$('.avatar-person').forEach(avatar => { avatar.textContent = Array.from(currentName)[0].toUpperCase(); });
    try { sessionStorage.setItem('telicity-demo-name', currentName); } catch { /* Storage may be disabled. */ }
  }
  try { applyName(sessionStorage.getItem('telicity-demo-name') || 'User'); } catch { applyName('User'); }
  const dialog = $('#name-dialog');
  $('#edit-name').addEventListener('click', () => {
    $('#demo-name').value = currentName === 'User' ? '' : currentName;
    dialog.showModal();
    $('#demo-name').focus();
  });
  const closeName = $('.dialog-title-row button');
  closeName.type = 'button';
  closeName.addEventListener('click', () => dialog.close('cancel'));
  $('#name-form').addEventListener('submit', () => applyName($('#demo-name').value));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close('cancel');
  });


})();
