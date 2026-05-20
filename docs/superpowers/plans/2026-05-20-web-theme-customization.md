# Web 主题色板自定义 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `apps/web` 顶栏新增独立 PaletteSwitcher，提供 6 套调色盘（Emerald / Indigo / Sky / Violet / Slate / Rose）× light/dark = 12 套 CSS 变量集合；选择持久化到 localStorage；零后端改动；SSR 阶段 inline script 防 FOUC。

**Architecture:** 双维度正交——`next-themes` 在 `<html>` 上挂 `class="light|dark"`（已实现，不动），新增 `PaletteProvider` 在 `<html>` 上挂 `data-palette="<key>"`；`globals.css` 用 `[data-palette="<key>"]` 选择器覆盖 `--primary` / `--primary-foreground` / `--ring` 三 token。Tailwind 配置零改动。

**Tech Stack:** Next.js 14 App Router + next-themes 0.4 + shadcn/ui Popover + Tailwind CSS 3.4 + vitest 1.4 + @testing-library/react 16。

**Spec:** `docs/superpowers/specs/2026-05-20-web-theme-customization-design.md`

---

## File Structure

- Create: `apps/web/src/lib/palettes.ts` — 单一数据源：6 个 PaletteKey + 元数据 + 默认值 + storage key + `isValidPalette` 校验
- Create: `apps/web/src/lib/__tests__/palettes.test.ts` — palettes.ts 单元测试
- Create: `apps/web/src/lib/palette-script.ts` — 拼装防 FOUC inline script（从 palettes.ts 推导，避免重复白名单）
- Create: `apps/web/src/components/palette-provider.tsx` — React Context + Provider + `usePalette` hook
- Create: `apps/web/src/components/__tests__/palette-provider.test.tsx` — Provider 状态/持久化测试
- Create: `apps/web/src/components/shell/PaletteSwitcher.tsx` — TopBar 上的 Popover 切换器
- Create: `apps/web/src/components/shell/__tests__/PaletteSwitcher.test.tsx` — Switcher 渲染/交互测试
- Modify: `apps/web/src/app/globals.css` — 追加 12 套 CSS 变量集合
- Modify: `apps/web/src/app/layout.tsx` — `<head>` 加 inline script、包 `<PaletteProvider>`
- Modify: `apps/web/src/components/shell/TopBar.tsx` — 在 `NotificationBell` 和 `ThemeToggle` 之间加 `<PaletteSwitcher />`

---

## 全局约定

**testid 命名表**（贯穿全部 task）：

| 用途 | testid |
|---|---|
| 顶栏调色盘按钮 | `palette-switcher` |
| 单个色板选项（6 个） | `palette-option-emerald` / `-indigo` / `-sky` / `-violet` / `-slate` / `-rose` |

**localStorage key**：`lab-palette`（与 next-themes 默认 `theme` key 隔离）

**默认色板**：`emerald`（与现状 `--primary: 158 64% 40%` 完全对齐，零视觉变更）

**类型导出**：所有 PaletteKey 字面量类型源自 `apps/web/src/lib/palettes.ts:PALETTE_KEYS`，不要硬编码字符串数组到其它文件。

---

## Task 1: palettes.ts 数据源 + 单元测试

新建 `palettes.ts` 作为全局单一数据源，并写 4 个纯函数级单测。这是后续所有 task 的底座。

**Files:**
- Create: `apps/web/src/lib/palettes.ts`
- Create: `apps/web/src/lib/__tests__/palettes.test.ts`

- [ ] **Step 1.1: 写失败测试**

