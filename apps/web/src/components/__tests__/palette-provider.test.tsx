import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PaletteProvider,
  usePalette,
} from '../palette-provider';
import {
  DEFAULT_PALETTE,
  PALETTE_STORAGE_KEY,
} from '@/lib/palettes';

function Probe() {
  const { palette, setPalette } = usePalette();
  return (
    <div>
      <span data-testid="probe-current">{palette}</span>
      <button
        data-testid="probe-set-indigo"
        onClick={() => setPalette('indigo')}
      >
        indigo
      </button>
      <button
        data-testid="probe-set-violet"
        onClick={() => setPalette('violet')}
      >
        violet
      </button>
    </div>
  );
}

describe('PaletteProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.palette;
  });

  it('无 localStorage 时默认 emerald', async () => {
    render(
      <PaletteProvider>
        <Probe />
      </PaletteProvider>,
    );
    expect(screen.getByTestId('probe-current').textContent).toBe(
      DEFAULT_PALETTE,
    );
  });

  it('localStorage 已存 indigo → mount 后 state=indigo 且 dataset 同步', async () => {
    localStorage.setItem(PALETTE_STORAGE_KEY, 'indigo');
    render(
      <PaletteProvider>
        <Probe />
      </PaletteProvider>,
    );
    // useEffect 是同步触发的（act 内部），mount 后即可断言
    await act(async () => {});
    expect(screen.getByTestId('probe-current').textContent).toBe('indigo');
    expect(document.documentElement.dataset.palette).toBe('indigo');
  });

  it('localStorage 含非法值 → 回落 emerald 不抛错', async () => {
    localStorage.setItem(PALETTE_STORAGE_KEY, 'teal');
    render(
      <PaletteProvider>
        <Probe />
      </PaletteProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId('probe-current').textContent).toBe(
      DEFAULT_PALETTE,
    );
    expect(document.documentElement.dataset.palette).toBeUndefined();
  });

  it('setPalette(violet) → state/LS/dataset 三同步', async () => {
    const user = userEvent.setup();
    render(
      <PaletteProvider>
        <Probe />
      </PaletteProvider>,
    );
    await user.click(screen.getByTestId('probe-set-violet'));
    expect(screen.getByTestId('probe-current').textContent).toBe('violet');
    expect(localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('violet');
    expect(document.documentElement.dataset.palette).toBe('violet');
  });
});
