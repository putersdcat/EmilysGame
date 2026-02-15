/**
 * config/knowledge.config.ts - Book of Knowledge content library.
 * Subject definitions, sample articles, and word bag configuration.
 * TODO: DOC - knowledge content format and expansion guide
 */

// ─── Subjects ────────────────────────────────────────────────

export type SubjectId = 'math' | 'science' | 'history' | 'language' | 'technology' | 'geography' | 'art';

export interface SubjectDef {
  id: SubjectId;
  name: string;
  icon: string;
  color: string;
  description: string;
}

export const SUBJECTS: SubjectDef[] = [
  { id: 'math',       name: 'Mathematics',  icon: '🔢', color: '#4fc3f7', description: 'Numbers, shapes, and puzzles' },
  { id: 'science',    name: 'Science',      icon: '🔬', color: '#81c784', description: 'How the world works' },
  { id: 'history',    name: 'History',       icon: '🏛️', color: '#ffb74d', description: 'Stories from the past' },
  { id: 'language',   name: 'Language',      icon: '📖', color: '#ce93d8', description: 'Words and communication' },
  { id: 'technology', name: 'Technology',    icon: '💻', color: '#90a4ae', description: 'Computers and inventions' },
  { id: 'geography',  name: 'Geography',     icon: '🌍', color: '#66bb6a', description: 'Places and the natural world' },
  { id: 'art',        name: 'Art',           icon: '🎨', color: '#ef5350', description: 'Creativity and expression' },
];

// ─── Articles ────────────────────────────────────────────────

export interface KnowledgeArticle {
  id: string;
  subject: SubjectId;
  title: string;
  summary: string;
  content: string;
  /** Key terms that can be saved to Word Bag */
  keyTerms: string[];
  /** Related article ids */
  related?: string[];
}

