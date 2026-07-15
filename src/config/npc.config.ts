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
      { gives: 'snack', wants: 'coin', cost: 3, description: 'Buy a trail snack for 3 coins' },
      { gives: 'water_flask', wants: 'coin', cost: 4, description: 'Buy fresh water for 4 coins' },
      { gives: 'soap', wants: 'coin', cost: 6, description: 'Buy soap for 6 coins' },
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
      { gives: 'snack', wants: 'coin', cost: 2, description: 'Buy farm snack for 2 coins' },
      { gives: 'water_flask', wants: 'coin', cost: 3, description: 'Buy well water for 3 coins' },
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

  // --- Biome-specific wandering merchants (WorldEngine-05 §4.1: "the
  // merchant's inventory is determined by biome... forest merchant sells
  // mushrooms and potions; castle merchant sells keys and shields").
  // Distinct from the flavor NPCs above (farmer/ranger/miner/knight etc.,
  // which already vary by biome via BIOME_NPC_POOL) and from the
  // structure-based THEMED_SHOP_PERSONAS below (which vary by store
  // *archetype*, not biome). Selected via getMerchantPersonaIdForBiome().
  {
    id: 'merchant_meadow',
    assetKey: 'npc_merchant',
    displayName: 'Traveling Merchant',
    llmPersona: 'You are a cheerful traveling merchant passing through sunny meadows. Speak warmly about trail goods and fair prices. Be welcoming to new adventurers.',
    greetings: [
      'Welcome, friend! Fresh goods for the road ahead! 🌻',
      'Lovely day for trading, isn\'t it? Take a look at my wares!',
      'A meadow merchant never turns away a friendly face. Come, browse!',
    ],
    fallbackResponses: [
      'Everything here is fresh from the meadow trails!',
      'Good prices for good company — that\'s my motto.',
      'Take your time, traveler. No rush in these fields.',
    ],
    trades: [
      { gives: 'potion', wants: 'coin', cost: 9, description: 'Buy a speed potion for 9 coins' },
      { gives: 'snack', wants: 'coin', cost: 2, description: 'Buy a trail snack for 2 coins' },
      { gives: 'water_flask', wants: 'coin', cost: 3, description: 'Buy fresh water for 3 coins' },
      { gives: 'soap', wants: 'coin', cost: 5, description: 'Buy soap for 5 coins' },
    ],
    canQuiz: false,
    quizDifficulty: 'easy',
  },
  {
    id: 'merchant_forest',
    assetKey: 'npc_merchant',
    displayName: 'Forest Peddler',
    llmPersona: 'You are a forest peddler who forages mushrooms and brews potions between trees. Speak with a woodsy, earthy charm. Mention the forest\'s bounty often.',
    greetings: [
      'Ho there! Foraged fresh this morning, all of it! 🍄',
      'A peddler\'s cart, deep in the woods — lucky you found me!',
      'Mushrooms, potions, whatever the forest gives up. Care to look?',
    ],
    fallbackResponses: [
      'The forest provides, if you know where to look.',
      'These potions are brewed with real forest herbs, none of that city stuff.',
      'Careful past here — I\'ve sold a few crowbars for the barricades ahead.',
    ],
    trades: [
      { gives: 'mushroom', wants: 'coin', cost: 2, description: 'Buy a foraged mushroom for 2 coins' },
      { gives: 'potion', wants: 'coin', cost: 9, description: 'Buy a forest-brewed potion for 9 coins' },
      { gives: 'crowbar', wants: 'coin', cost: 17, description: 'Buy a crowbar for 17 coins' },
      { gives: 'bandage', wants: 'coin', cost: 4, description: 'Buy a bandage for 4 coins' },
    ],
    canQuiz: false,
    quizDifficulty: 'easy',
  },
  {
    id: 'merchant_cave',
    assetKey: 'npc_merchant',
    displayName: 'Tunnel Trader',
    llmPersona: 'You are a tunnel trader who sells to miners and adventurers deep underground. Speak gruffly but fairly. Emphasize light sources and unlocking things in the dark.',
    greetings: [
      'Careful down here — bring a torch, or buy one off me! 🕯️',
      'Not many come this deep. Good, means fewer haggling me down.',
      'Keys, torches, tools — everything a body needs underground.',
    ],
    fallbackResponses: [
      'Dark tunnels hide good loot. And good loot needs a key.',
      'Don\'t go wandering these caves without a light, friend.',
      'I\'ve got maps too, if you\'d rather not get lost down here.',
    ],
    trades: [
      { gives: 'key', wants: 'coin', cost: 16, description: 'Buy a tunnel key for 16 coins' },
      { gives: 'crowbar', wants: 'coin', cost: 22, description: 'Buy a crowbar for 22 coins' },
      { gives: 'torch', wants: 'coin', cost: 6, description: 'Buy a torch for 6 coins' },
      { gives: 'map_scroll', wants: 'coin', cost: 18, description: 'Buy a tunnel map for 18 coins' },
    ],
    canQuiz: false,
    quizDifficulty: 'easy',
  },
  {
    id: 'merchant_castle',
    assetKey: 'npc_merchant',
    displayName: 'Court Merchant',
    llmPersona: 'You are a well-dressed court merchant who trades in keys and fine goods within castle walls. Speak formally, with a touch of pride about your wares\' quality.',
    greetings: [
      'Ah, a visitor to the court! My wares are of the finest make. ⚜️',
      'Keys, scrolls, potions fit for nobility — do have a look.',
      'Few merchants earn a stall within these walls. I have.',
    ],
    fallbackResponses: [
      'Every lock in this castle has a key somewhere on my cart.',
      'Fine goods for a fine adventurer, at a fair castle price.',
      'The court values quality. So do I.',
    ],
    trades: [
      { gives: 'key', wants: 'coin', cost: 20, description: 'Buy a castle key for 20 coins' },
      { gives: 'torch', wants: 'coin', cost: 7, description: 'Buy a court torch for 7 coins' },
      { gives: 'potion', wants: 'coin', cost: 13, description: 'Buy a court potion for 13 coins' },
      { gives: 'map_scroll', wants: 'coin', cost: 22, description: 'Buy a castle map for 22 coins' },
    ],
    canQuiz: false,
    quizDifficulty: 'easy',
  },
];