新建 `apps/web/src/lib/__tests__/palettes.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  PALETTE_KEYS,
  PALETTES,
  DEFAULT_PALETTE,
  PALETTE_STORAGE_KEY,
  isValidPalette,
} from '../palettes';

describe('palettes 数据源', () => {
  it('提供 6 个 PaletteKey', () => {
    expect(PALETTE_KEYS).toEqual([
      'emerald',
      'indigo',
      'sky',
      'violet',
      'slate',
      'rose',
    ]);
  });

  it('PALETTES 元数据每条都有 key/label/swatch 三字段且 key 覆盖 PALETTE_KEYS', () => {
    expect(PALETTES).toHaveLength(PALETTE_KEYS.length);
    for (const p of PALETTES) {
      expect(PALETTE_KEYS).toContain(p.key);
      expect(typeof p.label).toBe('string');
      expect(p.label.length).toBeGreaterThan(0);
      expect(typeof p.swatch).toBe('string');
      expect(p.swatch.startsWith('hsl(')).toBe(true);
    }
  });

  it('DEFAULT_PALETTE = emerald 且 STORAGE_KEY 固定', () => {
    expect(DEFAULT_PALETTE).toBe('emerald');
    expect(PALETTE_STORAGE_KEY).toBe('lab-palette');
  });

  it('isValidPalette 白名单：合法 key true，其它 false', () => {
    expect(isValidPalette('emerald')).toBe(true);
    expect(isValidPalette('rose')).toBe(true);
    expect(isValidPalette('teal')).toBe(false);
    expect(isValidPalette('')).toBe(false);
    expect(isValidPalette(null)).toBe(false);
    expect(isValidPalette(undefined)).toBe(false);
    expect(isValidPalette(42)).toBe(false);
    expect(isValidPalette({})).toBe(false);
  });
});
```

- [ ] **Step 1.2: 运行测试，验证失败**

Run: `pnpm --filter @app/web test -- src/lib/__tests__/palettes.test.ts`
Expected: FAIL，错误信息含 `Cannot find module '../palettes'`。

- [ ] **Step 1.3: 实现 palettes.ts**

新建 `apps/web/src/lib/palettes.ts`：

```ts
export const PALETTE_KEYS = [
  'emerald',
  'indigo',
  'sky',
  'violet',
  'slate',
  'rose',
] as const;

export type PaletteKey = (typeof PALETTE_KEYS)[number];

export const DEFAULT_PALETTE: PaletteKey = 'emerald';

export const PALETTE_STORAGE_KEY = 'lab-palette';

export const PALETTES: Array<{
  key: PaletteKey;
  label: string;
  swatch: string;
}> = [
  { key: 'emerald', label: '翠绿', swatch: 'hsl(158 64% 40%)' },
  { key: 'indigo', label: '靛蓝', swatch: 'hsl(239 84% 56%)' },
  { key: 'sky', label: '天蓝', swatch: 'hsl(199 89% 41%)' },
  { key: 'violet', label: '紫罗兰', swatch: 'hsl(262 83% 58%)' },
  { key: 'slate', label: '石板', swatch: 'hsl(222 47% 11%)' },
  { key: 'rose', label: '玫红', swatch: 'hsl(346 77% 50%)' },
];

export function isValidPalette(v: unknown): v is PaletteKey {
  return (
    typeof v === 'string' &&
    (PALETTE_KEYS as readonly string[]).includes(v)
  );
}
```

- [ ] **Step 1.4: 重跑测试，验证通过**

Run: `pnpm --filter @app/web test -- src/lib/__tests__/palettes.test.ts`
Expected: 4 passed。

- [ ] **Step 1.5: Commit**

```bash
git add apps/web/src/lib/palettes.ts apps/web/src/lib/__tests__/palettes.test.ts
git commit -m "feat(web): palettes.ts 单一数据源 (6 套调色盘 + isValidPalette 白名单)"
```

---

## Task 2: PaletteProvider + 单元测试

实现 React Context Provider，负责：mount 时从 localStorage 恢复、`setPalette` 同步写 LS + `document.documentElement.dataset.palette`，包 try/catch 兼容隐私模式。

**Files:**
- Create: `apps/web/src/components/palette-provider.tsx`
- Create: `apps/web/src/components/__tests__/palette-provider.test.tsx`

- [ ] **Step 2.1: 写失败测试**

