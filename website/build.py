#!/usr/bin/env python3
"""Assembles HTML pages from shared partials.

Source files in public/ use <!-- PARTIAL:name --> markers that get replaced
with the contents of _partials/name.html. Template variables like {{BASE}}
are resolved per-page based on directory depth.

The community deck catalog is fetched at build time and prerendered into
decks/index.html, one static page per deck is generated from
_templates/deck.html, and the sitemap gains a URL per deck. Without network
access the site still builds, just without deck data.

The browser app (app/) runs the ankigammon Python package under Pyodide. Its
wheels are downloaded from PyPI into app/wheels/ and checked against PyPI's
sha256, so the page loads them from this site rather than from PyPI.
"""

import datetime
import hashlib
import html
import json
import os
import re
import shutil
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(SCRIPT_DIR, "public")
PARTIALS_DIR = os.path.join(SCRIPT_DIR, "_partials")
TEMPLATES_DIR = os.path.join(SCRIPT_DIR, "_templates")
ICONS_DIR = os.path.join(PARTIALS_DIR, "icons")
BUILD_DIR = os.path.join(SCRIPT_DIR, "build")

SITE_URL = "https://ankigammon.com"
DECKS_API = "https://ankigammon-decks.frankcool999.workers.dev"
DECK_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"

# ankigammon itself tracks the latest release, so the daily rebuild ships each
# release; its dependencies stay pinned because genanki's output lands in users'
# Anki collections. PyYAML comes with Pyodide.
APP_WHEEL_PINS = {
    "genanki": "0.13.1",
    "frozendict": "2.4.7",
    "cached-property": "2.0.1",
    "chevron": "0.14.0",
    "striprtf": "0.0.33",
}
# Releases before this module existed cannot run the app.
APP_ENTRY_MODULE = "ankigammon/web.py"
# The oldest release the page's JavaScript works with (1.13.0 added
# export_pack). Raise it whenever app.js starts calling new ankigammon.web API.
APP_MIN_ANKIGAMMON = (1, 13, 0)
# Just after a release, PyPI's JSON API can still answer with the previous
# version on some requests; one deploy shipped 1.11.0 that way.
PYPI_LAG_RETRIES = 10
PYPI_LAG_WAIT_SECONDS = 30
# Desktop-only parts of the ankigammon wheel (mostly app icons); the app
# repo's tests guarantee ankigammon.web never imports them.
APP_STRIP_PREFIXES = ("ankigammon/gui/", "ankigammon/utils/xg_auto/")

PARTIAL_RE = re.compile(r"^[ \t]*<!-- PARTIAL:(\w[\w-]*) -->[ \t]*$", re.MULTILINE)
ICON_RE = re.compile(r"<!-- ICON:([a-z0-9-]+) -->")
SVG_OPEN_RE = re.compile(r"<svg\b[^>]*>", re.IGNORECASE)
SVG_LICENSE_COMMENT_RE = re.compile(r"\A\s*<!--[^>]*-->\s*")

# Canonical opening tag for inlined icons. Width/height come from the .icon-xl
# CSS class; stroke/fill come from the .icon class. See css/components.css.
ICON_SVG_OPEN = '<svg class="icon icon-xl" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'

_icon_cache = {}


def get_variables(rel_dir):
    """Compute template variables from the page's directory relative to site root."""
    parts = [p for p in rel_dir.split(os.sep) if p] if rel_dir else []
    base = "../" * len(parts)
    section = parts[0] if parts else ""
    active = " nav-link--active"
    return {
        "{{BASE}}": base,
        "{{TOOLS_HREF}}": base + "tools/",
        "{{TOOLS_ACTIVE}}": active if section == "tools" else "",
        "{{DECKS_HREF}}": base + "decks/",
        "{{DECKS_ACTIVE}}": active if section == "decks" else "",
        "{{DECKS_API}}": DECKS_API,
        "{{APP_HREF}}": base + "app/",
        "{{APP_ACTIVE}}": active if section == "app" else "",
        "{{TRAIN_HREF}}": base + "train/",
        "{{TRAIN_ACTIVE}}": active if section == "train" else "",
    }


def resolve_partial(name, variables):
    """Read a partial file and substitute template variables."""
    path = os.path.join(PARTIALS_DIR, f"{name}.html")
    with open(path, encoding="utf-8") as f:
        content = f.read()
    for key, value in variables.items():
        content = content.replace(key, value)
    return content


