#!/usr/bin/env python3
import json
import os
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from news_rank import rank_articles

BASE = "https://news.google.com/rss"
JP_COUNTRY_OUT, JP_DIR = "data/countries/jp.json", "data/jp"
US_COUNTRY_OUT, US_DIR = "data/countries/us.json", "data/us"

JP_NATIONAL_FEEDS = [
    ("top", f"{BASE}?hl=ja&gl=JP&ceid=JP:ja"),
    ("nation", f"{BASE}/headlines/section/topic/NATION?hl=ja&gl=JP&ceid=JP:ja"),
    ("japan", f"{BASE}/search?q={urllib.parse.quote('日本 when:1d')}&hl=ja&gl=JP&ceid=JP:ja"),
]
US_NATIONAL_FEEDS = [
    ("top", f"{BASE}?hl=en-US&gl=US&ceid=US:en"),
    ("nation", f"{BASE}/headlines/section/topic/NATION?hl=en-US&gl=US&ceid=US:en"),
    ("usa", f"{BASE}/search?q={urllib.parse.quote('United States when:1d')}&hl=en-US&gl=US&ceid=US:en"),
]

PREFECTURES = [
("hokkaido","北海道","北海道"),("aomori","青森県","青森"),("iwate","岩手県","岩手"),("miyagi","宮城県","宮城"),("akita","秋田県","秋田"),("yamagata","山形県","山形"),("fukushima","福島県","福島"),("ibaraki","茨城県","茨城"),("tochigi","栃木県","栃木"),("gunma","群馬県","群馬"),("saitama","埼玉県","埼玉"),("chiba","千葉県","千葉"),("tokyo","東京都","東京"),("kanagawa","神奈川県","神奈川"),("niigata","新潟県","新潟"),("toyama","富山県","富山"),("ishikawa","石川県","石川"),("fukui","福井県","福井"),("yamanashi","山梨県","山梨"),("nagano","長野県","長野"),("gifu","岐阜県","岐阜"),("shizuoka","静岡県","静岡"),("aichi","愛知県","愛知"),("mie","三重県","三重"),("shiga","滋賀県","滋賀"),("kyoto","京都府","京都"),("osaka","大阪府","大阪"),("hyogo","兵庫県","兵庫"),("nara","奈良県","奈良"),("wakayama","和歌山県","和歌山"),("tottori","鳥取県","鳥取"),("shimane","島根県","島根"),("okayama","岡山県","岡山"),("hiroshima","広島県","広島"),("yamaguchi","山口県","山口"),("tokushima","徳島県","徳島"),("kagawa","香川県","香川"),("ehime","愛媛県","愛媛"),("kochi","高知県","高知"),("fukuoka","福岡県","福岡"),("saga","佐賀県","佐賀"),("nagasaki","長崎県","長崎"),("kumamoto","熊本県","熊本"),("oita","大分県","大分"),("miyazaki","宮崎県","宮崎"),("kagoshima","鹿児島県","鹿児島"),("okinawa","沖縄県","沖縄")]

US_REGIONS = [
("alabama","Alabama"),("alaska","Alaska"),("arizona","Arizona"),("arkansas","Arkansas"),("california","California"),("colorado","Colorado"),("connecticut","Connecticut"),("delaware","Delaware"),("district-of-columbia","District of Columbia"),("florida","Florida"),("georgia","Georgia"),("hawaii","Hawaii"),("idaho","Idaho"),("illinois","Illinois"),("indiana","Indiana"),("iowa","Iowa"),("kansas","Kansas"),("kentucky","Kentucky"),("louisiana","Louisiana"),("maine","Maine"),("maryland","Maryland"),("massachusetts","Massachusetts"),("michigan","Michigan"),("minnesota","Minnesota"),("mississippi","Mississippi"),("missouri","Missouri"),("montana","Montana"),("nebraska","Nebraska"),("nevada","Nevada"),("new-hampshire","New Hampshire"),("new-jersey","New Jersey"),("new-mexico","New Mexico"),("new-york","New York"),("north-carolina","North Carolina"),("north-dakota","North Dakota"),("ohio","Ohio"),("oklahoma","Oklahoma"),("oregon","Oregon"),("pennsylvania","Pennsylvania"),("rhode-island","Rhode Island"),("south-carolina","South Carolina"),("south-dakota","South Dakota"),("tennessee","Tennessee"),("texas","Texas"),("utah","Utah"),("vermont","Vermont"),("virginia","Virginia"),("washington","Washington"),("west-virginia","West Virginia"),("wisconsin","Wisconsin"),("wyoming","Wyoming")]

