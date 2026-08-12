#!/usr/bin/env python3
import json
import os
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

BASE = "https://news.google.com/rss"
JP_COUNTRY_OUT = "data/countries/jp.json"
JP_DIR = "data/jp"
US_COUNTRY_OUT = "data/countries/us.json"
US_DIR = "data/us"

JP_NATIONAL_FEEDS = [
    ("top", f"{BASE}?hl=ja&gl=JP&ceid=JP:ja"),
    ("nation", f"{BASE}/headlines/section/topic/NATION?hl=ja&gl=JP&ceid=JP:ja"),
    ("japan", f"{BASE}/search?q={urllib.parse.quote('日本')}&hl=ja&gl=JP&ceid=JP:ja"),
    ("domestic", f"{BASE}/search?q={urllib.parse.quote('国内')}&hl=ja&gl=JP&ceid=JP:ja"),
]

US_NATIONAL_FEEDS = [
    ("top", f"{BASE}?hl=en-US&gl=US&ceid=US:en"),
    ("nation", f"{BASE}/headlines/section/topic/NATION?hl=en-US&gl=US&ceid=US:en"),
    ("usa", f"{BASE}/search?q={urllib.parse.quote('United States when:1d')}&hl=en-US&gl=US&ceid=US:en"),
]

PREFECTURES = [
    ("hokkaido", "北海道", "北海道"), ("aomori", "青森県", "青森"), ("iwate", "岩手県", "岩手"),
    ("miyagi", "宮城県", "宮城"), ("akita", "秋田県", "秋田"), ("yamagata", "山形県", "山形"),
    ("fukushima", "福島県", "福島"), ("ibaraki", "茨城県", "茨城"), ("tochigi", "栃木県", "栃木"),
    ("gunma", "群馬県", "群馬"), ("saitama", "埼玉県", "埼玉"), ("chiba", "千葉県", "千葉"),
    ("tokyo", "東京都", "東京"), ("kanagawa", "神奈川県", "神奈川"), ("niigata", "新潟県", "新潟"),
    ("toyama", "富山県", "富山"), ("ishikawa", "石川県", "石川"), ("fukui", "福井県", "福井"),
    ("yamanashi", "山梨県", "山梨"), ("nagano", "長野県", "長野"), ("gifu", "岐阜県", "岐阜"),
    ("shizuoka", "静岡県", "静岡"), ("aichi", "愛知県", "愛知"), ("mie", "三重県", "三重"),
    ("shiga", "滋賀県", "滋賀"), ("kyoto", "京都府", "京都"), ("osaka", "大阪府", "大阪"),
    ("hyogo", "兵庫県", "兵庫"), ("nara", "奈良県", "奈良"), ("wakayama", "和歌山県", "和歌山"),
    ("tottori", "鳥取県", "鳥取"), ("shimane", "島根県", "島根"), ("okayama", "岡山県", "岡山"),
    ("hiroshima", "広島県", "広島"), ("yamaguchi", "山口県", "山口"), ("tokushima", "徳島県", "徳島"),
    ("kagawa", "香川県", "香川"), ("ehime", "愛媛県", "愛媛"), ("kochi", "高知県", "高知"),
    ("fukuoka", "福岡県", "福岡"), ("saga", "佐賀県", "佐賀"), ("nagasaki", "長崎県", "長崎"),
    ("kumamoto", "熊本県", "熊本"), ("oita", "大分県", "大分"), ("miyazaki", "宮崎県", "宮崎"),
    ("kagoshima", "鹿児島県", "鹿児島"), ("okinawa", "沖縄県", "沖縄"),
]