新建 `apps/web/src/components/__tests__/palette-provider.test.tsx`：

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PaletteProvider,
  usePalette,
} from '../palette-provider';
import {
  DEFAULT_PALETTE,
  PALETTE_STORAGE_KEY,
} from '@/lib/palettes';

function Probe() {
  const { palette, setPalette } = usePalette();
  return (
    <div>
      <span data-testid="probe-current">{palette}</span>
      <button
        data-testid="probe-set-indigo"
        onClick={() => setPalette('indigo')}
      >
        indigo
      </button>
      <button
        data-testid="probe-set-violet"
        onClick={() => setPalette('violet')}
      >
        violet
      </button>
    </div>
  );
}

describe('PaletteProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.palette;
  });

  it('无 localStorage 时默认 emerald', async () => {
    render(
      <PaletteProvider>
        <Probe />
      </PaletteProvider>,
    );
    expect(screen.getByTestId('probe-current').textContent).toBe(
      DEFAULT_PALETTE,
    );
  });

  it('localStorage 已存 indigo → mount 后 state=indigo 且 dataset 同步', async () => {
    localStorage.setItem(PALETTE_STORAGE_KEY, 'indigo');
    render(
      <PaletteProvider>
        <Probe />
      </PaletteProvider>,
    );
    // useEffect 是同步触发的（act 内部），mount 后即可断言
    await act(async () => {});
    expect(screen.getByTestId('probe-current').textContent).toBe('indigo');
    expect(document.documentElement.dataset.palette).toBe('indigo');
  });

  it('localStorage 含非法值 → 回落 emerald 不抛错', async () => {
    localStorage.setItem(PALETTE_STORAGE_KEY, 'teal');
    render(
      <PaletteProvider>
        <Probe />
      </PaletteProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId('probe-current').textContent).toBe(
      DEFAULT_PALETTE,
    );
    expect(document.documentElement.dataset.palette).toBeUndefined();
  });

  it('setPalette(violet) → state/LS/dataset 三同步', async () => {
    const user = userEvent.setup();
    render(
      <PaletteProvider>
        <Probe />
      </PaletteProvider>,
    );
    await user.click(screen.getByTestId('probe-set-violet'));
    expect(screen.getByTestId('probe-current').textContent).toBe('violet');
    expect(localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('violet');
    expect(document.documentElement.dataset.palette).toBe('violet');
  });
});
```

- [ ] **Step 2.2: 运行测试，验证失败**

Run: `pnpm --filter @app/web test -- src/components/__tests__/palette-provider.test.tsx`
Expected: FAIL，错误信息含 `Cannot find module '../palette-provider'`。

- [ ] **Step 2.3: 实现 PaletteProvider**

新建 `apps/web/src/components/palette-provider.tsx`：

```tsx
'use client';
import * as React from 'react';
import {
  DEFAULT_PALETTE,
  PALETTE_STORAGE_KEY,
  isValidPalette,
  type PaletteKey,
} from '@/lib/palettes';

type Ctx = {
  palette: PaletteKey;
  setPalette: (p: PaletteKey) => void;
};

const PaletteContext = React.createContext<Ctx>({
  palette: DEFAULT_PALETTE,
  setPalette: () => {},
});

export function PaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [palette, setPaletteState] =
    React.useState<PaletteKey>(DEFAULT_PALETTE);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(PALETTE_STORAGE_KEY);
      if (isValidPalette(stored)) {
        setPaletteState(stored);
        document.documentElement.dataset.palette = stored;
      }
    } catch {
      /* 隐私模式 / 无 LS：静默回落 */
    }
  }, []);

  const setPalette = React.useCallback((p: PaletteKey) => {
    setPaletteState(p);
    try {
      localStorage.setItem(PALETTE_STORAGE_KEY, p);
    } catch {
      /* 静默 */
    }
    document.documentElement.dataset.palette = p;
  }, []);

  return (
    <PaletteContext.Provider value={{ palette, setPalette }}>
      {children}
    </PaletteContext.Provider>
  );
}

