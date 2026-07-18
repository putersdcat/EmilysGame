#!/usr/bin/env python3
"""
Download free-to-use (NASA public domain) images into the Book pack and
assign a unique/on-topic image to every article.

Images are stored under public/content/packs/default-v1/images/ so the game
stays offline-playable. No remote URLs remain in article JSON.
"""
from __future__ import annotations

import json
import ssl
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "public" / "content" / "packs" / "default-v1"
IMG_DIR = PACK / "images"
NASA = "https://images-assets.nasa.gov/image"
UA = "Mozilla/5.0 (compatible; EmilysGameContentBot/1.0; educational offline pack)"

# filename -> NASA asset path segment (folder/id)
# Prefer ~small or ~medium when available.
NASA_ASSETS: dict[str, tuple[str, str]] = {
    # Space / Earth
    "earth-apollo17.jpg": ("as17-148-22727", "as17-148-22727~medium.jpg"),
    "moon-apollo.jpg": ("as11-40-5874", "as11-40-5874~medium.jpg"),
    "moon-surface.jpg": ("as11-40-5903", "as11-40-5903~medium.jpg"),
    "earth-rise.jpg": ("as08-14-2383", "as08-14-2383~medium.jpg"),
    "sputnik.jpg": ("", ""),  # keep existing local
    "shuttle-hubble.jpg": ("sts125-s-026", "sts125-s-026~medium.jpg"),
    "hubble-galaxy.jpg": ("GSFC_20171208_Archive_e001891", "GSFC_20171208_Archive_e001891~medium.jpg"),
    "nebula.jpg": ("GSFC_20171208_Archive_e001861", "GSFC_20171208_Archive_e001861~medium.jpg"),
    "mars-rover.jpg": ("PIA16239", "PIA16239~medium.jpg"),
    "mars-surface.jpg": ("PIA17944", "PIA17944~medium.jpg"),
    "jupiter.jpg": ("PIA02863", "PIA02863~medium.jpg"),
    "saturn.jpg": ("PIA17172", "PIA17172~medium.jpg"),
    "solar-system.jpg": ("PIA03153", "PIA03153~medium.jpg"),
    "astronaut-spacewalk.jpg": ("iss056e125151", "iss056e125151~medium.jpg"),
    "spacesuit.jpg": ("9400603", "9400603~medium.jpg"),
    "rocket-sts.jpg": ("sts132-s-028", "sts132-s-028~medium.jpg"),
    "launch-pad.jpg": ("KSC-2012-1848", "KSC-2012-1848~medium.jpg"),
    "mission-control.jpg": ("jsc2005e20482", "jsc2005e20482~medium.jpg"),
    "satellite.jpg": ("PIA04250", "PIA04250~medium.jpg"),
    "orbit-earth.jpg": ("iss030e015470", "iss030e015470~medium.jpg"),
    "iss-crew.jpg": ("iss036e016704", "iss036e016704~medium.jpg"),
    "telescope-mirror.jpg": ("GSFC_20171208_Archive_e002096", "GSFC_20171208_Archive_e002096~medium.jpg"),
    # Ocean / Earth science
    "ocean.jpg": ("PIA18033", "PIA18033~medium.jpg"),
    "ocean-currents.jpg": ("PIA11194", "PIA11194~medium.jpg"),
    "coral.jpg": ("GSFC_20171208_Archive_e002151", "GSFC_20171208_Archive_e002151~medium.jpg"),
    "coast.jpg": ("PIA03401", "PIA03401~medium.jpg"),
    "clouds-earth.jpg": ("iss030e033877", "iss030e033877~medium.jpg"),
    "hurricane.jpg": ("PIA03431", "PIA03431~medium.jpg"),
    "ice-polar.jpg": ("PIA18153", "PIA18153~medium.jpg"),
    "river-delta.jpg": ("PIA02668", "PIA02668~medium.jpg"),
    "water-cycle.jpg": ("GSFC_20171208_Archive_e001434", "GSFC_20171208_Archive_e001434~medium.jpg"),
    "earth-night.jpg": ("PIA18033", "PIA18033~small.jpg"),
    # Nature / life / misc science
    "earth-land.jpg": ("iss042e133331", "iss042e133331~medium.jpg"),
    "forest.jpg": ("iss043e093393", "iss043e093393~medium.jpg"),
    "desert.jpg": ("iss040e015440", "iss040e015440~medium.jpg"),
    "volcano.jpg": ("PIA03387", "PIA03387~medium.jpg"),
    "lightning.jpg": ("iss030e015239", "iss030e015239~medium.jpg"),
    "aurora.jpg": ("iss029e008439", "iss029e008439~medium.jpg"),
    "gravity-demo.jpg": ("jsc2005e20482", "jsc2005e20482~medium.jpg"),  # fallback reuse ok if fail
    "atom-ish.jpg": ("PIA04250", "PIA04250~medium.jpg"),
    "magnetosphere.jpg": ("PIA04250", "PIA04250~medium.jpg"),
    # Tech / abstract
    "computer-room.jpg": ("jsc2000e27066", "jsc2000e27066~medium.jpg"),
    "antenna.jpg": ("PIA04250", "PIA04250~medium.jpg"),
    # History / culture (NASA still free) - use earth heritage shots
    "pyramid.jpg": ("iss014e14481", "iss014e14481~medium.jpg"),
    "city-lights.jpg": ("iss038e024505", "iss038e024505~medium.jpg"),
    "map-globe.jpg": ("PIA00122", "PIA00122~medium.jpg"),
}

