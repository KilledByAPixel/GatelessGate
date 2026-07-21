// `staged` means the case has a diorama of its own; unstaged cases are still
// fully readable, they just open onto the default landscape. Every row is
// selectable — the whole book is available from the first visit.
export function buildRows(cases, progress, isStaged) {
  const read = progress.read || {};
  const sat = progress.sat || {};
  return cases.map((c) => ({
    id: c.id, slug: c.slug, title: c.title, extra: !!c.extra,
    staged: isStaged(c.slug), read: !!read[c.slug], sat: !!sat[c.slug],
  }));
}

export function continueTarget(cases, progress, lastSlug) {
  const read = progress.read || {};
  if (lastSlug && cases.some((c) => c.slug === lastSlug)) return lastSlug;
  const first = cases.find((c) => read[c.slug]);
  return first ? first.slug : null;
}
