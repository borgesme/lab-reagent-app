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
import type { UsageTrendResponse } from '@app/shared';

const LineChart = dynamic(
  () => import('recharts').then((m) => m.LineChart),
  { ssr: false },
);
const Line = dynamic(() => import('recharts').then((m) => m.Line), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), {
  ssr: false,
});
const ResponsiveContainer = dynamic(
  () => import('recharts').then((m) => m.ResponsiveContainer),
  { ssr: false },
);

export default function UsageTrendPage() {
  const [range, setRange] = useState<RangePreset>('30d');
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  const { data, loading, error } = useReportData<UsageTrendResponse>(
    '/reports/usage-trend',
    { range, startDate, endDate, groupBy },
  );

  const params = new URLSearchParams();
  params.set('range', range);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  params.set('groupBy', groupBy);
  const exportEndpoint = `/reports/usage-trend?${params.toString()}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">领用趋势</h2>
        <div className="flex gap-2">
          <select
            className="rounded border px-2 py-1"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as any)}
          >
            <option value="day">按日</option>
            <option value="week">按周</option>
            <option value="month">按月</option>
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
          <ExportButton endpoint={exportEndpoint} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <KpiCard label="总领用量" value={data?.summary.totalIssued ?? '—'} />
        <KpiCard
          label="涉及试剂数"
          value={data?.summary.distinctReagents ?? '—'}
        />
        <KpiCard label="日均领用" value={data?.summary.avgDailyIssued ?? '—'} />
      </div>

      <ChartCard
        title="领用量趋势"
        loading={loading}
        error={error}
        empty={!loading && !error && (data?.series.length ?? 0) === 0}
      >
        {data && (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data.series}>
              <XAxis dataKey="bucket" />
              <YAxis />
              <Tooltip />
              <Line dataKey="qty" stroke="#1677ff" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
