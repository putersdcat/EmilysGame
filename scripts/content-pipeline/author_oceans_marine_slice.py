#!/usr/bin/env python3
"""Oceans & marine science content → default-v1 quizzes-007 + articles-004."""
from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "public" / "content" / "packs" / "default-v1"
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
PROV = {
    "source": "manual-curation",
    "license": "CC0-1.0",
    "dateIngested": NOW,
    "curator": "agent-content-oceans-marine-2026-07",
}


def age(band: str) -> dict:
    if band == "5-7":
        return {"minAge": 5, "maxAge": 7, "ageBand": "5-7"}
    if band == "8-10":
        return {"minAge": 8, "maxAge": 10, "ageBand": "8-10"}
    return {"minAge": 11, "maxAge": None, "ageBand": "11-12+"}


def q(id_, cat, diff, band, question, answers, hint, explanation, tags=None):
    assert len(answers) == 4, id_
    return {
        "id": id_,
        "category": cat,
        "difficulty": diff,
        "ageMetadata": age(band),
        "question": question,
        "answers": answers,
        "hint": hint,
        "explanation": explanation,
        "tags": tags or ["ocean", "marine"],
        "provenance": dict(PROV),
    }


def art(id_, subject, band, title, summary, content, key_terms, reading_level, related=None):
    a = {
        "id": id_,
        "subject": subject,
        "ageMetadata": age(band),
        "title": title,
        "summary": summary,
        "content": content,
        "keyTerms": key_terms,
        "readingLevel": reading_level,
        "provenance": dict(PROV),
    }
    if related:
        a["related"] = related
    return a


