#!/usr/bin/env python3
import json
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

WORLD_ATLAS = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json"
BASE = "https://news.google.com/rss/search"
OUT = "data/world.json"

# Exact world-atlas country names -> localized Google News edition.
# Countries not listed here still get a country-name search via the US-English edition.
EDITIONS = {
    "Taiwan": ("台灣", "zh-TW", "TW", "TW:zh-Hant", "Traditional Chinese"),
    "China": ("中國", "zh-CN", "CN", "CN:zh-Hans", "Simplified Chinese"),
    "South Korea": ("대한민국", "ko", "KR", "KR:ko", "Korean"),
    "India": ("India", "en-IN", "IN", "IN:en", "English"),
    "United Kingdom": ("United Kingdom", "en-GB", "GB", "GB:en", "English"),
    "Canada": ("Canada", "en-CA", "CA", "CA:en", "English"),
    "Australia": ("Australia", "en-AU", "AU", "AU:en", "English"),
    "New Zealand": ("New Zealand", "en-NZ", "NZ", "NZ:en", "English"),
    "Singapore": ("Singapore", "en-SG", "SG", "SG:en", "English"),
    "Malaysia": ("Malaysia", "en-MY", "MY", "MY:en", "English"),
    "Philippines": ("Philippines", "en-PH", "PH", "PH:en", "English"),
    "France": ("France", "fr", "FR", "FR:fr", "French"),
    "Germany": ("Deutschland", "de", "DE", "DE:de", "German"),
    "Italy": ("Italia", "it", "IT", "IT:it", "Italian"),
    "Spain": ("España", "es", "ES", "ES:es", "Spanish"),
    "Portugal": ("Portugal", "pt-PT", "PT", "PT:pt-150", "Portuguese"),
    "Brazil": ("Brasil", "pt-BR", "BR", "BR:pt-419", "Portuguese"),
    "Mexico": ("México", "es-419", "MX", "MX:es-419", "Spanish"),
    "Argentina": ("Argentina", "es-419", "AR", "AR:es-419", "Spanish"),
    "Chile": ("Chile", "es-419", "CL", "CL:es-419", "Spanish"),
    "Colombia": ("Colombia", "es-419", "CO", "CO:es-419", "Spanish"),
    "Netherlands": ("Nederland", "nl", "NL", "NL:nl", "Dutch"),
    "Belgium": ("België", "nl", "BE", "BE:nl", "Dutch"),
    "Switzerland": ("Schweiz", "de", "CH", "CH:de", "German"),
    "Austria": ("Österreich", "de", "AT", "AT:de", "German"),
    "Sweden": ("Sverige", "sv", "SE", "SE:sv", "Swedish"),
    "Norway": ("Norge", "no", "NO", "NO:no", "Norwegian"),
    "Denmark": ("Danmark", "da", "DK", "DK:da", "Danish"),
    "Finland": ("Suomi", "fi", "FI", "FI:fi", "Finnish"),
    "Poland": ("Polska", "pl", "PL", "PL:pl", "Polish"),
    "Czechia": ("Česko", "cs", "CZ", "CZ:cs", "Czech"),
    "Greece": ("Ελλάδα", "el", "GR", "GR:el", "Greek"),
    "Turkey": ("Türkiye", "tr", "TR", "TR:tr", "Turkish"),
    "Israel": ("ישראל", "he", "IL", "IL:he", "Hebrew"),
    "Saudi Arabia": ("السعودية", "ar", "SA", "SA:ar", "Arabic"),
    "United Arab Emirates": ("الإمارات", "ar", "AE", "AE:ar", "Arabic"),
    "Egypt": ("مصر", "ar", "EG", "EG:ar", "Arabic"),
    "South Africa": ("South Africa", "en-ZA", "ZA", "ZA:en", "English"),
    "Indonesia": ("Indonesia", "id", "ID", "ID:id", "Indonesian"),
    "Thailand": ("ประเทศไทย", "th", "TH", "TH:th", "Thai"),
    "Vietnam": ("Việt Nam", "vi", "VN", "VN:vi", "Vietnamese"),
}


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 WorldNewsGlobe/1.0",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
    })
    with urllib.request.urlopen(req, timeout=20) as response:
        return response.read()


def country_names():
    data = json.loads(fetch_bytes(WORLD_ATLAS).decode("utf-8"))
    geoms = data["objects"]["countries"]["geometries"]
    names = []
    for geom in geoms:
        name = (geom.get("properties") or {}).get("name")
        if name and name not in {"Antarctica", "Japan", "United States of America", "United States"}:
            names.append(name)
    return sorted(set(names))


def rss_url(name: str):
    if name in EDITIONS:
        query, hl, gl, ceid, language = EDITIONS[name]
    else:
        query, hl, gl, ceid, language = name, "en-US", "US", "US:en", "English"
    q = f'"{query}" news when:1d'
    return f"{BASE}?q={urllib.parse.quote(q)}&hl={urllib.parse.quote(hl)}&gl={gl}&ceid={urllib.parse.quote(ceid)}", language


def parse_country(name: str):
    url, language = rss_url(name)
    last_error = None
    for attempt in range(2):
        try:
            root = ET.fromstring(fetch_bytes(url))
            items, seen = [], set()
            for item in root.findall("./channel/item"):
                title_node = item.find("title")
                link_node = item.find("link")
                pub_node = item.find("pubDate")
                source_node = item.find("source")
                title = (title_node.text or "").strip() if title_node is not None else ""
                link = (link_node.text or "").strip() if link_node is not None else ""
                if not title or not link:
                    continue
                key = title.casefold()
                if key in seen:
                    continue
                seen.add(key)
                pub = (pub_node.text or "").strip() if pub_node is not None else ""
                try:
                    published = parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat()
                except Exception:
                    published = pub
                source = (source_node.text or "").strip() if source_node is not None else ""
                items.append({
                    "title": title,
                    "url": link,
                    "source": source,
                    "published": published,
                    "language": language,
                })
                if len(items) >= 10:
                    break
            return name, items, None
        except Exception as exc:
            last_error = str(exc)
            time.sleep(0.8 * (attempt + 1))
    return name, [], last_error


def main():
    names = country_names()
    countries = {}
    errors = {}
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(parse_country, name): name for name in names}
        for future in as_completed(futures):
            name, items, error = future.result()
            countries[name] = {
                "location": name,
                "source": "Google News RSS",
                "article_count": len(items),
                "articles": items,
            }
            if error:
                errors[name] = error
            print(f"{name}: {len(items)} headlines" + (f" ({error})" if error else ""))

    taiwan = countries.get("Taiwan", {}).get("articles", [])
    if len(taiwan) < 10:
        raise RuntimeError(f"Taiwan feed produced only {len(taiwan)} headlines")

    nonempty = sum(1 for v in countries.values() if v.get("articles"))
    if nonempty < 145:
        raise RuntimeError(f"Only {nonempty}/{len(countries)} world country feeds produced headlines")

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Google News RSS",
        "country_count": len(countries),
        "nonempty_count": nonempty,
        "countries": dict(sorted(countries.items())),
        "errors": errors,
    }
    import os
    os.makedirs("data", exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"Wrote {len(countries)} country feeds ({nonempty} non-empty) to {OUT}")


if __name__ == "__main__":
    main()
