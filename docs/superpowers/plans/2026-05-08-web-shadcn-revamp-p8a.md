# P8a · Web shadcn Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `apps/web/` 装上 shadcn/ui 体系（emerald 主题 + light/dark 双主题）+ 统一 App Shell（TopBar + 角色过滤 Sidebar + Breadcrumb）+ 5 个门面页（Dashboard / Login / admin/users / reagents / approvals）改造。业务行为、API、auth-store 不动。

**Architecture:** Next.js 14 App Router + Tailwind 3.4 现有栈 → 引入 shadcn/ui（源码复制到 `components/ui/`，无运行时依赖）。所有登录后页面收敛到 `(app)/layout.tsx` 单一 shell，删旧的 `admin/layout.tsx` 与 `reports/layout.tsx`。Login 移到 `(public)` route group。Sidebar 菜单由 `lib/nav.ts` 集中定义并按 `useAuth` 角色过滤；报表 group 复用 `REPORT_SCOPE_MATRIX`。主题用 `next-themes`，暴露 `<html class="dark">` 钩子让 shadcn CSS 变量切换。

**Tech Stack:** Next.js 14.2.3 / React 18.3 / TypeScript 5.4 / Tailwind 3.4 / zustand 4.5 / vitest + RTL。新增依赖：`class-variance-authority` `clsx` `tailwind-merge` `lucide-react` `next-themes` `sonner` `@tanstack/react-table` `react-hook-form` `@hookform/resolvers` `zod` + `@radix-ui/*`（shadcn add 自动）。

**Spec:** `docs/superpowers/specs/2026-05-08-web-shadcn-revamp-design.md`（commit `d46f14f`）

**Prerequisites:** P7 完成（tag `p7-complete`，HEAD ≥ `97adeeb`）。`pnpm db:up` + `pnpm test:e2e` 跑过一次确认 8 pass / 3 self-skip / 0 fail 基线。`pnpm -F @app/web dev` 起得来。

---

## File Structure

```
apps/web/src/
├── app/
│   ├── globals.css                       # MODIFY: shadcn :root + .dark 变量
│   ├── layout.tsx                        # MODIFY: ThemeProvider + Toaster
│   ├── (public)/                         # NEW route group
│   │   └── login/page.tsx                # MOVE: from app/login + 重写
│   ├── (app)/                            # NEW route group
│   │   ├── layout.tsx                    # NEW: RequireAuth + AppShell
│   │   ├── page.tsx                      # MOVE: from app/page.tsx + 重写为 Dashboard
│   │   ├── reagents/page.tsx             # MOVE + 重写
│   │   ├── approvals/page.tsx            # MOVE + 重写（e2e 关键）
│   │   ├── approvals/purchases/page.tsx  # MOVE 不改
│   │   ├── my/requests/page.tsx          # MOVE 不改
│   │   ├── my/purchases/page.tsx         # MOVE 不改
│   │   ├── admin/users/page.tsx          # MOVE + 重写
│   │   ├── admin/labs/page.tsx           # MOVE 不改
│   │   ├── admin/roles/page.tsx          # MOVE 不改
│   │   ├── admin/stocks/page.tsx         # MOVE 不改
│   │   ├── admin/issues/page.tsx         # MOVE 不改
│   │   ├── admin/ledger/page.tsx         # MOVE 不改
│   │   ├── admin/purchases/page.tsx      # MOVE 不改
│   │   ├── admin/alerts/config/page.tsx  # MOVE 不改
│   │   ├── reports/usage-trend/page.tsx          # MOVE 不改
│   │   ├── reports/inventory-turnover/page.tsx   # MOVE 不改
│   │   ├── reports/purchase-amount/page.tsx      # MOVE 不改
│   │   └── reports/controlled-audit/page.tsx     # MOVE 不改
│   ├── admin/layout.tsx                  # DELETE
│   └── reports/layout.tsx                # DELETE
├── components/
│   ├── ui/                               # NEW: shadcn 复制（CLI 生成）
│   │   ├── button.tsx / input.tsx / label.tsx / form.tsx
│   │   ├── card.tsx / table.tsx / dialog.tsx / alert-dialog.tsx
│   │   ├── dropdown-menu.tsx / avatar.tsx / badge.tsx
│   │   ├── sonner.tsx / skeleton.tsx / separator.tsx / scroll-area.tsx
│   │   ├── tooltip.tsx / select.tsx / textarea.tsx
│   ├── shell/                            # NEW
│   │   ├── AppShell.tsx                  # 组合 TopBar + Sidebar + main
│   │   ├── TopBar.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Breadcrumb.tsx
│   │   ├── ThemeToggle.tsx
│   │   ├── UserMenu.tsx
│   │   └── __tests__/{Sidebar,Breadcrumb}.test.tsx
│   ├── data/                             # NEW
│   │   ├── PageHeader.tsx / EmptyState.tsx / ErrorState.tsx
│   │   ├── Toolbar.tsx / DataTable.tsx
│   │   └── __tests__/{PageHeader,EmptyState,DataTable}.test.tsx
│   ├── theme-provider.tsx                # NEW: next-themes wrapper
│   ├── reports/                          # KEEP 不动
│   ├── RequireAuth.tsx                   # KEEP 不动
│   └── NotificationBell.tsx              # KEEP 不动（被 TopBar 引用）
├── lib/
│   ├── auth-store.ts                     # KEEP 不动
│   ├── api-client.ts                     # KEEP 不动
│   ├── utils.ts                          # NEW: cn() helper
│   ├── nav.ts                            # NEW: NAV + filterNavByRoles
│   └── __tests__/nav.test.ts             # NEW
├── tailwind.config.ts                    # MODIFY: darkMode + extend.colors
└── package.json                          # MODIFY: + 11 个依赖
```

---

## Task 1: 装依赖 + design tokens + cn() utils

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/tailwind.config.ts`
- Modify: `apps/web/src/app/globals.css`
- Create: `apps/web/src/lib/utils.ts`

- [ ] **Step 1: 装依赖**

```bash
pnpm -F @app/web add class-variance-authority clsx tailwind-merge lucide-react next-themes sonner @tanstack/react-table react-hook-form @hookform/resolvers zod tailwindcss-animate
```

预期：`apps/web/package.json` `dependencies` 多 11 项，pnpm-lock 更新。

- [ ] **Step 2: 写 cn() helper**

`apps/web/src/lib/utils.ts`：

```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: 改写 tailwind.config.ts**

`apps/web/tailwind.config.ts`：

