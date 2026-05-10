# P8c · Web shadcn Revamp（reports/* + e2e testid + admin/users）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 reports/* 4 内页和 4 共享组件（KpiCard / ChartCard / RangePresetPicker / ExportButton）shadcn 化；把 reports.spec.ts + workflows.spec.ts 两个 e2e 由结构 / 文字锁定迁到 testid；启用 /admin/users 的编辑 + 重置密码（含后端 reset-password endpoint）。

**Architecture:** 沿用 P8a/P8b 全部基础设施。新增 `components/ui/date-range-calendar.tsx`（自封装 Popover + Calendar mode='range'）+ `components/reports/RangePresetPicker.tsx`（取代旧 `DateRangePicker.tsx`）；4 个 reports 共享组件原地重写为 shadcn Card/Skeleton/DropdownMenu 体系。4 个 reports/* page 切到 PageHeader + Toolbar + Card + ChartCard + DataTable 模式。`apps/api/src/users/` 增 `POST /users/:id/reset-password`（service 生成 8 位临时密码 → bcrypt 写库 → 返回明文一次）。e2e 两个 spec 改写为 `getByTestId(...)`，`FormDialog` / `ConfirmDialog` 增 `testId` 透传。

**Tech Stack:** Next.js 14.2.3 / React 18.3 / TypeScript 5.4 / Tailwind 3.4 / shadcn/ui (popover, calendar, dropdown-menu, alert-dialog, dialog 全部 P8b 已落地) / react-day-picker v10 / date-fns v4 / recharts 3.8 / RHF + zod / Vitest + RTL / Playwright. apps/api: NestJS 10 / Prisma / bcryptjs（已装）。**无新增依赖**。

**Spec:** `docs/superpowers/specs/2026-05-09-web-shadcn-revamp-p8c-design.md`（HEAD `f0a91cc`）

**Prerequisites:** P8b 完成（HEAD `437563b`，未打 tag）。`pnpm -F @app/web dev` 跑得起来；`pnpm -F @app/web test` 32 用例全绿；`pnpm -F @app/web build` 22 routes ok；`pnpm -F @app/api dev` 起来；后端 `users` 模块已有 PATCH/DELETE，无 reset-password。

---

## File Structure

```
apps/web/src/
├── app/(app)/
│   ├── reports/
│   │   ├── usage-trend/page.tsx                      # REWRITE
│   │   ├── inventory-turnover/page.tsx               # REWRITE（明细 → DataTable）
│   │   ├── purchase-amount/page.tsx                  # REWRITE
│   │   └── controlled-audit/page.tsx                 # REWRITE（明细 → DataTable）
│   ├── admin/
│   │   ├── users/page.tsx                            # MODIFY（启用编辑 + 重置密码）
│   │   ├── issues/page.tsx                           # MODIFY（补 testid）
│   │   └── purchases/page.tsx                        # MODIFY（补 testid）
│   ├── approvals/page.tsx                            # MODIFY（补 testid 5 处）
│   └── my/requests/page.tsx                          # MODIFY（补 testid）
├── app/(public)/
│   └── login/page.tsx                                # MODIFY（补 testid）
└── components/
    ├── ui/
    │   └── date-range-calendar.tsx                   # NEW（Popover + Calendar mode='range'）
    ├── data/
    │   ├── FormDialog.tsx                            # MODIFY（增 testId 透传）
    │   └── ConfirmDialog.tsx                         # MODIFY（增 testId 透传）
    └── reports/
        ├── DateRangePicker.tsx                       # DELETE
        ├── RangePresetPicker.tsx                     # NEW（替换 DateRangePicker）
        ├── ExportButton.tsx                          # REWRITE（DropdownMenu）
        ├── KpiCard.tsx                               # REWRITE（Card + Skeleton + tabular-nums）
        ├── ChartCard.tsx                             # REWRITE（Card + Skeleton + ErrorState + EmptyState）
        └── __tests__/
            ├── RangePresetPicker.test.tsx            # NEW
            ├── ExportButton.test.tsx                 # NEW
            ├── KpiCard.test.tsx                      # NEW
            └── ChartCard.test.tsx                    # NEW

apps/api/src/users/
├── users.controller.ts                                # MODIFY（增 @Post(':id/reset-password')）
├── users.service.ts                                   # MODIFY（增 resetPassword 方法）
└── dto/
    └── reset-password.dto.ts                          # （未启用，仅 controller 返回 string）

tests/e2e/
├── reports.spec.ts                                    # REWRITE（getByTestId）
└── workflows.spec.ts                                  # REWRITE（getByTestId）
```

---

## Task 1: RangePresetPicker + DateRangeCalendar + 单测

**Files:**
- Create: `apps/web/src/components/ui/date-range-calendar.tsx`
- Create: `apps/web/src/components/reports/RangePresetPicker.tsx`
- Delete: `apps/web/src/components/reports/DateRangePicker.tsx`
- Create: `apps/web/src/components/reports/__tests__/RangePresetPicker.test.tsx`

- [ ] **Step 1: 写 DateRangeCalendar 组件**

`apps/web/src/components/ui/date-range-calendar.tsx`：

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

export interface DateRangeValue {
  from?: Date;
  to?: Date;
}

export interface DateRangeCalendarProps {
  value?: DateRangeValue;
  onChange?: (range: DateRangeValue) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  testId?: string;
}

export function DateRangeCalendar({
  value,
  onChange,
  placeholder = '选择日期范围',
  className,
  buttonClassName,
  disabled,
  testId,
}: DateRangeCalendarProps) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (value?.from && value?.to) {
      setOpen(false);
    }
  }, [value?.from, value?.to]);

  const label = !value?.from
    ? <span className="text-muted-foreground">{placeholder}</span>
    : !value?.to
    ? format(value.from, 'yyyy-MM-dd')
    : `${format(value.from, 'yyyy-MM-dd')} — ${format(value.to, 'yyyy-MM-dd')}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          data-testid={testId}
          className={cn(
            'w-72 justify-start text-left font-normal',
            !value?.from && 'text-muted-foreground',
            buttonClassName,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-auto p-0', className)} align="start">
        <Calendar
          mode="range"
          selected={value as any}
          onSelect={(r: any) => onChange?.(r ?? {})}
          numberOfMonths={2}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: 写 RangePresetPicker 组件**

`apps/web/src/components/reports/RangePresetPicker.tsx`：

```tsx
'use client';
import * as React from 'react';
import { format, parse } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DateRangeCalendar,
  type DateRangeValue,
} from '@/components/ui/date-range-calendar';

export type RangePreset = '30d' | '90d' | '365d' | 'month' | 'quarter' | 'custom';

const PRESETS: Array<[RangePreset, string]> = [
  ['30d', '近 30 天'],
  ['90d', '近 90 天'],
  ['365d', '近 1 年'],
  ['month', '本月'],
  ['quarter', '本季'],
  ['custom', '自定义'],
];

export interface RangePresetPickerProps {
  range: RangePreset;
  startDate?: string;
  endDate?: string;
  onChange: (next: {
    range: RangePreset;
    startDate?: string;
    endDate?: string;
  }) => void;
  testId?: string;
}

function strToDate(s?: string): Date | undefined {
  if (!s) return undefined;
  return parse(s, 'yyyy-MM-dd', new Date());
}

export function RangePresetPicker({
  range,
  startDate,
  endDate,
  onChange,
  testId,
}: RangePresetPickerProps) {
  const value: DateRangeValue = {
    from: strToDate(startDate),
    to: strToDate(endDate),
  };

  function handlePreset(next: RangePreset) {
    if (next === 'custom') {
      onChange({ range: 'custom', startDate, endDate });
    } else {
      onChange({ range: next, startDate: undefined, endDate: undefined });
    }
  }

  function handleCalendar(r: DateRangeValue) {
    if (r.from && r.to) {
      onChange({
        range: 'custom',
        startDate: format(r.from, 'yyyy-MM-dd'),
        endDate: format(r.to, 'yyyy-MM-dd'),
      });
    }
  }

  return (
    <div data-testid={testId} className="flex items-center gap-2">
      <Select value={range} onValueChange={(v) => handlePreset(v as RangePreset)}>
        <SelectTrigger className="w-32" data-testid={testId ? testId + '-preset' : undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map(([v, label]) => (
            <SelectItem key={v} value={v}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {range === 'custom' && (
        <DateRangeCalendar
          value={value}
          onChange={handleCalendar}
          testId={testId ? testId + '-calendar' : undefined}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: 删除旧 DateRangePicker.tsx**

```bash
rm apps/web/src/components/reports/DateRangePicker.tsx
```

- [ ] **Step 4: 写 failing test**

`apps/web/src/components/reports/__tests__/RangePresetPicker.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RangePresetPicker } from '../RangePresetPicker';

describe('RangePresetPicker', () => {
  it('renders preset Select with current value', () => {
    render(
      <RangePresetPicker range="30d" onChange={() => {}} testId="t" />,
    );
    expect(screen.getByText('近 30 天')).toBeInTheDocument();
  });

  it('calls onChange when preset switches to 90d (clears dates)', () => {
    const onChange = vi.fn();
    render(<RangePresetPicker range="30d" onChange={onChange} testId="t" />);
    // Open Select trigger
    fireEvent.click(screen.getByTestId('t-preset'));
    // Click "近 90 天" option in popover
    fireEvent.click(screen.getByText('近 90 天'));
    expect(onChange).toHaveBeenCalledWith({
      range: '90d',
      startDate: undefined,
      endDate: undefined,
    });
  });

  it('renders DateRangeCalendar trigger when range is custom', () => {
    render(
      <RangePresetPicker
        range="custom"
        startDate="2026-04-01"
        endDate="2026-04-30"
        onChange={() => {}}
        testId="t"
      />,
    );
    const calBtn = screen.getByTestId('t-calendar');
    expect(calBtn).toBeInTheDocument();
    expect(calBtn).toHaveTextContent('2026-04-01');
    expect(calBtn).toHaveTextContent('2026-04-30');
  });

  it('does not render Calendar when range is not custom', () => {
    render(<RangePresetPicker range="30d" onChange={() => {}} testId="t" />);
    expect(screen.queryByTestId('t-calendar')).toBeNull();
  });
});
```

- [ ] **Step 5: 跑测试确认通过**

```bash
pnpm -F @app/web test -- RangePresetPicker
```

预期：4 用例全绿。

如果 Select 的 click 在 jsdom 不工作（radix select 用 pointer events），可能要改用 `userEvent.click`。fallback：

```ts
import userEvent from '@testing-library/user-event';
const user = userEvent.setup({ pointerEventsCheck: 0 });
await user.click(screen.getByTestId('t-preset'));
```

- [ ] **Step 6: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

预期：0 错。

- [ ] **Step 7: commit**

```bash
git add apps/web/src/components/ui/date-range-calendar.tsx \
  apps/web/src/components/reports/RangePresetPicker.tsx \
  apps/web/src/components/reports/__tests__/RangePresetPicker.test.tsx
git rm apps/web/src/components/reports/DateRangePicker.tsx
git commit -m "feat(web/p8c): RangePresetPicker (Select + DateRangeCalendar mode='range')"
```

---

## Task 2: ExportButton 重写 + 单测

**Files:**
- Modify: `apps/web/src/components/reports/ExportButton.tsx`
- Create: `apps/web/src/components/reports/__tests__/ExportButton.test.tsx`

- [ ] **Step 1: 重写 ExportButton**

`apps/web/src/components/reports/ExportButton.tsx`：

```tsx
'use client';
import * as React from 'react';
import { ChevronDown, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiBaseUrl } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

export interface ExportButtonProps {
  endpoint: string;
  testId?: string;
}

export function ExportButton({ endpoint, testId }: ExportButtonProps) {
  const tokens = useAuth((s) => s.tokens);
  const [downloading, setDownloading] = React.useState(false);

  async function download(format: 'csv' | 'xlsx') {
    if (!tokens) return;
    setDownloading(true);
    try {
      const sep = endpoint.includes('?') ? '&' : '?';
      const res = await fetch(`${apiBaseUrl}${endpoint}${sep}format=${format}`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (!res.ok) {
        toast.error(`导出失败:HTTP ${res.status}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ??
        `report.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message ?? '导出失败');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={downloading}
          data-testid={testId}
        >
          {downloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          导出
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => download('csv')}
          data-testid={testId ? testId + '-csv' : undefined}
        >
          导出 CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => download('xlsx')}
          data-testid={testId ? testId + '-xlsx' : undefined}
        >
          导出 Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: 写 failing test**

`apps/web/src/components/reports/__tests__/ExportButton.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportButton } from '../ExportButton';
import { useAuth } from '@/lib/auth-store';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
import { toast } from 'sonner';

describe('ExportButton', () => {
  beforeEach(() => {
    useAuth.setState({
      tokens: { accessToken: 't', refreshToken: 'r' },
      user: { id: 'u', email: 'a@b', name: 'A', labId: null, roles: ['SYS_ADMIN'] },
      hydrated: true,
    });
    vi.clearAllMocks();
    // jsdom URL.createObjectURL not implemented
    (URL as any).createObjectURL = vi.fn(() => 'blob:mock');
    (URL as any).revokeObjectURL = vi.fn();
  });

  it('opens menu showing CSV / Excel items on trigger click', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ExportButton endpoint="/reports/x" testId="ex" />);
    await user.click(screen.getByTestId('ex'));
    expect(await screen.findByTestId('ex-csv')).toBeInTheDocument();
    expect(screen.getByTestId('ex-xlsx')).toBeInTheDocument();
  });

  it('clicks CSV → calls fetch with token + format=csv', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['x']),
      headers: { get: () => null },
    });
    (global as any).fetch = fetchMock;
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ExportButton endpoint="/reports/x?range=30d" testId="ex" />);
    await user.click(screen.getByTestId('ex'));
    await user.click(await screen.findByTestId('ex-csv'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/reports/x?range=30d&format=csv'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer t' },
        }),
      ),
    );
  });

  it('non-ok response triggers toast.error', async () => {
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      blob: async () => new Blob([]),
      headers: { get: () => null },
    });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ExportButton endpoint="/reports/x" testId="ex" />);
    await user.click(screen.getByTestId('ex'));
    await user.click(await screen.findByTestId('ex-csv'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('导出失败:HTTP 500'),
    );
  });
});
```

- [ ] **Step 3: 跑测试**

```bash
pnpm -F @app/web test -- ExportButton
```

预期：3 用例全绿。

- [ ] **Step 4: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

- [ ] **Step 5: commit**

```bash
git add apps/web/src/components/reports/ExportButton.tsx \
  apps/web/src/components/reports/__tests__/ExportButton.test.tsx
git commit -m "feat(web/p8c): ExportButton → DropdownMenu + sonner toast"
```

---

## Task 3: KpiCard 重写 + 单测

**Files:**
- Modify: `apps/web/src/components/reports/KpiCard.tsx`
- Create: `apps/web/src/components/reports/__tests__/KpiCard.test.tsx`

- [ ] **Step 1: 重写 KpiCard**

`apps/web/src/components/reports/KpiCard.tsx`：

```tsx
'use client';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export interface KpiCardProps {
  label: string;
  value?: string | number;
  delta?: number;
  loading?: boolean;
  testId?: string;
}

export function KpiCard({ label, value, delta, loading, testId }: KpiCardProps) {
  const trend = delta == null ? null : delta >= 0 ? 'up' : 'down';
  const trendColor = trend === 'up' ? 'text-emerald-600' : 'text-destructive';

  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <span
            className="text-3xl font-semibold tabular-nums"
            data-testid={testId ? testId + '-value' : undefined}
          >
            {value ?? '—'}
          </span>
        )}
        {delta != null && !loading && (
          <div className={cn('mt-1 flex items-center text-xs', trendColor)}>
            {trend === 'up' ? (
              <ArrowUp className="mr-1 h-3 w-3" />
            ) : (
              <ArrowDown className="mr-1 h-3 w-3" />
            )}
            <span className="tabular-nums">
              {delta >= 0 ? '+' : ''}
              {delta.toFixed(1)}%
            </span>
            <span className="ml-1 text-muted-foreground">vs 上一周期</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: 写 failing test**

`apps/web/src/components/reports/__tests__/KpiCard.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard } from '../KpiCard';

describe('KpiCard', () => {
  it('renders value when provided', () => {
    render(<KpiCard label="总数" value={1234} testId="kpi" />);
    expect(screen.getByTestId('kpi-value')).toHaveTextContent('1234');
  });

  it('renders em-dash when value is undefined', () => {
    render(<KpiCard label="总数" value={undefined} testId="kpi" />);
    expect(screen.getByTestId('kpi-value')).toHaveTextContent('—');
  });

  it('renders Skeleton when loading=true (no value span)', () => {
    const { container } = render(
      <KpiCard label="总数" value={1234} loading testId="kpi" />,
    );
    expect(screen.queryByTestId('kpi-value')).toBeNull();
    expect(container.querySelector('[data-slot="skeleton"], .animate-pulse')).toBeTruthy();
  });

  it('renders ↑ icon and emerald color when delta > 0', () => {
    const { container } = render(
      <KpiCard label="总数" value={100} delta={12.5} testId="kpi" />,
    );
    expect(container.textContent).toContain('+12.5%');
    expect(container.querySelector('.text-emerald-600')).toBeTruthy();
  });

  it('renders ↓ icon and destructive color when delta < 0', () => {
    const { container } = render(
      <KpiCard label="总数" value={100} delta={-5} testId="kpi" />,
    );
    expect(container.textContent).toContain('-5.0%');
    expect(container.querySelector('.text-destructive')).toBeTruthy();
  });
});
```

- [ ] **Step 3: 跑测试**

```bash
pnpm -F @app/web test -- KpiCard
```

预期：5 用例全绿。如果 `[data-slot="skeleton"]` 选不到，shadcn Skeleton 通常带 `animate-pulse`，备用断言已写。

- [ ] **Step 4: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

- [ ] **Step 5: commit**

```bash
git add apps/web/src/components/reports/KpiCard.tsx \
  apps/web/src/components/reports/__tests__/KpiCard.test.tsx
git commit -m "feat(web/p8c): KpiCard → Card + Skeleton + tabular-nums + delta icon"
```

---

## Task 4: ChartCard 重写 + 单测

**Files:**
- Modify: `apps/web/src/components/reports/ChartCard.tsx`
- Create: `apps/web/src/components/reports/__tests__/ChartCard.test.tsx`

- [ ] **Step 1: 重写 ChartCard**

`apps/web/src/components/reports/ChartCard.tsx`：

```tsx
'use client';
import type { ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/data/ErrorState';
import { EmptyState } from '@/components/data/EmptyState';

export interface ChartCardProps {
  title: string;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  testId?: string;
  children: ReactNode;
}

export function ChartCard({
  title,
  loading,
  error,
  empty,
  testId,
  children,
}: ChartCardProps) {
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[320px] w-full" />
        ) : error ? (
          <ErrorState message={error} />
        ) : empty ? (
          <EmptyState title="暂无数据" />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: 写 failing test**

`apps/web/src/components/reports/__tests__/ChartCard.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartCard } from '../ChartCard';

describe('ChartCard', () => {
  it('renders title and children when no special state', () => {
    render(
      <ChartCard title="趋势" testId="cc">
        <div data-testid="chart-body">CHART</div>
      </ChartCard>,
    );
    expect(screen.getByText('趋势')).toBeInTheDocument();
    expect(screen.getByTestId('chart-body')).toBeInTheDocument();
  });

  it('renders Skeleton when loading=true (no children)', () => {
    const { container } = render(
      <ChartCard title="趋势" loading testId="cc">
        <div data-testid="chart-body">CHART</div>
      </ChartCard>,
    );
    expect(screen.queryByTestId('chart-body')).toBeNull();
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders ErrorState when error is set', () => {
    render(
      <ChartCard title="趋势" error="boom" testId="cc">
        <div data-testid="chart-body">CHART</div>
      </ChartCard>,
    );
    expect(screen.queryByTestId('chart-body')).toBeNull();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('renders EmptyState when empty=true', () => {
    render(
      <ChartCard title="趋势" empty testId="cc">
        <div data-testid="chart-body">CHART</div>
      </ChartCard>,
    );
    expect(screen.queryByTestId('chart-body')).toBeNull();
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: 跑测试**

```bash
pnpm -F @app/web test -- ChartCard
```

预期：4 用例全绿。

- [ ] **Step 4: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

- [ ] **Step 5: commit**

```bash
git add apps/web/src/components/reports/ChartCard.tsx \
  apps/web/src/components/reports/__tests__/ChartCard.test.tsx
git commit -m "feat(web/p8c): ChartCard → Card + Skeleton + ErrorState + EmptyState"
```

---

## Task 5: /reports/usage-trend 重写

**Files:**
- Modify: `apps/web/src/app/(app)/reports/usage-trend/page.tsx`

- [ ] **Step 1: 重写 page**

`apps/web/src/app/(app)/reports/usage-trend/page.tsx`：

```tsx
'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { PageHeader } from '@/components/data/PageHeader';
import { Toolbar } from '@/components/data/Toolbar';
import { KpiCard } from '@/components/reports/KpiCard';
import { ChartCard } from '@/components/reports/ChartCard';
import {
  RangePresetPicker,
  type RangePreset,
} from '@/components/reports/RangePresetPicker';
import { ExportButton } from '@/components/reports/ExportButton';
import { useReportData } from '@/components/reports/useReportData';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { UsageTrendResponse } from '@app/shared';

const LineChart = dynamic(
  () => import('recharts').then((m) => m.LineChart),
  { ssr: false },
);
const Line = dynamic(() => import('recharts').then((m) => m.Line), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), {
  ssr: false,
});
const ResponsiveContainer = dynamic(
  () => import('recharts').then((m) => m.ResponsiveContainer),
  { ssr: false },
);

type GroupBy = 'day' | 'week' | 'month';

export default function UsageTrendPage() {
  const [range, setRange] = useState<RangePreset>('30d');
  const [startDate, setStartDate] = useState<string>();
  const [endDate, setEndDate] = useState<string>();
  const [groupBy, setGroupBy] = useState<GroupBy>('day');

  const { data, loading, error } = useReportData<UsageTrendResponse>(
    '/reports/usage-trend',
    { range, startDate, endDate, groupBy },
  );

  const params = new URLSearchParams();
  params.set('range', range);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  params.set('groupBy', groupBy);
  const exportEndpoint = `/reports/usage-trend?${params.toString()}`;

  return (
    <div data-testid="reports-usage-trend-page">
      <PageHeader title="领用趋势" subtitle="试剂领用量按时间分布" />
      <Toolbar
        filters={
          <>
            <Select
              value={groupBy}
              onValueChange={(v) => setGroupBy(v as GroupBy)}
            >
              <SelectTrigger
                className="w-28"
                data-testid="reports-usage-trend-groupby"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">按日</SelectItem>
                <SelectItem value="week">按周</SelectItem>
                <SelectItem value="month">按月</SelectItem>
              </SelectContent>
            </Select>
            <RangePresetPicker
              range={range}
              startDate={startDate}
              endDate={endDate}
              onChange={(n) => {
                setRange(n.range);
                setStartDate(n.startDate);
                setEndDate(n.endDate);
              }}
              testId="reports-usage-trend-range"
            />
          </>
        }
        actions={
          <ExportButton
            endpoint={exportEndpoint}
            testId="reports-usage-trend-export"
          />
        }
      />

      <div
        className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3"
        data-testid="reports-usage-trend-kpis"
      >
        <KpiCard
          label="总领用量"
          value={data?.summary.totalIssued}
          loading={loading}
          testId="reports-usage-trend-kpi-total"
        />
        <KpiCard
          label="涉及试剂数"
          value={data?.summary.distinctReagents}
          loading={loading}
          testId="reports-usage-trend-kpi-distinct"
        />
        <KpiCard
          label="日均领用"
          value={data?.summary.avgDailyIssued}
          loading={loading}
          testId="reports-usage-trend-kpi-daily-avg"
        />
      </div>

      <ChartCard
        title="领用量趋势"
        loading={loading}
        error={error}
        empty={!loading && !error && (data?.series.length ?? 0) === 0}
        testId="reports-usage-trend-chart"
      >
        {data && (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data.series}>
              <XAxis dataKey="bucket" />
              <YAxis />
              <Tooltip />
              <Line dataKey="qty" stroke="hsl(var(--primary))" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

预期：0 错。

- [ ] **Step 3: dev 走查**

```bash
pnpm -F @app/web dev
```

打开 http://localhost:3000/reports/usage-trend，确认：
- 加载时 KPI 区显示 3 个 Skeleton
- preset Select 切换刷数据
- groupBy Select 切换刷数据
- 导出 ▾ 弹 menu 含 CSV / Excel
- range='custom' 时 Calendar 双月视图，选起止后自动收起

- [ ] **Step 4: commit**

```bash
git add apps/web/src/app/\(app\)/reports/usage-trend/page.tsx
git commit -m "feat(web/p8c): /reports/usage-trend → PageHeader + Toolbar + KpiCard + ChartCard"
```

---

## Task 6: /reports/inventory-turnover 重写（含明细 → DataTable）

**Files:**
- Modify: `apps/web/src/app/(app)/reports/inventory-turnover/page.tsx`

- [ ] **Step 1: 重写 page**

`apps/web/src/app/(app)/reports/inventory-turnover/page.tsx`：

```tsx
'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/data/PageHeader';
import { Toolbar } from '@/components/data/Toolbar';
import { DataTable } from '@/components/data/DataTable';
import { KpiCard } from '@/components/reports/KpiCard';
import { ChartCard } from '@/components/reports/ChartCard';
import {
  RangePresetPicker,
  type RangePreset,
} from '@/components/reports/RangePresetPicker';
import { ExportButton } from '@/components/reports/ExportButton';
import { useReportData } from '@/components/reports/useReportData';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { InventoryTurnoverResponse } from '@app/shared';

const BarChart = dynamic(
  () => import('recharts').then((m) => m.BarChart),
  { ssr: false },
);
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), {
  ssr: false,
});
const ResponsiveContainer = dynamic(
  () => import('recharts').then((m) => m.ResponsiveContainer),
  { ssr: false },
);

type Row = InventoryTurnoverResponse['rows'][number];

const detailColumns: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: '试剂' },
  {
    accessorKey: 'currentQty',
    header: '现存',
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.currentQty}</span>
    ),
  },
  {
    accessorKey: 'dailyOut',
    header: '日均出',
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.dailyOut}</span>
    ),
  },
  {
    accessorKey: 'turnoverDays',
    header: '周转天数',
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.turnoverDays}</span>
    ),
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ row }) => {
      const s = row.original.status;
      const variant: 'default' | 'secondary' | 'destructive' =
        s === 'low' ? 'destructive' : s === 'stale' ? 'secondary' : 'default';
      const label = s === 'low' ? '低' : s === 'stale' ? '滞销' : '正常';
      return <Badge variant={variant}>{label}</Badge>;
    },
  },
];

export default function InventoryTurnoverPage() {
  const [range, setRange] = useState<RangePreset>('30d');
  const [startDate, setStartDate] = useState<string>();
  const [endDate, setEndDate] = useState<string>();

  const { data, loading, error } = useReportData<InventoryTurnoverResponse>(
    '/reports/inventory-turnover',
    { range, startDate, endDate },
  );

  const params = new URLSearchParams();
  params.set('range', range);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const exportEndpoint = `/reports/inventory-turnover?${params}`;

  const top10 = (data?.rows ?? [])
    .filter((r) => r.status !== 'stale')
    .slice()
    .sort((a, b) => a.turnoverDays - b.turnoverDays)
    .slice(0, 10);

  return (
    <div data-testid="reports-inventory-turnover-page">
      <PageHeader title="库存周转" subtitle="试剂周转天数与低库存预警" />
      <Toolbar
        filters={
          <RangePresetPicker
            range={range}
            startDate={startDate}
            endDate={endDate}
            onChange={(n) => {
              setRange(n.range);
              setStartDate(n.startDate);
              setEndDate(n.endDate);
            }}
            testId="reports-inventory-turnover-range"
          />
        }
        actions={
          <ExportButton
            endpoint={exportEndpoint}
            testId="reports-inventory-turnover-export"
          />
        }
      />

      <div
        className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2"
        data-testid="reports-inventory-turnover-kpis"
      >
        <KpiCard
          label="平均周转天数"
          value={data?.summary.avgTurnoverDays}
          loading={loading}
          testId="reports-inventory-turnover-kpi-avg-turnover"
        />
        <KpiCard
          label="低库存数量"
          value={data?.summary.lowStockCount}
          loading={loading}
          testId="reports-inventory-turnover-kpi-low-stock"
        />
      </div>

      <ChartCard
        title="周转最快 Top 10"
        loading={loading}
        error={error}
        empty={!loading && !error && top10.length === 0}
        testId="reports-inventory-turnover-chart"
      >
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={top10}>
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="turnoverDays" fill="hsl(var(--primary))" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <Card className="mt-4 p-2">
        <DataTable
          columns={detailColumns}
          data={data?.rows ?? []}
          loading={loading}
          testId="reports-inventory-turnover-detail-table"
          emptyTitle="暂无明细"
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

- [ ] **Step 3: dev 走查**

http://localhost:3000/reports/inventory-turnover：
- 2 KPI Skeleton → 数值
- BarChart Top 10 渲染
- 明细 DataTable 行可见，状态列 Badge 着色

- [ ] **Step 4: commit**

```bash
git add apps/web/src/app/\(app\)/reports/inventory-turnover/page.tsx
git commit -m "feat(web/p8c): /reports/inventory-turnover → shadcn + 明细 DataTable"
```

---

## Task 7: /reports/purchase-amount 重写

**Files:**
- Modify: `apps/web/src/app/(app)/reports/purchase-amount/page.tsx`

- [ ] **Step 1: 重写 page**

`apps/web/src/app/(app)/reports/purchase-amount/page.tsx`：

```tsx
'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { PageHeader } from '@/components/data/PageHeader';
import { Toolbar } from '@/components/data/Toolbar';
import { KpiCard } from '@/components/reports/KpiCard';
import { ChartCard } from '@/components/reports/ChartCard';
import {
  RangePresetPicker,
  type RangePreset,
} from '@/components/reports/RangePresetPicker';
import { ExportButton } from '@/components/reports/ExportButton';
import { useReportData } from '@/components/reports/useReportData';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PurchaseAmountResponse } from '@app/shared';

const BarChart = dynamic(
  () => import('recharts').then((m) => m.BarChart),
  { ssr: false },
);
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), {
  ssr: false,
});
const ResponsiveContainer = dynamic(
  () => import('recharts').then((m) => m.ResponsiveContainer),
  { ssr: false },
);

type GroupBy = 'month' | 'category' | 'supplier';

export default function PurchaseAmountPage() {
  const [range, setRange] = useState<RangePreset>('365d');
  const [startDate, setStartDate] = useState<string>();
  const [endDate, setEndDate] = useState<string>();
  const [groupBy, setGroupBy] = useState<GroupBy>('month');

  const { data, loading, error } = useReportData<PurchaseAmountResponse>(
    '/reports/purchase-amount',
    { range, startDate, endDate, groupBy },
  );

  const params = new URLSearchParams();
  params.set('range', range);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  params.set('groupBy', groupBy);
  const exportEndpoint = `/reports/purchase-amount?${params}`;

  const groupByLabel: Record<GroupBy, string> =
    { month: '按月', category: '按品类', supplier: '按供应商' };

  return (
    <div data-testid="reports-purchase-amount-page">
      <PageHeader title="采购金额" subtitle="批次金额按维度汇总" />
      <Toolbar
        filters={
          <>
            <Select
              value={groupBy}
              onValueChange={(v) => setGroupBy(v as GroupBy)}
            >
              <SelectTrigger
                className="w-32"
                data-testid="reports-purchase-amount-groupby"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">按月</SelectItem>
                <SelectItem value="category">按品类</SelectItem>
                <SelectItem value="supplier">按供应商</SelectItem>
              </SelectContent>
            </Select>
            <RangePresetPicker
              range={range}
              startDate={startDate}
              endDate={endDate}
              onChange={(n) => {
                setRange(n.range);
                setStartDate(n.startDate);
                setEndDate(n.endDate);
              }}
              testId="reports-purchase-amount-range"
            />
          </>
        }
        actions={
          <ExportButton
            endpoint={exportEndpoint}
            testId="reports-purchase-amount-export"
          />
        }
      />

      <div
        className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3"
        data-testid="reports-purchase-amount-kpis"
      >
        <KpiCard
          label="总采购金额(元)"
          value={data?.summary.totalAmount}
          loading={loading}
          testId="reports-purchase-amount-kpi-total"
        />
        <KpiCard
          label="批次数"
          value={data?.summary.batchCount}
          loading={loading}
          testId="reports-purchase-amount-kpi-batch-count"
        />
        <KpiCard
          label="待入库批次"
          value={data?.summary.pendingBatchCount}
          loading={loading}
          testId="reports-purchase-amount-kpi-pending-batch"
        />
      </div>

      <ChartCard
        title={`采购金额(${groupByLabel[groupBy]})`}
        loading={loading}
        error={error}
        empty={!loading && !error && (data?.series.length ?? 0) === 0}
        testId="reports-purchase-amount-chart"
      >
        {data && (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data.series}>
              <XAxis dataKey="bucket" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="amount" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

- [ ] **Step 3: dev 走查**

http://localhost:3000/reports/purchase-amount：
- 3 KPI、BarChart 渲染
- groupBy 切换（月 / 品类 / 供应商）刷数据 + chart 标题随之变

- [ ] **Step 4: commit**

```bash
git add apps/web/src/app/\(app\)/reports/purchase-amount/page.tsx
git commit -m "feat(web/p8c): /reports/purchase-amount → shadcn + groupBy Select"
```

---

## Task 8: /reports/controlled-audit 重写（含明细 → DataTable）

**Files:**
- Modify: `apps/web/src/app/(app)/reports/controlled-audit/page.tsx`

- [ ] **Step 1: 重写 page**

`apps/web/src/app/(app)/reports/controlled-audit/page.tsx`：

```tsx
'use client';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/data/PageHeader';
import { Toolbar } from '@/components/data/Toolbar';
import { DataTable } from '@/components/data/DataTable';
import { KpiCard } from '@/components/reports/KpiCard';
import {
  RangePresetPicker,
  type RangePreset,
} from '@/components/reports/RangePresetPicker';
import { ExportButton } from '@/components/reports/ExportButton';
import { useReportData } from '@/components/reports/useReportData';
import { Card } from '@/components/ui/card';
import type { ControlledAuditResponse } from '@app/shared';

type Row = ControlledAuditResponse['rows'][number];

const detailColumns: ColumnDef<Row>[] = [
  {
    accessorKey: 'ts',
    header: '时间',
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.ts.slice(0, 19).replace('T', ' ')}
      </span>
    ),
  },
  { accessorKey: 'action', header: '动作' },
  { accessorKey: 'reagentName', header: '试剂' },
  { accessorKey: 'actorName', header: '操作人' },
  {
    accessorKey: 'qty',
    header: '数量',
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.qty}</span>
    ),
  },
  {
    accessorKey: 'beforeQty',
    header: '变更前',
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.beforeQty ?? ''}</span>
    ),
  },
  {
    accessorKey: 'afterQty',
    header: '变更后',
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.afterQty ?? ''}</span>
    ),
  },
];

export default function ControlledAuditPage() {
  const [range, setRange] = useState<RangePreset>('90d');
  const [startDate, setStartDate] = useState<string>();
  const [endDate, setEndDate] = useState<string>();

  const { data, loading, error } = useReportData<ControlledAuditResponse>(
    '/reports/controlled-audit',
    { range, startDate, endDate },
  );

  const params = new URLSearchParams();
  params.set('range', range);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const exportEndpoint = `/reports/controlled-audit?${params}`;

  return (
    <div data-testid="reports-controlled-audit-page">
      <PageHeader title="管控试剂审计" subtitle="管控试剂操作流水" />
      <Toolbar
        filters={
          <RangePresetPicker
            range={range}
            startDate={startDate}
            endDate={endDate}
            onChange={(n) => {
              setRange(n.range);
              setStartDate(n.startDate);
              setEndDate(n.endDate);
            }}
            testId="reports-controlled-audit-range"
          />
        }
        actions={
          <ExportButton
            endpoint={exportEndpoint}
            testId="reports-controlled-audit-export"
          />
        }
      />

      <div
        className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2"
        data-testid="reports-controlled-audit-kpis"
      >
        <KpiCard
          label="审计事件数"
          value={data?.summary.totalEvents}
          loading={loading}
          testId="reports-controlled-audit-kpi-events"
        />
        <KpiCard
          label="操作人数"
          value={data?.summary.distinctActors}
          loading={loading}
          testId="reports-controlled-audit-kpi-actors"
        />
      </div>

      <Card className="p-2">
        <DataTable
          columns={detailColumns}
          data={data?.rows ?? []}
          loading={loading}
          testId="reports-controlled-audit-detail-table"
          emptyTitle="暂无审计记录"
        />
      </Card>

      {error && !loading && (
        <p className="mt-4 text-sm text-destructive">加载失败:{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

- [ ] **Step 3: dev 走查**

http://localhost:3000/reports/controlled-audit：
- 2 KPI Skeleton → 数值
- 明细 DataTable 时间倒序，时间列 mono 字体

- [ ] **Step 4: commit**

```bash
git add apps/web/src/app/\(app\)/reports/controlled-audit/page.tsx
git commit -m "feat(web/p8c): /reports/controlled-audit → shadcn + 明细 DataTable"
```

---

## Task 9: tests/e2e/reports.spec.ts 换 testid

**Files:**
- Modify: `tests/e2e/reports.spec.ts`

- [ ] **Step 1: 重写 reports.spec.ts**

`tests/e2e/reports.spec.ts`：

```ts
import { test, expect } from '@playwright/test';
import { stateFor } from './fixtures/auth';

const SLUGS = [
  ['usage-trend', '领用趋势'],
  ['inventory-turnover', '库存周转'],
  ['purchase-amount', '采购金额'],
  ['controlled-audit', '管控试剂审计'],
] as const;

test.describe('Path 5: SYS_ADMIN visits 4 reports', () => {
  test.use({ storageState: stateFor('admin') });

  for (const [slug, label] of SLUGS) {
    test(`${slug} renders page + KPI`, async ({ page }) => {
      await page.goto(`/reports/${slug}`);
      // page wrapper testid 表示路由+权限通过
      await expect(page.getByTestId(`reports-${slug}-page`)).toBeVisible();
      // 标题文字仍可见(用户可见的页面标题，由 PageHeader 渲染)
      await expect(
        page.getByRole('heading', { name: label }),
      ).toBeVisible();

      // 第一个 KPI value：等 loading 完成（Skeleton 撤掉后 value span 才出现）
      const firstKpi = page
        .locator(`[data-testid^="reports-${slug}-kpi-"][data-testid$="-value"]`)
        .first();
      await expect(firstKpi).toBeVisible({ timeout: 10_000 });
      await expect(firstKpi).toHaveText(/[0-9—.\-]+/);

      if (slug === 'controlled-audit' || slug === 'inventory-turnover') {
        await expect(
          page.getByTestId(`reports-${slug}-detail-table`),
        ).toBeVisible();
      }
    });
  }

  test('export CSV triggers a .csv download', async ({ page }) => {
    await page.goto('/reports/usage-trend');
    // 等 KPI 出来确保数据已加载
    await expect(
      page
        .locator('[data-testid^="reports-usage-trend-kpi-"][data-testid$="-value"]')
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('reports-usage-trend-export').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('reports-usage-trend-export-csv').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });
});

test.describe('Path 6: PLAIN_USER scope hides forbidden tabs', () => {
  test.use({ storageState: stateFor('plain') });

  test('only 领用趋势 link visible in sidebar', async ({ page }) => {
    await page.goto('/reports/usage-trend');
    const sidebar = page.locator('aside');
    await expect(sidebar.getByRole('link', { name: '领用趋势' })).toBeVisible();
    for (const label of ['库存周转', '采购金额', '管控审计']) {
      await expect(sidebar.getByRole('link', { name: label })).toHaveCount(0);
    }
  });
});
```

> 注：`<aside>` 与 sidebar 4 个 link 文字保持，是 P8c 设计稿"保持"项。

- [ ] **Step 2: 验证 spec syntax（不跑实际 e2e，docker 复测留给用户）**

```bash
pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json 2>/dev/null || pnpm exec tsc --noEmit tests/e2e/reports.spec.ts --skipLibCheck --moduleResolution node --target es2020 --esModuleInterop
```

如果 tests/e2e 没有独立 tsconfig，跳过 typecheck，相信 Playwright 的 `pnpm test:e2e` 能解析。改用：

```bash
pnpm exec playwright test --list -g "Path 5"
```

预期：能列出 4 个 SLUGS test + 1 个 export test，无解析错误。

- [ ] **Step 3: commit**

```bash
git add tests/e2e/reports.spec.ts
git commit -m "test(p8c): reports.spec.ts → getByTestId migration"
```

---

## Task 10: tests/e2e/workflows.spec.ts 换 testid + 多页 testid + FormDialog/ConfirmDialog testId 透传

本 task 体量大，按 step 分多次 commit 避免单 commit 过大。

**Files:**
- Modify: `apps/web/src/components/data/FormDialog.tsx`
- Modify: `apps/web/src/components/data/ConfirmDialog.tsx`
- Modify: `apps/web/src/app/(public)/login/page.tsx`
- Modify: `apps/web/src/app/(app)/my/requests/page.tsx`
- Modify: `apps/web/src/app/(app)/approvals/page.tsx`
- Modify: `apps/web/src/app/(app)/admin/issues/page.tsx`
- Modify: `apps/web/src/app/(app)/admin/purchases/page.tsx`
- Modify: `tests/e2e/workflows.spec.ts`

### Task 10.1: FormDialog / ConfirmDialog 增 testId 透传

- [ ] **Step 1: FormDialog testId 透传**

修改 `apps/web/src/components/data/FormDialog.tsx`：在 `FormDialogProps` 接口加 `testId?: string`，在 `<DialogContent>` 加 `data-testid={testId}`，在 submit `<Button type="submit">` 加 `data-testid={testId ? testId+'-submit' : undefined}`，在 cancel Button 加 `data-testid={testId ? testId+'-cancel' : undefined}`。

完整新文件：

```tsx
'use client';
import * as React from 'react';
import { useForm, type UseFormReturn, type DefaultValues, type Resolver } from 'react-hook-form';
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
  testId?: string;
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
  testId,
  fields,
}: FormDialogProps<S>) {
  const form = useForm<z.infer<S>>({
    resolver: zodResolver(schema) as unknown as Resolver<z.infer<S>>,
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
      <DialogContent className="sm:max-w-md" data-testid={testId}>
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
                data-testid={testId ? testId + '-cancel' : undefined}
              >
                {cancelLabel}
              </Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                data-testid={testId ? testId + '-submit' : undefined}
              >
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

- [ ] **Step 2: ConfirmDialog testId 透传**

修改 `apps/web/src/components/data/ConfirmDialog.tsx`：

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
  testId?: string;
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
  testId,
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
      <AlertDialogContent data-testid={testId}>
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
            data-testid={testId ? testId + '-cancel' : undefined}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={pending}
            data-testid={testId ? testId + '-confirm' : undefined}
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

- [ ] **Step 3: 跑现有单测确认未破坏**

```bash
pnpm -F @app/web test -- FormDialog ConfirmDialog
```

预期：P8b 已有的 5 个用例全绿（`testId` 是 optional，不影响现有断言）。

- [ ] **Step 4: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

- [ ] **Step 5: commit**

```bash
git add apps/web/src/components/data/FormDialog.tsx apps/web/src/components/data/ConfirmDialog.tsx
git commit -m "feat(web/p8c): FormDialog/ConfirmDialog → testId prop forwarding"
```

### Task 10.2: 给 login + my/requests + approvals + admin/issues + admin/purchases 补 testid

- [ ] **Step 1: login page 加 testid**

修改 `apps/web/src/app/(public)/login/page.tsx`：在 email Input 加 `data-testid="login-email"`，password Input 加 `data-testid="login-password"`，submit Button 加 `data-testid="login-submit"`。

定位字段渲染段落，把:

```tsx
                    <FormControl>
                      <Input type="email" autoComplete="username" {...field} />
                    </FormControl>
```

改为:

```tsx
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="username"
                        data-testid="login-email"
                        {...field}
                      />
                    </FormControl>
```

password Input 同理：

```tsx
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        data-testid="login-password"
                        {...field}
                      />
                    </FormControl>
```

submit Button：

```tsx
              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
                data-testid="login-submit"
              >
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                登录
              </Button>
```

- [ ] **Step 2: my/requests page 加 testid**

修改 `apps/web/src/app/(app)/my/requests/page.tsx`：

外层 div 加 testid（在 return 第一行）：
```tsx
return (
  <div data-testid="my-requests-page">
```

新申请按钮：
```tsx
        actions={
          <Button
            onClick={() => setFormOpen(true)}
            data-testid="my-requests-add"
          >
            <Plus className="mr-2 h-4 w-4" /> 新申请
          </Button>
        }
```

DataTable testId 已是 `my-requests-table`，保持。

FormDialog 加 testId：
```tsx
      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        schema={schema}
        defaultValues={defaultValues}
        title="新建领用申请"
        description="管控试剂用途需 ≥50 字，项目号、使用地点必填"
        testId="my-requests-form"
        onSubmit={async (values) => {
          ...
```

reagent SelectTrigger 加 testid（在 fields 内）：
```tsx
                      <FormControl>
                        <SelectTrigger data-testid="my-requests-form-reagent">
                          <SelectValue placeholder="选择试剂" />
                        </SelectTrigger>
                      </FormControl>
```

stock SelectTrigger：
```tsx
                      <FormControl>
                        <SelectTrigger data-testid="my-requests-form-stock">
                          <SelectValue placeholder="选择批次" />
                        </SelectTrigger>
                      </FormControl>
```

quantity Input：
```tsx
                      <FormControl>
                        <Input data-testid="my-requests-form-qty" {...field} />
                      </FormControl>
```

purpose Textarea：
```tsx
                      <FormControl>
                        <Textarea
                          rows={3}
                          data-testid="my-requests-form-purpose"
                          {...field}
                        />
                      </FormControl>
```

projectRef Input：
```tsx
                      <FormControl>
                        <Input
                          data-testid="my-requests-form-project"
                          {...field}
                        />
                      </FormControl>
```

useLocation Input：
```tsx
                      <FormControl>
                        <Input
                          data-testid="my-requests-form-location"
                          {...field}
                        />
                      </FormControl>
```

ConfirmDialog 加 testId：
```tsx
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title="取消申请"
        description={`确认取消"${cancelling?.reagent.name}"的申请？`}
        confirmLabel="确认取消"
        testId="my-requests-cancel"
        onConfirm={async () => {
          ...
```

reagent Select 中给每个 SelectItem 加 controlled marker，e2e 用来过滤非管控试剂：

```tsx
                      <SelectContent>
                        {reagents.map((r) => {
                          const ctrl = r.hazardLevel === 'CONTROLLED' || !!r.controlType;
                          return (
                            <SelectItem
                              key={r.id}
                              value={r.id}
                              data-controlled={ctrl ? 'true' : 'false'}
                            >
                              {r.name}
                              {ctrl ? '（管控）' : ''}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
```

- [ ] **Step 3: approvals page 补全 5 个 testid**

修改 `apps/web/src/app/(app)/approvals/page.tsx`：

外层 div：
```tsx
  return (
    <div data-testid="approvals-page">
```

`approvals-list` 已有，保留。

把 `<li key={r.id} data-testid="approval-row">` 改为唯一 id：
```tsx
                <li key={r.id} data-testid={`approvals-item-${r.id}`}>
```

5 个按钮加 testid（`approval-approve-l1` 已有，扩展为按 id 区分以支持多行）：

```tsx
                          <Button
                            data-testid={`approvals-tier1-approve-${r.id}`}
                            size="sm"
                            onClick={() => decide(r.id, 'APPROVE', 1)}
                          >
                            一审通过
                          </Button>
                          <Button
                            data-testid={`approvals-tier1-reject-${r.id}`}
                            size="sm"
                            variant="destructive"
                            onClick={() => decide(r.id, 'REJECT', 1)}
                          >
                            一审拒绝
                          </Button>
                          {ctrl && (
                            <>
                              <Button
                                data-testid={`approvals-tier2-approve-${r.id}`}
                                size="sm"
                                onClick={() => decide(r.id, 'APPROVE', 2)}
                              >
                                二审通过
                              </Button>
                              <Button
                                data-testid={`approvals-tier2-reject-${r.id}`}
                                size="sm"
                                variant="destructive"
                                onClick={() => decide(r.id, 'REJECT', 2)}
                              >
                                二审拒绝
                              </Button>
                            </>
                          )}
```

> 删掉旧的 `data-testid="approval-approve-l1"` —— 那是 P8b 留下的占位，现在被 `approvals-tier1-approve-{id}` 取代。

注释 textarea 也加 testid：
```tsx
                        <Textarea
                          className="w-64"
                          rows={2}
                          placeholder="批注（可选，拒绝时作为原因）"
                          value={commentById[r.id] ?? ''}
                          onChange={(e) =>
                            setCommentById((m) => ({ ...m, [r.id]: e.target.value }))
                          }
                          data-testid={`approvals-comment-${r.id}`}
                        />
```

- [ ] **Step 4: admin/issues page 补 testid**

修改 `apps/web/src/app/(app)/admin/issues/page.tsx`：

外层 div：
```tsx
  return (
    <div data-testid="admin-issues-page">
```

`<ul className="mb-6 space-y-3" data-testid="issues-pending">` 已有，保留并改名规范化：
```tsx
        <ul className="mb-6 space-y-3" data-testid="admin-issues-pending">
```

每行 `<li>` 加 id：
```tsx
              <li key={r.id} data-testid={`admin-issues-row-${r.id}`}>
```

实际量 Input 加 testid（在 issue 行内）：
```tsx
                      <Input
                        className="w-32"
                        placeholder={`实际量 (${r.unit})`}
                        value={qtyById[r.id] ?? ''}
                        onChange={(e) =>
                          setQtyById((m) => ({ ...m, [r.id]: e.target.value }))
                        }
                        data-testid={`admin-issues-row-${r.id}-qty`}
                      />
```

发放 Button：
```tsx
                      {!ctrl && (
                        <Button
                          size="sm"
                          onClick={() => issue(r)}
                          data-testid={`admin-issues-row-${r.id}-issue`}
                        >
                          发放
                        </Button>
                      )}
```

历史 DataTable 已有 testid（之前 P8b 用的是 `issues-history-table` 或类似）。统一改名：在 `<DataTable testId="...">` 处确认/改成 `admin-issues-history-table`。如未设，加上：

```tsx
        <DataTable
          columns={issuedColumns}
          data={ledger}
          loading={loading}
          testId="admin-issues-history-table"
          emptyTitle="暂无发放记录"
        />
```

- [ ] **Step 5: admin/purchases page 补 testid**

修改 `apps/web/src/app/(app)/admin/purchases/page.tsx`：

外层 div：
```tsx
  return (
    <div data-testid="admin-purchases-page">
```

merge Button 已经有 disabled 逻辑，加 testid：
```tsx
        actions={
          <Button
            disabled={picked.size === 0}
            onClick={merge}
            data-testid="admin-purchases-merge"
          >
            ...
          </Button>
        }
```

> 注：admin/purchases 内现有"待合并采购申请"和"批次"两个 heading 已经被 e2e workflows.spec.ts Path 4 用 `getByRole('heading', { name: '待合并采购申请' })` 锁定，本次迁移移到 testid 后这些 heading 可保留文字（无人锁）。

- [ ] **Step 6: 跑全套单测确认未破坏**

```bash
pnpm -F @app/web test
```

预期：所有用例全绿（之前 32 + 本期新增 16 = 48）。

- [ ] **Step 7: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

- [ ] **Step 8: commit**

```bash
git add apps/web/src/app/\(public\)/login/page.tsx \
  apps/web/src/app/\(app\)/my/requests/page.tsx \
  apps/web/src/app/\(app\)/approvals/page.tsx \
  apps/web/src/app/\(app\)/admin/issues/page.tsx \
  apps/web/src/app/\(app\)/admin/purchases/page.tsx
git commit -m "feat(web/p8c): add data-testid attributes for e2e workflows.spec migration"
```

### Task 10.3: 重写 workflows.spec.ts

- [ ] **Step 1: 重写 spec**

`tests/e2e/workflows.spec.ts`：

```ts
import { test, expect } from '@playwright/test';
import { stateFor } from './fixtures/auth';

// Storage state is pre-warmed by tests/e2e/global-setup.ts so all spec files
// can read .auth/<role>.json synchronously at worker init.

// Path 1 lives at /my/requests. Form is FormDialog with testid 'my-requests-form'.
// Stock options only exist after admin has done a purchase + receipt; if seed
// has no stocks the test self-skips.
test.describe('Path 1: PLAIN_USER apply for reagent', () => {
  test.use({ storageState: stateFor('plain') });

  test('select reagent + stock → submit → row in PENDING', async ({ page }) => {
    await page.goto('/my/requests');
    await expect(page.getByTestId('my-requests-page')).toBeVisible();

    await page.getByTestId('my-requests-add').click();
    const dialog = page.getByTestId('my-requests-form');
    await expect(dialog).toBeVisible();

    // 打开 reagent select
    await dialog.getByTestId('my-requests-form-reagent').click();
    const nonControlled = page.locator('[role="option"][data-controlled="false"]');
    const ncCount = await nonControlled.count();
    test.skip(ncCount === 0, 'no non-controlled reagent seeded');
    await nonControlled.first().click();

    // 打开 stock select
    await dialog.getByTestId('my-requests-form-stock').click();
    const stockOptions = page.locator('[role="option"]');
    const stockCount = await stockOptions.count();
    test.skip(stockCount === 0, 'reagent has no stock; need admin receipt first');
    await stockOptions.first().click();

    await dialog.getByTestId('my-requests-form-qty').fill('1');
    await dialog.getByTestId('my-requests-form-purpose').fill('e2e test purpose');
    await dialog.getByTestId('my-requests-form-submit').click();

    // FormDialog onSubmit 成功后 caller 调 setFormOpen(false)
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // 表里出现 PENDING 行
    await expect(
      page
        .getByTestId('my-requests-table')
        .locator('tbody tr')
        .filter({ hasText: 'PENDING' })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// Path 2 lives at /approvals. Buttons read 一审通过/一审拒绝 (and 二审 for
// controlled). Approving a row removes it from the PENDING-only list, so we
// assert the count drops rather than searching for "APPROVED" text.
test.describe('Path 2: LAB_HEAD approve', () => {
  test.use({ storageState: stateFor('labhead') });

  test('approve newest pending', async ({ page }) => {
    await page.goto('/approvals');
    await expect(page.getByTestId('approvals-page')).toBeVisible();

    const items = page.locator('[data-testid^="approvals-item-"]');
    const before = await items.count();
    test.skip(before === 0, 'no pending requests');

    await page.locator('[data-testid^="approvals-tier1-approve-"]').first().click();
    await expect(items).toHaveCount(before - 1, { timeout: 10_000 });
  });
});

// Path 3 lives at /admin/issues. Pending list uses <li data-testid='admin-issues-row-{id}'>;
// 实际量 input + 发放 button per row.
test.describe('Path 3: REAGENT_ADMIN issue → ledger updates', () => {
  test.use({ storageState: stateFor('admin') });

  test('issue → row moves to ledger', async ({ page }) => {
    await page.goto('/admin/issues');
    await expect(page.getByTestId('admin-issues-page')).toBeVisible();

    const pendingRows = page.locator('[data-testid^="admin-issues-row-"]');
    const ledger = page.getByTestId('admin-issues-history-table').locator('tbody tr');
    const pendingBefore = await pendingRows.count();
    test.skip(pendingBefore === 0, 'no APPROVED requests to issue');

    const ledgerBefore = await ledger.count();
    const firstRow = pendingRows.first();
    // 取该行的 id（从 testid 解析）
    const testid = await firstRow.getAttribute('data-testid');
    const id = testid!.replace('admin-issues-row-', '');

    await firstRow.locator(`[data-testid="admin-issues-row-${id}-qty"]`).fill('1');
    await firstRow.locator(`[data-testid="admin-issues-row-${id}-issue"]`).click();

    await expect(ledger).toHaveCount(ledgerBefore + 1, { timeout: 10_000 });
  });
});

// Path 4: admin purchase loop is split across /my/purchases (apply),
// /admin/purchases (merge → receipt), /approvals/purchases (approve batch).
// Smoke admin pages render only.
test.describe('Path 4: REAGENT_ADMIN purchase admin pages render', () => {
  test.use({ storageState: stateFor('admin') });

  test('/admin/purchases shows merge button + page wrapper', async ({ page }) => {
    await page.goto('/admin/purchases');
    await expect(page.getByTestId('admin-purchases-page')).toBeVisible();
    // merge button exists (disabled if nothing picked)
    await expect(page.getByTestId('admin-purchases-merge')).toBeVisible();
  });
});
```

- [ ] **Step 2: 验证 spec 解析**

```bash
pnpm exec playwright test --list -g "Path"
```

预期：列出 4 个 describe 各 1 test，无解析错误。

- [ ] **Step 3: typecheck（如 tests/e2e 有独立 tsconfig）**

```bash
pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json 2>/dev/null || true
```

如果失败，跳过；Playwright 自带 ts 解析。

- [ ] **Step 4: commit**

```bash
git add tests/e2e/workflows.spec.ts
git commit -m "test(p8c): workflows.spec.ts → getByTestId migration (4 paths)"
```

---

## Task 11a: apps/api 补 POST /users/:id/reset-password

**Files:**
- Modify: `apps/api/src/users/users.controller.ts`
- Modify: `apps/api/src/users/users.service.ts`

- [ ] **Step 1: users.service 增 resetPassword 方法**

修改 `apps/api/src/users/users.service.ts`，在 `softDelete` 方法之后、`resolveRoles` 之前增加：

```ts
  async resetPassword(id: string): Promise<{ tempPassword: string }> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw new NotFoundException();
    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
    return { tempPassword };
  }

  private generateTempPassword(): string {
    // 8 位：4 字母 + 4 数字，排除易混字符（O/0/I/1）
    const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    const pickN = (src: string, n: number) =>
      Array.from({ length: n }, () =>
        src[Math.floor(Math.random() * src.length)],
      ).join('');
    return pickN(letters, 4) + pickN(digits, 4);
  }
```

- [ ] **Step 2: users.controller 增 endpoint**

修改 `apps/api/src/users/users.controller.ts`：在 `import` 块加 `Post` 已有则保留，import 加 `HttpCode`（如未引入）：

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
```

在 `remove` 方法之后加：

```ts
  @Post(':id/reset-password')
  @HttpCode(200)
  @Audit({ action: 'USER_RESET_PASSWORD', entityType: 'User' })
  resetPassword(@Param('id') id: string) {
    return this.users.resetPassword(id);
  }
```

完整 controller：

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@Roles('SYS_ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  @Audit({ action: 'USER_CREATE', entityType: 'User' })
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  @Audit({ action: 'USER_UPDATE', entityType: 'User' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Delete(':id')
  @Audit({ action: 'USER_DELETE', entityType: 'User' })
  remove(@Param('id') id: string) {
    return this.users.softDelete(id);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @Audit({ action: 'USER_RESET_PASSWORD', entityType: 'User' })
  resetPassword(@Param('id') id: string) {
    return this.users.resetPassword(id);
  }
}
```

- [ ] **Step 3: typecheck apps/api**

```bash
pnpm -F @app/api exec tsc --noEmit
```

预期：0 错。

- [ ] **Step 4: 跑 api 单测**

```bash
pnpm -F @app/api test 2>/dev/null || pnpm -F @app/api exec jest --passWithNoTests
```

预期：通过（如果 api 没有 users 单测，跳过即可）。

- [ ] **Step 5: 手动 smoke（可选，dev 已起即测）**

```bash
# dev:api 起着的话:
curl -X POST http://localhost:3001/api/v1/users/{some-id}/reset-password \
  -H "Authorization: Bearer <admin-token>"
```

预期返回 `{"tempPassword":"xxxx0000"}`。

- [ ] **Step 6: commit**

```bash
git add apps/api/src/users/users.controller.ts apps/api/src/users/users.service.ts
git commit -m "feat(api/p8c): POST /users/:id/reset-password (8-char temp + bcrypt)"
```

---

## Task 11b: /admin/users 启用编辑 + 重置密码

**Files:**
- Modify: `apps/web/src/app/(app)/admin/users/page.tsx`

- [ ] **Step 1: 重写 page**

`apps/web/src/app/(app)/admin/users/page.tsx`：

```tsx
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
import { Checkbox } from '@/components/ui/checkbox';
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
```

> 说明：
> - 编辑角色用 shadcn `Checkbox`（基于 Radix `@radix-ui/react-checkbox`，P8b 已 add `ui/checkbox.tsx`）；外层 `<label>` 隐式关联，浏览器会把 click 转发到 Radix 渲染的 `<button>`；`onCheckedChange` 回调值类型 `boolean | 'indeterminate'`，按 `=== true` 严格判断
> - 临时密码 `toast.success(..., { duration: 30_000 })` 显示 30s 让管理员有时间复制
> - "实验室 ID 留空" 走 `labId: '' → undefined`，后端 service 已处理

- [ ] **Step 2: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

- [ ] **Step 3: dev 走查**

http://localhost:3000/admin/users：
- 编辑：DropdownMenu 不再 disabled，点击 → dialog 弹出 → 改名/角色 → 保存 → 表刷新 toast 已更新
- 重置密码：confirm dialog → 确认 → toast 显示临时密码（30s）
- 失败路径：编辑空 name → FormMessage 红字；后端故障 → toast.error，dialog 保持

- [ ] **Step 4: commit**

```bash
git add apps/web/src/app/\(app\)/admin/users/page.tsx
git commit -m "feat(web/p8c): /admin/users → enable edit (PATCH) + reset password (POST)"
```

---

## Task 12: 验收

**Files:** 无文件修改；纯运行验收命令。

- [ ] **Step 1: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
pnpm -F @app/api exec tsc --noEmit
```

预期：两边 0 错。

- [ ] **Step 2: 单测全套**

```bash
pnpm -F @app/web test
```

预期：用例数 ≥ 42（P8b 32 + 本期新增 10 = 42 起步；考虑 RangePresetPicker 4、ExportButton 3、KpiCard 5、ChartCard 4 共 16，实际应≥48）。全绿。

如果用例数不够 42，找补缺：检查 KpiCard.test/ChartCard.test/RangePresetPicker.test/ExportButton.test 是否都被发现。跑 `pnpm -F @app/web test --reporter=verbose 2>&1 | head -60` 看清楚。

- [ ] **Step 3: build**

```bash
rm -rf apps/web/.next
pnpm -F @app/web build
```

预期：22 routes 全 OK；末尾 First Load JS shared 行 ≤ 92.3 kB（P8b 87.3 kB + 5 KB 容差）。reports 路由 chunk 不显著回归。

如遇 ENOENT `.next/build-manifest.json` 在 Windows 偶发：`rm -rf apps/web/.next && pnpm -F @app/web build` 重试。

- [ ] **Step 4: 手动视觉走查（dev 模式 + 桌面 1280px + 375px + light/dark）**

启动 dev：

```bash
pnpm -F @app/web dev
```

按以下清单逐项核对（每项 OK 才打勾）：

桌面 1280px：
- [ ] /reports/usage-trend：3 KPI Skeleton → 数值；preset Select 切换刷数据；groupBy 切日/周/月；导出 ▾ → CSV 触发下载；range='custom' Calendar 双月，选 from-to 后自动收起
- [ ] /reports/inventory-turnover：2 KPI；BarChart Top 10；明细 DataTable 状态 Badge 着色
- [ ] /reports/purchase-amount：3 KPI；BarChart；groupBy 切月/品类/供应商，chart 标题随之变
- [ ] /reports/controlled-audit：2 KPI；明细 DataTable 时间倒序 mono
- [ ] /admin/users：编辑 dialog 提交 → 表刷新；重置密码 confirm → toast 显示临时密码 30s

375px (Chrome devtools)：
- [ ] /reports/* 4 页 Toolbar 自动换行 / 滚动；Calendar 双月在 375 仍可用（如太宽 fallback 单月）
- [ ] /admin/users dialog 占满宽度

light/dark 切换：
- [ ] 所有 reports/* 4 页：dark 模式 Card 背景、KPI value 颜色、ChartCard ErrorState 图标、明细 DataTable Badge 都正常
- [ ] /admin/users edit dialog dark 正常

- [ ] **Step 5: 整理 commit history**

```bash
git log --oneline | head -15
```

预期：从 `437563b`（P8b HEAD）后约 13-14 个 P8c commit（按 task 切）：
- task 1 (RangePresetPicker)
- task 2 (ExportButton)
- task 3 (KpiCard)
- task 4 (ChartCard)
- task 5-8 (4 pages)
- task 9 (reports.spec)
- task 10.1 (FormDialog/ConfirmDialog testId)
- task 10.2 (page testid)
- task 10.3 (workflows.spec)
- task 11a (api reset-password)
- task 11b (admin/users edit + reset)

- [ ] **Step 6: 写 memory + 不打 tag**

不直接 `git tag p8c-complete` —— 等用户外部 docker 跑完 e2e 复测后再决定打 tag。

写 memory：在 `C:\Users\songyihui\.claude\projects\D--Project-0417-any-demo\memory\project_p8c_status.md` 记下：

- HEAD commit hash
- vitest 用例总数 / tsc 0 / build shared kB
- 4 个 reports/* 走查 OK
- /admin/users 走查 OK
- e2e 待 docker 复测

更新 `MEMORY.md` 索引加一行指向新 status 文件。

- [ ] **Step 7: 总结输出**

输出给用户：

```
P8c 工程验收完成：
- vitest 用例 X 个全绿
- tsc 0 错
- next build 22 routes OK，shared X kB（基线 87.3 kB）
- 4 reports/* 页 + /admin/users 桌面 + 375 + light/dark 走查通过
- e2e workflows.spec.ts + reports.spec.ts 已迁移 testid，待 docker 跑 pnpm test:e2e 确认 8 pass / 3 self-skip / 0 fail
- 未打 p8c-complete tag，待 e2e 复测后再决定
```

---

## 备注与陷阱

### react-day-picker v10 ClassNames

P8b 已发现：shadcn 模板生成的 `apps/web/src/components/ui/calendar.tsx` 默认含 `table: "w-full border-collapse"` 一行，但 react-day-picker v10 的 `ClassNames` 类型已删该字段，需手动删该行。本 plan 中 P8c 不重新 shadcn add calendar，复用 P8b 已修过的 calendar.tsx。

### Windows next build ENOENT 偶发

`rm -rf apps/web/.next && pnpm -F @app/web build` 重试即可。不要并行 vitest + tsc + build。

### Radix Select 在 jsdom 的 click

如 RangePresetPicker / SelectTrigger 单测 `fireEvent.click` 不弹出 menu，改用 `userEvent.setup({ pointerEventsCheck: 0 })` 然后 `await user.click(...)`。Task 1 与 Task 2 的测试已使用此 fallback。

### sonner toast mock

vitest 跑组件单测时 sonner 用 vi.mock 替换 `toast.error / toast.success`：

```ts
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
```

### URL.createObjectURL in jsdom

jsdom 不实现 `URL.createObjectURL`，测 ExportButton fetch + download 链路时手动注入：

```ts
(URL as any).createObjectURL = vi.fn(() => 'blob:mock');
(URL as any).revokeObjectURL = vi.fn();
```

### testid 命名一致性自检

完成 Task 5-8 后用 grep 确认 4 reports/* 页 testid 总数 ≥ 25：

```bash
grep -c 'data-testid="reports-' apps/web/src/app/\(app\)/reports/*/page.tsx
```

若某页 testid 数明显少（<5），可能漏写。

### apps/api Audit 装饰器

`@Audit({ action: 'USER_RESET_PASSWORD', entityType: 'User' })` 复用现有 audit decorator 即可，actor 由 controller scope 自动取（参考 `USER_UPDATE`）。如果 audit 表的 `action` 字段是 enum，需要先在 prisma schema 加 `USER_RESET_PASSWORD`：

```bash
grep "USER_UPDATE\|USER_DELETE" apps/api/prisma/schema.prisma
```

如果是 enum，task 11a 加 1 step：编辑 schema、`pnpm -F @app/api exec prisma generate`、跑 `pnpm db:push` 或在 dev 数据库迁移。如果 audit 表是 free-form string，跳过。

---

## 不在本期范围

- 报表 KPI delta% / trend 数据源（API 增字段）
- ChartCard 内图表组件抽象（Line/Bar 各 page 自己 dynamic import）
- e2e miniapp-h5.spec.ts 不动（Taro h5）
- 报表数据缓存层（SWR / RTK）
- /admin/users 之外的 admin disabled 项（确认已无）
- 新业务功能 / 改 reports API
- auth-store / api-client / nav / RequireAuth / NotificationBell

---

## 与 P8a/P8b 兼容约束（本期解锁与保持）

| 旧契约 | P8c 状态 |
|---|---|
| `/approvals` `<h1>` 文字"待我审批" | 解锁（用 `approvals-page` testid） |
| `/approvals` `<main>` 内 `<ul> > <li>` 结构 | 解锁（用 `approvals-item-{id}` testid） |
| `/approvals` 4 个按钮文字精确 | 解锁（用 testid，文字保持中文不变） |
| Sidebar 根节点 `<aside>` 标签 | 保持（HTML 语义化） |
| 报表 4 个标签文字"领用趋势/库存周转/采购金额/管控审计" | 保持（用户可见标题） |
