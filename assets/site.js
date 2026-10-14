// Pen marks in [data-draw] groups (the run / run a mile doodle, the stroke
// through “someday”, the sign-up's line, arrow and underline) wait until
// they are scrolled into view instead of drawing unseen. A group is reached
// when half of it is on screen; the scene, which holds the struck word, when
// the struck word is wholly on screen, so the reader never reads past it
// unstruck. The sign-up row, when its first line is.
// Without this file they all draw once on load (those below the fold finish
// before the reader arrives); with reduced motion, or in print, everything is
// simply shown drawn.
//
// There is deliberately no getBoundingClientRect pass at startup. WebKit
// (Safari, every iOS browser) runs deferred scripts before pending head
// stylesheets apply, so a layout measured straight away is unstyled and
// sends groups that are on screen into waiting. The observer's first
// callback always comes after the first styled layout, so it decides.
(() => {
  if (!("IntersectionObserver" in window)) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const seen = new WeakSet();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const t = e.target;
        const el = t.closest("[data-draw]");
        const first = !seen.has(t);
        seen.add(t);
        // A group needs half of itself on screen; the struck word all of
        // itself (0.99, and a threshold there, allow for subpixel ratios).
        if (e.isIntersecting && e.intersectionRatio >= (t === el ? 0.5 : 0.99)) {
          // Reached later: .is-late swaps the group's on-load start for a
          // short one (site.css). On screen from the start: left as it is,
          // so the pen works down the page in order.
          if (!first) {
            el.classList.add("is-late");
            el.classList.remove("is-waiting");
          }
          io.unobserve(t);
        } else if (first) {
          // Less than half on screen at load: wait for the reader. Every
          // group's delay is at least 0.95s, so pausing here always lands
          // before its first stroke.
          el.classList.add("is-waiting");
        }
      }
    },
    // The root reaches far above the viewport, so a group the reader has
    // already scrolled past (in one jump, say) counts as reached too.
    { rootMargin: "100000px 0px 0px 0px", threshold: [0.5, 0.99] }
  );

  // The sign-up row is tall (the notice and the boxes are in it): it starts
  // when its first line, the one marked data-draw-at, is wholly on screen.
  for (const el of document.querySelectorAll("[data-draw]")) io.observe(el.querySelector(".strike, [data-draw-at]") || el);
})();


// The sign-up and unsubscribe forms (form[data-wl]). Without this file they
// post the ordinary way and /api/waitlist/ or /api/unsubscribe/ answers with
// a page of its own. With it they post with fetch (the same urlencoded body,
// plus Accept: application/json) and answer in place:
//   loading  the button says so (data-pen-sending) and is aria-disabled
//   error    the email field or the missing boxes are marked aria-invalid,
//            the words go under the field or under the button, focus goes
//            to the first thing to fix
//   done     the notice, the button and the unsubscribe line step aside,
//            the line keeps the address and gets its endpoint dot, the
//            confirmation (with its date) takes focus
// The messages for errors found here are the form's data-msg-* attributes;
// everything else is the server's reply, word for word.
(() => {
  if (!("fetch" in window && "FormData" in window && "URLSearchParams" in window)) return;

  // Loose on purpose: the server has the strict check and the last word.
  const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
  const LINK = /(telicity\.ai\/(?:ko\/)?unsubscribe\/|hello@telicity\.ai)/;

  // Text with the unsubscribe address and hello@ as links (the reply is a
  // record the reader may keep, so it stays plain, copyable text).
  function fill(el, text) {
    el.textContent = "";
    for (const part of String(text || "").split(LINK)) {
      if (!part) continue;
      if (LINK.test(part)) {
        const a = document.createElement("a");
        a.href = part.startsWith("hello@") ? "mailto:" + part : part.slice("telicity.ai".length);
        a.textContent = part;
        el.append(a);
      } else {
        el.append(part);
      }
    }
  }

  for (const form of document.querySelectorAll("form[data-wl]")) {
    const email = form.elements.email;
    const boxes = Array.from(form.querySelectorAll('input[type="checkbox"]'));
    const button = form.querySelector('button[type="submit"]');
    const label = button.querySelector(".wl-btn");
    const idle = label.textContent;
    const status = form.querySelector(".wl-status");
    const err = form.querySelector(".wl-err");
    const msg = (k) => form.getAttribute("data-msg-" + k) || "";
    let busy = false;

    form.noValidate = true;

    function mark(input, on, describedBy) {
      if (on) {
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", describedBy);
      } else {
        input.removeAttribute("aria-invalid");
        input.removeAttribute("aria-describedby");
      }
    }

    function reset() {
      mark(email, false);
      for (const b of boxes) mark(b, false);
      fill(err, "");
      fill(status, "");
      status.classList.remove("vh");
      form.classList.remove("is-error");
    }

    function fail(code, text) {
      form.classList.add("is-error");
      if (code === "invalid") {
        mark(email, true, err.id);
        fill(err, text);
        email.focus();
        return;
      }
      fill(status, text);
      const missing = code === "consent" ? boxes.filter((b) => !b.checked) : [];
      for (const b of missing) mark(b, true, status.id);
      (missing[0] || button).focus();
    }

    function done(text) {
      form.classList.add("is-done");
      email.readOnly = true;
      // The notice, the button and the way to unsubscribe step aside (the
      // confirmation links the unsubscribe page itself).
      for (const el of form.querySelectorAll(".wl-consent, .wl-act, .wl-aside")) el.hidden = true;
      fill(status, text);
      status.tabIndex = -1;
      status.focus();
    }

    email.addEventListener("input", () => {
      if (email.hasAttribute("aria-invalid")) {
        mark(email, false);
        fill(err, "");
      }
    });

    for (const b of boxes) {
      b.addEventListener("change", () => {
        if (b.checked) mark(b, false);
        if (boxes.every((x) => x.checked) && form.classList.contains("is-error") && !email.hasAttribute("aria-invalid")) fill(status, "");
      });
    }

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (busy || form.classList.contains("is-done")) return;
      reset();
      const value = email.value.trim();
      if (!value || !EMAIL.test(value) || email.validity.typeMismatch) return fail("invalid", msg("invalid"));
      if (boxes.some((b) => !b.checked)) return fail("consent", msg("consent"));

      busy = true;
      form.classList.add("is-loading");
      button.setAttribute("aria-disabled", "true");
      label.textContent = form.getAttribute("data-pen-sending") || idle;
      status.classList.add("vh");
      fill(status, label.textContent);

      let data = null;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000);
      try {
        const res = await fetch(form.action, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: new URLSearchParams(new FormData(form)),
          credentials: "same-origin",
          signal: ctl.signal,
        });
        data = await res.json();
      } catch {
        data = null;
      }
      clearTimeout(timer);

      busy = false;
      form.classList.remove("is-loading");
      button.removeAttribute("aria-disabled");
      label.textContent = idle;
      status.classList.remove("vh");
      fill(status, "");

      if (data && data.ok === true && typeof data.message === "string") done(data.message);
      else fail(data && data.error, (data && typeof data.message === "string" && data.message) || msg("server"));
    });
  }
})();
