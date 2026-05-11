'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { FormDialog } from '@/components/data/FormDialog';
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
];

export default function LabsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const qc = useQueryClient();
  const labsQuery = useApiQuery<Lab[]>('/labs', { queryKey: ['labs'] });
  const data = labsQuery.data ?? [];
  const loading = labsQuery.isLoading;
  const refresh = () => qc.invalidateQueries({ queryKey: ['labs'] });
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (labsQuery.error) {
      toast.error((labsQuery.error as Error).message ?? '加载失败');
    }
  }, [labsQuery.error]);

  const defaultValues = useMemo(() => ({ name: '', building: '' }), []);

  return (
    <div>
      <PageHeader
        title="实验室管理"
        subtitle="系统在管实验室"
        actions={
          <Button onClick={() => setFormOpen(true)}>
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
        open={formOpen}
        onOpenChange={setFormOpen}
        schema={schema}
        defaultValues={defaultValues}
        title="新增实验室"
        onSubmit={async (values) => {
          try {
            await apiFetch('/labs', {
              method: 'POST',
              token,
              body: { name: values.name, building: values.building || undefined },
            });
            toast.success('已新增');
            setFormOpen(false);
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
                  <FormControl><Input {...field} /></FormControl>
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
                  <FormControl><Input {...field} placeholder="可选" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
      />
    </div>
  );
}
