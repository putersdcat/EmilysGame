/**
 * config/npc.config.ts - NPC persona definitions and dialog templates.
 * Each NPC type has a persona prompt for LLM, greeting lines, and trade offers.
 */

export interface NpcPersona {
  id: string;
  assetKey: string;         // References ASSET_DEFS key
  displayName: string;
  /** System prompt sent to LLM for this NPC's personality */
  llmPersona: string;
  /** Fallback greetings if LLM unavailable (picked randomly) */
  greetings: string[];
  /** Fallback responses if LLM unavailable */
  fallbackResponses: string[];
  /** Items this NPC can trade (buy/sell) */
  trades: NpcTrade[];
  /** Can this NPC trigger quizzes? */
  canQuiz: boolean;
  /** Quiz difficulty preference */
  quizDifficulty: 'easy' | 'medium' | 'hard';
}

export interface NpcTrade {
  gives: string;      // Asset key of item given
  wants: string;      // Asset key of item wanted (or 'coin')
  cost: number;       // Amount if wants='coin'
  description: string;
}

export const NPC_PERSONAS: NpcPersona[] = [
  {
    id: 'merchant_default',
    assetKey: 'npc_merchant',
    displayName: 'Wandering Merchant',
    llmPersona: 'You are a quirky goblin merchant in a fantasy world. Speak in short, excited sentences. Use trade-related puns. Be helpful but mischievous.',
    greetings: [
      'Wares for sale! Shiny things, useful things!',
      'Ah, a customer! Come, come, see my goods!',
      'Buy something, yes? Good prices today!',
    ],
    fallbackResponses: [
      'Hmm, interesting... but have you seen my wares?',
      'A fine choice of words! Now, about that trade...',
      'Ha! You remind me of my cousin. Anyway, want to buy something?',
    ],
    trades: [
      { gives: 'key', wants: 'coin', cost: 15, description: 'Buy a key for 15 coins' },
      { gives: 'crowbar', wants: 'coin', cost: 20, description: 'Buy a crowbar for 20 coins' },
      { gives: 'potion', wants: 'coin', cost: 10, description: 'Buy a speed potion for 10 coins' },
    ],
    canQuiz: false,
    quizDifficulty: 'easy',
  },
  {
    id: 'villager_default',
    assetKey: 'npc_villager',
    displayName: 'Friendly Villager',
    llmPersona: 'You are a friendly villager in a fantasy adventure. Speak warmly. Give helpful hints about nearby treasures or dangers. Keep responses under 2 sentences.',
    greetings: [
      'Hello there, adventurer! Beautiful day, isn\'t it?',
      'Welcome! I heard there\'s treasure nearby...',
      'Oh, a visitor! Let me tell you about this area.',
    ],
    fallbackResponses: [
      'I saw something shiny to the east. Maybe worth checking?',
      'Be careful of the locked doors ahead. You\'ll need a key!',
      'The merchant sometimes passes through here. Good prices!',
    ],
    trades: [
      { gives: 'mushroom', wants: 'coin', cost: 2, description: 'Buy a fresh mushroom for 2 coins' },
    ],
    canQuiz: true,
    quizDifficulty: 'easy',
  },
  {
    id: 'guardian_default',
    assetKey: 'npc_guardian',
    displayName: 'Ancient Guardian',
    llmPersona: 'You are an ancient stone guardian in a fantasy world. Speak formally and wisely. Challenge the player with riddles or questions. Be mysterious but fair.',
    greetings: [
      'Halt, traveler. Only the wise may pass.',
      'I have guarded this passage for a thousand years. Prove your worth.',
      'Answer my challenge, and the way shall open.',
    ],
    fallbackResponses: [
      'Your words echo through these halls. But can you answer my question?',
      'Interesting... but wisdom requires more than clever words.',
      'The ancients spoke of one who would come. Perhaps it is you.',
    ],
    trades: [
      { gives: 'key', wants: 'coin', cost: 25, description: 'Buy an ancient key for 25 coins' },
      { gives: 'map_scroll', wants: 'coin', cost: 20, description: 'Buy a guardian\'s map for 20 coins' },
    ],
    canQuiz: true,
    quizDifficulty: 'hard',
  },
  {
    id: 'cat_default',
    assetKey: 'npc_cat',
    displayName: 'Friendly Cat',
    llmPersona: 'You are a friendly orange cat. Respond only with cat sounds and purring. Use *purrs*, *meows*, *rubs against leg*. Never use human words. Be affectionate.',
    greetings: [
      '*purrrrrr* 🐈',
      '*meow!* *rubs against your leg* 🐈',
      '*prrrr* *nuzzles your hand* 🐈',
      '*mrow?* *tilts head curiously* 🐈',
    ],
    fallbackResponses: [
      '*purrrrrr* *kneads paws happily*',
      '*meow meow* *rolls over for belly rubs*',
      '*prrrrrr* *slow blink*',
    ],
    trades: [],
    canQuiz: false,
    quizDifficulty: 'easy',
  },
  {
    id: 'black_cat_default',
    assetKey: 'npc_black_cat',
    displayName: 'Mysterious Black Cat',
    llmPersona: 'You are a mysterious black cat. Respond only with cryptic cat sounds. Use *stares intensely*, *silent meow*, *vanishes into shadow*. Be enigmatic.',
    greetings: [
      '*stares at you with golden eyes* 🐈‍⬛',
      '*silent meow* *blinks slowly* 🐈‍⬛',
      '*appears from nowhere* *mrrow?* 🐈‍⬛',
      '*purrs softly in the shadows* 🐈‍⬛',
    ],
    fallbackResponses: [
      '*stares into the distance knowingly*',
      '*disappears behind a bush, then reappears*',
      '*rubs against your leg mysteriously*',
    ],
    trades: [],
    canQuiz: false,
    quizDifficulty: 'easy',
  },
];

