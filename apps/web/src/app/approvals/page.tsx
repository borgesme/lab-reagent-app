'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { RequireAuth } from '@/components/RequireAuth';

interface RequestItem {
  id: string;
  quantity: string;
  unit: string;
  purpose: string;
  createdAt: string;
  reagent: { name: string };
  stock: { batchNo?: string | null };
  applicant: { name: string; email: string };
}

export default function ApprovalsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [commentById, setCommentById] = useState<Record<string, string>>({});

  async function refresh() {
    if (!token) return;
    try {
      const data = await apiFetch<RequestItem[]>('/requests?status=PENDING', {
        token,
      });
      setItems(data);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function decide(id: string, action: 'APPROVE' | 'REJECT') {
    try {
      await apiFetch(`/requests/${id}/approvals`, {
        method: 'POST',
        token,
        body: { action, comment: commentById[id] },
      });
      setCommentById((m) => ({ ...m, [id]: '' }));
      refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <RequireAuth>
      <main className="p-6">
        <h1 className="text-2xl font-bold mb-4">待我审批</h1>
        {err && <p className="text-red-600 mb-2">{err}</p>}
        {items.length === 0 && <p className="text-gray-500">暂无待审批申请</p>}
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="border p-3 rounded">
              <div className="flex justify-between">
                <div>
                  <div className="font-semibold">
                    {r.reagent.name}
                    <span className="text-gray-500 font-normal ml-2">
                      批号 {r.stock.batchNo ?? '-'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-700">
                    {r.applicant.name} ({r.applicant.email}) · 申请
                    {r.quantity}
                    {r.unit}
                  </div>
                  <div className="text-sm mt-1">用途：{r.purpose}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {r.createdAt.slice(0, 16).replace('T', ' ')}
                  </div>
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <input
                    className="border p-1 text-sm w-60"
                    placeholder="批注（可选，拒绝时作为原因）"
                    value={commentById[r.id] ?? ''}
                    onChange={(e) =>
                      setCommentById((m) => ({ ...m, [r.id]: e.target.value }))
                    }
                  />
                  <div className="flex gap-2">
                    <button
                      className="bg-green-600 text-white px-3 py-1 text-sm"
                      onClick={() => decide(r.id, 'APPROVE')}
                    >
                      通过
                    </button>
                    <button
                      className="bg-red-600 text-white px-3 py-1 text-sm"
                      onClick={() => decide(r.id, 'REJECT')}
                    >
                      拒绝
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </RequireAuth>
  );
}
