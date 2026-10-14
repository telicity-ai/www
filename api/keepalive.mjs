// GET /api/keepalive/ : Vercel Cron's daily touch of the Upstash database,
// scheduled in vercel.json. The logic is keepalive() in
// _lib/waitlist-core.mjs; the URL keeps its trailing slash like the others.

import { keepalive } from "./_lib/waitlist-core.mjs";
import { run } from "./_lib/runtime.mjs";

export default {
  fetch(request) {
    return run(request, keepalive);
  },
};
