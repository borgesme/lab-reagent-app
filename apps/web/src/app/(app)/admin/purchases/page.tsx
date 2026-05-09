'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import type {
  PurchaseRequestSummary,
  PurchaseBatchSummary,
} from '@app/shared';

type PurchaseRow = PurchaseRequestSummary & {
  reagent?: { id: string; name: string } | null;
  applicant?: { id: string; name: string; email: string } | null;
  batch?: PurchaseBatchSummary | null;
};

const receiptSchema = z.object({
  actualQty: z.string().min(1, '实收数量必填'),
  batchNo: z.string().optional(),
  mfgDate: z.string().optional(),
  expireDate: z.string().optional(),
  location: z.string().optional(),
  supplier: z.string().optional(),
  purchasePrice: z.string().optional(),
});

const EMPTY_RECEIPT = {
  actualQty: '',
  batchNo: '',
  mfgDate: '',
  expireDate: '',
  location: '',
  supplier: '',
  purchasePrice: '',
};

export default function AdminPurchasesPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [pending, setPending] = useState<PurchaseRow[]>([]);
  const [batches, setBatches] = useState<PurchaseBatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [receiptFor, setReceiptFor] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const all = await apiFetch<PurchaseRow[]>('/purchases', { token });
      setPending(all.filter((p) => p.status === 'PENDING'));
      const map = new Map<string, PurchaseBatchSummary>();
      for (const p of all) {
        if (p.batch && !map.has(p.batch.id)) map.set(p.batch.id, p.batch);
      }
      setBatches(Array.from(map.values()));
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function toggle(id: string) {
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function merge() {
    if (!token || picked.size === 0) return;
    try {
      await apiFetch('/purchases/batches', {
        method: 'POST',
        token,
        body: { requestIds: Array.from(picked) },
      });
      toast.success('已合并');
      setPicked(new Set());
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? '合并失败');
    }
  }

  const pendingColumns: ColumnDef<PurchaseRow>[] = useMemo(
    () => [
      {
        id: 'pick',
        header: () => (
          <Checkbox
            checked={
              pending.length > 0 && picked.size === pending.length
            }
            onCheckedChange={(v) => {
              if (v) setPicked(new Set(pending.map((p) => p.id)));
              else setPicked(new Set());
            }}
            aria-label="全选"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={picked.has(row.original.id)}
            onCheckedChange={() => toggle(row.original.id)}
            aria-label="选择"
          />
        ),
      },
      {
        id: 'applicant',
        header: '申请人',
        cell: ({ row }) =>
          row.original.applicant?.name ?? row.original.applicantId,
      },
      {
        id: 'reagent',
        header: '试剂',
        cell: ({ row }) =>
          row.original.reagent?.name ?? row.original.reagentId,
      },
      {
        id: 'qty',
        header: '数量',
        cell: ({ row }) => `${row.original.quantity} ${row.original.unit}`,
      },
      { accessorKey: 'reason', header: '理由' },
    ],
    [pending, picked],
  );

  const batchColumns: ColumnDef<PurchaseBatchSummary>[] = useMemo(
    () => [
      {
        id: 'id',
        header: '批次',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.id.slice(0, 8)}</span>
        ),
      },
      { id: 'reagent', header: '试剂', cell: ({ row }) => row.original.reagentId },
      {
        id: 'qty',
        header: '总量',
        cell: ({ row }) => `${row.original.totalQty} ${row.original.unit}`,
      },
      {
        id: 'status',
        header: '状态',
        cell: ({ row }) => (
          <Badge variant={row.original.status === 'APPROVED' ? 'default' : 'secondary'}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }) =>
          row.original.status === 'APPROVED' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReceiptFor(row.original.id)}
            >
              入库
            </Button>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="采购管理"
        subtitle="待合并申请与批次入库"
        actions={
          <Button disabled={picked.size === 0} onClick={merge}>
            合并成批次（{picked.size}）
          </Button>
        }
      />

      <h2 className="mb-3 text-base font-semibold">待合并采购申请</h2>
      <Card className="mb-6 p-2">
        <DataTable
          columns={pendingColumns}
          data={pending}
          loading={loading}
          testId="purchases-pending"
          emptyTitle="无待合并申请"
        />
      </Card>

      <h2 className="mb-3 text-base font-semibold">批次</h2>
      <Card className="p-2">
        <DataTable
          columns={batchColumns}
          data={batches}
          loading={loading}
          testId="purchases-batches"
          emptyTitle="无批次"
        />
      </Card>

      <FormDialog
        open={!!receiptFor}
        onOpenChange={(o) => !o && setReceiptFor(null)}
        schema={receiptSchema}
        defaultValues={EMPTY_RECEIPT}
        title={`入库批次 ${receiptFor?.slice(0, 8) ?? ''}`}
        onSubmit={async (values) => {
          if (!receiptFor) return;
          try {
            await apiFetch(`/purchases/batches/${receiptFor}/receipt`, {
              method: 'POST',
              token,
              body: values,
            });
            toast.success('入库成功');
            setReceiptFor(null);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '入库失败');
            throw e;
          }
        }}
        fields={(form) => (
          <>
            {(
              [
                ['actualQty', '实收数量'],
                ['batchNo', '批号'],
                ['mfgDate', '生产日期'],
                ['expireDate', '有效期'],
                ['location', '存放位置'],
                ['supplier', '供应商'],
                ['purchasePrice', '采购单价'],
              ] as const
            ).map(([name, label]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </>
        )}
      />
    </div>
  );
}
