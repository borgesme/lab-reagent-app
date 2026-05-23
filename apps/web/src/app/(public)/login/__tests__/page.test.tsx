import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginPage from '../page';
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

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>,
  );
}

describe('/login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockReset();
    useAuth.setState({ tokens: null, user: null, hydrated: true });
  });

  it('渲染表单元素 (邮箱/密码/按钮/标题)', () => {
    renderWithQuery(<LoginPage />);
    expect(screen.getByText('实验室试剂管理')).toBeInTheDocument();

    const email = screen.getByTestId('login-email') as HTMLInputElement;
    const password = screen.getByTestId('login-password') as HTMLInputElement;
    const submit = screen.getByTestId('login-submit');

    expect(email).toBeInTheDocument();
    expect(password).toBeInTheDocument();
    expect(submit).toBeInTheDocument();
    // defaultValues 已填
    expect(email.value).toBe('admin@lab.local');
    expect(password.value).toBe('admin123');
  });

  it('zod 校验错误 → 邮箱非法/密码过短均显示在 FormMessage', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<LoginPage />);

    const email = screen.getByTestId('login-email') as HTMLInputElement;
    const password = screen.getByTestId('login-password') as HTMLInputElement;

    await user.clear(email);
    await user.type(email, 'not-an-email');
    await user.clear(password);
    await user.type(password, '123');

    // fireEvent.submit 更可靠地触发 react-hook-form 校验
    const form = email.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('邮箱格式不正确')).toBeInTheDocument();
      expect(screen.getByText('密码至少 6 位')).toBeInTheDocument();
    });

    // 不应触发 apiFetch
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('成功登录 → setSession + router.push(\'/\')', async () => {
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/auth/login' && opts?.method === 'POST')
        return { accessToken: 'at', refreshToken: 'rt' };
      if (path === '/auth/me')
        return {
          id: 'u1',
          email: 'admin@lab.local',
          name: 'Admin',
          labId: null,
          roles: ['SYS_ADMIN'],
        };
      throw new Error(`unexpected path: ${path}`);
    });

    const setSessionSpy = vi.spyOn(useAuth.getState(), 'setSession');

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<LoginPage />);

    await user.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(setSessionSpy).toHaveBeenCalledWith(
        { accessToken: 'at', refreshToken: 'rt' },
        {
          id: 'u1',
          email: 'admin@lab.local',
          name: 'Admin',
          labId: null,
          roles: ['SYS_ADMIN'],
        },
      );
      expect(mockPush).toHaveBeenCalledWith('/');
    });

    // 验证两次 apiFetch 路径
    const loginCall = mockApiFetch.mock.calls.find(
      (c) => c[0] === '/auth/login',
    );
    expect(loginCall).toBeDefined();
    expect(loginCall![1]).toMatchObject({
      method: 'POST',
      body: { email: 'admin@lab.local', password: 'admin123' },
    });
    expect(
      mockApiFetch.mock.calls.find((c) => c[0] === '/auth/me'),
    ).toBeDefined();
  });

  it('登录失败 → toast.error 含 error.message', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/auth/login')
        throw new Error('API 401: 邮箱或密码错误');
      throw new Error(`unmocked ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<LoginPage />);

    await user.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(toast.error as any).toHaveBeenCalledWith(
        'API 401: 邮箱或密码错误',
      );
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  it('submitting 期间提交按钮 disabled', async () => {
    mockApiFetch.mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<LoginPage />);

    const submit = screen.getByTestId('login-submit');
    expect(submit).not.toBeDisabled();

    await user.click(submit);

    await waitFor(() => {
      expect(submit).toBeDisabled();
    });
  });
});
