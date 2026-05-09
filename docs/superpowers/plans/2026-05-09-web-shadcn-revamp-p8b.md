# P8b · Web shadcn Revamp（移动端 + 全局搜索 + 剩余页改造）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 P8a 已交付的 `(app)/AppShell` 框架上，补齐移动端 sidebar 抽屉、Cmd+K 全局搜索（command palette），并把剩余 10 个业务页面（admin/* 7 + my/* 2 + approvals/purchases）改成 shadcn 风格（PageHeader + DataTable + FormDialog + ConfirmDialog）。

**Architecture:** 沿用 P8a 全部基础设施。新增 `components/ui/{sheet,command}.tsx`（shadcn add）+ `components/shell/MobileSidebar.tsx` + `components/shell/SearchTrigger.tsx` + `components/search/CommandPalette.tsx` + `components/data/{FormDialog,ConfirmDialog}.tsx`。TopBar 加 hamburger 按钮与 SearchTrigger 替换 disabled Input。所有 API endpoint、auth-store、api-client、nav.ts、Sidebar/Breadcrumb/UserMenu 全部不动。

**Tech Stack:** Next.js 14.2.3 / React 18.3 / TypeScript 5.4 / Tailwind 3.4 / shadcn/ui (cmdk, sheet, alert-dialog, dialog) / RHF + zod / Vitest + RTL。新增依赖：`cmdk`（shadcn add command 自动）；其余 P8a 已装。

**Spec:** `docs/superpowers/specs/2026-05-09-web-shadcn-revamp-p8b-design.md`（HEAD `2341d95`）

**Prerequisites:** P8a 完成（tag `p8a-complete`，HEAD `622bf3c`）。`pnpm -F @app/web dev` 跑得起来；`pnpm -F @app/web test` 19 用例全绿；`pnpm -F @app/web build` 22 routes ok。

---

## File Structure

```
apps/web/src/
├── app/(app)/
│   ├── admin/
│   │   ├── labs/page.tsx                              # REWRITE（POST only）
│   │   ├── roles/page.tsx                             # REWRITE（GET only）
│   │   ├── stocks/page.tsx                            # REWRITE（POST only）
│   │   ├── issues/page.tsx                            # REWRITE（Card-in-li 流程）
│   │   ├── ledger/page.tsx                            # REWRITE（GET only + CSV）
│   │   ├── purchases/page.tsx                         # REWRITE（merge + receipt dialog）
│   │   └── alerts/config/page.tsx                     # REWRITE（POST + DELETE）
│   ├── approvals/purchases/page.tsx                   # REWRITE（Card-in-li）
│   └── my/
│       ├── requests/page.tsx                          # REWRITE（POST + cancel）
│       └── purchases/page.tsx                         # REWRITE（POST + cancel）
├── components/
│   ├── ui/
│   │   ├── sheet.tsx                                  # NEW（shadcn add）
│   │   └── command.tsx                                # NEW（shadcn add）
│   ├── shell/
│   │   ├── MobileSidebar.tsx                          # NEW
│   │   ├── SearchTrigger.tsx                          # NEW
│   │   ├── TopBar.tsx                                 # MODIFY
│   │   └── __tests__/MobileSidebar.test.tsx           # NEW
│   ├── search/
│   │   ├── CommandPalette.tsx                         # NEW
│   │   └── __tests__/CommandPalette.test.tsx          # NEW
│   └── data/
│       ├── FormDialog.tsx                             # NEW
│       ├── ConfirmDialog.tsx                          # NEW
│       └── __tests__/
│           ├── FormDialog.test.tsx                    # NEW
│           └── ConfirmDialog.test.tsx                 # NEW
└── package.json                                       # MODIFY（新增 cmdk）
```

---

## Task 1: 装 shadcn sheet + command 组件

**Files:**
- Create: `apps/web/src/components/ui/sheet.tsx`
- Create: `apps/web/src/components/ui/command.tsx`
- Modify: `apps/web/package.json`、`pnpm-lock.yaml`

- [ ] **Step 1: 跑 shadcn add**

```bash
cd apps/web && pnpm dlx shadcn@latest add -y sheet command
```

预期：`apps/web/src/components/ui/sheet.tsx` 与 `command.tsx` 生成；`apps/web/package.json` `dependencies` 多 `cmdk`；`pnpm-lock.yaml` 更新。

如果 `pnpm dlx` 卡住或要交互输入，改用 `npx shadcn@latest add sheet command --yes` 直接装。

- [ ] **Step 2: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

预期：0 错误。

- [ ] **Step 3: commit**

```bash
git add apps/web/src/components/ui/sheet.tsx apps/web/src/components/ui/command.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web/p8b): add shadcn sheet + command (cmdk) components"
```

---

## Task 2: MobileSidebar 组件 + 单测

**Files:**
- Create: `apps/web/src/components/shell/MobileSidebar.tsx`
- Create: `apps/web/src/components/shell/__tests__/MobileSidebar.test.tsx`

- [ ] **Step 1: 写 failing test**

`apps/web/src/components/shell/__tests__/MobileSidebar.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileSidebar } from '../MobileSidebar';
import { useAuth } from '@/lib/auth-store';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/users',
  useRouter: () => ({ push: pushMock }),
}));

describe('MobileSidebar', () => {
  beforeEach(() => {
    pushMock.mockClear();
    useAuth.setState({
      tokens: { accessToken: 't', refreshToken: 'r' },
      user: { id: 'u1', email: 'a@b', name: 'A', labId: null, roles: ['SYS_ADMIN'] },
      hydrated: true,
    });
  });

  it('renders Sheet content when open', () => {
    render(<MobileSidebar open={true} onOpenChange={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '用户' })).toBeInTheDocument();
  });

  it('does not render content when closed', () => {
    render(<MobileSidebar open={false} onOpenChange={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clicking nav item calls router.push and onOpenChange(false)', () => {
    const onOpenChange = vi.fn();
    render(<MobileSidebar open={true} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('link', { name: '试剂百科' }));
    expect(pushMock).toHaveBeenCalledWith('/reagents');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('PLAIN_USER does not see 管理 group', () => {
    useAuth.setState({
      tokens: { accessToken: 't', refreshToken: 'r' },
      user: { id: 'u2', email: 'p@b', name: 'P', labId: null, roles: ['PLAIN_USER'] },
      hydrated: true,
    });
    render(<MobileSidebar open={true} onOpenChange={() => {}} />);
    expect(screen.queryByRole('link', { name: '用户' })).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm -F @app/web test -- MobileSidebar
```

预期：FAIL（Cannot resolve `../MobileSidebar`）。

- [ ] **Step 3: 写实现**

`apps/web/src/components/shell/MobileSidebar.tsx`：

```tsx
'use client';
import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import * as Lucide from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuth } from '@/lib/auth-store';
import { NAV, filterNavByRoles, type IconName } from '@/lib/nav';
import type { RoleCode } from '@app/shared';
import { cn } from '@/lib/utils';

function Icon({ name, className }: { name: IconName; className?: string }) {
  const C = (Lucide as any)[name] as React.ComponentType<{ className?: string }>;
  return C ? <C className={className} /> : null;
}

export interface MobileSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileSidebar({ open, onOpenChange }: MobileSidebarProps) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const userRoles = (useAuth((s) => s.user?.roles) ?? []) as RoleCode[];
  const groups = filterNavByRoles(NAV, userRoles);

  function handleNavigate(e: React.MouseEvent, href: string) {
    e.preventDefault();
    router.push(href);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="text-left">导航</SheetTitle>
        </SheetHeader>
        <nav className="overflow-y-auto p-3" data-testid="mobile-nav">
          {groups.map((g) => (
            <div key={g.label} className="mb-4">
              <div className="mb-1 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {g.label}
              </div>
              <ul className="space-y-0.5">
                {g.items.map((it) => {
                  const active =
                    pathname === it.href || pathname.startsWith(it.href + '/');
                  return (
                    <li key={it.href}>
                      <a
                        href={it.href}
                        onClick={(e) => handleNavigate(e, it.href)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors',
                          active
                            ? 'bg-accent font-medium text-accent-foreground'
                            : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground',
                        )}
                      >
                        <Icon name={it.icon} className="h-4 w-4 shrink-0" />
                        <span>{it.label}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
```

> 备注：用 `<a>` + `e.preventDefault()` 而不是 `next/link Link`，原因是要保证 `router.push` 与 `onOpenChange(false)` 的同步顺序，避免 Sheet 关闭动画与导航 race。

- [ ] **Step 4: 跑测试**

```bash
pnpm -F @app/web test -- MobileSidebar
```

预期：4 pass。

- [ ] **Step 5: typecheck + commit**

```bash
pnpm -F @app/web exec tsc --noEmit
git add apps/web/src/components/shell/MobileSidebar.tsx apps/web/src/components/shell/__tests__/MobileSidebar.test.tsx
git commit -m "feat(web/p8b): MobileSidebar (Sheet + role-aware NAV) with 4 unit tests"
```

