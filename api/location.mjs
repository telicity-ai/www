// GET /api/location/ : a coarse city label for the page-wide cursor.
// Reads only Vercel's city header; no IP/coordinates, storage, logs or lookups.

import { cityIdentity } from "../assets/city-name.mjs";

export default {
  fetch(request) {
    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method !== "GET" && request.method !== "HEAD") {
      headers.set("Allow", "GET, HEAD");
      return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });
    }
    const identity = cityIdentity(request.headers.get("x-vercel-ip-city"));
    return new Response(request.method === "HEAD" ? null : JSON.stringify(identity), { status: 200, headers });
  },
};
