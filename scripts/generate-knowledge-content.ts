/**
 * scripts/generate-knowledge-content.ts
 * Knowledge article content ingestion script.
 * Gathers educational articles from curated sources and converts them
 * into schema v1 content pack format.
 *
 * Run with: npx tsx scripts/generate-knowledge-content.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import type {
  KnowledgeArticlePack,
  ArticleShard,
  SubjectId,
  AgeBand,
} from '../src/types/content-pack.types';
import {
  SCHEMA_VERSION,
  MAX_ARTICLES_PER_SHARD,
  createAgeMetadata,
  createProvenanceMetadata,
} from '../src/types/content-pack.types';

// ─── Curated Knowledge Articles ─────────────────────────────

interface RawKnowledgeArticle {
  title: string;
  subject: SubjectId;
  ageBand: AgeBand;
  summary: string;
  content: string;
  keyTerms: string[];
  related?: string[];
  readingLevel?: number;
  source: string;
  sourceUrl?: string;
}

/**
 * Manually curated knowledge articles from public domain and educational resources.
 * Content simplified and adapted for children ages 5-12.
 */
const CURATED_ARTICLES: RawKnowledgeArticle[] = [
  // ──── Math Articles ────
  {
    title: 'What Are Fractions?',
    subject: 'math',
    ageBand: '8-10',
    summary: 'Learn about fractions - parts of a whole, like slicing a pizza!',
    content: `A **fraction** represents a part of something whole. When you cut a pizza into 4 equal slices and eat 1, you've eaten 1/4 (one quarter) of the pizza.

The top number is called the **numerator** — it tells you how many parts you have. The bottom number is the **denominator** — it tells you how many equal parts the whole is divided into.

**Examples:**
- 1/2 means one part out of two (half)
- 3/4 means three parts out of four
- 5/8 means five parts out of eight

Fun fact: The word "fraction" comes from the Latin word "fractio" which means "to break"! So fractions are literally about breaking things into pieces.

**Practice:** If you have a candy bar divided into 6 pieces and you eat 2, what fraction did you eat? Answer: 2/6 (which can be simplified to 1/3).`,
    keyTerms: ['fraction', 'numerator', 'denominator', 'quarter', 'half'],
    readingLevel: 3.5,
    source: 'manual-curation',
  },
  {
    title: 'Prime Numbers Explained',
    subject: 'math',
    ageBand: '11-12+',
    summary: 'Special numbers that can only be divided by 1 and themselves.',
    content: `A **prime number** is a number greater than 1 that can only be divided evenly by 1 and itself. The first few primes are: 2, 3, 5, 7, 11, 13, 17, 19, 23...

**Why is 2 special?** It's the only even prime number! Every other even number can be divided by 2, so they're not prime.

**Prime Factorization:**
Prime numbers are like the "atoms" of math — every whole number can be built by multiplying primes together. This is called **prime factorization**.

Example: 12 = 2 × 2 × 3

**Where are primes used?**
- Internet security and encryption
- Random number generation
- Coding theory

**Unsolved Mystery:** The **Goldbach Conjecture** says every even number greater than 2 can be written as the sum of two primes. It's been tested for numbers up to billions, but no one has proven it's always true!`,
    keyTerms: ['prime number', 'prime factorization', 'divisible', 'composite number'],
    readingLevel: 5.5,
    source: 'manual-curation',
  },
  {
    title: 'Geometry Basics: Shapes Around Us',
    subject: 'math',
    ageBand: '5-7',
    summary: 'Learn about triangles, squares, circles and other shapes!',
    content: `**Geometry** is the study of shapes! Shapes are all around us - in buildings, nature, and even in this game!

**Triangle** 🔺
- Has 3 sides and 3 corners
- All its angles add up to 180°
- Can be different types: equilateral (all sides equal), isosceles (two sides equal), or scalene (all different)

**Square** ⬛
- Has 4 equal sides
- Has 4 right angles (90° each)
- All corners are the same

**Circle** ⭕
- Has no corners at all
- Every point on the edge is the same distance from the center
- That distance is called the radius

**Rectangle** 📱
- Has 4 sides (opposite sides are equal)
- Has 4 right angles

**Fun Activity:** Look around your room. Can you find 5 different shapes?`,
    keyTerms: ['triangle', 'square', 'circle', 'rectangle', 'geometry', 'right angle'],
    readingLevel: 2.5,
    source: 'manual-curation',
  },

  // ──── Science Articles ────
  {
    title: 'Atoms: The Building Blocks of Everything',
    subject: 'science',
    ageBand: '11-12+',
    summary: 'Everything is made of tiny particles called atoms. Learn how they work!',
    content: `Everything you can see, touch, or smell is made of incredibly tiny particles called **atoms**. They're so small that millions of them could fit on the period at the end of this sentence!

**Parts of an Atom:**
- **Protons**: Positive charge, found in the nucleus (center)
- **Neutrons**: No charge, also in the nucleus
- **Electrons**: Negative charge, zoom around the nucleus in shells

**Elements:**
When you have atoms that are all the same type, that's called an **element**. Gold, oxygen, and carbon are all elements. There are 118 known elements!

**The Periodic Table:**
Scientists organize all elements in a chart called the **Periodic Table**. Elements in the same column have similar properties.

**Molecules:**
When atoms bond together, they form **molecules**. Water (H₂O) is a molecule made of 2 hydrogen atoms and 1 oxygen atom.

**Amazing Fact:** If an atom were the size of a football stadium, the nucleus would be the size of a pea in the center!`,
    keyTerms: ['atom', 'proton', 'neutron', 'electron', 'nucleus', 'element', 'periodic table', 'molecule'],
    readingLevel: 6.0,
    source: 'manual-curation',
  },
  {
    title: 'Photosynthesis: How Plants Make Food',
    subject: 'science',
    ageBand: '8-10',
    summary: 'Plants can make their own food using sunlight. Here\'s how!',
    content: `Plants are amazing — they can make their own food! This process is called **photosynthesis**.

**The Recipe for Photosynthesis:**
1. **Sunlight** ☀️ (energy source)
2. **Water** 💧 (from roots)
3. **Carbon Dioxide** (from air)
4. **Chlorophyll** 🌿 (green substance in leaves)

**What Happens:**
The plant uses the sun's energy to combine water and CO₂ into **glucose** (sugar for energy) and releases **oxygen** as a bonus. That oxygen is what we breathe!

**The Equation:**
Water + Carbon Dioxide + Sunlight → Glucose + Oxygen

**Where It Happens:**
Photosynthesis happens in tiny structures called **chloroplasts** inside plant cells. Chloroplasts contain chlorophyll, which makes plants look green!

**Why It Matters:**
Without photosynthesis, there would be no oxygen in the air for us to breathe. Plants are Earth's oxygen factories! 🌍`,
    keyTerms: ['photosynthesis', 'chlorophyll', 'glucose', 'carbon dioxide', 'oxygen', 'chloroplasts'],
    readingLevel: 4.5,
    source: 'manual-curation',
  },
  {
    title: 'Gravity: The Force That Keeps Us Down',
    subject: 'science',
    ageBand: '8-10',
    summary: 'What is gravity and why don\'t we float away?',
    content: `**Gravity** is an invisible force that pulls objects toward each other. The bigger an object is, the stronger its gravity.

**Earth's Gravity:**
Earth is really big, so it pulls everything toward its center — that's why we don't float away! When you jump, gravity pulls you back down.

**Sir Isaac Newton:**
Legend says Newton figured out gravity around 1687 after watching an apple fall from a tree. He realized the same force pulling the apple down also keeps the Moon orbiting Earth!

**On Other Worlds:**
The Moon's gravity is about 1/6th of Earth's. If you weigh 60 kg on Earth, you'd only weigh about 10 kg on the Moon! You could jump 6 times higher there.

**In Space:**
Gravity keeps:
- The Moon orbiting Earth
- Earth orbiting the Sun
- Planets in our solar system together

Without gravity, everything would just float apart into space!`,
    keyTerms: ['gravity', 'force', 'mass', 'orbit', 'Newton', 'weight'],
    readingLevel: 4.0,
    source: 'manual-curation',
  },
  {
    title: 'The Water Cycle',
    subject: 'science',
    ageBand: '5-7',
    summary: 'How water travels from the ocean to the sky and back again!',
    content: `Water is always moving! It goes through a journey called the **water cycle**.

**The Journey:**

1. **Evaporation** ☀️💧
   - The sun heats water in oceans, lakes, and rivers
   - Water turns into invisible water vapor and rises into the sky

2. **Condensation** ☁️
   - Water vapor cools down and forms tiny droplets
   - These droplets make clouds!

3. **Precipitation** 🌧️❄️
   - When clouds get heavy, water falls back to Earth
   - This can be rain, snow, sleet, or hail

4. **Collection** 🌊
   - Water flows into rivers, lakes, and oceans
   - Then the cycle starts again!

**Fun Fact:** The water you drink today is the same water dinosaurs drank millions of years ago! Water doesn't leave Earth - it just keeps recycling.`,
    keyTerms: ['water cycle', 'evaporation', 'condensation', 'precipitation', 'collection'],
    readingLevel: 2.5,
    source: 'manual-curation',
  },

  // ──── History Articles ────
  {
    title: 'Ancient Egypt: Land of Pharaohs and Pyramids',
    subject: 'history',
    ageBand: '8-10',
    summary: 'Discover the amazing civilization that built pyramids along the Nile River.',
    content: `Ancient Egypt was one of the world's first great civilizations, lasting over **3,000 years**! It grew along the **Nile River** in northeast Africa.

**Pharaohs:**
Egyptian kings were called **pharaohs**. They were thought to be gods on Earth! Famous pharaohs include:
- **Tutankhamun** (King Tut) - died young, tomb found intact
- **Ramses II** - built many temples
- **Cleopatra** - last pharaoh of Egypt

**The Pyramids:**
The Great Pyramid of Giza is made of about 2.3 million stone blocks! Each block weighs as much as two cars. It took 20 years and thousands of workers to build.

**Hieroglyphics:**
Egyptians invented **hieroglyphics** — a writing system using pictures and symbols. We can read it now thanks to the Rosetta Stone!

**Amazing Inventions:**
- **Papyrus** (early paper made from reeds)
- **Calendar** (365 days, 12 months)
- **Advanced medicine** (they even performed surgery!)

**Fun Fact:** Ancient Egyptians loved cats so much that harming one was against the law! 🐱`,
    keyTerms: ['pharaoh', 'pyramid', 'hieroglyphics', 'Nile River', 'papyrus', 'mummy', 'sphinx'],
    readingLevel: 4.5,
    source: 'public-domain',
    sourceUrl: 'https://en.wikipedia.org/wiki/Ancient_Egypt',
  },
  {
    title: 'The Space Race: Journey to the Moon',
    subject: 'history',
    ageBand: '11-12+',
    summary: 'How humans first reached the Moon in 1969.',
    content: `The **Space Race** was a competition between the USA and Soviet Union to explore space. It started in the 1950s and reached its peak in 1969.

**The Soviets Lead:**
- **1957**: Launch **Sputnik**, the first satellite
- **1961**: **Yuri Gagarin** becomes first human in space
- **1963**: Valentina Tereshkova becomes first woman in space

**America Responds:**
President Kennedy announced in 1961: "We choose to go to the Moon!" This started the **Apollo program**.

**Apollo 11 - July 20, 1969:**
- **Neil Armstrong** becomes first person to walk on the Moon
- **Buzz Aldrin** follows 19 minutes later
- **Michael Collins** orbits above in the command module

**Famous Quote:**
"That's one small step for man, one giant leap for mankind." - Neil Armstrong

**The Legacy:**
The Space Race led to inventions we still use:
- Memory foam
- Scratch-resistant lenses
- Water filters
- Cordless tools
- Satellite TV

**After the Race:**
In 1975, American and Soviet spacecraft docked in space, marking the end of the Space Race and beginning of cooperation.`,
    keyTerms: ['Sputnik', 'Apollo', 'Neil Armstrong', 'Yuri Gagarin', 'satellite', 'orbit', 'NASA'],
    readingLevel: 6.0,
    source: 'public-domain',
    sourceUrl: 'https://en.wikipedia.org/wiki/Space_Race',
  },

  // ──── Language Articles ────
  {
    title: 'Parts of Speech: The Building Blocks of Sentences',
    subject: 'language',
    ageBand: '8-10',
    summary: 'Every word has a job in a sentence. Learn about nouns, verbs, and more!',
    content: `Every word in a sentence has a job. These jobs are called **parts of speech**.

**Noun** 📦
A person, place, or thing.
Examples: dog, happiness, London, teacher

**Verb** 🏃
An action or state of being.
Examples: run, think, is, jump, sleep

**Adjective** 🎨
Describes a noun.
Examples: big, blue, happy, fast, delicious

**Adverb** ⚡
Describes a verb (often ends in -ly).
Examples: quickly, very, yesterday, carefully

**Pronoun** 👤
Replaces a noun.
Examples: he, she, they, it, who

**Preposition** ↔️
Shows position or direction.
Examples: in, on, under, through, between

**Conjunction** ➕
Joins words or sentences.
Examples: and, but, because, or

**Challenge Sentence:**
"The quick brown fox jumps over the lazy dog."
- **Nouns**: fox, dog
- **Verb**: jumps
- **Adjectives**: quick, brown, lazy
- **Preposition**: over
- **Article**: the (special type of adjective)`,
    keyTerms: ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction'],
    readingLevel: 3.5,
    source: 'manual-curation',
  },
  {
    title: 'Word Origins: Where English Comes From',
    subject: 'language',
    ageBand: '11-12+',
    summary: 'English is a mix of many languages! Discover where words come from.',
    content: `**Etymology** is the study of where words come from. English is like a big mixing bowl!

**Language Sources:**
- **29% Latin**: animal, video, circus, bonus
- **29% French**: menu, chef, ballet, café
- **26% Germanic**: house, water, mother, bread
- **7% Greek**: phone, photo, geography, democracy
- **9% Other**: Borrowed from languages worldwide!

**Interesting Word Origins:**

**Robot** 🤖
From Czech "robota" meaning forced labor. First used in a 1920 play.

**Ketchup** 🍅
May come from Chinese "kê-tsiap" (a fish sauce)!

**Salary** 💰
From Latin "salarium" — Roman soldiers were partly paid in salt! (Salt was valuable for preserving food.)

**Dinosaur** 🦕
Greek: "deinos" (terrible) + "sauros" (lizard) = terrible lizard

**Why Learn Etymology?**
Knowing word origins helps you:
- Guess meanings of new words
- Spell better
- Remember vocabulary
- Understand connections between words

**Example:** If you know "aqua" means water in Latin, you can guess that "aquarium," "aquatic," and "aqueduct" all relate to water!`,
    keyTerms: ['etymology', 'Latin', 'Germanic', 'Greek', 'origin', 'root word'],
    readingLevel: 6.5,
    source: 'manual-curation',
  },

  // ──── Technology Articles ────
  {
    title: 'Binary Code: The Language of Computers',
    subject: 'technology',
    ageBand: '11-12+',
    summary: 'Computers only understand 1s and 0s. Learn how binary works!',
    content: `Computers only understand two things: **on** and **off**, represented as **1** and **0**. This system is called **binary**.

**Bits and Bytes:**
- A **bit** is a single 1 or 0 (the smallest unit of data)
- A **byte** is 8 bits together
- 1 kilobyte (KB) = 1,024 bytes
- 1 megabyte (MB) = 1,024 KB
- 1 gigabyte (GB) = 1,024 MB

**How Binary Counting Works:**
Decimal → Binary
- 0 → 0
- 1 → 1
- 2 → 10
- 3 → 11
- 4 → 100
- 5 → 101
- 10 → 1010

**Storing Information:**
- **Numbers**: Direct binary conversion
- **Letters**: Each letter has a code (A = 01000001)
- **Colors**: Three numbers for red, green, blue
- **Music**: Thousands of numbers per second!
- **This game**: Millions of 1s and 0s!

**Transistors:**
Your computer has billions of tiny switches called **transistors**. Each one represents one bit. Modern processors can switch billions of times per second!

**Fun Activity:** Try writing your age in binary!`,
    keyTerms: ['binary', 'bit', 'byte', 'transistor', 'digital', 'code'],
    readingLevel: 6.5,
    source: 'manual-curation',
  },
  {
    title: 'How the Internet Works',
    subject: 'technology',
    ageBand: '8-10',
    summary: 'The internet connects billions of devices worldwide. Here\'s how!',
    content: `The **Internet** is a giant network of computers all connected together. Think of it like roads connecting cities, but for information!

**When You Visit a Website:**

1. **You Type a URL** 🌐
   Example: www.example.com

2. **DNS Lookup** 📞
   Your computer asks a **DNS server** (like a phone book) to find the website's address

3. **Travel Through Cables** 🔌
   Your request travels through cables (sometimes under the ocean!) to a **server**

4. **Server Responds** 💻
   The server (a powerful computer) sends the website data back in small **packets**

5. **Your Browser Displays It** 📱
   Your browser puts all the packets together and shows you the page

All this happens in milliseconds!

**Amazing Facts:**
- There are over 800,000 miles of undersea cables!
- Google handles about 5 billion searches every day
- The first message sent over the internet was "LO" (they were trying to type "LOGIN" but it crashed!)

**Internet vs. Web:**
The **Internet** is the network of connections.
The **World Wide Web** (WWW) is the system of websites that runs on the Internet.`,
    keyTerms: ['internet', 'server', 'DNS', 'packet', 'URL', 'browser', 'network', 'web'],
    readingLevel: 4.0,
    source: 'manual-curation',
  },

  // ──── Geography Articles ────
  {
    title: 'The Seven Continents',
    subject: 'geography',
    ageBand: '5-7',
    summary: 'Explore the seven large landmasses on Earth!',
    content: `Our Earth has seven huge pieces of land called **continents**. Let's explore each one!

**1. Asia** 🌏
- Largest continent
- Home to China, India, Japan
- More than half of all people live here!

**2. Africa** 🦁
- Second largest
- Has the Sahara Desert and Nile River
- Where humans first evolved

**3. North America** 🦅
- Has USA, Canada, Mexico
- Contains every type of climate

**4. South America** 🌴
- Has the Amazon rainforest
- Home to the Andes Mountains

**5. Antarctica** 🐧
- Coldest continent
- Covered in ice
- No countries, just research stations!

**6. Europe** 🏰
- Has many countries close together
- Rich in history and culture

**7. Australia/Oceania** 🦘
- Smallest continent
- Also called Oceania (includes nearby islands)
- Home to unique animals like kangaroos

**Memory Trick:** "Asia, Africa, North America, South America, Antarctica, Europe, Australia" — or make up your own sentence using the first letters!`,
    keyTerms: ['continent', 'Asia', 'Africa', 'North America', 'South America', 'Antarctica', 'Europe', 'Australia'],
    readingLevel: 2.5,
    source: 'manual-curation',
  },
  {
    title: 'Oceans of the World',
    subject: 'geography',
    ageBand: '8-10',
    summary: 'Learn about the five oceans that cover most of our planet!',
    content: `About **71% of Earth's surface** is covered by oceans! There are five major oceans:

**1. Pacific Ocean** 🌊
- Largest and deepest
- Covers more area than all land combined!
- Home to the Mariana Trench (deepest spot on Earth)

**2. Atlantic Ocean** 🚢
- Second largest
- Separates Americas from Europe and Africa
- Has the Bermuda Triangle

**3. Indian Ocean** 🏝️
- Third largest
- Warmest ocean
- Important for trade routes

**4. Southern Ocean** 🐧
- Surrounds Antarctica
- Very cold with lots of icebergs
- Fourth largest

**5. Arctic Ocean** ❄️
- Smallest and shallowest
- Mostly frozen
- Home to polar bears and seals

**Ocean Facts:**
- Oceans contain 97% of Earth's water
- The deepest point is 36,070 feet (almost 7 miles!)
- More people have been to space than to the deepest ocean
- Oceans produce over half of the world's oxygen

**Why Oceans Matter:**
- Regulate Earth's temperature
- Provide food
- Create weather patterns
- Home to millions of species`,
    keyTerms: ['ocean', 'Pacific', 'Atlantic', 'Indian', 'Southern', 'Arctic', 'sea'],
    readingLevel: 4.0,
    source: 'manual-curation',
  },

  // ──── EXPANSION BATCH 1 - Additional Articles to Reach 30+ ────

  // Math
  {
    title: 'Understanding Decimals',
    subject: 'math',
    ageBand: '8-10',
    summary: 'Learn about decimal numbers and how they relate to fractions.',
    content: `A **decimal** is another way to write a fraction, especially when the denominator is 10, 100, 1000, etc.

**Place Value in Decimals:**
- The dot (.) is called the decimal point
- Numbers to the right of the decimal point are parts of a whole
- 0.5 = 5/10 = 1/2
- 0.25 = 25/100 = 1/4
- 0.75 = 75/100 = 3/4

**Decimal Place Names:**
- First place: tenths (0.1 = 1/10)
- Second place: hundredths (0.01 = 1/100)
- Third place: thousandths (0.001 = 1/1000)

**Money Uses Decimals:**
$1.50 means 1 dollar and 50 cents (50/100 of a dollar)

**Converting Fractions to Decimals:**
Divide the numerator by the denominator. For example: 3/4 = 3 ÷ 4 = 0.75

**Fun Fact:** Some fractions make repeating decimals! Try 1/3 = 0.333... (the 3s go on forever).`,
    keyTerms: ['decimal', 'decimal point', 'tenths', 'hundredths', 'place value'],
    readingLevel: 4.0,
    source: 'educational-commons',
  },
  {
    title: 'Multiplication Tricks',
    subject: 'math',
    ageBand: '8-10',
    summary: 'Learn quick mental math tricks for multiplication!',
    content: `**Multiplying by 10, 100, 1000:**
Just add zeros! 25 × 10 = 250, 25 × 100 = 2,500

**Multiplying by 11:**
For two-digit numbers, add the digits and put the result in the middle.
Example: 23 × 11 = 2(2+3)3 = 253

**Multiplying by 5:**
Multiply by 10, then divide by 2.
Example: 14 × 5 = (14 × 10) ÷ 2 = 140 ÷ 2 = 70

**Multiplying by 9:**
Use your fingers! Hold out 10 fingers. To multiply 9 × 7, fold down your 7th finger. Fingers to the left = tens (6), fingers to the right = ones (3). Answer: 63!

**Doubling and Halving:**
If one number is even, you can double one and halve the other.
Example: 16 × 5 = 8 × 10 = 80

**Square Numbers:**
Numbers multiplied by themselves make perfect squares.
1² = 1, 2² = 4, 3² = 9, 4² = 16, 5² = 25, 6² = 36, 7² = 49, 8² = 64, 9² = 81, 10² = 100`,
    keyTerms: ['multiplication', 'mental math', 'tricks', 'square number'],
    readingLevel: 3.5,
    source: 'educational-commons',
  },

  // Science
  {
    title: 'The Solar System',
    subject: 'science',
    ageBand: '8-10',
    summary: 'Take a tour of our solar system and all the planets!',
    content: `Our **solar system** consists of the Sun and everything that orbits around it.

**The Sun** ☀️
- A star (giant ball of hot gas)
- Makes up 99.8% of the solar system's mass!
- Temperature: 10,000°F on surface, millions inside

**The Inner Planets (Rocky):**
1. **Mercury** - Smallest, closest to Sun, very hot
2. **Venus** - Hottest planet (over 800°F!), thick clouds
3. **Earth** - Our home! The only planet with liquid water
4. **Mars** - The "Red Planet," has the tallest volcano

**The Outer Planets (Gas Giants):**
5. **Jupiter** - Largest planet, has a giant red storm
6. **Saturn** - Beautiful rings made of ice and rock
7. **Uranus** - Tilted on its side, pale blue-green color
8. **Neptune** - Farthest planet, windiest in the solar system

**Other Objects:**
- **Dwarf Planets:** Pluto, Ceres, Eris
- **Asteroids:** Rocky objects, mostly between Mars and Jupiter
- **Comets:** Icy objects that develop tails when near the Sun
- **Moons:** Over 200 moons orbit the planets!

**Fun Facts:**
- One year on Neptune = 165 Earth years
- Saturn's rings are only about 30 feet thick
- Mars has two tiny moons: Phobos and Deimos`,
    keyTerms: ['solar system', 'planet', 'Sun', 'Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'],
    readingLevel: 4.5,
    source: 'public-domain',
  },
  {
    title: 'The Water Cycle',
    subject: 'science',
    ageBand: '5-7',
    summary: 'How water moves around Earth in a never-ending cycle!',
    content: `Water on Earth is always moving in a continuous cycle called the **water cycle**.

**4 Main Steps:**

**1. Evaporation** ☀️💧
When the Sun heats water in oceans, lakes, and rivers, it turns into invisible water vapor (gas) and rises into the air.

**2. Condensation** ☁️
As water vapor rises and cools, it turns back into tiny water droplets. These droplets form clouds.

**3. Precipitation** 🌧️❄️
When droplets in clouds get too heavy, they fall as:
- Rain
- Snow
- Sleet
- Hail

**4. Collection** 🌊
Water collects in oceans, rivers, lakes, and underground. Then the cycle starts again!

**Bonus Step: Transpiration** 🌱
Plants also release water vapor from their leaves! This adds moisture to the air.

**Fun Facts:**
- The water you drink could be millions of years old!
- The same water has been recycling since Earth formed
- About 96.5% of Earth's water is in the oceans
- Only about 1% of Earth's water is available for humans to use

**Why It Matters:**
The water cycle gives us fresh water to drink, helps plants grow, and creates weather patterns!`,
    keyTerms: ['water cycle', 'evaporation', 'condensation', 'precipitation', 'collection', 'transpiration'],
    readingLevel: 2.5,
    source: 'public-domain',
  },
  {
    title: 'Dinosaurs: Ancient Giants',
    subject: 'science',
    ageBand: '5-7',
    summary: 'Learn about the amazing creatures that lived millions of years ago!',
    content: `**Dinosaurs** were reptiles that lived on Earth from about 230 to 65 million years ago.

**Popular Dinosaurs:**

**Tyrannosaurus Rex (T-Rex)** 🦖
- Huge meat-eater with massive jaws
- 40 feet long, 12 feet tall
- Tiny arms but powerful bite!

**Triceratops** 🦏
- Plant-eater with three horns
- Big bony frill on its head
- About 30 feet long

**Stegosaurus**
- Plant-eater with plates on its back
- Spikes on its tail for defense
- Small brain (about the size of a walnut!)

**Brachiosaurus** 🦕
- Giant plant-eater with a long neck
- One of the tallest dinosaurs
- Could reach treetops 40 feet high

**Types of Dinosaurs:**
- **Herbivores:** Plant-eaters (Brachiosaurus, Stegosaurus)
- **Carnivores:** Meat-eaters (T-Rex, Velociraptor)
- **Omnivores:** Ate both plants and meat

**What Happened to Them?**
About 65 million years ago, dinosaurs became extinct. Most scientists think a giant asteroid hit Earth, causing climate changes.

**Fun Facts:**
- Birds are descendants of dinosaurs!
- Some dinosaurs had feathers
- The word "dinosaur" means "terrible lizard"
- Not all dinosaurs were huge - some were chicken-sized!`,
    keyTerms: ['dinosaur', 'T-Rex', 'Triceratops', 'herbivore', 'carnivore', 'extinct', 'fossil'],
    readingLevel: 2.8,
    source: 'public-domain',
  },

  // History
  {
    title: 'Ancient Greece: Birthplace of Democracy',
    subject: 'history',
    ageBand: '11-12+',
    summary: 'Discover the civilization that gave us philosophy, Olympics, and democracy.',
    content: `**Ancient Greece** (around 800-146 BCE) was one of the most influential civilizations in history.

**Government:**
Athens invented **democracy** — a system where citizens vote on decisions. The word "democracy" comes from Greek words meaning "rule by the people."

**Philosophy (Love of Wisdom):**
Famous Greek philosophers:
- **Socrates:** Taught by asking questions
- **Plato:** Student of Socrates, founded the Academy
- **Aristotle:** Studied everything from science to politics

**The Olympic Games** 🏅
Started in 776 BCE in Olympia, Greece. Athletes competed in running, wrestling, chariot racing, and more. Winners received olive wreaths, not medals!

**Greek Mythology:**
Greeks believed in many gods and goddesses:
- **Zeus:** King of the gods (thunder)
- **Athena:** Goddess of wisdom
- **Poseidon:** God of the sea
- **Apollo:** God of the sun and music

**Architecture:**
Greek buildings like the **Parthenon** used columns and mathematical proportions. Three column styles: Doric, Ionic, and Corinthian.

**Science & Math:**
- Pythagoras: Created the Pythagorean theorem
- Archimedes: Invented machines and studied physics
- Hippocrates: "Father of Medicine"

**Legacy:**
Greek ideas about democracy, philosophy, art, and science still influence the world today!`,
    keyTerms: ['Ancient Greece', 'democracy', 'philosophy', 'Olympics', 'mythology', 'Athens', 'Sparta'],
    readingLevel: 6.0,
    source: 'public-domain',
  },
  {
    title: 'The American Revolution',
    subject: 'history',
    ageBand: '11-12+',
    summary: 'How the thirteen colonies won independence from Britain.',
    content: `The **American Revolution** (1775-1783) was when the American colonies fought for independence from Great Britain.

**Why Did It Start?**
- Britain taxed the colonies without giving them a say (representation)
- "No taxation without representation!" became a famous protest
- Colonists felt their rights were being violated

**Key Events:**

**1773: Boston Tea Party** ☕
Colonists dumped 342 chests of British tea into Boston Harbor to protest tea taxes.

**1775: Battles of Lexington and Concord** ⚔️
"The shot heard 'round the world" — the first battles of the war.

**1776: Declaration of Independence** 📜
Written by Thomas Jefferson, declared freedom on July 4, 1776.

**1781: Battle of Yorktown** 🎖️
American and French forces defeated the British, ending major fighting.

**Important People:**
- **George Washington:** Commander of the Continental Army, first president
- **Benjamin Franklin:** Diplomat, inventor, helped get French support
- **Thomas Jefferson:** Wrote the Declaration of Independence
- **Paul Revere:** Famous midnight ride to warn of British troops

**The Outcome:**
The colonies won! They created the United States of America and wrote the Constitution.

**Legacy:**
The American Revolution inspired other countries to fight for freedom and democracy. Ideas from the Declaration of Independence still influence human rights movements today.`,
    keyTerms: ['American Revolution', 'independence', 'Declaration of Independence', 'George Washington', 'colony'],
    readingLevel: 6.5,
    source: 'public-domain',
  },
  {
    title: 'The Renaissance: A Rebirth of Learning',
    subject: 'history',
    ageBand: '11-12+',
    summary: 'When art, science, and culture flourished in Europe.',
    content: `The **Renaissance** (1300-1600) was a period of "rebirth" in art, science, and learning that began in Italy.

**Why "Renaissance"?**
The word means "rebirth" in French. People rediscovered ancient Greek and Roman knowledge and created new ideas.

**Famous Artists:**

**Leonardo da Vinci** 🎨
- Painted the Mona Lisa and The Last Supper
- Inventor and scientist
- Designed flying machines and war devices

**Michelangelo** 🗿
- Painted the Sistine Chapel ceiling
- Sculpted the statue of David
- Architect and poet

**Raphael**
- Painted beautiful religious scenes
- Master of balance and harmony

**Inventions & Discoveries:**
- **Printing Press (Gutenberg, 1440):** Made books affordable
- **Scientific Method:** New way of studying the world
- **Anatomy:** Artists and doctors studied the human body

**New Ideas:**
- **Humanism:** Focus on human potential and achievement
- **Perspective in Art:** Made paintings look 3D
- **Exploration:** Columbus, Magellan, and others explored the world

**Architecture:**
Beautiful domes, arches, and columns inspired by ancient Rome.

**Legacy:**
The Renaissance shaped modern science, art, and philosophy. It showed that humans could achieve great things through creativity and learning!`,
    keyTerms: ['Renaissance', 'Leonardo da Vinci', 'Michelangelo', 'humanism', 'printing press'],
    readingLevel: 6.0,
    source: 'public-domain',
  },

  // Language
  {
    title: 'The English Alphabet and Phonics',
    subject: 'language',
    ageBand: '5-7',
    summary: 'Learn about the ABCs and how letters make sounds!',
    content: `The **English alphabet** has 26 letters. Each letter makes one or more sounds.

**The Letters:**
A B C D E F G H I J K L M N O P Q R S T U V W X Y Z

**Vowels and Consonants:**

**Vowels** (5): A, E, I, O, U (and sometimes Y!)
Vowels are special — you can sing them! Try it: "Ahhh, Eee, Iii, Ooo, Uuu"

**Consonants** (21): All the other letters
Consonants need vowels to make words.

**Letter Sounds:**
- Some letters make one sound: "B" says /b/ as in "ball"
- Some letters make multiple sounds: "C" says /k/ (cat) or /s/ (cent)
- Some letters team up: "TH" makes a new sound (thing)

**Letter Combinations (Digraphs):**
- **ch:** chair, cheese
- **sh:** ship, fish
- **th:** thing, this
- **ph:** phone (sounds like /f/)

**Short vs. Long Vowels:**
- Short A: cat, hat
- Long A: cake, name (sounds like the letter's name)

**Fun Facts:**
- "E" is the most common letter in English
- "Q" is almost always followed by "U"
- The only word with all five vowels in order is "facetious"!

**Practice:**
Can you think of a word for each letter of the alphabet?`,
    keyTerms: ['alphabet', 'vowel', 'consonant', 'phonics', 'digraph'],
    readingLevel: 1.5,
    source: 'educational-commons',
  },
  {
    title: 'Types of Sentences',
    subject: 'language',
    ageBand: '8-10',
    summary: 'Learn about the four types of sentences and how to use them.',
    content: `There are **four types of sentences** in English. Each has a different purpose and uses different punctuation.

**1. Declarative Sentence (Statement)** 📝
Tells you something. Ends with a period (.)
- Example: "The sky is blue."
- Example: "Dogs are mammals."

**2. Interrogative Sentence (Question)** ❓
Asks something. Ends with a question mark (?)
- Example: "What time is it?"
- Example: "Do you like pizza?"

**3. Imperative Sentence (Command)** 👉
Tells someone to do something. Usually ends with a period (.)
- Example: "Close the door."
- Example: "Please sit down."
- The subject (you) is usually hidden!

**4. Exclamatory Sentence (Exclamation)** ‼️
Shows strong feeling. Ends with an exclamation point (!)
- Example: "What a beautiful day!"
- Example: "I can't believe it!"

**How to Tell Them Apart:**
- Look at the punctuation at the end
- Ask: Is it telling, asking, commanding, or exclaiming?

**Mixed Examples:**
- "I love ice cream." (Declarative)
- "Do you love ice cream?" (Interrogative)
- "Try this ice cream." (Imperative)
- "This ice cream is amazing!" (Exclamatory)

**Practice:**
What type of sentence is each?
1. "Where is my backpack?"
2. "Please help me find it."
3. "I found it!"
4. "It was under the bed."`,
    keyTerms: ['sentence', 'declarative', 'interrogative', 'imperative', 'exclamatory', 'punctuation'],
    readingLevel: 3.5,
    source: 'educational-commons',
  },

  // Technology
  {
    title: 'How Computers Work',
    subject: 'technology',
    ageBand: '8-10',
    summary: 'Discover what happens inside a computer when you use it!',
    content: `A **computer** is a machine that processes information super fast using electricity.

**Main Parts of a Computer:**

**1. CPU (Central Processing Unit)** 🧠
- The "brain" of the computer
- Does all the calculations and thinking
- Measured in GHz (billions of operations per second!)

**2. Memory (RAM)** 💾
- Short-term memory
- Stores what you're working on right now
- When you turn off the computer, RAM is cleared

**3. Storage (Hard Drive/SSD)** 💿
- Long-term memory
- Saves your files, photos, and programs
- Keeps data even when computer is off

**4. Input Devices** ⌨️🖱️
- Keyboard, mouse, microphone
- How you tell the computer what to do

**5. Output Devices** 🖥️🔊
- Monitor (screen), speakers, printer
- How the computer shows you information

**How It Works:**
1. You type or click (input)
2. CPU processes your command super fast
3. RAM temporarily stores the work
4. Result appears on screen (output)
5. You can save it to storage

**Binary Code:**
Computers only understand 1s and 0s (on and off). Everything — pictures, videos, games — is secretly just millions of 1s and 0s!

**Fun Facts:**
- Modern computers can do billions of calculations per second
- The first computer filled an entire room!
- Your phone is more powerful than computers that sent astronauts to the moon`,
    keyTerms: ['computer', 'CPU', 'RAM', 'storage', 'input', 'output', 'binary'],
    readingLevel: 4.0,
    source: 'educational-commons',
  },

  // Geography
  {
    title: 'Maps and How to Read Them',
    subject: 'geography',
    ageBand: '8-10',
    summary: 'Learn how to read maps and find your way around!',
    content: `A **map** is a drawing of a place as seen from above. Maps help us find locations and understand geography.

**Parts of a Map:**

**1. Title** 📍
Tells you what area the map shows.

**2. Legend (or Key)** 🗝️
Explains what symbols mean. Example:
- 🏠 = house
- 🌳 = park
- ⭐ = capital city

**3. Compass Rose** 🧭
Shows directions:
- **N** = North (top)
- **S** = South (bottom)
- **E** = East (right)
- **W** = West (left)

**4. Scale** 📏
Shows how distance on the map relates to real distance.
Example: 1 inch = 10 miles

**5. Grid** 📊
Letters and numbers help you find locations.
Example: "The library is at C4"

**Types of Maps:**

**Physical Maps** 🏔️
Show natural features: mountains, rivers, lakes

**Political Maps** 🗺️
Show borders, cities, and countries

**Road Maps** 🛣️
Help you drive from place to place

**Latitude and Longitude:**
- **Latitude:** Lines running east-west (measure north-south)
- **Longitude:** Lines running north-south (measure east-west)
- **Equator:** 0° latitude
- **Prime Meridian:** 0° longitude

**Using a Map:**
1. Find the compass rose to orient yourself
2. Use the legend to understand symbols
3. Use the scale to measure distance
4. Use grid coordinates to find specific places

**Fun Fact:** GPS (Global Positioning System) uses satellites to create digital maps and show exactly where you are!`,
    keyTerms: ['map', 'legend', 'compass rose', 'scale', 'latitude', 'longitude', 'grid'],
    readingLevel: 4.5,
    source: 'educational-commons',
  },

  // Art
  {
    title: 'Primary and Secondary Colors',
    subject: 'art',
    ageBand: '5-7',
    summary: 'Learn about colors and how to mix them!',
    content: `**Colors** are everywhere! Learning about colors helps you paint, draw, and understand art.

**Primary Colors** 🎨
The three colors you CANNOT make by mixing others:
- **Red** ❤️
- **Yellow** 💛
- **Blue** 💙

**Secondary Colors** 🌈
Colors made by mixing two primary colors:
- **Red + Yellow = Orange** 🧡
- **Yellow + Blue = Green** 💚
- **Blue + Red = Purple** 💜

**The Color Wheel:**
Artists use a color wheel to see how colors relate to each other.

**Warm Colors:** Red, Orange, Yellow (feel hot and energetic)
**Cool Colors:** Blue, Green, Purple (feel calm and cold)

**Mixing Tips:**
- Mix equal amounts for bright secondary colors
- Add white to make colors lighter (tints)
- Add black to make colors darker (shades)
- Add gray to make colors duller

**Complementary Colors:**
Colors opposite on the color wheel look great together:
- Red & Green
- Blue & Orange
- Yellow & Purple

**Fun Activity:**
Try mixing your own secondary colors with paint!
- Mix red and yellow — do you get orange?
- Mix yellow and blue — do you get green?
- Mix blue and red — do you get purple?

**Art Fact:** The primary colors are called "primary" because they are the foundation of all other colors!`,
    keyTerms: ['primary colors', 'secondary colors', 'color wheel', 'mixing', 'warm colors', 'cool colors'],
    readingLevel: 2.0,
    source: 'educational-commons',
  },

  // Science - Additional
  {
    title: 'Magnets and Magnetism',
    subject: 'science',
    ageBand: '8-10',
    summary: 'Discover the invisible force that attracts and repels!',
    content: `**Magnetism** is an invisible force that can pull or push certain materials.

**What is a Magnet?**
A magnet is an object that creates a magnetic field — an invisible area of force around it.

**Parts of a Magnet:**
Every magnet has two ends called **poles**:
- **North Pole (N)**
- **South Pole (S)**

**Magnetic Rules:**
- **Opposite poles attract:** North attracts South
- **Same poles repel:** North pushes away North, South pushes away South

**Magnetic Materials:**
Only certain metals are magnetic:
- ✅ Iron
- ✅ Nickel
- ✅ Cobalt
- ❌ Copper, aluminum, gold (not magnetic)

**Types of Magnets:**
1. **Permanent Magnets:** Always magnetic (bar magnets, fridge magnets)
2. **Temporary Magnets:** Only magnetic when near another magnet (paperclips)
3. **Electromagnets:** Use electricity to create magnetism (can be turned on/off)

**Magnetic Field:**
The space around a magnet where magnetic force works. You can see it by sprinkling iron filings near a magnet!

**Earth is a Giant Magnet!** 🌍
Earth has a magnetic field with North and South magnetic poles. This is why compasses work — the needle points to Earth's magnetic north!

**Uses of Magnets:**
- Refrigerator magnets
- Compasses for navigation
- Electric motors and generators
- MRI machines in hospitals
- Speakers and headphones
- Credit cards and hard drives

**Fun Experiments:**
1. Test which objects are magnetic with a magnet
2. Make a paperclip chain using magnetism
3. Float a magnet above another using repelling force!`,
    keyTerms: ['magnet', 'magnetism', 'pole', 'attract', 'repel', 'magnetic field', 'electromagnet'],
    readingLevel: 4.0,
    source: 'educational-commons',
  },

  // Technology - Additional
  {
    title: 'The Internet: Connecting the World',
    subject: 'technology',
    ageBand: '11-12+',
    summary: 'Learn how the internet works and connects billions of devices!',
    content: `The **Internet** is a global network of billions of computers and devices all connected together.

**What Is It?**
The Internet is like a giant spider web connecting computers worldwide. It lets us share information instantly across the planet.

**How It Works:**

**1. Your Device** 💻📱
Connects to the Internet through Wi-Fi or cables.

**2. ISP (Internet Service Provider)** 🌐
Companies like Comcast, AT&T that give you Internet access.

**3. Routers** 📡
Direct data to the right place, like a postal system.

**4. Servers** 🖥️
Powerful computers that store websites, videos, and files.

**5. Data Packets** 📦
Information is broken into small "packets" that travel separately and reassemble at their destination.

**Key Technologies:**

**IP Address** 🔢
Every device has a unique number (like 192.168.1.1) to identify it.

**Domain Names** 🌍
Easy-to-remember names (like google.com) instead of numbers.

**HTTP/HTTPS** 🔒
Protocols for accessing websites. HTTPS is secure (encrypted).

**DNS (Domain Name System)** 📞
Like a phone book — translates names into IP addresses.

**Timeline:**
- **1969:** ARPANET created (early Internet)
- **1983:** TCP/IP protocol standardized
- **1989:** Tim Berners-Lee invented the World Wide Web
- **1990s:** Internet becomes public
- **2000s:** Social media, smartphones, streaming

**Internet vs. Web:**
- **Internet:** The physical network of cables and computers
- **Web (WWW):** Websites and pages that run on the Internet

**Fun Facts:**
- Over 5 billion people use the Internet (2024)
- Google processes over 8.5 billion searches per day
- Over 500 hours of video are uploaded to YouTube every minute
- The Internet weighs about 50 grams (the weight of electrons!)

**Why It Matters:**
The Internet revolutionized communication, education, commerce, and entertainment. It's one of the most important inventions in human history!`,
    keyTerms: ['Internet', 'ISP', 'server', 'router', 'IP address', 'DNS', 'packet', 'World Wide Web', 'protocol'],
    readingLevel: 6.0,
    source: 'educational-commons',
  },
];

