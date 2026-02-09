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
BUILD_DIR = os.path.join(SCRIPT_DIR, "build")

PARTIAL_RE = re.compile(r"^[ \t]*<!-- PARTIAL:(\w[\w-]*) -->[ \t]*$", re.MULTILINE)


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

            if content != original:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(content)
                count += 1

    print(f"Built {count} pages into {os.path.relpath(BUILD_DIR, SCRIPT_DIR)}/")


if __name__ == "__main__":
    build()
