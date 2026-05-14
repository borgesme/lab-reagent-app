# miniapp-uni 重构设计稿

- **日期**：2026-05-14
- **状态**：草案，待用户复核
- **作者**：brainstorming session（Claude + borgesme）
- **背景**：现有 `apps/miniapp` 是 Taro 3.6 + React 18 工程，业务最小可用，但与 web 端架构（shadcn + 401 自动 refresh）不一致；以 `apps/Art-app`（uniapp + Vue3 + uview-plus 成熟模板）为参考，新建 `apps/miniapp-uni` 重构

## 1. 目标与非目标

### 目标
1. 用 uniapp + Vue3 + TS + uview-plus 工程栈替换 Taro + React 工程栈
2. 网络层与 auth 行为对齐 web 端（401 → `/auth/refresh` → 重放，Promise 锁去重并发）
3. 业务功能 1:1 覆盖现有 7 页，并补"我的"页（资料/改密/退出登录）
4. 平台首发 H5 + 微信小程序；其他平台命令保留但不主动维护
5. 新工程与老 Taro 工程并存，老工程作为回退路径，不在本次范围内删除

### 非目标
- 微信一键登录、手机号登录
- 推送通知 / 网络断线监听
- e2e 自动化（playwright 不覆盖小程序）
- 老 Taro 工程归档/删除

## 2. 关键决策

| # | 决策 | 选择 | 理由 |
|---|------|------|------|
| 1 | 工程位置 | `apps/miniapp-uni/`（新建） | 老 Taro 留作回退 |
| 2 | TypeScript | 启用 | 与 web/api/shared 一致，可消费 `@app/shared` 类型 |
| 3 | UI 组件库 | uview-plus（uni_modules 形式） | Art-app 同款，最强表现力，社区活跃 |
| 4 | 导航形态 | 全自定义 NavBar + 自定义 TabBar | Art-app 同款，所有页 `navigationStyle:custom` |
| 5 | 主题色 | emerald `#10b981` | 与 web shadcn 一致 |
| 6 | 状态管理 | Pinia + persistedstate（uni storage 适配） | uniapp Vue3 标配 |
| 7 | 401 策略 | 全量对齐 web：refresh → 重放 + Promise 锁去重 | 跨端一致；避免"刚打开就跳登录" |
| 8 | IA | 5 tab：home / my-requests / approvals / notifications / **mine**（新增） | 补 logout 入口缺口；其他业务 1:1 迁移 |
| 9 | 测试基线 | vitest 覆盖 lib / stores / hooks / i18n（≈38 用例），页面不强要 | 工程基建质量保底，页面交互手动走查 |
| 10 | 平台 | 默认 dev/build：h5 + mp-weixin；其他平台命令保留 | 范围聚焦 |
| 11 | 国际化 | vue-i18n 9.x，中英双语，**本次覆盖基础按钮 + 通用提示语**；业务文案/页面标题作为渐进式后续 | 多端基线，留好结构；YAGNI 控范围 |
| 12 | 环境变量 | `.env.development` + `.env.production`：`VITE_APP_ENV` / `VITE_ROUTER_BASE` / `VITE_BASE_URL` 三个变量 | 区分环境与多形态部署所需 |

## 3. 工程骨架

