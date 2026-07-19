export function buildRows(cases, progress, isRegistered) {
  const read = progress.read || {};
  const sat = progress.sat || {};
  return cases.map((c) => ({
    id: c.id, slug: c.slug, title: c.title, extra: !!c.extra,
    registered: isRegistered(c.slug), read: !!read[c.slug], sat: !!sat[c.slug],
  }));
}

export function continueTarget(cases, progress, lastSlug) {
  const read = progress.read || {};
  if (lastSlug && cases.some((c) => c.slug === lastSlug)) return lastSlug;
  const first = cases.find((c) => read[c.slug]);
  return first ? first.slug : null;
}
