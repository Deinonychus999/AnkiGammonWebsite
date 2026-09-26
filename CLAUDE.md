# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is the **marketing website** for AnkiGammon (https://ankigammon.com), a desktop application that converts backgammon game analysis into Anki flashcards for spaced repetition learning. This repository contains **only the static website**, not the application code.

- **Technology**: Pure HTML/CSS/JavaScript with a Python build script for shared partials
- **Deployment**: Automatic via GitHub Actions to GitHub Pages on push to `main`
- **Live URL**: https://ankigammon.com/

## Local Development

To preview changes locally:

```bash
python website/build.py
python website/serve.py
# Visit http://localhost:8765
```

`serve.py` serves `website/build/` the way GitHub Pages does, so extensionless tool URLs like `/tools/xg-to-mat` resolve to `xg-to-mat.html`. It serves from outside `build/`, so rebuilding while it runs works.

The build script assembles HTML pages from shared partials in `website/_partials/`. Always run `build.py` after editing HTML source files or partials.

## Architecture

### File Structure

```
website/
├── build.py             # Assembles HTML from shared partials
├── _partials/           # Shared HTML fragments (nav, footer, etc.)
│   ├── nav.html         # Navigation bar (uses {{BASE}}, {{TOOLS_HREF}}, {{TOOLS_ACTIVE}})
│   ├── footer.html      # Footer with social links
│   ├── favicons.html    # Favicon link tags (uses {{BASE}}); the icon files are rendered from the app repo's icon.svg by its scripts/generate_icons.py --website
│   ├── css.html         # CSS stylesheet links (uses {{BASE}})
│   ├── kofi.html        # Ko-fi donation widget
│   └── icons/           # Lucide SVG icons (one file per icon, fetched from lucide-static)
├── build/               # Generated output (gitignored) — deploy target
└── public/              # Source HTML + static assets
    ├── index.html       # Single-page marketing site (source with partial markers)
    ├── css/             # Modular stylesheets (7 files)
│   ├── reset.css        # Browser normalization
│   ├── variables.css    # Design system (colors, spacing, fonts)
│   ├── base.css         # Typography foundations
│   ├── layout.css       # Container/grid utilities
│   ├── components.css   # 14 UI components
│   ├── responsive.css   # Mobile breakpoints (768px, 480px)
│   └── tool.css         # Styles for tool pages
├── js/                  # Modular JavaScript (14 files)
│   ├── main.js          # Initialization entry point
│   ├── carousel.js      # Embla carousel integration
│   ├── navigation.js    # Smooth scrolling, sticky nav
│   ├── platform.js      # OS detection & install tabs
│   ├── faq.js           # FAQ accordion
│   ├── lightbox.js      # Image zoom modal
│   ├── xg-parser.js     # XG binary file parser
│   ├── mat-writer.js    # MAT format writer
│   ├── xg-to-mat-app.js # XG to MAT converter UI
│   ├── board-renderer.js        # SVG backgammon board renderer (7 color schemes)
│   ├── board-image-exporter.js  # Shared SVG-to-PNG download/clipboard helper
│   ├── position-parser.js       # Position ID parser (XGID/GNUID/OGID)
│   ├── position-converter-app.js # Position converter UI
│   ├── position-editor.js       # XG-style position edit operations (checkers, cube, dice, match)
│   ├── met-data.js              # Kazaross XG2 match equity table data
│   └── met-calculator-app.js    # MET calculator UI
├── tools/               # Tool pages
│   ├── index.html              # Tools landing page
│   ├── xg-to-mat.html          # XG to MAT converter tool
│   ├── position-editor.html    # Position editor & converter (old /position-converter URL redirects here)
│   └── met-calculator.html     # Match equity table calculator
    └── assets/
        └── images/      # WebP screenshots (13 files)
```

### Community decks (build-time data)

`build.py` fetches the published deck catalog from the decks API (`DECKS_API` in `build.py`, a Cloudflare Worker whose source lives in `worker/`) and:

