// The waitlist's logic: sign-ups (api/waitlist.mjs) and withdrawals
// (api/unsubscribe.mjs). It uses no platform API, so the tests can run it
// in a bare JavaScript shell (tools/tests/waitlist.test.mjs). The route files
// hand it the request as plain data and the platform pieces as deps:
//
//   req   { method, url, headers: { lower-case name: value }, body: string | null, tooLarge }
//   deps  { db: { url, token } | null, fetch, hmac(text) -> hex, now() -> ms, log(text),
//           blocked?: Map }   (blocked: the instance's networks over the limit, see overLimit)
//
// Storage is Upstash Redis over its REST API:
//
//   wl:emails            SET of every subscribed address
//   wl:sub:<email>       HASH  email -> the address
//                              consent:<version> -> {"at","lang","page"} (JSON)
//                        One consent entry per notice version, each written
//                        once with HSETNX: a repeated sign-up never changes
//                        a record, a sign-up under a newer notice adds its
//                        own entry and keeps the earlier one as proof.
//   wl:rl:<s|u>:<hmac>   rate-limit counter for one network, expires after
//                        WINDOW seconds; the IP itself is never stored
//   wl:log:deleted       HASH "<YYYY-MM-DD> unsubscribe" -> records destroyed
//                        that day (the destruction log; no addresses)
//
// Nothing here logs an email address, an IP address or a request body.

import { COPY } from "./copy.mjs";
import { renderPage } from "./page.mjs";

// Requests per network per window, sign-ups (s) and withdrawals (u) counted
// apart. Sign-ups are looser: an office, a campus or a mobile carrier puts
// many people behind one IPv4 address, and a launch post or a demo is when
// they all sign up at once. Withdrawals only ever come one at a time.
export const LIMIT = { s: 30, u: 10 };
export const WINDOW = 600; // seconds (the privacy policy promises under an hour)
export const MAX_BODY = 4096; // bytes; the form sends about 200
export const KEYS = { set: "wl:emails", sub: "wl:sub:", rl: "wl:rl:", log: "wl:log:deleted", keepalive: "wl:keepalive" };
export const KEEPALIVE_TTL = 7776000; // 90 days, so the stamp outlives any gap between cron runs
export const PAGES = { en: "/", ko: "/ko/" };
export const CURRENT_VERSION = COPY.consentVersions[COPY.consentVersions.length - 1];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

// ---------- Parsing ----------

// The form posts application/x-www-form-urlencoded, with or without
// JavaScript; JSON is accepted too. Returns a null-prototype object of
// strings, null for a malformed body, undefined for another media type.
export function parseBody(contentType, text) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  const out = Object.create(null);
  if (type === "application/x-www-form-urlencoded") {
    for (const part of String(text || "").split("&")) {
      if (!part) continue;
      const i = part.indexOf("=");
      const k = decode(i < 0 ? part : part.slice(0, i));
      const v = decode(i < 0 ? "" : part.slice(i + 1));
      if (k === null || v === null) return null;
      if (!(k in out)) out[k] = v; // the first value wins
    }
    return out;
  }
  if (type === "application/json") {
    let o;
    try {
      o = JSON.parse(text);
    } catch {
      return null;
    }
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    for (const k of Object.keys(o)) {
      if (typeof o[k] === "string") out[k] = o[k];
      else if (o[k] === true) out[k] = "yes";
    }
    return out;
  }
  return undefined;
}

function decode(s) {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return null;
  }
}

const LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

// Trimmed and lower-cased, or null. Strict on purpose: a plain dot-atom
// local part and an ASCII (punycode) domain with at least two labels. Quoted
// local parts, IP-literal domains and raw Unicode are refused; a browser's
// type="email" field sends IDN domains as punycode already.
export function normalizeEmail(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (s.length < 6 || s.length > 254) return null;
  const at = s.indexOf("@");
  if (at < 1 || at !== s.lastIndexOf("@")) return null;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  // A spreadsheet reads a cell that starts with = + or - as a formula, and
  // the list is exported as CSV. Real addresses don't start that way.
  if (/^[=+\-]/.test(local)) return null;
  if (local.length > 64 || !LOCAL.test(local)) return null;
  if (domain.length > 253) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return null;
  if (!TLD.test(labels[labels.length - 1])) return null;
  return s;
}

// ---------- Request checks ----------

