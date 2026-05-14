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
});
