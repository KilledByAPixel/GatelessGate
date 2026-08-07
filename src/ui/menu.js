import { buildRows, continueTarget, devEntries } from './menu_state.js';
import { searchCases } from './search.js';
import MATTER from '../koans/text/matter.js';
import { readingEntries } from '../spine.js';

// The table of contents — a left-panel view over the idling stage scene.
// Reads as a book's contents, not a level select.
export function makeMenu({
  cases, progress, isStaged, onSelect, onAbout, devMode = false, onDev, themeEl = null,
} = {}) {
  const el = document.createElement('div');
  el.className = 'gg-view gg-menu hidden';

  const h1 = document.createElement('h1');
  h1.textContent = 'The Gateless Gate';
  const lede = document.createElement('p');
  lede.className = 'lede';
  lede.textContent = 'An interactive edition of the Mumonkan';

  const cont = document.createElement('div');
  cont.className = 'gg-continue';

  // Search sits beside Continue. It reaches the whole book — titles, cases,
  // Mumon's commentaries and his verses — because the thing you actually
  // remember about a koan is rarely its title.
  const find = document.createElement('input');
  find.type = 'search';
  find.className = 'gg-find';
  find.placeholder = 'Search the book';
  find.setAttribute('aria-label', 'Search all forty-nine cases');
  // Our own clear mark rather than the browser's: every engine draws
  // ::-webkit-search-cancel-button differently and this panel is a book page,
  // so the one it gets should be the page's ✕, in the page's ink.
  const findWrap = document.createElement('div');
  findWrap.className = 'gg-find-wrap';
  const findClear = document.createElement('button');
  findClear.type = 'button';
  findClear.className = 'gg-find-clear';
  findClear.textContent = '×';
  findClear.setAttribute('aria-label', 'Clear search');
  findWrap.append(find, findClear);
  const found = document.createElement('div');
  found.className = 'gg-found';

  const list = document.createElement('ol');

  // Back matter, below the list rather than in it: the about page sits under
  // the contents where a printed book puts its colophon. Hidden while
  // searching, like Continue.
  const backMatter = document.createElement('div');
  backMatter.className = 'gg-backmatter';
  const about = document.createElement('button');
  about.className = 'gg-about-link';
  about.textContent = 'About';
  about.title = 'The translation, the lineage, and the credits';
  about.onclick = () => onAbout && onAbout();
  // The colophon line carries the reading light too: it is the one control the
  // contents needs, and a book's light switch belongs at the end of the page
  // rather than over its title. Same button as the one beside Sit.
  const colophon = document.createElement('div');
  colophon.className = 'gg-colophon';
  colophon.appendChild(about);
  if (themeEl) colophon.appendChild(themeEl);
  backMatter.appendChild(colophon);

  // The Developer section, after About — the tools, not the book. Rebuilt from
  // scratch on every render and EMPTY unless developer mode is on: with the
  // flag off there is no element here and no handler attached, which is what
  // makes "off = the app as it was" literally true rather than merely hidden.
  const dev = document.createElement('div');
  dev.className = 'gg-dev';
  let devOn = !!devMode;

  function renderDev() {
    dev.innerHTML = '';
    const entries = devEntries(devOn);
    dev.style.display = entries.length ? '' : 'none';
    if (!entries.length) return;
    const h = document.createElement('div');
    h.className = 'gg-dev-head';
    h.textContent = 'Developer';
    dev.appendChild(h);
    for (const e of entries) {
      const b = document.createElement('button');
      b.className = 'gg-about-link';        // the back matter's own button shape
      b.textContent = e.label;
      b.onclick = () => onDev && onDev(e.slug);
      dev.appendChild(b);
    }
  }
  backMatter.appendChild(dev);

  el.append(h1, lede, cont, findWrap, found, list, backMatter);

  let query = '';
  // One way out of a search, wired to three things: the ✕, Escape, and any
  // future caller. Escape used to be the only exit and it is invisible.
  const clearQuery = () => { query = ''; find.value = ''; render(lastProg); };
  find.oninput = () => { query = find.value; render(lastProg); };
  find.onkeydown = (e) => { if (e.key === 'Escape') clearQuery(); };
  findClear.onclick = () => { clearQuery(); find.focus(); };

  let lastProg = progress;
  // The contents are the reading spine: the preface, the forty-nine, the
  // afterword. Search still runs over the cases alone, which is why `cases`
  // stays a separate prop.
  const entries = readingEntries(cases, MATTER);

  function renderResults(prog) {
    const results = searchCases(query);
    list.innerHTML = '';
    found.textContent = '';
    if (results === null) return false;         // not searching — fall through to the contents

    if (!results.length) {
      found.textContent = 'Nothing in the book matches that.';
      return true;
    }
    found.textContent = `${results.length} of 49`;
    const read = prog.read || {};
    const sat = prog.sat || {};
    for (const r of results) {
      const c = cases.find((x) => x.id === r.id);
      if (!c) continue;
      const li = document.createElement('li');
      li.className = isStaged(c.slug) ? 'registered' : 'unstaged';
      const num = document.createElement('span'); num.className = 'num'; num.textContent = String(r.id);
      const ttl = document.createElement('span'); ttl.className = 'ttl';
      ttl.textContent = c.title;
      // the line that was actually hit, so the list is recognisable at a glance
      if (r.snippet) {
        const q = document.createElement('em');
        q.className = 'hit';
        q.textContent = r.snippet;
        ttl.appendChild(q);
      }
      ttl.onclick = () => onSelect && onSelect(c.slug);
      const mark = document.createElement('span');
      mark.className = 'mark ' + (sat[c.slug] ? 'stamp' : read[c.slug] ? 'dot' : '');
      mark.textContent = sat[c.slug] ? '◉' : '';
      li.append(num, ttl, mark);
      list.appendChild(li);
    }
    return true;
  }

  function render(prog) {
    lastProg = prog;
    cont.style.display = query ? 'none' : '';
    findClear.style.display = query ? '' : 'none';
    backMatter.style.display = query ? 'none' : '';
    renderDev();
    if (renderResults(prog)) return;
    list.innerHTML = '';
    for (const r of buildRows(entries, prog, isStaged)) {
      const li = document.createElement('li');
      // every case opens; `unstaged` only dims the row a little to show which
      // ones are still waiting for art of their own
      li.className = r.staged ? 'registered' : 'unstaged';
      const num = document.createElement('span'); num.className = 'num';
      num.textContent = r.id === null ? '' : String(r.id);
      const ttl = document.createElement('span'); ttl.className = 'ttl'; ttl.textContent = r.title;
      ttl.onclick = () => onSelect && onSelect(r.slug);
      const mark = document.createElement('span');
      mark.className = 'mark ' + (r.sat ? 'stamp' : r.read ? 'dot' : '');
      mark.textContent = r.sat ? '◉' : '';
      li.append(num, ttl, mark);
      list.appendChild(li);
    }
    cont.innerHTML = '';
    const tgt = continueTarget(entries, prog, prog.lastSlug);
    if (tgt) {
      const b = document.createElement('button');
      b.className = 'gg-btn';
      b.textContent = 'Continue';
      b.onclick = () => onSelect && onSelect(tgt);
      cont.appendChild(b);
    }
  }
  render(progress);

  let open = false;
  return {
    el,
    open() { open = true; el.classList.remove('hidden'); },
    close() { open = false; el.classList.add('hidden'); },
    isOpen() { return open; },
    // The workbench owns the flag; the menu is told about it. Re-renders in
    // place so the section appears (or vanishes) the moment the box is ticked,
    // without closing and reopening the contents.
    setDevMode(on) { devOn = !!on; render(lastProg); },
    refresh(prog) { render(prog); },
    dispose() { el.remove(); },
  };
}
