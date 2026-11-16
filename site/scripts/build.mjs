// Builds the Carrd embed from src/ (no dependencies, just Node).
//
//   dist/portfolio.js         -> the hosted bundle (CSS + HTML + JS), served by GitHub Pages
//   dist/carrd-embed.html     -> the tiny loader to paste into the Carrd "Embed" element
//   dist/preview.html         -> full HTML page to preview locally / in a browser
//
// Usage: node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

// Order matters: this is the CSS cascade order. Responsive overrides go last.
const CSS_FILES = [
  'styles/01-tokens.css',
  'styles/02-reset.css',
  'styles/03-base.css',
  'styles/sections/header.css',
  'styles/sections/hero.css',
  'styles/sections/platforms.css',
  'styles/sections/section.css',
  'styles/sections/services.css',
  'styles/sections/work.css',
  'styles/sections/approach.css',
  'styles/sections/about.css',
  'styles/sections/contact.css',
  'styles/sections/footer.css',
  'styles/99-responsive.css',
];
const JS_FILES = ['scripts/smooth-scroll.js'];

// Every selector must be scoped under this class so nothing leaks into Carrd.
const SCOPE = '.sx';
// Name of the hosted bundle (dist/<NAME>.js) and of the mount <div id="<NAME>"> in Carrd.
const NAME = 'portfolio';

const read = (p) => readFileSync(join(SRC, p), 'utf8').replace(/\r\n/g, '\n');

// ---------- templating ------------------------------------------------------
// Syntax (see README):
//   {{> path}}                     include src/<path>.html
//   {{key}} / {{a.b.c}} / {{.}}    text from content.json or site.config.json
//                                  ({"full","short"} objects render both, CSS picks one per viewport)
//   {{#each list}} ... {{/each}}   repeat for each item; inside, {{key}} looks in the item first
// `stack` is the lookup context: [data, outerItem, innerItem, ...]

function lookup(path, stack) {
  if (path === '.') return stack[stack.length - 1];
  const parts = path.split('.');
  for (let i = stack.length - 1; i >= 0; i--) {
    let v = stack[i];
    let ok = true;
    for (const p of parts) {
      if (v !== null && typeof v === 'object' && p in v) v = v[p];
      else { ok = false; break; }
    }
    if (ok) return v;
  }
  return undefined;
}

