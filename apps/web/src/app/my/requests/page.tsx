'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { RequireAuth } from '@/components/RequireAuth';

interface Reagent {
  id: string;
  name: string;
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
  reagent: { name: string };
  stock: { batchNo?: string | null };
}

export default function MyRequestsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [reagents, setReagents] = useState<Reagent[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [reagentId, setReagentId] = useState('');
  const [stockId, setStockId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('mL');
  const [purpose, setPurpose] = useState('');

  async function refresh() {
    if (!token) return;
    try {
      const [r, rs, st] = await Promise.all([
        apiFetch<RequestItem[]>('/requests', { token }),
        apiFetch<Reagent[]>('/reagents', { token }),
        apiFetch<Stock[]>('/stocks', { token }),
      ]);
      setItems(r);
      setReagents(rs);
      setStocks(st);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/requests', {
        method: 'POST',
        token,
        body: { reagentId, stockId, quantity, unit, purpose },
      });
      setReagentId('');
      setStockId('');
      setQuantity('');
      setPurpose('');
      refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function onCancel(id: string) {
    try {
      await apiFetch(`/requests/${id}/cancel`, { method: 'POST', token });
      refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  const stocksForReagent = stocks.filter(
    (s) => !reagentId || s.reagent.id === reagentId,
  );

  return (
    <RequireAuth>
      <main className="p-6">
        <h1 className="text-2xl font-bold mb-4">我的申请</h1>
        {err && <p className="text-red-600 mb-2">{err}</p>}

        <form
          onSubmit={onSubmit}
          className="grid grid-cols-6 gap-2 mb-4 p-3 border rounded"
        >
          <select
            className="border p-2 col-span-2"
            value={reagentId}
            onChange={(e) => {
              setReagentId(e.target.value);
              setStockId('');
            }}
            required
          >
            <option value="">选择试剂</option>
            {reagents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            className="border p-2 col-span-2"
            value={stockId}
            onChange={(e) => setStockId(e.target.value)}
            required
          >
            <option value="">选择批次</option>
            {stocksForReagent.map((s) => (
              <option key={s.id} value={s.id}>
                {s.batchNo ?? '(无批号)'} · 余 {s.currentQty}
                {s.unit}
              </option>
            ))}
          </select>
          <input
            className="border p-2"
            placeholder="数量"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
          <input
            className="border p-2"
            placeholder="单位 g/mL"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            required
          />
          <input
            className="border p-2 col-span-5"
            placeholder="用途（必填）"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            required
          />
          <button className="bg-blue-600 text-white col-span-1">提交</button>
        </form>

        <table className="w-full border">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-left">试剂</th>
              <th className="p-2 text-left">批号</th>
              <th className="p-2 text-left">数量</th>
              <th className="p-2 text-left">用途</th>
              <th className="p-2 text-left">状态</th>
              <th className="p-2 text-left">提交时间</th>
              <th className="p-2 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.reagent.name}</td>
                <td className="p-2">{r.stock.batchNo ?? '-'}</td>
                <td className="p-2">
                  {r.quantity} {r.unit}
                </td>
                <td className="p-2">{r.purpose}</td>
                <td className="p-2">
                  {r.status}
                  {r.status === 'REJECTED' && r.rejectedReason && (
                    <span className="text-red-600 ml-1">
                      ({r.rejectedReason})
                    </span>
                  )}
                </td>
                <td className="p-2">{r.createdAt.slice(0, 16).replace('T', ' ')}</td>
                <td className="p-2">
                  {r.status === 'PENDING' && (
                    <button
                      className="text-red-600 underline"
                      onClick={() => onCancel(r.id)}
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
