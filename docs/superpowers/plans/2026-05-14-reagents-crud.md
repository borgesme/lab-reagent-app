# Reagents 模块 CRUD 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/reagents` 试剂百科页补齐添加/编辑/删除三个写入操作，并附 7 个新测试用例。

**Architecture:** 完整镜像 `admin/labs` 模板（DropdownMenu + FormDialog + ConfirmDialog + apiFetch + qc.invalidateQueries 刷新）。字段集合按 backend DTO 完整 8 字段；hazardLevel=CONTROLLED 时显示 controlType Select 否则隐藏并清空。`SYS_ADMIN` 或 `REAGENT_ADMIN` 角色才能看到 CRUD 入口；PLAIN_USER 仍可读列表。

**Tech Stack:** Next.js App Router + react-hook-form + zodResolver + tanstack/react-query + shadcn/ui + vitest + @testing-library/react。

**Spec:** `docs/superpowers/specs/2026-05-14-reagents-crud-design.md`

---

## File Structure

- Modify: `apps/web/src/app/(app)/reagents/page.tsx`（现 107 行 → 约 380 行；扩展为完整 CRUD）
- Modify: `apps/web/src/app/(app)/reagents/__tests__/page.test.tsx`（现 3 用例 → 10 用例）

不新增文件。复用模板组件：`FormDialog`、`ConfirmDialog`、`PageHeader`、`Toolbar`、`DataTable`。

---

## 全局约定

**testid 命名表**（贯穿全部 task 的实现 + 测试）：

| 用途 | testid |
|------|--------|
| 页面根 | `reagents-page` |
| 顶部新增按钮 | `reagents-create-btn` |
| 行末菜单触发 | `reagents-row-{id}-actions` |
| 行末编辑菜单项 | `reagents-row-{id}-edit` |
| 行末删除菜单项 | `reagents-row-{id}-delete` |
| 创建 dialog base | `reagents-create` |
| 创建字段 | `reagents-create-name`、`-cas`、`-formula`、`-specification`、`-category`、`-msds`、`-hazard`、`-control` |
| 创建提交/取消 | `reagents-create-submit` / `reagents-create-cancel`（FormDialog 派生） |
| 编辑 dialog base | `reagents-edit` |
| 编辑字段 | `reagents-edit-name`、`-cas`、`-formula`、`-specification`、`-category`、`-msds`、`-hazard`、`-control` |
| 编辑提交/取消 | `reagents-edit-submit` / `reagents-edit-cancel`（FormDialog 派生） |
| 删除 dialog base | `reagents-delete` |
| 删除确认/取消 | `reagents-delete-confirm` / `reagents-delete-cancel`（ConfirmDialog 派生） |

**Reagent 类型扩展**（包含全部 8 字段，page.tsx 现有 interface 只覆盖 5 个）：

```ts
import type { HazardLevel, ControlType } from '@app/shared';

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
```

---

## Task 1: 角色门控 + UI 骨架

把现有只读页面扩展出"角色判定 + 顶部按钮 + 行末菜单"的外壳（dialog 本体留到后续 task）。先用测试驱动出按钮可见性逻辑。

**Files:**
- Modify: `apps/web/src/app/(app)/reagents/page.tsx`
- Test: `apps/web/src/app/(app)/reagents/__tests__/page.test.tsx`

- [ ] **Step 1.1: 写"PLAIN_USER 看不到写入入口"测试**

在 `page.test.tsx` 文件末尾的 `describe` 块内最后一个 `it` 之后追加（保留现有 3 用例不动）：

```tsx
  it('PLAIN_USER 角色 → 无 create-btn / 行末无 actions 菜单', async () => {
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'u', email: 'u@lab.local', roles: ['PLAIN_USER'] } as any,
      hydrated: true,
    });
    mockApiFetch.mockResolvedValue(reagentsFixture);
    renderWithQuery(<ReagentsPage />);
    await waitFor(() => screen.getByText('乙醇'));

    expect(screen.queryByTestId('reagents-create-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reagents-row-r1-actions')).not.toBeInTheDocument();
  });

  it('REAGENT_ADMIN 角色 → 可见 create-btn 与行末 actions', async () => {
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: {
        id: 'admin',
        email: 'admin@lab.local',
        roles: ['REAGENT_ADMIN'],
      } as any,
      hydrated: true,
    });
    mockApiFetch.mockResolvedValue(reagentsFixture);
    renderWithQuery(<ReagentsPage />);
    await waitFor(() => screen.getByText('乙醇'));

    expect(screen.getByTestId('reagents-create-btn')).toBeInTheDocument();
    expect(screen.getByTestId('reagents-row-r1-actions')).toBeInTheDocument();
  });
```

