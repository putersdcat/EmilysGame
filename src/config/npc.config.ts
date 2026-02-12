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
    trades: [],
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
    trades: [],
    canQuiz: true,
    quizDifficulty: 'hard',
  },
];

/** Lookup NPC persona by id */
export function getNpcPersona(id: string): NpcPersona | undefined {
  return NPC_PERSONAS.find((p) => p.id === id);
}

/** Record-based lookup (keyed by id) */
export const NPC_DEFS: Record<string, NpcPersona> = Object.fromEntries(
  NPC_PERSONAS.map((p) => [p.id, p]),
);

/** Get all personas for a given asset key */
export function getPersonasForAsset(assetKey: string): NpcPersona[] {
  return NPC_PERSONAS.filter((p) => p.assetKey === assetKey);
}
