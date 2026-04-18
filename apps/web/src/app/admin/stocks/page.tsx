'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface Stock {
  id: string;
  batchNo?: string | null;
  currentQty: string;
  unit: string;
  location?: string | null;
  expireDate?: string | null;
  reagent: { id: string; name: string };
  lab: { id: string; name: string };
}

interface Reagent {
  id: string;
  name: string;
}

interface Lab {
  id: string;
  name: string;
}

export default function StocksPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [reagents, setReagents] = useState<Reagent[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [reagentId, setReagentId] = useState('');
  const [labId, setLabId] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('g');
  const [location, setLocation] = useState('');

  async function refresh() {
    if (!token) return;
    try {
      const [s, r, l] = await Promise.all([
        apiFetch<Stock[]>('/stocks', { token }),
        apiFetch<Reagent[]>('/reagents', { token }),
        apiFetch<Lab[]>('/labs', { token }),
      ]);
      setStocks(s);
      setReagents(r);
      setLabs(l);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onInbound(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/stocks', {
        method: 'POST',
        token,
        body: {
          reagentId,
          labId,
          batchNo: batchNo || undefined,
          initialQty: qty,
          currentQty: qty,
          unit,
          location: location || undefined,
        },
      });
      setBatchNo('');
      setQty('');
      setLocation('');
      refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">库存管理</h2>
      {err && <p className="text-red-600 mb-2">{err}</p>}

      <form
        onSubmit={onInbound}
        className="grid grid-cols-6 gap-2 mb-4 p-3 border rounded"
      >
        <select
          className="border p-2 col-span-2"
          value={reagentId}
          onChange={(e) => setReagentId(e.target.value)}
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
          className="border p-2"
          value={labId}
          onChange={(e) => setLabId(e.target.value)}
          required
        >
          <option value="">选择实验室</option>
          {labs.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <input
          className="border p-2"
          placeholder="批号"
          value={batchNo}
          onChange={(e) => setBatchNo(e.target.value)}
        />
        <input
          className="border p-2"
          placeholder="数量"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
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
          placeholder="存放位置（柜号-层号）"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <button className="bg-blue-600 text-white col-span-1">入库</button>
      </form>

      <table className="w-full border">
        <thead>
          <tr className="bg-gray-50">
            <th className="p-2 text-left">试剂</th>
            <th className="p-2 text-left">批号</th>
            <th className="p-2 text-left">当前量</th>
            <th className="p-2 text-left">单位</th>
            <th className="p-2 text-left">位置</th>
            <th className="p-2 text-left">有效期</th>
            <th className="p-2 text-left">实验室</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="p-2">{s.reagent.name}</td>
              <td className="p-2">{s.batchNo ?? '-'}</td>
              <td className="p-2">{s.currentQty}</td>
              <td className="p-2">{s.unit}</td>
              <td className="p-2">{s.location ?? '-'}</td>
              <td className="p-2">
                {s.expireDate ? s.expireDate.slice(0, 10) : '-'}
              </td>
              <td className="p-2">{s.lab.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
