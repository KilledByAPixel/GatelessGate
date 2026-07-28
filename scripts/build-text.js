// Rerunnable: local/gateless-gate.txt -> src/koans/text/mumonkan.js
// Run: node scripts/build-text.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMumonkan } from './lib/parse-mumonkan.js';
import { parseMatter, MATTER_REQUIRED } from './lib/parse-matter.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcTxt = path.join(root, 'local', 'gateless-gate.txt');
const outFile = path.join(root, 'src', 'koans', 'text', 'mumonkan.js');
const srcMatter = path.join(root, 'local', 'mumonkan-front-and-back-matter.md');
const outMatter = path.join(root, 'src', 'koans', 'text', 'matter.js');

// The two pages, and which translated piece fills each section. Keyed by the
// Chinese titles the parser returns, so re-titling a piece in English cannot
// silently empty a section.
//
// `take` says which of the piece's blocks this section gets:
//   'all'   — every block, joined with a blank line
//   'prose' — everything except a trailing verse block
//   'verse' — the trailing verse block alone
//   a number — that block alone, by index, for a piece whose verse sits in the
//     middle. Pair it with `kind` so a reshuffled source fails loudly instead of
//     quietly labelling prose as verse.
// `dropLeadIn`, where present, is a paragraph that introduced the verse in
// running prose and is replaced by the section label. It must be the LAST
// paragraph of the prose or the build fails: a source edit that moves it is a
// change we want to hear about, not route around.
const MATTER_PAGES = {
  preface: {
    slug: 'preface',
    title: 'Preface',
    parts: [
      ['prose', "Mumon's Preface", '無門關自序', 'prose', 'The verse:'],
      ['verse', 'The Verse', '無門關自序', 'verse'],
    ],
  },
  afterword: {
    slug: 'afterword',
    title: 'Afterword',
    parts: [
      // Mumon's verse sits MID-piece here — the source parses as
      // [prose, verse, prose] — so these are addressed by index rather than by
      // head and tail. The third block is his colophon, and it gets a section of
      // its own: a colophon is not the verse and it is not the argument, it is
      // the signature at the end of the writing, and the book has room to say so.
      ['prose', "Mumon's Afterword", '後序', 0, 'As the lines have it:'],
      ['verse', 'The Verse', '後序', 1],
      ['colophon', 'Colophon', '後序', 2],
      ['warnings', 'Zen Warnings', '禪箴', 'all'],
      ['amban', "Amban's Letter", '安晚居士書', 'all'],
    ],
  },
};

// What each indexed take expects to find, so a reshuffled source is caught at
// build time rather than shipped as a mislabelled section.
const EXPECTED_KIND = { prose: 'prose', verse: 'verse', colophon: 'prose' };

// Pull the requested blocks out of a parsed piece and render them to one string.
function sectionText(blocks, take, dropLeadIn, where, expectKind) {
  const tailIsVerse = blocks.length > 0 && blocks[blocks.length - 1].kind === 'verse';
  let chosen;
  if (take === 'all') chosen = blocks;
  else if (take === 'prose') chosen = tailIsVerse ? blocks.slice(0, -1) : blocks;
  else if (take === 'verse') {
    if (!tailIsVerse) {
      console.error(`\nBUILD FAILED: ${where} asks for a trailing verse block, but the piece does not end in verse.`);
      process.exit(1);
    }
    chosen = blocks.slice(-1);
  } else if (Number.isInteger(take)) {
    const block = blocks[take];
    if (!block) {
      console.error(`\nBUILD FAILED: ${where} asks for block ${take}, but the piece has only ${blocks.length}.`);
      console.error('The translation source was reshaped — this needs a look, not a smaller index.');
      process.exit(1);
    }
    if (expectKind && block.kind !== expectKind) {
      console.error(`\nBUILD FAILED: ${where} expected block ${take} to be ${expectKind}, but it is ${block.kind}.`);
      console.error('A reshuffled source would otherwise ship prose under a verse heading, or the reverse.');
      process.exit(1);
    }
    chosen = [block];
  } else {
    console.error(`\nBUILD FAILED: ${where} has an unknown take "${take}".`);
    process.exit(1);
  }

  let text = chosen.map((b) => b.text).join('\n\n');
  if (dropLeadIn) {
    // The lead-in is whatever pointed at the verse from inside the prose; the
    // section label says it now, so it goes. Mumon writes it two ways: a line of
    // its own in the preface ("The verse:"), and the closing sentence of a
    // running paragraph in the afterword ("...let yourself down. As the lines
    // have it:"). Both are the same editorial fact, so both are handled — but a
    // lead-in that is not at the END of the text is a source change, not a case
    // to absorb quietly.
    const paras = text.split('\n\n');
    const last = paras[paras.length - 1].trim();
    if (last === dropLeadIn) {
      paras.pop();
      text = paras.join('\n\n');
    } else if (last.endsWith(dropLeadIn)) {
      paras[paras.length - 1] = last.slice(0, -dropLeadIn.length).trim();
      text = paras.join('\n\n');
    } else {
      console.error(`\nBUILD FAILED: ${where} expected its prose to end on "${dropLeadIn}", `
        + `but it ends on "${last.slice(-60)}".`);
      console.error('The section label replaces that lead-in; if the source moved it, this needs a look.');
      process.exit(1);
    }
  }
  return text.trim();
}

