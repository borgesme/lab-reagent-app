# Web 主题色板自定义设计

**日期**：2026-05-20
**目标文件**：`apps/web/src/lib/palettes.ts` + `apps/web/src/components/palette-provider.tsx` + `apps/web/src/components/shell/PaletteSwitcher.tsx` + `apps/web/src/app/globals.css` + `apps/web/src/app/layout.tsx` + `apps/web/src/components/shell/TopBar.tsx`
**关联现状**：`next-themes ^0.4.6` 已接入，`ThemeProvider attribute="class" defaultTheme="system" enableSystem`，仅支持 light/dark/system；`globals.css` 用 HSL CSS 变量；`tailwind.config.ts` 用 `darkMode:['class']` + `hsl(var(--xxx))`；shadcn baseColor=zinc 但实际 primary 是 emerald `158 64% 40%`

## 背景

apps/web 当前主题只有「明 / 暗 / 跟系统」三档，主色硬编码 emerald。需要给管理后台用户提供至少 5 套调色盘可选，主色随之换。本设计在保持 next-themes / Tailwind / shadcn 现有架构不动的前提下，新增一维「色板」选择，与明暗维正交。

## 范围

**包含**：
- 6 套调色盘：Emerald（当前/默认）、Indigo、Sky、Violet、Slate、Rose，每套配 light + dark 两份 HSL（共 12 套 CSS 变量集合）
- TopBar 新增独立 `PaletteSwitcher` 按钮（Popover + 6 色点 grid），与 `ThemeToggle` 并列
- `PaletteProvider`：context + localStorage 持久化 + DOM 属性同步
- SSR 阶段 inline script 防 FOUC（与 next-themes 同款思路）
- vitest 7 用例覆盖 Provider 状态机 + Switcher 交互

**不包含**：
- 自定义 HSL 调色 / 颜色拾取器
- 同步到后端用户偏好（无 `/users/me/preferences` 端点改动）
- radius / 字体 / 密度等其他可调维度（YAGNI）
- 色板预览缩略图（Switcher 只放色点）
- e2e 改动（playwright specs 不受影响）

## 架构

### 两维属性正交

```
<html lang="zh-CN" class="dark" data-palette="indigo" suppressHydrationWarning>
       ↑                ↑
       next-themes      新增 PaletteProvider
```

- 明暗维：next-themes 在 `<html>` 上挂 `class="light|dark"`（已实现）
- 色板维：PaletteProvider 在 `<html>` 上挂 `data-palette="emerald|indigo|sky|violet|slate|rose"`
- 两者完全解耦，可任意组合得 6×2=12 种最终外观

### 单一数据源：`apps/web/src/lib/palettes.ts`

```ts
export const PALETTE_KEYS = ['emerald', 'indigo', 'sky', 'violet', 'slate', 'rose'] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];

export const DEFAULT_PALETTE: PaletteKey = 'emerald';
export const PALETTE_STORAGE_KEY = 'lab-palette';

export const PALETTES: Array<{ key: PaletteKey; label: string; swatch: string }> = [
  { key: 'emerald', label: '翠绿',   swatch: 'hsl(158 64% 40%)' },
  { key: 'indigo',  label: '靛蓝',   swatch: 'hsl(239 84% 56%)' },
  { key: 'sky',     label: '天蓝',   swatch: 'hsl(199 89% 41%)' },
  { key: 'violet',  label: '紫罗兰', swatch: 'hsl(262 83% 58%)' },
  { key: 'slate',   label: '石板',   swatch: 'hsl(222 47% 11%)' },
  { key: 'rose',    label: '玫红',   swatch: 'hsl(346 77% 50%)' },
];

export function isValidPalette(v: unknown): v is PaletteKey {
  return typeof v === 'string' && (PALETTE_KEYS as readonly string[]).includes(v);
}
```

`palettes.ts` 给运行时（Provider 校验、Switcher 渲染色点）用，`globals.css` 给浏览器渲染用。两者以 `PaletteKey` 为唯一锚点，加新色板时需同步更新两处（不引入 PostCSS 插件生成，保持简单）。

### `globals.css` 结构

