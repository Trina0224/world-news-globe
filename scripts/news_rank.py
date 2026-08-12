#!/usr/bin/env python3
import math
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from difflib import SequenceMatcher

SOURCE_SUFFIX_RE = re.compile(r"\s+[-–—|]\s+[^-–—|]{2,50}$")
WORD_RE = re.compile(r"[\w']+", re.UNICODE)


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "").casefold().strip()
    text = SOURCE_SUFFIX_RE.sub("", text)
    text = re.sub(r"\s+", " ", text)
    return text


def title_signature(title: str):
    text = normalize_text(title)
    words = [w for w in WORD_RE.findall(text) if len(w) > 1]
    compact = re.sub(r"[^\w\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+", "", text)
    bigrams = {compact[i:i+2] for i in range(max(0, len(compact)-1))} if len(compact) >= 2 else set()
    return text, set(words), bigrams


def jaccard(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / max(1, len(a | b))


def same_event(a, b):
    ta, wa, ga = a["_sig"]
    tb, wb, gb = b["_sig"]
    if ta == tb:
        return True
    seq = SequenceMatcher(None, ta, tb).ratio()
    if seq >= 0.78:
        return True
    if len(wa) >= 3 and len(wb) >= 3 and jaccard(wa, wb) >= 0.48:
        return True
    if len(ga) >= 8 and len(gb) >= 8 and jaccard(ga, gb) >= 0.55:
        return True
    return False


def parse_time(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def location_score(title: str, terms):
    t = normalize_text(title)
    score = 0.0
    for term in terms or []:
        q = normalize_text(term)
        if not q:
            continue
        if q in t:
            score = max(score, 7.0 if t.startswith(q) else 5.0)
    return score


def quality_score(title: str):
    n = len((title or "").strip())
    if n < 18:
        return -2.0
    if 35 <= n <= 150:
        return 1.5
    if n > 220:
        return -1.0
    return 0.5


def rank_articles(articles, location_terms=None, limit=10, source_limit=2):
    now = datetime.now(timezone.utc)
    prepared = []
    seen_urls = set()
    for idx, raw in enumerate(articles or []):
        title = (raw.get("title") or "").strip()
        url = (raw.get("url") or "").strip()
        if not title or not url or url in seen_urls:
            continue
        seen_urls.add(url)
        item = dict(raw)
        item["_sig"] = title_signature(title)
        item["_idx"] = idx
        prepared.append(item)

    clusters = []
    for item in prepared:
        matched = None
        for cluster in clusters:
            if any(same_event(item, other) for other in cluster):
                matched = cluster
                break
        if matched is None:
            clusters.append([item])
        else:
            matched.append(item)

    representatives = []
    for cluster in clusters:
        sources = {normalize_text(x.get("source") or x.get("feed") or "") for x in cluster}
        sources.discard("")
        cluster_importance = min(12.0, 3.0 * max(0, len(sources) - 1))

        best = None
        best_score = -1e9
        for item in cluster:
            dt = parse_time(item.get("published"))
            hours = max(0.0, (now - dt).total_seconds() / 3600.0) if dt else 12.0
            recency = max(0.0, 5.0 - hours / 5.0)
            relevance = location_score(item.get("title", ""), location_terms)
            score = cluster_importance + recency + relevance + quality_score(item.get("title", ""))
            # Slightly prefer an earlier Google News result only as a tie-breaker.
            score += max(0.0, 1.5 - item["_idx"] * 0.025)
            if score > best_score:
                best_score = score
                best = item

        if best:
            clean = {k: v for k, v in best.items() if not k.startswith("_")}
            clean["rank_score"] = round(best_score, 2)
            clean["coverage"] = max(1, len(sources))
            representatives.append(clean)

    representatives.sort(key=lambda x: (-x.get("rank_score", 0), x.get("published", "")), reverse=False)

    selected = []
    source_counts = Counter()
    for item in representatives:
        source = normalize_text(item.get("source") or "") or "unknown"
        if source_counts[source] >= source_limit:
            continue
        source_counts[source] += 1
        selected.append(item)
        if len(selected) >= limit:
            break

    return selected
