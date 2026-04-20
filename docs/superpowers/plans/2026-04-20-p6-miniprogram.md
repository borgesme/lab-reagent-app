# P6 · 小程序端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 monorepo 新增 `apps/miniapp/`（Taro 3.6 + React 18 + TypeScript），双端构建（H5 + 微信 weapp），复用 P1-P5 既有 API，交付 5 个高频场景（工作台 / 搜索 / 申请 / 审批 / 消息）。

**Architecture:** 小程序端以 workspace package `@app/miniapp` 接入 pnpm monorepo；不改 API，不改 Web；仅与 `@app/shared` 共享类型。底部 4 tab + 独立 login 页 + 独立 search 页；zustand 管理 token/user 并持久化到 `Taro.setStorageSync`；未登录或 401 自动 `reLaunch` 登录页。

**Tech Stack:** Taro 3.6 / React 18.3 / TypeScript 5.4 / zustand 4.5（均与 Web 对齐）。构建器 webpack5；babel-preset-taro；无 UI 组件库；无自动化测试。

**Spec:** `docs/superpowers/specs/2026-04-20-p6-miniprogram-design.md`

**Prerequisites:** P5 完成（tag `p5-complete`）。根 `pnpm-workspace.yaml` 已通配 `apps/*` 无需改动。API 本地可启（`pnpm run dev:api` 监听 3001）。

---

## File Structure

```
apps/miniapp/                     # NEW workspace 包
├── .gitignore
├── babel.config.js
├── config/
│   ├── index.ts                  # Taro 主配置
│   ├── dev.ts                    # 开发模式覆盖
│   └── prod.ts                   # 生产模式覆盖
├── package.json
├── project.config.json           # 微信开发者工具项目元信息
├── tsconfig.json
└── src/
    ├── app.tsx                   # 根组件：hydrate + 未登录跳转
    ├── app.config.ts             # 路由 + tabBar
    ├── index.html                # H5 HTML 模板
    ├── lib/
    │   ├── api-client.ts         # 基于 Taro.request 的 apiRequest
    │   └── auth-store.ts         # zustand + Taro.setStorageSync
    └── pages/
        ├── login/
        │   ├── index.tsx
        │   └── index.config.ts
        ├── home/
        │   ├── index.tsx
        │   └── index.config.ts
        ├── search/
        │   ├── index.tsx
        │   └── index.config.ts
        ├── my-requests/
        │   ├── index.tsx
        │   └── index.config.ts
        ├── approvals/
        │   ├── index.tsx
        │   └── index.config.ts
        └── notifications/
            ├── index.tsx
            └── index.config.ts

package.json                      # MODIFY 根：+ dev:mp / build:mp 脚本
```

每个页面一个独立目录，文件只有两个（`index.tsx` + `index.config.ts`），职责清晰不过 ~250 行。

---

## Task 1: 新增 `apps/miniapp` 工程骨架

**Files:**
- Create: `apps/miniapp/package.json`
- Create: `apps/miniapp/tsconfig.json`
- Create: `apps/miniapp/babel.config.js`
- Create: `apps/miniapp/project.config.json`
- Create: `apps/miniapp/.gitignore`

- [ ] **Step 1: 创建 package.json**

Create `apps/miniapp/package.json`:

