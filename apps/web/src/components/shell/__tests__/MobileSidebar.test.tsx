import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileSidebar } from '../MobileSidebar';
import { useAuth } from '@/lib/auth-store';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/users',
  useRouter: () => ({ push: pushMock }),
}));

describe('MobileSidebar', () => {
  beforeEach(() => {
    pushMock.mockClear();
    useAuth.setState({
      tokens: { accessToken: 't', refreshToken: 'r' },
      user: { id: 'u1', email: 'a@b', name: 'A', labId: null, roles: ['SYS_ADMIN'] },
      hydrated: true,
    });
  });

  it('renders Sheet content when open', () => {
    render(<MobileSidebar open={true} onOpenChange={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '用户' })).toBeInTheDocument();
  });

  it('does not render content when closed', () => {
    render(<MobileSidebar open={false} onOpenChange={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clicking nav item calls router.push and onOpenChange(false)', () => {
    const onOpenChange = vi.fn();
    render(<MobileSidebar open={true} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('link', { name: '试剂百科' }));
    expect(pushMock).toHaveBeenCalledWith('/reagents');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('PLAIN_USER does not see 管理 group', () => {
    useAuth.setState({
      tokens: { accessToken: 't', refreshToken: 'r' },
      user: { id: 'u2', email: 'p@b', name: 'P', labId: null, roles: ['PLAIN_USER'] },
      hydrated: true,
    });
    render(<MobileSidebar open={true} onOpenChange={() => {}} />);
    expect(screen.queryByRole('link', { name: '用户' })).toBeNull();
  });
});
