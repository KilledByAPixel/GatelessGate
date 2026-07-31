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
  return entries.map((e) => ({
    id: e.id === undefined ? null : e.id,
    slug: e.slug, title: e.title, extra: !!e.extra,
    staged: isStaged(e.slug), read: !!read[e.slug], sat: !!sat[e.slug],
  }));
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