---

## Task 3: TopBar 改造（hamburger + SearchTrigger 占位）

**Files:**
- Create: `apps/web/src/components/shell/SearchTrigger.tsx`
- Modify: `apps/web/src/components/shell/TopBar.tsx`

- [ ] **Step 1: 写 SearchTrigger（无 Cmd+K 监听，仅按钮 + 占位）**

`apps/web/src/components/shell/SearchTrigger.tsx`：

```tsx
'use client';
import * as React from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SearchTriggerProps {
  onOpen: () => void;
  className?: string;
}

export function SearchTrigger({ onOpen, className }: SearchTriggerProps) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpen();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onOpen]);

  return (
    <>
      {/* 桌面端 ≥ md：仿输入框样式按钮 */}
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'group hidden h-9 w-full max-w-md items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent md:inline-flex',
          className,
        )}
        data-testid="search-trigger"
        aria-label="全局搜索"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left">搜索导航或试剂…</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>
      {/* 移动端 < md：图标按钮 */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpen}
        className="md:hidden"
        aria-label="全局搜索"
      >
        <Search className="h-5 w-5" />
      </Button>
    </>
  );
}
```

- [ ] **Step 2: 改 TopBar**

`apps/web/src/components/shell/TopBar.tsx`（完整替换）：

```tsx
'use client';
import * as React from 'react';
import Link from 'next/link';
import { FlaskConical, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { SearchTrigger } from './SearchTrigger';
import { MobileSidebar } from './MobileSidebar';
import { CommandPalette } from '@/components/search/CommandPalette';
import { NotificationBell } from '@/components/NotificationBell';

export function TopBar() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background px-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="菜单"
          data-testid="mobile-menu-trigger"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <FlaskConical className="h-5 w-5 text-primary" aria-hidden="true" />
          <span>LabReagent</span>
        </Link>
        <div className="ml-4 flex flex-1 items-center justify-end md:justify-start">
          <SearchTrigger onOpen={() => setPaletteOpen(true)} />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>
      <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
```

> 备注：CommandPalette 文件还不存在，下一 task 才写。本 task typecheck **会失败**。先 commit 不做 typecheck，下一 task 完成后一起 typecheck。

- [ ] **Step 3: commit（不跑 typecheck，下个 task 一起）**

```bash
git add apps/web/src/components/shell/SearchTrigger.tsx apps/web/src/components/shell/TopBar.tsx
git commit -m "feat(web/p8b): TopBar with hamburger + SearchTrigger; CommandPalette stub wired"
```

---

## Task 4: CommandPalette 组件 + 单测 + 整体 typecheck

**Files:**
- Create: `apps/web/src/components/search/CommandPalette.tsx`
- Create: `apps/web/src/components/search/__tests__/CommandPalette.test.tsx`

- [ ] **Step 1: 写 failing test**

`apps/web/src/components/search/__tests__/CommandPalette.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CommandPalette } from '../CommandPalette';
import { useAuth } from '@/lib/auth-store';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const fetchMock = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: any[]) => fetchMock(...args),
}));

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pushMock.mockClear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue([]);
    useAuth.setState({
      tokens: { accessToken: 't', refreshToken: 'r' },
      user: { id: 'u1', email: 'a@b', name: 'A', labId: null, roles: ['SYS_ADMIN'] },
      hydrated: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders dialog when open', () => {
    render(<CommandPalette open={true} onOpenChange={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not call apiFetch when query is empty', () => {
    render(<CommandPalette open={true} onOpenChange={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('debounces and calls apiFetch /reagents?q= after 250ms', () => {
    render(<CommandPalette open={true} onOpenChange={() => {}} />);
    const input = screen.getByPlaceholderText('搜索导航或试剂…');
    fireEvent.change(input, { target: { value: '乙醇' } });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/reagents?q='),
      expect.objectContaining({ token: 't' }),
    );
  });

  it('clicking a nav item calls router.push and onOpenChange(false)', () => {
    const onOpenChange = vi.fn();
    render(<CommandPalette open={true} onOpenChange={onOpenChange} />);
    // 不输入查询时，导航组完整列出。点击"用户"
    const userLink = screen.getByText('用户');
    fireEvent.click(userLink);
    expect(pushMock).toHaveBeenCalledWith('/admin/users');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: 跑确认失败**

```bash
pnpm -F @app/web test -- CommandPalette
```

预期：FAIL（找不到 CommandPalette）。

- [ ] **Step 3: 写实现**

`apps/web/src/components/search/CommandPalette.tsx`：

```tsx
'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import * as Lucide from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-store';
import { NAV, filterNavByRoles, flatNavItems, type IconName } from '@/lib/nav';
import { apiFetch } from '@/lib/api-client';
import type { RoleCode } from '@app/shared';