US_STATES = [
    ("alabama", "Alabama"), ("alaska", "Alaska"), ("arizona", "Arizona"), ("arkansas", "Arkansas"),
    ("california", "California"), ("colorado", "Colorado"), ("connecticut", "Connecticut"), ("delaware", "Delaware"),
    ("district-of-columbia", "District of Columbia"),
    ("florida", "Florida"), ("georgia", "Georgia"), ("hawaii", "Hawaii"), ("idaho", "Idaho"),
    ("illinois", "Illinois"), ("indiana", "Indiana"), ("iowa", "Iowa"), ("kansas", "Kansas"),
    ("kentucky", "Kentucky"), ("louisiana", "Louisiana"), ("maine", "Maine"), ("maryland", "Maryland"),
    ("massachusetts", "Massachusetts"), ("michigan", "Michigan"), ("minnesota", "Minnesota"), ("mississippi", "Mississippi"),
    ("missouri", "Missouri"), ("montana", "Montana"), ("nebraska", "Nebraska"), ("nevada", "Nevada"),
    ("new-hampshire", "New Hampshire"), ("new-jersey", "New Jersey"), ("new-mexico", "New Mexico"), ("new-york", "New York"),
    ("north-carolina", "North Carolina"), ("north-dakota", "North Dakota"), ("ohio", "Ohio"), ("oklahoma", "Oklahoma"),
    ("oregon", "Oregon"), ("pennsylvania", "Pennsylvania"), ("rhode-island", "Rhode Island"), ("south-carolina", "South Carolina"),
    ("south-dakota", "South Dakota"), ("tennessee", "Tennessee"), ("texas", "Texas"), ("utah", "Utah"),
    ("vermont", "Vermont"), ("virginia", "Virginia"), ("washington", "Washington"), ("west-virginia", "West Virginia"),
    ("wisconsin", "Wisconsin"), ("wyoming", "Wyoming"),
]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 WorldNewsGlobe/1.0",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
    })
    with urllib.request.urlopen(req, timeout=20) as response:
        return response.read()


def text(node, name):
    child = node.find(name)
    return (child.text or "").strip() if child is not None else ""


def parse_feed(name: str, url: str, language: str):
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
            "language": language,
            "feed": name,
        })
    return result


def unique_articles(articles, limit=20):
    result, seen = [], set()
    for article in articles:
        key = article["title"].strip().casefold()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(article)
        if len(result) >= limit:
            break
    return result


def search_url(query: str, edition: str):
    if edition == "jp":
        return f"{BASE}/search?q={urllib.parse.quote(query)}&hl=ja&gl=JP&ceid=JP:ja"
    return f"{BASE}/search?q={urllib.parse.quote(query)}&hl=en-US&gl=US&ceid=US:en"


def write_payload(path, location, articles, scope):
    payload = {
        "location": location,
        "scope": scope,
        "source": "Google News RSS",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "article_count": len(articles),
        "articles": articles,
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def build_national(feeds, out_path, location, language):
    merged = []
    for name, url in feeds:
        try:
            articles = parse_feed(name, url, language)
            print(f"{location}/national/{name}: {len(articles)} RSS items")
            merged.extend(articles)
        except Exception as exc:
            print(f"WARNING: {location}/national/{name} failed: {exc}")
    items = unique_articles(merged, 20)
    if len(items) < 10:
        raise RuntimeError(f"Only {len(items)} unique {location} headlines were produced; refusing to deploy")
    write_payload(out_path, location, items, "country")
    print(f"Wrote {len(items)} {location} national headlines")


def build_prefecture(slug, label, short_name):
    merged = []
    queries = [f'"{label}" ニュース when:1d']
    if short_name != label:
        queries.append(f'"{short_name}" ニュース when:1d')
    for index, query in enumerate(queries):
        try:
            merged.extend(parse_feed(f"prefecture-{index + 1}", search_url(query, "jp"), "Japanese"))
        except Exception as exc:
            print(f"WARNING: {label} query failed: {exc}")
        if len(unique_articles(merged, 10)) >= 10:
            break
        time.sleep(0.08)
    items = unique_articles(merged, 20)
    write_payload(os.path.join(JP_DIR, f"{slug}.json"), label, items, "prefecture")
    print(f"{label}: {len(items)} unique headlines")


def build_state(slug, label):
    if label == "Georgia":
        query = '"Georgia" state news when:1d'
    elif label == "Washington":
        query = '"Washington state" news when:1d'
    elif label == "District of Columbia":
        query = '"Washington DC" local news when:1d'
    else:
        query = f'"{label}" news when:1d'
    try:
        items = unique_articles(parse_feed("state", search_url(query, "us"), "English"), 20)
    except Exception as exc:
        print(f"WARNING: {label} query failed: {exc}")
        items = []
    write_payload(os.path.join(US_DIR, f"{slug}.json"), label, items, "state")
    print(f"{label}: {len(items)} unique headlines")


def main():
    build_national(JP_NATIONAL_FEEDS, JP_COUNTRY_OUT, "Japan", "Japanese")
    for slug, label, short_name in PREFECTURES:
        build_prefecture(slug, label, short_name)
        time.sleep(0.08)

    build_national(US_NATIONAL_FEEDS, US_COUNTRY_OUT, "United States", "English")
    for slug, label in US_STATES:
        build_state(slug, label)
        time.sleep(0.08)

    print(f"Generated Japan + {len(PREFECTURES)} prefectures; US + {len(US_STATES)} regions (50 states + DC)")


if __name__ == "__main__":
    main()
