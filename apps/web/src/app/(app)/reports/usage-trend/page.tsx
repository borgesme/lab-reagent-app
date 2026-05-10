'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { PageHeader } from '@/components/data/PageHeader';
import { Toolbar } from '@/components/data/Toolbar';
import { KpiCard } from '@/components/reports/KpiCard';
import { ChartCard } from '@/components/reports/ChartCard';
import {
  RangePresetPicker,
  type RangePreset,
} from '@/components/reports/RangePresetPicker';
import { ExportButton } from '@/components/reports/ExportButton';
import { useApiQuery } from '@/lib/use-api-query';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

type GroupBy = 'day' | 'week' | 'month';

export default function UsageTrendPage() {
  const [range, setRange] = useState<RangePreset>('30d');
  const [startDate, setStartDate] = useState<string>();
  const [endDate, setEndDate] = useState<string>();
  const [groupBy, setGroupBy] = useState<GroupBy>('day');

  const { data, isLoading: loading, error: queryError } = useApiQuery<UsageTrendResponse>(
    '/reports/usage-trend',
    { params: { range, startDate, endDate, groupBy } },
  );
  const error = queryError ? (queryError as Error).message : null;

  const params = new URLSearchParams();
  params.set('range', range);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  params.set('groupBy', groupBy);
  const exportEndpoint = `/reports/usage-trend?${params.toString()}`;

  return (
    <div data-testid="reports-usage-trend-page">
      <PageHeader title="领用趋势" subtitle="试剂领用量按时间分布" />
      <Toolbar
        filters={
          <>
            <Select
              value={groupBy}
              onValueChange={(v) => setGroupBy(v as GroupBy)}
            >
              <SelectTrigger
                className="w-28"
                data-testid="reports-usage-trend-groupby"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">按日</SelectItem>
                <SelectItem value="week">按周</SelectItem>
                <SelectItem value="month">按月</SelectItem>
              </SelectContent>
            </Select>
            <RangePresetPicker
              range={range}
              startDate={startDate}
              endDate={endDate}
              onChange={(n) => {
                setRange(n.range);
                setStartDate(n.startDate);
                setEndDate(n.endDate);
              }}
              testId="reports-usage-trend-range"
            />
          </>
        }
        actions={
          <ExportButton
            endpoint={exportEndpoint}
            testId="reports-usage-trend-export"
          />
        }
      />

      <div
        className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3"
        data-testid="reports-usage-trend-kpis"
      >
        <KpiCard
          label="总领用量"
          value={data?.summary.totalIssued}
          loading={loading}
          testId="reports-usage-trend-kpi-total"
        />
        <KpiCard
          label="涉及试剂数"
          value={data?.summary.distinctReagents}
          loading={loading}
          testId="reports-usage-trend-kpi-distinct"
        />
        <KpiCard
          label="日均领用"
          value={data?.summary.avgDailyIssued}
          loading={loading}
          testId="reports-usage-trend-kpi-daily-avg"
        />
      </div>

      <ChartCard
        title="领用量趋势"
        loading={loading}
        error={error}
        empty={!loading && !error && (data?.series.length ?? 0) === 0}
        testId="reports-usage-trend-chart"
      >
        {data && (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data.series}>
              <XAxis dataKey="bucket" />
              <YAxis />
              <Tooltip />
              <Line dataKey="qty" stroke="hsl(var(--primary))" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
