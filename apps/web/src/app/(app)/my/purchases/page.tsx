'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
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
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import type { PurchaseRequestSummary, ReagentSummary } from '@app/shared';

type PurchaseRow = PurchaseRequestSummary & {
  reagent?: { id: string; name: string } | null;
};

const schema = z.object({
  reagentId: z.string().min(1, '请选择试剂'),
  quantity: z.string().min(1, '数量必填'),
  unit: z.string().min(1, '单位必填'),
  reason: z.string().min(1, '采购理由必填'),
});

function statusVariant(s: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 'PENDING') return 'secondary';
  if (s === 'APPROVED') return 'default';
  if (s === 'REJECTED' || s === 'CANCELLED') return 'destructive';
  return 'outline';
}

export default function MyPurchasesPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [items, setItems] = useState<PurchaseRow[]>([]);
  const [reagents, setReagents] = useState<ReagentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [cancelling, setCancelling] = useState<PurchaseRow | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [list, rs] = await Promise.all([
        apiFetch<PurchaseRow[]>('/purchases/mine', { token }),
        apiFetch<ReagentSummary[]>('/reagents', { token }),
      ]);
      setItems(list);
      setReagents(rs);
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const defaultValues = useMemo(
    () => ({ reagentId: '', quantity: '', unit: 'mL', reason: '' }),
    [],
  );

  const columns: ColumnDef<PurchaseRow>[] = useMemo(
    () => [
      {
        id: 'createdAt',
        header: '时间',
        cell: ({ row }) =>
          new Date(row.original.createdAt).toLocaleString(),
      },
      {
        id: 'reagent',
        header: '试剂',
        cell: ({ row }) => row.original.reagent?.name ?? row.original.reagentId,
      },
      {
        id: 'qty',
        header: '数量',
        cell: ({ row }) => `${row.original.quantity} ${row.original.unit}`,
      },
      { accessorKey: 'reason', header: '理由' },
      {
        id: 'status',
        header: '状态',
        cell: ({ row }) => (
          <Badge variant={statusVariant(row.original.status)}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          row.original.status === 'PENDING' ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="操作">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setCancelling(row.original)}
                >
                  取消
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="我的采购申请"
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> 新采购申请
          </Button>
        }
      />
      <Card className="p-2">
        <DataTable
          columns={columns}
          data={items}
          loading={loading}
          testId="my-purchases-table"
          emptyTitle="暂无采购申请"
        />
      </Card>

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        schema={schema}
        defaultValues={defaultValues}
        title="新采购申请"
        onSubmit={async (values) => {
          try {
            await apiFetch('/purchases', { method: 'POST', token, body: values });
            toast.success('已提交');
            setFormOpen(false);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '提交失败');
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
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="quantity"
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
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>采购理由</FormLabel>
                  <FormControl><Textarea rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
      />

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title="取消采购申请"
        description={`确认取消该采购申请？`}
        confirmLabel="确认取消"
        onConfirm={async () => {
          if (!cancelling) return;
          try {
            await apiFetch(`/purchases/${cancelling.id}/cancel`, {
              method: 'POST',
              token,
            });
            toast.success('已取消');
            setCancelling(null);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '取消失败');
            throw e;
          }
        }}
      />
    </div>
  );
}
