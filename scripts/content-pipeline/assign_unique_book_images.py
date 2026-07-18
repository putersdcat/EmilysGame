#!/usr/bin/env python3
"""
Assign a unique, on-topic offline image to every Book article.

Strategy:
1. Prefer real free photos already under images/ when topic matches.
2. Otherwise generate a unique themed PNG illustration (Pillow) so no
   article reuses a generic Earth-from-space shot.

All paths stay under /content/packs/default-v1/images/ (offline-only).
"""
from __future__ import annotations

import hashlib
import json
import re
import textwrap
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "public" / "content" / "packs" / "default-v1"
IMG_DIR = PACK / "images"
W, H = 720, 400

# Topic keywords -> preferred real photo filenames (must exist)
PHOTO_RULES: list[tuple[list[str], str, str, str, str]] = [
    (["sputnik", "space age begins"], "sputnik.jpg", "Sputnik satellite", "NASA", "Public domain (NASA)"),
    (["apollo 11", "moon landing", "walked on the moon"], "moon-surface.jpg", "Apollo on the Moon", "NASA", "Public domain (NASA)"),
    (["apollo program", "mercury to apollo", "artemis"], "earth-rise.jpg", "Earthrise from the Moon", "NASA", "Public domain (NASA)"),
    (["moon", "lunar"], "moon-apollo.jpg", "The Moon", "NASA", "Public domain (NASA)"),
    (["mars", "rover"], "mars-rover.jpg", "Mars rover", "NASA/JPL", "Public domain (NASA)"),
    (["solar system"], "solar-system.jpg", "Solar system", "NASA", "Public domain (NASA)"),
    (["saturn"], "saturn.jpg", "Saturn", "NASA", "Public domain (NASA)"),
    (["iss", "space station", "living on the international"], "iss-crew.jpg", "Crew on the station", "NASA", "Public domain (NASA)"),
    (["shuttle", "hubble"], "shuttle-hubble.jpg", "Shuttle and Hubble", "NASA", "Public domain (NASA)"),
    (["telescope"], "telescope-mirror.jpg", "Space telescope hardware", "NASA", "Public domain (NASA)"),
    (["nebula", "galaxy"], "hubble-galaxy.jpg", "Galaxy / deep sky", "NASA", "Public domain (NASA)"),
    (["rocket", "launch", "how rockets"], "launch-pad.jpg", "Launch pad and rocket", "NASA", "Public domain (NASA)"),
    (["satellite", "orbit basics"], "satellite.jpg", "Earth-observing satellite", "NASA", "Public domain (NASA)"),
    (["ocean", "sea", "marine", "wave", "tide", "salty", "blue planet", "currents", "coast", "beach", "fish", "whale", "shark", "habitat", "conservation", "climate", "exploration", "deep"], "ocean.jpg", "Ocean", "NASA", "Public domain (NASA)"),
    (["coral", "reef"], "coral.jpg", "Coral / underwater science imagery", "NASA", "Public domain (NASA)"),
    (["river", "delta"], "river-delta.jpg", "River landscape", "NASA", "Public domain (NASA)"),
    (["volcano"], "volcano.jpg", "Volcanic landscape", "NASA", "Public domain (NASA)"),
    (["bee", "pollination"], "bee.jpg", "Honey bee", "Wikimedia Commons", "CC BY-SA"),
    (["greece", "parthenon", "democracy"], "greece.jpg", "The Parthenon", "Wikimedia Commons", "CC / free"),
    (["colosseum", "rome"], "colosseum.jpg", "Colosseum", "Wikimedia Commons", "CC / free"),
    (["abacus", "decimal"], "abacus.png", "Abacus", "Wikimedia Commons", "CC / free"),
    (["book", "etymology", "gutenberg", "origin"], "books.jpg", "Historic books", "Wikimedia Commons", "Public domain"),
    (["continent", "world map", "ocean of the world", "seven continent"], "continent.svg", "World map", "Wikimedia Commons", "Public domain"),
    (["earth", "blue marble"], "earth-apollo17.jpg", "Earth from space", "NASA", "Public domain (NASA)"),
]

# Subject palette for generated art
PALETTES = {
    "math": ((30, 60, 100), (100, 200, 255), (255, 220, 120)),
    "science": ((20, 70, 50), (120, 220, 160), (200, 255, 200)),
    "history": ((70, 45, 30), (210, 160, 90), (255, 230, 180)),
    "language": ((50, 35, 80), (180, 150, 255), (255, 230, 255)),
    "technology": ((25, 35, 55), (100, 160, 255), (180, 220, 255)),
    "geography": ((20, 55, 70), (80, 180, 200), (200, 240, 220)),
    "art": ((70, 30, 60), (255, 120, 160), (255, 210, 120)),
}


def slug(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:48] or "topic"


