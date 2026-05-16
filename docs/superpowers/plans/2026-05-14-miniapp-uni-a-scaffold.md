# Plan A — miniapp-uni 工程脚手架与 Phase 0 spike

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建好 `apps/miniapp-uni/` 工程骨架，能 `dev:h5` 跑起来看到带 emerald 主题色的占位页；同时通过 Phase 0 三个 spike 验证 spec 中的工程假设。

**Architecture:** 沿用 Art-app 的 uniapp + Vue3 + Pinia + uview-plus 模板，升级到 TypeScript。工程位置 `apps/miniapp-uni/`，与老 `apps/miniapp` 并存。

**Tech Stack:** Vue 3.5 / uniapp 3.0 alpha / vite 5 / TypeScript 5.4 / pnpm workspace / vitest 1.x。

**Spec:** [`docs/superpowers/specs/2026-05-14-miniapp-uni-design.md`](../specs/2026-05-14-miniapp-uni-design.md)

**前置:** 仓库已有 `apps/Art-app/`（参考模板）和 `apps/miniapp/`（老 Taro 工程，不动）。pnpm workspace 配置已自动包含 `apps/*`。

---

## File Structure

**新建工程目录树（本 plan 全部在 `apps/miniapp-uni/` 下）：**

```
apps/miniapp-uni/
├── package.json                  # @app/miniapp-uni 工作区包，10 个 scripts
├── tsconfig.json                 # 继承根 + uni 类型 + @ alias
├── .gitignore                    # node_modules / dist / unpackage
├── .env.development              # VITE_APP_ENV=development 等三变量
├── .env.production
├── .env.example                  # 模板，纳入 git
├── vite.config.ts                # @ alias / base / esbuild drop console
├── vitest.config.ts              # node env / alias / setup
├── vitest.setup.ts               # 全局 mock uni.*
├── project.config.json           # 微信小程序 IDE 配置，appid touristappid
├── index.html                    # H5 入口（uniapp 标准模板）
├── shime-uni.d.ts                # uni-app 类型 stub
└── src/
    ├── env.d.ts                  # declare module '*.vue' + ImportMeta
    ├── main.ts                   # createSSRApp + Pinia + uview-plus + i18n（i18n 留给 Plan B）
    ├── App.vue                   # 顶层样式 import + onLaunch 占位
    ├── manifest.json             # vue3 + h5 + mp-weixin + 其他平台 stub
    ├── pages.json                # 三页注册 + easycom + globalStyle，无 tabBar
    ├── uni.scss                  # 仅放 uni 内置变量，不放主题色
    ├── config/
    │   └── env.ts                # 暴露 VITE_APP_ENV / VITE_ROUTER_BASE / VITE_BASE_URL
    ├── styles/
    │   ├── common.scss           # reset + 通用排版
    │   ├── flex.scss             # flex 工具类
    │   └── index.scss            # 聚合
    ├── pages/                    # 占位三页
    │   ├── login/index.vue
    │   ├── home/index.vue
    │   └── mine/index.vue
    └── uni_modules/
        └── uview-plus/           # 从 Art-app 整目录复制 + theme.scss 改 emerald
```

**spike 验证文件（验证完保留作为最小测试样例）：**
- `apps/miniapp-uni/src/__tests__/spike.test.ts`（Phase 0 三个 spike 最小用例）

---

## Task A1: 创建工程根 + package.json + tsconfig + .gitignore

**Files:**
- Create: `apps/miniapp-uni/package.json`
- Create: `apps/miniapp-uni/tsconfig.json`
- Create: `apps/miniapp-uni/.gitignore`

- [ ] **Step A1.1: 创建目录骨架**

```bash
mkdir -p apps/miniapp-uni/src/{config,styles,pages,uni_modules,__tests__}
mkdir -p apps/miniapp-uni/src/pages/{login,home,mine}
```

- [ ] **Step A1.2: 写 `apps/miniapp-uni/package.json`**