```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    container: { center: true, padding: '2rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', '"Noto Sans SC"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
```

- [ ] **Step 4: 改写 globals.css 加 token**

`apps/web/src/app/globals.css`：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 158 64% 40%;
    --primary-foreground: 0 0% 100%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 158 64% 40%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 158 64% 52%;
    --primary-foreground: 240 10% 3.9%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 158 64% 52%;
  }
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

- [ ] **Step 5: typecheck + commit**

```bash
pnpm -F @app/web exec tsc --noEmit
```

预期：0 错误。

```bash
git add apps/web/package.json apps/web/tailwind.config.ts apps/web/src/app/globals.css apps/web/src/lib/utils.ts pnpm-lock.yaml
git commit -m "feat(web/p8a): add shadcn deps + design tokens + cn() helper"
```

---

## Task 2: ThemeProvider + Toaster 接入 root layout

**Files:**
- Create: `apps/web/src/components/theme-provider.tsx`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: 写 ThemeProvider wrapper**

`apps/web/src/components/theme-provider.tsx`：

```tsx
'use client';
import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

- [ ] **Step 2: 改写 root layout**

`apps/web/src/app/layout.tsx`：

```tsx
import './globals.css';
import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = { title: '实验室试剂管理' };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

注意：`<NotificationBell />` 此时不在 root，挪到 TopBar（Task 10）。本次提交后访问 `/` 会暂时看不到通知图标，是预期。

- [ ] **Step 3: 启动 dev 验证不白屏**

```bash
pnpm -F @app/web dev
```

浏览器开 `http://localhost:3000/login`，确认页面渲染（可能样式裸，正常，下面 task 修）。Ctrl+C 关。

- [ ] **Step 4: typecheck + commit**

```bash
pnpm -F @app/web exec tsc --noEmit
git add apps/web/src/components/theme-provider.tsx apps/web/src/app/layout.tsx
git commit -m "feat(web/p8a): wire next-themes ThemeProvider into root layout"
```

---

## Task 3: 复制 shadcn/ui 组件源码

**Files:**
- Create: `apps/web/src/components/ui/{button,input,label,form,card,table,dialog,alert-dialog,dropdown-menu,avatar,badge,sonner,skeleton,separator,scroll-area,tooltip,select,textarea}.tsx`
- Create: `apps/web/components.json`（shadcn 配置）

- [ ] **Step 1: 初始化 shadcn**

```bash
cd apps/web && pnpm dlx shadcn@latest init -y --src-dir --base-color zinc --css-variables
```

交互式问题答案（如未自动接受）：style=default、tailwind config=tailwind.config.ts、components alias=@/components、utils alias=@/lib/utils、RSC=yes。

预期：在 `apps/web/` 生成 `components.json`，确认 `aliases.utils === "@/lib/utils"` 且 `aliases.components === "@/components"`。如果命令覆盖了 `globals.css` 或 `tailwind.config.ts`，用 `git checkout -- <file>` 还原我们 Task 1 的版本。

- [ ] **Step 2: 批量 add 17 个组件**

```bash
cd apps/web && pnpm dlx shadcn@latest add -y button input label form card table dialog alert-dialog dropdown-menu avatar badge sonner skeleton separator scroll-area tooltip select textarea
```

预期：`apps/web/src/components/ui/` 下生成 18 个 `.tsx` 文件（form 自动带 react-hook-form 集成）。

- [ ] **Step 3: 验证 import 可解析**

新建临时 `apps/web/src/lib/__tests__/shadcn-resolve.test.ts`：

```ts
import { describe, it, expect } from 'vitest';

describe('shadcn imports resolve', () => {
  it('button + card + table all importable', async () => {
    const { Button } = await import('@/components/ui/button');
    const { Card } = await import('@/components/ui/card');
    const { Table } = await import('@/components/ui/table');
    expect(Button).toBeDefined();
    expect(Card).toBeDefined();
    expect(Table).toBeDefined();
  });
});
```

- [ ] **Step 4: 跑测试**

```bash
pnpm -F @app/web test -- shadcn-resolve
```

预期：1 pass。

- [ ] **Step 5: 删临时测试 + typecheck + commit**

```bash
rm apps/web/src/lib/__tests__/shadcn-resolve.test.ts
pnpm -F @app/web exec tsc --noEmit
git add apps/web/components.json apps/web/src/components/ui/ pnpm-lock.yaml
git commit -m "feat(web/p8a): copy 18 shadcn/ui components into components/ui"
```

---

## Task 4: lib/nav.ts + 角色过滤逻辑（含单测）

**Files:**
- Create: `apps/web/src/lib/nav.ts`
- Create: `apps/web/src/lib/__tests__/nav.test.ts`

- [ ] **Step 1: 写 failing test**

`apps/web/src/lib/__tests__/nav.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { NAV, filterNavByRoles } from '../nav';
import type { RoleCode } from '@app/shared';

describe('NAV', () => {
  it('contains 4 top-level groups (工作台/业务/管理/报表)', () => {
    expect(NAV.map((g) => g.label)).toEqual(['工作台', '业务', '管理', '报表']);
  });

  it('报表 group has 4 reports with exact e2e-locked labels', () => {
    const reports = NAV.find((g) => g.label === '报表')!;
    expect(reports.items.map((i) => i.label)).toEqual([
      '领用趋势',
      '库存周转',
      '采购金额',
      '管控审计',
    ]);
  });
});

describe('filterNavByRoles', () => {
  it('PLAIN_USER sees 工作台 + 业务 (excluding 审批) + 报表 (only 领用趋势)', () => {
    const filtered = filterNavByRoles(NAV, ['PLAIN_USER'] as RoleCode[]);
    const labels = filtered.map((g) => g.label);
    expect(labels).toContain('工作台');
    expect(labels).toContain('业务');
    expect(labels).not.toContain('管理');

    const biz = filtered.find((g) => g.label === '业务')!;
    expect(biz.items.map((i) => i.label)).not.toContain('审批');

    const reports = filtered.find((g) => g.label === '报表')!;
    expect(reports.items.map((i) => i.label)).toEqual(['领用趋势']);
  });

  it('SYS_ADMIN sees all 4 groups + all 4 reports', () => {
    const filtered = filterNavByRoles(NAV, ['SYS_ADMIN'] as RoleCode[]);
    expect(filtered.map((g) => g.label)).toEqual(['工作台', '业务', '管理', '报表']);
    const reports = filtered.find((g) => g.label === '报表')!;
    expect(reports.items).toHaveLength(4);
  });

  it('LAB_HEAD sees 审批 in 业务 + 报表 (lab scope = 4 reports)', () => {
    const filtered = filterNavByRoles(NAV, ['LAB_HEAD'] as RoleCode[]);
    const biz = filtered.find((g) => g.label === '业务')!;
    expect(biz.items.map((i) => i.label)).toContain('审批');
    const reports = filtered.find((g) => g.label === '报表')!;
    expect(reports.items.map((i) => i.label)).toEqual([
      '领用趋势',
      '库存周转',
      '采购金额',
      '管控审计',
    ]);
  });

  it('hides empty group', () => {
    const filtered = filterNavByRoles(NAV, ['PLAIN_USER'] as RoleCode[]);
    expect(filtered.find((g) => g.label === '管理')).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm -F @app/web test -- nav
```

