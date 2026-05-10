# 技术债 / 待优化事项 Spec（P8c 收尾后）

> **本文档是 spec（design + decisions），不是 executable plan**。配套的逐 step 执行计划见 `docs/superpowers/plans/2026-05-10-tech-debt-backlog.md`（13 任务 + 1 验收，全部细化到 files / step / 命令 / commit）。本 spec 保持原 backlog 的优先级分组与决策表，作为 plan 的输入与回查依据。

**起点 commit:** `8d52ccc`（master HEAD，含 token refresh fix）
**整理日期:** 2026-05-10
**回顾来源:** session ca4d2bf2 P8c 验收 + token unauthorized 排查
**Plan 配对:** `docs/superpowers/plans/2026-05-10-tech-debt-backlog.md`

---

## 优先级分组

- **P0 高** —— 影响功能一致性，用户可观察到失败（导出失败 / 安全风险）
- **P1 中** —— 健壮性与 UX 改进，不修也能用，修了体验明显变好
- **P2 低** —— 测试覆盖缺口，长期债务
- **P3 可选** —— 微调与小修

---

## P0 高优先级

### P0-1 · `ExportButton` 不走 `apiFetch`，token 过期不会自动 refresh

**Files:**
- `apps/web/src/components/reports/ExportButton.tsx:29`
- `apps/web/src/lib/api-client.ts`

**问题：** P8c 引入 `ExportButton` 时直接用 `fetch` 自带 `Authorization` 头处理 Blob 下载，未走刚加的 `apiFetch`。后续 `8d52ccc` 给 `apiFetch` 加了 401 → refresh → retry 拦截，**ExportButton 没接入这个能力**。

