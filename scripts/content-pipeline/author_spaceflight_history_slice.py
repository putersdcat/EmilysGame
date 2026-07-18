#!/usr/bin/env python3
"""Space flight history content → default-v1 quizzes-006 + articles-003."""
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
    "curator": "agent-content-spaceflight-history-2026-07",
    "sourceUrl": "https://www.nasa.gov/education/",
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
    tags: list[str] | None = None,
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
        "tags": tags or ["spaceflight", "space-history"],
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
    t = ["spaceflight", "space-history"]
    items: list[dict] = []

    # --- Easy 5-7: big friendly milestones ---
    items += [
        q("q_space_e_001", "science", "easy", "5-7",
          "What is an astronaut?",
          ["A person trained to travel and work in space", "A fish that lives in rivers", "A type of cloud", "A mountain climber only"],
          "Space traveler.",
          "Astronauts (and cosmonauts) are people trained to fly and work in space.",
          t + ["astronaut"]),
        q("q_space_e_002", "science", "easy", "5-7",
          "What do we call the path a satellite takes around Earth?",
          ["Orbit", "Tunnel", "Sidewalk", "Cave"],
          "Goes around and around.",
          "An orbit is a curved path around a planet or moon.",
          t + ["orbit", "satellite"]),
        q("q_space_e_003", "history", "easy", "5-7",
          "In 1969, Apollo 11 astronauts walked on the…",
          ["Moon", "Sun", "Bottom of the ocean only", "Inside a volcano only"],
          "Night-sky neighbor.",
          "Apollo 11 landed people on the Moon in 1969.",
          t + ["apollo", "moon"]),
        q("q_space_e_004", "science", "easy", "5-7",
          "A rocket is useful because it can…",
          ["Push itself upward with hot gas thrust", "Only dig holes", "Only float on lakes", "Only paint fences"],
          "Whoosh!",
          "Rockets expel gas downward to push the vehicle up (Newton’s third law).",
          t + ["rocket"]),
        q("q_space_e_005", "history", "easy", "5-7",
          "The first artificial satellite launched into space was named…",
          ["Sputnik 1", "The Golden Boat", "Paper Plane One", "Cloud Ship"],
          "1957 — beeping ball.",
          "The Soviet Union launched Sputnik 1 in 1957, the first artificial satellite.",
          t + ["sputnik", "satellite"]),
        q("q_space_e_006", "science", "easy", "5-7",
          "Where do many astronauts live and work for months today?",
          ["The International Space Station (ISS)", "Inside a hollow tree only", "Under a bridge only", "In a desert tent only"],
          "A home in orbit.",
          "The ISS is a large laboratory in orbit around Earth where crews live and research.",
          t + ["iss"]),
        q("q_space_e_007", "science", "easy", "5-7",
          "What keeps the Moon going around Earth?",
          ["Gravity", "String", "Wind only", "Glue"],
          "Invisible pull.",
          "Gravity pulls the Moon toward Earth while its motion keeps it in orbit.",
          t + ["gravity", "moon"]),
        q("q_space_e_008", "technology", "easy", "5-7",
          "A satellite can help people on Earth by…",
          ["Sending weather and communication signals", "Only watering plants by hand", "Only baking bread", "Only counting sheep"],
          "Sky helpers.",
          "Satellites support weather forecasts, GPS-style navigation, TV, and science.",
          t + ["satellite"]),
        q("q_space_e_009", "history", "easy", "5-7",
          "Neil Armstrong is famous for…",
          ["Being among the first people to walk on the Moon", "Inventing the bicycle only", "Discovering electricity only", "Painting the first cave art only"],
          "One small step…",
          "Armstrong was the first person to step onto the lunar surface on Apollo 11.",
          t + ["apollo", "armstrong"]),
        q("q_space_e_010", "science", "easy", "5-7",
          "In space, far from a planet’s surface, astronauts float because…",
          ["They and their craft are falling around Earth together (microgravity)", "There is magic glue on their boots only", "Air is thicker than water", "The Sun pushes them sideways only"],
          "Orbit freefall.",
          "Orbiting is continuous freefall that creates a feeling of weightlessness.",
          t + ["microgravity", "orbit"]),
    ]

    # --- Medium 8-10 ---
    items += [
        q("q_space_m_001", "history", "medium", "8-10",
          "Who was the first human to orbit Earth (1961)?",
          ["Yuri Gagarin", "Christopher Columbus", "Marie Curie", "Wright brothers together in one capsule"],
          "Soviet cosmonaut, Vostok 1.",
          "Yuri Gagarin completed one orbit on Vostok 1 in April 1961.",
          t + ["gagarin", "vostok"]),
        q("q_space_m_002", "history", "medium", "8-10",
          "What year did Apollo 11 land people on the Moon?",
          ["1969", "1492", "2001", "1914"],
          "Late 1960s.",
          "Apollo 11 landed on July 20, 1969 (UTC date conventions may vary by zone).",
          t + ["apollo", "1969"]),
        q("q_space_m_003", "history", "medium", "8-10",
          "Valentina Tereshkova is famous for…",
          ["Being the first woman to fly in space", "Building the first railroad only", "Inventing the telescope only", "Drawing the first map of Mars only"],
          "1963 flight.",
          "Tereshkova flew on Vostok 6 in 1963, the first woman in space.",
          t + ["tereshkova", "cosmonaut"]),
        q("q_space_m_004", "science", "medium", "8-10",
          "Why do rockets need multiple stages?",
          ["To drop empty tanks and go lighter as they climb", "To make louder music only", "To grow plants mid-flight only", "To paint the sky"],
          "Shed weight.",
          "Staging discards empty mass so remaining engines can accelerate the payload more efficiently.",
          t + ["rocket", "staging"]),
        q("q_space_m_005", "technology", "medium", "8-10",
          "The Hubble Space Telescope is special because it…",
          ["Observes space from above most of Earth’s atmosphere", "Only photographs kitchens", "Only measures ocean fish", "Only works underwater"],
          "Clearer sky view.",
          "Hubble’s orbit above much of the atmosphere gives sharper images of deep space.",
          t + ["hubble", "telescope"]),
        q("q_space_m_006", "history", "medium", "8-10",
          "The Space Race of the 1950s–60s was mainly a competition between…",
          ["The United States and the Soviet Union", "Australia and Antarctica only", "Two neighboring farms", "Ships on a single lake"],
          "Cold War era.",
          "U.S. and Soviet programs raced for satellite, human, and lunar firsts.",
          t + ["space-race", "cold-war"]),
        q("q_space_m_007", "science", "medium", "8-10",
          "What is a rover on Mars?",
          ["A robot vehicle that explores the surface", "A cloud that rains only candy", "A type of sandwich", "A wooden sailing ship"],
          "Wheels on another world.",
          "Rovers like Curiosity and Perseverance study Mars geology and climate remotely.",
          t + ["mars", "rover"]),
        q("q_space_m_008", "technology", "medium", "8-10",
          "GPS-style navigation for phones often depends on…",
          ["A constellation of satellites timing signals", "Only paper maps glued to shoes", "Only shouting loudly", "Only candle smoke"],
          "Sky clocks.",
          "Global navigation satellite systems broadcast precise time signals receivers use to locate themselves.",
          t + ["gps", "satellite"]),
        q("q_space_m_009", "history", "medium", "8-10",
          "What was the Space Shuttle designed to do?",
          ["Launch like a rocket, land like a glider, and fly to orbit many times", "Only dig tunnels under cities", "Only float on lakes forever", "Only map the ocean floor by swimming"],
          "Reusable winged orbiter.",
          "NASA’s Shuttle (1981–2011) carried crews and cargo to orbit and landed on a runway.",
          t + ["shuttle"]),
        q("q_space_m_010", "science", "medium", "8-10",
          "Low Earth orbit is where…",
          ["Many satellites and the ISS travel around Earth relatively close by", "The center of the Sun is", "The bottom of the deepest mine only", "A cave under the Moon only"],
          "Near-Earth loops.",
          "LEO is a region of orbits a few hundred kilometers up, used by the ISS and many satellites.",
          t + ["leo", "orbit"]),
        q("q_space_m_011", "history", "medium", "8-10",
          "John Glenn is known in U.S. space history for…",
          ["Being the first American to orbit Earth", "Inventing the airplane alone in 1900 only", "Discovering Pluto with a phone only", "Building the Eiffel Tower"],
          "Friendship 7, 1962.",
          "Glenn orbited Earth in Friendship 7 during Project Mercury.",
          t + ["mercury", "glenn"]),
        q("q_space_m_012", "technology", "medium", "8-10",
          "Why do spacesuits protect astronauts on a spacewalk?",
          ["They supply air, pressure, and temperature control", "They only look shiny for photos", "They make gravity stronger", "They turn space into water"],
          "Personal spacecraft.",
          "Suits act like tiny ships: oxygen, pressure, cooling, and micrometeoroid layers.",
          t + ["spacesuit", "eva"]),
        q("q_space_m_013", "history", "medium", "8-10",
          "China’s first astronaut (taikonaut) in space was…",
          ["Yang Liwei (Shenzhou 5, 2003)", "Marco Polo", "Ada Lovelace", "James Cook"],
          "Shenzhou program.",
          "Yang Liwei flew Shenzhou 5 in 2003, China’s first crewed spaceflight.",
          t + ["china", "shenzhou"]),
        q("q_space_m_014", "science", "medium", "8-10",
          "What does “payload” mean on a rocket launch?",
          ["The cargo or spacecraft the rocket is carrying", "Only the smoke trail", "Only the launch pad concrete", "Only the audience"],
          "What rides on top.",
          "Payload is the useful mass delivered — satellites, probes, or crewed capsules.",
          t + ["rocket", "payload"]),
        q("q_space_m_015", "history", "medium", "8-10",
          "The International Space Station is special because…",
          ["Many countries built and operate it together", "It is permanently on the Moon’s surface only", "It never orbits Earth", "It is only a movie set"],
          "Cooperation in orbit.",
          "The ISS is a multinational laboratory continuously crewed since 2000.",
          t + ["iss", "cooperation"]),
    ]

    # --- Hard 11-12+ : deeper timeline to “today” ---
    items += [
        q("q_space_h_001", "history", "hard", "11-12+",
          "Sputnik 1’s 1957 launch is historically important because it…",
          ["Proved artificial satellites could orbit Earth and opened the Space Age", "Ended all weather forever", "Stopped radio from existing", "Made oceans disappear"],
          "First beep from orbit.",
          "Sputnik demonstrated orbital technology and accelerated global space efforts.",
          t + ["sputnik", "1957"]),
        q("q_space_h_002", "history", "hard", "11-12+",
          "Project Gemini’s main goal for NASA was to…",
          ["Practice rendezvous, docking, and longer flights before Apollo", "Only map the ocean floor", "Only grow corn in orbit for fun", "Only photograph birds"],
          "Bridge to the Moon.",
          "Gemini developed skills and systems needed for Apollo lunar missions.",
          t + ["gemini", "apollo"]),
        q("q_space_h_003", "history", "hard", "11-12+",
          "Apollo used a lunar module so that…",
          ["A light lander could touch the Moon while the command ship stayed in lunar orbit", "Astronauts could drive underwater cars only", "Rockets never needed fuel", "The Sun could be landed on safely"],
          "Two-ship plan.",
          "The LM landed two astronauts; the CSM waited in lunar orbit for return to Earth.",
          t + ["apollo", "lunar-module"]),
        q("q_space_h_004", "history", "hard", "11-12+",
          "Skylab was…",
          ["America’s first space station in the 1970s", "A submarine under ice only", "A medieval castle", "A type of bicycle"],
          "Orbital workshop.",
          "Skylab hosted three crewed missions studying Earth, Sun, and long-duration flight.",
          t + ["skylab", "station"]),
        q("q_space_h_005", "technology", "hard", "11-12+",
          "Reusable first-stage boosters (like modern Falcon 9 landings) matter because they…",
          ["Can lower launch cost by flying hardware more than once", "Remove the need for physics", "Stop Earth from rotating", "Make orbits optional"],
          "Catch and reuse.",
          "Recovering boosters aims to make access to space more affordable and frequent.",
          t + ["reusable", "falcon", "commercial"]),
        q("q_space_h_006", "history", "hard", "11-12+",
          "Crew Dragon (SpaceX) is notable in recent history for…",
          ["Carrying astronauts to the ISS under commercial crew contracts", "Being the first wooden ship to Mars", "Replacing all airplanes in 1903", "Mining the Sun"],
          "Commercial crew era.",
          "Since 2020, Crew Dragon has regularly flown NASA and other crews to the ISS.",
          t + ["crew-dragon", "commercial", "iss"]),
        q("q_space_h_007", "history", "hard", "11-12+",
          "NASA’s Artemis program is primarily focused on…",
          ["Returning humans to the Moon and preparing for deeper exploration", "Building only underwater cities", "Ending all satellite use", "Mapping only one city park"],
          "Moon to Mars pathway.",
          "Artemis aims for sustainable lunar exploration with international and commercial partners.",
          t + ["artemis", "moon"]),
        q("q_space_h_008", "science", "hard", "11-12+",
          "James Webb Space Telescope (JWST) mainly observes in…",
          ["Infrared light to study early galaxies and star formation", "Only ocean sonar", "Only human speech frequencies", "Only X-rays from toasters"],
          "Heat-glow universe.",
          "JWST’s infrared instruments look through dust and back in cosmic time.",
          t + ["jwst", "telescope"]),
        q("q_space_h_009", "science", "hard", "11-12+",
          "Escape velocity is best described as…",
          ["The speed needed to break free of a body’s gravitational pull without further thrust", "The speed of walking", "The speed of sound only on Earth always", "A speed that removes mass from Earth"],
          "Leave the gravity well.",
          "Escape velocity depends on mass and radius of the body you are leaving.",
          t + ["physics", "gravity"]),
        q("q_space_h_010", "history", "hard", "11-12+",
          "The first soft landing of a probe on Mars that returned useful surface data included missions such as…",
          ["Viking landers (1970s) among early successes", "Only hot-air balloons in 1800", "Only wooden rafts", "Only kites in a storm"],
          "Red planet robots.",
          "Viking 1 and 2 landed in 1976 and returned landmark Mars surface science.",
          t + ["mars", "viking"]),
        q("q_space_h_011", "technology", "hard", "11-12+",
          "A geostationary satellite appears nearly fixed in the sky because it…",
          ["Orbits once per day above the equator matching Earth’s rotation", "Is glued to a cloud", "Does not orbit at all", "Sits on a mountain peak"],
          "24-hour orbit.",
          "GEO altitude and equatorial placement keep the satellite over one longitude.",
          t + ["geo", "satellite"]),
        q("q_space_h_012", "history", "hard", "11-12+",
          "Sally Ride is remembered as…",
          ["The first American woman in space (1983, STS-7)", "The inventor of the steam engine only", "The first person on Mars in 1950", "A medieval queen only"],
          "Shuttle era.",
          "Ride flew on the Space Shuttle Challenger on STS-7 in 1983.",
          t + ["shuttle", "ride"]),
        q("q_space_h_013", "history", "hard", "11-12+",
          "Tiangong is…",
          ["China’s modular space station in low Earth orbit", "A type of desert cactus only", "A Roman road", "A single-use paper glider only"],
          "Heavenly Palace.",
          "China’s Tiangong station hosts crews and research in LEO.",
          t + ["tiangong", "china"]),
        q("q_space_h_014", "science", "hard", "11-12+",
          "Why is re-entry heating a big engineering problem?",
          ["Air compresses and heats the craft as it slams into the atmosphere at high speed", "Space is full of lava fountains always", "Rockets freeze solid only", "There is no air friction ever"],
          "Plasma glow.",
          "Heat shields manage extreme temperatures during atmospheric re-entry.",
          t + ["reentry", "heat-shield"]),
        q("q_space_h_015", "history", "hard", "11-12+",
          "Voyager 1 is famous partly because it…",
          ["Flew past outer planets and later entered interstellar space", "Only mapped one city block", "Never left Earth", "Is a weather balloon only"],
          "Grand Tour probe.",
          "Voyager 1 explored the outer solar system and crossed into interstellar space.",
          t + ["voyager", "probe"]),
        q("q_space_h_016", "technology", "hard", "11-12+",
          "CubeSats are important today because they…",
          ["Let universities and small teams fly small, cheaper satellites", "Replace all food on Earth", "Remove the need for orbits", "Work only underground"],
          "Smallsats boom.",
          "Standardized small satellites lowered the barrier to flying experiments.",
          t + ["cubesat", "smallsat"]),
        q("q_space_h_017", "history", "hard", "11-12+",
          "Private companies launching astronauts in the 2020s shows that…",
          ["Commercial partners now share crewed access to orbit with government agencies", "Only kings may fly", "Spaceflight ended in 1972 forever", "Rockets are illegal worldwide"],
          "NewSpace era.",
          "Commercial crew and tourism flights expanded who can fly and how missions are bought.",
          t + ["commercial", "crew"]),
        q("q_space_h_018", "science", "hard", "11-12+",
          "A transfer orbit (like Hohmann) is used mainly to…",
          ["Move a spacecraft between two circular orbits efficiently", "Cook food faster", "Measure only rainfall", "Stop a planet’s spin"],
          "Orbital highways.",
          "Hohmann transfers use timed burns to change orbital energy with less propellant.",
          t + ["orbital-mechanics"]),
        q("q_space_h_019", "history", "hard", "11-12+",
          "The first soft landing on the Moon’s far side was achieved by…",
          ["China’s Chang’e-4 mission (2019)", "A paper airplane in 1900", "Only Apollo 11 on the near side again", "A weather kite"],
          "Far-side first.",
          "Chang’e-4 landed in Von Kármán crater on the lunar far side in 2019.",
          t + ["chang-e", "moon"]),
        q("q_space_h_020", "technology", "hard", "11-12+",
          "Starlink and similar mega-constellations mainly provide…",
          ["Broadband internet via many satellites in low Earth orbit", "Only free pizza delivery", "Only underground mining", "Only paper mail sorting"],
          "Internet from LEO.",
          "Large LEO constellations aim for global connectivity; they also raise space-traffic concerns.",
          t + ["constellation", "leo", "internet"]),
        q("q_space_h_021", "history", "hard", "11-12+",
          "Apollo–Soyuz (1975) is remembered as…",
          ["A docking of U.S. and Soviet spacecraft symbol symbol Cold War cooperation", "The end of all spaceflight", "The first car on Mars", "A medieval treaty only"],
          "Handshake in orbit.",
          "Apollo–Soyuz Test Project practiced joint docking and showed political thaw in space.",
          t + ["apollo-soyuz", "cooperation"]),
        q("q_space_h_022", "science", "hard", "11-12+",
          "Why do astronauts exercise on the ISS?",
          ["To reduce bone and muscle loss in microgravity", "Because space has heavier gravity than Earth always", "To make the station spin faster only", "Exercise is banned on Earth only"],
          "Use it or lose it.",
          "Without loading, bones and muscles weaken; exercise counters some effects.",
          t + ["iss", "health"]),
        q("q_space_h_023", "history", "hard", "11-12+",
          "Ingenuity on Mars was special as…",
          ["The first powered aircraft to fly on another planet", "The first wooden ship on Earth", "A type of sandwich recipe", "A subway train under Paris only"],
          "Helicopter on Mars.",
          "NASA’s Ingenuity helicopter proved controlled flight in Mars’s thin atmosphere.",
          t + ["mars", "ingenuity"]),
        q("q_space_h_024", "technology", "hard", "11-12+",
          "Ion thrusters are useful in deep space because they…",
          ["Provide efficient low-thrust propulsion over long times using electric power", "Only work as flashlights", "Require ocean water only", "Cannot leave the atmosphere"],
          "Sip fuel, long push.",
          "Electric propulsion trades low thrust for high efficiency on long missions.",
          t + ["propulsion", "ion"]),
        q("q_space_h_025", "history", "hard", "11-12+",
          "From Sputnik (1957) to today, the biggest change in human spaceflight access is…",
          ["More nations and commercial companies can launch and operate spacecraft", "Rockets became illegal", "Only one country may use radio", "Satellites stopped existing"],
          "Who gets to fly.",
          "Space activity broadened from two superpowers to many agencies and companies worldwide.",
          t + ["space-age", "today"]),
    ]

    # Math / logic themed lightly with space numbers
    items += [
        q("q_space_math_e_01", "math", "easy", "5-7",
          "A rocket countdown goes 3, 2, 1… What number comes just before liftoff after 1?",
          ["0 (blast off!)", "5", "10", "100"],
          "Zero!",
          "Countdowns reach zero at liftoff.",
          t + ["countdown", "numbers"]),
        q("q_space_math_m_01", "math", "medium", "8-10",
          "If a satellite completes 16 orbits in one day, about how many hours is one orbit?",
          ["1.5 hours", "16 hours", "24 hours", "0 hours"],
          "24 ÷ 16.",
          "24 hours / 16 orbits ≈ 1.5 hours per orbit (ISS is near this range).",
          t + ["orbits", "division"]),
        q("q_space_math_h_01", "math", "hard", "11-12+",
          "Light from the Sun takes about 8 minutes to reach Earth. If a radio signal travels at light speed, a one-way message to a probe near Mars at a time when Mars is 12 light-minutes away takes about…",
          ["12 minutes", "8 seconds", "12 hours", "1 year"],
          "Light-time delay.",
          "Signals cannot beat light speed; delay equals distance in light-time.",
          t + ["light-speed", "comms"]),
        q("q_space_logic_m_01", "logic", "medium", "8-10",
          "True or false reasoning: All rockets need fuel. This vehicle is a rocket. Therefore…",
          ["It needs fuel", "It cannot exist", "It only needs paint", "It must be a boat"],
          "Apply the rule.",
          "If all rockets need fuel and this is a rocket, it needs fuel.",
          t + ["reasoning"]),
        q("q_space_geo_m_01", "geography", "medium", "8-10",
          "Launches near the equator can get a free speed boost eastward because…",
          ["Earth rotates fastest there, helping rockets going east", "The equator has no gravity", "Oceans push rockets up automatically", "Compasses reverse forever"],
          "Spin assist.",
          "Earth’s rotation gives an eastward velocity; larger near the equator.",
          t + ["launch", "earth-rotation"]),
        q("q_space_lang_e_01", "language", "easy", "5-7",
          "The word “lunar” is about the…",
          ["Moon", "Ocean only", "Kitchen only", "Shoe only"],
          "Luna = Moon.",
          "Lunar means related to the Moon.",
          t + ["vocabulary"]),
        q("q_space_lang_m_01", "language", "medium", "8-10",
          "“Microgravity” means…",
          ["A condition of very small apparent weight, as in freefall orbit", "Super-heavy gravity only", "No motion allowed", "Only gravity on Mars always"],
          "Tiny-g feeling.",
          "Microgravity describes the near-weightless freefall environment of orbit.",
          t + ["vocabulary"]),
        q("q_space_art_e_01", "art", "easy", "5-7",
          "Many space posters show Earth as a blue marble. Blue mainly shows…",
          ["Oceans and atmosphere", "Only deserts of pure gold", "Only forests of metal", "Only volcanoes of cheese"],
          "Planet colors.",
          "Oceans and sky tones make Earth look blue from space.",
          t + ["earth", "color"]),
        q("q_space_tech_e_01", "technology", "easy", "5-7",
          "Mission Control is a place where teams…",
          ["Watch spacecraft data and help astronauts", "Only bake cookies", "Only repair bicycles", "Only sell tickets to movies"],
          "Ground helpers.",
          "Flight controllers monitor systems and communicate with the crew.",
          t + ["mission-control"]),
        q("q_space_hist_e_01", "history", "easy", "5-7",
          "People first launched a satellite before people first…",
          ["Walked on the Moon", "Invented the wheel", "Built the first house", "Learned to speak"],
          "Order of firsts.",
          "Sputnik (1957) came before Apollo 11 (1969).",
          t + ["timeline"]),
    ]

    return items


