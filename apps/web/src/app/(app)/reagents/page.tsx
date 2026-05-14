'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import type { UseFormReturn } from 'react-hook-form';
import type { HazardLevel, ControlType } from '@app/shared';
import { PageHeader } from '@/components/data/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { Toolbar } from '@/components/data/Toolbar';
import { FormDialog } from '@/components/data/FormDialog';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api-query';
import { useAuth } from '@/lib/auth-store';

interface Reagent {
  id: string;
  name: string;
  cas?: string | null;
  formula?: string | null;
  specification?: string | null;
  category?: string | null;
  hazardLevel: HazardLevel;
  controlType?: ControlType | null;
  msdsFileUrl?: string | null;
}

const HAZARD_LEVELS: HazardLevel[] = ['NORMAL', 'DANGEROUS', 'CONTROLLED'];
const CONTROL_TYPES: ControlType[] = [
  'DRUG_PRECURSOR',
  'EXPLOSIVE_PRECURSOR',
  'TOXIC',
  'NARCOTIC',
];

const schema = z.object({
  name: z.string().min(1, '名称必填'),
  cas: z.string().optional(),
  formula: z.string().optional(),
  specification: z.string().optional(),
  category: z.string().optional(),
  hazardLevel: z.enum(['NORMAL', 'DANGEROUS', 'CONTROLLED']),
  controlType: z
    .enum(['DRUG_PRECURSOR', 'EXPLOSIVE_PRECURSOR', 'TOXIC', 'NARCOTIC'])
    .optional(),
  msdsFileUrl: z
    .string()
    .url('需要合法 URL')
    .optional()
    .or(z.literal('')),
});

type ReagentValues = z.infer<typeof schema>;

const createDefaults: ReagentValues = {
  name: '',
  cas: '',
  formula: '',
  specification: '',
  category: '',
  hazardLevel: 'NORMAL',
  controlType: undefined,
  msdsFileUrl: '',
};

function buildBody(values: ReagentValues) {
  return {
    name: values.name,
    cas: values.cas || undefined,
    formula: values.formula || undefined,
    specification: values.specification || undefined,
    category: values.category || undefined,
    hazardLevel: values.hazardLevel,
    controlType:
      values.hazardLevel === 'CONTROLLED' ? values.controlType : undefined,
    msdsFileUrl: values.msdsFileUrl || undefined,
  };
}

function hazardVariant(level: HazardLevel, controlType?: ControlType | null) {
  if (level === 'CONTROLLED' || controlType) return 'destructive' as const;
  if (level === 'DANGEROUS') return 'default' as const;
  return 'secondary' as const;
}