```css
@layer base {
  /* 1. 根作用域：通用 token（不变） */
  :root {
    --background: 0 0% 100%; --foreground: 240 10% 3.9%;
    --card: 0 0% 100%; --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%; --popover-foreground: 240 10% 3.9%;
    --secondary: 240 4.8% 95.9%; --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%; --muted-foreground: 240 3.8% 46.1%;
    --destructive: 0 84.2% 60.2%; --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%; --input: 240 5.9% 90%;
    --radius: 0.5rem;
    /* primary / ring / accent 留给色板覆盖 */
  }
  .dark {
    --background: 240 10% 3.9%; --foreground: 0 0% 98%;
    /* ... 同结构，省略 ... */
  }

  /* 2. 默认色板 = emerald（与现状对齐） */
  :root, :root[data-palette="emerald"] {
    --primary: 158 64% 40%; --primary-foreground: 0 0% 100%;
    --ring: 158 64% 40%;
    --accent: 240 4.8% 95.9%; --accent-foreground: 240 5.9% 10%;
  }
  .dark, .dark[data-palette="emerald"] {
    --primary: 158 64% 52%; --primary-foreground: 240 10% 3.9%;
    --ring: 158 64% 52%;
    --accent: 240 3.7% 15.9%; --accent-foreground: 0 0% 98%;
  }

  /* 3. 其它 5 套：仅覆盖 primary/ring/primary-foreground */
  :root[data-palette="indigo"]  { --primary: 239 84% 56%; --primary-foreground: 0 0% 100%; --ring: 239 84% 56%; }
  .dark[data-palette="indigo"]  { --primary: 239 84% 65%; --primary-foreground: 240 10% 3.9%; --ring: 239 84% 65%; }

  :root[data-palette="sky"]     { --primary: 199 89% 41%; --primary-foreground: 0 0% 100%; --ring: 199 89% 41%; }
  .dark[data-palette="sky"]     { --primary: 199 89% 55%; --primary-foreground: 240 10% 3.9%; --ring: 199 89% 55%; }

  :root[data-palette="violet"]  { --primary: 262 83% 58%; --primary-foreground: 0 0% 100%; --ring: 262 83% 58%; }
  .dark[data-palette="violet"]  { --primary: 262 83% 68%; --primary-foreground: 240 10% 3.9%; --ring: 262 83% 68%; }

  :root[data-palette="slate"]   { --primary: 222 47% 11%; --primary-foreground: 0 0% 100%; --ring: 222 47% 11%; }
  .dark[data-palette="slate"]   { --primary: 210 40% 96%; --primary-foreground: 222 47% 11%; --ring: 210 40% 96%; }

  :root[data-palette="rose"]    { --primary: 346 77% 50%; --primary-foreground: 0 0% 100%; --ring: 346 77% 50%; }
  .dark[data-palette="rose"]    { --primary: 346 77% 60%; --primary-foreground: 240 10% 3.9%; --ring: 346 77% 60%; }
}
```

净增体量约 1.5 KB gzip。

## 组件

### `PaletteProvider`（`apps/web/src/components/palette-provider.tsx`）

```ts
'use client';
import * as React from 'react';
import { DEFAULT_PALETTE, PALETTE_STORAGE_KEY, isValidPalette, type PaletteKey } from '@/lib/palettes';

type Ctx = { palette: PaletteKey; setPalette: (p: PaletteKey) => void };
const PaletteContext = React.createContext<Ctx>({
  palette: DEFAULT_PALETTE,
  setPalette: () => {},
});

export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [palette, setPaletteState] = React.useState<PaletteKey>(DEFAULT_PALETTE);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(PALETTE_STORAGE_KEY);
      if (isValidPalette(stored)) {
        setPaletteState(stored);
        document.documentElement.dataset.palette = stored;
      }
    } catch { /* 隐私模式：静默回落 */ }
  }, []);

  const setPalette = React.useCallback((p: PaletteKey) => {
    setPaletteState(p);
    try { localStorage.setItem(PALETTE_STORAGE_KEY, p); } catch { /* 静默 */ }
    document.documentElement.dataset.palette = p;
  }, []);

  return <PaletteContext.Provider value={{ palette, setPalette }}>{children}</PaletteContext.Provider>;
}

export const usePalette = () => React.useContext(PaletteContext);
```

### `PaletteSwitcher`（`apps/web/src/components/shell/PaletteSwitcher.tsx`）

用 shadcn 的 `Popover`（已有 `popover.tsx`），不用 `DropdownMenu`，便于 grid 排色点。

```tsx
'use client';
import { Palette, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PALETTES } from '@/lib/palettes';
import { usePalette } from '@/components/palette-provider';

export function PaletteSwitcher() {
  const { palette, setPalette } = usePalette();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" data-testid="palette-switcher" aria-label="切换主题色">
          <Palette className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56">
        <p className="mb-2 text-sm font-medium">主题色</p>
        <div className="grid grid-cols-3 gap-2">
          {PALETTES.map((p) => (
            <button
              key={p.key}
              data-testid={`palette-option-${p.key}`}
              aria-label={p.label}
              onClick={() => setPalette(p.key)}
              className="flex flex-col items-center gap-1 rounded-md p-2 hover:bg-accent"
            >
              <span className="relative flex h-8 w-8 items-center justify-center rounded-full"
                    style={{ background: p.swatch }}>
                {palette === p.key && <Check className="h-4 w-4 text-white" />}
              </span>
              <span className="text-xs">{p.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

### `TopBar` 集成位（`apps/web/src/components/shell/TopBar.tsx`）

```tsx
<div className="ml-auto flex items-center gap-1">
  <NotificationBell />
  <PaletteSwitcher />   {/* ← 新增 */}
  <ThemeToggle />
  <UserMenu />