```json
{
  "name": "@app/miniapp",
  "version": "0.1.0",
  "private": true,
  "description": "Lab reagent miniapp (Taro + React)",
  "scripts": {
    "dev:h5": "taro build --type h5 --watch",
    "dev:weapp": "taro build --type weapp --watch",
    "build:h5": "taro build --type h5",
    "build:weapp": "taro build --type weapp"
  },
  "browserslist": ["defaults", "not ie 11"],
  "dependencies": {
    "@app/shared": "workspace:*",
    "@babel/runtime": "^7.24.0",
    "@tarojs/components": "^3.6.25",
    "@tarojs/helper": "^3.6.25",
    "@tarojs/plugin-framework-react": "^3.6.25",
    "@tarojs/plugin-platform-h5": "^3.6.25",
    "@tarojs/plugin-platform-weapp": "^3.6.25",
    "@tarojs/react": "^3.6.25",
    "@tarojs/runtime": "^3.6.25",
    "@tarojs/shared": "^3.6.25",
    "@tarojs/taro": "^3.6.25",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "zustand": "4.5.2"
  },
  "devDependencies": {
    "@babel/core": "^7.24.0",
    "@tarojs/cli": "^3.6.25",
    "@tarojs/webpack5-runner": "^3.6.25",
    "@types/react": "18.2.73",
    "@types/react-dom": "18.2.23",
    "babel-preset-taro": "^3.6.25",
    "typescript": "5.4.5"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

Create `apps/miniapp/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2019",
    "lib": ["DOM", "ES2019"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowJs": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowSyntheticDefaultImports": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "types": ["@tarojs/taro"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: 创建 babel.config.js**

Create `apps/miniapp/babel.config.js`:

```js
module.exports = {
  presets: [
    [
      'taro',
      {
        framework: 'react',
        ts: true,
        reactJsxRuntime: 'automatic',
      },
    ],
  ],
};
```

- [ ] **Step 4: 创建 project.config.json（微信开发者工具项目元信息）**

Create `apps/miniapp/project.config.json`:

```json
{
  "miniprogramRoot": "dist/",
  "projectname": "lab-reagent-miniapp",
  "description": "Lab Reagent Miniapp",
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

> `appid: "touristappid"` 表示游客模式（不强校验合法域名），对 demo 足够；若要真实发布需替换为自己的 AppID。

- [ ] **Step 5: 创建 .gitignore**

Create `apps/miniapp/.gitignore`:

```
dist/
node_modules/
.DS_Store
*.log
```

- [ ] **Step 6: 提交**

```bash
cd D:/Project/0417-any-demo
git add apps/miniapp/package.json apps/miniapp/tsconfig.json apps/miniapp/babel.config.js apps/miniapp/project.config.json apps/miniapp/.gitignore
git commit -m "feat(miniapp): scaffold Taro workspace package"
```

---

## Task 2: Taro 构建配置

**Files:**
- Create: `apps/miniapp/config/index.ts`
- Create: `apps/miniapp/config/dev.ts`
- Create: `apps/miniapp/config/prod.ts`
- Create: `apps/miniapp/src/index.html`

- [ ] **Step 1: 主配置 config/index.ts**

Create `apps/miniapp/config/index.ts`:

```ts
import path from 'path';

const config = {
  projectName: 'miniapp',
  date: '2026-04-20',
  designWidth: 750,
  deviceRatio: { 640: 2.34 / 2, 750: 1, 828: 1.81 / 2 },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [],
  defineConstants: {
    'process.env.TARO_APP_API_BASE': JSON.stringify(
      process.env.TARO_APP_API_BASE ?? 'http://localhost:3001/api/v1',
    ),
  },
  copy: { patterns: [], options: {} },
  framework: 'react',
  compiler: 'webpack5',
  cache: { enable: false },
  alias: {
    '@': path.resolve(__dirname, '..', 'src'),
  },
  mini: {
    postcss: {
      pxtransform: { enable: true, config: {} },
      url: { enable: true, config: { limit: 1024 } },
      cssModules: { enable: false },
    },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    esnextModules: ['@app/shared'],
    postcss: {
      autoprefixer: { enable: true, config: {} },
      cssModules: { enable: false },
    },
  },
};

export default function (merge: (a: any, b: any) => any) {
  if (process.env.NODE_ENV === 'development') {
    return merge({}, config, require('./dev').default);
  }
  return merge({}, config, require('./prod').default);
}
```

- [ ] **Step 2: dev / prod 覆盖**

Create `apps/miniapp/config/dev.ts`:

```ts
export default {
  mini: {},
  h5: { devServer: { host: '0.0.0.0', port: 10086 } },
};
```

Create `apps/miniapp/config/prod.ts`:

```ts
export default { mini: {}, h5: {} };
```

- [ ] **Step 3: H5 HTML 模板**

Create `apps/miniapp/src/index.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
    <title>实验室试剂</title>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
```

- [ ] **Step 4: 提交**

```bash
cd D:/Project/0417-any-demo
git add apps/miniapp/config apps/miniapp/src/index.html
git commit -m "feat(miniapp): add Taro build config and H5 template"
```

---

## Task 3: 根 package.json 脚本 + 安装依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 在根 package.json 加脚本**

Modify `package.json` — 在 scripts 块追加 `dev:mp` / `build:mp`：

```json
"scripts": {
  "dev:api": "pnpm --filter @app/api start:dev",
  "dev:web": "pnpm --filter @app/web dev",
  "dev:mp": "pnpm --filter @app/miniapp dev:h5",
  "build:mp": "pnpm --filter @app/miniapp build:weapp",
  "test": "pnpm -r test",
  "lint": "pnpm -r lint",
  "build": "pnpm -r build",
  "db:up": "docker compose up -d postgres redis",
  "db:down": "docker compose down"
}
```

- [ ] **Step 2: 根目录安装依赖**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm install 2>&1 | tail -20
```

Expected: 输出显示 miniapp 的 Taro 生态依赖与 react 均落地到 `apps/miniapp/node_modules`。无报错退出。

若有版本不兼容（例如 Taro 3.6.25 对 React 18.3 报 peer warning），可接受。

- [ ] **Step 3: 验证 taro CLI 可调用**

Run:
```bash
cd D:/Project/0417-any-demo/apps/miniapp && pnpm exec taro --version 2>&1
```

Expected: 打印 `3.6.x` 版本号。

- [ ] **Step 4: 提交**

```bash
cd D:/Project/0417-any-demo
git add package.json pnpm-lock.yaml
git commit -m "chore: add miniapp scripts and lock deps"
```

---

## Task 4: 核心工具 — api-client + auth-store

**Files:**
- Create: `apps/miniapp/src/lib/auth-store.ts`
- Create: `apps/miniapp/src/lib/api-client.ts`

- [ ] **Step 1: auth-store.ts**

Create `apps/miniapp/src/lib/auth-store.ts`:

```ts
import { create } from 'zustand';
import Taro from '@tarojs/taro';
import type { AuthTokens, UserSummary } from '@app/shared';

interface AuthState {
  tokens: AuthTokens | null;
  user: UserSummary | null;
  setSession: (tokens: AuthTokens, user: UserSummary) => void;
  clear: () => void;
  hydrate: () => void;
}

const KEY_TOKENS = 'mp.tokens';
const KEY_USER = 'mp.user';

export const useAuth = create<AuthState>((set) => ({
  tokens: null,
  user: null,
  setSession: (tokens, user) => {
    Taro.setStorageSync(KEY_TOKENS, tokens);
    Taro.setStorageSync(KEY_USER, user);
    set({ tokens, user });
  },
  clear: () => {
    Taro.removeStorageSync(KEY_TOKENS);
    Taro.removeStorageSync(KEY_USER);
    set({ tokens: null, user: null });
  },
  hydrate: () => {
    try {
      const t = Taro.getStorageSync(KEY_TOKENS);
      const u = Taro.getStorageSync(KEY_USER);
      if (t && u) set({ tokens: t, user: u });
    } catch {
      // 首次启动无存储，忽略
    }
  },
}));
```

- [ ] **Step 2: api-client.ts**

Create `apps/miniapp/src/lib/api-client.ts`:

```ts
import Taro from '@tarojs/taro';
import { useAuth } from './auth-store';

export const apiBaseUrl =
  (process.env.TARO_APP_API_BASE as string | undefined) ??
  'http://localhost:3001/api/v1';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function apiRequest<T = any>(
  path: string,
  opts: { method?: Method; data?: any } = {},
): Promise<T> {
  const { tokens, clear } = useAuth.getState();
  const res = await Taro.request<T>({
    url: `${apiBaseUrl}${path}`,
    method: opts.method ?? 'GET',
    data: opts.data,
    header: {
      'Content-Type': 'application/json',
      ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    },
  });
  if (res.statusCode === 401) {
    clear();
    Taro.reLaunch({ url: '/pages/login/index' });
    throw new Error('未登录或会话失效');
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const msg =
      typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    throw new Error(`API ${res.statusCode}: ${msg}`);
  }
  return res.data;
}
```

- [ ] **Step 3: 提交**

```bash
cd D:/Project/0417-any-demo
git add apps/miniapp/src/lib
git commit -m "feat(miniapp): add api-client and auth-store"
```

---

## Task 5: 应用根 — app.tsx + app.config.ts

**Files:**
- Create: `apps/miniapp/src/app.tsx`
- Create: `apps/miniapp/src/app.config.ts`

- [ ] **Step 1: app.config.ts（路由 + tabBar）**

Create `apps/miniapp/src/app.config.ts`:

```ts
export default defineAppConfig({
  pages: [
    'pages/login/index',
    'pages/home/index',
    'pages/search/index',
    'pages/my-requests/index',
    'pages/approvals/index',
    'pages/notifications/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '实验室试剂',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    color: '#888888',
    selectedColor: '#1677ff',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      { pagePath: 'pages/home/index', text: '工作台' },
      { pagePath: 'pages/my-requests/index', text: '申请' },
      { pagePath: 'pages/approvals/index', text: '审批' },
      { pagePath: 'pages/notifications/index', text: '消息' },
    ],
  },
});
```

- [ ] **Step 2: app.tsx（根组件 + hydrate）**

Create `apps/miniapp/src/app.tsx`:

```tsx
import { PropsWithChildren, useEffect } from 'react';
import Taro from '@tarojs/taro';
import { useAuth } from './lib/auth-store';

function App({ children }: PropsWithChildren) {
  useEffect(() => {
    useAuth.getState().hydrate();
  }, []);

  const tokens = useAuth((s) => s.tokens);
  useEffect(() => {
    if (tokens) return;
    const current = Taro.getCurrentInstance().router?.path;
    if (current && !current.includes('/pages/login/')) {
      Taro.reLaunch({ url: '/pages/login/index' });
    }
  }, [tokens]);

  return children as any;
}

export default App;
```

> 说明：小程序没有浏览器 history；用 `Taro.getCurrentInstance().router` 判断当前路径，避免已在 login 页时重复 reLaunch。

- [ ] **Step 3: 提交**

```bash
cd D:/Project/0417-any-demo
git add apps/miniapp/src/app.tsx apps/miniapp/src/app.config.ts
git commit -m "feat(miniapp): add app root with auth hydration"
```

---

## Task 6: 登录页

**Files:**
- Create: `apps/miniapp/src/pages/login/index.tsx`
- Create: `apps/miniapp/src/pages/login/index.config.ts`

- [ ] **Step 1: login index.config.ts**

Create `apps/miniapp/src/pages/login/index.config.ts`:

```ts
export default definePageConfig({
  navigationBarTitleText: '登录',
});
```

- [ ] **Step 2: login index.tsx**

Create `apps/miniapp/src/pages/login/index.tsx`:

```tsx
import { useState } from 'react';
import Taro from '@tarojs/taro';
import { View, Text, Input, Button } from '@tarojs/components';
import type { AuthTokens, UserSummary } from '@app/shared';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@lab.local');
  const [password, setPassword] = useState('admin123');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setSession = useAuth((s) => s.setSession);

  async function submit() {
    setLoading(true);
    setErr(null);
    try {
      const tokens = await apiRequest<AuthTokens>('/auth/login', {
        method: 'POST',
        data: { email, password },
      });
      const minimalUser: UserSummary = {
        id: '',
        email,
        name: email,
        roles: [],
        labId: null,
      };
      setSession(tokens, minimalUser);
      Taro.switchTab({ url: '/pages/home/index' });
    } catch (e: any) {
      setErr(e.message ?? '登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ padding: '48rpx' }}>
      <Text style={{ fontSize: '40rpx', fontWeight: 'bold' }}>实验室试剂</Text>
      <View style={{ marginTop: '32rpx' }}>
        <Text>邮箱</Text>
        <Input
          value={email}
          onInput={(e) => setEmail(e.detail.value)}
          placeholder="admin@lab.local"
          style={{
            border: '1rpx solid #ccc',
            padding: '12rpx',
            marginTop: '8rpx',
          }}
        />
      </View>
      <View style={{ marginTop: '16rpx' }}>
        <Text>密码</Text>
        <Input
          password
          value={password}
          onInput={(e) => setPassword(e.detail.value)}
          placeholder="admin123"
          style={{
            border: '1rpx solid #ccc',
            padding: '12rpx',
            marginTop: '8rpx',
          }}
        />
      </View>
      {err && (
        <View style={{ color: '#d33', marginTop: '16rpx' }}>
          <Text>{err}</Text>
        </View>
      )}
      <Button
        type="primary"
        loading={loading}
        onClick={submit}
        style={{ marginTop: '32rpx' }}
      >
        登录
      </Button>
    </View>
  );
}
```

> 注：Taro 的 `Input.onInput` 事件对象类型是 `BaseEventOrigFunction<...>`，`e.detail.value` 可用。API 当前不提供 `/auth/me`，所以 login 后先用 `{ id: '', email, name: email, roles: [], labId: null }` 作为 `UserSummary` 占位（与 Web 同策略），页面里仅做问候语展示。

- [ ] **Step 3: 提交**

```bash
cd D:/Project/0417-any-demo
git add apps/miniapp/src/pages/login
git commit -m "feat(miniapp): add login page"
```

---

## Task 7: 工作台（home）

**Files:**
- Create: `apps/miniapp/src/pages/home/index.tsx`
- Create: `apps/miniapp/src/pages/home/index.config.ts`

- [ ] **Step 1: home index.config.ts**

Create `apps/miniapp/src/pages/home/index.config.ts`:

```ts
export default definePageConfig({
  navigationBarTitleText: '工作台',
});
```

- [ ] **Step 2: home index.tsx**

Create `apps/miniapp/src/pages/home/index.tsx`:

```tsx
import { useState } from 'react';
import Taro, { useDidShow } from '@tarojs/taro';
import { View, Text, Input, Button } from '@tarojs/components';
import type { NotificationSummary } from '@app/shared';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';

export default function HomePage() {
  const user = useAuth((s) => s.user);
  const [unread, setUnread] = useState(0);
  const [keyword, setKeyword] = useState('');

  async function refresh() {
    try {
      const list = await apiRequest<NotificationSummary[]>(
        '/notifications?unreadOnly=true',
      );
      setUnread(list.length);
    } catch {
      // 未登录时 401 已自动跳转，无需处理
    }
  }

  useDidShow(() => {
    refresh();
  });

  function goSearch() {
    const q = keyword.trim();
    Taro.navigateTo({
      url: `/pages/search/index?q=${encodeURIComponent(q)}`,
    });
  }

  return (
    <View style={{ padding: '32rpx' }}>
      <Text style={{ fontSize: '36rpx', fontWeight: 'bold' }}>
        {user ? `你好，${user.name}` : '未登录'}
      </Text>
      {user && (
        <Text style={{ display: 'block', color: '#666', marginTop: '8rpx' }}>
          实验室 {user.labId ?? '未分配'}
        </Text>
      )}

      <View
        style={{
          marginTop: '32rpx',
          padding: '20rpx',
          border: '1rpx solid #ddd',
          borderRadius: '8rpx',
        }}
      >
        <Text style={{ fontWeight: 'bold' }}>搜索试剂</Text>
        <Input
          value={keyword}
          onInput={(e) => setKeyword(e.detail.value)}
          placeholder="试剂名称关键词"
          style={{
            border: '1rpx solid #ccc',
            padding: '12rpx',
            marginTop: '12rpx',
          }}
        />
        <Button
          type="primary"
          size="mini"
          onClick={goSearch}
          style={{ marginTop: '12rpx' }}
        >
          搜索
        </Button>
      </View>

      <View
        style={{
          marginTop: '24rpx',
          padding: '20rpx',
          border: '1rpx solid #ddd',
          borderRadius: '8rpx',
        }}
      >
        <Text style={{ fontWeight: 'bold' }}>未读消息：{unread}</Text>
        <Button
          size="mini"
          style={{ marginTop: '12rpx' }}
          onClick={() =>
            Taro.switchTab({ url: '/pages/notifications/index' })
          }
        >
          查看消息
        </Button>
      </View>

      <View
        style={{
          marginTop: '24rpx',
          padding: '20rpx',
          border: '1rpx solid #ddd',
          borderRadius: '8rpx',
        }}
      >
        <Text style={{ fontWeight: 'bold' }}>快捷入口</Text>
        <Button
          size="mini"
          style={{ marginTop: '12rpx' }}
          onClick={() => Taro.switchTab({ url: '/pages/my-requests/index' })}
        >
          我的申请
        </Button>
        <Button
          size="mini"
          style={{ marginTop: '12rpx' }}
          onClick={() => Taro.switchTab({ url: '/pages/approvals/index' })}
        >
          待办审批
        </Button>
      </View>
    </View>
  );
}
```

- [ ] **Step 3: 提交**

```bash
cd D:/Project/0417-any-demo
git add apps/miniapp/src/pages/home
git commit -m "feat(miniapp): add home page with search entry and unread count"
```

---

## Task 8: 搜索页

**Files:**
- Create: `apps/miniapp/src/pages/search/index.tsx`
- Create: `apps/miniapp/src/pages/search/index.config.ts`

- [ ] **Step 1: search index.config.ts**

Create `apps/miniapp/src/pages/search/index.config.ts`:

```ts
export default definePageConfig({
  navigationBarTitleText: '试剂搜索',
});
```

- [ ] **Step 2: search index.tsx**

Create `apps/miniapp/src/pages/search/index.tsx`:

```tsx
import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import { View, Text, Input, Button } from '@tarojs/components';
import type { ReagentSummary } from '@app/shared';
import { apiRequest } from '@/lib/api-client';

export default function SearchPage() {
  const [keyword, setKeyword] = useState('');
  const [items, setItems] = useState<ReagentSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function search(q: string) {
    setErr(null);
    try {
      const path = q ? `/reagents?q=${encodeURIComponent(q)}` : '/reagents';
      const data = await apiRequest<ReagentSummary[]>(path);
      setItems(data);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    const router = Taro.getCurrentInstance().router;
    const q = (router?.params?.q as string | undefined) ?? '';
    setKeyword(q);
    search(q);
  }, []);

  return (
    <View style={{ padding: '24rpx' }}>
      <View style={{ display: 'flex', alignItems: 'center' }}>
        <Input
          value={keyword}
          onInput={(e) => setKeyword(e.detail.value)}
          placeholder="试剂名称关键词"
          style={{
            flex: 1,
            border: '1rpx solid #ccc',
            padding: '12rpx',
          }}
        />
        <Button
          size="mini"
          type="primary"
          onClick={() => search(keyword.trim())}
          style={{ marginLeft: '12rpx' }}
        >
          搜索
        </Button>
      </View>

      {err && (
        <Text style={{ color: '#d33', display: 'block', marginTop: '16rpx' }}>
          {err}
        </Text>
      )}

      <View style={{ marginTop: '24rpx' }}>
        {items.length === 0 && (
          <Text style={{ color: '#888' }}>无结果</Text>
        )}
        {items.map((r) => (
          <View
            key={r.id}
            style={{
              padding: '16rpx',
              border: '1rpx solid #eee',
              marginBottom: '12rpx',
              borderRadius: '6rpx',
            }}
          >
            <Text style={{ fontWeight: 'bold' }}>{r.name}</Text>
            {r.cas && (
              <Text style={{ display: 'block', color: '#666' }}>
                CAS: {r.cas}
              </Text>
            )}
            <Text style={{ display: 'block', color: '#888' }}>
              等级：{r.hazardLevel}
              {r.controlType ? `（管控：${r.controlType}）` : ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 3: 提交**

```bash
cd D:/Project/0417-any-demo
git add apps/miniapp/src/pages/search
git commit -m "feat(miniapp): add reagent search page"
```

---

## Task 9: 我的申请（领用 + 采购）

**Files:**
- Create: `apps/miniapp/src/pages/my-requests/index.tsx`
- Create: `apps/miniapp/src/pages/my-requests/index.config.ts`

- [ ] **Step 1: my-requests index.config.ts**

Create `apps/miniapp/src/pages/my-requests/index.config.ts`:

```ts
export default definePageConfig({
  navigationBarTitleText: '我的申请',
});
```

- [ ] **Step 2: my-requests index.tsx**

Create `apps/miniapp/src/pages/my-requests/index.tsx`:

```tsx
import { useState } from 'react';
import { useDidShow } from '@tarojs/taro';
import { View, Text, Button, Input, Textarea, Picker } from '@tarojs/components';
import type {
  ReagentSummary,
  StockSummary,
  RequestSummary,
  PurchaseRequestSummary,
} from '@app/shared';
import { apiRequest } from '@/lib/api-client';

type ReqRow = RequestSummary & {
  reagent?: { name: string; hazardLevel?: string; controlType?: string | null };
};
type PurRow = PurchaseRequestSummary & {
  reagent?: { name: string } | null;
};

export default function MyRequestsPage() {
  const [tab, setTab] = useState<'use' | 'purchase'>('use');
  const [reqs, setReqs] = useState<ReqRow[]>([]);
  const [purs, setPurs] = useState<PurRow[]>([]);
  const [reagents, setReagents] = useState<ReagentSummary[]>([]);
  const [stocks, setStocks] = useState<StockSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [useForm, setUseForm] = useState({
    reagentIdx: -1,
    stockIdx: -1,
    quantity: '',
    unit: 'mL',
    purpose: '',
  });

  const [purForm, setPurForm] = useState({
    reagentIdx: -1,
    quantity: '',
    unit: 'mL',
    reason: '',
  });

  async function refresh() {
    try {
      const [r, p, rs, st] = await Promise.all([
        apiRequest<ReqRow[]>('/requests'),
        apiRequest<PurRow[]>('/purchases/mine'),
        apiRequest<ReagentSummary[]>('/reagents'),
        apiRequest<StockSummary[]>('/stocks'),
      ]);
      setReqs(r);
      setPurs(p);
      setReagents(rs);
      setStocks(st);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useDidShow(() => {
    refresh();
  });

  const useReagent = reagents[useForm.reagentIdx];
  const useStocks = stocks.filter(
    (s) => !useReagent || s.reagentId === useReagent.id,
  );
  const controlled =
    useReagent &&
    (useReagent.hazardLevel === 'CONTROLLED' || !!useReagent.controlType);

  async function submitUse() {
    if (controlled) {
      setErr('管控试剂请到 Web 端提交完整信息');
      return;
    }
    const r = reagents[useForm.reagentIdx];
    const s = useStocks[useForm.stockIdx];
    if (!r || !s) {
      setErr('请选择试剂与批次');
      return;
    }
    try {
      await apiRequest('/requests', {
        method: 'POST',
        data: {
          reagentId: r.id,
          stockId: s.id,
          quantity: useForm.quantity,
          unit: useForm.unit,
          purpose: useForm.purpose,
        },
      });
      setUseForm({
        reagentIdx: -1,
        stockIdx: -1,
        quantity: '',
        unit: 'mL',
        purpose: '',
      });
      setErr(null);
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function submitPur() {
    const r = reagents[purForm.reagentIdx];
    if (!r) {
      setErr('请选择试剂');
      return;
    }
    try {
      await apiRequest('/purchases', {
        method: 'POST',
        data: {
          reagentId: r.id,
          quantity: purForm.quantity,
          unit: purForm.unit,
          reason: purForm.reason,
        },
      });
      setPurForm({ reagentIdx: -1, quantity: '', unit: 'mL', reason: '' });
      setErr(null);
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function cancelUse(id: string) {
    try {
      await apiRequest(`/requests/${id}/cancel`, { method: 'POST' });
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function cancelPur(id: string) {
    try {
      await apiRequest(`/purchases/${id}/cancel`, { method: 'POST' });
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <View style={{ padding: '24rpx' }}>
      <View style={{ display: 'flex' }}>
        <Button
          size="mini"
          type={tab === 'use' ? 'primary' : 'default'}
          onClick={() => setTab('use')}
        >
          领用申请
        </Button>
        <Button
          size="mini"
          type={tab === 'purchase' ? 'primary' : 'default'}
          onClick={() => setTab('purchase')}
          style={{ marginLeft: '12rpx' }}
        >
          采购申请
        </Button>
      </View>
      {err && (
        <Text style={{ color: '#d33', display: 'block', marginTop: '16rpx' }}>
          {err}
        </Text>
      )}

      {tab === 'use' && (
        <View style={{ marginTop: '16rpx' }}>
          <View
            style={{
              padding: '16rpx',
              border: '1rpx solid #ddd',
              borderRadius: '6rpx',
            }}
          >
            <Text style={{ fontWeight: 'bold' }}>新建领用申请</Text>
            <Picker
              mode="selector"
              range={reagents.map((r) => r.name)}
              value={useForm.reagentIdx >= 0 ? useForm.reagentIdx : 0}
              onChange={(e) =>
                setUseForm({
                  ...useForm,
                  reagentIdx: Number(e.detail.value),
                  stockIdx: -1,
                })
              }
            >
              <View style={{ marginTop: '12rpx' }}>
                试剂：{useReagent?.name ?? '点选'}
              </View>
            </Picker>
            {controlled && (
              <Text style={{ color: '#d33', display: 'block' }}>
                管控试剂请到 Web 端提交
              </Text>
            )}
            <Picker
              mode="selector"
              range={useStocks.map(
                (s) => `${s.batchNo ?? '无批号'} · 余 ${s.currentQty}${s.unit}`,
              )}
              value={useForm.stockIdx >= 0 ? useForm.stockIdx : 0}
              onChange={(e) =>
                setUseForm({ ...useForm, stockIdx: Number(e.detail.value) })
              }
            >
              <View style={{ marginTop: '12rpx' }}>
                批次：
                {useForm.stockIdx >= 0 && useStocks[useForm.stockIdx]
                  ? useStocks[useForm.stockIdx].batchNo ?? '无批号'
                  : '点选'}
              </View>
            </Picker>
            <Input
              placeholder="数量"
              value={useForm.quantity}
              onInput={(e) =>
                setUseForm({ ...useForm, quantity: e.detail.value })
              }
              style={{
                border: '1rpx solid #ccc',
                padding: '10rpx',
                marginTop: '12rpx',
              }}
            />
            <Input
              placeholder="单位"
              value={useForm.unit}
              onInput={(e) => setUseForm({ ...useForm, unit: e.detail.value })}
              style={{
                border: '1rpx solid #ccc',
                padding: '10rpx',
                marginTop: '12rpx',
              }}
            />
            <Textarea
              placeholder="用途"
              value={useForm.purpose}
              onInput={(e) =>
                setUseForm({ ...useForm, purpose: e.detail.value })
              }
              style={{
                border: '1rpx solid #ccc',
                padding: '10rpx',
                marginTop: '12rpx',
                width: '100%',
              }}
            />
            <Button
              type="primary"
              size="mini"
              style={{ marginTop: '12rpx' }}
              onClick={submitUse}
            >
              提交
            </Button>
          </View>

          <View style={{ marginTop: '16rpx' }}>
            {reqs.map((r) => (
              <View
                key={r.id}
                style={{
                  padding: '12rpx',
                  border: '1rpx solid #eee',
                  borderRadius: '6rpx',
                  marginTop: '8rpx',
                }}
              >
                <Text style={{ fontWeight: 'bold' }}>
                  {r.reagent?.name ?? r.reagentId}
                </Text>
                <Text style={{ display: 'block', color: '#666' }}>
                  {r.quantity} {r.unit} · {r.status}
                </Text>
                <Text style={{ display: 'block', color: '#888' }}>
                  {r.purpose}
                </Text>
                {r.status === 'PENDING' && (
                  <Button size="mini" onClick={() => cancelUse(r.id)}>
                    取消
                  </Button>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      {tab === 'purchase' && (
        <View style={{ marginTop: '16rpx' }}>
          <View
            style={{
              padding: '16rpx',
              border: '1rpx solid #ddd',
              borderRadius: '6rpx',
            }}
          >
            <Text style={{ fontWeight: 'bold' }}>新建采购申请</Text>
            <Picker
              mode="selector"
              range={reagents.map((r) => r.name)}
              value={purForm.reagentIdx >= 0 ? purForm.reagentIdx : 0}
              onChange={(e) =>
                setPurForm({ ...purForm, reagentIdx: Number(e.detail.value) })
              }
            >
              <View style={{ marginTop: '12rpx' }}>
                试剂：
                {reagents[purForm.reagentIdx]?.name ?? '点选'}
              </View>
            </Picker>
            <Input
              placeholder="数量"
              value={purForm.quantity}
              onInput={(e) =>
                setPurForm({ ...purForm, quantity: e.detail.value })
              }
              style={{
                border: '1rpx solid #ccc',
                padding: '10rpx',
                marginTop: '12rpx',
              }}
            />
            <Input
              placeholder="单位"
              value={purForm.unit}
              onInput={(e) =>
                setPurForm({ ...purForm, unit: e.detail.value })
              }
              style={{
                border: '1rpx solid #ccc',
                padding: '10rpx',
                marginTop: '12rpx',
              }}
            />
            <Textarea
              placeholder="理由"
              value={purForm.reason}
              onInput={(e) =>
                setPurForm({ ...purForm, reason: e.detail.value })
              }
              style={{
                border: '1rpx solid #ccc',
                padding: '10rpx',
                marginTop: '12rpx',
                width: '100%',
              }}
            />
            <Button
              type="primary"
              size="mini"
              style={{ marginTop: '12rpx' }}
              onClick={submitPur}
            >
              提交
            </Button>
          </View>

          <View style={{ marginTop: '16rpx' }}>
            {purs.map((p) => (
              <View
                key={p.id}
                style={{
                  padding: '12rpx',
                  border: '1rpx solid #eee',
                  borderRadius: '6rpx',
                  marginTop: '8rpx',
                }}
              >
                <Text style={{ fontWeight: 'bold' }}>
                  {p.reagent?.name ?? p.reagentId}
                </Text>
                <Text style={{ display: 'block', color: '#666' }}>
                  {p.quantity} {p.unit} · {p.status}
                </Text>
                <Text style={{ display: 'block', color: '#888' }}>
                  {p.reason}
                </Text>
                {p.status === 'PENDING' && (
                  <Button size="mini" onClick={() => cancelPur(p.id)}>
                    取消
                  </Button>
                )}
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 3: 提交**

```bash
cd D:/Project/0417-any-demo
git add apps/miniapp/src/pages/my-requests
git commit -m "feat(miniapp): add my-requests page (use + purchase)"
```

---

## Task 10: 待办审批

**Files:**
- Create: `apps/miniapp/src/pages/approvals/index.tsx`
- Create: `apps/miniapp/src/pages/approvals/index.config.ts`

- [ ] **Step 1: approvals index.config.ts**

Create `apps/miniapp/src/pages/approvals/index.config.ts`:

```ts
export default definePageConfig({
  navigationBarTitleText: '待办审批',
});
```

- [ ] **Step 2: approvals index.tsx**

Create `apps/miniapp/src/pages/approvals/index.tsx`:

```tsx
import { useState } from 'react';
import { useDidShow } from '@tarojs/taro';
import { View, Text, Button, Input } from '@tarojs/components';
import type {
  PurchaseBatchSummary,
  PurchaseRequestSummary,
  RequestSummary,
} from '@app/shared';
import { apiRequest } from '@/lib/api-client';

type ReqRow = RequestSummary & {
  reagent?: { name: string; hazardLevel?: string; controlType?: string | null };
  applicant?: { name: string };
};

type PurRow = PurchaseRequestSummary & {
  reagent?: { name: string } | null;
  applicant?: { name: string } | null;
  batch?: PurchaseBatchSummary | null;
};

type BatchGroup = { batch: PurchaseBatchSummary; items: PurRow[] };

export default function ApprovalsPage() {
  const [tab, setTab] = useState<'use' | 'purchase'>('use');
  const [reqs, setReqs] = useState<ReqRow[]>([]);
  const [groups, setGroups] = useState<Record<string, BatchGroup>>({});
  const [comment, setComment] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const [r, p] = await Promise.all([
        apiRequest<ReqRow[]>('/requests?status=PENDING'),
        apiRequest<PurRow[]>('/purchases'),
      ]);
      setReqs(r);
      const g: Record<string, BatchGroup> = {};
      for (const item of p) {
        if (!item.batch || item.batch.status !== 'PENDING') continue;
        if (!g[item.batch.id]) g[item.batch.id] = { batch: item.batch, items: [] };
        g[item.batch.id].items.push(item);
      }
      setGroups(g);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useDidShow(() => {
    refresh();
  });

  async function decideUse(
    id: string,
    action: 'APPROVE' | 'REJECT',
    level: 1 | 2,
  ) {
    try {
      await apiRequest(`/requests/${id}/approvals`, {
        method: 'POST',
        data: { action, level, comment: comment[id] ?? '' },
      });
      setComment((c) => ({ ...c, [id]: '' }));
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function decidePur(batchId: string, action: 'APPROVE' | 'REJECT') {
    try {
      await apiRequest(`/purchases/batches/${batchId}/approve`, {
        method: 'POST',
        data: { action, comment: comment[batchId] ?? '' },
      });
      setComment((c) => ({ ...c, [batchId]: '' }));
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <View style={{ padding: '24rpx' }}>
      <View style={{ display: 'flex' }}>
        <Button
          size="mini"
          type={tab === 'use' ? 'primary' : 'default'}
          onClick={() => setTab('use')}
        >
          领用
        </Button>
        <Button
          size="mini"
          type={tab === 'purchase' ? 'primary' : 'default'}
          onClick={() => setTab('purchase')}
          style={{ marginLeft: '12rpx' }}
        >
          采购
        </Button>
      </View>
      {err && (
        <Text style={{ color: '#d33', display: 'block', marginTop: '16rpx' }}>
          {err}
        </Text>
      )}

      {tab === 'use' && (
        <View style={{ marginTop: '16rpx' }}>
          {reqs.length === 0 && <Text style={{ color: '#888' }}>暂无待审批</Text>}
          {reqs.map((r) => {
            const ctrl =
              r.reagent?.hazardLevel === 'CONTROLLED' ||
              !!r.reagent?.controlType;
            return (
              <View
                key={r.id}
                style={{
                  padding: '16rpx',
                  border: '1rpx solid #eee',
                  borderRadius: '6rpx',
                  marginTop: '12rpx',
                }}
              >
                <Text style={{ fontWeight: 'bold' }}>
                  {r.reagent?.name ?? r.reagentId}
                  {ctrl ? '【管控】' : ''}
                </Text>
                <Text style={{ display: 'block', color: '#666' }}>
                  {r.applicant?.name ?? r.applicantId} · {r.quantity} {r.unit}
                </Text>
                <Text style={{ display: 'block', color: '#888' }}>
                  用途：{r.purpose}
                </Text>
                <Input
                  placeholder="备注/拒绝理由"
                  value={comment[r.id] ?? ''}
                  onInput={(e) =>
                    setComment({ ...comment, [r.id]: e.detail.value })
                  }
                  style={{
                    border: '1rpx solid #ccc',
                    padding: '10rpx',
                    marginTop: '8rpx',
                  }}
                />
                <View style={{ marginTop: '8rpx' }}>
                  <Button
                    size="mini"
                    type="primary"
                    onClick={() => decideUse(r.id, 'APPROVE', 1)}
                  >
                    一审通过
                  </Button>
                  <Button
                    size="mini"
                    onClick={() => decideUse(r.id, 'REJECT', 1)}
                    style={{ marginLeft: '8rpx' }}
                  >
                    一审拒绝
                  </Button>
                  {ctrl && (
                    <>
                      <Button
                        size="mini"
                        type="primary"
                        onClick={() => decideUse(r.id, 'APPROVE', 2)}
                        style={{ marginLeft: '8rpx' }}
                      >
                        二审通过
                      </Button>
                      <Button
                        size="mini"
                        onClick={() => decideUse(r.id, 'REJECT', 2)}
                        style={{ marginLeft: '8rpx' }}
                      >
                        二审拒绝
                      </Button>
                    </>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {tab === 'purchase' && (
        <View style={{ marginTop: '16rpx' }}>
          {Object.keys(groups).length === 0 && (
            <Text style={{ color: '#888' }}>暂无待审批批次</Text>
          )}
          {Object.entries(groups).map(([bid, g]) => (
            <View
              key={bid}
              style={{
                padding: '16rpx',
                border: '1rpx solid #eee',
                borderRadius: '6rpx',
                marginTop: '12rpx',
              }}
            >
              <Text style={{ fontWeight: 'bold' }}>批次 {bid}</Text>
              <Text style={{ display: 'block', color: '#666' }}>
                试剂 {g.batch.reagentId} · 总量 {g.batch.totalQty} {g.batch.unit}
              </Text>
              {g.items.map((i) => (
                <Text
                  key={i.id}
                  style={{ display: 'block', color: '#888' }}
                >
                  - {i.applicant?.name ?? i.applicantId}: {i.quantity} {i.unit}
                  （{i.reason}）
                </Text>
              ))}
              <Input
                placeholder="备注/拒绝理由"
                value={comment[bid] ?? ''}
                onInput={(e) =>
                  setComment({ ...comment, [bid]: e.detail.value })
                }
                style={{
                  border: '1rpx solid #ccc',
                  padding: '10rpx',
                  marginTop: '8rpx',
                }}
              />
              <View style={{ marginTop: '8rpx' }}>
                <Button
                  size="mini"
                  type="primary"
                  onClick={() => decidePur(bid, 'APPROVE')}
                >
                  通过
                </Button>
                <Button
                  size="mini"
                  onClick={() => decidePur(bid, 'REJECT')}
                  style={{ marginLeft: '8rpx' }}
                >
                  拒绝
                </Button>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 3: 提交**

```bash
cd D:/Project/0417-any-demo
git add apps/miniapp/src/pages/approvals
git commit -m "feat(miniapp): add approvals page (use + purchase)"
```

---

## Task 11: 消息通知

**Files:**
- Create: `apps/miniapp/src/pages/notifications/index.tsx`
- Create: `apps/miniapp/src/pages/notifications/index.config.ts`

- [ ] **Step 1: notifications index.config.ts**

Create `apps/miniapp/src/pages/notifications/index.config.ts`:

```ts
export default definePageConfig({
  navigationBarTitleText: '消息通知',
});
```

- [ ] **Step 2: notifications index.tsx**

Create `apps/miniapp/src/pages/notifications/index.tsx`:

```tsx
import { useState } from 'react';
import { useDidShow } from '@tarojs/taro';
import { View, Text, Button } from '@tarojs/components';
import type { NotificationSummary } from '@app/shared';
import { apiRequest } from '@/lib/api-client';

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const data = await apiRequest<NotificationSummary[]>('/notifications');
      setItems(data);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useDidShow(() => {
    refresh();
  });

  async function markOne(id: string) {
    try {
      await apiRequest(`/notifications/${id}/read`, { method: 'POST' });
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function markAll() {
    try {
      await apiRequest('/notifications/read-all', { method: 'POST' });
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <View style={{ padding: '24rpx' }}>
      <View
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: '32rpx', fontWeight: 'bold' }}>通知</Text>
        <Button size="mini" onClick={markAll}>
          全部已读
        </Button>
      </View>
      {err && (
        <Text style={{ color: '#d33', display: 'block', marginTop: '16rpx' }}>
          {err}
        </Text>
      )}
      <View style={{ marginTop: '16rpx' }}>
        {items.length === 0 && (
          <Text style={{ color: '#888' }}>暂无消息</Text>
        )}
        {items.map((n) => (
          <View
            key={n.id}
            onClick={() => !n.readAt && markOne(n.id)}
            style={{
              padding: '16rpx',
              border: '1rpx solid #eee',
              borderRadius: '6rpx',
              marginTop: '8rpx',
              background: n.readAt ? '#fafafa' : '#fffbe6',
            }}
          >
            <Text style={{ fontWeight: 'bold' }}>{n.title}</Text>
            <Text style={{ display: 'block', color: '#555' }}>{n.body}</Text>
            <Text style={{ display: 'block', color: '#999' }}>
              {new Date(n.createdAt).toLocaleString()}
              {n.readAt ? ' · 已读' : ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 3: 提交**

```bash
cd D:/Project/0417-any-demo
git add apps/miniapp/src/pages/notifications
git commit -m "feat(miniapp): add notifications page"
```

---

## Task 12: 构建验证 + 手工预览 + Tag

**Files:**
- None (构建 + tag)

- [ ] **Step 1: H5 构建**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/miniapp build:h5 2>&1 | tail -30
```

Expected: `dist/` 生成；日志包含 `Compile successfully`。若报错：检查是否缺 `index.html`（Task 2 Step 3）或 alias 配置。

- [ ] **Step 2: weapp 构建**

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/miniapp build:weapp 2>&1 | tail -30
```

Expected: `apps/miniapp/dist/` 生成 `app.js` / `app.json` / `pages/` 目录。无编译错误。

- [ ] **Step 3: H5 本地预览 (可选手工)**

Run (另起终端):
```bash
pnpm run dev:api
```

再起一个终端:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/miniapp dev:h5
```

浏览器访问 `http://localhost:10086/`：
- 输入 `admin@lab.local` / `admin123` 登录
- 底部 tab 切换：工作台 / 申请 / 审批 / 消息
- 工作台搜索跳到试剂搜索页
- 申请 tab 新建一条领用或采购
- 审批 tab 通过 / 拒绝
- 消息 tab 点击条目标记已读

- [ ] **Step 4: 确认 API e2e + Web build 仍绿**

Run:
```bash
cd D:/Project/0417-any-demo/apps/api && pnpm jest --config ./test/jest-e2e.json --forceExit 2>&1 | tail -10
```

Expected: 14 suites / 95 tests 全绿（P6 未改 API）。

Run:
```bash
cd D:/Project/0417-any-demo && pnpm --filter @app/web build 2>&1 | tail -10
```

Expected: 16 routes 全部构建成功。

- [ ] **Step 5: 提交并打 tag**

```bash
cd D:/Project/0417-any-demo
git status
git diff --cached --quiet && echo "no pending" || git commit -m "chore: P6 build verification checkpoint"
git tag p6-complete
git tag --list | grep p6
```

Expected: 打印 `p6-complete`。

---

## 完成检查

- [ ] `apps/miniapp/` 骨架 + 构建配置落地
- [ ] 根 `package.json` 新增 `dev:mp` / `build:mp`
- [ ] `api-client.ts` + `auth-store.ts` 正常读写 Storage
- [ ] `app.tsx` hydrate + 未登录 reLaunch 登录页
- [ ] 6 个页面全部可编译
- [ ] `pnpm --filter @app/miniapp build:h5` 通过
- [ ] `pnpm --filter @app/miniapp build:weapp` 通过
- [ ] API e2e 仍全绿（14 suites / 95 tests）
- [ ] Web build 仍通过（16 routes）
- [ ] Tag `p6-complete` 已打
