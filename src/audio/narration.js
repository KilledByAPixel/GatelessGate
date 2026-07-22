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
      if (!manifest) await ready;
      if (myGen !== gen) return;                  // superseded while the manifest loaded

      const src = narrationSrc(manifest, id, section, base);
      // Nothing baked for this section: resolve immediately rather than hanging the
      // caller's reading state. Silence, not a stuck highlight.
      if (!src) { finish(myGen, onEnd); return; }

      speaking = true;
      current = { id, section };
      el.onended = () => finish(myGen, onEnd);
      el.onerror = () => finish(myGen, onEnd);
      el.src = src;
      try { await el.play(); } catch { finish(myGen, onEnd); }
    },

    stop() {
      gen++;
      speaking = false;
      current = null;
      el.pause();
    },

    isSpeaking() { return speaking; },
    current() { return current; },
    queue(id, order) { return playableQueue(manifest, id, order); },
    manifest() { return manifest; },
  };
}
