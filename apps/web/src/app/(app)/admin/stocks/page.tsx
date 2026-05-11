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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api-query';
import { useAuth } from '@/lib/auth-store';

interface Stock {
  id: string;
  batchNo?: string | null;
  currentQty: string;
  unit: string;
  location?: string | null;
  expireDate?: string | null;
  reagent: { id: string; name: string };
  lab: { id: string; name: string };
}
interface Reagent { id: string; name: string }
interface Lab { id: string; name: string }

const schema = z.object({
  reagentId: z.string().min(1, '请选择试剂'),
  labId: z.string().min(1, '请选择实验室'),
  batchNo: z.string().optional(),
  qty: z.string().min(1, '数量必填'),
  unit: z.string().min(1, '单位必填'),
  location: z.string().optional(),
});

const columns: ColumnDef<Stock>[] = [
  { id: 'reagent', header: '试剂', cell: ({ row }) => row.original.reagent.name },
  {
    id: 'batchNo',
    header: '批号',
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.batchNo ?? '—'}</span>
    ),
  },
  {
    id: 'qty',
    header: '当前量',
    cell: ({ row }) => `${row.original.currentQty} ${row.original.unit}`,
  },
  {
    id: 'location',
    header: '位置',
    cell: ({ row }) => row.original.location ?? '—',
  },
  {
    id: 'expire',
    header: '有效期',
    cell: ({ row }) =>
      row.original.expireDate ? row.original.expireDate.slice(0, 10) : '—',
  },
  { id: 'lab', header: '实验室', cell: ({ row }) => row.original.lab.name },
];

export default function StocksPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const qc = useQueryClient();
  const stocksQuery = useApiQuery<Stock[]>('/stocks', { queryKey: ['stocks'] });
  const reagentsQuery = useApiQuery<Reagent[]>('/reagents', {
    queryKey: ['reagents'],
  });
  const labsQuery = useApiQuery<Lab[]>('/labs', { queryKey: ['labs'] });
  const stocks = stocksQuery.data ?? [];
  const reagents = reagentsQuery.data ?? [];
  const labs = labsQuery.data ?? [];
  const loading =
    stocksQuery.isLoading || reagentsQuery.isLoading || labsQuery.isLoading;
  const refresh = () => qc.invalidateQueries({ queryKey: ['stocks'] });
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    const err =
      stocksQuery.error ?? reagentsQuery.error ?? labsQuery.error;
    if (err) toast.error((err as Error).message ?? '加载失败');
  }, [stocksQuery.error, reagentsQuery.error, labsQuery.error]);

  const defaultValues = useMemo(
    () => ({
      reagentId: '',
      labId: '',
      batchNo: '',
      qty: '',
      unit: 'g',
      location: '',
    }),
    [],
  );

  return (
    <div>
      <PageHeader
        title="库存管理"
        subtitle="试剂在库批次"
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> 入库
          </Button>
        }
      />
      <Card className="p-2">
        <DataTable
          columns={columns}
          data={stocks}
          loading={loading}
          testId="stocks-table"
          emptyTitle="暂无库存"
        />
      </Card>

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        schema={schema}
        defaultValues={defaultValues}
        title="入库"
        onSubmit={async (values) => {
          try {
            await apiFetch('/stocks', {
              method: 'POST',
              token,
              body: {
                reagentId: values.reagentId,
                labId: values.labId,
                batchNo: values.batchNo || undefined,
                initialQty: values.qty,
                currentQty: values.qty,
                unit: values.unit,
                location: values.location || undefined,
              },
            });
            toast.success('入库成功');
            setFormOpen(false);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '入库失败');
            throw e;
          }
        }}
        fields={(form) => (
          <>
            <FormField
              control={form.control}
              name="reagentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>试剂</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="选择试剂" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {reagents.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="labId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>实验室</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="选择实验室" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {labs.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="batchNo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>批号</FormLabel>
                  <FormControl><Input {...field} placeholder="可选" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="qty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>数量</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>单位</FormLabel>
                    <FormControl><Input {...field} placeholder="g / mL" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>存放位置</FormLabel>
                  <FormControl><Input {...field} placeholder="柜号-层号（可选）" /></FormControl>
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
