'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface RequestItem {
  id: string;
  status: string;
  quantity: string;
  unit: string;
  purpose: string;
  createdAt: string;
  reagent: { name: string };
  stock: { batchNo?: string | null };
  applicant: { name: string; email: string };
}

export default function IssuesPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [pending, setPending] = useState<RequestItem[]>([]);
  const [issued, setIssued] = useState<RequestItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [qtyById, setQtyById] = useState<Record<string, string>>({});

  async function refresh() {
    if (!token) return;
    try {
      const [ap, iss] = await Promise.all([
        apiFetch<RequestItem[]>('/requests?status=APPROVED', { token }),
        apiFetch<RequestItem[]>('/requests?status=ISSUED', { token }),
      ]);
      setPending(ap);
      setIssued(iss);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function issue(r: RequestItem) {
    const actualQty = qtyById[r.id] ?? r.quantity;
    try {
      await apiFetch(`/requests/${r.id}/issues`, {
        method: 'POST',
        token,
        body: { actualQty },
      });
      setQtyById((m) => ({ ...m, [r.id]: '' }));
      refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">发放管理</h2>
      {err && <p className="text-red-600 mb-2">{err}</p>}

      <h3 className="font-semibold mt-4 mb-2">待发放</h3>
      {pending.length === 0 && <p className="text-gray-500">无</p>}
      <ul className="space-y-2 mb-6">
        {pending.map((r) => (
          <li key={r.id} className="border p-3 rounded flex justify-between">
            <div>
              <div className="font-medium">
                {r.reagent.name} · 批号 {r.stock.batchNo ?? '-'} · 申请
                {r.quantity}
                {r.unit}
              </div>
              <div className="text-sm text-gray-700">
                {r.applicant.name} · {r.purpose}
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <input
                className="border p-1 w-24 text-sm"
                placeholder={`实际量 (${r.unit})`}
                value={qtyById[r.id] ?? ''}
                onChange={(e) =>
                  setQtyById((m) => ({ ...m, [r.id]: e.target.value }))
                }
              />
              <button
                className="bg-blue-600 text-white px-3 py-1 text-sm"
                onClick={() => issue(r)}
              >
                发放
              </button>
            </div>
          </li>
        ))}
      </ul>

      <h3 className="font-semibold mt-4 mb-2">已发放台账</h3>
      <table className="w-full border">
        <thead>
          <tr className="bg-gray-50">
            <th className="p-2 text-left">试剂</th>
            <th className="p-2 text-left">批号</th>
            <th className="p-2 text-left">申请量</th>
            <th className="p-2 text-left">领用人</th>
            <th className="p-2 text-left">用途</th>
            <th className="p-2 text-left">提交时间</th>
          </tr>
        </thead>
        <tbody>
          {issued.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2">{r.reagent.name}</td>
              <td className="p-2">{r.stock.batchNo ?? '-'}</td>
              <td className="p-2">
                {r.quantity} {r.unit}
              </td>
              <td className="p-2">{r.applicant.name}</td>
              <td className="p-2">{r.purpose}</td>
              <td className="p-2">
                {r.createdAt.slice(0, 16).replace('T', ' ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