interface ReagentHit {
  id: string;
  name: string;
  cas?: string | null;
  hazardLevel?: string;
  controlType?: string | null;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Icon({ name, className }: { name: IconName; className?: string }) {
  const C = (Lucide as any)[name] as React.ComponentType<{ className?: string }>;
  return C ? <C className={className} /> : null;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const token = useAuth((s) => s.tokens?.accessToken);
  const userRoles = (useAuth((s) => s.user?.roles) ?? []) as RoleCode[];
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<ReagentHit[]>([]);
  const [searchError, setSearchError] = React.useState(false);

  const navItems = React.useMemo(
    () => flatNavItems(filterNavByRoles(NAV, userRoles)),
    [userRoles],
  );

  React.useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      setSearchError(false);
      return;
    }
    if (!token) return;
    const handle = setTimeout(() => {
      apiFetch<ReagentHit[]>(
        `/reagents?q=${encodeURIComponent(query)}`,
        { token },
      )
        .then((data) => {
          setHits(data);
          setSearchError(false);
        })
        .catch(() => {
          setHits([]);
          setSearchError(true);
        });
    }, 250);
    return () => clearTimeout(handle);
  }, [query, token]);

  React.useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  function go(href: string) {
    router.push(href);
    onOpenChange(false);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="搜索导航或试剂…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>无结果</CommandEmpty>
        <CommandGroup heading="导航">
          {navItems.map((it) => (
            <CommandItem
              key={it.href}
              value={`${it.groupLabel} ${it.label} ${it.href}`}
              onSelect={() => go(it.href)}
            >
              <Icon name={it.icon} className="mr-2 h-4 w-4" />
              <span>{it.label}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {it.groupLabel}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        {query.trim() && (
          <>
            <CommandSeparator />
            <CommandGroup heading="试剂">
              {searchError && <CommandEmpty>搜索失败</CommandEmpty>}
              {!searchError && hits.length === 0 && (
                <CommandEmpty>无匹配试剂</CommandEmpty>
              )}
              {hits.map((r) => {
                const ctrl =
                  r.hazardLevel === 'CONTROLLED' || !!r.controlType;
                return (
                  <CommandItem
                    key={r.id}
                    value={`${r.name} ${r.cas ?? ''}`}
                    onSelect={() => go(`/reagents?id=${r.id}`)}
                  >
                    <span className="font-medium">{r.name}</span>
                    {r.cas && (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {r.cas}
                      </span>
                    )}
                    {ctrl && (
                      <Badge variant="destructive" className="ml-auto">
                        {r.controlType ?? r.hazardLevel}
                      </Badge>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm -F @app/web test -- CommandPalette
```

预期：4 pass。如果第 4 个用例（点击导航跳转）失败，是 cmdk 的 CommandItem 内部由 onSelect 触发而不是 click — 调整测试为 `fireEvent.click(screen.getByText('用户').closest('[cmdk-item]')!)` 或用 `userEvent.click`。

- [ ] **Step 5: typecheck（含 Task 3 的 TopBar）**

```bash
pnpm -F @app/web exec tsc --noEmit
```

预期：0 错误。

- [ ] **Step 6: commit**

```bash
git add apps/web/src/components/search/
git commit -m "feat(web/p8b): CommandPalette (Cmd+K) with debounced reagent search + nav jumps + 4 tests"
```

---

## Task 5: FormDialog 通用组件 + 单测

**Files:**
- Create: `apps/web/src/components/data/FormDialog.tsx`
- Create: `apps/web/src/components/data/__tests__/FormDialog.test.tsx`

- [ ] **Step 1: 写 failing test**

`apps/web/src/components/data/__tests__/FormDialog.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { z } from 'zod';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { FormDialog } from '../FormDialog';

const schema = z.object({
  name: z.string().min(2, '至少 2 个字'),
});

describe('FormDialog', () => {
  it('shows zod error message on invalid submit', async () => {
    const onSubmit = vi.fn();
    render(
      <FormDialog
        open={true}
        onOpenChange={() => {}}
        schema={schema}
        defaultValues={{ name: '' }}
        title="新增"
        onSubmit={onSubmit}
        fields={(form) => (
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>名称</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('至少 2 个字')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with valid values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FormDialog
        open={true}
        onOpenChange={() => {}}
        schema={schema}
        defaultValues={{ name: '' }}
        title="新增"
        onSubmit={onSubmit}
        fields={(form) => (
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>名称</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      />,
    );
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'lab1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'lab1' }));
  });

  it('keeps dialog open when onSubmit throws', async () => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
    render(
      <FormDialog
        open={true}
        onOpenChange={onOpenChange}
        schema={schema}
        defaultValues={{ name: 'lab1' }}
        title="新增"
        onSubmit={onSubmit}
        fields={(form) => (
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>名称</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑确认失败**

```bash
pnpm -F @app/web test -- FormDialog
```

预期：FAIL（Cannot resolve `../FormDialog`）。

- [ ] **Step 3: 写实现**

`apps/web/src/components/data/FormDialog.tsx`：

```tsx
'use client';
import * as React from 'react';
import { useForm, type UseFormReturn, type DefaultValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import type { z, ZodType } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';

export interface FormDialogProps<S extends ZodType<any, any, any>> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schema: S;
  defaultValues: z.infer<S>;
  onSubmit: (values: z.infer<S>) => Promise<void>;
  title: string;
  description?: string;
  submitLabel?: string;
  cancelLabel?: string;
  fields: (form: UseFormReturn<z.infer<S>>) => React.ReactNode;
}

export function FormDialog<S extends ZodType<any, any, any>>({
  open,
  onOpenChange,
  schema,
  defaultValues,
  onSubmit,
  title,
  description,
  submitLabel = '保存',
  cancelLabel = '取消',
  fields,
}: FormDialogProps<S>) {
  const form = useForm<z.infer<S>>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as DefaultValues<z.infer<S>>,
  });

  React.useEffect(() => {
    if (open) {
      form.reset(defaultValues as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, JSON.stringify(defaultValues)]);

  async function handleSubmit(values: z.infer<S>) {
    try {
      await onSubmit(values);
    } catch {
      // caller handles toast; dialog stays open
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            {fields(form)}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={form.formState.isSubmitting}
              >
                {cancelLabel}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm -F @app/web test -- FormDialog
```

预期：3 pass。

- [ ] **Step 5: typecheck + commit**

```bash
pnpm -F @app/web exec tsc --noEmit
git add apps/web/src/components/data/FormDialog.tsx apps/web/src/components/data/__tests__/FormDialog.test.tsx
git commit -m "feat(web/p8b): FormDialog (RHF + zod generic wrapper) with 3 unit tests"
```

---

## Task 6: ConfirmDialog 通用组件 + 单测

**Files:**
- Create: `apps/web/src/components/data/ConfirmDialog.tsx`
- Create: `apps/web/src/components/data/__tests__/ConfirmDialog.test.tsx`

- [ ] **Step 1: 写 failing test**

`apps/web/src/components/data/__tests__/ConfirmDialog.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  it('calls onConfirm when confirm clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="删除"
        description="确认？"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
  });

  it('disables confirm button while submitting', async () => {
    let resolve: (() => void) | undefined;
    const onConfirm = vi.fn(
      () => new Promise<void>((r) => { resolve = r; }),
    );
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="删除"
        description="确认？"
        onConfirm={onConfirm}
      />,
    );
    const btn = screen.getByRole('button', { name: '确认删除' });
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    resolve!();
    await waitFor(() => expect(btn).not.toBeDisabled());
  });
});
```

- [ ] **Step 2: 跑确认失败**

```bash
pnpm -F @app/web test -- ConfirmDialog
```

预期：FAIL。

- [ ] **Step 3: 写实现**

`apps/web/src/components/data/ConfirmDialog.tsx`：

```tsx
'use client';
import * as React from 'react';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = '确认删除',
  cancelLabel = '取消',
  destructive = true,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = React.useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
    } catch {
      // caller handles toast; dialog stays open
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

> 备注：自定义 Button 而非 AlertDialogAction/AlertDialogCancel，原因是后者会自动触发 onOpenChange — 我们要让 caller 控关闭时机。

- [ ] **Step 4: 跑测试**

```bash
pnpm -F @app/web test -- ConfirmDialog
```

预期：2 pass。

- [ ] **Step 5: typecheck + commit**

```bash
pnpm -F @app/web exec tsc --noEmit
git add apps/web/src/components/data/ConfirmDialog.tsx apps/web/src/components/data/__tests__/ConfirmDialog.test.tsx
git commit -m "feat(web/p8b): ConfirmDialog (AlertDialog wrapper) with 2 unit tests"
```

---

## Task 7: admin/labs 改造（首试 FormDialog 模板）

**Files:**
- Modify: `apps/web/src/app/(app)/admin/labs/page.tsx`

**已有 API：** `GET /labs`、`POST /labs`。**没有** PATCH/DELETE → 不渲染编辑/删除 menu，只保留"新增"按钮。

- [ ] **Step 1: 重写**

`apps/web/src/app/(app)/admin/labs/page.tsx`（完整替换）：

```tsx
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { FormDialog } from '@/components/data/FormDialog';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface Lab {
  id: string;
  name: string;
  building?: string | null;
}

const schema = z.object({
  name: z.string().min(1, '名称必填'),
  building: z.string().optional(),
});

const columns: ColumnDef<Lab>[] = [
  { accessorKey: 'name', header: '名称' },
  {
    id: 'building',
    header: '地点',
    cell: ({ row }) =>
      row.original.building ?? (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

export default function LabsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [data, setData] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const list = await apiFetch<Lab[]>('/labs', { token });
      setData(list);
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const defaultValues = useMemo(() => ({ name: '', building: '' }), []);

  return (
    <div>
      <PageHeader
        title="实验室管理"
        subtitle="系统在管实验室"
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> 新增
          </Button>
        }
      />
      <Card className="p-2">
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          testId="labs-table"
          emptyTitle="暂无实验室"
        />
      </Card>

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        schema={schema}
        defaultValues={defaultValues}
        title="新增实验室"
        onSubmit={async (values) => {
          try {
            await apiFetch('/labs', {
              method: 'POST',
              token,
              body: { name: values.name, building: values.building || undefined },
            });
            toast.success('已新增');
            setFormOpen(false);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '保存失败');
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
                  <FormLabel>名称</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="building"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>地点</FormLabel>
                  <FormControl><Input {...field} placeholder="可选" /></FormControl>
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
```

- [ ] **Step 2: typecheck + 跑 vitest**

```bash
pnpm -F @app/web exec tsc --noEmit
pnpm -F @app/web test
```

预期：tsc 0 错；vitest 全绿（含 P8a 19 + 新增 13 ≈ 32 用例）。

- [ ] **Step 3: commit**

```bash
git add "apps/web/src/app/(app)/admin/labs/page.tsx"
git commit -m "feat(web/p8b): /admin/labs → DataTable + FormDialog (create only)"
```

---

## Task 8: admin/roles 改造（只读列表）

**Files:**
- Modify: `apps/web/src/app/(app)/admin/roles/page.tsx`

**已有 API：** 仅 `GET /roles`。无 CRUD 能力 → 纯只读 DataTable。

- [ ] **Step 1: 重写**

`apps/web/src/app/(app)/admin/roles/page.tsx`（完整替换）：

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface Role {
  id: string;
  code: string;
  name: string;
  description?: string | null;
}

const columns: ColumnDef<Role>[] = [
  {
    accessorKey: 'code',
    header: '编码',
    cell: ({ row }) => (
      <Badge variant="secondary" className="font-mono">
        {row.original.code}
      </Badge>
    ),
  },
  { accessorKey: 'name', header: '名称' },
  {
    id: 'description',
    header: '说明',
    cell: ({ row }) =>
      row.original.description ?? (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

export default function RolesPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [data, setData] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const list = await apiFetch<Role[]>('/roles', { token });
      setData(list);
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div>
      <PageHeader title="角色权限" subtitle="系统角色字典" />
      <Card className="p-2">
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          testId="roles-table"
          emptyTitle="暂无角色"
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: typecheck + commit**

```bash
pnpm -F @app/web exec tsc --noEmit
git add "apps/web/src/app/(app)/admin/roles/page.tsx"
git commit -m "feat(web/p8b): /admin/roles → DataTable (read-only)"
```

---

## Task 9: admin/stocks 改造（FormDialog 含 Reagent + Lab Select）

**Files:**
- Modify: `apps/web/src/app/(app)/admin/stocks/page.tsx`

**已有 API：** `GET /stocks`、`POST /stocks`（入库）。无 PATCH/DELETE → 仅"入库"按钮 + FormDialog。

- [ ] **Step 1: 重写**

`apps/web/src/app/(app)/admin/stocks/page.tsx`（完整替换）：

```tsx
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { FormDialog } from '@/components/data/FormDialog';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface Stock {
  id: string;
  batchNo?: string | null;
  currentQty: string;
  unit: string;
  location?: string | null;
  expireDate?: string | null;
  reagent: { id: string; name: string };
  lab: { id: string; name: string };
}
interface Reagent { id: string; name: string }
interface Lab { id: string; name: string }

const schema = z.object({
  reagentId: z.string().min(1, '请选择试剂'),
  labId: z.string().min(1, '请选择实验室'),
  batchNo: z.string().optional(),
  qty: z.string().min(1, '数量必填'),
  unit: z.string().min(1, '单位必填'),
  location: z.string().optional(),
});

const columns: ColumnDef<Stock>[] = [
  { id: 'reagent', header: '试剂', cell: ({ row }) => row.original.reagent.name },
  {
    id: 'batchNo',
    header: '批号',
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.batchNo ?? '—'}</span>
    ),
  },
  {
    id: 'qty',
    header: '当前量',
    cell: ({ row }) => `${row.original.currentQty} ${row.original.unit}`,
  },
  {
    id: 'location',
    header: '位置',
    cell: ({ row }) => row.original.location ?? '—',
  },
  {
    id: 'expire',
    header: '有效期',
    cell: ({ row }) =>
      row.original.expireDate ? row.original.expireDate.slice(0, 10) : '—',
  },
  { id: 'lab', header: '实验室', cell: ({ row }) => row.original.lab.name },
];

export default function StocksPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [reagents, setReagents] = useState<Reagent[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [s, r, l] = await Promise.all([
        apiFetch<Stock[]>('/stocks', { token }),
        apiFetch<Reagent[]>('/reagents', { token }),
        apiFetch<Lab[]>('/labs', { token }),
      ]);
      setStocks(s);
      setReagents(r);
      setLabs(l);
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const defaultValues = useMemo(
    () => ({
      reagentId: '',
      labId: '',
      batchNo: '',
      qty: '',
      unit: 'g',
      location: '',
    }),
    [],
  );

  return (
    <div>
      <PageHeader
        title="库存管理"
        subtitle="试剂在库批次"
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> 入库
          </Button>
        }
      />
      <Card className="p-2">
        <DataTable
          columns={columns}
          data={stocks}
          loading={loading}
          testId="stocks-table"
          emptyTitle="暂无库存"
        />
      </Card>

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        schema={schema}
        defaultValues={defaultValues}
        title="入库"
        onSubmit={async (values) => {
          try {
            await apiFetch('/stocks', {
              method: 'POST',
              token,
              body: {
                reagentId: values.reagentId,
                labId: values.labId,
                batchNo: values.batchNo || undefined,
                initialQty: values.qty,
                currentQty: values.qty,
                unit: values.unit,
                location: values.location || undefined,
              },
            });
            toast.success('入库成功');
            setFormOpen(false);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '入库失败');
            throw e;
          }
        }}
        fields={(form) => (
          <>
            <FormField
              control={form.control}
              name="reagentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>试剂</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
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
            <FormField
              control={form.control}
              name="labId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>实验室</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
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
              name="batchNo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>批号</FormLabel>
                  <FormControl><Input {...field} placeholder="可选" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="qty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>数量</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>单位</FormLabel>
                    <FormControl><Input {...field} placeholder="g / mL" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>存放位置</FormLabel>
                  <FormControl><Input {...field} placeholder="柜号-层号（可选）" /></FormControl>
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
```

- [ ] **Step 2: typecheck + commit**

```bash
pnpm -F @app/web exec tsc --noEmit
git add "apps/web/src/app/(app)/admin/stocks/page.tsx"
git commit -m "feat(web/p8b): /admin/stocks → DataTable + FormDialog with Select fields"
```

---

## Task 10: admin/issues 改造（Card-in-li 流程，签名板内联）

**Files:**
- Modify: `apps/web/src/app/(app)/admin/issues/page.tsx`

**已有 API：** `GET /requests?status=APPROVED|ISSUED`、`POST /requests/:id/issues`。每行需要签名板 + 见证人 + 实际量，**不适合塞 Dialog**，沿用 P8a `/approvals` 的 Card-in-li 模式。

- [ ] **Step 1: 重写**

`apps/web/src/app/(app)/admin/issues/page.tsx`（完整替换）：

```tsx
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { EmptyState } from '@/components/data/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface UserLite { id: string; name: string; email: string }
interface RequestItem {
  id: string;
  status: string;
  quantity: string;
  unit: string;
  purpose: string;
  createdAt: string;
  reagent: { name: string; hazardLevel?: string; controlType?: string | null };
  stock: { batchNo?: string | null };
  applicant: UserLite;
}

const issuedColumns: ColumnDef<RequestItem>[] = [
  { id: 'reagent', header: '试剂', cell: ({ row }) => row.original.reagent.name },
  {
    id: 'batchNo',
    header: '批号',
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.stock.batchNo ?? '—'}</span>
    ),
  },
  {
    id: 'qty',
    header: '申请量',
    cell: ({ row }) => `${row.original.quantity} ${row.original.unit}`,
  },
  { id: 'applicant', header: '领用人', cell: ({ row }) => row.original.applicant.name },
  { accessorKey: 'purpose', header: '用途' },
  {
    id: 'createdAt',
    header: '提交时间',
    cell: ({ row }) =>
      row.original.createdAt.slice(0, 16).replace('T', ' '),
  },
];

export default function IssuesPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [pending, setPending] = useState<RequestItem[]>([]);
  const [issued, setIssued] = useState<RequestItem[]>([]);
  const [witnesses, setWitnesses] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [qtyById, setQtyById] = useState<Record<string, string>>({});
  const [witnessById, setWitnessById] = useState<Record<string, string>>({});
  const sigRefs = useRef<Record<string, SignatureCanvas | null>>({});

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [ap, iss, users] = await Promise.all([
        apiFetch<RequestItem[]>('/requests?status=APPROVED', { token }),
        apiFetch<RequestItem[]>('/requests?status=ISSUED', { token }),
        apiFetch<UserLite[]>('/users', { token }).catch(() => [] as UserLite[]),
      ]);
      setPending(ap);
      setIssued(iss);
      setWitnesses(users);
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isCtrl = (r: RequestItem) =>
    r.reagent.hazardLevel === 'CONTROLLED' || !!r.reagent.controlType;

  async function issue(r: RequestItem) {
    const actualQty = qtyById[r.id] ?? r.quantity;
    try {
      const body: Record<string, unknown> = { actualQty };
      if (isCtrl(r)) {
        if (!witnessById[r.id]) throw new Error('请选择见证人');
        const sig = sigRefs.current[r.id];
        if (!sig || sig.isEmpty()) throw new Error('请领用人签名后再发放');
        body.witnessId = witnessById[r.id];
        body.signatureDataUrl = sig.toDataURL('image/png');
      }
      await apiFetch(`/requests/${r.id}/issues`, { method: 'POST', token, body });
      sigRefs.current[r.id]?.clear();
      setQtyById((m) => ({ ...m, [r.id]: '' }));
      setWitnessById((m) => ({ ...m, [r.id]: '' }));
      toast.success('已发放');
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? '发放失败');
    }
  }

  return (
    <div>
      <PageHeader title="发放管理" subtitle="待发放申请与已发放台账" />

      <h2 className="mb-3 text-base font-semibold">待发放</h2>
      {pending.length === 0 ? (
        <EmptyState title="暂无待发放申请" />
      ) : (
        <ul className="mb-6 space-y-3" data-testid="issues-pending">
          {pending.map((r) => {
            const ctrl = isCtrl(r);
            return (
              <li key={r.id}>
                <Card className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{r.reagent.name}</span>
                        {ctrl && <Badge variant="destructive">管控</Badge>}
                        <span className="text-sm text-muted-foreground">
                          批号 {r.stock.batchNo ?? '—'} · 申请 {r.quantity}
                          {r.unit}
                        </span>
                      </div>
                      <div className="text-sm">
                        {r.applicant.name} · {r.purpose}
                      </div>
                    </div>
                    <div className="flex items-end gap-2">
                      <Input
                        className="w-32"
                        placeholder={`实际量 (${r.unit})`}
                        value={qtyById[r.id] ?? ''}
                        onChange={(e) =>
                          setQtyById((m) => ({ ...m, [r.id]: e.target.value }))
                        }
                      />
                      {!ctrl && (
                        <Button size="sm" onClick={() => issue(r)}>发放</Button>
                      )}
                    </div>
                  </div>

                  {ctrl && (
                    <>
                      <Separator className="my-3" />
                      <div className="space-y-2">
                        <Select
                          value={witnessById[r.id] ?? ''}
                          onValueChange={(v) =>
                            setWitnessById((m) => ({ ...m, [r.id]: v }))
                          }
                        >
                          <SelectTrigger className="w-72">
                            <SelectValue placeholder="选择见证人" />
                          </SelectTrigger>
                          <SelectContent>
                            {witnesses.map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.name}（{u.email}）
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div>
                          <div className="mb-1 text-sm text-muted-foreground">
                            领用人签名
                          </div>
                          <SignatureCanvas
                            ref={(el) => {
                              sigRefs.current[r.id] = el;
                            }}
                            canvasProps={{
                              width: 400,
                              height: 120,
                              className: 'rounded border bg-background',
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-1 h-7 px-2 text-xs"
                            onClick={() => sigRefs.current[r.id]?.clear()}
                          >
                            清空签名
                          </Button>
                        </div>
                        <div className="flex justify-end">
                          <Button size="sm" onClick={() => issue(r)}>发放</Button>
                        </div>
                      </div>
                    </>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mb-3 text-base font-semibold">已发放台账</h2>
      <Card className="p-2">
        <DataTable
          columns={issuedColumns}
          data={issued}
          loading={loading}
          testId="issues-issued"
          emptyTitle="暂无已发放记录"
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: typecheck + commit**

```bash
pnpm -F @app/web exec tsc --noEmit
git add "apps/web/src/app/(app)/admin/issues/page.tsx"
git commit -m "feat(web/p8b): /admin/issues → Card-in-li flow + DataTable history (signature inline)"
```

---

## Task 11: admin/purchases 改造（merge 表 + 入库 FormDialog）

**Files:**
- Modify: `apps/web/src/app/(app)/admin/purchases/page.tsx`

**已有 API：** `GET /purchases`、`POST /purchases/batches`（合并）、`POST /purchases/batches/:id/receipt`（入库）。无 PATCH/DELETE。

- [ ] **Step 1: 重写**

`apps/web/src/app/(app)/admin/purchases/page.tsx`（完整替换）：

```tsx
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { z } from 'zod';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { FormDialog } from '@/components/data/FormDialog';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import type {
  PurchaseRequestSummary,
  PurchaseBatchSummary,
} from '@app/shared';

type PurchaseRow = PurchaseRequestSummary & {
  reagent?: { id: string; name: string } | null;
  applicant?: { id: string; name: string; email: string } | null;
  batch?: PurchaseBatchSummary | null;
};

const receiptSchema = z.object({
  actualQty: z.string().min(1, '实收数量必填'),
  batchNo: z.string().optional(),
  mfgDate: z.string().optional(),
  expireDate: z.string().optional(),
  location: z.string().optional(),
  supplier: z.string().optional(),
  purchasePrice: z.string().optional(),
});

const EMPTY_RECEIPT = {
  actualQty: '',
  batchNo: '',
  mfgDate: '',
  expireDate: '',
  location: '',
  supplier: '',
  purchasePrice: '',
};

export default function AdminPurchasesPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [pending, setPending] = useState<PurchaseRow[]>([]);
  const [batches, setBatches] = useState<PurchaseBatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [receiptFor, setReceiptFor] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const all = await apiFetch<PurchaseRow[]>('/purchases', { token });
      setPending(all.filter((p) => p.status === 'PENDING'));
      const map = new Map<string, PurchaseBatchSummary>();
      for (const p of all) {
        if (p.batch && !map.has(p.batch.id)) map.set(p.batch.id, p.batch);
      }
      setBatches(Array.from(map.values()));
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function toggle(id: string) {
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function merge() {
    if (!token || picked.size === 0) return;
    try {
      await apiFetch('/purchases/batches', {
        method: 'POST',
        token,
        body: { requestIds: Array.from(picked) },
      });
      toast.success('已合并');
      setPicked(new Set());
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? '合并失败');
    }
  }

  const pendingColumns: ColumnDef<PurchaseRow>[] = useMemo(
    () => [
      {
        id: 'pick',
        header: ({ table }) => (
          <Checkbox
            checked={
              pending.length > 0 && picked.size === pending.length
            }
            onCheckedChange={(v) => {
              if (v) setPicked(new Set(pending.map((p) => p.id)));
              else setPicked(new Set());
            }}
            aria-label="全选"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={picked.has(row.original.id)}
            onCheckedChange={() => toggle(row.original.id)}
            aria-label="选择"
          />
        ),
      },
      {
        id: 'applicant',
        header: '申请人',
        cell: ({ row }) =>
          row.original.applicant?.name ?? row.original.applicantId,
      },
      {
        id: 'reagent',
        header: '试剂',
        cell: ({ row }) =>
          row.original.reagent?.name ?? row.original.reagentId,
      },
      {
        id: 'qty',
        header: '数量',
        cell: ({ row }) => `${row.original.quantity} ${row.original.unit}`,
      },
      { accessorKey: 'reason', header: '理由' },
    ],
    [pending, picked],
  );

  const batchColumns: ColumnDef<PurchaseBatchSummary>[] = useMemo(
    () => [
      {
        id: 'id',
        header: '批次',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.id.slice(0, 8)}</span>
        ),
      },
      { id: 'reagent', header: '试剂', cell: ({ row }) => row.original.reagentId },
      {
        id: 'qty',
        header: '总量',
        cell: ({ row }) => `${row.original.totalQty} ${row.original.unit}`,
      },
      {
        id: 'status',
        header: '状态',
        cell: ({ row }) => (
          <Badge variant={row.original.status === 'APPROVED' ? 'default' : 'secondary'}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }) =>
          row.original.status === 'APPROVED' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReceiptFor(row.original.id)}
            >
              入库
            </Button>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="采购管理"
        subtitle="待合并申请与批次入库"
        actions={
          <Button disabled={picked.size === 0} onClick={merge}>
            合并成批次（{picked.size}）
          </Button>
        }
      />

      <h2 className="mb-3 text-base font-semibold">待合并采购申请</h2>
      <Card className="mb-6 p-2">
        <DataTable
          columns={pendingColumns}
          data={pending}
          loading={loading}
          testId="purchases-pending"
          emptyTitle="无待合并申请"
        />
      </Card>

      <h2 className="mb-3 text-base font-semibold">批次</h2>
      <Card className="p-2">
        <DataTable
          columns={batchColumns}
          data={batches}
          loading={loading}
          testId="purchases-batches"
          emptyTitle="无批次"
        />
      </Card>

      <FormDialog
        open={!!receiptFor}
        onOpenChange={(o) => !o && setReceiptFor(null)}
        schema={receiptSchema}
        defaultValues={EMPTY_RECEIPT}
        title={`入库批次 ${receiptFor?.slice(0, 8) ?? ''}`}
        onSubmit={async (values) => {
          if (!receiptFor) return;
          try {
            await apiFetch(`/purchases/batches/${receiptFor}/receipt`, {
              method: 'POST',
              token,
              body: values,
            });
            toast.success('入库成功');
            setReceiptFor(null);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '入库失败');
            throw e;
          }
        }}
        fields={(form) => (
          <>
            {(
              [
                ['actualQty', '实收数量'],
                ['batchNo', '批号'],
                ['mfgDate', '生产日期'],
                ['expireDate', '有效期'],
                ['location', '存放位置'],
                ['supplier', '供应商'],
                ['purchasePrice', '采购单价'],
              ] as const
            ).map(([name, label]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 2: 装 shadcn checkbox（如未装）**

```bash
cd apps/web && pnpm dlx shadcn@latest add -y checkbox
```

- [ ] **Step 3: typecheck + commit**

```bash
pnpm -F @app/web exec tsc --noEmit
git add "apps/web/src/app/(app)/admin/purchases/page.tsx" apps/web/src/components/ui/checkbox.tsx
git commit -m "feat(web/p8b): /admin/purchases → DataTable + Checkbox merge + receipt FormDialog"
```

---

## Task 12: admin/alerts/config 改造（FormDialog + ConfirmDialog 删除）

**Files:**
- Modify: `apps/web/src/app/(app)/admin/alerts/config/page.tsx`

**已有 API：** `GET /lab-reagent-configs`、`POST /lab-reagent-configs`（upsert）、`DELETE /lab-reagent-configs/:id`。

- [ ] **Step 1: 重写**

`apps/web/src/app/(app)/admin/alerts/config/page.tsx`（完整替换）：

```tsx
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
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
        fields={(form) => (
          <>
            <FormField
              control={form.control}
              name="labId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>实验室</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
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
                  <Select onValueChange={field.onChange} value={field.value}>
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
        )}
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
```

- [ ] **Step 2: typecheck + commit**

```bash
pnpm -F @app/web exec tsc --noEmit
git add "apps/web/src/app/(app)/admin/alerts/config/page.tsx"
git commit -m "feat(web/p8b): /admin/alerts/config → DataTable + FormDialog upsert + ConfirmDialog delete"
```

---

## Task 13: admin/ledger 改造（只读 + Toolbar 日期 + CSV 下载）

**Files:**
- Modify: `apps/web/src/app/(app)/admin/ledger/page.tsx`
- New: `apps/web/src/components/ui/date-picker.tsx`（Popover + Calendar 封装）
- Add via `pnpm dlx shadcn@latest add -y popover calendar`：`components/ui/popover.tsx`、`components/ui/calendar.tsx`（生成的 calendar.tsx 在 react-day-picker v10 下要去掉 `table` 这一行 className，否则 tsc 报 ClassNames 类型错）

**已有 API：** `GET /controlled-ledger?from&to&format=json|csv`、`GET /controlled-ledger/snapshots`、`GET /controlled-ledger/snapshots/:id`。无写操作。

- [ ] **Step 0: 装 popover + calendar 并写 DatePicker 包装**

```bash
cd apps/web && pnpm dlx shadcn@latest add -y popover calendar
# 然后手动删掉 components/ui/calendar.tsx 中 `table: "w-full border-collapse",` 这一行（react-day-picker v10 ClassNames 不再支持 table）
```

`apps/web/src/components/ui/date-picker.tsx`（新建）：

```tsx
'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface DatePickerProps {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
}

export function DatePicker({
  value,
  onChange,
  placeholder = '选择日期',
  className,
  buttonClassName,
  disabled,
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-40 justify-start text-left font-normal',
            !value && 'text-muted-foreground',
            buttonClassName,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, 'yyyy-MM-dd') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-auto p-0', className)} align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} autoFocus />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 1: 重写**

`apps/web/src/app/(app)/admin/ledger/page.tsx`（完整替换）：

```tsx
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { Toolbar } from '@/components/data/Toolbar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DatePicker } from '@/components/ui/date-picker';
import { apiFetch, apiBaseUrl } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

interface Row {
  date: string;
  reagentName: string;
  batchNo: string;
  controlType: string | null;
  applicant: string;
  projectRef: string;
  purpose: string;
  actualQty: string;
  unit: string;
  issuer: string;
  witness: string;
  signed: 'Y' | 'N';
}
interface Snapshot {
  id: string;
  labId: string;
  yearMonth: string;
  rowCount: number;
  createdAt: string;
}

const columns: ColumnDef<Row>[] = [
  { accessorKey: 'date', header: '日期' },
  { accessorKey: 'reagentName', header: '试剂' },
  {
    accessorKey: 'batchNo',
    header: '批号',
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.batchNo}</span>
    ),
  },
  {
    id: 'controlType',
    header: '管控类型',
    cell: ({ row }) =>
      row.original.controlType ? (
        <Badge variant="destructive">{row.original.controlType}</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  { accessorKey: 'applicant', header: '申请人' },
  { accessorKey: 'projectRef', header: '项目' },
  {
    id: 'qty',
    header: '实发',
    cell: ({ row }) => `${row.original.actualQty} ${row.original.unit}`,
  },
  { accessorKey: 'issuer', header: '发放人' },
  { accessorKey: 'witness', header: '见证人' },
  {
    accessorKey: 'signed',
    header: '已签名',
    cell: ({ row }) => (row.original.signed === 'Y' ? '✓' : ''),
  },
];

export default function LedgerPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [rows, setRows] = useState<Row[]>([]);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState<Date | undefined>(undefined);
  const [to, setTo] = useState<Date | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ format: 'json' });
      if (from) qs.set('from', format(from, 'yyyy-MM-dd'));
      if (to) qs.set('to', format(to, 'yyyy-MM-dd'));
      const [data, snapList] = await Promise.all([
        apiFetch<Row[]>(`/controlled-ledger?${qs}`, { token }),
        apiFetch<Snapshot[]>('/controlled-ledger/snapshots', { token }),
      ]);
      setRows(data);
      setSnaps(snapList);
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token, from, to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const download = useCallback(
    async (path: string, filename: string) => {
      try {
        const resp = await fetch(apiBaseUrl + path, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e: any) {
        toast.error(e.message ?? '下载失败');
      }
    },
    [token],
  );

  const downloadCsv = useMemo(
    () => () => {
      const qs = new URLSearchParams({ format: 'csv' });
      if (from) qs.set('from', format(from, 'yyyy-MM-dd'));
      if (to) qs.set('to', format(to, 'yyyy-MM-dd'));
      download(`/controlled-ledger?${qs}`, 'controlled-ledger.csv');
    },
    [from, to, download],
  );

  return (
    <div>
      <PageHeader title="管控台账" subtitle="管控试剂出入库流水" />
      <Toolbar
        filters={
          <>
            <DatePicker value={from} onChange={setFrom} placeholder="开始日期" />
            <span className="text-muted-foreground text-sm">至</span>
            <DatePicker value={to} onChange={setTo} placeholder="结束日期" />
          </>
        }
        actions={
          <Button variant="outline" size="sm" onClick={downloadCsv}>
            <Download className="mr-2 h-4 w-4" /> 下载 CSV
          </Button>
        }
      />
      <Card className="mb-6 p-2">
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          testId="ledger-table"
          emptyTitle="无台账记录"
        />
      </Card>

      <h2 className="mb-3 text-base font-semibold">历史快照</h2>
      <Card className="p-3">
        {snaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无</p>
        ) : (
          <ul className="space-y-1">
            {snaps.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded px-2 py-1 hover:bg-accent"
              >
                <span className="font-medium">{s.yearMonth}</span>
                <span className="text-xs text-muted-foreground">
                  lab={s.labId} · {s.rowCount} 行
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() =>
                    download(
                      `/controlled-ledger/snapshots/${s.id}`,
                      `${s.yearMonth}.csv`,
                    )
                  }
                >
                  <Download className="mr-1 h-3 w-3" /> 下载
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: typecheck + commit**

```bash
pnpm -F @app/web exec tsc --noEmit
git add "apps/web/src/app/(app)/admin/ledger/page.tsx" \
  apps/web/src/components/ui/date-picker.tsx \
  apps/web/src/components/ui/popover.tsx \
  apps/web/src/components/ui/calendar.tsx \
  apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web/p8b): /admin/ledger → DataTable + Toolbar DatePicker + snapshot list"
```

---

## Task 14: my/requests + my/purchases 改造

**Files:**
- Modify: `apps/web/src/app/(app)/my/requests/page.tsx`
- Modify: `apps/web/src/app/(app)/my/purchases/page.tsx`

**注意：** 当前两文件都包了多余的 `<RequireAuth>` 和 `<main>`，因为 (app)/layout.tsx 已经有 RequireAuth + AppShell main，本次顺手去掉。

`my/requests` 已有 `POST /requests`、`POST /requests/:id/cancel`；`my/purchases` 已有 `POST /purchases`、`POST /purchases/:id/cancel`。

- [ ] **Step 1: 重写 my/requests**

`apps/web/src/app/(app)/my/requests/page.tsx`（完整替换）：

```tsx
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Plus } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { isControlled } from '@app/shared';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

interface Reagent {
  id: string;
  name: string;
  hazardLevel?: 'NORMAL' | 'DANGEROUS' | 'CONTROLLED';
  controlType?: string | null;
}
interface Stock {
  id: string;
  batchNo?: string | null;
  currentQty: string;
  unit: string;
  reagent: { id: string; name: string };
}
interface RequestItem {
  id: string;
  status: string;
  quantity: string;
  unit: string;
  purpose: string;
  createdAt: string;
  rejectedReason?: string | null;
  reagent: { name: string; hazardLevel?: string; controlType?: string | null };
  stock: { batchNo?: string | null };
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'PENDING') return 'secondary';
  if (status === 'APPROVED' || status === 'ISSUED' || status === 'FULFILLED') return 'default';
  if (status === 'REJECTED' || status === 'CANCELLED') return 'destructive';
  return 'outline';
}

export default function MyRequestsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [reagents, setReagents] = useState<Reagent[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [cancelling, setCancelling] = useState<RequestItem | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [r, rs, st] = await Promise.all([
        apiFetch<RequestItem[]>('/requests', { token }),
        apiFetch<Reagent[]>('/reagents', { token }),
        apiFetch<Stock[]>('/stocks', { token }),
      ]);
      setItems(r);
      setReagents(rs);
      setStocks(st);
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 提交表单的 schema 与 controlled 联动校验
  const schema = useMemo(
    () =>
      z
        .object({
          reagentId: z.string().min(1, '请选择试剂'),
          stockId: z.string().min(1, '请选择批次'),
          quantity: z.string().min(1, '数量必填'),
          unit: z.string().min(1, '单位必填'),
          purpose: z.string().min(1, '用途必填'),
          projectRef: z.string().optional(),
          useLocation: z.string().optional(),
        })
        .superRefine((v, ctx) => {
          const reagent = reagents.find((r) => r.id === v.reagentId);
          if (!reagent) return;
          const ctrl = isControlled({
            hazardLevel: (reagent.hazardLevel ?? 'NORMAL') as any,
            controlType: (reagent.controlType ?? null) as any,
          });
          if (ctrl) {
            if (v.purpose.trim().length < 50) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['purpose'],
                message: '管控试剂用途需 ≥50 字',
              });
            }
            if (!v.projectRef) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['projectRef'],
                message: '管控试剂项目号必填',
              });
            }
            if (!v.useLocation) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['useLocation'],
                message: '管控试剂使用地点必填',
              });
            }
          }
        }),
    [reagents],
  );

  const defaultValues = useMemo(
    () => ({
      reagentId: '',
      stockId: '',
      quantity: '',
      unit: 'mL',
      purpose: '',
      projectRef: '',
      useLocation: '',
    }),
    [],
  );

  const columns: ColumnDef<RequestItem>[] = useMemo(
    () => [
      {
        id: 'reagent',
        header: '试剂',
        cell: ({ row }) => {
          const ctrl =
            row.original.reagent.hazardLevel === 'CONTROLLED' ||
            !!row.original.reagent.controlType;
          return (
            <span className="flex items-center gap-2">
              <span>{row.original.reagent.name}</span>
              {ctrl && <Badge variant="destructive">管控</Badge>}
            </span>
          );
        },
      },
      {
        id: 'batchNo',
        header: '批号',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.stock.batchNo ?? '—'}</span>
        ),
      },
      {
        id: 'qty',
        header: '数量',
        cell: ({ row }) => `${row.original.quantity} ${row.original.unit}`,
      },
      { accessorKey: 'purpose', header: '用途' },
      {
        id: 'status',
        header: '状态',
        cell: ({ row }) => (
          <span className="flex items-center gap-1">
            <Badge variant={statusVariant(row.original.status)}>
              {row.original.status}
            </Badge>
            {row.original.status === 'REJECTED' && row.original.rejectedReason && (
              <span className="text-xs text-muted-foreground">
                ({row.original.rejectedReason})
              </span>
            )}
          </span>
        ),
      },
      {
        id: 'createdAt',
        header: '提交时间',
        cell: ({ row }) =>
          row.original.createdAt.slice(0, 16).replace('T', ' '),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          row.original.status === 'PENDING' ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="操作">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setCancelling(row.original)}
                >
                  取消申请
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="我的申请"
        subtitle="试剂领用申请记录"
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> 新申请
          </Button>
        }
      />
      <Card className="p-2">
        <DataTable
          columns={columns}
          data={items}
          loading={loading}
          testId="my-requests-table"
          emptyTitle="暂无申请"
        />
      </Card>

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        schema={schema}
        defaultValues={defaultValues}
        title="新建领用申请"
        description="管控试剂用途需 ≥50 字，项目号、使用地点必填"
        onSubmit={async (values) => {
          try {
            await apiFetch('/requests', {
              method: 'POST',
              token,
              body: {
                reagentId: values.reagentId,
                stockId: values.stockId,
                quantity: values.quantity,
                unit: values.unit,
                purpose: values.purpose,
                projectRef: values.projectRef || undefined,
                useLocation: values.useLocation || undefined,
              },
            });
            toast.success('已提交');
            setFormOpen(false);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '提交失败');
            throw e;
          }
        }}
        fields={(form) => {
          const reagentId = form.watch('reagentId');
          const stocksForReagent = stocks.filter(
            (s) => !reagentId || s.reagent.id === reagentId,
          );
          return (
            <>
              <FormField
                control={form.control}
                name="reagentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>试剂</FormLabel>
                    <Select
                      onValueChange={(v) => {
                        field.onChange(v);
                        form.setValue('stockId', '');
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="选择试剂" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {reagents.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                            {(r.hazardLevel === 'CONTROLLED' || r.controlType) ? '（管控）' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stockId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>批次</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="选择批次" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {stocksForReagent.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.batchNo ?? '(无批号)'} · 余 {s.currentQty}{s.unit}
                          </SelectItem>
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
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>数量</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>单位</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="purpose"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>用途</FormLabel>
                    <FormControl><Textarea rows={3} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="projectRef"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>项目号</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="useLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>使用地点</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </>
          );
        }}
      />

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title="取消申请"
        description={`确认取消"${cancelling?.reagent.name}"的申请？`}
        confirmLabel="确认取消"
        onConfirm={async () => {
          if (!cancelling) return;
          try {
            await apiFetch(`/requests/${cancelling.id}/cancel`, {
              method: 'POST',
              token,
            });
            toast.success('已取消');
            setCancelling(null);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '取消失败');
            throw e;
          }
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: 重写 my/purchases**

`apps/web/src/app/(app)/my/purchases/page.tsx`（完整替换）：

```tsx
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import type { PurchaseRequestSummary, ReagentSummary } from '@app/shared';

type PurchaseRow = PurchaseRequestSummary & {
  reagent?: { id: string; name: string } | null;
};

const schema = z.object({
  reagentId: z.string().min(1, '请选择试剂'),
  quantity: z.string().min(1, '数量必填'),
  unit: z.string().min(1, '单位必填'),
  reason: z.string().min(1, '采购理由必填'),
});

function statusVariant(s: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 'PENDING') return 'secondary';
  if (s === 'APPROVED') return 'default';
  if (s === 'REJECTED' || s === 'CANCELLED') return 'destructive';
  return 'outline';
}

export default function MyPurchasesPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [items, setItems] = useState<PurchaseRow[]>([]);
  const [reagents, setReagents] = useState<ReagentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [cancelling, setCancelling] = useState<PurchaseRow | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [list, rs] = await Promise.all([
        apiFetch<PurchaseRow[]>('/purchases/mine', { token }),
        apiFetch<ReagentSummary[]>('/reagents', { token }),
      ]);
      setItems(list);
      setReagents(rs);
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const defaultValues = useMemo(
    () => ({ reagentId: '', quantity: '', unit: 'mL', reason: '' }),
    [],
  );

  const columns: ColumnDef<PurchaseRow>[] = useMemo(
    () => [
      {
        id: 'createdAt',
        header: '时间',
        cell: ({ row }) =>
          new Date(row.original.createdAt).toLocaleString(),
      },
      {
        id: 'reagent',
        header: '试剂',
        cell: ({ row }) => row.original.reagent?.name ?? row.original.reagentId,
      },
      {
        id: 'qty',
        header: '数量',
        cell: ({ row }) => `${row.original.quantity} ${row.original.unit}`,
      },
      { accessorKey: 'reason', header: '理由' },
      {
        id: 'status',
        header: '状态',
        cell: ({ row }) => (
          <Badge variant={statusVariant(row.original.status)}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          row.original.status === 'PENDING' ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="操作">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setCancelling(row.original)}
                >
                  取消
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="我的采购申请"
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> 新采购申请
          </Button>
        }
      />
      <Card className="p-2">
        <DataTable
          columns={columns}
          data={items}
          loading={loading}
          testId="my-purchases-table"
          emptyTitle="暂无采购申请"
        />
      </Card>

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        schema={schema}
        defaultValues={defaultValues}
        title="新采购申请"
        onSubmit={async (values) => {
          try {
            await apiFetch('/purchases', { method: 'POST', token, body: values });
            toast.success('已提交');
            setFormOpen(false);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '提交失败');
            throw e;
          }
        }}
        fields={(form) => (
          <>
            <FormField
              control={form.control}
              name="reagentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>试剂</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
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
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>数量</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>单位</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>采购理由</FormLabel>
                  <FormControl><Textarea rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
      />

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title="取消采购申请"
        description={`确认取消该采购申请？`}
        confirmLabel="确认取消"
        onConfirm={async () => {
          if (!cancelling) return;
          try {
            await apiFetch(`/purchases/${cancelling.id}/cancel`, {
              method: 'POST',
              token,
            });
            toast.success('已取消');
            setCancelling(null);
            await refresh();
          } catch (e: any) {
            toast.error(e.message ?? '取消失败');
            throw e;
          }
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: typecheck + commit**

```bash
pnpm -F @app/web exec tsc --noEmit
git add "apps/web/src/app/(app)/my/requests/page.tsx" "apps/web/src/app/(app)/my/purchases/page.tsx"
git commit -m "feat(web/p8b): /my/requests + /my/purchases → DataTable + FormDialog + ConfirmDialog cancel"
```

---

## Task 15: approvals/purchases 改造（Card-in-li）

**Files:**
- Modify: `apps/web/src/app/(app)/approvals/purchases/page.tsx`

**已有 API：** `GET /purchases`、`POST /purchases/batches/:id/approve`。批次级审批，按 P8a `/approvals` 同款 Card-in-li 模式。

- [ ] **Step 1: 重写**

`apps/web/src/app/(app)/approvals/purchases/page.tsx`（完整替换）：

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { EmptyState } from '@/components/data/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import type {
  PurchaseBatchSummary,
  PurchaseRequestSummary,
} from '@app/shared';

type PurchaseRow = PurchaseRequestSummary & {
  reagent?: { id: string; name: string } | null;
  applicant?: { id: string; name: string; email: string } | null;
  batch?: PurchaseBatchSummary | null;
};
type Group = { batch: PurchaseBatchSummary; items: PurchaseRow[] };

export default function PurchaseApprovalsPage() {
  const token = useAuth((s) => s.tokens?.accessToken);
  const [groups, setGroups] = useState<Record<string, Group>>({});
  const [comment, setComment] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const all = await apiFetch<PurchaseRow[]>('/purchases', { token });
      const g: Record<string, Group> = {};
      for (const p of all) {
        if (!p.batch || p.batch.status !== 'PENDING') continue;
        if (!g[p.batch.id]) g[p.batch.id] = { batch: p.batch, items: [] };
        g[p.batch.id].items.push(p);
      }
      setGroups(g);
    } catch (e: any) {
      toast.error(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function decide(batchId: string, action: 'APPROVE' | 'REJECT') {
    try {
      await apiFetch(`/purchases/batches/${batchId}/approve`, {
        method: 'POST',
        token,
        body: { action, comment: comment[batchId] ?? '' },
      });
      setComment((c) => ({ ...c, [batchId]: '' }));
      toast.success(action === 'APPROVE' ? '已通过' : '已拒绝');
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? '操作失败');
    }
  }

  const entries = Object.entries(groups);

  return (
    <div>
      <PageHeader title="采购批次审批" subtitle="待审批的采购批次" />
      <main>
        {!loading && entries.length === 0 ? (
          <EmptyState title="暂无待审批批次" />
        ) : (
          <ul className="space-y-3" data-testid="purchase-approvals-list">
            {entries.map(([bid, g]) => (
              <li key={bid}>
                <Card className="p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold">批次</span>
                    <span className="font-mono text-xs text-muted-foreground">{bid}</span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    试剂 {g.batch.reagentId} · 总量 {g.batch.totalQty} {g.batch.unit}
                  </div>
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
                    {g.items.map((i) => (
                      <li key={i.id}>
                        {i.applicant?.name ?? i.applicantId}：{i.quantity}
                        {i.unit}（{i.reason}）
                      </li>
                    ))}
                  </ul>
                  <Textarea
                    className="mt-3"
                    rows={2}
                    placeholder="备注 / 拒绝理由（可选）"
                    value={comment[bid] ?? ''}
                    onChange={(e) =>
                      setComment({ ...comment, [bid]: e.target.value })
                    }
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    <Button size="sm" onClick={() => decide(bid, 'APPROVE')}>
                      通过
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => decide(bid, 'REJECT')}
                    >
                      拒绝
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: typecheck + commit**

```bash
pnpm -F @app/web exec tsc --noEmit
git add "apps/web/src/app/(app)/approvals/purchases/page.tsx"
git commit -m "feat(web/p8b): /approvals/purchases → Card-in-li + sonner; drop redundant RequireAuth"
```

---

## Task 16: 验收（vitest + build + 手动走查）

**Files:** 无修改，纯验证。

- [ ] **Step 1: vitest 全量**

```bash
pnpm -F @app/web test
```

预期：全绿。用例数 = P8a 19 + 新增（MobileSidebar 4 + CommandPalette 4 + FormDialog 3 + ConfirmDialog 2）= 32 ≈ 33。

- [ ] **Step 2: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

预期：0 错误。

- [ ] **Step 3: build**

```bash
pnpm -F @app/web build
```

预期：22 routes 全部 OK；First Load JS shared 较 P8a baseline（87.3 kB）增长 ≤ 30 KB。如增长超出，检查是否意外把 `react-signature-canvas` 拉进 shared chunk（应仅在 `/admin/issues` 路由）。

- [ ] **Step 4: 手动视觉走查（dev 模式）**

```bash
pnpm -F @app/web dev
```

桌面端 1280px 浏览器：
- [ ] `/` Dashboard：原样
- [ ] 用 `admin@lab.local` / `admin123` 登录
- [ ] `/admin/labs`：点 "新增" → Dialog 出现 → 输入 → 保存 → toast + 列表刷新
- [ ] `/admin/roles`：纯只读 DataTable，Badge 显示 code
- [ ] `/admin/stocks`：点 "入库" → Select 试剂 + Select 实验室 + 输入 → 保存
- [ ] `/admin/issues`：待发放 Card 显示，普通试剂直接发放，管控试剂出现签名板 + 见证人 Select
- [ ] `/admin/ledger`：Toolbar 日期筛选 + 下载 CSV
- [ ] `/admin/purchases`：Checkbox 选申请 → "合并成批次" → 批次行 "入库" → FormDialog
- [ ] `/admin/alerts/config`：新增 / 删除（DropdownMenu → 删除 → ConfirmDialog → 删）
- [ ] `/my/requests`：新申请 → FormDialog；选管控试剂时 zod 提示用途 ≥50 字
- [ ] `/my/purchases`：新采购 → 取消（Pending 行 DropdownMenu）
- [ ] `/approvals/purchases`：用 `labhead@lab.local` / `lab123` 登录，看到批次 Card + 通过/拒绝按钮
- [ ] 任意页按 `Cmd/Ctrl+K`：CommandPalette 弹出，输入 "乙醇" 看到导航 + 试剂结果，点击跳转

Chrome devtools toggle device → 375px (iPhone SE)：
- [ ] hamburger 按钮可见，点击弹出左侧 Sheet
- [ ] Sheet 中点击 "试剂百科" → 关闭 + 跳转
- [ ] TopBar 的 SearchTrigger 显示为图标按钮，点击弹出 CommandPalette
- [ ] 表格在窄屏下水平滚动，DataTable 不溢出

主题切换（TopBar 月亮图标）：
- [ ] light / dark 切换无样式断裂，Sheet/Dialog/Command 在 dark 下文字可读

Ctrl+C 关 dev server。

- [ ] **Step 5: 收尾 commit（如有 P8a plan checkbox 等漂移）**

```bash
git status
# 若 docs/superpowers/plans/2026-05-08-web-shadcn-revamp-p8a.md 还有未提交的 [x] 改动
git add -A docs/superpowers/plans/
git commit -m "docs(p8a): mark final verification checklist as done" || true
```

- [ ] **Step 6: 不打 tag**

P8b 不在本期打 `p8b-complete`，等用户在外部 docker 环境补跑 e2e 后另行决定。本轮收尾时只 `git log --oneline | head -20` 确认 commit 链完整。

```bash
git log --oneline | head -20
```

预期：从 task 1 到 task 16 共 16 个新 commit + 本次 plan 的 spec/plan commit，HEAD 在 master。

---

## Final Verification Checklist

P8b 完工签字之前逐项打勾：

**功能 / 视觉：**
- [ ] 移动端（< md）TopBar 出现 hamburger，Sheet 滑出可导航；点 NavItem 后自动关 Sheet
- [ ] 桌面端 TopBar SearchTrigger 显示为输入框样式 + ⌘K 提示
- [ ] Cmd/Ctrl+K 全局快捷键打开 CommandPalette，导航组按角色过滤
- [ ] CommandPalette 输入文字后 250ms 触发 `/reagents?q=` 查询
- [ ] admin/* 7 页 + my/* 2 页 + approvals/purchases 全部按 spec 模式改造完毕
- [ ] 所有页面错误均走 `toast.error`，不存在裸 `<p class="text-red-600">`
- [ ] FormDialog 的 zod 校验内联报错；onSubmit throw 时 dialog 不关
- [ ] ConfirmDialog 提交期间按钮 disabled
- [ ] `/approvals` 主页面（P8a 改的）`<h1>待我审批` + `main ul > li` + 4 个按钮文字保持不变（运行 e2e Path 2 spec 验证）

**工程：**
- [ ] `pnpm -F @app/web test` 全绿，新增 ≥ 13 用例
- [ ] `pnpm -F @app/web exec tsc --noEmit` 0 错
- [ ] `pnpm -F @app/web build` 22 routes ok，First Load JS shared 增长 ≤ 30 KB
- [ ] `git diff p8a-complete..HEAD -- apps/web/src/lib/auth-store.ts` 空
- [ ] `git diff p8a-complete..HEAD -- apps/web/src/lib/api-client.ts` 空
- [ ] `git diff p8a-complete..HEAD -- apps/web/src/lib/nav.ts` 空
- [ ] `git diff p8a-complete..HEAD -- apps/web/src/components/RequireAuth.tsx` 空
- [ ] `git diff p8a-complete..HEAD -- apps/web/src/components/NotificationBell.tsx` 空

**P8c 待办（不在本期）：**
- reports/* 4 个内页 shadcn 化（KpiCard / ChartCard / DateRangePicker / ExportButton）
- e2e selector 替换为 testid
- admin/* 后端补 PATCH/DELETE 后再启用编辑/删除菜单项
