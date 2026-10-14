// Unit tests for api/_lib/waitlist-core.mjs. They run in the bare
// JavaScriptCore shell that ships with macOS (no Node needed):
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tools/tests/waitlist.test.mjs
//
// (any engine with ES modules works: `node tools/tests/waitlist.test.mjs`
// too, where print and readFile are shimmed below). Upstash is a mock that
// keeps the REST API's shapes: { result } per command, an array per
// /multi-exec, HTTP errors as non-ok responses, a used-up quota as a 400
// with Upstash's error text. Given a clock, keys set with EX expire.

import {
  signup, unsubscribe, keepalive, parseBody, normalizeEmail, sameOrigin, networkOf, clientIp,
  formatDate, isoDate, LIMIT, WINDOW, KEYS, KEEPALIVE_TTL, CURRENT_VERSION, UNSUBSCRIBE_LUA,
} from "../../api/_lib/waitlist-core.mjs";
import { COPY } from "../../api/_lib/copy.mjs";
import { linkify } from "../../api/_lib/page.mjs";

const out = typeof print === "function" ? print : (s) => console.log(s);
const ROOT = decodeURIComponent(import.meta.url.replace(/^file:\/\//, "").replace(/tools\/tests\/[^/]+$/, ""));
const readText = typeof readFile === "function"
  ? (p) => readFile(ROOT + p)
  : ((fs) => (p) => fs.readFileSync(ROOT + p, "utf8"))(await import("node:fs"));

// ---------- A tiny harness ----------

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
function eq(a, b, what) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${what || "values differ"}\n      got:      ${sa}\n      expected: ${sb}`);
}
function ok(v, what) {
  if (!v) throw new Error(what || "expected truthy");
}

// ---------- Mock Upstash ----------

const QUOTA = { error: "ERR max requests limit exceeded. Limit: 500000, Usage: 500000." };

function mockUpstash({ failHttp = 0, failCommand = false, quota = "", clock = null } = {}) {
  const kv = new Map(); // key -> { type, value, ttl, exp }
  const calls = [];
  const expire = () => {
    if (clock) for (const [k, e] of kv) if (e.exp !== undefined && e.exp <= clock()) kv.delete(k);
  };
  const run = (cmd) => {
    const [name, ...a] = cmd;
    const N = name.toUpperCase();
    if (failCommand) return { error: "ERR simulated" };
    expire();
    if (N === "SET") {
      const [k, v, ...opt] = a;
      const nx = opt.includes("NX");
      if (nx && kv.has(k)) return { result: null };
      const ex = opt.indexOf("EX");
      const ttl = ex >= 0 ? Number(opt[ex + 1]) : -1;
      kv.set(k, { type: "string", value: v, ttl, exp: ex >= 0 && clock ? clock() + ttl * 1000 : undefined });
      return { result: "OK" };
    }
    if (N === "INCR") {
      const e = kv.get(a[0]) || { type: "string", value: "0", ttl: -1 };
      e.value = String(Number(e.value) + 1);
      kv.set(a[0], e);
      return { result: Number(e.value) };
    }
    if (N === "SADD" || N === "SREM") {
      const e = kv.get(a[0]) || { type: "set", value: new Set(), ttl: -1 };
      let n = 0;
      for (const m of a.slice(1)) {
        if (N === "SADD" && !e.value.has(m)) { e.value.add(m); n++; }
        if (N === "SREM" && e.value.delete(m)) n++;
      }
      kv.set(a[0], e);
      return { result: n };
    }
    if (N === "HSETNX") {
      const e = kv.get(a[0]) || { type: "hash", value: {}, ttl: -1 };
      kv.set(a[0], e);
      if (a[1] in e.value) return { result: 0 };
      e.value[a[1]] = a[2];
      return { result: 1 };
    }
    if (N === "HINCRBY") {
      const e = kv.get(a[0]) || { type: "hash", value: {}, ttl: -1 };
      kv.set(a[0], e);
      e.value[a[1]] = String(Number(e.value[a[1]] || 0) + Number(a[2]));
      return { result: Number(e.value[a[1]]) };
    }
    if (N === "DEL") {
      let n = 0;
      for (const k of a) if (kv.delete(k)) n++;
      return { result: n };
    }
    if (N === "EVAL") {
      if (a[0] !== UNSUBSCRIBE_LUA || a[1] !== "3") return { error: "ERR unknown script" };
      const [, , setKey, subKey, logKey, member, field] = a;
      const n = run(["SREM", setKey, member]).result + run(["DEL", subKey]).result;
      if (n > 0) run(["HINCRBY", logKey, field, 1]);
      return { result: n };
    }
    return { error: "ERR unknown command " + name };
  };
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (failHttp) return { ok: false, status: failHttp, json: async () => ({ error: "x" }) };
    if (quota === "http") return { ok: false, status: 400, json: async () => QUOTA };
    ok(init.headers.authorization === "Bearer test-token", "sends the bearer token");
    const body = JSON.parse(init.body);
    const path = url.replace("https://db.example.upstash.io", "");
    if (quota === "results") return { ok: true, status: 200, json: async () => (path === "/multi-exec" ? body.map(() => QUOTA) : QUOTA) };
    if (path === "/multi-exec") return { ok: true, status: 200, json: async () => body.map(run) };
    if (path === "") return { ok: true, status: 200, json: async () => run(body) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { kv, calls, fetch };
}

function deps(db, extra = {}) {
  const logs = [];
  return {
    logs,
    d: {
      db: { url: "https://db.example.upstash.io/", token: "test-token" },
      fetch: db.fetch,
      hmac: (s) => { // FNV-1a, enough to tell networks apart in a test
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
        return ("00000000" + h.toString(16)).slice(-8).repeat(8);
      },
      now: () => Date.UTC(2026, 9, 11, 15, 30), // 2026-10-12 00:30 in Korea
      log: (m) => logs.push(m),
      ...extra,
    },
  };
}

const enc = (o) => Object.entries(o).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
const FORM = { email: "Mina.Park+news@Example.com ", lang: "en", page: "/", consent_version: CURRENT_VERSION, wl_note: "" };

function req(fields = FORM, { json = true, headers = {}, method = "POST", body } = {}) {
  return {
    method,
    url: "https://telicity.ai/api/waitlist/",
    headers: {
      host: "telicity.ai",
      origin: "https://telicity.ai",
      "content-type": "application/x-www-form-urlencoded",
      "x-real-ip": "203.0.113.7",
      ...(json ? { accept: "application/json" } : { accept: "text/html,application/xhtml+xml" }),
      ...headers,
    },
    body: body !== undefined ? body : enc(fields),
    tooLarge: false,
  };
}

const parse = (r) => JSON.parse(r.body);

// ---------- Parsing and validation ----------

test("normalizeEmail accepts real addresses and lower-cases them", () => {
  eq(normalizeEmail("  Mina.Park+news@Example.com "), "mina.park+news@example.com");
  eq(normalizeEmail("a@b.co"), "a@b.co");
  eq(normalizeEmail("o'brien@mail.example.org"), "o'brien@mail.example.org");
  eq(normalizeEmail("user@xn--3e0b707e.xn--3e0b707e"), "user@xn--3e0b707e.xn--3e0b707e");
  eq(normalizeEmail("first_last-1@sub-domain.example.kr"), "first_last-1@sub-domain.example.kr");
});

test("normalizeEmail refuses malformed, overlong and non-ASCII addresses", () => {
  const bad = ["", "plain", "@example.com", "a@", "a@b", "a@@b.com", "a@b@c.com", "a b@c.com", "a@b c.com",
    ".a@b.com", "a.@b.com", "a..b@c.com", "a@b..com", "a@-b.com", "a@b-.com", "a@b.c", "a@b.123",
    "a@b.com.", "\"a\"@b.com", "a@[127.0.0.1]", "민아@example.com", "a@예시.com", "a@b.\ncom",
    "x".repeat(65) + "@b.com", "a@" + "b".repeat(64) + ".com", "a@" + ("b".repeat(60) + ".").repeat(5) + "com",
    // what a spreadsheet would run as a formula in the CSV export
    "=1+1@example.com", "=cmd|'/ccalc'!a0@example.com", "+1@example.com", "-a@example.com", "\t=1@b.com",
    null, undefined, 42, ["a@b.com"]];
  for (const b of bad) eq(normalizeEmail(b), null, "refuses " + JSON.stringify(b));
  // 254 is the cap
  const local = "x".repeat(64);
  const dom = ("d".repeat(61) + ".").repeat(3) + "co"; // 188 characters
  eq(normalizeEmail(local + "@" + dom).length, 253);
});

test("parseBody reads urlencoded and JSON, refuses the rest", () => {
  const f = parseBody("application/x-www-form-urlencoded; charset=UTF-8", "email=a%40b.co&x=1+2&x=3&flag&__proto__=p");
  eq(f.email, "a@b.co");
  eq(f.x, "1 2", "first value wins, + is a space");
  eq(f.flag, "");
  eq(Object.getPrototypeOf(f), null, "null prototype");
  eq(f.__proto__, "p", "__proto__ is just a key");
  eq(parseBody("application/x-www-form-urlencoded", "a=%E0%A4%A"), null, "bad escape");
  eq(parseBody("application/json", '{"email":"a@b.co","consent_ads":true,"n":5}').consent_ads, "yes");
  eq(parseBody("application/json", '{"n":5}').n, undefined, "non-strings dropped");
  eq(parseBody("application/json", "[1]"), null);
  eq(parseBody("application/json", "{oops"), null);
  eq(parseBody("multipart/form-data; boundary=x", "--x"), undefined);
  eq(parseBody(undefined, "a=1"), undefined);
});

test("sameOrigin: only this site's own pages may post", () => {
  const url = "https://telicity.ai/api/waitlist/";
  ok(sameOrigin({ host: "telicity.ai", origin: "https://telicity.ai" }, url));
  ok(sameOrigin({ host: "telicity-www-git-x.vercel.app", origin: "https://telicity-www-git-x.vercel.app" }, "https://telicity-www-git-x.vercel.app/api/waitlist/"), "preview hosts");
  ok(sameOrigin({ host: "internal", "x-forwarded-host": "telicity.ai", origin: "https://telicity.ai" }, "http://internal/api/waitlist/"));
  ok(!sameOrigin({ host: "telicity.ai", origin: "https://evil.example" }, url));
  ok(!sameOrigin({ host: "telicity.ai", origin: "https://telicity.ai.evil.example" }, url));
  ok(!sameOrigin({ host: "telicity.ai", origin: "null" }, url));
  ok(!sameOrigin({ host: "telicity.ai", "sec-fetch-site": "cross-site" }, url));
  ok(sameOrigin({ host: "telicity.ai", "sec-fetch-site": "same-origin" }, url));
  ok(!sameOrigin({ host: "telicity.ai", referer: "https://evil.example/page" }, url));
  ok(sameOrigin({ host: "telicity.ai", referer: "https://telicity.ai/ko/" }, url));
  ok(sameOrigin({ host: "telicity.ai" }, url), "no browser signals at all");
});

test("networkOf groups IPv6 by /64 and never returns the raw input for junk", () => {
  eq(networkOf("203.0.113.7"), "203.0.113.7");
  eq(networkOf("::ffff:203.0.113.7"), "203.0.113.7");
  eq(networkOf("2001:db8:aa:bb:1:2:3:4"), "2001:db8:aa:bb::/64");
  eq(networkOf("2001:0db8:00aa:00bb::9"), "2001:db8:aa:bb::/64");
  eq(networkOf("2001:db8::1"), "2001:db8:0:0::/64");
  eq(networkOf("fe80::1%en0"), "fe80:0:0:0::/64");
  for (const j of ["", "999.1.1.1", "1:2:3", "1::2::3", "hello", "1:2:3:4:5:6:7:8:9", undefined]) eq(networkOf(j), "unknown", j);
  eq(clientIp({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }), "198.51.100.1");
  eq(clientIp({ "x-real-ip": "198.51.100.2", "x-forwarded-for": "198.51.100.1" }), "198.51.100.2");
});

test("dates are Korea time and specific", () => {
  const before = Date.UTC(2026, 9, 11, 14, 59, 59); // 23:59:59 KST, Oct 11
  const after = Date.UTC(2026, 9, 11, 15, 0, 0); // 00:00 KST, Oct 12
  eq(formatDate("ko", before), "2026년 10월 11일");
  eq(formatDate("ko", after), "2026년 10월 12일");
  eq(formatDate("en", after), "October 12, 2026");
  eq(isoDate(Date.UTC(2027, 0, 4, 1)), "2027-01-04");
});

// ---------- Sign-up ----------

test("a new sign-up stores exactly the minimum, once", async () => {
  const db = mockUpstash();
  const { d, logs } = deps(db);
  const r = await signup(req(), d);
  eq(r.status, 200);
  eq(r.headers["content-type"], "application/json; charset=utf-8");
  eq(r.headers["cache-control"], "no-store");
  const j = parse(r);
  eq(j.ok, true);
  eq(j.date, "2026-10-12");
  eq(j.message, COPY.en.success.replace("{date}", "October 12, 2026"));
  ok(db.kv.get(KEYS.set).value.has("mina.park+news@example.com"));
  eq(db.kv.get(KEYS.sub + "mina.park+news@example.com").value, {
    email: "mina.park+news@example.com",
    ["consent:" + CURRENT_VERSION]: JSON.stringify({ at: "2026-10-11T15:30:00.000Z", lang: "en", page: "/" }),
  });
  eq(db.calls.length, 2, "one rate-limit transaction, one write transaction");
  eq(logs, []);
});

test("the rate-limit key is a hash with a short expiry, never the IP", async () => {
  const db = mockUpstash();
  const { d } = deps(db);
  await signup(req(), d);
  const rl = [...db.kv.keys()].filter((k) => k.startsWith(KEYS.rl));
  eq(rl.length, 1);
  ok(/^wl:rl:s:[0-9a-f]{32}$/.test(rl[0]), rl[0]);
  eq(db.kv.get(rl[0]).ttl, WINDOW);
  ok(WINDOW <= 3600, "the policy says under an hour");
  for (const c of db.calls) ok(!c.init.body.includes("203.0.113"), "no raw IP sent to Upstash");
});

test("a repeated sign-up gets the identical reply and changes nothing", async () => {
  const db = mockUpstash();
  const first = deps(db).d;
  const r1 = await signup(req(), first);
  const later = deps(db, { now: () => Date.UTC(2026, 9, 11, 15, 30) }).d;
  const r2 = await signup(req({ ...FORM, lang: "en", page: "/" }), later);
  eq(r2.status, r1.status);
  eq(r2.body, r1.body, "byte-identical");
  eq(db.calls.length, 4, "same number of round trips");
  // A later visit in Korean, another day: the stored record keeps its first consent.
  const third = deps(db, { now: () => Date.UTC(2026, 10, 1, 3, 0) }).d;
  const r3 = await signup(req({ ...FORM, email: "MINA.PARK+news@example.com", lang: "ko", page: "/ko/" }), third);
  eq(parse(r3).message, COPY.ko.success.replace("{date}", "2026년 11월 1일"));
  const rec = db.kv.get(KEYS.sub + "mina.park+news@example.com").value;
  eq(rec, {
    email: "mina.park+news@example.com",
    ["consent:" + CURRENT_VERSION]: JSON.stringify({ at: "2026-10-11T15:30:00.000Z", lang: "en", page: "/" }),
  });
  eq(db.kv.get(KEYS.set).value.size, 1);
});

test("a sign-up under a newer notice adds its own consent and keeps the first", async () => {
  const db = mockUpstash();
  const addr = KEYS.sub + "mina.park+news@example.com";
  await signup(req(), deps(db).d); // the current notice, in English, on /
  const NEW = "2027-01-04"; // a later notice, for this test only
  COPY.consentVersions.push(NEW);
  try {
    const r = await signup(req({ ...FORM, lang: "ko", page: "/ko/", consent_version: NEW }), deps(db, { now: () => Date.UTC(2027, 0, 4, 1) }).d);
    eq(r.status, 200);
    const rec = db.kv.get(addr).value;
    eq(rec["consent:" + CURRENT_VERSION], JSON.stringify({ at: "2026-10-11T15:30:00.000Z", lang: "en", page: "/" }), "the first consent is kept as it was");
    eq(rec["consent:" + NEW], JSON.stringify({ at: "2027-01-04T01:00:00.000Z", lang: "ko", page: "/ko/" }), "the new notice has its own entry");
    eq(Object.keys(rec).sort(), ["consent:" + CURRENT_VERSION, "consent:" + NEW, "email"]);
    // A cached page with the older notice, posted afterwards, changes nothing.
    const before = JSON.stringify(rec);
    eq((await signup(req({ ...FORM, lang: "ko", page: "/ko/" }), deps(db, { now: () => Date.UTC(2027, 0, 5) }).d)).status, 200);
    eq(JSON.stringify(db.kv.get(addr).value), before);
  } finally {
    COPY.consentVersions.pop();
  }
});

test("Korean sign-ups get Korean text and the Korean date", async () => {
  const db = mockUpstash();
  const r = await signup(req({ ...FORM, lang: "ko", page: "/ko/" }), deps(db).d);
  eq(parse(r).message, COPY.ko.success.replace("{date}", "2026년 10월 12일"));
  eq(JSON.parse(db.kv.get(KEYS.sub + "mina.park+news@example.com").value["consent:" + CURRENT_VERSION]), { at: "2026-10-11T15:30:00.000Z", lang: "ko", page: "/ko/" });
});

test("an unknown lang falls back to English; an unknown or missing page is refused", async () => {
  const db = mockUpstash();
  await signup(req({ ...FORM, lang: "fr" }), deps(db).d);
  eq(JSON.parse(db.kv.get(KEYS.sub + "mina.park+news@example.com").value["consent:" + CURRENT_VERSION]).lang, "en");
  for (const page of ["https://evil.example/", undefined]) {
    const db2 = mockUpstash();
    const fields = { ...FORM, page };
    if (page === undefined) delete fields.page;
    const r = await signup(req(fields), deps(db2).d);
    eq(r.status, 400, String(page));
    eq(db2.calls.length, 0, "no Upstash call");
  }
});

test("invalid email: 400, nothing stored, no Upstash call", async () => {
  const db = mockUpstash();
  const r = await signup(req({ ...FORM, email: "mina@" }), deps(db).d);
  eq(r.status, 400);
  eq(parse(r), { ok: false, error: "invalid", message: COPY.en.errorInvalid });
  eq(db.calls.length, 0);
});

test("signing up is the consent: no boxes are asked for, under any known notice", async () => {
  eq(CURRENT_VERSION, "2026-10-15");
  for (const version of COPY.consentVersions) {
    const db = mockUpstash();
    const r = await signup(req({ ...FORM, consent_version: version }), deps(db).d);
    eq(r.status, 200, version);
    ok(db.kv.get(KEYS.sub + "mina.park+news@example.com").value["consent:" + version], version + " recorded");
  }
  ok(!("errorConsent" in COPY.en) && !("errorConsent" in COPY.ko), "no message asks for boxes");
});

test("an unknown or missing consent version is refused", async () => {
  for (const version of ["1999-01-01", "", undefined]) {
    const db = mockUpstash();
    const fields = { ...FORM, consent_version: version };
    if (version === undefined) delete fields.consent_version;
    const r = await signup(req(fields), deps(db).d);
    eq(r.status, 400, JSON.stringify(version));
    eq(parse(r).error, "version");
    eq(db.calls.length, 0, "no Upstash call");
  }
});

test("the honeypot gets the ordinary reply and stores nothing", async () => {
  const db = mockUpstash();
  const r = await signup(req({ ...FORM, wl_note: "http://spam.example" }), deps(db).d);
  eq(r.status, 200);
  eq(parse(r).message, COPY.en.success.replace("{date}", "October 12, 2026"));
  eq(db.calls.length, 0);
  // Whitespace alone (an autofill slip) is empty; the old field name is ignored.
  for (const f of [{ wl_note: " " }, { website: "https://me.example" }]) {
    const db2 = mockUpstash();
    eq((await signup(req({ ...FORM, ...f }), deps(db2).d)).status, 200);
    ok(db2.kv.get(KEYS.set).value.has("mina.park+news@example.com"), JSON.stringify(f) + " is stored");
  }
});

test("rate limit: the request after LIMIT from one network gets 429", async () => {
  ok(LIMIT.s > LIMIT.u, "sign-ups (shared networks) are looser than withdrawals");
  const db = mockUpstash();
  const { d } = deps(db);
  for (let i = 0; i < LIMIT.s; i++) eq((await signup(req({ ...FORM, email: `p${i}@example.com` }), d)).status, 200);
  const r = await signup(req({ ...FORM, email: "late@example.com" }), d);
  eq(r.status, 429);
  eq(r.headers["retry-after"], String(WINDOW));
  eq(parse(r).message, COPY.en.errorRate);
  ok(!db.kv.has(KEYS.sub + "late@example.com"));
  // another network is unaffected; another /64 of the same IPv6 network is not
  eq((await signup(req({ ...FORM, email: "x@example.com" }, { headers: { "x-real-ip": "198.51.100.9" } }), d)).status, 200);
  const v6 = (ip) => signup(req({ ...FORM, email: "y@example.com" }, { headers: { "x-real-ip": ip } }), d);
  for (let i = 0; i < LIMIT.s; i++) await v6("2001:db8:1:2::" + (i + 1).toString(16));
  eq((await v6("2001:db8:1:2:ffff::1")).status, 429, "same /64");
  eq((await v6("2001:db8:1:3::1")).status, 200, "other /64");
});

test("a network over the limit is turned away in memory until its window ends", async () => {
  let t = Date.UTC(2026, 9, 11, 15, 30);
  const db = mockUpstash({ clock: () => t });
  const blocked = new Map();
  const { d } = deps(db, { now: () => t, blocked });
  for (let i = 0; i < LIMIT.s; i++) eq((await signup(req({ ...FORM, email: `p${i}@example.com` }), d)).status, 200);
  eq(blocked.size, 0, "nothing held under the limit");
  const before = db.calls.length;
  for (let i = 0; i < 1000; i++) eq((await signup(req({ ...FORM, email: `f${i}@example.com` }), d)).status, 429);
  eq(db.calls.length - before, 1, "a flood of 1000 takes one round trip");
  eq(blocked.size, 1);
  ok([...blocked.keys()].every((k) => /^wl:rl:s:[0-9a-f]{32}$/.test(k)), "the same hash as Redis, never the IP");
  eq((await signup(req({ ...FORM, email: "x@example.com" }, { headers: { "x-real-ip": "198.51.100.9" } }), d)).status, 200, "another network");
  t += WINDOW * 1000;
  eq((await signup(req({ ...FORM, email: "back@example.com" }), d)).status, 200, "let in again once the window has passed");
  eq(blocked.size, 0, "nothing outlives its window");
  // A full Map adds no more, and forgets none of the networks it holds.
  const full = new Map(Array.from({ length: 1000 }, (_, i) => ["wl:rl:s:held" + i, t + 1e9]));
  const f = deps(mockUpstash({ clock: () => t }), { now: () => t, blocked: full }).d;
  for (let i = 0; i <= LIMIT.s; i++) await signup(req({ ...FORM, email: `q${i}@example.com` }), f);
  eq(full.size, 1000);
});

test("a used-up Upstash quota: 503, and a log line that says so without Upstash's text", async () => {
  for (const quota of ["http", "results"]) {
    const s = deps(mockUpstash({ quota }));
    eq((await signup(req(), s.d)).status, 503, quota);
    eq(s.logs, ["waitlist: sign-up not stored: upstash quota exceeded"], quota);
    const u = deps(mockUpstash({ quota }));
    eq((await unsubscribe(req({ email: "a@example.com" }), u.d)).status, 503, quota);
    eq(u.logs, ["waitlist: withdrawal not processed: upstash quota exceeded"], quota);
  }
});

test("missing Upstash settings: 503 and a clear log line", async () => {
  const db = mockUpstash();
  const { d, logs } = deps(db, { db: null });
  const r = await signup(req(), d);
  eq(r.status, 503);
  eq(parse(r).message, COPY.en.errorServer);
  eq(logs.length, 1);
  ok(logs[0].includes("KV_REST_API_URL") && logs[0].includes("KV_REST_API_TOKEN"), logs[0]);
  eq(db.calls.length, 0);
});

test("Upstash failures: 503, logged without the address or IP", async () => {
  for (const opt of [{ failHttp: 401 }, { failHttp: 500 }, { failCommand: true }]) {
    const db = mockUpstash(opt);
    const { d, logs } = deps(db);
    const r = await signup(req(), d);
    eq(r.status, 503, JSON.stringify(opt));
    eq(parse(r).error, "server");
    eq(logs.length, 1);
    ok(!/mina|example|203\.0/i.test(logs[0]), "no PII in " + logs[0]);
  }
  const thrown = deps(mockUpstash(), { fetch: async () => { throw new Error("The operation timed out."); } });
  eq((await signup(req(), thrown.d)).status, 503);
});

test("method, origin, size and media type", async () => {
  const db = mockUpstash();
  const { d } = deps(db);
  const g = await signup(req(FORM, { method: "GET" }), d);
  eq([g.status, g.headers.location], [303, "/#waitlist"]);
  const p = await signup(req(FORM, { method: "PUT" }), d);
  eq([p.status, p.headers.allow], [405, "GET, HEAD, POST"]);
  eq((await signup(req(FORM, { headers: { origin: "https://evil.example" } }), d)).status, 403);
  eq((await signup(req(FORM, { headers: { origin: "null" } }), d)).status, 403);
  eq((await signup(req(FORM, { body: "email=" + "a".repeat(5000) }), d)).status, 413);
  eq((await signup({ ...req(), tooLarge: true }, d)).status, 413);
  eq((await signup(req(FORM, { headers: { "content-length": "999999" } }), d)).status, 413);
  eq((await signup(req(FORM, { headers: { "content-type": "multipart/form-data; boundary=x" } }), d)).status, 415);
  eq((await signup(req(FORM, { body: "email=%E0%A4%A" }), d)).status, 400);
  const jb = req(FORM, { headers: { "content-type": "application/json" }, body: JSON.stringify({ ...FORM, consent_ads: true }) });
  eq((await signup(jb, d)).status, 200, "JSON bodies work");
  eq(db.kv.get(KEYS.set).value.size, 1, "only the JSON request stored");
});

test("without JavaScript the reply is a CSP-clean HTML page", async () => {
  for (const lang of ["en", "ko"]) {
    const db = mockUpstash();
    const r = await signup(req({ ...FORM, lang }, { json: false }), deps(db).d);
    eq(r.status, 200);
    eq(r.headers["content-type"], "text/html; charset=utf-8");
    const html = r.body;
    ok(html.startsWith("<!doctype html>"), "doctype");
    ok(html.includes(`<html lang="${lang}">`), "lang");
    ok(html.includes('<meta name="robots" content="noindex">'), "noindex");
    ok(html.includes('<link rel="stylesheet" href="/assets/site.css">'), "stylesheet");
    ok(!/\sstyle=/.test(html), "no style attributes");
    ok(!/<style|<script/i.test(html), "no inline style or script");
    ok(html.includes(`<h1>${COPY[lang].doneTitle}</h1>`), "h1");
    const date = lang === "ko" ? "2026년 10월 12일" : "October 12, 2026";
    ok(html.includes(linkify(COPY[lang].success.replace("{date}", date))), "message");
    ok(html.includes(lang === "ko" ? '<a href="/ko/unsubscribe/">telicity.ai/ko/unsubscribe/</a>' : '<a href="/unsubscribe/">telicity.ai/unsubscribe/</a>'), "unsubscribe link");
    ok(html.includes('<a href="mailto:hello@telicity.ai">hello@telicity.ai</a>'), "mailto link");
    ok(html.includes(lang === "ko" ? 'href="/ko/privacy/"' : 'href="/privacy/"'), "privacy link");
    ok(!/mina\.park/i.test(html), "the address is not echoed");
  }
  const bad = await signup(req({ ...FORM, email: "nope", lang: "ko" }, { json: false }), deps(mockUpstash()).d);
  eq(bad.status, 400);
  ok(bad.body.includes(`<h1>${COPY.ko.errorTitle}</h1>`) && bad.body.includes(COPY.ko.errorInvalid));
  ok(bad.body.includes('href="/ko/#waitlist"'));
  ok(bad.body.includes("<title>아직 신청되지 않았습니다 | 텔리시티</title>"));
});

// ---------- Withdrawal ----------

test("unsubscribe destroys the record at once and logs the count, not the address", async () => {
  const db = mockUpstash();
  await signup(req(), deps(db).d);
  const u = { ...req({ email: "MINA.PARK+news@example.com", lang: "en", website: "" }), url: "https://telicity.ai/api/unsubscribe/" };
  const r = await unsubscribe(u, deps(db).d);
  eq(r.status, 200);
  eq(parse(r).message, COPY.en.unsubSuccess.replace("{date}", "October 12, 2026"));
  ok(!db.kv.get(KEYS.set).value.has("mina.park+news@example.com"));
  ok(!db.kv.has(KEYS.sub + "mina.park+news@example.com"));
  eq(db.kv.get(KEYS.log).value, { "2026-10-12 unsubscribe": "1" });
  ok(!JSON.stringify(db.kv.get(KEYS.log).value).includes("mina"));
  // An address that was never there: same reply, same round trips, no log entry.
  const before = db.calls.length;
  const r2 = await unsubscribe({ ...u, body: enc({ email: "nobody@example.com", lang: "en" }) }, deps(db).d);
  eq(r2.body, r.body);
  eq(db.calls.length - before, 2);
  eq(db.kv.get(KEYS.log).value, { "2026-10-12 unsubscribe": "1" });
});

test("unsubscribe: Korean, invalid address, no honeypot, outage, HTML", async () => {
  const db = mockUpstash();
  const ko = await unsubscribe(req({ email: "a@example.com", lang: "ko" }), deps(db).d);
  eq(parse(ko).message, COPY.ko.unsubSuccess.replace("{date}", "2026년 10월 12일"));
  eq((await unsubscribe(req({ email: "nope", lang: "ko" }), deps(db).d)).status, 400);
  // A filled hidden field (autofill, or an old cached page) never stops a
  // withdrawal: the reply says it was processed, so it is.
  await signup(req({ ...FORM, email: "b@example.com" }), deps(db).d);
  const before = db.calls.length;
  const hp = await unsubscribe(req({ email: "b@example.com", website: "x", wl_note: "x" }), deps(db).d);
  eq(hp.status, 200);
  eq(parse(hp).message, COPY.en.unsubSuccess.replace("{date}", "October 12, 2026"));
  eq(db.calls.length - before, 2, "a filled honeypot still withdraws");
  ok(!db.kv.get(KEYS.set).value.has("b@example.com"), "gone from the list");
  ok(!db.kv.has(KEYS.sub + "b@example.com"), "its record destroyed");
  const down = await unsubscribe(req({ email: "a@example.com", lang: "ko" }), deps(mockUpstash({ failHttp: 500 })).d);
  eq([down.status, parse(down).message], [503, COPY.ko.unsubErrorServer]);
  const html = await unsubscribe(req({ email: "a@example.com", lang: "en" }, { json: false }), deps(mockUpstash()).d);
  ok(html.body.includes(`<h1>${COPY.en.unsubDoneTitle}</h1>`));
  const g = await unsubscribe(req(FORM, { method: "GET" }), deps(db).d);
  eq([g.status, g.headers.location], [303, "/unsubscribe/"]);
  const limited = deps(mockUpstash());
  for (let i = 0; i < LIMIT.u; i++) await unsubscribe(req({ email: `u${i}@example.com` }), limited.d);
  eq((await unsubscribe(req({ email: "z@example.com" }), limited.d)).status, 429);
});

// ---------- The pages and the server agree ----------

function attr(html, name) {
  const m = new RegExp(name + '="([^"]*)"').exec(html);
  return m ? m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") : null;
}

test("each form's messages, action and consent version match the server", () => {
  const pages = [
    ["index.html", "en", "/api/waitlist/", "signup"],
    ["ko/index.html", "ko", "/api/waitlist/", "signup"],
    ["unsubscribe/index.html", "en", "/api/unsubscribe/", "unsubscribe"],
    ["ko/unsubscribe/index.html", "ko", "/api/unsubscribe/", "unsubscribe"],
  ];
  for (const [file, lang, action, kind] of pages) {
    const html = readText(file);
    const form = /<form[^>]*>/.exec(html)[0];
    eq(attr(form, "action"), action, file + " action");
    eq(attr(form, "method"), "post", file + " method");
    eq(attr(form, "data-msg-invalid"), COPY[lang].errorInvalid, file + " invalid");
    eq(attr(form, "data-msg-server"), COPY[lang][kind === "signup" ? "errorServer" : "unsubErrorServer"], file + " server");
    if (kind === "signup") {
      eq(attr(form, "data-msg-consent"), null, file + " no consent message");
      eq(attr(html, 'name="consent_version" value'), CURRENT_VERSION, file + " version");
      eq(attr(html, 'name="page" value'), lang === "ko" ? "/ko/" : "/", file + " page");
    }
    eq(attr(html, 'name="lang" value'), lang, file + " lang");
    eq(html.includes('name="wl_note"'), kind === "signup", file + " honeypot only on sign-up");
    ok(!html.includes('name="website"'), file + " no field autofill would fill");
    if (kind === "signup") {
      const unsub = lang === "ko" ? "/ko/unsubscribe/" : "/unsubscribe/";
      ok(new RegExp('<p class="wl-aside">(?:(?!</p>)[\\s\\S])*<a href="' + unsub + '">').test(html), file + " links the unsubscribe page");
    }
  }
});

test("the consent notice: one printed line under the button, no boxes", () => {
  for (const [file, policy] of [["index.html", "/privacy/"], ["ko/index.html", "/ko/privacy/"]]) {
    const html = readText(file);
    const form = /<form[^>]*data-wl[\s\S]*?<\/form>/.exec(html)[0];
    ok(!form.includes('type="checkbox"') && !form.includes("<fieldset"), file + " no boxes, no fieldset");
    const aside = /<p class="wl-aside">([\s\S]*?)<\/p>/.exec(form);
    ok(aside, file + " the notice line");
    ok(form.indexOf('class="wl-act"') < form.indexOf('class="wl-aside"'), file + " under the button");
    ok(aside[1].includes('<a href="' + policy + '">'), file + " links the privacy policy");
  }
});

// ---------- Keepalive (Vercel Cron) ----------

const cron = (authorization, method = "GET") => ({
  method,
  url: "https://telicity.ai/api/keepalive/",
  headers: authorization === undefined ? { host: "telicity.ai" } : { host: "telicity.ai", authorization },
  body: null,
  tooLarge: false,
});

test("keepalive refuses to run without CRON_SECRET and never asks Upstash", async () => {
  const db = mockUpstash();
  const { d, logs } = deps(db);
  const r = await keepalive(cron("Bearer anything"), d);
  eq(r.status, 503, "status");
  eq(db.calls.length, 0, "no Upstash call");
  ok(logs.some((m) => m.includes("CRON_SECRET is not set")), "logs why");
});

test("keepalive turns away a wrong, missing or prefix-only bearer token", async () => {
  const db = mockUpstash();
  const { d } = deps(db, { cronSecret: "s3cret-value" });
  for (const auth of [undefined, "", "Bearer", "Bearer s3cret", "Bearer s3cret-value2", "bearer s3cret-value", "s3cret-value"]) {
    const r = await keepalive(cron(auth), d);
    eq(r.status, 401, "status for " + JSON.stringify(auth));
  }
  eq(db.calls.length, 0, "no Upstash call");
});

test("keepalive only answers GET", async () => {
  const db = mockUpstash();
  const { d } = deps(db, { cronSecret: "s3cret-value" });
  const r = await keepalive(cron("Bearer s3cret-value", "POST"), d);
  eq(r.status, 405, "status");
  eq(r.headers.allow, "GET", "allow header");
  eq(db.calls.length, 0, "no Upstash call");
});

test("keepalive writes one dated stamp with an expiry and nothing else", async () => {
  const db = mockUpstash();
  const { d } = deps(db, { cronSecret: "s3cret-value" });
  const r = await keepalive(cron("Bearer s3cret-value"), d);
  eq(r.status, 200, "status");
  eq(r.body, "ok", "body");
  eq(r.headers["cache-control"], "no-store", "not cached");
  eq(db.calls.length, 1, "one Upstash call");
  eq(JSON.parse(db.calls[0].init.body), ["SET", KEYS.keepalive, "2026-10-11T15:30:00.000Z", "EX", String(KEEPALIVE_TTL)], "the command");
  eq([...db.kv.keys()], [KEYS.keepalive], "only the stamp exists");
});

test("keepalive reports a missing or failing database as 503 without detail", async () => {
  const { d: noDb, logs } = deps(mockUpstash(), { cronSecret: "s3cret-value", db: null });
  eq((await keepalive(cron("Bearer s3cret-value"), noDb)).status, 503, "no database");
  ok(logs.some((m) => m.includes("KV_REST_API_URL")), "logs the missing variables");
  const failing = mockUpstash({ failHttp: 500 });
  const { d, logs: l2 } = deps(failing, { cronSecret: "s3cret-value" });
  const r = await keepalive(cron("Bearer s3cret-value"), d);
  eq(r.status, 503, "Upstash down");
  eq(r.body, "database unavailable", "body");
  ok(l2.some((m) => m === "keepalive: upstash http 500"), "logs the status only");
});

test("vercel.json schedules the keepalive at the trailing-slash URL", () => {
  const conf = JSON.parse(readText("vercel.json"));
  eq(conf.crons, [{ path: "/api/keepalive/", schedule: "23 18 * * *" }], "crons");
});

// ---------- Run ----------

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    out("ok   " + t.name);
  } catch (e) {
    failed++;
    out("FAIL " + t.name + "\n      " + (e && e.message));
  }
}
out(`\n${tests.length - failed} passed, ${failed} failed`);
// An uncaught error is the one exit status every engine (jsc included) sets.
if (failed) throw new Error(failed + " failed");
