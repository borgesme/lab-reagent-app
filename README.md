# 实验室试剂预约系统

Web + 小程序 的实验室试剂领用、库存、采购与管控合规管理系统。

## 技术栈

- **后端**：NestJS 10 + Prisma 5 + PostgreSQL 16
- **前端**：Next.js 14 + React 18 + Tailwind + shadcn/ui
- **小程序**：Taro（后续里程碑）
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

## 测试

```bash
pnpm --filter @app/api test:e2e   # 后端 e2e
pnpm --filter @app/web test       # 前端单测
```

## 目录

- `apps/api` — NestJS 后端
- `apps/web` — Next.js 前端
- `packages/shared` — 共享类型
- `docs/superpowers/specs` — 设计文档
- `docs/superpowers/plans` — 实施计划
