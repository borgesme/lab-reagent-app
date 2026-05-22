# 用户与角色优化 — 设计文档

- 日期: 2026-05-22
- 范围: apps/api + apps/web
- 触发: b.md 提出的 5 项问题（敏感字段外泄 / 角色硬编码 / 密码 UX / KPI 重复调用 / 同步更新测试）
- 上线策略: 单 branch `feat/user-role-optimization`、5 commit 收尾 + 一个 tag

---

## 1. 背景与现状

| # | 现状关键事实 |
|---|---|
| ① | `apps/api/src/modules/users/users.service.ts` 全部读写都用 `include: { roles: { include: { role: true } }, lab: true }` 直接返回 Prisma 行，**`passwordHash` / `currentRefreshJti` / `tokenVersion` 一并外泄**；前端 `apps/web/src/app/(app)/admin/users/page.tsx` 的 `UserRow` 把 roles 当 `[{ role: { code } }]` 嵌套结构使用 |
| ② | `apps/web/src/app/(app)/admin/users/page.tsx` 写死 `ALL_ROLES = ['SYS_ADMIN','LAB_HEAD','REAGENT_ADMIN','PLAIN_USER']`，**漏了 Prisma 枚举里的 `SAFETY_OFFICER`**；后端 `GET /api/v1/roles` 已实现但前端未消费 |
| ③ | 添加用户表单密码字段 `type=password` 无可见切换、无二次确认 |
| ④ | `apps/web/src/app/(app)/page.tsx` 调用 4 个接口拼 KPI：<br>• `/requests?status=PENDING` — 后端按角色返回 lab/applicant 全量 PENDING，**语义≠"待我审批"**<br>• `/requests?mine=1` — **mine 参数在 service 里被忽略**，普通用户因 else 分支等价但其他角色拿到的是 lab/全量<br>• `/alerts/active` — **后端路由不存在**，前端 `Promise.allSettled` 静默吞错<br>• `/reagents?controlled=1` — **controlled 参数被 whitelist ValidationPipe 过滤**，实际拿到的是全部试剂 length |
| ⑤ | 现有 e2e: `apps/api/test/users.e2e-spec.ts` 14 用例；vitest: `apps/web/src/app/(app)/admin/users/__tests__/page.test.tsx` 8 用例，fixture 用旧 roles 嵌套结构 |

---

## 2. 设计原则

1. **一次性把 4 个接口语义都修正** —— 不是 b.md 第 4 点的字面替换，而是补全错位的查询条件，再额外提供聚合接口避免前端瀑布
2. **服务端单一出口 = UserView mapper** —— 全局裁剪，杜绝以后再有人 include 时漏掉敏感字段
3. **前端 form 仍走 zod + RHF**，沿用项目已有 shadcn FormDialog 套路，不引入新依赖
4. **测试与改动 1:1 同步**，e2e 加 sanitize 断言，vitest 切 fixture 形态

---

## 3. 接口契约

### 3.1 UserView（裁剪后返回）

适用接口：`GET /users`、`GET /users/page` 的 items、`POST /users`、`PATCH /users/:id`、`POST /users/:id/reset-password` 不变（继续只返 `{ tempPassword }`）、`POST /users/batch-delete` 不变（继续只返 `{ deleted }`）。

```ts
interface UserView {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  wechatOpenId: string | null;
  labId: string | null;
  lab: { id: string; name: string; building: string | null } | null;
  roles: string[];          // ['PLAIN_USER', ...] — 仅 code，无 id/name 包装
  createdAt: string;        // ISO
  updatedAt: string;        // ISO
}
```

去掉的字段（外部永不可见）：`passwordHash`、`currentRefreshJti`、`tokenVersion`、`deletedAt`、`lab.tenantId`、`lab.createdAt`、`lab.updatedAt`、`lab.deletedAt`。

实现位置：`apps/api/src/modules/users/users.view.ts`，导出 `toUserView(row)` 与 `toUserViews(rows)`，service 各方法在返回前调用一次。

### 3.2 `/dashboard/kpi`（新增）

- 路由：`GET /api/v1/dashboard/kpi`
- 权限：登录即可（无 @Roles）
- 返回：

```ts
{ pendingApprovals: number; myRequests: number; stockAlerts: number; controlledReagents: number }
```

