# P6 · 小程序端 Design Spec

**日期**：2026-04-20
**阶段**：M6（对应主 spec §3.1 Taro 4 + §7 小程序端精简高频）
**前置条件**：P1–P5 已完成，`p5-complete` tag 已打。

## 1. 目标

1. 新增 `apps/miniapp/`：Taro 4 + React 18 + TypeScript 的小程序工程，双端构建（H5 + 微信 weapp）
2. 复用现有 NestJS API，后端零改动
3. 登录：复用 `POST /auth/login`（邮箱 + 密码），token 持久化到 `Taro.setStorageSync`
4. 交付 5 个高频场景：工作台 / 搜索试剂 / 我的申请 / 待办审批 / 消息通知
5. 底部 4 个 tab（工作台 / 申请 / 审批 / 消息）+ 搜索从工作台入口进入
6. 与 Web 同步共用 `packages/shared/src/api-types.ts` 的类型声明
7. 未登录自动跳登录页；token 失效（401）自动登出并 reLaunch 到登录页

## 2. 非目标

- 扫码（用搜索替代，主 spec §7 明确）
- `wx.requestSubscribeMessage` 真实订阅消息（本期仅复用 `/notifications` in-app 列表）
- 真实微信 code2session / AppID / template 模板
- 自动化测试（仅手工 H5 验证，Taro 页面不写 jest 单测）
- API 端的任何新增或变更
- Alipay / 字节 / H5 生产部署（H5 仅作开发调试用）
- UI 组件库（手写 Taro 基础组件 `<View>` / `<Text>` / `<Input>` + inline / Tailwind-free 样式）

## 3. 架构概览

```
apps/miniapp/                              NEW
├── config/
│   ├── index.ts                # Taro 配置，路径别名 @/* → src/*
│   ├── dev.ts
│   └── prod.ts
├── project.config.json         # 微信开发者工具项目配置
├── package.json
├── tsconfig.json
└── src/
    ├── app.tsx                 # 鉴权 hydrate + 全局根组件
    ├── app.config.ts           # 路由 + tabBar
    ├── lib/
    │   ├── api-client.ts       # 基于 Taro.request，~40 行
    │   └── auth-store.ts       # zustand，storage 持久化
    ├── components/
    │   └── ProtectedPage.tsx   # 类似 Web 的 RequireAuth
    └── pages/
        ├── login/              # 邮箱密码登录
        ├── home/               # 工作台 tab
        ├── search/             # 搜索试剂（非 tab，从 home 进入）
        ├── my-requests/        # 我的申请 tab
        ├── approvals/          # 待办审批 tab
        └── notifications/      # 消息通知 tab
```

**共享**：`packages/shared` 保持不变，miniapp 作为 workspace package 通过 `@app/shared` import 类型。不抽取 transport 层。

**pnpm workspace**：在根 `pnpm-workspace.yaml` 无需改动（`apps/*` 已通配）。

## 4. 页面与 API 映射

| 页面 | 主要 API | 说明 |
|---|---|---|
| **login** | `POST /auth/login` | email + password；成功 → `setTokens(...)` → `Taro.switchTab('/pages/home/index')` |
| **home (工作台)** | `GET /notifications?unreadOnly=true`（取 count）| 顶部欢迎语（读 auth-store 里的 user）+ 搜索入口 + 未读计数 + 快捷入口按钮（跳各 tab） |
| **search** | `GET /reagents?q={keyword}` | 输入关键词列出试剂；点击项仅查看详情（本期不支持直接申请，回 home 再走申请流程） |
| **my-requests** | `GET /requests`（领用）+ `GET /purchases/mine`（采购）+ `GET /reagents`、`GET /stocks`（新建申请时加载选项） | 顶部二选一切换器；两类列表；支持新建领用申请（必填：reagent / stock / quantity / unit / purpose）+ 新建采购申请（必填：reagent / quantity / unit / reason）；支持取消 |
| **approvals** | `GET /requests?status=PENDING`（领用）+ `GET /purchases`（采购批次） | 顶部二选一切换器；审批领用 `POST /requests/:id/approvals` 含 level 1/2 按钮（与 Web 一致）；审批采购 `POST /purchases/batches/:id/approve` |
| **notifications** | `GET /notifications` + `POST /notifications/:id/read` + `POST /notifications/read-all` | 列表 + 全部已读 + 单条已读 |

**领用申请表单**：简化版（必填试剂 / 批次 / 数量 / 用途），暂不收集管控试剂的二审强校验字段（`projectRef` / `useLocation`）。客户端在试剂选择时读取 `hazardLevel`/`controlType`，若为 CONTROLLED 则显示提示「管控试剂请到 Web 端提交」并阻止提交，避免让 API 返回 400 才发现。

**采购入库** 保留给 Web 端（管理员场景，小程序端不做）。

## 5. 登录与会话

### 5.1 auth-store.ts

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
    const t = Taro.getStorageSync(KEY_TOKENS);
    const u = Taro.getStorageSync(KEY_USER);
    if (t && u) set({ tokens: t, user: u });
  },
}));
```

### 5.2 api-client.ts

```ts
import Taro from '@tarojs/taro';
import { useAuth } from './auth-store';

export const apiBaseUrl =
  process.env.TARO_APP_API_BASE ?? 'http://localhost:3001/api/v1';