同时把 `beforeEach` 里给所有用户授 SYS_ADMIN 角色（现有的 `user: { id: 'u', email: 'u@lab.local' } as any` 没有 roles，要补）：

```tsx
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: {
        id: 'u',
        email: 'u@lab.local',
        roles: ['SYS_ADMIN'],
      } as any,
      hydrated: true,
    });
  });
```

- [ ] **Step 1.2: 跑测试，预期 2 个新用例失败**

```bash
cd D:/Project/0417-any-demo/apps/web && npx vitest run "src/app/(app)/reagents/__tests__/page.test.tsx"
```

预期 FAIL：找不到 `reagents-create-btn`（页面还没渲染按钮）。

- [ ] **Step 1.3: 把 page.tsx 改为以下完整内容**

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { HazardLevel, ControlType } from '@app/shared';
import { PageHeader } from '@/components/data/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { Toolbar } from '@/components/data/Toolbar';
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

function hazardVariant(level: HazardLevel, controlType?: ControlType | null) {
  if (level === 'CONTROLLED' || controlType) return 'destructive' as const;
  if (level === 'DANGEROUS') return 'default' as const;
  return 'secondary' as const;
}

export default function ReagentsPage() {
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

      {/* dialog 实例在 Task 2/3/4 接入；当前点击按钮 setState 后无副作用 */}
      {creating || editing || deleting ? null : null}
    </div>
  );
}
```

注意 `useAuth.user.roles` 是 `RoleCode[]`（字符串数组，见 `packages/shared/src/api-types.ts:18`），所以用 `.includes(...)` 判断。

- [ ] **Step 1.4: 跑测试，预期 5 个用例（原 3 + 新 2）全过**

```bash
cd D:/Project/0417-any-demo/apps/web && npx vitest run "src/app/(app)/reagents/__tests__/page.test.tsx"
```

预期 PASS：5 tests / 0 fail。

- [ ] **Step 1.5: tsc 验证**

```bash
cd D:/Project/0417-any-demo/apps/web && npx tsc --noEmit
```

预期：无输出（0 错）。

- [ ] **Step 1.6: commit**

```bash
cd D:/Project/0417-any-demo && git add apps/web/src/app/\(app\)/reagents/page.tsx apps/web/src/app/\(app\)/reagents/__tests__/page.test.tsx && git commit -m "feat(web/reagents): 角色门控 + CRUD UI 骨架

