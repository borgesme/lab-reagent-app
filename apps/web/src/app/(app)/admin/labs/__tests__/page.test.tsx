import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LabsPage from '../page';
import { useAuth } from '@/lib/auth-store';

vi.mock('sonner', () => {
  return {
    toast: { success: vi.fn(), error: vi.fn() },
    Toaster: () => null,
  };
});

const mockApiFetch = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
  apiFetchRaw: vi.fn(),
  apiBaseUrl: '/api/v1',
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>,
  );
}

const labsFixture = [
  { id: 'lab-1', name: 'Lab A', building: 'Building 1' },
  { id: 'lab-2', name: 'Lab B', building: null },
];

describe('/admin/labs page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'admin', email: 'admin@lab.local' } as any,
      hydrated: true,
    });
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/labs' && (!opts || opts.method === undefined))
        return labsFixture;
      if (opts?.method === 'PATCH') return {};
      if (opts?.method === 'DELETE') return {};
      if (opts?.method === 'POST' && path === '/labs') return { id: 'lab-3' };
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });
  });

  it('编辑 lab → PATCH 调用 + dialog 关闭 + 表刷新', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<LabsPage />);

    await waitFor(() => screen.getByText('Lab A'));

    await user.click(screen.getByTestId('labs-row-lab-1-actions'));
    await user.click(screen.getByTestId('labs-row-lab-1-edit'));

    const nameInput = await screen.findByTestId('labs-edit-name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Lab A Renamed');

    await user.click(screen.getByRole('button', { name: /保存|提交|确认/ }));

    await waitFor(() => {
      const patchCall = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
      expect(patchCall![0]).toBe('/labs/lab-1');
      expect(patchCall![1].body.name).toBe('Lab A Renamed');
    });
  });

  it('PATCH 失败 → toast.error 且 dialog 不关', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/labs' && (!opts || !opts.method)) return labsFixture;
      if (opts?.method === 'PATCH')
        throw new Error('API 422: validation failed');
      throw new Error('unmocked');
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<LabsPage />);
    await waitFor(() => screen.getByText('Lab A'));

    await user.click(screen.getByTestId('labs-row-lab-1-actions'));
    await user.click(screen.getByTestId('labs-row-lab-1-edit'));
    await user.click(screen.getByRole('button', { name: /保存|提交|确认/ }));

    await waitFor(() => {
      expect(toast.error as any).toHaveBeenCalled();
      expect(screen.queryByTestId('labs-edit-name')).toBeInTheDocument();
    });
  });

  it('删除 lab → DELETE 调用 + dialog 关闭 + toast', async () => {
    const { toast } = await import('sonner');
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<LabsPage />);

    await waitFor(() => screen.getByText('Lab A'));
    await user.click(screen.getByTestId('labs-row-lab-1-actions'));
    await user.click(screen.getByTestId('labs-row-lab-1-delete'));

    await user.click(screen.getByTestId('labs-delete-confirm'));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/labs/lab-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(
        (toast.success as any).mock.calls.some((c: any[]) =>
          String(c[0]).includes('Lab A'),
        ),
      ).toBe(true);
    });
  });

  it('新增 lab → POST /labs + body 含 name/building + dialog 关闭', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<LabsPage />);

    await waitFor(() => screen.getByText('Lab A'));
    await user.click(screen.getByTestId('labs-create-btn'));

    await user.type(
      await screen.findByTestId('labs-create-name'),
      'Lab C',
    );
    await user.type(screen.getByTestId('labs-create-building'), 'Building 3');

    await user.click(screen.getByTestId('labs-create-submit'));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST' && c[0] === '/labs',
      );
      expect(postCall).toBeDefined();
      expect(postCall![1].body).toMatchObject({
        name: 'Lab C',
        building: 'Building 3',
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('labs-create-name')).not.toBeInTheDocument();
    });
  });
});