export const usePalette = () => React.useContext(PaletteContext);
```

- [ ] **Step 2.4: 重跑测试，验证通过**

Run: `pnpm --filter @app/web test -- src/components/__tests__/palette-provider.test.tsx`
Expected: 4 passed。

- [ ] **Step 2.5: Commit**

```bash
git add apps/web/src/components/palette-provider.tsx apps/web/src/components/__tests__/palette-provider.test.tsx
git commit -m "feat(web): PaletteProvider context + localStorage 持久化"
```

---

## Task 3: globals.css 追加 12 套 CSS 变量集合

往 `globals.css` 的 `@layer base {}` 内追加 6 套调色盘 × light/dark 共 12 块覆盖。emerald 作为默认色板，写法 `:root, :root[data-palette="emerald"]` 兼容未挂属性的根作用域。其它 5 套仅覆盖 `--primary` / `--primary-foreground` / `--ring`，accent 留给根作用域。

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 3.1: 阅读当前 globals.css**

Run: `cat apps/web/src/app/globals.css`（或用 Read 工具）

确认 `:root` 块当前有 `--primary: 158 64% 40%; --ring: 158 64% 40%;`；`.dark` 块当前有 `--primary: 158 64% 52%; --ring: 158 64% 52%;`。

- [ ] **Step 3.2: 修改 globals.css**

把 `:root` 块里的 `--primary` / `--primary-foreground` / `--ring` 三行**删掉**（这些行移到 emerald 块）。同样把 `.dark` 块里的对应三行删掉。

在 `@layer base { ... }` 第一个 `}` 之前（即所有现有 `:root` 与 `.dark` 之后）追加：

```css
  /* ===== 调色盘（与 apps/web/src/lib/palettes.ts:PALETTE_KEYS 同步） ===== */
  :root,
  :root[data-palette='emerald'] {
    --primary: 158 64% 40%;
    --primary-foreground: 0 0% 100%;
    --ring: 158 64% 40%;
  }
  .dark,
  .dark[data-palette='emerald'] {
    --primary: 158 64% 52%;
    --primary-foreground: 240 10% 3.9%;
    --ring: 158 64% 52%;
  }

  :root[data-palette='indigo'] {
    --primary: 239 84% 56%;
    --primary-foreground: 0 0% 100%;
    --ring: 239 84% 56%;
  }
  .dark[data-palette='indigo'] {
    --primary: 239 84% 65%;
    --primary-foreground: 240 10% 3.9%;
    --ring: 239 84% 65%;
  }

  :root[data-palette='sky'] {
    --primary: 199 89% 41%;
    --primary-foreground: 0 0% 100%;
    --ring: 199 89% 41%;
  }
  .dark[data-palette='sky'] {
    --primary: 199 89% 55%;
    --primary-foreground: 240 10% 3.9%;
    --ring: 199 89% 55%;
  }

  :root[data-palette='violet'] {
    --primary: 262 83% 58%;
    --primary-foreground: 0 0% 100%;
    --ring: 262 83% 58%;
  }
  .dark[data-palette='violet'] {
    --primary: 262 83% 68%;
    --primary-foreground: 240 10% 3.9%;
    --ring: 262 83% 68%;
  }

  :root[data-palette='slate'] {
    --primary: 222 47% 11%;
    --primary-foreground: 0 0% 100%;
    --ring: 222 47% 11%;
  }
  .dark[data-palette='slate'] {
    --primary: 210 40% 96%;
    --primary-foreground: 222 47% 11%;
    --ring: 210 40% 96%;
  }

  :root[data-palette='rose'] {
    --primary: 346 77% 50%;
    --primary-foreground: 0 0% 100%;
    --ring: 346 77% 50%;
  }
  .dark[data-palette='rose'] {
    --primary: 346 77% 60%;
    --primary-foreground: 240 10% 3.9%;
    --ring: 346 77% 60%;
  }