def build_articles() -> list[dict]:
    return [
        art(
            "article_space_age_begins_001",
            "history",
            "8-10",
            "The Space Age Begins: Sputnik",
            "How a beeping satellite in 1957 changed the world.",
            "On **4 October 1957**, the Soviet Union launched **Sputnik 1**, the first artificial satellite. "
            "It was a metal sphere with antennas that sent simple radio beeps as it orbited Earth.\n\n"
            "Why it mattered:\n"
            "- It proved humans could place machines in **orbit**\n"
            "- It began the **Space Age** and sped up science and engineering worldwide\n"
            "- It led to new tools we use every day, from weather satellites to global communications\n\n"
            "Within months, more satellites followed. The race to send people and later to reach the Moon had begun.",
            ["Sputnik", "satellite", "orbit", "Space Age"],
            4.5,
            ["article_space_gagarin_002", "article_space_orbit_basics_010"],
        ),
        art(
            "article_space_gagarin_002",
            "history",
            "8-10",
            "Yuri Gagarin: First Human in Orbit",
            "One orbit that made history in 1961.",
            "On **12 April 1961**, cosmonaut **Yuri Gagarin** flew aboard **Vostok 1**. "
            "He completed about one full **orbit** of Earth and returned safely.\n\n"
            "People around the world celebrated — for the first time, a human had left the atmosphere "
            "and seen our planet from space. Gagarin’s flight showed that crewed spaceflight was possible, "
            "and it inspired other nations to train astronauts and build safer spacecraft.\n\n"
            "Today, April 12 is often honored as a day of human spaceflight achievement.",
            ["Yuri Gagarin", "Vostok 1", "cosmonaut", "orbit"],
            4.0,
            ["article_space_age_begins_001", "article_space_apollo11_004"],
        ),
        art(
            "article_space_women_pioneers_003",
            "history",
            "8-10",
            "Women Pioneers in Space",
            "From Tereshkova to Ride and beyond.",
            "**Valentina Tereshkova** became the first woman in space in **1963** on Vostok 6. "
            "Decades later, **Sally Ride** became the first American woman in space on the Shuttle in **1983**.\n\n"
            "Since then, women have commanded stations, walked in space, and led science on orbit. "
            "Modern crews on the **International Space Station** routinely include women from several countries.\n\n"
            "Space exploration is a human story — and more of humanity gets to write the next chapters.",
            ["Tereshkova", "Sally Ride", "astronaut", "inclusion"],
            4.5,
            ["article_space_gagarin_002", "article_space_iss_006"],
        ),
        art(
            "article_space_apollo11_004",
            "history",
            "5-7",
            "Apollo 11 and the Moon Landing",
            "The day people walked on the Moon.",
            "In **July 1969**, the Apollo 11 mission sent three astronauts toward the Moon. "
            "**Neil Armstrong** and **Buzz Aldrin** landed in the lunar module **Eagle** while "
            "**Michael Collins** orbited above in the command ship.\n\n"
            "Armstrong stepped onto the surface and said words about a “giant leap for mankind.” "
            "They collected rocks, set up experiments, and returned safely to Earth.\n\n"
            "It took huge teamwork — engineers, scientists, and controllers on the ground — "
            "to make that one soft landing possible.",
            ["Apollo 11", "Moon", "Neil Armstrong", "Buzz Aldrin"],
            2.5,
            ["article_space_apollo_program_005", "article_space_artemis_009"],
        ),
        art(
            "article_space_apollo_program_005",
            "history",
            "11-12+",
            "From Mercury to Apollo",
            "How NASA practiced before landing on the Moon.",
            "U.S. crewed programs built skills step by step:\n\n"
            "1. **Mercury** — put Americans into space and into orbit (e.g., John Glenn).\n"
            "2. **Gemini** — longer flights, spacewalks, rendezvous and docking practice.\n"
            "3. **Apollo** — powerful Saturn V rockets, command modules, and lunar modules for landing.\n\n"
            "Six Apollo missions landed twelve people on the Moon (1969–1972). "
            "The program also drove advances in computing, materials, and systems engineering "
            "that influenced later stations and shuttles.",
            ["Mercury", "Gemini", "Apollo", "Saturn V"],
            6.0,
            ["article_space_apollo11_004", "article_space_shuttle_007"],
        ),
        art(
            "article_space_iss_006",
            "science",
            "8-10",
            "Living on the International Space Station",
            "A laboratory home circling Earth.",
            "The **International Space Station (ISS)** is a large spacecraft assembled in **low Earth orbit**. "
            "Countries including the United States, Russia, Japan, Canada, and European partners built modules that dock together.\n\n"
            "Crews live there for months. They:\n"
            "- Run science experiments\n"
            "- Exercise to protect bones and muscles\n"
            "- Maintain life-support systems\n"
            "- Photograph Earth and study microgravity\n\n"
            "The ISS has been continuously crewed since **2000**, teaching us how humans can live off the planet for long periods.",
            ["ISS", "orbit", "microgravity", "crew"],
            4.5,
            ["article_space_orbit_basics_010", "article_space_commercial_008"],
        ),
        art(
            "article_space_shuttle_007",
            "technology",
            "8-10",
            "The Space Shuttle Era",
            "A winged orbiter that launched like a rocket and landed like a glider.",
            "From **1981 to 2011**, NASA’s **Space Shuttle** carried astronauts and cargo to orbit. "
            "It launched vertically with boosters, spent time in orbit with a large cargo bay, "
            "and landed on a runway.\n\n"
            "The Shuttle helped build the early **ISS**, launched and serviced the **Hubble Space Telescope**, "
            "and flew many science missions. It was a bridge between early capsules and today’s mix of "
            "government and commercial spacecraft.",
            ["Space Shuttle", "orbiter", "Hubble", "runway landing"],
            4.5,
            ["article_space_iss_006", "article_space_telescopes_011"],
        ),
        art(
            "article_space_commercial_008",
            "technology",
            "11-12+",
            "Commercial Crew and Today’s Access to Space",
            "When companies fly astronauts alongside national agencies.",
            "In the 2010s–2020s, spaceflight changed again. NASA’s **Commercial Crew Program** hired private companies "
            "to build crewed capsules. **SpaceX Crew Dragon** began flying astronauts to the ISS in **2020**. "
            "Other vehicles and providers continue to develop.\n\n"
            "Meanwhile, reusable rockets, rideshare launches, and small satellites (**CubeSats**) made orbit more reachable "
            "for universities and startups. Human spaceflight is no longer only a two-nation story — "
            "it is a growing global industry with science, exploration, and Earth services intertwined.",
            ["Commercial Crew", "Crew Dragon", "reusable rocket", "CubeSat"],
            6.0,
            ["article_space_iss_006", "article_space_artemis_009"],
        ),
        art(
            "article_space_artemis_009",
            "history",
            "11-12+",
            "Artemis and Returning to the Moon",
            "The modern plan for lunar exploration.",
            "**Artemis** is NASA’s program (with international and commercial partners) to return humans to the Moon "
            "and explore more of it than Apollo did — including plans involving the lunar south polar region "
            "and long-term infrastructure ideas.\n\n"
            "Key ideas:\n"
            "- New rockets and spacecraft (such as SLS and Orion in the U.S. architecture)\n"
            "- International cooperation\n"
            "- Using the Moon as a step toward future Mars exploration\n\n"
            "As of the mid-2020s, uncrewed and crewed test flights are staged milestones. "
            "Exact landing dates can shift, but the scientific goal is clear: learn to live and work farther from Earth.",
            ["Artemis", "Moon", "exploration", "Orion"],
            6.0,
            ["article_space_apollo11_004", "article_space_mars_012"],
        ),
        art(
            "article_space_orbit_basics_010",
            "science",
            "5-7",
            "What Is an Orbit?",
            "Falling around a planet without hitting it.",
            "An **orbit** is a path around a planet or moon. Imagine throwing a ball so fast that as it falls, "
            "the ground curves away beneath it — that is the idea of orbit!\n\n"
            "Satellites and the ISS stay in orbit because they move sideways very fast while gravity pulls them inward. "
            "They are not “floating with zero gravity outside” in the cartoon sense; they are in continuous freefall, "
            "which feels like weightlessness to astronauts.",
            ["orbit", "gravity", "satellite", "freefall"],
            2.5,
            ["article_space_age_begins_001", "article_space_iss_006"],
        ),
        art(
            "article_space_telescopes_011",
            "science",
            "8-10",
            "Eyes in the Sky: Space Telescopes",
            "Hubble, Webb, and why altitude helps astronomy.",
            "Telescopes in space avoid much of Earth’s blurry, glowing atmosphere.\n\n"
            "- **Hubble Space Telescope** (launched 1990) has taken famous visible and ultraviolet images of galaxies and nebulae.\n"
            "- **James Webb Space Telescope** (launched 2021) sees mainly **infrared** light, great for dusty star nurseries and distant early galaxies.\n\n"
            "These observatories help us understand how stars form, how galaxies grow, and what other planetary systems are like.",
            ["Hubble", "James Webb", "infrared", "astronomy"],
            5.0,
            ["article_space_shuttle_007", "article_space_mars_012"],
        ),
        art(
            "article_space_mars_012",
            "science",
            "8-10",
            "Robots on Mars",
            "Rovers and a helicopter exploring another world.",
            "Mars is too far for easy human visits (so far), so we send **robots**.\n\n"
            "Rovers such as **Curiosity** and **Perseverance** drive across the surface, drill rocks, "
            "and search for signs of past water and habitability. "
            "In 2021, the **Ingenuity** helicopter made the first powered flights on another planet.\n\n"
            "Every radio message takes minutes to travel, so robots follow careful plans from Earth teams. "
            "They are scouts preparing knowledge for possible future explorers.",
            ["Mars", "rover", "Perseverance", "Ingenuity"],
            4.5,
            ["article_space_artemis_009", "article_space_probes_013"],
        ),
        art(
            "article_space_probes_013",
            "science",
            "11-12+",
            "Probes Across the Solar System",
            "Voyagers, landers, and the long reach of robots.",
            "Uncrewed **probes** have visited every planet in our solar system. Highlights include:\n\n"
            "- **Viking** landers (1970s) on Mars\n"
            "- **Voyager 1 & 2** grand tour of outer planets; Voyager 1 later entered interstellar space\n"
            "- Missions to Jupiter, Saturn (Cassini), Pluto (New Horizons), and asteroids/comets\n\n"
            "Probes expand human knowledge without risking crews. They also teach navigation, power, and communication "
            "tricks used by crewed missions closer to home.",
            ["probe", "Voyager", "Viking", "solar system"],
            6.0,
            ["article_space_mars_012", "article_space_orbit_basics_010"],
        ),
        art(
            "article_space_rockets_014",
            "technology",
            "5-7",
            "How Rockets Work",
            "Push down to go up.",
            "A **rocket** carries fuel and oxygen (or chemicals that make hot gas). "
            "When gas blasts out the bottom, the rocket is pushed the other way — **action and reaction**.\n\n"
            "Rockets can work in space because they bring their own “push stuff”; they do not need air to push against. "
            "Tall rockets often use **stages** that drop away when empty so the rest can fly higher and faster.",
            ["rocket", "thrust", "stages", "action-reaction"],
            2.5,
            ["article_space_orbit_basics_010", "article_space_commercial_008"],
        ),
        art(
            "article_space_timeline_015",
            "history",
            "11-12+",
            "Spaceflight Timeline: 1957 to Today",
            "A quick path from Sputnik to commercial crew and lunar plans.",
            "A short map of major eras (not every mission!):\n\n"
            "- **1957** — Sputnik 1: first satellite\n"
            "- **1961** — Gagarin: first human in orbit\n"
            "- **1969** — Apollo 11: first people on the Moon\n"
            "- **1970s–80s** — stations like Skylab; Shuttle flights begin (1981)\n"
            "- **1990** — Hubble launches\n"
            "- **1998–2000s** — ISS assembly; continuous crews from 2000\n"
            "- **2010s–2020s** — reusable rockets, CubeSats, Chinese station Tiangong, Crew Dragon to ISS, JWST, Mars helicopters, Artemis lunar plans\n\n"
            "The theme of “today” is **more players**: many countries and companies share the sky, "
            "while science stations and telescopes keep expanding what we know.",
            ["timeline", "Sputnik", "Apollo", "ISS", "Artemis"],
            6.0,
            ["article_space_age_begins_001", "article_space_commercial_008", "article_space_artemis_009"],
        ),
        art(
            "article_space_careers_016",
            "technology",
            "8-10",
            "Jobs That Build Spaceflight",
            "Not only astronauts — engineers, coders, and scientists.",
            "Astronauts are famous, but most space work happens on Earth:\n\n"
            "- **Engineers** design rockets, suits, and stations\n"
            "- **Software developers** write guidance and robotics code\n"
            "- **Scientists** plan experiments and study data\n"
            "- **Flight controllers** watch systems in Mission Control\n"
            "- **Technicians** build and test hardware carefully\n\n"
            "If you like puzzles, teamwork, and learning from failure, space careers welcome many skills — "
            "including art and writing that explain discoveries to everyone.",
            ["career", "engineer", "Mission Control", "teamwork"],
            4.0,
            ["article_space_iss_006", "article_space_rockets_014"],
        ),
        art(
            "article_space_china_india_017",
            "history",
            "11-12+",
            "More Nations Reach Space",
            "China, India, and a multipolar space age.",
            "Spaceflight is global. Examples:\n\n"
            "- **China** — crewed Shenzhou flights; **Tiangong** space station; Chang’e lunar landers "
            "(including the first soft landing on the Moon’s far side).\n"
            "- **India** — ISRO missions including Mars Orbiter (Mangalyaan) and lunar efforts such as Chandrayaan.\n"
            "- **Europe, Japan, Canada**, and many others contribute stations, probes, and launchers.\n\n"
            "Cooperation and competition both shape what launches next — from Earth science satellites to deep-space probes.",
            ["Tiangong", "ISRO", "Chang’e", "international"],
            6.0,
            ["article_space_timeline_015", "article_space_iss_006"],
        ),
        art(
            "article_space_safety_018",
            "science",
            "8-10",
            "Space Is Hard: Safety and Training",
            "Why practice on Earth saves lives in orbit.",
            "Space has no air to breathe, extreme temperatures, and sharp speed differences. "
            "Crews train for years in simulators, pools (for spacewalk practice), and classrooms.\n\n"
            "Spacecraft need:\n"
            "- Reliable life support\n"
            "- Heat shields for re-entry\n"
            "- Abort systems for launch emergencies\n"
            "- Careful mission rules\n\n"
            "Learning from past accidents made modern systems safer. "
            "Courage in space always rides with careful engineering on the ground.",
            ["safety", "training", "life support", "re-entry"],
            4.5,
            ["article_space_rockets_014", "article_space_iss_006"],
        ),
    ]


