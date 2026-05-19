'use client';
import { useEffect, useMemo, useState } from 'react';
import type {
  ColumnDef,
  PaginationState,
  RowSelectionState,
} from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Combobox } from '@/components/ui/combobox';
import { apiFetch } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api-query';
import { useAuth } from '@/lib/auth-store';

interface UserRow {
  id: string;
  email: string;
  name: string;
  lab?: { id?: string; name: string } | null;
  labId?: string | null;
  roles?: Array<{ role: { code: string } }>;
}

interface PageResult<T> {
  items: T[];
  total: number;
  pageNum: number;
  pageSize: number;
}

interface LabRow {
  id: string;
  name: string;
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

const createSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  name: z.string().min(2, '姓名至少 2 个字'),
  password: z.string().min(8, '密码至少 8 位'),
  labId: z.string().optional(),
  roles: z.array(z.enum(ALL_ROLES)).min(1, '至少 1 个角色'),
});

type CreateValues = z.infer<typeof createSchema>;

const createDefaults: CreateValues = {
  email: '',
  name: '',
  password: '',
  labId: '',
  roles: ['PLAIN_USER'],
};

export default function UsersPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const qc = useQueryClient();
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [batchDeleting, setBatchDeleting] = useState(false);

  const usersQuery = useApiQuery<PageResult<UserRow>>('/users/page', {
    queryKey: ['users', 'page', pagination.pageIndex, pagination.pageSize],
    params: {
      pageNum: pagination.pageIndex + 1,
      pageSize: pagination.pageSize,
    },
  });
  const data = usersQuery.data?.items ?? [];
  const total = usersQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize));
  const loading = usersQuery.isLoading;
  const refresh = () => {
    setRowSelection({});
    qc.invalidateQueries({ queryKey: ['users'] });
  };

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection],
  );

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (usersQuery.error) {
      toast.error((usersQuery.error as Error).message ?? '加载失败');
    }
  }, [usersQuery.error]);

  const labsQuery = useApiQuery<LabRow[]>('/labs', { queryKey: ['labs'] });
  const labs = labsQuery.data ?? [];

  const labOptions = useMemo(
    () => [
      { value: '', label: '无实验室' },
      ...labs.map((l) => ({ value: l.id, label: l.name })),
    ],
    [labs],
  );

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
            <DropdownMenuItem
              onClick={() => setDeleting(row.original)}
              className="text-destructive focus:text-destructive"
              data-testid={`admin-users-row-${row.original.id}-delete`}
            >
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div data-testid="admin-users-page">
      <PageHeader
        title="用户管理"
        subtitle="系统全部用户"
        actions={
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <>
                <span
                  className="text-sm text-muted-foreground"
                  data-testid="admin-users-selected-count"
                >
                  已选 {selectedIds.length} 项
                </span>
                <Button
                  variant="destructive"
                  onClick={() => setBatchDeleting(true)}
                  data-testid="admin-users-batch-delete-btn"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> 批量删除
                </Button>
              </>
            )}
            <Button
              onClick={() => setCreating(true)}
              data-testid="admin-users-create-btn"
            >
              <Plus className="mr-2 h-4 w-4" /> 添加用户
            </Button>
          </div>
        }
      />
      <Card className="p-2">
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          testId="admin-users-table"
          emptyTitle="暂无用户"
          enableRowSelection
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          getRowId={(row) => row.id}
          pagination={pagination}
          onPaginationChange={setPagination}
          pageCount={pageCount}
          total={total}
          manualPagination
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
                  <FormLabel>实验室</FormLabel>
                  <FormControl>
                    <Combobox
                      options={labOptions}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder="选择实验室"
                      searchPlaceholder="搜索实验室..."
                      emptyText="无匹配实验室"
                      testId="admin-users-edit-lab"
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
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const next = v === true
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
            const tempPassword = res.tempPassword;
            toast.success(`临时密码：${tempPassword}`, {
              duration: 60_000,
              action: {
                label: '复制',
                onClick: () => {
                  navigator.clipboard.writeText(tempPassword).then(
                    () => toast.success('已复制到剪贴板'),
                    () => toast.error('复制失败'),
                  );
                },
              },
            });
            setResetting(null);
          } catch (e: any) {
            toast.error(e.message ?? '重置失败');
            throw e;
          }
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="删除用户"
        description={`确认删除用户"${deleting?.email}"？该操作会立即吊销其所有登录会话(软删除可在数据库层恢复)。`}
        confirmLabel="确认删除"
        destructive
        testId="admin-users-delete"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await apiFetch(`/users/${deleting.id}`, {
              method: 'DELETE',
              token,
            });
            toast.success(`已删除 ${deleting.email}`);
            setDeleting(null);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '删除失败');
            throw e;
          }
        }}
      />

      <ConfirmDialog
        open={batchDeleting}
        onOpenChange={setBatchDeleting}
        title="批量删除用户"
        description={`确认删除选中的 ${selectedIds.length} 个用户？该操作会立即吊销其所有登录会话(软删除可在数据库层恢复)。`}
        confirmLabel="确认删除"
        destructive
        testId="admin-users-batch-delete"
        onConfirm={async () => {
          try {
            const res = await apiFetch<{ deleted: number }>(
              '/users/batch-delete',
              { method: 'POST', token, body: { ids: selectedIds } },
            );
            toast.success(`已删除 ${res.deleted} 个用户`);
            setBatchDeleting(false);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '批量删除失败');
            throw e;
          }
        }}
      />

      <FormDialog
        open={creating}
        onOpenChange={setCreating}
        schema={createSchema}
        defaultValues={createDefaults}
        title="添加用户"
        description="创建新用户并分配角色"
        submitLabel="创建"
        testId="admin-users-create"
        onSubmit={async (values) => {
          try {
            await apiFetch('/users', {
              method: 'POST',
              token,
              body: {
                email: values.email,
                name: values.name,
                password: values.password,
                labId: values.labId || undefined,
                roles: values.roles,
              },
            });
            toast.success('已创建');
            setCreating(false);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '创建失败');
            throw e;
          }
        }}
        fields={(form) => (
          <>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>邮箱</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      data-testid="admin-users-create-email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>姓名</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="admin-users-create-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>初始密码</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      data-testid="admin-users-create-password"
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
                  <FormLabel>实验室</FormLabel>
                  <FormControl>
                    <Combobox
                      options={labOptions}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder="选择实验室"
                      searchPlaceholder="搜索实验室..."
                      emptyText="无匹配实验室"
                      testId="admin-users-create-lab"
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
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const next = v === true
                                ? [...(field.value as string[]), r]
                                : (field.value as string[]).filter(
                                    (x) => x !== r,
                                  );
                              field.onChange(next);
                            }}
                            data-testid={`admin-users-create-role-${r}`}
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
    </div>
  );
}
