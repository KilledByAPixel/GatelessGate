// Voice and delivery settings for generated narration. Shared by the audition
// bake-off and the real bake, so the winning settings live in exactly one place.

// WHAT THE BOOK ACTUALLY SHIPS. Everything below the Gemini divider is the live
// path; the OpenAI constants just above it are the older one, kept because the
// audition still runs on it and because switching back should not mean rewriting
// the file. Read PROVIDER first — the names `MODEL`, `VOICE` and `PRESET` predate
// there being two backends, and they belong to OpenAI, not to whichever one is in
// use. audio/narration/manifest.json is the record of what a listener hears.
export const PROVIDER = 'gemini';

// ---- the OpenAI path (not currently used to bake) ----
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
  prose: 'This passage is Mumon writing in his own voice, framing the collection rather than telling a story. Direct and plain, addressed to the reader.',
  warnings: 'This passage is a series of short warnings in couplets. Each pair turns on its second line, so let the first settle before the second lands. Slower than prose. Honour the line breaks with a real pause, but do not sing it or fall into a chant rhythm.',
  amban: 'This passage is a later reader\'s letter, wry and a little mischievous, addressed to a teacher long dead. Dry humour close to the surface; the last line is a challenge, not a shout.',
};

export const PRESET_NAMES = Object.keys(PRESETS);
// The three parts of a numbered case, in reading order. Derived from the notes
// above until the matter pages added notes of their own — those are sections of
// a page, not of a case, and a case must never be iterated over them.
export const SECTIONS = ['case', 'comment', 'verse'];

export function instructionsFor(section, preset = PRESET) {
  if (!PRESETS[preset]) throw new Error(`unknown preset: ${preset}`);
  if (!SECTION_NOTE[section]) throw new Error(`unknown section: ${section}`);
  return `${PRESETS[preset]}\n\n${SECTION_NOTE[section]}`;
}

// --- Gemini -----------------------------------------------------------------
// Gemini takes no separate instructions parameter: direction and transcript go in one
// prompt, split by a literal divider. So its presets are whole structured documents
// rather than the instruction paragraphs above.

export const GEMINI_MODEL = 'gemini-3.1-flash-tts-preview';

// Round-three candidates: clear English readers, no Asian accent, for the British and
// American styles below. Spread across Google's published voice descriptions.
export const GEMINI_CANDIDATE_VOICES = [
  'Charon',       // Informative
  'Iapetus',      // Clear
  'Rasalgethi',   // Informative
  'Algenib',      // Gravelly
  'Sulafat',      // Warm
];

// The shipped choice. Charon read the whole book in the `japanese` style; that bake is
// kept as the "old man" baseline while these newer styles are auditioned.
export const GEMINI_VOICE = 'Charon';
// The delivery the whole reading was baked in. Paired with GEMINI_VOICE rather
// than left to the OpenAI PRESET above: the two backends do not share a preset
// vocabulary, so a single default would be wrong for one of them.
export const GEMINI_PRESET = 'british';

// No quoted strings anywhere above the transcript divider: a quoted subtitle here read
// as script and got spoken aloud at the top of several takes. Everything in a scene is
// description, never anything that looks like a line to deliver.
const SCENE_TEACHER = `# AUDIO PROFILE: The Teacher

## THE SCENE: A plain room, late afternoon
An old monastery room with the light going. A few people sit on the floor. The teacher is old — past eighty — and has read these forty-eight stories aloud for fifty years. He is not performing them and he is not explaining them. He knows every turn of every one, and he is reading them to the people in front of him one more time. Nothing is urgent. There is a long day behind him and nothing scheduled after this.`;

// A lighter scene for the clear reading styles — deliberately not aged or hushed, so
// the "slow old man" quality doesn't leak back in through the setting.
const SCENE_READER = `# AUDIO PROFILE: The Reader

## THE SCENE: A quiet recording booth
An experienced audiobook narrator reading a collection of short Zen stories. The reading is clear, warm and intelligent — made for a listener who wants to follow every word. At ease and engaged, unhurried but always moving forward. Not solemn, not sleepy, not performed.`;

