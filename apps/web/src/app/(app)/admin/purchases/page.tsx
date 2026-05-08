'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import type {
  PurchaseRequestSummary,
  PurchaseBatchSummary,
} from '@app/shared';

type PurchaseRow = PurchaseRequestSummary & {
  reagent?: { id: string; name: string } | null;
  applicant?: { id: string; name: string; email: string } | null;
  batch?: PurchaseBatchSummary | null;
};

const EMPTY_REC = {
  actualQty: '',
  batchNo: '',
  mfgDate: '',
  expireDate: '',
  location: '',
  supplier: '',
  purchasePrice: '',
};

export default function AdminPurchasesPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [pending, setPending] = useState<PurchaseRow[]>([]);
  const [batches, setBatches] = useState<PurchaseBatchSummary[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  const [rec, setRec] = useState({ ...EMPTY_REC });
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    if (!token) return;
    try {
      const all = await apiFetch<PurchaseRow[]>('/purchases', { token });
      setPending(all.filter((p) => p.status === 'PENDING'));
      const map = new Map<string, PurchaseBatchSummary>();
      for (const p of all) {
        if (p.batch && !map.has(p.batch.id)) map.set(p.batch.id, p.batch);
      }
      setBatches(Array.from(map.values()));
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function toggle(id: string) {
    const n = new Set(picked);
    if (n.has(id)) {
      n.delete(id);
    } else {
      n.add(id);
    }
    setPicked(n);
  }

  async function merge() {
    if (!token) return;
    try {
      await apiFetch('/purchases/batches', {
        method: 'POST',
        token,
        body: { requestIds: Array.from(picked) },
      });
      setPicked(new Set());
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function receive() {
    if (!receiptFor || !token) return;
    try {
      await apiFetch(`/purchases/batches/${receiptFor}/receipt`, {
        method: 'POST',
        token,
        body: rec,
      });
      setReceiptFor(null);
      setRec({ ...EMPTY_REC });
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-3">待合并采购申请</h2>
      {err && <p className="text-red-600 mb-2">{err}</p>}
      <table className="w-full border mb-4">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2"></th>
            <th className="border px-2">申请人</th>
            <th className="border px-2">试剂</th>
            <th className="border px-2">数量</th>
            <th className="border px-2">理由</th>
          </tr>
        </thead>
        <tbody>
          {pending.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="text-center border px-2">
                <input
                  type="checkbox"
                  checked={picked.has(p.id)}
                  onChange={() => toggle(p.id)}
                />
              </td>
              <td className="border px-2">
                {p.applicant?.name ?? p.applicantId}
              </td>
              <td className="border px-2">
                {p.reagent?.name ?? p.reagentId}
              </td>
              <td className="border px-2">
                {p.quantity} {p.unit}
              </td>
              <td className="border px-2">{p.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        disabled={picked.size === 0}
        className="bg-blue-600 text-white px-3 py-1 rounded mb-6 disabled:bg-gray-400"
        onClick={merge}
      >
        合并成批次
      </button>

      <h2 className="text-xl font-bold mb-3">批次</h2>
      <table className="w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2">id</th>
            <th className="border px-2">试剂</th>
            <th className="border px-2">总量</th>
            <th className="border px-2">状态</th>
            <th className="border px-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id} className="border-t">
              <td className="border px-2 font-mono text-xs">{b.id}</td>
              <td className="border px-2">{b.reagentId}</td>
              <td className="border px-2">
                {b.totalQty} {b.unit}
              </td>
              <td className="border px-2">{b.status}</td>
              <td className="border px-2">
                {b.status === 'APPROVED' && (
                  <button
                    className="text-blue-600 underline"
                    onClick={() => setReceiptFor(b.id)}
                  >
                    入库
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {receiptFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40">
          <div className="bg-white p-4 rounded w-96 space-y-2">
            <h3 className="font-bold">入库批次 {receiptFor}</h3>
            {(
              [
                'actualQty',
                'batchNo',
                'mfgDate',
                'expireDate',
                'location',
                'supplier',
                'purchasePrice',
              ] as const
            ).map((k) => (
              <input
                key={k}
                className="border w-full px-2 py-1"
                placeholder={k}
                value={rec[k]}
                onChange={(e) => setRec({ ...rec, [k]: e.target.value })}
              />
            ))}
            <div className="flex justify-end gap-2">
              <button onClick={() => setReceiptFor(null)}>取消</button>
              <button
                className="bg-blue-600 text-white px-3 py-1 rounded"
                onClick={receive}
              >
                提交
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