- prerenders the deck rows into `decks/index.html` at the `<!-- CATALOG:rows -->`, `<!-- CATALOG:data -->`, and `<!-- CATALOG:jsonld -->` markers, so crawlers see the list without JavaScript (the page hydrates from the embedded JSON, then refreshes from the API);
- generates one static page per deck at `decks/<id>/index.html` from `_templates/deck.html`;
- appends a sitemap entry per deck.

A build without network access still succeeds, just with no deck data. Set `DECKS_CATALOG_FILE=path/to/catalog.json` to build from a local file instead (previews, tests); such builds are marked frozen and skip the live refresh. The Pages workflow also runs on a daily schedule so newly approved decks get their pages without a push. `decks/review.html` is the moderation page: `noindex` and disallowed in `robots.txt`. Download counts and thumbs votes live in a D1 database bound to the Worker as `DB` (`worker/schema.sql`); `/catalog` merges them into each deck as `stats`, the list and deck pages prerender them, and `decks-app.js` refreshes them and handles voting on deck pages.

HTML source files in `public/` use `<!-- PARTIAL:name -->` comment markers that the build script replaces with the contents of `_partials/name.html`. Template variables like `{{BASE}}` are resolved per-page based on directory depth (empty for root, `../` for `tools/`).

Icons use `<!-- ICON:name -->` markers, expanded after partials. The build reads `_partials/icons/<name>.svg` (canonical Lucide SVGs from `lucide-static@1.14.0`), strips the license comment, and rewrites the root `<svg>` opening tag to `<svg class="icon icon-xl" xmlns="..." viewBox="0 0 24 24">` so styling is governed entirely by the `.icon` and `.icon-xl` CSS rules. Unknown icon names fail the build loudly. **Do not hand-write SVG paths**: to add an icon, fetch it from `https://unpkg.com/lucide-static@1.14.0/icons/<name>.svg` and drop it into `_partials/icons/`.

### Design System

All design tokens are centralized in [variables.css](website/public/css/variables.css):

- **Colors**: Dark theme (`--bg-primary: #121212`, `--accent-primary: #5b9dd9`)
- **Spacing**: 7-step scale (`--space-xs` through `--space-3xl`)
- **Typography**: System font stack (Inter, -apple-system fallbacks)

When making style changes, **always use CSS custom properties** from `variables.css` instead of hardcoding values.

### JavaScript Architecture

- **Pattern**: IIFE modules that expose functions to `window` object
- **Initialization**: All modules initialize on `DOMContentLoaded` in [main.js](website/public/js/main.js:1)
- **Dependencies**: Only Embla Carousel (v8.3.0) loaded from CDN

Each JS file is self-contained and handles one feature. When adding new interactive features, follow the existing IIFE pattern for consistency.

### Major Components

1. **Hero Section** - CTA buttons with platform-specific download links
2. **Embla Carousel** - 9-slide screenshot gallery with lightbox zoom
3. **Platform Switcher** - Auto-detects OS (Windows/macOS/Linux) and shows appropriate install instructions
4. **FAQ Accordion** - 9 collapsible Q&A items with Schema.org structured data

### Tools Section

Browser-based backgammon utilities at [/tools/](website/public/tools/). Each tool runs entirely client-side with no server uploads.

- **XG to MAT Converter** - Parses XG binary match files and converts to .mat text format via drag-and-drop
- **Position Editor & Converter** - Accepts XGID, GNUID, OGID, and eXtreme Gammon .xgp position files with interactive SVG board visualization, an eXtreme Gammon-style on-board position editor, and PNG export
- **Match Equity Table Calculator** - Looks up match winning chances (MWC) at any score using the Kazaross XG2 table, with interactive color-coded 25x25 grid and equity swing calculator

Tool pages share the site's core CSS and add [tool.css](website/public/css/tool.css) for tool-specific styles. Each tool has a parser module and an app/UI module in `js/`.

### Browser app (`/app/`)

A limited AnkiGammon in the browser, linked from the homepage hero next to the desktop download (deliberately not under Tools). It runs the real `ankigammon` Python package under Pyodide, so cards are identical to the desktop app's; there is no analysis engine, so it only accepts analyzed XG input (.xg, .xgp, XG text export). Cards leave as an .apkg download or through Send to Anki.