**触发场景：** 用户停留在 reports/* 页超过 15 min（access TTL），点"导出 CSV / Excel"→ 401 → toast `导出失败:HTTP 401`。其他业务请求会自动续期，唯独导出会失败，体验割裂。

**建议方案：**
1. `api-client.ts` 抽一个 `apiFetchRaw(path, opts)` 返回 `Response`（共享 `tryRefresh()` 路径），`apiFetch<T>` 内部包它后 `.json()`。
2. `ExportButton` 改用 `apiFetchRaw(endpoint + '?format=csv')` → `res.blob()` → 现有下载逻辑不变。
3. 同样的改造也覆盖未来其他 Blob / Stream 场景（PDF 导出、文件下载等）。

**验证：** 手测 `JWT_ACCESS_TTL=30s`，等过期后点导出 → 应该看到 `/auth/refresh` 200 + 导出请求重试 200 + 文件下载成功。

**工作量：** 30 min（含一个 vitest mock 单测）

---

### P0-2 · 后端 refresh token rotation 缺失

**Files:**
- `apps/api/src/auth/auth.service.ts:65-92`
- 新增表迁移 `apps/api/prisma/schema.prisma`（如果用 DB 黑名单）

**问题：** `auth.service.refresh()` 收到旧 refresh token 签发新对，但**旧 refresh token 仍 7 天有效**。任何泄漏的旧 refresh token 都能持续换新 access token，等同于 7 天后门。

**触发场景：** refresh token 通过 localStorage 存放，XSS / 设备共享 / 调试工具拷贝都可能泄漏一次。当前架构下泄漏即"失控直到 7d 后过期"。

**建议方案（从轻到重）：**
- **A. token jti + 最近一次 jti 写 user 表**（轻）：每次 issueTokens 给 refresh 加 jti，user 表加 `currentRefreshJti`；refresh endpoint 校验传入 jti == 当前；rotation 后旧 jti 立即失效。
- **B. revoked-token 表**（中）：refresh 用过即写 `RevokedToken(jti, expiresAt)`；后台定时清理已过期记录。
- **C. Redis 黑名单**（重）：低延迟，需引入 redis 依赖。

推荐 **A**，迁移最小，对已有架构改动最少。

**验证：**
- e2e：第一次 refresh → 200 拿新对；同一旧 refresh token 再次 refresh → 401。
- typecheck + 现有 auth 单测全绿。

**工作量：** 2-3 h（含 prisma migration、service 改造、controller 不变、写一个 spec）

---

### P0-3 · `reset-password` 后旧 access token 仍 15 min 有效

**Files:**
- `apps/api/src/users/users.service.ts:resetPassword`
- `apps/api/src/auth/auth.service.ts`
- 新增字段 `User.tokenVersion: Int` 或类似

**问题：** Task 11a 加了 `POST /users/:id/reset-password`，把 passwordHash 重写。但**已签发的 access token 仍合法**（无状态 JWT），最多 15 min 后才自动失效。被踢的用户那段时间内仍能调任意业务接口。

**触发场景：** 安全事件响应——管理员发现异常想立刻锁定某账号 → reset-password → 但当前代码无法立即生效。

**建议方案：** `User` 表加 `tokenVersion: Int @default(0)`；issueTokens 把 `tokenVersion` 写入 JWT payload；JwtStrategy 校验 payload.tokenVersion == DB.tokenVersion；reset-password / change-password / softDelete 操作都 `tokenVersion++`。

**验证：**
- 管理员 reset-password 用户 X → X 现有 token 立即变 401。
- X 重新登录后 token 又能用。

**工作量：** 1.5 h（migration + payload + strategy + 1 spec）

> P0-2 与 P0-3 可以打包一起做，都涉及 `auth.service.ts` 的 issueTokens / verify 路径。

---

## P1 中优先级

### P1-1 · `apiFetch` 无 timeout / abort 支持

**Files:** `apps/web/src/lib/api-client.ts`

**问题：** 后端慢或网络挂时前端无限等，组件 loading state 永久卡住。`apiFetch` 没有 `AbortController` 接入。

**建议方案：**
- 加 `opts.signal?: AbortSignal` 透传到 `fetch`。
- 默认 30 s timeout via `AbortSignal.timeout(30_000)`（Node 20 / Web 标准 API）。
- 调用方传 `signal` 时禁用默认 timeout，或合并两个 signal（`AbortSignal.any([opts.signal, AbortSignal.timeout(30_000)])`）。
- 组件 useEffect cleanup 里 `controller.abort()` 取消未完成请求避免 memory leak。

**验证：** 单测 mock fetch 永不 resolve，30 s 后应该 throw `TimeoutError`。

**工作量：** 1 h

---

### P1-2 · 数据层重复样板（无 SWR / TanStack Query）

**Files:** 所有 `apps/web/src/app/(app)/**/page.tsx` 中 `refresh()` callback 模板

**问题：** 每页都是 `useState(loading) + useEffect + apiFetch + try/catch + toast.error`，重复 ~15 处。无缓存，路由切回重新请求；无 stale-while-revalidate；无后台自动重试。

**建议方案：**
- 引入 **TanStack Query v5**（与 RHF/zod 无冲突）。
- 写 `useApiQuery<T>(path, opts)` 适配器封装 apiFetch + 默认 staleTime 30s + retry 1 次。
- 改造时分批：先 reports/* 4 页 + admin/users 试点，看 build size / 体验后决定是否推广全站。
- bundle 影响：TanStack Query v5 ~13 kB gz，shared 87.3 → 100 kB 左右，需要重新评估 budget。

**验证：** vitest + playwright 维持现绿；shared kB 评估后决定是否合并。

**工作量：** 试点 4 h（含适配器 + 4 个页面改造 + bundle 评估）；全站推广 1-2 d。

> **风险：** 改造一旦跨页面就会触发大量 diff；建议作为一个独立 plan 而不是顺手做。

---

### P1-3 · `/admin/users` 编辑实验室是裸 Input 填 UUID

**Files:** `apps/web/src/app/(app)/admin/users/page.tsx`（labId Input 段）

**问题：** Task 11b 编辑 dialog 里 "实验室 ID" 是 `<Input>`，要求管理员手敲 UUID，UX 极差。

**建议方案：** 改 shadcn `Combobox`（Popover + Command）或 `Select`，从 `/labs` endpoint 拉列表展示 `name`（`value` 仍是 id）。空选项标签 "无实验室"。

**验证：** 手测编辑 dialog → 选实验室 → PATCH 成功 → 表刷新显示新名字。

**工作量：** 1 h（含 useReactQuery 拉 labs 或简单 useEffect）

---

### P1-4 · 临时密码 toast 30s 没复制按钮

**Files:** `apps/web/src/app/(app)/admin/users/page.tsx`（onConfirm 内 `toast.success`）

**问题：** Task 11b 重置密码后通过 `toast.success(临时密码：xxx, { duration: 30_000 })` 显示 30 秒，管理员只能手敲转给被重置用户——容易抄错。

**建议方案：**
```tsx
toast.success(`临时密码：${tempPassword}`, {
  duration: 60_000,
  action: {
    label: '复制',
    onClick: () => {
      navigator.clipboard.writeText(tempPassword);
      toast.success('已复制到剪贴板');
    },
  },
});
```

**验证：** 手测点"复制" → 剪贴板有内容 → 二次 toast 提示。

**工作量：** 15 min

---

## P2 低优先级（测试覆盖）

### P2-1 · `/admin/users` 编辑 + 重置密码无单测

**Files:** 新增 `apps/web/src/app/(app)/admin/users/__tests__/page.test.tsx`

**问题：** Task 11b 加的两条新链路（FormDialog PATCH / ConfirmDialog → POST 显示临时密码）只有 plan 中的 manual smoke 步骤，没有自动化测试。

**建议方案：** RTL + msw（或 mock apiFetch），覆盖：
1. 点 DropdownMenu → 编辑 → 改 name → 提交 → apiFetch PATCH 调用了
2. 点 DropdownMenu → 重置 → confirm → apiFetch POST 调用了 + toast 出现
3. PATCH 失败 → toast.error，dialog 不关

**工作量：** 1.5 h

---

### P2-2 · `apps/api` users.controller 端点无 e2e/integration 测试

**Files:** 新增 `apps/api/test/users.e2e-spec.ts`

**问题：** P8c 加的 reset-password endpoint 没自动化测试。Patch 也是。

**建议方案：** 沿用 NestJS 标准 e2e（Test.createTestingModule + supertest）；用 sqlite 内存 DB 或 prisma test schema 隔离。覆盖：list / create / update / delete / reset-password 5 路由。

**工作量：** 2 h

---

### P2-3 · `apiFetch` refresh 路径无单测

**Files:** 新增 `apps/web/src/lib/__tests__/api-client.test.ts`

**问题：** `8d52ccc` 加的 401 → refresh → retry 链路只手测过 happy path，没单测。并发去重、refresh 失败跳 login 两条 edge case 都没覆盖。

**建议方案：** vitest mock global.fetch，覆盖：
1. 第一个 fetch 401 → refresh fetch 200 → retry fetch 200 → 返回 data
2. 第一个 fetch 401 → refresh fetch 401 → 调 `useAuth.getState().clear()` + `window.location.href` 改写
3. 两个并发 401 → refresh 只触发一次（断言 fetch refresh url 调用 1 次）

**工作量：** 1 h

---

## P3 可选 / 微调

### P3-1 · TS strict warnings — RTL `act` deprecated

**Files:** `package.json` 升级 `@testing-library/react`（当前疑似 14.x，新版 15.x 不再依赖 ReactDOMTestUtils.act）

**问题：** vitest 输出每个测试都打印 `Warning: ReactDOMTestUtils.act is deprecated...`，干扰阅读。

**建议方案：** `pnpm -F @app/web up @testing-library/react -L`（latest），跑全套测试确认绿。

**工作量：** 15 min（升级 + 测试）

---

### P3-2 · CSV / Excel 导出文件名 fallback 太通用

**Files:** `apps/web/src/components/reports/ExportButton.tsx:42`

**问题：** 后端 `Content-Disposition` 缺失时 fallback 用 `report.${format}`，多个 reports 导出都叫 `report.csv` 容易覆盖。

**建议方案：** 解析 endpoint 拿 slug，fallback 用 `${slug}-${YYYYMMDD}.${format}`，如 `usage-trend-20260510.csv`。

**工作量：** 10 min

---

### P3-3 · `auth-store.clear()` 不清 `refreshInflight`

**Files:** `apps/web/src/lib/auth-store.ts` 或 `apps/web/src/lib/api-client.ts`

**问题：** 用户主动登出 / 401 跳 login 时调 `clear()`，如果此时有正在飞的 refresh promise，它会写回新 token。当前不致命（`window.location.href = '/login'` 已经把页跳走），但行为不干净。

**建议方案：** `api-client.ts` exposed 一个 `cancelInflightRefresh()`，`clear` 时调一下；或者更简单：refresh resolve 前再 check `useAuth.getState().tokens` 是否还在，已被 clear 就别 setTokens。

**工作量：** 15 min

---

## 打包建议

按主题分组成 mini plans：

| Mini Plan | 含项 | 总工作量 |
|---|---|---|
| **auth 安全收尾** | P0-2 + P0-3 + P3-3 | ~4 h |
| **导出统一** | P0-1 + P3-2 | ~40 min |
| **数据层与超时** | P1-1 + P1-2（试点） | ~5 h |
| **/admin/users UX** | P1-3 + P1-4 + P2-1 | ~3 h |
| **测试补全** | P2-2 + P2-3 | ~3 h |
| **环境清理** | P3-1 | ~15 min |

**最低成本建议：先做"导出统一" + "auth 安全收尾"**——前者修一个用户能直接观察到的 bug，后者堵两个真实安全洞，且都有测试可验证。

---

## 不在本 backlog 的事项

以下不算技术债，故不列：
- docker e2e 复测 —— 是用户本机环境验证步骤，已在 p8b/p8c memory 标记
- 视觉走查 —— 已完成
- e2e 在 CI 跑 —— 需要更大架构决策（GitHub Actions / 自托管 runner / docker compose），不属"小优化"
- 国际化（i18n）—— 当前全中文，未提需求
- 暗色主题完整性 —— 已通过 p8c 视觉走查