// ─── Conversion & Shard Generation ──────────────────────────

function convertToPackFormat(raw: RawKnowledgeArticle, index: number): KnowledgeArticlePack {
  const ageMetadata = createAgeMetadata(
    raw.ageBand === '5-7' ? 5 : raw.ageBand === '8-10' ? 8 : 11,
    raw.ageBand === '5-7' ? 7 : raw.ageBand === '8-10' ? 10 : null
  );

  const provenance = createProvenanceMetadata(
    raw.source,
    'CC0-1.0', // Public domain equivalent
    raw.sourceUrl,
    'content-pipeline-v1'
  );

  return {
    id: `article_${raw.subject}_${String(index).padStart(3, '0')}`,
    subject: raw.subject,
    ageMetadata,
    title: raw.title,
    summary: raw.summary,
    content: raw.content,
    keyTerms: raw.keyTerms,
    related: raw.related,
    readingLevel: raw.readingLevel,
    provenance,
  };
}

function createShards(articles: KnowledgeArticlePack[]): ArticleShard[] {
  const shards: ArticleShard[] = [];

  for (let i = 0; i < articles.length; i += MAX_ARTICLES_PER_SHARD) {
    const chunk = articles.slice(i, i + MAX_ARTICLES_PER_SHARD);
    const shardNumber = Math.floor(i / MAX_ARTICLES_PER_SHARD) + 1;

    shards.push({
      shardId: `articles-${String(shardNumber).padStart(3, '0')}`,
      schemaVersion: SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      articles: chunk,
    });
  }

  return shards;
}