### 3.1 目录结构
```
apps/miniapp-uni/
├── src/
│   ├── App.vue                  # onLaunch → useAppStore.initSystemInfo + useAuth.hydrate + useBootTokenRefresh()
│   ├── main.ts                  # createSSRApp + Pinia + uview-plus
│   ├── pages.json               # 5 tab + 隐藏页 + easycom u-*/up-*
│   ├── manifest.json            # vue3 + h5 + mp-weixin + 其余平台 stub
│   ├── uni.scss                 # $u-primary:#10b981 覆盖 + import uview-plus theme
│   ├── env.d.ts / shime-uni.d.ts
│   ├── pages/                   # 主包 (login/home/mine)
│   │   ├── login/index.vue
│   │   ├── home/index.vue
│   │   └── mine/index.vue
│   ├── package-business/pages/  # 业务分包 (search/my-requests/approvals/notifications/report-summary)
│   ├── components/              # tab-bar/ nav-bar/ custom-bottom-area/
│   ├── api/
│   │   ├── request.ts           # 401→refresh→重放 + Promise 锁
│   │   └── modules/             # auth.ts / reagents.ts / requests.ts / purchases.ts / notifications.ts / reports.ts
│   ├── stores/
│   │   ├── index.ts             # createPinia + persist 适配 uni storage
│   │   ├── persist.config.ts
│   │   ├── auth.ts              # tokens/user + setTokens/setSession/clear/hydrate
│   │   └── app.ts               # systemInfo / safeArea / navBarHeight / capsuleRect
│   ├── hooks/
│   │   ├── useRefreshList.ts
│   │   ├── useLoginCheck.ts
│   │   ├── useWxCapsuleRect.ts
│   │   └── useBootTokenRefresh.ts
│   ├── locale/
│   │   ├── index.ts             # createI18n + 加载 messages + 持久化适配
│   │   ├── zh-CN.ts
│   │   └── en.ts
│   ├── utils/storage.ts
│   ├── config/env.ts            # VITE_APP_ENV / VITE_ROUTER_BASE / VITE_BASE_URL 单一出口
│   └── styles/{common,flex,index}.scss
├── .env.development             # VITE_APP_ENV / VITE_ROUTER_BASE / VITE_BASE_URL
├── .env.production
├── .env.example                 # 模板，纳入 git
├── package.json
├── vite.config.ts               # @ alias + /api proxy + esbuild drop console (prod)
├── tsconfig.json                # 继承根；@app/shared 路径映射
├── vitest.config.ts             # node env + alias + uni mock setup
├── vitest.setup.ts              # 全局 mock uni.*
├── project.config.json          # appid: "touristappid"
└── shime-uni.d.ts
```

### 3.2 技术栈版本
- Vue 3.5.x + uniapp `^3.0.0-alpha-4080620251107001`（Art-app 同款 alpha）
- Pinia ^3.x + pinia-plugin-persistedstate ^4.x
- uview-plus 最新稳定版（uni_modules 形式）
- vue-i18n ^9.14.x（与 Art-app 同款）
- TypeScript ^5.4
- vite ^5.x + `@dcloudio/vite-plugin-uni`
- vitest ^1.x + `@vue/test-utils`

### 3.3 scripts
```json
{
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
}
```

### 3.4 环境变量

`.env.development` / `.env.production` 三个变量（`.env.example` 同步、纳入 git）：

| 变量 | dev 默认 | prod 默认 | 用途 |
|---|---|---|---|
| `VITE_APP_ENV` | `development` | `production` | 业务层条件渲染（如内测水印、调试面板）；`config/env.ts` 暴露 `isDev/isProd` |
| `VITE_ROUTER_BASE` | `/` | `/`（部署子路径时改） | **仅 H5 有效**：驱动 `vite.config.ts` 的 `base` 字段（dev server + h5 build 都消费）；**不修改 `manifest.json`**——uniapp 编译时直接读 manifest，vite define 不参与 |
| `VITE_BASE_URL` | `http://localhost:3001/api/v1` | `https://api.example.com/api/v1`（占位） | API base URL；小程序必须完整 URL；H5 也用完整 URL（不走 vite proxy，避免 dev 时 H5/小程序行为分叉） |

`config/env.ts` 集中读取：
```ts
export const env = {
  appEnv: import.meta.env.VITE_APP_ENV ?? 'development',
  routerBase: import.meta.env.VITE_ROUTER_BASE ?? '/',
  baseUrl: import.meta.env.VITE_BASE_URL ?? 'http://localhost:3001/api/v1',
  isDev: import.meta.env.VITE_APP_ENV === 'development',
  isProd: import.meta.env.VITE_APP_ENV === 'production',
};
```

- `vite.config.ts` 的 `base` 字段消费 `VITE_ROUTER_BASE`（H5 部署子路径所需）
- **不**用 vite `define` 注入 manifest.json；manifest.json 的 h5.router 配置保持静态写死
- 后端 NestJS 已开 CORS，H5 dev 不需 vite proxy，全平台统一走完整 URL

## 4. UI 与导航

