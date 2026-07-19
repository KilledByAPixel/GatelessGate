export function chunkSentences(text) {
  const m = String(text).replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g);
  return m ? m.map((s) => s.trim()).filter(Boolean) : [];
}

// Pick the least-robotic English voice from a speechSynthesis voice list.
// Pure so it can be tested; the browser passes speechSynthesis.getVoices().
const GOOD = [/natural/i, /online/i, /google.*english/i, /\bSamantha\b/, /\bAva\b/, /\bAllison\b/, /\bSerena\b/, /\bJenny\b/, /\bAria\b/, /\bDaniel\b/, /\bKaren\b/, /\bMoira\b/, /\bTessa\b/, /\bFiona\b/, /\bAlex\b/];
const BAD = [/david/i, /zira/i, /\bmark\b/i, /desktop/i, /espeak/i, /\bpico\b/i, /compact/i];

export function chooseVoice(voices, preferredName) {
  if (!voices || !voices.length) return null;
  // an explicit pin wins if that voice is present (exact name, then fuzzy)
  if (preferredName) {
    const p = String(preferredName).toLowerCase();
    const exact = voices.find((v) => (v.name || '').toLowerCase() === p);
    if (exact) return exact;
    const fuzzy = voices.find((v) => (v.name || '').toLowerCase().includes(p));
    if (fuzzy) return fuzzy;
  }
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
export function createNarration({ preferredName = null } = {}) {
  const synth = window.speechSynthesis;
  let queue = [];
  let gen = 0;
  let speaking = false;
  let voice = null;
  let preferred = preferredName;   // pinned favorite; overrides the heuristic

  // Re-pick from the CURRENT voice list. Chrome invalidates voice objects when
  // the async list finishes loading, so a voice cached once at startup gets
  // silently ignored and playback falls back to the robotic default — picking
  // fresh per utterance keeps the object current.
  function refreshVoice() { const v = chooseVoice(synth.getVoices(), preferred); if (v) voice = v; }
  refreshVoice();
  if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', refreshVoice);

  function next(myGen, onEnd) {
    if (myGen !== gen) return;               // superseded by a newer speak()/stop()
    if (!queue.length) { speaking = false; onEnd && onEnd(); return; }
    refreshVoice();
    const { text, rate } = queue.shift();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    if (voice) { u.voice = voice; u.lang = voice.lang; }
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

    // --- voice tuning ---------------------------------------------------
    // The full English voice list, in the browser's order (index = handle).
    listVoices() {
      return (synth.getVoices() || [])
        .filter((v) => /^en/i.test(v.lang || ''))
        .map((v) => ({ name: v.name, lang: v.lang, cloud: v.localService === false }));
    },
    // Pin a favorite (exact or fuzzy name, or null to fall back to the heuristic).
    setPreferred(name) { preferred = name || null; refreshVoice(); return voice ? voice.name : null; },
    preferredName() { return preferred; },
    // Audition a specific voice once without disturbing the pinned choice.
    sample(name, text) {
      const list = synth.getVoices() || [];
      const p = String(name || '').toLowerCase();
      const v = list.find((x) => (x.name || '').toLowerCase() === p)
             || list.find((x) => (x.name || '').toLowerCase().includes(p));
      const u = new SpeechSynthesisUtterance(text
        || 'The great way has no gate; a thousand roads enter it. Passing this barrier, you walk the universe alone.');
      u.rate = 0.85;
      if (v) { u.voice = v; u.lang = v.lang; }
      gen++; queue = []; synth.cancel();       // stop any narration first
      synth.speak(u);
      return v ? v.name : null;
    },
  };
}
