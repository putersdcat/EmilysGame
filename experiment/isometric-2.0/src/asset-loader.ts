/**
 * asset-loader.ts — 2.0 Experiment: SVG + metadata JSON asset loading pipeline.
 * Fetches tile assets from the /assets/tiles/ directory (served by Vite as static files).
 * Each tile asset is an SVG file + companion JSON metadata.
 * TODO: DOC — asset manifest format, loading lifecycle, fallback behavior
 */

import type { TileKind, TileAssetMeta, MicroTile, EdgeMasks, FeatureConnections, FeatureVariant } from './types';

// ─── Types ───────────────────────────────────────────────────

/** A fully loaded tile asset ready for use by the tile/chunk system. */
export interface LoadedTileAsset {
  /** Asset identifier (e.g., "grass-01"). */
  readonly id: string;
  /** SVG source string (128×128 viewBox). */
  readonly svg: string;
  /** Parsed metadata. */
  readonly meta: TileAssetMeta;
}

/** Loading state for progress tracking. */
export interface AssetLoadState {
  /** Total assets in manifest. */
  readonly total: number;
  /** Successfully loaded count. */
  readonly loaded: number;
  /** Failed asset IDs. */
  readonly failed: readonly string[];
  /** True when all loading attempts are complete (regardless of success/failure). */
  readonly done: boolean;
}

// ─── Asset Registry ──────────────────────────────────────────

/** Registry: asset ID → loaded asset. */
const _assetRegistry = new Map<string, LoadedTileAsset>();

/** Per-kind lookup: tile kind → array of asset IDs of that kind. */
const _kindIndex = new Map<TileKind, string[]>();

/** Current loading state. */
let _loadState: AssetLoadState = { total: 0, loaded: 0, failed: [], done: false };

/** Base URL for tile assets (relative to Vite public root). */
const TILE_ASSET_BASE = '/assets/tiles';

// ─── Manifest Loading ────────────────────────────────────────

/** Asset manifest format. */
interface AssetManifest {
  tiles: string[];
}

/**
 * Load the asset manifest and all referenced tile assets.
 * Returns a promise that resolves when all assets are loaded (or failed).
 * Gracefully handles missing/malformed assets with console warnings.
 */
export async function loadAllAssets(): Promise<AssetLoadState> {
  try {
    const manifestResp = await fetch('/assets/manifest.json');
    if (!manifestResp.ok) {
      console.warn('⚠️ Asset manifest not found, using fallback demo tiles.');
      _loadState = { total: 0, loaded: 0, failed: [], done: true };
      return _loadState;
    }
    const manifest: AssetManifest = await manifestResp.json();
    _loadState = { total: manifest.tiles.length, loaded: 0, failed: [], done: false };

    // Load all tiles in parallel
    const results = await Promise.allSettled(
      manifest.tiles.map(id => loadTileAsset(id)),
    );

    let loaded = 0;
    const failed: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled' && result.value) {
        loaded++;
      } else {
        failed.push(manifest.tiles[i]);
      }
    }

    _loadState = { total: manifest.tiles.length, loaded, failed, done: true };
    console.log(`🎨 Assets loaded: ${loaded}/${manifest.tiles.length}${failed.length ? ` (failed: ${failed.join(', ')})` : ''}`);
    return _loadState;
  } catch (err) {
    console.warn('⚠️ Asset loading failed:', err);
    _loadState = { total: 0, loaded: 0, failed: [], done: true };
    return _loadState;
  }
}

// ─── Single Asset Loading ────────────────────────────────────

/**
 * Load a single tile asset (SVG + JSON metadata).
 * Returns the loaded asset, or null on failure.
 */
async function loadTileAsset(id: string): Promise<LoadedTileAsset | null> {
  try {
    // Fetch SVG and JSON in parallel
    const [svgResp, jsonResp] = await Promise.all([
      fetch(`${TILE_ASSET_BASE}/${id}.svg`),
      fetch(`${TILE_ASSET_BASE}/${id}.json`),
    ]);

    if (!svgResp.ok) {
      console.warn(`⚠️ Missing SVG for asset "${id}": ${svgResp.status}`);
      return null;
    }
    if (!jsonResp.ok) {
      console.warn(`⚠️ Missing JSON for asset "${id}": ${jsonResp.status}`);
      return null;
    }

    const svg = await svgResp.text();
    const rawMeta = await jsonResp.json();
    const meta = parseTileAssetMeta(id, rawMeta);
    if (!meta) return null;

    const asset: LoadedTileAsset = { id, svg, meta };
    registerAsset(asset);
    return asset;
  } catch (err) {
    console.warn(`⚠️ Failed to load asset "${id}":`, err);
    return null;
  }
}

// ─── Metadata Parsing & Validation ───────────────────────────