### 4.1 uview-plus 接入
- `uni_modules/uview-plus/`（不走 npm，便于本地 patch 主题）
- `pages.json` `easycom`：`"^up-(.*)"` + `"^u-([^-].*)"` 双前缀自动注册（注意 `[^-]` 避免与 `up-` 冲突，与 Art-app `pages.json:95-101` 一致）
- `main.ts`：`import uviewPlus from '@/uni_modules/uview-plus'; app.use(uviewPlus)`
- **主题定制**：**直接修改 `src/uni_modules/uview-plus/theme.scss` 源文件**（uview-plus 的 theme.scss 内部赋值**没有 `!default`**，外部 `uni.scss` 前置赋值不会生效）。需要修改的变量：
  - `$u-primary: #10b981;` `$u-primary-dark` `$u-primary-disabled` `$u-primary-light`
  - `$u-button-plain-background-color: rgba(16, 185, 129, 0.20);`
  - `$u-button-u-button-height` `$u-button-normal-font-size`（按钮高度/字号按 UI 复核值调整）
  - 其他色阶（warning/success/error/info）默认保留
- 这个文件**纳入 git**（属于工程内的定制层，不是依赖）

### 4.2 自定义导航
- 所有页 `pages.json` `"navigationStyle":"custom"` `"navigationBarTextStyle":"black"`
- `pages.json.tabBar`：**整段不写**（与 Art-app `pages.json:108-133` 一致——Art-app 把 tabBar 全段注释掉，由自定义组件接管）。不需要 `"custom":true` 字段
- `components/tab-bar/tab-bar.vue`：固定底栏 5 项；点击调 `uni.switchTab` + 本地 active 同步；监听 `onShow` 同步索引
- `components/nav-bar/nav-bar.vue`：左/中/右 slot；高度 = `statusBarHeight + capsuleHeight`；微信端胶囊避让由 `useWxCapsuleRect` 提供
- `components/custom-bottom-area/`：底部安全区占位

### 4.3 全局样式
- `styles/common.scss` reset + 通用排版
- `styles/flex.scss` flex 工具类（`.flex-row` `.flex-center` 等）
- `styles/index.scss` 聚合，在 `App.vue` 顶层 `@import`
- 不引 Tailwind

### 4.4 反馈封装
- Loading / Toast：用 uni 原生 `uni.showLoading` / `uni.showToast`
- Modal：用 uview-plus 的 `u-modal`
- 网络错误统一在 `api/request.ts` 内部 toast，业务层不重复 toast

### 4.5 列表交互
- 移植 Art-app 的 `useRefreshList`，状态机：`'none' | 'refreshing' | 'empty' | 'ended' | 'loading'`
- 应用于 search / my-requests / approvals / notifications

### 4.6 国际化（vue-i18n）

**范围（本次）**：基础按钮（提交/取消/确认/重试/全部已读/退出登录/通过/拒绝/...）+ 通用提示语（加载中/请求失败/网络异常/会话已失效/操作成功/...）+ 5 个 tab 名称 + NavBar 标题。业务表单 label/字段名作为渐进式后续可单独 PR 补齐，不阻塞本次落地。

**接入**
- `src/locale/index.ts`：`createI18n({ legacy: false, locale, fallbackLocale: 'zh-CN', messages: { 'zh-CN': zhCN, en } })`，`main.ts` `app.use(i18n)`
- `src/locale/zh-CN.ts` `src/locale/en.ts`：导出 `{ common: {...}, toast: {...}, tabBar: {...}, pageTitle: {...} }` 命名空间结构
- 默认语言：`uni.getSystemInfoSync().language`（小程序）或 `navigator.language`（H5）→ 命中 `zh-*` 用 `zh-CN`，命中 `en-*` 用 `en`，否则 `zh-CN` fallback
- 持久化：选中语言写入 `uni.setStorageSync('mp.locale', 'zh-CN' | 'en')`，下次启动优先于系统语言
- 切换 UI：mine 页底部加一个"语言 / Language" cell，点击 `u-action-sheet` 弹出 `中文 / English`，切换后 `i18n.global.locale.value = ...` + 写 storage

