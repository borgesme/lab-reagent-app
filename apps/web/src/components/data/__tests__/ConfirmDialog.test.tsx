import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  it('calls onConfirm when confirm clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="删除"
        description="确认？"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
  });

  it('disables confirm button while submitting', async () => {
    let resolve: (() => void) | undefined;
    const onConfirm = vi.fn(
      () => new Promise<void>((r) => { resolve = r; }),
    );
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="删除"
        description="确认？"
        onConfirm={onConfirm}
      />,
    );
    const btn = screen.getByRole('button', { name: '确认删除' });
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    resolve!();
    await waitFor(() => expect(btn).not.toBeDisabled());
  });
});
