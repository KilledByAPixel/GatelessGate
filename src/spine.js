// The order the book is read in: the preface, the forty-nine cases, the
// afterword. Front and back matter are pages of the book, not cases, so they
// are NOT in CASES — anything that counts cases would start counting fifty-one.
// This is the one place that knows they sit either side of the numbers.
//
// Slugs throughout: neighborSlug and main's enter() already speak slugs, and a
// list mixing ids with slugs is the obvious way to write this and the wrong one.

export const PREFACE_SLUG = 'preface';
export const AFTERWORD_SLUG = 'afterword';

export function readingOrder(cases) {
  return [PREFACE_SLUG, ...cases.map((c) => c.slug), AFTERWORD_SLUG];
}

// The contents' rows, in reading order. Separate from readingOrder because the
// menu needs titles and numbers and the pager needs only slugs — but the two
// must describe the same book, which tests/spine.test.js pins.
//
// A null id is the whole difference: it empties the number cell and turns off
// the seal, and nothing that counts cases ever sees these two, because CASES
// still holds exactly forty-nine.
export function readingEntries(cases, matter) {
  return [
    { id: null, slug: PREFACE_SLUG, title: matter[PREFACE_SLUG].title },
    ...cases.map((c) => ({ id: c.id, slug: c.slug, title: c.title, extra: !!c.extra })),
    { id: null, slug: AFTERWORD_SLUG, title: matter[AFTERWORD_SLUG].title },
  ];
}

// dir is -1 or +1. Returns null at either end and for a slug that is not in the
// book at all — a missing neighbour disables an arrow, which is not an error.
export function neighborSlug(order, slug, dir) {
  const i = order.indexOf(slug);
  if (i < 0) return null;
  return order[i + dir] || null;
}

// WHERE A PAGE-TURN ACTUALLY GOES, which is not quite the spine walk.
//
// The Contents is not a page of the book, so it is not in `order` — but it IS
// where the reader came from, and backing off the FRONT of the book has to land
// somewhere. It didn't: from the preface you could page forward but never back,
// in the look and in the text alike. Both arrows and the left arrow key all
// bottomed out in neighborSlug's own null, so the first page of the book was a
// place you could enter and not leave the way you came.
//
// Backing off the front now returns to the Contents — "it will do the exact
// same thing as clicking go back to contents, because it's just going back."
//
// THE FAR END IS DELIBERATELY NOT SYMMETRIC. Forward from the afterword still
// stops. Going back to where you came from is a retreat and the Contents is
// the honest answer; walking FORWARD off the last page into the index would
// be the book eating its own tail, which is the exact thing the removal of
// nextInLoop() (below) was about. The book has a last page.
//
// Returns null (nowhere to go — grey the arrow out), or an object naming one
// of the two destinations. An object rather than a magic string because every
// string here is a slug, and a sentinel that could collide with a real one is
// a bug waiting for someone to add a case called 'contents'.
export function pageTarget(order, slug, dir) {
  const next = neighborSlug(order, slug, dir);
  if (next) return { slug: next };
  if (dir < 0 && order.length > 0 && slug === order[0]) return { contents: true };
  return null;
}

// THE WRAP, and why it exists again.
//
// There was a nextInLoop() here once: the same walk, wrapping past the
// afterword back to the preface, for a hands-free reading that turned its own
// pages. It was removed because that reading was not opt-in — pressing "read
// aloud" silently turned the page when it finished, so a reader who wanted
// one page read lost their place with no way to say so. Nothing wrapped after
// that, and nothing wanted to.
//
// Auto mode wants to: left running, it goes continuously round from the back to
// the front again. That is the opposite case from the one that was removed — a
// labelled switch the reader throws on purpose, where the endless circle IS the
// thing being asked for, not a side effect of a button that said something
// else.
//
// So the wrap is back, and it is deliberately NOT what neighborSlug or
// pageTarget do. The arrows still stop at both ends; only the machine that
// the reader has explicitly set running goes round. An unknown slug starts
// the circle at the beginning rather than returning null, because there is
// no such thing as "nowhere to go next" once auto mode is on — it either
// advances or it stalls, and a stall is the one outcome with no way out
// except noticing.
export function loopNextSlug(order, slug) {
  if (!order.length) return null;
  const i = order.indexOf(slug);
  if (i < 0) return order[0];
  return order[(i + 1) % order.length];
}
