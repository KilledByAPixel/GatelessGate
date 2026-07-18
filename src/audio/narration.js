export function chunkSentences(text) {
  const m = String(text).replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g);
  return m ? m.map((s) => s.trim()).filter(Boolean) : [];
}

// Browser-only speechSynthesis wrapper. Sentence-chunked to dodge Chrome's
// long-utterance stall. A generation counter neutralizes stale async callbacks
// fired by cancel(), so stop()/rapid re-speak() never resurrect old narration.
export function createNarration() {
  const synth = window.speechSynthesis;
  let queue = [];
  let gen = 0;
  let speaking = false;

  function next(myGen, onEnd) {
    if (myGen !== gen) return;               // superseded by a newer speak()/stop()
    if (!queue.length) { speaking = false; onEnd && onEnd(); return; }
    const { text, rate } = queue.shift();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.onend = () => next(myGen, onEnd);
    u.onerror = () => next(myGen, onEnd);
    synth.speak(u);
  }

  return {
    speak(text, { rate = 0.85, onEnd } = {}) {
      const myGen = ++gen;                     // invalidate any in-flight callbacks
      synth.cancel();
      queue = chunkSentences(text).map((t) => ({ text: t, rate }));
      speaking = true;
      next(myGen, onEnd);
    },
    stop() { gen++; queue = []; speaking = false; synth.cancel(); },
    isSpeaking() { return speaking; },
  };
}