def fetch(url):
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 WorldNewsGlobe/2.0","Accept":"application/rss+xml, application/xml, text/xml, */*"})
    with urllib.request.urlopen(req,timeout=20) as response:return response.read()

def parse_feed(feed,url,language):
    root=ET.fromstring(fetch(url)); out=[]
    for item in root.findall("./channel/item"):
        def txt(n):
            x=item.find(n); return (x.text or "").strip() if x is not None else ""
        title,link,pub=txt("title"),txt("link"),txt("pubDate")
        source_node=item.find("source"); source=(source_node.text or "").strip() if source_node is not None else ""
        if not title or not link: continue
        try: published=parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat()
        except Exception: published=pub
        out.append({"title":title,"url":link,"source":source,"published":published,"language":language,"feed":feed})
    return out

def search_url(query,edition):
    if edition=="jp":return f"{BASE}/search?q={urllib.parse.quote(query)}&hl=ja&gl=JP&ceid=JP:ja"
    return f"{BASE}/search?q={urllib.parse.quote(query)}&hl=en-US&gl=US&ceid=US:en"

def write_payload(path,location,articles,scope,candidates):
    os.makedirs(os.path.dirname(path),exist_ok=True)
    with open(path,"w",encoding="utf-8") as f:
        json.dump({"location":location,"scope":scope,"source":"Google News RSS","generated_at":datetime.now(timezone.utc).isoformat(),"candidate_count":candidates,"article_count":len(articles),"articles":articles},f,ensure_ascii=False,indent=2);f.write("\n")

def build_national(feeds,path,location,language,terms):
    merged=[]
    for name,url in feeds:
        try: merged.extend(parse_feed(name,url,language))
        except Exception as e: print(f"WARNING {location}/{name}: {e}")
    ranked=rank_articles(merged,terms,10,2)
    if len(ranked)<10: raise RuntimeError(f"{location}: only {len(ranked)} ranked national headlines")
    write_payload(path,location,ranked,"country",len(merged));print(f"{location}: {len(ranked)} from {len(merged)} candidates")

def build_pref(slug,label,short):
    merged=[]
    queries=[f'"{label}" ニュース when:1d']
    if short!=label:queries.append(f'"{short}" ニュース when:1d')
    for i,q in enumerate(queries):
        try:merged.extend(parse_feed(f"pref-{i+1}",search_url(q,"jp"),"Japanese"))
        except Exception as e:print(f"WARNING {label}: {e}")
        time.sleep(.04)
    ranked=rank_articles(merged,[label,short],10,2)
    write_payload(os.path.join(JP_DIR,slug+".json"),label,ranked,"prefecture",len(merged));print(f"{label}: {len(ranked)} from {len(merged)}")

def build_us(slug,label):
    if label=="Georgia": q='"Georgia" state local news when:1d';terms=["Georgia"]
    elif label=="Washington":q='"Washington state" local news when:1d';terms=["Washington state","Washington"]
    elif label=="District of Columbia":q='"Washington DC" local news when:1d';terms=["Washington DC","Washington, D.C.","District of Columbia"]
    else:q=f'"{label}" local news when:1d';terms=[label]
    try:candidates=parse_feed("region",search_url(q,"us"),"English");ranked=rank_articles(candidates,terms,10,2)
    except Exception as e:print(f"WARNING {label}: {e}");candidates=[];ranked=[]
    write_payload(os.path.join(US_DIR,slug+".json"),label,ranked,"state",len(candidates));print(f"{label}: {len(ranked)} from {len(candidates)}")

def main():
    build_national(JP_NATIONAL_FEEDS,JP_COUNTRY_OUT,"Japan","Japanese",["日本","国内"])
    for row in PREFECTURES:build_pref(*row);time.sleep(.04)
    build_national(US_NATIONAL_FEEDS,US_COUNTRY_OUT,"United States","English",["United States","U.S.","US"])
    for row in US_REGIONS:build_us(*row);time.sleep(.04)
    print("Ranked Japan/US feeds complete")

if __name__=="__main__":main()