def build_questions():
    t = ["ocean", "marine"]
    items = []

    # Easy 5–7
    items += [
        q("q_ocean_e_001", "science", "easy", "5-7",
          "Most of Earth’s surface is covered by…",
          ["Ocean water", "Only forests", "Only cities", "Only ice cream"],
          "Blue planet.",
          "Oceans cover about 70% of Earth’s surface.",
          t + ["earth"]),
        q("q_ocean_e_002", "science", "easy", "5-7",
          "Ocean water tastes…",
          ["Salty", "Like pure sugar always", "Like lemon only", "Like nothing ever"],
          "Not for drinking straight from the sea.",
          "Seawater contains dissolved salts, mainly sodium chloride.",
          t + ["saltwater"]),
        q("q_ocean_e_003", "science", "easy", "5-7",
          "A fish breathes underwater mainly using…",
          ["Gills", "Only lungs like land mammals always", "Only leaves", "Only wheels"],
          "Side flaps.",
          "Gills take oxygen from water so fish can “breathe” underwater.",
          t + ["fish", "gills"]),
        q("q_ocean_e_004", "science", "easy", "5-7",
          "Waves at the beach are mostly powered by…",
          ["Wind blowing across the water", "Fish singing", "Underwater drums only", "Moonlight paint"],
          "Air on water.",
          "Wind transfers energy to the surface and builds waves.",
          t + ["waves", "wind"]),
        q("q_ocean_e_005", "geography", "easy", "5-7",
          "The biggest ocean on Earth is the…",
          ["Pacific Ocean", "A tiny pond", "Only the kitchen sink", "A single raindrop ocean"],
          "Largest basin.",
          "The Pacific is the largest and deepest major ocean.",
          t + ["pacific"]),
        q("q_ocean_e_006", "science", "easy", "5-7",
          "A whale is…",
          ["A mammal that lives in the ocean", "A giant fish with scales like carp always", "A type of seaweed", "A floating rock only"],
          "Warm-blooded ocean giant.",
          "Whales are mammals: they breathe air and feed milk to their young.",
          t + ["whale", "mammal"]),
        q("q_ocean_e_007", "science", "easy", "5-7",
          "Coral reefs are built largely by…",
          ["Tiny animals called coral polyps", "Only metal robots", "Only snowflakes", "Only airplanes"],
          "Living builders.",
          "Coral polyps form hard skeletons that build reefs over long times.",
          t + ["coral", "reef"]),
        q("q_ocean_e_008", "science", "easy", "5-7",
          "What should you do with trash near the ocean or a river?",
          ["Put it in a bin so it doesn’t wash into waterways", "Throw it in the waves for fish toys", "Bury plastic under sand always", "Feed it to seagulls only"],
          "Keep seas clean.",
          "Litter can harm wildlife; proper disposal protects oceans and rivers.",
          t + ["conservation"]),
        q("q_ocean_e_009", "geography", "easy", "5-7",
          "A beach is where…",
          ["Land meets the sea or a large lake", "Only mountains touch clouds", "Only deserts meet forests always", "Only cities meet farms"],
          "Shoreline.",
          "Beaches form along shorelines where waves and sediment meet land.",
          t + ["beach", "shore"]),
        q("q_ocean_e_010", "science", "easy", "5-7",
          "Seaweed is a kind of…",
          ["Plant-like ocean algae (not a tree)", "Metal cable only", "Type of cloud", "Desert cactus only"],
          "Green in the water.",
          "Many seaweeds are algae that grow in sunlight near coasts.",
          t + ["seaweed", "algae"]),
        q("q_ocean_e_011", "science", "easy", "5-7",
          "Sharks are…",
          ["Fish with skeletons made mostly of cartilage", "Mammals like dogs", "Birds that swim only", "Insects with eight legs"],
          "Cartilage, not bone like ours.",
          "Sharks are cartilaginous fish; they are important ocean predators.",
          t + ["shark", "fish"]),
        q("q_ocean_e_012", "math", "easy", "5-7",
          "A tide pool has 4 crabs. 2 more crawl in. How many crabs now?",
          ["6", "2", "8", "1"],
          "4 + 2.",
          "4 + 2 = 6 crabs.",
          t + ["addition"]),
    ]

    # Medium 8–10
    items += [
        q("q_ocean_m_001", "science", "medium", "8-10",
          "What mainly causes ocean tides on Earth?",
          ["Gravity of the Moon (and Sun) pulling on Earth’s water", "Fish swimming in circles only", "Only underwater volcanoes always", "Airplane noise"],
          "Lunar tug.",
          "The Moon’s gravity (and the Sun’s) raises tidal bulges as Earth rotates.",
          t + ["tides", "moon"]),
        q("q_ocean_m_002", "science", "medium", "8-10",
          "Phytoplankton are important because they…",
          ["Make a lot of Earth’s oxygen through photosynthesis", "Only eat whales", "Only live in deserts", "Build rockets"],
          "Tiny ocean plants.",
          "Microscopic phytoplankton produce a large share of planetary oxygen and form food-web bases.",
          t + ["phytoplankton", "oxygen"]),
        q("q_ocean_m_003", "geography", "medium", "8-10",
          "Salinity means…",
          ["How much salt is dissolved in water", "How loud waves are", "How tall a cliff is", "How fast a boat is"],
          "Saltiness measure.",
          "Salinity is the concentration of dissolved salts in water.",
          t + ["salinity"]),
        q("q_ocean_m_004", "science", "medium", "8-10",
          "The deep ocean is dark mainly because…",
          ["Sunlight is absorbed and scattered in the upper layers", "Fish turn off the Sun", "There is a permanent umbrella", "Space blocks the ocean only"],
          "Light runs out with depth.",
          "Water absorbs light; below the photic zone it is permanently dark.",
          t + ["deep-sea", "light"]),
        q("q_ocean_m_005", "science", "medium", "8-10",
          "A food web in the ocean usually starts with…",
          ["Producers like phytoplankton and algae", "Only great white sharks", "Only plastic bottles", "Only boats"],
          "Tiny producers first.",
          "Energy enters most marine webs through photosynthetic producers.",
          t + ["food-web", "ecology"]),
        q("q_ocean_m_006", "geography", "medium", "8-10",
          "A current is…",
          ["A flowing “river” of water within the ocean", "A type of cloud only", "A mountain path only", "A dry desert wind only"],
          "Moving ocean streams.",
          "Ocean currents transport heat, nutrients, and organisms around basins.",
          t + ["current"]),
        q("q_ocean_m_007", "science", "medium", "8-10",
          "Coral bleaching happens when stressed corals…",
          ["Lose the colorful algae partners that live in their tissues", "Turn into solid gold", "Grow legs and walk ashore", "Become mammals"],
          "Color leaves the coral.",
          "Under heat or stress, corals may expel symbiotic algae and look white/bleached.",
          t + ["coral", "climate"]),
        q("q_ocean_m_008", "science", "medium", "8-10",
          "Why can plastic trash harm ocean animals?",
          ["They may eat it or get tangled in it", "Plastic turns into healthy vitamins always", "Animals need plastic for bones", "Plastic evaporates into pure air only"],
          "Pollution problem.",
          "Plastics can be swallowed or entangle wildlife and break into microplastics.",
          t + ["pollution", "conservation"]),
        q("q_ocean_m_009", "technology", "medium", "8-10",
          "Sonar helps ships and scientists…",
          ["Map the seafloor with sound echoes", "Cook seafood instantly", "Make waves larger for surfing only", "Stop the Moon’s gravity"],
          "Ping and listen.",
          "Sonar measures how long sound takes to bounce back from underwater surfaces.",
          t + ["sonar", "mapping"]),
        q("q_ocean_m_010", "history", "medium", "8-10",
          "Polynesian navigators were famous for…",
          ["Ocean voyages using stars, waves, and birds as guides", "Only inventing snowboards", "Only mapping deserts with cars", "Building the first rockets in 1957 only"],
          "Pacific wayfinding.",
          "Traditional Pacific navigation enabled long ocean crossings without modern GPS.",
          t + ["navigation", "history"]),
        q("q_ocean_m_011", "science", "medium", "8-10",
          "Estuaries are special because…",
          ["Fresh river water mixes with salty seawater", "They are only dry caves", "They are only on Mars", "They never change"],
          "Brackish nurseries.",
          "Estuaries are productive habitats where rivers meet the sea.",
          t + ["estuary", "habitat"]),
        q("q_ocean_m_012", "science", "medium", "8-10",
          "What is kelp?",
          ["A large brown seaweed that can form underwater forests", "A type of dolphin", "A metal submarine", "A desert shrub only"],
          "Tall ocean “trees.”",
          "Kelp forests shelter many species along cool coasts.",
          t + ["kelp", "seaweed"]),
        q("q_ocean_m_013", "geography", "medium", "8-10",
          "The Mariana Trench is known as…",
          ["One of the deepest places in Earth’s oceans", "The tallest mountain above sea level only", "A freshwater lake in a desert", "A river in a city park only"],
          "Deepest deep.",
          "The Mariana Trench in the Pacific reaches extreme depths below sea level.",
          t + ["trench", "pacific"]),
        q("q_ocean_m_014", "science", "medium", "8-10",
          "Dolphins are…",
          ["Marine mammals that breathe air", "Fish that never need air", "Insects with shells", "Types of coral"],
          "Blowholes up top.",
          "Dolphins are mammals; they surface to breathe air through a blowhole.",
          t + ["dolphin", "mammal"]),
        q("q_ocean_m_015", "math", "medium", "8-10",
          "If the tide rises 2 meters and later falls 2 meters back to the start, the net change is…",
          ["0 meters", "4 meters higher forever", "2 meters lower forever", "100 meters"],
          "Up then down.",
          "Rising +2 and falling −2 returns to the original level (net 0).",
          t + ["tides", "integers"]),
    ]

    # Hard 11–12+
    items += [
        q("q_ocean_h_001", "science", "hard", "11-12+",
          "Thermohaline circulation is driven mainly by differences in…",
          ["Temperature and salinity that change water density", "Only bird migration", "Only moonlight color", "Only ship traffic noise"],
          "Heat + salt density.",
          "Cold, salty water can sink and help drive global deep currents.",
          t + ["circulation", "density"]),
        q("q_ocean_h_002", "science", "hard", "11-12+",
          "Upwelling is important because it…",
          ["Brings nutrient-rich deep water toward the surface", "Removes all fish instantly", "Boils the ocean", "Stops winds forever"],
          "Nutrients rise.",
          "Upwelling fertilizes surface waters and can support rich fisheries.",
          t + ["upwelling", "nutrients"]),
        q("q_ocean_h_003", "science", "hard", "11-12+",
          "Ocean acidification is linked mainly to…",
          ["Extra carbon dioxide dissolving into seawater", "Only louder waves", "Only colder sand", "Only more seagulls"],
          "CO₂ into water.",
          "Absorbed CO₂ forms carbonic acid, lowering pH and stressing some shell-builders.",
          t + ["acidification", "carbon"]),
        q("q_ocean_h_004", "geography", "hard", "11-12+",
          "El Niño is a climate pattern involving…",
          ["Unusual warming of parts of the tropical Pacific and weather shifts worldwide", "Only a single raindrop in one city", "Only moon eclipses monthly", "Only desert expansion on Mars"],
          "Pacific climate swing.",
          "El Niño/La Niña phases alter Pacific temperatures and global weather patterns.",
          t + ["el-nino", "climate"]),
        q("q_ocean_h_005", "science", "hard", "11-12+",
          "Hydrothermal vents support life mainly using…",
          ["Chemical energy from Earth’s interior (chemosynthesis)", "Only tropical sunlight at the surface always", "Only human food scraps", "Only wind turbines underwater"],
          "Dark ecosystem power.",
          "Vent microbes use chemical energy; animals farm or eat those microbes.",
          t + ["hydrothermal", "chemosynthesis"]),
        q("q_ocean_h_006", "science", "hard", "11-12+",
          "The continental shelf is…",
          ["The shallow seafloor bordering continents before the steep slope", "The center of the Sun", "A cloud layer only", "A mountain summit only"],
          "Shallow margin.",
          "Shelves are relatively shallow and often biologically productive.",
          t + ["shelf", "seafloor"]),
        q("q_ocean_h_007", "technology", "hard", "11-12+",
          "Argo floats help ocean science by…",
          ["Drifting and measuring temperature and salinity profiles automatically", "Only painting maps by hand", "Only counting beach towels", "Only powering streetlights"],
          "Robot ocean network.",
          "Argo profilers dive and surface to send data used in climate and ocean models.",
          t + ["argo", "observation"]),
        q("q_ocean_h_008", "history", "hard", "11-12+",
          "The Challenger expedition (1870s) is remembered for…",
          ["Founding modern oceanography with global sampling voyages", "Landing on the Moon", "Inventing the smartphone", "Building the first railroad only"],
          "Science at sea.",
          "HMS Challenger’s voyage systematically studied depths, life, and chemistry worldwide.",
          t + ["oceanography", "history"]),
        q("q_ocean_h_009", "science", "hard", "11-12+",
          "Bioluminescence is…",
          ["Living organisms producing light", "Only reflected sunlight always", "Only flashlight batteries in fish", "Only lightning in storms"],
          "Living glow.",
          "Many deep-sea species use chemical light for signaling, hunting, or defense.",
          t + ["bioluminescence", "deep-sea"]),
        q("q_ocean_h_010", "science", "hard", "11-12+",
          "A gyre is…",
          ["A large system of circulating ocean currents", "A type of coral polyp only", "A single tide pool", "A mountain glacier only"],
          "Spinning basin flow.",
          "Subtropical gyres circulate water and can concentrate floating debris.",
          t + ["gyre", "current"]),
        q("q_ocean_h_011", "geography", "hard", "11-12+",
          "Mid-ocean ridges are places where…",
          ["New seafloor forms as tectonic plates spread apart", "Continents always sink forever", "Rivers begin as ice only", "Deserts form under ice only"],
          "Seafloor spreading.",
          "Magma rises at divergent boundaries, creating new oceanic crust.",
          t + ["plate-tectonics", "ridge"]),
        q("q_ocean_h_012", "science", "hard", "11-12+",
          "Mangrove forests help coasts by…",
          ["Buffering storms and providing nursery habitat", "Removing all salt from the ocean", "Stopping the Moon’s orbit", "Turning seawater into lava"],
          "Rooted shoreline protectors.",
          "Mangrove roots stabilize shorelines and shelter young fish.",
          t + ["mangrove", "habitat"]),
        q("q_ocean_h_013", "technology", "hard", "11-12+",
          "Remotely operated vehicles (ROVs) are useful because they…",
          ["Explore deep or dangerous waters while pilots stay on a ship", "Only work on dry sidewalks", "Replace all fish permanently", "Stop tides"],
          "Robots on tethers.",
          "ROVs carry cameras and tools to study wrecks, vents, and deep habitats.",
          t + ["rov", "exploration"]),
        q("q_ocean_h_014", "science", "hard", "11-12+",
          "Dissolved oxygen in seawater matters because…",
          ["Most marine animals need it to respire", "Fish drink pure oxygen bubbles only from space", "Salt replaces oxygen always", "Waves remove the need to breathe"],
          "Breathe dissolved O₂.",
          "Low-oxygen “dead zones” stress or kill organisms that cannot escape.",
          t + ["oxygen", "ecology"]),
        q("q_ocean_h_015", "history", "hard", "11-12+",
          "Modern ocean conservation efforts often focus on…",
          ["Marine protected areas, sustainable fishing, and reducing pollution", "Banning all science forever", "Filling trenches with plastic", "Stopping rainfall worldwide"],
          "Protect and manage.",
          "Science-based management tries to keep ecosystems productive for the future.",
          t + ["conservation", "policy"]),
        q("q_ocean_h_016", "science", "hard", "11-12+",
          "Sea ice is important for climate because it…",
          ["Reflects sunlight and affects polar ecosystems", "Creates deserts in the tropics always", "Removes gravity", "Stops all ocean currents instantly"],
          "Bright white cooler.",
          "Ice albedo reflects energy; melting changes habitats and feedbacks.",
          t + ["sea-ice", "climate"]),
        q("q_ocean_h_017", "math", "hard", "11-12+",
          "Pressure in the ocean increases with depth roughly because…",
          ["More water weight presses from above", "Fish push harder for fun", "Light becomes heavier", "Salt disappears"],
          "Stack of water.",
          "Hydrostatic pressure rises with the weight of the overlying water column.",
          t + ["pressure", "depth"]),
        q("q_ocean_h_018", "logic", "hard", "11-12+",
          "If all reefs need clean water, and this bay’s water is heavily polluted, then…",
          ["The reef there is at higher risk", "Pollution always helps coral", "Reefs cannot exist on Earth", "Clean water is irrelevant"],
          "Apply the rule.",
          "Given the premise, polluted water threatens reef health.",
          t + ["reasoning", "reefs"]),
        q("q_ocean_h_019", "language", "hard", "11-12+",
          "“Abyssal” in ocean science usually refers to…",
          ["The deep seafloor zone", "Only the sunny beach surface", "Only river foam", "Only cloud tips"],
          "Deep plains.",
          "The abyssal zone is a deep, dark region of the ocean basins.",
          t + ["vocabulary", "abyssal"]),
        q("q_ocean_h_020", "art", "medium", "8-10",
          "Painters of seascapes often study…",
          ["Light on waves, horizon lines, and color of water and sky", "Only underground caves with no water", "Only silent empty rooms", "Only desert sand dunes always"],
          "Ocean pictures.",
          "Seascapes focus on water, weather, ships, and coastal light.",
          t + ["seascape", "art"]),
    ]

    # A few more tech/history/language easy-medium for balance
    items += [
        q("q_ocean_tech_e_01", "technology", "easy", "5-7",
          "A life jacket helps a person in water by…",
          ["Helping them float so they can breathe", "Making them sink faster", "Turning water into ice always", "Calling fish to dinner only"],
          "Stay up.",
          "Buoyant life jackets keep airways above water.",
          t + ["safety"]),
        q("q_ocean_hist_e_01", "history", "easy", "5-7",
          "Long ago, people crossed oceans mainly using…",
          ["Sailing ships powered by wind", "Only jet packs", "Only subways under the sea always", "Only hot-air balloons over land only"],
          "Canvas and wind.",
          "Wind-powered ships connected distant coasts for trade and exploration.",
          t + ["ships", "history"]),
        q("q_ocean_lang_e_01", "language", "easy", "5-7",
          "The word “marine” is about…",
          ["The sea and ocean life", "Only mountains", "Only outer space stars always", "Only kitchen spoons"],
          "Sea-related.",
          "Marine means of or relating to the sea.",
          t + ["vocabulary"]),
        q("q_ocean_tech_m_01", "technology", "medium", "8-10",
          "A tide gauge measures…",
          ["How high the sea surface is over time", "Only wind speed on mountains", "Only soil dryness in deserts", "Only star brightness"],
          "Sea level sensor.",
          "Tide gauges record water height for ports, science, and flood planning.",
          t + ["measurement"]),
        q("q_ocean_sci_e_13", "science", "easy", "5-7",
          "Penguins are birds that…",
          ["Swim well but do not fly in the air like eagles", "Only live in hot deserts always", "Breathe with gills like fish", "Have eight legs"],
          "Waddle and dive.",
          "Penguins are flightless birds adapted for swimming (many in cold southern seas).",
          t + ["penguin", "birds"]),
        q("q_ocean_geo_e_02", "geography", "easy", "5-7",
          "An island is land that is…",
          ["Surrounded by water", "Only on top of clouds", "Never near water", "Always underground"],
          "Water all around.",
          "Islands are land areas fully surrounded by water.",
          t + ["island"]),
        q("q_ocean_sci_m_16", "science", "medium", "8-10",
          "Symbiosis means…",
          ["Different species living closely, often helping each other", "Only animals fighting always", "Only rocks melting", "Only storms forming"],
          "Living partners.",
          "Coral and algae are a classic marine partnership example.",
          t + ["symbiosis", "ecology"]),
        q("q_ocean_math_e_02", "math", "easy", "5-7",
          "You see 5 starfish, then 3 swim out of sight. How many can you still see?",
          ["2", "8", "5", "0 always"],
          "5 − 3.",
          "5 − 3 = 2 starfish still visible.",
          t + ["subtraction"]),
    ]

    return items


