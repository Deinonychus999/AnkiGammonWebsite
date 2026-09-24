#!/usr/bin/env python3
"""Serves build/ locally the way GitHub Pages does, including extensionless URLs.

Usage: python website/serve.py [port]   (default 8765)
"""

import functools
import http.server
import os
import sys

BUILD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build")


class PagesHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        fs_path = super().translate_path(path)
        if not os.path.exists(fs_path) and os.path.isfile(fs_path + ".html"):
            return fs_path + ".html"
        return fs_path


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = functools.partial(PagesHandler, directory=BUILD_DIR)
    print(f"Serving {BUILD_DIR} at http://localhost:{port}/")
    http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
