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

export function terms(query) {
  return fold(query || '').split(/[^a-z0-9']+/).filter((t) => t.length > 1);
}

// Where a hit landed, and enough words either side to recognise it. Snippets are
// what make search usable here: a list of 49 titles you half-remember is exactly
// as unhelpful as the contents page you already have.
export function snippet(text, term, width = 90) {
  const at = fold(text).indexOf(term);
  if (at < 0) return null;
  let from = Math.max(0, at - Math.floor(width / 2));
  let to = Math.min(text.length, at + term.length + Math.floor(width / 2));
  while (from > 0 && !/\s/.test(text[from - 1])) from--;          // don't cut a word in half
  while (to < text.length && !/\s/.test(text[to])) to++;
  return (from > 0 ? '…' : '') + text.slice(from, to).replace(/\s+/g, ' ').trim() + (to < text.length ? '…' : '');
}

export function searchCases(query) {
  const t = terms(query);
  if (!t.length) return null;                 // null means "not searching", vs [] for "no hits"

  const out = [];
  for (const entry of index()) {
    // every term must appear somewhere in this case, in any field
    const hits = t.map((term) => FIELDS.find((f) => entry.fields[f].includes(term)));
    if (hits.some((f) => f === undefined)) continue;

    // A title hit is worth far more than a hit buried in a commentary: someone
    // typing "flag" wants case 29, not the four commentaries that mention flags.
    let score = 0;
    for (let i = 0; i < t.length; i++) {
      score += hits[i] === 'title' ? 100 : hits[i] === 'case' ? 10 : 1;
      if (entry.fields.title.startsWith(t[i])) score += 50;
    }

    // show the snippet for the most interesting field that matched
    const best = ['case', 'comment', 'verse'].find((f) => hits.includes(f))
      || (hits.includes('title') ? 'case' : null);
    const term = t.find((x) => entry.fields[best] && entry.fields[best].includes(x)) || t[0];

    out.push({
      id: entry.id,
      title: entry.title,
      where: hits.includes('title') ? 'title' : best,
      snippet: best ? snippet(entry.raw[best] || '', term) : null,
      score,
    });
  }
  out.sort((a, b) => b.score - a.score || a.id - b.id);
  return out;
}
