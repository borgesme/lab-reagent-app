import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CommandPalette } from '../CommandPalette';
import { useAuth } from '@/lib/auth-store';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const fetchMock = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: any[]) => fetchMock(...args),
}));

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pushMock.mockClear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue([]);
    useAuth.setState({
      tokens: { accessToken: 't', refreshToken: 'r' },
      user: { id: 'u1', email: 'a@b', name: 'A', labId: null, roles: ['SYS_ADMIN'] },
      hydrated: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders dialog when open', () => {
    render(<CommandPalette open={true} onOpenChange={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not call apiFetch when query is empty', () => {
    render(<CommandPalette open={true} onOpenChange={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('debounces and calls apiFetch /reagents?q= after 250ms', () => {
    render(<CommandPalette open={true} onOpenChange={() => {}} />);
    const input = screen.getByPlaceholderText('搜索导航或试剂…');
    fireEvent.change(input, { target: { value: '乙醇' } });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/reagents?q='),
      expect.objectContaining({ token: 't' }),
    );
  });

  it('clicking a nav item calls router.push and onOpenChange(false)', () => {
    const onOpenChange = vi.fn();
    render(<CommandPalette open={true} onOpenChange={onOpenChange} />);
    const userLink = screen.getByText('用户');
    fireEvent.click(userLink);
    expect(pushMock).toHaveBeenCalledWith('/admin/users');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
