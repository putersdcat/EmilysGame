#!/usr/bin/env python3
"""
Backfill Book article hero images using free-to-use files under
public/content/packs/default-v1/images/ (NASA / Wikimedia PD & free cultural works).

URLs are site-root paths: /content/packs/default-v1/images/<file>
which pass BOOK_IMAGE_ALLOWLIST (/content/).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "public" / "content" / "packs" / "default-v1"
IMG = "/content/packs/default-v1/images"


def img(filename: str, alt: str, credit: str, license_: str) -> dict:
    return {
        "url": f"{IMG}/{filename}",
        "alt": alt,
        "credit": credit,
        "license": license_,
    }


EARTH = img(
    "earth-apollo17.jpg",
    "Earth photographed from space",
    "NASA / Apollo program",
    "Public domain (NASA)",
)
EARTH_NIGHT = img(
    "earth-night.jpg",
    "Earth and ocean from space",
    "NASA",
    "Public domain (NASA)",
)
MOON = img(
    "moon-apollo.jpg",
    "The Moon from Apollo",
    "NASA / Apollo",
    "Public domain (NASA)",
)
FULL_MOON = img(
    "full-moon.jpg",
    "The Moon",
    "NASA / Apollo",
    "Public domain (NASA)",
)
SPUTNIK = img(
    "sputnik.jpg",
    "Sputnik 1 satellite replica",
    "NASA / NSSDC (via Wikimedia)",
    "Public domain (NASA)",
)
SHUTTLE = img(
    "shuttle-hubble.jpg",
    "Space Shuttle and Hubble Space Telescope",
    "NASA",
    "Public domain (NASA)",
)
MARS = img(
    "mars-rover.jpg",
    "Mars rover",
    "NASA / JPL",
    "Public domain (NASA)",
)
NEBULA = img(
    "nebula.jpg",
    "Colorful nebula in space",
    "NASA",
    "Public domain (NASA)",
)
HUBBLE = img(
    "hubble-galaxy.jpg",
    "Galaxy image from space telescope",
    "NASA",
    "Public domain (NASA)",
)
OCEAN = img(
    "ocean.jpg",
    "Ocean from space",
    "NASA",
    "Public domain (NASA)",
)
CORAL = img(
    "coral.jpg",
    "Underwater / reef-related NASA science imagery",
    "NASA",
    "Public domain (NASA)",
)

BY_SUBJECT = {
    "math": EARTH,
    "science": EARTH,
    "history": SPUTNIK,
    "language": EARTH_NIGHT,
    "technology": SHUTTLE,
    "geography": EARTH,
    "art": NEBULA,
}

KEYWORD_IMAGES: list[tuple[list[str], dict]] = [
    (["moon", "lunar", "apollo 11", "apollo program", "artemis", "full moon"], MOON),
    (["sputnik", "satellite", "orbit basics", "gps", "space age begins"], SPUTNIK),
    (["gagarin", "astronaut", "crew", "spacesuit", "microgravity", "careers", "safety"], MOON),
    (["iss", "space station", "living on the international", "skylab", "tiangong"], SHUTTLE),
    (["shuttle", "hubble", "telescope", "webb", "jwst", "astronomy", "eyes in the sky"], HUBBLE),
    (["mars", "rover", "ingenuity", "viking", "probe", "solar system"], MARS),
    (["rocket", "thrust", "crew dragon", "commercial", "falcon", "launch", "how rockets"], SHUTTLE),
    (["earth", "blue planet", "map", "compass", "north", "geography", "settlement"], EARTH),
    (["meadow", "grass", "wildflower", "season", "tree", "leaf", "photosynthesis", "plant", "bee", "pollination", "garden", "fraction", "prime", "geometry", "math", "noun", "story", "language", "color", "paint", "art", "landscape", "primary"], EARTH_NIGHT),
    (["ocean", "sea", "marine", "wave", "tide", "beach", "coast", "salt", "current", "whale", "dolphin", "fish", "shark", "kelp", "estuary", "sonar", "deep", "conservation", "plastic", "climate", "acidification", "water cycle", "river", "rain"], OCEAN),
    (["coral", "reef", "bleaching"], CORAL),
    (["castle", "medieval", "history", "colosseum", "papyrus", "blacksmith", "silk", "town", "fortress"], SPUTNIK),
    (["nebula", "starry", "galaxy"], NEBULA),
    (["algorithm", "computer", "binary", "technology", "machine", "input", "job"], SHUTTLE),
]


def pick_image(article: dict) -> dict:
    aid = (article.get("id") or "").lower()
    # Strong id-prefix routing (our authored packs)
    if "ocean" in aid or "marine" in aid:
        if "coral" in aid or "reef" in aid:
            return dict(CORAL)
        return dict(OCEAN)
    if "space" in aid or "apollo" in aid or "sputnik" in aid or "orbit" in aid or "iss" in aid:
        if "mars" in aid:
            return dict(MARS)
        if "moon" in aid or "apollo" in aid or "artemis" in aid:
            return dict(MOON)
        if "sputnik" in aid or "age_begins" in aid:
            return dict(SPUTNIK)
        if "telescope" in aid or "hubble" in aid or "webb" in aid:
            return dict(HUBBLE)
        if "shuttle" in aid or "rocket" in aid or "commercial" in aid:
            return dict(SHUTTLE)
        return dict(SHUTTLE)
    if "nature" in aid or "meadow" in aid or "bee" in aid or "photo" in aid:
        return dict(EARTH_NIGHT)
    if "geo_" in aid or "river" in aid or "map" in aid:
        return dict(EARTH)
    if "hist_" in aid or "castle" in aid:
        return dict(SPUTNIK)
    if "art_" in aid:
        return dict(NEBULA)
    if "tech_" in aid or "algorithm" in aid:
        return dict(SHUTTLE)

    blob = " ".join(
        [
            aid,
            article.get("title", ""),
            article.get("summary", ""),
            " ".join(article.get("keyTerms") or []),
        ]
    ).lower()

    for keys, image in KEYWORD_IMAGES:
        if any(k in blob for k in keys):
            return dict(image)

    return dict(BY_SUBJECT.get(article.get("subject", "science"), EARTH))


def main() -> None:
    total = 0
    for path in sorted((PACK / "articles").glob("articles-*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for a in data.get("articles") or []:
            a["image"] = pick_image(a)
            total += 1
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{path.name}: ok")

    man_path = PACK / "manifest.json"
    man = json.loads(man_path.read_text(encoding="utf-8"))
    man["packVersion"] = "2.4.0"
    note = "Book articles include free-to-use NASA (public domain) hero images under /content/packs/default-v1/images/."
    desc = man.get("description") or ""
    if "hero images" not in desc:
        man["description"] = f"{desc} {note}".strip()
    man["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    man_path.write_text(json.dumps(man, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # write a short LICENSE note for the image folder
    (PACK / "images" / "README.md").write_text(
        "# Book illustrations\n\n"
        "Free-to-use educational images (primarily **NASA public domain** media).\n"
        "Referenced by article `image.url` as `/content/packs/default-v1/images/<file>`.\n"
        "Credits appear under each image in the Book UI.\n",
        encoding="utf-8",
    )
    print(f"Imaged {total} articles")


if __name__ == "__main__":
    main()
