# AnkiGammon Website - Deployment Checklist

**Last Updated:** 2025-10-25
**Current Status:** 60% Ready - Infrastructure complete, missing assets and validation

## Current State Summary

✅ **Complete:**
- GitHub Actions workflow configured (`.github/workflows/pages.yml`)
- HTML/CSS/JavaScript structure complete
- Repository links updated to Deinonychus999/AnkiGammon
- Basic screenshots available (main_window.png, anki_front.png, icon.png)
- Favicon exists and is properly linked (favicon.ico)

⚠️ **In Progress:**
- Asset optimization (PNG → WebP conversion needed)
- Demo video placeholder (line 220 in index.html)

❌ **Blocking Production Release:**
- No local testing performed
- No performance audit completed
- Demo placeholder text still visible (line 220)
- GitHub Pages not enabled

---

## Pre-Deployment Checklist

### 1. Customize Content

- [ ] **Review and customize messaging:**
  - [ ] Hero headline (verify current text is appropriate)
  - [ ] Hero subtitle (verify current text is appropriate)
  - [ ] Feature descriptions (ensure accuracy)
  - [ ] FAQ answers (verify completeness and accuracy)

- [ ] **Add contact/support information** (optional):
  - [ ] Email address for questions
  - [ ] Link to Discord/Slack community (if available)
  - [ ] Social media links (if available)

### 2. Visual Assets

**Status: Partially Complete - Optimization Needed**

**Priority: CRITICAL (Blocking Production)**

- [ ] **Demo video or screenshot** - CRITICAL:
  - **Current issue:** Placeholder text at line 220: "📹 Demo video or screenshots coming soon"
  - **Option A (Quick):** Use existing `main_window.png` or `anki_front.png` as static screenshot
  - **Option B (Better):** Record 15-20 second GUI workflow video (Launch app → Load/paste XG text → Preview boards → Export to Anki)
  - **Action:** Replace line 220 placeholder with either `<img>` tag or `<video>` element

**Priority: MEDIUM (Optional Enhancement - Recommended)**

- [ ] **Convert screenshots to WebP** (file size optimization):
  ```bash
  cd website/public/assets/images/
  cwebp -q 85 main_window.png -o ../main-window.webp
  cwebp -q 85 anki_front.png -o ../hero-card.webp
  ```

**Priority: LOW (Optional Enhancement)**

- [ ] **Input dialog screenshot** (`public/assets/input-dialog.webp`):
  - Screenshot of smart input dialog with format detection
  - Shows XG text being pasted with automatic parsing

- [ ] **Export progress screenshot** (`public/assets/export-progress.webp`):
  - Screenshot of export progress dialog
  - Shows visual feedback during card creation

- [ ] **Color schemes showcase** (`public/assets/color-schemes.webp`):
  - Screenshot showing different color scheme options
  - Display 2-3 boards with different themes (classic, ocean, midnight, etc.)

### 3. Test Locally

**Status: NOT STARTED**

- [ ] **Start local web server:**
  ```bash
  cd website/public/
  python -m http.server 8001
  ```

- [ ] **Open browser:** http://localhost:8001

- [ ] **Test functionality:**
  - [ ] Navigation links scroll smoothly to sections
  - [ ] Download buttons link to correct GitHub releases
  - [ ] Platform switcher works (Windows/macOS/Linux tabs)
  - [ ] FAQ items expand/collapse on click
  - [ ] All links are valid (no 404s)
  - [ ] Screenshots load properly
  - [ ] Demo video plays correctly (after adding)
  - [ ] Icon appears in header

- [ ] **Test responsive design:**
  - [ ] Desktop view (1920×1080)
  - [ ] Tablet view (768×1024)
  - [ ] Mobile view (375×667)
  - Use browser DevTools (F12) to test different screen sizes

- [ ] **Check browser console** (F12):
  - [ ] No JavaScript errors
  - [ ] No broken resource links (404s)
  - [ ] No CSS loading issues

### 4. Performance Check

**Status: NOT STARTED**

- [ ] **Run Lighthouse audit** (Chrome DevTools > Lighthouse):
  - Target scores: 90+ in all categories (Performance, Accessibility, Best Practices, SEO)
  - Fix any critical issues highlighted
  - Document score before and after optimizations

- [ ] **Verify page weight:**
  - [ ] HTML/CSS/JS size <100KB (excluding images/video)
  - [ ] Total with assets: <2MB
  - Check in DevTools > Network tab

