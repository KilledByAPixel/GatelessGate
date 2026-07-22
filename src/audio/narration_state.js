// Pure narration lookup: which baked file a koan section maps to. Split from the
// player so it runs under `node --test` with no DOM and no audio element.
//
// The manifest is written by scripts/build-narration.js and has the shape
// { model, voice, preset, files: { "1:case": { file, bytes, hash } } }.

export const AUDIO_BASE = 'audio/narration/';

export function unitKey(id, section) { return `${id}:${section}`; }

// Null when nothing is baked for this section — callers treat that as "silent",
// never as an error, so a partial bake degrades quietly instead of throwing.
export function narrationSrc(manifest, id, section, base = AUDIO_BASE) {
  const entry = manifest && manifest.files && manifest.files[unitKey(id, section)];
  return entry && entry.file ? base + entry.file : null;
}

export function hasNarration(manifest, id, section) {
  return narrationSrc(manifest, id, section) !== null;
}

// Narrow a section order down to the parts that actually have audio, preserving order.
export function playableQueue(manifest, id, order) {
  return (order || []).filter((section) => hasNarration(manifest, id, section));
}
