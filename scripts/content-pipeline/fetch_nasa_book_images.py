#!/usr/bin/env python3
"""
Fetch free US-government public-domain images for Book of Knowledge.

Primary: NASA images-assets.nasa.gov (public domain)
Secondary: keep existing local files; never require runtime network.

Usage:
  python scripts/content-pipeline/fetch_nasa_book_images.py
"""
from __future__ import annotations

import json
import ssl
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IMG_DIR = ROOT / "public" / "content" / "packs" / "default-v1" / "images"
REG = IMG_DIR / "sources-registry.json"
UA = "Mozilla/5.0 (compatible; EmilysGameContentBot/1.1; educational offline cache)"

# logical_id -> (nasa_id, preferred_file_suffix, local_filename, alt, topic_tags)
# License for all NASA rows: Public domain (US government work)
NASA_CATALOG: list[dict] = [
    {"id": "earth-apollo17", "nasa": "as17-148-22727", "file": "as17-148-22727~medium.jpg", "out": "earth-apollo17.jpg", "alt": "Earth from Apollo 17", "tags": ["earth", "space", "geography"]},
    {"id": "moon-apollo", "nasa": "as11-40-5874", "file": "as11-40-5874~medium.jpg", "out": "moon-apollo.jpg", "alt": "Moon from Apollo", "tags": ["moon", "space", "apollo"]},
    {"id": "moon-surface", "nasa": "as11-40-5903", "file": "as11-40-5903~medium.jpg", "out": "moon-surface.jpg", "alt": "Apollo lunar surface", "tags": ["moon", "apollo", "astronaut"]},
    {"id": "earth-rise", "nasa": "as08-14-2383", "file": "as08-14-2383~medium.jpg", "out": "earth-rise.jpg", "alt": "Earthrise", "tags": ["earth", "moon", "apollo"]},
    {"id": "shuttle-hubble", "nasa": "sts125-s-026", "file": "sts125-s-026~medium.jpg", "out": "shuttle-hubble.jpg", "alt": "Shuttle and Hubble", "tags": ["shuttle", "hubble", "telescope"]},
    {"id": "hubble-galaxy", "nasa": "GSFC_20171208_Archive_e001891", "file": "GSFC_20171208_Archive_e001891~medium.jpg", "out": "hubble-galaxy.jpg", "alt": "Galaxy image", "tags": ["galaxy", "telescope", "astronomy"]},
    {"id": "nebula", "nasa": "GSFC_20171208_Archive_e001861", "file": "GSFC_20171208_Archive_e001861~medium.jpg", "out": "nebula.jpg", "alt": "Nebula", "tags": ["nebula", "astronomy", "art"]},
    {"id": "mars-rover", "nasa": "PIA16239", "file": "PIA16239~medium.jpg", "out": "mars-rover.jpg", "alt": "Mars rover", "tags": ["mars", "rover", "robot"]},
    {"id": "mars-surface", "nasa": "PIA17944", "file": "PIA17944~medium.jpg", "out": "mars-surface.jpg", "alt": "Mars surface", "tags": ["mars", "planet"]},
    {"id": "saturn", "nasa": "PIA17172", "file": "PIA17172~medium.jpg", "out": "saturn.jpg", "alt": "Saturn", "tags": ["saturn", "planet", "solar-system"]},
    {"id": "solar-system", "nasa": "PIA03153", "file": "PIA03153~medium.jpg", "out": "solar-system.jpg", "alt": "Solar system illustration", "tags": ["solar-system", "planets"]},
    {"id": "launch-pad", "nasa": "KSC-2012-1848", "file": "KSC-2012-1848~medium.jpg", "out": "launch-pad.jpg", "alt": "Rocket on launch pad", "tags": ["rocket", "launch"]},
    {"id": "satellite", "nasa": "PIA04250", "file": "PIA04250~medium.jpg", "out": "satellite.jpg", "alt": "Satellite / spacecraft concept", "tags": ["satellite", "technology"]},
    {"id": "iss-crew", "nasa": "iss036e016704", "file": "iss036e016704~medium.jpg", "out": "iss-crew.jpg", "alt": "Astronauts on ISS", "tags": ["iss", "crew", "station"]},
    {"id": "telescope-mirror", "nasa": "GSFC_20171208_Archive_e002096", "file": "GSFC_20171208_Archive_e002096~medium.jpg", "out": "telescope-mirror.jpg", "alt": "Space telescope hardware", "tags": ["telescope", "webb", "hubble"]},
    {"id": "ocean", "nasa": "PIA18033", "file": "PIA18033~medium.jpg", "out": "ocean.jpg", "alt": "Ocean from space", "tags": ["ocean", "earth", "water"]},
    {"id": "ocean-currents", "nasa": "PIA11194", "file": "PIA11194~medium.jpg", "out": "ocean-currents.jpg", "alt": "Ocean / Earth science visualization", "tags": ["ocean", "currents", "climate"]},
    {"id": "coral", "nasa": "GSFC_20171208_Archive_e002151", "file": "GSFC_20171208_Archive_e002151~medium.jpg", "out": "coral.jpg", "alt": "Earth science imagery (reef/ocean related archive)", "tags": ["coral", "ocean", "earth"]},
    {"id": "coast", "nasa": "PIA03401", "file": "PIA03401~medium.jpg", "out": "coast.jpg", "alt": "Coastal landscape from space", "tags": ["coast", "beach", "geography"]},
    {"id": "river-delta", "nasa": "PIA02668", "file": "PIA02668~medium.jpg", "out": "river-delta.jpg", "alt": "River delta from space", "tags": ["river", "water", "geography"]},
    {"id": "volcano", "nasa": "PIA03387", "file": "PIA03387~medium.jpg", "out": "volcano.jpg", "alt": "Volcanic region from space", "tags": ["volcano", "geology", "earth"]},
    {"id": "earth-night", "nasa": "PIA18033", "file": "PIA18033~small.jpg", "out": "earth-night.jpg", "alt": "Earth / ocean view", "tags": ["earth", "ocean"]},
    # Extra NASA tries (may 403 — script skips failures)
    {"id": "jupiter", "nasa": "PIA02863", "file": "PIA02863~medium.jpg", "out": "jupiter.jpg", "alt": "Jupiter", "tags": ["jupiter", "planet"]},
    {"id": "hurricane", "nasa": "PIA03431", "file": "PIA03431~small.jpg", "out": "hurricane.jpg", "alt": "Hurricane from space", "tags": ["weather", "hurricane", "climate"]},
    {"id": "ice", "nasa": "PIA18153", "file": "PIA18153~small.jpg", "out": "ice-polar.jpg", "alt": "Polar ice", "tags": ["ice", "climate", "polar"]},
    {"id": "sts-launch", "nasa": "sts132-s-028", "file": "sts132-s-028~medium.jpg", "out": "rocket-sts.jpg", "alt": "Space Shuttle launch", "tags": ["rocket", "shuttle", "launch"]},
    {"id": "eva", "nasa": "iss056e125151", "file": "iss056e125151~small.jpg", "out": "astronaut-spacewalk.jpg", "alt": "Astronaut spacewalk", "tags": ["astronaut", "eva", "iss"]},
    {"id": "aurora", "nasa": "iss029e008439", "file": "iss029e008439~small.jpg", "out": "aurora.jpg", "alt": "Aurora from orbit", "tags": ["aurora", "earth", "space"]},
    {"id": "clouds", "nasa": "iss030e033877", "file": "iss030e033877~small.jpg", "out": "clouds-earth.jpg", "alt": "Clouds over Earth", "tags": ["clouds", "weather", "water-cycle"]},
    {"id": "desert", "nasa": "iss040e015440", "file": "iss040e015440~small.jpg", "out": "desert.jpg", "alt": "Desert from orbit", "tags": ["desert", "geography"]},
    {"id": "forest", "nasa": "iss043e093393", "file": "iss043e093393~small.jpg", "out": "forest.jpg", "alt": "Forest from orbit", "tags": ["forest", "trees", "nature"]},
    {"id": "city-lights", "nasa": "iss038e024505", "file": "iss038e024505~small.jpg", "out": "city-lights.jpg", "alt": "City lights from space", "tags": ["city", "geography", "night"]},
    {"id": "pyramid-view", "nasa": "iss014e14481", "file": "iss014e14481~small.jpg", "out": "pyramid.jpg", "alt": "Earth landscape from ISS", "tags": ["history", "earth", "geography"]},
]


