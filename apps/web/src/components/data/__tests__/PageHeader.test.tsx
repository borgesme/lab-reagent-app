import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '../PageHeader';

describe('PageHeader', () => {
  it('renders title as h1 with testid', () => {
    render(<PageHeader title="试剂百科" />);
    const h = screen.getByTestId('page-header-title');
    expect(h.tagName).toBe('H1');
    expect(h).toHaveTextContent('试剂百科');
  });

  it('renders subtitle and actions when provided', () => {
    render(
      <PageHeader title="t" subtitle="s" actions={<button>新增</button>} />,
    );
    expect(screen.getByText('s')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新增' })).toBeInTheDocument();
  });
});
