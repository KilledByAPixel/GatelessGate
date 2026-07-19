// Pure parser for the Senzaki–Reps Gateless Gate plain-text rendering.
// No I/O, no Three, no wall-clock — just string → structured data.

const MARKER = /^(Mumon's comment:|Amban's comment:)\s*/;

export function parseMumonkan(text) {
  const norm = text.replace(/\r\n/g, '\n');
  const headerRe = /^(\d{1,2})\. (.+)$/gm;
  const heads = [];
  let m;
  while ((m = headerRe.exec(norm))) {
    heads.push({ id: Number(m[1]), title: m[2].trim(), start: m.index, headLen: m[0].length });
  }
  if (!heads.length) throw new Error('no case headers found');

  const about = norm.slice(0, heads[0].start).trim();
  const cases = {};
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i];
    const end = i + 1 < heads.length ? heads[i + 1].start : norm.length;
    const body = norm.slice(h.start + h.headLen, end).trim();
    const paras = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const mi = paras.findIndex((p) => MARKER.test(p));
    if (mi === -1) throw new Error(`case ${h.id}: no comment marker`);
    const caseParas = paras.slice(0, mi);
    const commentParas = paras.slice(mi).map((p, k) => (k === 0 ? p.replace(MARKER, '') : p));
    const verse = commentParas.pop() || '';
    const entry = {
      title: h.title,
      case: caseParas.join('\n\n'),
      comment: commentParas.join('\n\n'),
      verse,
    };
    if (h.id === 49) entry.extra = true;
    cases[h.id] = entry;
  }
  return { about, cases };
}
