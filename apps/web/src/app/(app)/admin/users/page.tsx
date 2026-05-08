'use client';
import { useEffect, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface UserRow {
  id: string;
  email: string;
  name: string;
  lab?: { name: string } | null;
  roles?: Array<{ role: { code: string } }>;
}

const columns: ColumnDef<UserRow>[] = [
  { accessorKey: 'email', header: '邮箱' },
  { accessorKey: 'name', header: '姓名' },
  {
    id: 'lab',
    header: '实验室',
    cell: ({ row }) => row.original.lab?.name ?? <span className="text-muted-foreground">—</span>,
  },
  {
    id: 'roles',
    header: '角色',
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {(row.original.roles ?? []).map((r) => (
          <Badge key={r.role.code} variant="secondary">
            {r.role.code}
          </Badge>
        ))}
      </div>
    ),
  },
  {
    id: 'actions',
    header: '',
    cell: () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="操作">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled>编辑</DropdownMenuItem>
          <DropdownMenuItem disabled>重置密码</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

export default function UsersPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [data, setData] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<UserRow[]>('/users', { token })
      .then((d) => setData(d))
      .catch((e: any) => toast.error(e.message ?? '加载失败'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div>
      <PageHeader title="用户管理" subtitle="系统全部用户" />
      <Card className="p-2">
        <DataTable columns={columns} data={data} loading={loading} testId="users-table" emptyTitle="暂无用户" />
      </Card>
    </div>
  );
}