def resolve_icon(name, css_class="icon icon-xl"):
    """Read an icon SVG file, strip license comment, and rewrite the root tag.

    Source files come from lucide-static (see _partials/icons/). Their `class`,
    `width`, `height`, `stroke`, and `fill` attributes are replaced so styling
    is governed by the .icon and .icon-xl CSS rules instead.
    """
    key = (name, css_class)
    if key not in _icon_cache:
        path = os.path.join(ICONS_DIR, f"{name}.svg")
        if not os.path.exists(path):
            raise SystemExit(f"build.py: unknown icon {name!r} (expected {path})")
        with open(path, encoding="utf-8") as f:
            svg = f.read()
        svg = SVG_LICENSE_COMMENT_RE.sub("", svg).strip()
        svg = SVG_OPEN_RE.sub(ICON_SVG_OPEN.replace('class="icon icon-xl"', f'class="{css_class}"'), svg, count=1)
        _icon_cache[key] = svg
    return _icon_cache[key]


# ── Community deck catalog ─────────────────────────────────────────────

def fetch_catalog():
    """Live catalog from the API, or a local JSON file when DECKS_CATALOG_FILE is set (previews, tests)."""
    local = os.environ.get("DECKS_CATALOG_FILE")
    try:
        if local:
            with open(local, encoding="utf-8") as f:
                data = json.load(f)
        else:
            # Cloudflare answers 403 to the default urllib User-Agent.
            req = urllib.request.Request(f"{DECKS_API}/catalog", headers={"User-Agent": "ankigammon-build/1.0 (+https://ankigammon.com)"})
            with urllib.request.urlopen(req, timeout=10) as r:
                data = json.load(r)
    except Exception as e:  # network or API trouble must not fail the site build
        print(f"build.py: deck catalog unavailable ({e}); building without deck data")
        return []
    decks = [d for d in data.get("decks", []) if isinstance(d, dict) and d.get("id") and d.get("title")]
    decks.sort(key=lambda d: d.get("published_at") or "", reverse=True)
    print(f"Fetched {len(decks)} community deck(s)")
    return decks


def format_bytes(n):
    if not n:
        return ""
    if n < 1024 * 1024:
        return f"{max(1, round(n / 1024))} KB"
    mb = n / (1024 * 1024)
    return f"{mb:.1f} MB" if mb < 10 else f"{round(mb)} MB"


def plural(n, singular, plural_form=None):
    return f"{n} {singular if n == 1 else (plural_form or singular + 's')}"


def match_length_labels(lengths):
    def sort_key(k):
        return (1, 0) if k == "unlimited" else (0, int(k.replace("pt", "") or 0))
    labels = []
    for key in sorted((lengths or {}).keys(), key=sort_key):
        labels.append("money game" if key == "unlimited" else key.replace("pt", "-point"))
    return labels


def deck_stats(deck):
    """Same wording as decks-app.js statsParts(), so prerender and hydration match."""
    s = deck.get("summary") or {}
    parts = [plural(s.get("positions") or 0, "position")]
    if s.get("checkerPlays"):
        parts.append(plural(s["checkerPlays"], "checker play"))
    if s.get("cubeActions"):
        parts.append(plural(s["cubeActions"], "cube decision"))
    lengths = match_length_labels(s.get("matchLengths"))
    if lengths:
        parts.append(", ".join(lengths))
    if s.get("annotated"):
        parts.append(f"{s['annotated']} with notes")
    return parts


def deck_counts(deck):
    s = deck.get("stats") or {}
    return {"downloads": s.get("downloads") or 0, "up": s.get("up") or 0, "down": s.get("down") or 0}


def vote_counts_html(counts):
    """Same markup as decks-app.js voteCountsNode(); empty until somebody has voted."""
    if not counts["up"] and not counts["down"]:
        return ""
    return (
        '<span class="deck-row__votes">'
        f'<span class="deck-row__vote" title="Thumbs up">{resolve_icon("thumbs-up", "icon")} {counts["up"]}</span> '
        f'<span class="deck-row__vote" title="Thumbs down">{resolve_icon("thumbs-down", "icon")} {counts["down"]}</span>'
        "</span>"
    )