- [ ] **Test load time:**
  - [ ] First Contentful Paint <1.5s
  - [ ] Time to Interactive <3s
  - Use Lighthouse or WebPageTest.org

---

## Deployment Steps

### Option A: Separate Repository (Recommended for Production)

**Best for:** Dedicated landing page at `Deinonychus999.github.io/ankigammon-website`

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
   - Source: Select "GitHub Actions" (workflow already exists in `.github/workflows/pages.yml`)
   - Workflow will automatically deploy on push to main

4. [ ] **Wait for deployment:**
   - Go to **Actions** tab
   - Wait for "Deploy to GitHub Pages" workflow to complete (1-2 minutes)
   - Check for green ✓ checkmark

5. [ ] **Verify deployment:**
   - Go to **Settings > Pages**
   - Copy the URL (e.g., `https://Deinonychus999.github.io/ankigammon-website`)
   - Open in browser to verify site is live

### Option B: Subdirectory of Main Repo (Current Setup)

**Best for:** Keeping everything in one repository (current state)

**Status:** Website files committed to main repo, Pages not enabled

1. [ ] **Enable GitHub Pages:**
   - Go to repository **Settings > Pages**
   - Source: Select "GitHub Actions"
   - The workflow in `.github/workflows/pages.yml` will handle deployment
   - Deploys from `website/public/` directory

2. [ ] **Wait for deployment and verify:**
   - Go to **Actions** tab
   - Wait for "Deploy to GitHub Pages" workflow to complete
   - Visit the deployed URL (shown in Settings > Pages)
   - Verify site appears correctly

---

## Post-Deployment Checklist

### 1. Verify Live Site

- [ ] **Visit deployed URL**
- [ ] **Test all functionality** (same as local testing checklist above)
- [ ] **Test on real devices:**
  - [ ] Desktop computer (Windows/macOS/Linux)
  - [ ] Mobile phone (iOS/Android)
  - [ ] Tablet (if available)

### 2. SEO & Analytics (Optional)

- [ ] **Submit to search engines:**
  - [ ] Google Search Console
  - [ ] Bing Webmaster Tools

- [ ] **Add analytics** (optional):
  - [ ] Google Analytics, or
  - [ ] Plausible (privacy-friendly alternative), or
  - [ ] Simple Analytics
  - Add tracking code to `<head>` in index.html

- [ ] **Verify Open Graph tags:**
  - Test with: https://www.opengraph.xyz/
  - Preview how links appear on Twitter, Facebook, Discord, etc.
  - Add custom OG tags if needed (image, description, title)

### 3. Custom Domain Configuration (Optional)

**If using AnkiGammon.com custom domain:**

- [ ] **In GitHub** (Settings > Pages):
  - [ ] Enter custom domain: `ankigammon.com`
  - [ ] Note DNS verification instructions
  - [ ] Add CNAME file to public/ directory

- [ ] **At DNS provider:**
  - [ ] Add A records for apex domain:
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
  - [ ] Wait for DNS propagation (up to 24-48 hours)

- [ ] **Back in GitHub:**
  - [ ] DNS check will verify automatically (green checkmark)
  - [ ] Enable "Enforce HTTPS"
  - [ ] Wait for SSL certificate provisioning (~5 minutes)

### 4. Promotion

- [ ] **Update main AnkiGammon repository:**
  - [ ] Add website link to README.md
  - [ ] Update GitHub repository description to include website link
  - [ ] Add website badge to README

- [ ] **Share on communities:**
  - [ ] Reddit: r/backgammon, r/Anki
  - [ ] Backgammon forums: bgonline.org, etc.
  - [ ] Twitter/X (if applicable)
  - [ ] Backgammon Discord servers
  - [ ] Hacker News (Show HN: if appropriate)

- [ ] **Add website link to:**
  - [ ] GitHub repository description field
  - [ ] Release announcements
  - [ ] Documentation files

---

## Maintenance

### Regular Updates

- [ ] **After major releases:**
  - Update feature descriptions if new capabilities added
  - Add new screenshots if UI significantly changed
  - Update version numbers if displayed anywhere
  - Add new FAQ items based on common questions

- [ ] **Monitor:**
  - GitHub Issues for website-specific feedback
  - Analytics (if installed) for traffic patterns and user behavior
  - Broken links (quarterly check recommended)
  - GitHub release links still valid