def rebuild_manifest() -> None:
    all_q: list[dict] = []
    quiz_files = sorted((PACK / "quizzes").glob("quizzes-*.json"))
    for p in quiz_files:
        all_q.extend(json.loads(p.read_text(encoding="utf-8"))["questions"])

    all_a: list[dict] = []
    art_files = sorted((PACK / "articles").glob("articles-*.json"))
    for p in art_files:
        all_a.extend(json.loads(p.read_text(encoding="utf-8"))["articles"])

    cat_counts = Counter(x["category"] for x in all_q)
    sub_counts = Counter(x["subject"] for x in all_a)
    age_counts = Counter(x["ageMetadata"]["ageBand"] for x in all_q)

    category_counts = {
        k: cat_counts.get(k, 0)
        for k in ("math", "science", "history", "language", "logic", "geography", "technology", "art")
    }
    subject_counts = {
        k: sub_counts.get(k, 0)
        for k in ("math", "science", "history", "language", "technology", "geography", "art")
    }

    manifest = {
        "schemaVersion": "1.0.0",
        "packName": "Default Educational Content Pack",
        "packVersion": "2.2.0",
        "description": (
            "Educational content for Emily's Game — quizzes and Book articles across subjects "
            "and age bands. Includes nature/explore (2026-07) and spaceflight history to today."
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
    print(f"Manifest: quizzes={len(all_q)} articles={len(all_a)} shards q={len(quiz_files)} a={len(art_files)}")


def main() -> None:
    questions = build_questions()
    articles = build_articles()

    quiz_path = PACK / "quizzes" / "quizzes-006.json"
    art_path = PACK / "articles" / "articles-003.json"

    quiz_path.write_text(
        json.dumps(
            {
                "shardId": "quizzes-006",
                "schemaVersion": "1.0.0",
                "createdAt": NOW,
                "questions": questions,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    art_path.write_text(
        json.dumps(
            {
                "shardId": "articles-003",
                "schemaVersion": "1.0.0",
                "createdAt": NOW,
                "articles": articles,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    rebuild_manifest()
    print(f"Wrote {quiz_path.name}: {len(questions)} questions")
    print(f"Wrote {art_path.name}: {len(articles)} articles")
    print("Quiz categories:", Counter(q["category"] for q in questions))
    print("Quiz age bands:", Counter(q["ageMetadata"]["ageBand"] for q in questions))


if __name__ == "__main__":
    main()
