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

// Process a buffer of lines: unwrap prose, preserve verse.
// Verse lines begin with U+3000 (ideographic space). Plain lines are wrapped
// prose — join consecutive plain lines with single spaces. Blank lines are
// paragraph breaks. Do not strip leading whitespace from first line; only trim
// trailing whitespace and leading/trailing blank lines.
const processBuf = (lines) => {
  // Remove leading and trailing blank lines
  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }
  while (lines.length && !lines[lines.length - 1].trim()) {
    lines.pop();
  }

  if (!lines.length) return '';

  const result = [];
  let currentPara = [];

  for (const line of lines) {
    const isBlank = !line.trim();
    const isVerse = line.startsWith('　'); // U+3000 ideographic space

    if (isBlank) {
      // Blank line: end current paragraph if any, add blank line marker
      if (currentPara.length) {
        result.push(currentPara.join(' '));
        currentPara = [];
      }
      result.push('');
    } else if (isVerse) {
      // Verse line: end current paragraph if any, add verse line as-is
      if (currentPara.length) {
        result.push(currentPara.join(' '));
        currentPara = [];
      }
      result.push(line);
    } else {
      // Plain prose line: accumulate with current paragraph
      currentPara.push(line);
    }
  }

  // Flush remaining paragraph
  if (currentPara.length) {
    result.push(currentPara.join(' '));
  }

  // Join with newlines. Result has '' markers where blank lines should be,
  // which become \n\n when joined.
  let text = result.join('\n');
  // Remove only leading and trailing blank lines (not spaces from verse indents).
  text = text.replace(/^\n+/, '').replace(/\n+$/, '');
  return text;
};

export function parseMatter(md) {
  const out = {};
  const lines = String(md).split(/\r?\n/);

  let piece = null;      // the Chinese title we are inside
  let taking = false;    // inside that piece's `### English` block
  let buf = [];

  const flush = () => {
    if (piece && buf.length) out[piece] = processBuf([...buf]);
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

  const missing = MATTER_REQUIRED.filter((k) => !out[k] || !out[k].trim());
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
