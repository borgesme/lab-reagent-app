'use client';
import { useEffect, useState } from 'react';
import { apiFetch, apiBaseUrl } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface Row {
  date: string;
  reagentName: string;
  batchNo: string;
  controlType: string | null;
  applicant: string;
  projectRef: string;
  purpose: string;
  actualQty: string;
  unit: string;
  issuer: string;
  witness: string;
  signed: 'Y' | 'N';
}

interface Snapshot {
  id: string;
  labId: string;
  yearMonth: string;
  rowCount: number;
  createdAt: string;
}

export default function LedgerPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [rows, setRows] = useState<Row[]>([]);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    if (!token) return;
    try {
      const qs = new URLSearchParams({ format: 'json' });
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const data = await apiFetch<Row[]>(`/controlled-ledger?${qs}`, { token });
      const snapList = await apiFetch<Snapshot[]>(
        '/controlled-ledger/snapshots',
        { token },
      );
      setRows(data);
      setSnaps(snapList);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function download(path: string, filename: string) {
    const resp = await fetch(apiBaseUrl + path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">管控台账</h2>
      {err && <p className="text-red-600 mb-2">{err}</p>}

      <div className="flex gap-2 mb-3 items-center">
        <input
          type="date"
          className="border p-1 text-sm"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span>至</span>
        <input
          type="date"
          className="border p-1 text-sm"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <button
          className="bg-gray-700 text-white px-3 py-1 text-sm"
          onClick={refresh}
        >
          刷新
        </button>
        <button
          className="bg-blue-600 text-white px-3 py-1 text-sm"
          onClick={() => {
            const qs = new URLSearchParams({ format: 'csv' });
            if (from) qs.set('from', from);
            if (to) qs.set('to', to);
            download(`/controlled-ledger?${qs}`, 'controlled-ledger.csv');
          }}
        >
          下载 CSV
        </button>
      </div>

      <table className="w-full border text-sm mb-6">
        <thead>
          <tr className="bg-gray-50">
            <th className="p-1 text-left">日期</th>
            <th className="p-1 text-left">试剂</th>
            <th className="p-1 text-left">批号</th>
            <th className="p-1 text-left">管控类型</th>
            <th className="p-1 text-left">申请人</th>
            <th className="p-1 text-left">项目</th>
            <th className="p-1 text-left">实发</th>
            <th className="p-1 text-left">发放人</th>
            <th className="p-1 text-left">见证人</th>
            <th className="p-1 text-left">已签名</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="p-1">{r.date}</td>
              <td className="p-1">{r.reagentName}</td>
              <td className="p-1">{r.batchNo}</td>
              <td className="p-1">{r.controlType ?? '-'}</td>
              <td className="p-1">{r.applicant}</td>
              <td className="p-1">{r.projectRef}</td>
              <td className="p-1">
                {r.actualQty} {r.unit}
              </td>
              <td className="p-1">{r.issuer}</td>
              <td className="p-1">{r.witness}</td>
              <td className="p-1">{r.signed}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="font-semibold mb-2">历史快照</h3>
      {snaps.length === 0 && <p className="text-gray-500 text-sm">暂无</p>}
      <ul className="space-y-1">
        {snaps.map((s) => (
          <li key={s.id} className="flex gap-3 items-center">
            <span>{s.yearMonth}</span>
            <span className="text-gray-500 text-sm">
              lab={s.labId} rows={s.rowCount}
            </span>
            <button
              className="text-blue-600 underline text-sm"
              onClick={() =>
                download(
                  `/controlled-ledger/snapshots/${s.id}`,
                  `${s.yearMonth}.csv`,
                )
              }
            >
              下载
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
