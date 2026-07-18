import { buildRows, continueTarget } from './menu_state.js';

// The table of contents — a left-panel view over the idling stage scene.
// Reads as a book's contents, not a level select.
export function makeMenu({ cases, progress, isRegistered, onSelect, onHelp } = {}) {
  const el = document.createElement('div');
  el.className = 'gg-view gg-menu hidden';

  const h1 = document.createElement('h1');
  h1.textContent = 'The Gateless Gate';
  const lede = document.createElement('p');
  lede.className = 'lede';
  lede.textContent = 'The Mumonkan — read any case, in any order.';

  const help = document.createElement('button');
  help.className = 'gg-help';
  help.textContent = '?';
  help.title = 'About';
  help.onclick = () => onHelp && onHelp();

  const cont = document.createElement('div');
  cont.className = 'gg-continue';
  const list = document.createElement('ol');
  el.append(h1, lede, help, cont, list);

  function render(prog) {
    list.innerHTML = '';
    for (const r of buildRows(cases, prog, isRegistered)) {
      const li = document.createElement('li');
      li.className = r.registered ? 'registered' : 'locked';
      const num = document.createElement('span'); num.className = 'num'; num.textContent = String(r.id);
      const ttl = document.createElement('span'); ttl.className = 'ttl'; ttl.textContent = r.title;
      if (r.registered) ttl.onclick = () => onSelect && onSelect(r.slug);
      const mark = document.createElement('span');
      mark.className = 'mark ' + (r.sat ? 'stamp' : r.read ? 'dot' : '');
      mark.textContent = r.sat ? '◉' : '';
      li.append(num, ttl, mark);
      list.appendChild(li);
    }
    cont.innerHTML = '';
    const tgt = continueTarget(cases, prog, prog.lastSlug);
    if (tgt && isRegistered(tgt)) {
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
