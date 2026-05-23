import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileSheet } from '../ProfileSheet';
import { useAuth } from '@/lib/auth-store';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>,
  );
}

describe('ProfileSheet', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'a1', refreshToken: 'r1' } as any,
      user: {
        id: 'u1',
        email: 'admin@lab.local',
        name: '老名字',
        labId: 'lab-1',
        roles: ['SYS_ADMIN', 'LAB_HEAD'],
      } as any,
      hydrated: true,
    });
  });

  it('渲染基础资料 (email/labId/roles) + name input', () => {
    renderWithQuery(<ProfileSheet open onOpenChange={vi.fn()} />);
    expect(screen.getAllByText('admin@lab.local').length).toBeGreaterThan(0);
    expect(screen.getByText('lab-1')).toBeInTheDocument();
    expect(screen.getByText('SYS_ADMIN')).toBeInTheDocument();
    expect(screen.getByText('LAB_HEAD')).toBeInTheDocument();
    expect(screen.getByTestId('profile-name-input')).toHaveValue('老名字');
  });

  it('改名提交 → 200 → store.user.name 更新, 显示 toast', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes('/roles')) {
        return json({ code: 200, msg: 'ok', data: [] });
      }
      return json({
        code: 200,
        msg: 'ok',
        data: {
          id: 'u1',
          email: 'admin@lab.local',
          name: '新名字',
          labId: 'lab-1',
          roles: ['SYS_ADMIN', 'LAB_HEAD'],
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<ProfileSheet open onOpenChange={vi.fn()} />);
    const input = screen.getByTestId('profile-name-input');
    await user.clear(input);
    await user.type(input, '新名字');
    await user.click(screen.getByTestId('profile-save-name'));
    await waitFor(() => {
      expect(useAuth.getState().user?.name).toBe('新名字');
    });
    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalled();
    const patchCall = fetchMock.mock.calls.find(
      (c: any[]) => c[1]?.method === 'PATCH',
    );
    expect(patchCall).toBeDefined();
    const body = JSON.parse(patchCall![1].body);
    expect(body).toEqual({ name: '新名字' });
  });

  it('保存按钮在 name 未改时 disabled', () => {
    renderWithQuery(<ProfileSheet open onOpenChange={vi.fn()} />);
    expect(screen.getByTestId('profile-save-name')).toBeDisabled();
  });

  it('点修改密码按钮打开 ChangePasswordDialog', async () => {
    const user = userEvent.setup();
    renderWithQuery(<ProfileSheet open onOpenChange={vi.fn()} />);
    await user.click(screen.getByTestId('profile-change-password-btn'));
    expect(
      await screen.findByTestId('change-password-dialog'),
    ).toBeInTheDocument();
  });
});
