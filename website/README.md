# AnkiGammon Marketing Website

Static website for AnkiGammon, automatically deployed to GitHub Pages on changes to `main` branch.

## Structure

```
website/
├── public/              # Static files (deployed to GitHub Pages)
│   ├── index.html      # Main landing page
│   ├── css/            # Stylesheets
│   ├── js/             # Client-side JavaScript
│   ├── tools/          # Browser-based backgammon tools
│   │   ├── index.html              # Tools landing page
│   │   ├── xg-to-mat.html          # XG to MAT converter
│   │   ├── position-converter.html # Position ID converter & visualizer
│   │   └── met-calculator.html     # Match equity table calculator
│   └── assets/         # Images, fonts, etc.
└── README.md           # This file
```

## Local Development

Preview changes locally before pushing:

```bash
cd website/public/
python -m http.server 8000
# Visit http://localhost:8000
```

Or use any other local server (Node's http-server, PHP's built-in server, VS Code Live Server extension, etc.)

## Deployment

**Automatic** - Changes to `website/` pushed to `main` branch deploy automatically via GitHub Actions (see `.github/workflows/pages.yml`).

No build process needed - it's plain HTML/CSS/JS.
