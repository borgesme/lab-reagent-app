# P8b · Web shadcn Revamp（移动端 + 全局搜索 + 剩余页改造）Design

**日期：** 2026-05-09
**前置：** P8a（tag `p8a-complete`，HEAD `622bf3c`）
**预计任务数：** 13-16（含验收）

## Goal

在 P8a 的 `(app)/layout.tsx` + `AppShell` + shadcn/ui 体系上完成三件事：

1. **移动端可用**：TopBar 加 hamburger 按钮，shadcn `Sheet` 左侧滑出 sidebar，复用 `filterNavByRoles(NAV, roles)`
2. **全局搜索**：shadcn `CommandDialog` (cmdk) + Cmd/Ctrl+K 快捷键，分两组：导航跳转（NAV 静态）、试剂检索（防抖调 `/reagents?q=`）
3. **剩余页 shadcn 化**：admin/* 7 页 + my/* 2 页 + approvals/purchases —— 统一用 `PageHeader` + `Toolbar` + `DataTable` + `FormDialog`（RHF + zod）+ `ConfirmDialog`

reports/* 4 个内页 与 e2e selector → testid 替换 留 P8c。

## 范围决策（brainstorming 已锁）

| 议题 | 决策 |
|---|---|
| P8b 范围 | 高优先 3-4 项（移动端 + 搜索 + 剩余页 shadcn），不含 reports 内页与 e2e testid |
| admin 改造深度 | 中改造：表单进 Dialog（RHF + zod），列表 DataTable，行级 DropdownMenu actions |
| 移动端抽屉 | shadcn Sheet 左侧滑出 |
| 全局搜索 | Command palette + reagents 防抖 API + 静态导航跳转 |
| my/* 与 approvals/purchases | 与 admin 同期 |
| 验收 | vitest + build + 手动走查全绿；e2e 跳过（依赖 docker） |

## Architecture

沿用 P8a 全部框架，**保持不动**：

- `(app)/layout.tsx`、`(public)/layout.tsx`
- `lib/auth-store.ts`、`lib/api-client.ts`、`lib/nav.ts`（NAV 数据源）
- `components/RequireAuth.tsx`、`components/NotificationBell.tsx`
- `components/shell/Sidebar.tsx`、`Breadcrumb.tsx`、`UserMenu.tsx`、`ThemeToggle.tsx`、`AppShell.tsx`
- `app/(app)/page.tsx`（Dashboard）、`app/(public)/login/page.tsx`
- `app/(app)/reports/*`（P8c）

### 新增资产

```
apps/web/src/
├── components/
│   ├── ui/
│   │   ├── sheet.tsx                          # NEW: shadcn add
│   │   └── command.tsx                        # NEW: shadcn add
│   ├── shell/
│   │   ├── MobileSidebar.tsx                  # NEW
│   │   ├── SearchTrigger.tsx                  # NEW（占位按钮 + Cmd+K 监听）
│   │   ├── TopBar.tsx                         # MODIFY（加 hamburger + SearchTrigger 替换 disabled Input）
│   │   └── __tests__/MobileSidebar.test.tsx   # NEW
│   ├── search/
│   │   ├── CommandPalette.tsx                 # NEW
│   │   └── __tests__/CommandPalette.test.tsx  # NEW
│   └── data/
│       ├── FormDialog.tsx                     # NEW（RHF + zod 通用 wrapper）
│       ├── ConfirmDialog.tsx                  # NEW（AlertDialog wrapper）
│       └── __tests__/
│           ├── FormDialog.test.tsx            # NEW
│           └── ConfirmDialog.test.tsx         # NEW
└── app/(app)/
    ├── admin/
    │   ├── labs/page.tsx                      # REWRITE
    │   ├── roles/page.tsx                     # REWRITE
    │   ├── stocks/page.tsx                    # REWRITE
    │   ├── issues/page.tsx                    # REWRITE
    │   ├── ledger/page.tsx                    # REWRITE（只读，无 FormDialog）
    │   ├── purchases/page.tsx                 # REWRITE
    │   └── alerts/config/page.tsx             # REWRITE
    ├── approvals/purchases/page.tsx           # REWRITE（Card-in-li 模式）
    └── my/
        ├── requests/page.tsx                  # REWRITE（只读）
        └── purchases/page.tsx                 # REWRITE（只读）
```

### 新增依赖

shadcn add 自动引入：`cmdk`（Command）、`@radix-ui/react-dialog` 已在 P8a 中装过（Dialog 复用）。

## 组件契约

### MobileSidebar

```ts
// 属性：受控 open 由 TopBar 持有
interface MobileSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

- 内部用 `<Sheet open={open} onOpenChange={onOpenChange}>` + `<SheetContent side="left">`
- 用 `useAuth((s) => s.user?.roles)` 读角色，`filterNavByRoles(NAV, roles)` 渲染同 desktop Sidebar 的菜单结构
- 点击 NavItem：`router.push(href)` 后调 `onOpenChange(false)`；不依赖 `next/link` 的 prefetch（Sheet 关闭与导航顺序需要可控）
- `usePathname()` 标 active：`pathname === href || pathname.startsWith(href + '/')` → `aria-current="page"`
- 桌面端 (`md:`) 不挂 Sheet：在 `TopBar.tsx` 控制 hamburger 按钮 `md:hidden`，MobileSidebar 始终挂载但仅在 open=true 时可见

### SearchTrigger

```ts
interface SearchTriggerProps {
  onOpen: () => void;
}
```

- 桌面端 (`md:flex`) 渲染为输入框样式的 Button：左 Search icon + "搜索…" placeholder + 右侧 `<kbd>⌘K</kbd>`
- 移动端为 `size="icon"` 的 ghost Button
- `useEffect` 注册 `keydown`：`(e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'` → `e.preventDefault(); onOpen()`；卸载时移除
- 不直接持有 CommandPalette 状态，由 TopBar 持有 open state

### CommandPalette

```ts
interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

- 用 shadcn `<CommandDialog open onOpenChange>`
- `useState(query)` → `useEffect([query])` 250ms debounce → `apiFetch<Reagent[]>('/reagents?q=' + encodeURIComponent(query), { token })`
- 双 group：
  - **导航**：`flatNavItems(filterNavByRoles(NAV, roles))` 客户端 includes(query) 过滤
  - **试剂**：API 结果，每行显示 `name` + `cas`（mono 字体）+ hazard Badge（`hazardLevel === 'CONTROLLED' || controlType` → destructive variant）
- 选中：`router.push(href | '/reagents?id=' + id)` + `onOpenChange(false)` + 清 query
- 空 query：试剂 group 不渲染，不打 API
- API 失败：试剂 group 渲染 `<CommandEmpty>搜索失败</CommandEmpty>`，**不弹 toast**
- 空结果：`<CommandEmpty>无匹配试剂</CommandEmpty>`

### FormDialog

```ts
import type { ZodType, z } from 'zod';
import type { UseFormReturn } from 'react-hook-form';

interface FormDialogProps<S extends ZodType> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schema: S;
  defaultValues: z.infer<S>;
  onSubmit: (values: z.infer<S>) => Promise<void>;
  title: string;
  description?: string;
  submitLabel?: string;       // 默认 '保存'
  fields: (form: UseFormReturn<z.infer<S>>) => React.ReactNode;
}
```

- 内部 `useForm({ resolver: zodResolver(schema), defaultValues })`
- `useEffect([open, defaultValues])` 在 open 变 true 时 `form.reset(defaultValues)`，确保切换"新增/编辑"对象时不串值
- onSubmit 期间 `form.formState.isSubmitting` 控制 Submit Button disabled + Loader2 spinner
- onSubmit throw → caller 自己 toast.error；FormDialog **不自动关**
- onOpenChange(false) 时 `form.reset(defaultValues)` 清状态
- caller 通过 `fields` render prop 写 `<FormField name="x" ...>`

### ConfirmDialog

```ts
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;       // 默认 '确认删除'
  destructive?: boolean;       // 默认 true（按钮 destructive variant）
  onConfirm: () => Promise<void>;
}
```

- 用 shadcn `<AlertDialog>` + `<AlertDialogAction>` `<AlertDialogCancel>`
- onConfirm 期间禁用 Action + Cancel + Loader2
- onConfirm throw → caller toast.error；dialog **不自动关**
- onConfirm 成功 → caller 主动 `onOpenChange(false)`；ConfirmDialog 自身不调用 onOpenChange(false)（避免与 caller 双调）

### TopBar 改造点

```tsx
// 改前 (P8a)：
//   <Link logo /> <Input disabled placeholder="搜索（即将上线）" /> <Bell> <Theme> <User>

// 改后 (P8b)：
const [mobileOpen, setMobileOpen] = useState(false);
const [paletteOpen, setPaletteOpen] = useState(false);

return (
  <>
    <header>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="菜单">
        <Menu />
      </Button>
      <Link>logo</Link>
      <SearchTrigger onOpen={() => setPaletteOpen(true)} className="ml-4" />
      <div className="ml-auto">
        <NotificationBell /> <ThemeToggle /> <UserMenu />
      </div>
    </header>
    <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />
    <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
  </>
);
```

## 页面统一模式

### 写表 admin 页（labs / roles / stocks / issues / purchases / alerts/config）

```tsx
'use client';
const [data, setData] = useState<Row[]>([]);
const [loading, setLoading] = useState(true);
const [editing, setEditing] = useState<Row | null>(null);
const [formOpen, setFormOpen] = useState(false);
const [deleting, setDeleting] = useState<Row | null>(null);

const refresh = useCallback(async () => { ... }, [token]);
useEffect(() => { refresh(); }, [refresh]);

const columns: ColumnDef<Row>[] = [
  // 业务列...
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => { setEditing(row.original); setFormOpen(true); }}>编辑</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDeleting(row.original)} className="text-destructive">删除</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

return (
  <div>
    <PageHeader
      title="实验室管理"
      subtitle="..."
      actions={
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> 新增
        </Button>
      }
    />
    <Card className="p-2">
      <DataTable columns={columns} data={data} loading={loading} testId="labs-table" emptyTitle="暂无实验室" />
    </Card>

    <FormDialog
      open={formOpen}
      onOpenChange={setFormOpen}
      schema={labSchema}
      defaultValues={editing ?? { name: '', building: '' }}
      title={editing ? '编辑实验室' : '新增实验室'}
      onSubmit={async (values) => {
        try {
          if (editing) {
            await apiFetch(`/labs/${editing.id}`, { method: 'PATCH', body: values, token });
          } else {
            await apiFetch('/labs', { method: 'POST', body: values, token });
          }
          toast.success(editing ? '已更新' : '已新增');
          setFormOpen(false);
          refresh();
        } catch (e: any) {
          toast.error(e.message ?? '保存失败');
          throw e;  // 让 FormDialog 知道失败
        }
      }}
      fields={(form) => (
        <>
          <FormField control={form.control} name="name" render={...} />
          <FormField control={form.control} name="building" render={...} />
        </>
      )}
    />

    <ConfirmDialog
      open={!!deleting}
      onOpenChange={(o) => !o && setDeleting(null)}
      title="删除实验室"
      description={`确认删除"${deleting?.name}"吗？`}
      onConfirm={async () => {
        try {
          await apiFetch(`/labs/${deleting!.id}`, { method: 'DELETE', token });
          toast.success('已删除');
          setDeleting(null);
          refresh();
        } catch (e: any) {
          toast.error(e.message ?? '删除失败');
          throw e;
        }
      }}
    />
  </div>
);
```

> **注意：** 各 admin 页 API 路径以现有实现为准；改造**只换 UI 不改 endpoint**。
>
> 每个 admin 页改造前，writing-plans 阶段需先 `Grep apiFetch.*<resource>` 在 apps/api 与该页面文件中确认现有能力：
> - 现有有 POST → 启用"新增"按钮 + FormDialog
> - 现有有 PATCH 或 PUT → 启用"编辑"DropdownMenuItem
> - 现有有 DELETE → 启用"删除"DropdownMenuItem + ConfirmDialog
> - 缺失的能力对应 menu item 保持 `disabled` 等 P8c 后端补齐，**不**临时新增 API endpoint

### 只读 admin 页（ledger）

```tsx
return (
  <div>
    <PageHeader title="台账" subtitle="出入库流水" />
    <Toolbar filters={...搜索/筛选} />
    <Card className="p-2">
      <DataTable columns={columns} data={data} loading={loading} testId="ledger-table" />
    </Card>
  </div>
);
```

### 只读用户页（my/requests, my/purchases）

同 ledger 模板。`my/requests` 列出当前用户申请，状态用 Badge 着色（PENDING / APPROVED / REJECTED / FULFILLED）。

### Card-in-li 模式（approvals/purchases）

按 P8a `/approvals` 同款（PageHeader + `<main><ul><li><Card>`），按钮组按现有业务按钮命名（采购审批的按钮文字遵守现有实现，无 e2e 锁定）。

## 错误处理总则

- API 失败 → `toast.error(e.message ?? '操作失败')`，去掉所有 `setErr` + 红字 `<p>`
- FormDialog onSubmit throw → caller toast，dialog 保持开
- ConfirmDialog onConfirm throw → 同上
- CommandPalette API 失败 → group 内 `<CommandEmpty>搜索失败</CommandEmpty>`，**不弹 toast**
- zod 校验失败 → `<FormMessage />` 内联（shadcn form 自带）
- 不引入 ErrorBoundary
- 离线 / 网络中断 → 依 apiFetch 现有 throw + caller toast

## 测试策略

### 新增单测（5 文件，~14 用例）

| 文件 | 用例 |
|---|---|
| `components/shell/__tests__/MobileSidebar.test.tsx` | (1) hamburger 触发后 dialog 出现；(2) 点击 NavItem 后 onOpenChange(false) 被调；(3) PLAIN_USER 看不到管理 group |
| `components/search/__tests__/CommandPalette.test.tsx` | (1) Cmd+K 触发 onOpenChange(true)（在 SearchTrigger 测）；(2) 输入后 250ms debounce 调 apiFetch (vi.useFakeTimers)；(3) 选中导航项触发 router.push + onOpenChange(false)；(4) 空 query 不打 API |
| `components/data/__tests__/FormDialog.test.tsx` | (1) zod 失败显示 FormMessage；(2) submit 成功调 onSubmit；(3) onSubmit throw 时 dialog 仍开 |
| `components/data/__tests__/ConfirmDialog.test.tsx` | (1) 点 confirm 调 onConfirm；(2) onConfirm 期间按钮 disabled |

### 不写页面级单测

admin 7 页 + my 2 页 + approvals/purchases 不加 vitest 用例。原因：JSDOM 跑 RHF + Dialog + apiFetch 调试成本高、价值低；交给原语单测 + 手动走查。

### 现有测试

P8a 的 19 用例全部不动，断言保持。

## 验收门槛

1. `pnpm -F @app/web exec tsc --noEmit` 0 错
2. `pnpm -F @app/web test` 全绿，用例数 ≥ P8a 的 19 + 新增 ≥ 14 ≈ 33
3. `pnpm -F @app/web build` 22 routes 全部 OK，First Load JS shared 增长 ≤ 30 KB（cmdk + sheet 体积小）
4. **手动视觉走查**：
   - 桌面端 1280px：admin/* 7 页 + my/* 2 页 + approvals/purchases CRUD 操作走通；Cmd+K 打开 Command palette，输入"乙醇"看到结果跳转
   - 移动端 Chrome devtools 375px：hamburger 打开 Sheet，导航跳转后 Sheet 关；TopBar SearchTrigger 显示为图标按钮
   - light/dark 切换无样式断裂
5. **跳 e2e**（本期不依赖 docker）；本轮完工后 commit history 末尾留好提交，等用户在外部 docker 环境补跑后再决定是否 tag `p8b-complete`

## 任务粒度（writing-plans 阶段细化）

按方案 A（基础设施优先）切，预估 13-16 个 task：

1. 装 shadcn sheet + command 组件（含依赖 cmdk）
2. MobileSidebar + 单测
3. TopBar 改造（加 hamburger + 用 SearchTrigger 替换 disabled Input）
4. CommandPalette + 单测
5. FormDialog 通用组件 + 单测
6. ConfirmDialog 通用组件 + 单测
7. admin/labs 改造（首试 FormDialog 模板，跑通定型）
8. admin/roles 改造
9. admin/stocks 改造（多 Select 联动）
10. admin/issues 改造
11. admin/purchases 改造
12. admin/alerts/config 改造（多 Select）
13. admin/ledger 改造（只读）
14. my/requests + my/purchases 改造（只读，合 1 task）
15. approvals/purchases 改造（Card-in-li 模板）
16. 验收：vitest + build + 手动走查

## 不在本期范围

- reports/* 4 个内页改造（KpiCard / ChartCard / DateRangePicker / ExportButton 暂保留旧实现）→ P8c
- e2e selector 替换为 testid → P8c
- ErrorBoundary、SWR/RTK 等数据层重构 → 不计划
- 新建 admin 业务功能 / 改 API → 不在范围
- auth-store / api-client / RequireAuth / NotificationBell → 不动

## 与 P8a 的兼容约束（必须保持）

- `/approvals` `<h1>` 文字"待我审批"
- `/approvals` `<main>` 内 `<ul> > <li>` 结构
- `/approvals` 4 个按钮文字"一审通过/一审拒绝/二审通过/二审拒绝"精确
- Sidebar 根节点 `<aside>` 标签
- 报表 4 个标签文字"领用趋势/库存周转/采购金额/管控审计"（reports/* 不改，自然保持）
