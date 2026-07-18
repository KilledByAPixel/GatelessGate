import { bySlug } from './index.js';

// Lazy loaders keyed by numeric id (stable). M1 registers only case 29.
const LOADERS = {
  29: () => import('./k29.js'),
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
