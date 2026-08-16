#!/usr/bin/env python3
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from difflib import SequenceMatcher

SOURCE_SUFFIX_RE = re.compile(r"\s+[-–—|]\s+[^-–—|]{2,60}$")
WORD_RE = re.compile(r"[\w']+", re.UNICODE)

# Conservative publisher bonus only. Unknown publishers are never excluded.
TIER_A = {
    'reuters','associated press','ap news','bbc','cnn','nbc news','abc news','cbs news','npr',
    'nhk','共同通信','時事通信','中央社','公視新聞網','the guardian','financial times','bloomberg',
    'the new york times','washington post','los angeles times','wall street journal','日本経済新聞','朝日新聞','読売新聞','毎日新聞'
}
TIER_B_HINTS = (
    'times','post','journal','tribune','herald','daily','news','press','テレビ','新聞','放送','tv','radio'
)

# Feed intent matters: a headline seen in a top/nation/breaking feed gets a small editorial bonus.
FEED_BONUS = {
    'top': 3.0,
    'nation': 2.6,
    'breaking': 2.4,
    'disaster': 2.2,
    'government': 1.8,
    'economy': 1.5,
    'society': 1.2,
    'local': 1.0,
}

HARD_NEWS_TERMS = (
    # English
    'election','president','prime minister','governor','government','parliament','congress','senate','court','law','bill',
    'earthquake','wildfire','fire','flood','storm','typhoon','hurricane','tornado','crash','explosion','shooting','attack',
    'economy','inflation','tariff','jobs','unemployment','interest rate','bank','market','trade','budget','tax',
    # Japanese
    '政府','首相','国会','選挙','知事','裁判','法律','地震','台風','豪雨','洪水','火災','事故','事件','経済','物価','金利','予算',
    # Traditional Chinese
    '政府','總統','立法院','選舉','行政院','法院','法律','地震','颱風','豪雨','洪水','火災','事故','攻擊','經濟','通膨','關稅','利率','預算','稅'
)

LOW_VALUE_TERMS = (
    # PR / commerce / evergreen / opinion-style pages that often pollute Google News RSS.
    'press release','sponsored','partner content','advertorial','buy now','deal','deals','coupon','review:',
    'best of','how to','what to know','everything you need to know','opinion','commentary','horoscope',
    'プレスリリース','PR TIMES','おすすめ','ランキング','レビュー','解説：',
    '新聞稿','業配','優惠','折扣','推薦','懶人包','開箱','星座','評論：'
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
    if s in TIER_A or any(x in s for x in TIER_A): return 2.4
    if any(h in s for h in TIER_B_HINTS): return 0.7
    return 0.0


def feed_bonus(feed):
    f = norm(feed)
    best = 0.0
    for key, value in FEED_BONUS.items():
        if key in f:
            best = max(best, value)
    return best


def editorial_score(title):
    t = norm(title)
    score = 0.0
    if any(term.casefold() in t for term in HARD_NEWS_TERMS):
        score += 2.6
    if any(term.casefold() in t for term in LOW_VALUE_TERMS):
        score -= 5.0
    # Sensational punctuation/clickbait is only a mild penalty, not a filter.
    if t.count('!') + t.count('！') >= 2:
        score -= 1.0
    if '?' in t or '？' in t:
        if any(x in t for x in ('why ','how ','what ','なぜ','どうして','為何','怎麼')):
            score -= 0.7
    return score


def location_relevance(title, terms, require_location=False):
    t = norm(title)
    hits = []
    for term in terms or []:
        q = norm(term)
        if q and q in t: hits.append(q)
    if not hits:
        return -9.0 if require_location else 0.0
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
        coverage=len(sources)
        # Multiple independent publishers is the strongest importance signal.
        coverage_score=min(18.0, 4.5 * max(0, coverage-1))
        feed_diversity=min(3.5, 0.9 * max(0, len(feeds)-1))
        best=None; best_score=-1e9; best_signals=None
        for item in cluster:
            dt=parse_time(item.get('published'))
            hours=max(0.0,(now-dt).total_seconds()/3600.0) if dt else 12.0
            recency=max(0.0,6.0-hours/4.0)
            relevance=location_relevance(item.get('title',''), location_terms, require_location)
            src_bonus=source_bonus(item.get('source',''))
            f_bonus=feed_bonus(item.get('feed',''))
            edit=editorial_score(item.get('title',''))
            quality=title_quality(item.get('title',''))
            # Keep Google ordering only as an extremely small tie-breaker.
            position=max(0.0,0.35-item['_idx']*0.003)
            score=coverage_score+feed_diversity+recency+relevance+src_bonus+f_bonus+edit+quality+position
            if score>best_score:
                best_score=score; best=item
                best_signals={
                    'coverage': round(coverage_score,2), 'feed_diversity': round(feed_diversity,2),
                    'recency': round(recency,2), 'location': round(relevance,2), 'source': round(src_bonus,2),
                    'feed': round(f_bonus,2), 'editorial': round(edit,2), 'title_quality': round(quality,2)
                }
        if best:
            clean={k:v for k,v in best.items() if not k.startswith('_')}
            clean['rank_score']=round(best_score,2)
            clean['coverage']=max(1,coverage)
            clean['feed_coverage']=max(1,len(feeds))
            clean['rank_signals']=best_signals
            reps.append(clean)

    reps.sort(key=lambda x:(-x.get('rank_score',0), x.get('published','')))
    selected=[]; source_counts=Counter(); soft_counts=Counter()
    for item in reps:
        src=source_name(item) or 'unknown'
        if source_counts[src] >= source_limit: continue
        t=norm(item.get('title',''))
        bucket='general'
        if any(x in t for x in ('sport','sports','baseball','football','basketball','soccer','野球','サッカー','スポーツ','棒球','籃球','足球','體育')):
            bucket='sports'
        elif any(x in t for x in ('celebrity','movie','music','actor','actress','entertainment','芸能','映画','音楽','娛樂','電影','音樂','藝人')):
            bucket='entertainment'
        # Soft diversity cap: keep room for hard/local news without banning major sports/entertainment stories.
        if bucket in ('sports','entertainment') and soft_counts[bucket] >= 2:
            continue
        source_counts[src]+=1; soft_counts[bucket]+=1; selected.append(item)
        if len(selected)>=limit: break
    return selected