// Hand-fixes for any case the uniform rules misparse (id -> partial entry). Empty for now.
const OVERRIDES = {};

// Checked up front, beside the other input: writing mumonkan.js and only
// afterwards discovering the second input is missing would leave a "failed"
// build having already written a file. A failure here must be atomic.
if (!fs.existsSync(srcMatter)) {
  console.error(`\nBUILD FAILED: ${srcMatter} is missing.`);
  console.error('local/ is gitignored — a fresh clone does not have it.');
  process.exit(1);
}

const raw = fs.readFileSync(srcTxt, 'utf8');
const { about, cases } = parseMumonkan(raw);
for (const [id, patch] of Object.entries(OVERRIDES)) cases[id] = { ...cases[id], ...patch };

const ids = Object.keys(cases).map(Number).sort((a, b) => a - b);
const problems = [];
for (const id of ids) {
  for (const f of ['title', 'case', 'comment', 'verse']) {
    if (!cases[id][f] || !cases[id][f].trim()) problems.push(`case ${id}: empty ${f}`);
  }
}

console.log('id  verse-len  case-len  comment-len  title');
for (const id of ids) {
  const c = cases[id];
  console.log(
    String(id).padStart(2), String(c.verse.length).padStart(9), String(c.case.length).padStart(8),
    String(c.comment.length).padStart(11), ' ', c.title,
  );
}

if (ids.length !== 49) problems.push(`expected 49 entries, got ${ids.length}`);
if (problems.length) {
  console.error('\nBUILD FAILED:\n' + problems.join('\n'));
  process.exit(1);
}

const body = ids.map((id) => `  ${id}: ${JSON.stringify(cases[id])},`).join('\n');
const out = `// GENERATED by scripts/build-text.js from local/gateless-gate.txt — do not edit by hand.
export const about = ${JSON.stringify(about)};
export default {
${body}
};
`;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, out);
console.log(`\nWrote ${outFile} (${ids.length} cases).`);

// ---- the front and back matter ----
// Its own module, never folded into mumonkan.js: build-narration.js re-bakes any
// unit whose text hash changed, so keeping the two apart makes it impossible for
// a preface edit to cost 147 files of TTS. The matter pages have their own.
const matterText = parseMatter(fs.readFileSync(srcMatter, 'utf8'));
const pages = {};
for (const [key, page] of Object.entries(MATTER_PAGES)) {
  const sections = page.parts.map(([k]) => k);
  const labels = {};
  const text = {};
  for (const [k, label, chinese, take, dropLeadIn] of page.parts) {
    // MATTER_PAGES and parse-matter's MATTER_REQUIRED both name these four
    // titles by hand, with nothing else tying them together — a title renamed
    // in one and not the other would otherwise surface as a bare TypeError
    // instead of a message that says what's wrong.
    if (!MATTER_REQUIRED.includes(chinese)) {
      console.error(`\nBUILD FAILED: ${page.slug}'s "${k}" section asks for "${chinese}", `
        + `which is not in parse-matter.js's MATTER_REQUIRED (${MATTER_REQUIRED.join(', ')}).`);
      console.error('MATTER_PAGES here and MATTER_REQUIRED there must name the same four titles.');
      process.exit(1);
    }
    labels[k] = label;
    text[k] = sectionText(matterText[chinese], take, dropLeadIn, `${page.slug}.${k}`, EXPECTED_KIND[k]);
  }
  pages[key] = { slug: page.slug, title: page.title, sections, labels, text };
  console.log(`${page.slug}: ${sections.map((k) => `${k} ${text[k].length}`).join(', ')}`);
}
const matterOut = `// GENERATED by scripts/build-text.js from local/mumonkan-front-and-back-matter.md — do not edit by hand.
export default ${JSON.stringify(pages, null, 2)};
`;
fs.writeFileSync(outMatter, matterOut);
console.log(`Wrote ${outMatter} (${Object.keys(pages).length} pages).`);
