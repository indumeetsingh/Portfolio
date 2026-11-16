// Local dev server with live reload (no dependencies).
// Watches src/ and site.config.json, rebuilds, and refreshes the browser.
//
// Usage: node scripts/dev.mjs   ->  http://localhost:5500
import { createServer } from 'node:http';
import { watch, readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 5500;

const clients = new Set();
const RELOAD = `<script>new EventSource('/__reload').onmessage=()=>location.reload()</script>`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const TEXT = new Set(['.html', '.txt', '.js', '.css', '.svg']);

function rebuild() {
  try {
    build();
    for (const res of clients) res.write('data: reload\n\n');
  } catch (err) {
    console.error(`\x1b[31mBuild failed:\x1b[0m ${err.message}`);
  }
}

rebuild();

let timer;
const onChange = () => { clearTimeout(timer); timer = setTimeout(rebuild, 100); };
watch(join(ROOT, 'src'), { recursive: true }, onChange);
watch(join(ROOT, 'site.config.json'), onChange);
watch(join(ROOT, 'content.json'), onChange);

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // "/" -> preview page; "/embed" -> the raw code to paste into Carrd
  if (url.pathname === '/embed') {
    res.writeHead(200, { 'Content-Type': TYPES['.txt'] });
    return res.end(readFileSync(join(DIST, 'carrd-embed.html')));
  }

  const rel = url.pathname === '/' ? 'preview.html' : normalize(url.pathname).replace(/^[\\/]+/, '');
  const file = join(DIST, rel);
  if (!file.startsWith(DIST) || !existsSync(file)) {
    res.writeHead(404);
    return res.end('Not found');
  }
  let body = TEXT.has(extname(file)) ? readFileSync(file, 'utf8') : readFileSync(file);
  if (rel.endsWith('.html')) body = body.replace('</body>', `${RELOAD}</body>`);
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
}).listen(PORT, () => {
  console.log(`\nPreview:      http://localhost:${PORT}`);
  console.log(`Embed code:   http://localhost:${PORT}/embed  (copy this into Carrd)`);
  console.log('Watching src/, content.json and site.config.json for changes...\n');
});
