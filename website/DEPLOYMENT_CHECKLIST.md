# AnkiGammon Website - Deployment Checklist

Use this checklist to prepare and deploy the AnkiGammon landing page to GitHub Pages.

## Pre-Deployment Checklist

### 1. Customize Content

- [x] **Update GitHub username** in all links: ✓ Already configured
  - Repository: https://github.com/Deinonychus999/AnkiGammon
  - All links have been updated to use the correct GitHub repository

- [ ] **Review and customize messaging:**
  - Hero headline (line ~531)
  - Hero subtitle (lines ~532-534)
  - Feature descriptions (lines ~573-609)
  - FAQ answers (lines ~749-838)

- [ ] **Add contact/support information** (optional):
  - Email address for questions
  - Link to Discord/Slack community
  - Social media links

### 2. Add Visual Assets

**Priority: High**
- [ ] **Main window screenshot** (`public/assets/main-window.webp`):
  - Launch AnkiGammon GUI application
  - Load positions to show position list and live preview
  - Take screenshot of main window (1200×800px recommended)
  - Save as WebP format
  - Place in `public/assets/`

- [ ] **Hero screenshot** (`public/assets/hero-card.webp`):
  - Generate an Anki card with AnkiGammon
  - Take screenshot of the card (800×600px recommended)
  - Save as WebP format
  - Place in `public/assets/`

- [ ] **Demo video** (`public/assets/demo.mp4`):
  - Record 15-20 second GUI workflow demo
  - Show: Launch app → Load/paste XG text → Preview boards → Export to Anki
  - Highlight live preview and visual progress tracking
  - Convert to MP4 (H.264, <5MB)
  - Place in `public/assets/`
  - Update HTML to remove placeholder and add video element

**Priority: Medium**
- [ ] **Input dialog screenshot** (`public/assets/input-dialog.webp`):
  - Screenshot of smart input dialog with format detection
  - Shows XG text being pasted with automatic parsing

- [ ] **Export progress screenshot** (`public/assets/export-progress.webp`):
  - Screenshot of export progress dialog
  - Shows visual feedback during card creation

- [ ] **Color schemes showcase** (`public/assets/color-schemes.webp`):
  - Screenshot showing different color scheme options
  - Display 2-3 boards with different themes (classic, ocean, midnight, etc.)

- [ ] **Favicon** (`public/assets/favicon.ico`):
  - Create or generate 32×32 ICO file
  - Uncomment favicon link in HTML (line ~12)

**Priority: Low**
- [ ] Additional GUI screenshots (optional feature showcase)

See [public/assets/README.md](public/assets/README.md) for detailed instructions.

### 3. Test Locally

- [ ] **Start local web server:**
  ```bash
  cd website/public/
  python -m http.server 8000
  ```

- [ ] **Open browser:** http://localhost:8000

- [ ] **Test functionality:**
  - [ ] Navigation links scroll smoothly to sections
  - [ ] Download buttons link to correct releases (Windows/macOS/Linux executables)
  - [ ] Platform switcher works (Windows/macOS/Linux tabs)
  - [ ] FAQ items expand/collapse on click
  - [ ] All links are valid (no 404s)
  - [ ] GUI screenshots load properly
  - [ ] Demo video plays correctly (if added)

- [ ] **Test responsive design:**
  - [ ] Desktop view (1920×1080)
  - [ ] Tablet view (768×1024)
  - [ ] Mobile view (375×667)
  - Use browser DevTools to test different screen sizes

- [ ] **Check browser console** (F12):
  - [ ] No JavaScript errors
  - [ ] No broken resource links

### 4. Performance Check

- [ ] **Run Lighthouse audit** (Chrome DevTools):
  - Target scores: 90+ in all categories
  - Fix any critical issues highlighted

- [ ] **Verify page weight:**
  - [ ] Total size <100KB (before images/video)
  - [ ] With assets: <2MB total

- [ ] **Test load time:**
  - [ ] First Contentful Paint <1.5s
  - [ ] Time to Interactive <3s

## Deployment Steps

### Option A: Separate Repository (Recommended)

**Best for:** Dedicated landing page at `username.github.io/ankigammon-website`

1. [ ] **Create new GitHub repository:**
   - Go to https://github.com/new
   - Name: `ankigammon-website`
   - Visibility: Public
   - Don't initialize with README (we have files)

2. [ ] **Push website to new repo:**
   ```bash
   cd website/
   git init
   git add .
   git commit -m "Initial commit: AnkiGammon landing page"
   git remote add origin https://github.com/Deinonychus999/ankigammon-website.git
   git branch -M main
   git push -u origin main
   ```

3. [ ] **Enable GitHub Pages:**
   - Go to **Settings > Pages**
   - Source: Deploy from a branch OR GitHub Actions (recommended)
   - If using GitHub Actions: The workflow will automatically deploy
   - If using branch: Select `main` branch and `/ (root)` folder

4. [ ] **Wait for deployment:**
   - Go to **Actions** tab
   - Wait for "Deploy to GitHub Pages" workflow to complete (1-2 minutes)
   - Check for green ✓ checkmark