useAuth.roles 取 RoleCode[]，SYS_ADMIN | REAGENT_ADMIN 才看到
+ 添加试剂 按钮与行末 DropdownMenu(编辑/删除)。骨架阶段，dialog
留到后续 task。新增 2 个 vitest：PLAIN_USER 看不到入口 / REAGENT_ADMIN
看得到。原 3 用例的 beforeEach 给默认 SYS_ADMIN 保持向后兼容。"
```

---

## Task 2: 创建 FormDialog + 联动

接入"添加试剂"对话框，含 8 字段表单和 hazardLevel→controlType 联动逻辑。

**Files:**
- Modify: `apps/web/src/app/(app)/reagents/page.tsx`
- Test: `apps/web/src/app/(app)/reagents/__tests__/page.test.tsx`

- [ ] **Step 2.1: 写"添加 happy + 添加失败"两个测试**

在 `page.test.tsx` 文件末尾追加：

```tsx
  it('添加试剂 → POST /reagents body 含 8 字段 + dialog 关闭', async () => {
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path.startsWith('/reagents') && !opts?.method)
        return reagentsFixture;
      if (opts?.method === 'POST' && path === '/reagents')
        return { id: 'r-new' };
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<ReagentsPage />);
    await waitFor(() => screen.getByText('乙醇'));

    await user.click(screen.getByTestId('reagents-create-btn'));

    await user.type(
      await screen.findByTestId('reagents-create-name'),
      '丙酮',
    );
    await user.type(screen.getByTestId('reagents-create-cas'), '67-64-1');
    await user.type(screen.getByTestId('reagents-create-formula'), 'C3H6O');
    await user.type(screen.getByTestId('reagents-create-specification'), 'AR');
    await user.type(screen.getByTestId('reagents-create-category'), '有机溶剂');
    await user.type(
      screen.getByTestId('reagents-create-msds'),
      'https://example.com/msds.pdf',
    );

    await user.click(screen.getByTestId('reagents-create-hazard'));
    await user.click(await screen.findByRole('option', { name: 'DANGEROUS' }));

    await user.click(screen.getByTestId('reagents-create-submit'));

    await waitFor(() => {
      const post = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST' && c[0] === '/reagents',
      );
      expect(post).toBeDefined();
      expect(post![1].body).toMatchObject({
        name: '丙酮',
        cas: '67-64-1',
        formula: 'C3H6O',
        specification: 'AR',
        category: '有机溶剂',
        hazardLevel: 'DANGEROUS',
        msdsFileUrl: 'https://example.com/msds.pdf',
      });
      expect(post![1].body.controlType).toBeUndefined();
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId('reagents-create-name'),
      ).not.toBeInTheDocument();
    });
  });

  it('添加失败 → toast.error + dialog 保持打开', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path.startsWith('/reagents') && !opts?.method)
        return reagentsFixture;
      if (opts?.method === 'POST' && path === '/reagents')
        throw new Error('API 422: 名称重复');
      throw new Error('unmocked');
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<ReagentsPage />);
    await waitFor(() => screen.getByText('乙醇'));

    await user.click(screen.getByTestId('reagents-create-btn'));
    await user.type(
      await screen.findByTestId('reagents-create-name'),
      '丙酮',
    );
    await user.click(screen.getByTestId('reagents-create-hazard'));
    await user.click(await screen.findByRole('option', { name: 'NORMAL' }));
    await user.click(screen.getByTestId('reagents-create-submit'));

    await waitFor(() => {
      expect(toast.error as any).toHaveBeenCalled();
      expect(screen.getByTestId('reagents-create-name')).toBeInTheDocument();
    });
  });
