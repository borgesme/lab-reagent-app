import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReagentsPage from '../page';
import { useAuth } from '@/lib/auth-store';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
  apiFetchRaw: vi.fn(),
  apiBaseUrl: '/api/v1',
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const reagentsFixture = [
  {
    id: 'r1',
    name: '乙醇',
    cas: '64-17-5',
    formula: 'C2H6O',
    specification: 'AR',
    category: '有机溶剂',
    hazardLevel: 'NORMAL',
  },
  {
    id: 'r2',
    name: '甲醇',
    cas: '67-56-1',
    formula: 'CH4O',
    specification: 'AR',
    category: '有机溶剂',
    hazardLevel: 'CONTROLLED',
    controlType: '易制毒',
  },
];

describe('/reagents page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: {
        id: 'u',
        email: 'u@lab.local',
        roles: ['SYS_ADMIN'],
      } as any,
      hydrated: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('渲染列表 + 管控试剂显示 controlType badge', async () => {
    mockApiFetch.mockResolvedValue(reagentsFixture);
    renderWithQuery(<ReagentsPage />);
    await waitFor(() => screen.getByText('乙醇'));
    expect(screen.getByText('甲醇')).toBeInTheDocument();
    expect(screen.getByText('易制毒')).toBeInTheDocument();
  });

  it('输入搜索 → debounce 300ms 后再次 GET 带 q 参数', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockApiFetch.mockResolvedValue(reagentsFixture);
    const user = userEvent.setup({
      pointerEventsCheck: 0,
      advanceTimers: vi.advanceTimersByTime,
    });
    renderWithQuery(<ReagentsPage />);

    await waitFor(() =>
      expect(
        mockApiFetch.mock.calls.find((c) => c[0] === '/reagents'),
      ).toBeDefined(),
    );

    const input = screen.getByPlaceholderText('搜索名称或 CAS 号');
    await user.type(input, '甲醇');

    act(() => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(
        mockApiFetch.mock.calls.some((c) => c[0] === '/reagents?q=%E7%94%B2%E9%86%87'),
      ).toBe(true);
    });
  });

  it('加载失败 → toast.error', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockRejectedValue(new Error('API 500: boom'));
    renderWithQuery(<ReagentsPage />);

    await waitFor(
      () => {
        expect(toast.error as any).toHaveBeenCalledWith(
          expect.stringContaining('boom'),
        );
      },
      { timeout: 5000 },
    );
  }, 10_000);

  it('PLAIN_USER 角色 → 无 create-btn / 行末无 actions 菜单', async () => {
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'u', email: 'u@lab.local', roles: ['PLAIN_USER'] } as any,
      hydrated: true,
    });
    mockApiFetch.mockResolvedValue(reagentsFixture);
    renderWithQuery(<ReagentsPage />);
    await waitFor(() => screen.getByText('乙醇'));

    expect(screen.queryByTestId('reagents-create-btn')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('reagents-row-r1-actions'),
    ).not.toBeInTheDocument();
  });

  it('REAGENT_ADMIN 角色 → 可见 create-btn 与行末 actions', async () => {
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: {
        id: 'admin',
        email: 'admin@lab.local',
        roles: ['REAGENT_ADMIN'],
      } as any,
      hydrated: true,
    });
    mockApiFetch.mockResolvedValue(reagentsFixture);
    renderWithQuery(<ReagentsPage />);
    await waitFor(() => screen.getByText('乙醇'));

    expect(screen.getByTestId('reagents-create-btn')).toBeInTheDocument();
    expect(
      screen.getByTestId('reagents-row-r1-actions'),
    ).toBeInTheDocument();
  });

  it('添加试剂 → POST /reagents body 含 8 字段 + dialog 关闭', async () => {
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path.startsWith('/reagents') && !opts?.method)
        return reagentsFixture;
      if (opts?.method === 'POST' && path === '/reagents')
        return { id: 'r-new' };
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<ReagentsPage />);
    await waitFor(() => screen.getByText('乙醇'));

    await user.click(screen.getByTestId('reagents-create-btn'));

    await user.type(
      await screen.findByTestId('reagents-create-name'),
      '丙酮',
    );
    await user.type(screen.getByTestId('reagents-create-cas'), '67-64-1');
    await user.type(screen.getByTestId('reagents-create-formula'), 'C3H6O');
    await user.type(screen.getByTestId('reagents-create-specification'), 'AR');
    await user.type(screen.getByTestId('reagents-create-category'), '有机溶剂');
    await user.type(
      screen.getByTestId('reagents-create-msds'),
      'https://example.com/msds.pdf',
    );

    await user.click(screen.getByTestId('reagents-create-hazard'));
    await user.click(await screen.findByRole('option', { name: 'DANGEROUS' }));

    await user.click(screen.getByTestId('reagents-create-submit'));

    await waitFor(() => {
      const post = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST' && c[0] === '/reagents',
      );
      expect(post).toBeDefined();
      expect(post![1].body).toMatchObject({
        name: '丙酮',
        cas: '67-64-1',
        formula: 'C3H6O',
        specification: 'AR',
        category: '有机溶剂',
        hazardLevel: 'DANGEROUS',
        msdsFileUrl: 'https://example.com/msds.pdf',
      });
      expect(post![1].body.controlType).toBeUndefined();
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId('reagents-create-name'),
      ).not.toBeInTheDocument();
    });
  });

  it('添加失败 → toast.error + dialog 保持打开', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path.startsWith('/reagents') && !opts?.method)
        return reagentsFixture;
      if (opts?.method === 'POST' && path === '/reagents')
        throw new Error('API 422: 名称重复');
      throw new Error('unmocked');
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<ReagentsPage />);
    await waitFor(() => screen.getByText('乙醇'));

    await user.click(screen.getByTestId('reagents-create-btn'));
    await user.type(
      await screen.findByTestId('reagents-create-name'),
      '丙酮',
    );
    await user.click(screen.getByTestId('reagents-create-hazard'));
    await user.click(await screen.findByRole('option', { name: 'NORMAL' }));
    await user.click(screen.getByTestId('reagents-create-submit'));

    await waitFor(() => {
      expect(toast.error as any).toHaveBeenCalled();
      expect(screen.getByTestId('reagents-create-name')).toBeInTheDocument();
    });
  });

  it('编辑试剂 → PATCH /reagents/{id} body 含改动字段 + dialog 关闭', async () => {
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path.startsWith('/reagents') && !opts?.method)
        return reagentsFixture;
      if (opts?.method === 'PATCH' && path === '/reagents/r1') return {};
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<ReagentsPage />);
    await waitFor(() => screen.getByText('乙醇'));

    await user.click(screen.getByTestId('reagents-row-r1-actions'));
    await user.click(screen.getByTestId('reagents-row-r1-edit'));

    const nameInput = await screen.findByTestId('reagents-edit-name');
    await user.clear(nameInput);
    await user.type(nameInput, '无水乙醇');

    await user.click(screen.getByTestId('reagents-edit-submit'));

    await waitFor(() => {
      const patch = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'PATCH' && c[0] === '/reagents/r1',
      );
      expect(patch).toBeDefined();
      expect(patch![1].body.name).toBe('无水乙醇');
      expect(patch![1].body.hazardLevel).toBe('NORMAL');
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId('reagents-edit-name'),
      ).not.toBeInTheDocument();
    });
  });

  it('删除试剂 → DELETE /reagents/{id} + toast 含试剂名', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path.startsWith('/reagents') && !opts?.method)
        return reagentsFixture;
      if (opts?.method === 'DELETE' && path === '/reagents/r1') return {};
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<ReagentsPage />);
    await waitFor(() => screen.getByText('乙醇'));

    await user.click(screen.getByTestId('reagents-row-r1-actions'));
    await user.click(screen.getByTestId('reagents-row-r1-delete'));

    await user.click(screen.getByTestId('reagents-delete-confirm'));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/reagents/r1',
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(
        (toast.success as any).mock.calls.some((c: any[]) =>
          String(c[0]).includes('乙醇'),
        ),
      ).toBe(true);
    });
  });

  it('hazardLevel=CONTROLLED → controlType Select 显示并能选, body 带 controlType', async () => {
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path.startsWith('/reagents') && !opts?.method)
        return reagentsFixture;
      if (opts?.method === 'POST' && path === '/reagents')
        return { id: 'r-new' };
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<ReagentsPage />);
    await waitFor(() => screen.getByText('乙醇'));

    await user.click(screen.getByTestId('reagents-create-btn'));
    await user.type(
      await screen.findByTestId('reagents-create-name'),
      '吗啡',
    );

    expect(
      screen.queryByTestId('reagents-create-control'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId('reagents-create-hazard'));
    await user.click(await screen.findByRole('option', { name: 'CONTROLLED' }));

    await user.click(
      await screen.findByTestId('reagents-create-control'),
    );
    await user.click(await screen.findByRole('option', { name: 'NARCOTIC' }));

    await user.click(screen.getByTestId('reagents-create-submit'));

    await waitFor(() => {
      const post = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST' && c[0] === '/reagents',
      );
      expect(post).toBeDefined();
      expect(post![1].body.hazardLevel).toBe('CONTROLLED');
      expect(post![1].body.controlType).toBe('NARCOTIC');
    });
  });

  it('hazardLevel=NORMAL → controlType 字段不渲染, body 不带 controlType', async () => {
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path.startsWith('/reagents') && !opts?.method)
        return reagentsFixture;
      if (opts?.method === 'POST' && path === '/reagents')
        return { id: 'r-new' };
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<ReagentsPage />);
    await waitFor(() => screen.getByText('乙醇'));

    await user.click(screen.getByTestId('reagents-create-btn'));
    await user.type(
      await screen.findByTestId('reagents-create-name'),
      '水',
    );

    expect(
      screen.queryByTestId('reagents-create-control'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId('reagents-create-submit'));

    await waitFor(() => {
      const post = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST' && c[0] === '/reagents',
      );
      expect(post).toBeDefined();
      expect(post![1].body.hazardLevel).toBe('NORMAL');
      expect(post![1].body.controlType).toBeUndefined();
    });
  });
});