### Content Updates

To update content after deployment:

```bash
# Navigate to website directory
cd website/public/

# Make changes to index.html, CSS, JS, or assets/

# Commit and push (if using Option B: main repo)
cd ../..  # Back to repo root
git add website/
git commit -m "Update website: describe changes"
git push

# Or push to separate repo (if using Option A)
git add .
git commit -m "Update hero section messaging"
git push origin main

# Site redeploys automatically within 1-2 minutes via GitHub Actions
```

---

## Troubleshooting

### Workflow fails

- **Check:** `.github/workflows/pages.yml` syntax is valid
- **Check:** `website/public/` directory exists and contains `index.html`
- **Check:** `assets/` directory exists in `website/public/`
- **View:** Detailed job logs in Actions tab for specific errors
- **Common issues:**
  - Missing `index.html` file
  - Invalid YAML syntax
  - Permissions not set correctly (check workflow permissions)

### Site shows 404

- **Wait:** 2-3 minutes after first deployment
- **Check:** Settings > Pages shows correct source and URL
- **Check:** GitHub Pages is enabled (green checkmark in Settings)
- **Try:** Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
- **Check:** Workflow completed successfully (Actions tab)

### Images/assets not loading

- **Check:** File paths are relative: `assets/images/icon.png` not `/assets/`
- **Check:** Files exist in `public/assets/` or `public/assets/images/`
- **Check:** File names match exactly (case-sensitive on Linux servers)
- **Check:** Browser console (F12) for 404 errors
- **Common issue:** WebP files not supported in older browsers (provide PNG fallbacks)

### Changes not appearing

- **Clear browser cache:** Ctrl+Shift+R (Windows) or Cmd+Shift+R (macOS)
- **Check workflow status:** Must show green ✓ in Actions tab
- **Try:** Incognito/private browsing window
- **Check:** Correct branch deployed (main/master)
- **Wait:** GitHub Pages can take 1-2 minutes to update

### Demo video not playing

- **Check:** File size <5MB (GitHub Pages has file size limits)
- **Check:** Video codec is H.264 (widely supported)
- **Check:** File path correct: `assets/demo.mp4`
- **Try:** Different browsers (codec support varies)
- **Alternative:** Link to YouTube/Vimeo instead of self-hosting

---

## Readiness Assessment

**Overall Status: 60% Ready**

| Category | Status | Blockers |
|----------|--------|----------|
| Infrastructure | ✅ Complete | None |
| HTML/CSS/JS | ✅ Complete | None |
| Assets (Basic) | ⚠️ Partial | PNG→WebP conversion recommended |
| Assets (Video) | ❌ Missing | Demo placeholder at line 220 |
| Local Testing | ❌ Not Started | All items unchecked |
| Performance | ❌ Not Started | Lighthouse audit needed |
| Deployment | ❌ Not Enabled | GitHub Pages not activated |

**Recommended Path to Production:**

1. **Quick Staging Deploy** (30-60 minutes):
   - Replace demo placeholder with screenshot or video
   - Enable GitHub Pages for staging test
   - Basic functionality test
   - Optional: Convert existing PNGs to WebP

2. **Production Ready** (+ 2-4 hours):
   - Create demo video or replace placeholder with static screenshot
   - Complete local testing checklist
   - Run Lighthouse audit and fix issues
   - Full responsive testing

3. **Polish** (+ optional time):
   - Add optional screenshots
   - SEO optimization
   - Custom domain setup
   - Analytics integration

---

## Next Steps

**To reach staging deployment:**
1. ✅ Run asset optimization commands (see section 2) - Optional but recommended
2. ✅ Replace demo placeholder (either video or fallback screenshot)
3. ✅ Enable GitHub Pages in Settings
4. ✅ Basic smoke test on deployed site

**To reach production quality:**
1. ✅ Complete local testing checklist
2. ✅ Run Lighthouse audit (target: 90+ all categories)
3. ✅ Test on multiple devices/browsers
4. ✅ Review and approve all content
5. ✅ Plan promotion strategy

---

**Questions or issues?** Open an issue in the main AnkiGammon repository or consult [website/README.md](README.md) for detailed documentation.

**Current Repository:** https://github.com/Deinonychus999/AnkiGammon
**Target Website URL:** `https://Deinonychus999.github.io/AnkiGammon` (Option B) or `https://ankigammon.com` (with custom domain)