```

- [ ] **Step 3.3: 验证 build 不破坏**

Run: `pnpm --filter @app/web build`
Expected: 编译成功，`Compiled successfully` + 静态生成完成，无 PostCSS / Tailwind 错误。

- [ ] **Step 3.4: 验证 lint 不破坏**

Run: `pnpm --filter @app/web test`
Expected: 全部既有 vitest 用例（含 Task 1+2 新增的 8 用例）均通过；总文件数 30、用例数 130（原 28/122 + 8 新）。

- [ ] **Step 3.5: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat(web): globals.css 追加 12 套调色盘 CSS 变量集合"
```

---

## Task 4: PaletteSwitcher 组件 + 测试

实现 TopBar 上的 Popover 切换器：trigger 是 Palette 图标按钮，content 是 3×2 grid 的 6 个色点；选中态在色点上叠 Check 图标。测试覆盖渲染、选中态、点击切换。

**Files:**
- Create: `apps/web/src/components/shell/PaletteSwitcher.tsx`
- Create: `apps/web/src/components/shell/__tests__/PaletteSwitcher.test.tsx`

- [ ] **Step 4.1: 写失败测试**

新建 `apps/web/src/components/shell/__tests__/PaletteSwitcher.test.tsx`：

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaletteSwitcher } from '../PaletteSwitcher';
import { PaletteProvider } from '@/components/palette-provider';
import {
  PALETTE_KEYS,
  PALETTE_STORAGE_KEY,
} from '@/lib/palettes';

function renderSwitcher() {
  return render(
    <PaletteProvider>
      <PaletteSwitcher />
    </PaletteProvider>,
  );
}