- [app/index.html](website/public/app/index.html) + [js/app.js](website/public/js/app.js) (UI, IIFE) + [js/app-worker.js](website/public/js/app-worker.js) (module worker; Pyodide 314 requires one) + [css/app.css](website/public/css/app.css). `app/sample-match.xg` is `tests/data/sample_match.xg` from the app repo.
- The page is an in-place app shell that fills the window below the sticky nav (`--app-nav` is measured by `app.js`): an app bar (Open/Paste, status, deck chip, Card options, Study in the trainer, Send to Anki, Download), a sidebar (filter + position list), and a stage (startup progress and empty state, or the Anki-style card preview). Card options, Paste and the Send-to-Anki help are `<dialog>`s. The guide and FAQ stay below the shell for search engines. Under 900px it stacks and scrolls with the page.
- `css/app.css` is also loaded by the trainer page, which relies on `.app-status`, `.app-field`, `.app-check` and `.app-link-btn`; keep those rules when changing the app.
- `build.py` versions the app page's local scripts and stylesheets and writes a content-hashed worker URL into `data-worker` (`{{APP_WORKER}}`), so a deploy never pairs the page with an older `app.js` or worker.
- The worker only calls `ankigammon.web` (app repo `ankigammon/web.py`); change both sides together.
- `build.py` downloads the wheels into `build/app/wheels/`, verifies PyPI's sha256, and writes their names into the page's `data-wheels` attribute. ankigammon is the latest PyPI release that contains `ankigammon/web.py` (older ones leave the page showing "not available"); genanki and its pure-Python deps are pinned in `APP_WHEEL_PINS`. Pyodide itself loads from cdn.jsdelivr.net.
- `APP_MIN_ANKIGAMMON` in `build.py` is the oldest release the page's JavaScript works with. Raise it in the same commit that makes `app.js`/`app-worker.js` call new `ankigammon.web` API, and release the app first. If PyPI still reports an older version (it lags a few minutes after a release), the build retries for up to 5 minutes, then fails instead of deploying a mismatched page.
- `build.py` also strips `ankigammon/gui/` and `ankigammon/utils/xg_auto/` (desktop icons and XG automation, about 600 KB) from the served wheel and rewrites its `RECORD`. The app repo's `test_browser_path_never_imports_desktop_only_modules` keeps that safe.
- **Send to Anki** runs the desktop's own `AnkiConnect` client inside the worker (`ankigammon.web.send_to_anki`), with its transport swapped for a synchronous `XMLHttpRequest` whose plain-text body keeps it a CORS simple request. Before that, `app.js` sends `requestPermission` from the page's main thread: that call opens Anki's permission dialog and, on the live https site, Chrome/Firefox's local-network prompt. Safari and iOS block https→localhost, so the help panel points them to the download. The AnkiConnect address and optional API key live under "Anki connection settings" (the address is remembered, the key isn't).
- Preview a local, unreleased app build: `pip wheel ../xg2anki --no-deps -w /tmp/w` then `ANKIGAMMON_WHEEL=/tmp/w/ankigammon-<ver>-py3-none-any.whl python website/build.py`.
- The card preview iframe mimics Anki 25.9's reviewer (theme variables, night-mode classes, `pycmd('ans')`); card CSS depends on those.
- `serve.py`'s default port 8765 is AnkiConnect's; pass another port when Anki is running.

### Trainer (`/train/`)

A spaced-repetition trainer that needs neither Anki nor Pyodide: it quizzes positions straight from their analysis data and draws its own screens, so it is not tied to the Anki card HTML. Installable as an app (PWA) and works offline.

- [train/index.html](website/public/train/index.html) + [js/train-app.js](website/public/js/train-app.js) (UI) + [js/train-deck.js](website/public/js/train-deck.js) (pack import, questions, grading; no DOM, loads in Node for quick checks) + [js/train-store.js](website/public/js/train-store.js) (IndexedDB) + [css/train.css](website/public/css/train.css). Boards come from `board-renderer.js` and `position-parser.js`.
- Input is the `ankigammon-position-pack` (see `worker/README.md`): each position's XGID plus the Decision JSON from the app repo's `ankigammon/anki/decision_serialize.py`. Community decks load from the API's `pack.json`; an `.apkg` goes through `apkg-reader.js` (`buildPack`), which needs the `AnalysisData` field (AnkiGammon 1.3.0+). Questions and grading mirror the Anki card: the first 5 checker plays shuffled, or the 5 cube actions in order; a checker play within 0.020 of the best is "close".
- Layout is the web app's app shell from `css/app.css` (`.app-shell`, `.app-bar`, `.app-side` deck list, `.app-stage`, `.app-empty`, `.app-dialog` for Add a deck and Settings), so the two feel like one product; `train.css` only adds trainer rules keyed on the shell's `data-view` (`empty`, `home`, `study`, `done`). `app.css` belongs to the web app: change shared rules there in step with `app/`.
- Scheduling is FSRS via the vendored [js/vendor/ts-fsrs.umd.js](website/public/js/vendor/ts-fsrs.umd.js) (ts-fsrs 5.4.2, MIT, global `FSRS`). Best play suggests Good, close suggests Hard, anything else Again; the player can change the grade before moving on.
- Storage (IndexedDB `ankigammon-trainer`): `decks`, `items` (id = `<deckId>|<xgid>`), `progress` (FSRS card + review log per item), `meta` (settings, new-positions-per-day counter), `inbox`. Deck ids: `deck:<catalog id>` for community decks, `app:<name>` from the web app, `file:<slug>` for files. Community decks replace their items on update; app and file decks merge, so decks sent under one name add up. Removing items never removes progress.
- Entry points: `/train/#deck=<id>` (the "Practice in the browser" button in `_templates/deck.html`) and `/train/#inbox` ("Study in the trainer" in the web app, which hands over a study pack from `ankigammon.web.export_pack` through the `inbox` store). The desktop app's File → Export to Trainer writes the same pack to a `.json` file (app repo `ankigammon/study_pack.py`).
- `/train/#desktop=<port>.<key>`: the desktop app's Study in Trainer serves one pack, once, at `http://127.0.0.1:<port>/pack/<key>` for about two minutes; the trainer fetches it (Chrome and Edge ask about local-network access; Safari can't) and falls back to pointing at File → Export to Trainer.
- Drills (Blunder Streak, and a 3-minute Storm with a 10-second penalty per miss) quiz random positions from a deck without touching FSRS progress; a checker play within 0.020 counts as right, as in review grading. Personal bests live in `meta` under `bests`.
- Backups (`ankigammon-trainer-backup` JSON) carry decks, items, progress and settings; restoring keeps whichever progress has more reviews.
- [train/sw.js](website/public/train/sw.js) serves the trainer's own page, CSS, JS and icons network-first (revalidated, falling back to the cache offline or after 4 s), so the trainer is never older than the web app page that hands it decks: a cache-first trainer once received a handoff format it didn't know. The unpkg/cdnjs libraries the `.apkg` importer loads have versioned URLs and are served cache-first. Deck API requests are not cached. Bump `CACHE` when changing `sw.js` so old caches are dropped, and keep its `SHELL` list in step with the files `train/index.html` loads: a missing file makes the install fail. The `#inbox` handoff is cleared only after it imports, so an entry an out-of-date trainer can't read survives a reload.
- The decks API only allows `https://ankigammon.com` and `http://localhost:8765` (`ALLOWED_ORIGINS` in `worker/wrangler.jsonc`), so community decks don't load when previewing on another port.

