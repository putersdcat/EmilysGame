# 12 — Data Schema Sketch for Clean Branch

**Date:** 2026-07-07  
**Purpose:** Sketch renderer-agnostic data contracts for a clean rebuild. These are not final TypeScript definitions; they are starting contracts to prevent the new branch from repeating implicit state/config coupling.

## Principles

1. World data is renderer-agnostic.
2. Visual materials are referenced by IDs, not embedded in gameplay state.
3. Generated base chunks are deterministic snapshots.
4. Runtime changes are deltas/events.
5. Nano occupancy is explicit data, not inferred from asset names.
6. Saves store versioned state and deltas, not full generated terrain.
7. Content manifests are authoritative.

## Core IDs

```ts
type Brand<T, Name extends string> = T & { readonly __brand: Name };

type SeedId = Brand<string, 'SeedId'>;
type ChunkKey = Brand<string, 'ChunkKey'>;       // `${cx},${cy}`
type CellKey = Brand<string, 'CellKey'>;         // `${cx},${cy}:${lx},${ly}`
type MicroTileId = Brand<string, 'MicroTileId'>;
type NanoKindId = Brand<string, 'NanoKindId'>;
type WorldUnitId = Brand<string, 'WorldUnitId'>;
type MaterialId = Brand<string, 'MaterialId'>;
type EntityId = Brand<string, 'EntityId'>;
type ConditionId = Brand<string, 'ConditionId'>;
type ArticleId = Brand<string, 'ArticleId'>;
type QuizId = Brand<string, 'QuizId'>;
```

## Coordinates

```ts
interface WorldCoord {
  x: number;
  y: number;
}

interface ChunkCoord {
  cx: number;
  cy: number;
}

interface LocalCellCoord {
  lx: number; // 0..24 for 25×25 macro chunk
  ly: number;
}

type NanoPatch =
  | 'nw' | 'n' | 'ne'
  | 'w'  | 'c' | 'e'
  | 'sw' | 's' | 'se';
```

## Micro tile definition

```ts
type TraversalClass = 'walkable' | 'blocked' | 'conditional' | 'hazardous';
type SurfaceType = 'grass' | 'dirt' | 'sand' | 'stone' | 'water' | 'wood' | 'floor' | 'snow' | 'lava';
type EdgeTag = 'open' | 'path' | 'wall' | 'water' | 'shore' | 'fence' | 'gate' | 'closed' | 'adapter';
type Cardinal = 'n' | 's' | 'e' | 'w';

interface MicroTileDef {
  id: MicroTileId;
  displayName: string;
  traversal: TraversalClass;
  surface: SurfaceType;
  heightClass: number; // logical height, renderer decides units
  edges: Record<Cardinal, EdgeTag>;
  decorationTags: string[];
  variationFamily: string;
  biomeAffinity: string[];
  materialId: MaterialId;
  hazard?: {
    damage: number;
    label: string;
  };
}
```

## Nano definition

```ts
type NanoZMode = 'positive' | 'negative' | 'flat';
type NanoRenderFamily = 'billboard' | 'extruded' | 'carve-out' | 'flat-overlay' | 'mesh';
type FeatureVariant =
  | 'isolated'
  | 'straight-h' | 'straight-v'
  | 'corner-ne' | 'corner-nw' | 'corner-se' | 'corner-sw'
  | 'tee-n' | 'tee-s' | 'tee-e' | 'tee-w'
  | 'cross'
  | 'end-n' | 'end-s' | 'end-e' | 'end-w';

type WalkabilityRule =
  | { type: 'always' }
  | { type: 'never' }
  | { type: 'conditional'; conditionId: ConditionId };

interface NanoDef {
  kind: NanoKindId;
  renderFamily: NanoRenderFamily;
  zMode: NanoZMode;
  defaultZOffset: number;
  footprint: NanoPatch[];
  anchor: NanoPatch;
  edgePresence: Partial<Record<Cardinal, EdgeTag>>;
  connectable: boolean;
  legalVariants: FeatureVariant[];
  walkability: WalkabilityRule;
  blendPolicy: 'none' | 'alpha-edge' | 'noise-edge' | 'shoreline' | 'material-transition';
  materialSlots: {
    top?: MaterialId;
    side?: MaterialId;
    south?: MaterialId;
    east?: MaterialId;
    end?: MaterialId;
    overlay?: MaterialId;
  };
  stackGroup: 'negative' | 'flat' | 'positive';
}

interface NanoInstance {
  kind: NanoKindId;
  variant: FeatureVariant;
  zOffset?: number;
  conditionId?: ConditionId;
  materialOverrides?: Partial<NanoDef['materialSlots']>;
  seedSalt?: number;
}
```