**用法约定**
- 模板：`<u-button>{{ $t('common.submit') }}</u-button>`
- 脚本：`import { useI18n } from 'vue-i18n'; const { t } = useI18n(); uni.showToast({ title: t('toast.networkError'), icon: 'none' })`
- `api/request.ts` 内部 toast 改用 `t(...)`，需要导出工厂函数或在文件顶部 `import { i18n } from '@/locale'; const t = i18n.global.t;`

## 5. 网络层与 auth-store

### 5.1 `stores/auth.ts`
```ts
interface AuthState {
  tokens: AuthTokens | null;     // { accessToken, refreshToken }
  user: UserSummary | null;
  setSession(tokens, user): void;
  setTokens(tokens): void;
  clear(): void;
  hydrate(): void;
}
```
- `pinia-plugin-persistedstate` 配合 `stores/persist.config.ts` 适配器（`getItem/setItem/removeItem` → `uni.*StorageSync`）
- key 命名 `mp.tokens` / `mp.user`（与 Taro 版一致，便于灰度时复用 storage）

### 5.2 `api/request.ts`
**核心契约**
- baseUrl 来自 `config/env.ts` 的 `env.baseUrl`（即 `VITE_BASE_URL`，dev 默认 `http://localhost:3001/api/v1`）
- 小程序不支持相对路径；H5 也用完整 URL（NestJS 后端 dev 已开 CORS），各端行为一致
- HTTP statusCode 非 200 → throw + toast"网络异常"
- 业务 200 + body.code = 200 → 解包 `body.data` 返回
- 业务 200 + body.code = 401 → `tryRefresh` → 拿到新 token 重放原请求；refresh 失败 → `clear` + `reLaunch login`
- 业务 200 + body.code = 403 → 直接 `clear` + `reLaunch login`，提示"会话已失效"
- 其他业务 code → toast `body.msg` + throw `ApiError(code, msg)`

**`tryRefresh` 实现要点**
- 模块级 `refreshInflight: Promise<string|null> | null` 锁
- 并发请求只 fire 一次 refresh
- refresh 完成后检查 `useAuth().tokens` 仍存在再写回（防止期间已 clear）
- finally 清空 `refreshInflight`

### 5.3 `api/modules/*`
按业务实体拆模块，每个文件薄薄一层语义化封装：
- `auth.ts`：`login(dto)` / `me()` / `updateMe(dto)` / `changePassword(dto)`
- `reagents.ts`：`list(q?)`
- `requests.ts`：`listMine()` / `listPending()` / `create(dto)` / `cancel(id)` / `decide(id, dto)`
- `purchases.ts`：`listMine()` / `listPending()` / `create(dto)` / `cancel(id)` / `decideBatch(batchId, dto)`
- `notifications.ts`：`list(unreadOnly?)` / `read(id)` / `readAll()`
- `reports.ts`：`usageTrend(query)` / `inventoryTurnover(query)` / `purchaseAmount(query)`

业务页**只 import 模块函数**，不直接拼 URL。

### 5.4 hooks
- `useLoginCheck()`：未登录 → `navigateTo('/pages/login/index')`
- `useBootTokenRefresh()`：`App.vue` `onLaunch` 调用一次；有 tokens 则尝试 refresh，失败也不踢人（与 web 端 `use-boot-token-refresh.ts` 行为一致）

## 6. 业务页迁移规格

### 6.1 IA
- **tabBar**：home（工作台）/ my-requests（申请）/ approvals（审批）/ notifications（消息）/ mine（我的）
- **隐藏页**：login / search / report-summary

### 6.2 页面契约表

