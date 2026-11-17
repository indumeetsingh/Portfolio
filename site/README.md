# indumeet.crd.co – Carrd site source

Readable source for the code embedded on **https://indumeet.crd.co** (personal portfolio).
You edit the files in `src/`, and a build script turns them into the single hosted bundle
that Carrd loads.

## Quick start

Needs Node 20+ (no `npm install`, there are no dependencies).

```bash
cd site
npm run dev      # http://localhost:5500  -> live preview, reloads on save
npm run build    # writes dist/portfolio.js + dist/carrd-embed.html + dist/preview.html
npm run verify   # (refactor safety net) rebuilt output still equals snapshot/carrd-original.html
node scripts/screenshot.mjs   # headless Edge screenshots at 1366px and 390px into site/.shots/
```

## Publishing to Carrd

Carrd's Embed element silently cuts code at **16,384 characters**, so Carrd only holds a tiny
loader (`dist/carrd-embed.html`, ~360 chars, never changes) and the real page is one hosted file,
`dist/portfolio.js`, served by GitHub Pages from the `main` branch at
`https://indumeetsingh.github.io/Portfolio/site/dist/portfolio.js` (`assetBaseUrl` in
`site.config.json`). The portrait is served from `dist/assets/`.

**One-time:** enable GitHub Pages for the repo (Settings → Pages → Deploy from a branch → `main`,
`/ (root)`), then paste `dist/carrd-embed.html` into Carrd's **Embed** element
(*Type: Code*, *Style: Inline*) and Publish.

**Every update:**
1. `npm run build`
2. Commit (including `dist/`), merge to `main`, `git push`
3. Wait a minute for GitHub Pages, then hard-refresh the Carrd site. Pages caches for 10 minutes, so an
   update can take up to 10 minutes to reach every visitor.
4. Tag the release so you know what is live: `git tag carrd-2026-11-16 && git push --tags`

`dist/carrd-embed-inline.html` is the same page as a single inline snippet, for hosts without a size limit.
The Carrd *editor* preview blocks scripts; only the published URL shows the page.

## Layout

```
site/
├── content.json              # ALL the words on the page (with optional short versions for phones)
├── site.config.json          # links + names (Calendly, email, LinkedIn, GitHub, résumé, year…) – change them once here
├── snapshot/                 # the original embed code, as pasted in Carrd before this repo existed
├── src/
│   ├── page.html             # section order on the page
│   ├── head.html             # font <link>s
│   ├── partials/             # one HTML file per page section
│   ├── icons/                # inline SVG icons, included with {{> icons/name}}
│   ├── assets/               # portrait.jpg (copied to dist/assets/, served by GitHub Pages)
│   ├── styles/
│   │   ├── 01-tokens.css     # colours / fonts (CSS variables)
│   │   ├── 02-reset.css      # neutralises Carrd defaults inside .sx
│   │   ├── 03-base.css       # layout, type utilities, buttons
│   │   ├── sections/*.css    # one file per section
│   │   └── 99-responsive.css # tablet + mobile overrides (must stay last)
│   └── scripts/
│       ├── header.js         # sticky state, mobile menu, announcement dismiss
│       ├── smooth-scroll.js  # data-to links, offset for the sticky header
│       └── motion.js         # scroll reveals + count-up stats
├── scripts/
│   ├── build.mjs             # src → dist
│   ├── dev.mjs               # local server + live reload
│   ├── verify-snapshot.mjs   # proves a refactor did not change the output
│   └── screenshot.mjs        # headless Edge screenshots (desktop + phone)
└── dist/                     # generated and committed: portfolio.js is what GitHub Pages serves to Carrd
```

## Changing the words

**All copy is in [`content.json`](content.json)**; links and names are in
[`site.config.json`](site.config.json). You should rarely need to touch `src/`.

- Any text can be a plain string, or `{ "full": "…", "short": "…" }`. Phones (≤720px) show the
  short version; everything else shows the full one. Leave `short` out to use the same text everywhere.
- Lists (`services.items`, `work.items`, `approach.steps`, `about.kit`, `nav`, …) are arrays:
  add, remove or reorder entries and the page follows.
- Type `&` as is. Inline HTML (`<b>`, `<a>`) is allowed. `{{brand}}`, `{{year}}`, `{{linkedinUrl}}`
  and any other key from `site.config.json` can be used inside a text.
- Elements with class `m-hide` in a partial (section intro, hero chips, About toolkit) are hidden on phones to keep mobile short.

### Template syntax (in `src/`)

| Syntax                          | Does                                                        |
| ------------------------------- | ----------------------------------------------------------- |
| `{{> partials/work}}`           | includes `src/partials/work.html`                           |
| `{{hero.title}}` / `{{email}}`  | inserts text from `content.json` / `site.config.json`       |
| `{{#each work.items}}…{{/each}}` | repeats the block per item; inside, `{{title}}` reads the item and `{{.}}` is the item itself |
| `{{> icons/{{icon}}}}`          | include with a name taken from the current item             |

Rules for HTML partials:
- Keep inline text and inline tags (`<span>`, `<b>`, `{{> icons/…}}`) on **one line**.
  The build removes line breaks next to tags, so splitting a sentence around a tag can
  drop a space.

## Carrd compatibility rules

These are what keep the embed working inside Carrd. The build checks the first one.

1. **Every CSS selector starts with `.sx`.** Carrd has its own global styles; scoping keeps
   ours from leaking out and theirs from leaking in. The build fails on an unscoped selector.
2. **In-page links use `data-to="sx-section-id"`, not `href="#id"`.** Carrd hijacks `#hash`
   links for its own section navigation; `smooth-scroll.js` handles `data-to`.
3. **Prefix element IDs with `sx-`** so they can't clash with Carrd's IDs.
4. **No `<html>`, `<head>` or `<body>` in the embed.** It is a fragment that sits inside
   Carrd's page. `dist/preview.html` wraps it only for local preview.
5. **Add new CSS files to `CSS_FILES` in `scripts/build.mjs`.** Order is the cascade order.
6. **Prefix `@keyframes` names with `sx-`.** Keyframe names are global in the page; the build fails otherwise.
7. **Motion must never hide content without JS.** Reveal styles only apply under `.sx.js`, which the
   motion script adds, and everything animated is switched off under `prefers-reduced-motion`.
8. **The header stays a direct child of `.sx`** so `position: sticky` covers the whole page. If a Carrd
   wrapper defeats sticky, the header script falls back to `position: fixed` on its own.

## Git workflow

- `main`: what is live on Carrd.
- Work on a branch per change, e.g. `feature/new-section`, `fix/mobile-nav`.
- Open a PR into `main`, merge, push, wait for Pages, tag `carrd-YYYY-MM-DD`.
- Always commit `dist/` together with the `src/` change that produced it.
