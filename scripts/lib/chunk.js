// Split a koan section into chunks small enough that Gemini's long-form quality drift
// (volume/whisper decay past ~1 minute of audio) never sets in. Google documents the
// decay as a model limitation and recommends chunking; this is that.
//
// Rules, in order of preference:
//   - Keep whole sections that are already short as a single chunk (most of them).
//   - Split only at paragraph boundaries — a chunk restarts slightly louder, so the
//     seam belongs at a natural pause, never mid-thought.
//   - Pack paragraphs greedily up to the limit: fewer, larger chunks mean fewer seams
//     and less chance of the voice's timbre drifting between independent generations.
//   - Only if a single paragraph is itself over the limit, fall back to packing its
//     sentences — the seam is then mid-paragraph, but there is no better boundary.

export function splitParagraphs(text) {
  return String(text).split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
}

export function splitSentences(text) {
  const m = String(text).match(/[^.!?]+[.!?]*/g);
  return m ? m.map((s) => s.trim()).filter(Boolean) : [String(text).trim()].filter(Boolean);
}

// Greedily pack pieces into strings no longer than maxChars, joined by `join`.
function pack(pieces, maxChars, join) {
  const out = [];
  let cur = '';
  for (const p of pieces) {
    if (cur && cur.length + join.length + p.length > maxChars) { out.push(cur); cur = p; }
    else cur = cur ? cur + join + p : p;
  }
  if (cur) out.push(cur);
  return out;
}

export function chunkText(text, maxChars = 650) {
  const clean = String(text).trim();
  if (clean.length <= maxChars) return [clean];

  const chunks = [];
  let cur = '';
  const flush = () => { if (cur) { chunks.push(cur); cur = ''; } };

  for (const para of splitParagraphs(clean)) {
    if (para.length > maxChars) {
      // A single paragraph too long for one chunk: flush what's pending, then break
      // this paragraph at sentence boundaries into its own standalone chunks.
      flush();
      for (const sub of pack(splitSentences(para), maxChars, ' ')) chunks.push(sub);
    } else if (cur && cur.length + 2 + para.length > maxChars) {
      chunks.push(cur);
      cur = para;
    } else {
      cur = cur ? cur + '\n\n' + para : para;
    }
  }
  flush();
  return chunks.length ? chunks : [clean];
}
