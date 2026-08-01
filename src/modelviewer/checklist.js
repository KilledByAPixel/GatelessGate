// Per-model review state for the model viewer: ok / needs-work plus a note,
// persisted to localStorage under a TOOL-SPECIFIC key (never a game save key).
// Empty entries are pruned so untouched rows never accumulate.

const LS_KEY = 'gg-model-viewer-checklist-v1';

export function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}

export function get(key) {
  return load()[key] || { state: null, note: '' };
}

// patch: { state?: 'ok' | 'needs' | null, note?: string }
export function set(key, patch) {
  const all = load();
  const cur = { state: null, note: '', ...(all[key] || {}), ...patch };
  if (!cur.state && !cur.note) delete all[key];
  else all[key] = cur;
  localStorage.setItem(LS_KEY, JSON.stringify(all));
  return cur;
}

// Markdown export, needs-work first then ok, in roster order — the shape the
// polish feedback loop already speaks (`- [ ] key — note`). A note with no
// verdict counts as needs-work: it was worth writing down.
export function exportMarkdown(rosterKeys) {
  const all = load();
  const keys = rosterKeys.filter((k) => all[k]);
  const line = (k) => `- [${all[k].state === 'ok' ? 'x' : ' '}] ${k}${all[k].note ? ' — ' + all[k].note : ''}`;
  return [
    ...keys.filter((k) => all[k].state !== 'ok').map(line),
    ...keys.filter((k) => all[k].state === 'ok').map(line),
  ].join('\n');
}
