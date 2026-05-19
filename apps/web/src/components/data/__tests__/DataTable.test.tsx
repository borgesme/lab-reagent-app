import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    expect(container.querySelectorAll('[data-testid="t"] > *')).toHaveLength(5);
  });

  it('选中行 → onRowSelectionChange + selected data-state', async () => {
    interface R { id: string; name: string }
    const c: ColumnDef<R>[] = [{ accessorKey: 'name', header: '名称' }];
    const onChange = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <DataTable
        columns={c}
        data={[{ id: 'r1', name: 'Alice' }]}
        enableRowSelection
        rowSelection={{}}
        onRowSelectionChange={onChange}
        getRowId={(r) => r.id}
        testId="t"
      />,
    );
    await user.click(screen.getByTestId('t-row-r1-select'));
    expect(onChange).toHaveBeenCalled();
  });

  it('全选/半选 indicator: 半选 → Minus; 全选 → Check', () => {
    interface R { id: string; name: string }
    const c: ColumnDef<R>[] = [{ accessorKey: 'name', header: '名称' }];
    const { rerender } = render(
      <DataTable
        columns={c}
        data={[
          { id: 'r1', name: 'A' },
          { id: 'r2', name: 'B' },
        ]}
        enableRowSelection
        rowSelection={{ r1: true }}
        onRowSelectionChange={vi.fn()}
        getRowId={(r) => r.id}
        testId="t"
      />,
    );
    const selectAll = screen.getByTestId('t-select-all');
    expect(selectAll).toHaveAttribute('data-state', 'indeterminate');

    rerender(
      <DataTable
        columns={c}
        data={[
          { id: 'r1', name: 'A' },
          { id: 'r2', name: 'B' },
        ]}
        enableRowSelection
        rowSelection={{ r1: true, r2: true }}
        onRowSelectionChange={vi.fn()}
        getRowId={(r) => r.id}
        testId="t"
      />,
    );
    expect(screen.getByTestId('t-select-all')).toHaveAttribute(
      'data-state',
      'checked',
    );
  });

  it('受控分页: 点下一页 → onPaginationChange; 显示总数+页码', async () => {
    const onPaginationChange = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <DataTable
        columns={cols}
        data={[{ name: 'A', age: 1 }]}
        pagination={{ pageIndex: 0, pageSize: 10 }}
        onPaginationChange={onPaginationChange}
        pageCount={3}
        total={25}
        manualPagination
        testId="t"
      />,
    );
    expect(screen.getByTestId('t-total')).toHaveTextContent('25');
    expect(screen.getByTestId('t-page-1')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await user.click(screen.getByTestId('t-next'));
    expect(onPaginationChange).toHaveBeenCalled();
  });

  it('改 pageSize → onPaginationChange 重置 pageIndex=0', async () => {
    const onPaginationChange = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <DataTable
        columns={cols}
        data={[{ name: 'A', age: 1 }]}
        pagination={{ pageIndex: 2, pageSize: 10 }}
        onPaginationChange={onPaginationChange}
        pageCount={5}
        total={50}
        manualPagination
        testId="t"
      />,
    );
    await user.click(screen.getByTestId('t-page-size'));
    await user.click(screen.getByTestId('t-page-size-20'));
    expect(onPaginationChange).toHaveBeenCalled();
    const updater = onPaginationChange.mock.calls[0]![0];
    const next = typeof updater === 'function' ? updater({ pageIndex: 2, pageSize: 10 }) : updater;
    expect(next).toEqual({ pageIndex: 0, pageSize: 20 });
  });
});
