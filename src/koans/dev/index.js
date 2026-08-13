// THE DEVELOPER PAGES — not the book.
//
// A dev page is neither a case nor matter: it is a tool, reachable only while
// Developer mode is on (the workbench's own checkbox, directly under "Keep
// settings on reload" in src/ui/debug.js). Like the matter pages it has no
// number and is keyed by slug; unlike them it is deliberately absent from the
// reading spine, so nothing pages into it, the contents never lists it, and the
// staging net never builds it — which is what exempts the showcase from the
// draw budget without carving an exception into the budget itself.
//
// This module is a plain manifest with NO imports, on purpose. The router, the
// registry and the menu all need to know a dev page's name, and none of them
// should have to pull a scene — and Three.js behind it — to find out. The
// scenes themselves stay behind registry.js's lazy loaders.
export const SHOWCASE_SLUG = 'showcase';

// Adding a page is one row here plus one loader in registry.js's DEV_LOADERS.
// `label` is what the menu button says; `title` is what the page calls itself.
export const DEV_PAGES = [
  { slug: SHOWCASE_SLUG, title: 'Showcase', label: 'Showcase' },
];

const BY_SLUG = new Map(DEV_PAGES.map((p) => [p.slug, p]));

export const isDevPage = (slug) => BY_SLUG.has(slug);
