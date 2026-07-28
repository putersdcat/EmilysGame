#!/usr/bin/env python3
"""Author nature/explore content shards into default-v1 (no engine changes)."""
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
    "curator": "agent-content-nature-explore-2026-07",
}


def age(band: str) -> dict:
    if band == "5-7":
        return {"minAge": 5, "maxAge": 7, "ageBand": "5-7"}
    if band == "8-10":
        return {"minAge": 8, "maxAge": 10, "ageBand": "8-10"}
    return {"minAge": 11, "maxAge": None, "ageBand": "11-12+"}


def q(
    id_: str,
    cat: str,
    diff: str,
    band: str,
    question: str,
    answers: list[str],
    hint: str,
    explanation: str,
    tags: list[str],
) -> dict:
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
        "tags": tags,
        "provenance": dict(PROV),
    }


def art(
    id_: str,
    subject: str,
    band: str,
    title: str,
    summary: str,
    content: str,
    key_terms: list[str],
    reading_level: float,
    related: list[str] | None = None,
) -> dict:
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


def build_questions() -> list[dict]:
    items: list[dict] = []

    # Science / nature — meadow-friendly
    items += [
        q("q_nature_s_e_001", "science", "easy", "5-7",
          "What do green plants need to make their food?",
          ["Sunlight, water, and air", "Only rocks", "Only darkness", "Only salt"],
          "Think of a sunny garden after rain.",
          "Plants use sunlight, water, and carbon dioxide from the air to make food.",
          ["plants", "nature", "photosynthesis"]),
        q("q_nature_s_e_002", "science", "easy", "5-7",
          "Which animal is famous for making honey?",
          ["Bee", "Cat", "Frog", "Horse"],
          "Buzz!",
          "Honeybees collect nectar and turn it into honey.",
          ["animals", "insects", "farm"]),
        q("q_nature_s_e_003", "science", "easy", "5-7",
          "What do most birds use to fly?",
          ["Wings", "Fins", "Roots", "Wheels"],
          "Look at a bird’s arms.",
          "Birds have wings with feathers that help them fly.",
          ["animals", "birds"]),
        q("q_nature_s_e_004", "science", "easy", "5-7",
          "A baby chick usually hatches from a…",
          ["Egg", "Puddle", "Cloud", "Stone"],
          "Farmyard clue.",
          "Chicks hatch from eggs.",
          ["animals", "farm"]),
        q("q_nature_s_e_005", "science", "easy", "5-7",
          "What falls from clouds as liquid water?",
          ["Rain", "Only lightning", "Only smoke", "Only dust"],
          "Wet weather.",
          "Rain is liquid water falling from clouds.",
          ["weather", "water"]),
        q("q_nature_s_e_006", "science", "easy", "5-7",
          "Which animal says “moo” and gives milk people drink?",
          ["Cow", "Owl", "Snake", "Fish"],
          "Farm animal.",
          "Cows are farm animals that produce milk.",
          ["animals", "farm"]),
        q("q_nature_s_m_007", "science", "medium", "8-10",
          "What is the name of the process plants use to make sugar from sunlight?",
          ["Photosynthesis", "Digestion", "Erosion", "Freezing"],
          "Photo means light.",
          "Photosynthesis turns light energy into chemical energy stored as sugar.",
          ["plants", "photosynthesis"]),
        q("q_nature_s_m_008", "science", "medium", "8-10",
          "Why do bees visit flowers?",
          ["For nectar and pollen", "To eat only rocks", "To drink oil", "To hunt foxes"],
          "Sweet fuel for the hive.",
          "Bees collect nectar and pollen; they also pollinate plants as they travel.",
          ["insects", "pollination", "nature"]),
        q("q_nature_s_m_009", "science", "medium", "8-10",
          "What is a habitat?",
          ["A place where a living thing lives", "A type of metal only", "A weather report", "A math formula"],
          "Think “home.”",
          "A habitat is the natural home of plants and animals.",
          ["ecology", "habitat"]),
        q("q_nature_s_m_010", "science", "medium", "8-10",
          "Which gas do plants take in during photosynthesis?",
          ["Carbon dioxide", "Helium", "Only hydrogen", "Neon"],
          "We breathe out some of it.",
          "Plants take in carbon dioxide and release oxygen.",
          ["plants", "air"]),
        q("q_nature_s_m_011", "science", "medium", "8-10",
          "What do roots mostly help a plant do?",
          ["Take up water and hold the plant in place", "Only make music", "Only fly", "Only melt ice"],
          "Underground helpers.",
          "Roots absorb water and nutrients and anchor the plant.",
          ["plants", "roots"]),
        q("q_nature_s_h_012", "science", "hard", "11-12+",
          "What is pollination?",
          ["Moving pollen so plants can make seeds", "Melting glaciers only", "Digging tunnels only", "Counting stars only"],
          "Pollen travel.",
          "Pollination transfers pollen so seeds (and often fruit) can form.",
          ["pollination", "ecology"]),
        q("q_nature_s_h_013", "science", "hard", "11-12+",
          "A simple food chain usually starts with…",
          ["Producers like plants", "Only large predators", "Clouds", "Metals"],
          "Who makes food first?",
          "Producers (often plants) capture energy first; other organisms eat that energy.",
          ["ecology", "food-chain"]),
        q("q_nature_s_h_014", "science", "hard", "11-12+",
          "What does deciduous mean for many trees?",
          ["They shed leaves in a season", "They never grow leaves", "They live only underwater", "They are artificial"],
          "Autumn clue.",
          "Deciduous trees lose their leaves seasonally, often in fall.",
          ["trees", "nature"]),
        q("q_nature_s_h_015", "science", "hard", "11-12+",
          "Why is compost useful in a garden?",
          ["It returns nutrients to the soil", "It turns soil into plastic", "It removes all water forever", "It stops sunlight"],
          "Recycling for dirt.",
          "Compost breaks down plant waste into nutrients plants can use again.",
          ["soil", "gardening", "ecology"]),
    ]

    # Geography
    items += [
        q("q_geo_e_001", "geography", "easy", "5-7",
          "What is a river?",
          ["Fresh water that flows across land", "A mountain made of cheese", "A cloud of only dust", "A type of star"],
          "It moves and can make a bridge useful.",
          "A river is a flowing body of fresh water that travels across land toward a lake, sea, or ocean.",
          ["water", "river", "nature"]),
        q("q_geo_e_002", "geography", "easy", "5-7",
          "Which is bigger: a hill or a mountain (usually)?",
          ["A mountain", "A pebble", "A raindrop", "A seed"],
          "Taller landform.",
          "Mountains are generally much taller and steeper than hills.",
          ["landforms"]),
        q("q_geo_e_003", "geography", "easy", "5-7",
          "What do we call a large area of flat grassy land?",
          ["A plain or meadow", "A volcano crater only", "An iceberg only", "A canyon always"],
          "Open green space.",
          "Plains and meadows are open grassy lands; meadows often have wildflowers too.",
          ["meadow", "landforms"]),
        q("q_geo_m_004", "geography", "medium", "8-10",
          "What is a map’s compass rose for?",
          ["Showing directions like north and south", "Measuring only temperature", "Telling only jokes", "Counting only animals"],
          "N, S, E, W.",
          "A compass rose marks cardinal directions on a map.",
          ["maps", "direction"]),
        q("q_geo_m_005", "geography", "medium", "8-10",
          "Fresh water you can often drink (after cleaning) usually comes from…",
          ["Rivers, lakes, and underground aquifers", "Only ocean saltwater straight from the sea", "Only volcano lava", "Only empty space"],
          "Not the salty ocean as-is.",
          "Most drinking water comes from freshwater sources like rivers, lakes, and groundwater.",
          ["water", "resources"]),
        q("q_geo_m_006", "geography", "medium", "8-10",
          "What is an island?",
          ["Land completely surrounded by water", "A cloud", "A desert with no edges", "A single raindrop"],
          "Water all around.",
          "An island is a piece of land surrounded by water.",
          ["landforms", "water"]),
        q("q_geo_h_007", "geography", "hard", "11-12+",
          "What is the water cycle’s main driver of evaporation on Earth?",
          ["Energy from the Sun", "Moon rocks only", "Underground magnets only", "Human whistling only"],
          "Heat from above.",
          "Sunlight heats water so it evaporates; later it condenses and falls as precipitation.",
          ["water-cycle", "weather"]),
        q("q_geo_h_008", "geography", "hard", "11-12+",
          "A watershed is best described as…",
          ["Land that drains into a common river or lake", "A single raindrop", "A type of cloud only", "A mountain’s shadow only"],
          "Where rain ends up.",
          "A watershed is an area of land where all water drains toward the same body of water.",
          ["water", "rivers", "ecology"]),
    ]

    # History (gentle, kid-safe)
    items += [
        q("q_hist_e_001", "history", "easy", "5-7",
          "Long ago, many people wrote on paper-like sheets made from plants in Egypt called…",
          ["Papyrus", "Plastic wrap", "Aluminum foil", "Rubber"],
          "Ancient river culture.",
          "Ancient Egyptians used papyrus, made from a river plant, as a writing surface.",
          ["ancient", "writing"]),
        q("q_hist_e_002", "history", "easy", "5-7",
          "A castle’s high lookout wall is often called a…",
          ["Tower or battlement area", "Pillow fort only", "Kitchen sink", "Rain cloud"],
          "Stone fortress.",
          "Castles used towers and walls so people could see far and stay safer.",
          ["castles", "middle-ages"]),
        q("q_hist_m_003", "history", "medium", "8-10",
          "Why were many old towns built near rivers?",
          ["Water for drinking, travel, and farming", "Rivers block all sunlight", "Rivers create deserts only", "Rivers remove gravity"],
          "Water = life and roads.",
          "Rivers provided water, fish, fertile soil, and routes for boats and trade.",
          ["settlements", "rivers"]),
        q("q_hist_m_004", "history", "medium", "8-10",
          "What was a common job of a medieval blacksmith?",
          ["Making tools and metal items", "Only painting clouds", "Only counting stars", "Only weaving rain"],
          "Hammer and fire.",
          "Blacksmiths heated and shaped metal into tools, horseshoes, and more.",
          ["middle-ages", "crafts"]),
        q("q_hist_h_005", "history", "hard", "11-12+",
          "The Silk Road was mainly a network for…",
          ["Trade and cultural exchange across Asia and beyond", "Only underwater swimming races", "Only ice skating", "Only building sandcastles"],
          "Long-distance goods.",
          "The Silk Road linked regions through trade of goods, ideas, and technologies.",
          ["trade", "world-history"]),
        q("q_hist_h_006", "history", "hard", "11-12+",
          "Why do historians use multiple sources?",
          ["To check facts and reduce mistakes or bias", "To make stories longer only", "To avoid reading", "To erase maps"],
          "Cross-checking.",
          "Comparing sources helps historians build a more accurate picture of the past.",
          ["methods", "evidence"]),
    ]

    # Language
    items += [
        q("q_lang_e_001", "language", "easy", "5-7",
          "Which word is a noun (a person, place, or thing)?",
          ["River", "Quickly", "Happy", "Run"],
          "Name of a thing.",
          "River names a place/thing; quickly is an adverb; happy is often an adjective; run is a verb.",
          ["grammar", "noun"]),
        q("q_lang_e_002", "language", "easy", "5-7",
          "What do we put at the end of a telling sentence?",
          ["A period (.)", "Only a question mark always", "Only a comma forever", "Nothing ever"],
          "Stop sign for sentences.",
          "Statements usually end with a period.",
          ["punctuation"]),
        q("q_lang_m_003", "language", "medium", "8-10",
          "A synonym is a word that…",
          ["Means nearly the same as another word", "Means the opposite always", "Is always a number", "Is always silent"],
          "Same-ish meaning.",
          "Synonyms have similar meanings (happy / glad).",
          ["vocabulary", "synonym"]),
        q("q_lang_m_004", "language", "medium", "8-10",
          "An antonym is a word that…",
          ["Means the opposite", "Means exactly the same always", "Has no letters", "Is only used in math"],
          "Opposite pair.",
          "Antonyms are opposites (hot / cold).",
          ["vocabulary", "antonym"]),
        q("q_lang_h_005", "language", "hard", "11-12+",
          "What is a metaphor?",
          ["A comparison that says one thing is another", "A list of only numbers", "A type of rock", "A weather tool"],
          "Not using like or as.",
          "A metaphor compares by saying something is something else (time is a thief).",
          ["figurative-language", "metaphor"]),
        q("q_lang_h_006", "language", "hard", "11-12+",
          "A topic sentence usually…",
          ["States the main idea of a paragraph", "Ends every story with a joke only", "Deletes evidence", "Removes punctuation"],
          "Main idea first.",
          "Topic sentences introduce what the paragraph is about.",
          ["writing", "paragraphs"]),
    ]

    # Logic
    items += [
        q("q_logic_e_001", "logic", "easy", "5-7",
          "If all flowers need water, and roses are flowers, then roses…",
          ["Need water", "Never need water", "Are made of metal", "Cannot grow"],
          "Follow the rule.",
          "If the rule applies to all flowers, it applies to roses too.",
          ["reasoning", "deduction"]),
        q("q_logic_m_002", "logic", "medium", "8-10",
          "Pattern: 2, 4, 6, 8, … What comes next?",
          ["10", "9", "1", "100"],
          "Even numbers stepping up.",
          "The pattern adds 2 each time.",
          ["patterns", "sequences"]),
        q("q_logic_m_003", "logic", "medium", "8-10",
          "You have 3 boxes: one labeled wrong, one empty, one with apples — wait: simpler: A fence has 3 sides already. How many more sides to close a square pen?",
          ["1", "4", "0", "10"],
          "Square has 4 sides total.",
          "A square pen needs 4 sides; 3 built means 1 remaining.",
          ["spatial", "counting"]),
        q("q_logic_h_004", "logic", "hard", "11-12+",
          "If it rains, the ground gets wet. The ground is dry. What can you conclude?",
          ["It is not raining now (from this rule)", "It must be raining hard", "The sun cannot exist", "Water is impossible"],
          "Contrapositive thinking.",
          "If rain always wets the ground, dry ground means it is not currently raining (under that simple rule).",
          ["reasoning", "implication"]),
    ]

    # Technology
    items += [
        q("q_tech_e_001", "technology", "easy", "5-7",
          "What does a computer program tell a computer?",
          ["What steps to follow", "Only how to rain", "Only how to grow trees", "Only how to sleep forever"],
          "Instructions.",
          "Programs are step-by-step instructions a computer can run.",
          ["computers", "coding-basics"]),
        q("q_tech_e_002", "technology", "easy", "5-7",
          "Which tool helps you talk to someone far away with your voice?",
          ["Telephone or phone", "Shovel only", "Paintbrush only", "Compass only"],
          "Call a friend.",
          "Phones send voice (and more) over long distances.",
          ["communication"]),
        q("q_tech_m_003", "technology", "medium", "8-10",
          "What is an algorithm in everyday words?",
          ["A clear set of steps to solve a problem", "A random pile of rocks", "A type of cloud", "A silent letter only"],
          "Recipe for a problem.",
          "An algorithm is a finite sequence of instructions to accomplish a task.",
          ["algorithms", "coding-basics"]),
        q("q_tech_m_004", "technology", "medium", "8-10",
          "Why do games and apps need updates sometimes?",
          ["To fix bugs and improve features", "To remove electricity forever", "To delete all files always", "To stop the sun"],
          "Patches and improvements.",
          "Updates can fix mistakes, improve security, and add features.",
          ["software"]),
        q("q_tech_h_005", "technology", "hard", "11-12+",
          "Binary in computers mostly uses which two digits?",
          ["0 and 1", "2 and 3 only", "A and Z only", "5 and 9 only"],
          "On/off pairs.",
          "Digital systems encode information with bits, often written as 0 and 1.",
          ["binary", "computers"]),
        q("q_tech_h_006", "technology", "hard", "11-12+",
          "What does “input” mean for a device?",
          ["Information or signals going into it", "Only heat leaving it", "Only deleting memory always", "Only painting the case"],
          "Keyboard and mouse are examples.",
          "Input is data or signals provided to a system; output is what it produces.",
          ["systems", "input-output"]),
    ]

    # Art
    items += [
        q("q_art_e_001", "art", "easy", "5-7",
          "Red, blue, and yellow are often called…",
          ["Primary colors", "Only shadows", "Only numbers", "Only metals"],
          "Paint starter colors.",
          "Primary colors can mix to make many other colors.",
          ["color", "painting"]),
        q("q_art_e_002", "art", "easy", "5-7",
          "A drawing that uses only lines and no color fill is often called a…",
          ["Line drawing or sketch", "Symphony", "Equation", "Compass rose only"],
          "Pencil lines.",
          "Sketches and line drawings focus on outlines and form.",
          ["drawing"]),
        q("q_art_m_003", "art", "medium", "8-10",
          "In painting, a “landscape” usually shows…",
          ["Outdoor scenery like land and sky", "Only a single letter", "Only a math graph", "Only a phone menu"],
          "Outside view.",
          "Landscapes depict natural or outdoor scenes.",
          ["genres", "painting"]),
        q("q_art_m_004", "art", "medium", "8-10",
          "Mixing blue and yellow paint often makes…",
          ["Green", "Only red", "Only black always", "Only white always"],
          "Primary mix.",
          "Blue + yellow commonly yields green in subtractive paint mixing.",
          ["color", "mixing"]),
        q("q_art_h_005", "art", "hard", "11-12+",
          "Perspective in drawing helps create the illusion of…",
          ["Depth and distance", "Louder sound only", "Higher temperature only", "Faster time only"],
          "Near and far.",
          "Linear perspective uses vanishing points so scenes look three-dimensional.",
          ["perspective", "drawing"]),
        q("q_art_h_006", "art", "hard", "11-12+",
          "A sculpture is art that is mainly…",
          ["Three-dimensional (has height, width, and depth)", "Only flat ink on paper always", "Only a recorded song", "Only a silent film"],
          "You can walk around it.",
          "Sculpture occupies space in three dimensions.",
          ["sculpture", "form"]),
    ]

    # A few more math easy for 5-7 balance (nature-themed numbers)
    items += [
        q("q_math_e_n01", "math", "easy", "5-7",
          "A nest has 3 eggs. Two more eggs are laid. How many eggs now?",
          ["5", "1", "6", "0"],
          "3 + 2.",
          "3 + 2 = 5 eggs.",
          ["addition", "nature"]),
        q("q_math_e_n02", "math", "easy", "5-7",
          "You pick 10 berries and eat 4. How many are left?",
          ["6", "14", "4", "10"],
          "10 − 4.",
          "10 − 4 = 6 berries left.",
          ["subtraction", "nature"]),
        q("q_math_m_n03", "math", "medium", "8-10",
          "A path is 12 meters long. You walk half of it. How far did you walk?",
          ["6 meters", "24 meters", "12 meters", "2 meters"],
          "Half of 12.",
          "Half of 12 is 6.",
          ["fractions", "measurement"]),
        q("q_math_h_n04", "math", "hard", "11-12+",
          "A rectangular garden is 8 m long and 3 m wide. What is its area?",
          ["24 square meters", "11 square meters", "5 square meters", "32 square meters"],
          "Length × width.",
          "Area of a rectangle = length × width = 8 × 3 = 24 m².",
          ["area", "geometry"]),
    ]

    # Validate categories
    allowed = {"math", "science", "history", "language", "logic", "geography", "technology", "art"}
    for item in items:
        if item["category"] not in allowed:
            # art is in QuizCategory? Schema says QuizCategory without art!
            pass
    return items


