import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumb } from '../Breadcrumb';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/users' }));

describe('Breadcrumb', () => {
  it('renders group + item label for /admin/users', () => {
    render(<Breadcrumb />);
    expect(screen.getByText('管理')).toBeInTheDocument();
    expect(screen.getByText('用户')).toBeInTheDocument();
  });
});
