import { buildRows, continueTarget } from './menu_state.js';

// The table of contents. Reads as a book's contents, not a level select.
export function makeMenu({ cases, progress, isRegistered, onSelect, onHelp } = {}) {
  const el = document.createElement('div');
  el.className = 'gg-menu hidden';

  const h1 = document.createElement('h1');
  h1.textContent = 'The Gateless Gate';
  el.appendChild(h1);

  const help = document.createElement('button');
  help.textContent = '?';
  help.className = 'gg-help';
  help.onclick = () => onHelp && onHelp();
  el.appendChild(help);

  const cont = document.createElement('div');
  cont.className = 'gg-continue';
  el.appendChild(cont);

  const list = document.createElement('ol');
  el.appendChild(list);

  function render(prog) {
    list.innerHTML = '';
    const rows = buildRows(cases, prog, isRegistered);
    for (const r of rows) {
      const li = document.createElement('li');
      li.className = r.registered ? 'registered' : 'locked';
      const mark = r.sat ? '<span class="mark stamp">◉</span>'
        : r.read ? '<span class="mark dot"></span>' : '<span class="mark"></span>';
      li.innerHTML = `<span class="num">${r.id}</span><span class="ttl">${r.title}</span>${mark}`;
      if (r.registered) li.querySelector('.ttl').onclick = () => onSelect && onSelect(r.slug);
      list.appendChild(li);
    }
    const tgt = continueTarget(cases, prog, prog.lastSlug);
    cont.innerHTML = '';
    if (tgt && isRegistered(tgt)) {
      const b = document.createElement('button');
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
