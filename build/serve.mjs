/* שרת-בדיקה מקומי ל-dist/ — מגיש את הפלט המעורפל עם כותרות ה-CSP/אבטחה
   מ-_headers, כדי לבדוק תאימות-CSP מקומית לפני deploy. בדיקה בלבד — לא לפרודקשן.
   הרצה:  node build/serve.mjs [port]   (ברירת-מחדל 8787) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.argv[2] || 8787);

// שליפת בלוק ה-CSP/כותרות הגלובלי מ-_headers (השורות עם 2-רווח הזחה תחת /*)
function globalHeaders() {
  const h = {};
  try {
    const txt = fs.readFileSync(path.join(DIST, '_headers'), 'utf8');
    const lines = txt.split(/\r?\n/);
    let inGlobal = false;
    for (const line of lines) {
      if (/^\/\*\s*$/.test(line)) { inGlobal = true; continue; }
      if (inGlobal) {
        const m = line.match(/^\s{2}([A-Za-z-]+):\s*(.+)$/);
        if (m) h[m[1]] = m[2];
        else if (line.trim() === '' || /^\S/.test(line)) break; // סוף הבלוק
      }
    }
  } catch {}
  return h;
}
const HEADERS = globalHeaders();

const TYPES = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json', '.webmanifest':'application/manifest+json',
  '.wasm':'application/wasm', '.bin':'application/octet-stream',
  '.png':'image/png', '.svg':'image/svg+xml', '.txt':'text/plain; charset=utf-8',
  '.xml':'application/xml', '.ico':'image/x-icon',
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const filePath = path.join(DIST, urlPath);
  // מניעת path traversal
  if (!filePath.startsWith(DIST)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(filePath, (err, data) => {
    const base = { ...HEADERS };
    if (err) {
      // fallback ל-index.html (כמו Cloudflare Pages) — לבדיקת SPA
      fs.readFile(path.join(DIST, 'index.html'), (e2, idx) => {
        if (e2) { res.writeHead(404, base); return res.end('not found'); }
        res.writeHead(200, { ...base, 'Content-Type': TYPES['.html'] });
        res.end(idx);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { ...base, 'Content-Type': TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`[serve] dist/ מוגש על http://localhost:${PORT}`);
  console.log(`[serve] CSP: ${HEADERS['Content-Security-Policy'] ? 'הוחל מ-_headers ✔' : 'לא נמצא!'}`);
});
