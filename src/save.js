// Injectable-storage progress + settings. Pure logic; the browser passes localStorage.

export function createSave(storage, key = 'gateless-gate-v1') {
  const blank = () => ({
    read: {}, sat: {}, soundOn: true, lastSlug: null, onboarded: false, theme: 'light',
  });
  let state;
  try {
    const raw = storage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    state = { ...blank(), ...(parsed || {}) };
    state.read = state.read || {};
    state.sat = state.sat || {};
  } catch {
    state = blank();
  }
  const persist = () => { try { storage.setItem(key, JSON.stringify(state)); } catch { /* quota/denied: ignore */ } };
  return {
    state: () => state,
    markRead(slug) { state.read[slug] = true; state.lastSlug = slug; persist(); },
    markSat(slug) { state.sat[slug] = true; persist(); },
    setSound(on) { state.soundOn = !!on; persist(); },
    setTheme(t) { state.theme = t === 'dark' ? 'dark' : 'light'; persist(); },
    setOnboarded() { state.onboarded = true; persist(); },
  };
}