预期：FAIL（`Cannot resolve '../nav'`）。

- [ ] **Step 3: 写实现**

`apps/web/src/lib/nav.ts`：

```ts
import type { RoleCode, ReportType } from '@app/shared';
import { REPORT_SCOPE_MATRIX } from '@app/shared';

export type IconName =
  | 'LayoutDashboard'
  | 'FlaskConical'
  | 'FileText'
  | 'ShoppingCart'
  | 'CheckSquare'
  | 'Users'
  | 'Beaker'
  | 'KeyRound'
  | 'Boxes'
  | 'PackageOpen'
  | 'BookText'
  | 'Truck'
  | 'BellRing'
  | 'ClipboardList'
  | 'TrendingUp'
  | 'Package'
  | 'BarChart3'
  | 'ShieldAlert';

export interface NavItem {
  href: string;
  icon: IconName;
  label: string;
  /** '*' 即所有登录用户可见；数组按 OR 匹配 */
  roles: '*' | RoleCode[];
  /** 仅报表项使用：当其 reportType 在 REPORT_SCOPE_MATRIX[role] 为 null 时该角色不可见 */
  reportType?: ReportType;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: '工作台',
    items: [
      { href: '/', icon: 'LayoutDashboard', label: '首页', roles: '*' },
    ],
  },
  {
    label: '业务',
    items: [
      { href: '/reagents', icon: 'FlaskConical', label: '试剂百科', roles: '*' },
      { href: '/my/requests', icon: 'FileText', label: '我的申请', roles: '*' },
      { href: '/my/purchases', icon: 'ShoppingCart', label: '我的采购', roles: '*' },
      {
        href: '/approvals',
        icon: 'CheckSquare',
        label: '审批',
        roles: ['LAB_HEAD', 'SAFETY_OFFICER', 'SYS_ADMIN'],
      },
    ],
  },
  {
    label: '管理',
    items: [
      { href: '/admin/users', icon: 'Users', label: '用户', roles: ['SYS_ADMIN'] },
      { href: '/admin/labs', icon: 'Beaker', label: '实验室', roles: ['SYS_ADMIN'] },
      { href: '/admin/roles', icon: 'KeyRound', label: '角色权限', roles: ['SYS_ADMIN'] },
      { href: '/admin/stocks', icon: 'Boxes', label: '库存', roles: ['SYS_ADMIN', 'REAGENT_ADMIN'] },
      { href: '/admin/issues', icon: 'PackageOpen', label: '发放', roles: ['SYS_ADMIN', 'REAGENT_ADMIN'] },
      { href: '/admin/ledger', icon: 'BookText', label: '台账', roles: ['SYS_ADMIN', 'REAGENT_ADMIN'] },
      { href: '/admin/purchases', icon: 'Truck', label: '采购管理', roles: ['SYS_ADMIN', 'REAGENT_ADMIN'] },
      { href: '/admin/alerts/config', icon: 'BellRing', label: '预警配置', roles: ['SYS_ADMIN'] },
      {
        href: '/approvals/purchases',
        icon: 'ClipboardList',
        label: '采购审批',
        roles: ['LAB_HEAD', 'SYS_ADMIN'],
      },
    ],
  },
  {
    label: '报表',
    items: [
      { href: '/reports/usage-trend', icon: 'TrendingUp', label: '领用趋势', roles: '*', reportType: 'usage-trend' },
      { href: '/reports/inventory-turnover', icon: 'Package', label: '库存周转', roles: '*', reportType: 'inventory-turnover' },
      { href: '/reports/purchase-amount', icon: 'BarChart3', label: '采购金额', roles: '*', reportType: 'purchase-amount' },
      { href: '/reports/controlled-audit', icon: 'ShieldAlert', label: '管控审计', roles: '*', reportType: 'controlled-audit' },
    ],
  },
];

function itemAllowed(item: NavItem, roles: RoleCode[]): boolean {
  if (item.reportType) {
    return roles.some(
      (r) => REPORT_SCOPE_MATRIX[r]?.[item.reportType!] != null,
    );
  }
  if (item.roles === '*') return true;
  return item.roles.some((r) => roles.includes(r));
}

export function filterNavByRoles(nav: NavGroup[], roles: RoleCode[]): NavGroup[] {
  return nav
    .map((g) => ({ ...g, items: g.items.filter((i) => itemAllowed(i, roles)) }))
    .filter((g) => g.items.length > 0);
}

/** 平铺所有项，给 Breadcrumb 反查用 */
export function flatNavItems(nav: NavGroup[] = NAV): Array<NavItem & { groupLabel: string }> {
  return nav.flatMap((g) => g.items.map((i) => ({ ...i, groupLabel: g.label })));
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm -F @app/web test -- nav
```

预期：5 pass。

- [ ] **Step 5: commit**

```bash
git add apps/web/src/lib/nav.ts apps/web/src/lib/__tests__/nav.test.ts
git commit -m "feat(web/p8a): NAV registry + filterNavByRoles (5 unit tests)"
```

---

## Task 5: components/data 业务无关组件（含单测）

**Files:**
- Create: `apps/web/src/components/data/PageHeader.tsx`
- Create: `apps/web/src/components/data/EmptyState.tsx`
- Create: `apps/web/src/components/data/ErrorState.tsx`
- Create: `apps/web/src/components/data/Toolbar.tsx`
- Create: `apps/web/src/components/data/DataTable.tsx`
- Create: `apps/web/src/components/data/__tests__/PageHeader.test.tsx`
- Create: `apps/web/src/components/data/__tests__/EmptyState.test.tsx`
- Create: `apps/web/src/components/data/__tests__/DataTable.test.tsx`

- [ ] **Step 1: 装 RTL（如缺）**