def format_date(iso):
    try:
        return datetime.datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%b %d, %Y").replace(" 0", " ")
    except Exception:
        return ""


def date_only(iso):
    return (iso or "")[:10]


def render_deck_row(deck):
    e = html.escape
    byline = f"by {e(deck.get('author', ''))}"
    if deck.get("published_at"):
        byline += f" &middot; {e(format_date(deck['published_at']))}"
    stats = deck_stats(deck)
    if deck.get("apkg_bytes"):
        stats.append(format_bytes(deck["apkg_bytes"]))
    counts = deck_counts(deck)
    if counts["downloads"]:
        stats.append(plural(counts["downloads"], "download"))
    votes = vote_counts_html(counts)
    stats_html = e(" · ".join(stats)) + (" · " + votes if votes else "")
    return (
        '<article class="deck-row">'
        '<div class="deck-row__main">'
        '<div class="deck-row__head">'
        f'<h3 class="deck-row__title"><a class="deck-row__link" href="{e(deck["id"])}/">{e(deck["title"])}</a></h3>'
        f'<span class="deck-row__byline">{byline}</span>'
        "</div>"
        f'<p class="deck-row__stats">{stats_html}</p>'
        f'<p class="deck-row__desc">{e(deck.get("description", ""))}</p>'
        "</div>"
        '<div class="deck-row__actions">'
        f'<a class="btn btn-primary deck-row__download" href="{e(DECKS_API + deck["apkg_url"])}" title="Download {e(deck["title"])} (.apkg)">Download</a>'
        f'<a class="btn btn-secondary deck-row__practice" href="../train/#deck={e(deck["id"])}" title="Practice {e(deck["title"])} in the browser trainer">Practice</a>'
        "</div>"
        "</article>"
    )


def catalog_jsonld(decks):
    items = [
        {
            "@type": "ListItem",
            "position": i + 1,
            "name": d["title"],
            "url": f"{SITE_URL}/decks/{d['id']}/",
        }
        for i, d in enumerate(decks)
    ]
    data = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "Backgammon Anki decks",
        "numberOfItems": len(decks),
        "itemListOrder": "https://schema.org/ItemListOrderDescending",
        "itemListElement": items,
    }
    return json.dumps(data, ensure_ascii=False, indent=2)


def deck_jsonld(deck):
    data = {
        "@context": "https://schema.org",
        "@type": "LearningResource",
        "name": deck["title"],
        "description": deck.get("description", ""),
        "url": f"{SITE_URL}/decks/{deck['id']}/",
        "author": {"@type": "Person", "name": deck.get("author", "")},
        "datePublished": date_only(deck.get("published_at")),
        "license": DECK_LICENSE_URL,
        "isAccessibleForFree": True,
        "inLanguage": "en",
        "learningResourceType": "Flashcards",
        "about": {"@type": "Thing", "name": "Backgammon"},
        "publisher": {"@type": "Organization", "name": "AnkiGammon", "url": f"{SITE_URL}/"},
        "encoding": {
            "@type": "MediaObject",
            "contentUrl": DECKS_API + deck["apkg_url"],
            "encodingFormat": "application/octet-stream",
            "contentSize": format_bytes(deck.get("apkg_bytes")),
        },
    }
    counts = deck_counts(deck)
    interactions = [
        {"@type": "InteractionCounter", "interactionType": f"https://schema.org/{action}", "userInteractionCount": n}
        for action, n in (("DownloadAction", counts["downloads"]), ("LikeAction", counts["up"]), ("DislikeAction", counts["down"]))
        if n
    ]
    if interactions:
        data["interactionStatistic"] = interactions
    return json.dumps(data, ensure_ascii=False, indent=2)


def anki_decks_html(paths):
    if not paths:
        return ""
    codes = ", ".join(f"<code>{html.escape(p)}</code>" for p in paths[:6])
    noun = "deck" if len(paths) == 1 else "decks"
    return f'<p class="deck-detail__anki">Imports into Anki as the {noun} {codes}.</p>'


def meta_description(text, limit=155):
    text = " ".join((text or "").split())
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(",;:.") + "…"