def fetch(url: str, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size > 2000:
        return True
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=40, context=ctx) as r:
            data = r.read()
        if len(data) < 800:
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        time.sleep(0.35)  # be polite
        return True
    except Exception as e:
        print(f"  FAIL {dest.name}: {e}")
        return False


def main() -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    registry: dict = {
        "schemaVersion": "1.0",
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "policy": {
            "runtime": "offline-only paths under /content/",
            "preferredSources": ["NASA public domain", "NOAA public domain", "USGS public domain", "local generated educational art"],
            "avoidAtRuntime": ["remote http(s) URLs", "bulk scraping Wikimedia"],
        },
        "files": {},
    }

    # Preserve notes for non-NASA files already present
    known_local = {
        "sputnik.jpg": {
            "source": "NASA / NSSDC via Wikimedia Commons",
            "license": "Public domain (NASA)",
            "credit": "NASA",
            "originUrl": "https://upload.wikimedia.org/wikipedia/commons/b/be/Sputnik_asm.jpg",
            "tags": ["sputnik", "satellite", "space-history"],
        },
        "bee.jpg": {
            "source": "Wikimedia Commons",
            "license": "CC BY-SA (see Commons file page)",
            "credit": "Wikimedia Commons — honey bee",
            "originUrl": "https://commons.wikimedia.org/wiki/File:Apis_mellifera_Western_honey_bee.jpg",
            "tags": ["bee", "nature", "pollination"],
        },
        "books.jpg": {
            "source": "Wikimedia Commons",
            "license": "Public domain",
            "credit": "Wikimedia Commons — historic book",
            "tags": ["books", "language", "history"],
        },
        "etymology.jpg": {
            "source": "Wikimedia Commons",
            "license": "Public domain",
            "credit": "Wikimedia Commons — historic book",
            "tags": ["books", "language"],
        },
        "colosseum.jpg": {
            "source": "Wikimedia Commons",
            "license": "CC BY (see Commons)",
            "credit": "Wikimedia Commons — Colosseum",
            "tags": ["history", "rome"],
        },
        "greece.jpg": {
            "source": "Wikimedia Commons",
            "license": "CC / free cultural (see Commons)",
            "credit": "Wikimedia Commons — Parthenon",
            "tags": ["history", "greece"],
        },
        "shark.jpg": {
            "source": "Wikimedia Commons",
            "license": "CC / free (see Commons)",
            "credit": "Wikimedia Commons — shark",
            "tags": ["ocean", "shark", "animals"],
        },
        "abacus.png": {
            "source": "Wikimedia Commons",
            "license": "CC BY-SA (see Commons)",
            "credit": "Wikimedia Commons — abacus",
            "tags": ["math", "abacus"],
        },
        "continent.svg": {
            "source": "Wikimedia Commons",
            "license": "Public domain",
            "credit": "Wikimedia Commons — world map",
            "tags": ["map", "geography"],
        },
        "ocean-map.svg": {
            "source": "Wikimedia Commons",
            "license": "Public domain",
            "credit": "Wikimedia Commons — world map",
            "tags": ["map", "ocean", "geography"],
        },
    }

    ok = fail = 0
    for row in NASA_CATALOG:
        out = IMG_DIR / row["out"]
        url = f"https://images-assets.nasa.gov/image/{row['nasa']}/{row['file']}"
        print(f"fetch {row['out']} …")
        if fetch(url, out):
            ok += 1
            registry["files"][row["out"]] = {
                "source": "NASA Image and Video Library / images-assets.nasa.gov",
                "license": "Public domain (U.S. government work)",
                "credit": "NASA",
                "originUrl": url,
                "nasaId": row["nasa"],
                "alt": row["alt"],
                "tags": row["tags"],
                "bytes": out.stat().st_size,
            }
        else:
            fail += 1
            if out.exists() and out.stat().st_size > 2000:
                registry["files"][row["out"]] = {
                    "source": "NASA (cached local copy)",
                    "license": "Public domain (U.S. government work)",
                    "credit": "NASA",
                    "originUrl": url,
                    "nasaId": row["nasa"],
                    "alt": row["alt"],
                    "tags": row["tags"],
                    "bytes": out.stat().st_size,
                }

    for name, meta in known_local.items():
        p = IMG_DIR / name
        if p.exists():
            registry["files"][name] = {
                **meta,
                "bytes": p.stat().st_size,
            }

    # Generated educational art
    for p in sorted(IMG_DIR.glob("gen-article-*.png")):
        registry["files"][p.name] = {
            "source": "Local educational illustration (Emily's Game content pipeline)",
            "license": "CC0-1.0 (pack-generated)",
            "credit": "Generated educational illustration (local)",
            "originUrl": None,
            "alt": p.stem.replace("gen-article-", "").replace("-", " "),
            "tags": ["generated", "educational"],
            "bytes": p.stat().st_size,
        }

    # Any remaining files not yet registered
    for p in sorted(IMG_DIR.iterdir()):
        if not p.is_file() or p.name in {"README.md", "SOURCES.md", "sources-registry.json"}:
            continue
        if p.name not in registry["files"]:
            registry["files"][p.name] = {
                "source": "Local pack asset (see SOURCES.md)",
                "license": "See SOURCES.md / provenance on article",
                "credit": "See article image.credit",
                "originUrl": None,
                "tags": ["local"],
                "bytes": p.stat().st_size,
            }

    REG.write_text(json.dumps(registry, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"NASA fetch ok={ok} fail={fail}")
    print(f"Registry files: {len(registry['files'])} → {REG}")


if __name__ == "__main__":
    from datetime import datetime, timezone
    import time

    main()
