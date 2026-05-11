# 个人信息（Profile）模块设计

**日期**: 2026-05-11
**主题**: TopBar UserMenu 中的"个人信息"从 disabled 状态启用，补充查看个人资料 + 改名 + 改密功能

## 背景

`apps/web/src/components/shell/UserMenu.tsx:45` 处的"个人信息"菜单项一直是 `disabled` 占位。
当前已具备的基础设施：

- `useAuth` store 含 `{ id, email, name, labId, roles }`
- API `GET /auth/me` 返回上述字段
- `tokenVersion` 已上线（P0-3），改 ver 可踢同账号所有 session
- `apiFetch` 401 → tryRefresh → clear/redirect 流程已稳

缺：自服务"改名"、"改密码"端点；前端无对应 UI。

## 目标 / 非目标

**Goal**
1. UserMenu 的"个人信息"可点击，打开侧抽屉
2. 抽屉内可看 email / 实验室 / 角色（只读）+ 改 name + 入口改密码
3. 改密码成功 → 当前 session 无感继续；其他 session 因 `ver` 失配下次请求 401 → 被踢

**Non-goal**
- 修改 email / labId / roles（仍 SYS_ADMIN 限定）
- 头像上传
- 第二/多因子认证
- 个人活动日志、我的请求列表等扩展（后续可在抽屉/独立页扩）

## 三项已对齐决策

| 决策 | 选择 |
|---|---|
| 功能范围 | **C** 看 + 改名 + 改密 |
| UI 形式 | Sheet 抽屉 + Dialog 改密 |
| 改密后会话处理 | 踢其他 session，保留当前（tokenVersion++ 后立即新 ver 签发并下发新对） |

## 后端设计

### 端点

挂在 `AuthController`（已登录态范围，无需 SYS_ADMIN）；继续走 `AuditInterceptor`。

#### `PATCH /auth/me`

- Body DTO: `UpdateMeDto { name: string, 1..50 chars }`
- Service: `AuthService.updateMe(userId, dto)` → `prisma.user.update({ where:{id:userId}, data:{ name } })`
- 校验：`@IsString @IsNotEmpty @MaxLength(50)`；`ValidationPipe({ whitelist:true })` 拒绝多余字段
- Audit action: `USER_UPDATE_SELF` entityType `User`
- 返回 `me()` 形状：`{ id, email, name, labId, roles }`

#### `POST /auth/change-password`

- Body DTO: `ChangePasswordDto { currentPassword: string, newPassword: string ≥8 chars }`
- Service: `AuthService.changePassword(userId, dto)`
  1. `prisma.user.findUniqueOrThrow({id})`
  2. `bcrypt.compare(currentPassword, passwordHash)` 失败 → `UnauthorizedException`
  3. `bcrypt.hash(newPassword, 10)`
  4. `prisma.user.update` 写新 hash + `tokenVersion: { increment: 1 }`，**select tokenVersion 拿到新 ver**
  5. 复用现有 `issueTokens(userId, roles, newVer)` 签新对（也会写 `currentRefreshJti`）
  6. 返回 `{ accessToken, refreshToken }`
- Audit action: `USER_CHANGE_PASSWORD` entityType `User`
- 客户端校验同步：`class-validator` `@MinLength(8)`

### 鉴权说明

- 已通过 `JwtAuthGuard`（全局 APP_GUARD）覆盖；DTO 用 `req.user.sub` 取当前用户 id
- 不暴露目标用户 id（与 SYS_ADMIN 的 `/users/:id` 不重叠，逻辑上互不影响）

## 前端设计

### 改动清单

| 文件 | 变更 |
|---|---|
| `apps/web/src/components/shell/UserMenu.tsx` | "个人信息" 去 disabled + `onClick` 打开 sheet（用本地 state 控制） |
| `apps/web/src/components/profile/ProfileSheet.tsx` | **新增** 右侧 Sheet |
| `apps/web/src/components/profile/ChangePasswordDialog.tsx` | **新增** 改密 Dialog |
| `apps/web/src/lib/auth-store.ts` | 已有 `setTokens`、`setUser` 复用；如缺 `setUser(partial)` 需补 |
| `apps/web/src/lib/api/me.ts`（或并入现有最近文件） | **新增** `updateMyProfile({ name })` / `changeMyPassword({ currentPassword, newPassword })` |

### ProfileSheet 组件结构

```
<Sheet open={open} onOpenChange>
  <SheetContent side="right" className="w-full sm:max-w-md">
    <SheetHeader>个人信息</SheetHeader>

    {/* 顶部 identity 卡 */}
    <Avatar + name + email />

    {/* Section A：只读资料 */}
    <Field label="邮箱">{user.email}</Field>
    <Field label="实验室">{labName ?? user.labId ?? '—'}</Field>
    <Field label="角色"><Badge>{role}</Badge>...</Field>

    {/* Section B：改名 */}
    <Form (react-hook-form + zod)>
      <Input name="name" defaultValue={user.name}/>
      <Button disabled={pristine || saving}>保存</Button>
    </Form>

    {/* Section C：安全 */}
    <Button onClick={() => setPwdOpen(true)}>修改密码</Button>
    <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen}/>
  </SheetContent>
</Sheet>
```

