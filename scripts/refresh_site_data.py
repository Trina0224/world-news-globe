#!/usr/bin/env python3
"""Refresh an entire site snapshot, or leave the live Pages site untouched.

All news generation is treated as a transaction. A failure must not publish
partially regenerated JSON files or clobber the last-known-good cache.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from validate_site_data import validate

ROOT = Path("data")
MAP = ROOT / "maps/japan-prefectures.geojson"


def valid_snapshot():
    try:
        validate()
        return True
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"Previous snapshot is incomplete: {exc}")
        return False


def valid_map():
    try:
        with MAP.open(encoding="utf-8") as handle:
            obj = json.load(handle)
        return obj.get("type") == "FeatureCollection" and len(obj.get("features", [])) == 47
    except (OSError, ValueError, TypeError, AttributeError):
        return False


def run(path):
    print(f"Running {path}", flush=True)
    subprocess.run([sys.executable, path], check=True, timeout=8 * 60)


def output(ready, status):
    output_file = os.environ.get("GITHUB_OUTPUT")
    if output_file:
        with open(output_file, "a", encoding="utf-8") as handle:
            handle.write(f"ready={'true' if ready else 'false'}\n")
            handle.write(f"refresh_status={status}\n")


def source_available():
    """Avoid spending many minutes retrying every region on a broad RSS outage."""
    editions = (
        "https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja",
        "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
        "https://news.google.com/rss?hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    )
    for url in editions:
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 WorldNewsGlobe/2.0",
                "Accept": "application/rss+xml, application/xml, text/xml, */*",
            })
            with urllib.request.urlopen(req, timeout=12) as response:
                if not response.read(256).strip():
                    raise ValueError("empty RSS response")
        except Exception as exc:
            print(f"::warning::RSS preflight unavailable: {exc}")
            return False
    return True


def main():
    had_valid_snapshot = valid_snapshot()
    with tempfile.TemporaryDirectory(prefix="world-news-last-good-") as temp:
        backup = Path(temp) / "data"
        if had_valid_snapshot:
            shutil.copytree(ROOT, backup)

        try:
            if not source_available():
                raise RuntimeError("RSS preflight unavailable")
            run("scripts/fetch_news_ranked_v2.py")
            run("scripts/fetch_world_news_ranked_v2.py")
            # Prefecture boundaries are effectively static. Fetch only when
            # neither the cache nor the already-published Pages site has them.
            if not valid_map():
                run("scripts/fetch_japan_map.py")
            else:
                print("Reusing validated Japan GeoJSON; no map downloads")
            validate()
        except (subprocess.CalledProcessError, OSError, ValueError,
                KeyError, TypeError, RuntimeError, subprocess.TimeoutExpired) as exc:
            print(f"::warning::News refresh could not complete ({exc}); "
                  "preserving the existing Pages deployment.")
            if had_valid_snapshot:
                if ROOT.exists():
                    shutil.rmtree(ROOT)
                shutil.copytree(backup, ROOT)
                print("Restored last-known-good local data; deployment skipped")
            else:
                print("No valid previous cache available; deployment skipped")
            output(False, "skipped")
            return

    print("Fresh complete snapshot is ready for GitHub Pages")
    output(True, "updated")


if __name__ == "__main__":
    main()
