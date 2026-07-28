// The order the book is read in: the preface, the forty-nine cases, the
// afterword. Front and back matter are pages of the book, not cases, so they
// are NOT in CASES — anything that counts cases would start counting fifty-one.
// This is the one place that knows they sit either side of the numbers.
//
// Slugs throughout: neighborSlug and main's enter() already speak slugs, and a
// list mixing ids with slugs is the obvious way to write this and the wrong one.

export const PREFACE_SLUG = 'preface';
export const AFTERWORD_SLUG = 'afterword';

const MATTER = new Set([PREFACE_SLUG, AFTERWORD_SLUG]);
export const isMatterSlug = (slug) => MATTER.has(slug);

export function readingOrder(cases) {
  return [PREFACE_SLUG, ...cases.map((c) => c.slug), AFTERWORD_SLUG];
}

// dir is -1 or +1. Returns null at either end and for a slug that is not in the
// book at all — a missing neighbour disables an arrow, which is not an error.
export function neighborSlug(order, slug, dir) {
  const i = order.indexOf(slug);
  if (i < 0) return null;
  return order[i + dir] || null;
}
