#!/usr/bin/env python3
import json
import math
import os
import urllib.request

BASE = "https://raw.githubusercontent.com/amay077/JapanPrefGeoJson/master/prefs"
OUT = "data/maps/japan-prefectures.geojson"

PREFS = [
    (1,'北海道','Hokkaido'),(2,'青森県','Aomori'),(3,'岩手県','Iwate'),(4,'宮城県','Miyagi'),(5,'秋田県','Akita'),(6,'山形県','Yamagata'),(7,'福島県','Fukushima'),
    (8,'茨城県','Ibaraki'),(9,'栃木県','Tochigi'),(10,'群馬県','Gunma'),(11,'埼玉県','Saitama'),(12,'千葉県','Chiba'),(13,'東京都','Tokyo'),(14,'神奈川県','Kanagawa'),
    (15,'新潟県','Niigata'),(16,'富山県','Toyama'),(17,'石川県','Ishikawa'),(18,'福井県','Fukui'),(19,'山梨県','Yamanashi'),(20,'長野県','Nagano'),(21,'岐阜県','Gifu'),
    (22,'静岡県','Shizuoka'),(23,'愛知県','Aichi'),(24,'三重県','Mie'),(25,'滋賀県','Shiga'),(26,'京都府','Kyoto'),(27,'大阪府','Osaka'),(28,'兵庫県','Hyogo'),
    (29,'奈良県','Nara'),(30,'和歌山県','Wakayama'),(31,'鳥取県','Tottori'),(32,'島根県','Shimane'),(33,'岡山県','Okayama'),(34,'広島県','Hiroshima'),(35,'山口県','Yamaguchi'),
    (36,'徳島県','Tokushima'),(37,'香川県','Kagawa'),(38,'愛媛県','Ehime'),(39,'高知県','Kochi'),(40,'福岡県','Fukuoka'),(41,'佐賀県','Saga'),(42,'長崎県','Nagasaki'),
    (43,'熊本県','Kumamoto'),(44,'大分県','Oita'),(45,'宮崎県','Miyazaki'),(46,'鹿児島県','Kagoshima'),(47,'沖縄県','Okinawa')
]


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent':'WorldNewsGlobe/1.0'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def sq_dist_point_segment(p, a, b):
    x, y = a; dx = b[0]-x; dy = b[1]-y
    if dx or dy:
        t = ((p[0]-x)*dx + (p[1]-y)*dy) / (dx*dx + dy*dy)
        if t > 1: x, y = b
        elif t > 0: x += dx*t; y += dy*t
    dx = p[0]-x; dy = p[1]-y
    return dx*dx + dy*dy


def simplify_ring(points, tol=0.02):
    if len(points) <= 8:
        return points
    closed = points[0] == points[-1]
    pts = points[:-1] if closed else points[:]
    if len(pts) <= 4:
        return points
    keep = [False]*len(pts); keep[0]=keep[-1]=True
    stack=[(0,len(pts)-1)]; tol2=tol*tol
    while stack:
        i,j=stack.pop(); best=-1; best_d=tol2
        for k in range(i+1,j):
            d=sq_dist_point_segment(pts[k],pts[i],pts[j])
            if d>best_d: best_d=d; best=k
        if best!=-1:
            keep[best]=True; stack.append((i,best)); stack.append((best,j))
    out=[p for p,k in zip(pts,keep) if k]
    if len(out)<3: out=pts[:3]
    if closed: out.append(out[0])
    return out


def simplify_geom(g):
    t=g.get('type'); c=g.get('coordinates')
    if t=='Polygon':
        return {'type':'Polygon','coordinates':[simplify_ring(r) for r in c]}
    if t=='MultiPolygon':
        return {'type':'MultiPolygon','coordinates':[[simplify_ring(r) for r in poly] for poly in c]}
    return g


def extract_geometry(data):
    if data.get('type') == 'FeatureCollection':
        geoms=[f.get('geometry') for f in data.get('features',[]) if f.get('geometry')]
        if len(geoms)==1: return geoms[0]
        polys=[]
        for g in geoms:
            if g['type']=='Polygon': polys.append(g['coordinates'])
            elif g['type']=='MultiPolygon': polys.extend(g['coordinates'])
        return {'type':'MultiPolygon','coordinates':polys}
    if data.get('type')=='Feature': return data['geometry']
    return data


def main():
    features=[]
    for code,label,value in PREFS:
        url=f"{BASE}/{code:02d}.geojson"
        data=fetch_json(url)
        geom=simplify_geom(extract_geometry(data))
        features.append({'type':'Feature','properties':{'code':code,'label':label,'value':value,'kind':'prefecture'},'geometry':geom})
        print(f"map {code:02d} {label}")
    os.makedirs(os.path.dirname(OUT),exist_ok=True)
    with open(OUT,'w',encoding='utf-8') as f:
        json.dump({'type':'FeatureCollection','features':features},f,ensure_ascii=False,separators=(',',':'))
    print(f"Wrote {len(features)} prefectures to {OUT}")

if __name__=='__main__':
    main()
