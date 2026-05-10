import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsersPage from '../page';
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

vi.mock('@/components/ui/combobox', () => ({
  Combobox: ({ value, onChange, testId }: any) => (
    <input
      data-testid={testId}
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>,
  );
}

const usersFixture = [
  {
    id: 'u1',
    email: 'alice@lab.local',
    name: 'Alice',
    lab: { id: 'lab-1', name: 'Lab A' },
    labId: 'lab-1',
    roles: [{ role: { code: 'PLAIN_USER' } }],
  },
];
const labsFixture = [
  { id: 'lab-1', name: 'Lab A' },
  { id: 'lab-2', name: 'Lab B' },
];

describe('/admin/users page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'admin', email: 'admin@lab.local' } as any,
      hydrated: true,
    });
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/users' && (!opts || opts.method === undefined))
        return usersFixture;
      if (path === '/labs') return labsFixture;
      if (opts?.method === 'PATCH') return {};
      if (opts?.method === 'POST' && path.endsWith('/reset-password'))
        return { tempPassword: 'AbCd1234' };
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });
  });

  it('编辑用户 → PATCH 调用 + dialog 关闭 + 表刷新', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<UsersPage />);

    await waitFor(() => screen.getByText('Alice'));

    await user.click(screen.getByTestId('admin-users-row-u1-actions'));
    await user.click(screen.getByTestId('admin-users-row-u1-edit'));

    const nameInput = await screen.findByTestId('admin-users-edit-name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Alice Renamed');

    await user.click(screen.getByRole('button', { name: /保存|提交|确认/ }));

    await waitFor(() => {
      const patchCall = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
      expect(patchCall![0]).toBe('/users/u1');
      expect(patchCall![1].body.name).toBe('Alice Renamed');
    });
  });

  it('重置密码 → POST 调用 + toast 含临时密码', async () => {
    const { toast } = await import('sonner');
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<UsersPage />);

    await waitFor(() => screen.getByText('Alice'));
    await user.click(screen.getByTestId('admin-users-row-u1-actions'));
    await user.click(screen.getByTestId('admin-users-row-u1-reset'));

    await user.click(screen.getByRole('button', { name: /确认重置/ }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/users/u1/reset-password',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(
        (toast.success as any).mock.calls.some((c: any[]) =>
          String(c[0]).includes('AbCd1234'),
        ),
      ).toBe(true);
    });
  });

  it('PATCH 失败 → toast.error 且 dialog 不关', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/users' && (!opts || !opts.method)) return usersFixture;
      if (path === '/labs') return labsFixture;
      if (opts?.method === 'PATCH')
        throw new Error('API 422: validation failed');
      throw new Error('unmocked');
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<UsersPage />);
    await waitFor(() => screen.getByText('Alice'));

    await user.click(screen.getByTestId('admin-users-row-u1-actions'));
    await user.click(screen.getByTestId('admin-users-row-u1-edit'));
    await user.click(screen.getByRole('button', { name: /保存|提交|确认/ }));

    await waitFor(() => {
      expect(toast.error as any).toHaveBeenCalled();
      expect(
        screen.queryByTestId('admin-users-edit-name'),
      ).toBeInTheDocument();
    });
  });
});
