# Web 端 UI 改造（P8a）设计

**日期：** 2026-05-08
**作者：** brainstorm with user
**承接：** P7 完成（`tag p7-complete`），e2e 11 spec 8 pass / 3 self-skip / 0 fail
**目标：** 给 `apps/web/` 装上 shadcn/ui 体系 + 统一 App Shell + 5 个门面页改造，业务行为/API/store 全部不动。

## 既定决策（brainstorm 共识）

| 决策点 | 选择 |
|---|---|
| 改造范围档次 | 引入第三方组件库整体替换 |
| 组件库 | shadcn/ui（Tailwind + Radix，源码复制进仓库，无运行时依赖） |
| 主色 / 气质 | B 实验室绿（emerald 主色 + zinc 中性灰） |
| 全局布局 | 统一 App Shell（一个壳覆盖所有登录后页面） |
| 排期切片 | 分两期：P8a 骨架 + 5 门面页；P8b 剩余 14 个 page（admin 7 + approvals/purchases 1 + my 2 + reports 4） |
| 暗色模式 | 双主题 + 系统跟随 + 用户手动切换（next-themes，localStorage 记忆） |
| e2e 兼容 | P8a 改造的页面 selector 同步改并验收 11 spec 全绿 |

## §1 架构总览

P8a 在 `apps/web/` 内部一次性引入 shadcn/ui 体系并搭好 App Shell + 门面页，业务行为/API/store 全部不动。

```
apps/web/
├─ src/
│  ├─ app/
│  │  ├─ globals.css            ← shadcn CSS variables（light + dark）
│  │  ├─ layout.tsx             ← 注 ThemeProvider + Toaster
│  │  ├─ (public)/              ← route group：login + 错误页
│  │  │  └─ login/page.tsx      ⟵ 已存在，重写
│  │  └─ (app)/                 ← route group：所有登录后页面
│  │     ├─ layout.tsx          ⟵ 新增 RequireAuth + AppShell
│  │     ├─ page.tsx            ⟵ 现有 / 移到这里，改成 Dashboard
│  │     ├─ admin/...           ⟵ 现有 admin/* 平移进来，删 admin/layout.tsx
│  │     ├─ reagents/page.tsx   ⟵ 现有，重写
│  │     ├─ approvals/...       ⟵ 现有
│  │     ├─ my/...
│  │     └─ reports/...         ⟵ 删 reports/layout.tsx
│  ├─ components/
│  │  ├─ ui/                    ← shadcn 复制源码：button/input/table/dialog/...
│  │  ├─ shell/                 ← TopBar / Sidebar / Breadcrumb / UserMenu / ThemeToggle
│  │  ├─ data/                  ← 业务无关：DataTable / EmptyState / PageHeader / Toolbar / ErrorState
│  │  └─ reports/               ⟵ 现有保留（KpiCard / ChartCard 等）
│  └─ lib/
│     ├─ auth-store.ts          ⟵ 不动
│     ├─ api-client.ts          ⟵ 不动
│     ├─ nav.ts                 ← 新增：菜单定义 + 角色过滤
│     └─ utils.ts               ← 新增：cn() helper（shadcn 必需）
```

### 不动的边界

