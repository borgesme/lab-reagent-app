import { describe, it, expect } from 'vitest';
import {
  PALETTE_KEYS,
  PALETTES,
  DEFAULT_PALETTE,
  PALETTE_STORAGE_KEY,
  isValidPalette,
} from '../palettes';

describe('palettes 数据源', () => {
  it('提供 6 个 PaletteKey', () => {
    expect(PALETTE_KEYS).toEqual([
      'emerald',
      'indigo',
      'sky',
      'violet',
      'slate',
      'rose',
    ]);
  });

  it('PALETTES 元数据每条都有 key/label/swatch 三字段且 key 覆盖 PALETTE_KEYS', () => {
    expect(PALETTES).toHaveLength(PALETTE_KEYS.length);
    for (const p of PALETTES) {
      expect(PALETTE_KEYS).toContain(p.key);
      expect(typeof p.label).toBe('string');
      expect(p.label.length).toBeGreaterThan(0);
      expect(typeof p.swatch).toBe('string');
      expect(p.swatch.startsWith('hsl(')).toBe(true);
    }
  });

  it('DEFAULT_PALETTE = emerald 且 STORAGE_KEY 固定', () => {
    expect(DEFAULT_PALETTE).toBe('emerald');
    expect(PALETTE_STORAGE_KEY).toBe('lab-palette');
  });

  it('isValidPalette 白名单：合法 key true，其它 false', () => {
    expect(isValidPalette('emerald')).toBe(true);
    expect(isValidPalette('rose')).toBe(true);
    expect(isValidPalette('teal')).toBe(false);
    expect(isValidPalette('')).toBe(false);
    expect(isValidPalette(null)).toBe(false);
    expect(isValidPalette(undefined)).toBe(false);
    expect(isValidPalette(42)).toBe(false);
    expect(isValidPalette({})).toBe(false);
  });
});
