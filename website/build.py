#!/usr/bin/env python3
"""Assembles HTML pages from shared partials.

Source files in public/ use <!-- PARTIAL:name --> markers that get replaced
with the contents of _partials/name.html. Template variables like {{BASE}}
are resolved per-page based on directory depth.
"""

import os
import re
import shutil

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(SCRIPT_DIR, "public")
PARTIALS_DIR = os.path.join(SCRIPT_DIR, "_partials")
ICONS_DIR = os.path.join(PARTIALS_DIR, "icons")
BUILD_DIR = os.path.join(SCRIPT_DIR, "build")

PARTIAL_RE = re.compile(r"^[ \t]*<!-- PARTIAL:(\w[\w-]*) -->[ \t]*$", re.MULTILINE)
ICON_RE = re.compile(r"<!-- ICON:([a-z0-9-]+) -->")
SVG_OPEN_RE = re.compile(r"<svg\b[^>]*>", re.IGNORECASE)
SVG_LICENSE_COMMENT_RE = re.compile(r"\A\s*<!--[^>]*-->\s*")

# Canonical opening tag for inlined icons. Width/height come from the .icon-xl
# CSS class; stroke/fill come from the .icon class. See css/components.css.
ICON_SVG_OPEN = '<svg class="icon icon-xl" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'

_icon_cache = {}


def get_variables(depth):
    """Compute template variables based on directory depth from site root."""
    base = "../" * depth if depth > 0 else ""
    return {
        "{{BASE}}": base,
        "{{TOOLS_HREF}}": "./" if depth > 0 else "tools/",
        "{{TOOLS_ACTIVE}}": ' style="color: var(--text-primary);"' if depth > 0 else "",
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


def build():
    # Clean and copy source to build directory
    if os.path.exists(BUILD_DIR):
        shutil.rmtree(BUILD_DIR)
    shutil.copytree(SRC_DIR, BUILD_DIR)

    count = 0
    for root, _dirs, files in os.walk(BUILD_DIR):
        for filename in files:
            if not filename.endswith(".html"):
                continue

            filepath = os.path.join(root, filename)
            rel = os.path.relpath(filepath, BUILD_DIR)
            dirname = os.path.dirname(rel)
            depth = len(dirname.split(os.sep)) if dirname else 0

            variables = get_variables(depth)

            with open(filepath, encoding="utf-8") as f:
                content = f.read()

            original = content

            def replace_match(m):
                return resolve_partial(m.group(1), variables)

            content = PARTIAL_RE.sub(replace_match, content)
            content = ICON_RE.sub(lambda m: resolve_icon(m.group(1)), content)

            if content != original:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(content)
                count += 1

    print(f"Built {count} pages into {os.path.relpath(BUILD_DIR, SCRIPT_DIR)}/")


if __name__ == "__main__":
    build()
