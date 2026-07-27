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

// The browser half. Everything that touches `location` or `history` lives
// INSIDE this factory — never at module scope — so the tests, which run in
// plain Node with no DOM, can import this file without it throwing.
export function makeRouter({ onRoute, win } = {}) {
  const w = win === undefined ? (typeof window === 'undefined' ? null : window) : win;
  // A headless or embedded host with no window still gets a working object;
  // navigation must never depend on the URL being writable.
  if (!w) return { initial: () => null, set() {}, dispose() {} };

  const bare = () => w.location.pathname + w.location.search;
  const here = () => bare() + w.location.hash;
  const urlFor = (route) => {
    if (route && route.view === 'case') {
      const h = hashFor(route.slug);
      return h ? bare() + h : null;
    }
    return bare();
  };

  const onHash = () => { onRoute && onRoute(parseRoute(w.location.hash)); };
  w.addEventListener('hashchange', onHash);

  return {
    initial: () => parseRoute(w.location.hash),
    // Compare the URL we WANT to the URL that is THERE, and do nothing if they
    // match. That single comparison is also the re-entrancy guard: after the
    // reader presses Back the app navigates and then writes the URL it was just
    // handed, which is a no-op — so no second history entry is pushed and no
    // second hashchange fires. No "currently routing" flag is needed anywhere.
    set(route, { replace = false } = {}) {
      const want = urlFor(route);
      if (!want || want === here()) return;
      try {
        if (replace) {
          // A correction is not a navigation: the reader never chose this URL,
          // the app is just repairing a bar that named nowhere real, so it must
          // not cost a history entry. Pushing here is how a junk hash like
          // `#99` becomes sticky on Back — the correction itself would be the
          // thing Back returns to, which then gets corrected again. replaceState
          // also has the useful side effect of never firing `hashchange`, so a
          // silent fix stays silent.
          w.history.replaceState(null, '', want);
        } else if (route.view === 'case') {
          // A case rides `location.hash`, which pushes an entry by itself.
          w.location.hash = hashFor(route.slug);
        } else {
          // Contents needs pushState: assigning hash = '' leaves a trailing '#'.
          w.history.pushState(null, '', want);
        }
      } catch {
        // Some embedded contexts refuse pushState. A URL we cannot write is a
        // cosmetic loss; it must never take navigation down with it.
      }
    },
    dispose() { w.removeEventListener('hashchange', onHash); },
  };
}
