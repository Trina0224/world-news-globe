#!/usr/bin/env python3
import json
import os
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

OUT = "data/countries/jp.json"
URL = "https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 WorldNewsGlobe/1.0",
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        return response.read()


def text(node, name):
    child = node.find(name)
    return (child.text or "").strip() if child is not None else ""


def main():
    root = ET.fromstring(fetch(URL))
    items = []
    seen = set()
    for item in root.findall("./channel/item"):
        title = text(item, "title")
        link = text(item, "link")
        pub = text(item, "pubDate")
        source_node = item.find("source")
        source = (source_node.text or "").strip() if source_node is not None else ""
        if not title or not link or title in seen:
            continue
        seen.add(title)
        try:
            published = parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat()
        except Exception:
            published = pub
        items.append({
            "title": title,
            "url": link,
            "source": source,
            "published": published,
            "language": "Japanese",
        })
        if len(items) >= 20:
            break

    if not items:
        raise RuntimeError("Google News RSS returned no items")

    payload = {
        "location": "Japan",
        "source": "Google News RSS",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "articles": items,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Wrote {len(items)} headlines to {OUT}")


if __name__ == "__main__":
    main()
