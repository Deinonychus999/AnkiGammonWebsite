# AnkiGammon Landing Page

This directory contains the promotional website for AnkiGammon, designed to be hosted on GitLab Pages.

## Overview

A single-page static website showcasing a **GUI desktop application** (AnkiGammon) with:
- **Dark theme design** - Sober, professional color palette
- **Developer-focused UX** - Clear, authentic messaging without marketing fluff
- **Performance optimized** - Inline CSS/JS, minimal dependencies, <1s load time
- **Fully responsive** - Works on desktop, tablet, and mobile devices
- **Automatic deployment** - GitLab CI/CD pipeline deploys on push to main

## File Structure

```
website/
├── .gitlab-ci.yml          # GitLab Pages deployment config
├── README.md               # This file
└── public/                 # Deployment directory (served by GitLab Pages)
    ├── index.html          # Main page (with inline CSS/JS)
    └── assets/             # Static assets
        ├── favicon.ico     # Browser tab icon
        ├── icon.svg        # Site icon/logo
        ├── hero-card.webp  # Hero section screenshot (to be added)
        └── demo.mp4        # Demo video (to be added)
```

## Deployment to GitLab Pages

### Prerequisites

1. GitLab repository with the website code
2. GitLab Runner enabled (automatic on gitlab.com)

### Setup Instructions

#### Option 1: Separate Repository (Recommended)

Create a dedicated repository for the website:

```bash
# Create new GitLab repository named 'ankigammon-website'
cd website/
git init
git add .
git commit -m "Initial commit: AnkiGammon landing page"
git remote add origin https://gitlab.com/yourusername/ankigammon-website.git
git push -u origin main
```

The site will be available at: `https://yourusername.gitlab.io/ankigammon-website`

#### Option 2: Same Repository, Separate Branch

Keep the website in the main ankigammon repository:

```bash
# From the root of ankigammon repository
git add website/
git commit -m "Add promotional website"
git push origin main
```

Configure GitLab Pages:
1. Go to **Settings > Pages** in your GitLab project
2. Ensure the CI/CD pipeline runs successfully
3. The site will be available at: `https://yourusername.gitlab.io/ankigammon`

### Deployment Process

Deployment is **fully automatic**:

1. Push changes to the `main` branch
2. GitLab CI/CD pipeline runs (defined in `.gitlab-ci.yml`)
3. Validation job checks that required files exist
4. Deployment job publishes the `public/` directory
5. Site is live within ~1-2 minutes

Monitor deployment: **CI/CD > Pipelines** in your GitLab project

### Custom Domain

To use a custom domain (e.g., `ankigammon.com`):

1. **In GitLab:**
   - Go to **Settings > Pages**
   - Click **New Domain**
   - Enter your domain name
   - Note the verification TXT record and A record values

2. **At your DNS provider:**
   - Add TXT record for verification:
     ```
     _gitlab-pages-verification-code.ankigammon.com TXT "gitlab-pages-verification-code=..."
     ```
   - Add A record pointing to GitLab Pages:
     ```
     ankigammon.com A 35.185.44.232
     ```
   - Or add CNAME record:
     ```
     www.ankigammon.com CNAME yourusername.gitlab.io
     ```

3. **Back in GitLab:**
   - Click **Verify** to confirm DNS setup
   - Enable **Force HTTPS** (recommended)

SSL certificate is automatically provisioned via Let's Encrypt.

## Updating Content

### Quick Edits

For simple text changes, edit [public/index.html](public/index.html) directly:

```bash
cd website/public/
# Edit index.html
git commit -am "Update hero headline"
git push
```

Changes deploy automatically within 1-2 minutes.

### Adding Images/Assets

1. Add files to `public/assets/`:
   ```bash
   cp /path/to/screenshot.png public/assets/hero-card.webp
   ```

2. Reference in HTML:
   ```html
   <img src="assets/hero-card.webp" alt="Description" loading="lazy">
   ```

3. Commit and push:
   ```bash
   git add public/assets/
   git commit -m "Add hero screenshot"
   git push
   ```

### Adding a Demo Video

1. Convert recording to MP4/WebM:
   ```bash
   ffmpeg -i demo.gif -vcodec libx264 -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" public/assets/demo.mp4
   ```

2. Update HTML in [public/index.html](public/index.html):
   ```html
   <video autoplay loop muted playsinline loading="lazy">
       <source src="assets/demo.mp4" type="video/mp4">
       Your browser does not support video playback.
   </video>
   ```