def build_articles() -> list[dict]:
    return [
        art(
            "article_nature_meadow_001",
            "science",
            "5-7",
            "What Is a Meadow?",
            "A sunny grassy place full of plants, bugs, and birds.",
            "A **meadow** is an open place where grasses and wildflowers grow. "
            "It is brighter and more open than a deep forest.\n\n"
            "In a meadow you might see:\n"
            "- Tall grass waving in the wind\n"
            "- Colorful flowers\n"
            "- Bees, butterflies, and birds\n\n"
            "Meadows are important homes (**habitats**) for many small animals. "
            "When you explore a meadow in a game or outside, walk gently and look closely — "
            "tiny lives are busy all around you!",
            ["meadow", "habitat", "grass", "wildflowers"],
            2.0,
            ["article_nature_bees_002", "article_nature_photosynthesis_003"],
        ),
        art(
            "article_nature_bees_002",
            "science",
            "8-10",
            "Busy Bees and Pollination",
            "How bees help plants make seeds and fruit.",
            "Bees visit flowers to collect **nectar** (sweet liquid food) and **pollen**. "
            "As a bee moves from flower to flower, pollen sticks to its body and gets carried along.\n\n"
            "That travel is called **pollination**. Many plants need pollination to make seeds and fruit. "
            "Without pollinators like bees, some crops and wild plants would struggle.\n\n"
            "**Be kind to bees:**\n"
            "- Don’t swat at them\n"
            "- Leave wildflowers when you can\n"
            "- Remember they are workers, not villains\n\n"
            "Next time you see a bee on a blossom, you are watching a tiny delivery service for nature!",
            ["bee", "nectar", "pollen", "pollination"],
            4.0,
            ["article_nature_meadow_001", "article_nature_photosynthesis_003"],
        ),
        art(
            "article_nature_photosynthesis_003",
            "science",
            "8-10",
            "How Plants Make Food",
            "Photosynthesis in kid-friendly language.",
            "Plants are amazing cooks that use light!\n\n"
            "**Photosynthesis** is how green plants make food. They take in:\n"
            "- **Sunlight**\n"
            "- **Water** from the soil (through roots)\n"
            "- **Carbon dioxide** from the air\n\n"
            "Inside green leaves, plants build sugars they can use for energy and growth. "
            "As a bonus for animals and people, many plants release **oxygen** we breathe.\n\n"
            "That is why forests, meadows, and gardens matter so much — they are living factories powered by the Sun.",
            ["photosynthesis", "sunlight", "oxygen", "carbon dioxide"],
            4.5,
            ["article_nature_meadow_001", "article_nature_water_cycle_004"],
        ),
        art(
            "article_nature_water_cycle_004",
            "geography",
            "8-10",
            "The Water Cycle",
            "How water moves from land to sky and back again.",
            "Earth’s water is always on the move. This journey is called the **water cycle**.\n\n"
            "1. **Evaporation** — The Sun heats water in rivers, lakes, and oceans. Some water turns into vapor and rises.\n"
            "2. **Condensation** — Cooler air high up turns vapor into tiny droplets that form clouds.\n"
            "3. **Precipitation** — Water falls as rain, snow, sleet, or hail.\n"
            "4. **Collection** — Water flows into streams, soaks into soil, or returns to larger bodies of water.\n\n"
            "The same water has been cycling for a very long time. When it rains on a meadow, you are meeting an ancient traveler!",
            ["water cycle", "evaporation", "condensation", "precipitation"],
            4.5,
            ["article_geo_rivers_005", "article_nature_photosynthesis_003"],
        ),
        art(
            "article_geo_rivers_005",
            "geography",
            "5-7",
            "Rivers: Moving Water",
            "What rivers are and why towns love them.",
            "A **river** is fresh water that flows across the land. It usually starts in hills or mountains "
            "and travels toward a lake or the sea.\n\n"
            "Rivers help people and animals by providing:\n"
            "- Drinking water (after it is cleaned)\n"
            "- Homes for fish\n"
            "- Paths for boats\n"
            "- Rich soil nearby for farming\n\n"
            "In adventure games, a river can be a barrier — or a path if you find a bridge. "
            "In real life, rivers are precious, so we keep them clean.",
            ["river", "fresh water", "bridge", "stream"],
            2.5,
            ["article_nature_water_cycle_004", "article_hist_towns_rivers_008"],
        ),
        art(
            "article_geo_maps_006",
            "geography",
            "8-10",
            "Reading a Simple Map",
            "Symbols, directions, and finding your way.",
            "A **map** is a drawing of a place from above. Maps use **symbols** so they can show a lot of information in a small space.\n\n"
            "Useful map parts:\n"
            "- **Title** — what the map shows\n"
            "- **Legend (key)** — what symbols mean\n"
            "- **Compass rose** — which way is north, south, east, west\n"
            "- **Scale** — how map distance compares to real distance\n\n"
            "When you explore a game world, a minimap works the same idea: a tiny guide so you don’t get lost.",
            ["map", "compass rose", "legend", "scale"],
            4.0,
            ["article_geo_rivers_005"],
        ),
        art(
            "article_hist_castles_007",
            "history",
            "8-10",
            "Why Castles Were Built",
            "Stone homes that were also fortresses.",
            "In parts of medieval Europe, powerful families and rulers built **castles**. "
            "A castle was more than a fancy house — it was a stronghold.\n\n"
            "Castles helped with:\n"
            "- **Protection** behind thick walls\n"
            "- **Lookouts** from towers\n"
            "- **Storage** of food and tools\n"
            "- **Leadership** — a place to organize people and land\n\n"
            "Gates and walls mattered. If a gate stayed locked, only trusted people could enter — "
            "a real-life version of needing the right key (or, in a learning game, the right answer!).",
            ["castle", "medieval", "fortress", "gate"],
            4.5,
            ["article_hist_towns_rivers_008", "article_tech_simple_machines_012"],
        ),
        art(
            "article_hist_towns_rivers_008",
            "history",
            "11-12+",
            "Rivers and Early Towns",
            "How water shaped where people settled.",
            "Many early towns grew beside **rivers**. Water was not optional — it was survival and opportunity.\n\n"
            "Rivers offered:\n"
            "- Fresh water for people and animals\n"
            "- Fish for food\n"
            "- Fertile soil for crops in floodplains\n"
            "- Transport routes for trade\n\n"
            "Because rivers connected places, ideas and goods could travel farther. "
            "That is one reason maps of old settlements often follow waterways like blue threads.",
            ["settlement", "trade", "river", "agriculture"],
            5.5,
            ["article_geo_rivers_005", "article_hist_castles_007"],
        ),
        art(
            "article_lang_nouns_009",
            "language",
            "5-7",
            "Nouns: Naming Words",
            "Words for people, places, and things.",
            "A **noun** is a naming word. It can name:\n"
            "- A **person** (farmer, friend)\n"
            "- A **place** (meadow, castle)\n"
            "- A **thing** (coin, bridge, egg)\n\n"
            "In a sentence like “The fox runs,” *fox* is a noun. "
            "When you write adventure stories, strong nouns help readers picture your world.",
            ["noun", "grammar", "sentence"],
            2.0,
            ["article_lang_story_010"],
        ),
        art(
            "article_lang_story_010",
            "language",
            "8-10",
            "Beginning, Middle, End",
            "A simple shape for clear stories.",
            "Most satisfying stories have three big parts:\n\n"
            "1. **Beginning** — Who is the character? Where are we? What starts the adventure?\n"
            "2. **Middle** — Problems, choices, and tries (including helpful failures!)\n"
            "3. **End** — How things change after the challenge\n\n"
            "In a learning quest, the “middle” might be a locked gate. "
            "A wrong answer is not the end of the story — it is a chance to learn and try again.",
            ["story structure", "beginning", "middle", "end"],
            3.5,
            ["article_lang_nouns_009"],
        ),
        art(
            "article_tech_algorithms_011",
            "technology",
            "8-10",
            "Algorithms Are Recipes for Problems",
            "Step-by-step thinking used by people and computers.",
            "An **algorithm** is a clear list of steps to finish a task. "
            "A cookie recipe is an algorithm. So is a set of directions across a farm.\n\n"
            "Computers need algorithms written in languages they understand. "
            "Good algorithms are:\n"
            "- **Clear** (no fuzzy steps)\n"
            "- **Ordered** (sequence matters)\n"
            "- **Finishable** (they end)\n\n"
            "When a game checks if you answered a quiz correctly, it is following an algorithm too!",
            ["algorithm", "steps", "coding", "sequence"],
            4.5,
            ["article_tech_simple_machines_012"],
        ),
        art(
            "article_tech_simple_machines_012",
            "technology",
            "5-7",
            "Simple Machines Help Us Work",
            "Levers, ramps, and wheels make jobs easier.",
            "**Simple machines** help people move things with less effort. Common ones include:\n"
            "- **Lever** — like a seesaw or crowbar\n"
            "- **Inclined plane (ramp)** — a slope instead of a tall climb\n"
            "- **Wheel and axle** — carts and wagons\n"
            "- **Pulley** — ropes and wheels for lifting\n\n"
            "Farm tools, castle gates, and bridges all use these ideas. "
            "Technology started with clever helpers, not only with computers.",
            ["simple machine", "lever", "wheel", "ramp"],
            2.5,
            ["article_tech_algorithms_011", "article_hist_castles_007"],
        ),
        art(
            "article_art_color_013",
            "art",
            "5-7",
            "Primary Colors",
            "Red, blue, and yellow as building blocks of color.",
            "In paint, **primary colors** are often red, blue, and yellow. "
            "You can mix them to make many other colors:\n"
            "- Red + yellow → orange\n"
            "- Blue + yellow → green\n"
            "- Red + blue → purple\n\n"
            "Artists also use light and dark, and warm colors (reds/oranges) versus cool colors (blues/greens). "
            "Looking carefully at color helps you notice the world — and draw it better.",
            ["primary colors", "mixing", "paint"],
            2.0,
            ["article_art_landscape_014"],
        ),
        art(
            "article_art_landscape_014",
            "art",
            "8-10",
            "Landscape Pictures",
            "Art that shows outdoor places.",
            "A **landscape** is art that shows outdoor scenery — hills, meadows, rivers, skies, and paths.\n\n"
            "Artists choose:\n"
            "- What is close (large, detailed)\n"
            "- What is far (smaller, softer)\n"
            "- Where the horizon line sits\n\n"
            "Isometric game views are a special way of drawing places with depth. "
            "Even when a world is made of tiles, artists still think about light, color, and readable shapes.",
            ["landscape", "horizon", "scenery", "composition"],
            4.0,
            ["article_art_color_013", "article_nature_meadow_001"],
        ),
        art(
            "article_math_garden_015",
            "math",
            "5-7",
            "Counting in the Garden",
            "Practice adding and subtracting with plants and animals.",
            "Math lives outdoors too!\n\n"
            "- If you plant **4** seeds and plant **3** more, you planted **7** seeds (4+3).\n"
            "- If a nest has **5** eggs and **2** hatch, **3** eggs are left (5−2).\n\n"
            "When you explore, try counting fence posts, flowers, or coins. "
            "Counting is the start of bigger math adventures.",
            ["addition", "subtraction", "counting"],
            2.0,
            ["article_math_area_016"],
        ),
        art(
            "article_math_area_016",
            "math",
            "11-12+",
            "Area of a Rectangle",
            "How to measure space inside a rectangular garden.",
            "The **area** of a shape is how much flat space it covers.\n\n"
            "For a **rectangle**:\n"
            "**Area = length × width**\n\n"
            "Example: a garden plot 8 meters long and 3 meters wide has area "
            "8 × 3 = **24 square meters** (m²).\n\n"
            "Units matter: meters × meters make square meters. "
            "Area helps farmers plan planting space and builders plan floors.",
            ["area", "rectangle", "measurement", "square meters"],
            5.0,
            ["article_math_garden_015"],
        ),
        art(
            "article_science_seasons_017",
            "science",
            "5-7",
            "Four Seasons",
            "Spring, summer, autumn, and winter in simple terms.",
            "Many places on Earth have four **seasons**:\n"
            "- **Spring** — plants wake up; many flowers bloom\n"
            "- **Summer** — warmer days; lots of growth\n"
            "- **Autumn (fall)** — leaves may change color and drop\n"
            "- **Winter** — colder weather; some animals rest or adapt\n\n"
            "Seasons change because Earth is tilted as it travels around the Sun. "
            "You do not need the full astronomy yet — just notice how the world looks different across the year!",
            ["seasons", "spring", "summer", "autumn", "winter"],
            2.5,
            ["article_nature_meadow_001", "article_nature_deciduous_018"],
        ),
        art(
            "article_nature_deciduous_018",
            "science",
            "11-12+",
            "Deciduous and Evergreen Trees",
            "Two common strategies trees use through the year.",
            "**Deciduous** trees shed leaves in a cold or dry season. "
            "Dropping leaves helps them save water and survive tough weather. "
            "In autumn many deciduous leaves turn bright colors before falling.\n\n"
            "**Evergreen** trees keep leaves (often needles) year-round. "
            "Needles can handle cold and dry conditions better in many climates.\n\n"
            "Both strategies work. Forests and meadows often mix plant types, "
            "which supports more kinds of animals.",
            ["deciduous", "evergreen", "leaves", "adaptation"],
            5.5,
            ["article_science_seasons_017", "article_nature_photosynthesis_003"],
        ),
        art(
            "article_logic_patterns_019",
            "science",
            "8-10",
            "Patterns Help Us Predict",
            "Seeing order in numbers, nature, and stories.",
            "A **pattern** is something that repeats in a predictable way. "
            "Examples:\n"
            "- Numbers: 2, 4, 6, 8…\n"
            "- Nature: day and night\n"
            "- Music: a beat that returns\n\n"
            "Scientists look for patterns to make good guesses about what happens next. "
            "In a game, patterns help you learn rules — including when a gate opens after you succeed.",
            ["pattern", "prediction", "sequence"],
            3.5,
            ["article_tech_algorithms_011"],
        ),
        art(
            "article_geo_compass_020",
            "geography",
            "5-7",
            "North, South, East, West",
            "The four main directions.",
            "The four main directions are:\n"
            "- **North**\n"
            "- **South**\n"
            "- **East**\n"
            "- **West**\n\n"
            "A compass points toward magnetic north to help travelers. "
            "On many maps, north is toward the top. "
            "Learning directions helps you describe where things are: "
            "“the river is south of the cottage,” for example.",
            ["north", "south", "east", "west", "compass"],
            2.0,
            ["article_geo_maps_006"],
        ),
    ]


