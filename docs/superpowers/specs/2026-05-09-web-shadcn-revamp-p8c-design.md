# P8c · Web shadcn Revamp（reports/* + e2e testid + admin/users）Design

**日期：** 2026-05-09
**前置：** P8b（HEAD `437563b`，未打 tag）
**预计任务数：** 11-12（含验收）

## Goal

在 P8b 基础上完成三件事：

1. **reports/* 4 内页 + 4 共享组件 shadcn 化**：KpiCard / ChartCard / RangePresetPicker / ExportButton 全部重写；4 page 统一为 `PageHeader + Toolbar + Card + Skeleton/EmptyState + DataTable` 模式
2. **e2e selector → testid 迁移**：`tests/e2e/reports.spec.ts` + `tests/e2e/workflows.spec.ts` 把 `getByRole(name, exact)` / `locator('div.text-3xl')` / `<main>ul>li>` 等结构和文字锁定换 `getByTestId(...)`，松绑 P8a 留下的 UI 契约
3. **/admin/users 启用编辑 + 重置密码**：后端 `PATCH /users/:id` 已有；启用前端 disabled 菜单项；如缺 reset endpoint 在 apps/api 补一个

`miniapp-h5.spec.ts` 不动。

## 范围决策（brainstorming 已锁）

| 议题 | 决策 |
|---|---|
| reports/* 4 页 + 4 组件 | 全部 shadcn 化 |
| 明细 table | inventory-turnover、controlled-audit 的裸 `<table>` 换 DataTable |
| DateRangePicker 形态 | preset Select + range Calendar (`mode='range'`)，组件改名 `RangePresetPicker` |
| ExportButton 形态 | DropdownMenu trigger（CSV / Excel 子项），错误用 sonner toast |
| KpiCard 形态 | Card + Skeleton loading + tabular-nums + 可选 trend icon |
| ChartCard 形态 | Card + Skeleton loading + ErrorState/EmptyState 复用 |
| testid 命名约定 | `page-section-element` 全路径式（kebab-case） |
| e2e 范围 | reports.spec.ts + workflows.spec.ts；miniapp-h5.spec.ts 不动 |
| /admin/users | 启用编辑 + 重置密码 |
| 实现切分 | 方案 A：基础设施优先（4 组件 → 4 page → e2e → admin/users → 验收） |

## Architecture

P8a/P8b 沿用全部不动：

- `(app)/layout.tsx`、`(public)/layout.tsx`、AppShell 体系
- `lib/auth-store.ts`、`lib/api-client.ts`、`lib/nav.ts`
- `components/RequireAuth.tsx`、`NotificationBell.tsx`
- `components/data/{PageHeader,DataTable,Toolbar,FormDialog,ConfirmDialog,EmptyState,ErrorState}.tsx`
- `components/shell/{Sidebar,MobileSidebar,TopBar,SearchTrigger,Breadcrumb,UserMenu,ThemeToggle,AppShell}.tsx`
- `components/ui/*`（含 P8b 末加入的 popover / calendar / date-picker）

### 新增/修改资产

```
apps/web/src/
├── components/
│   ├── ui/
│   │   └── date-range-calendar.tsx          # NEW（自封装 Popover + mode='range' Calendar）
│   └── reports/
│       ├── KpiCard.tsx                       # REWRITE（Card + Skeleton + tabular-nums）
│       ├── ChartCard.tsx                     # REWRITE（Card + Skeleton + ErrorState + EmptyState）
│       ├── RangePresetPicker.tsx             # NEW（替换 DateRangePicker.tsx）
│       ├── ExportButton.tsx                  # REWRITE（DropdownMenu + sonner）
│       ├── DateRangePicker.tsx               # DELETE
│       └── __tests__/
│           ├── KpiCard.test.tsx              # NEW
│           ├── ChartCard.test.tsx            # NEW
│           ├── RangePresetPicker.test.tsx    # NEW
│           └── ExportButton.test.tsx         # NEW
├── app/(app)/
│   ├── reports/
│   │   ├── usage-trend/page.tsx              # REWRITE
│   │   ├── inventory-turnover/page.tsx       # REWRITE（明细 → DataTable）
│   │   ├── purchase-amount/page.tsx          # REWRITE
│   │   └── controlled-audit/page.tsx         # REWRITE（明细 → DataTable）
│   └── admin/users/page.tsx                  # MODIFY（启用编辑 + 重置密码）

apps/api/src/users/                            # MODIFY（如缺 reset-password endpoint 补一个）

tests/e2e/
├── reports.spec.ts                            # REWRITE（getByTestId）
├── workflows.spec.ts                          # REWRITE（getByTestId）
└── miniapp-h5.spec.ts                         # 不动
```

### 新增依赖

无。`@radix-ui/react-popover`、`@radix-ui/react-dropdown-menu`、`react-day-picker`（v10）、`date-fns`（v4）、`recharts`（v3.8）、`cmdk`、shadcn 全部已装。

## 组件契约

### KpiCard

```ts
interface KpiCardProps {
  label: string;
  value: string | number | undefined;     // undefined / null 显示 '—'
  delta?: number;                          // 可选；>=0 emerald ↑，<0 destructive ↓
  loading?: boolean;                       // true 时 value 渲染 Skeleton
  testId?: string;                         // 加在最外层 Card：data-testid={testId}
}
```

- 结构：`<Card data-testid={testId}><CardHeader className="pb-2"><CardDescription>{label}</CardDescription></CardHeader><CardContent>{value 区域}</CardContent></Card>`
- value 区域：`<span className="text-3xl font-semibold tabular-nums" data-testid={testId+'-value'}>{value ?? '—'}</span>`
- loading=true：value 替换为 `<Skeleton className="h-8 w-24" />`（不渲染 value-testId span，避免空读取）
- delta：渲染 `ArrowUpIcon` / `ArrowDownIcon`（lucide-react）+ `${delta>=0?'+':''}${delta.toFixed(1)}% vs 上一周期`，颜色 `text-emerald-600` / `text-destructive`
- 不带 testId 时不渲染 `data-testid` 属性

### ChartCard

```ts
interface ChartCardProps {
  title: string;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  testId?: string;
  children: ReactNode;
}
```

- 结构：`<Card data-testid={testId}><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{状态分支}</CardContent></Card>`
- 状态分支优先级：loading > error > empty > children
  - `loading` → `<Skeleton className="h-[320px] w-full" />`
  - `error` → 复用 `ErrorState`（已有 `components/data/ErrorState.tsx`），传 `message={error}`
  - `empty` → 复用 `EmptyState`，传 `title="暂无数据"`
  - 否则 → `{children}`

### RangePresetPicker（新名，取代 DateRangePicker）

```ts
export type RangePreset = '30d' | '90d' | '365d' | 'month' | 'quarter' | 'custom';

interface RangePresetPickerProps {
  range: RangePreset;
  startDate?: string;          // 'yyyy-MM-dd'
  endDate?: string;            // 'yyyy-MM-dd'
  onChange: (next: { range: RangePreset; startDate?: string; endDate?: string }) => void;
  testId?: string;             // 加在外层 div
}
```

- 结构：`<div data-testid={testId} className="flex items-center gap-2">`
  - `<Select value={range} onValueChange>` 6 个 preset 选项（30d/90d/365d/month/quarter/custom）
  - `range === 'custom'` 时附加 `<DateRangeCalendar value={{from,to}} onChange={...} testId={testId+'-calendar'}/>`
- preset 切换不清 startDate/endDate（用户切回 custom 还能保留之前的范围）
- 非 custom 时传给上层 onChange 的 startDate/endDate 都是 undefined（API 不需要）
- 内部 string ↔ Date 互转：进 → `parse(s, 'yyyy-MM-dd', new Date())`；出 → `format(d, 'yyyy-MM-dd')`
- 仅当 `from && to` 都有时才向上层调 onChange（避免半范围 API 调用）

### DateRangeCalendar（ui 层新增，包装 Popover + Calendar mode='range'）

```ts
interface DateRangeCalendarProps {
  value?: { from?: Date; to?: Date };
  onChange?: (range: { from?: Date; to?: Date }) => void;
  placeholder?: string;        // 默认 '选择日期范围'
  testId?: string;
}
```

- 结构：`<Popover><PopoverTrigger asChild><Button variant="outline" data-testid={testId}>[CalendarIcon] {label}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="range" selected={value} onSelect={onChange} numberOfMonths={2} autoFocus/></PopoverContent></Popover>`
- label：
  - 都空 → `<span className="text-muted-foreground">{placeholder}</span>`
  - 仅 from → `format(from,'yyyy-MM-dd')`
  - from + to → `${format(from,'yyyy-MM-dd')} — ${format(to,'yyyy-MM-dd')}`
- numberOfMonths=2 是 react-day-picker 标准 range 双月视图
- Popover 用 controlled `open` state（内部 `useState`）：选完 `to` 时 `useEffect([value?.from, value?.to])` 检测两端齐备，调 `setOpen(false)`，确保 from-to 选齐后自动收起 Popover，避免日历遮挡刷新后的图表
- 仅选 `from`、未选 `to` 不关 Popover；用户点外部 / Esc 关闭也通过 `onOpenChange` 同步

### ExportButton

```ts
interface ExportButtonProps {
  endpoint: string;            // '/reports/usage-trend?range=30d&...'
  testId?: string;             // 加在 trigger Button：data-testid={testId}
                               // 子项 testid：{testId}-csv / {testId}-xlsx
}
```

- 结构：`<DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" data-testid={testId} disabled={downloading}>{downloading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Download className="h-4 w-4"/>} <span className="ml-2">导出</span> <ChevronDown className="ml-1 h-3 w-3"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={()=>download('csv')} data-testid={testId+'-csv'}>导出 CSV</DropdownMenuItem><DropdownMenuItem onClick={()=>download('xlsx')} data-testid={testId+'-xlsx'}>导出 Excel</DropdownMenuItem></DropdownMenuContent></DropdownMenu>`
- 错误：`alert('导出失败:'+res.status)` → `toast.error(\`导出失败:HTTP \${res.status}\`)`；`fetch` throw → `toast.error(e.message ?? '导出失败')`
- 文件名：保持 Content-Disposition 解析逻辑 + `report.{format}` 兜底
- 下载期间用 `useState(downloading)` 控制 trigger Button `disabled` + Loader2

### FormDialog / ConfirmDialog testId 透传扩展

P8b 已有的 `FormDialog` 与 `ConfirmDialog` 在 P8c 增 `testId?: string` prop，透传到 `DialogContent` / `AlertDialogContent` 的 `data-testid`。同时 `FormDialog` 内的 submit Button 加 `data-testid={testId+'-submit'}`，`ConfirmDialog` 的 confirm Action 加 `data-testid={testId+'-confirm'}`、cancel 加 `data-testid={testId+'-cancel'}`。这一改动在 Task 10 由 workflows.spec.ts 迁移驱动落地，已有的 `FormDialog.test.tsx` / `ConfirmDialog.test.tsx` 断言不动。

## 页面统一模式（4 个 reports/*）

### 通用骨架

```tsx
'use client';
const [range, setRange] = useState<RangePreset>('30d');
const [startDate, setStartDate] = useState<string>();
const [endDate, setEndDate] = useState<string>();
const [groupBy, setGroupBy] = useState<...>('day');         // 仅 usage-trend / purchase-amount

const { data, loading, error } = useReportData<XResponse>('/reports/x', {
  range, startDate, endDate, groupBy,
});

const params = new URLSearchParams();
params.set('range', range);
if (startDate) params.set('startDate', startDate);
if (endDate) params.set('endDate', endDate);
if (groupBy) params.set('groupBy', groupBy);
const exportEndpoint = `/reports/x?${params}`;

return (
  <div data-testid="reports-x-page">
    <PageHeader title="XX" subtitle="..." />
    <Toolbar
      filters={
        <>
          {/* 仅 usage-trend / purchase-amount 有 groupBy */}
          <Select value={groupBy} onValueChange={setGroupBy as any}>
            <SelectTrigger data-testid="reports-x-groupby" className="w-32"><SelectValue/></SelectTrigger>
            <SelectContent>{...}</SelectContent>
          </Select>
          <RangePresetPicker
            range={range} startDate={startDate} endDate={endDate}
            onChange={(n)=>{setRange(n.range); setStartDate(n.startDate); setEndDate(n.endDate);}}
            testId="reports-x-range"
          />
        </>
      }
      actions={<ExportButton endpoint={exportEndpoint} testId="reports-x-export"/>}
    />

    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3" data-testid="reports-x-kpis">
      <KpiCard label="..." value={data?.summary.x} loading={loading} testId="reports-x-kpi-x"/>
      ...
    </div>

    <ChartCard title="..." loading={loading} error={error}
      empty={!loading && !error && (data?.series.length ?? 0) === 0}
      testId="reports-x-chart">
      {data && <ResponsiveContainer ...>{...}</ResponsiveContainer>}
    </ChartCard>

    {/* 仅 inventory-turnover / controlled-audit 有明细 */}
    <Card className="mt-4 p-2">
      <DataTable columns={detailColumns} data={data?.rows ?? []} loading={loading}
        testId="reports-x-detail-table" emptyTitle="暂无明细"/>
    </Card>
  </div>
);
```

### 4 page 差异速查

| 页面 slug | groupBy | KPI 数 | 主图表 | 明细 table |
|---|---|---|---|---|
| usage-trend | `day` / `week` / `month` | 3 | LineChart | 无 |
| inventory-turnover | 无 | 2 | BarChart Top 10 | 有（DataTable） |
| purchase-amount | `month` / `category` / `supplier` | 3 | BarChart | 无 |
| controlled-audit | 无 | 2 | 无 | 有（DataTable） |

### testid 命名清单（写测试时直接抄）

| testId | 元素 |
|---|---|
| `reports-{slug}-page` | 最外层 div |
| `reports-{slug}-range` | RangePresetPicker 容器 |
| `reports-{slug}-range-calendar` | DateRangeCalendar trigger Button |
| `reports-{slug}-export` | ExportButton trigger Button |
| `reports-{slug}-export-csv` / `-xlsx` | DropdownMenuItem |
| `reports-{slug}-groupby` | Select trigger（仅 usage-trend、purchase-amount） |
| `reports-{slug}-kpis` | KPI 容器 grid |
| `reports-{slug}-kpi-{key}` | 单 KpiCard |
| `reports-{slug}-kpi-{key}-value` | KpiCard 内 value `<span>` |
| `reports-{slug}-chart` | ChartCard |
| `reports-{slug}-detail-table` | DataTable（明细） |

KPI key 命名（按 API 字段，kebab-case）：

- usage-trend: `total` / `distinct` / `daily-avg`
- inventory-turnover: `avg-turnover` / `low-stock`
- purchase-amount: `total` / `batch-count` / `pending-batch`
- controlled-audit: `events` / `actors`

### 明细 DataTable 列定义

**inventory-turnover 完整明细：**

```ts
const detailColumns: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: '试剂' },
  { accessorKey: 'currentQty', header: '现存', cell: ({row}) => <span className="tabular-nums">{row.original.currentQty}</span> },
  { accessorKey: 'dailyOut', header: '日均出', cell: ({row}) => <span className="tabular-nums">{row.original.dailyOut}</span> },
  { accessorKey: 'turnoverDays', header: '周转天数', cell: ({row}) => <span className="tabular-nums">{row.original.turnoverDays}</span> },
  { accessorKey: 'status', header: '状态', cell: ({row}) => {
    const s = row.original.status;
    return <Badge variant={s==='low'?'destructive':s==='stale'?'secondary':'default'}>{s==='low'?'低':s==='stale'?'滞销':'正常'}</Badge>;
  }},
];
```

**controlled-audit 审计明细：**

```ts
const detailColumns: ColumnDef<Row>[] = [
  { accessorKey: 'ts', header: '时间', cell: ({row}) => <span className="font-mono text-xs">{row.original.ts.slice(0,19).replace('T',' ')}</span> },
  { accessorKey: 'action', header: '动作' },
  { accessorKey: 'reagentName', header: '试剂' },
  { accessorKey: 'actorName', header: '操作人' },
  { accessorKey: 'qty', header: '数量', cell: ({row}) => <span className="tabular-nums">{row.original.qty}</span> },
  { accessorKey: 'beforeQty', header: '变更前', cell: ({row}) => <span className="tabular-nums">{row.original.beforeQty ?? ''}</span> },
  { accessorKey: 'afterQty', header: '变更后', cell: ({row}) => <span className="tabular-nums">{row.original.afterQty ?? ''}</span> },
];
```

### /admin/users 启用编辑 + 重置密码

- **编辑**：FormDialog + zod schema（`username` readonly、`displayName`、`email`、`roles[]`、`status`）→ `apiFetch('/users/'+id, {method:'PATCH', body, token})` → toast.success + refresh
- **重置密码**：先 `Grep "@Post.*reset-password|@Patch.*reset" apps/api/src/users/`：
  - **后端已有** → 直接 ConfirmDialog → `apiFetch('/users/'+id+'/reset-password', {method:'POST', token})` → toast 显示返回的临时密码
  - **后端缺** → 在 task 切分时拆 11a（apps/api 补 endpoint：service + controller + 单测）+ 11b（前端启用 ConfirmDialog）
- testId：`admin-users-edit-{id}`、`admin-users-reset-{id}`、`admin-users-edit-dialog`、`admin-users-reset-dialog`

## e2e 迁移策略

### 当前 e2e 失效点（reports/* 改造后必坏）

| 文件 | 旧锁定 | 改后 |
|---|---|---|
| reports.spec.ts | `locator('div.text-3xl').first()` | KpiCard value 在 `<span>` → 必坏 |
| reports.spec.ts | `getByRole('button', { name: '导出 CSV' })` | DropdownMenu 改 menuitem → 必坏 |
| workflows.spec.ts | `page.locator('select').nth(0)` | shadcn Select 不渲染原生 `<select>` → 必坏（P8b 已破，仅 P7 时代有效） |
| workflows.spec.ts | `getByRole('button', { name: '提交' })` | FormDialog 提交按钮文字"保存" → 必坏（P8b 已破） |

> 注：上面"P8b 已破"的两条说明 workflows.spec.ts 在当前 HEAD 已不可跑通，本 P8c 一并修。

### testid 注入计划（reports/* 之外的页面）

P8b 已落地的 my/* / approvals/ / admin/issues/ / admin/purchases/ 也补 testid，便于 workflows.spec 覆盖：

- `app/(public)/login/page.tsx` → `login-username`、`login-password`、`login-submit`
- `app/(app)/my/requests/page.tsx` → `my-requests-page`、新增 trigger `my-requests-add`、FormDialog `my-requests-form`、submit `my-requests-form-submit`、stock select `my-requests-form-stock`、reagent select `my-requests-form-reagent`、qty input `my-requests-form-qty`、purpose textarea `my-requests-form-purpose`
- `app/(app)/approvals/page.tsx` → `approvals-page`、每行 `approvals-item-{id}`、按钮 `approvals-tier1-approve` / `approvals-tier1-reject` / `approvals-tier2-approve` / `approvals-tier2-reject`
- `app/(app)/admin/issues/page.tsx` → `admin-issues-pending-row-{id}`、qty input `admin-issues-row-{id}-qty`、issue button `admin-issues-row-{id}-issue`、ledger table `admin-issues-history-table`
- `app/(app)/admin/purchases/page.tsx` → `admin-purchases-page`、merge button `admin-purchases-merge`、batches section heading 区域 `admin-purchases-batches`

### testid 添加方式

页面级：`<div data-testid="reports-usage-trend-page">...`

shadcn 组件层：通过 `testId` prop 透传到根 element（KpiCard / ChartCard / RangePresetPicker / ExportButton 已设计 testId prop）。FormDialog 同步加 `testId` prop（透传到 DialogContent），ConfirmDialog 同理。本期需修改 FormDialog/ConfirmDialog 加 testId 透传。

DataTable 已有 `testId` prop（P8b 已传），保持原状。

### e2e 改写示意（reports.spec.ts）

```ts
test(`${slug} renders heading + KPI`, async ({ page }) => {
  await page.goto(`/reports/${slug}`);
  await expect(page.getByTestId(`reports-${slug}-page`)).toBeVisible();
  const firstKpi = page.locator(`[data-testid^="reports-${slug}-kpi-"][data-testid$="-value"]`).first();
  await expect(firstKpi).toBeVisible({ timeout: 10_000 });
  await expect(firstKpi).toHaveText(/[0-9—.\-]+/);
  if (slug === 'controlled-audit' || slug === 'inventory-turnover') {
    await expect(page.getByTestId(`reports-${slug}-detail-table`)).toBeVisible();
  }
});