实验室名解析：若 `auth-store` 未存 lab.name，先用 labId fallback；后续可扩成调 `/labs/:id` 或加 `/auth/me` 返回 lab.name（**本期不做，保留 labId 字符串**）。

### ChangePasswordDialog 组件结构

```
<Dialog open onOpenChange>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>修改密码</DialogHeader>
    <Form (rhf + zod refine: new === confirm, new.length>=8)>
      <Input type="password" name="currentPassword"/>
      <Input type="password" name="newPassword"/>
      <Input type="password" name="confirmPassword"/>
      <Footer>
        <Button variant="ghost" onClick={close}>取消</Button>
        <Button type="submit" loading>提交</Button>
      </Footer>
    </Form>
  </DialogContent>
</Dialog>
```

提交流程：
1. submit → `changeMyPassword({ currentPassword, newPassword })` (apiFetch 已带 token)
2. 200 → `useAuth.setTokens(res)` → `toast.success('密码已修改，其他设备需要重新登录')` → 关闭 dialog + sheet
3. 401 → 设置字段错误 `setError('currentPassword', { message: '当前密码不正确' })`
4. 400 → 字段错误（按返回 message 落到 newPassword）

### data-testid 约定

为 e2e 与 vitest 选择稳定钩子：
- `profile-menu-trigger`（菜单项）
- `profile-sheet`、`profile-name-input`、`profile-save-name`
- `profile-change-password-btn`
- `change-password-dialog`、`pwd-current`、`pwd-new`、`pwd-confirm`、`pwd-submit`

## 测试

### API e2e（`apps/api/test/auth.e2e-spec.ts` 续）

`describe('PATCH /auth/me')`：
1. 未登录 → 401
2. 登录后 `{ name: '新名字' }` → 200 且 body.name 已更新
3. `{ name: '' }` → 400
4. `{ email: 'xxx@yyy', name: 'A' }` → 200 且 email 不变（whitelist 拦截）

`describe('POST /auth/change-password')`：
1. 成功：返回新对；解 token 后 `ver` 应 = 旧 ver + 1
2. **旧 access token 在 me 上 → 401**（验证踢 session 效果，env 必须 =0/未设）
3. 当前密码错 → 401
4. newPassword 长度 < 8 → 400
5. 改完后旧密码登录 → 401；新密码登录 → 200

> 注意测试需保证 `JWT_ALLOW_LEGACY_CLAIMS` 未设（不容忍），避免与 P0-3 容忍逻辑串味。

### Web vitest

`ProfileSheet.test.tsx`：
- 不渲染当无 user
- 渲染显示 email / name
- 改名提交 → fetch 被调到 `PATCH /auth/me` 且 body.name 正确，成功后 store.user.name 更新

`ChangePasswordDialog.test.tsx`：
- new 与 confirm 不一致 → 提交按钮不触发请求或显示字段错
- 成功 → fetch 调 `POST /auth/change-password`，setTokens 被调，onOpenChange(false)
- 401 → 字段错误 "当前密码不正确"

## 影响面与回归矩阵

| 模块 | 风险 | 缓解 |
|---|---|---|
| 既有 SYS_ADMIN `PATCH /users/:id` | 无逻辑重叠 | 路由 prefix 不同 |
| 既有 P0-3 legacy claim 容忍 | 改密后旧 token ver 失配；env=1 时也不容忍显式失配（已有测试覆盖） | 复用 P0-3 已加 5 e2e；改密 case 用 env 未设 |
| TanStack Query 缓存的 user | 当前 `/auth/me` 未挂 TanStack Query（仅 login 页直调），改名只需更新 `useAuth` store 的 user | 改名 mutation onSuccess → `useAuth.setUser({ name })` 即可 |
| Audit 表 | 新增 2 action 字面量 | `USER_UPDATE_SELF` / `USER_CHANGE_PASSWORD`，沿用 `@Audit` 装饰器 |

## 验收

- `pnpm --filter @app/api test:e2e` auth.spec 11 → ~18，全绿
- `pnpm --filter @app/web vitest run` 59 → ~65，全绿
- `pnpm exec tsc --noEmit` web/api 无错
- `pnpm --filter @app/shared build` 无错
- `pnpm exec next build` web shared 87.3 kB 持平
- 手动走查：登录 → 点头像 → 菜单"个人信息"可点 → 抽屉打开 → 改名生效 → 改密成功 toast + 当前页继续工作 → 在另一浏览器/无痕窗口的旧 session 下次请求被踢回 /login

## 不在本期范围

- 头像（仅显示首字母 fallback）
- "我的活动日志" 面板
- 双因子认证 / 邮箱验证
- 改 email/labId（需 SYS_ADMIN 流程）
