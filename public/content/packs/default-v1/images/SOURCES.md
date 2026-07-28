# Book illustration sources

**Policy:** Images are **cached in this folder** and referenced only as  
`/content/packs/default-v1/images/<file>` so the game is **playable offline**.  
Remote URLs are **not** used at runtime (see `src/ui/markdown.ts` allow-list).

Machine-readable registry: [`sources-registry.json`](./sources-registry.json)  
Fetch helper: `python scripts/content-pipeline/fetch_nasa_book_images.py`  
Assign unique art: `python scripts/content-pipeline/assign_unique_book_images.py`

---

## License summary (what we allow in this pack)

| Class | OK for EmilysGame? | How we use it |
|-------|--------------------|---------------|
| **U.S. federal public domain** (NASA, NOAA, USGS, many NARA) | Yes | Preferred for automation |
| **CC0 / Public Domain Mark** | Yes | Museums, diagrams |
| **CC BY** | Yes with **credit** | Shown under Book images |
| **CC BY-SA** | Yes with credit; SA applies to the image file itself | Keep credit; don’t relicense the file alone as proprietary |
| **CC BY-NC** | Avoid for a shippable game | Not used |
| **Unsplash / Pexels** | Broad free-use licenses (not classic PD) | Optional; always **download + credit** |
| **Unclear “free”** | No | Skip |

**Always** store `image.credit` + `image.license` on the article when possible.

---

## Recommended free sources (for future downloads)

### Tier A — Government / open cultural (best for kids + education)

| Source | License (typical) | Topics | Link |
|--------|-------------------|--------|------|
| **NASA Image and Video Library** | Public domain | Space, Earth, weather, launches | https://images.nasa.gov/ |
| **NASA assets CDN** | Public domain | Same, direct files | `https://images-assets.nasa.gov/image/<id>/<id>~medium.jpg` |
| **NASA Scientific Visualization Studio** | Public domain | Orbits, climate, diagrams | https://svs.gsfc.nasa.gov/ |
| **NOAA Photo Library** | Public domain | Oceans, weather, marine life | https://photolib.noaa.gov/ |
| **USGS Multimedia** | Public domain | Geology, water, maps | https://www.usgs.gov/products/multimedia-gallery |
| **Library of Congress — Free to Use** | Free reuse (check set) | History, maps, culture | https://www.loc.gov/free-to-use/ |
| **Smithsonian Open Access** | CC0 (OA items) | Art, history, natural history | https://www.si.edu/openaccess |
| **Met Museum Open Access** | CC0 (OA works) | Art history | https://www.metmuseum.org/art/collection |
| **Cleveland Museum Open Access** | CC0 | Art | https://www.clevelandart.org/open-access |
| **Europeana** (filter PDM/CC0) | Varies | European heritage | https://www.europeana.eu/ |
| **Biodiversity Heritage Library** | Often PD | Historic nature plates | https://www.biodiversitylibrary.org/ |
| **PhyloPic** | Per-silhouette | Animal silhouettes | https://www.phylopic.org/ |
| **Wikimedia Commons** | Per-file PD/CC | Everything | https://commons.wikimedia.org/ |

**Wikimedia tip:** Do **not** bulk-scrape. Download one file at a time, prefer listed thumbnail widths, then **cache here**. Runtime must never hit Commons.

### Tier B — Stock-style free photos (cache before use)

