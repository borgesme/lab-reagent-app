'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import type { LabReagentConfigSummary, ReagentSummary } from '@app/shared';

interface Lab {
  id: string;
  name: string;
}

export default function AlertsConfigPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [items, setItems] = useState<LabReagentConfigSummary[]>([]);
  const [reagents, setReagents] = useState<ReagentSummary[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [form, setForm] = useState({
    labId: '',
    reagentId: '',
    safetyStock: '',
    expireWarningDays: '30',
  });
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    if (!token) return;
    try {
      const data = await apiFetch<LabReagentConfigSummary[]>(
        '/lab-reagent-configs',
        { token },
      );
      setItems(data);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    refresh();
    if (token) {
      apiFetch<ReagentSummary[]>('/reagents', { token }).then(setReagents).catch(() => {});
      apiFetch<Lab[]>('/labs', { token }).then(setLabs).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function save() {
    try {
      await apiFetch('/lab-reagent-configs', {
        method: 'POST',
        token,
        body: {
          ...form,
          expireWarningDays: Number(form.expireWarningDays) || 30,
        },
      });
      setErr(null);
      await refresh();
    } catch (e: any) {
      setErr(e.message ?? 'save failed');
    }
  }

  async function remove(id: string) {
    if (!confirm('删除该配置？')) return;
    try {
      await apiFetch(`/lab-reagent-configs/${id}`, {
        method: 'DELETE',
        token,
      });
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-3">预警阈值配置</h1>
      <div className="border p-3 rounded mb-4 space-y-2 bg-gray-50">
        <div className="flex gap-2 flex-wrap">
          <select
            className="border px-2 py-1"
            value={form.labId}
            onChange={(e) => setForm({ ...form, labId: e.target.value })}
          >
            <option value="">选择实验室</option>
            {labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <select
            className="border px-2 py-1"
            value={form.reagentId}
            onChange={(e) => setForm({ ...form, reagentId: e.target.value })}
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
            placeholder="安全阈值"
            value={form.safetyStock}
            onChange={(e) => setForm({ ...form, safetyStock: e.target.value })}
          />
          <input
            className="border px-2 py-1 w-24"
            placeholder="预警天数"
            value={form.expireWarningDays}
            onChange={(e) =>
              setForm({ ...form, expireWarningDays: e.target.value })
            }
          />
          <button
            className="bg-blue-600 text-white px-3 py-1 rounded"
            onClick={save}
          >
            新增 / 更新
          </button>
        </div>
        {err && <div className="text-red-600 text-sm">{err}</div>}
      </div>
      <table className="w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2">lab</th>
            <th className="border px-2">试剂</th>
            <th className="border px-2">阈值</th>
            <th className="border px-2">预警天数</th>
            <th className="border px-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="border px-2">{c.labId}</td>
              <td className="border px-2">{c.reagentId}</td>
              <td className="border px-2">{c.safetyStock}</td>
              <td className="border px-2">{c.expireWarningDays}</td>
              <td className="border px-2">
                <button
                  className="text-red-600 underline"
                  onClick={() => remove(c.id)}
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