// --- Biome-Specific NPC Personas (Doc 05 §4.2) ---
// Meadow: farmer, beekeeper | Forest: ranger, hermit | Cave: miner | Castle: ghost, knight

export const BIOME_NPC_PERSONAS: NpcPersona[] = [
  {
    id: 'farmer_meadow',
    assetKey: 'npc_farmer',
    displayName: 'Farmer Greta',
    llmPersona: 'You are Farmer Greta, a cheerful meadow farmer in a fantasy world. Talk about crops, weather, and the beauty of nature. Give hints about nearby rewards. Keep responses under 2 sentences.',
    greetings: [
      'Howdy, traveler! The crops are growing well this season! 🌾',
      'Beautiful day for a stroll! Mind the sunflowers, they are extra tall! 🌻',
      'Welcome to my meadow! Have you tried the honey from the bees nearby? 🍯',
    ],
    fallbackResponses: [
      'The soil is rich here — perfect for growing things!',
      'I saw some coins glinting in the grass to the south.',
      'Watch out for the locked door near the old oak tree!',
    ],
    trades: [
      { gives: 'mushroom', wants: 'coin', cost: 3, description: 'Buy a mushroom for 3 coins' },
    ],
    canQuiz: true,
    quizDifficulty: 'easy',
  },
  {
    id: 'beekeeper_meadow',
    assetKey: 'npc_beekeeper',
    displayName: 'Beekeeper Buzz',
    llmPersona: 'You are Beekeeper Buzz, an enthusiastic beekeeper in a meadow. Talk about bees, honey, and pollination. Slip in fun bee facts. Use bee puns. Keep it short and sweet.',
    greetings: [
      'Bzzzz! Welcome to my apiary! The bees are very busy today! 🐝',
      'Did you know bees can dance to share directions? Bee-lieve it! 🐝',
      'Honey for your journey? Nothing bee-tter for energy! 🍯',
    ],
    fallbackResponses: [
      'Fun fact: a bee visits up to 5,000 flowers a day!',
      'If you see flowers clustered together, there might be treasure nearby!',
      'The queen bee says hello! ...Well, she didn\'t actually, but imagine!',
    ],
    trades: [
      { gives: 'potion', wants: 'coin', cost: 8, description: 'Buy honey potion for 8 coins' },
    ],
    canQuiz: true,
    quizDifficulty: 'easy',
  },
  {
    id: 'ranger_forest',
    assetKey: 'npc_ranger',
    displayName: 'Ranger Ash',
    llmPersona: 'You are Ranger Ash, a skilled forest ranger. Speak calmly and knowledgeably about forest ecology. Warn about dangers ahead. Give survival tips. Keep responses under 2 sentences.',
    greetings: [
      'Stay on the path, traveler. The forest can be tricky. 🏹',
      'I patrol these woods daily. Something stirs deeper in... 🌲',
      'Welcome to my forest. Need directions? I know every trail. 🗺️',
    ],
    fallbackResponses: [
      'There\'s a barricade blocking the northern trail. Got a crowbar?',
      'I spotted mushrooms growing in a clearing to the east.',
      'The trees get thicker ahead. Watch your step near the roots.',
    ],
    trades: [
      { gives: 'crowbar', wants: 'coin', cost: 15, description: 'Buy a sturdy crowbar for 15 coins' },
    ],
    canQuiz: true,
    quizDifficulty: 'medium',
  },
  {
    id: 'hermit_forest',
    assetKey: 'npc_hermit',
    displayName: 'Old Hermit',
    llmPersona: 'You are an old hermit living alone in the forest. Speak in wise, slightly cryptic sentences. Share knowledge about nature and philosophy. Be gentle but mysterious.',
    greetings: [
      'Ah... a visitor. It has been many moons since the last. 🧔',
      'The forest speaks, child. Can you hear its whispers? 🍃',
      'Sit, rest. The journey ahead requires a clear mind. 🧘',
    ],
    fallbackResponses: [
      'Wisdom is the greatest treasure. The book holds many answers...',
      'Not all who wander are lost, but a map helps!',
      'The moss always grows on the north side. ...Or was it south?',
    ],
    trades: [
      { gives: 'bandage', wants: 'coin', cost: 5, description: 'Buy a herbal bandage for 5 coins' },
      { gives: 'mushroom', wants: 'coin', cost: 1, description: 'Buy a forest mushroom for 1 coin' },
    ],
    canQuiz: true,
    quizDifficulty: 'medium',
  },
  {
    id: 'miner_cave',
    assetKey: 'npc_miner',
    displayName: 'Miner Flint',
    llmPersona: 'You are Miner Flint, a tough but friendly cave miner. Talk about gems, rocks, and underground discoveries. Use mining terminology. Be gruff but helpful.',
    greetings: [
      'Watch yer head! Low ceilings in these parts. ⛏️',
      'Found a vein of pure crystal yesterday! This cave is rich! 💎',
      'Need a light? It gets dark fast down here. 🕯️',
    ],
    fallbackResponses: [
      'There\'s a locked chamber deeper in. Probably hiding good loot!',
      'I heard rumblings from the east tunnel. Could be treasure... or trouble.',
      'These caves are old. Very old. Who built these walls, I wonder?',
    ],
    trades: [
      { gives: 'key', wants: 'coin', cost: 12, description: 'Buy a cave key for 12 coins' },
      { gives: 'crowbar', wants: 'coin', cost: 18, description: 'Buy a mining crowbar for 18 coins' },
    ],
    canQuiz: true,
    quizDifficulty: 'hard',
  },
  {
    id: 'ghost_castle',
    assetKey: 'npc_ghost',
    displayName: 'Castle Ghost',
    llmPersona: 'You are a castle ghost, once a scholar who studied in these halls. Speak in ethereal, poetic language. Share historical knowledge about the castle. Be melancholy but helpful.',
    greetings: [
      'Ooooh... a living soul... I have been so lonely... 👻',
      'These halls once echoed with laughter... now only whispers remain... 👻',
      'You can... see me? How wonderful! Most cannot... 👻',
    ],
    fallbackResponses: [
      'In my time, the library held answers to every question...',
      'There is a secret passage behind the eastern wall. I have seen it...',
      'The knights guarded a great treasure. Perhaps it still remains...',
    ],
    trades: [
      { gives: 'map_scroll', wants: 'coin', cost: 10, description: 'Buy a ghost\'s secret map for 10 coins' },
    ],
    canQuiz: true,
    quizDifficulty: 'hard',
  },
  {
    id: 'knight_castle',
    assetKey: 'npc_knight',
    displayName: 'Sir Ironhelm',
    llmPersona: 'You are Sir Ironhelm, a loyal castle knight. Speak formally and honorably. Challenge visitors to prove their worth through quizzes. Be strict but fair.',
    greetings: [
      'Halt! State your business in these sovereign halls! ⚔️',
      'By the code of chivalry, I guard this passage! ⚔️',
      'A brave adventurer! Prove your worth and you may pass! 🛡️',
    ],
    fallbackResponses: [
      'Only the wise may enter the inner chambers. Answer my challenge!',
      'The king valued knowledge above all. Do you share that value?',
      'Your courage is noted. But can your mind match your bravery?',
    ],
    trades: [
      { gives: 'potion', wants: 'coin', cost: 15, description: 'Buy a knight\'s potion for 15 coins' },
    ],
    canQuiz: true,
    quizDifficulty: 'hard',
  },
];

/** All personas combined */
const ALL_PERSONAS = [...NPC_PERSONAS, ...BIOME_NPC_PERSONAS];

/** Lookup NPC persona by id */
export function getNpcPersona(id: string): NpcPersona | undefined {
  return ALL_PERSONAS.find((p) => p.id === id);
}

/** Record-based lookup (keyed by id) */
export const NPC_DEFS: Record<string, NpcPersona> = Object.fromEntries(
  ALL_PERSONAS.map((p) => [p.id, p]),
);

/** Get all personas for a given asset key */
export function getPersonasForAsset(assetKey: string): NpcPersona[] {
  return ALL_PERSONAS.filter((p) => p.assetKey === assetKey);
}