// Lets authors type "&" in content; existing entities are left alone.
const escapeAmp = (s) => s.replace(/&(?!(?:#\d+|#x[0-9a-fA-F]+|\w+);)/g, '&amp;');

function value(path, stack) {
  const v = lookup(path, stack);
  if (v === undefined) throw new Error(`Unknown key {{${path}}} (add it to content.json or site.config.json)`);
  if (typeof v === 'string' || typeof v === 'number') return vars(escapeAmp(String(v)), stack);
  if (v !== null && typeof v === 'object' && 'full' in v) {
    const full = vars(escapeAmp(v.full), stack);
    const short = v.short ? vars(escapeAmp(v.short), stack) : '';
    return short ? `<span class="t-l">${full}</span><span class="t-s">${short}</span>` : full;
  }
  throw new Error(`{{${path}}} is not text (use {{#each ${path}}} for lists)`);
}

function vars(text, stack) {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, p) => value(p, stack));
}

function expandEach(text, stack, seen) {
  const open = /\{\{#each\s+([\w.]+)\s*\}\}/g;
  let m;
  while ((m = open.exec(text))) {
    const bodyStart = open.lastIndex;
    const tok = /\{\{#each\s+[\w.]+\s*\}\}|\{\{\/each\}\}/g;
    tok.lastIndex = bodyStart;
    let depth = 1, t, bodyEnd = -1, end = -1;
    while ((t = tok.exec(text))) {
      depth += t[0].startsWith('{{#each') ? 1 : -1;
      if (depth === 0) { bodyEnd = t.index; end = tok.lastIndex; break; }
    }
    if (end < 0) throw new Error(`Unclosed {{#each ${m[1]}}}`);
    const items = lookup(m[1], stack);
    if (!Array.isArray(items)) throw new Error(`{{#each ${m[1]}}}: not a list in content.json`);
    const body = text.slice(bodyStart, bodyEnd);
    const out = items.map((item) => render(body, [...stack, item], seen)).join('');
    text = text.slice(0, m.index) + out + text.slice(end);
    open.lastIndex = m.index + out.length;
  }
  return text;
}

function render(text, stack, seen = []) {
  text = text.replace(/<!--[\s\S]*?-->/g, ''); // comments may document the syntax
  text = expandEach(text, stack, seen);
  text = vars(text, stack);
  return text.replace(/\{\{>\s*([\w/-]+)\s*\}\}/g, (_, p) => {
    if (seen.includes(p)) throw new Error(`Circular include: ${[...seen, p].join(' -> ')}`);
    return render(read(`${p}.html`).trim(), stack, [...seen, p]);
  });
}

// ---------- minifiers (deliberately simple + predictable) -------------------
export function minifyHtml(html) {
  const lines = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  // Join without a space when either side is a tag boundary, otherwise keep one
  // space so words on separate lines don't get glued together.
  return lines.reduce((out, l) => {
    if (!out) return l;
    return out + (out.endsWith('>') || l.startsWith('<') ? '' : ' ') + l;
  }, '');
}

export function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/\s+!important/g, '!important')
    .replace(/;}/g, '}')
    .trim();
}

export function minifyJs(js) {
  return js
    .split('\n')
    .map((l) => l.replace(/\s+\/\/ [^'"]*$/, '').trim()) // trailing // comments
    .filter((l) => l && !l.startsWith('//'))
    .join('\n');
}

function checkScope(css) {
  const bad = [];
  // drop @keyframes blocks (their "from/to/50%" aren't selectors) and @media wrappers,
  // then look at every selector list
  const flat = css
    .replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
    .replace(/@media[^{]+\{/g, '');
  const scoped = new RegExp('^' + SCOPE.replace('.', '\\.') + '(?![\\w-])'); // .sk, .sk .x, .sk.js .x
  for (const [, sel] of flat.matchAll(/(?:^|})\s*([^{}@]+)\{/g)) {
    for (const s of sel.split(',')) {
      const t = s.trim();
      if (t && !scoped.test(t)) bad.push(t);
    }
  }
  // keyframe names are global too, so they must be prefixed
  for (const [, name] of css.matchAll(/@keyframes\s+([\w-]+)/g)) {
    if (!name.startsWith('sx-')) bad.push(`@keyframes ${name} (prefix with sx-)`);
  }
  if (bad.length) throw new Error(`Unscoped CSS selectors (must start with "${SCOPE}"):\n  ${bad.join('\n  ')}`);
}

// ---------- build -----------------------------------------------------------
export function build({ quiet = false } = {}) {
  const config = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));
  const content = JSON.parse(readFileSync(join(ROOT, 'content.json'), 'utf8'));
  const data = { ...content, ...config };

  const head = minifyHtml(read('head.html'));
  const css = minifyCss(CSS_FILES.map(read).join('\n'));
  checkScope(css);
  const body = minifyHtml(render(read('page.html'), [data]));
  const js = minifyJs(JS_FILES.map(read).join('\n'));

  // Carrd's Embed element silently cuts code at 16,384 characters, so what goes
  // into Carrd is a tiny loader; the real page ships as one hosted JS file.
  if (!config.assetBaseUrl) throw new Error('assetBaseUrl missing in site.config.json');
  const scriptUrl = `${config.assetBaseUrl.replace(/\/$/, '')}/${NAME}.js`;

  const bundle = `/* ${config.brand} site bundle. Generated by site/scripts/build.mjs, do not edit by hand. */
(function(){
var mount=document.getElementById('${NAME}')||(document.currentScript&&document.currentScript.parentNode);
if(!mount||mount.getAttribute('data-sx-loaded'))return;
mount.setAttribute('data-sx-loaded','1');
var style=document.createElement('style');
style.textContent=${JSON.stringify(css)};
document.head.appendChild(style);
mount.innerHTML=${JSON.stringify(body)};
${js}
})();
`;

  const snippet = `${head}\n<div id="${NAME}"></div>\n<script src="${scriptUrl}" async></script>\n`;
  if (snippet.length > CARRD_LIMIT) throw new Error(`Carrd snippet is ${snippet.length} chars, over Carrd's ${CARRD_LIMIT} limit`);

  // Everything inline, for reference or for hosts without a size limit.
  const inline = `${head}\n<style>${css}</style>\n${body}\n<script>${js}</script>\n`;

  // The preview uses the same loader, pointed at the local bundle.
  const preview = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${config.brand} – Carrd embed preview</title>
<style>html,body{margin:0;padding:0;background:#fff}</style>
</head>
<body>
<!-- BEGIN CARRD EMBED (local copy: script path made relative) -->
${snippet.replace(scriptUrl, `${NAME}.js`)}<!-- END CARRD EMBED -->
</body>
</html>
`;

  mkdirSync(DIST, { recursive: true });
  // Static assets (portrait…) are served next to the bundle: {{assetBaseUrl}}/assets/<file>
  if (existsSync(join(SRC, 'assets'))) cpSync(join(SRC, 'assets'), join(DIST, 'assets'), { recursive: true });
  writeFileSync(join(DIST, `${NAME}.js`), bundle);
  writeFileSync(join(DIST, 'carrd-embed.html'), snippet);
  writeFileSync(join(DIST, 'carrd-embed-inline.html'), inline);
  writeFileSync(join(DIST, 'preview.html'), preview);

  if (!quiet) {
    const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1);
    console.log(`Built dist/${NAME}.js (${kb(bundle)} KB, hosted), dist/carrd-embed.html (${snippet.length} chars, paste into Carrd), dist/carrd-embed-inline.html (${kb(inline)} KB) and dist/preview.html`);
  }
  return snippet;
}
const CARRD_LIMIT = 16384;

// Run when called directly: node scripts/build.mjs
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    build();
  } catch (err) {
    console.error(`Build failed: ${err.message}`);
    process.exit(1);
  }
}