- 语义（贴近现有代码而非新发明）：
  - `pendingApprovals` — 当前角色能看到的 `Request{status: PENDING}` 数量。LAB_HEAD/REAGENT_ADMIN 限本 lab；SYS_ADMIN 看全量；PLAIN_USER → 0
  - `myRequests` — `applicantId = me` 且 `status ∈ {DRAFT, PENDING, APPROVED, ISSUED}`（剔除 CLOSED/CANCELLED/REJECTED）
  - `stockAlerts` — `Notification` 中 `recipientId=me ∧ readAt IS NULL ∧ type IN (ALERT_LOW_STOCK, ALERT_EXPIRING, ALERT_RECONCILE)` 的数量
  - `controlledReagents` — `Reagent{deletedAt IS NULL ∧ (hazardLevel='CONTROLLED' ∨ controlType IS NOT NULL)}` 总数（全局）

- 实现：`apps/api/src/modules/dashboard/{dashboard.module,dashboard.controller,dashboard.service}.ts`，service 用 `prisma.$transaction([count, count, count, count])` 4 并行，appModule 注册
- 注意：dashboard.kpi 内部直接走 prisma count，不复用 `/requests?scope=approval`；PLAIN_USER 的 `pendingApprovals` 在 service 里短路返 0，不依赖 RolesGuard 抛 403

### 3.3 `/alerts/active`（新增）

- 路由：`GET /api/v1/alerts/active`
- 权限：登录即可
- 返回：当前用户未读的告警 Notification 列表（最新优先，cap 50）

```ts
Array<{ id; type; title; body; payload; createdAt }>
```

- 实现：`apps/api/src/modules/alerts/alerts.controller.ts` 加 `@Get('active')` 路由（独立 `@Controller('alerts')` 嵌入同 module）+ `AlertsService.listActiveForUser(userId)`

### 3.4 `/requests` 改造

DTO（`query-request.dto.ts`）新增：

```ts
@IsOptional() @IsIn(['0','1']) mine?: '0' | '1';
@IsOptional() @IsIn(['approval']) scope?: 'approval';
```

Service 逻辑变化：

- `scope=approval` —— 强制只返 `status=PENDING`；LAB_HEAD/REAGENT_ADMIN 限本 lab；SYS_ADMIN 全量；PLAIN_USER → 403
- `mine=1` —— 不论角色，强制 `applicantId=actor.sub`
- 与 `status` / `reagentId` / `labId` 兼容叠加
- 优先级：`scope=approval` > `mine=1` > 现有角色 fallback

### 3.5 `/reagents` 改造

DTO（`query-reagent.dto.ts`）新增：

```ts
@IsOptional() @IsIn(['0','1']) controlled?: '0' | '1';
```

Service：`controlled=1` 时 `where.OR = [{ hazardLevel: 'CONTROLLED' }, { controlType: { not: null } }]`，叠加 deletedAt null 软删过滤。

### 3.6 前端 admin/users 改造

- `UserRow` 接口：`roles: string[]`（不再 `[{ role: { code } }]`）
- 角色源切换：用 `useApiQuery<Array<{ id; code; name }>>('/roles', { queryKey: ['roles'] })` 拉，列表/编辑/创建 三处统一消费 `data?.map(r=>r.code)`
- 密码 UX（仅创建表单，重置密码不涉及）：
  - 新增 `PasswordInput` 通用组件（`apps/web/src/components/ui/password-input.tsx`）：右侧 Eye/EyeOff icon button 切换 input type
  - 在 `createSchema` 增加 `passwordConfirm: z.string()`；用 `.superRefine` 校验 `password === passwordConfirm`，错误归到 `passwordConfirm` 字段
  - 表单字段顺序：邮箱 / 姓名 / 密码（PasswordInput） / 确认密码（PasswordInput） / 实验室 / 角色
  - testid：`admin-users-create-password-toggle`、`admin-users-create-password-confirm`

### 3.7 前端 dashboard 改造

`apps/web/src/app/(app)/page.tsx`：

- 删 4 个 `apiFetch` 调用，替换为单个 `useApiQuery<Kpi>('/dashboard/kpi', { queryKey: ['dashboard','kpi'] })`
- 拿到的 data 直接 setKpi，错误用 useEffect 监听 isError 调 toast.error
- 旧的 ZERO 兜底保留

---

## 4. 数据流

```
[admin/users 页面]
   ├─ useApiQuery('/users/page', ...) ──► GET /users/page ──► UsersService.listPaged ──► toUserViews(...) ──► UserView[]
   ├─ useApiQuery('/roles') ──► GET /roles ──► Role[] (id+code+name)
   ├─ useApiQuery('/labs') ──► GET /labs ──► Lab[]
   ├─ FormDialog(create) ──► POST /users ──► UserView
   ├─ FormDialog(edit) ──► PATCH /users/:id ──► UserView
   ├─ ConfirmDialog(delete) ──► DELETE /users/:id ──► UserView (用于审计)
   ├─ ConfirmDialog(batch) ──► POST /users/batch-delete ──► { deleted: n }
   └─ ConfirmDialog(reset) ──► POST /users/:id/reset-password ──► { tempPassword }

[Dashboard 页面]
   └─ useApiQuery('/dashboard/kpi') ──► GET /dashboard/kpi ──► DashboardService.getKpi(user) ──► prisma.$transaction([4 个 count]) ──► Kpi
```