const CONTEXT = `### SAMPLE CONTEXT
A reading of a thirteenth-century Zen koan collection for an interactive book. The listener is alone and unhurried, looking at an ink painting while the text is read to them.

### CRITICAL
Everything above the TRANSCRIPT divider is direction, not script. Speak only the words below the divider. Do not read the profile, the scene, the notes, or this instruction aloud. Do not announce a title. Begin with the first word of the transcript.`;

// Each preset is a scene + director's notes. The old-teacher styles are kept so the
// shipped Charon bake stays reproducible; the reader styles are round three.
const SLIGHTLY_SLOW = `Pace: Measured and clear — a little slower than ordinary conversation, unhurried but always moving forward. A full stop at each sentence, a brief pause at paragraph breaks. Do not drag, and do not leave long silences.`;
const NORMAL_PACE = `Pace: A natural, comfortable reading pace, like a well-read audiobook — clear articulation and natural sentence rhythm. Not rushed, not slow.`;

const GEMINI_PRESETS = {
  plain: { scene: SCENE_TEACHER, notes: `### DIRECTOR'S NOTES
Style: Level, plain and dry. Unhurried. Warm without being sweet. Lucid and kind, not frail, not solemn. Where the text is wry the humour barely surfaces — dry, never arch, never a wink. Never theatrical, never hushed-and-reverent, never "sage-like".
Pace: Slow, around 110 words per minute. A real full stop at the end of every sentence. A longer breath at paragraph breaks. Audible, natural breathing between sentences — an old man reading aloud, not a machine. Let small silences sit.` },

  japanese: { scene: SCENE_TEACHER, notes: `### DIRECTOR'S NOTES
Style: Level, plain and dry. Unhurried. Warm without being sweet. Lucid and kind, not frail, not solemn. Where the text is wry the humour barely surfaces — dry, never arch, never a wink. Never theatrical, never hushed-and-reverent, never "sage-like".
Accent: Fluent English with a subtle, natural Japanese accent. Restrained and realistic — never exaggerated, never comedic. Clear English pronunciation comes first.
Pace: Slow, around 110 words per minute. A real full stop at the end of every sentence. A longer breath at paragraph breaks. Audible, natural breathing between sentences — an old man reading aloud, not a machine. Let small silences sit.` },

  // Alan Watts register: cultured British, warm, lucid, lightly wry. Clear above all.
  british: { scene: SCENE_READER, notes: `### DIRECTOR'S NOTES
Style: A cultured British voice — a thoughtful mid-century British philosopher reading aloud, in the manner of Alan Watts: warm, articulate, lucid, lightly wry. Clear and easy to follow. Not solemn, never theatrical.
Accent: Standard British English (Received Pronunciation), natural and unforced. Clear pronunciation above all. No other accent.
${SLIGHTLY_SLOW}` },

  american: { scene: SCENE_READER, notes: `### DIRECTOR'S NOTES
Style: A warm, clear, intelligent American reading voice. Plain and lucid, easy to follow, lightly wry where the text is. Not solemn, never theatrical.
Accent: Standard General American, natural and unforced. Clear pronunciation above all. No other accent.
${SLIGHTLY_SLOW}` },

  // The "try one at normal pace" probe.
  americanNormal: { scene: SCENE_READER, notes: `### DIRECTOR'S NOTES
Style: A warm, clear, intelligent American reading voice. Plain and lucid, easy to follow, lightly wry where the text is. Not solemn, never theatrical.
Accent: Standard General American, natural and unforced. Clear pronunciation above all. No other accent.
${NORMAL_PACE}` },
};

export const GEMINI_PRESET_NAMES = Object.keys(GEMINI_PRESETS);

// Assembles direction + transcript. The divider must appear exactly as written.
export function geminiPrompt(section, preset, text) {
  if (!GEMINI_PRESETS[preset]) throw new Error(`unknown gemini preset: ${preset}`);
  if (!SECTION_NOTE[section]) throw new Error(`unknown section: ${section}`);
  const { scene, notes } = GEMINI_PRESETS[preset];
  return [
    scene,
    `${notes}\n${SECTION_NOTE[section]}`,
    CONTEXT,
    `#### TRANSCRIPT\n${text}`,
  ].join('\n\n');
}