```json
{
  "name": "@app/miniapp-uni",
  "version": "0.1.0",
  "private": true,
  "description": "Lab reagent miniapp (uniapp + Vue3 + TS, refactor of @app/miniapp)",
  "scripts": {
    "dev:h5": "uni",
    "dev:mp-weixin": "uni -p mp-weixin",
    "dev:mp-alipay": "uni -p mp-alipay",
    "dev:app": "uni -p app",
    "dev:mp-baidu": "uni -p mp-baidu",
    "dev:mp-toutiao": "uni -p mp-toutiao",
    "dev:mp-qq": "uni -p mp-qq",
    "build:h5": "uni build",
    "build:mp-weixin": "uni build -p mp-weixin",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@app/shared": "workspace:*",
    "@dcloudio/uni-app": "3.0.0-alpha-4080620251107001",
    "@dcloudio/uni-app-plus": "3.0.0-alpha-4080620251107001",
    "@dcloudio/uni-components": "3.0.0-alpha-4080620251107001",
    "@dcloudio/uni-h5": "3.0.0-alpha-4080620251107001",
    "@dcloudio/uni-mp-alipay": "3.0.0-alpha-4080620251107001",
    "@dcloudio/uni-mp-baidu": "3.0.0-alpha-4080620251107001",
    "@dcloudio/uni-mp-qq": "3.0.0-alpha-4080620251107001",
    "@dcloudio/uni-mp-toutiao": "3.0.0-alpha-4080620251107001",
    "@dcloudio/uni-mp-weixin": "3.0.0-alpha-4080620251107001",
    "@dcloudio/uni-quickapp-webview": "3.0.0-alpha-4080620251107001",
    "pinia": "^3.0.4",
    "pinia-plugin-persistedstate": "^4.7.1",
    "vue": "^3.5.13",
    "vue-i18n": "^9.14.5"
  },
  "devDependencies": {
    "@dcloudio/types": "^3.4.8",
    "@dcloudio/uni-automator": "3.0.0-alpha-4080620251107001",
    "@dcloudio/uni-cli-shared": "3.0.0-alpha-4080620251107001",
    "@dcloudio/uni-stacktracey": "3.0.0-alpha-4080620251107001",
    "@dcloudio/vite-plugin-uni": "3.0.0-alpha-4080620251107001",
    "@types/node": "^20.11.30",
    "@vue/test-utils": "^2.4.6",
    "@vue/tsconfig": "^0.5.1",
    "cross-env": "^7.0.3",
    "jsdom": "^24.0.0",
    "sass": "^1.63.2",
    "typescript": "^5.4.5",
    "vite": "5.2.8",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step A1.3: 写 `apps/miniapp-uni/tsconfig.json`**

```json
{
  "extends": "@vue/tsconfig/tsconfig.json",
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "sourceMap": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "lib": ["ES2020", "DOM"],
    "types": ["@dcloudio/types", "vite/client"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@app/shared": ["../../packages/shared/src/index.ts"]
    }
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.d.ts",
    "src/**/*.vue",
    "shime-uni.d.ts",
    "vite.config.ts",
    "vitest.config.ts",
    "vitest.setup.ts"
  ],
  "exclude": ["node_modules", "dist", "unpackage"]
}
```

- [ ] **Step A1.4: 写 `apps/miniapp-uni/.gitignore`**

```
node_modules/
dist/
unpackage/
.DS_Store
*.log
.env.local
.env.*.local
```

- [ ] **Step A1.5: pnpm install 验证 workspace 收录**

```bash
cd D:\Project\0417-any-demo
pnpm install
```

预期：输出包含 `+ @app/miniapp-uni 0.1.0 D:/Project/0417-any-demo/apps/miniapp-uni`，无错误。

- [ ] **Step A1.6: commit**

```bash
git add apps/miniapp-uni/package.json apps/miniapp-uni/tsconfig.json apps/miniapp-uni/.gitignore pnpm-lock.yaml
git commit -m "chore(miniapp-uni): 初始化包结构 + tsconfig"
```

---

## Task A2: 环境变量与 config/env.ts

**Files:**
- Create: `apps/miniapp-uni/.env.development`
- Create: `apps/miniapp-uni/.env.production`
- Create: `apps/miniapp-uni/.env.example`
- Create: `apps/miniapp-uni/src/config/env.ts`

- [ ] **Step A2.1: 写 `.env.development`**

```
VITE_APP_ENV=development
VITE_ROUTER_BASE=/
VITE_BASE_URL=http://localhost:3001/api/v1
```

- [ ] **Step A2.2: 写 `.env.production`**

```
VITE_APP_ENV=production
VITE_ROUTER_BASE=/
VITE_BASE_URL=https://api.example.com/api/v1
```

- [ ] **Step A2.3: 写 `.env.example`**

```
# 基础环境配置
VITE_APP_ENV=development
VITE_ROUTER_BASE=/
VITE_BASE_URL=http://localhost:3001/api/v1
```

- [ ] **Step A2.4: 写 `src/config/env.ts`**

```ts
export const env = {
  appEnv: (import.meta.env.VITE_APP_ENV as string) ?? 'development',
  routerBase: (import.meta.env.VITE_ROUTER_BASE as string) ?? '/',
  baseUrl:
    (import.meta.env.VITE_BASE_URL as string) ??
    'http://localhost:3001/api/v1',
  get isDev() {
    return this.appEnv === 'development';
  },
  get isProd() {
    return this.appEnv === 'production';
  },
};
```

- [ ] **Step A2.5: commit**

```bash
git add apps/miniapp-uni/.env.development apps/miniapp-uni/.env.production apps/miniapp-uni/.env.example apps/miniapp-uni/src/config/env.ts
git commit -m "feat(miniapp-uni): env vars + config/env.ts (3 个变量)"
```

---

## Task A3: vite/vitest 配置 + 类型 stub

**Files:**
- Create: `apps/miniapp-uni/vite.config.ts`
- Create: `apps/miniapp-uni/vitest.config.ts`
- Create: `apps/miniapp-uni/vitest.setup.ts`
- Create: `apps/miniapp-uni/shime-uni.d.ts`
- Create: `apps/miniapp-uni/src/env.d.ts`
- Create: `apps/miniapp-uni/index.html`

- [ ] **Step A3.1: 写 `vite.config.ts`**

```ts
import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import uni from '@dcloudio/vite-plugin-uni';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    base: env.VITE_ROUTER_BASE || '/',
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    plugins: [uni()],
    esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : {},
    css: {
      preprocessorOptions: {
        scss: {
          silenceDeprecations: [
            'legacy-js-api',
            'import',
            'global-builtin',
            'color-functions',
          ],
          quietDeps: true,
        },
      },
    },
    server: {
      port: 3003,
      open: true,
      hmr: true,
    },
  };
});
```

注意：与 Art-app 不同，**不写 server.proxy**（spec §3.4：H5 也用完整 URL，避免 H5/小程序行为分叉；端口 3003 避开 web 3000 / Art-app 3002）。

- [ ] **Step A3.2: 写 `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue() as any],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.ts'],
  },
});
```

注意：vitest 需要单独引入 `@vitejs/plugin-vue`（不是 `@dcloudio/vite-plugin-uni`，后者是为 uniapp 编译用的，vitest 测试用纯 vue plugin）。

- [ ] **Step A3.3: 加 `@vitejs/plugin-vue` 到 devDeps**

```bash
cd apps/miniapp-uni
pnpm add -D @vitejs/plugin-vue
cd ../..
```

- [ ] **Step A3.4: 写 `vitest.setup.ts`**

```ts
import { vi, beforeEach } from 'vitest';