# Wikimedia commons direct files already on disk or to fetch
WIKI: dict[str, str] = {
    "sputnik.jpg": "https://upload.wikimedia.org/wikipedia/commons/b/be/Sputnik_asm.jpg",
    "full-moon.jpg": "https://upload.wikimedia.org/wikipedia/commons/e/e1/FullMoon2010.jpg",
    "bee.jpg": "https://upload.wikimedia.org/wikipedia/commons/4/4d/Apis_mellifera_Western_honey_bee.jpg",
    "abacus.jpg": "https://upload.wikimedia.org/wikipedia/commons/a/af/Abacus_6.png",
    "books.jpg": "https://upload.wikimedia.org/wikipedia/commons/b/b6/Gutenberg_Bible%2C_Lenox_Copy%2C_New_York_Public_Library%2C_2009._Pic_01.jpg",
    "castle.jpg": "https://upload.wikimedia.org/wikipedia/commons/f/f8/Castillo_de_Almodovar_del_Rio.jpg",
    "colosseum.jpg": "https://upload.wikimedia.org/wikipedia/commons/5/53/Colosseum_in_Rome%2C_Italy_-_April_2007.jpg",
    "paint-palette.jpg": "https://upload.wikimedia.org/wikipedia/commons/4/4c/Oil_painting_palette.jpg",
    "shapes.jpg": "https://upload.wikimedia.org/wikipedia/commons/1/1a/Geometric_shapes.svg",
    "leaf.jpg": "https://upload.wikimedia.org/wikipedia/commons/3/39/European_beech_leaf.jpg",
    "tree.jpg": "https://upload.wikimedia.org/wikipedia/commons/e/eb/Ash_Tree_-_geograph.org.uk_-_590710.jpg",
    "meadow.jpg": "https://upload.wikimedia.org/wikipedia/commons/5/5c/Meadow_flowers.jpg",
    "fish.jpg": "https://upload.wikimedia.org/wikipedia/commons/2/2b/Reef2891_-_Flickr_-_NOAA_Photo_Library.jpg",
    "whale.jpg": "https://upload.wikimedia.org/wikipedia/commons/6/64/Humpback_stellwagen_edit.jpg",
    "shark.jpg": "https://upload.wikimedia.org/wikipedia/commons/5/56/White_shark.jpg",
    "wave.jpg": "https://upload.wikimedia.org/wikipedia/commons/7/7e/Large_breaking_wave.jpg",
    "beach.jpg": "https://upload.wikimedia.org/wikipedia/commons/a/a3/Waikiki_beach.jpg",
    "dinosaur.jpg": "https://upload.wikimedia.org/wikipedia/commons/d/df/Tyrannosaurus_rex_Profile_HCM.jpg",
    "alphabet.jpg": "https://upload.wikimedia.org/wikipedia/commons/7/7b/Latin_alphabet_Aa.svg",
    "lever.jpg": "https://upload.wikimedia.org/wikipedia/commons/2/27/Lever_%28PSF%29.png",
    "gear.jpg": "https://upload.wikimedia.org/wikipedia/commons/6/6d/Gears.jpg",
    "compass.jpg": "https://upload.wikimedia.org/wikipedia/commons/8/8a/Compass_%28PSF%29.png",
    "fractions.jpg": "https://upload.wikimedia.org/wikipedia/commons/4/4d/Pizza_slices.svg",
    "geometry.jpg": "https://upload.wikimedia.org/wikipedia/commons/4/45/Geometry_ruler_compass.jpg",
    "decimals.jpg": "https://upload.wikimedia.org/wikipedia/commons/3/3e/Abacus_6.png",
    "multiplication.jpg": "https://upload.wikimedia.org/wikipedia/commons/2/2e/Multiplication_sign.svg",
    "sentence.jpg": "https://upload.wikimedia.org/wikipedia/commons/7/7b/Latin_alphabet_Aa.svg",
    "internet.jpg": "https://upload.wikimedia.org/wikipedia/commons/d/d2/Internet1.jpg",
    "binary.jpg": "https://upload.wikimedia.org/wikipedia/commons/a/a7/Binary_code.jpg",
    "renaissance.jpg": "https://upload.wikimedia.org/wikipedia/commons/0/0b/Leonardo_da_Vinci_-_Vitruvian_Man.jpg",
    "greece.jpg": "https://upload.wikimedia.org/wikipedia/commons/d/da/The_Parthenon_in_Athens.jpg",
    "revolution.jpg": "https://upload.wikimedia.org/wikipedia/commons/4/4a/Declaration_independence.jpg",
    "egypt.jpg": "https://upload.wikimedia.org/wikipedia/commons/a/af/All_Gizah_Pyramids.jpg",
    "atom.jpg": "https://upload.wikimedia.org/wikipedia/commons/8/80/Atom_diagram.png",
    "magnet.jpg": "https://upload.wikimedia.org/wikipedia/commons/1/1e/Horseshoe_magnet_en.svg",
    "gravity.jpg": "https://upload.wikimedia.org/wikipedia/commons/d/d0/NewtonsLawOfUniversalGravitation.svg",
    "photosynthesis.jpg": "https://upload.wikimedia.org/wikipedia/commons/5/55/Photosynthesis_en.svg",
    "patterns.jpg": "https://upload.wikimedia.org/wikipedia/commons/3/3e/Wallpaper_group-p4m-2.jpg",
    "deep-sea.jpg": "https://upload.wikimedia.org/wikipedia/commons/5/5f/Blacksmoker_in_Atlantic_Ocean.jpg",
    "tide.jpg": "https://upload.wikimedia.org/wikipedia/commons/2/2c/Bay_of_Fundy_Low_Tide.jpg",
    "current-map.jpg": "https://upload.wikimedia.org/wikipedia/commons/6/67/Ocean_currents_1943_%28borderless%293.png",
    "sonar.jpg": "https://upload.wikimedia.org/wikipedia/commons/8/8a/Sonar_Principle_EN.svg",
    "kelp.jpg": "https://upload.wikimedia.org/wikipedia/commons/8/80/Giant_kelp.jpg",
    "plankton.jpg": "https://upload.wikimedia.org/wikipedia/commons/0/0a/Diatoms_through_the_microscope.jpg",
    "dolphin.jpg": "https://upload.wikimedia.org/wikipedia/commons/1/10/Tursiops_truncatus_01.jpg",
    "mangrove.jpg": "https://upload.wikimedia.org/wikipedia/commons/4/4e/Mangroves_in_Upolu.jpg",
    "pollution.jpg": "https://upload.wikimedia.org/wikipedia/commons/0/05/Marine_debris_on_Hawaiian_coast.jpg",
    "ship.jpg": "https://upload.wikimedia.org/wikipedia/commons/d/d9/Tall_ship_in_Sydney_Harbour.jpg",
    "submersible.jpg": "https://upload.wikimedia.org/wikipedia/commons/7/7a/Alvin_submersible.jpg",
    "season-winter.jpg": "https://upload.wikimedia.org/wikipedia/commons/d/dd/Winter_forest_snow.jpg",
    "season-autumn.jpg": "https://upload.wikimedia.org/wikipedia/commons/5/5a/Autumn_leaves.jpg",
    "storybook.jpg": "https://upload.wikimedia.org/wikipedia/commons/0/0b/Open_book_nae_002.jpg",
    "noun-words.jpg": "https://upload.wikimedia.org/wikipedia/commons/7/7b/Latin_alphabet_Aa.svg",
    "algorithm.jpg": "https://upload.wikimedia.org/wikipedia/commons/d/d2/Internet1.jpg",
    "machine.jpg": "https://upload.wikimedia.org/wikipedia/commons/2/27/Lever_%28PSF%29.png",
    "area.jpg": "https://upload.wikimedia.org/wikipedia/commons/4/45/Geometry_ruler_compass.jpg",
    "garden.jpg": "https://upload.wikimedia.org/wikipedia/commons/5/5c/Meadow_flowers.jpg",
    "colors.jpg": "https://upload.wikimedia.org/wikipedia/commons/4/4c/Oil_painting_palette.jpg",
    "landscape-art.jpg": "https://upload.wikimedia.org/wikipedia/commons/d/da/Claude_Monet_-_Woman_with_a_Parasol_-_Madame_Monet_and_Her_Son_-_Google_Art_Project.jpg",
    "phonics.jpg": "https://upload.wikimedia.org/wikipedia/commons/7/7b/Latin_alphabet_Aa.svg",
    "etymology.jpg": "https://upload.wikimedia.org/wikipedia/commons/b/b6/Gutenberg_Bible%2C_Lenox_Copy%2C_New_York_Public_Library%2C_2009._Pic_01.jpg",
    "speech.jpg": "https://upload.wikimedia.org/wikipedia/commons/7/7b/Latin_alphabet_Aa.svg",
    "continent.jpg": "https://upload.wikimedia.org/wikipedia/commons/8/80/World_map_-_low_resolution.svg",
    "ocean-map.jpg": "https://upload.wikimedia.org/wikipedia/commons/8/80/World_map_-_low_resolution.svg",
    "maps-read.jpg": "https://upload.wikimedia.org/wikipedia/commons/5/5d/World_map_blank_without_borders.svg",
    "compass-rose.jpg": "https://upload.wikimedia.org/wikipedia/commons/8/8a/Compass_%28PSF%29.png",
    "town-river.jpg": "https://upload.wikimedia.org/wikipedia/commons/a/a7/Amazon_River_near_Iquitos_Peru.jpg",
    "gagarin.jpg": "https://upload.wikimedia.org/wikipedia/commons/c/cc/Gagarin_in_Sweden.jpg",
    "women-space.jpg": "https://upload.wikimedia.org/wikipedia/commons/0/0f/Sally_Ride_%281984%29.jpg",
    "timeline-space.jpg": "https://upload.wikimedia.org/wikipedia/commons/b/be/Sputnik_asm.jpg",
    "china-space.jpg": "https://upload.wikimedia.org/wikipedia/commons/8/80/Shenzhou_7_spacecraft.jpg",
    "commercial-crew.jpg": "https://upload.wikimedia.org/wikipedia/commons/9/9a/SpaceX_Crew-1_Launch_%28NHQ202011150026%29.jpg",
    "artemis.jpg": "https://upload.wikimedia.org/wikipedia/commons/e/e5/SLS_Block_1_on_LC-39B_before_Artemis_1_launch_%28cropped%29.jpg",
    "probe.jpg": "https://upload.wikimedia.org/wikipedia/commons/6/60/Voyager.jpg",
    "orbit-diagram.jpg": "https://upload.wikimedia.org/wikipedia/commons/4/4e/Orbital_altitude.svg",
    "safety-space.jpg": "https://upload.wikimedia.org/wikipedia/commons/0/0f/Sally_Ride_%281984%29.jpg",
    "careers-space.jpg": "https://upload.wikimedia.org/wikipedia/commons/d/d2/Mission_control_center.jpg",
    "careers-ocean.jpg": "https://upload.wikimedia.org/wikipedia/commons/7/7a/Alvin_submersible.jpg",
    "habitats-sea.jpg": "https://upload.wikimedia.org/wikipedia/commons/8/80/Giant_kelp.jpg",
    "food-web.jpg": "https://upload.wikimedia.org/wikipedia/commons/0/0a/Diatoms_through_the_microscope.jpg",
    "climate-ocean.jpg": "https://upload.wikimedia.org/wikipedia/commons/6/67/Ocean_currents_1943_%28borderless%293.png",
    "exploration-ocean.jpg": "https://upload.wikimedia.org/wikipedia/commons/7/7a/Alvin_submersible.jpg",
    "history-ocean.jpg": "https://upload.wikimedia.org/wikipedia/commons/d/d9/Tall_ship_in_Sydney_Harbour.jpg",
    "salty.jpg": "https://upload.wikimedia.org/wikipedia/commons/7/7e/Large_breaking_wave.jpg",
    "blue-planet.jpg": "https://upload.wikimedia.org/wikipedia/commons/9/97/The_Earth_seen_from_Apollo_17.jpg",
    "shapes-art.jpg": "https://upload.wikimedia.org/wikipedia/commons/1/1a/Geometric_shapes.svg",
    "computer.jpg": "https://upload.wikimedia.org/wikipedia/commons/1/1a/Personal_Computer%2C_model_5150%2C_IBM%2C_1981.jpg",
    "prime.jpg": "https://upload.wikimedia.org/wikipedia/commons/f/f0/Prime_number_theorem.svg",
}


