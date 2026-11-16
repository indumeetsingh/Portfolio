// Headless Edge screenshots of the built preview, at desktop and phone widths.
// Zero dependencies: a tiny static server + msedge --headless --screenshot.
//
//   node scripts/screenshot.mjs [--out <dir>]      (default: site/.shots, git-ignored)
//
// Phone shots render dist/preview.html inside a 390px-wide <iframe>; "scrolled" shots
// scroll the page first (sticky header), "menu" opens the hamburger menu.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const argv = process.argv.slice(2);
const OUT = resolve(argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : join(ROOT, '.shots'));
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']
  .find(existsSync);
if (!EDGE) { console.error('Microsoft Edge not found'); process.exit(1); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };

// Wrapper page: an iframe of the given width; optional scroll + menu after load.
function wrapper(width, height, { scroll = 0, menu = false } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#888}iframe{display:block;border:0;background:#fff;width:${width}px;height:${height}px;margin:0 auto}</style></head>
<body><iframe id="f" src="/preview.html"></iframe><script>
var f=document.getElementById('f');f.addEventListener('load',function(){var w=f.contentWindow,d=w.document;
setTimeout(function(){${scroll ? `w.scrollTo(0,${scroll});` : ''}${menu ? `var b=d.querySelector('.burger');if(b)b.click();` : ''}},600);});
</script></body></html>`;
}

const SHOTS = [
  { name: 'desktop-1366-top', win: [1366, 900], frame: [1366, 900] },
  { name: 'desktop-1366-scrolled', win: [1366, 900], frame: [1366, 900], scroll: 1200 },
  { name: 'desktop-1366-full', win: [1366, 4200], frame: [1366, 4200] },
  { name: 'mobile-390-top', win: [430, 900], frame: [390, 844] },
  { name: 'mobile-390-scrolled', win: [430, 900], frame: [390, 844], scroll: 900 },
  { name: 'mobile-390-menu', win: [430, 900], frame: [390, 844], menu: true },
  { name: 'mobile-390-full', win: [430, 4400], frame: [390, 4400] },
];

build({ quiet: true });
mkdirSync(OUT, { recursive: true });

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const shot = SHOTS.find((s) => url.pathname === `/shot/${s.name}.html`);
  if (shot) {
    res.writeHead(200, { 'Content-Type': TYPES['.html'] });
    return res.end(wrapper(shot.frame[0], shot.frame[1], shot));
  }
  const rel = url.pathname === '/' ? 'preview.html' : normalize(url.pathname).replace(/^[\\/]+/, '');
  const file = join(DIST, rel);
  if (!file.startsWith(DIST) || !existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(file));
});

// Edge must run asynchronously: a blocking spawn would stop the server above from answering it.
const run = (args) => new Promise((done) => {
  const p = spawn(EDGE, args, { stdio: 'ignore' });
  const t = setTimeout(() => { p.kill(); done(-1); }, 60000);
  p.on('exit', (code) => { clearTimeout(t); done(code); });
});

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const profile = mkdtempSync(join(tmpdir(), 'edge-shots-'));
  for (const s of SHOTS) {
    const png = join(OUT, `${s.name}.png`);
    const code = await run([
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--disable-extensions',
      `--user-data-dir=${profile}`, `--window-size=${s.win[0]},${s.win[1]}`, '--virtual-time-budget=6000',
      `--screenshot=${png}`, `http://127.0.0.1:${port}/shot/${s.name}.html`,
    ]);
    console.log(`${code === 0 && existsSync(png) ? 'ok  ' : 'FAIL'} ${png}`);
  }
  rmSync(profile, { recursive: true, force: true });
  server.close();
});
