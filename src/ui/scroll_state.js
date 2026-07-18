export const SECTIONS = ['case', 'comment', 'verse'];
export const LABELS = { case: 'The Case', comment: "Mumon's Comment", verse: 'The Verse' };

export function narrationQueue(text) {
  return SECTIONS.filter((s) => text[s] && text[s].trim().length > 0);
}