def render_deck_page(deck):
    with open(os.path.join(TEMPLATES_DIR, "deck.html"), encoding="utf-8") as f:
        page = f.read()
    e = html.escape
    summary = deck.get("summary") or {}
    paragraphs = [p.strip() for p in (deck.get("description") or "").split("\n") if p.strip()]
    description_html = "".join(f"<p>{e(p)}</p>" for p in paragraphs)
    stats = deck_stats(deck)
    if deck.get("apkg_bytes"):
        stats.append(format_bytes(deck["apkg_bytes"]))
    counts = deck_counts(deck)
    title_tag = f"{deck['title']} by {deck.get('author', '')} - Backgammon Anki Deck | AnkiGammon"
    values = {
        "{{DECK_ID}}": e(deck["id"]),
        "{{DECK_TITLE}}": e(deck["title"]),
        "{{DECK_TITLE_TAG}}": e(title_tag),
        "{{DECK_AUTHOR}}": e(deck.get("author", "")),
        "{{DECK_DATE}}": e(format_date(deck.get("published_at", ""))),
        "{{DECK_DATE_ISO}}": e(date_only(deck.get("published_at"))),
        "{{DECK_STATS}}": e(" · ".join(stats)),
        "{{DECK_DOWNLOADS_HTML}}": e(" · " + plural(counts["downloads"], "download")) if counts["downloads"] else "",
        "{{DECK_UP}}": str(counts["up"]),
        "{{DECK_DOWN}}": str(counts["down"]),
        "{{DECK_DESCRIPTION_HTML}}": description_html,
        "{{DECK_META_DESCRIPTION}}": e(meta_description(deck.get("description", ""))),
        "{{DECK_URL}}": e(f"{SITE_URL}/decks/{deck['id']}/"),
        "{{DECK_DOWNLOAD_URL}}": e(DECKS_API + deck["apkg_url"]),
        "{{DECK_PREVIEW_XGIDS_JSON}}": json.dumps(summary.get("previewXgids") or []),
        "{{DECK_ANKI_DECKS_HTML}}": anki_decks_html(summary.get("ankiDecks") or []),
        "{{DECK_JSONLD}}": deck_jsonld(deck),
    }
    for key, value in values.items():
        page = page.replace(key, value)
    return page


def inject_catalog(content, decks):
    rows = "\n".join(render_deck_row(d) for d in decks)
    # A preview built from a local file must not be replaced by the live catalog on load.
    payload = {"decks": decks, "frozen": bool(os.environ.get("DECKS_CATALOG_FILE"))}
    data = '<script type="application/json" id="deck-catalog">' + json.dumps(payload, ensure_ascii=False).replace("</", "<\\/") + "</script>"
    jsonld = '<script type="application/ld+json">\n' + catalog_jsonld(decks) + "\n</script>" if decks else ""
    return (
        content.replace("<!-- CATALOG:rows -->", rows)
        .replace("<!-- CATALOG:data -->", data)
        .replace("<!-- CATALOG:jsonld -->", jsonld)
    )


def update_sitemap(decks):
    path = os.path.join(BUILD_DIR, "sitemap.xml")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        xml = f.read()
    today = datetime.date.today().isoformat()
    xml = re.sub(
        r"(<loc>https://ankigammon\.com/decks/</loc>\s*<lastmod>)[^<]*(</lastmod>)",
        rf"\g<1>{today}\g<2>",
        xml,
    )
    entries = "".join(
        "  <url>\n"
        f"    <loc>{SITE_URL}/decks/{html.escape(d['id'])}/</loc>\n"
        f"    <lastmod>{date_only(d.get('published_at')) or today}</lastmod>\n"
        "    <changefreq>monthly</changefreq>\n"
        "    <priority>0.7</priority>\n"
        "  </url>\n\n"
        for d in decks
    )
    xml = xml.replace("</urlset>", entries + "</urlset>")
    with open(path, "w", encoding="utf-8") as f:
        f.write(xml)


# ── Browser app wheels ─────────────────────────────────────────────────

APP_WHEELS_DIR = os.path.join(BUILD_DIR, "app", "wheels")
PYPI_HEADERS = {"User-Agent": "ankigammon-build/1.0 (+https://ankigammon.com)"}


