'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Plus } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { isControlled } from '@app/shared';
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

interface Reagent {
  id: string;
  name: string;
  hazardLevel?: 'NORMAL' | 'DANGEROUS' | 'CONTROLLED';
  controlType?: string | null;
}
interface Stock {
  id: string;
  batchNo?: string | null;
  currentQty: string;
  unit: string;
  reagent: { id: string; name: string };
}
interface RequestItem {
  id: string;
  status: string;
  quantity: string;
  unit: string;
  purpose: string;
  createdAt: string;
  rejectedReason?: string | null;
  reagent: { name: string; hazardLevel?: string; controlType?: string | null };
  stock: { batchNo?: string | null };
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'PENDING') return 'secondary';
  if (status === 'APPROVED' || status === 'ISSUED' || status === 'FULFILLED') return 'default';
  if (status === 'REJECTED' || status === 'CANCELLED') return 'destructive';
  return 'outline';
}

export default function MyRequestsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [reagents, setReagents] = useState<Reagent[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [cancelling, setCancelling] = useState<RequestItem | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [r, rs, st] = await Promise.all([
        apiFetch<RequestItem[]>('/requests', { token }),
        apiFetch<Reagent[]>('/reagents', { token }),
        apiFetch<Stock[]>('/stocks', { token }),
      ]);
      setItems(r);
      setReagents(rs);
      setStocks(st);
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const schema = useMemo(
    () =>
      z
        .object({
          reagentId: z.string().min(1, '请选择试剂'),
          stockId: z.string().min(1, '请选择批次'),
          quantity: z.string().min(1, '数量必填'),
          unit: z.string().min(1, '单位必填'),
          purpose: z.string().min(1, '用途必填'),
          projectRef: z.string().optional(),
          useLocation: z.string().optional(),
        })
        .superRefine((v, ctx) => {
          const reagent = reagents.find((r) => r.id === v.reagentId);
          if (!reagent) return;
          const ctrl = isControlled({
            hazardLevel: (reagent.hazardLevel ?? 'NORMAL') as any,
            controlType: (reagent.controlType ?? null) as any,
          });
          if (ctrl) {
            if (v.purpose.trim().length < 50) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['purpose'],
                message: '管控试剂用途需 ≥50 字',
              });
            }
            if (!v.projectRef) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['projectRef'],
                message: '管控试剂项目号必填',
              });
            }
            if (!v.useLocation) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['useLocation'],
                message: '管控试剂使用地点必填',
              });
            }
          }
        }),
    [reagents],
  );

  const defaultValues = useMemo(
    () => ({
      reagentId: '',
      stockId: '',
      quantity: '',
      unit: 'mL',
      purpose: '',
      projectRef: '',
      useLocation: '',
    }),
    [],
  );

  const columns: ColumnDef<RequestItem>[] = useMemo(
    () => [
      {
        id: 'reagent',
        header: '试剂',
        cell: ({ row }) => {
          const ctrl =
            row.original.reagent.hazardLevel === 'CONTROLLED' ||
            !!row.original.reagent.controlType;
          return (
            <span className="flex items-center gap-2">
              <span>{row.original.reagent.name}</span>
              {ctrl && <Badge variant="destructive">管控</Badge>}
            </span>
          );
        },
      },
      {
        id: 'batchNo',
        header: '批号',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.stock.batchNo ?? '—'}</span>
        ),
      },
      {
        id: 'qty',
        header: '数量',
        cell: ({ row }) => `${row.original.quantity} ${row.original.unit}`,
      },
      { accessorKey: 'purpose', header: '用途' },
      {
        id: 'status',
        header: '状态',
        cell: ({ row }) => (
          <span className="flex items-center gap-1">
            <Badge variant={statusVariant(row.original.status)}>
              {row.original.status}
            </Badge>
            {row.original.status === 'REJECTED' && row.original.rejectedReason && (
              <span className="text-xs text-muted-foreground">
                ({row.original.rejectedReason})
              </span>
            )}
          </span>
        ),
      },
      {
        id: 'createdAt',
        header: '提交时间',
        cell: ({ row }) =>
          row.original.createdAt.slice(0, 16).replace('T', ' '),
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
                  取消申请
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      },
    ],
    [],
  );

  return (
    <div data-testid="my-requests-page">
      <PageHeader
        title="我的申请"
        subtitle="试剂领用申请记录"
        actions={
          <Button
            onClick={() => setFormOpen(true)}
            data-testid="my-requests-add"
          >
            <Plus className="mr-2 h-4 w-4" /> 新申请
          </Button>
        }
      />
      <Card className="p-2">
        <DataTable
          columns={columns}
          data={items}
          loading={loading}
          testId="my-requests-table"
          emptyTitle="暂无申请"
        />
      </Card>

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        schema={schema}
        defaultValues={defaultValues}
        title="新建领用申请"
        description="管控试剂用途需 ≥50 字，项目号、使用地点必填"
        testId="my-requests-form"
        onSubmit={async (values) => {
          try {
            await apiFetch('/requests', {
              method: 'POST',
              token,
              body: {
                reagentId: values.reagentId,
                stockId: values.stockId,
                quantity: values.quantity,
                unit: values.unit,
                purpose: values.purpose,
                projectRef: values.projectRef || undefined,
                useLocation: values.useLocation || undefined,
              },
            });
            toast.success('已提交');
            setFormOpen(false);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '提交失败');
            throw e;
          }
        }}
        fields={(form) => {
          const reagentId = form.watch('reagentId');
          const stocksForReagent = stocks.filter(
            (s) => !reagentId || s.reagent.id === reagentId,
          );
          return (
            <>
              <FormField
                control={form.control}
                name="reagentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>试剂</FormLabel>
                    <Select
                      onValueChange={(v) => {
                        field.onChange(v);
                        form.setValue('stockId', '');
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="my-requests-form-reagent"><SelectValue placeholder="选择试剂" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {reagents.map((r) => {
                          const ctrl = r.hazardLevel === 'CONTROLLED' || !!r.controlType;
                          return (
                            <SelectItem
                              key={r.id}
                              value={r.id}
                              data-controlled={ctrl ? 'true' : 'false'}
                            >
                              {r.name}
                              {ctrl ? '（管控）' : ''}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stockId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>批次</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="my-requests-form-stock"><SelectValue placeholder="选择批次" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {stocksForReagent.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.batchNo ?? '(无批号)'} · 余 {s.currentQty}{s.unit}
                          </SelectItem>
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
                      <FormControl><Input data-testid="my-requests-form-qty" {...field} /></FormControl>
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
                name="purpose"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>用途</FormLabel>
                    <FormControl><Textarea rows={3} data-testid="my-requests-form-purpose" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="projectRef"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>项目号</FormLabel>
                      <FormControl><Input data-testid="my-requests-form-project" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="useLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>使用地点</FormLabel>
                      <FormControl><Input data-testid="my-requests-form-location" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </>
          );
        }}
      />

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title="取消申请"
        description={`确认取消"${cancelling?.reagent.name}"的申请？`}
        confirmLabel="确认取消"
        testId="my-requests-cancel"
        onConfirm={async () => {
          if (!cancelling) return;
          try {
            await apiFetch(`/requests/${cancelling.id}/cancel`, {
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
