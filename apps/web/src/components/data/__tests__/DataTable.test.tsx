import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../DataTable';

interface Row { name: string; age: number }
const cols: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: '名称' },
  { accessorKey: 'age', header: '年龄' },
];

describe('DataTable', () => {
  it('renders rows from data', () => {
    render(<DataTable columns={cols} data={[{ name: '张三', age: 30 }]} />);
    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('shows EmptyState when data is empty', () => {
    render(<DataTable columns={cols} data={[]} emptyTitle="无用户" />);
    expect(screen.getByText('无用户')).toBeInTheDocument();
  });

  it('shows skeleton when loading', () => {
    const { container } = render(<DataTable columns={cols} data={[]} loading testId="t" />);
    expect(container.querySelector('[data-testid="t"]')).toBeTruthy();
    // 5 skeleton rows
    expect(container.querySelectorAll('[data-testid="t"] > *')).toHaveLength(5);
  });
});
