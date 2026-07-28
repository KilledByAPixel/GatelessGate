import { buildRows, continueTarget } from './menu_state.js';
import { searchCases } from './search.js';
import MATTER from '../koans/text/matter.js';

// The table of contents — a left-panel view over the idling stage scene.
// Reads as a book's contents, not a level select.
export function makeMenu({ cases, progress, isStaged, onSelect, onAbout } = {}) {
  const el = document.createElement('div');
  el.className = 'gg-view gg-menu hidden';

  const h1 = document.createElement('h1');
  h1.textContent = 'The Gateless Gate';
  const lede = document.createElement('p');
  lede.className = 'lede';
  lede.textContent = 'The Mumonkan — read any case, in any order.';

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
  const found = document.createElement('div');
  found.className = 'gg-found';

  const list = document.createElement('ol');

  // The front and back matter sit AROUND the numbered list, not in it: the
  // contents are exactly Mumon's and Amban's forty-nine, and these two are the
  // pages a printed book puts before the contents and beside the colophon.
  // A reader meets them by paging; these links are how someone who already knows
  // they exist gets back to one.
  const matterLink = (page) => {
    const b = document.createElement('button');
    b.className = 'gg-matter-link';
    b.textContent = page.title;
    b.onclick = () => onSelect && onSelect(page.slug);
    return b;
  };

  const frontMatter = document.createElement('div');
  frontMatter.className = 'gg-frontmatter';
  frontMatter.appendChild(matterLink(MATTER.preface));

  // Back matter, below the list rather than in it: the contents stay exactly
  // the forty-nine cases Mumon and Amban left, and the about page sits under
  // them where a printed book puts its colophon. Hidden while searching, like
  // Continue.
  const backMatter = document.createElement('div');
  backMatter.className = 'gg-backmatter';
  const about = document.createElement('button');
  about.className = 'gg-about-link';
  about.textContent = 'About';
  about.title = 'The translation, the lineage, and the credits';
  about.onclick = () => onAbout && onAbout();
  backMatter.append(matterLink(MATTER.afterword), about);

  el.append(h1, lede, cont, find, found, frontMatter, list, backMatter);

  let query = '';
  find.oninput = () => { query = find.value; render(lastProg); };
  find.onkeydown = (e) => {
    if (e.key !== 'Escape') return;
    query = ''; find.value = ''; render(lastProg);
  };

  let lastProg = progress;

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
    backMatter.style.display = query ? 'none' : '';
    frontMatter.style.display = query ? 'none' : '';
    if (renderResults(prog)) return;
    list.innerHTML = '';
    for (const r of buildRows(cases, prog, isStaged)) {
      const li = document.createElement('li');
      // every case opens; `unstaged` only dims the row a little to show which
      // ones are still waiting for art of their own
      li.className = r.staged ? 'registered' : 'unstaged';
      const num = document.createElement('span'); num.className = 'num'; num.textContent = String(r.id);
      const ttl = document.createElement('span'); ttl.className = 'ttl'; ttl.textContent = r.title;
      ttl.onclick = () => onSelect && onSelect(r.slug);
      const mark = document.createElement('span');
      mark.className = 'mark ' + (r.sat ? 'stamp' : r.read ? 'dot' : '');
      mark.textContent = r.sat ? '◉' : '';
      li.append(num, ttl, mark);
      list.appendChild(li);
    }
    cont.innerHTML = '';
    const tgt = continueTarget(cases, prog, prog.lastSlug);
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
    refresh(prog) { render(prog); },
    dispose() { el.remove(); },
  };
}
