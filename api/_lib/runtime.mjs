// Turns a Vercel Web request into the plain data waitlist-core.mjs works
// on, and supplies the platform pieces: environment, fetch with a timeout,
// HMAC-SHA256 and the clock. Files under api/_lib are not routes (Vercel
// skips paths that start with an underscore) and are bundled into the
// functions that import them.
//
// Environment (Vercel > Project > Settings > Environment Variables):
//   KV_REST_API_URL, KV_REST_API_TOKEN   injected when Upstash for Redis is
//     connected from the Vercel Marketplace. UPSTASH_REDIS_REST_URL and
//     UPSTASH_REDIS_REST_TOKEN are read as a fallback. Never the read-only
//     token, never KV_URL / REDIS_URL (rediss:// is not the REST endpoint).
//   WAITLIST_HMAC_SECRET (optional)      key for hashing a visitor's network
//     in the rate limiter. Without it a key is derived from the REST token.
//   CRON_SECRET                          Vercel sends it as a bearer token with
//     every cron call; /api/keepalive/ refuses to run without it.

import { createHmac } from "node:crypto";
import { MAX_BODY } from "./waitlist-core.mjs";

// Networks over the rate limit, kept for this instance (see overLimit in
// waitlist-core.mjs). Module level, so it lasts as long as the instance.
const blocked = new Map();

function env(name) {
  const v = process.env[name];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function database() {
  const url = env("KV_REST_API_URL") || env("UPSTASH_REDIS_REST_URL");
  const token = env("KV_REST_API_TOKEN") || env("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) return null;
  if (!/^https:\/\//i.test(url)) {
    console.error("waitlist: the REST URL must start with https:// (KV_URL and REDIS_URL are not the REST endpoint)");
    return null;
  }
  return { url, token };
}

// The body, read no further than max bytes. A chunked request has no
// Content-Length, and request.text() would buffer whatever is sent (up to
// the platform's 4.5 MB) before the size is checked. Returning from inside
// for-await cancels the stream, so an over-cap sender gets a reset rather
// than a 413; that is expected. A client abort rejects here as it would in
// request.text().
async function readCapped(request, max) {
  const chunks = [];
  let n = 0;
  if (request.body) {
    for await (const c of request.body) {
      n += c.byteLength;
      if (n > max) return { body: null, tooLarge: true };
      chunks.push(c);
    }
  }
  return { body: new TextDecoder().decode(Buffer.concat(chunks)), tooLarge: false };
}

export async function run(request, handler) {
  const db = database();
  const secret = env("WAITLIST_HMAC_SECRET") ||
    (db ? createHmac("sha256", db.token).update("telicity waitlist rate limit v1").digest("hex") : "");
  const headers = {};
  request.headers.forEach((value, name) => {
    headers[name.toLowerCase()] = value;
  });
  let body = null;
  let tooLarge = false;
  if (request.method === "POST") {
    ({ body, tooLarge } = Number(headers["content-length"] || 0) > MAX_BODY
      ? { body: null, tooLarge: true }
      : await readCapped(request, MAX_BODY));
  }
  const out = await handler(
    { method: request.method, url: request.url, headers, body, tooLarge },
    {
      db,
      fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(5000) }),
      hmac: (text) => createHmac("sha256", secret).update(text).digest("hex"),
      now: () => Date.now(),
      log: (text) => console.error(text),
      blocked,
      cronSecret: env("CRON_SECRET"),
    },
  );
  return new Response(request.method === "HEAD" || out.status === 303 ? null : out.body, {
    status: out.status,
    headers: out.headers,
  });
}