export default function ReagentsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const roles = useAuth((s) => s.user?.roles ?? []);
  const canWrite =
    roles.includes('SYS_ADMIN') || roles.includes('REAGENT_ADMIN');
  const qc = useQueryClient();

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(handle);
  }, [q]);

  const reagentsQuery = useApiQuery<Reagent[]>('/reagents', {
    params: { q: debouncedQ || undefined },
    queryKey: ['reagents', debouncedQ],
  });
  const items = reagentsQuery.data ?? [];
  const loading = reagentsQuery.isLoading;
  const refresh = () => qc.invalidateQueries({ queryKey: ['reagents'] });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Reagent | null>(null);
  const [deleting, setDeleting] = useState<Reagent | null>(null);

  useEffect(() => {
    if (reagentsQuery.error) {
      toast.error((reagentsQuery.error as Error).message ?? '加载失败');
    }
  }, [reagentsQuery.error]);

  const columns = useMemo<ColumnDef<Reagent>[]>(() => {
    const base: ColumnDef<Reagent>[] = [
      {
        accessorKey: 'name',
        header: '名称',
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            <Badge
              variant={hazardVariant(
                row.original.hazardLevel,
                row.original.controlType,
              )}
            >
              {row.original.controlType ?? row.original.hazardLevel}
            </Badge>
          </span>
        ),
      },
      {
        accessorKey: 'cas',
        header: 'CAS',
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.cas ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'formula',
        header: '分子式',
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.formula ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'specification',
        header: '规格',
        cell: ({ row }) => row.original.specification ?? '—',
      },
      {
        accessorKey: 'category',
        header: '类别',
        cell: ({ row }) => row.original.category ?? '—',
      },
    ];

    if (!canWrite) return base;

    return [
      ...base,
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
                data-testid={`reagents-row-${row.original.id}-actions`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setEditing(row.original)}
                data-testid={`reagents-row-${row.original.id}-edit`}
              >
                编辑
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDeleting(row.original)}
                className="text-destructive focus:text-destructive"
                data-testid={`reagents-row-${row.original.id}-delete`}
              >
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ];
  }, [canWrite]);

  return (
    <div data-testid="reagents-page">
      <PageHeader
        title="试剂百科"
        subtitle="全部在管试剂"
        actions={
          canWrite ? (
            <Button
              onClick={() => setCreating(true)}
              data-testid="reagents-create-btn"
            >
              <Plus className="mr-2 h-4 w-4" /> 添加试剂
            </Button>
          ) : undefined
        }
      />
      <Toolbar
        filters={
          <div className="relative w-72">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索名称或 CAS 号"
              className="pl-8"
            />
          </div>
        }
      />
      <Card className="p-2">
        <DataTable
          columns={columns}
          data={items}
          loading={loading}
          testId="reagents-table"
          emptyTitle="未找到试剂"
        />
      </Card>

      <FormDialog
        open={creating}
        onOpenChange={setCreating}
        schema={schema}
        defaultValues={createDefaults}
        title="添加试剂"
        testId="reagents-create"
        onSubmit={async (values) => {
          try {
            await apiFetch('/reagents', {
              method: 'POST',
              token,
              body: buildBody(values),
            });
            toast.success('已添加');
            setCreating(false);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '保存失败');
            throw e;
          }
        }}
        fields={(form) => <ReagentFields form={form} mode="create" />}
      />

      <FormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        schema={schema}
        defaultValues={
          editing
            ? {
                name: editing.name,
                cas: editing.cas ?? '',
                formula: editing.formula ?? '',
                specification: editing.specification ?? '',
                category: editing.category ?? '',
                hazardLevel: editing.hazardLevel,
                controlType: editing.controlType ?? undefined,
                msdsFileUrl: editing.msdsFileUrl ?? '',
              }
            : createDefaults
        }
        title="编辑试剂"
        description={editing ? `修改 ${editing.name}` : ''}
        testId="reagents-edit"
        onSubmit={async (values) => {
          if (!editing) return;
          try {
            await apiFetch(`/reagents/${editing.id}`, {
              method: 'PATCH',
              token,
              body: buildBody(values),
            });
            toast.success('已更新');
            setEditing(null);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '更新失败');
            throw e;
          }
        }}
        fields={(form) => <ReagentFields form={form} mode="edit" />}
      />
    </div>
  );
}

function ReagentFields({
  form,
  mode,
}: {
  form: UseFormReturn<ReagentValues>;
  mode: 'create' | 'edit';
}) {
  const prefix = `reagents-${mode}`;
  const hazardLevel = form.watch('hazardLevel');
  useEffect(() => {
    if (hazardLevel !== 'CONTROLLED') {
      form.setValue('controlType', undefined);
    }
  }, [hazardLevel, form]);

  return (
    <>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>名称</FormLabel>
            <FormControl>
              <Input data-testid={`${prefix}-name`} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="cas"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CAS</FormLabel>
              <FormControl>
                <Input data-testid={`${prefix}-cas`} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="formula"
          render={({ field }) => (
            <FormItem>
              <FormLabel>分子式</FormLabel>
              <FormControl>
                <Input data-testid={`${prefix}-formula`} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="specification"
          render={({ field }) => (
            <FormItem>
              <FormLabel>规格</FormLabel>
              <FormControl>
                <Input data-testid={`${prefix}-specification`} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>类别</FormLabel>
              <FormControl>
                <Input data-testid={`${prefix}-category`} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="hazardLevel"
        render={({ field }) => (
          <FormItem>
            <FormLabel>危险等级</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger data-testid={`${prefix}-hazard`}>
                  <SelectValue placeholder="选择" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {HAZARD_LEVELS.map((lv) => (
                  <SelectItem key={lv} value={lv}>
                    {lv}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      {hazardLevel === 'CONTROLLED' && (
        <FormField
          control={form.control}
          name="controlType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>管控类型</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value ?? ''}
              >
                <FormControl>
                  <SelectTrigger data-testid={`${prefix}-control`}>
                    <SelectValue placeholder="选择管控类型" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {CONTROL_TYPES.map((ct) => (
                    <SelectItem key={ct} value={ct}>
                      {ct}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      <FormField
        control={form.control}
        name="msdsFileUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>MSDS 链接</FormLabel>
            <FormControl>
              <Input
                data-testid={`${prefix}-msds`}
                placeholder="https://..."
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
