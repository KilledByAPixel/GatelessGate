import { bySlug } from './index.js';

// Lazy loaders keyed by numeric id (stable). The first chapter: Mu, the
// flower, the bowl, the buffalo, and the flag.
const LOADERS = {
  1: () => import('./k1.js'),
  6: () => import('./k6.js'),
  7: () => import('./k7.js'),
  29: () => import('./k29.js'),
  37: () => import('./k37.js'),
};

export function isRegistered(slug) {
  const c = bySlug(slug);
  return !!(c && LOADERS[c.id]);
}

export async function loadKoan(slug) {
  const c = bySlug(slug);
  const loader = c && LOADERS[c.id];
  if (!loader) return null;
  return (await loader()).default;
}
