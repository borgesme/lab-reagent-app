'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface Role {
  id: string;
  code: string;
  name: string;
  description?: string | null;
}

const columns: ColumnDef<Role>[] = [
  {
    accessorKey: 'code',
    header: '编码',
    cell: ({ row }) => (
      <Badge variant="secondary" className="font-mono">
        {row.original.code}
      </Badge>
    ),
  },
  { accessorKey: 'name', header: '名称' },
  {
    id: 'description',
    header: '说明',
    cell: ({ row }) =>
      row.original.description ?? (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

export default function RolesPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [data, setData] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const list = await apiFetch<Role[]>('/roles', { token });
      setData(list);
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div>
      <PageHeader title="角色权限" subtitle="系统角色字典" />
      <Card className="p-2">
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          testId="roles-table"
          emptyTitle="暂无角色"
        />
      </Card>
    </div>
  );
}
