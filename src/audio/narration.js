export function chunkSentences(text) {
  const m = String(text).replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g);
  return m ? m.map((s) => s.trim()).filter(Boolean) : [];
}

// Browser-only speechSynthesis wrapper. Sentence-chunked to dodge Chrome's
// long-utterance stall. Never a stopgap — this is the narration plan.
export function createNarration() {
  const synth = window.speechSynthesis;
  let queue = [];
  let speaking = false;

  function next(onEnd) {
    if (!queue.length) { speaking = false; onEnd && onEnd(); return; }
    const { text, rate } = queue.shift();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.onend = () => next(onEnd);
    u.onerror = () => next(onEnd);
    synth.speak(u);
  }

  return {
    speak(text, { rate = 0.85, onEnd } = {}) {
      synth.cancel();
      queue = chunkSentences(text).map((t) => ({ text: t, rate }));
      speaking = true;
      next(onEnd);
    },
    stop() { queue = []; speaking = false; synth.cancel(); },
    isSpeaking() { return speaking; },
  };
}
