// POST /api/unsubscribe/ : withdraws consent and destroys the record at once,
// from the form on /unsubscribe/ and /ko/unsubscribe/. Asks for the address
// only, and answers the same whether or not it was on the list. The logic is
// in _lib/waitlist-core.mjs.

import { unsubscribe } from "./_lib/waitlist-core.mjs";
import { run } from "./_lib/runtime.mjs";

export default {
  fetch(request) {
    return run(request, unsubscribe);
  },
};
