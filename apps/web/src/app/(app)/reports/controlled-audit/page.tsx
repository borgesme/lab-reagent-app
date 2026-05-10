'use client';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/data/PageHeader';
import { Toolbar } from '@/components/data/Toolbar';
import { DataTable } from '@/components/data/DataTable';
import { KpiCard } from '@/components/reports/KpiCard';
import {
  RangePresetPicker,
  type RangePreset,
} from '@/components/reports/RangePresetPicker';
import { ExportButton } from '@/components/reports/ExportButton';
import { useApiQuery } from '@/lib/use-api-query';
import { Card } from '@/components/ui/card';
import type { ControlledAuditResponse } from '@app/shared';

type Row = ControlledAuditResponse['rows'][number];

const detailColumns: ColumnDef<Row>[] = [
  {
    accessorKey: 'ts',
    header: '时间',
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.ts.slice(0, 19).replace('T', ' ')}
      </span>
    ),
  },
  { accessorKey: 'action', header: '动作' },
  { accessorKey: 'reagentName', header: '试剂' },
  { accessorKey: 'actorName', header: '操作人' },
  {
    accessorKey: 'qty',
    header: '数量',
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.qty}</span>
    ),
  },
  {
    accessorKey: 'beforeQty',
    header: '变更前',
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.beforeQty ?? ''}</span>
    ),
  },
  {
    accessorKey: 'afterQty',
    header: '变更后',
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.afterQty ?? ''}</span>
    ),
  },
];

export default function ControlledAuditPage() {
  const [range, setRange] = useState<RangePreset>('90d');
  const [startDate, setStartDate] = useState<string>();
  const [endDate, setEndDate] = useState<string>();

  const { data, isLoading: loading, error: queryError } = useApiQuery<ControlledAuditResponse>(
    '/reports/controlled-audit',
    { params: { range, startDate, endDate } },
  );
  const error = queryError ? (queryError as Error).message : null;

  const params = new URLSearchParams();
  params.set('range', range);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const exportEndpoint = `/reports/controlled-audit?${params.toString()}`;

  return (
    <div data-testid="reports-controlled-audit-page">
      <PageHeader title="管控试剂审计" subtitle="管控试剂操作流水" />
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
            testId="reports-controlled-audit-range"
          />
        }
        actions={
          <ExportButton
            endpoint={exportEndpoint}
            testId="reports-controlled-audit-export"
          />
        }
      />

      <div
        className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2"
        data-testid="reports-controlled-audit-kpis"
      >
        <KpiCard
          label="审计事件数"
          value={data?.summary.totalEvents}
          loading={loading}
          testId="reports-controlled-audit-kpi-events"
        />
        <KpiCard
          label="操作人数"
          value={data?.summary.distinctActors}
          loading={loading}
          testId="reports-controlled-audit-kpi-actors"
        />
      </div>

      <Card className="p-2">
        <DataTable
          columns={detailColumns}
          data={data?.rows ?? []}
          loading={loading}
          testId="reports-controlled-audit-detail-table"
          emptyTitle="暂无审计记录"
        />
      </Card>

      {error && !loading && (
        <p className="mt-4 text-sm text-destructive">加载失败:{error}</p>
      )}
    </div>
  );
}
