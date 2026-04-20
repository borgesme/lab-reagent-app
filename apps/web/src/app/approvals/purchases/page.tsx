'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { RequireAuth } from '@/components/RequireAuth';
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
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    if (!token) return;
    try {
      const all = await apiFetch<PurchaseRow[]>('/purchases', { token });
      const g: Record<string, Group> = {};
      for (const p of all) {
        if (!p.batch || p.batch.status !== 'PENDING') continue;
        if (!g[p.batch.id]) {
          g[p.batch.id] = { batch: p.batch, items: [] };
        }
        g[p.batch.id].items.push(p);
      }
      setGroups(g);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function decide(batchId: string, action: 'APPROVE' | 'REJECT') {
    if (!token) return;
    try {
      await apiFetch(`/purchases/batches/${batchId}/approve`, {
        method: 'POST',
        token,
        body: { action, comment: comment[batchId] ?? '' },
      });
      setComment((c) => ({ ...c, [batchId]: '' }));
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <RequireAuth>
      <main className="p-6">
        <h1 className="text-2xl font-bold mb-4">采购批次审批</h1>
        {err && <p className="text-red-600 mb-2">{err}</p>}
        {Object.keys(groups).length === 0 && (
          <p className="text-gray-500">暂无待审批批次</p>
        )}
        {Object.entries(groups).map(([bid, g]) => (
          <div key={bid} className="border p-3 mb-3 rounded">
            <div className="font-semibold">
              批次 <span className="font-mono text-sm">{bid}</span>
            </div>
            <div className="text-sm text-gray-600">
              试剂 {g.batch.reagentId} 总量 {g.batch.totalQty} {g.batch.unit}
            </div>
            <ul className="text-sm mt-2 list-disc pl-5">
              {g.items.map((i) => (
                <li key={i.id}>
                  {i.applicant?.name ?? i.applicantId}: {i.quantity} {i.unit}
                  （{i.reason}）
                </li>
              ))}
            </ul>
            <input
              className="border w-full px-2 py-1 mt-2"
              placeholder="备注 / 拒绝理由"
              value={comment[bid] ?? ''}
              onChange={(e) =>
                setComment({ ...comment, [bid]: e.target.value })
              }
            />
            <div className="mt-2 flex gap-2">
              <button
                className="bg-green-600 text-white px-3 py-1 rounded"
                onClick={() => decide(bid, 'APPROVE')}
              >
                通过
              </button>
              <button
                className="bg-red-600 text-white px-3 py-1 rounded"
                onClick={() => decide(bid, 'REJECT')}
              >
                拒绝
              </button>
            </div>
          </div>
        ))}
      </main>
    </RequireAuth>
  );
}
