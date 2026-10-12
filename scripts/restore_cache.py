#!/usr/bin/env python3
"""Recover the last published news snapshot before fetching new RSS data.

The runner's workspace is ephemeral. GitHub Actions cache is the first choice;
the published Pages site bootstraps a cold/evicted cache without an API token.
"""
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen

from fetch_news_ranked import PREFECTURES, US_REGIONS

PUBLIC = "https://trina0224.github.io/world-news-globe"
ROOT = Path("data")


def paths():
    core = [
        "countries/jp.json", "countries/us.json", "world.json",
        "maps/japan-prefectures.geojson",
    ]
    regions = [f"jp/{slug}.json" for slug, *_ in PREFECTURES]
    regions += [f"us/{slug}.json" for slug, _ in US_REGIONS]
    return core + regions


def valid_json(path):
    try:
        with path.open(encoding="utf-8") as f:
            return isinstance(json.load(f), dict)
    except (OSError, ValueError):
        return False


def recover(relative):
    target = ROOT / relative
    if valid_json(target):
        return relative, True, "cached"
    url = f"{PUBLIC}/data/{relative}"
    try:
        req = Request(url, headers={"User-Agent": "WorldNewsGlobe/2.0"})
        with urlopen(req, timeout=12) as response:
            raw = response.read(12 * 1024 * 1024 + 1)
        if len(raw) > 12 * 1024 * 1024:
            raise ValueError("file exceeds size limit")
        value = json.loads(raw.decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("expected JSON object")
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(target.suffix + ".tmp")
        tmp.write_bytes(raw)
        os.replace(tmp, target)
        return relative, True, "Pages"
    except Exception as exc:
        return relative, False, str(exc)


def main():
    all_paths = paths()
    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(recover, all_paths))
    cached = sum(status == "cached" for _, ok, status in results if ok)
    restored = sum(status == "Pages" for _, ok, status in results if ok)
    missing = [name for name, ok, _ in results if not ok]
    print(f"Snapshot: {cached} cached; {restored} recovered from Pages; {len(missing)} unavailable")
    if missing:
        print(f"Snapshot missing examples: {', '.join(missing[:8])}")
        print("::notice::Missing snapshots are allowed; fresh generation will be attempted.")


if __name__ == "__main__":
    main()
