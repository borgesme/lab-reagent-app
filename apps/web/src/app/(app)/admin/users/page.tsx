'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { FormDialog } from '@/components/data/FormDialog';
import { ConfirmDialog } from '@/components/data/ConfirmDialog';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  lab?: { id?: string; name: string } | null;
  labId?: string | null;
  roles?: Array<{ role: { code: string } }>;
}

const ALL_ROLES = [
  'SYS_ADMIN',
  'LAB_HEAD',
  'REAGENT_ADMIN',
  'PLAIN_USER',
] as const;

const updateSchema = z.object({
  name: z.string().min(1, '姓名必填'),
  labId: z.string().optional(),
  roles: z.array(z.enum(ALL_ROLES)).min(1, '至少 1 个角色'),
});

type UpdateValues = z.infer<typeof updateSchema>;

export default function UsersPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [data, setData] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const d = await apiFetch<UserRow[]>('/users', { token });
      setData(d);
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const editingDefaults: UpdateValues = useMemo(
    () => ({
      name: editing?.name ?? '',
      labId: editing?.labId ?? editing?.lab?.id ?? '',
      roles: ((editing?.roles ?? []).map((r) => r.role.code) as any) ?? [
        'PLAIN_USER',
      ],
    }),
    [editing],
  );

  const columns: ColumnDef<UserRow>[] = [
    { accessorKey: 'email', header: '邮箱' },
    { accessorKey: 'name', header: '姓名' },
    {
      id: 'lab',
      header: '实验室',
      cell: ({ row }) =>
        row.original.lab?.name ?? (
          <span className="text-muted-foreground">—</span>
        ),
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
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="操作"
              data-testid={`admin-users-row-${row.original.id}-actions`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => setEditing(row.original)}
              data-testid={`admin-users-row-${row.original.id}-edit`}
            >
              编辑
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setResetting(row.original)}
              data-testid={`admin-users-row-${row.original.id}-reset`}
            >
              重置密码
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div data-testid="admin-users-page">
      <PageHeader title="用户管理" subtitle="系统全部用户" />
      <Card className="p-2">
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          testId="admin-users-table"
          emptyTitle="暂无用户"
        />
      </Card>

      <FormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        schema={updateSchema}
        defaultValues={editingDefaults}
        title="编辑用户"
        description={editing ? `修改 ${editing.email}` : ''}
        testId="admin-users-edit"
        onSubmit={async (values) => {
          if (!editing) return;
          try {
            await apiFetch(`/users/${editing.id}`, {
              method: 'PATCH',
              token,
              body: {
                name: values.name,
                labId: values.labId || undefined,
                roles: values.roles,
              },
            });
            toast.success('已更新');
            setEditing(null);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '更新失败');
            throw e;
          }
        }}
        fields={(form) => (
          <>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>姓名</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="admin-users-edit-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="labId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>实验室 ID（留空表示无）</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="admin-users-edit-lab"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="roles"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>角色</FormLabel>
                  <div className="flex flex-wrap gap-3">
                    {ALL_ROLES.map((r) => {
                      const checked = (field.value as string[]).includes(r);
                      return (
                        <label
                          key={r}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...(field.value as string[]), r]
                                : (field.value as string[]).filter(
                                    (x) => x !== r,
                                  );
                              field.onChange(next);
                            }}
                            data-testid={`admin-users-edit-role-${r}`}
                          />
                          {r}
                        </label>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
      />

      <ConfirmDialog
        open={!!resetting}
        onOpenChange={(o) => !o && setResetting(null)}
        title="重置密码"
        description={`确认为"${resetting?.email}"生成临时密码？该用户的当前密码会立即失效。`}
        confirmLabel="确认重置"
        destructive={false}
        testId="admin-users-reset"
        onConfirm={async () => {
          if (!resetting) return;
          try {
            const res = await apiFetch<{ tempPassword: string }>(
              `/users/${resetting.id}/reset-password`,
              { method: 'POST', token },
            );
            toast.success(`临时密码：${res.tempPassword}`, { duration: 30_000 });
            setResetting(null);
          } catch (e: any) {
            toast.error(e.message ?? '重置失败');
            throw e;
          }
        }}
      />
    </div>
  );
}