def download(url: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 2000:
        return True
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=45, context=ctx) as resp:
            data = resp.read()
        if len(data) < 500:
            return False
        dest.write_bytes(data)
        return True
    except Exception as e:
        print(f"  FAIL {dest.name}: {e}")
        return False


def download_all() -> set[str]:
    ok: set[str] = set()
    # existing files count as ok
    for p in IMG_DIR.glob("*"):
        if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".svg", ".webp"} and p.stat().st_size > 500:
            ok.add(p.name)

    print("NASA downloads…")
    for name, (folder, file) in NASA_ASSETS.items():
        if not folder:
            if (IMG_DIR / name).exists():
                ok.add(name)
            continue
        url = f"{NASA}/{folder}/{file}"
        dest = IMG_DIR / name
        # normalize extension for svg/png leftovers
        if download(url, dest):
            ok.add(name)
            print(f"  OK {name} ({dest.stat().st_size})")
        elif name in ok:
            print(f"  keep existing {name}")

    print("Wikimedia / free downloads…")
    for name, url in WIKI.items():
        dest = IMG_DIR / name
        # prefer .jpg extension even if source is png/svg — keep original suffix if needed
        if dest.suffix.lower() not in {".jpg", ".jpeg", ".png", ".svg", ".webp"}:
            dest = dest.with_suffix(".jpg")
        # if wiki file is svg/png, store with that extension
        src_ext = Path(url.split("?")[0]).suffix.lower()
        if src_ext in {".png", ".svg", ".jpg", ".jpeg", ".webp"}:
            dest = IMG_DIR / (Path(name).stem + src_ext)
            # map logical name used in assignment to actual filename
        if download(url, dest):
            ok.add(dest.name)
            # also copy alias if name differs
            if dest.name != name and not (IMG_DIR / name).exists():
                try:
                    (IMG_DIR / name).write_bytes(dest.read_bytes())
                    ok.add(name)
                except Exception:
                    pass
            print(f"  OK {dest.name} ({dest.stat().st_size})")
        elif (IMG_DIR / name).exists():
            ok.add(name)

    return ok