| Source | License | Notes |
|--------|---------|--------|
| [Unsplash](https://unsplash.com/) | Unsplash License | Free commercial use; attribution appreciated |
| [Pexels](https://www.pexels.com/) | Pexels License | Free commercial use |
| [Pixabay](https://pixabay.com/) | Pixabay Content License | Check AI content policy if relevant |
| [Rawpixel](https://www.rawpixel.com/) public domain sets | PD / CC0 | Filter carefully |
| [StockSnap](https://stocksnap.io/) | CC0-style | Verify page license |
| [Burst](https://burst.shopify.com/) | Free commercial | Smaller catalog |

### Tier C — Diagrams & icons

| Source | License | Notes |
|--------|---------|--------|
| [OpenClipart](https://openclipart.org/) | CC0 | Simple diagrams |
| [Game-icons.net](https://game-icons.net/) | CC BY 3.0 | Credit required |
| [Twemoji](https://github.com/twitter/twemoji) | CC BY 4.0 | Credit Twitter |
| Local `gen-article-*.png` | CC0-1.0 (pack) | Unique educational art when photos missing |

---

## Workflow (offline pack)

1. **Choose** a Tier A source when possible (NASA/NOAA/USGS for STEM).
2. **Download** into this folder with a stable name: `topic-short-name.jpg`.
3. **Register** the file in `sources-registry.json` (or re-run `fetch_nasa_book_images.py` for NASA IDs).
4. **Point** the article at:
   ```json
   "image": {
     "url": "/content/packs/default-v1/images/topic-short-name.jpg",
     "alt": "Short accessible description",
     "credit": "NASA",
     "license": "Public domain (NASA)"
   }
   ```
5. **Never** commit remote `https://` into article JSON for Book images.

---

## Files currently in this folder

### NASA public domain (fetched / cached)

| File | Topic hints | Credit |
|------|-------------|--------|
| `earth-apollo17.jpg` | Earth, geography | NASA |
| `earth-night.jpg` / `earth-rise.jpg` | Earth views | NASA |
| `moon-apollo.jpg` / `moon-surface.jpg` | Moon, Apollo | NASA |
| `sputnik.jpg` | Early space age | NASA (via Commons cache) |
| `shuttle-hubble.jpg` | Shuttle, Hubble | NASA |
| `hubble-galaxy.jpg` / `nebula.jpg` / `telescope-mirror.jpg` | Astronomy | NASA |
| `mars-rover.jpg` / `mars-surface.jpg` | Mars | NASA/JPL |
| `saturn.jpg` / `solar-system.jpg` | Planets | NASA |
| `launch-pad.jpg` / `rocket-sts.jpg` (if present) | Rockets | NASA |
| `iss-crew.jpg` / `astronaut-spacewalk.jpg` (if present) | ISS, EVA | NASA |
| `satellite.jpg` | Satellites | NASA |
| `ocean.jpg` / `ocean-currents.jpg` / `coast.jpg` / `coral.jpg` | Ocean / Earth science | NASA |
| `river-delta.jpg` / `volcano.jpg` | Geography / geology | NASA |
| `hurricane.jpg` / `ice-polar.jpg` / `aurora.jpg` / `clouds-earth.jpg` (if present) | Weather / climate | NASA |
| `forest.jpg` / `desert.jpg` / `city-lights.jpg` / `pyramid.jpg` (if present) | Earth from orbit | NASA |

Exact presence and byte sizes: see `sources-registry.json`.

### Wikimedia / free cultural (cached copies)

| File | Topic hints | Notes |
|------|-------------|--------|
| `bee.jpg` | Bees, pollination | Credit on article; check Commons for exact license |
| `books.jpg` / `etymology.jpg` | Language, books | Historic book imagery |
| `colosseum.jpg` / `greece.jpg` | Ancient history | Architecture |
| `shark.jpg` | Ocean animals | Marine life |
| `abacus.png` / `abacus.jpg` | Math | Counting tool |
| `continent.svg` / `ocean-map.svg` | Maps | Simple world map |

### Local generated educational art

| Pattern | License | Purpose |
|---------|---------|---------|
| `gen-article-*.png` | **CC0-1.0** (pack-generated) | Unique on-topic illustration when a free photo wasn’t available or would over-reuse |

These are **not** stock photos; they are simple illustrated cards (title + subject motif) so every article can stay distinct offline.

---

## Topic → preferred source (quick guide)

| Content pack theme | Prefer |
|--------------------|--------|
| Spaceflight history | NASA Image Library / SVS |
| Oceans & marine | NOAA + NASA Earth + ocean-tagged NASA |
| Nature / meadows | Unsplash/Pexels **then cache**, or BHL plates, or `gen-article-*` |
| History / culture | LOC Free to Use, Smithsonian OA, Met OA |
| Art / color theory | Met OA, Cleveland OA, PD paintings on Commons |
| Math / language icons | Generated art, OpenClipart, simple diagrams |

---

## Scripts

| Command | Role |
|---------|------|
| `python scripts/content-pipeline/fetch_nasa_book_images.py` | Download/refresh NASA catalog + rebuild `sources-registry.json` |
| `python scripts/content-pipeline/assign_unique_book_images.py` | Assign unique local images to every article |
| `python scripts/content-pipeline/backfill_article_images.py` | Older keyword backfill (superseded by assign script for uniqueness) |

---

## Integrity rules for contributors

1. **Offline first** — if the network is down, Book images must still load.
2. **One clear credit line** under each image in the Book UI.
3. **Kids-safe** — no graphic violence, no unsafe “challenge” imagery.
4. **Prefer PD/CC0 for STEM** so we never paint ourselves into NC/SA corners.
5. **Don’t delete** `SOURCES.md` or `sources-registry.json` when adding files — update them instead.