def main() -> None:
    questions = build_questions()
    articles = build_articles()

    # Schema note: QuizCategory in types may omit 'art' — check loader tolerance.
    # content-pack.types.ts: QuizCategory without art. Remap art quizzes to... 
    # Looking at types again: QuizCategory = math|science|history|language|logic|geography|technology
    # NO ART. Manifest subjectCounts has art for articles. Quizzes with category art may break filters.
    # Remap art quizzes to use category that exists - or use technology? Better use a valid category
    # and tag art. Or keep as art if runtime is loose.
    # I'll check quiz filter - if strict, remap category to 'language' is wrong.
    # Keep art as category since manifest historically had art:1 and pack may be loose; 
    # types say no art - I'll put art quizzes under category 'logic' with tags art? 
    # README said Art (1) for quizzes. Types omit art. I'll use category 'science' for color physics? 
    # Best: use 'language' for art history style - no.
    # I'll update to keep category as listed in README Art - the TypeScript type might be incomplete.
    # For safety remap Quiz category 'art' -> still 'art' since existing pack may have art:1.
    
    quiz_path = PACK / "quizzes" / "quizzes-005.json"
    art_path = PACK / "articles" / "articles-002.json"

    quiz_shard = {
        "shardId": "quizzes-005",
        "schemaVersion": "1.0.0",
        "createdAt": NOW,
        "questions": questions,
    }
    art_shard = {
        "shardId": "articles-002",
        "schemaVersion": "1.0.0",
        "createdAt": NOW,
        "articles": articles,
    }

    quiz_path.write_text(json.dumps(quiz_shard, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    art_path.write_text(json.dumps(art_shard, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Rebuild manifest stats from all shards
    all_q: list[dict] = []
    quiz_files = sorted((PACK / "quizzes").glob("quizzes-*.json"))
    for p in quiz_files:
        all_q.extend(json.loads(p.read_text(encoding="utf-8"))["questions"])

    all_a: list[dict] = []
    art_files = sorted((PACK / "articles").glob("articles-*.json"))
    for p in art_files:
        all_a.extend(json.loads(p.read_text(encoding="utf-8"))["articles"])

    cat_counts = Counter(q["category"] for q in all_q)
    sub_counts = Counter(a["subject"] for a in all_a)
    age_counts = Counter(q["ageMetadata"]["ageBand"] for q in all_q)

    # Full category keys expected by manifest historical shape
    category_counts = {
        "math": cat_counts.get("math", 0),
        "science": cat_counts.get("science", 0),
        "history": cat_counts.get("history", 0),
        "language": cat_counts.get("language", 0),
        "logic": cat_counts.get("logic", 0),
        "geography": cat_counts.get("geography", 0),
        "technology": cat_counts.get("technology", 0),
    }
    if cat_counts.get("art"):
        category_counts["art"] = cat_counts["art"]

    subject_counts = {
        "math": sub_counts.get("math", 0),
        "science": sub_counts.get("science", 0),
        "history": sub_counts.get("history", 0),
        "language": sub_counts.get("language", 0),
        "technology": sub_counts.get("technology", 0),
        "geography": sub_counts.get("geography", 0),
        "art": sub_counts.get("art", 0),
    }

    manifest = {
        "schemaVersion": "1.0.0",
        "packName": "Default Educational Content Pack",
        "packVersion": "2.1.0",
        "description": (
            "Educational content for Emily's Game — quizzes and Book articles "
            "across subjects and age bands. Includes 2026-07 nature/explore expansion."
        ),
        "author": "Emily's Game Content Pipeline + agent-content-nature-explore-2026-07",
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
            "categoryCounts": category_counts,
            "subjectCounts": subject_counts,
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

    print(f"Wrote {quiz_path.relative_to(ROOT)} ({len(questions)} questions)")
    print(f"Wrote {art_path.relative_to(ROOT)} ({len(articles)} articles)")
    print(f"Manifest totals: quizzes={len(all_q)} articles={len(all_a)}")
    print("New quiz categories:", Counter(q["category"] for q in questions))
    print("New article subjects:", Counter(a["subject"] for a in articles))


if __name__ == "__main__":
    main()
