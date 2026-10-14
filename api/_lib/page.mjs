// The small page a visitor sees after posting the form without
// JavaScript: the 404's layout (mouse, a printed headline, one paragraph, a
// handwritten way back, the colophon). The site's Content-Security-Policy
// covers function responses too, so: /assets/site.css only, no style=
// attributes, no inline <style> or <script>. noindex, never cached.

import { COPY } from "./copy.mjs";

const DEFS = `<svg class="crayon-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs><filter id='cr-pen' x='-10%' y='-60%' width='120%' height='220%' filterUnits='userSpaceOnUse' color-interpolation-filters='sRGB'><feTurbulence type='fractalNoise' baseFrequency='1.064' numOctaves='2' seed='5'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0' result='gr'/><feGaussianBlur in='SourceAlpha' stdDeviation='0.79' result='s'/><feComposite in='s' in2='gr' operator='arithmetic' k1='2.931' k2='-0.466' k3='1.319' k4='-0.539'/><feComponentTransfer result='m'><feFuncA type='linear' slope='2.6' intercept='-0.80'/></feComponentTransfer><feGaussianBlur in='SourceAlpha' stdDeviation='1.21'/><feComponentTransfer result='gt'><feFuncA type='linear' slope='8' intercept='-0.4'/></feComponentTransfer><feComposite in='m' in2='gt' operator='in' result='m2'/><feFlood flood-color='#171b22'/><feComposite in2='m2' operator='in'/></filter><filter id='cr-ring' x='-10%' y='-60%' width='120%' height='220%' filterUnits='userSpaceOnUse' color-interpolation-filters='sRGB'><feTurbulence type='fractalNoise' baseFrequency='0.418' numOctaves='2' seed='4'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0' result='gr'/><feGaussianBlur in='SourceAlpha' stdDeviation='2.02' result='s'/><feComposite in='s' in2='gr' operator='arithmetic' k1='2.931' k2='-0.466' k3='1.319' k4='-0.539'/><feComponentTransfer result='m'><feFuncA type='linear' slope='2.6' intercept='-0.80'/></feComponentTransfer><feGaussianBlur in='SourceAlpha' stdDeviation='3.08'/><feComponentTransfer result='gt'><feFuncA type='linear' slope='8' intercept='-0.4'/></feComponentTransfer><feComposite in='m' in2='gt' operator='in' result='m2'/><feFlood flood-color='#171b22'/><feComposite in2='m2' operator='in'/></filter><filter id='cr-strike' x='-10%' y='-60%' width='120%' height='220%' filterUnits='userSpaceOnUse' color-interpolation-filters='sRGB'><feTurbulence type='fractalNoise' baseFrequency='0.246' numOctaves='2' seed='8'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0' result='gr'/><feGaussianBlur in='SourceAlpha' stdDeviation='3.42' result='s'/><feComposite in='s' in2='gr' operator='arithmetic' k1='2.931' k2='-0.466' k3='1.552' k4='-0.656'/><feComponentTransfer result='m'><feFuncA type='linear' slope='2.6' intercept='-0.80'/></feComponentTransfer><feGaussianBlur in='SourceAlpha' stdDeviation='5.23'/><feComponentTransfer result='gt'><feFuncA type='linear' slope='8' intercept='-0.4'/></feComponentTransfer><feComposite in='m' in2='gt' operator='in' result='m2'/><feFlood flood-color='#171b22'/><feComposite in2='m2' operator='in'/></filter></defs></svg>`;
const MARK = `<svg viewBox="0 0 32.7 21.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="ink" pathLength="1" d="M1.25 16.38C1.57 17.01 1.74 17.75 2.2 18.28C2.69 18.84 3.37 19.32 4.15 19.63C5.07 20 6.51 20.16 7.45 20.18C8.16 20.2 8.7 20.1 9.31 19.96C9.94 19.82 10.58 19.59 11.18 19.32C11.78 19.05 12.37 18.7 12.91 18.33C13.44 17.95 13.94 17.52 14.37 17.07C14.78 16.64 15.16 16.16 15.46 15.68C15.73 15.23 15.97 14.75 16.11 14.29C16.23 13.87 16.31 13.43 16.29 13.04C16.27 12.68 16.19 12.32 16.03 12.04C15.88 11.78 15.64 11.54 15.39 11.4C15.13 11.25 14.79 11.19 14.47 11.18C14.13 11.18 13.75 11.27 13.4 11.4C13.03 11.54 12.65 11.78 12.32 12.04C11.98 12.32 11.65 12.67 11.38 13.04C11.11 13.41 10.88 13.85 10.71 14.29C10.55 14.73 10.44 15.22 10.42 15.68C10.39 16.14 10.44 16.63 10.56 17.07C10.69 17.51 10.9 17.95 11.17 18.33C11.45 18.71 11.82 19.05 12.22 19.32C12.64 19.6 13.14 19.82 13.65 19.96C14.19 20.11 14.69 20.12 15.37 20.18C16.36 20.27 17.8 20.39 19.05 20.4C20.36 20.41 21.8 20.36 23.05 20.2C24.18 20.05 25.23 19.88 26.25 19.53C27.26 19.19 28.27 18.69 29.15 18.13C29.99 17.6 30.68 16.9 31.45 16.28C31.28 15.55 31.21 14.8 30.95 14.08C30.68 13.33 30.35 12.55 29.85 11.88C29.31 11.17 28.49 10.55 27.75 9.98C27.02 9.42 26.17 9.05 25.45 8.48C24.71 7.89 23.83 7.25 23.35 6.48C22.89 5.74 22.5 4.77 22.55 3.98C22.6 3.24 23 2.33 23.55 1.88C24.12 1.42 25.21 1.16 25.95 1.28C26.68 1.4 27.55 1.96 27.95 2.58C28.36 3.22 28.45 4.28 28.35 5.08C28.25 5.88 27.91 6.79 27.35 7.38C26.75 8.02 25.7 8.51 24.75 8.68C23.72 8.86 22.46 8.58 21.35 8.28C20.19 7.97 19.12 7.04 17.95 6.83C16.81 6.62 15.59 6.75 14.45 6.98C13.29 7.21 12.11 7.67 11.05 8.23C9.98 8.8 8.92 9.54 8.05 10.38C7.19 11.22 6.32 12.26 5.85 13.28C5.42 14.2 5.18 15.14 5.2 16.18C5.22 17.39 5.88 18.79 6.22 20.09"/><circle class="eye dab" cx="27.15" cy="13.88" r="1.4" fill="currentColor" stroke="none"/></svg>`;
const ARROW = `<svg class="cta-arrow" viewBox="0 0 90.6 33.6" aria-hidden="true"><path class="pen" pathLength="1" d="M2 17.08C2.93 18.91 3.42 21.05 4.75 22.59C6.18 24.21 8.15 25.61 10.41 26.5C13.08 27.58 17.25 28.04 19.98 28.1C22.04 28.16 23.6 27.87 25.37 27.46C27.2 27.06 29.06 26.39 30.8 25.61C32.54 24.82 34.25 23.81 35.81 22.73C37.35 21.63 38.8 20.39 40.05 19.08C41.24 17.83 42.34 16.44 43.21 15.05C43.99 13.75 44.69 12.35 45.09 11.02C45.44 9.8 45.67 8.52 45.62 7.39C45.56 6.35 45.33 5.31 44.86 4.49C44.43 3.74 43.73 3.04 43.01 2.64C42.25 2.2 41.27 2.03 40.34 2C39.35 2 38.25 2.26 37.23 2.64C36.16 3.04 35.06 3.74 34.1 4.49C33.12 5.31 32.16 6.32 31.38 7.39C30.59 8.47 29.93 9.74 29.43 11.02C28.97 12.3 28.65 13.72 28.59 15.05C28.51 16.38 28.65 17.8 29 19.08C29.38 20.36 29.98 21.63 30.77 22.73C31.58 23.84 32.65 24.82 33.81 25.61C35.03 26.42 36.48 27.06 37.96 27.46C39.53 27.9 40.98 27.93 42.95 28.1C49.41 28.53 60.73 29.03 70.88 28.01C77.25 27.38 83.05 26.27 88.27 24.82"/><path class="pen" pathLength="1" d="M81.31 18.59C83.92 20.62 86.25 22.65 88.56 24.68C85.67 26.71 83.05 29.03 80.44 31.64"/></svg>`;
const UNDERLINE = `<svg viewBox="0 0 120 10" preserveAspectRatio="none" aria-hidden="true"><path class="pen" pathLength="1" d="M2 6c28-2 78-1 116-3"/></svg>`;

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// The unsubscribe address and hello@ become links, so the confirmation
// stays copyable text with working links.
export function linkify(text) {
  return escapeHtml(text).replace(/telicity\.ai\/(?:ko\/)?unsubscribe\/|hello@telicity\.ai/g, (m) =>
    m.startsWith("hello@") ? `<a href="mailto:${m}">${m}</a>` : `<a href="${m.slice("telicity.ai".length)}">${m}</a>`);
}

