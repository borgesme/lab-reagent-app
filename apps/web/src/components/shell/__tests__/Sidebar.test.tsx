import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Sidebar } from '../Sidebar';
import { useAuth } from '@/lib/auth-store';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/users' }));

describe('Sidebar', () => {
  beforeEach(() => {
    useAuth.setState({
      tokens: { accessToken: 't', refreshToken: 'r' },
      user: { id: 'u1', email: 'a@b', name: 'A', labId: null, roles: ['SYS_ADMIN'] },
      hydrated: true,
    });
  });

  it('renders <aside> root (e2e selector compatibility)', () => {
    const { container } = render(<Sidebar />);
    expect(container.querySelector('aside')).toBeTruthy();
  });

  it('SYS_ADMIN sees 报表 group with all 4 reports', () => {
    render(<Sidebar />);
    const aside = document.querySelector('aside')!;
    expect(within(aside).getByRole('link', { name: '领用趋势' })).toBeInTheDocument();
    expect(within(aside).getByRole('link', { name: '库存周转' })).toBeInTheDocument();
    expect(within(aside).getByRole('link', { name: '采购金额' })).toBeInTheDocument();
    expect(within(aside).getByRole('link', { name: '管控审计' })).toBeInTheDocument();
  });

  it('PLAIN_USER sees only 领用趋势 (e2e Path 6 contract)', () => {
    useAuth.setState({
      tokens: { accessToken: 't', refreshToken: 'r' },
      user: { id: 'u2', email: 'p@b', name: 'P', labId: null, roles: ['PLAIN_USER'] },
      hydrated: true,
    });
    render(<Sidebar />);
    const aside = document.querySelector('aside')!;
    expect(within(aside).getByRole('link', { name: '领用趋势' })).toBeInTheDocument();
    expect(within(aside).queryByRole('link', { name: '库存周转' })).toBeNull();
    expect(within(aside).queryByRole('link', { name: '采购金额' })).toBeNull();
    expect(within(aside).queryByRole('link', { name: '管控审计' })).toBeNull();
  });

  it('marks active item by current pathname', () => {
    render(<Sidebar />);
    const link = screen.getByRole('link', { name: '用户' });
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(link.className).toContain('text-primary');
  });
});
