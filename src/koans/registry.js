import { bySlug } from './index.js';
import { makeDefaultCase } from './default-case.js';

// Cases with a diorama of their own. Lazy loaders keyed by numeric id (stable):
// the first chapter — Mu, the flower, the bowl, the buffalo, and the flag.
const LOADERS = {
  1: () => import('./k1.js'),
  2: () => import('./k2.js'),
  3: () => import('./k3.js'),
  4: () => import('./k4.js'),
  5: () => import('./k5.js'),
  6: () => import('./k6.js'),
  7: () => import('./k7.js'),
  8: () => import('./k8.js'),
  9: () => import('./k9.js'),
  13: () => import('./k13.js'),
  14: () => import('./k14.js'),
  16: () => import('./k16.js'),
  17: () => import('./k17.js'),
  18: () => import('./k18.js'),
  19: () => import('./k19.js'),
  20: () => import('./k20.js'),
  21: () => import('./k21.js'),
  23: () => import('./k23.js'),
  26: () => import('./k26.js'),
  29: () => import('./k29.js'),
  32: () => import('./k32.js'),
  37: () => import('./k37.js'),
  38: () => import('./k38.js'),
  40: () => import('./k40.js'),
  42: () => import('./k42.js'),
  43: () => import('./k43.js'),
  44: () => import('./k44.js'),
  46: () => import('./k46.js'),
  47: () => import('./k47.js'),
};

// Whether a case has been STAGED — art of its own, rather than the default
// landscape. The menu uses this to show what has been built; it is no longer a
// gate on reading, because every case in the book is readable.
export function isStaged(slug) {
  const c = bySlug(slug);
  return !!(c && LOADERS[c.id]);
}

// Every case in the collection can be opened. Kept as its own predicate rather
// than folded into isStaged: "can I read this" and "does this have art" are
// different questions, and conflating them is what locked forty-four cases the
// text was already sitting in the bundle for.
export function isRegistered(slug) {
  return !!bySlug(slug);
}

export async function loadKoan(slug) {
  const c = bySlug(slug);
  if (!c) return null;
  const loader = LOADERS[c.id];
  if (!loader) return makeDefaultCase(c.id);
  return (await loader()).default;
}
