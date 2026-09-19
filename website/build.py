#!/usr/bin/env python3
"""Assembles HTML pages from shared partials.

Source files in public/ use <!-- PARTIAL:name --> markers that get replaced
with the contents of _partials/name.html. Template variables like {{BASE}}
are resolved per-page based on directory depth.

The community deck catalog is fetched at build time and prerendered into
decks/index.html, one static page per deck is generated from
_templates/deck.html, and the sitemap gains a URL per deck. Without network
access the site still builds, just without deck data.
"""

import datetime
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
    }


def resolve_partial(name, variables):
    """Read a partial file and substitute template variables."""
    path = os.path.join(PARTIALS_DIR, f"{name}.html")
    with open(path, encoding="utf-8") as f:
        content = f.read()
    for key, value in variables.items():
        content = content.replace(key, value)
    return content


def resolve_icon(name):
    """Read an icon SVG file, strip license comment, and rewrite the root tag.

    Source files come from lucide-static (see _partials/icons/). Their `class`,
    `width`, `height`, `stroke`, and `fill` attributes are replaced so styling
    is governed by the .icon and .icon-xl CSS rules instead.
    """
    if name not in _icon_cache:
        path = os.path.join(ICONS_DIR, f"{name}.svg")
        if not os.path.exists(path):
            raise SystemExit(f"build.py: unknown icon {name!r} (expected {path})")
        with open(path, encoding="utf-8") as f:
            svg = f.read()
        svg = SVG_LICENSE_COMMENT_RE.sub("", svg).strip()
        svg = SVG_OPEN_RE.sub(ICON_SVG_OPEN, svg, count=1)
        _icon_cache[name] = svg
    return _icon_cache[name]


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
    return (
        '<article class="deck-row">'
        '<div class="deck-row__main">'
        '<div class="deck-row__head">'
        f'<h3 class="deck-row__title"><a class="deck-row__link" href="{e(deck["id"])}/">{e(deck["title"])}</a></h3>'
        f'<span class="deck-row__byline">{byline}</span>'
        "</div>"
        f'<p class="deck-row__stats">{e(" · ".join(stats))}</p>'
        f'<p class="deck-row__desc">{e(deck.get("description", ""))}</p>'
        "</div>"
        f'<a class="btn btn-primary deck-row__download" href="{e(DECKS_API + deck["apkg_url"])}" title="Download {e(deck["title"])} (.apkg)">Download</a>'
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
    title_tag = f"{deck['title']} by {deck.get('author', '')} - Backgammon Anki Deck | AnkiGammon"
    values = {
        "{{DECK_ID}}": e(deck["id"]),
        "{{DECK_TITLE}}": e(deck["title"]),
        "{{DECK_TITLE_TAG}}": e(title_tag),
        "{{DECK_AUTHOR}}": e(deck.get("author", "")),
        "{{DECK_DATE}}": e(format_date(deck.get("published_at", ""))),
        "{{DECK_DATE_ISO}}": e(date_only(deck.get("published_at"))),
        "{{DECK_STATS}}": e(" · ".join(stats)),
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


# ── Build ──────────────────────────────────────────────────────────────

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

            if content != original:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(content)
                count += 1

    update_sitemap(decks)
    print(f"Built {count} pages into {os.path.relpath(BUILD_DIR, SCRIPT_DIR)}/")


if __name__ == "__main__":
    build()
