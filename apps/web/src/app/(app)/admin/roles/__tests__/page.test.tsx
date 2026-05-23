import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RolesPage from '../page';
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

const rolesFixture = [
  { id: 'r1', code: 'PLAIN_USER', name: '普通用户', description: '默认角色' },
  { id: 'r2', code: 'LAB_HEAD', name: '实验室负责人', description: null },
  { id: 'r3', code: 'SYS_ADMIN', name: '系统管理员', description: '超级权限' },
];

describe('/admin/roles page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'admin', email: 'admin@lab.local' } as any,
      hydrated: true,
    });
  });

  it('loading 态: apiFetch 未 resolve → DataTable 显示 skeleton（无角色数据）', async () => {
    mockApiFetch.mockImplementation(
      (path: string) =>
        new Promise(() => {
          // never resolves
          void path;
        }),
    );

    renderWithQuery(<RolesPage />);

    // 表格容器存在但没有任何角色文字
    await waitFor(() => {
      expect(screen.getByTestId('roles-table')).toBeInTheDocument();
    });
    expect(screen.queryByText('PLAIN_USER')).not.toBeInTheDocument();
    expect(screen.queryByText('LAB_HEAD')).not.toBeInTheDocument();
  });

  it('列表渲染: 3 个角色全部渲染，description=null 显示 "—"', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/roles') return rolesFixture;
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<RolesPage />);

    await waitFor(() => {
      expect(screen.getByText('PLAIN_USER')).toBeInTheDocument();
      expect(screen.getByText('LAB_HEAD')).toBeInTheDocument();
      expect(screen.getByText('SYS_ADMIN')).toBeInTheDocument();
    });

    expect(screen.getByText('普通用户')).toBeInTheDocument();
    expect(screen.getByText('实验室负责人')).toBeInTheDocument();
    expect(screen.getByText('系统管理员')).toBeInTheDocument();

    // description 列：'默认角色' / '—' / '超级权限'
    const table = screen.getByTestId('roles-table');
    expect(within(table).getByText('默认角色')).toBeInTheDocument();
    expect(within(table).getByText('超级权限')).toBeInTheDocument();
    expect(within(table).getByText('—')).toBeInTheDocument();
  });

  it('加载失败 → toast.error 被调', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/roles') throw new Error('API 500: roles down');
      throw new Error(`unmocked ${path}`);
    });

    renderWithQuery(<RolesPage />);

    await waitFor(() => {
      expect(
        (toast.error as any).mock.calls.some((c: any[]) =>
          String(c[0]).includes('roles down'),
        ),
      ).toBe(true);
    });
  });
});
