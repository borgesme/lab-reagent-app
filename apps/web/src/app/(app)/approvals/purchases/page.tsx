'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { EmptyState } from '@/components/data/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import type {
  PurchaseBatchSummary,
  PurchaseRequestSummary,
} from '@app/shared';

type PurchaseRow = PurchaseRequestSummary & {
  reagent?: { id: string; name: string } | null;
  applicant?: { id: string; name: string; email: string } | null;
  batch?: PurchaseBatchSummary | null;
};
type Group = { batch: PurchaseBatchSummary; items: PurchaseRow[] };

export default function PurchaseApprovalsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [groups, setGroups] = useState<Record<string, Group>>({});
  const [comment, setComment] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const all = await apiFetch<PurchaseRow[]>('/purchases', { token });
      const g: Record<string, Group> = {};
      for (const p of all) {
        if (!p.batch || p.batch.status !== 'PENDING') continue;
        if (!g[p.batch.id]) g[p.batch.id] = { batch: p.batch, items: [] };
        g[p.batch.id].items.push(p);
      }
      setGroups(g);
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function decide(batchId: string, action: 'APPROVE' | 'REJECT') {
    try {
      await apiFetch(`/purchases/batches/${batchId}/approve`, {
        method: 'POST',
        token,
        body: { action, comment: comment[batchId] ?? '' },
      });
      setComment((c) => ({ ...c, [batchId]: '' }));
      toast.success(action === 'APPROVE' ? '已通过' : '已拒绝');
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? '操作失败');
    }
  }

  const entries = Object.entries(groups);

  return (
    <div>
      <PageHeader title="采购批次审批" subtitle="待审批的采购批次" />
      <main>
        {!loading && entries.length === 0 ? (
          <EmptyState title="暂无待审批批次" />
        ) : (
          <ul className="space-y-3" data-testid="purchase-approvals-list">
            {entries.map(([bid, g]) => (
              <li key={bid}>
                <Card className="p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold">批次</span>
                    <span className="font-mono text-xs text-muted-foreground">{bid}</span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    试剂 {g.batch.reagentId} · 总量 {g.batch.totalQty} {g.batch.unit}
                  </div>
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
                    {g.items.map((i) => (
                      <li key={i.id}>
                        {i.applicant?.name ?? i.applicantId}：{i.quantity}
                        {i.unit}（{i.reason}）
                      </li>
                    ))}
                  </ul>
                  <Textarea
                    className="mt-3"
                    rows={2}
                    placeholder="备注 / 拒绝理由（可选）"
                    value={comment[bid] ?? ''}
                    onChange={(e) =>
                      setComment({ ...comment, [bid]: e.target.value })
                    }
                    data-testid={`purchase-approvals-comment-${bid}`}
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={() => decide(bid, 'APPROVE')}
                      data-testid={`purchase-approvals-approve-${bid}`}
                    >
                      通过
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => decide(bid, 'REJECT')}
                      data-testid={`purchase-approvals-reject-${bid}`}
                    >
                      拒绝
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
