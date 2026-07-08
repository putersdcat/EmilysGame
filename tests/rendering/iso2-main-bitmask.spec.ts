/**
 * iso2-main-bitmask.spec.ts — main-engine continuous feature topology guard.
 *
 * The main engine has its own decomposed iso2 solver modules. Keep their bitmask
 * contract pinned so water/walls/fences/bridges choose the same topology variants
 * the Iso 2.0 experiment proved.
 */
import { test, expect } from '@playwright/test';
import { bitmaskToConnections, connectionsToBitmask, variantFromBitmask } from '../../src/engine/iso2/bitmask';

test('main-engine bitmask lookup uses bit0 top, bit1 right, bit2 bottom, bit3 left', () => {
  expect(variantFromBitmask(0b0000)).toBe('isolated');
  expect(variantFromBitmask(0b0001)).toBe('end-t');
  expect(variantFromBitmask(0b0010)).toBe('end-r');
  expect(variantFromBitmask(0b0011)).toBe('corner-tr');
  expect(variantFromBitmask(0b0101)).toBe('straight-v');
  expect(variantFromBitmask(0b1010)).toBe('straight-h');
  expect(variantFromBitmask(0b0111)).toBe('tee-l');
  expect(variantFromBitmask(0b1110)).toBe('tee-t');
  expect(variantFromBitmask(0b1111)).toBe('cross');

  const conn = bitmaskToConnections(0b1010);
  expect(conn).toEqual({ top: false, right: true, bottom: false, left: true });
  expect(connectionsToBitmask(conn)).toBe(0b1010);
});
