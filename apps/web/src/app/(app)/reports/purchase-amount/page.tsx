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

type GroupBy = 'month' | 'category' | 'supplier';

export default function PurchaseAmountPage() {
  const [range, setRange] = useState<RangePreset>('365d');
  const [startDate, setStartDate] = useState<string>();
  const [endDate, setEndDate] = useState<string>();
  const [groupBy, setGroupBy] = useState<GroupBy>('month');

  const { data, isLoading: loading, error: queryError } = useApiQuery<PurchaseAmountResponse>(
    '/reports/purchase-amount',
    { params: { range, startDate, endDate, groupBy } },
  );
  const error = queryError ? (queryError as Error).message : null;

  const params = new URLSearchParams();
  params.set('range', range);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  params.set('groupBy', groupBy);
  const exportEndpoint = `/reports/purchase-amount?${params.toString()}`;

  const groupByLabel: Record<GroupBy, string> = {
    month: '按月',
    category: '按品类',
    supplier: '按供应商',
  };

  return (
    <div data-testid="reports-purchase-amount-page">
      <PageHeader title="采购金额" subtitle="批次金额按维度汇总" />
      <Toolbar
        filters={
          <>
            <Select
              value={groupBy}
              onValueChange={(v) => setGroupBy(v as GroupBy)}
            >
              <SelectTrigger
                className="w-32"
                data-testid="reports-purchase-amount-groupby"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">按月</SelectItem>
                <SelectItem value="category">按品类</SelectItem>
                <SelectItem value="supplier">按供应商</SelectItem>
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
              testId="reports-purchase-amount-range"
            />
          </>
        }
        actions={
          <ExportButton
            endpoint={exportEndpoint}
            testId="reports-purchase-amount-export"
          />
        }
      />

      <div
        className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3"
        data-testid="reports-purchase-amount-kpis"
      >
        <KpiCard
          label="总采购金额(元)"
          value={data?.summary.totalAmount}
          loading={loading}
          testId="reports-purchase-amount-kpi-total"
        />
        <KpiCard
          label="批次数"
          value={data?.summary.batchCount}
          loading={loading}
          testId="reports-purchase-amount-kpi-batch-count"
        />
        <KpiCard
          label="待入库批次"
          value={data?.summary.pendingBatchCount}
          loading={loading}
          testId="reports-purchase-amount-kpi-pending-batch"
        />
      </div>

      <ChartCard
        title={`采购金额(${groupByLabel[groupBy]})`}
        loading={loading}
        error={error}
        empty={!loading && !error && (data?.series.length ?? 0) === 0}
        testId="reports-purchase-amount-chart"
      >
        {data && (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data.series}>
              <XAxis dataKey="bucket" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="amount" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
