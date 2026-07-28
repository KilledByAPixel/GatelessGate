export const SECTIONS = ['case', 'comment', 'verse'];
export const LABELS = { case: 'The Case', comment: "Mumon's Comment", verse: 'The Verse' };

// What a page shows, decided here rather than in the DOM glue.
//
// The seal IS the case number, so a page without one has no seal. Narration
// used to follow the same fact, because the baked files were cases only — that
// is no longer true, so the two have separated. Every page in the book has
// audio now, and the manifest is what decides whether a given section actually
// plays (see narration_state.js); a missing file resolves to silence, never an
// error.
export function pageShape({ id, sections, labels, text } = {}) {
  return {
    sections: sections || SECTIONS,
    labels: labels || LABELS,
    showSeal: id !== null && id !== undefined,
    showNarration: true,
  };
}

// Which sections actually have something to read aloud, in reading order.
// A page's own section list governs — the matter pages name their parts
// `prose`, `verse`, `warnings` and `amban`, and filtering those against the
// case triple is what used to drop them silently.
export function narrationQueue(text, sections = SECTIONS) {
  return sections.filter((s) => text[s] && text[s].trim().length > 0);
}