```bash
pnpm -F @app/web add -D @testing-library/react@14.2.2 @testing-library/jest-dom @testing-library/user-event
```

（`@testing-library/react` 已在 P7 装过，跳过 add 也可。其它两个新装。）

- [ ] **Step 2: 写 PageHeader**

`apps/web/src/components/data/PageHeader.tsx`：

```tsx
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex items-start justify-between gap-4', className)}>
      <div>
        <h1 data-testid="page-header-title" className="text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
```

`apps/web/src/components/data/__tests__/PageHeader.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '../PageHeader';

describe('PageHeader', () => {
  it('renders title as h1 with testid', () => {
    render(<PageHeader title="试剂百科" />);
    const h = screen.getByTestId('page-header-title');
    expect(h.tagName).toBe('H1');
    expect(h).toHaveTextContent('试剂百科');
  });

  it('renders subtitle and actions when provided', () => {
    render(
      <PageHeader title="t" subtitle="s" actions={<button>新增</button>} />,
    );
    expect(screen.getByText('s')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新增' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: 写 EmptyState + ErrorState**

`apps/web/src/components/data/EmptyState.tsx`：

```tsx
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <Icon className="mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

`apps/web/src/components/data/ErrorState.tsx`：

```tsx
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <AlertTriangle className="mb-3 h-10 w-10 text-destructive" aria-hidden="true" />
      <p className="text-sm text-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          重试
        </Button>
      )}
    </div>
  );
}
```

`apps/web/src/components/data/__tests__/EmptyState.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="暂无数据" description="刷新试试" />);
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
    expect(screen.getByText('刷新试试')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: 写 Toolbar**

`apps/web/src/components/data/Toolbar.tsx`：

```tsx
import { cn } from '@/lib/utils';

