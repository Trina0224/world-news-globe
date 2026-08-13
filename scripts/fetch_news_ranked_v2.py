#!/usr/bin/env python3
import os
import time
from datetime import datetime, timezone

import fetch_news_ranked as base
from news_rank_v2 import rank_articles_v2


def merge_queries(queries, edition, language):
    merged=[]
    for i,q in enumerate(queries):
        try:
            merged.extend(base.parse_feed(f'v2-{i+1}', base.search_url(q, edition), language))
        except Exception as exc:
            print(f'WARNING v2 query {q}: {exc}')
        time.sleep(.04)
    return merged


def write(path, location, scope, candidates, ranked):
    base.write_payload(path, location, ranked, scope, len(candidates))
    # Add explicit ranking metadata without changing the front-end schema.
    import json
    with open(path, encoding='utf-8') as f: payload=json.load(f)
    payload['ranking']='multi-feed-event-v2'
    payload['source_count']=len({a.get('source','').strip() for a in candidates if a.get('source','').strip()})
    with open(path,'w',encoding='utf-8') as f:
        json.dump(payload,f,ensure_ascii=False,indent=2);f.write('\n')


def rebuild_japan_national():
    candidates=[]
    for name,url in base.JP_NATIONAL_FEEDS:
        try: candidates.extend(base.parse_feed(name,url,'Japanese'))
        except Exception as exc: print('WARNING Japan base feed:',exc)
    candidates += merge_queries([
        '日本 政府 when:1d','日本 経済 when:1d','日本 事件 when:1d','日本 社会 when:1d','日本 災害 when:1d'
    ],'jp','Japanese')
    ranked=rank_articles_v2(candidates,['日本','国内'],10,2,False)
    if len(ranked)<10: raise RuntimeError(f'Japan v2 produced only {len(ranked)} headlines')
    write(base.JP_COUNTRY_OUT,'Japan','country',candidates,ranked)
    print(f'Japan v2: {len(ranked)} from {len(candidates)} candidates')


def rebuild_california():
    queries=[
        '"California" breaking news when:1d',
        '"California" state government when:1d',
        '"California" economy when:1d',
        '"California" wildfire earthquake weather when:1d',
        '"California" local news when:1d'
    ]
    candidates=merge_queries(queries,'us','English')
    ranked=rank_articles_v2(candidates,['California'],10,2,True)
    if len(ranked)<6: raise RuntimeError(f'California v2 produced only {len(ranked)} headlines')
    write(os.path.join(base.US_DIR,'california.json'),'California','state',candidates,ranked)
    print(f'California v2: {len(ranked)} from {len(candidates)} candidates')


def main():
    # Keep all existing proven region generation, then replace benchmark feeds with v2 output.
    base.main()
    rebuild_japan_national()
    rebuild_california()


if __name__=='__main__': main()