5. [ ] **Verify deployment:**
   - Go to **Settings > Pages**
   - Copy the URL (e.g., `https://Deinonychus999.github.io/ankigammon-website`)
   - Open in browser to verify site is live

### Option B: Subdirectory of Main Repo

**Best for:** Keeping everything in one repository

1. [ ] **Commit website to main repo:**
   ```bash
   cd /path/to/ankigammon/  # Root of main repo
   git add website/
   git commit -m "Add promotional landing page"
   git push origin main
   ```

2. [ ] **Configure Pages:**
   - The GitHub Actions workflow in `.github/workflows/pages.yml` is already configured
   - Go to **Settings > Pages**
   - Source: Select "GitHub Actions"

3. [ ] **Wait for deployment and verify** (same as Option A)

## Post-Deployment Checklist

### 1. Verify Live Site

- [ ] **Visit deployed URL**
- [ ] **Test all functionality** (same as local testing)
- [ ] **Test on real devices:**
  - [ ] Desktop computer
  - [ ] Mobile phone
  - [ ] Tablet (if available)

### 2. SEO & Analytics (Optional)

- [ ] **Submit to search engines:**
  - [ ] Google Search Console
  - [ ] Bing Webmaster Tools

- [ ] **Add analytics** (optional):
  - [ ] Google Analytics
  - [ ] Plausible (privacy-friendly alternative)
  - Add tracking code to `<head>` in index.html

- [ ] **Verify Open Graph tags** (optional):
  - Test with: https://www.opengraph.xyz/
  - Preview how links appear on Twitter, Facebook, etc.

### 3. Custom Domain Configuration

Setting up AnkiGammon.com as the custom domain:

- [ ] **In GitHub** (Settings > Pages):
  - [ ] Add custom domain
  - [ ] Note DNS verification instructions

- [ ] **At DNS provider (for AnkiGammon.com):**
  - [ ] Add A records for the apex domain:
    ```
    ankigammon.com A 185.199.108.153
    ankigammon.com A 185.199.109.153
    ankigammon.com A 185.199.110.153
    ankigammon.com A 185.199.111.153
    ```
  - [ ] Add CNAME record for www subdomain:
    ```
    www.ankigammon.com CNAME Deinonychus999.github.io
    ```
  - [ ] Wait for DNS propagation (up to 24 hours)

- [ ] **Back in GitHub:**
  - [ ] DNS check will verify automatically
  - [ ] Enable "Enforce HTTPS"
  - [ ] Wait for SSL certificate (~5 minutes)

### 4. Promotion

- [ ] **Update main AnkiGammon repository:**
  - [ ] Add link to website in README
  - [ ] Update project description

- [ ] **Share on social media/forums:**
  - [ ] Reddit (r/backgammon, r/Anki)
  - [ ] Backgammon forums (bgonline.org, etc.)
  - [ ] Twitter/X
  - [ ] Backgammon Discord servers

- [ ] **Add website link to:**
  - [ ] GitHub repository description
  - [ ] Release announcements
  - [ ] Documentation

## Maintenance

### Regular Updates

- [ ] **After major releases:**
  - Update feature descriptions if new capabilities added
  - Add new screenshots if UI changed
  - Update version numbers if displayed

- [ ] **Monitor:**
  - GitHub Issues for website feedback
  - Analytics (if installed) for traffic patterns
  - Broken links (quarterly check)

### Content Updates

To update content after deployment:

```bash
# Edit files
cd website/public/
# Make changes to index.html or assets/

# Commit and push
git add .
git commit -m "Update hero section messaging"
git push

# Site redeploys automatically within 1-2 minutes
```

## Troubleshooting

### Workflow fails
- **Check:** `.github/workflows/pages.yml` syntax
- **Check:** `website/public/` directory exists and has index.html
- **View:** Detailed job logs in Actions tab

### Site shows 404
- **Wait:** 2-3 minutes after deployment
- **Check:** Settings > Pages shows correct URL
- **Try:** Hard refresh (Ctrl+Shift+R)

### Images/assets not loading
- **Check:** File paths are correct (`assets/` not `/assets/`)
- **Check:** Files are in `public/assets/` directory
- **Check:** File names match exactly (case-sensitive on Linux)

### Changes not appearing
- **Clear browser cache:** Ctrl+Shift+R (Windows) or Cmd+Shift+R (macOS)
- **Check workflow status:** Must complete successfully (Actions tab)
- **Try:** Incognito/private browsing window

## Next Steps

After successful deployment:

1. ✅ Test the live site thoroughly
2. ✅ Share the URL with beta testers for feedback
3. ✅ Monitor analytics to see which sections get most attention
4. ✅ Iterate based on user feedback
5. ✅ Consider A/B testing different headlines/CTAs

---

**Questions or issues?** Open an issue in the main AnkiGammon repository or consult [website/README.md](README.md) for detailed documentation.

**Website URL (after deployment):** `https://AnkiGammon.com` (custom domain configured)

**Last updated:** 2025-10-20
