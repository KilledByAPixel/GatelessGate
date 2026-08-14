import { DEV_PAGES } from '../koans/dev/index.js';

// `staged` means the page has a diorama of its own; unstaged cases are still
// fully readable, they just open onto the default landscape. Every row is
// selectable — the whole book is available from the first visit.
//
// Rows come from the reading spine, not from CASES: the preface and the
// afterword are rows of the contents with no number. `id: null` is what empties
// the number cell, and it is the only thing that distinguishes them here.
export function buildRows(entries, progress, isStaged) {
  const read = progress.read || {};
  const sat = progress.sat || {};
  const touched = progress.touched || {};
  return entries.map((e) => ({
    id: e.id === undefined ? null : e.id,
    slug: e.slug, title: e.title, extra: !!e.extra,
    staged: isStaged(e.slug),
    // The three marks, carried independently — which one the cell DRAWS is
    // menu.js's call, and a row can be all three at once.
    read: !!read[e.slug], sat: !!sat[e.slug], touched: !!touched[e.slug],
  }));
}

// WHICH OF THE THREE MARKS A ROW'S CELL DRAWS, given the row. One glyph per
// row: eighteen pixels will not carry two, and a cell that sometimes holds two
// marks and sometimes one stops reading as a margin and starts reading as a
// status column.
//
// The order is the order the reader earns them in — read, then touched, then
// sat — so the cell always shows how far the page got, and the rarest mark
// wins. '' means an untouched page, which is also what says the cell has
// nothing to clear (menu.js draws a plain span rather than a button for it).
export function markState(row) {
  if (row.sat) return 'stamp';
  if (row.touched) return 'touched';
  if (row.read) return 'dot';
  return '';
}

// IS THERE ANYTHING TO CLEAR? What decides whether "Clear progress" appears in
// the back matter at all: a book nobody has opened yet has no marks, and a
// control that wipes nothing is a question the reader has to answer ("what
// progress?") for no benefit. Any mark of any kind counts — a single touch on
// a page never read still put ink in the margin.
//
// lastSlug is deliberately NOT counted: it rides along with `read` (markRead
// writes both), so it can only be set when a read mark already exists, and
// counting it would be a second, weaker way to say the same thing.
export function hasAnyMark(progress = {}) {
  for (const map of [progress.read, progress.touched, progress.sat]) {
    for (const k in (map || {})) if (map[k]) return true;
  }
  return false;
}

// What the Developer section of the contents draws, given the flag.
//
// Off is an EMPTY LIST rather than a hidden one: menu.js renders nothing and
// attaches no handler for an empty result, so with developer mode off the app
// is identical to what it was before this existed — no stray node, no listener.
// The dev pages are not rows of the contents and never appear in buildRows;
// they are buttons under the back matter, beside About.
//
// `pages` is injectable so the shape of an entry is testable without the real
// manifest, and so adding a page stays a one-line change to that manifest.
export function devEntries(devMode, pages = DEV_PAGES) {
  if (!devMode) return [];
  return pages.map((p) => ({ slug: p.slug, label: p.label || p.title }));
}

export function continueTarget(entries, progress, lastSlug) {
  const read = progress.read || {};
  if (lastSlug && entries.some((e) => e.slug === lastSlug)) return lastSlug;
  const first = entries.find((e) => read[e.slug]);
  return first ? first.slug : null;
}
