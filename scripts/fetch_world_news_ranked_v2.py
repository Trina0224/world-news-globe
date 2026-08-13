#!/usr/bin/env python3
import json
import time
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import fetch_world_news_ranked as base
from news_rank_v2 import rank_articles_v2

BASE='https://news.google.com/rss'


def parse(url, feed):
    root=ET.fromstring(base.fetch_bytes(url)); out=[]
    for item in root.findall('./channel/item'):
        def txt(tag):
            x=item.find(tag); return (x.text or '').strip() if x is not None else ''
        title,link,pub=txt('title'),txt('link'),txt('pubDate')
        source_node=item.find('source'); source=(source_node.text or '').strip() if source_node is not None else ''
        if not title or not link: continue
        try: published=parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat()
        except Exception: published=pub
        out.append({'title':title,'url':link,'source':source,'published':published,'language':'Traditional Chinese','feed':feed})
    return out


def qurl(q):
    return f"{BASE}/search?q={urllib.parse.quote(q)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"


def rebuild_taiwan():
    feeds=[
        ('top',f'{BASE}?hl=zh-TW&gl=TW&ceid=TW:zh-Hant'),
        ('nation',f'{BASE}/headlines/section/topic/NATION?hl=zh-TW&gl=TW&ceid=TW:zh-Hant'),
        ('government',qurl('台灣 政府 when:1d')),
        ('economy',qurl('台灣 經濟 when:1d')),
        ('society',qurl('台灣 社會 when:1d')),
        ('breaking',qurl('台灣 重大 新聞 when:1d')),
        ('disaster',qurl('台灣 地震 災害 天氣 when:1d')),
    ]
    candidates=[]
    for name,url in feeds:
        try: candidates.extend(parse(url,name))
        except Exception as exc: print(f'WARNING Taiwan/{name}: {exc}')
        time.sleep(.04)
    ranked=rank_articles_v2(candidates,['台灣','臺灣'],10,2,False)
    if len(ranked)<10: raise RuntimeError(f'Taiwan v2 produced only {len(ranked)} headlines')
    return ranked,candidates


def main():
    base.main()
    with open(base.OUT,encoding='utf-8') as f: payload=json.load(f)
    ranked,candidates=rebuild_taiwan()
    payload['countries']['Taiwan']={
        'location':'Taiwan','source':'Google News RSS','ranking':'multi-feed-event-v2',
        'candidate_count':len(candidates),'source_count':len({a.get('source','').strip() for a in candidates if a.get('source','').strip()}),
        'article_count':len(ranked),'articles':ranked
    }
    payload['ranking']='event-cluster-v1 + Taiwan multi-feed-event-v2'
    payload['generated_at']=datetime.now(timezone.utc).isoformat()
    with open(base.OUT,'w',encoding='utf-8') as f:
        json.dump(payload,f,ensure_ascii=False,separators=(',',':'));f.write('\n')
    print(f'Taiwan v2: {len(ranked)} from {len(candidates)} candidates')


if __name__=='__main__': main()
