#!/usr/bin/env python3
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from difflib import SequenceMatcher

SOURCE_SUFFIX_RE = re.compile(r"\s+[-–—|]\s+[^-–—|]{2,60}$")
WORD_RE = re.compile(r"[\w']+", re.UNICODE)

# Small, deliberately conservative bonus. It never excludes other publishers.
TIER_A = {
    'reuters','associated press','ap news','bbc','cnn','nbc news','abc news','cbs news','npr',
    'nhk','共同通信','時事通信','中央社','公視新聞網','the guardian','financial times','bloomberg'
}
TIER_B_HINTS = (
    'times','post','journal','tribune','herald','daily','news','press','テレビ','新聞','放送','tv'
)


def norm(text):
    text = unicodedata.normalize('NFKC', text or '').casefold().strip()
    text = SOURCE_SUFFIX_RE.sub('', text)
    return re.sub(r'\s+', ' ', text)


def signature(title):
    text = norm(title)
    words = {w for w in WORD_RE.findall(text) if len(w) > 1}
    compact = re.sub(r"[^\w\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+", '', text)
    grams = {compact[i:i+2] for i in range(len(compact)-1)} if len(compact) >= 2 else set()
    return text, words, grams


def jac(a,b):
    return len(a & b) / max(1, len(a | b)) if a and b else 0.0


def same_event(a,b):
    ta,wa,ga = a['_sig']; tb,wb,gb = b['_sig']
    if ta == tb: return True
    if SequenceMatcher(None, ta, tb).ratio() >= 0.76: return True
    if len(wa) >= 3 and len(wb) >= 3 and jac(wa,wb) >= 0.45: return True
    if len(ga) >= 8 and len(gb) >= 8 and jac(ga,gb) >= 0.52: return True
    return False


def parse_time(v):
    try:
        return datetime.fromisoformat((v or '').replace('Z','+00:00')).astimezone(timezone.utc)
    except Exception:
        return None


def source_name(item):
    return norm(item.get('source') or item.get('publisher') or item.get('feed') or '')


def source_bonus(source):
    s = norm(source)
    if not s: return 0.0
    if s in TIER_A or any(x in s for x in TIER_A): return 2.2
    if any(h in s for h in TIER_B_HINTS): return 0.8
    return 0.0


def location_relevance(title, terms, require_location=False):
    t = norm(title)
    hits = []
    for term in terms or []:
        q = norm(term)
        if q and q in t: hits.append(q)
    if not hits:
        return -8.0 if require_location else 0.0
    longest = max(hits, key=len)
    return 7.5 if t.startswith(longest) else 5.5


def title_quality(title):
    n = len((title or '').strip())
    if n < 18: return -2.5
    if n <= 170: return 1.4
    if n > 230: return -1.2
    return 0.3


def rank_articles_v2(articles, location_terms=None, limit=10, source_limit=2, require_location=False):
    now = datetime.now(timezone.utc)
    prepared=[]; seen_urls=set()
    for idx, raw in enumerate(articles or []):
        title=(raw.get('title') or '').strip(); url=(raw.get('url') or '').strip()
        if not title or not url or url in seen_urls: continue
        seen_urls.add(url)
        item=dict(raw); item['_sig']=signature(title); item['_idx']=idx
        prepared.append(item)

    clusters=[]
    for item in prepared:
        target=None
        for cluster in clusters:
            if any(same_event(item, other) for other in cluster):
                target=cluster
                break
        if target is None:
            clusters.append([item])
        else:
            target.append(item)

    reps=[]
    for cluster in clusters:
        sources={source_name(x) for x in cluster if source_name(x)}
        feeds={norm(x.get('feed') or '') for x in cluster if x.get('feed')}
        # Independent publisher coverage is the strongest importance signal.
        coverage=len(sources)
        coverage_score=min(15.0, 4.0 * max(0, coverage-1))
        feed_diversity=min(3.0, 0.8 * max(0, len(feeds)-1))
        best=None; best_score=-1e9
        for item in cluster:
            dt=parse_time(item.get('published'))
            hours=max(0.0,(now-dt).total_seconds()/3600.0) if dt else 12.0
            recency=max(0.0,5.5-hours/4.5)
            relevance=location_relevance(item.get('title',''), location_terms, require_location)
            score=coverage_score+feed_diversity+recency+relevance+title_quality(item.get('title',''))+source_bonus(item.get('source',''))
            score += max(0.0,1.2-item['_idx']*0.015)
            if score>best_score: best_score=score; best=item
        if best:
            clean={k:v for k,v in best.items() if not k.startswith('_')}
            clean['rank_score']=round(best_score,2)
            clean['coverage']=max(1,coverage)
            clean['feed_coverage']=max(1,len(feeds))
            reps.append(clean)

    reps.sort(key=lambda x:(-x.get('rank_score',0), x.get('published','')))
    selected=[]; source_counts=Counter()
    for item in reps:
        src=source_name(item) or 'unknown'
        if source_counts[src] >= source_limit: continue
        source_counts[src]+=1; selected.append(item)
        if len(selected)>=limit: break
    return selected
