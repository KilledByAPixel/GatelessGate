import { byId, bySlug } from './koans/index.js';

// The URL always names what's on screen.
//
// A case is its NUMBER — `#29` — not its slug. Ids never change; the slugs are
// built from translated titles and would drift the day a title is reworded, and
// a link that rots is worse than one that is ugly. Contents is the bare URL: it
// is the book's home, not a page in it.

// '#29' -> { view: 'case', id: 29, slug: '…' } | { view: 'contents' } | null.
// null means "this hash names nothing" — the caller decides what to do about it.
export function parseRoute(hash) {
  const raw = String(hash == null ? '' : hash).trim().replace(/^#/, '').trim();
  if (raw === '') return { view: 'contents' };
  // Digits only, deliberately: this rejects '2.5', '-3', '1e2', 'foo' and any
  // slug-shaped input in one line, so the only thing left to check is whether
  // the book actually has that case.
  if (!/^\d+$/.test(raw)) return null;
  const c = byId(Number(raw));
  return c ? { view: 'case', id: c.id, slug: c.slug } : null;
}

export function hashFor(slug) {
  const c = bySlug(slug);
  return c ? `#${c.id}` : null;
}
