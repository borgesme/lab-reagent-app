import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaletteSwitcher } from '../PaletteSwitcher';
import { PaletteProvider } from '@/components/palette-provider';
import {
  PALETTE_KEYS,
  PALETTE_STORAGE_KEY,
} from '@/lib/palettes';

function renderSwitcher() {
  return render(
    <PaletteProvider>
      <PaletteSwitcher />
    </PaletteProvider>,
  );
}

describe('PaletteSwitcher', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.palette;
  });

  it('打开 Popover 后渲染 6 个色板选项', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderSwitcher();
    await user.click(screen.getByTestId('palette-switcher'));
    for (const key of PALETTE_KEYS) {
      expect(
        await screen.findByTestId(`palette-option-${key}`),
      ).toBeInTheDocument();
    }
  });

  it('当前 palette (默认 emerald) 对应选项渲染 Check 图标', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderSwitcher();
    await user.click(screen.getByTestId('palette-switcher'));
    const emeraldBtn = await screen.findByTestId(
      'palette-option-emerald',
    );
    // Check 图标通过 lucide 渲染为 <svg>；只断 svg 存在即可
    expect(emeraldBtn.querySelector('svg')).not.toBeNull();
    // 非选中色板内无 svg
    const indigoBtn = screen.getByTestId('palette-option-indigo');
    expect(indigoBtn.querySelector('svg')).toBeNull();
  });

  it('点击 violet → LS 写入 violet 且 dataset 同步', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderSwitcher();
    await user.click(screen.getByTestId('palette-switcher'));
    await user.click(
      await screen.findByTestId('palette-option-violet'),
    );
    expect(localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('violet');
    expect(document.documentElement.dataset.palette).toBe('violet');
  });
});
