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
│   ├── favicons.html    # Favicon link tags (uses {{BASE}})
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
│   ├── position-converter.html # Position converter & visualizer
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