export function renderPage({ lang, kind, ok, message }) {
  const c = COPY[lang];
  const home = lang === "ko" ? "/ko/" : "/";
  const other = lang === "ko" ? { href: "/", lang: "en" } : { href: "/ko/", lang: "ko" };
  const heading = ok
    ? c[kind === "signup" ? "doneTitle" : "unsubDoneTitle"]
    : c[kind === "signup" ? "errorTitle" : "unsubErrorTitle"];
  const back = ok
    ? { text: c.backHome, href: home }
    : kind === "signup"
      ? { text: c.backForm, href: home + "#waitlist" }
      : { text: c.backUnsub, href: home + "unsubscribe/" };
  const title = heading.replace(/[.。]$/, "") + " | " + c.siteName;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#f6f6f3">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/newsreader.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
${DEFS}
<div class="sheet">
  <header class="masthead">
    <a class="mark" href="${home}" aria-label="${escapeHtml(c.siteName)}">
      ${MARK}
    </a>
  </header>

  <main class="page page-404 page-reply">
    <div class="row row-h1">
      <h1>${escapeHtml(heading)}</h1>
    </div>
    <div class="row row-body">
      <p class="reply-msg">${linkify(message)}</p>
    </div>
    <div class="row row-cta">
      <p class="cta-line">${ARROW}<a class="cta" href="${back.href}">${escapeHtml(back.text)}${UNDERLINE}</a></p>
    </div>
  </main>

  <footer class="foot">
    <p>${escapeHtml(c.copyright)}</p>
    <a class="foot-privacy" href="${home}privacy/"><strong>${escapeHtml(c.footerPrivacy)}</strong></a>
    <a href="${other.href}" hreflang="${other.lang}" lang="${other.lang}">${escapeHtml(c.otherLang)}</a>
    <a href="mailto:hello@telicity.ai">hello@telicity.ai</a>
  </footer>
</div>
</body>
</html>
`;
}