/** Biome name -> wandering-merchant persona id (WorldEngine-05 §4.1). Falls
 * back to 'merchant_default' for unrecognised/missing biome names so any
 * caller lacking biome context still resolves to a valid persona. */
const MERCHANT_PERSONA_BY_BIOME: Record<string, string> = {
  meadow: 'merchant_meadow',
  forest: 'merchant_forest',
  cave: 'merchant_cave',
  castle: 'merchant_castle',
};

/** Get the wandering-merchant persona id for a given biome name (#112 gap fix). */
export function getMerchantPersonaIdForBiome(biomeName: string | undefined): string {
  return (biomeName && MERCHANT_PERSONA_BY_BIOME[biomeName]) || 'merchant_default';
}

/** All personas combined */
const ALL_PERSONAS = [...NPC_PERSONAS, ...BIOME_NPC_PERSONAS];

// --- Generic shop merchant for structure-based shops (#77) ---
export const SHOP_MERCHANT_PERSONA: NpcPersona = {
  id: 'shop_merchant',
  assetKey: 'shop',
  displayName: 'Shopkeeper',
  llmPersona: 'You are a friendly traveling merchant. You sell useful items to adventurers.',
  greetings: ['Welcome! Take a look at my wares.', 'What can I get for you today?'],
  fallbackResponses: ['Fine goods, fair prices!', 'Everything an adventurer needs.'],
  trades: [
    { gives: 'potion', wants: 'coin', cost: 3, description: 'Speed Potion' },
    { gives: 'mushroom', wants: 'coin', cost: 1, description: 'Forest Mushroom' },
    { gives: 'bandage', wants: 'coin', cost: 2, description: 'Bandage' },
    { gives: 'key', wants: 'coin', cost: 5, description: 'Bronze Key' },
    { gives: 'torch', wants: 'coin', cost: 2, description: 'Torch' },
    { gives: 'snack', wants: 'coin', cost: 1, description: 'Trail Snack' },
  ],
  canQuiz: false,
  quizDifficulty: 'easy',
};

// --- Themed shop variant personas (#112 Phase 2) ---

