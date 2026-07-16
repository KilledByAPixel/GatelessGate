// Dev-only screenshot receiver. The hidden preview panel can't take compositor
// screenshots, so the app's canvas is captured via toDataURL and POSTed here:
//   fetch('http://localhost:8106/<name>', { method: 'POST', body: canvas.toDataURL('image/jpeg', 0.85) })
// Files land in <repo>/shots/ (gitignored). Start via launch config "gate-shots".
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shots');
fs.mkdirSync(dir, { recursive: true });

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.end();
  if (req.method !== 'POST') return res.end('shot server ok');
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const m = body.match(/^data:image\/(\w+);base64,(.*)$/s);
    if (!m) {
      res.statusCode = 400;
      return res.end('expected an image data URL');
    }
    const name = (decodeURIComponent(req.url).replace(/[^\w-]/g, '') || 'shot') + '.' + m[1];
    fs.writeFileSync(path.join(dir, name), Buffer.from(m[2], 'base64'));
    res.end(name);
  });
}).listen(8106, () => console.log(`shot server on 8106 -> ${dir}`));