export async function apiRequest<T = any>(
  path: string,
  opts: { method?: keyof Taro.request.Method; data?: any } = {},
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
    throw new Error(
      typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
    );
  }
  return res.data;
}
```

### 5.3 app.tsx

```tsx
import { PropsWithChildren, useEffect } from 'react';
import Taro from '@tarojs/taro';
import { useAuth } from './lib/auth-store';

function App({ children }: PropsWithChildren) {
  const tokens = useAuth((s) => s.tokens);
  useEffect(() => {
    useAuth.getState().hydrate();
  }, []);
  useEffect(() => {
    if (!tokens) Taro.reLaunch({ url: '/pages/login/index' });
  }, [tokens]);
  return children;
}
export default App;
```

## 6. 路由 / app.config.ts

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
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '实验室试剂',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    color: '#888',
    selectedColor: '#1677ff',
    backgroundColor: '#fff',
    list: [
      { pagePath: 'pages/home/index', text: '工作台' },
      { pagePath: 'pages/my-requests/index', text: '申请' },
      { pagePath: 'pages/approvals/index', text: '审批' },
      { pagePath: 'pages/notifications/index', text: '消息' },
    ],
  },
});
```

> 不配置 tab 的 `iconPath` 以避免引入图标文件；依赖文字 + 颜色区分（weapp 允许）。

## 7. 状态管理与数据流

- 全局状态 = `auth-store`（tokens + user）
- 页面级状态 = 各自 `useState` + `useEffect(refresh)`
- 无全局缓存、无 SWR / React Query；每次页面 `onShow` 刷新

`onShow` vs `useEffect`: Taro 提供 `useDidShow` hook，tab 页面用 `useDidShow` 代替 `useEffect` 保证切回 tab 时刷数据。

## 8. 构建与运行

### 8.1 脚本（`apps/miniapp/package.json`）

```json
{
  "name": "@app/miniapp",
  "private": true,
  "scripts": {
    "dev:h5": "taro build --type h5 --watch",
    "dev:weapp": "taro build --type weapp --watch",
    "build:h5": "taro build --type h5",
    "build:weapp": "taro build --type weapp"
  }
}
```

根 `package.json` 追加：
```json
"dev:mp": "pnpm --filter @app/miniapp dev:h5",
"build:mp": "pnpm --filter @app/miniapp build:weapp"
```

### 8.2 环境变量

- `TARO_APP_API_BASE`（编译时注入）默认 `http://localhost:3001/api/v1`
- 本地 H5 开发：浏览器直连 API（API 的 CORS 已对 `*` 开放，无需额外配置）
- weapp：微信开发者工具里勾选「不校验合法域名」即可（demo 场景）

## 9. 依赖清单

仅新增以下生产依赖：
- `@tarojs/taro` ^4.x
- `@tarojs/components`
- `@tarojs/plugin-framework-react`
- `@tarojs/runtime`
- `@tarojs/shared`
- `@tarojs/webpack5-runner`
- `@tarojs/router`
- `@tarojs/taroize`（若用 CLI 脚手架自带则免）
- `react` ^18 / `react-dom` ^18
- `zustand` ^4（与 Web 同版本）
- `@app/shared` (workspace:*)

开发依赖：
- `@types/react`
- `typescript`
- `@tarojs/cli` ^4.x

> 具体版本在 plan 阶段以 `pnpm create taro app miniapp` 产出为准；保持与官方模板一致以避免兼容问题。

## 10. 关键决策总结

- **零后端改动**：P6 纯前端新增；复用 P1-P5 已有 API
- **鉴权复用邮箱密码**：跳过 WeChat 生态集成（AppID / code2session / template ID）
- **共享仅类型**：不抽 transport 层，apps/miniapp 自写 `apiRequest`，Web 代码不动
- **小程序端不做管控场景**：申请表单简化，管控试剂引导去 Web 端
- **小程序端不做采购入库**：采购入库是管理员场景，小程序仅提交采购申请 + 查看自己提交的状态
- **4 tab 而非 5 tab**：搜索作为工作台顶部入口，减少 tabBar 噪音
- **无图标**：tabBar 纯文字，避免维护图标资源
- **无 UI 框架**：Taro 原生组件 + inline 样式；简化构建

## 11. 风险与未决项

- **Taro 4 版本**：从主 spec §3.1 约定 Taro 4；在 P6 实施时以 `create taro app` 自带模板版本为准（若 4.0 尚 beta，可接受 3.x 稳定版，但保持 React 语法）。plan Task 1 需首先记录实际采用的版本号
- **微信开发者工具不可用 CI**：CI 只能跑 `build:weapp` 产出 `dist/`，无法自动打开开发者工具；手工验证依赖开发者本机
- **H5 跨域**：默认 API 允许 `*`，但如果后续收紧 CORS 需在 API 或 Taro dev server 配 proxy
- **storage key 命名**：统一前缀 `mp.`（miniapp）避免和 Web 的 localStorage key 混淆（不同域存储本来就隔离，但习惯一致）
- **未覆盖场景**：小程序端不展示 P4 台账 / P5 预警配置 / P3 全部审批类型以外的管理员页面；这些留 Web 端

## 12. 完成标准

- `pnpm --filter @app/miniapp build:weapp` 产出 `dist/` 成功
- H5 预览：登录 → 工作台 → 申请（创建 / 查看）→ 审批（通过）→ 消息（标记已读）核心链路跑通
- `pnpm --filter @app/api test:e2e` 仍全绿（因无 API 改动）
- `pnpm --filter @app/web build` 仍通过（因 Web 无改动）
- tag `p6-complete` 已打