def pypi_wheel(name, version=None):
    """(filename, url, sha256) of the pure-Python wheel of a release; the latest when version is None."""
    path = f"{name}/{version}/json" if version else f"{name}/json"
    req = urllib.request.Request(f"https://pypi.org/pypi/{path}", headers=PYPI_HEADERS)
    with urllib.request.urlopen(req, timeout=20) as r:
        release = json.load(r)
    wheel = next(u for u in release["urls"] if u["filename"].endswith("-py3-none-any.whl"))
    return wheel["filename"], wheel["url"], wheel["digests"]["sha256"]


def download_verified(url, sha256, dest):
    req = urllib.request.Request(url, headers=PYPI_HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    if hashlib.sha256(data).hexdigest() != sha256:
        raise ValueError(f"sha256 mismatch for {url}")
    with open(dest, "wb") as f:
        f.write(data)


def wheel_has(path, member):
    import zipfile
    with zipfile.ZipFile(path) as zf:
        return member in zf.namelist()


def strip_wheel(path, prefixes):
    """Rewrite a wheel in place without the files under `prefixes`, with a RECORD
    that lists the remaining files' hashes and sizes."""
    import base64
    import csv
    import io
    import zipfile

    out = io.BytesIO()
    with zipfile.ZipFile(path) as src, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst:
        record_name = next(n for n in src.namelist() if n.endswith(".dist-info/RECORD"))
        rows = []
        for info in src.infolist():
            if info.filename == record_name or info.filename.startswith(prefixes):
                continue
            data = src.read(info)
            dst.writestr(info, data)
            digest = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b"=").decode()
            rows.append((info.filename, f"sha256={digest}", str(len(data))))
        rows.append((record_name, "", ""))
        record = io.StringIO()
        csv.writer(record, lineterminator="\n").writerows(rows)
        dst.writestr(record_name, record.getvalue())
    with open(path, "wb") as f:
        f.write(out.getvalue())


def wheel_version(filename):
    return tuple(int(part) for part in re.match(r"ankigammon-(\d+)\.(\d+)\.(\d+)", filename).groups())


def latest_ankigammon_wheel():
    """The latest ankigammon release, which must be at least APP_MIN_ANKIGAMMON.

    An older answer means PyPI is still propagating a release, so wait for it;
    if it never arrives, stop the build rather than deploy JavaScript that
    calls API the served wheel lacks. The live site keeps its last deploy.
    """
    import time
    for attempt in range(PYPI_LAG_RETRIES + 1):
        filename, url, sha256 = pypi_wheel("ankigammon")
        if wheel_version(filename) >= APP_MIN_ANKIGAMMON:
            return filename, url, sha256
        if attempt < PYPI_LAG_RETRIES:
            print(f"build.py: PyPI still reports {filename}; waiting for a release >= "
                  f"{'.'.join(map(str, APP_MIN_ANKIGAMMON))}")
            time.sleep(PYPI_LAG_WAIT_SECONDS)
    raise SystemExit(
        f"build.py: PyPI's latest ankigammon is {filename}, older than "
        f"{'.'.join(map(str, APP_MIN_ANKIGAMMON))} that the app page needs; not deploying."
    )


def fetch_app_wheels():
    """Wheel filenames for the browser app in install order, or [] when unavailable.

    ANKIGAMMON_WHEEL=path/to/ankigammon-*.whl uses a local build of the package
    (previews, tests, unreleased changes) instead of the latest PyPI release.
    """
    try:
        os.makedirs(APP_WHEELS_DIR, exist_ok=True)
        names = []
        for name, version in APP_WHEEL_PINS.items():
            filename, url, sha256 = pypi_wheel(name, version)
            download_verified(url, sha256, os.path.join(APP_WHEELS_DIR, filename))
            names.append(filename)

        local = os.environ.get("ANKIGAMMON_WHEEL")
        if local:
            filename = os.path.basename(local)
            shutil.copyfile(local, os.path.join(APP_WHEELS_DIR, filename))
        else:
            filename, url, sha256 = latest_ankigammon_wheel()
            download_verified(url, sha256, os.path.join(APP_WHEELS_DIR, filename))
        wheel_path = os.path.join(APP_WHEELS_DIR, filename)
        if not wheel_has(wheel_path, APP_ENTRY_MODULE):
            raise ValueError(f"{filename} predates {APP_ENTRY_MODULE}")
        before = os.path.getsize(wheel_path)
        strip_wheel(wheel_path, APP_STRIP_PREFIXES)
        print(f"Stripped desktop-only files from {filename}: {before // 1024} KB -> {os.path.getsize(wheel_path) // 1024} KB")
        names.append(filename)
    except Exception as e:  # network or PyPI trouble must not fail the site build
        print(f"build.py: browser app wheels unavailable ({e}); the app page will say so")
        shutil.rmtree(APP_WHEELS_DIR, ignore_errors=True)
        return []
    print(f"Browser app runs {names[-1]}")
    return names


