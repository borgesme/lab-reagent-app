'use client';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from './EmptyState';

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  loading?: boolean;
  emptyTitle?: string;
  testId?: string;
  enableRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  getRowId?: (row: TData, index: number) => string;
  pagination?: PaginationState;
  onPaginationChange?: OnChangeFn<PaginationState>;
  pageCount?: number;
  total?: number;
  manualPagination?: boolean;
  pageSizeOptions?: number[];
}

export function DataTable<TData, TValue>({
  columns,
  data,
  loading,
  emptyTitle = '暂无数据',
  testId,
  enableRowSelection,
  rowSelection,
  onRowSelectionChange,
  getRowId,
  pagination,
  onPaginationChange,
  pageCount,
  total,
  manualPagination,
  pageSizeOptions = [10, 20, 50, 100],
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection,
    state: {
      ...(rowSelection !== undefined ? { rowSelection } : {}),
      ...(pagination !== undefined ? { pagination } : {}),
    },
    onRowSelectionChange,
    onPaginationChange,
    manualPagination,
    pageCount,
    getRowId,
  });

  if (loading) {
    return (
      <div className="space-y-2" data-testid={testId}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  const showPagination = pagination !== undefined && onPaginationChange !== undefined;
  const isEmpty = data.length === 0;

  return (
    <div className="space-y-3" data-testid={testId}>
      {isEmpty ? (
        <EmptyState title={emptyTitle} />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {enableRowSelection && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          table.getIsAllPageRowsSelected()
                            ? true
                            : table.getIsSomePageRowsSelected()
                              ? 'indeterminate'
                              : false
                        }
                        onCheckedChange={(v) =>
                          table.toggleAllPageRowsSelected(v === true)
                        }
                        aria-label="全选当前页"
                        data-testid={
                          testId ? `${testId}-select-all` : undefined
                        }
                      />
                    </TableHead>
                  )}
                  {hg.headers.map((h) => (
                    <TableHead key={h.id}>
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                >
                  {enableRowSelection && (
                    <TableCell className="w-10">
                      <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(v) => row.toggleSelected(v === true)}
                        aria-label="选中此行"
                        data-testid={
                          testId ? `${testId}-row-${row.id}-select` : undefined
                        }
                      />
                    </TableCell>
                  )}
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {showPagination && (
        <PaginationBar
          pageIndex={pagination!.pageIndex}
          pageSize={pagination!.pageSize}
          pageCount={pageCount ?? 0}
          total={total}
          pageSizeOptions={pageSizeOptions}
          onPageChange={(idx) =>
            onPaginationChange!((p) => ({
              pageIndex: idx,
              pageSize: (p as PaginationState | undefined)?.pageSize ?? pagination!.pageSize,
            }))
          }
          onPageSizeChange={(size) =>
            onPaginationChange!(() => ({ pageIndex: 0, pageSize: size }))
          }
          testId={testId}
        />
      )}
    </div>
  );
}

interface PaginationBarProps {
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  total?: number;
  pageSizeOptions: number[];
  onPageChange: (next: number) => void;
  onPageSizeChange: (size: number) => void;
  testId?: string;
}

function getPageList(
  current: number,
  pageCount: number,
): Array<number | 'ellipsis-left' | 'ellipsis-right'> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i);
  }
  const last = pageCount - 1;
  if (current <= 2) return [0, 1, 2, 3, 'ellipsis-right', last];
  if (current >= last - 2)
    return [0, 'ellipsis-left', last - 3, last - 2, last - 1, last];
  return [
    0,
    'ellipsis-left',
    current - 1,
    current,
    current + 1,
    'ellipsis-right',
    last,
  ];
}

function PaginationBar({
  pageIndex,
  pageSize,
  pageCount,
  total,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  testId,
}: PaginationBarProps) {
  const canPrev = pageIndex > 0;
  const canNext = pageIndex < pageCount - 1;
  const showingFrom = total === 0 ? 0 : pageIndex * pageSize + 1;
  const showingTo =
    total === undefined
      ? (pageIndex + 1) * pageSize
      : Math.min((pageIndex + 1) * pageSize, total);
  const disabledCls = 'pointer-events-none opacity-50';
  const pages = getPageList(pageIndex, Math.max(pageCount, 1));
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 text-sm"
      data-testid={testId ? `${testId}-pagination` : undefined}
    >
      <div className="flex items-center gap-3 text-muted-foreground">
        <div>
          {total !== undefined ? (
            <>
              共{' '}
              <span data-testid={testId ? `${testId}-total` : undefined}>
                {total}
              </span>{' '}
              条, 显示 {showingFrom}-{showingTo}
            </>
          ) : (
            <>
              第 {pageIndex + 1} / {Math.max(pageCount, 1)} 页
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span>每页</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger
              className="h-8 w-[72px]"
              data-testid={testId ? `${testId}-page-size` : undefined}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((n) => (
                <SelectItem
                  key={n}
                  value={String(n)}
                  data-testid={
                    testId ? `${testId}-page-size-${n}` : undefined
                  }
                >
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>条</span>
        </div>
      </div>
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              aria-disabled={!canPrev}
              tabIndex={canPrev ? 0 : -1}
              className={canPrev ? '' : disabledCls}
              onClick={(e) => {
                e.preventDefault();
                if (canPrev) onPageChange(pageIndex - 1);
              }}
              data-testid={testId ? `${testId}-prev` : undefined}
            />
          </PaginationItem>
          {pages.map((p) =>
            typeof p === 'number' ? (
              <PaginationItem key={p}>
                <PaginationLink
                  href="#"
                  isActive={p === pageIndex}
                  onClick={(e) => {
                    e.preventDefault();
                    if (p !== pageIndex) onPageChange(p);
                  }}
                  data-testid={
                    testId ? `${testId}-page-${p + 1}` : undefined
                  }
                >
                  {p + 1}
                </PaginationLink>
              </PaginationItem>
            ) : (
              <PaginationItem key={p}>
                <PaginationEllipsis />
              </PaginationItem>
            ),
          )}
          <PaginationItem>
            <PaginationNext
              href="#"
              aria-disabled={!canNext}
              tabIndex={canNext ? 0 : -1}
              className={canNext ? '' : disabledCls}
              onClick={(e) => {
                e.preventDefault();
                if (canNext) onPageChange(pageIndex + 1);
              }}
              data-testid={testId ? `${testId}-next` : undefined}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