def get_font(size: int):
    for name in (
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibri.ttf",
    ):
        p = Path(name)
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size)
            except Exception:
                pass
    return ImageFont.load_default()


def draw_motif(draw: ImageDraw.ImageDraw, subject: str, title: str, seed: int) -> None:
    """Simple unique motif from subject + seed."""
    import math

    rng = seed % 97
    if "fraction" in title or "decimal" in title or "multiplic" in title or subject == "math":
        # pizza / circles
        draw.ellipse((420, 80, 660, 320), fill=(240, 200, 80), outline=(255, 255, 255), width=3)
        for i in range(1 + rng % 5):
            ang = i * 40
            x = 540 + int(100 * math.cos(math.radians(ang)))
            y = 200 + int(100 * math.sin(math.radians(ang)))
            draw.line((540, 200, x, y), fill=(180, 80, 40), width=3)
    elif "atom" in title or "magnet" in title:
        cx, cy = 540, 200
        draw.ellipse((cx - 18, cy - 18, cx + 18, cy + 18), fill=(255, 220, 100))
        for r, col in ((70, (120, 200, 255)), (110, (180, 140, 255)), (150, (100, 255, 200))):
            draw.ellipse((cx - r, cy - r // 2, cx + r, cy + r // 2), outline=col, width=3)
    elif "plant" in title or "photo" in title or "leaf" in title or "meadow" in title or "tree" in title or "bee" in title:
        draw.rectangle((520, 180, 545, 340), fill=(90, 140, 60))
        for dx, dy in ((-40, -20), (0, -50), (40, -10), (-20, 20), (30, 30)):
            draw.ellipse((500 + dx, 140 + dy, 580 + dx, 200 + dy), fill=(60, 180, 90))
        if "bee" in title:
            draw.ellipse((200, 160, 260, 200), fill=(255, 220, 40), outline=(30, 30, 30), width=2)
    elif "water" in title or "ocean" in title or "river" in title or "tide" in title or "wave" in title:
        for i in range(6):
            y = 140 + i * 35
            pts = []
            for x in range(380, 700, 20):
                pts.append((x, y + int(12 * math.sin((x + rng * 10 + i * 20) / 28))))
            if len(pts) > 1:
                draw.line(pts, fill=(80, 160, 255), width=4)
    elif "space" in title or "orbit" in title or "rocket" in title or "apollo" in title or "mars" in title or "star" in title:
        for i in range(25):
            x = 400 + (i * 47 + rng * 3) % 280
            y = 40 + (i * 29 + rng) % 320
            draw.ellipse((x, y, x + 3, y + 3), fill=(255, 255, 220))
        draw.ellipse((500, 120, 620, 240), fill=(100, 160, 255), outline=(200, 230, 255), width=2)
        draw.polygon([(200, 300), (240, 120), (280, 300)], fill=(220, 220, 230))
        draw.polygon([(240, 120), (200, 160), (280, 160)], fill=(255, 100, 80))
    elif "castle" in title or "egypt" in title or "greece" in title or "history" in title or "revolution" in title or "renaissance" in title:
        draw.rectangle((460, 160, 640, 340), fill=(180, 160, 130), outline=(255, 240, 200), width=2)
        for x in range(470, 630, 40):
            draw.rectangle((x, 120, x + 24, 160), fill=(180, 160, 130))
        draw.polygon([(460, 160), (550, 90), (640, 160)], fill=(150, 130, 100))
    elif "computer" in title or "binary" in title or "internet" in title or "algorithm" in title or "technology" in title:
        draw.rounded_rectangle((450, 100, 680, 260), radius=12, fill=(40, 50, 70), outline=(140, 180, 255), width=3)
        draw.rounded_rectangle((470, 120, 660, 220), radius=6, fill=(20, 80, 120))
        draw.rectangle((520, 270, 610, 300), fill=(80, 80, 90))
        for i, bit in enumerate("01001101"):
            draw.text((470 + i * 22, 300), bit, fill=(120, 255, 180), font=get_font(16))
    elif "color" in title or "art" in title or "landscape" in title or "paint" in title or "shape" in title:
        cols = [(255, 80, 80), (80, 120, 255), (255, 220, 60), (80, 200, 100), (200, 100, 255)]
        for i, c in enumerate(cols):
            draw.ellipse((430 + i * 40, 140 + (i % 2) * 40, 500 + i * 40, 210 + (i % 2) * 40), fill=c)
    elif "map" in title or "continent" in title or "compass" in title or "geography" in title:
        draw.ellipse((450, 80, 680, 310), fill=(40, 90, 140), outline=(200, 230, 255), width=3)
        draw.ellipse((500, 130, 580, 200), fill=(60, 140, 80))
        draw.ellipse((560, 180, 640, 260), fill=(70, 150, 90))
    else:
        # abstract unique blobs from seed
        for i in range(8):
            x = 400 + (seed * (i + 3) * 17) % 280
            y = 60 + (seed * (i + 5) * 13) % 280
            r = 30 + (seed + i * 9) % 50
            draw.ellipse((x, y, x + r, y + r), fill=(80 + i * 20, 100, 160 + i * 10))


def generate_illustration(article_id: str, subject: str, title: str) -> Path:
    seed = int(hashlib.md5(article_id.encode()).hexdigest()[:8], 16)
    bg, accent, highlight = PALETTES.get(subject, PALETTES["science"])
    # slight seed tint
    bg = tuple(max(0, min(255, c + (seed % 30) - 15)) for c in bg)

    im = Image.new("RGB", (W, H), bg)
    draw = ImageDraw.Draw(im)
    # gradient-ish bands
    for y in range(H):
        mix = y / H
        col = tuple(int(bg[i] * (1 - mix) + accent[i] * mix * 0.35) for i in range(3))
        draw.line([(0, y), (W // 2, y)], fill=col)

    # left panel parchment
    draw.rounded_rectangle((24, 24, 360, H - 24), radius=18, fill=(250, 245, 235), outline=highlight, width=3)
    draw_motif(draw, subject, title.lower(), seed)

    # subject chip
    draw.rounded_rectangle((40, 40, 200, 72), radius=10, fill=accent)
    font_sm = get_font(18)
    font_lg = get_font(28)
    font_md = get_font(20)
    draw.text((52, 46), subject.upper(), fill=(20, 20, 30), font=font_sm)

    # title wrap
    lines = textwrap.wrap(title, width=18)[:4]
    y = 100
    for line in lines:
        draw.text((44, y), line, fill=(30, 25, 40), font=font_lg)
        y += 34

    draw.text((44, H - 58), "Book of Knowledge · offline", fill=(90, 80, 70), font=font_sm)
    # unique footer hash mark
    draw.text((44, H - 36), article_id[-12:], fill=(140, 120, 100), font=font_sm)

    out = IMG_DIR / f"gen-{slug(article_id)}.png"
    im.save(out, format="PNG", optimize=True)
    return out


def pick_photo(article: dict) -> tuple[str, str, str, str] | None:
    blob = " ".join(
        [
            article.get("id", ""),
            article.get("title", ""),
            article.get("summary", ""),
            " ".join(article.get("keyTerms") or []),
        ]
    ).lower()
    for keys, fname, alt, credit, lic in PHOTO_RULES:
        if any(k in blob for k in keys):
            path = IMG_DIR / fname
            if path.exists() and path.stat().st_size > 500:
                return fname, alt, credit, lic
    return None


def main() -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    used_photos: set[str] = set()
    photo_count = 0
    gen_count = 0
    used_files: Counter[str] = Counter()

    for path in sorted((PACK / "articles").glob("articles-*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for a in data.get("articles") or []:
            photo = pick_photo(a)
            if photo and used_files[photo[0]] >= 2:
                photo = None  # force unique art after a photo is used twice
            if photo:
                fname, alt, credit, lic = photo
                photo_count += 1
            else:
                out = generate_illustration(a["id"], a.get("subject", "science"), a.get("title", "Topic"))
                fname = out.name
                alt = a.get("title") or "Illustration"
                credit = "Generated educational illustration (local)"
                lic = "CC0-1.0 (game pack)"
                gen_count += 1

            a["image"] = {
                "url": f"/content/packs/default-v1/images/{fname}",
                "alt": alt,
                "credit": credit,
                "license": lic,
            }
            used_files[fname] += 1
            used_photos.add(fname)

        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print("updated", path.name)

    # Remove giant files if any > 1.5MB (bee, colosseum) - compress
    for p in IMG_DIR.glob("*"):
        if p.suffix.lower() in {".jpg", ".jpeg", ".png"} and p.stat().st_size > 900_000:
            try:
                im = Image.open(p).convert("RGB")
                im.thumbnail((900, 600))
                dest = p.with_suffix(".jpg")
                im.save(dest, format="JPEG", quality=82, optimize=True)
                if dest != p and p.suffix.lower() != ".jpg":
                    p.unlink(missing_ok=True)
                elif dest == p:
                    pass
                print(f"compressed {p.name} -> {dest.stat().st_size}")
            except Exception as e:
                print("compress fail", p, e)

    man_path = PACK / "manifest.json"
    man = json.loads(man_path.read_text(encoding="utf-8"))
    man["packVersion"] = "2.6.0"
    man["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    man["description"] = (
        "Educational content with unique offline Book illustrations "
        "(NASA photos + local educational art under images/)."
    )
    man_path.write_text(json.dumps(man, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print("photos", photo_count, "generated", gen_count)
    print("unique files used", len(used_files))
    print("top reuse", used_files.most_common(8))


if __name__ == "__main__":
    main()
