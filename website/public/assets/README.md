# Assets Directory

This directory contains static assets for the AnkiGammon landing page showcasing a GUI desktop application.

## Current Assets

- **icon.svg** - Placeholder site icon (backgammon checker with arrow)

## Assets Needed

To complete the website, add the following files to this directory:

### 1. Main Window Screenshot
**Filename:** `main-window.webp`
**Size:** 1200×800px recommended
**Format:** WebP (or PNG with fallback)
**Description:** Screenshot of AnkiGammon GUI main window showing position list, live board preview, and dark interface

**How to create:**
1. Launch AnkiGammon: `python -m ankigammon`
2. Load XG analysis with multiple positions
3. Take a screenshot showing the full window with positions and preview
4. Convert to WebP:
   ```bash
   convert screenshot.png -quality 85 -resize 1200x800 main-window.webp
   ```

### 2. Hero Card Screenshot
**Filename:** `hero-card.webp`
**Size:** 800×600px recommended
**Format:** WebP (or PNG with fallback)
**Description:** Screenshot of a generated Anki card showing a backgammon position with MCQ options

**How to create:**
1. Generate a card with AnkiGammon using an interesting position
2. Open Anki and review the card
3. Take a screenshot (crop to show just the card content)
4. Convert to WebP:
   ```bash
   convert screenshot.png -quality 85 -resize 800x600 hero-card.webp
   ```

### 3. Demo Video
**Filename:** `demo.mp4`
**Duration:** 15-20 seconds
**Size:** <5MB
**Format:** MP4 (H.264 codec)
**Description:** Complete GUI workflow showing AnkiGammon in action

**How to create:**
1. Use screen recording software (OBS Studio, QuickTime, etc.)
2. Record GUI workflow: Launch app → Load/paste XG text → Preview positions → Select color scheme → Export to Anki
3. Show live board preview and visual progress tracking
4. Convert to MP4:
   ```bash
   ffmpeg -i recording.mkv -vcodec libx264 -crf 28 -preset fast -vf scale=1280:720 demo.mp4
   ```

### 4. Input Dialog Screenshot
**Filename:** `input-dialog.webp`
**Size:** 800×600px recommended
**Format:** WebP
**Description:** Screenshot of smart input dialog with format detection

**How to create:**
1. Launch AnkiGammon and open input dialog
2. Paste XG text to show automatic format detection
3. Take screenshot
4. Convert to WebP

### 5. Export Progress Screenshot
**Filename:** `export-progress.webp`
**Size:** 600×400px recommended
**Format:** WebP
**Description:** Screenshot of export progress dialog showing visual feedback

**How to create:**
1. Trigger export to Anki from AnkiGammon
2. Capture progress dialog mid-export
3. Take screenshot
4. Convert to WebP

### 6. Color Schemes Showcase
**Filename:** `color-schemes.webp`
**Size:** 1200×600px recommended
**Format:** WebP
**Description:** Side-by-side comparison of different board color schemes

**How to create:**
1. Generate same position with 2-3 different color schemes (e.g., classic, ocean, midnight)
2. Arrange screenshots side by side
3. Take screenshot or create composite image
4. Convert to WebP

### 7. Favicon
**Filename:** `favicon.ico`
**Size:** 32×32px (multi-resolution recommended)
**Format:** ICO
**Description:** Browser tab icon

**How to create:**
- Use a favicon generator: https://realfavicongenerator.net/
- Upload `icon.svg` or create custom 32×32 PNG

### 8. Additional Screenshots (Optional)
- `board-example-classic.png` - Board with classic color scheme
- `board-example-ocean.png` - Board with ocean color scheme
- `card-front.png` - Card front showing MCQ
- `card-back.png` - Card back showing analysis table
- `position-management.png` - GUI showing position list management

## Image Optimization

For best performance:

**WebP conversion:**
```bash
cwebp -q 85 input.png -o output.webp
```

**PNG optimization:**
```bash
optipng -o7 image.png
pngquant --quality=65-80 image.png
```

**JPEG optimization:**
```bash
jpegoptim --max=85 --strip-all image.jpg
```

## Usage in HTML

Reference assets from the HTML file:

```html
<!-- Image -->
<img src="assets/hero-card.webp" alt="Anki card with backgammon board" loading="lazy">

<!-- Video -->
<video autoplay loop muted playsinline loading="lazy">
    <source src="assets/demo.mp4" type="video/mp4">
</video>

<!-- Favicon (in <head>) -->
<link rel="icon" type="image/x-icon" href="assets/favicon.ico">

<!-- SVG Icon -->
<img src="assets/icon.svg" alt="AnkiGammon icon" width="64" height="64">
```

## File Size Guidelines

Target sizes for optimal page load performance:

| Asset Type | Target Size | Max Size |
|------------|------------|----------|
| Hero image (WebP) | 50-150 KB | 300 KB |
| Screenshot (PNG) | 100-200 KB | 500 KB |
| Demo video (MP4) | 2-3 MB | 5 MB |
| Favicon (ICO) | 5-10 KB | 50 KB |
| Icon (SVG) | 1-5 KB | 20 KB |

## Directory Structure

```
assets/
├── README.md              # This file
├── icon.svg              # ✅ Placeholder site icon
├── favicon.ico           # ❌ TODO: Add browser favicon
├── main-window.webp      # ❌ TODO: Add GUI main window screenshot
├── hero-card.webp        # ❌ TODO: Add Anki card screenshot
├── demo.mp4              # ❌ TODO: Add GUI demo video
├── input-dialog.webp     # ❌ TODO: Add input dialog screenshot
├── export-progress.webp  # ❌ TODO: Add export progress screenshot
├── color-schemes.webp    # ❌ TODO: Add color schemes showcase
└── (additional images)   # Optional: feature screenshots
```

---

**Note:** The website is fully functional without these assets (placeholders are shown). Add them to showcase the GUI desktop application and improve conversion rates.
