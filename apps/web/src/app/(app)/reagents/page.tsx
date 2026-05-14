'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { HazardLevel, ControlType } from '@app/shared';
import { PageHeader } from '@/components/data/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { Toolbar } from '@/components/data/Toolbar';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useApiQuery } from '@/lib/use-api-query';
import { useAuth } from '@/lib/auth-store';

interface Reagent {
  id: string;
  name: string;
  cas?: string | null;
  formula?: string | null;
  specification?: string | null;
  category?: string | null;
  hazardLevel: HazardLevel;
  controlType?: ControlType | null;
  msdsFileUrl?: string | null;
}

function hazardVariant(level: HazardLevel, controlType?: ControlType | null) {
  if (level === 'CONTROLLED' || controlType) return 'destructive' as const;
  if (level === 'DANGEROUS') return 'default' as const;
  return 'secondary' as const;
}

export default function ReagentsPage() {
  const roles = useAuth((s) => s.user?.roles ?? []);
  const canWrite =
    roles.includes('SYS_ADMIN') || roles.includes('REAGENT_ADMIN');
  const qc = useQueryClient();

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
  const refresh = () => qc.invalidateQueries({ queryKey: ['reagents'] });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Reagent | null>(null);
  const [deleting, setDeleting] = useState<Reagent | null>(null);

  useEffect(() => {
    if (reagentsQuery.error) {
      toast.error((reagentsQuery.error as Error).message ?? '加载失败');
    }
  }, [reagentsQuery.error]);

  const columns = useMemo<ColumnDef<Reagent>[]>(() => {
    const base: ColumnDef<Reagent>[] = [
      {
        accessorKey: 'name',
        header: '名称',
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            <Badge
              variant={hazardVariant(
                row.original.hazardLevel,
                row.original.controlType,
              )}
            >
              {row.original.controlType ?? row.original.hazardLevel}
            </Badge>
          </span>
        ),
      },
      {
        accessorKey: 'cas',
        header: 'CAS',
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.cas ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'formula',
        header: '分子式',
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.formula ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'specification',
        header: '规格',
        cell: ({ row }) => row.original.specification ?? '—',
      },
      {
        accessorKey: 'category',
        header: '类别',
        cell: ({ row }) => row.original.category ?? '—',
      },
    ];

    if (!canWrite) return base;

    return [
      ...base,
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="操作"
                data-testid={`reagents-row-${row.original.id}-actions`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setEditing(row.original)}
                data-testid={`reagents-row-${row.original.id}-edit`}
              >
                编辑
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDeleting(row.original)}
                className="text-destructive focus:text-destructive"
                data-testid={`reagents-row-${row.original.id}-delete`}
              >
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ];
  }, [canWrite]);

  return (
    <div data-testid="reagents-page">
      <PageHeader
        title="试剂百科"
        subtitle="全部在管试剂"
        actions={
          canWrite ? (
            <Button
              onClick={() => setCreating(true)}
              data-testid="reagents-create-btn"
            >
              <Plus className="mr-2 h-4 w-4" /> 添加试剂
            </Button>
          ) : undefined
        }
      />
      <Toolbar
        filters={
          <div className="relative w-72">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
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
        <DataTable
          columns={columns}
          data={items}
          loading={loading}
          testId="reagents-table"
          emptyTitle="未找到试剂"
        />
      </Card>

      {/* dialog 实例在 Task 2/3/4 接入 */}
      {creating || editing || deleting ? null : null}
    </div>
  );
}
