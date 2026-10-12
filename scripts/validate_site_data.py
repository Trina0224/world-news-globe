#!/usr/bin/env python3
"""Validate a complete, publishable World News Globe data snapshot."""
import glob
import json
from pathlib import Path


def read(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def require(test, detail):
    if not test:
        raise ValueError(detail)


def titles(path):
    return [
        item.get("title", "").strip()
        for item in read(path).get("articles", [])[:10]
        if item.get("title")
    ]


def overlap(a, b):
    return len(set(a) & set(b)) / max(1, min(len(set(a)), len(set(b))))


def validate():
    jp = read("data/countries/jp.json")
    us = read("data/countries/us.json")
    world = read("data/world.json")
    require(len(jp.get("articles", [])) >= 10, "Japan needs at least 10 headlines")
    require(len(us.get("articles", [])) >= 10, "US needs at least 10 headlines")

    countries = world.get("countries", {})
    require(len(countries) >= 160, f"Only {len(countries)} world countries")
    nonempty = sum(bool(country.get("articles")) for country in countries.values())
    require(nonempty >= 145, f"Only {nonempty} nonempty world countries")
    taiwan = countries.get("Taiwan", {})
    require(len(taiwan.get("articles", [])) >= 10, "Taiwan needs 10 headlines")

    jp_files = sorted(glob.glob("data/jp/*.json"))
    us_files = sorted(glob.glob("data/us/*.json"))
    require(len(jp_files) == 47, f"Expected 47 prefecture files; got {len(jp_files)}")
    require(len(us_files) == 51, f"Expected 51 US region files; got {len(us_files)}")
    require("data/us/district-of-columbia.json" in us_files, "DC file missing")

    geojson = read("data/maps/japan-prefectures.geojson")
    features = geojson.get("features", [])
    require(geojson.get("type") == "FeatureCollection" and len(features) == 47,
            "Japan GeoJSON must have 47 prefectures")

    tokyo, osaka, hokkaido = (titles(f"data/jp/{name}.json")
                              for name in ("tokyo", "osaka", "hokkaido"))
    require(all((tokyo, osaka, hokkaido)), "Key Japan prefecture feeds are empty")
    require(max(overlap(tokyo, osaka), overlap(tokyo, hokkaido),
                overlap(osaka, hokkaido)) < .8, "Japan feeds too similar")

    california = read("data/us/california.json")
    ca, tx, ny = (titles(f"data/us/{name}.json")
                  for name in ("california", "texas", "new-york"))
    require(all((ca, tx, ny)), "Key US state feeds are empty")
    require(max(overlap(ca, tx), overlap(ca, ny), overlap(tx, ny)) < .8,
            "US state feeds too similar")

    ranking = "multi-feed-event-v2.1"
    for name, feed in (("Japan", jp), ("California", california), ("Taiwan", taiwan)):
        require(feed.get("ranking") == ranking, f"{name} ranking mismatch")
        require(feed.get("candidate_count", 0) >= 20, f"{name} candidates too low")
        require(feed.get("source_count", 0) >= 3, f"{name} source diversity too low")
        require(all("rank_signals" in item for item in feed.get("articles", [])),
                f"{name} missing rank signals")

    print(f"Validated: {len(countries)} countries ({nonempty} with headlines), "
          f"{len(jp_files)} prefectures, {len(us_files)} US regions, 47 map features")


if __name__ == "__main__":
    validate()
