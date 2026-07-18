import TEXT from './text/mumonkan.js';

export const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const CASES = Object.keys(TEXT)
  .map(Number)
  .sort((a, b) => a - b)
  .map((id) => ({ id, slug: slugify(TEXT[id].title), title: TEXT[id].title, extra: !!TEXT[id].extra }));

const BY_ID = new Map(CASES.map((c) => [c.id, c]));
const BY_SLUG = new Map(CASES.map((c) => [c.slug, c]));

export const byId = (id) => BY_ID.get(id) || null;
export const bySlug = (slug) => BY_SLUG.get(slug) || null;
