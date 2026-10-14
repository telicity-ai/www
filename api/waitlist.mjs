// POST /api/waitlist/ : a news sign-up from the form on / and /ko/.
// With JavaScript the page sends Accept: application/json and shows the reply
// in place; without it the browser gets a small HTML page. The logic is in
// _lib/waitlist-core.mjs. The URL keeps its trailing slash (vercel.json has
// trailingSlash: true, so /api/waitlist would answer with a 308 first).

import { signup } from "./_lib/waitlist-core.mjs";
import { run } from "./_lib/runtime.mjs";

export default {
  fetch(request) {
    return run(request, signup);
  },
};
