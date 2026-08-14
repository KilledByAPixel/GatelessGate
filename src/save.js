// Injectable-storage progress + settings. Pure logic; the browser passes localStorage.

export function createSave(storage, key = 'gateless-gate-v1') {
  const blank = () => ({
    read: {}, sat: {}, touched: {}, soundOn: true, lastSlug: null, onboarded: false, theme: 'light',
  });
  let state;
  try {
    const raw = storage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    state = { ...blank(), ...(parsed || {}) };
    state.read = state.read || {};
    state.sat = state.sat || {};
    // every save written before touches were tracked lands here
    state.touched = state.touched || {};
  } catch {
    state = blank();
  }
  const persist = () => { try { storage.setItem(key, JSON.stringify(state)); } catch { /* quota/denied: ignore */ } };
  return {
    state: () => state,
    markRead(slug) { state.read[slug] = true; state.lastSlug = slug; persist(); },
    markSat(slug) { state.sat[slug] = true; persist(); },
    // The reader found what the page answers to. NOT a reading: lastSlug stays
    // where it was, because Continue means "where you were reading" and a bell
    // rung on a deep-linked page must not repoint it.
    markTouched(slug) { state.touched[slug] = true; persist(); },
    // The reader taking a mark off — every mark that page carries, in one
    // click. lastSlug goes with it when it points here: leaving it would offer
    // Continue on the very page whose mark was just wiped, which is the one
    // inconsistency in this the reader can actually see.
    clearMark(slug) {
      delete state.read[slug]; delete state.touched[slug]; delete state.sat[slug];
      if (state.lastSlug === slug) state.lastSlug = null;
      persist();
    },
    // THE WHOLE BOOK BACK TO ITS FIRST OPENING — every mark on every page, and
    // Continue with them. SETTINGS SURVIVE: sound, the reading light and
    // onboarded are not progress, and a reader clearing their marks has not
    // asked to be put back in the light with the sound on. That distinction is
    // the only reason this is written out longhand rather than reassigning
    // `blank()`, which would take the settings with it.
    clearAll() {
      state.read = {}; state.sat = {}; state.touched = {};
      state.lastSlug = null;
      persist();
    },
    setSound(on) { state.soundOn = !!on; persist(); },
    setTheme(t) { state.theme = t === 'dark' ? 'dark' : 'light'; persist(); },
    setOnboarded() { state.onboarded = true; persist(); },
  };
}