```

- [ ] **Step 2.2: 跑测试，预期 2 个新用例失败**

```bash
cd D:/Project/0417-any-demo/apps/web && npx vitest run "src/app/(app)/reagents/__tests__/page.test.tsx"
```

预期 FAIL：找不到 `reagents-create-name`（dialog 未渲染）。

- [ ] **Step 2.3: 在 page.tsx 顶部 import 区追加**

```tsx
import { z } from 'zod';
import { FormDialog } from '@/components/data/FormDialog';
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
```

把 `useAuth` 那一行下方的 `useAuth` 增加 token 读取（用于 apiFetch）：

```tsx
const token = useAuth((s) => s.tokens?.accessToken);
const roles = useAuth((s) => s.user?.roles ?? []);
```

- [ ] **Step 2.4: 在 `interface Reagent` 下方追加 schema + 类型 + 默认值**

```tsx
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
```

- [ ] **Step 2.5: 在 page.tsx 内 `<Card>...</Card>` 之后、组件 return 的 `</div>` 之前，把原占位 `{creating || editing || deleting ? null : null}` 替换为创建 FormDialog**

```tsx
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
```

- [ ] **Step 2.6: 在 page.tsx 末尾（`export default function ReagentsPage` 之后）追加共用 fields 组件**

```tsx
function ReagentFields({
  form,
  mode,
}: {
  form: import('react-hook-form').UseFormReturn<ReagentValues>;
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
```

- [ ] **Step 2.7: 跑测试，预期 7 个用例（5+2）全过**

```bash
cd D:/Project/0417-any-demo/apps/web && npx vitest run "src/app/(app)/reagents/__tests__/page.test.tsx"
```

预期 PASS：7 tests / 0 fail。

- [ ] **Step 2.8: tsc 验证**

```bash
cd D:/Project/0417-any-demo/apps/web && npx tsc --noEmit
```

预期：无输出。

- [ ] **Step 2.9: commit**

```bash
cd D:/Project/0417-any-demo && git add apps/web/src/app/\(app\)/reagents/page.tsx apps/web/src/app/\(app\)/reagents/__tests__/page.test.tsx && git commit -m "feat(web/reagents): 添加试剂 FormDialog + 8 字段联动

ReagentFields 共用 fields 组件，create/edit 通过 mode 切换 testid
前缀。hazardLevel != CONTROLLED 时 controlType 字段隐藏并清空。
buildBody 把空串转 undefined 对齐后端 DTO optional 语义。
新增 2 个 vitest：添加 happy POST body 8 字段 / 添加失败 toast 保留 dialog。"
```

---

## Task 3: 编辑 FormDialog

接入"编辑"对话框，共用 schema 与 `ReagentFields`，从行末菜单触发。

**Files:**
- Modify: `apps/web/src/app/(app)/reagents/page.tsx`
- Test: `apps/web/src/app/(app)/reagents/__tests__/page.test.tsx`

- [ ] **Step 3.1: 写"编辑 happy"测试**

在 `page.test.tsx` 末尾追加：

```tsx
  it('编辑试剂 → PATCH /reagents/{id} body 含改动字段 + dialog 关闭', async () => {
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path.startsWith('/reagents') && !opts?.method)
        return reagentsFixture;
      if (opts?.method === 'PATCH' && path === '/reagents/r1') return {};
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<ReagentsPage />);
    await waitFor(() => screen.getByText('乙醇'));

    await user.click(screen.getByTestId('reagents-row-r1-actions'));
    await user.click(screen.getByTestId('reagents-row-r1-edit'));

    const nameInput = await screen.findByTestId('reagents-edit-name');
    await user.clear(nameInput);
    await user.type(nameInput, '无水乙醇');

    await user.click(screen.getByTestId('reagents-edit-submit'));

    await waitFor(() => {
      const patch = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'PATCH' && c[0] === '/reagents/r1',
      );
      expect(patch).toBeDefined();
      expect(patch![1].body.name).toBe('无水乙醇');
      expect(patch![1].body.hazardLevel).toBe('NORMAL');
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId('reagents-edit-name'),
      ).not.toBeInTheDocument();
    });
  });
```

- [ ] **Step 3.2: 跑测试，预期新用例失败**

```bash
cd D:/Project/0417-any-demo/apps/web && npx vitest run "src/app/(app)/reagents/__tests__/page.test.tsx"
```

预期 FAIL：找不到 `reagents-edit-name`。

- [ ] **Step 3.3: 在 page.tsx 的创建 FormDialog 之后追加编辑 FormDialog**

```tsx
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
```

`FormDialog` 内部已经在 `useEffect` 里监听 `open` 变化重置表单为 `defaultValues`（见 `FormDialog.tsx:50-55`），所以编辑时点开会自动注入对应试剂的字段。

- [ ] **Step 3.4: 跑测试，预期 8 用例全过**

```bash
cd D:/Project/0417-any-demo/apps/web && npx vitest run "src/app/(app)/reagents/__tests__/page.test.tsx"
```

预期 PASS：8 tests。

- [ ] **Step 3.5: tsc 验证**

```bash
cd D:/Project/0417-any-demo/apps/web && npx tsc --noEmit
```

预期：无输出。

- [ ] **Step 3.6: commit**

```bash
cd D:/Project/0417-any-demo && git add apps/web/src/app/\(app\)/reagents/page.tsx apps/web/src/app/\(app\)/reagents/__tests__/page.test.tsx && git commit -m "feat(web/reagents): 编辑试剂 FormDialog + 行末菜单触发

