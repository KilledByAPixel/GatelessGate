import { buildRows, continueTarget, devEntries, markState, hasAnyMark } from './menu_state.js';
import { searchCases } from './search.js';
import { makeSitButton } from './sit_button.js';
import MATTER from '../koans/text/matter.js';
import { readingEntries } from '../spine.js';

// The table of contents — a left-panel view over the idling stage scene.
// Reads as a book's contents, not a level select.
export function makeMenu({
  cases, progress, isStaged, onSelect, onAbout, onClear, onClearAll, onSit,
  devMode = false, onDev, themeEl = null,
} = {}) {
  const el = document.createElement('div');
  el.className = 'gg-view gg-menu hidden';

  // THE TITLE ROW, and the reading light beside it. The light used to sit in
  // the colophon at the foot of the page, on the argument that a book's light
  // switch belongs at the end rather than over its title — which was true of
  // the page and wrong about the reader: the colophon is below the search box
  // and all fifty-one rows, so reaching it meant scrolling the whole contents,
  // and the light switch should simply be where the eye already is.
  const head = document.createElement('div');
  head.className = 'gg-menu-head';
  const h1 = document.createElement('h1');
  h1.textContent = 'The Gateless Gate';
  head.appendChild(h1);
  if (themeEl) head.appendChild(themeEl);
  // SIT FROM THE CONTENTS TOO, beside the reading light and built from the same
  // widget every page's toolbar uses (ui/sit_button.js). It was the one control
  // on every page of the book that the Contents did not offer, which made it
  // read as belonging to a case — and a sitting belongs to the reader. What you
  // sit in front of here is the hub landscape the Contents already idles over.
  const sitBtn = onSit ? makeSitButton({ onSit }) : null;
  if (sitBtn) head.appendChild(sitBtn.el);
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
  // CLEAR PROGRESS, beside About. It asks TWICE, in place: the first click
  // arms it and the label becomes the question, the second does it. A browser
  // confirm() would be the only piece of operating system on a page that is
  // otherwise a book, and one click is too few for something that takes the
  // marks off all fifty-one rows with no undo.
  //
  // It disarms three ways — any other click in the panel (the listener at the
  // bottom of this block), every render, and arriving at the Contents (open())
  // — so an armed button cannot outlive the reader's attention and go off on a
  // click they meant for something else. The third is not redundant: the panel
  // listener cannot see a click that landed on the STAGE.
  const clearAll = document.createElement('button');
  clearAll.className = 'gg-about-link gg-clear-all';
  let armed = false;
  function paintClearAll() {
    clearAll.textContent = armed ? 'Clear progress?' : 'Clear progress';
    clearAll.classList.toggle('armed', armed);
    clearAll.title = armed
      ? 'Click again to take every mark off every page'
      : 'Take every mark off every page — the reading light and the sound stay as they are';
  }
  clearAll.onclick = (e) => {
    // ...or the panel-wide disarm below would undo this very click
    e.stopPropagation();
    if (!armed) { armed = true; paintClearAll(); return; }
    armed = false;
    paintClearAll();
    onClearAll && onClearAll();
  };
  paintClearAll();
  // The reading light was here; it is up in the title row now (see above), so
  // this line carries About and the clear. NOT the light — one page with two
  // switches for the same thing is worse than one with the switch in the wrong
  // place.
  const colophon = document.createElement('div');
  colophon.className = 'gg-colophon';
  colophon.append(about, clearAll);
  backMatter.appendChild(colophon);
  el.addEventListener('click', () => { if (armed) { armed = false; paintClearAll(); } });

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

  el.append(head, lede, cont, findWrap, found, list, backMatter);

  let query = '';
  // One way out of a search, wired to three things: the ✕, Escape, and any
  // future caller. Escape used to be the only exit and it is invisible.
  const clearQuery = () => { query = ''; find.value = ''; render(lastProg); };
  find.oninput = () => { query = find.value; render(lastProg); };
  find.onkeydown = (e) => { if (e.key === 'Escape') clearQuery(); };
  findClear.onclick = () => { clearQuery(); find.focus(); };

  // THE MARK IN THE MARGIN — one cell, three states, and the reader can take
  // it off. WHICH state is markState's (menu_state.js, where it is testable);
  // this draws it.
  //
  // Read and touched are a drawn circle rather than a glyph ('·' at font-size
  // 22 and line-height 0, which is what this was, is a typographic mid-dot
  // barely visible against the ruled list); the sit keeps its ◉, which is a
  // ring and reads as a different KIND of mark, not a bigger one.
  //
  // It is a button whenever there is anything to clear, and a plain span
  // otherwise — an empty cell has no action, and a focusable one that does
  // nothing is worse than no affordance. Either way the cell keeps its width,
  // so the rows stay ruled straight down the page.
  function markCell(row) {
    const state = markState(row);
    if (!state) {
      const blank = document.createElement('span');
      blank.className = 'mark';
      return blank;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mark ' + state;
    // the sit is the one mark that is a glyph; the other two are drawn in CSS
    b.textContent = state === 'stamp' ? '◉' : '';
    b.title = 'Clear the mark on this page';
    b.setAttribute('aria-label', `Clear the mark on ${row.title}`);
    b.onclick = () => onClear && onClear(row.slug);
    return b;
  }

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
    const touched = prog.touched || {};
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
      // the same cell the contents draws — a search hit is still that page's row
      const mark = markCell({
        slug: c.slug, title: c.title,
        read: !!read[c.slug], sat: !!sat[c.slug], touched: !!touched[c.slug],
      });
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
    // An unopened book has nothing to clear, so it is not offered one — and a
    // render is also where an armed button goes back to rest, so a click that
    // changed the page cannot leave a loaded question sitting in the colophon.
    armed = false;
    paintClearAll();
    clearAll.style.display = onClearAll && hasAnyMark(prog) ? '' : 'none';
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
      li.append(num, ttl, markCell(r));
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
    // Disarmed on the way in as well as on every render: the panel-wide click
    // listener cannot see a click that landed on the STAGE, so an armed clear
    // could otherwise wait through a whole detour and go off on a single click
    // when the reader came back. Arriving at the Contents is a fresh page.
    open() { open = true; armed = false; paintClearAll(); el.classList.remove('hidden'); },
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