def build_articles():
    return [
        art(
            "article_ocean_blue_planet_001",
            "science",
            "5-7",
            "Earth: The Blue Planet",
            "Why our world looks so watery from space.",
            "From space, Earth looks mostly **blue** because oceans cover so much of the surface. "
            "Oceans store heat, make weather, and are home to countless animals.\n\n"
            "Even if you live far from the coast, rain that falls on meadows may have evaporated from the sea "
            "long ago. The ocean and the land are connected through the **water cycle**.",
            ["ocean", "Earth", "water cycle", "blue planet"],
            2.0,
            ["article_ocean_water_cycle_link_002", "article_ocean_salty_003"],
        ),
        art(
            "article_ocean_water_cycle_link_002",
            "geography",
            "8-10",
            "Oceans and the Water Cycle",
            "How seas feed clouds and rain.",
            "The Sun warms the ocean surface. Water **evaporates**, rises, forms clouds, and later falls as "
            "**precipitation**. Rivers return much of that water to the sea.\n\n"
            "Oceans are the giant engine of Earth’s water cycle. When ocean temperatures change, "
            "weather patterns far inland can change too.",
            ["evaporation", "precipitation", "ocean", "weather"],
            4.0,
            ["article_ocean_blue_planet_001", "article_ocean_currents_006"],
        ),
        art(
            "article_ocean_salty_003",
            "science",
            "5-7",
            "Why Is the Ocean Salty?",
            "Dissolved minerals from land and vents.",
            "Rain washes tiny amounts of minerals from rocks into rivers. Rivers carry those minerals to the sea. "
            "Over long ages, salts build up in the ocean.\n\n"
            "That is why ocean water tastes salty and is not for drinking without special treatment. "
            "Different seas can be a bit more or less salty depending on rivers, ice, and evaporation.",
            ["salt", "minerals", "rivers", "salinity"],
            2.5,
            ["article_ocean_blue_planet_001", "article_ocean_tides_004"],
        ),
        art(
            "article_ocean_tides_004",
            "science",
            "8-10",
            "Tides: The Ocean’s Daily Rise and Fall",
            "How the Moon helps pull the sea.",
            "**Tides** are regular rises and falls of sea level along coasts. "
            "The **Moon’s gravity** pulls on Earth’s oceans (the Sun helps too).\n\n"
            "As Earth turns, shorelines move through tidal bulges, so many places see high and low tide each day. "
            "Tide pools left at low tide are great places to spot small ocean creatures — carefully and without harming them.",
            ["tides", "Moon", "gravity", "tide pool"],
            4.0,
            ["article_ocean_salty_003", "article_ocean_habitats_007"],
        ),
        art(
            "article_ocean_waves_005",
            "science",
            "8-10",
            "How Waves Form",
            "Wind energy dancing across the surface.",
            "Most waves you see at a beach start with **wind**. Air friction transfers energy into the water surface. "
            "Stronger, longer winds over more distance make bigger waves.\n\n"
            "Waves move energy; water particles mostly bob in place until the wave breaks near shore. "
            "Surfers ride that moving energy — carefully, with respect for the ocean’s power.",
            ["waves", "wind", "energy", "beach"],
            4.0,
            ["article_ocean_tides_004", "article_ocean_currents_006"],
        ),
        art(
            "article_ocean_currents_006",
            "geography",
            "11-12+",
            "Ocean Currents: Highways of Water",
            "Moving heat and life around the planet.",
            "**Currents** are large-scale flows of ocean water. Winds, Earth’s rotation, temperature, and salinity "
            "all help shape them.\n\n"
            "Currents carry warm and cold water, nutrients, and plankton. They influence climates of coastal cities "
            "and the routes ships choose. Scientists track currents with satellites, floats, and models to understand "
            "weather and climate.",
            ["current", "heat transport", "climate", "gyre"],
            5.5,
            ["article_ocean_waves_005", "article_ocean_climate_012"],
        ),
        art(
            "article_ocean_habitats_007",
            "science",
            "5-7",
            "Homes in the Sea",
            "Reefs, kelp forests, and open water.",
            "The ocean is not one single habitat. It includes:\n"
            "- **Coral reefs** — busy cities of fish and coral\n"
            "- **Kelp forests** — tall seaweed “trees”\n"
            "- **Open ocean** — wide blue water\n"
            "- **Deep sea** — dark, cold, and mysterious\n\n"
            "Each place has animals adapted to its light, temperature, and food. "
            "Protecting habitats helps protect the animals that need them.",
            ["habitat", "coral reef", "kelp", "deep sea"],
            2.5,
            ["article_ocean_coral_008", "article_ocean_food_web_009"],
        ),
        art(
            "article_ocean_coral_008",
            "science",
            "8-10",
            "Coral Reefs: Living Walls",
            "Tiny animals that build big ecosystems.",
            "**Corals** are animals. Many reef-building corals host tiny algae that share food from sunlight. "
            "Together they build rocky structures over long times.\n\n"
            "Reefs shelter huge numbers of species. When water gets too warm or polluted, corals can **bleach** "
            "and weaken. Scientists and communities work to reduce stress and protect remaining reefs.",
            ["coral", "reef", "algae", "biodiversity"],
            4.5,
            ["article_ocean_habitats_007", "article_ocean_conservation_014"],
        ),
        art(
            "article_ocean_food_web_009",
            "science",
            "8-10",
            "Who Eats Whom in the Ocean?",
            "From plankton to predators.",
            "Most ocean food webs start with tiny **phytoplankton** that make food from sunlight. "
            "Zooplankton eat them; small fish eat plankton; larger fish, seals, and sharks eat smaller animals.\n\n"
            "If one link is damaged by overfishing or pollution, effects can ripple through the web. "
            "That is why ocean health matters even if you never go fishing yourself.",
            ["food web", "plankton", "predator", "prey"],
            4.0,
            ["article_ocean_habitats_007", "article_ocean_mammals_010"],
        ),
        art(
            "article_ocean_mammals_010",
            "science",
            "5-7",
            "Ocean Mammals",
            "Whales, dolphins, and seals — air breathers at sea.",
            "Not every ocean animal is a fish! **Whales**, **dolphins**, and **seals** are **mammals**. "
            "They breathe air with lungs, are warm-blooded, and feed milk to babies.\n\n"
            "Whales may dive deep, but they must return to the surface to breathe. "
            "Watching them (from a safe distance) is a reminder that the ocean is full of surprising lives.",
            ["whale", "dolphin", "mammal", "breathe"],
            2.5,
            ["article_ocean_food_web_009", "article_ocean_blue_planet_001"],
        ),
        art(
            "article_ocean_deep_011",
            "science",
            "11-12+",
            "The Deep Sea",
            "Darkness, pressure, and strange adaptations.",
            "Below the sunlit surface, light fades quickly. The **deep sea** is cold, dark, and under crushing pressure. "
            "Yet life thrives near **hydrothermal vents**, on abyssal plains, and in midwater with **bioluminescent** animals.\n\n"
            "Humans explore with **submersibles** and **ROVs** because divers cannot safely go that deep unaided. "
            "Every expedition still finds species new to science.",
            ["deep sea", "pressure", "bioluminescence", "ROV"],
            6.0,
            ["article_ocean_exploration_013", "article_ocean_food_web_009"],
        ),
        art(
            "article_ocean_climate_012",
            "science",
            "11-12+",
            "Oceans and Climate",
            "Heat storage, carbon, and changing seas.",
            "Oceans absorb huge amounts of heat and carbon dioxide. That slows some atmospheric warming but also causes "
            "**ocean warming**, **sea-level rise** (from expansion and melting ice), and **acidification** that stresses shell-builders.\n\n"
            "Understanding ocean climate helps societies prepare for storms, fisheries shifts, and coastal change. "
            "Science tools include satellites, tide gauges, and drifting Argo floats.",
            ["climate", "sea level", "acidification", "heat"],
            6.0,
            ["article_ocean_currents_006", "article_ocean_conservation_014"],
        ),
        art(
            "article_ocean_exploration_013",
            "technology",
            "8-10",
            "Exploring the Ocean",
            "Ships, sonar, satellites, and robots.",
            "We map and study oceans with many tools:\n"
            "- **Research ships** collect samples\n"
            "- **Sonar** measures depth with sound\n"
            "- **Satellites** watch temperature and color from space\n"
            "- **ROVs and AUVs** explore where people cannot easily go\n\n"
            "Ocean exploration is still young compared with maps of land — most of the deep seafloor remains only roughly charted.",
            ["sonar", "satellite", "ROV", "research ship"],
            4.5,
            ["article_ocean_deep_011", "article_ocean_history_015"],
        ),
        art(
            "article_ocean_conservation_014",
            "science",
            "8-10",
            "Protecting the Ocean",
            "What kids and communities can understand and support.",
            "Healthy oceans need less pollution, smarter fishing, and protected habitats. Helpful ideas include:\n"
            "- Reducing single-use plastics and never littering\n"
            "- Supporting **marine protected areas**\n"
            "- Choosing sustainable seafood when adults shop\n"
            "- Learning and sharing accurate science\n\n"
            "Small actions add up when millions of people join in. The ocean is vast — and worth caring for.",
            ["conservation", "plastic", "protected area", "stewardship"],
            4.0,
            ["article_ocean_coral_008", "article_ocean_climate_012"],
        ),
        art(
            "article_ocean_history_015",
            "history",
            "11-12+",
            "Ocean Science History Highlights",
            "From ancient voyaging to modern oceanography.",
            "People have read coasts and currents for millennia. **Polynesian wayfinders** crossed the Pacific using stars and swells. "
            "Later, scientific voyages such as the **Challenger expedition** (1870s) helped found modern **oceanography** "
            "by measuring depths, chemistry, and life worldwide.\n\n"
            "Today’s global observing systems continue that mission with robots and satellites — a partnership of exploration and data.",
            ["oceanography", "Challenger", "navigation", "wayfinding"],
            6.0,
            ["article_ocean_exploration_013", "article_ocean_blue_planet_001"],
        ),
        art(
            "article_ocean_coasts_016",
            "geography",
            "5-7",
            "Coasts and Beaches",
            "Where land and sea shake hands.",
            "A **coast** is where land meets the ocean. **Beaches** form from sand, pebbles, or shells moved by waves. "
            "Storms can reshape a beach in a single night!\n\n"
            "Coasts are fun places to visit. Stay safe: watch waves, listen to lifeguards, and leave living creatures where they belong.",
            ["coast", "beach", "waves", "safety"],
            2.0,
            ["article_ocean_waves_005", "article_ocean_tides_004"],
        ),
        art(
            "article_ocean_fish_017",
            "science",
            "5-7",
            "Fishy Facts",
            "Gills, fins, and scales.",
            "Most fish use **gills** to take oxygen from water. **Fins** help them steer and swim. "
            "Many have **scales** that protect their bodies.\n\n"
            "Fish live in shallow reefs, open ocean, cold polar seas, and deep dark waters. "
            "Some school together for safety; others hide in sand or coral.",
            ["fish", "gills", "fins", "scales"],
            2.0,
            ["article_ocean_food_web_009", "article_ocean_habitats_007"],
        ),
        art(
            "article_ocean_careers_018",
            "technology",
            "8-10",
            "Ocean Careers",
            "Jobs that study and protect the sea.",
            "People who work with oceans include:\n"
            "- **Marine biologists** — study living things\n"
            "- **Oceanographers** — study water, climate, and seafloor\n"
            "- **Engineers** — build ships, sensors, and robots\n"
            "- **Conservationists** — protect habitats and species\n"
            "- **Educators** — teach others what the ocean needs\n\n"
            "Curiosity, careful measurement, and teamwork matter more than any single superpower.",
            ["career", "marine biologist", "oceanographer", "engineer"],
            4.0,
            ["article_ocean_exploration_013", "article_ocean_conservation_014"],
        ),
    ]


