import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="暂无数据" description="刷新试试" />);
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
    expect(screen.getByText('刷新试试')).toBeInTheDocument();
  });
});