describe('PaletteSwitcher', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.palette;
  });

  it('打开 Popover 后渲染 6 个色板选项', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderSwitcher();
    await user.click(screen.getByTestId('palette-switcher'));
    for (const key of PALETTE_KEYS) {
      expect(
        await screen.findByTestId(`palette-option-${key}`),
      ).toBeInTheDocument();
    }
  });

  it('当前 palette (默认 emerald) 对应选项渲染 Check 图标', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderSwitcher();
    await user.click(screen.getByTestId('palette-switcher'));
    const emeraldBtn = await screen.findByTestId(
      'palette-option-emerald',
    );
    // Check 图标通过 lucide 渲染为 <svg>；只断 svg 存在即可
    expect(emeraldBtn.querySelector('svg')).not.toBeNull();
    // 非选中色板内无 svg
    const indigoBtn = screen.getByTestId('palette-option-indigo');
    expect(indigoBtn.querySelector('svg')).toBeNull();
  });

  it('点击 violet → LS 写入 violet 且 dataset 同步', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderSwitcher();
    await user.click(screen.getByTestId('palette-switcher'));
    await user.click(
      await screen.findByTestId('palette-option-violet'),
    );
    expect(localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('violet');
    expect(document.documentElement.dataset.palette).toBe('violet');
  });
});
```

- [ ] **Step 4.2: 运行测试，验证失败**

Run: `pnpm --filter @app/web test -- src/components/shell/__tests__/PaletteSwitcher.test.tsx`
Expected: FAIL，错误信息含 `Cannot find module '../PaletteSwitcher'`。

- [ ] **Step 4.3: 实现 PaletteSwitcher**

新建 `apps/web/src/components/shell/PaletteSwitcher.tsx`：

```tsx
'use client';
import * as React from 'react';
import { Palette, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { PALETTES } from '@/lib/palettes';
import { usePalette } from '@/components/palette-provider';

export function PaletteSwitcher() {
  const { palette, setPalette } = usePalette();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid="palette-switcher"
          aria-label="切换主题色"
        >
          <Palette className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56">
        <p className="mb-2 text-sm font-medium">主题色</p>
        <div className="grid grid-cols-3 gap-2">
          {PALETTES.map((p) => {
            const selected = palette === p.key;
            return (
              <button
                key={p.key}
                type="button"
                data-testid={`palette-option-${p.key}`}
                aria-label={p.label}
                aria-pressed={selected}
                onClick={() => setPalette(p.key)}
                className="flex flex-col items-center gap-1 rounded-md p-2 hover:bg-accent"
              >
                <span
                  className="relative flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ background: p.swatch }}
                >
                  {selected && (
                    <Check
                      className="h-4 w-4 text-white"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className="text-xs">{p.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4.4: 重跑测试，验证通过**

Run: `pnpm --filter @app/web test -- src/components/shell/__tests__/PaletteSwitcher.test.tsx`
Expected: 3 passed。

- [ ] **Step 4.5: Commit**

```bash
git add apps/web/src/components/shell/PaletteSwitcher.tsx apps/web/src/components/shell/__tests__/PaletteSwitcher.test.tsx
git commit -m "feat(web): PaletteSwitcher 顶栏色板切换 Popover (Palette 图标 + 3x2 grid)"
```

---

## Task 5: layout.tsx 集成 — PaletteProvider + 防 FOUC inline script

把 `<PaletteProvider>` 嵌入 `<ThemeProvider>` 内层；在 `<head>` 末尾内联同步 script，在 hydration 前从 LS 读取并设置 `data-palette`，避免色板闪烁。Script 字符串通过新增的 `palette-script.ts` 拼装，避免在 layout.tsx 里硬编码白名单。

**Files:**
- Create: `apps/web/src/lib/palette-script.ts`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 5.1: 创建 palette-script.ts**

新建 `apps/web/src/lib/palette-script.ts`：

```ts
import { PALETTE_KEYS, PALETTE_STORAGE_KEY } from './palettes';

// 防 FOUC：hydration 前同步读 localStorage 设 data-palette。
// 字符串结果将通过 dangerouslySetInnerHTML 注入 <head>，
// 字符串字面量与 palettes.ts 始终保持一致。
export const PALETTE_NO_FLASH_SCRIPT = `(function(){try{var k=${JSON.stringify(
  PALETTE_STORAGE_KEY,
)};var p=localStorage.getItem(k);var w=${JSON.stringify(
  PALETTE_KEYS,
)};if(p&&w.indexOf(p)>=0){document.documentElement.dataset.palette=p;}}catch(e){}})();`;
```

- [ ] **Step 5.2: 读当前 layout.tsx**

Run: `cat apps/web/src/app/layout.tsx`（或用 Read 工具）

确认现状是一个 RSC 文件，body 内单 `<ThemeProvider>` 包 `{children}`，无 `<head>` 元素。

- [ ] **Step 5.3: 修改 layout.tsx**

把 `apps/web/src/app/layout.tsx` 整体替换为：

```tsx
import './globals.css';
import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/theme-provider';
import { PaletteProvider } from '@/components/palette-provider';
import { PALETTE_NO_FLASH_SCRIPT } from '@/lib/palette-script';

export const metadata: Metadata = { title: '实验室试剂管理' };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: PALETTE_NO_FLASH_SCRIPT }}
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PaletteProvider>{children}</PaletteProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 5.4: 验证 build + vitest 全过**

Run: `pnpm --filter @app/web build`
Expected: 编译成功。

Run: `pnpm --filter @app/web test`
Expected: 全部既有 vitest 用例 + Task 1/2/4 新增 11 用例（4 + 4 + 3）通过。

- [ ] **Step 5.5: Commit**

```bash
git add apps/web/src/lib/palette-script.ts apps/web/src/app/layout.tsx
git commit -m "feat(web): layout 集成 PaletteProvider + <head> inline 防 FOUC script"
```

---

## Task 6: TopBar 集成 — 加 PaletteSwitcher 按钮

在 `<NotificationBell />` 和 `<ThemeToggle />` 之间插入 `<PaletteSwitcher />`。其它部分不动。

**Files:**
- Modify: `apps/web/src/components/shell/TopBar.tsx`

- [ ] **Step 6.1: 修改 TopBar.tsx import**

在 `apps/web/src/components/shell/TopBar.tsx:11`（`import { NotificationBell } ...` 那行）之后插入：

```tsx
import { PaletteSwitcher } from './PaletteSwitcher';
```

- [ ] **Step 6.2: 修改 TopBar.tsx JSX**

把 `apps/web/src/components/shell/TopBar.tsx:37-41` 这一块：

```tsx
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
          <ThemeToggle />
          <UserMenu />
        </div>
```

改为：

```tsx
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
          <PaletteSwitcher />
          <ThemeToggle />
          <UserMenu />
        </div>
```

- [ ] **Step 6.3: 验证既有 TopBar 相关测试不破裂**

Run: `pnpm --filter @app/web test`
Expected: 全部既有用例（含 `MobileSidebar.test.tsx`、可能涉及 TopBar 的页面测试）通过；总用例数 130（122 既有 + 8 新；Task 4 的 3 用例已计入 Step 5.4，重复跑过）。

- [ ] **Step 6.4: Commit**

```bash
git add apps/web/src/components/shell/TopBar.tsx
git commit -m "feat(web): TopBar 顶栏加 PaletteSwitcher 按钮 (NotificationBell 与 ThemeToggle 之间)"
```

---

## Task 7: 最终验收 — vitest 全跑 + tsc + build + 浏览器走查

**Files:** 无代码改动。

- [ ] **Step 7.1: 跑全量 vitest**

Run: `pnpm --filter @app/web test`
Expected: `Test Files  30 passed (30) / Tests  130 passed (130)`，0 失败，0 跳过。

- [ ] **Step 7.2: 跑 tsc 检查**

Run: `pnpm --filter @app/web exec tsc --noEmit`
Expected: 0 error。

- [ ] **Step 7.3: 跑 next build**

Run: `pnpm --filter @app/web build`
Expected: `Compiled successfully`，路由静态生成无报错；CSS bundle 净增 < 2 KB gzip。

- [ ] **Step 7.4: 启动 dev 服务器**

Run: `pnpm --filter @app/web dev`（在 separate terminal 或 background）

等待 `ready` 输出（约 5s），打开 http://localhost:3000。

- [ ] **Step 7.5: 浏览器手动走查**

按以下顺序点：

1. 登录任意账号 → 进入主界面
2. 顶栏右上角应见到三个 icon：🔔 / 🎨 / 🌓 + 头像
3. 点 🎨 → Popover 弹出 → 见 6 个色点（Emerald 默认带 ✓）
4. 依次点 Indigo / Sky / Violet / Slate / Rose / Emerald —— 每点一次：
   - Popover 不关闭，色点上的 ✓ 移到新选项
   - 顶栏 LabReagent icon、Sidebar 选中项背景、按钮 primary 色立即变化
   - 不能有可感知的色彩闪烁
5. F5 刷新页面 → 当前色板保持
6. 切换 🌓 light/dark → 色板维持不变，明暗独立切换
7. F12 控制台 → `<html data-palette="...">` 与最后一次选择一致
8. F12 → Application → Local Storage → `lab-palette` 键值正确
9. （可选）DevTools → 切换隐私模式或禁用 LS → 仍能点切换，仅刷新后丢失

记录任何视觉异常（撞色、对比度差），如有缺陷新建后续任务，不在此 plan 内修。

- [ ] **Step 7.6: 停 dev 服务器并 tag**

停掉 dev 服务器。

```bash
git tag web-theme-palette-complete
git log --oneline -8
```

确认 7 个 commit（Task 1-6 各 1 + 可能的修复）+ docs commit `1bc0739` 都在 main 上。

无需 push tag（按项目约定）。

---

## 完成定义

- 7 个新提交按 Task 顺序进入 main
- vitest 30 文件 / 130 用例全过
- tsc 0 error
- build 成功，globals.css 增量 < 2 KB gzip
- 浏览器走查 9 步全过
- tag `web-theme-palette-complete` 标记在最后一个 commit 上
