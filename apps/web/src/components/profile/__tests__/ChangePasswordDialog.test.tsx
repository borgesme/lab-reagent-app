import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangePasswordDialog } from '../ChangePasswordDialog';
import { useAuth } from '@/lib/auth-store';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('ChangePasswordDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'a1', refreshToken: 'r1' } as any,
      user: { id: 'u1', email: 'a@b', name: 'A', roles: ['SYS_ADMIN'] } as any,
      hydrated: true,
    });
  });

  it('新密码 < 8 显示客户端校验, 不发请求', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ChangePasswordDialog open onOpenChange={vi.fn()} />);
    await user.type(screen.getByTestId('pwd-current'), 'ok-curr-1');
    await user.type(screen.getByTestId('pwd-new'), 'short');
    await user.type(screen.getByTestId('pwd-confirm'), 'short');
    await user.click(screen.getByTestId('pwd-submit'));
    await waitFor(() => {
      expect(screen.getByText(/至少 8/)).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('确认密码不匹配 → 字段错误, 不发请求', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ChangePasswordDialog open onOpenChange={vi.fn()} />);
    await user.type(screen.getByTestId('pwd-current'), 'ok-curr-1');
    await user.type(screen.getByTestId('pwd-new'), 'longenough1');
    await user.type(screen.getByTestId('pwd-confirm'), 'different11');
    await user.click(screen.getByTestId('pwd-submit'));
    await waitFor(() => {
      expect(screen.getByText(/确认密码不一致/)).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('成功 → 调 setTokens 与 onOpenChange(false), 显示 toast', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ accessToken: 'a2', refreshToken: 'r2' }));
    vi.stubGlobal('fetch', fetchMock);
    const onOpenChange = vi.fn();
    render(<ChangePasswordDialog open onOpenChange={onOpenChange} />);
    await user.type(screen.getByTestId('pwd-current'), 'curr-good');
    await user.type(screen.getByTestId('pwd-new'), 'newpass-12');
    await user.type(screen.getByTestId('pwd-confirm'), 'newpass-12');
    await user.click(screen.getByTestId('pwd-submit'));
    await waitFor(() => {
      expect(useAuth.getState().tokens?.accessToken).toBe('a2');
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalled();
  });

  it('401 → 当前密码错字段错误', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauth', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ChangePasswordDialog open onOpenChange={vi.fn()} />);
    await user.type(screen.getByTestId('pwd-current'), 'wrong');
    await user.type(screen.getByTestId('pwd-new'), 'newpass-12');
    await user.type(screen.getByTestId('pwd-confirm'), 'newpass-12');
    await user.click(screen.getByTestId('pwd-submit'));
    await waitFor(() => {
      expect(screen.getByText(/当前密码不正确/)).toBeInTheDocument();
    });
  });
});
