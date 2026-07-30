// Pairs shots/before-<key>.jpg with shots/after-<key>.jpg into one HTML page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shots');
const files = fs.readdirSync(dir);
const keys = [...new Set(files
  .map((f) => /^before-(.+)\.(jpe?g|png)$/.exec(f)?.[1])
  .filter(Boolean))].sort();
const row = (key) => {
  const find = (p) => files.find((f) => f.startsWith(`${p}-${key}.`));
  const after = find('after');
  return `<section><h2>${key}</h2><div>
    <figure><img src="${find('before')}"><figcaption>before</figcaption></figure>
    ${after ? `<figure><img src="${after}"><figcaption>after</figcaption></figure>`
            : '<p class="missing">no after shot</p>'}
  </div></section>`;
};
const html = `<!doctype html><meta charset="utf-8"><title>Kit polish — contact sheet</title>
<style>
  body { font: 14px system-ui; background: #F3EDDF; color: #1E1E24; margin: 2em; }
  section div { display: flex; gap: 12px; } figure { margin: 0; }
  img { max-width: 46vw; border: 1px solid #999; } .missing { color: #a33; }
</style><h1>Kit model polish — before / after</h1>
${keys.map(row).join('\n')}`;
fs.writeFileSync(path.join(dir, 'contact-sheet.html'), html);
console.log(`contact-sheet.html: ${keys.length} pairs`);
