/**
 * iso2-d-material-parity.spec.ts — Slice D wall/material parity pass.
 *
 * Source-level audit already confirmed every experiment material family has
 * a main-engine counterpart (no missing content), and a manual spot-check of
 * StoneBrick + DarkCathedralStone's palette specs found byte-identical color
 * values. This spec automates that comparison durably: it cross-imports the
 * SAME material from both experiment/isometric-2.0 and main (mirroring the
 * precedent in iso2-gate-bridge-walkability.spec.ts, which already imports
 * experiment/isometric-2.0/src/solver directly into a main-repo test), and
 * asserts every face-slice SVG's content is identical. This covers the
 * palette spec AND the geometry algorithm in one shot, and catches future
 * drift between the two copies automatically (the port-back contract's
 * "source parity" requirement, verified continuously rather than by
 * one-time manual read).
 *
 * NOTE: the comparison normalizes whitespace before comparing (see
 * normalizeSvg below). A first run of this spec with literal `toBe()`
 * equality found a diff on every material -- but it was 100% cosmetic:
 * experiment's hand-written template emits `fill="#3a3835" />` (space
 * before the self-closing `/>`) while main's emits `fill="#3a3835"/>` (no
 * space). Every coordinate/color/size value was identical once whitespace
 * is stripped -- confirming true content parity, not a false pass.
 *
 * These are pure string-builders (no Canvas/DOM) -- no browser page needed.
 */
import { test, expect } from '@playwright/test';

import * as ExpStoneBrick from '../../experiment/isometric-2.0/src/textures/stone-brick';
import * as ExpDarkCathedralStone from '../../experiment/isometric-2.0/src/textures/dark-cathedral-stone';
import * as ExpTimberFrameWall from '../../experiment/isometric-2.0/src/textures/timber-frame-wall';
import * as ExpThatchRoof from '../../experiment/isometric-2.0/src/textures/thatch-roof';

import {
  StoneBrick as MainStoneBrick,
  DarkCathedralStone as MainDarkCathedralStone,
  TimberFrameWall as MainTimberFrameWall,
  ThatchRoof as MainThatchRoof,
  WeatheredPostRail as MainWeatheredPostRail,
  SplitRailOak as MainSplitRailOak,
  MossyFarmRail as MainMossyFarmRail,
  BleachedPaddock as MainBleachedPaddock,
  RoughPicket as MainRoughPicket,
  HazelWattle as MainHazelWattle,
} from '../../src/asset-pipeline/iso2-materials';
import * as ExpFenceFamily from '../../experiment/isometric-2.0/src/textures/fence-family';

/**
 * Strips insignificant whitespace (indentation, newlines, the cosmetic
 * space some hand-ports leave before a self-closing `/>`) so the comparison
 * checks real SVG content -- element order, coordinates, sizes, colors --
 * rather than string-serialization style. A single confirmed real-world
 * example of what this intentionally ignores: experiment emits
 * `fill="#3a3835" />` (space before `/>`) while main emits
 * `fill="#3a3835"/>` (no space) -- semantically identical SVG, different
 * hand-written template style.
 */
function normalizeSvg(svg: string): string {
  return svg.replace(/\s+/g, '');
}

test('Slice D: StoneBrick face-slice SVGs match experiment content (colors/geometry, ignoring whitespace style)', () => {
  expect(normalizeSvg(MainStoneBrick.svg())).toBe(normalizeSvg(ExpStoneBrick.svg()));
  expect(normalizeSvg(MainStoneBrick.svgTop())).toBe(normalizeSvg(ExpStoneBrick.svgTop()));
  expect(normalizeSvg(MainStoneBrick.svgTopV())).toBe(normalizeSvg(ExpStoneBrick.svgTopV()));
  expect(normalizeSvg(MainStoneBrick.svgSouth())).toBe(normalizeSvg(ExpStoneBrick.svgSouth()));
  expect(normalizeSvg(MainStoneBrick.svgEast())).toBe(normalizeSvg(ExpStoneBrick.svgEast()));
  expect(normalizeSvg(MainStoneBrick.svgEnd())).toBe(normalizeSvg(ExpStoneBrick.svgEnd()));
});

test('Slice D: DarkCathedralStone face-slice SVGs match experiment content (colors/geometry, ignoring whitespace style)', () => {
  expect(normalizeSvg(MainDarkCathedralStone.svg())).toBe(normalizeSvg(ExpDarkCathedralStone.svg()));
  expect(normalizeSvg(MainDarkCathedralStone.svgTop())).toBe(normalizeSvg(ExpDarkCathedralStone.svgTop()));
  expect(normalizeSvg(MainDarkCathedralStone.svgSouth())).toBe(normalizeSvg(ExpDarkCathedralStone.svgSouth()));
  expect(normalizeSvg(MainDarkCathedralStone.svgEast())).toBe(normalizeSvg(ExpDarkCathedralStone.svgEast()));
});

test('Slice D: TimberFrameWall face-slice SVGs match experiment content (colors/geometry, ignoring whitespace style)', () => {
  expect(normalizeSvg(MainTimberFrameWall.svg())).toBe(normalizeSvg(ExpTimberFrameWall.svg()));
  expect(normalizeSvg(MainTimberFrameWall.svgTop())).toBe(normalizeSvg(ExpTimberFrameWall.svgTop()));
  expect(normalizeSvg(MainTimberFrameWall.svgTopV())).toBe(normalizeSvg(ExpTimberFrameWall.svgTopV()));
  expect(normalizeSvg(MainTimberFrameWall.svgSouth())).toBe(normalizeSvg(ExpTimberFrameWall.svgSouth()));
  expect(normalizeSvg(MainTimberFrameWall.svgEast())).toBe(normalizeSvg(ExpTimberFrameWall.svgEast()));
  expect(normalizeSvg(MainTimberFrameWall.svgEnd())).toBe(normalizeSvg(ExpTimberFrameWall.svgEnd()));
});

test('Slice D: ThatchRoof primitive SVGs match experiment content (colors/geometry, ignoring whitespace style)', () => {
  expect(normalizeSvg(MainThatchRoof.svgSlopeLeft())).toBe(normalizeSvg(ExpThatchRoof.svgSlopeLeft()));
  expect(normalizeSvg(MainThatchRoof.svgSlopeRight())).toBe(normalizeSvg(ExpThatchRoof.svgSlopeRight()));
  expect(normalizeSvg(MainThatchRoof.svgRidge())).toBe(normalizeSvg(ExpThatchRoof.svgRidge()));
  expect(normalizeSvg(MainThatchRoof.svgGable())).toBe(normalizeSvg(ExpThatchRoof.svgGable()));
});

test('Slice D: all 6 fence styles are field-for-field identical between experiment and main', () => {
  // Fences are procedural data presets (not SVG string builders), so a
  // direct deep-equality check on the frozen preset objects is the correct
  // and simplest parity proof -- no whitespace-normalization concern here.
  expect(MainWeatheredPostRail).toEqual(ExpFenceFamily.WeatheredPostRail);
  expect(MainSplitRailOak).toEqual(ExpFenceFamily.SplitRailOak);
  expect(MainMossyFarmRail).toEqual(ExpFenceFamily.MossyFarmRail);
  expect(MainBleachedPaddock).toEqual(ExpFenceFamily.BleachedPaddock);
  expect(MainRoughPicket).toEqual(ExpFenceFamily.RoughPicket);
  expect(MainHazelWattle).toEqual(ExpFenceFamily.HazelWattle);
});