const storage = new Map<string, any>();

const mockUni = {
  request: vi.fn(),
  showToast: vi.fn(),
  showLoading: vi.fn(),
  hideLoading: vi.fn(),
  showModal: vi.fn(),
  setStorageSync: vi.fn((k: string, v: any) => storage.set(k, v)),
  getStorageSync: vi.fn((k: string) => storage.get(k) ?? ''),
  removeStorageSync: vi.fn((k: string) => storage.delete(k)),
  reLaunch: vi.fn(),
  navigateTo: vi.fn(),
  switchTab: vi.fn(),
  navigateBack: vi.fn(),
  getSystemInfoSync: vi.fn(() => ({
    statusBarHeight: 20,
    language: 'zh-CN',
    platform: 'devtools',
    safeAreaInsets: { top: 20, bottom: 0, left: 0, right: 0 },
  })),
  stopPullDownRefresh: vi.fn(),
};

(globalThis as any).uni = mockUni;

beforeEach(() => {
  storage.clear();
  Object.values(mockUni).forEach((fn: any) => {
    if (typeof fn?.mockClear === 'function') fn.mockClear();
  });
});
```

- [ ] **Step A3.5: 写 `shime-uni.d.ts`**

```ts
/// <reference types="@dcloudio/types" />

declare module '*.vue' {
  import { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module '@dcloudio/uni-h5';
```

- [ ] **Step A3.6: 写 `src/env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV: string;
  readonly VITE_ROUTER_BASE: string;
  readonly VITE_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step A3.7: 写 `index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta
      name="viewport"
      content="width=device-width,initial-scale=1.0,maximum-scale=1.0,minimum-scale=1.0,user-scalable=no,viewport-fit=cover"
    />
    <title>实验室试剂</title>
    <script>
      document.addEventListener('DOMContentLoaded', function () {
        document.documentElement.style.fontSize =
          window.innerWidth / 20 + 'px';
      });
    </script>
  </head>
  <body>
    <noscript>请开启 JavaScript</noscript>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step A3.8: commit**

```bash
git add apps/miniapp-uni/vite.config.ts apps/miniapp-uni/vitest.config.ts apps/miniapp-uni/vitest.setup.ts apps/miniapp-uni/shime-uni.d.ts apps/miniapp-uni/src/env.d.ts apps/miniapp-uni/index.html apps/miniapp-uni/package.json pnpm-lock.yaml
git commit -m "feat(miniapp-uni): vite/vitest config + uni 类型 stub + index.html"
```

---

## Task A4: manifest / project.config / pages.json

**Files:**
- Create: `apps/miniapp-uni/src/manifest.json`
- Create: `apps/miniapp-uni/project.config.json`
- Create: `apps/miniapp-uni/src/pages.json`

- [ ] **Step A4.1: 写 `src/manifest.json`**

```json
{
  "name": "实验室试剂",
  "appid": "",
  "description": "Lab reagent miniapp (uniapp + Vue3)",
  "versionName": "1.0.0",
  "versionCode": "100",
  "transformPx": false,
  "app-plus": {
    "usingComponents": true,
    "nvueStyleCompiler": "uni-app",
    "compilerVersion": 3,
    "splashscreen": {
      "alwaysShowBeforeRender": true,
      "waiting": true,
      "autoclose": true,
      "delay": 0
    },
    "modules": {},
    "distribute": {
      "android": { "permissions": [] },
      "ios": {},
      "sdkConfigs": {}
    }
  },
  "quickapp": {},
  "mp-weixin": {
    "appid": "touristappid",
    "setting": {
      "urlCheck": false
    },
    "usingComponents": true
  },
  "mp-alipay": {
    "usingComponents": true
  },
  "mp-baidu": {
    "usingComponents": true
  },
  "mp-toutiao": {
    "usingComponents": true
  },
  "uniStatistics": {
    "enable": false
  },
  "vueVersion": "3",
  "h5": {
    "router": {
      "mode": "hash"
    },
    "title": "实验室试剂"
  }
}
```

- [ ] **Step A4.2: 写 `project.config.json`**

```json
{
  "miniprogramRoot": "dist/dev/mp-weixin/",
  "projectname": "lab-reagent-miniapp-uni",
  "description": "Lab Reagent Miniapp (uniapp)",
  "appid": "touristappid",
  "setting": {
    "urlCheck": false,
    "es6": false,
    "enhance": true,
    "postcss": false,
    "minified": false,
    "newFeature": true,
    "autoAudits": false,
    "coverView": true,
    "showShadowRootInWxmlPanel": true
  },
  "compileType": "miniprogram",
  "libVersion": "2.19.4",
  "packOptions": { "ignore": [] },
  "debugOptions": { "hidedInDevtools": [] },
  "scripts": {},
  "staticServerOptions": { "baseURL": "", "servePath": "" },
  "editorSetting": { "tabIndent": "insertSpaces", "tabSize": 2 },
  "condition": {}
}
```

- [ ] **Step A4.3: 写 `src/pages.json`**

```json
{
  "pages": [
    {
      "path": "pages/login/index",
      "style": {
        "navigationBarTitleText": "登录",
        "enablePullDownRefresh": false,
        "navigationStyle": "custom",
        "app-plus": {
          "titleNView": false,
          "popGesture": "none",
          "bounce": "none"
        }
      }
    },
    {
      "path": "pages/home/index",
      "style": {
        "navigationBarTitleText": "工作台",
        "enablePullDownRefresh": false,
        "navigationStyle": "custom",
        "app-plus": { "titleNView": false }
      }
    },
    {
      "path": "pages/mine/index",
      "style": {
        "navigationBarTitleText": "我的",
        "enablePullDownRefresh": false,
        "navigationStyle": "custom",
        "app-plus": { "titleNView": false }
      }
    }
  ],
  "easycom": {
    "autoscan": true,
    "custom": {
      "^up-(.*)": "@/uni_modules/uview-plus/components/u-$1/u-$1.vue",
      "^u-([^-].*)": "@/uni_modules/uview-plus/components/u-$1/u-$1.vue"
    }
  },
  "globalStyle": {
    "navigationBarTextStyle": "black",
    "navigationBarTitleText": "实验室试剂",
    "navigationBarBackgroundColor": "#ffffff",
    "backgroundColor": "#f5f5f5"
  }
}
```

注意：**不写 `tabBar` 字段**（spec §4.2 修订项 2，与 Art-app 一致，自定义 tab-bar 在 Plan C 实现）。

- [ ] **Step A4.4: commit**

```bash
git add apps/miniapp-uni/src/manifest.json apps/miniapp-uni/project.config.json apps/miniapp-uni/src/pages.json
git commit -m "feat(miniapp-uni): manifest + pages.json (3 占位页 + easycom)"
```

---

## Task A5: 复制 uview-plus 并改 emerald 主题

**Files:**
- Copy: `apps/Art-app/src/uni_modules/uview-plus/` → `apps/miniapp-uni/src/uni_modules/uview-plus/`
- Modify: `apps/miniapp-uni/src/uni_modules/uview-plus/theme.scss`

- [ ] **Step A5.1: 复制整目录**

PowerShell:
```powershell
Copy-Item -Recurse "apps/Art-app/src/uni_modules/uview-plus" "apps/miniapp-uni/src/uni_modules/uview-plus"
```

或 bash:
```bash
cp -r apps/Art-app/src/uni_modules/uview-plus apps/miniapp-uni/src/uni_modules/uview-plus
```

- [ ] **Step A5.2: 同时复制 uni-scss / uni-popup / uni-transition**

uview-plus 依赖这三个 uni_modules 子模块。一并复制：

```powershell
Copy-Item -Recurse "apps/Art-app/src/uni_modules/uni-scss" "apps/miniapp-uni/src/uni_modules/uni-scss"
Copy-Item -Recurse "apps/Art-app/src/uni_modules/uni-popup" "apps/miniapp-uni/src/uni_modules/uni-popup"
Copy-Item -Recurse "apps/Art-app/src/uni_modules/uni-transition" "apps/miniapp-uni/src/uni_modules/uni-transition"
```

- [ ] **Step A5.3: 改 `src/uni_modules/uview-plus/theme.scss` 颜色**

把第 14-19 行的红色主题改成 emerald `#10b981`（spec §4.1）：

```scss
// 按钮主要颜色
$u-primary: #10b981;
$u-primary-dark: #059669;
$u-primary-disabled: #6ee7b7;
$u-primary-light: #d1fae5;
// 按钮的plain样式背景色
$u-button-plain-background-color: rgba(16, 185, 129, 0.20);
// 按钮高度
$u-button-u-button-height: 44px;
// 按钮 正常字体大小
$u-button-normal-font-size: 16px;
```

其他变量（warning/success/error/info、text/border 等）保留 uview-plus 默认值。

- [ ] **Step A5.4: 写 `src/uni.scss`**

仅放 uni 内置变量，**不放主题色**（spec §4.1：主题在 theme.scss 里改源文件，uni.scss 不参与）：

```scss
@import '@/uni_modules/uni-scss/variables.scss';

/* 颜色变量 */
$uni-color-primary: #007aff;
$uni-color-success: #4cd964;
$uni-color-warning: #f0ad4e;
$uni-color-error: #dd524d;

/* 文字基本颜色 */
$uni-text-color: #333;
$uni-text-color-inverse: #fff;
$uni-text-color-grey: #999;
$uni-text-color-placeholder: #808080;
$uni-text-color-disable: #c0c0c0;

/* 背景颜色 */
$uni-bg-color: #fff;
$uni-bg-color-grey: #f8f8f8;
$uni-bg-color-hover: #f1f1f1;
$uni-bg-color-mask: rgba(0, 0, 0, 0.4);

/* 边框颜色 */
$uni-border-color: #c8c7cc;

/* 文字尺寸 */
$uni-font-size-sm: 12px;
$uni-font-size-base: 14px;
$uni-font-size-lg: 16px;

/* Border Radius */
$uni-border-radius-sm: 2px;
$uni-border-radius-base: 3px;
$uni-border-radius-lg: 6px;
$uni-border-radius-circle: 50%;

/* 间距 */
$uni-spacing-row-sm: 5px;
$uni-spacing-row-base: 10px;
$uni-spacing-row-lg: 15px;
$uni-spacing-col-sm: 4px;
$uni-spacing-col-base: 8px;
$uni-spacing-col-lg: 12px;

/* 透明度 */
$uni-opacity-disabled: 0.3;

/* 安全区底部 */
@mixin safe-area-padding-bottom($extra: 0rpx) {
  padding-bottom: calc(constant(safe-area-inset-bottom) + #{$extra});
  padding-bottom: calc(env(safe-area-inset-bottom) + #{$extra});
}

$safe-area-bottom: env(safe-area-inset-bottom);
```

- [ ] **Step A5.5: commit**

```bash
git add apps/miniapp-uni/src/uni_modules apps/miniapp-uni/src/uni.scss
git commit -m "feat(miniapp-uni): 接入 uview-plus + emerald 主题（直接改 theme.scss）"
```

---

## Task A6: main.ts + App.vue + 全局样式

**Files:**
- Create: `apps/miniapp-uni/src/main.ts`
- Create: `apps/miniapp-uni/src/App.vue`
- Create: `apps/miniapp-uni/src/styles/common.scss`
- Create: `apps/miniapp-uni/src/styles/flex.scss`
- Create: `apps/miniapp-uni/src/styles/index.scss`

- [ ] **Step A6.1: 写 `src/styles/common.scss`**

```scss
page {
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC',
    'Helvetica Neue', Arial, sans-serif;
  font-size: 28rpx;
  line-height: 1.5;
  color: #303133;
  background-color: #f5f5f5;
}

view, text {
  box-sizing: border-box;
}

.text-primary { color: #10b981; }
.text-muted { color: #909193; }
.text-error { color: #f56c6c; }

.mt-8 { margin-top: 8rpx; }
.mt-16 { margin-top: 16rpx; }
.mt-24 { margin-top: 24rpx; }
.mt-32 { margin-top: 32rpx; }
.p-24 { padding: 24rpx; }
.p-32 { padding: 32rpx; }
```

- [ ] **Step A6.2: 写 `src/styles/flex.scss`**

```scss
.flex { display: flex; }
.flex-row { display: flex; flex-direction: row; }
.flex-col { display: flex; flex-direction: column; }
.flex-1 { flex: 1; }
.flex-center { display: flex; justify-content: center; align-items: center; }
.items-center { align-items: center; }
.items-start { align-items: flex-start; }
.items-end { align-items: flex-end; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.justify-end { justify-content: flex-end; }
.gap-8 { gap: 8rpx; }
.gap-16 { gap: 16rpx; }
.gap-24 { gap: 24rpx; }
```

- [ ] **Step A6.3: 写 `src/styles/index.scss`**

```scss
@import './common.scss';
@import './flex.scss';
```

- [ ] **Step A6.4: 写 `src/main.ts`**

```ts
import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import uviewPlus from '@/uni_modules/uview-plus';

export function createApp() {
  const app = createSSRApp(App);
  app.use(createPinia());
  app.use(uviewPlus);
  return { app };
}
```

注意：Pinia 持久化插件 + i18n 在 Plan B 接入；当前先打通最小 main.ts。

- [ ] **Step A6.5: 写 `src/App.vue`**

```vue
<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';

onLaunch(() => {
  console.log('App Launch');
});

onShow(() => {
  console.log('App Show');
});

onHide(() => {
  console.log('App Hide');
});
</script>

<style lang="scss">
@import '@/styles/index.scss';
</style>
```

- [ ] **Step A6.6: commit**

```bash
git add apps/miniapp-uni/src/main.ts apps/miniapp-uni/src/App.vue apps/miniapp-uni/src/styles
git commit -m "feat(miniapp-uni): main.ts + App.vue + 全局样式"
```

---

## Task A7: 占位三页

**Files:**
- Create: `apps/miniapp-uni/src/pages/login/index.vue`
- Create: `apps/miniapp-uni/src/pages/home/index.vue`
- Create: `apps/miniapp-uni/src/pages/mine/index.vue`

- [ ] **Step A7.1: 写 `src/pages/home/index.vue`**

```vue
<template>
  <view class="home p-32">
    <text class="title">miniapp-uni 占位首页</text>
    <view class="mt-32">
      <u-button type="primary" :text="$t ? 'Primary 按钮' : '主按钮'" @click="onTap" />
    </view>
    <view class="mt-16">
      <u-button :text="'env: ' + appEnv" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { env } from '@/config/env';

const appEnv = env.appEnv;

function onTap() {
  uni.showToast({ title: 'OK', icon: 'success' });
}
</script>

<style lang="scss" scoped>
.home {
  min-height: 100vh;
}
.title {
  font-size: 36rpx;
  font-weight: bold;
}
</style>
```

注意：模板里 `$t` 在 i18n 接入前不存在，用三元降级以避免编译报错；Plan B 接入 i18n 后简化为 `$t('home.title')`。

- [ ] **Step A7.2: 写 `src/pages/login/index.vue`**

```vue
<template>
  <view class="login p-32">
    <text class="title">登录（占位）</text>
    <view class="mt-32">
      <u-button type="primary" text="进入工作台" @click="goHome" />
    </view>
  </view>
</template>

<script setup lang="ts">
function goHome() {
  uni.reLaunch({ url: '/pages/home/index' });
}
</script>

<style lang="scss" scoped>
.login { min-height: 100vh; }
.title { font-size: 36rpx; font-weight: bold; }
</style>
```

- [ ] **Step A7.3: 写 `src/pages/mine/index.vue`**

```vue
<template>
  <view class="mine p-32">
    <text class="title">我的（占位）</text>
  </view>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
.mine { min-height: 100vh; }
.title { font-size: 36rpx; font-weight: bold; }
</style>
```

- [ ] **Step A7.4: commit**

```bash
git add apps/miniapp-uni/src/pages
git commit -m "feat(miniapp-uni): 占位三页（login/home/mine）"
```

---

## Task A8: dev:h5 启动验证（手工）

无代码改动，纯运行验证。

- [ ] **Step A8.1: 启动 dev server**

```bash
cd D:\Project\0417-any-demo
pnpm --filter @app/miniapp-uni dev:h5
```

预期输出：vite 在 `http://localhost:3003` 启动；浏览器自动打开。

- [ ] **Step A8.2: 浏览器打开 `http://localhost:3003/#/pages/home/index`**

预期看到：
- 标题"miniapp-uni 占位首页"
- 一个 emerald 色 `u-button`，文字"主按钮"或"Primary 按钮"
- 第二个按钮文字 "env: development"
- 点击主按钮弹出"OK"toast

如果按钮颜色不对（仍是默认蓝 #2979ff 或红 #b43535）：检查 theme.scss 修改是否生效；尝试停 dev server、`rm -rf node_modules/.vite` 后重启。

- [ ] **Step A8.3: 截图保留作为 commit log**（可选）

把首页截图存到 `apps/miniapp-uni/docs/screenshots/scaffold-home.png` 供后续对照。这一步可跳过。

---

## Task A9: Spike S1 — `@app/shared` 消费验证

**Files:**
- Create: `apps/miniapp-uni/src/__tests__/spike.test.ts`
- Modify: `apps/miniapp-uni/src/pages/home/index.vue`（验证后回滚）

- [ ] **Step A9.1: 在 home 页临时 import shared 类型**

修改 `src/pages/home/index.vue` 的 `<script setup>`：

```ts
import { env } from '@/config/env';
import type { AuthTokens, ApiResponse } from '@app/shared';

const appEnv = env.appEnv;

const _typeCheck: AuthTokens = { accessToken: 'a', refreshToken: 'b' };
const _typeCheck2: ApiResponse<string> = { code: 200, msg: 'ok', data: 'x' };
console.log(_typeCheck, _typeCheck2);

function onTap() {
  uni.showToast({ title: 'OK', icon: 'success' });
}
```

- [ ] **Step A9.2: 重启 dev:h5 验证编译通过**

```bash
pnpm --filter @app/miniapp-uni dev:h5
```

预期：无 "Cannot find module '@app/shared'" 错误。浏览器无报错，控制台打印两个对象。

如果失败（spec §9.0 S1 应急）：
1. 先尝试把 `apps/miniapp-uni/vite.config.ts` 加 `optimizeDeps: { include: ['@app/shared'] }`
2. 再不行：在 `tsconfig.json` 已配 `paths['@app/shared']` 应能避开 vite 的模块解析；如仍不行，临时用 `apps/miniapp-uni/src/types/shared.ts` 复制 5 个核心类型，加 TODO 跟进

- [ ] **Step A9.3: 回滚 home 页**

把 `src/pages/home/index.vue` 的 `<script setup>` 恢复到 Task A7.1 的版本（去掉 `_typeCheck` 行，保留 import 但只用于后续）：

```ts
import { env } from '@/config/env';

const appEnv = env.appEnv;

function onTap() {
  uni.showToast({ title: 'OK', icon: 'success' });
}
```

- [ ] **Step A9.4: 写 spike 文件 `src/__tests__/spike.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import type { AuthTokens, ApiResponse } from '@app/shared';

describe('Phase 0 S1: @app/shared 消费', () => {
  it('能 import AuthTokens 与 ApiResponse 类型', () => {
    const tokens: AuthTokens = { accessToken: 'a', refreshToken: 'b' };
    const res: ApiResponse<string> = { code: 200, msg: 'ok', data: 'x' };
    expect(tokens.accessToken).toBe('a');
    expect(res.code).toBe(200);
  });
});
```

预期：`pnpm --filter @app/miniapp-uni test` 单用例通过（Step A10 一起跑）。

---

## Task A10: Spike S2 — vitest 在 uniapp+vue3 跑通

**Files:**
- Modify: `apps/miniapp-uni/src/__tests__/spike.test.ts`

- [ ] **Step A10.1: 追加 store + jsdom 用例**

在 `src/__tests__/spike.test.ts` 末尾追加：

```ts
import { setActivePinia, createPinia, defineStore } from 'pinia';
import { ref } from 'vue';

describe('Phase 0 S2: vitest + pinia + vue3 reactivity', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('store getter/setter 工作', () => {
    const useCounter = defineStore('counter', () => {
      const n = ref(0);
      function inc() { n.value++; }
      return { n, inc };
    });
    const c = useCounter();
    expect(c.n).toBe(0);
    c.inc();
    c.inc();
    expect(c.n).toBe(2);
  });

  it('全局 mock uni 已注入', () => {
    expect((globalThis as any).uni).toBeDefined();
    expect(typeof (globalThis as any).uni.showToast).toBe('function');
  });
});
```

- [ ] **Step A10.2: 运行 vitest**

```bash
cd D:\Project\0417-any-demo
pnpm --filter @app/miniapp-uni test
```

预期输出：3 用例 pass（S1 1 个 + S2 2 个）。

如果失败（spec §9.0 S2 应急）：
- jsdom 缺失：`pnpm add -D jsdom` 已在 Task A1 加了，确认 lockfile 包含
- pinia 兼容：直接降级 `pinia@2.x`
- 都不行：整个测试基线降级用 jest（参考 `apps/api/jest.config.ts`），重写 vitest.config.ts → jest.config.ts

- [ ] **Step A10.3: commit**

```bash
git add apps/miniapp-uni/src/__tests__/spike.test.ts apps/miniapp-uni/src/pages/home/index.vue
git commit -m "test(miniapp-uni): Phase 0 spike S1 (@app/shared) + S2 (vitest)"
```

---

## Task A11: Spike S3 — vue-i18n 在 alpha 通道兼容

**Files:**
- Modify: `apps/miniapp-uni/src/main.ts`
- Modify: `apps/miniapp-uni/src/pages/home/index.vue`
- Modify: `apps/miniapp-uni/src/__tests__/spike.test.ts`

- [ ] **Step A11.1: 临时在 main.ts 注册 vue-i18n**

```ts
import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import App from './App.vue';
import uviewPlus from '@/uni_modules/uview-plus';

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': { spike: { hello: '你好' } },
    en: { spike: { hello: 'Hello' } },
  },
});

export function createApp() {
  const app = createSSRApp(App);
  app.use(createPinia());
  app.use(uviewPlus);
  app.use(i18n);
  return { app };
}
```

- [ ] **Step A11.2: home 页验证 `$t` 工作**

修改 `src/pages/home/index.vue` 的 template，把 `主按钮` 占位改成：

```vue
<template>
  <view class="home p-32">
    <text class="title">miniapp-uni 占位首页</text>
    <view class="mt-32">
      <u-button type="primary" :text="$t('spike.hello')" @click="onTap" />
    </view>
    <view class="mt-16">
      <u-button :text="'env: ' + appEnv" @click="toggleLocale" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { env } from '@/config/env';

const { locale } = useI18n();
const appEnv = env.appEnv;

function onTap() {
  uni.showToast({ title: 'OK', icon: 'success' });
}

function toggleLocale() {
  locale.value = locale.value === 'zh-CN' ? 'en' : 'zh-CN';
}
</script>
```

- [ ] **Step A11.3: 浏览器手工验证**

```bash
pnpm --filter @app/miniapp-uni dev:h5
```

预期：
- 主按钮文字"你好"
- 点击 "env: development" 按钮 → 主按钮文字切换到 "Hello"，再点切回"你好"

如果失败（spec §9.0 S3 应急）：
- 报错 `Cannot find injection 'i18n'`：vue-i18n 9 与 alpha 兼容问题；改 `legacy: true` 试试
- 仍不行：降级 i18n 为自实现工具 `locale/index.ts` 的 `t(key)` 函数，参考 spec §9.0 S3 失败方向

- [ ] **Step A11.4: 在 spike 文件追加单测**

在 `src/__tests__/spike.test.ts` 末尾追加：

```ts
import { createI18n } from 'vue-i18n';

describe('Phase 0 S3: vue-i18n 兼容', () => {
  it('createI18n + t() 工作', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'zh-CN',
      fallbackLocale: 'zh-CN',
      messages: {
        'zh-CN': { hello: '你好' },
        en: { hello: 'Hello' },
      },
    });
    expect(i18n.global.t('hello')).toBe('你好');
    i18n.global.locale.value = 'en';
    expect(i18n.global.t('hello')).toBe('Hello');
  });
});
```

- [ ] **Step A11.5: 运行 vitest**

```bash
pnpm --filter @app/miniapp-uni test
```

预期：4 用例全过。

- [ ] **Step A11.6: commit**

```bash
git add apps/miniapp-uni/src/main.ts apps/miniapp-uni/src/pages/home/index.vue apps/miniapp-uni/src/__tests__/spike.test.ts
git commit -m "test(miniapp-uni): Phase 0 spike S3 (vue-i18n) + 占位 i18n 接入"
```

---

## Task A12: 收尾 + commit 标记 plan A 完成

- [ ] **Step A12.1: 在仓库根写一份简短的 README 段落**

修改根 `README.md`（如不存在则创建），在合适位置加一节：

```markdown
## apps/miniapp-uni（重构中）

uniapp + Vue3 + TS + uview-plus 重写的 miniapp，与老 `apps/miniapp` 并存。
- `pnpm --filter @app/miniapp-uni dev:h5` 启动
- `pnpm --filter @app/miniapp-uni test` 跑测试
- 见 `docs/superpowers/plans/2026-05-14-miniapp-uni-INDEX.md`
```

如果根 README 已经很长，跳过这步，把说明放进 `apps/miniapp-uni/README.md`：

```markdown
# @app/miniapp-uni

uniapp + Vue3 + TS + uview-plus 工程。重构 `apps/miniapp` 的目标产物。

## 命令
- `pnpm dev:h5` — H5 dev server (port 3003)
- `pnpm dev:mp-weixin` — 微信小程序 dev（产物 `dist/dev/mp-weixin/`，用微信开发者工具打开）
- `pnpm build:h5` / `pnpm build:mp-weixin` — 生产构建
- `pnpm test` — vitest 跑测试

## 实施计划
见 `../../docs/superpowers/plans/2026-05-14-miniapp-uni-INDEX.md`
```

- [ ] **Step A12.2: 验证 git 干净**

```bash
git status --short
```

预期：无 untracked 与 unstaged 文件（除 dist/ 和 node_modules/）。

- [ ] **Step A12.3: 跑一遍最终 acceptance**

```bash
pnpm --filter @app/miniapp-uni test
pnpm --filter @app/miniapp-uni build:h5
```

预期：
- vitest 4 用例全过
- build:h5 成功，产物在 `dist/build/h5/`

- [ ] **Step A12.4: commit**

```bash
git add apps/miniapp-uni/README.md README.md
git commit -m "docs(miniapp-uni): README + plan A 完成"
```

---

## Plan A 验收标准

完成本 plan 后必须满足：

1. ✅ `pnpm --filter @app/miniapp-uni dev:h5` 可启动，浏览器打开 home 页看到带 emerald 色的 `u-button`
2. ✅ home 页点击 "env: development" 按钮可切换主按钮中英文（i18n 占位工作）
3. ✅ `pnpm --filter @app/miniapp-uni test` 至少 4 用例全过（S1 + S2×2 + S3）
4. ✅ `pnpm --filter @app/miniapp-uni build:h5` 成功，产物 < 2 MB
5. ✅ Phase 0 三个 spike 全过；如有任一退化方案启用，已在 spec §9.0 与本 plan 对应 task 注解
6. ✅ 老 `apps/miniapp`（Taro）仍可 `pnpm --filter @app/miniapp dev:h5`，不受影响

完成验收后即可进入 [Plan B（基建）](./2026-05-14-miniapp-uni-b-infra.md)。
