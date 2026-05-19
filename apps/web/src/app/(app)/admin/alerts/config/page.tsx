'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { UseFormReturn } from 'react-hook-form';
import { MoreHorizontal, Plus } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import type { LabReagentConfigSummary, ReagentSummary } from '@app/shared';

interface Lab { id: string; name: string }

const schema = z.object({
  labId: z.string().min(1, '请选择实验室'),
  reagentId: z.string().min(1, '请选择试剂'),
  safetyStock: z.string().min(1, '安全阈值必填'),
  expireWarningDays: z.string().min(1, '预警天数必填'),
});

export default function AlertsConfigPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [items, setItems] = useState<LabReagentConfigSummary[]>([]);
  const [reagents, setReagents] = useState<ReagentSummary[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LabReagentConfigSummary | null>(null);
  const [deleting, setDeleting] = useState<LabReagentConfigSummary | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [list, rs, ls] = await Promise.all([
        apiFetch<LabReagentConfigSummary[]>('/lab-reagent-configs', { token }),
        apiFetch<ReagentSummary[]>('/reagents', { token }).catch(() => [] as ReagentSummary[]),
        apiFetch<Lab[]>('/labs', { token }).catch(() => [] as Lab[]),
      ]);
      setItems(list);
      setReagents(rs);
      setLabs(ls);
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const columns: ColumnDef<LabReagentConfigSummary>[] = useMemo(
    () => [
      {
        id: 'lab',
        header: '实验室',
        cell: ({ row }) =>
          labs.find((l) => l.id === row.original.labId)?.name ?? row.original.labId,
      },
      {
        id: 'reagent',
        header: '试剂',
        cell: ({ row }) =>
          reagents.find((r) => r.id === row.original.reagentId)?.name ??
          row.original.reagentId,
      },
      { accessorKey: 'safetyStock', header: '安全阈值' },
      { accessorKey: 'expireWarningDays', header: '预警天数' },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="操作">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditing(row.original)}>
                编辑
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setDeleting(row.original)}
              >
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [labs, reagents],
  );

  const defaultValues = useMemo(
    () => ({
      labId: '',
      reagentId: '',
      safetyStock: '',
      expireWarningDays: '30',
    }),
    [],
  );

  const editingDefaults = useMemo(
    () => ({
      labId: editing?.labId ?? '',
      reagentId: editing?.reagentId ?? '',
      safetyStock: editing?.safetyStock ?? '',
      expireWarningDays: String(editing?.expireWarningDays ?? 30),
    }),
    [editing],
  );

  function renderFields(
    form: UseFormReturn<z.infer<typeof schema>>,
    isEdit: boolean,
  ) {
    return (
      <>
        <FormField
          control={form.control}
          name="labId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>实验室</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={isEdit}
              >
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="选择实验室" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {labs.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="reagentId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>试剂</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={isEdit}
              >
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="选择试剂" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {reagents.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="safetyStock"
            render={({ field }) => (
              <FormItem>
                <FormLabel>安全阈值</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="expireWarningDays"
            render={({ field }) => (
              <FormItem>
                <FormLabel>预警天数</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title="预警配置"
        subtitle="按 实验室 + 试剂 设置安全阈值与有效期预警"
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> 新增 / 更新
          </Button>
        }
      />
      <Card className="p-2">
        <DataTable
          columns={columns}
          data={items}
          loading={loading}
          testId="alerts-config-table"
          emptyTitle="暂无配置"
        />
      </Card>

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        schema={schema}
        defaultValues={defaultValues}
        title="新增 / 更新预警配置"
        description="同 lab + reagent 已存在时为更新"
        onSubmit={async (values) => {
          try {
            await apiFetch('/lab-reagent-configs', {
              method: 'POST',
              token,
              body: {
                ...values,
                expireWarningDays: Number(values.expireWarningDays) || 30,
              },
            });
            toast.success('已保存');
            setFormOpen(false);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '保存失败');
            throw e;
          }
        }}
        fields={(form) => renderFields(form, false)}
      />

      <FormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        schema={schema}
        defaultValues={editingDefaults}
        title="编辑预警配置"
        description={
          editing
            ? `${labs.find((l) => l.id === editing.labId)?.name ?? editing.labId} · ${
                reagents.find((r) => r.id === editing.reagentId)?.name ?? editing.reagentId
              }`
            : ''
        }
        onSubmit={async (values) => {
          if (!editing) return;
          try {
            await apiFetch(`/lab-reagent-configs/${editing.id}`, {
              method: 'PATCH',
              token,
              body: {
                safetyStock: values.safetyStock,
                expireWarningDays: Number(values.expireWarningDays) || 30,
              },
            });
            toast.success('已保存');
            setEditing(null);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '保存失败');
            throw e;
          }
        }}
        fields={(form) => renderFields(form, true)}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="删除预警配置"
        description={`确认删除该配置？`}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await apiFetch(`/lab-reagent-configs/${deleting.id}`, {
              method: 'DELETE',
              token,
            });
            toast.success('已删除');
            setDeleting(null);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '删除失败');
            throw e;
          }
        }}
      />
    </div>
  );
}