复用 ReagentFields(mode='edit')。defaultValues 从 editing 状态注入，
FormDialog 内部 useEffect 已处理 open 切换时表单重置。
新增 1 个 vitest：编辑 happy PATCH /reagents/{id} body 含改动字段。"
```

---

## Task 4: 删除 ConfirmDialog

接入"删除"二次确认对话框，软删调用 DELETE 路径。

**Files:**
- Modify: `apps/web/src/app/(app)/reagents/page.tsx`
- Test: `apps/web/src/app/(app)/reagents/__tests__/page.test.tsx`

- [ ] **Step 4.1: 写"删除 happy"测试**

在 `page.test.tsx` 末尾追加：

```tsx
  it('删除试剂 → DELETE /reagents/{id} + toast 含试剂名', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path.startsWith('/reagents') && !opts?.method)
        return reagentsFixture;
      if (opts?.method === 'DELETE' && path === '/reagents/r1') return {};
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<ReagentsPage />);
    await waitFor(() => screen.getByText('乙醇'));

    await user.click(screen.getByTestId('reagents-row-r1-actions'));
    await user.click(screen.getByTestId('reagents-row-r1-delete'));

    await user.click(screen.getByTestId('reagents-delete-confirm'));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/reagents/r1',
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(
        (toast.success as any).mock.calls.some((c: any[]) =>
          String(c[0]).includes('乙醇'),
        ),
      ).toBe(true);
    });
  });
```

- [ ] **Step 4.2: 跑测试，预期失败**

```bash
cd D:/Project/0417-any-demo/apps/web && npx vitest run "src/app/(app)/reagents/__tests__/page.test.tsx"
```

预期 FAIL：找不到 `reagents-delete-confirm`。

- [ ] **Step 4.3: 在 page.tsx import 区追加**

```tsx
import { ConfirmDialog } from '@/components/data/ConfirmDialog';
```

- [ ] **Step 4.4: 在编辑 FormDialog 之后追加删除 ConfirmDialog**

```tsx
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="删除试剂"
        description={`确认删除"${deleting?.name}"？该试剂会被软删除，关联的库存、申请记录不会被级联删除。`}
        confirmLabel="确认删除"
        destructive
        testId="reagents-delete"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await apiFetch(`/reagents/${deleting.id}`, {
              method: 'DELETE',
              token,
            });
            toast.success(`已删除 ${deleting.name}`);
            setDeleting(null);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '删除失败');
            throw e;
          }
        }}
      />
```

- [ ] **Step 4.5: 跑测试，预期 9 用例全过**

```bash
cd D:/Project/0417-any-demo/apps/web && npx vitest run "src/app/(app)/reagents/__tests__/page.test.tsx"
```

预期 PASS：9 tests。

- [ ] **Step 4.6: tsc 验证**

```bash
cd D:/Project/0417-any-demo/apps/web && npx tsc --noEmit
```

预期：无输出。

- [ ] **Step 4.7: commit**

```bash
cd D:/Project/0417-any-demo && git add apps/web/src/app/\(app\)/reagents/page.tsx apps/web/src/app/\(app\)/reagents/__tests__/page.test.tsx && git commit -m "feat(web/reagents): 删除试剂 ConfirmDialog + 软删 toast

复用 ConfirmDialog destructive 样式 + 软删提示文案（与 admin/labs 同款）。
新增 1 个 vitest：删除 happy DELETE /reagents/{id} + toast 含试剂名。"
```

---

## Task 5: 联动专项测试（happy + negative）

Task 2 已实现联动，本 task 用两条独立测试显式锁定行为：CONTROLLED 时 controlType 渲染并能选 + body 带；切换回 NORMAL 时字段消失 + body 不带。

**Files:**
- Test: `apps/web/src/app/(app)/reagents/__tests__/page.test.tsx`（仅改测试）

- [ ] **Step 5.1: 写两个联动测试**

在 `page.test.tsx` 末尾追加：

```tsx
  it('hazardLevel=CONTROLLED → controlType Select 显示并能选, body 带 controlType', async () => {
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path.startsWith('/reagents') && !opts?.method)
        return reagentsFixture;
      if (opts?.method === 'POST' && path === '/reagents')
        return { id: 'r-new' };
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<ReagentsPage />);
    await waitFor(() => screen.getByText('乙醇'));

    await user.click(screen.getByTestId('reagents-create-btn'));
    await user.type(
      await screen.findByTestId('reagents-create-name'),
      '吗啡',
    );

    expect(
      screen.queryByTestId('reagents-create-control'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId('reagents-create-hazard'));
    await user.click(await screen.findByRole('option', { name: 'CONTROLLED' }));

    await user.click(
      await screen.findByTestId('reagents-create-control'),
    );
    await user.click(await screen.findByRole('option', { name: 'NARCOTIC' }));

    await user.click(screen.getByTestId('reagents-create-submit'));

    await waitFor(() => {
      const post = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST' && c[0] === '/reagents',
      );
      expect(post).toBeDefined();
      expect(post![1].body.hazardLevel).toBe('CONTROLLED');
      expect(post![1].body.controlType).toBe('NARCOTIC');
    });
  });

  it('hazardLevel=NORMAL → controlType 字段不渲染, body 不带 controlType', async () => {
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path.startsWith('/reagents') && !opts?.method)
        return reagentsFixture;
      if (opts?.method === 'POST' && path === '/reagents')
        return { id: 'r-new' };
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<ReagentsPage />);
    await waitFor(() => screen.getByText('乙醇'));

    await user.click(screen.getByTestId('reagents-create-btn'));
    await user.type(
      await screen.findByTestId('reagents-create-name'),
      '水',
    );

    expect(
      screen.queryByTestId('reagents-create-control'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId('reagents-create-submit'));

    await waitFor(() => {
      const post = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST' && c[0] === '/reagents',
      );
      expect(post).toBeDefined();
      expect(post![1].body.hazardLevel).toBe('NORMAL');
      expect(post![1].body.controlType).toBeUndefined();
    });
  });