def rebuild_manifest():
    all_q = []
    quiz_files = sorted((PACK / "quizzes").glob("quizzes-*.json"))
    for p in quiz_files:
        all_q.extend(json.loads(p.read_text(encoding="utf-8"))["questions"])

    all_a = []
    art_files = sorted((PACK / "articles").glob("articles-*.json"))
    for p in art_files:
        all_a.extend(json.loads(p.read_text(encoding="utf-8"))["articles"])

    cat_counts = Counter(x["category"] for x in all_q)
    sub_counts = Counter(x["subject"] for x in all_a)
    age_counts = Counter(x["ageMetadata"]["ageBand"] for x in all_q)

    manifest = {
        "schemaVersion": "1.0.0",
        "packName": "Default Educational Content Pack",
        "packVersion": "2.3.0",
        "description": (
            "Educational content for Emily's Game — quizzes and Book articles. "
            "Expansions: nature/explore, spaceflight history, oceans & marine science."
        ),
        "author": "Emily's Game Content Pipeline + agent educational content 2026-07",
        "license": "CC0-1.0",
        "createdAt": "2026-02-17T08:50:38.741Z",
        "updatedAt": NOW,
        "shards": {
            "quizzes": [p.name for p in quiz_files],
            "articles": [p.name for p in art_files],
        },
        "stats": {
            "totalQuizzes": len(all_q),
            "totalArticles": len(all_a),
            "categoryCounts": {
                k: cat_counts.get(k, 0)
                for k in ("math", "science", "history", "language", "logic", "geography", "technology", "art")
            },
            "subjectCounts": {
                k: sub_counts.get(k, 0)
                for k in ("math", "science", "history", "language", "technology", "geography", "art")
            },
            "ageBandCounts": {
                "5-7": age_counts.get("5-7", 0),
                "8-10": age_counts.get("8-10", 0),
                "11-12+": age_counts.get("11-12+", 0),
            },
        },
    }
    (PACK / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Manifest totals: quizzes={len(all_q)} articles={len(all_a)}")


def main():
    questions = build_questions()
    articles = build_articles()

    quiz_path = PACK / "quizzes" / "quizzes-007.json"
    art_path = PACK / "articles" / "articles-004.json"

    quiz_path.write_text(
        json.dumps(
            {"shardId": "quizzes-007", "schemaVersion": "1.0.0", "createdAt": NOW, "questions": questions},
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    art_path.write_text(
        json.dumps(
            {"shardId": "articles-004", "schemaVersion": "1.0.0", "createdAt": NOW, "articles": articles},
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    rebuild_manifest()
    print(f"Wrote {quiz_path.name}: {len(questions)} questions")
    print(f"Wrote {art_path.name}: {len(articles)} articles")
    print("cats", Counter(q["category"] for q in questions))
    print("bands", Counter(q["ageMetadata"]["ageBand"] for q in questions))


if __name__ == "__main__":
    main()
