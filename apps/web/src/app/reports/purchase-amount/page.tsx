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
import type { PurchaseAmountResponse } from '@app/shared';

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

export default function PurchaseAmountPage() {
  const [range, setRange] = useState<RangePreset>('365d');
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();
  const [groupBy, setGroupBy] = useState<'month' | 'category' | 'supplier'>(
    'month',
  );

  const { data, loading, error } = useReportData<PurchaseAmountResponse>(
    '/reports/purchase-amount',
    { range, startDate, endDate, groupBy },
  );

  const params = new URLSearchParams();
  params.set('range', range);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  params.set('groupBy', groupBy);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">采购金额</h2>
        <div className="flex gap-2">
          <select
            className="rounded border px-2 py-1"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as any)}
          >
            <option value="month">按月</option>
            <option value="category">按品类</option>
            <option value="supplier">按供应商</option>
          </select>
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
            endpoint={`/reports/purchase-amount?${params.toString()}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <KpiCard label="总采购金额(元)" value={data?.summary.totalAmount ?? '—'} />
        <KpiCard label="批次数" value={data?.summary.batchCount ?? '—'} />
        <KpiCard
          label="待入库批次"
          value={data?.summary.pendingBatchCount ?? '—'}
        />
      </div>

      <ChartCard
        title={`采购金额(${groupBy === 'month' ? '按月' : groupBy === 'category' ? '按品类' : '按供应商'})`}
        loading={loading}
        error={error}
        empty={!loading && !error && (data?.series.length ?? 0) === 0}
      >
        {data && (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data.series}>
              <XAxis dataKey="bucket" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="amount" fill="#52c41a" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