| # | 页面 | tab | 角色 | 接口 | UI 关键差异 |
|---|------|-----|------|------|------|
| 1 | `pages/login` | 否 | 公开 | `POST /auth/login` → `setSession`；`GET /auth/me` → 回写 user | `u-input` + `u-button` 加 loading；成功 `switchTab` 至 home |
| 2 | `pages/home` | ✅ 工作台 | 全员 | `GET /notifications?unreadOnly=true` 取未读数 | `u-cell-group` 列出 4 个快捷入口（我的申请/待办审批/搜索试剂/报表概览）；用户头像+姓名+实验室 |
| 3 | `package-business/pages/search` | 否 | 全员 | `GET /reagents?q=` | `u-search` + `u-list`；空态 `u-empty`；URL 参数 `q` 透传 |
| 4 | `pages/my-requests` | ✅ 申请 | 申请人 | `GET /requests` `GET /purchases/mine` `GET /reagents` `GET /stocks`；`POST /requests` `POST /purchases`；`POST /requests/:id/cancel` `POST /purchases/:id/cancel` | 顶 `u-tabs` 切换"领用/采购"；`u-form` + `u-picker`；管控试剂红字提示并 disable 提交 |
| 5 | `pages/approvals` | ✅ 审批 | 审批人/采购员/管理员 | `GET /requests?status=PENDING` `GET /purchases`；`POST /requests/:id/approvals`；`POST /purchases/batches/:id/approve` | 顶 `u-tabs` 切换"领用/采购"；卡片 + `u-textarea` 备注 + `u-button-group`（一审/二审/通过/拒绝）；管控试剂显示二审按钮 |
| 6 | `pages/notifications` | ✅ 消息 | 全员 | `GET /notifications`；`POST /notifications/:id/read`；`POST /notifications/read-all` | 列表项点击未读 `read(id)`；右上角"全部已读"`u-button` |
| 7 | `package-business/pages/report-summary` | 否 | 角色受限 | `GET /reports/usage-trend?range=30d&summary=1` `GET /reports/inventory-turnover?range=30d&summary=1` `GET /reports/purchase-amount?range=month&groupBy=month&summary=1` | 3 张 `u-card`；按 `REPORT_SCOPE_MATRIX[role][slug]` 控制可见；失败显示重试；入口在 home + mine |
| 8 | `pages/mine` ⭐ | ✅ 我的 | 全员 | `GET /auth/me` (onShow)；`PATCH /auth/me`；`POST /auth/change-password` | `u-cell-group`：头像+姓名+角色 → 修改资料 → 修改密码 → 报表概览(角色受限) → 语言/Language(切换 zh-CN/en) → 关于 → **退出登录**（红色，confirm 后 `clear` + `reLaunch login`） |

### 6.3 通用约定
- 顶部 `<NavBar :title="..." />`
- 底部 `<CustomBottomArea />`
- `onShow` 拉数据；列表页走 `useRefreshList`
- 只 import `api/modules/*`，不直接 `apiRequest`
- 错误统一由 `request.ts` toast，页面只处理"成功后做什么"
- 角色受限：从 `useAuth().user.roles` + `REPORT_SCOPE_MATRIX` 判断

### 6.4 改密 + tokenVersion
- `POST /auth/change-password` 成功后当前 token 仍有效（与 web 端一致）
- 其他会话 tokenVersion++ 后自动 refresh 失败 → 强制登出
- toast"密码已更新，其他设备需重新登录"

## 7. 测试基线

| 模块 | 用例 | 重点 |
|---|---|---|
| `stores/auth.test.ts` | 8 | `setSession/setTokens/clear/hydrate`；persist 适配器读写；clear 清 storage |
| `api/request.test.ts` | 12 | 200 解包；401→refresh→重放；refresh 失败 clear+reLaunch；并发 Promise 锁去重；403 强制登出；HTTP 非 200 throw；body.code 非 200 toast+throw |
| `api/modules/*.test.ts` | 6 | auth/reagents/requests 三个核心模块的 URL 拼接 + method（mock `apiRequest`） |
| `hooks/useRefreshList.test.ts` | 6 | 状态机迁移 |
| `hooks/useLoginCheck.test.ts` | 3 | 已登录直行；未登录 navigate；带 redirect 参数 |
| `locale/index.test.ts` | 3 | 默认语言探测（zh/en/fallback）；切换 + 持久化；`t(key)` 命中两种语言 |
| **合计** | **≈38** | |

**Mock 策略**
- `vitest.setup.ts` 全局 mock `uni`：`request/showToast/showLoading/setStorageSync/getStorageSync/removeStorageSync/reLaunch/navigateTo/switchTab` 用 `vi.fn()`，挂到 `globalThis.uni`
- 不 mock pinia，每个 describe 前 `setActivePinia(createPinia())`
- 页面组件不写 vitest

## 8. 验收标准（DoD）

