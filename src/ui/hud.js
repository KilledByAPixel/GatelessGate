export function makeHud({ onSound, onSit, onMenu, soundOn = true } = {}) {
  const el = document.createElement('div');
  el.className = 'gg-hud';

  const sound = document.createElement('button');
  const setSoundLabel = (on) => { sound.textContent = on ? '♪ on' : '♪ off'; };
  setSoundLabel(soundOn);
  sound.onclick = () => onSound && onSound();
  el.appendChild(sound);

  const sit = document.createElement('button');
  sit.textContent = 'Sit';
  const pop = document.createElement('span');
  pop.className = 'gg-sit-pop hidden';
  for (const m of [2, 5, 10, 20]) {
    const b = document.createElement('button');
    b.textContent = m + 'm';
    b.onclick = () => { pop.classList.add('hidden'); onSit && onSit(m); };
    pop.appendChild(b);
  }
  sit.onclick = () => pop.classList.toggle('hidden');
  const sitWrap = document.createElement('span');
  sitWrap.style.position = 'relative';
  sitWrap.appendChild(sit); sitWrap.appendChild(pop);
  el.appendChild(sitWrap);

  const enso = document.createElement('button');
  enso.className = 'gg-enso';
  enso.textContent = '○';
  enso.onclick = () => onMenu && onMenu();

  return {
    el, ensoEl: enso,
    setSound(on) { setSoundLabel(on); },
    setVisible(v) { el.style.display = v ? 'flex' : 'none'; enso.style.display = v ? 'block' : 'none'; },
    dispose() { el.remove(); enso.remove(); },
  };
}