- `lib/auth-store.ts`（zustand persist + hydrated）e2e 强依赖
- `lib/api-client.ts`、所有 `apiFetch` 调用契约
- `components/RequireAuth.tsx`（新 layout 内部 wrap）
- `components/NotificationBell.tsx`（移进 TopBar 但实现保留）
- 所有 API 路由、prisma schema、reports/* 内页样式、reports KpiCard / ChartCard / DateRangePicker / ExportButton

### 对 e2e 的承诺

P8a 完成后 `pnpm test:e2e` 维持 8 pass / 3 self-skip / 0 fail。

## §2 设计 Token 与主题系统

shadcn 标准做法：CSS 变量 + Tailwind `@theme` 桥接。`globals.css` 同时定义 `:root`（light）与 `.dark` 两套 HSL token。

主色 emerald，中性灰 zinc 系（偏冷）。

```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --primary: 158 64% 40%;            /* emerald-600 */
  --primary-foreground: 0 0% 100%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --border: 240 5.9% 90%;
  --ring: 158 64% 40%;
  --radius: 0.5rem;
  /* + destructive / accent / card / popover / chart-1..5 */
}
.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --primary: 158 64% 52%;            /* emerald-500，暗色亮一点 */
  /* ... */
}
```

`tailwind.config.ts`：

- `darkMode: ['class']`（让 ThemeProvider 通过 `<html class="dark">` 控制）
- `theme.extend.colors` 把 `primary` / `muted` / `border` / ... 映射到 CSS 变量
- `theme.extend.borderRadius` 映射 `--radius`
- 字体：`sans` 用 `Inter` + `Noto Sans SC` fallback；`mono` 用 `JetBrains Mono`（次要，仅给 CAS / 分子式）

### 主题切换

- `next-themes` 包：`<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`
- TopBar 用户菜单里加 `ThemeToggle`（light / dark / system 三选）
- 选择写到 localStorage（`theme` key），SSR hydration 安全

### 为什么走 CSS 变量

shadcn 全部组件源码硬编码 `bg-primary` / `text-foreground` 这些语义 class，必须走 CSS 变量 + tailwind 映射这一层；不能直接 extend Tailwind 默认色板。

## §3 App Shell

新建 `(app)/layout.tsx` 作为唯一登录后壳子：

```tsx
<RequireAuth>
  <ThemeProvider>
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />                    {/* h-14 sticky top-0 z-40 */}
      <div className="flex">
        <Sidebar />                 {/* w-60 border-r 左侧持久 */}
        <main className="flex-1 p-6">
          <Breadcrumb />
          {children}
        </main>
      </div>
      <Toaster />                   {/* shadcn sonner 全局 */}
    </div>
  </ThemeProvider>
