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

export function parseMatter(md) {
  const out = {};
  const lines = String(md).split(/\r?\n/);

  let piece = null;      // the Chinese title we are inside
  let taking = false;    // inside that piece's `### English` block
  let buf = [];

  const flush = () => {
    if (piece && buf.length) out[piece] = buf.join('\n').trim();
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
