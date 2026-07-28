export const SECTIONS = ['case', 'comment', 'verse'];
export const LABELS = { case: 'The Case', comment: "Mumon's Comment", verse: 'The Verse' };

// What a page shows, decided here rather than in the DOM glue.
//
// The single distinguishing fact is whether the page has a NUMBER. The seal is a
// case's number, so a page without one has no seal; and the 147 baked narration
// files are cases only, so a page without a number has nothing to play. Both
// follow from `id`, which is why neither needs a flag of its own.
export function pageShape({ id, sections, labels, text } = {}) {
  const numbered = id !== null && id !== undefined;
  return {
    sections: sections || SECTIONS,
    labels: labels || LABELS,
    showSeal: numbered,
    showNarration: numbered,
  };
}

// Which sections actually have something to read aloud, in reading order.
export function narrationQueue(text, sections = SECTIONS) {
  return sections.filter((s) => text[s] && text[s].trim().length > 0
    && SECTIONS.includes(s));
}