</RequireAuth>
```

### TopBar 内容（左→右）

- Logo + 应用名 "LabReagent"
- 全局搜索（P8a 占位 `<Input disabled placeholder="即将上线">`，P8b 接 reagent 搜索）
- 弹性间距
- `NotificationBell`（移过来，复用现有组件，外壳套 shadcn `Button variant=ghost size=icon`）
- `ThemeToggle`（light / dark / system DropdownMenu）
- `UserMenu`（Avatar + 邮箱缩写，DropdownMenu 含"个人信息"占位 / "登出"）

### Sidebar

单层菜单 + 分组 label，每项带 `lucide-react` icon。结构由 `lib/nav.ts` 导出：

```ts
export const NAV: NavGroup[] = [
  { label: '工作台', items: [
      { href: '/',          icon: 'LayoutDashboard', label: '首页',    roles: '*' }] },
  { label: '业务', items: [
      { href: '/reagents',         icon: 'FlaskConical', label: '试剂百科', roles: '*' },
      { href: '/my/requests',      icon: 'FileText',     label: '我的申请', roles: '*' },
      { href: '/my/purchases',     icon: 'ShoppingCart', label: '我的采购', roles: '*' },
      { href: '/approvals',        icon: 'CheckSquare',  label: '审批',    roles: ['ADMIN','PI','PURCHASER'] }] },
  { label: '管理', items: [
      { href: '/admin/users',         icon: 'Users',       label: '用户',       roles: ['ADMIN'] },
      { href: '/admin/labs',          icon: 'Beaker',      label: '实验室',     roles: ['ADMIN'] },
      { href: '/admin/roles',         icon: 'KeyRound',    label: '角色权限',   roles: ['ADMIN'] },
      { href: '/admin/stocks',        icon: 'Boxes',       label: '库存',       roles: ['ADMIN','REAGENT_ADMIN'] },
      { href: '/admin/issues',        icon: 'PackageOpen', label: '发放',       roles: ['ADMIN','REAGENT_ADMIN'] },
      { href: '/admin/ledger',        icon: 'BookText',    label: '台账',       roles: ['ADMIN','REAGENT_ADMIN'] },
      { href: '/admin/purchases',     icon: 'Truck',       label: '采购管理',   roles: ['ADMIN','REAGENT_ADMIN','PURCHASER'] },
      { href: '/admin/alerts/config', icon: 'BellRing',    label: '预警配置',   roles: ['ADMIN'] },
      { href: '/approvals/purchases', icon: 'ClipboardList', label: '采购审批', roles: ['ADMIN','PI','PURCHASER'] },
    ] },
  { label: '报表', items: [
      // 用 REPORT_SCOPE_MATRIX 过滤；label 必须保留如下文案（e2e 锁定）
      { href: '/reports/usage-trend',        icon: 'TrendingUp', label: '领用趋势' },
      { href: '/reports/inventory-turnover', icon: 'Package',    label: '库存周转' },
      { href: '/reports/purchase-amount',    icon: 'BarChart3',  label: '采购金额' },
      { href: '/reports/controlled-audit',   icon: 'ShieldAlert',label: '管控审计' },
    ] },
];
```

### 角色过滤

Sidebar 客户端读 `useAuth(s => s.user?.roles)`，对每个 item `roles === '*' || roles.some(r => userRoles.includes(r))` 过滤。整组项全空就隐藏整个 group。报表 group 用 `REPORT_SCOPE_MATRIX`（来自 `@app/shared`）逐项过滤，与现有 `reports/layout.tsx` 行为一致。

### Breadcrumb

由 `usePathname()` 反查 `NAV` 平铺表得到 group + label，"首页 / 管理 / 用户" 三级。`(app)` route group 在 URL 里不出现，不影响 pathname。

### 移动端

P8a 暂不做响应式 sidebar 抽屉。门面页全 `md:` 断点起步。`<md` 留 P8b。

## §4 组件层 Inventory

### shadcn 复制进 `components/ui/`（P8a 装齐）

| 组件 | 用处 |
|---|---|
| `button` | 全站按钮 |
| `input` / `label` / `form` | 登录、搜索框、admin 表单 |
| `card` | Dashboard / 报表 KPI 外壳 |
| `table` | admin / reagents 数据表 |
| `dialog` / `alert-dialog` | 编辑弹窗 / 确认删除 |
| `dropdown-menu` | UserMenu / 行操作菜单 |
| `avatar` | TopBar 用户头像 |
| `badge` | 角色 tag / 状态 chip |
| `sonner` | 全局 toast（替代 `setErr` 红字） |
| `skeleton` | 列表 / 详情 loading |
| `separator` / `scroll-area` | Sidebar 分组、长列表 |
| `tooltip` | icon 按钮注解 |
| `select` | 角色筛选 / 实验室筛选 |
| `textarea` | 审批批注 |

### 自建放在 `components/data/`

- `PageHeader` — 标题 + 副标题 + 右侧操作槽
- `EmptyState` — 空态：icon + 文案 + CTA
- `ErrorState` — 错误态：icon + message + 重试按钮
- `DataTable` — `tanstack-table` v8 包一层 shadcn `table`，提供 column def、loading、empty 接管
- `Toolbar` — 搜索 input + filter selects + 右侧操作槽

### 保留不动

- `components/reports/*`（KpiCard / ChartCard / DateRangePicker / ExportButton / useReportData）
- `components/RequireAuth.tsx`、`NotificationBell.tsx`

### 新增依赖

```
@radix-ui/* (shadcn 自动)
class-variance-authority clsx tailwind-merge   # cn() 必需
lucide-react                                    # 图标
next-themes                                     # 主题
sonner                                          # toast
@tanstack/react-table                           # DataTable
react-hook-form @hookform/resolvers zod         # form 校验（P8a 仅 login 用上）
```

## §5 P8a 五个门面页改造点

### 1) `/` Dashboard（取代旧 4-link 入口）

| 项 | 现状 | 改造 |
|---|---|---|
| 内容 | 4 个蓝色 underline link | `PageHeader` "工作台" + 4 块 `Card` KPI（今日待审批数 / 我的申请 / 库存预警 / 在管管控试剂数）+ 1 块 `Card` 快捷入口 |
| 数据 | 无 | 调用既有 `/requests?status=PENDING&assignedToMe=1` 等 endpoint，失败时 KPI=0；不阻塞渲染 |
| e2e 影响 | 无 spec 覆盖 | 不需要双改 |

P8a 不上图表；KPI 数字 + 趋势小箭头即可。

### 2) `/login` 登录

| 项 | 现状 | 改造 |
|---|---|---|
| 布局 | 居中 80 宽方框 | 居中 `Card`（max-w-sm）+ 顶部 logo + 标题"实验室试剂管理" |
| 表单 | 受控 `useState` × 2 | `react-hook-form` + `zod` 校验，shadcn `Form` |
| 错误 | `setErr` 红字 | `<FormMessage>` + `toast.error(err.message)` |
| e2e 影响 | fixture 走 fetch /auth/login 绕开 UI | 不需要双改 |

注意：登录成功后仍 `router.push('/admin/users')`（保持 P7 行为，不改 fixture 假设）。

### 3) `/admin/users`

| 项 | 现状 | 改造 |
|---|---|---|
| 容器 | 裸 `<table>` | `PageHeader` + `Card` 包 `DataTable` |
| 列 | 邮箱 / 姓名 / 实验室 / 角色 | 同前；角色用 `Badge variant=secondary` 一组 |
| 操作 | 无 | 行末 `DropdownMenu`（"编辑" / "重置密码"占位，P8b 实现），P8a disabled |
| 错误 | 红字 p | `toast.error` |
| 空态 | 无 | `<EmptyState>` 占位 |
| e2e 影响 | 无 spec 覆盖 | 不需要双改 |

### 4) `/reagents`

| 项 | 现状 | 改造 |
|---|---|---|
| 容器 | 裸 page | `PageHeader` "试剂百科" + `Toolbar`（搜索 input + "搜索"按钮 + filter Selects 占位） |
| 表格 | 裸 `<table>` | `DataTable` + 列：名称（带 hazard `Badge` 后缀）/ CAS（mono 字体）/ 分子式 / 规格 / 类别 / 危险等级 |
| 危险等级 | 字符串 | `Badge` 颜色：CONTROLLED=destructive，HIGH=warning，NORMAL=secondary |
| 搜索 | Enter / 按钮 | `react-hook-form` 受控 + debounce 300ms 自动；保留按钮回车兼容 |
| e2e 影响 | 无 spec 覆盖 | 不需要双改 |

### 5) `/approvals` ⚠ e2e 关键路径

| 项 | 现状 | 改造 | e2e 双改 |
|---|---|---|---|
| Heading | "待我审批" `h1` | `PageHeader` 标题 "待我审批"（保留 `<h1>` role） | 无 |
| 列表容器 | `<ul class="space-y-3">` `<li>` | 保留 `<ul>` `<li>`；`<li>` 内包 shadcn `Card` | 无 |
| 卡片内容 | flex 一行 | 左：试剂名 + Badge "管控"（destructive）+ 批号；申请人/数量；用途；项目/地点；时间。右：批注 `Textarea` + 按钮组 | 无 |
| 按钮 | 4 个 `bg-green-600` 等 | shadcn `Button`；通过=`default`（emerald），拒绝=`destructive`；**保留文字**："一审通过/一审拒绝/二审通过/二审拒绝" | 无（按钮文字不变） |
| 空态 | "暂无待审批申请" `p` | `<EmptyState>`，文案保留含 "暂无" | 无 |
| 错误 | 红字 p | `toast.error` | 无 |

**关键不变量：**

- `getByRole('heading', { name: '待我审批' })` → 用 `<h1>` 不变
- `main ul > li` 结构 → `<ul>` `<li>` 必须保留（Card 嵌在 li 内）
- `getByRole('button', { name: '一审通过' }).first()` → Button 文字精确保留
- `await expect(items).toHaveCount(before - 1)` → approve 后该项移除（API 不动）

## §6 e2e 同步改造策略

### 旧二级 layout 处理

| 文件 | 处理 | 替代 |
|---|---|---|
| `apps/web/src/app/admin/layout.tsx` | **删除** | 全局 Sidebar "管理" group 接管，菜单项见 §3 `nav.ts` |
| `apps/web/src/app/reports/layout.tsx` | **删除** | 全局 Sidebar "报表" group 接管；`REPORT_SCOPE_MATRIX` 过滤逻辑迁到 `nav.ts` |

### reports.spec Path 6 兼容性

旧 `reports/layout.tsx` 渲染 `<aside>` 含 4 个 link "领用趋势/库存周转/采购金额/管控审计"，PLAIN_USER 只看到"领用趋势"。新全局 Sidebar 同样 `<aside>`，"报表" group 同样按 `REPORT_SCOPE_MATRIX` 过滤——spec `page.locator('aside').getByRole('link', { name: '领用趋势' })` 仍 work。

**Label 文字注意：** Sidebar 链接用 `管控审计`（spec 期望），但 `/reports/controlled-audit/page.tsx` 的 heading 用 `管控试剂审计`（spec 期望，含"试剂"二字）—— 两者保持现状不要统一。

### 全量 selector 清单（P8a 必须保留）

| Spec | Selector | 来源 | P8a 处置 |
|---|---|---|---|
| Path 1 | `heading "我的申请"` | `/my/requests` | 保留（不动该页） |
| Path 1 | `select` × 2、placeholder "数量" / 含"用途"、button "提交" | `/my/requests` | 保留 |
| Path 1 | `table tbody tr 含 PENDING` | `/my/requests` | 保留 |
| Path 2 | `heading "待我审批"` | `/approvals` ⚠ | **门面页保留 h1 文字** |
| Path 2 | `main ul > li` | `/approvals` ⚠ | **保留 ul/li 结构** |
| Path 2 | `button "一审通过"` | `/approvals` ⚠ | **按钮文字精确保留** |
| Path 3 | `heading "发放管理"`、`h3:has-text("待发放") + ul > li`、placeholder 含"实际量"、button "发放" | `/admin/issues` | 保留（不动该页） |
| Path 4 | `heading "待合并采购申请"` / `heading "批次"` | `/admin/purchases` | 保留（不动该页） |
| Path 5 | `heading 领用趋势/库存周转/采购金额/管控试剂审计 exact` | `/reports/<slug>` | 保留（不动 reports 内页） |
| Path 5 | `div.text-3xl` first | `KpiCard.tsx` | 保留 |
| Path 5 | `columnheader "时间"` | `/reports/controlled-audit` | 保留 |
| Path 5 | `button "导出 CSV"` | `ExportButton` | 保留 |
| Path 6 | `aside` + `link "领用趋势" / "库存周转" / "采购金额" / "管控审计"` | reports sidebar | **新全局 Sidebar `<aside>`，链接 label 与角色过滤一致** |

### 新 testid 规范（P8a 同步打，为 P8b 铺路）

P8a 改造的 5 个门面页内顺手加 `data-testid`：

```
data-testid="page-header-title"
data-testid="users-table" / "reagents-table" / "approvals-list"
data-testid="approval-row" / "approval-approve-l1"
data-testid="theme-toggle" / "user-menu"
```

P8a spec 不强制改用 testid，只是补上让 P8b 替换更平滑。

### 验证步骤（P8a 完工前必跑）

```
pnpm db:up
pnpm test:e2e                  # 期望: 8 pass / 3 skip / 0 fail (~40s)
pnpm -F @app/web build         # 期望: 22 routes 静态生成、trace clean
pnpm -F @app/web test          # 期望: vitest 单测全过
```

任一项红就回到 §5 / §6 排查，禁止 P8a 收尾。

## §7 验收标准

P8a 完成必须全部满足：

### 功能 / 视觉

- [ ] 所有登录后路由共用 `(app)/layout.tsx`，TopBar + Sidebar + Breadcrumb 全部上线
- [ ] Sidebar 按角色过滤：PLAIN_USER 只看到"工作台/业务"+ 报表里的"领用趋势"；ADMIN 看到全部 group
- [ ] light / dark / system 主题切换可用，刷新后保持
- [ ] §5 列出的 5 个门面页全部按表格改造点交付
- [ ] 全站红色错误字 → `toast.error`；裸 `<table>` / `<input>` / `<button>` → shadcn 对应组件
- [ ] 旧 `admin/layout.tsx`、`reports/layout.tsx` 已删除

### 工程

- [ ] `pnpm test:e2e` 8 pass / 3 self-skip / 0 fail
- [ ] `pnpm -F @app/web build` 22 routes 全过 + trace clean
- [ ] `pnpm -F @app/web test` 通过
- [ ] `lib/auth-store.ts`、`lib/api-client.ts`、`/auth/me` 行为零变更（git diff 验证）
- [ ] 新增依赖锁在 lockfile，bundle First Load JS 不超过 +60KB

### 不在 P8a 范围（P8b 任务）

- 移动端响应式 sidebar 抽屉
- admin/* 除 users 外的剩余 7 个页面（alerts/config / issues / labs / ledger / purchases / roles / stocks）
- approvals/purchases、my/requests、my/purchases 改 shadcn
- P8a 阶段 reports/* 内页保留现有样式，P8b 再迁 shadcn
- KpiCard / ChartCard / DateRangePicker / ExportButton 改 shadcn
- 全局搜索功能化（P8a 仅占位 disabled input）
- e2e 改用 testid 替代文字 selector
