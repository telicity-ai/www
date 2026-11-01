// This same-origin classic script runs before the first paint under script-src 'self'.
// The automatic animation controller takes over after the logo is ready to paint.
(() => {
  const doc = document;
  const win = window;
  const root = doc.documentElement;
  if (!root) return;
  let watchdog = null;

  function clearWatchdog() {
    if (watchdog !== null) win.clearTimeout(watchdog);
    watchdog = null;
    doc.removeEventListener('telicity:intro-ready', ready);
  }

  function ready() {
    clearWatchdog();
  }

  function release() {
    clearWatchdog();
    root.classList.remove('intro-pending', 'intro-revealing');
  }

  try {
    const navigation = win.performance?.getEntriesByType?.('navigation')?.[0];
    if (win.location.hash || win.matchMedia('(prefers-reduced-motion: reduce)').matches
      || navigation?.type === 'back_forward' || win.scrollY > 4) return;
    root.classList.add('intro-pending');
    doc.addEventListener('telicity:intro-ready', ready, { once: true });
    watchdog = win.setTimeout(release, 3500);
  } catch {
    release();
  }
})();