### SEO & Structured Data

The site includes extensive SEO optimization in [index.html](website/public/index.html:1-100):

- Open Graph meta tags for social sharing
- Twitter Card metadata
- **5 Schema.org JSON-LD blocks**: SoftwareApplication, FAQPage, Organization, WebSite, HowTo
- Sitemap.xml with 5 URLs

When editing content, **maintain the structured data** to preserve search rankings.

## Deployment

**Automatic deployment** triggers when changes to `website/**` are pushed to `main`:

1. GitHub Actions workflow (`.github/workflows/pages.yml`) runs `python website/build.py`
2. Validates build output exists
3. Uploads `website/build/` directory as artifact and deploys to GitHub Pages

**No manual deployment needed.** Just push to `main` and wait ~2 minutes.

## Application Context (What This Site Markets)

AnkiGammon is a desktop Python application that:

- Converts backgammon position analysis to Anki flashcards
- Supports drag-and-drop `.xg` files with auto-blunder filtering
- Accepts position IDs (XGID/OGID/GNUID) and auto-generates GnuBG analysis
- Features score matrices, 7 color schemes, dual analysis engines (GnuBG cross-platform, XG Windows-only experimental), drag-and-drop deck tree with AnkiConnect sync, interactive move visualization
- Exports via AnkiConnect API or APKG files
- **Installation methods**:
  - Windows: Pre-built `.exe` (no Python required)
  - macOS/Linux: `pip install ankigammon` (PyPI)