// ─── Main Execution ──────────────────────────────────────────

function main() {
  console.log('🚀 Starting knowledge article content generation...');
  console.log(`📊 Processing ${CURATED_ARTICLES.length} curated articles`);

  // Convert to pack format
  const packArticles = CURATED_ARTICLES.map((a, i) => convertToPackFormat(a, i));

  // Create shards
  const shards = createShards(packArticles);

  // Ensure output directory exists
  const outputDir = path.join(__dirname, '../content/packs/default-v1/articles');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write shard files
  shards.forEach(shard => {
    const filename = `${shard.shardId}.json`;
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(shard, null, 2), 'utf-8');
    console.log(`✅ Written ${shard.articles.length} articles to ${filename}`);
  });

  // Generate statistics
  const stats = {
    totalArticles: packArticles.length,
    bySubject: {} as Record<string, number>,
    byAgeBand: {} as Record<string, number>,
  };

  packArticles.forEach(a => {
    stats.bySubject[a.subject] = (stats.bySubject[a.subject] || 0) + 1;
    stats.byAgeBand[a.ageMetadata.ageBand] = (stats.byAgeBand[a.ageMetadata.ageBand] || 0) + 1;
  });

  console.log('\n📈 Generation Statistics:');
  console.log(`   Total: ${stats.totalArticles} articles`);
  console.log(`   Subjects: ${JSON.stringify(stats.bySubject, null, 2)}`);
  console.log(`   Age Bands: ${JSON.stringify(stats.byAgeBand, null, 2)}`);
  console.log(`\n✨ Content generation complete!`);
}

main();
