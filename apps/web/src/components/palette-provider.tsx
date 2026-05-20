'use client';
import * as React from 'react';
import {
  DEFAULT_PALETTE,
  PALETTE_STORAGE_KEY,
  isValidPalette,
  type PaletteKey,
} from '@/lib/palettes';

type Ctx = {
  palette: PaletteKey;
  setPalette: (p: PaletteKey) => void;
};

const PaletteContext = React.createContext<Ctx>({
  palette: DEFAULT_PALETTE,
  setPalette: () => {},
});

export function PaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [palette, setPaletteState] =
    React.useState<PaletteKey>(DEFAULT_PALETTE);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(PALETTE_STORAGE_KEY);
      if (isValidPalette(stored)) {
        setPaletteState(stored);
        document.documentElement.dataset.palette = stored;
      }
    } catch {
      /* 隐私模式 / 无 LS：静默回落 */
    }
  }, []);

  const setPalette = React.useCallback((p: PaletteKey) => {
    setPaletteState(p);
    try {
      localStorage.setItem(PALETTE_STORAGE_KEY, p);
    } catch {
      /* 静默 */
    }
    document.documentElement.dataset.palette = p;
  }, []);

  return (
    <PaletteContext.Provider value={{ palette, setPalette }}>
      {children}
    </PaletteContext.Provider>
  );
}

export const usePalette = () => React.useContext(PaletteContext);
