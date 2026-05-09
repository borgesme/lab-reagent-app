'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { Toolbar } from '@/components/data/Toolbar';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiFetch, apiBaseUrl } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface Row {
  date: string;
  reagentName: string;
  batchNo: string;
  controlType: string | null;
  applicant: string;
  projectRef: string;
  purpose: string;
  actualQty: string;
  unit: string;
  issuer: string;
  witness: string;
  signed: 'Y' | 'N';
}
interface Snapshot {
  id: string;
  labId: string;
  yearMonth: string;
  rowCount: number;
  createdAt: string;
}

const columns: ColumnDef<Row>[] = [
  { accessorKey: 'date', header: '日期' },
  { accessorKey: 'reagentName', header: '试剂' },
  {
    accessorKey: 'batchNo',
    header: '批号',
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.batchNo}</span>
    ),
  },
  {
    id: 'controlType',
    header: '管控类型',
    cell: ({ row }) =>
      row.original.controlType ? (
        <Badge variant="destructive">{row.original.controlType}</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  { accessorKey: 'applicant', header: '申请人' },
  { accessorKey: 'projectRef', header: '项目' },
  {
    id: 'qty',
    header: '实发',
    cell: ({ row }) => `${row.original.actualQty} ${row.original.unit}`,
  },
  { accessorKey: 'issuer', header: '发放人' },
  { accessorKey: 'witness', header: '见证人' },
  {
    accessorKey: 'signed',
    header: '已签名',
    cell: ({ row }) => (row.original.signed === 'Y' ? '✓' : ''),
  },
];

export default function LedgerPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [rows, setRows] = useState<Row[]>([]);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ format: 'json' });
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const [data, snapList] = await Promise.all([
        apiFetch<Row[]>(`/controlled-ledger?${qs}`, { token }),
        apiFetch<Snapshot[]>('/controlled-ledger/snapshots', { token }),
      ]);
      setRows(data);
      setSnaps(snapList);
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token, from, to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const download = useCallback(
    async (path: string, filename: string) => {
      try {
        const resp = await fetch(apiBaseUrl + path, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e: any) {
        toast.error(e.message ?? '下载失败');
      }
    },
    [token],
  );

  const downloadCsv = useMemo(
    () => () => {
      const qs = new URLSearchParams({ format: 'csv' });
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      download(`/controlled-ledger?${qs}`, 'controlled-ledger.csv');
    },
    [from, to, download],
  );

  return (
    <div>
      <PageHeader title="管控台账" subtitle="管控试剂出入库流水" />
      <Toolbar
        filters={
          <>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
            <span className="text-muted-foreground text-sm">至</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </>
        }
        actions={
          <Button variant="outline" size="sm" onClick={downloadCsv}>
            <Download className="mr-2 h-4 w-4" /> 下载 CSV
          </Button>
        }
      />
      <Card className="mb-6 p-2">
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          testId="ledger-table"
          emptyTitle="无台账记录"
        />
      </Card>

      <h2 className="mb-3 text-base font-semibold">历史快照</h2>
      <Card className="p-3">
        {snaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无</p>
        ) : (
          <ul className="space-y-1">
            {snaps.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded px-2 py-1 hover:bg-accent"
              >
                <span className="font-medium">{s.yearMonth}</span>
                <span className="text-xs text-muted-foreground">
                  lab={s.labId} · {s.rowCount} 行
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() =>
                    download(
                      `/controlled-ledger/snapshots/${s.id}`,
                      `${s.yearMonth}.csv`,
                    )
                  }
                >
                  <Download className="mr-1 h-3 w-3" /> 下载
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