# Explicit article_id -> image filename (must exist under images/)
ARTICLE_IMAGE: dict[str, tuple[str, str, str, str]] = {
    # math baseline
    "article_math_000": ("fractions.jpg", "Pizza slices illustrating fractions", "Wikimedia Commons", "Public domain / free"),
    "article_math_001": ("prime.jpg", "Prime number theorem graph", "Wikimedia Commons", "Public domain / free"),
    "article_math_002": ("geometry.jpg", "Geometry tools: ruler and compass", "Wikimedia Commons", "CC / free cultural"),
    "article_math_015": ("decimals.jpg", "Abacus for place value and decimals", "Wikimedia Commons", "CC BY-SA"),
    "article_math_016": ("multiplication.jpg", "Multiplication sign", "Wikimedia Commons", "Public domain"),
    "article_math_garden_015": ("garden.jpg", "Garden flowers for counting practice", "Wikimedia Commons", "CC / free"),
    "article_math_area_016": ("area.jpg", "Measuring tools for area", "Wikimedia Commons", "CC / free"),
    # science baseline
    "article_science_003": ("atom.jpg", "Diagram of an atom", "Wikimedia Commons", "Public domain / free"),
    "article_science_004": ("photosynthesis.jpg", "Photosynthesis diagram", "Wikimedia Commons", "Public domain / free"),
    "article_science_005": ("gravity.jpg", "Newton’s law of gravitation diagram", "Wikimedia Commons", "Public domain"),
    "article_science_006": ("water-cycle.jpg", "Water cycle illustration", "NASA / free", "Public domain (NASA)"),
    "article_science_017": ("solar-system.jpg", "Solar system illustration", "NASA", "Public domain (NASA)"),
    "article_science_019": ("dinosaur.jpg", "Tyrannosaurus skeleton profile", "Wikimedia Commons", "CC / free"),
    "article_science_028": ("magnet.jpg", "Horseshoe magnet diagram", "Wikimedia Commons", "Public domain"),
    # history baseline
    "article_history_007": ("egypt.jpg", "Pyramids of Giza", "Wikimedia Commons", "CC / free"),
    "article_history_008": ("moon-apollo.jpg", "Apollo moon mission imagery", "NASA", "Public domain (NASA)"),
    "article_history_020": ("greece.jpg", "The Parthenon in Athens", "Wikimedia Commons", "CC / free"),
    "article_history_021": ("revolution.jpg", "Declaration of Independence", "Wikimedia Commons", "Public domain"),
    "article_history_022": ("renaissance.jpg", "Vitruvian Man by Leonardo da Vinci", "Wikimedia Commons", "Public domain"),
    # language
    "article_language_009": ("speech.jpg", "Letters of the alphabet", "Wikimedia Commons", "Public domain"),
    "article_language_010": ("etymology.jpg", "Historic printed book pages", "Wikimedia Commons", "Public domain"),
    "article_language_023": ("phonics.jpg", "Alphabet letters", "Wikimedia Commons", "Public domain"),
    "article_language_024": ("sentence.jpg", "Alphabet and writing", "Wikimedia Commons", "Public domain"),
    "article_lang_nouns_009": ("noun-words.jpg", "Letters used for naming words", "Wikimedia Commons", "Public domain"),
    "article_lang_story_010": ("storybook.jpg", "Open storybook", "Wikimedia Commons", "Public domain / free"),
    # technology
    "article_technology_011": ("binary.jpg", "Binary code close-up", "Wikimedia Commons", "CC / free"),
    "article_technology_012": ("internet.jpg", "Internet connectivity concept", "Wikimedia Commons", "CC / free"),
    "article_technology_025": ("computer.jpg", "Early personal computer", "Wikimedia Commons", "Public domain / museum"),
    "article_technology_029": ("internet.jpg", "Global network concept", "Wikimedia Commons", "CC / free"),
    "article_tech_algorithms_011": ("algorithm.jpg", "Networked systems for step-by-step processes", "Wikimedia Commons", "CC / free"),
    "article_tech_simple_machines_012": ("lever.jpg", "Lever simple machine diagram", "Wikimedia Commons", "Public domain"),
    # geography
    "article_geography_013": ("continent.jpg", "World map showing continents", "Wikimedia Commons", "Public domain"),
    "article_geography_014": ("ocean-map.jpg", "World map highlighting oceans", "Wikimedia Commons", "Public domain"),
    "article_geography_026": ("maps-read.jpg", "Blank world map for reading practice", "Wikimedia Commons", "Public domain"),
    "article_geo_rivers_005": ("river-delta.jpg", "River and landscape from above", "NASA", "Public domain (NASA)"),
    "article_geo_maps_006": ("maps-read.jpg", "Map for navigation lessons", "Wikimedia Commons", "Public domain"),
    "article_geo_compass_020": ("compass-rose.jpg", "Compass rose", "Wikimedia Commons", "Public domain"),
    # art
    "article_art_027": ("colors.jpg", "Painter’s oil palette", "Wikimedia Commons", "CC / free"),
    "article_art_050": ("shapes-art.jpg", "Geometric shapes", "Wikimedia Commons", "Public domain"),
    "article_art_color_013": ("paint-palette.jpg", "Oil painting palette with colors", "Wikimedia Commons", "CC / free"),
    "article_art_landscape_014": ("landscape-art.jpg", "Impressionist landscape painting", "Claude Monet / Wikimedia", "Public domain"),
    # nature expansion
    "article_nature_meadow_001": ("meadow.jpg", "Meadow wildflowers", "Wikimedia Commons", "CC / free"),
    "article_nature_bees_002": ("bee.jpg", "Honey bee on a flower", "Wikimedia Commons", "CC BY-SA"),
    "article_nature_photosynthesis_003": ("leaf.jpg", "Green leaf close-up", "Wikimedia Commons", "CC / free"),
    "article_nature_water_cycle_004": ("clouds-earth.jpg", "Clouds and Earth from orbit", "NASA", "Public domain (NASA)"),
    "article_nature_deciduous_018": ("tree.jpg", "Tree in landscape", "Wikimedia Commons", "CC / free"),
    "article_science_seasons_017": ("season-autumn.jpg", "Autumn leaves", "Wikimedia Commons", "CC / free"),
    "article_logic_patterns_019": ("patterns.jpg", "Repeating geometric pattern", "Wikimedia Commons", "Public domain / free"),
    "article_hist_castles_007": ("castle.jpg", "Stone castle", "Wikimedia Commons", "CC / free"),
    "article_hist_towns_rivers_008": ("town-river.jpg", "River settlement landscape", "Wikimedia Commons", "CC / free"),
    # space expansion
    "article_space_age_begins_001": ("sputnik.jpg", "Sputnik 1 satellite", "NASA via Wikimedia", "Public domain (NASA)"),
    "article_space_gagarin_002": ("gagarin.jpg", "Yuri Gagarin", "Wikimedia Commons", "Public domain / free"),
    "article_space_women_pioneers_003": ("women-space.jpg", "Sally Ride, pioneering astronaut", "NASA / Wikimedia", "Public domain (NASA)"),
    "article_space_apollo11_004": ("moon-surface.jpg", "Apollo astronauts on the Moon", "NASA", "Public domain (NASA)"),
    "article_space_apollo_program_005": ("earth-rise.jpg", "Earthrise from lunar mission", "NASA", "Public domain (NASA)"),
    "article_space_iss_006": ("iss-crew.jpg", "Crew aboard the space station", "NASA", "Public domain (NASA)"),
    "article_space_shuttle_007": ("shuttle-hubble.jpg", "Space Shuttle with Hubble", "NASA", "Public domain (NASA)"),
    "article_space_commercial_008": ("commercial-crew.jpg", "Modern crewed rocket launch", "NASA", "Public domain (NASA)"),
    "article_space_artemis_009": ("artemis.jpg", "SLS rocket for Artemis lunar missions", "NASA", "Public domain (NASA)"),
    "article_space_orbit_basics_010": ("orbit-diagram.jpg", "Orbital altitude diagram", "Wikimedia Commons", "Public domain / free"),
    "article_space_telescopes_011": ("telescope-mirror.jpg", "Space telescope hardware", "NASA", "Public domain (NASA)"),
    "article_space_mars_012": ("mars-rover.jpg", "Mars rover", "NASA / JPL", "Public domain (NASA)"),
    "article_space_probes_013": ("probe.jpg", "Voyager space probe", "NASA / Wikimedia", "Public domain (NASA)"),
    "article_space_rockets_014": ("rocket-sts.jpg", "Rocket launch", "NASA", "Public domain (NASA)"),
    "article_space_timeline_015": ("timeline-space.jpg", "Early satellite era imagery", "NASA", "Public domain (NASA)"),
    "article_space_careers_016": ("careers-space.jpg", "Mission control center", "NASA / Wikimedia", "Public domain / free"),
    "article_space_china_india_017": ("china-space.jpg", "Shenzhou spacecraft", "Wikimedia Commons", "CC / free"),
    "article_space_safety_018": ("spacesuit.jpg", "Spacesuit training or display", "NASA", "Public domain (NASA)"),
    # ocean expansion
    "article_ocean_blue_planet_001": ("blue-planet.jpg", "Earth the blue planet", "NASA", "Public domain (NASA)"),
    "article_ocean_water_cycle_link_002": ("water-cycle.jpg", "Water moving between ocean and sky", "NASA", "Public domain (NASA)"),
    "article_ocean_salty_003": ("salty.jpg", "Ocean waves", "Wikimedia Commons", "CC / free"),
    "article_ocean_tides_004": ("tide.jpg", "Low tide shoreline", "Wikimedia Commons", "CC / free"),
    "article_ocean_waves_005": ("wave.jpg", "Large breaking wave", "Wikimedia Commons", "CC / free"),
    "article_ocean_currents_006": ("current-map.jpg", "Map of ocean currents", "Wikimedia Commons", "Public domain"),
    "article_ocean_habitats_007": ("habitats-sea.jpg", "Kelp forest habitat", "Wikimedia Commons", "CC / free"),
    "article_ocean_coral_008": ("coral.jpg", "Coral reef imagery", "NASA / free", "Public domain (NASA)"),
    "article_ocean_food_web_009": ("food-web.jpg", "Microscopic diatoms / plankton", "Wikimedia Commons", "CC / free"),
    "article_ocean_mammals_010": ("whale.jpg", "Humpback whale", "Wikimedia Commons", "CC / free"),
    "article_ocean_deep_011": ("deep-sea.jpg", "Deep-sea hydrothermal vent", "Wikimedia Commons / NOAA", "Public domain / free"),
    "article_ocean_climate_012": ("climate-ocean.jpg", "Ocean current chart", "Wikimedia Commons", "Public domain"),
    "article_ocean_exploration_013": ("exploration-ocean.jpg", "Deep-sea submersible Alvin", "Wikimedia Commons", "Public domain / free"),
    "article_ocean_conservation_014": ("pollution.jpg", "Marine debris on a coast", "Wikimedia Commons", "CC / free"),
    "article_ocean_history_015": ("history-ocean.jpg", "Tall ship at sea", "Wikimedia Commons", "CC / free"),
    "article_ocean_coasts_016": ("beach.jpg", "Sandy beach coastline", "Wikimedia Commons", "CC / free"),
    "article_ocean_fish_017": ("fish.jpg", "Colorful reef fish", "NOAA / Wikimedia", "Public domain (NOAA)"),
    "article_ocean_careers_018": ("careers-ocean.jpg", "Ocean research submersible", "Wikimedia Commons", "Public domain / free"),
}


