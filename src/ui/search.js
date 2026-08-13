import TEXT from '../koans/text/mumonkan.js';

// Searching the whole book: titles, cases, Mumon's commentaries and his verses.
//
// Pure and DOM-free so it can be tested directly. The index is built once from
// the generated text — 49 entries, a few hundred KB of prose — which is small
// enough that a linear scan per keystroke is imperceptible and a real inverted
// index would be a lot of machinery for nothing.
//
// The point is finding a half-remembered koan ("the one about the dog", "wash
// your bowl"), so matching is deliberately forgiving: case-insensitive,
// diacritic-insensitive, and every word has to appear SOMEWHERE in the entry but
// not adjacently and not in the same section.

const FIELDS = ['title', 'case', 'comment', 'verse'];

const fold = (s) => s.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')   // Joshu === Jōshū
  .replace(/[‘’]/g, "'")                     // curly quotes in the source text
  .replace(/[“”]/g, '"');

let INDEX = null;
function index() {
  if (INDEX) return INDEX;
  INDEX = [];
  for (const [id, entry] of Object.entries(TEXT)) {
    const fields = {};
    for (const f of FIELDS) fields[f] = fold(entry[f] || '');
    INDEX.push({ id: +id, title: entry.title, fields, raw: entry });
  }
  return INDEX;
}

// A term in quotes is a WHOLE-WORD term. Unquoted searching is forgiving on
// purpose (see the header) — but forgiveness is exactly wrong for the one
// word this book turns on: `mu` also matches much, must, Mumon and murmur,
// so Joshu's answer was the hardest thing in the book to find. Quotes mean
// here what they mean in every other search box: this word, whole. Several
// words in one pair of quotes are a phrase — adjacent, in order.
//
// An unclosed quote is treated as closed at the end of the query, so the
// search keeps working while the user is still typing it.
const KEEP = (t) => t.length > 1 || /^[0-9]$/.test(t);

function pushLoose(out, s) {
  for (const t of s.split(/[^a-z0-9']+/)) {
    if (t && KEEP(t)) out.push({ term: t, exact: false });
  }
}

export function parseQuery(query) {
  const q = fold(query || '');
  const out = [];
  const runs = /"([^"]*)"?/g;
  let last = 0, m;
  while ((m = runs.exec(q))) {
    pushLoose(out, q.slice(last, m.index));
    const phrase = m[1].split(/[^a-z0-9']+/).filter(Boolean).join(' ');
    if (phrase) out.push({ term: phrase, exact: true });
    last = runs.lastIndex;
  }
  pushLoose(out, q.slice(last));
  return out;
}

// The boundary class is the complement of the token class parseQuery splits
// on, so "whole word" means exactly "what the tokenizer would call one word".
const BOUND = "[^a-z0-9']";
const ESC = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function exactRe(term) {
  const words = term.split(' ').map(ESC).join(`${BOUND}+`);
  return new RegExp(`(?:^|${BOUND})(${words})(?:$|${BOUND})`);
}

// Where a probe matched in a FOLDED field, and how long the match is — the
// two facts snippet() needs. Folding is length-preserving for the text this
// book contains, which is why an index into the folded string is also an
// index into the original (snippet already relied on that).
function locate(probe, text) {
  if (!probe.re) {
    const at = text.indexOf(probe.term);
    return at < 0 ? null : { at, len: probe.term.length };
  }
  const m = probe.re.exec(text);
  if (!m) return null;
  return { at: m.index + m[0].indexOf(m[1]), len: m[1].length };
}

// Where a hit landed, and enough words either side to recognise it. Snippets are
// what make search usable here: a list of 49 titles you half-remember is exactly
// as unhelpful as the contents page you already have.
export function snippet(text, term, width = 90, found = null) {
  const at = found ? found.at : fold(text).indexOf(term);
  const len = found ? found.len : term.length;
  if (at < 0) return null;
  let from = Math.max(0, at - Math.floor(width / 2));
  let to = Math.min(text.length, at + len + Math.floor(width / 2));
  while (from > 0 && !/\s/.test(text[from - 1])) from--;          // don't cut a word in half
  while (to < text.length && !/\s/.test(text[to])) to++;
  return (from > 0 ? '…' : '') + text.slice(from, to).replace(/\s+/g, ' ').trim() + (to < text.length ? '…' : '');
}

export function searchCases(query) {
  const tokens = parseQuery(query);
  if (!tokens.length) return null;            // null means "not searching", vs [] for "no hits"
  // A NUMBER IS ALWAYS A WHOLE-WORD TERM, quoted or not. Loose matching is
  // substring matching, and for digits that is only ever noise: unquoted `3`
  // would otherwise find case 25 because its commentary happens to say 13.
  // Nobody types a digit hoping to match the inside of a longer number.
  const probes = tokens.map((t) => ({
    ...t,
    re: (t.exact || /^[0-9]+$/.test(t.term)) ? exactRe(t.term) : null,
  }));

  const out = [];
  for (const entry of index()) {
    // every term must appear somewhere in this case, in any field — or, for a
    // bare number, BE this case's number. Typing 31 should reach case 31; it
    // used to reach nothing at all, because the numeral appears nowhere in the
    // text of the case it names.
    const found = probes.map((p) => {
      if (/^[0-9]+$/.test(p.term) && entry.id === +p.term) return { field: 'id', at: null };
      for (const f of FIELDS) {
        const at = locate(p, entry.fields[f]);
        if (at) return { field: f, at };
      }
      return null;
    });
    if (found.some((f) => f === null)) continue;
    const hits = found.map((f) => f.field);

    // A title hit is worth far more than a hit buried in a commentary: someone
    // typing "flag" wants case 29, not the four commentaries that mention flags.
    let score = 0;
    for (let i = 0; i < probes.length; i++) {
      score += (hits[i] === 'title' || hits[i] === 'id') ? 100 : hits[i] === 'case' ? 10 : 1;
      if (entry.fields.title.startsWith(probes[i].term)) score += 50;
    }

    // show the snippet for the most interesting field that matched
    const best = ['case', 'comment', 'verse'].find((f) => hits.includes(f))
      || (hits.includes('title') ? 'case' : null);
    const i = best ? hits.indexOf(best) : -1;
    const at = i >= 0 ? found[i].at : null;

    out.push({
      id: entry.id,
      title: entry.title,
      where: (hits.includes('title') || hits.includes('id')) ? 'title' : best,
      snippet: best ? snippet(entry.raw[best] || '', probes[Math.max(0, i)].term, 90, at) : null,
      score,
    });
  }
  // IN BOOK ORDER, always. Results used to come back ranked by `score` — title
  // hits first, then case text, then commentary — which is the right answer for
  // a search engine and the wrong one for a book. Results here should always
  // run in number order, and the reason is the rendering: this list is drawn
  // exactly like the Contents, numeral in the left column and all, so a reader
  // scans it as the Contents with rows removed. Numbers that jump around in a
  // list shaped like a table of contents read as a fault in the list rather
  // than as a ranking.
  //
  // The score is still computed and still returned. It decides nothing about
  // order now, but it is what `where` and the snippet choice are derived from,
  // and it is the one thing that would have to come back if this is ever
  // wanted as "best match first" again.
  out.sort((a, b) => a.id - b.id);
  return out;
}
