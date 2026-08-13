// Serialises koan navigation with latest-wins coalescing.
//
// Paging used to drop any click that landed while a transition was still
// running (an `entering` guard returned early), so fast paging felt laggy and
// unresponsive — you had to wait out each ink dissolve before the next click
// took. This queue instead remembers the latest destination: a request
// that arrives mid-hop becomes the new target, and when the current hop
// finishes the queue goes straight there, skipping any cases it overtook.
//
// It is deliberately free of DOM and Three.js so it can be unit-tested. The
// host supplies three functions:
//   load(slug)     -> Promise<module|null>   (may be slow; null = unknown)
//   show(mod,slug) -> void | Promise         resolves once the swap is done and
//                                             the reveal has STARTED — not when
//                                             the dissolve finishes, so the next
//                                             click can interrupt it mid-tear
//   current()      -> slug currently shown (or null)
//
// Single-flight: only one run loop is ever active. `go` either starts it or
// just updates the target for the loop already running to pick up.
export function makeNavQueue({ load, show, current }) {
  let target = null;
  let running = false;

  async function run() {
    running = true;
    try {
      while (target !== null && target !== current()) {
        const t = target;
        const mod = await load(t);
        // a newer request overtook this one while it was loading — drop it and
        // let the loop pick up the newer target, so we never build a case the
        // user has already paged past
        if (target !== t) continue;
        if (!mod) { target = null; break; }   // unknown slug: stop, don't spin
        await show(mod, t);
      }
    } finally {
      running = false;
    }
  }

  return {
    // Ask to be showing `slug`. Returns the run promise when it starts the
    // loop, so callers (and tests) can await a quiescent queue.
    go(slug) {
      target = slug;
      if (running) return Promise.resolve();
      return run();
    },
    // Abandon any pending destination — used when something else takes over the
    // stage (Contents, the menu), so the loop stops instead of paging on.
    cancel() { target = null; },
    get target() { return target; },
    get running() { return running; },
  };
}