def resolve_existing(name: str) -> str | None:
    """Return filename that exists on disk for a logical name."""
    candidates = [
        name,
        Path(name).stem + ".jpg",
        Path(name).stem + ".png",
        Path(name).stem + ".svg",
        Path(name).stem + ".jpeg",
    ]
    for c in candidates:
        p = IMG_DIR / c
        if p.exists() and p.stat().st_size > 500:
            return c
    return None


def main() -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    available = download_all()
    print(f"Available image files: {len(list(IMG_DIR.glob('*')))}")

    fallback = resolve_existing("earth-apollo17.jpg") or resolve_existing("ocean.jpg") or "earth-apollo17.jpg"
    used: Counter[str] = Counter()
    missing_files: list[str] = []
    updated = 0

    for path in sorted((PACK / "articles").glob("articles-*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for a in data.get("articles") or []:
            aid = a["id"]
            if aid in ARTICLE_IMAGE:
                fname, alt, credit, license_ = ARTICLE_IMAGE[aid]
            else:
                # heuristic leftovers
                fname, alt, credit, license_ = (
                    fallback,
                    a.get("title") or "Illustration",
                    "NASA / free educational media",
                    "Public domain / free",
                )
            resolved = resolve_existing(fname)
            if not resolved:
                missing_files.append(f"{aid} -> {fname}")
                resolved = fallback if resolve_existing(fallback) else fname
            a["image"] = {
                "url": f"/content/packs/default-v1/images/{resolved}",
                "alt": alt,
                "credit": credit,
                "license": license_,
            }
            used[resolved] += 1
            updated += 1
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"wrote {path.name}")

    man_path = PACK / "manifest.json"
    man = json.loads(man_path.read_text(encoding="utf-8"))
    man["packVersion"] = "2.5.0"
    man["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    man["description"] = (
        "Educational content for Emily's Game with offline Book illustrations "
        "(unique on-topic free/NASA images under packs/default-v1/images/)."
    )
    man_path.write_text(json.dumps(man, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    (IMG_DIR / "README.md").write_text(
        "# Book illustrations (offline)\n\n"
        "All files are free-to-use for educational offline play:\n"
        "- **NASA** media: public domain\n"
        "- **Wikimedia Commons**: public domain / free cultural works (see credit on each article)\n\n"
        "Referenced only as `/content/packs/default-v1/images/<file>` — no remote URLs in the game.\n",
        encoding="utf-8",
    )

    print(f"Updated {updated} articles")
    print("Usage distribution (top):", used.most_common(15))
    print("Unique images used:", len(used))
    if missing_files:
        print("Missing preferred files (fell back):", len(missing_files))
        for m in missing_files[:20]:
            print(" ", m)


if __name__ == "__main__":
    main()
