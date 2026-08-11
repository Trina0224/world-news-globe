#!/usr/bin/env python3
import json
import os
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

OUT = "data/countries/jp.json"
BASE = "https://news.google.com/rss"
FEEDS = [
    ("top", f"{BASE}?hl=ja&gl=JP&ceid=JP:ja"),
    ("nation", f"{BASE}/headlines/section/topic/NATION?hl=ja&gl=JP&ceid=JP:ja"),
    ("japan", f"{BASE}/search?q={urllib.parse.quote('日本')}&hl=ja&gl=JP&ceid=JP:ja"),
    ("domestic", f"{BASE}/search?q={urllib.parse.quote('国内')}&hl=ja&gl=JP&ceid=JP:ja"),
]


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


def parse_feed(name: str, url: str):
    root = ET.fromstring(fetch(url))
    result = []
    for item in root.findall("./channel/item"):
        title = text(item, "title")
        link = text(item, "link")
        pub = text(item, "pubDate")
        source_node = item.find("source")
        source = (source_node.text or "").strip() if source_node is not None else ""
        if not title or not link:
            continue
        try:
            published = parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat()
        except Exception:
            published = pub
        result.append({
            "title": title,
            "url": link,
            "source": source,
            "published": published,
            "language": "Japanese",
            "feed": name,
        })
    print(f"{name}: {len(result)} RSS items")
    return result


def main():
    merged = []
    for name, url in FEEDS:
        try:
            merged.extend(parse_feed(name, url))
        except Exception as exc:
            print(f"WARNING: {name} feed failed: {exc}")

    items = []
    seen = set()
    for article in merged:
        key = article["title"].strip().casefold()
        if key in seen:
            continue
        seen.add(key)
        items.append(article)
        if len(items) >= 20:
            break

    if len(items) < 10:
        raise RuntimeError(f"Only {len(items)} unique Japan headlines were produced; refusing to deploy")

    payload = {
        "location": "Japan",
        "source": "Google News RSS",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "article_count": len(items),
        "articles": items,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Wrote {len(items)} unique headlines to {OUT}")


if __name__ == "__main__":
    main()
