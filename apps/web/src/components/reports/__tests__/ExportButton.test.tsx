import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportButton } from '../ExportButton';
import { useAuth } from '@/lib/auth-store';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
import { toast } from 'sonner';

describe('ExportButton', () => {
  beforeEach(() => {
    useAuth.setState({
      tokens: { accessToken: 't', refreshToken: 'r' },
      user: { id: 'u', email: 'a@b', name: 'A', labId: null, roles: ['SYS_ADMIN'] },
      hydrated: true,
    });
    vi.clearAllMocks();
    (URL as any).createObjectURL = vi.fn(() => 'blob:mock');
    (URL as any).revokeObjectURL = vi.fn();
  });

  it('opens menu showing CSV / Excel items on trigger click', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ExportButton endpoint="/reports/x" testId="ex" />);
    await user.click(screen.getByTestId('ex'));
    expect(await screen.findByTestId('ex-csv')).toBeInTheDocument();
    expect(screen.getByTestId('ex-xlsx')).toBeInTheDocument();
  });

  it('clicks CSV → calls fetch with token + format=csv', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['x']),
      headers: { get: () => null },
    });
    (global as any).fetch = fetchMock;
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ExportButton endpoint="/reports/x?range=30d" testId="ex" />);
    await user.click(screen.getByTestId('ex'));
    await user.click(await screen.findByTestId('ex-csv'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/reports/x?range=30d&format=csv'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer t' },
        }),
      ),
    );
  });

  it('non-ok response triggers toast.error', async () => {
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      blob: async () => new Blob([]),
      headers: { get: () => null },
    });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ExportButton endpoint="/reports/x" testId="ex" />);
    await user.click(screen.getByTestId('ex'));
    await user.click(await screen.findByTestId('ex-csv'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('导出失败:HTTP 500'),
    );
  });
});