3. Replace the demo placeholder section

### Updating GitLab/GitHub Links

Find and replace `https://gitlab.com/yourusername/ankigammon` with your actual repository URL in:
- Navigation links
- Footer links
- Installation section
- Download buttons

### Color Scheme Customization

Edit CSS variables in the `<style>` section of [public/index.html](public/index.html):

```css
:root {
    --bg-primary: #121212;        /* Main background */
    --bg-secondary: #1a1f2c;      /* Section backgrounds */
    --accent-primary: #5b9dd9;    /* Links, buttons, highlights */
    --text-primary: #e8e6e3;      /* Main text */
    /* ... see full list in index.html ... */
}
```

## Assets Needed

To complete the website, add these assets to `public/assets/`:

### Required:
- [ ] **main-window.webp** - Screenshot of AnkiGammon GUI main window (1200×800px recommended)
  - Should show position list, live preview, and modern dark UI
  - Save as WebP format for best compression

- [ ] **hero-card.webp** - Screenshot of a generated Anki card (800×600px recommended)
  - Should show a beautiful backgammon board with MCQ
  - Save as WebP format for best compression

### Recommended:
- [ ] **demo.mp4** - 15-20 second demo video showing GUI workflow
  - Capture: Open AnkiGammon → Load/paste XG analysis → Preview positions → Export to Anki
  - Show live board preview and visual progress tracking
  - Convert to MP4 with H.264 codec
  - Keep file size under 5MB

- [ ] **input-dialog.webp** - Screenshot of smart input dialog with format detection
- [ ] **export-progress.webp** - Screenshot of export progress dialog
- [ ] **color-schemes.webp** - Screenshot showing different color scheme options

- [ ] **favicon.ico** - 32×32 icon for browser tab
  - Can be generated from a PNG using: https://realfavicongenerator.net/

- [ ] **icon.svg** - Site logo/icon (scalable vector)
  - Simple icon representing backgammon or flashcards

### Creating Screenshots

**GUI Application Screenshots:**
```bash
# Launch AnkiGammon GUI
python -m ankigammon

# Take screenshots (Windows: Win+Shift+S, macOS: Cmd+Shift+4):
# 1. Main window with positions loaded
# 2. Input dialog with XG text
# 3. Export progress dialog
# 4. Different color scheme previews

# Convert to WebP
convert screenshot.png -quality 85 -resize 1200x800 public/assets/main-window.webp
```

**Anki Card Screenshot:**
```bash
# Generate cards with AnkiGammon GUI
# Open Anki, review a card
# Take screenshot (Windows: Win+Shift+S, macOS: Cmd+Shift+4)
# Crop to show just the card content

# Convert to WebP
convert screenshot.png -quality 85 -resize 800x600 public/assets/hero-card.webp
```

