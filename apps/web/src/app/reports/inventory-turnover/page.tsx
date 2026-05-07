'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { KpiCard } from '@/components/reports/KpiCard';
import { ChartCard } from '@/components/reports/ChartCard';
import {
  DateRangePicker,
  type RangePreset,
} from '@/components/reports/DateRangePicker';
import { ExportButton } from '@/components/reports/ExportButton';
import { useReportData } from '@/components/reports/useReportData';
import type { InventoryTurnoverResponse } from '@app/shared';

const BarChart = dynamic(
  () => import('recharts').then((m) => m.BarChart),
  { ssr: false },
);
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), {
  ssr: false,
});
const ResponsiveContainer = dynamic(
  () => import('recharts').then((m) => m.ResponsiveContainer),
  { ssr: false },
);

export default function InventoryTurnoverPage() {
  const [range, setRange] = useState<RangePreset>('30d');
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();

  const { data, loading, error } = useReportData<InventoryTurnoverResponse>(
    '/reports/inventory-turnover',
    { range, startDate, endDate },
  );

  const params = new URLSearchParams();
  params.set('range', range);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);

  const top10 = (data?.rows ?? [])
    .filter((r) => r.status !== 'stale')
    .slice()
    .sort((a, b) => a.turnoverDays - b.turnoverDays)
    .slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">库存周转</h2>
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
            endpoint={`/reports/inventory-turnover?${params.toString()}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <KpiCard
          label="平均周转天数"
          value={data?.summary.avgTurnoverDays ?? '—'}
        />
        <KpiCard label="低库存数量" value={data?.summary.lowStockCount ?? '—'} />
      </div>

      <ChartCard
        title="周转最快 Top 10"
        loading={loading}
        error={error}
        empty={!loading && !error && top10.length === 0}
      >
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={top10}>
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="turnoverDays" fill="#1677ff" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-medium">完整明细</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-1">试剂</th>
              <th className="py-1">现存</th>
              <th className="py-1">日均出</th>
              <th className="py-1">周转天数</th>
              <th className="py-1">状态</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <tr key={r.reagentId} className="border-t">
                <td className="py-1">{r.name}</td>
                <td className="py-1">{r.currentQty}</td>
                <td className="py-1">{r.dailyOut}</td>
                <td className="py-1">{r.turnoverDays}</td>
                <td className="py-1">
                  {r.status === 'low' && (
                    <span className="text-red-600">低</span>
                  )}
                  {r.status === 'stale' && (
                    <span className="text-yellow-600">滞销</span>
                  )}
                  {r.status === 'ok' && <span className="text-green-600">正常</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
