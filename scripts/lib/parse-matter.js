// local/mumonkan-front-and-back-matter.md -> the English only.
//
// That file is a scholarly working document: every piece carries its Chinese,
// its Taishō citation, translator's notes, and flagged uncertainties. Exactly
// one part of it belongs in the book — the block under `### English` — and this
// parser's whole job is to take that and leave the rest behind.
//
// Keyed by the CHINESE title. The English titles beside them are editorial and
// may be reworded; 無門關自序 will not be.

export const MATTER_REQUIRED = ['無門關自序', '後序', '禪箴', '安晚居士書'];

// `## 無門關自序 — Mumon's Preface` -> `無門關自序`. The dash is an em dash in the
// source; splitting on whitespace-dash-whitespace also tolerates a hyphen.
const chineseTitleOf = (heading) => heading.replace(/^##\s+/, '').split(/\s+[—-]\s+/)[0].trim();

// Split a buffer of source lines into typed blocks.
//
// Verse lines begin with U+3000 (ideographic space) — that is the source
// document's own convention, not a heuristic. It marks verse STRUCTURALLY: a
// run of such lines becomes its own block and the indent is stripped, because
// nowhere in this book does verse render indented. Everywhere else verse is a
// labelled section, and these pages now match.
//
// Plain lines are prose the source wrapped at ~90 characters — consecutive
// plain lines join with a single space. A blank line is a paragraph break.
const VERSE_MARK = '　';

const blocksFrom = (lines) => {
  const blocks = [];
  let paras = [];        // finished prose paragraphs of the block being built
  let para = [];         // the prose paragraph being accumulated
  let verse = [];        // the verse lines being accumulated

  const endPara = () => {
    if (para.length) { paras.push(para.join(' ')); para = []; }
  };
  const endProse = () => {
    endPara();
    if (paras.length) { blocks.push({ kind: 'prose', text: paras.join('\n\n') }); paras = []; }
  };
  const endVerse = () => {
    if (!verse.length) return;
    // A stanza break at the very end of the block is trailing whitespace, not a stanza.
    const text = verse.join('\n').replace(/\n+$/, '');
    blocks.push({ kind: 'verse', text });
    verse = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      // A blank line means different things either side of the divide. In prose
      // it ends a paragraph. Inside verse it is a STANZA break and has to
      // survive: the Zen Warnings are fourteen stanzas, and dropping these
      // would run them together into one wall of lines.
      if (verse.length) verse.push('');
      else endPara();
      continue;
    }
    if (line.startsWith(VERSE_MARK)) {
      endProse();                                        // prose before verse closes out
      verse.push(line.replace(/^\s+/, ''));              // the indent never ships
    } else {
      endVerse();                                        // verse before prose closes out
      para.push(line.trim());
    }
  }
  endVerse();
  endProse();
  return blocks;
};

export function parseMatter(md) {
  const out = {};
  const lines = String(md).split(/\r?\n/);

  let piece = null;      // the Chinese title we are inside
  let taking = false;    // inside that piece's `### English` block
  let buf = [];

  const flush = () => {
    if (piece && buf.length) {
      const blocks = blocksFrom([...buf]);
      if (blocks.length) out[piece] = blocks;
    }
    buf = [];
  };

  for (const line of lines) {
    if (/^##\s+\S/.test(line) && !/^###/.test(line)) {
      flush();
      piece = chineseTitleOf(line);
      taking = false;
      continue;
    }
    if (/^###\s/.test(line)) {
      // Any other sub-heading ends the English block — Notes, Unresolved, Chinese.
      flush();
      taking = /^###\s+English\s*$/.test(line);
      continue;
    }
    if (/^-{3,}\s*$/.test(line)) {
      // A horizontal rule ends the English block too. Today every `### English`
      // is followed by a `### Notes` that would already have ended it, but the
      // source is a hand-edited working document — the day someone deletes a
      // trailing Notes section, this is what stops the rule itself, and the
      // Chinese heading below it, from being captured as content.
      flush();
      taking = false;
      continue;
    }
    if (taking) buf.push(line);
  }
  flush();

  const missing = MATTER_REQUIRED.filter((k) => !out[k] || !out[k].length);
  if (missing.length) {
    throw new Error(
      `parse-matter: no English found for ${missing.join(', ')} — `
      + 'the translation file has been reshaped, or a piece was removed. '
      + 'Refusing to emit a blank page.',
    );
  }
  // Anything the file carries beyond the four is not ours to ship.
  for (const k of Object.keys(out)) if (!MATTER_REQUIRED.includes(k)) delete out[k];
  return out;
}
