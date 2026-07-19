# Book illustrations (offline)

All Book hero images live **in this folder** and are referenced only as:

`/content/packs/default-v1/images/<file>`

**No remote URLs at runtime** — the game stays playable offline.

| Doc | Purpose |
|-----|---------|
| **[SOURCES.md](./SOURCES.md)** | Free image **sources guide** + license policy + topic map |
| **[sources-registry.json](./sources-registry.json)** | Per-file origin, license, credit, tags, size |

### Refresh / assign

```bash
python scripts/content-pipeline/fetch_nasa_book_images.py   # NASA PD cache + registry
python scripts/content-pipeline/assign_unique_book_images.py # unique on-topic assignment
```