## Cell snapshot

```ts
interface CellSnapshot {
  coord: LocalCellCoord;
  microTileId: MicroTileId;
  nanos: NanoInstance[];
  entities: EntityId[];
  flags: {
    walkableBase: boolean;
    interactable: boolean;
    generatedSafeZone?: boolean;
  };
}
```

## World unit definition

```ts
interface WorldUnitDef {
  id: WorldUnitId;
  displayName: string;
  size: 5;
  cells: Array<{
    x: number;
    y: number;
    microTileId?: MicroTileId; // undefined means biome/default fill
    nanos?: NanoInstance[];
  }>;
  edgeTags: Record<Cardinal, EdgeTag[]>; // 5 entries per side
  traversalChannels: Record<Cardinal, boolean>;
  anchors: Array<{
    kind: 'npc' | 'item' | 'gate' | 'chest' | 'sign' | 'scenic' | 'fire' | 'spawn';
    x: number;
    y: number;
    nanoPatch?: NanoPatch;
  }>;
  transform: {
    rotatable: boolean;
    flippable: boolean;
    allowedRotations?: Array<0 | 90 | 180 | 270>;
  };
  tags: string[];
  biomeAffinity: string[];
  weight: number;
}
```

## Chunk snapshot

```ts
interface ChunkSnapshot {
  key: ChunkKey;
  coord: ChunkCoord;
  seed: SeedId;
  version: number;
  biome: {
    id: string;
    name: string;
    climate: { moisture: number; temperature: number; elevation?: number };
    transition: Partial<Record<Cardinal, boolean>>;
    mood: string[];
  };
  worldUnits: Array<{
    wx: number; // 0..4
    wy: number;
    worldUnitId: WorldUnitId;
    rotation: 0 | 90 | 180 | 270;
    variantSeed: number;
  }>;
  cells: CellSnapshot[][]; // 25×25
  border: {
    edges: Record<Cardinal, EdgeTag[]>;
    traversal: Record<Cardinal, boolean[]>;
    chainPorts?: Record<Cardinal, string[]>;
  };
  validation: {
    playable: boolean;
    reachableRatio: number;
    repairs: string[];
    warnings: string[];
  };
}
```

## Runtime deltas

```ts
type WorldDelta =
  | { type: 'item.collected'; cellKey: CellKey; entityId: EntityId; at: number }
  | { type: 'gate.unlocked'; cellKey: CellKey; conditionId: ConditionId; method: 'quiz' | 'key' | 'debug'; at: number }
  | { type: 'cell.resolved'; cellKey: CellKey; replacementMicroTileId?: MicroTileId; removeNanos?: NanoKindId[]; addNanos?: NanoInstance[]; at: number }
  | { type: 'npc.state'; entityId: EntityId; state: 'met' | 'traded' | 'departed'; at: number }
  | { type: 'chest.opened'; cellKey: CellKey; rewards: string[]; at: number }
  | { type: 'knowledge.articleRead'; articleId: ArticleId; at: number }
  | { type: 'knowledge.wordSaved'; term: string; sourceArticleId?: ArticleId; at: number };
```

## Save schema