export const KNOWLEDGE_ARTICLES: KnowledgeArticle[] = [
  // ── Math ──
  {
    id: 'math_fractions',
    subject: 'math',
    title: 'Fractions',
    summary: 'Parts of a whole — like slicing a pizza!',
    content: `A fraction represents a part of something whole. When you cut a pizza into 4 equal slices and eat 1, you've eaten 1/4 (one quarter) of the pizza.\n\nThe top number is called the **numerator** — it tells you how many parts you have. The bottom number is the **denominator** — it tells you how many equal parts the whole is divided into.\n\nFun fact: The word "fraction" comes from the Latin word "fractio" which means "to break"! So fractions are literally about breaking things into pieces.`,
    keyTerms: ['numerator', 'denominator', 'fraction', 'quarter'],
  },
  {
    id: 'math_geometry',
    subject: 'math',
    title: 'Geometry Basics',
    summary: 'The study of shapes, angles, and spaces.',
    content: `Geometry is all about shapes! The simplest shape is a **triangle** — it has 3 sides and its angles always add up to 180°.\n\nA **square** has 4 equal sides and 4 right angles (90° each). A **circle** has no corners at all — every point on its edge is the same distance from the center.\n\nThe distance around a shape is called its **perimeter**. The space inside a shape is called its **area**. For a rectangle, area = length × width.\n\nGeometry is used everywhere — from building houses to designing video games like this one!`,
    keyTerms: ['triangle', 'perimeter', 'area', 'geometry', 'right angle'],
    related: ['math_fractions'],
  },
  {
    id: 'math_prime',
    subject: 'math',
    title: 'Prime Numbers',
    summary: 'Special numbers that can only be divided by 1 and themselves.',
    content: `A prime number is a number greater than 1 that can only be divided evenly by 1 and itself. The first few primes are: 2, 3, 5, 7, 11, 13, 17, 19, 23...\n\nNotice that 2 is the only even prime number! Every other even number can be divided by 2, so they're not prime.\n\nPrime numbers are like the "atoms" of math — every whole number can be built by multiplying primes together. This is called **prime factorization**. For example: 12 = 2 × 2 × 3.\n\nMathematicians have been studying primes for over 2,000 years, and there are still unsolved mysteries about them!`,
    keyTerms: ['prime number', 'prime factorization', 'even number', 'divisible'],
  },

  // ── Science ──
  {
    id: 'sci_atoms',
    subject: 'science',
    title: 'Atoms & Elements',
    summary: 'The tiny building blocks of everything around you.',
    content: `Everything you can see, touch, or smell is made of incredibly tiny particles called **atoms**. They're so small that millions of them could fit on the period at the end of this sentence.\n\nAn atom has three parts: **protons** (positive charge) and **neutrons** (no charge) in the center called the **nucleus**, and **electrons** (negative charge) zooming around the outside.\n\nWhen you have a bunch of atoms that are all the same type, that's called an **element**. Gold, oxygen, and carbon are all elements. Scientists organize all the elements in a chart called the **Periodic Table**.`,
    keyTerms: ['atom', 'proton', 'neutron', 'electron', 'nucleus', 'element', 'periodic table'],
  },
  {
    id: 'sci_photosynthesis',
    subject: 'science',
    title: 'Photosynthesis',
    summary: 'How plants make their own food using sunlight.',
    content: `Plants are amazing — they can make their own food! This process is called **photosynthesis**.\n\nHere's how it works: Plants absorb sunlight through a green substance called **chlorophyll** in their leaves. They also take in water through their roots and carbon dioxide from the air.\n\nThe plant uses the sun's energy to combine water and CO₂ into **glucose** (sugar for energy) and releases **oxygen** as a bonus. That oxygen is what we breathe!\n\nSo next time you see a tree, remember: it's basically a food factory powered by the sun. 🌳☀️`,
    keyTerms: ['photosynthesis', 'chlorophyll', 'glucose', 'carbon dioxide', 'oxygen'],
    related: ['sci_atoms'],
  },
  {
    id: 'sci_gravity',
    subject: 'science',
    title: 'Gravity',
    summary: 'The invisible force that keeps your feet on the ground.',
    content: `**Gravity** is a force that pulls objects toward each other. The bigger an object is, the stronger its gravity. Earth is really big, so it pulls everything toward its center — that's why we don't float away!\n\nSir Isaac Newton figured out the math of gravity around 1687 after (legend says) watching an apple fall from a tree.\n\nThe Moon's gravity is about 1/6th of Earth's, so if you weigh 60 kg on Earth, you'd only weigh about 10 kg on the Moon! You could jump 6 times higher.\n\nGravity also keeps the Moon orbiting Earth and Earth orbiting the Sun. Without gravity, everything would just float apart!`,
    keyTerms: ['gravity', 'force', 'mass', 'orbit', 'Newton'],
  },

  // ── History ──
  {
    id: 'hist_ancient_egypt',
    subject: 'history',
    title: 'Ancient Egypt',
    summary: 'Pharaohs, pyramids, and a civilization along the Nile.',
    content: `Ancient Egypt was one of the world's first great civilizations, lasting over 3,000 years! It grew along the **Nile River** in northeast Africa.\n\nThe Egyptians built the famous **pyramids** as tombs for their kings, called **pharaohs**. The Great Pyramid of Giza is made of about 2.3 million stone blocks!\n\nThey invented **hieroglyphics** — a writing system using pictures and symbols. They also developed papyrus (an early form of paper), advanced mathematics, and even performed surgery.\n\nFun fact: Ancient Egyptians loved cats so much that harming one was against the law! 🐱`,
    keyTerms: ['pharaoh', 'pyramid', 'hieroglyphics', 'Nile River', 'papyrus'],
  },
  {
    id: 'hist_medieval',
    subject: 'history',
    title: 'The Middle Ages',
    summary: 'Knights, castles, and life in medieval Europe.',
    content: `The Middle Ages (about 500-1500 AD) is the period between the fall of the Roman Empire and the Renaissance.\n\n**Knights** were mounted warriors who followed a code of honor called **chivalry**. They wore heavy armor and lived in or protected **castles** — fortified buildings with thick walls, towers, and sometimes moats.\n\nMost people were **peasants** who farmed the land. This system was called **feudalism** — kings gave land to lords, who gave land to knights, who protected the peasants.\n\nFun fact: Castles usually had a toilet called a "garderobe" — just a hole in the wall over a drop! 🏰`,
    keyTerms: ['knight', 'chivalry', 'feudalism', 'castle', 'peasant', 'medieval'],
  },
  {
    id: 'hist_space_race',
    subject: 'history',
    title: 'The Space Race',
    summary: 'How humans first reached the Moon.',
    content: `The **Space Race** was a competition between the USA and Soviet Union to explore space. It started in the 1950s and reached its climax in 1969.\n\nThe Soviets went first — they launched **Sputnik**, the first satellite, in 1957. Then in 1961, **Yuri Gagarin** became the first human in space!\n\nThe USA responded with the **Apollo program**. On July 20, 1969, **Neil Armstrong** became the first person to walk on the Moon, saying: "That's one small step for man, one giant leap for mankind."\n\nThe Space Race led to incredible inventions we still use today, including memory foam, scratch-resistant lenses, and water filters! 🚀`,
    keyTerms: ['Sputnik', 'Apollo', 'Neil Armstrong', 'Yuri Gagarin', 'satellite', 'orbit'],
    related: ['sci_gravity'],
  },

  // ── Language ──
  {
    id: 'lang_parts_of_speech',
    subject: 'language',
    title: 'Parts of Speech',
    summary: 'The building blocks of every sentence.',
    content: `Every word in a sentence has a job. These jobs are called **parts of speech**.\n\n**Nouns** are naming words (dog, happiness, London). **Verbs** are action words (run, think, is). **Adjectives** describe nouns (big, blue, happy). **Adverbs** describe verbs (quickly, very, yesterday).\n\n**Pronouns** replace nouns (he, she, they). **Prepositions** show position or direction (in, on, under). **Conjunctions** join things together (and, but, because).\n\nHere's a trick: In the sentence "The quick fox jumps over the lazy dog," every part of speech is represented! Can you spot them all?`,
    keyTerms: ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction'],
  },
  {
    id: 'lang_etymology',
    subject: 'language',
    title: 'Word Origins',
    summary: 'Where do English words come from?',
    content: `**Etymology** is the study of where words come from. English is like a big mixing bowl of languages!\n\nAbout 29% of English words come from **Latin** (like "animal" from "animalis"). Another 29% come from **French** (like "menu" and "chef"). About 26% come from **Germanic** languages (like "house" and "water").\n\nSome fun word origins:\n• "Robot" comes from Czech "robota" meaning forced labor\n• "Ketchup" may come from Chinese "kê-tsiap" (fish sauce!)\n• "Salary" comes from Latin "salarium" — Roman soldiers were partly paid in salt!\n\nKnowing word origins can help you guess the meaning of new words. 📚`,
    keyTerms: ['etymology', 'Latin', 'Germanic', 'origin'],
  },
  {
    id: 'lang_idioms',
    subject: 'language',
    title: 'Idioms & Expressions',
    summary: 'Phrases that mean something different from their literal words.',
    content: `An **idiom** is a phrase where the words together mean something different from what each word means alone.\n\n"It's raining cats and dogs" doesn't mean animals are falling from the sky — it means it's raining very hard!\n\nHere are some common idioms:\n• **"Break a leg"** = Good luck (used in theater)\n• **"Piece of cake"** = Something very easy\n• **"Hit the nail on the head"** = To be exactly right\n• **"Spill the beans"** = To reveal a secret\n• **"Under the weather"** = Feeling sick\n\nEvery language has its own idioms. In German, "Ich verstehe nur Bahnhof" (I only understand train station) means "I don't understand anything!" 🎭`,
    keyTerms: ['idiom', 'expression', 'literal', 'figurative'],
  },

  // ── Technology ──
  {
    id: 'tech_binary',
    subject: 'technology',
    title: 'Binary Code',
    summary: 'The language of computers — just 1s and 0s!',
    content: `Computers only understand two things: **on** and **off**, represented as **1** and **0**. This system is called **binary**.\n\nEvery number, letter, image, and sound on a computer is stored as a series of 1s and 0s called **bits**. Eight bits together make a **byte**.\n\nIn binary: the number 5 is written as 101, and the number 10 is written as 1010. The letter "A" is stored as 01000001.\n\nYour computer processes billions of these tiny on/off switches every second! The switches are called **transistors**, and modern chips have billions of them, each smaller than a virus.\n\nThis game you're playing right now? It's all 1s and 0s behind the scenes! 💾`,
    keyTerms: ['binary', 'bit', 'byte', 'transistor'],
  },
  {
    id: 'tech_internet',
    subject: 'technology',
    title: 'How the Internet Works',
    summary: 'A worldwide network connecting billions of devices.',
    content: `The **Internet** is a giant network of computers all connected together. When you visit a website, here's what happens:\n\n1. You type a web address (URL) in your browser\n2. Your computer asks a **DNS server** to find the website's address (like a phone book)\n3. Your request travels through cables, sometimes under the ocean, to a **server** — a powerful computer that stores the website\n4. The server sends the website data back to you as small **packets**\n5. Your browser puts the packets together and shows you the page!\n\nAll this happens in milliseconds. The Internet handles about 5 billion Google searches every single day! 🌐`,
    keyTerms: ['server', 'DNS', 'packet', 'URL', 'browser', 'network'],
  },
  {
    id: 'tech_algorithms',
    subject: 'technology',
    title: 'Algorithms',
    summary: 'Step-by-step instructions for solving problems.',
    content: `An **algorithm** is just a set of step-by-step instructions to solve a problem. You use algorithms every day!\n\nA recipe is an algorithm for cooking. Getting dressed follows an algorithm (socks before shoes!). Even brushing your teeth has steps.\n\nIn computing, algorithms help sort data, find the fastest route on a map, recommend videos you might like, and much more.\n\nOne famous algorithm is **binary search**: Imagine finding a name in a phone book. Instead of reading every page, you open to the middle — if your name comes before, search the first half; if after, search the second half. Repeat! This is WAY faster.\n\nThe game you're playing uses algorithms to generate the world around you! 🧮`,
    keyTerms: ['algorithm', 'binary search', 'sorting', 'computing'],
    related: ['tech_binary'],
  },
];

/** Get articles filtered by subject */
export function getArticles(subject?: SubjectId): KnowledgeArticle[] {
  if (!subject) return KNOWLEDGE_ARTICLES;
  return KNOWLEDGE_ARTICLES.filter(a => a.subject === subject);
}

/** Get a specific article by id */
export function getArticleById(id: string): KnowledgeArticle | undefined {
  return KNOWLEDGE_ARTICLES.find(a => a.id === id);
}

/** Search articles by title/content (simple case-insensitive match) */
export function searchArticles(query: string, subjects?: SubjectId[]): KnowledgeArticle[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return KNOWLEDGE_ARTICLES.filter(a => {
    if (subjects && subjects.length > 0 && !subjects.includes(a.subject)) return false;
    return a.title.toLowerCase().includes(q)
      || a.summary.toLowerCase().includes(q)
      || a.content.toLowerCase().includes(q)
      || a.keyTerms.some(t => t.toLowerCase().includes(q));
  });
}