// Same-origin posts only. A browser always sends Origin on a POST (older
// ones at least Sec-Fetch-Site or Referer), so a request from another site
// is refused; "null" (sandboxed frames, cross-site redirects) too. A client
// that sends none of them is not a browser being used for a cross-site post.
export function sameOrigin(h, url) {
  const hosts = new Set();
  for (const v of [h["x-forwarded-host"], h.host, (/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url || "") || [])[1]]) {
    if (v) hosts.add(String(v).split(",")[0].trim().toLowerCase());
  }
  const hostOf = (u) => ((/^https?:\/\/([^/?#]+)/i.exec(String(u)) || [])[1] || "").toLowerCase();
  if (h.origin !== undefined) return h.origin !== "null" && hosts.has(hostOf(h.origin));
  if (h["sec-fetch-site"] !== undefined) return h["sec-fetch-site"] === "same-origin";
  if (h.referer !== undefined) return hosts.has(hostOf(h.referer));
  return true;
}

// Vercel overwrites X-Forwarded-For and X-Real-IP with the connecting
// address, so neither can be spoofed from outside. On Vercel x-real-ip is
// always present; "unknown" (below) is only reached elsewhere.
export function clientIp(h) {
  return (h["x-real-ip"] || h["x-vercel-forwarded-for"] || h["x-forwarded-for"] || "").split(",")[0].trim();
}

// The network a request comes from: an IPv4 address, or an IPv6 /64 (one
// household or phone usually holds a whole /64).
export function networkOf(ip) {
  let s = String(ip || "").trim().toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapped) s = mapped[1];
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(s)) return s.split(".").every((o) => Number(o) <= 255) ? s : "unknown";
  if (!s.includes(":")) return "unknown";
  s = s.replace(/%.*$/, "");
  const halves = s.split("::");
  if (halves.length > 2) return "unknown";
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 2 && fill === 0)) return "unknown";
  const groups = head.concat(Array(fill).fill("0"), tail);
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return "unknown";
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

// ---------- Dates ----------

