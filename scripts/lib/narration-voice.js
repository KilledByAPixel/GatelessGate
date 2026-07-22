// Voice and delivery settings for generated narration. Shared by the audition
// bake-off and the real bake, so the winning settings live in exactly one place.

export const MODEL = 'gpt-4o-mini-tts';   // the only model that accepts `instructions`

// Every voice the speech endpoint offers, for validating CLI input.
export const ALL_VOICES = ['alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo', 'fable',
  'marin', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];

// Round one auditioned marin, cedar, sage, ballad, ash and fable: ash won, cedar and
// fable were out. Round two keeps ash as the benchmark and adds the two deeper
// male-sounding voices we hadn't tried.
export const CANDIDATE_VOICES = ['ash', 'echo', 'onyx'];

// The chosen narrator, picked by ear in the audition: onyx is the deepest and reads
// oldest, and the `japanese` delivery both colours the accent and slows it down.
export const VOICE = 'onyx';
export const PRESET = 'japanese';

// Bump whenever any instruction text below changes — the bake manifest folds this
// into each unit's hash, so a bump invalidates every file and forces a re-bake.
export const INSTRUCTIONS_VERSION = 1;

// Delivery presets. `plain` is the intended reading; the others exist to audition
// against it, so we can hear whether more or less restraint actually helps.
const PRESETS = {
  plain: `Voice: an older teacher reading aloud to a small room, to people who already know the material. Unhurried, warm, plain.
Pace: slow, roughly 110 words per minute. Come to a full stop at every period. Take a longer breath at paragraph breaks.
Tone: level and dry. Where the text is wry or sarcastic, let it be dry, not arch. Never theatrical, never hushed-and-reverent, never "sage-like."
Dialogue: read quoted speech plainly, with only the faintest shift between speakers. No character voices.
Read only the text given. Add no words, titles, or commentary.`,

  quiet: `Voice: someone reading aloud late at night, softly, to one other person in the room. Barely above a murmur, but every word clear.
Pace: very slow. Long pauses at every period, longer still at paragraph breaks. Let silence sit.
Tone: gentle and completely level. No emphasis, no performance, no rising interest. Flat in the way a still pond is flat.
Dialogue: no character voices at all. Every speaker sounds the same.
Read only the text given. Add no words, titles, or commentary.`,

  spoken: `Voice: a teacher telling these stories from memory rather than reading them off a page. Warm, familiar, faintly amused.
Pace: conversational but unhurried. Natural breaths. Slight variation in speed — slower on the important lines.
Tone: dry humour close to the surface. These are funny stories to someone who has lived with them for forty years.
Dialogue: light, natural differentiation between speakers, the way anyone telling a story does it. Never cartoonish.
Read only the text given. Add no words, titles, or commentary.`,

  // Accent is instructed, not a property of the voice — the model supports it directly.
  // The risk is drift: each of the 147 files is generated independently, so a heavily
  // instructed accent can vary in strength between sections of the same case.
  japanese: `Voice: an elderly Japanese man speaking fluent English, reading aloud to a small room. Warm, low, slightly weathered. Kind and wise, not frail.
Accent: a subtle, natural Japanese accent. Restrained and realistic — never exaggerated, never comedic. Clear English pronunciation comes first.
Pace: slow and thoughtful, roughly 110 words per minute. Gentle breathiness. A full stop at every period, a longer reflective pause at paragraph breaks.
Tone: level and dry. Where the text is wry, let it be dry, not arch. Never theatrical, never hushed-and-reverent.
Dialogue: read quoted speech plainly, with only the faintest shift between speakers. No character voices.
Read only the text given. Add no words, titles, or commentary.`,

  chinese: `Voice: an elderly Chinese man speaking fluent English, reading aloud to a small room. Warm, low, slightly weathered. Kind and wise, not frail.
Accent: a subtle, natural Mandarin accent. Restrained and realistic — never exaggerated, never caricatured. Clear English pronunciation comes first.
Pace: slow and deliberate, roughly 110 words per minute, with thoughtful pauses. A full stop at every period, a longer pause at paragraph breaks.
Tone: level and dry. Where the text is wry, let it be dry, not arch. Never theatrical, never hushed-and-reverent.
Dialogue: read quoted speech plainly, with only the faintest shift between speakers. No character voices.
Read only the text given. Add no words, titles, or commentary.`,

  trace: `Voice: an older teacher reading aloud to a small room, to people who already know the material. Warm, low, slightly weathered. Unhurried and plain.
Accent: only a trace of a Japanese accent — enough to colour the reading, not enough to notice on any single word. Prioritise clear English pronunciation above all.
Pace: slow, roughly 110 words per minute. A full stop at every period, a longer breath at paragraph breaks.
Tone: level and dry. Where the text is wry, let it be dry, not arch. Never theatrical, never hushed-and-reverent, never "sage-like."
Dialogue: read quoted speech plainly, with only the faintest shift between speakers. No character voices.
Read only the text given. Add no words, titles, or commentary.`,
};

// Appended per section, so each of the three parts of a case gets its own register.
const SECTION_NOTE = {
  case: 'This passage is the koan itself — an old story being recounted. Read it as a story.',
  comment: "This passage is the teacher Mumon's own commentary on the story, often needling or contrary. Slightly more conversational than the story; keep the sarcasm dry.",
  verse: 'This passage is a short verse. Slower than the prose. Honour the line breaks with a real pause at the end of each line, but do not sing it or fall into a chant rhythm.',
};

export const PRESET_NAMES = Object.keys(PRESETS);
export const SECTIONS = Object.keys(SECTION_NOTE);

export function instructionsFor(section, preset = PRESET) {
  if (!PRESETS[preset]) throw new Error(`unknown preset: ${preset}`);
  if (!SECTION_NOTE[section]) throw new Error(`unknown section: ${section}`);
  return `${PRESETS[preset]}\n\n${SECTION_NOTE[section]}`;
}
