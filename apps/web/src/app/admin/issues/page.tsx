'use client';
import { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface UserLite {
  id: string;
  name: string;
  email: string;
}

interface RequestItem {
  id: string;
  status: string;
  quantity: string;
  unit: string;
  purpose: string;
  createdAt: string;
  reagent: { name: string; hazardLevel?: string; controlType?: string | null };
  stock: { batchNo?: string | null };
  applicant: UserLite;
  labId?: string;
}

export default function IssuesPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [pending, setPending] = useState<RequestItem[]>([]);
  const [issued, setIssued] = useState<RequestItem[]>([]);
  const [witnesses, setWitnesses] = useState<UserLite[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [qtyById, setQtyById] = useState<Record<string, string>>({});
  const [witnessById, setWitnessById] = useState<Record<string, string>>({});
  const sigRefs = useRef<Record<string, SignatureCanvas | null>>({});

  async function refresh() {
    if (!token) return;
    try {
      const [ap, iss, users] = await Promise.all([
        apiFetch<RequestItem[]>('/requests?status=APPROVED', { token }),
        apiFetch<RequestItem[]>('/requests?status=ISSUED', { token }),
        apiFetch<UserLite[]>('/users', { token }).catch(() => []),
      ]);
      setPending(ap);
      setIssued(iss);
      setWitnesses(users);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const isCtrl = (r: RequestItem) =>
    r.reagent.hazardLevel === 'CONTROLLED' || !!r.reagent.controlType;

  async function issue(r: RequestItem) {
    const actualQty = qtyById[r.id] ?? r.quantity;
    try {
      const body: Record<string, unknown> = { actualQty };
      if (isCtrl(r)) {
        if (!witnessById[r.id]) {
          throw new Error('请选择见证人');
        }
        body.witnessId = witnessById[r.id];
        const sig = sigRefs.current[r.id];
        if (!sig || sig.isEmpty()) {
          throw new Error('请领用人签名后再发放');
        }
        body.signatureDataUrl = sig.toDataURL('image/png');
      }
      await apiFetch(`/requests/${r.id}/issues`, {
        method: 'POST',
        token,
        body,
      });
      sigRefs.current[r.id]?.clear();
      setQtyById((m) => ({ ...m, [r.id]: '' }));
      setWitnessById((m) => ({ ...m, [r.id]: '' }));
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
      <ul className="space-y-3 mb-6">
        {pending.map((r) => {
          const ctrl = isCtrl(r);
          return (
            <li key={r.id} className="border p-3 rounded">
              <div className="flex justify-between">
                <div>
                  <div className="font-medium">
                    {r.reagent.name} · 批号 {r.stock.batchNo ?? '-'} · 申请
                    {r.quantity}
                    {r.unit}
                    {ctrl && (
                      <span className="ml-2 text-red-600 text-sm">[管控]</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-700">
                    {r.applicant.name} · {r.purpose}
                  </div>
                </div>
                <input
                  className="border p-1 w-24 text-sm"
                  placeholder={`实际量 (${r.unit})`}
                  value={qtyById[r.id] ?? ''}
                  onChange={(e) =>
                    setQtyById((m) => ({ ...m, [r.id]: e.target.value }))
                  }
                />
              </div>
              {ctrl && (
                <div className="mt-2 space-y-2">
                  <select
                    className="border p-1 text-sm"
                    value={witnessById[r.id] ?? ''}
                    onChange={(e) =>
                      setWitnessById((m) => ({
                        ...m,
                        [r.id]: e.target.value,
                      }))
                    }
                  >
                    <option value="">选择见证人</option>
                    {witnesses.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">
                      领用人签名：
                    </div>
                    <SignatureCanvas
                      ref={(el) => {
                        sigRefs.current[r.id] = el;
                      }}
                      canvasProps={{
                        width: 400,
                        height: 120,
                        className: 'border',
                      }}
                    />
                    <button
                      type="button"
                      className="text-xs text-gray-500 underline ml-2"
                      onClick={() => sigRefs.current[r.id]?.clear()}
                    >
                      清空
                    </button>
                  </div>
                </div>
              )}
              <button
                className="bg-blue-600 text-white px-3 py-1 text-sm mt-2"
                onClick={() => issue(r)}
              >
                发放
              </button>
            </li>
          );
        })}
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
