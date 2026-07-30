// The title card in the reading. With the text panel gone there is nothing on
// screen that says which page you are on, so the name fades up over the picture
// as the page begins, sits for a moment, and goes again.
//
// Deliberately not a persistent caption: the point of that view is the picture,
// and a label parked in the corner for four minutes becomes furniture. It says
// its piece when the page turns and then gets out of the way.
//
// Kept in one file rather than split into page_card_state.js like menu/scroll:
// nothing here touches the DOM at module level, so the pure half imports and
// runs under `node --test` on its own.

// How long the name stays up once it has arrived. Long enough to read twice
// without hurrying, short enough to be gone well before the page is.
export const HOLD_MS = 4200;

// What the card says for a page. A case shows its number above its name; the
// preface and the afterword have no number, and an empty line where one would
// be is worse than no line — so the caller hides it rather than centring a gap.
export function pageCardLabel({ id, title } = {}) {
  const numbered = id !== null && id !== undefined;
  return { number: numbered ? String(id) : '', title: title || '' };
}

export function makePageCard() {
  const el = document.createElement('div');
  el.className = 'gg-page-card';
  const num = document.createElement('div');
  num.className = 'num';
  const ttl = document.createElement('div');
  ttl.className = 'ttl';
  el.append(num, ttl);

  let timer = null;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };

  return {
    el,
    show(label, holdMs = HOLD_MS) {
      clear();
      num.textContent = label.number;
      // display rather than empty text: an empty div still takes its line box
      // and the gap, which would push the title off centre.
      num.style.display = label.number ? '' : 'none';
      ttl.textContent = label.title;
      el.classList.add('show');
      timer = setTimeout(() => { timer = null; el.classList.remove('show'); }, holdMs);
    },
    hide() { clear(); el.classList.remove('show'); },
    dispose() { clear(); el.remove(); },
  };
}