This context is important when updating copy, screenshots, or install instructions.

## Important Files

- **Main HTML**: [website/public/index.html](website/public/index.html)
- **Tools index**: [website/public/tools/index.html](website/public/tools/index.html)
- **Shared partials**: [website/_partials/](website/_partials/) (nav, footer, favicons, css, kofi)
- **Build script**: [website/build.py](website/build.py)
- **Design tokens**: [website/public/css/variables.css](website/public/css/variables.css)
- **Components**: [website/public/css/components.css](website/public/css/components.css)
- **Tool styles**: [website/public/css/tool.css](website/public/css/tool.css)
- **Deployment**: [.github/workflows/pages.yml](.github/workflows/pages.yml)

## Common Tasks

### Adding a New Screenshot

1. Create WebP image (target <200KB): `cwebp -q 80 input.png -o output.webp`
2. Place in `website/public/assets/images/`
3. Add to carousel in `index.html` (search for "embla__slide")
4. Update carousel initialization if slide count changes

### Modifying Install Instructions

Platform-specific install tabs are in `index.html` under `id="install"`. The [platform.js](website/public/js/platform.js) module auto-detects OS and activates the correct tab.

### Updating FAQ

1. Edit HTML in `index.html` under `id="faq"`
2. **Also update** the Schema.org FAQPage JSON-LD structured data in `<head>` to match

### Adding a New Tool

1. Create a parser module in `js/` (e.g., `js/my-parser.js`) following the IIFE pattern
2. Create an app/UI module in `js/` (e.g., `js/my-tool-app.js`)
3. Create the tool page in `tools/` (e.g., `tools/my-tool.html`) — use `<!-- PARTIAL:favicons -->`, `<!-- PARTIAL:css -->`, `<!-- PARTIAL:nav -->`, `<!-- PARTIAL:footer -->`, and `<!-- PARTIAL:kofi -->` markers instead of duplicating shared blocks
4. Add a card linking to it in [tools/index.html](website/public/tools/index.html)
5. Update the Schema.org `hasPart` array in `tools/index.html` `<head>`

### Modifying Navigation or Footer

Edit the shared partial in `website/_partials/` (e.g., `nav.html` or `footer.html`). Changes apply to all pages after running `python website/build.py`.

### Adding or Replacing an Icon

1. Find the icon on https://lucide.dev (note the canonical name, e.g. `cpu`, `circle-play`, `folder-tree`).
2. Fetch the canonical SVG: `curl -sL https://unpkg.com/lucide-static@1.14.0/icons/<name>.svg -o website/_partials/icons/<name>.svg`. Do not hand-write the path data.
3. Reference it in HTML with `<!-- ICON:<name> -->`. The build normalizes attributes; styling comes from `.icon` + size class (currently always `.icon-xl`).

### Changing Colors/Spacing

Edit [variables.css](website/public/css/variables.css). Changes propagate automatically to all components using custom properties.
