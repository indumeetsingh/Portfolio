// Checks that the source in src/ still produces the original Carrd embed.
//
// Compares dist/carrd-embed-inline.html (built from src/) with
// snapshot/carrd-original.html after a few documented, purely mechanical
// normalisations, and fails on any other difference:
//   - the original is passed through the same minifiers as the build
//   - class renames in the original: de -> t-l, mo -> t-s (full/short text variants)
//   - the base64 portrait in the original is replaced by the hosted asset URL,
//     and its decoded bytes must equal src/assets/portrait.jpg
//   - CSS is compared as a list of (media, selector, declarations) rules: same set
//     of rules, and the same relative order for rules sharing a selector
//
// Usage: node scripts/verify-snapshot.mjs   (also: npm run verify)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, minifyHtml, minifyCss } from './build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(ROOT, 'site.config.json'), 'utf8'));

build({ quiet: true });

const original = readFileSync(join(ROOT, 'snapshot', 'carrd-original.html'), 'utf8').replace(/\r\n/g, '\n');
const rebuilt = readFileSync(join(ROOT, 'dist', 'carrd-embed-inline.html'), 'utf8');

// ---------- split each document into head / css / body / js ----------------
function split(doc) {
  const css = (doc.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
  const js = (doc.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
  const head = doc.slice(0, doc.indexOf('<style>'));
  const body = doc.slice(doc.indexOf('</style>') + 8, doc.lastIndexOf('<script>'));
  return { head: minifyHtml(head), css: minifyCss(css), body: minifyHtml(body), js: js.trim() };
}

const a = split(original);
const b = split(rebuilt);
const failures = [];

// ---------- normalise the original -----------------------------------------
// portrait: data URI -> hosted file, bytes must match
const m = a.body.match(/src="data:image\/jpeg;base64,([^"]+)"/);
if (!m) failures.push('original: portrait data URI not found');
else {
  const bytes = Buffer.from(m[1], 'base64');
  const file = readFileSync(join(ROOT, 'src', 'assets', 'portrait.jpg'));
  if (!bytes.equals(file)) failures.push('src/assets/portrait.jpg differs from the portrait embedded in the original');
  a.body = a.body.replace(m[0], `src="${config.assetBaseUrl.replace(/\/$/, '')}/assets/portrait.jpg"`);
}
// class renames (HTML attributes + CSS selectors)
const renameClasses = (s) => s.replace(/class="([^"]*)"/g, (_, c) =>
  `class="${c.split(' ').map((x) => (x === 'de' ? 't-l' : x === 'mo' ? 't-s' : x)).join(' ')}"`);
a.body = renameClasses(a.body);
a.css = a.css.replace(/\.de(?![\w-])/g, '.t-l').replace(/\.mo(?![\w-])/g, '.t-s');

// ---------- compare ----------------------------------------------------------
function firstDiff(x, y) {
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return `at char ${i}\n    original: …${x.slice(Math.max(0, i - 60), i + 120)}…\n    rebuilt:  …${y.slice(Math.max(0, i - 60), i + 120)}…`;
}
for (const part of ['head', 'body', 'js']) {
  if (a[part] !== b[part]) failures.push(`${part} differs ${firstDiff(a[part], b[part])}`);
}

// CSS: flatten to rules
function rules(css) {
  const out = [];
  let media = '';
  let i = 0;
  while (i < css.length) {
    if (css.startsWith('@media', i)) {
      const open = css.indexOf('{', i);
      media = css.slice(i, open).trim();
      i = open + 1;
      continue;
    }
    if (css[i] === '}') { media = ''; i++; continue; }
    const open = css.indexOf('{', i);
    const close = css.indexOf('}', open);
    if (open < 0 || close < 0) break;
    const sel = css.slice(i, open).trim();
    const decl = css.slice(open + 1, close).trim();
    for (const s of sel.split(',')) out.push({ media, sel: s.trim(), decl });
    i = close + 1;
  }
  return out;
}
const ra = rules(a.css);
const rb = rules(b.css);
const key = (r) => `${r.media} | ${r.sel} { ${r.decl} }`;
const setA = new Map(ra.map((r) => [key(r), r]));
const setB = new Map(rb.map((r) => [key(r), r]));
for (const k of setA.keys()) if (!setB.has(k)) failures.push(`css rule missing in rebuilt: ${k}`);
for (const k of setB.keys()) if (!setA.has(k)) failures.push(`css rule added in rebuilt: ${k}`);
// same relative order for rules that share a selector within a media block
const order = (rs) => {
  const o = new Map();
  rs.forEach((r, idx) => { const k = `${r.media} | ${r.sel}`; (o.get(k) || o.set(k, []).get(k)).push(`${idx}:${r.decl}`); });
  return o;
};
const oa = order(ra), ob = order(rb);
for (const [k, list] of oa) {
  const lb = ob.get(k) || [];
  const da = list.map((x) => x.slice(x.indexOf(':') + 1));
  const db = lb.map((x) => x.slice(x.indexOf(':') + 1));
  if (da.length > 1 && da.join('\u0000') !== db.join('\u0000')) failures.push(`css cascade order changed for ${k}`);
}

if (failures.length) {
  console.error(`Snapshot verification FAILED (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Snapshot verification passed: head, body (${b.body.length} chars), js and ${rb.length} CSS rules match the original.`);
