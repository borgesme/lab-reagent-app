'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { RequireAuth } from '@/components/RequireAuth';

interface Reagent {
  id: string;
  name: string;
  cas?: string | null;
  formula?: string | null;
  specification?: string | null;
  category?: string | null;
  hazardLevel: string;
  controlType?: string | null;
}

export default function ReagentsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [items, setItems] = useState<Reagent[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    try {
      const data = await apiFetch<Reagent[]>(
        `/reagents${q ? `?q=${encodeURIComponent(q)}` : ''}`,
        { token },
      );
      setItems(data);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <RequireAuth>
      <main className="p-6">
        <h1 className="text-2xl font-bold mb-4">试剂百科</h1>
        <div className="flex gap-2 mb-4">
          <input
            className="border p-2 flex-1"
            placeholder="搜索名称或 CAS 号"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') load();
            }}
          />
          <button
            className="bg-blue-600 text-white px-4"
            onClick={load}
          >
            搜索
          </button>
        </div>
        {err && <p className="text-red-600 mb-2">{err}</p>}
        <table className="w-full border">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-left">名称</th>
              <th className="p-2 text-left">CAS</th>
              <th className="p-2 text-left">分子式</th>
              <th className="p-2 text-left">规格</th>
              <th className="p-2 text-left">类别</th>
              <th className="p-2 text-left">危险等级</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.name}</td>
                <td className="p-2">{r.cas ?? '-'}</td>
                <td className="p-2">{r.formula ?? '-'}</td>
                <td className="p-2">{r.specification ?? '-'}</td>
                <td className="p-2">{r.category ?? '-'}</td>
                <td className="p-2">{r.hazardLevel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </RequireAuth>
  );
}
