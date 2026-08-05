import { AUDIO_BASE, narrationSrc, playableQueue } from './narration_state.js';

// Browser-only player for the baked narration. One reused <audio> element; a
// generation counter neutralizes stale async callbacks after stop(), the same guard
// the speechSynthesis version needed and for the same reason — a superseded read must
// not fire the previous read's onEnd and clear the wrong highlight.
//
// Voice, pace and accent are decided at bake time (scripts/lib/narration-voice.js),
// so there is nothing to choose at runtime.
//
// Ducking the ambience is deliberately NOT done here: a read-aloud pauses between
// sections, and ducking per file would pump the wind up and down on every seam. The
// caller owns the reading session, so the caller owns the duck.
export function createNarration({ base = AUDIO_BASE } = {}) {
  const el = new Audio();
  el.preload = 'none';

  let manifest = null;
  let gen = 0;
  let speaking = false;
  let current = null;      // { id, section } being read, so callers can tell what's playing
  let hidden = false;        // the page is not being looked at (visibilitychange) — tracked
                              // UNCONDITIONALLY, independent of whether anything is playing right
                              // now, because a read can arrive at speak() from the SECTION GAP
                              // (main.js's plain setTimeout between sections, not `onended`) with
                              // nothing playing and heldForHide never having had anything to hold
  let heldForHide = false;   // paused by the page going away, not by the reader
  let pendingHide = null;    // a speak() that arrived while hidden: replayed by resumeFromHide()

  // Fetched once at startup so the first tap on "read" doesn't wait on the network.
  const ready = fetch(base + 'manifest.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => (manifest = m))
    .catch(() => null);

  function finish(myGen, onEnd) {
    if (myGen !== gen) return;
    speaking = false;
    current = null;
    onEnd && onEnd();
  }

  return {
    async speak(id, section, { onEnd } = {}) {
      const myGen = ++gen;
      el.pause();
      pendingHide = null;     // a fresh call supersedes anything queued from a previous hide
      if (!manifest) await ready;
      if (myGen !== gen) return;                  // superseded while the manifest loaded

      const src = narrationSrc(manifest, id, section, base);
      // Nothing baked for this section: resolve immediately rather than hanging the
      // caller's reading state. Silence, not a stuck highlight.
      if (!src) { finish(myGen, onEnd); return; }

      speaking = true;
      current = { id, section };

      // Hidden: this is reachable with nothing else playing, from the gap
      // between sections (main.js's SECTION_GAP_MS is a plain setTimeout, not
      // an `onended`-driven advance, so pauseForHide's own "pause the element"
      // trick never gets a chance to run). Do not read to an empty room — but
      // do not drop the section either. Remember it and let resumeFromHide()
      // start it the moment the reader is actually back, picking up exactly
      // where the reading would have gone next.
      if (hidden) {
        pendingHide = { myGen, src, onEnd };
        return;
      }

      el.onended = () => finish(myGen, onEnd);
      el.onerror = () => finish(myGen, onEnd);
      el.src = src;
      try { await el.play(); } catch { finish(myGen, onEnd); }
    },

    stop() {
      gen++;
      speaking = false;
      current = null;
      heldForHide = false;
      pendingHide = null;
      el.pause();
    },

    // The page went away. Narration is an <audio> element OUTSIDE the Web
    // Audio graph, so suspending the context does nothing to it — it needs its
    // own pause, and it holds its position. `hidden` is set unconditionally
    // (not just when something happens to be playing this instant) because
    // speak() reads it too — see its own comment for the section-gap case
    // this exists to close.
    pauseForHide() {
      hidden = true;
      if (!speaking || el.paused) return;
      heldForHide = true;
      el.pause();
    },
    resumeFromHide() {
      hidden = false;
      if (pendingHide) {
        const { myGen, src, onEnd } = pendingHide;
        pendingHide = null;
        // A pending speak() overriding an earlier hide is not a resume of
        // whatever pauseForHide() held — it is a fresh section starting.
        // Clearing this here (rather than falling through to the
        // `heldForHide` check below, which this `return` skips) is the fix
        // for the bug the fresh speak() would otherwise leave behind: a
        // later, unrelated hide/show finding `heldForHide` still true from
        // the OLD held section and spuriously calling el.play() on whatever
        // happens to be loaded by then.
        heldForHide = false;
        if (myGen !== gen) return;   // stop() or a fresh speak() already superseded this
        el.onended = () => finish(myGen, onEnd);
        el.onerror = () => finish(myGen, onEnd);
        el.src = src;
        el.play().catch(() => finish(myGen, onEnd));
        return;
      }
      if (!heldForHide) return;
      heldForHide = false;
      el.play().catch(() => {});
    },

    isSpeaking() { return speaking; },
    current() { return current; },
    // Awaits the manifest before deciding, same as speak() does — a caller that
    // asks before boot's fetch resolves gets the real answer a beat later rather
    // than a premature [] that would wrongly no-op a fully-baked case.
    async queue(id, order) {
      if (!manifest) await ready;
      return playableQueue(manifest, id, order);
    },
    manifest() { return manifest; },
  };
}
