# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is the **marketing website** for AnkiGammon (https://ankigammon.com), a desktop application that converts backgammon game analysis into Anki flashcards for spaced repetition learning. This repository contains **only the static website**, not the application code.

- **Technology**: Pure HTML/CSS/JavaScript (no build process, no frameworks)
- **Deployment**: Automatic via GitHub Actions to GitHub Pages on push to `main`
- **Live URL**: https://ankigammon.com/

## Local Development

To preview changes locally:

```bash
cd website/public/
python -m http.server 8000
# Visit http://localhost:8000
```

Alternative: Use any static server (VS Code Live Server extension, Node's `http-server`, etc.)

**No build process exists** - files are served directly as-written.

## Architecture

### File Structure

```
website/public/
├── index.html           # Single-page marketing site
├── css/                 # Modular stylesheets (6 files)
│   ├── reset.css        # Browser normalization
│   ├── variables.css    # Design system (colors, spacing, fonts)
│   ├── base.css         # Typography foundations
│   ├── layout.css       # Container/grid utilities
│   ├── components.css   # 14 UI components
│   └── responsive.css   # Mobile breakpoints (768px, 480px)
├── js/                  # Modular JavaScript (6 files)
│   ├── main.js          # Initialization entry point
│   ├── carousel.js      # Embla carousel integration
│   ├── navigation.js    # Smooth scrolling, sticky nav
│   ├── platform.js      # OS detection & install tabs
│   ├── faq.js           # FAQ accordion
│   └── lightbox.js      # Image zoom modal
└── assets/
    └── images/          # WebP screenshots (13 files)
```

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

### SEO & Structured Data

The site includes extensive SEO optimization in [index.html](website/public/index.html:1-100):

- Open Graph meta tags for social sharing
- Twitter Card metadata
- **6 Schema.org JSON-LD blocks**: SoftwareApplication, FAQPage, BreadcrumbList, Organization, WebSite, HowTo
- Sitemap.xml with 5 URLs

When editing content, **maintain the structured data** to preserve search rankings.

## Deployment

**Automatic deployment** triggers when changes to `website/**` are pushed to `main`:

1. GitHub Actions workflow (`.github/workflows/pages.yml`) validates HTML structure
2. Uploads `website/public/` directory as artifact
3. Deploys to GitHub Pages

**No manual deployment needed.** Just push to `main` and wait ~2 minutes.

## Application Context (What This Site Markets)

AnkiGammon is a desktop Python application that:

- Converts backgammon position analysis to Anki flashcards
- Supports drag-and-drop `.xg` files with auto-blunder filtering
- Accepts position IDs (XGID/OGID/GNUID) and auto-generates GnuBG analysis
- Features score matrices, 6 color schemes, interactive move visualization
- Exports via AnkiConnect API or APKG files
- **Installation methods**:
  - Windows: Pre-built `.exe` (no Python required)
  - macOS/Linux: `pip install ankigammon` (PyPI)

This context is important when updating copy, screenshots, or install instructions.

## Important Files

- **Main HTML**: [website/public/index.html](website/public/index.html)
- **Design tokens**: [website/public/css/variables.css](website/public/css/variables.css)
- **Components**: [website/public/css/components.css](website/public/css/components.css)
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

### Changing Colors/Spacing

Edit [variables.css](website/public/css/variables.css). Changes propagate automatically to all components using custom properties.
