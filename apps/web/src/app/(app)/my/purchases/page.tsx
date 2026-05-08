'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { RequireAuth } from '@/components/RequireAuth';
import type { PurchaseRequestSummary, ReagentSummary } from '@app/shared';

type PurchaseRow = PurchaseRequestSummary & {
  reagent?: { id: string; name: string } | null;
};

export default function MyPurchasesPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [items, setItems] = useState<PurchaseRow[]>([]);
  const [reagents, setReagents] = useState<ReagentSummary[]>([]);
  const [form, setForm] = useState({
    reagentId: '',
    quantity: '',
    unit: 'mL',
    reason: '',
  });
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    if (!token) return;
    try {
      const [list, rs] = await Promise.all([
        apiFetch<PurchaseRow[]>('/purchases/mine', { token }),
        apiFetch<ReagentSummary[]>('/reagents', { token }),
      ]);
      setItems(list);
      setReagents(rs);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/purchases', {
        method: 'POST',
        token,
        body: form,
      });
      setForm({ reagentId: '', quantity: '', unit: 'mL', reason: '' });
      setErr(null);
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function cancel(id: string) {
    if (!token) return;
    try {
      await apiFetch(`/purchases/${id}/cancel`, { method: 'POST', token });
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <RequireAuth>
      <main className="p-6">
        <h1 className="text-2xl font-bold mb-4">我的采购申请</h1>
        {err && <p className="text-red-600 mb-2">{err}</p>}

        <form
          onSubmit={submit}
          className="mb-6 border p-4 rounded space-y-2 bg-gray-50"
        >
          <div className="flex gap-2">
            <select
              className="border px-2 py-1"
              value={form.reagentId}
              onChange={(e) => setForm({ ...form, reagentId: e.target.value })}
              required
            >
              <option value="">选择试剂</option>
              {reagents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <input
              className="border px-2 py-1"
              placeholder="数量"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              required
            />
            <input
              className="border px-2 py-1 w-20"
              placeholder="单位"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              required
            />
          </div>
          <textarea
            className="border w-full px-2 py-1"
            placeholder="采购理由"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            required
          />
          <button className="bg-blue-600 text-white px-3 py-1 rounded">
            提交
          </button>
        </form>

        <table className="w-full border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-2 py-1">时间</th>
              <th className="border px-2 py-1">试剂</th>
              <th className="border px-2 py-1">数量</th>
              <th className="border px-2 py-1">理由</th>
              <th className="border px-2 py-1">状态</th>
              <th className="border px-2 py-1">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="border px-2 py-1">
                  {new Date(p.createdAt).toLocaleString()}
                </td>
                <td className="border px-2 py-1">
                  {p.reagent?.name ?? p.reagentId}
                </td>
                <td className="border px-2 py-1">
                  {p.quantity} {p.unit}
                </td>
                <td className="border px-2 py-1">{p.reason}</td>
                <td className="border px-2 py-1">{p.status}</td>
                <td className="border px-2 py-1">
                  {p.status === 'PENDING' && (
                    <button
                      className="text-red-600 underline"
                      onClick={() => cancel(p.id)}
                    >
                      取消
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </RequireAuth>
  );
}