test('export CSV triggers a .csv download', async ({ page }) => {
  await page.goto('/reports/usage-trend');
  await page.getByTestId('reports-usage-trend-export').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('reports-usage-trend-export-csv').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
});
```

### e2e 改写示意（workflows.spec.ts Path 1）

```ts
test('select reagent + stock → submit → row in PENDING', async ({ page }) => {
  await page.goto('/my/requests');
  await expect(page.getByTestId('my-requests-page')).toBeVisible();
  await page.getByTestId('my-requests-add').click();

  const dialog = page.getByTestId('my-requests-form');
  await expect(dialog).toBeVisible();

  // shadcn Select 通过 testid 定位 trigger
  const reagentSelect = dialog.getByTestId('my-requests-form-reagent');
  await reagentSelect.click();
  const reagentOptions = page.getByRole('option');
  test.skip((await reagentOptions.count()) === 0, 'no reagents seeded');
  // pick first non-controlled by data attribute or label scan
  ...
  await dialog.getByTestId('my-requests-form-qty').fill('1');
  await dialog.getByTestId('my-requests-form-purpose').fill('e2e test');
  await dialog.getByTestId('my-requests-form-submit').click();

  await expect(
    page.getByTestId('my-requests-table').locator('tbody tr').filter({ hasText: 'PENDING' }).first(),
  ).toBeVisible({ timeout: 10_000 });
});
```

> 写测试时 reagent 列表 controlled / non-controlled 标记如何在 SelectItem 上暴露 → 把"管控"标记加在 SelectItem 的 `data-controlled="true"`，e2e 用 `[data-controlled="false"]` 选择器筛非管控。这一项加在 Task 10。

## 错误处理总则

- API 失败 → `toast.error(e.message ?? '加载失败')`
- ChartCard error → 复用 ErrorState 组件
- ExportButton 失败 → toast.error 替代 alert
- KpiCard value=undefined → 显示 `—`（无错误）
- /admin/users 编辑失败 → FormDialog onSubmit throw → caller toast，dialog 保持开（P8b 模式）
- /admin/users 重置密码失败 → ConfirmDialog onConfirm throw → caller toast，dialog 保持开

## 测试策略

### 新增单测（4 文件 ~10 用例）

| 文件 | 用例 |
|---|---|
| `components/reports/__tests__/KpiCard.test.tsx` | (1) value 正常渲染；(2) value=undefined 显示 `—`；(3) loading=true 渲染 Skeleton；(4) delta>0 显示 ↑ 文本 |
| `components/reports/__tests__/ChartCard.test.tsx` | (1) loading 渲染 Skeleton；(2) error 渲染 ErrorState；(3) empty 渲染 EmptyState；(4) 否则渲染 children |
| `components/reports/__tests__/RangePresetPicker.test.tsx` | (1) Select 切 30d 调 onChange；(2) range='custom' 时显示 DateRangeCalendar trigger；(3) DateRangeCalendar onChange 转字符串调 onChange |
| `components/reports/__tests__/ExportButton.test.tsx` | (1) 点 trigger 后 menu item 出现；(2) 点 CSV 调 fetch 含 token；(3) 失败 toast.error |

DateRangeCalendar 不写独立单测（视觉组件，借 RangePresetPicker 间接覆盖）。

### 不写 page 级单测

reports/* 4 page 不加 vitest（同 P8b 理由）。

### 现有测试

P8b 的 32 用例不动。新增 ~10 用例，总数 ≥ 42。

## 验收门槛

1. `pnpm -F @app/web exec tsc --noEmit` 0 错
2. `pnpm -F @app/web test` 全绿，用例数 ≥ 42
3. `pnpm -F @app/web build` 22 routes 全 OK；First Load JS shared ≤ 92.3 kB（P8b 87.3 kB + 5 KB 容差）；reports 路由 chunk 不显著回归
4. **手动视觉走查（dev 模式 + 桌面 1280px + 375px + light/dark）**：
   - 4 reports/* 页：KPI Skeleton → 数值；图表渲染；preset 切刷数据；custom Calendar from-to 后刷数据；导出 ▾ → CSV/Excel 下载触发
   - 2 个明细 DataTable 排序、空态、loading skeleton 正常
   - /admin/users：编辑 dialog 提交刷新；重置密码 confirm → toast 临时密码
5. **e2e 待 docker 复测**：commit history 留好节点；用户在外部 docker 跑 `pnpm db:up && pnpm test:e2e`，目标 8 pass / 3 self-skip / 0 fail。复测通过再决定打 `p8c-complete` tag

## 任务粒度（writing-plans 阶段细化）

按方案 A（基础设施优先）切，预估 11-12 个 task：

1. `RangePresetPicker` + `DateRangeCalendar` + 单测（删除旧 `DateRangePicker.tsx`）
2. `ExportButton` 重写（DropdownMenu + sonner）+ 单测
3. `KpiCard` 重写（Card + Skeleton + tabular-nums + delta icon）+ 单测
4. `ChartCard` 重写（Card + Skeleton + ErrorState + EmptyState）+ 单测
5. `/reports/usage-trend` page 重写
6. `/reports/inventory-turnover` page 重写（含明细 → DataTable）
7. `/reports/purchase-amount` page 重写
8. `/reports/controlled-audit` page 重写（含明细 → DataTable）
9. `tests/e2e/reports.spec.ts` 换 testid（reports/* 各页 testid 由 5-8 task 落地）
10. `tests/e2e/workflows.spec.ts` 换 testid + 给 my/requests / approvals / admin/issues / admin/purchases / login 补 testid + FormDialog/ConfirmDialog 加 testId 透传
11. `/admin/users` 启用编辑 + 重置密码（先 grep 后端，决定是否拆 11a 后端 endpoint + 11b 前端启用）
12. 验收：vitest + tsc + build + 手动走查

## 不在本期范围

- 报表 KPI delta% / trend 数据源（API 增字段）→ KpiCard 已支持 delta prop，本期 page 不传，等 API 出
- ChartCard 内图表组件抽象（Line/Bar 各 page 自己 dynamic import，不抽 ChartLine/ChartBar 公共组件）
- e2e miniapp-h5.spec.ts 不动（Taro h5）
- 报表数据缓存层（SWR / RTK）→ 不计划
- /admin/users 之外的 admin disabled 项（grep 确认本期前没有其他 disabled 菜单项）
- 新业务功能 / 改 reports API → 不在范围
- auth-store / api-client / nav / RequireAuth / NotificationBell → 不动

## 与 P8a/P8b 兼容约束（本期解锁与保持）

P8b 设计稿 § "与 P8a 兼容约束" 的 5 条 e2e 锁定 UI 契约：

| 旧契约 | P8c 状态 |
|---|---|
| `/approvals` `<h1>` 文字"待我审批" | **解锁**（用 `approvals-page` testid） |
| `/approvals` `<main>` 内 `<ul> > <li>` 结构 | **解锁**（用 `approvals-item-{id}` testid） |
| `/approvals` 4 个按钮文字精确 | **解锁**（用 testid，文字保持中文不变） |
| Sidebar 根节点 `<aside>` 标签 | **保持**（HTML 语义化，无理由变） |
| 报表 4 个标签文字"领用趋势/库存周转/采购金额/管控审计" | **保持**（用户可见标题，p7 spec 锁定） |

其余 P8a 框架（auth-store、api-client、nav、RequireAuth、NotificationBell、AppShell、Sidebar、Breadcrumb、UserMenu、ThemeToggle）继续 lockdown。