**Demo Video:**
Use [OBS Studio](https://obsproject.com/) or [SimpleScreenRecorder](https://github.com/MaartenBaert/ssr) to capture screen:
1. Launch AnkiGammon GUI
2. Start recording
3. Load XG analysis file or paste text
4. Show live board preview
5. Browse positions, select color scheme
6. Export to Anki with progress dialog
7. Switch to Anki showing new cards
8. Stop recording
9. Convert to MP4:
   ```bash
   ffmpeg -i recording.mkv -vcodec libx264 -crf 28 -preset fast -vf scale=1280:720 public/assets/demo.mp4
   ```

## Performance Optimization

Current optimizations:
- ✅ Inline CSS (no external stylesheet)
- ✅ Inline JavaScript (no external scripts)
- ✅ Semantic HTML5
- ✅ Lazy loading for below-fold images
- ✅ Smooth scroll with CSS `scroll-behavior`
- ✅ Responsive design with mobile-first approach

### Target Metrics:
- **Load time:** <1 second
- **Total page size:** <100KB (excluding images/video)
- **Lighthouse score:** 90+ (Performance, Accessibility, Best Practices, SEO)

### Testing Performance:
```bash
# Use Lighthouse in Chrome DevTools
# Or run from command line:
lighthouse https://yourusername.gitlab.io/ankigammon --view
```

## Browser Compatibility

Tested and working on:
- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Mobile browsers (iOS Safari, Chrome Android)

Uses modern CSS features:
- CSS Grid
- CSS Variables (custom properties)
- Flexbox
- `backdrop-filter` (navigation blur)

Fallbacks provided where necessary.

## Local Development

To preview the site locally:

### Option 1: Python HTTP Server
```bash
cd website/public/
python -m http.server 8000
# Open http://localhost:8000 in browser
```

### Option 2: Node.js HTTP Server
```bash
cd website/public/
npx http-server -p 8000
# Open http://localhost:8000 in browser
```

### Option 3: PHP Built-in Server
```bash
cd website/public/
php -S localhost:8000
# Open http://localhost:8000 in browser
```

### Option 4: Live Server (VS Code Extension)
1. Install "Live Server" extension in VS Code
2. Right-click [public/index.html](public/index.html)
3. Select "Open with Live Server"

## Customization Guide

### Updating Headlines

Main headline (hero section):
```html
<h1>Turn Your XG Analysis Into Anki Flashcards Instantly</h1>
```

Subheadline:
```html
<p class="hero-subtitle">
    XG shows you the best move. AnkiGammon helps you remember it forever.<br>
    Automatically generate flashcards from eXtreme Gammon analysis—no manual work required.
</p>
```

### Adding Features

To add a new feature card to the grid:

```html
<div class="feature-card">
    <div class="feature-icon">🎯</div>
    <h3>Feature Title</h3>
    <p>Feature description goes here. Keep it concise and benefit-focused.</p>
</div>
```

Icons can be:
- Emoji (🎯 ⚡ 🎨 📊)
- Unicode symbols (✓ → ✕)
- Or replace with `<img>` or `<svg>` for custom icons

### Editing FAQ

To add a new FAQ item:

```html
<div class="faq-item">
    <div class="faq-question" onclick="toggleFaq(this)">
        <h3>Your question here?</h3>
        <span class="faq-toggle">▼</span>
    </div>
    <div class="faq-answer">
        <div class="faq-answer-content">
            <p>Your answer here. Can include HTML formatting.</p>
        </div>
    </div>
</div>
```

## SEO Optimization

Current SEO features:
- ✅ Semantic HTML5 structure
- ✅ Meta description
- ✅ Meta keywords
- ✅ Descriptive page title
- ✅ Heading hierarchy (H1 → H2 → H3)
- ✅ Alt text for images (when added)

### Adding Open Graph Tags

For better social media sharing, add to `<head>`:

```html
<meta property="og:title" content="AnkiGammon - Turn XG Analysis Into Anki Flashcards">
<meta property="og:description" content="Automatically convert eXtreme Gammon backgammon analysis into Anki flashcards with beautiful board images and MCQs.">
<meta property="og:image" content="https://yourusername.gitlab.io/ankigammon/assets/hero-card.webp">
<meta property="og:url" content="https://yourusername.gitlab.io/ankigammon">
<meta name="twitter:card" content="summary_large_image">
```

## Troubleshooting

### Pipeline fails with "pages" job error
- Ensure `.gitlab-ci.yml` is in the repository root
- Check that `public/` directory exists and contains `index.html`
- View detailed logs in **CI/CD > Pipelines > Failed job**

### Site shows 404 after deployment
- Wait 1-2 minutes for pages to fully deploy
- Check **Settings > Pages** shows "Your pages are served under: ..."
- Ensure you're visiting the correct URL

### Changes not appearing
- Hard refresh browser: Ctrl+Shift+R (Windows) or Cmd+Shift+R (macOS)
- Check pipeline completed successfully
- Clear browser cache

### CSS/JavaScript not working
- View browser console (F12) for errors
- Ensure all JavaScript is properly closed with `</script>`
- Validate HTML at https://validator.w3.org/

## Contributing

To suggest improvements to the website:

1. Create a new branch:
   ```bash
   git checkout -b feature/improve-hero-section
   ```

2. Make changes to `public/index.html`

3. Test locally with a web server

4. Commit and push:
   ```bash
   git commit -am "Improve hero section clarity"
   git push -u origin feature/improve-hero-section
   ```

5. Create a Merge Request in GitLab

## License

Same license as the main AnkiGammon project (MIT License).

## Credits

- Design inspiration: Modern developer tool landing pages (Tailwind, Vite, etc.)
- Dark theme palette: Material Design dark theme guidelines
- Typography: Inter font family (loaded from system or CDN)
- Icons: Unicode emoji (no external dependencies)

---

**Need help?** Open an issue in the main AnkiGammon repository.