export interface ToolbarProps {
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function Toolbar({ filters, actions, className }: ToolbarProps) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-center gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">{filters}</div>
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </div>
  );
}
```

- [ ] **Step 5: 写 DataTable**

`apps/web/src/components/data/DataTable.tsx`：

```tsx
'use client';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from './EmptyState';

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  loading?: boolean;
  emptyTitle?: string;
  testId?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  loading,
  emptyTitle = '暂无数据',
  testId,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (loading) {
    return (
      <div className="space-y-2" data-testid={testId}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return <EmptyState title={emptyTitle} />;
  }

  return (
    <div className="rounded-md border" data-testid={testId}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => (
                <TableHead key={h.id}>
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

`apps/web/src/components/data/__tests__/DataTable.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../DataTable';

interface Row { name: string; age: number }
const cols: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: '名称' },
  { accessorKey: 'age', header: '年龄' },
];

describe('DataTable', () => {
  it('renders rows from data', () => {
    render(<DataTable columns={cols} data={[{ name: '张三', age: 30 }]} />);
    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('shows EmptyState when data is empty', () => {
    render(<DataTable columns={cols} data={[]} emptyTitle="无用户" />);
    expect(screen.getByText('无用户')).toBeInTheDocument();
  });

  it('shows skeleton when loading', () => {
    const { container } = render(<DataTable columns={cols} data={[]} loading testId="t" />);
    expect(container.querySelector('[data-testid="t"]')).toBeTruthy();
    // 5 skeleton rows
    expect(container.querySelectorAll('[data-testid="t"] > *')).toHaveLength(5);
  });
});
```

- [ ] **Step 6: 跑测试**

```bash
pnpm -F @app/web test -- "data/"
```

预期：6 pass（PageHeader 2 + EmptyState 1 + DataTable 3）。

- [ ] **Step 7: commit**

```bash
git add apps/web/src/components/data/ apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web/p8a): data primitives (PageHeader/EmptyState/ErrorState/Toolbar/DataTable) + 6 tests"
```

---

## Task 6: ThemeToggle

**Files:**
- Create: `apps/web/src/components/shell/ThemeToggle.tsx`

- [ ] **Step 1: 写组件**

`apps/web/src/components/shell/ThemeToggle.tsx`：

```tsx
'use client';
import * as React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ThemeToggle() {
  const { setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" data-testid="theme-toggle" aria-label="切换主题">
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="mr-2 h-4 w-4" /> 浅色
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="mr-2 h-4 w-4" /> 深色
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Monitor className="mr-2 h-4 w-4" /> 跟随系统
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: typecheck + commit**

```bash
pnpm -F @app/web exec tsc --noEmit
git add apps/web/src/components/shell/ThemeToggle.tsx
git commit -m "feat(web/p8a): ThemeToggle (light/dark/system dropdown)"
```

---

## Task 7: UserMenu（含 logout）

**Files:**
- Create: `apps/web/src/components/shell/UserMenu.tsx`

- [ ] **Step 1: 写组件**

`apps/web/src/components/shell/UserMenu.tsx`：

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { LogOut, User as UserIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth-store';

export function UserMenu() {
  const user = useAuth((s) => s.user);
  const clear = useAuth((s) => s.clear);
  const router = useRouter();

  if (!user) return null;
  const initials = (user.name || user.email).slice(0, 2).toUpperCase();

  function logout() {
    clear();
    router.replace('/login');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 px-2" data-testid="user-menu" aria-label="用户菜单">
          <Avatar className="h-7 w-7">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="ml-2 hidden text-sm md:inline">{user.email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="text-sm font-medium">{user.name}</div>
          <div className="text-xs text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <UserIcon className="mr-2 h-4 w-4" /> 个人信息
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" /> 登出
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: typecheck + commit**

```bash
pnpm -F @app/web exec tsc --noEmit
git add apps/web/src/components/shell/UserMenu.tsx
git commit -m "feat(web/p8a): UserMenu (avatar + logout)"
```

---

## Task 8: Sidebar（含单测）

**Files:**
- Create: `apps/web/src/components/shell/Sidebar.tsx`
- Create: `apps/web/src/components/shell/__tests__/Sidebar.test.tsx`

- [ ] **Step 1: 写 failing test**

`apps/web/src/components/shell/__tests__/Sidebar.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Sidebar } from '../Sidebar';
import { useAuth } from '@/lib/auth-store';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/users' }));

describe('Sidebar', () => {
  beforeEach(() => {
    useAuth.setState({
      tokens: { accessToken: 't', refreshToken: 'r' },
      user: { id: 'u1', email: 'a@b', name: 'A', labId: null, roles: ['SYS_ADMIN'] },
      hydrated: true,
    });
  });

  it('renders <aside> root (e2e selector compatibility)', () => {
    const { container } = render(<Sidebar />);
    expect(container.querySelector('aside')).toBeTruthy();
  });

  it('SYS_ADMIN sees 报表 group with all 4 reports', () => {
    render(<Sidebar />);
    const aside = document.querySelector('aside')!;
    expect(within(aside).getByRole('link', { name: '领用趋势' })).toBeInTheDocument();
    expect(within(aside).getByRole('link', { name: '库存周转' })).toBeInTheDocument();
    expect(within(aside).getByRole('link', { name: '采购金额' })).toBeInTheDocument();
    expect(within(aside).getByRole('link', { name: '管控审计' })).toBeInTheDocument();
  });

  it('PLAIN_USER sees only 领用趋势 (e2e Path 6 contract)', () => {
    useAuth.setState({
      tokens: { accessToken: 't', refreshToken: 'r' },
      user: { id: 'u2', email: 'p@b', name: 'P', labId: null, roles: ['PLAIN_USER'] },
      hydrated: true,
    });
    render(<Sidebar />);
    const aside = document.querySelector('aside')!;
    expect(within(aside).getByRole('link', { name: '领用趋势' })).toBeInTheDocument();
    expect(within(aside).queryByRole('link', { name: '库存周转' })).toBeNull();
    expect(within(aside).queryByRole('link', { name: '采购金额' })).toBeNull();
    expect(within(aside).queryByRole('link', { name: '管控审计' })).toBeNull();
  });

  it('marks active item by current pathname', () => {
    render(<Sidebar />);
    const link = screen.getByRole('link', { name: '用户' });
    expect(link.getAttribute('aria-current')).toBe('page');
  });
});
```

- [ ] **Step 2: 跑确认失败**

```bash
pnpm -F @app/web test -- Sidebar
```

预期：FAIL（找不到 Sidebar）。

- [ ] **Step 3: 写实现**

`apps/web/src/components/shell/Sidebar.tsx`：

```tsx
'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Lucide from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { NAV, filterNavByRoles, type IconName } from '@/lib/nav';
import type { RoleCode } from '@app/shared';
import { cn } from '@/lib/utils';

function Icon({ name, className }: { name: IconName; className?: string }) {
  const C = (Lucide as any)[name] as React.ComponentType<{ className?: string }>;
  return C ? <C className={className} /> : null;
}

export function Sidebar() {
  const pathname = usePathname() ?? '/';
  const userRoles = (useAuth((s) => s.user?.roles) ?? []) as RoleCode[];
  const groups = filterNavByRoles(NAV, userRoles);

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-background md:block">
      <nav className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto p-3">
        {groups.map((g) => (
          <div key={g.label} className="mb-4">
            <div className="mb-1 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {g.label}
            </div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = pathname === it.href || pathname.startsWith(it.href + '/');
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                        active
                          ? 'bg-accent font-medium text-accent-foreground'
                          : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground',
                      )}
                    >
                      <Icon name={it.icon} className="h-4 w-4 shrink-0" />
                      <span>{it.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm -F @app/web test -- Sidebar
```

预期：4 pass。

- [ ] **Step 5: commit**

```bash
git add apps/web/src/components/shell/Sidebar.tsx apps/web/src/components/shell/__tests__/Sidebar.test.tsx
git commit -m "feat(web/p8a): Sidebar with role-aware NAV (4 unit tests, e2e <aside> compat)"
```

---

## Task 9: Breadcrumb（含单测）

**Files:**
- Create: `apps/web/src/components/shell/Breadcrumb.tsx`
- Create: `apps/web/src/components/shell/__tests__/Breadcrumb.test.tsx`

- [ ] **Step 1: 写 failing test**

`apps/web/src/components/shell/__tests__/Breadcrumb.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumb } from '../Breadcrumb';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/users' }));

describe('Breadcrumb', () => {
  it('renders group + item label for /admin/users', () => {
    render(<Breadcrumb />);
    expect(screen.getByText('管理')).toBeInTheDocument();
    expect(screen.getByText('用户')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑确认失败**

```bash
pnpm -F @app/web test -- Breadcrumb
```

- [ ] **Step 3: 写实现**

`apps/web/src/components/shell/Breadcrumb.tsx`：

```tsx
'use client';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { flatNavItems } from '@/lib/nav';

export function Breadcrumb() {
  const pathname = usePathname() ?? '/';
  const flat = flatNavItems();
  const match = flat
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0];

  if (!match || match.href === '/') return null;

  return (
    <nav aria-label="breadcrumb" className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
      <span>{match.groupLabel}</span>
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
      <span className="text-foreground">{match.label}</span>
    </nav>
  );
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm -F @app/web test -- Breadcrumb
```

预期：1 pass。

- [ ] **Step 5: commit**

```bash
git add apps/web/src/components/shell/Breadcrumb.tsx apps/web/src/components/shell/__tests__/Breadcrumb.test.tsx
git commit -m "feat(web/p8a): Breadcrumb derived from NAV + pathname"
```

---

## Task 10: TopBar + AppShell

**Files:**
- Create: `apps/web/src/components/shell/TopBar.tsx`
- Create: `apps/web/src/components/shell/AppShell.tsx`

- [ ] **Step 1: 写 TopBar**

`apps/web/src/components/shell/TopBar.tsx`：

```tsx
'use client';
import Link from 'next/link';
import { FlaskConical, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { NotificationBell } from '@/components/NotificationBell';

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background px-4">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <FlaskConical className="h-5 w-5 text-primary" aria-hidden="true" />
        <span>LabReagent</span>
      </Link>
      <div className="ml-4 hidden max-w-md flex-1 md:block">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            disabled
            placeholder="搜索（即将上线）"
            className="pl-8"
            aria-label="全局搜索"
          />
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <NotificationBell />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
```

- [ ] **Step 2: 写 AppShell**

`apps/web/src/components/shell/AppShell.tsx`：

```tsx
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Breadcrumb } from './Breadcrumb';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6">
          <Breadcrumb />
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: typecheck + commit**

```bash
pnpm -F @app/web exec tsc --noEmit
git add apps/web/src/components/shell/TopBar.tsx apps/web/src/components/shell/AppShell.tsx
git commit -m "feat(web/p8a): TopBar (logo+search+bell+theme+user) + AppShell composition"
```

---

## Task 11: Route group 重构 + (app)/layout.tsx + 删旧 layout

**Files:**
- Create: `apps/web/src/app/(app)/layout.tsx`
- Create: `apps/web/src/app/(public)/layout.tsx`
- Move: `apps/web/src/app/login/` → `apps/web/src/app/(public)/login/`
- Move: `apps/web/src/app/admin/{users,labs,roles,stocks,issues,ledger,purchases,alerts}/` → `apps/web/src/app/(app)/admin/...`
- Move: `apps/web/src/app/approvals/` → `apps/web/src/app/(app)/approvals/`
- Move: `apps/web/src/app/my/` → `apps/web/src/app/(app)/my/`
- Move: `apps/web/src/app/reagents/` → `apps/web/src/app/(app)/reagents/`
- Move: `apps/web/src/app/reports/{usage-trend,inventory-turnover,purchase-amount,controlled-audit}/` → `apps/web/src/app/(app)/reports/...`
- Move: `apps/web/src/app/page.tsx` → `apps/web/src/app/(app)/page.tsx`
- Delete: `apps/web/src/app/admin/layout.tsx`
- Delete: `apps/web/src/app/reports/layout.tsx`

- [ ] **Step 1: 创建 route group 目录 + git 移动文件**

```bash
cd apps/web/src/app
mkdir -p '(app)' '(public)'
git mv login '(public)/login'
git mv page.tsx '(app)/page.tsx'
git mv reagents '(app)/reagents'
git mv approvals '(app)/approvals'
git mv my '(app)/my'
git mv admin/users '(app)/admin/users'
mkdir -p '(app)/admin'
git mv admin/labs '(app)/admin/labs'
git mv admin/roles '(app)/admin/roles'
git mv admin/stocks '(app)/admin/stocks'
git mv admin/issues '(app)/admin/issues'
git mv admin/ledger '(app)/admin/ledger'
git mv admin/purchases '(app)/admin/purchases'
git mv admin/alerts '(app)/admin/alerts'
git rm admin/layout.tsx
rmdir admin
mkdir -p '(app)/reports'
git mv reports/usage-trend '(app)/reports/usage-trend'
git mv reports/inventory-turnover '(app)/reports/inventory-turnover'
git mv reports/purchase-amount '(app)/reports/purchase-amount'
git mv reports/controlled-audit '(app)/reports/controlled-audit'
git rm reports/layout.tsx
rmdir reports
cd ../../../..
```

预期：`apps/web/src/app/admin/` 和 `apps/web/src/app/reports/` 目录消失，所有内容平移到 `(app)/...` 下。

- [ ] **Step 2: 写 (app)/layout.tsx**

`apps/web/src/app/(app)/layout.tsx`：

```tsx
import { RequireAuth } from '@/components/RequireAuth';
import { AppShell } from '@/components/shell/AppShell';
import { Toaster } from '@/components/ui/sonner';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
      <Toaster richColors position="top-right" />
    </RequireAuth>
  );
}
```

- [ ] **Step 3: 写 (public)/layout.tsx**

`apps/web/src/app/(public)/layout.tsx`：

```tsx
import { Toaster } from '@/components/ui/sonner';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Toaster richColors position="top-right" />
    </>
  );
}
```

- [ ] **Step 4: typecheck + build**

```bash
pnpm -F @app/web exec tsc --noEmit
pnpm -F @app/web build
```

预期：build 仍输出 22 routes（route group 不影响 URL）。任意路由如 `/admin/users` 仍可静态生成。

- [ ] **Step 5: 跑 e2e 验证不破坏现有 spec**

```bash
pnpm db:up
pnpm test:e2e
```

预期：8 pass / 3 self-skip / 0 fail。如失败：`<aside>` 选择器现在会同时匹配新 Sidebar 和未删的 reports sidebar——确认 `apps/web/src/app/reports/layout.tsx` 已删（应在 step 1）。

- [ ] **Step 6: commit**

```bash
git add apps/web/src/app/
git commit -m "refactor(web/p8a): collapse routes into (app)/(public) groups; drop admin/reports layouts"
```

---

## Task 12: Dashboard `/` 改造

**Files:**
- Modify: `apps/web/src/app/(app)/page.tsx`

- [ ] **Step 1: 重写 Dashboard**

`apps/web/src/app/(app)/page.tsx`：

```tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckSquare,
  FileText,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { PageHeader } from '@/components/data/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface Kpi {
  pendingApprovals: number;
  myRequests: number;
  stockAlerts: number;
  controlledReagents: number;
}

const ZERO: Kpi = { pendingApprovals: 0, myRequests: 0, stockAlerts: 0, controlledReagents: 0 };

export default function DashboardPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [kpi, setKpi] = useState<Kpi>(ZERO);

  useEffect(() => {
    if (!token) return;
    Promise.allSettled([
      apiFetch<any[]>('/requests?status=PENDING', { token }),
      apiFetch<any[]>('/requests?mine=1', { token }),
      apiFetch<any[]>('/alerts/active', { token }),
      apiFetch<any[]>('/reagents?controlled=1', { token }),
    ]).then(([a, b, c, d]) => {
      setKpi({
        pendingApprovals: a.status === 'fulfilled' ? a.value.length : 0,
        myRequests: b.status === 'fulfilled' ? b.value.length : 0,
        stockAlerts: c.status === 'fulfilled' ? c.value.length : 0,
        controlledReagents: d.status === 'fulfilled' ? d.value.length : 0,
      });
    });
  }, [token]);

  const cards: Array<{ label: string; value: number; href: string; icon: React.ReactNode }> = [
    { label: '待我审批', value: kpi.pendingApprovals, href: '/approvals', icon: <CheckSquare className="h-5 w-5 text-primary" /> },
    { label: '我的申请', value: kpi.myRequests, href: '/my/requests', icon: <FileText className="h-5 w-5 text-primary" /> },
    { label: '库存预警', value: kpi.stockAlerts, href: '/admin/alerts/config', icon: <AlertTriangle className="h-5 w-5 text-destructive" /> },
    { label: '管控试剂', value: kpi.controlledReagents, href: '/reagents', icon: <ShieldAlert className="h-5 w-5 text-primary" /> },
  ];

  return (
    <div>
      <PageHeader title="工作台" subtitle="实验室试剂管理中心" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.label}
              </CardTitle>
              {c.icon}
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{c.value}</div>
              <Link
                href={c.href}
                className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                查看 <ArrowRight className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>快捷入口</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/reagents">试剂百科</Link></Button>
          <Button asChild variant="outline"><Link href="/my/requests">提交申请</Link></Button>
          <Button asChild variant="outline"><Link href="/approvals">待审批</Link></Button>
          <Button asChild variant="outline"><Link href="/reports/usage-trend">报表中心</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

注：`apiFetch` 失败时单独 KPI 取 0，不抛出。`/alerts/active` 等 endpoint 若不存在该角色则 4xx，`Promise.allSettled` 兜住。

- [ ] **Step 2: typecheck + 启动 dev 验证**

```bash
pnpm -F @app/web exec tsc --noEmit
pnpm -F @app/web dev
```

浏览器登录后访问 `/`，确认 4 张 KPI Card + 快捷入口 Card 渲染，KPI 数字至少为 0。Ctrl+C 关。

- [ ] **Step 3: commit**

```bash
git add apps/web/src/app/\(app\)/page.tsx
git commit -m "feat(web/p8a): Dashboard with 4 KPI cards + quick actions"
```

---

## Task 13: `/login` 改造

**Files:**
- Modify: `apps/web/src/app/(public)/login/page.tsx`

- [ ] **Step 1: 重写 Login**

`apps/web/src/app/(public)/login/page.tsx`：

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { FlaskConical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

const schema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(6, '密码至少 6 位'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: 'admin@lab.local', password: 'admin123' },
  });

  async function onSubmit(values: FormValues) {
    try {
      const res = await apiFetch<{ accessToken: string; refreshToken: string }>(
        '/auth/login',
        { method: 'POST', body: values },
      );
      const me = await apiFetch<{
        id: string; email: string; name: string; labId: string | null; roles: string[];
      }>('/auth/me', { token: res.accessToken });
      setSession(res, {
        id: me.id,
        email: me.email,
        name: me.name,
        labId: me.labId,
        roles: me.roles as any,
      });
      router.push('/admin/users');
    } catch (e: any) {
      toast.error(e.message ?? '登录失败');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
            <FlaskConical className="h-5 w-5 text-primary" />
          </div>
          <CardTitle>实验室试剂管理</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="username" {...field} />
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
                    <FormLabel>密码</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                登录
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

- [ ] **Step 3: 跑 e2e 确认 fixture 仍 work**

```bash
rm -rf tests/e2e/.auth
pnpm test:e2e
```

预期：fixture 重新通过 `/auth/login` API 拿 token（不走 UI），8 pass / 3 self-skip / 0 fail。

- [ ] **Step 4: commit**

```bash
git add apps/web/src/app/\(public\)/login/page.tsx
git commit -m "feat(web/p8a): Login redesign (Card + RHF + zod + sonner)"
```

---

## Task 14: `/admin/users` 改造

**Files:**
- Modify: `apps/web/src/app/(app)/admin/users/page.tsx`

- [ ] **Step 1: 重写**

`apps/web/src/app/(app)/admin/users/page.tsx`：

```tsx
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
```

- [ ] **Step 2: typecheck + 跑 vitest**

```bash
pnpm -F @app/web exec tsc --noEmit
pnpm -F @app/web test
```

预期：所有现有测试仍 pass。

- [ ] **Step 3: commit**

```bash
git add apps/web/src/app/\(app\)/admin/users/page.tsx
git commit -m "feat(web/p8a): /admin/users → DataTable + Card + Badge"
```

---

## Task 15: `/reagents` 改造

**Files:**
- Modify: `apps/web/src/app/(app)/reagents/page.tsx`

- [ ] **Step 1: 重写**

`apps/web/src/app/(app)/reagents/page.tsx`：

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { Toolbar } from '@/components/data/Toolbar';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface Reagent {
  id: string;
  name: string;
  cas?: string | null;
  formula?: string | null;
  specification?: string | null;
  category?: string | null;
  hazardLevel: string;
  controlType?: string | null;
}

function hazardVariant(level: string, controlType?: string | null) {
  if (level === 'CONTROLLED' || controlType) return 'destructive' as const;
  if (level === 'HIGH') return 'default' as const;
  return 'secondary' as const;
}

export default function ReagentsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [items, setItems] = useState<Reagent[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!token) return;
    const handle = setTimeout(() => {
      setLoading(true);
      apiFetch<Reagent[]>(
        `/reagents${q ? `?q=${encodeURIComponent(q)}` : ''}`,
        { token },
      )
        .then(setItems)
        .catch((e: any) => toast.error(e.message ?? '加载失败'))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [token, q]);

  const columns = useMemo<ColumnDef<Reagent>[]>(
    () => [
      {
        accessorKey: 'name',
        header: '名称',
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            <Badge variant={hazardVariant(row.original.hazardLevel, row.original.controlType)}>
              {row.original.controlType ?? row.original.hazardLevel}
            </Badge>
          </span>
        ),
      },
      {
        accessorKey: 'cas',
        header: 'CAS',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.cas ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'formula',
        header: '分子式',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.formula ?? '—'}</span>
        ),
      },
      { accessorKey: 'specification', header: '规格', cell: ({ row }) => row.original.specification ?? '—' },
      { accessorKey: 'category', header: '类别', cell: ({ row }) => row.original.category ?? '—' },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="试剂百科" subtitle="全部在管试剂" />
      <Toolbar
        filters={
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
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
        <DataTable columns={columns} data={items} loading={loading} testId="reagents-table" emptyTitle="未找到试剂" />
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: typecheck + commit**

```bash
pnpm -F @app/web exec tsc --noEmit
git add apps/web/src/app/\(app\)/reagents/page.tsx
git commit -m "feat(web/p8a): /reagents → DataTable + hazard Badge + debounced search"
```

---

## Task 16: `/approvals` 改造（e2e 关键路径）

**Files:**
- Modify: `apps/web/src/app/(app)/approvals/page.tsx`

⚠️ 必须保留：
- `<h1>` 文字 "待我审批"
- `<main>` 内的 `<ul> > <li>` 结构（spec `main ul > li`）
- 4 个按钮文字 "一审通过" / "一审拒绝" / "二审通过" / "二审拒绝" 精确

- [ ] **Step 1: 重写**

`apps/web/src/app/(app)/approvals/page.tsx`：

```tsx
'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { EmptyState } from '@/components/data/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface RequestItem {
  id: string;
  quantity: string;
  unit: string;
  purpose: string;
  createdAt: string;
  reagent: { name: string; hazardLevel?: string; controlType?: string | null };
  stock: { batchNo?: string | null };
  applicant: { name: string; email: string };
  projectRef?: string | null;
  useLocation?: string | null;
}

export default function ApprovalsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentById, setCommentById] = useState<Record<string, string>>({});

  async function refresh() {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch<RequestItem[]>('/requests?status=PENDING', { token });
      setItems(data);
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function decide(id: string, action: 'APPROVE' | 'REJECT', level: 1 | 2) {
    try {
      await apiFetch(`/requests/${id}/approvals`, {
        method: 'POST',
        token,
        body: { action, level, comment: commentById[id] },
      });
      setCommentById((m) => ({ ...m, [id]: '' }));
      toast.success(`${level === 1 ? '一审' : '二审'}${action === 'APPROVE' ? '通过' : '拒绝'}`);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? '审批失败');
    }
  }

  return (
    <div>
      <PageHeader title="待我审批" subtitle="待处理的试剂申请" />
      <main>
        {items.length === 0 && !loading ? (
          <EmptyState title="暂无待审批申请" />
        ) : (
          <ul className="space-y-3" data-testid="approvals-list">
            {items.map((r) => {
              const ctrl = r.reagent.hazardLevel === 'CONTROLLED' || !!r.reagent.controlType;
              return (
                <li key={r.id} data-testid="approval-row">
                  <Card className="p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{r.reagent.name}</span>
                          {ctrl && <Badge variant="destructive">管控</Badge>}
                          <span className="text-sm text-muted-foreground">
                            批号 {r.stock.batchNo ?? '—'}
                          </span>
                        </div>
                        <div className="text-sm">
                          {r.applicant.name}（{r.applicant.email}）· 申请 {r.quantity}
                          {r.unit}
                        </div>
                        <div className="text-sm">用途：{r.purpose}</div>
                        {ctrl && (
                          <div className="text-xs text-muted-foreground">
                            项目 {r.projectRef ?? '—'} · 地点 {r.useLocation ?? '—'}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {r.createdAt.slice(0, 16).replace('T', ' ')}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Textarea
                          className="w-64"
                          rows={2}
                          placeholder="批注（可选，拒绝时作为原因）"
                          value={commentById[r.id] ?? ''}
                          onChange={(e) =>
                            setCommentById((m) => ({ ...m, [r.id]: e.target.value }))
                          }
                        />
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            data-testid="approval-approve-l1"
                            size="sm"
                            onClick={() => decide(r.id, 'APPROVE', 1)}
                          >
                            一审通过
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => decide(r.id, 'REJECT', 1)}
                          >
                            一审拒绝
                          </Button>
                          {ctrl && (
                            <>
                              <Button size="sm" onClick={() => decide(r.id, 'APPROVE', 2)}>
                                二审通过
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => decide(r.id, 'REJECT', 2)}
                              >
                                二审拒绝
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

- [ ] **Step 3: 跑 e2e Path 2 单测**

```bash
pnpm db:up
pnpm exec playwright test tests/e2e/workflows.spec.ts -g "Path 2"
```

预期：1 pass（heading "待我审批" + `main ul > li` 结构 + button "一审通过" 全保留）。

- [ ] **Step 4: commit**

```bash
git add apps/web/src/app/\(app\)/approvals/page.tsx
git commit -m "feat(web/p8a): /approvals → Card-in-li + sonner; preserve e2e Path 2 invariants"
```

---

## Task 17: 验收：跑 e2e 全量 + build + vitest

**Files:** 无需修改，纯验证

- [ ] **Step 1: 跑 vitest 全量**

```bash
pnpm -F @app/web test
```

预期：所有测试通过（含 nav 5、PageHeader 2、EmptyState 1、DataTable 3、Sidebar 4、Breadcrumb 1、api-client 等已有）。

- [ ] **Step 2: 跑 web build**

```bash
pnpm -F @app/web build
```

预期：22 routes 全部静态生成，trace 无错误。`First Load JS shared by all` 较 P7 baseline 增长 ≤ 60KB。

- [ ] **Step 3: 跑全量 e2e**

```bash
pnpm db:up
rm -rf tests/e2e/.auth
pnpm test:e2e
```

预期：8 pass / 3 self-skip / 0 fail，时长 ~40s。

如果 e2e Path 6 红：
- 检查 reports group 在 Sidebar 中按 PLAIN_USER 过滤后只剩 "领用趋势"（运行 Sidebar 单测确认）
- 检查 `/reports/<slug>/page.tsx` 内未引入新 sidebar（只 (app)/layout.tsx 有 Sidebar）
- 检查 `apps/web/src/app/reports/layout.tsx` 已删

- [ ] **Step 4: 手动视觉走查**

```bash
pnpm -F @app/web dev
```

浏览器走 5 个门面页：
- `/` Dashboard：4 KPI Card + 快捷入口
- `/login`：Card + email/password Form + zod 错误提示（手动输 "x" 邮箱）
- `/admin/users`：DataTable + Badge 角色 chip
- `/reagents`：搜索框 + DataTable + hazard Badge
- `/approvals`（用 labhead 登录）：列表 Card + 按钮组

切 dark / light / system 主题各一次确认无样式断裂。Ctrl+C 关。

- [ ] **Step 5: 打 tag**

```bash
git tag p8a-complete
git log --oneline | head -20
```

预期：从 task 1 起 17 个新 commit，HEAD = `p8a-complete`。

---

## Final Verification Checklist

P8a 完工签字之前逐项打勾：

**功能 / 视觉：**
- [ ] 所有登录后路由共用 `(app)/layout.tsx`
- [ ] Sidebar 按角色过滤：PLAIN_USER 只看到工作台 + 业务（无审批）+ 领用趋势；SYS_ADMIN 看到全部
- [ ] Theme light / dark / system 切换 + 刷新保持
- [ ] 5 门面页按 Task 12-16 改造完毕
- [ ] 红字错误 → toast.error
- [ ] `apps/web/src/app/admin/layout.tsx` 与 `apps/web/src/app/reports/layout.tsx` 已删

**工程：**
- [ ] `pnpm test:e2e` = 8 pass / 3 self-skip / 0 fail
- [ ] `pnpm -F @app/web build` 22 routes ok
- [ ] `pnpm -F @app/web test` 全绿（≥ 16 pass 新单测）
- [ ] `git diff p7-complete..HEAD -- apps/web/src/lib/auth-store.ts` 空
- [ ] `git diff p7-complete..HEAD -- apps/web/src/lib/api-client.ts` 空
- [ ] First Load JS 增长 ≤ 60KB

**P8b 待办（不在本期）：**
- 移动端响应式 sidebar 抽屉
- admin/* 剩余 7 页（labs/roles/stocks/issues/ledger/purchases/alerts/config）
- approvals/purchases、my/requests、my/purchases 改 shadcn
- reports/* 内页改 shadcn（保留 KpiCard / ChartCard 旧实现）
- 全局搜索功能化
- e2e selector 替换为 testid
