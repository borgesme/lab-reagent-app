# 实验室试剂预约系统

Web + 小程序 的实验室试剂领用、库存、采购与管控合规管理系统。

## 技术栈

- **后端**：NestJS 10 + Prisma 5 + PostgreSQL 16
- **前端**：Next.js 14 + React 18 + Tailwind + shadcn/ui
- **小程序**：uni-app + Vue 3 + Pinia + uView Plus（`apps/miniapp-uni`）
- **共享类型**：`packages/shared`
- **包管理**：pnpm workspace
- **认证**：JWT（access 15m + refresh 7d）+ RBAC

## 开发启动

前置：Node 20+、pnpm 9+、PostgreSQL（本地或远程）。

```bash
cp .env.example .env             # 修改 DATABASE_URL 为你的 pg
pnpm install
pnpm --filter @app/api prisma:generate
pnpm --filter @app/api exec prisma migrate deploy
pnpm --filter @app/api prisma:seed

pnpm dev:api                     # 终端 1 → http://localhost:3001
pnpm dev:web                     # 终端 2 → http://localhost:3000
```

默认系统管理员：`admin@lab.local` / `admin123`

## 小程序（apps/miniapp-uni）

uni-app + Vue 3 + Pinia + uView Plus，统一构建产物供 H5 / 微信小程序使用。

### 启动

```bash
cd apps/miniapp-uni
npm install                       # 必须用 npm，且必须 cd 进目录,不能在根目录 pnpm --filter

npm run dev:h5                    # H5 → http://localhost:3003
npm run dev:mp-weixin             # 微信小程序 → dist/dev/mp-weixin（用微信开发者工具打开）
npm run build:mp-weixin           # 微信小程序生产构建 → dist/build/mp-weixin
npm run test                      # vitest
npm run type-check                # vue-tsc 类型检查
```

### 注意事项

- **不能用根目录 pnpm --filter 安装/启动**：uni-app 的 `@dcloudio/*` 全家桶在 pnpm 软链场景下解析不到对端依赖，必须 `cd apps/miniapp-uni && npm install`。
- **monorepo 内部包通过 alias 接管**：`package.json` 不要写 `"@app/shared": "workspace:*"`（npm 装不上）；`@app/shared` / `@/` 已经在 `vite.config.ts` 与 `vitest.config.ts` 配好 alias。
- **微信小程序分包**：`login` / `search` / `report-summary` 在 `src/pages-sub` 子包下，跳转 URL 用 `/pages-sub/<name>/index`。
- **mp-weixin 下 `$t` 不可用**：vue-i18n 的全局属性已在 `src/main.ts` 显式挂到 `app.config.globalProperties.$t`，新页面直接用即可。
- **`getSystemInfoSync` 已废弃**：用 `uni.getWindowInfo()` 取窗口/安全区，`uni.getAppBaseInfo()` 取语言/基础信息。
- **不要配 `preloadRule`**：经评估当前页规模不需要预加载，配了反而拖累首屏。

## 测试

```bash
pnpm --filter @app/api test:e2e   # 后端 e2e
pnpm --filter @app/web test       # 前端单测
cd apps/miniapp-uni && npm test   # 小程序单测（必须 cd + npm）
```

## 目录

- `apps/api` — NestJS 后端
- `apps/web` — Next.js 前端
- `apps/miniapp-uni` — uni-app 小程序
- `packages/shared` — 共享类型
- `docs/superpowers/specs` — 设计文档
- `docs/superpowers/plans` — 实施计划