// The notice of the result (정보통신망법 시행령 제62조의2) needs a specific
// date, never "today": the consent's date in Korea time.
export function kstParts(ms) {
  const d = new Date(ms + 9 * 3600 * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

export function formatDate(lang, ms) {
  const { y, m, d } = kstParts(ms);
  return lang === "ko" ? `${y}년 ${m}월 ${d}일` : `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function isoDate(ms) {
  const { y, m, d } = kstParts(ms);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ---------- Upstash ----------

// Upstash's answer once the plan's request quota is used up (it comes with
// HTTP 400, or in place of a transaction's results).
const QUOTA = /^ERR max (?:daily |monthly )?requests? limit exceeded/i;
const isQuota = (d) => !!d && typeof d.error === "string" && QUOTA.test(d.error);

// path "" sends one command to the root URL; "/multi-exec" a transaction.
// Errors carry only an HTTP status or a fixed phrase, never the command
// (which holds the address) and never Upstash's own error text (an
// "unknown command" error echoes the arguments). A used-up quota gets its
// own phrase, so the owner can tell it from an outage in the logs.
export async function redis(deps, path, command) {
  const res = await deps.fetch(deps.db.url.replace(/\/+$/, "") + path, {
    method: "POST",
    headers: { authorization: "Bearer " + deps.db.token, "content-type": "application/json" },
    body: JSON.stringify(command),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = undefined;
  }
  if (isQuota(data) || (Array.isArray(data) && data.some(isQuota))) throw new Error("upstash quota exceeded");
  if (!res.ok) throw new Error("upstash http " + res.status);
  if (data === undefined) throw new Error("upstash reply unreadable");
  if (path === "/multi-exec") {
    if (!Array.isArray(data) || data.length !== command.length) throw new Error("upstash transaction discarded");
    for (const r of data) if (!r || r.error !== undefined) throw new Error("upstash command failed");
    return data.map((r) => r.result);
  }
  if (!data || data.error !== undefined) throw new Error("upstash command failed");
  return data.result;
}

// A fixed window per network: the first request sets the counter with its
// expiry, every request adds one, in one transaction.
//
// A network over the limit is also kept in deps.blocked (one Map per
// function instance) until a window from then has passed, and turned away
// without asking Upstash: otherwise a flood from one address costs two
// Upstash commands a request and could use up the plan's quota, and with it
// every sign-up and withdrawal. An entry holds the same hash as Redis and
// never outlives its window (each check drops the expired ones; the policy
// promises the hash is gone within an hour). A full Map adds nothing more
// rather than forgetting the networks it holds. Floods from many addresses
// are the Vercel Firewall rule's job (README).
async function overLimit(deps, scope, req) {
  const key = KEYS.rl + scope + ":" + String(await deps.hmac(networkOf(clientIp(req.headers)))).slice(0, 32);
  const now = deps.now();
  const blocked = deps.blocked;
  if (blocked) {
    for (const [k, until] of blocked) if (until <= now) blocked.delete(k);
    if (blocked.has(key)) return true;
  }
  const [, n] = await redis(deps, "/multi-exec", [["SET", key, "0", "EX", String(WINDOW), "NX"], ["INCR", key]]);
  if (Number(n) <= LIMIT[scope]) return false;
  if (blocked && blocked.size < 1000) blocked.set(key, now + WINDOW * 1000);
  return true;
}

// Removes the address from the set and its record, and counts the record
// in the destruction log only when there was one. One script, so a known and
// an unknown address take the same single round trip.
export const UNSUBSCRIBE_LUA =
  "local n = redis.call('SREM', KEYS[1], ARGV[1]) + redis.call('DEL', KEYS[2])\n" +
  "if n > 0 then redis.call('HINCRBY', KEYS[3], ARGV[2], 1) end\n" +
  "return n";

// ---------- Replies ----------

const STATUS = { ok: 200, invalid: 400, version: 400, rate: 429, server: 503, forbidden: 403, too_large: 413, unsupported: 415 };
const MESSAGE = { invalid: "errorInvalid", rate: "errorRate" };

function reply(kind, code, lang, json, ms) {
  const c = COPY[lang];
  const ok = code === "ok";
  const message = ok
    ? c[kind === "signup" ? "success" : "unsubSuccess"].replace("{date}", formatDate(lang, ms))
    : c[MESSAGE[code] || (kind === "signup" ? "errorServer" : "unsubErrorServer")];
  const headers = { "cache-control": "no-store", "x-robots-tag": "noindex" };
  if (code === "rate") headers["retry-after"] = String(WINDOW);
  let body;
  if (json) {
    headers["content-type"] = "application/json; charset=utf-8";
    body = JSON.stringify(ok ? { ok: true, date: isoDate(ms), message } : { ok: false, error: code, message });
  } else {
    headers["content-type"] = "text/html; charset=utf-8";
    body = renderPage({ lang, kind, ok, message });
  }
  return { status: STATUS[code], headers, body };
}

function redirect(location) {
  return { status: 303, headers: { location, "cache-control": "no-store" }, body: "" };
}

// Method, origin, size and media type, then the fields. Returns
// { done: reply } to stop, or { fields, json }.
function intake(kind, req) {
  const h = req.headers || {};
  const json = /application\/json/i.test(h.accept || "");
  if (req.method === "GET" || req.method === "HEAD") {
    return { done: redirect(kind === "signup" ? "/#waitlist" : "/unsubscribe/") };
  }
  if (req.method !== "POST") {
    return { done: { status: 405, headers: { allow: "GET, HEAD, POST", "cache-control": "no-store" }, body: "" } };
  }
  // These replies carry no date, so no clock is read for them.
  if (!sameOrigin(h, req.url)) return { done: reply(kind, "forbidden", "en", json, 0) };
  if (req.tooLarge || Number(h["content-length"] || 0) > MAX_BODY || (req.body || "").length > MAX_BODY) {
    return { done: reply(kind, "too_large", "en", json, 0) };
  }
  const fields = parseBody(h["content-type"], req.body || "");
  if (fields === undefined) return { done: reply(kind, "unsupported", "en", json, 0) };
  if (fields === null) return { done: reply(kind, "invalid", "en", json, 0) };
  return { fields, json, lang: fields.lang === "ko" ? "ko" : "en" };
}

function missingDb(deps) {
  deps.log("waitlist: KV_REST_API_URL / KV_REST_API_TOKEN are not set (connect Upstash for Redis to this project, then redeploy)");
}

// ---------- Handlers ----------

export async function signup(req, deps) {
  const t = intake("signup", req);
  if (t.done) return t.done;
  const { fields: f, json, lang } = t;
  const now = deps.now();
  // The honeypot: a field people never see, under a name no autofill
  // targets (wl_note). Whatever filled it gets the ordinary reply, and
  // nothing is stored or counted. Whitespace alone counts as empty.
  if (typeof f.wl_note === "string" && f.wl_note.trim()) return reply("signup", "ok", lang, json, now);
  const email = normalizeEmail(f.email);
  if (!email) return reply("signup", "invalid", lang, json, now);
  // Signing up is the consent: the line under the button says so (since
  // notice 2026-10-15; 2026-10-12 also had two required boxes). The record
  // says which notice was shown and on which page, so both must come from
  // the page itself: nothing is filled in for a client that never loaded it.
  const version = f.consent_version;
  if (!version || !COPY.consentVersions.includes(version)) return reply("signup", "version", lang, json, now);
  const page = f.page;
  if (!Object.values(PAGES).includes(page)) return reply("signup", "version", lang, json, now);
  if (!deps.db) {
    missingDb(deps);
    return reply("signup", "server", lang, json, now);
  }
  try {
    if (await overLimit(deps, "s", req)) return reply("signup", "rate", lang, json, now);
    const key = KEYS.sub + email;
    const at = new Date(now).toISOString();
    // New and known addresses take the same path and get the same reply.
    // One entry per notice version, written once: a repeat changes nothing,
    // a newer notice adds its own consent beside the earlier one.
    await redis(deps, "/multi-exec", [
      ["SADD", KEYS.set, email],
      ["HSETNX", key, "email", email],
      ["HSETNX", key, "consent:" + version, JSON.stringify({ at, lang, page })],
    ]);
  } catch (e) {
    deps.log("waitlist: sign-up not stored: " + (e && e.message));
    return reply("signup", "server", lang, json, now);
  }
  return reply("signup", "ok", lang, json, now);
}

export async function unsubscribe(req, deps) {
  const t = intake("unsubscribe", req);
  if (t.done) return t.done;
  const { fields: f, json, lang } = t;
  const now = deps.now();
  // No honeypot here, on purpose: autofill can fill a hidden field, and the
  // success text is the statutory notice of the result, so a withdrawal is
  // always processed. A deletion adds no data, and needs the address anyway.
  const email = normalizeEmail(f.email);
  if (!email) return reply("unsubscribe", "invalid", lang, json, now);
  if (!deps.db) {
    missingDb(deps);
    return reply("unsubscribe", "server", lang, json, now);
  }
  try {
    if (await overLimit(deps, "u", req)) return reply("unsubscribe", "rate", lang, json, now);
    await redis(deps, "", ["EVAL", UNSUBSCRIBE_LUA, "3", KEYS.set, KEYS.sub + email, KEYS.log, email, isoDate(now) + " unsubscribe"]);
  } catch (e) {
    deps.log("waitlist: withdrawal not processed: " + (e && e.message));
    return reply("unsubscribe", "server", lang, json, now);
  }
  // The same words whether or not the address was on the list.
  return reply("unsubscribe", "ok", lang, json, now);
}

// Compares a header with the expected secret without stopping at the first
// differing character, so the time taken says nothing about the secret.
function sameSecret(given, expected) {
  let diff = given.length ^ expected.length;
  for (let i = 0; i < Math.max(given.length, expected.length); i++) {
    diff |= (given.charCodeAt(i) | 0) ^ (expected.charCodeAt(i) | 0);
  }
  return diff === 0;
}

// GET /api/keepalive/ from Vercel Cron, once a day (vercel.json "crons").
// Upstash archives a free database after 30 days without activity, and an
// archived database would turn every sign-up away, so this writes one stamp
// (the time, no personal data) to keep it active. Vercel sends
// Authorization: Bearer <CRON_SECRET> when that variable is set; any other
// request is turned away before Upstash is asked.
export async function keepalive(req, deps) {
  const text = (status, body, extra = {}) => ({
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...extra },
    body,
  });
  if (req.method !== "GET") return text(405, "method not allowed", { allow: "GET" });
  if (!deps.cronSecret) {
    deps.log("keepalive: CRON_SECRET is not set (add it in Vercel > Settings > Environment Variables, then redeploy)");
    return text(503, "not configured");
  }
  if (!sameSecret(req.headers.authorization || "", "Bearer " + deps.cronSecret)) return text(401, "unauthorized");
  if (!deps.db) {
    missingDb(deps);
    return text(503, "not configured");
  }
  try {
    await redis(deps, "", ["SET", KEYS.keepalive, new Date(deps.now()).toISOString(), "EX", String(KEEPALIVE_TTL)]);
  } catch (e) {
    deps.log("keepalive: " + (e && e.message));
    return text(503, "database unavailable");
  }
  return text(200, "ok");
}