/** General Store — broad inventory, fair prices */
export const GENERAL_STORE_PERSONA: NpcPersona = {
  id: 'shop_general_merchant',
  assetKey: 'shop_general',
  displayName: 'General Store Owner',
  llmPersona: 'You run a well-stocked general store. You have everything from medicine to tools.',
  greetings: [
    'Welcome to the General Store! We have a bit of everything.',
    'Step right in! Best selection in the region.',
  ],
  fallbackResponses: [
    'Quality goods at fair prices!',
    'Need anything else? We stock it all.',
  ],
  trades: [
    { gives: 'bandage', wants: 'coin', cost: 2, description: 'First Aid Bandage' },
    { gives: 'soap', wants: 'coin', cost: 3, description: 'Bar of Soap' },
    { gives: 'potion', wants: 'coin', cost: 4, description: 'Speed Potion' },
    { gives: 'key', wants: 'coin', cost: 6, description: 'Bronze Key' },
    { gives: 'torch', wants: 'coin', cost: 2, description: 'Lantern Torch' },
    { gives: 'water_flask', wants: 'coin', cost: 2, description: 'Fresh Water' },
    { gives: 'snack', wants: 'coin', cost: 1, description: 'Trail Mix' },
    { gives: 'mushroom', wants: 'coin', cost: 1, description: 'Dried Mushroom' },
  ],
  canQuiz: false,
  quizDifficulty: 'easy',
};

/** Snack Stand — food & drink focus, cheaper prices, fun persona */
export const SNACK_STAND_PERSONA: NpcPersona = {
  id: 'shop_snack_vendor',
  assetKey: 'shop_snack',
  displayName: 'Snack Vendor',
  llmPersona: 'You run a cheerful roadside snack stand. You love food and sharing treats with travelers.',
  greetings: [
    'Hey there, hungry? 🍿 Grab a snack!',
    'Welcome to the Snack Shack! Everything\'s fresh today!',
  ],
  fallbackResponses: [
    'Best snacks on this side of the biome!',
    'You look like you could use a treat! 🍪',
  ],
  trades: [
    { gives: 'snack', wants: 'coin', cost: 1, description: 'Crunchy Trail Bar' },
    { gives: 'mushroom', wants: 'coin', cost: 1, description: 'Toasted Mushroom' },
    { gives: 'water_flask', wants: 'coin', cost: 1, description: 'Cold Water Bottle' },
    { gives: 'potion', wants: 'coin', cost: 3, description: 'Energy Smoothie' },
  ],
  canQuiz: false,
  quizDifficulty: 'easy',
};

/** Trading Post — barter-focused, accepts found items */
export const TRADING_POST_PERSONA: NpcPersona = {
  id: 'shop_trading_merchant',
  assetKey: 'shop_trading',
  displayName: 'Trading Post Dealer',
  llmPersona: 'You run a rugged trading post, exchanging rare finds for useful supplies. You drive a hard bargain.',
  greetings: [
    'Got something to trade? Let\'s see what you\'ve got.',
    'Ah, a fellow traveler. I deal in hard-to-find goods.',
  ],
  fallbackResponses: [
    'Bring me something interesting and we\'ll talk.',
    'Fair trades only — no funny business.',
  ],
  trades: [
    { gives: 'key', wants: 'mushroom', cost: 3, description: 'Key (3 mushrooms)' },
    { gives: 'bandage', wants: 'mushroom', cost: 2, description: 'Bandage (2 mushrooms)' },
    { gives: 'potion', wants: 'snack', cost: 3, description: 'Potion (3 snacks)' },
    { gives: 'torch', wants: 'snack', cost: 2, description: 'Torch (2 snacks)' },
    { gives: 'soap', wants: 'water_flask', cost: 2, description: 'Soap (2 water flasks)' },
    { gives: 'map_scroll', wants: 'key', cost: 1, description: 'Map Scroll (1 key)' },
  ],
  canQuiz: false,
  quizDifficulty: 'easy',
};

// All themed shop personas for lookup (#112)
const THEMED_SHOP_PERSONAS: Record<string, NpcPersona> = {
  shop: SHOP_MERCHANT_PERSONA,
  shop_general: GENERAL_STORE_PERSONA,
  shop_snack: SNACK_STAND_PERSONA,
  shop_trading: TRADING_POST_PERSONA,
};

/** Get the merchant persona for a shop asset key */
export function getShopPersona(assetKey: string): NpcPersona {
  return THEMED_SHOP_PERSONAS[assetKey] ?? SHOP_MERCHANT_PERSONA;
}

/** Lookup NPC persona by id */
export function getNpcPersona(id: string): NpcPersona | undefined {
  if (id === SHOP_MERCHANT_PERSONA.id) return SHOP_MERCHANT_PERSONA;
  // Check themed shop personas
  for (const p of Object.values(THEMED_SHOP_PERSONAS)) {
    if (p.id === id) return p;
  }
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
