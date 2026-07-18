export function chunkSentences(text) {
  const m = String(text).replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g);
  return m ? m.map((s) => s.trim()).filter(Boolean) : [];
}

// Pick the least-robotic English voice from a speechSynthesis voice list.
// Pure so it can be tested; the browser passes speechSynthesis.getVoices().
const GOOD = [/natural/i, /google.*english/i, /\bSamantha\b/, /\bAva\b/, /\bAllison\b/, /\bSerena\b/, /\bDaniel\b/, /\bKaren\b/, /\bMoira\b/, /\bTessa\b/, /\bFiona\b/, /\bAlex\b/];
const BAD = [/david/i, /zira/i, /\bmark\b/i, /desktop/i, /espeak/i, /\bpico\b/i, /compact/i];

export function chooseVoice(voices) {
  if (!voices || !voices.length) return null;
  const en = voices.filter((v) => /^en/i.test(v.lang || ''));
  const pool = en.length ? en : voices;
  let best = null, bestScore = -Infinity;
  for (const v of pool) {
    const name = v.name || '';
    let s = 0;
    if (GOOD.some((re) => re.test(name))) s += 10;
    if (BAD.some((re) => re.test(name))) s -= 8;
    if (v.localService === false) s += 3;   // online/cloud voices are usually nicer
    if (/en[-_]US/i.test(v.lang || '')) s += 1;
    if (v.default) s += 0.5;
    if (s > bestScore) { bestScore = s; best = v; }
  }
  return best;
}

// Browser-only speechSynthesis wrapper. Sentence-chunked to dodge Chrome's
// long-utterance stall; a generation counter neutralizes stale async callbacks
// fired by cancel(); a chosen voice replaces the often-robotic default.
export function createNarration() {
  const synth = window.speechSynthesis;
  let queue = [];
  let gen = 0;
  let speaking = false;
  let voice = null;

  function refreshVoice() { voice = chooseVoice(synth.getVoices()) || voice; }
  refreshVoice();
  if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', refreshVoice);

  function next(myGen, onEnd) {
    if (myGen !== gen) return;               // superseded by a newer speak()/stop()
    if (!queue.length) { speaking = false; onEnd && onEnd(); return; }
    const { text, rate } = queue.shift();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    if (voice) u.voice = voice;
    u.onend = () => next(myGen, onEnd);
    u.onerror = () => next(myGen, onEnd);
    synth.speak(u);
  }

  return {
    speak(text, { rate = 0.85, onEnd } = {}) {
      if (!voice) refreshVoice();
      const myGen = ++gen;                     // invalidate any in-flight callbacks
      synth.cancel();
      queue = chunkSentences(text).map((t) => ({ text: t, rate }));
      speaking = true;
      next(myGen, onEnd);
    },
    stop() { gen++; queue = []; speaking = false; synth.cancel(); },
    isSpeaking() { return speaking; },
    voiceName() { return voice ? voice.name : null; },
  };
}
