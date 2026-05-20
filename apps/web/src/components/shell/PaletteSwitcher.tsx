'use client';
import * as React from 'react';
import { Palette, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { PALETTES } from '@/lib/palettes';
import { usePalette } from '@/components/palette-provider';

export function PaletteSwitcher() {
  const { palette, setPalette } = usePalette();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid="palette-switcher"
          aria-label="切换主题色"
        >
          <Palette className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56">
        <p className="mb-2 text-sm font-medium">主题色</p>
        <div className="grid grid-cols-3 gap-2">
          {PALETTES.map((p) => {
            const selected = palette === p.key;
            return (
              <button
                key={p.key}
                type="button"
                data-testid={`palette-option-${p.key}`}
                aria-label={p.label}
                aria-pressed={selected}
                onClick={() => setPalette(p.key)}
                className="flex flex-col items-center gap-1 rounded-md p-2 hover:bg-accent"
              >
                <span
                  className="relative flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ background: p.swatch }}
                >
                  {selected && (
                    <Check
                      className="h-4 w-4 text-white"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className="text-xs">{p.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