```ts
interface SaveGameV2 {
  schema: 'emilys-game-save';
  version: 2;
  createdAt: number;
  updatedAt: number;
  world: {
    seed: SeedId;
    entropyBuffer: string;
    wordlist: string[];
    biomeNoiseSeed: number;
    visitedChunks: ChunkKey[];
    deltas: WorldDelta[];
  };
  player: {
    position: WorldCoord;
    facing: Cardinal;
    variationId: string;
    unlockedCosmetics: string[];
  };
  inventory: Array<{ itemId: string; quantity: number }>;
  education: {
    ageBand?: '5-7' | '8-10' | '11-12+';
    selectedSubjects: string[];
    quizStats: { answered: number; correct: number; idk: number };
    streakHistory: Array<'correct' | 'wrong' | 'idk'>;
    readArticles: ArticleId[];
    wordBag: Array<{ term: string; sourceArticleId?: ArticleId; savedAt: number; lookedUp: boolean }>;
    discoveryPoints: number;
  };
  status: {
    energy: number;
    hydration: number;
    cleanliness: number;
    injuryCount: number;
    flags: string[];
  };
  settings: {
    audio: { master: number; music: number; sfx: number; muted: boolean };
    voice: { enabled: boolean; volume: number };
    touchMode: 'whisper' | 'slide' | 'visible';
    fogEnabled: boolean;
    teslaMode?: boolean;
  };
  playtimeSeconds: number;
}
```

## Content pack schema

```ts
interface ContentPackManifestV2 {
  schemaVersion: '2.0.0';
  packId: string;
  packName: string;
  packVersion: string;
  license: string;
  createdAt: string;
  updatedAt: string;
  shards: {
    quizzes: string[];
    articles: string[];
  };
  stats: {
    totalQuizzes: number;
    totalArticles: number;
    categoryCounts: Record<string, number>;
    subjectCounts: Record<string, number>;
    ageBandCounts: Record<string, number>;
  };
  qa: {
    generatedBy: string;
    reviewedBy?: string;
    safetyStatus: 'unchecked' | 'passed' | 'failed';
    readabilityStatus: 'unchecked' | 'passed' | 'failed';
  };
}
```

## Visual validation scene schema

```ts
interface VisualSceneSpec {
  id: string;
  title: string;
  purpose: string;
  camera: {
    target: WorldCoord;
    zoom: number;
    anglePreset: 'iso-default' | 'close-proof' | 'wide-proof';
  };
  world: {
    seed?: SeedId;
    chunks?: ChunkCoord[];
    fixture?: 'wall-perimeter' | 'river-bridge' | 'homestead' | 'cathedral' | 'startup-generated';
  };
  actors?: Array<{
    kind: 'player' | 'npc';
    position: WorldCoord;
    label?: string;
  }>;
  conditions?: Record<string, 'locked' | 'unlocked'>;
  assertions: Array<{
    kind: 'manual' | 'pixel-threshold' | 'metadata' | 'perf';
    description: string;
    threshold?: number;
  }>;
  output: {
    path: string;
    width: number;
    height: number;
  };
}
```

## Event bus sketch

```ts
type GameCommand =
  | { type: 'player.moveIntent'; dx: number; dy: number }
  | { type: 'player.interact' }
  | { type: 'quiz.answer'; quizId: QuizId; choiceIndex: number | 'idk' }
  | { type: 'inventory.use'; itemId: string; target?: CellKey }
  | { type: 'book.openArticle'; articleId: ArticleId }
  | { type: 'settings.setAudio'; partial: Partial<SaveGameV2['settings']['audio']> };

type GameEvent =
  | { type: 'player.moved'; position: WorldCoord }
  | { type: 'movement.blocked'; reason: string; cellKey?: CellKey }
  | { type: 'gate.unlocked'; cellKey: CellKey; conditionId: ConditionId }
  | { type: 'item.collected'; itemId: string; quantity: number }
  | { type: 'quiz.completed'; result: 'correct' | 'wrong' | 'idk' }
  | { type: 'save.written'; slot: number }
  | { type: 'audio.playSfx'; sfxId: string };
```

## Schema validation requirements

For clean branch, every authored data category should have:

- runtime validator;
- build-time validation script;
- fixture tests;
- migration policy if persisted.

Suggested packages:

- `zod` for runtime schema validation;
- generated TypeScript types from schemas if preferred;
- `vitest` for pure schema/solver tests.

## Open schema questions

1. Should chunk size remain 25×25 or become variable per macro type?
2. Should nano patches stay fixed 3×3 or allow higher-resolution local footprints for Three.js geometry?
3. Should visual materials be procedural functions, texture files, or both?
4. Should world-unit definitions live as JSON, TS data, or authored editor output?
5. Should player movement remain smooth continuous or return to stricter tile-step animation?
6. How much of survival/illness state belongs in core save parity?

These questions should be answered before the full clean branch, but not all are blockers for the proof spike.
