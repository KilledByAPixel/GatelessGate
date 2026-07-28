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

export function continueTarget(entries, progress, lastSlug) {
  const read = progress.read || {};
  if (lastSlug && entries.some((e) => e.slug === lastSlug)) return lastSlug;
  const first = entries.find((e) => read[e.slug]);
  return first ? first.slug : null;
}
