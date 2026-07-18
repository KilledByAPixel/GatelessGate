export function makeOnboarding({ onDismiss } = {}) {
  const el = document.createElement('div');
  el.className = 'gg-onboard hidden';
  const p = document.createElement('p');
  p.style.lineHeight = '1.6';
  p.textContent = 'A quiet reading of the Mumonkan. Read · listen · touch things · sit.';
  const b = document.createElement('button');
  b.textContent = 'Begin';
  b.onclick = () => { el.classList.add('hidden'); onDismiss && onDismiss(); };
  el.append(p, b);
  return {
    el,
    show() { el.classList.remove('hidden'); },
    hide() { el.classList.add('hidden'); },
  };
}