# ── Build ──────────────────────────────────────────────────────────────

MET_DATA_JS = os.path.join(SRC_DIR, "js", "met-data.js")
MET_ROW_RE = re.compile(r"/\*\s*\d+-away\s*\*/\s*\[([^\]]+)\]")
MET_GRID_SIZE = 7  # matches the page's default 7-point view


def met_color(mwc):
    """Mirrors mwcToColor in js/met-calculator-app.js."""
    if mwc <= 0.5:
        t = mwc / 0.5
        start, end = (138, 40, 40), (59, 62, 69)
    else:
        t = (mwc - 0.5) / 0.5
        start, end = (59, 62, 69), (36, 107, 48)
    r, g, b = (int(a + (b - a) * t + 0.5) for a, b in zip(start, end))
    return f"rgb({r},{g},{b})"


def render_met_grid():
    """Static copy of the default grid so the equities are in the HTML; the app redraws it on load."""
    with open(MET_DATA_JS, encoding="utf-8") as f:
        rows = [[float(v) for v in m.group(1).split(",")] for m in MET_ROW_RE.finditer(f.read())]
    n = MET_GRID_SIZE
    out = ['<table class="met-grid"><thead><tr><th class="met-cell met-cell--corner">You \ Opp</th>']
    out += [f'<th class="met-cell met-cell--col-header">{j}</th>' for j in range(1, n + 1)]
    out.append("</tr></thead><tbody>")
    for i in range(1, n + 1):
        out.append(f'<tr><th class="met-cell met-cell--row-header">{i}</th>')
        for j in range(1, n + 1):
            mwc = rows[i - 1][j - 1]
            out.append(f'<td class="met-cell" data-r="{i}" data-c="{j}" '
                       f'style="background-color:{met_color(mwc)}">{mwc * 100:.1f}</td>')
        out.append("</tr>")
    out.append("</tbody></table>")
    return "".join(out)


def build():
    # Clean and copy source to build directory
    if os.path.exists(BUILD_DIR):
        shutil.rmtree(BUILD_DIR)
    shutil.copytree(SRC_DIR, BUILD_DIR)

    decks = fetch_catalog()
    for deck in decks:
        deck_dir = os.path.join(BUILD_DIR, "decks", deck["id"])
        os.makedirs(deck_dir, exist_ok=True)
        with open(os.path.join(deck_dir, "index.html"), "w", encoding="utf-8") as f:
            f.write(render_deck_page(deck))

    app_wheels = fetch_app_wheels()

    count = 0
    for root, _dirs, files in os.walk(BUILD_DIR):
        for filename in files:
            if not filename.endswith(".html"):
                continue

            filepath = os.path.join(root, filename)
            rel = os.path.relpath(filepath, BUILD_DIR)
            variables = get_variables(os.path.dirname(rel))

            with open(filepath, encoding="utf-8") as f:
                content = f.read()

            original = content

            def replace_match(m):
                return resolve_partial(m.group(1), variables)

            content = PARTIAL_RE.sub(replace_match, content)
            content = ICON_RE.sub(lambda m: resolve_icon(m.group(1)), content)
            content = content.replace("{{DECKS_API}}", DECKS_API)
            if rel.replace(os.sep, "/") == "decks/index.html":
                content = inject_catalog(content, decks)
            if rel.replace(os.sep, "/") == "tools/met-calculator.html":
                content = content.replace("<!-- MET:grid -->", render_met_grid())
            if rel.replace(os.sep, "/") == "app/index.html":
                content = content.replace("{{APP_WHEELS}}", html.escape(json.dumps(app_wheels)))

            if content != original:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(content)
                count += 1

    update_sitemap(decks)
    print(f"Built {count} pages into {os.path.relpath(BUILD_DIR, SCRIPT_DIR)}/")


if __name__ == "__main__":
    build()
