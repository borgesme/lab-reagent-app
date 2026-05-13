'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { FormDialog } from '@/components/data/FormDialog';
import { ConfirmDialog } from '@/components/data/ConfirmDialog';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiFetch } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api-query';
import { useAuth } from '@/lib/auth-store';

interface Lab {
  id: string;
  name: string;
  building?: string | null;
}

const schema = z.object({
  name: z.string().min(1, '名称必填'),
  building: z.string().optional(),
});

type LabValues = z.infer<typeof schema>;

const createDefaults: LabValues = { name: '', building: '' };

export default function LabsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const qc = useQueryClient();
  const labsQuery = useApiQuery<Lab[]>('/labs', { queryKey: ['labs'] });
  const data = labsQuery.data ?? [];
  const loading = labsQuery.isLoading;
  const refresh = () => qc.invalidateQueries({ queryKey: ['labs'] });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Lab | null>(null);
  const [deleting, setDeleting] = useState<Lab | null>(null);

  useEffect(() => {
    if (labsQuery.error) {
      toast.error((labsQuery.error as Error).message ?? '加载失败');
    }
  }, [labsQuery.error]);

  const editingDefaults: LabValues = useMemo(
    () => ({
      name: editing?.name ?? '',
      building: editing?.building ?? '',
    }),
    [editing],
  );

  const columns: ColumnDef<Lab>[] = [
    { accessorKey: 'name', header: '名称' },
    {
      id: 'building',
      header: '地点',
      cell: ({ row }) =>
        row.original.building ?? (
          <span className="text-muted-foreground">—</span>
        ),
    },
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
              data-testid={`labs-row-${row.original.id}-actions`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => setEditing(row.original)}
              data-testid={`labs-row-${row.original.id}-edit`}
            >
              编辑
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setDeleting(row.original)}
              className="text-destructive focus:text-destructive"
              data-testid={`labs-row-${row.original.id}-delete`}
            >
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div data-testid="admin-labs-page">
      <PageHeader
        title="实验室管理"
        subtitle="系统在管实验室"
        actions={
          <Button
            onClick={() => setCreating(true)}
            data-testid="labs-create-btn"
          >
            <Plus className="mr-2 h-4 w-4" /> 新增
          </Button>
        }
      />
      <Card className="p-2">
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          testId="labs-table"
          emptyTitle="暂无实验室"
        />
      </Card>

      <FormDialog
        open={creating}
        onOpenChange={setCreating}
        schema={schema}
        defaultValues={createDefaults}
        title="新增实验室"
        testId="labs-create"
        onSubmit={async (values) => {
          try {
            await apiFetch('/labs', {
              method: 'POST',
              token,
              body: {
                name: values.name,
                building: values.building || undefined,
              },
            });
            toast.success('已新增');
            setCreating(false);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '保存失败');
            throw e;
          }
        }}
        fields={(form) => (
          <>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>名称</FormLabel>
                  <FormControl>
                    <Input data-testid="labs-create-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="building"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>地点</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="labs-create-building"
                      placeholder="可选"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
      />

      <FormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        schema={schema}
        defaultValues={editingDefaults}
        title="编辑实验室"
        description={editing ? `修改 ${editing.name}` : ''}
        testId="labs-edit"
        onSubmit={async (values) => {
          if (!editing) return;
          try {
            await apiFetch(`/labs/${editing.id}`, {
              method: 'PATCH',
              token,
              body: {
                name: values.name,
                building: values.building || undefined,
              },
            });
            toast.success('已更新');
            setEditing(null);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '更新失败');
            throw e;
          }
        }}
        fields={(form) => (
          <>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>名称</FormLabel>
                  <FormControl>
                    <Input data-testid="labs-edit-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="building"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>地点</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="labs-edit-building"
                      placeholder="可选"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="删除实验室"
        description={`确认删除"${deleting?.name}"？该实验室会被软删除，关联的用户与库存不会被级联删除。`}
        confirmLabel="确认删除"
        destructive
        testId="labs-delete"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await apiFetch(`/labs/${deleting.id}`, {
              method: 'DELETE',
              token,
            });
            toast.success(`已删除 ${deleting.name}`);
            setDeleting(null);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '删除失败');
            throw e;
          }
        }}
      />
    </div>
  );
}
