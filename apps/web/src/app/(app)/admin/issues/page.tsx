'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { EmptyState } from '@/components/data/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface UserLite { id: string; name: string; email: string }
interface RequestItem {
  id: string;
  status: string;
  quantity: string;
  unit: string;
  purpose: string;
  createdAt: string;
  reagent: { name: string; hazardLevel?: string; controlType?: string | null };
  stock: { batchNo?: string | null };
  applicant: UserLite;
}

const issuedColumns: ColumnDef<RequestItem>[] = [
  { id: 'reagent', header: '试剂', cell: ({ row }) => row.original.reagent.name },
  {
    id: 'batchNo',
    header: '批号',
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.stock.batchNo ?? '—'}</span>
    ),
  },
  {
    id: 'qty',
    header: '申请量',
    cell: ({ row }) => `${row.original.quantity} ${row.original.unit}`,
  },
  { id: 'applicant', header: '领用人', cell: ({ row }) => row.original.applicant.name },
  { accessorKey: 'purpose', header: '用途' },
  {
    id: 'createdAt',
    header: '提交时间',
    cell: ({ row }) =>
      row.original.createdAt.slice(0, 16).replace('T', ' '),
  },
];

export default function IssuesPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [pending, setPending] = useState<RequestItem[]>([]);
  const [issued, setIssued] = useState<RequestItem[]>([]);
  const [witnesses, setWitnesses] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [qtyById, setQtyById] = useState<Record<string, string>>({});
  const [witnessById, setWitnessById] = useState<Record<string, string>>({});
  const sigRefs = useRef<Record<string, SignatureCanvas | null>>({});

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [ap, iss, users] = await Promise.all([
        apiFetch<RequestItem[]>('/requests?status=APPROVED', { token }),
        apiFetch<RequestItem[]>('/requests?status=ISSUED', { token }),
        apiFetch<UserLite[]>('/users', { token }).catch(() => [] as UserLite[]),
      ]);
      setPending(ap);
      setIssued(iss);
      setWitnesses(users);
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isCtrl = (r: RequestItem) =>
    r.reagent.hazardLevel === 'CONTROLLED' || !!r.reagent.controlType;

  async function issue(r: RequestItem) {
    const actualQty = qtyById[r.id] ?? r.quantity;
    try {
      const body: Record<string, unknown> = { actualQty };
      if (isCtrl(r)) {
        if (!witnessById[r.id]) throw new Error('请选择见证人');
        const sig = sigRefs.current[r.id];
        if (!sig || sig.isEmpty()) throw new Error('请领用人签名后再发放');
        body.witnessId = witnessById[r.id];
        body.signatureDataUrl = sig.toDataURL('image/png');
      }
      await apiFetch(`/requests/${r.id}/issues`, { method: 'POST', token, body });
      sigRefs.current[r.id]?.clear();
      setQtyById((m) => ({ ...m, [r.id]: '' }));
      setWitnessById((m) => ({ ...m, [r.id]: '' }));
      toast.success('已发放');
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? '发放失败');
    }
  }

  return (
    <div>
      <PageHeader title="发放管理" subtitle="待发放申请与已发放台账" />

      <h2 className="mb-3 text-base font-semibold">待发放</h2>
      {pending.length === 0 ? (
        <EmptyState title="暂无待发放申请" />
      ) : (
        <ul className="mb-6 space-y-3" data-testid="issues-pending">
          {pending.map((r) => {
            const ctrl = isCtrl(r);
            return (
              <li key={r.id}>
                <Card className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{r.reagent.name}</span>
                        {ctrl && <Badge variant="destructive">管控</Badge>}
                        <span className="text-sm text-muted-foreground">
                          批号 {r.stock.batchNo ?? '—'} · 申请 {r.quantity}
                          {r.unit}
                        </span>
                      </div>
                      <div className="text-sm">
                        {r.applicant.name} · {r.purpose}
                      </div>
                    </div>
                    <div className="flex items-end gap-2">
                      <Input
                        className="w-32"
                        placeholder={`实际量 (${r.unit})`}
                        value={qtyById[r.id] ?? ''}
                        onChange={(e) =>
                          setQtyById((m) => ({ ...m, [r.id]: e.target.value }))
                        }
                      />
                      {!ctrl && (
                        <Button size="sm" onClick={() => issue(r)}>发放</Button>
                      )}
                    </div>
                  </div>

                  {ctrl && (
                    <>
                      <Separator className="my-3" />
                      <div className="space-y-2">
                        <Select
                          value={witnessById[r.id] ?? ''}
                          onValueChange={(v) =>
                            setWitnessById((m) => ({ ...m, [r.id]: v }))
                          }
                        >
                          <SelectTrigger className="w-72">
                            <SelectValue placeholder="选择见证人" />
                          </SelectTrigger>
                          <SelectContent>
                            {witnesses.map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.name}（{u.email}）
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div>
                          <div className="mb-1 text-sm text-muted-foreground">
                            领用人签名
                          </div>
                          <SignatureCanvas
                            ref={(el) => {
                              sigRefs.current[r.id] = el;
                            }}
                            canvasProps={{
                              width: 400,
                              height: 120,
                              className: 'rounded border bg-background',
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-1 h-7 px-2 text-xs"
                            onClick={() => sigRefs.current[r.id]?.clear()}
                          >
                            清空签名
                          </Button>
                        </div>
                        <div className="flex justify-end">
                          <Button size="sm" onClick={() => issue(r)}>发放</Button>
                        </div>
                      </div>
                    </>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mb-3 text-base font-semibold">已发放台账</h2>
      <Card className="p-2">
        <DataTable
          columns={issuedColumns}
          data={issued}
          loading={loading}
          testId="issues-issued"
          emptyTitle="暂无已发放记录"
        />
      </Card>
    </div>
  );
}
