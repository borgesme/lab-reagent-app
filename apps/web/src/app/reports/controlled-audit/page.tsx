'use client';
import { useState } from 'react';
import { KpiCard } from '@/components/reports/KpiCard';
import {
  DateRangePicker,
  type RangePreset,
} from '@/components/reports/DateRangePicker';
import { ExportButton } from '@/components/reports/ExportButton';
import { useReportData } from '@/components/reports/useReportData';
import type { ControlledAuditResponse } from '@app/shared';

export default function ControlledAuditPage() {
  const [range, setRange] = useState<RangePreset>('90d');
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();

  const { data, loading, error } = useReportData<ControlledAuditResponse>(
    '/reports/controlled-audit',
    { range, startDate, endDate },
  );

  const params = new URLSearchParams();
  params.set('range', range);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">管控试剂审计</h2>
        <div className="flex gap-2">
          <DateRangePicker
            range={range}
            startDate={startDate}
            endDate={endDate}
            onChange={(n) => {
              setRange(n.range);
              setStartDate(n.startDate);
              setEndDate(n.endDate);
            }}
          />
          <ExportButton
            endpoint={`/reports/controlled-audit?${params.toString()}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <KpiCard label="审计事件数" value={data?.summary.totalEvents ?? '—'} />
        <KpiCard
          label="操作人数"
          value={data?.summary.distinctActors ?? '—'}
        />
      </div>

      <div className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-medium">审计明细(时间倒序)</h3>
        {loading && <div className="py-8 text-center text-gray-400">加载中…</div>}
        {error && <div className="py-8 text-center text-red-600">加载失败:{error}</div>}
        {!loading && !error && (
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-1">时间</th>
                <th className="py-1">动作</th>
                <th className="py-1">试剂</th>
                <th className="py-1">操作人</th>
                <th className="py-1">数量</th>
                <th className="py-1">变更前</th>
                <th className="py-1">变更后</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="py-1">{r.ts.slice(0, 19).replace('T', ' ')}</td>
                  <td className="py-1">{r.action}</td>
                  <td className="py-1">{r.reagentName}</td>
                  <td className="py-1">{r.actorName}</td>
                  <td className="py-1">{r.qty}</td>
                  <td className="py-1">{r.beforeQty ?? ''}</td>
                  <td className="py-1">{r.afterQty ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
