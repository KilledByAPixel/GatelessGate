// The back matter's content, kept apart from its DOM the same way menu_state
// is kept apart from menu. Everything here is a checkable claim, and the tests
// in tests/about.test.js hold the two that rot on their own — the Three.js
// version and the narration model — against the files that actually set them.
//
// Sources: the translation and lineage facts come from the header of
// local/gateless-gate.txt; THREE_VERSION from lib/THREE_VERSION.txt; TTS_MODEL
// from scripts/lib/narration-voice.js.

export const SITE = 'https://frankforce.com';
export const SOURCE_URL = 'https://sacred-texts.com/bud/glg/index.htm';

// Three.js ships as 0.MINOR.PATCH and is spoken of as rMINOR: 0.185.1 is r185.
export const THREE_VERSION = 'r185';
export const TTS_MODEL = 'gpt-4o-mini-tts';

// A part is either a string or a [text, href] pair for the few places a link
// earns its keep.
export const SECTIONS = [
  {
    label: 'The translation',
    parts: [
      'The English text is Nyogen Senzaki and Paul Reps’s rendering of the '
      + 'Mumonkan, privately printed by John Murray in Los Angeles in 1934. That '
      + 'printing is in the United States public domain — its copyright was never '
      + 'renewed. Reps later expanded this material into Zen Flesh, Zen Bones '
      + '(1957), the version most readers know. Archaic verb forms and pronouns, '
      + 'which survive here and there in the capping verses, have been lightly '
      + 'modernised; Mumon’s commentaries were already in plain modern English. '
      + 'One editorial bracket has been let go. Senzaki and Reps left a single '
      + 'word untranslated — Mu, the Chinese 無, which is Joshu’s entire answer '
      + 'in the first case — and glossed it there as the negative symbol meaning '
      + '“No thing” or “Nay.” Mumon takes that reading apart a few lines later, '
      + 'so answering the question before the case has finished asking it seemed '
      + 'the wrong way to open the book. Transcribed from ',
      ['sacred-texts.com', SOURCE_URL],
      '.',
    ],
  },
  {
    label: 'The book',
    parts: [
      'The Gateless Gate was compiled in 1228 by the Chinese master Ekai, called '
      + 'Mu-mon — Wumen Huikai. It gathers forty-eight koans, each followed by his '
      + 'own commentary and a capping verse. The forty-ninth case is not his: '
      + 'Amban, described in the text only as a layman Zen student, added it '
      + 'afterwards as a bargain, complaining that Mu-mon was “like an old '
      + 'doughnut seller.” It has travelled with the book ever since. The names '
      + 'throughout are the Japanese readings of Chinese ones, as Senzaki and Reps '
      + 'gave them: Joshu is Zhaozhou, Hyakujo is Baizhang.',
    ],
  },
  {
    label: 'This edition',
    parts: [
      'An interactive sumi-e reading: every case staged as a small ink-painting '
      + 'diorama you can look around and touch, with narration, procedural '
      + 'ambience, and a timer for sitting. It is a book rather than a game — '
      + 'nothing here is a puzzle to solve, and nothing is locked. Made by Frank '
      + 'Force, ',
      ['frankforce.com', SITE],
      '.',
    ],
  },
  {
    label: 'Rights',
    parts: [
      'The 1934 translation is in the public domain. Everything else — the code, '
      + 'the dioramas, the audio, and the narration — is © 2026 Frank Force. All '
      + 'rights reserved.',
    ],
  },
  {
    label: 'Built with',
    parts: [
      `Three.js (${THREE_VERSION}) for the rendering, vendored rather than fetched. `
      + 'Every sound in the book except the narration is generated at runtime with '
      + 'the Web Audio API — the wind, the bells, the knocks and the drift are '
      + 'synthesised, not sampled. The narration was baked ahead of time with '
      + `OpenAI’s ${TTS_MODEL}. There is no build step, no framework, no `
      + 'analytics, and nothing at all is loaded from a third party while you '
      + 'read.',
    ],
  },
];
