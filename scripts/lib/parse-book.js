// book/gateless-gate.md -> { cases, matter }
//
// One parser for the whole book. It replaces parse-mumonkan.js (the forty-nine
// cases, plain text) and parse-matter.js (the front and back matter, a
// scholarly Markdown working document): those were two dialects because the
// text arrived in two files, and it no longer does.
//
// Nothing is inferred. The old case parser found the case by looking for the
// string "Mumon's comment:" and took the verse to be the last paragraph after
// it — which is why all forty-nine capping verses ship as one run-on paragraph.
// Here every part is named by its own `###` heading.
//
// Pure: string in, data out. No I/O, no wall-clock. scripts/build-text.js is
// the half that reads and writes.

// The section keys are load-bearing well beyond the text: they name the baked
// narration files (k01-verse.mp3, afterword-warnings.mp3) and they are the
// `sections` list the reader iterates. So they live HERE, in code, and a
// heading never becomes one. A heading supplies the LABEL; this table says
// which key that label means, and whether the section's line breaks matter.
//
// Case 49 is Amban's addition, not Mumon's, so its comment carries its own
// label. Case labels never reach the generated module — the reader draws them
// from src/ui/scroll_state.js — so this costs nothing and lets the source file
// tell the truth about whose comment it is.
export const CASE_PARTS = [
  { key: 'case', labels: ['The Case'], kind: 'prose' },
  { key: 'comment', labels: ["Mumon's Comment", "Amban's Comment"], kind: 'prose' },
  { key: 'verse', labels: ['The Verse'], kind: 'verse' },
];

export const MATTER_PAGES = [
  {
    slug: 'preface',
    title: 'Preface',
    parts: [
      { key: 'prose', labels: ["Mumon's Preface"], kind: 'prose' },
      { key: 'verse', labels: ['The Verse'], kind: 'verse' },
    ],
  },
  {
    slug: 'afterword',
    title: 'Afterword',
    parts: [
      // Mumon's verse sits mid-page here, and his colophon follows it. A
      // colophon is not the verse and not the argument; it is the signature at
      // the end of the writing, and the book has room to say so.
      { key: 'prose', labels: ["Mumon's Afterword"], kind: 'prose' },
      { key: 'verse', labels: ['The Verse'], kind: 'verse' },
      { key: 'colophon', labels: ['Colophon'], kind: 'prose' },
      { key: 'warnings', labels: ['Zen Warnings'], kind: 'verse' },
      { key: 'amban', labels: ["Amban's Letter"], kind: 'prose' },
    ],
  },
];

export const CASE_COUNT = 49;

const fail = (msg) => { throw new Error(msg); };

// A blank line is a paragraph break in prose and a stanza break in verse, and
// survives as a blank line either way. Inside a paragraph the two differ, and
// that difference is the whole schema: prose was hard-wrapped for editing and
// its line breaks mean nothing, so they rejoin with a space; a verse line break
// IS the verse, so it stays. This is what the U+3000 ideographic space used to
// mark in the matter source — the same fact, moved out of the prose and into
// the table above, where a reader of the book file never has to see it.
function sectionText(lines, kind) {
  const paras = [];
  let cur = [];
  for (const line of lines) {
    if (line.trim()) cur.push(line.trim());
    else if (cur.length) { paras.push(cur); cur = []; }
  }
  if (cur.length) paras.push(cur);
  const glue = kind === 'verse' ? '\n' : ' ';
  return paras.map((p) => p.join(glue)).join('\n\n');
}