1. `pnpm --filter @app/miniapp-uni test` 38 用例全过
2. `pnpm --filter @app/miniapp-uni build:h5` 与 `build:mp-weixin` 双双成功
3. H5 dev 用 `admin@lab.local / admin123` 跑通：登录 → 工作台 → 搜索试剂 → 提交领用申请 → 切到审批通过 → 看到通知 → 我的页改密 → 退出登录
4. 微信开发者工具打开 `dist/dev/mp-weixin` 跑通同链路（appid `touristappid`）
5. 401 自动 refresh 实测：手动改 access token 为非法值,业务请求自动 refresh 一次后正常返回
6. tokenVersion 失效实测：admin 在 web 端改密后，miniapp-uni 端下一次请求自动登出
7. 三个环境变量正确读取：`config/env.ts` 暴露的 `baseUrl/routerBase/appEnv` 在 H5 build:production 后通过控制台 `console.log(env)` 验证为 `.env.production` 中的值
8. i18n 切换实测：mine 页切换"中文/English"后，tabBar 名称、所有按钮、所有 toast 立即应用新语言；重启 app 仍保留选中语言
9. 老 Taro 工程 `apps/miniapp` 不动，可继续构建运行

## 9. 风险与缓解

### 9.0 Phase 0 spike（实施前必须先验证）

以下三项 Art-app 工程未实证，spec 默认假设可行；实施 plan 的 Phase 0 必须先做最小 spike 验证，**任一不通过则需调整 spec / 范围**：

| Spike | 验证内容 | 通过标志 | 失败时调整方向 |
|---|---|---|---|
| S1 `@app/shared` 消费 | 在 miniapp-uni vite.config 配置后，`import { ApiResponse } from '@app/shared'` 能正常构建 H5 + mp-weixin | build 不报模块解析错误，运行时类型可用 | shared 加 ESM 输出 / vite.config 加 `optimizeDeps.include` / 改用本地 ts 类型副本 |
| S2 vitest 在 uniapp+vue3 跑通 | 写一个最小 store 测试：`createPinia` + `setActivePinia` + 断言 | `pnpm test` 单用例通过 | 改用 jest（Art-app 也没 vitest，未必兼容）或退回手动验证 |
| S3 vue-i18n 9.x 在 alpha 通道工作 | mine 页切换中英、tabBar 名称随之变化 | 切换后所有 `$t(...)` 引用立即更新 | 降级到 vue-i18n@9 + legacy mode / 退回手写 i18n 工具 |

### 9.1 已识别风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| uniapp Vue3 alpha 通道 | 编译/运行潜在 bug | 锁 Art-app 同款已验证版本；遇问题降级路径切回 stable Vue2 通道（不在本次范围） |
| `@app/shared` CJS 输出 + uniapp+vite ESM | 引入失败 | Phase 0 S1 spike 优先验证；预案见 9.0 表 |
| uview-plus easycom 在 vite alpha 下偶有热更失效 | DX 影响 | 重启 dev；记 README 已知问题 |
| 微信小程序 2MB 主包限制 | 影响打包 | login/home/mine 主包；其余进 `package-business/` 分包；uview-plus 走 uni_modules 自动按需 |
| vitest mock uni.* 不全 | 用例脆弱 | 集中维护 `vitest.setup.ts`；S2 spike 优先验证可行性 |
| H5 端 `useWxCapsuleRect` 只对微信有效 | NavBar 高度异常 | hook 内 `#ifdef MP-WEIXIN` 取胶囊；其他端 fallback `statusBarHeight + 44rpx` |
| vue-i18n 在 uniapp Vue3 alpha 通道未实证 | i18n 切换异常 | S3 spike 优先验证；预案见 9.0 表 |
| uview-plus theme.scss 修改纳入 git | 与上游升级冲突 | 锁定版本不主动升级；如需升级在 PR 中手工 merge theme.scss 自定义部分 |

## 10. 范围外（YAGNI）

- 微信一键登录 / 手机号登录
- 推送通知 / 网络断线监听
- e2e 自动化（playwright 不覆盖小程序）
- 老 Taro 工程归档/删除
- i18n 业务文案/字段名（仅本次落地基础按钮+提示语+tabBar+NavBar标题，业务文案作为后续渐进 PR）