```

- [ ] **Step 5.2: 跑测试，预期 11 用例全过（Task 2 已实现联动逻辑）**

```bash
cd D:/Project/0417-any-demo/apps/web && npx vitest run "src/app/(app)/reagents/__tests__/page.test.tsx"
```

预期 PASS：11 tests。

如果 negative 用例失败（`controlType` 被赋值），检查 `buildBody` 是否在 `hazardLevel !== 'CONTROLLED'` 时把 controlType 转 undefined（Task 2 的 Step 2.4 已包含此逻辑）。

- [ ] **Step 5.3: commit**

```bash
cd D:/Project/0417-any-demo && git add apps/web/src/app/\(app\)/reagents/__tests__/page.test.tsx && git commit -m "test(web/reagents): hazardLevel↔controlType 联动专项 +2 用例

CONTROLLED 时 controlType 显示并能选 body 带 / NORMAL 时字段消失 body 不带。
锁定 buildBody 的 controlType 守卫。"
```

---

## Task 6: 全套 vitest + tsc 收尾

跨页面全套验证，确保新改动没破坏其他 28 个测试文件。

**Files:** 无修改。

- [ ] **Step 6.1: apps/web 全部 vitest**

```bash
cd D:/Project/0417-any-demo/apps/web && npx vitest run
```

预期：28 文件 / 113 用例全过（reagents 由 3→11 共 +8，其余 27 个测试文件 105 用例不变）。

如有失败，针对失败用例 debug（最常见：DataTable 渲染顺序变化、Select 在 jsdom 找不到 option name）。

- [ ] **Step 6.2: tsc 全套**

```bash
cd D:/Project/0417-any-demo/apps/web && npx tsc --noEmit
```

预期：无输出。

- [ ] **Step 6.3: 视觉走查**（手动）

```bash
cd D:/Project/0417-any-demo/apps/web && npm run dev
```

浏览器打开 `http://localhost:3000/reagents`：
1. PLAIN_USER 登录 → 看列表 + 搜索可用，无 + 添加 按钮，行末无 ⋯ 菜单
2. 切换 SYS_ADMIN 登录 → 出现 + 添加 + 行末菜单
3. 添加：hazardLevel 选 CONTROLLED 时 controlType 字段冒出，选 DANGEROUS 时字段消失
4. 编辑：点行末编辑，dialog 字段被现有值预填
5. 删除：确认后试剂从列表消失（软删，后端 deletedAt 已置位）

如视觉不符预期，回退修复后再提交。

- [ ] **Step 6.4: 终态汇总**

到此 5 个 commit + 1 个测试 commit：
- `feat(web/reagents): 角色门控 + CRUD UI 骨架`
- `feat(web/reagents): 添加试剂 FormDialog + 8 字段联动`
- `feat(web/reagents): 编辑试剂 FormDialog + 行末菜单触发`
- `feat(web/reagents): 删除试剂 ConfirmDialog + 软删 toast`
- `test(web/reagents): hazardLevel↔controlType 联动专项 +2 用例`

`reagents/__tests__/page.test.tsx` 用例数 3→11（+8），apps/web 总用例 105→113。
