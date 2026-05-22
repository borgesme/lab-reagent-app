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
    roles: ['PLAIN_USER'],
  },
];
const labsFixture = [
  { id: 'lab-1', name: 'Lab A' },
  { id: 'lab-2', name: 'Lab B' },
];
const rolesFixture = [
  { id: 'r1', code: 'PLAIN_USER', name: '普通用户' },
  { id: 'r2', code: 'LAB_HEAD', name: '实验室负责人' },
  { id: 'r3', code: 'REAGENT_ADMIN', name: '试剂管理员' },
  { id: 'r4', code: 'SAFETY_OFFICER', name: '安全员' },
  { id: 'r5', code: 'SYS_ADMIN', name: '系统管理员' },
];

function pageMatches(path: string, prefix: string) {
  return path === prefix || path.startsWith(prefix + '?');
}

describe('/admin/users page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'admin', email: 'admin@lab.local' } as any,
      hydrated: true,
    });
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (pageMatches(path, '/users/page') && (!opts || !opts.method))
        return {
          items: usersFixture,
          total: usersFixture.length,
          pageNum: 1,
          pageSize: 10,
        };
      if (path === '/labs') return labsFixture;
      if (path === '/roles') return rolesFixture;
      if (opts?.method === 'PATCH') return {};
      if (opts?.method === 'DELETE') return {};
      if (opts?.method === 'POST' && path === '/users') return { id: 'u2' };
      if (opts?.method === 'POST' && path.endsWith('/reset-password'))
        return { tempPassword: 'AbCd1234' };
      if (opts?.method === 'POST' && path === '/users/batch-delete')
        return { deleted: (opts.body?.ids ?? []).length };
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
      if (pageMatches(path, '/users/page') && (!opts || !opts.method))
        return {
          items: usersFixture,
          total: usersFixture.length,
          pageNum: 1,
          pageSize: 10,
        };
      if (path === '/labs') return labsFixture;
      if (path === '/roles') return rolesFixture;
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

  it('删除用户 → DELETE 调用 + dialog 关闭 + toast', async () => {
    const { toast } = await import('sonner');
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<UsersPage />);

    await waitFor(() => screen.getByText('Alice'));
    await user.click(screen.getByTestId('admin-users-row-u1-actions'));
    await user.click(screen.getByTestId('admin-users-row-u1-delete'));

    await user.click(screen.getByTestId('admin-users-delete-confirm'));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/users/u1',
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(
        (toast.success as any).mock.calls.some((c: any[]) =>
          String(c[0]).includes('alice@lab.local'),
        ),
      ).toBe(true);
    });
  });

  it('添加用户 → POST /users + body 含 email/password/roles + dialog 关闭', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<UsersPage />);

    await waitFor(() => screen.getByText('Alice'));
    await user.click(screen.getByTestId('admin-users-create-btn'));

    await user.type(
      await screen.findByTestId('admin-users-create-email'),
      'bob@lab.local',
    );
    await user.type(screen.getByTestId('admin-users-create-name'), 'Bob');
    await user.type(
      screen.getByTestId('admin-users-create-password'),
      'Bob12345',
    );
    await user.type(
      screen.getByTestId('admin-users-create-password-confirm'),
      'Bob12345',
    );

    await user.click(screen.getByTestId('admin-users-create-submit'));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST' && c[0] === '/users',
      );
      expect(postCall).toBeDefined();
      expect(postCall![1].body).toMatchObject({
        email: 'bob@lab.local',
        name: 'Bob',
        password: 'Bob12345',
        roles: ['PLAIN_USER'],
      });
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId('admin-users-create-email'),
      ).not.toBeInTheDocument();
    });
  });

  it('创建失败 → toast.error 且 dialog 不关', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (pageMatches(path, '/users/page') && (!opts || !opts.method))
        return {
          items: usersFixture,
          total: usersFixture.length,
          pageNum: 1,
          pageSize: 10,
        };
      if (path === '/labs') return labsFixture;
      if (path === '/roles') return rolesFixture;
      if (opts?.method === 'POST' && path === '/users')
        throw new Error('API 409: email exists');
      throw new Error('unmocked');
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<UsersPage />);
    await waitFor(() => screen.getByText('Alice'));

    await user.click(screen.getByTestId('admin-users-create-btn'));
    await user.type(
      await screen.findByTestId('admin-users-create-email'),
      'bob@lab.local',
    );
    await user.type(screen.getByTestId('admin-users-create-name'), 'Bob');
    await user.type(
      screen.getByTestId('admin-users-create-password'),
      'Bob12345',
    );
    await user.type(
      screen.getByTestId('admin-users-create-password-confirm'),
      'Bob12345',
    );
    await user.click(screen.getByTestId('admin-users-create-submit'));

    await waitFor(() => {
      expect(toast.error as any).toHaveBeenCalled();
      expect(
        screen.queryByTestId('admin-users-create-email'),
      ).toBeInTheDocument();
    });
  });

  it('多选 + 批量删除 → POST /users/batch-delete + ids 列表 + toast', async () => {
    const { toast } = await import('sonner');
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<UsersPage />);
    await waitFor(() => screen.getByText('Alice'));

    await user.click(screen.getByTestId('admin-users-table-row-u1-select'));
    expect(screen.getByTestId('admin-users-selected-count')).toHaveTextContent(
      '已选 1 项',
    );

    await user.click(screen.getByTestId('admin-users-batch-delete-btn'));
    await user.click(screen.getByTestId('admin-users-batch-delete-confirm'));

    await waitFor(() => {
      const call = mockApiFetch.mock.calls.find(
        (c) =>
          c[1]?.method === 'POST' && c[0] === '/users/batch-delete',
      );
      expect(call).toBeDefined();
      expect(call![1].body.ids).toEqual(['u1']);
      expect(toast.success as any).toHaveBeenCalled();
    });
  });

  it('分页接口被调用,query 含 pageNum/pageSize', async () => {
    renderWithQuery(<UsersPage />);
    await waitFor(() => screen.getByText('Alice'));
    const call = mockApiFetch.mock.calls.find((c) =>
      String(c[0]).startsWith('/users/page'),
    );
    expect(call).toBeDefined();
    expect(call![0]).toMatch(/pageNum=1/);
    expect(call![0]).toMatch(/pageSize=10/);
  });

  it('密码字段默认 type=password，点击 eye 切到 text', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<UsersPage />);
    await waitFor(() => screen.getByText('Alice'));
    await user.click(screen.getByTestId('admin-users-create-btn'));

    const pwd = await screen.findByTestId('admin-users-create-password');
    expect(pwd).toHaveAttribute('type', 'password');

    await user.click(
      screen.getByTestId('admin-users-create-password-toggle'),
    );
    expect(pwd).toHaveAttribute('type', 'text');

    await user.click(
      screen.getByTestId('admin-users-create-password-toggle'),
    );
    expect(pwd).toHaveAttribute('type', 'password');
  });

  it('两次密码不一致 → 不调用 POST /users，显示校验信息', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<UsersPage />);
    await waitFor(() => screen.getByText('Alice'));
    await user.click(screen.getByTestId('admin-users-create-btn'));

    await user.type(
      await screen.findByTestId('admin-users-create-email'),
      'bob@lab.local',
    );
    await user.type(screen.getByTestId('admin-users-create-name'), 'Bob');
    await user.type(
      screen.getByTestId('admin-users-create-password'),
      'Bob12345',
    );
    await user.type(
      screen.getByTestId('admin-users-create-password-confirm'),
      'Bob99999',
    );

    await user.click(screen.getByTestId('admin-users-create-submit'));

    await waitFor(() => {
      expect(screen.getByText('两次密码不一致')).toBeInTheDocument();
    });
    const postCalls = mockApiFetch.mock.calls.filter(
      (c) => c[1]?.method === 'POST' && c[0] === '/users',
    );
    expect(postCalls.length).toBe(0);
  });
});
