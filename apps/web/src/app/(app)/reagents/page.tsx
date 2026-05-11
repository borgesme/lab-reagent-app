'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { Toolbar } from '@/components/data/Toolbar';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useApiQuery } from '@/lib/use-api-query';

interface Reagent {
  id: string;
  name: string;
  cas?: string | null;
  formula?: string | null;
  specification?: string | null;
  category?: string | null;
  hazardLevel: string;
  controlType?: string | null;
}

function hazardVariant(level: string, controlType?: string | null) {
  if (level === 'CONTROLLED' || controlType) return 'destructive' as const;
  if (level === 'HIGH') return 'default' as const;
  return 'secondary' as const;
}

export default function ReagentsPage() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(handle);
  }, [q]);

  const reagentsQuery = useApiQuery<Reagent[]>('/reagents', {
    params: { q: debouncedQ || undefined },
    queryKey: ['reagents', debouncedQ],
  });
  const items = reagentsQuery.data ?? [];
  const loading = reagentsQuery.isLoading;

  useEffect(() => {
    if (reagentsQuery.error) {
      toast.error((reagentsQuery.error as Error).message ?? '加载失败');
    }
  }, [reagentsQuery.error]);

  const columns = useMemo<ColumnDef<Reagent>[]>(
    () => [
      {
        accessorKey: 'name',
        header: '名称',
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            <Badge variant={hazardVariant(row.original.hazardLevel, row.original.controlType)}>
              {row.original.controlType ?? row.original.hazardLevel}
            </Badge>
          </span>
        ),
      },
      {
        accessorKey: 'cas',
        header: 'CAS',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.cas ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'formula',
        header: '分子式',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.formula ?? '—'}</span>
        ),
      },
      { accessorKey: 'specification', header: '规格', cell: ({ row }) => row.original.specification ?? '—' },
      { accessorKey: 'category', header: '类别', cell: ({ row }) => row.original.category ?? '—' },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="试剂百科" subtitle="全部在管试剂" />
      <Toolbar
        filters={
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索名称或 CAS 号"
              className="pl-8"
            />
          </div>
        }
      />
      <Card className="p-2">
        <DataTable columns={columns} data={items} loading={loading} testId="reagents-table" emptyTitle="未找到试剂" />
      </Card>
    </div>
  );
}
