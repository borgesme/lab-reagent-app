'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/data/PageHeader';
import { Toolbar } from '@/components/data/Toolbar';
import { DataTable } from '@/components/data/DataTable';
import { KpiCard } from '@/components/reports/KpiCard';
import { ChartCard } from '@/components/reports/ChartCard';
import {
  RangePresetPicker,
  type RangePreset,
} from '@/components/reports/RangePresetPicker';
import { ExportButton } from '@/components/reports/ExportButton';
import { useApiQuery } from '@/lib/use-api-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

type Row = InventoryTurnoverResponse['rows'][number];

const detailColumns: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: '试剂' },
  {
    accessorKey: 'currentQty',
    header: '现存',
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.currentQty}</span>
    ),
  },
  {
    accessorKey: 'dailyOut',
    header: '日均出',
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.dailyOut}</span>
    ),
  },
  {
    accessorKey: 'turnoverDays',
    header: '周转天数',
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.turnoverDays}</span>
    ),
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ row }) => {
      const s = row.original.status;
      const variant: 'default' | 'secondary' | 'destructive' =
        s === 'low' ? 'destructive' : s === 'stale' ? 'secondary' : 'default';
      const label = s === 'low' ? '低' : s === 'stale' ? '滞销' : '正常';
      return <Badge variant={variant}>{label}</Badge>;
    },
  },
];

export default function InventoryTurnoverPage() {
  const [range, setRange] = useState<RangePreset>('30d');
  const [startDate, setStartDate] = useState<string>();
  const [endDate, setEndDate] = useState<string>();

  const { data, isLoading: loading, error: queryError } = useApiQuery<InventoryTurnoverResponse>(
    '/reports/inventory-turnover',
    { params: { range, startDate, endDate } },
  );
  const error = queryError ? (queryError as Error).message : null;

  const params = new URLSearchParams();
  params.set('range', range);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const exportEndpoint = `/reports/inventory-turnover?${params.toString()}`;

  const top10 = (data?.rows ?? [])
    .filter((r) => r.status !== 'stale')
    .slice()
    .sort((a, b) => a.turnoverDays - b.turnoverDays)
    .slice(0, 10);

  return (
    <div data-testid="reports-inventory-turnover-page">
      <PageHeader title="库存周转" subtitle="试剂周转天数与低库存预警" />
      <Toolbar
        filters={
          <RangePresetPicker
            range={range}
            startDate={startDate}
            endDate={endDate}
            onChange={(n) => {
              setRange(n.range);
              setStartDate(n.startDate);
              setEndDate(n.endDate);
            }}
            testId="reports-inventory-turnover-range"
          />
        }
        actions={
          <ExportButton
            endpoint={exportEndpoint}
            testId="reports-inventory-turnover-export"
          />
        }
      />

      <div
        className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2"
        data-testid="reports-inventory-turnover-kpis"
      >
        <KpiCard
          label="平均周转天数"
          value={data?.summary.avgTurnoverDays}
          loading={loading}
          testId="reports-inventory-turnover-kpi-avg-turnover"
        />
        <KpiCard
          label="低库存数量"
          value={data?.summary.lowStockCount}
          loading={loading}
          testId="reports-inventory-turnover-kpi-low-stock"
        />
      </div>

      <ChartCard
        title="周转最快 Top 10"
        loading={loading}
        error={error}
        empty={!loading && !error && top10.length === 0}
        testId="reports-inventory-turnover-chart"
      >
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={top10}>
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="turnoverDays" fill="hsl(var(--primary))" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <Card className="mt-4 p-2">
        <DataTable
          columns={detailColumns}
          data={data?.rows ?? []}
          loading={loading}
          testId="reports-inventory-turnover-detail-table"
          emptyTitle="暂无明细"
        />
      </Card>
    </div>
  );
}
