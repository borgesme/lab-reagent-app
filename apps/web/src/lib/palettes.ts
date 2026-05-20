export const PALETTE_KEYS = [
  'emerald',
  'indigo',
  'sky',
  'violet',
  'slate',
  'rose',
] as const;

export type PaletteKey = (typeof PALETTE_KEYS)[number];

export const DEFAULT_PALETTE: PaletteKey = 'emerald';

export const PALETTE_STORAGE_KEY = 'lab-palette';

export const PALETTES: Array<{
  key: PaletteKey;
  label: string;
  swatch: string;
}> = [
  { key: 'emerald', label: '翠绿', swatch: 'hsl(158 64% 40%)' },
  { key: 'indigo', label: '靛蓝', swatch: 'hsl(239 84% 56%)' },
  { key: 'sky', label: '天蓝', swatch: 'hsl(199 89% 41%)' },
  { key: 'violet', label: '紫罗兰', swatch: 'hsl(262 83% 58%)' },
  { key: 'slate', label: '石板', swatch: 'hsl(222 47% 11%)' },
  { key: 'rose', label: '玫红', swatch: 'hsl(346 77% 50%)' },
];

export function isValidPalette(v: unknown): v is PaletteKey {
  return (
    typeof v === 'string' &&
    (PALETTE_KEYS as readonly string[]).includes(v)
  );
}