---

## 5. 错误处理

- UserView mapper 在 service 末尾调用，service 抛 NotFoundException/ConflictException 的行为不变
- `/requests?scope=approval` 普通用户 → ForbiddenException
- `/dashboard/kpi` 任一 count 失败 → 整个事务回滚 → 500（前端 toast.error），不返回部分数据
- `/alerts/active` 未登录 → JwtGuard 401，已登录但无未读 → 返回 `[]`
- 前端密码二次校验失败 → zod 自动设错误 → submit 拦截 + sonner 不弹（zod 错误已在 FormMessage 显示）

---

## 6. 测试计划

### 6.1 apps/api/test

| 文件 | 新增/修改 | 覆盖点 |
|---|---|---|
| `users.e2e-spec.ts` | 修 | 现有用例 expect 不应包含 `passwordHash` / `currentRefreshJti` / `tokenVersion`；roles 期望 `Array<string>` |
| `users.e2e-spec.ts` | 新 | 1) `GET /users` 任意 user 不含三个敏感字段；2) `roles` 形态为字符串数组；3) `POST /users` 返回 view 不含敏感字段 |
| `dashboard.e2e-spec.ts` | 新 | 1) SYS_ADMIN 登录 → 四 key 都为 number；2) 普通用户 → pendingApprovals=0；3) 未登录 → 401 |
| `alerts.e2e-spec.ts` | 新（若不存在则新建）| `GET /alerts/active` 返回未读列表；标记 readAt 后 length-- |
| `requests.e2e-spec.ts` | 修 | 1) `mine=1` PLAIN_USER 自有；2) `mine=1` LAB_HEAD 强制只看自己的；3) `scope=approval` PLAIN_USER 403；4) `scope=approval` LAB_HEAD 只见本 lab PENDING |
| `reagents.e2e-spec.ts` | 修 | `controlled=1` 仅返回受控试剂 |

### 6.2 apps/web vitest

| 文件 | 修改 |
|---|---|
| `admin/users/__tests__/page.test.tsx` | fixture roles 改 `['PLAIN_USER']` 字符串数组；mock `/roles` 返回 `[{id,code,name}]`；新加 2 个用例：密码可见切换、二次密码不一致拦截 |
| `app/(app)/__tests__/page.test.tsx`（如未有则新增）| mock `/dashboard/kpi` → 验证四个值上屏，错误态 toast.error |

### 6.3 验收命令

```powershell
# api
pnpm --filter @app/api test:e2e

# web
pnpm --filter @app/web test
pnpm --filter @app/web build
pnpm --filter @app/web tsc --noEmit
```

期望：api e2e 现有 16 spec 不退化（其中 users 用例数 +3、新增 dashboard 1 spec）；web vitest 现有 76 用例 + 新增 2-3 不退化；shared build 体积 87.3 kB 持平。

---

## 7. 实施步骤（5 commit）

1. `feat(api): UserView mapper + users service 出口统一裁剪 + e2e 补 sanitize`
2. `feat(web): /roles 接入 + admin/users roles 切扁平 string[] + fixture 改造`
3. `feat(web): PasswordInput 组件 + 创建表单加可见切换与二次确认 + 测试`
4. `feat(api): DashboardModule 聚合 KPI + e2e`
5. `fix(api): /requests mine&scope + /reagents controlled + /alerts/active + e2e`

每一步 commit 完后跑各自的 e2e/vitest，全绿再下一步。

---

## 8. 不做的事（YAGNI）

- 不引入 KPI 缓存层（redis 或 in-memory），首版 prisma count 4 并行 < 50ms
- 不动 `/auth/me` 形态（本身已经吐 `roles: string[]`）
- 不重构 alerts module 的 scheduler / mailer 逻辑
- 不补 admin/users 的批量创建/导入
- 不为聚合接口加 ETag / conditional GET，前端用 react-query staleTime 控制即可

---

## 9. 风险与回滚

- UserView mapper 全局裁剪后，**任何外部脚本/小程序依赖 `passwordHash` 等字段的会报错** —— 项目内 grep 无此使用，外部消费者据知不存在
- `/requests` DTO 加新字段不破坏旧调用（IsOptional），但 `scope=approval` 是新语义，旧前端不会主动传
- 单 PR 打包出问题：`git revert <merge-sha>` 即可回滚全部 5 个 commit