/** Parse and validate raw JSON into TileAssetMeta. Logs warnings on issues. */
function parseTileAssetMeta(id: string, raw: Record<string, unknown>): TileAssetMeta | null {
  if (!raw || typeof raw !== 'object') {
    console.warn(`⚠️ Asset "${id}": metadata is not an object`);
    return null;
  }

  const kind = raw['kind'] as TileKind | undefined;
  if (!kind || typeof kind !== 'string') {
    console.warn(`⚠️ Asset "${id}": missing or invalid 'kind'`);
    return null;
  }

  const z = typeof raw['z'] === 'number' ? raw['z'] : 0;

  // Parse edge masks (required)
  const rawEdge = raw['edgeMasks'] as Record<string, unknown> | undefined;
  const edgeMasks = rawEdge ? {
    top: parseEdgeSamples(rawEdge['top']),
    right: parseEdgeSamples(rawEdge['right']),
    bottom: parseEdgeSamples(rawEdge['bottom']),
    left: parseEdgeSamples(rawEdge['left']),
  } : {
    top: DEFAULT_SAMPLES,
    right: DEFAULT_SAMPLES,
    bottom: DEFAULT_SAMPLES,
    left: DEFAULT_SAMPLES,
  };

  // Optional fields
  const heightMap = Array.isArray(raw['heightMap'])
    ? (raw['heightMap'] as number[])
    : undefined;

  const shadowPath = typeof raw['shadowPath'] === 'string'
    ? raw['shadowPath']
    : undefined;

  const rawConn = raw['connections'] as Record<string, boolean> | undefined;
  const connections: FeatureConnections | undefined = rawConn ? {
    top: !!rawConn['top'],
    right: !!rawConn['right'],
    bottom: !!rawConn['bottom'],
    left: !!rawConn['left'],
  } : undefined;

  const variant = typeof raw['variant'] === 'string'
    ? raw['variant'] as FeatureVariant
    : undefined;

  return { kind, z, edgeMasks, heightMap, shadowPath, connections, variant };
}

const DEFAULT_SAMPLES: readonly number[] = [1, 1, 1, 1, 1, 1, 1, 1];

function parseEdgeSamples(raw: unknown): readonly number[] {
  if (Array.isArray(raw) && raw.length === 8 && raw.every(v => typeof v === 'number')) {
    return raw as number[];
  }
  return DEFAULT_SAMPLES;
}

// ─── Registry Management ─────────────────────────────────────

/** Register a loaded asset into the global registry and kind index. */
function registerAsset(asset: LoadedTileAsset): void {
  _assetRegistry.set(asset.id, asset);

  const existing = _kindIndex.get(asset.meta.kind);
  if (existing) {
    existing.push(asset.id);
  } else {
    _kindIndex.set(asset.meta.kind, [asset.id]);
  }
}

// ─── Public API ──────────────────────────────────────────────

/** Get loading state (for progress UI). */
export function getAssetLoadState(): AssetLoadState {
  return _loadState;
}

/** Get a loaded asset by ID. Returns undefined if not loaded. */
export function getAsset(id: string): LoadedTileAsset | undefined {
  return _assetRegistry.get(id);
}

/** Get all loaded assets. */
export function getAllAssets(): readonly LoadedTileAsset[] {
  return Array.from(_assetRegistry.values());
}

/** Get all asset IDs for a given tile kind. */
export function getAssetsByKind(kind: TileKind): readonly string[] {
  return _kindIndex.get(kind) ?? [];
}

/** Check if any assets are loaded. */
export function hasLoadedAssets(): boolean {
  return _assetRegistry.size > 0;
}

// ─── MicroTile Factory ───────────────────────────────────────

/**
 * Create a MicroTile from a loaded asset.
 * This bridges the asset loader output to the tile/chunk system input.
 */
export function createTileFromAsset(asset: LoadedTileAsset): MicroTile {
  const meta = asset.meta;
  const edgeMasks: EdgeMasks = {
    top: { samples: meta.edgeMasks.top },
    right: { samples: meta.edgeMasks.right },
    bottom: { samples: meta.edgeMasks.bottom },
    left: { samples: meta.edgeMasks.left },
  };

  return {
    kind: meta.kind,
    z: meta.z,
    svg: asset.svg,
    edgeMasks,
    heightMap: meta.heightMap,
    shadowPath: meta.shadowPath,
    connections: meta.connections,
    variant: meta.variant,
  };
}

/**
 * Pick a random asset for a given tile kind (for demo/procedural generation).
 * Returns a MicroTile, or null if no assets of that kind are loaded.
 * Uses the provided hash value for deterministic selection.
 */
export function pickTileForKind(kind: TileKind, hash: number): MicroTile | null {
  const ids = getAssetsByKind(kind);
  if (ids.length === 0) return null;
  const id = ids[hash % ids.length];
  const asset = getAsset(id);
  if (!asset) return null;
  return createTileFromAsset(asset);
}