</div>
```

### `layout.tsx` 改造

```tsx
import { PaletteProvider } from '@/components/palette-provider';

const noFlashScript = `
(function(){try{var p=localStorage.getItem('lab-palette');
if(p&&['emerald','indigo','sky','violet','slate','rose'].indexOf(p)>=0){
document.documentElement.dataset.palette=p;}}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <PaletteProvider>{children}</PaletteProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

> `PaletteProvider` 在 `ThemeProvider` 内层（顺序不重要，两者解耦），保持文件最小改动。

## 数据流（端到端）

```
[首次加载]
  ↓
RootLayout <head> inline script 读 LS → 设 documentElement.dataset.palette
  ↓ (阻塞渲染极短，零 FOUC)
React hydration → PaletteProvider useEffect 再读一次 LS 同步 state（确保 React 也知道）
  ↓
[用户点 PaletteSwitcher 里 "violet"]
  ↓
setPalette('violet')
  ├→ setState（驱动 Switcher 选中态高亮 + Check 图标）
  ├→ localStorage.setItem('lab-palette','violet')
  └→ document.documentElement.dataset.palette = 'violet'
       ↓
[data-palette="violet"] 命中 CSS 变量集 → 全站 primary/ring 即时变化
（Tailwind 现有 hsl(var(--primary)) 直接复用，无需重渲染组件）
```

## 持久化

- localStorage key: `lab-palette`（与 next-themes 的 `theme` key 独立）
- 读取时通过 `isValidPalette` 白名单校验，无效 / 缺失 → 静默回落 `DEFAULT_PALETTE = 'emerald'`
- 不做迁移代码（新功能，无历史数据）
- localStorage 不可用（隐私模式、SSR） → try/catch 包裹，仅当次会话生效，不报错

## 测试

新增 2 个 spec：

### `apps/web/src/components/palette-provider.test.tsx`

| 用例 | 覆盖 |
|---|---|
| 无 LS → 默认 `emerald` | 缺省路径 |
| LS 有 `indigo` → mount 后 state = `indigo` 且 `document.documentElement.dataset.palette === 'indigo'` | 恢复 + DOM 同步 |
| LS 有 `'foo'` → 回落 emerald，不抛 | 容错 |
| `setPalette('violet')` → LS 写入 + dataset 更新 + state 变化 | 持久化闭环 |

### `apps/web/src/components/shell/palette-switcher.test.tsx`

| 用例 | 覆盖 |
|---|---|
| 渲染 6 个 `palette-option-*` 按钮 | UI 完整性 |
| 当前 palette 对应的按钮显示 Check 图标 | 选中态 |
| 点击 `palette-option-violet` → context palette 变 `violet` | 交互 |

合计 7 新用例，预期 vitest 28 文件 / 122 用例 → 30 文件 / 129 用例，0 失败。`tsc` 0 error。

不动 e2e。

## 边界 / 风险

| 风险 | 处理 |
|---|---|
| **FOUC** | `<head>` 内联同步 script 在 hydration 前设 `data-palette` |
| **LS 不可用** | try/catch；失败仅内存态生效，不报错 |
| **未知 LS 值** | `isValidPalette` 白名单 → 回落 emerald |
| **Rose 与 destructive 撞色** | `--destructive` 始终保持 `0 84.2% 60.2%`（更红更暗），Rose primary 是 `346 77% 50%`（粉调），靠色相 + 饱和度区分；如实际撞色再迭代 |
| **dark 下对比度** | dark 套用更高 L 值（emerald 52% / indigo 65% / sky 55% / violet 68% / rose 60%），slate dark 反转（primary 用浅、foreground 用深）；目标 WCAG AA 4.5:1 |
| **SSR class 不匹配警告** | `<html suppressHydrationWarning>` 现已有（next-themes 已用），覆盖此场景 |

## 不做的事（YAGNI 边界）

- ❌ 自定义 HSL / 拾色器
- ❌ 同步后端用户偏好
- ❌ radius / 字体 / 密度可调
- ❌ 色板预览缩略图
- ❌ e2e 改动

## 验收清单

```
□ vitest 28/122 → 30/129 全过
□ tsc 0 error
□ next build 成功，globals.css gzip 净增 < 2 KB
□ 浏览器实测 6 套 × light/dark 切换无闪屏、无残影
□ 刷新页面色板保持
□ 隐私模式（无 LS）打开仍能切换（仅当次会话生效）
□ TopBar 上 PaletteSwitcher 与 ThemeToggle 并列、对齐、tooltip / aria-label 完整
□ Rose 色板下 destructive 按钮（删除等）仍可与 primary 区分
```