// Everything before the first `##` is the file's own header — provenance, the
// rights note, how to rebuild — and is not part of the book.
function pagesOf(md) {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const pages = [];
  let page = null;
  let section = null;
  lines.forEach((line, i) => {
    const at = `line ${i + 1}`;
    const h2 = /^## (.+?)\s*$/.exec(line);
    const h3 = /^### (.+?)\s*$/.exec(line);
    if (h2) { page = { heading: h2[1], sections: [], at }; pages.push(page); section = null; return; }
    if (h3) {
      if (!page) fail(`${at}: "### ${h3[1]}" sits outside any page — a section before its "##" heading.`);
      section = { label: h3[1], lines: [], at };
      page.sections.push(section);
      return;
    }
    if (/^#{4,} /.test(line)) {
      fail(`${at}: "${line.trim()}" — the book uses "##" for pages and "###" for sections, nothing deeper.`);
    }
    if (section) { section.lines.push(line); return; }
    if (page && line.trim()) {
      fail(`${at}: "${line.trim().slice(0, 48)}" sits under "## ${page.heading}" `
        + 'with no "###" section heading above it. Every word of the book belongs to a section.');
    }
  });
  return pages;
}

function takeParts(page, parts, where) {
  if (page.sections.length !== parts.length) {
    fail(`${where} (${page.at}): expected ${parts.length} sections `
      + `— ${parts.map((p) => p.labels[0]).join(', ')} — but found ${page.sections.length}`
      + `${page.sections.length ? `: ${page.sections.map((s) => s.label).join(', ')}` : ''}.`);
  }
  const text = {};
  parts.forEach((part, i) => {
    const section = page.sections[i];
    if (!part.labels.includes(section.label)) {
      fail(`${where} (${section.at}): expected "### ${part.labels.join('" or "### ')}" here, `
        + `but found "### ${section.label}".\n`
        + 'Headings are matched exactly: the heading chooses the key, and the key names '
        + 'the baked narration file. A rename here would orphan a bake.');
    }
    const body = sectionText(section.lines, part.kind);
    if (!body) fail(`${where} (${section.at}): "${section.label}" is empty.`);
    text[part.key] = body;
  });
  return text;
}

export function parseBook(md) {
  const pages = pagesOf(md);
  if (!pages.length) fail('no "##" page headings found — is this the book source?');

  const cases = {};
  const matter = {};
  const order = [];

  for (const page of pages) {
    const numbered = /^(\d{1,2})\. (.+)$/.exec(page.heading);
    if (numbered) {
      const id = Number(numbered[1]);
      if (cases[id]) fail(`${page.at}: case ${id} appears twice.`);
      const parts = takeParts(page, CASE_PARTS, `case ${id}`);
      // Key order is not cosmetic: the generated module is JSON.stringify of
      // these objects, and the committed file carries this order.
      const entry = {
        title: numbered[2].trim(), case: parts.case, comment: parts.comment, verse: parts.verse,
      };
      if (id === CASE_COUNT) entry.extra = true;   // Amban's addition stands apart from the forty-eight
      cases[id] = entry;
      order.push(id);
      continue;
    }
    const spec = MATTER_PAGES.find((p) => p.title === page.heading);
    if (!spec) {
      fail(`${page.at}: "## ${page.heading}" is neither "N. Title" nor one of `
        + `${MATTER_PAGES.map((p) => p.title).join(', ')}.`);
    }
    if (matter[spec.slug]) fail(`${page.at}: the ${spec.title} appears twice.`);
    const text = takeParts(page, spec.parts, spec.title);
    const labels = {};
    for (const part of spec.parts) labels[part.key] = part.labels[0];
    matter[spec.slug] = {
      slug: spec.slug,
      title: spec.title,
      sections: spec.parts.map((p) => p.key),
      labels,
      text,
    };
    order.push(spec.slug);
  }

  const want = ['preface', ...Array.from({ length: CASE_COUNT }, (_, i) => i + 1), 'afterword'];
  if (order.length !== want.length || order.some((v, i) => v !== want[i])) {
    fail(`the book's pages read ${order.slice(0, 6).join(', ')}… (${order.length} pages)\n`
      + `but must be ${want.slice(0, 6).join(', ')}… (${want.length}) — `
      + 'preface, the forty-nine in order, afterword.');
  }
  return { cases, matter };
}
