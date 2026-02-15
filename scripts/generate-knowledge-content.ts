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
