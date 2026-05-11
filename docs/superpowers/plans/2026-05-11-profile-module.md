# 个人信息（Profile）模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 启用 TopBar UserMenu 中的"个人信息"，加上抽屉式资料展示、改名、改密码功能；改密成功后保留当前 session 同时踢掉其他 session。

**Architecture:** API 在 `AuthController` 加 `PATCH /auth/me` 与 `POST /auth/change-password` 两个端点（已登录态，无需 SYS_ADMIN）；改密路径走 `tokenVersion++` 后立即用新 ver 签发新对一并下发，已登录的本机吃下新 token，其他机器的旧 token 因 ver 失配在下一次请求 401 被既有 401→clear 流程踢回登录页。前端用 shadcn Sheet（抽屉）+ Dialog（改密二级），表单一律 react-hook-form + zod，复刻 `admin/users` 既有风格。

**Tech Stack:** NestJS + class-validator (api) / Next.js App Router + zustand + react-hook-form + zod + shadcn/ui + sonner (web) / vitest + supertest (test)

**前置参考文件**
- 设计 spec: `docs/superpowers/specs/2026-05-11-profile-module-design.md`
- 后端登录/刷新参考: `apps/api/src/auth/auth.service.ts`
- 后端 e2e 模式参考: `apps/api/test/auth.e2e-spec.ts`
- 前端 FormDialog 模式参考: `apps/web/src/components/data/FormDialog.tsx`
- 前端表单页参考: `apps/web/src/app/(app)/admin/users/page.tsx`
- 用户菜单挂载点: `apps/web/src/components/shell/UserMenu.tsx:45`
- store 形状: `apps/web/src/lib/auth-store.ts`
- 共享类型: `packages/shared/src/api-types.ts`

---

## Task 1: API — DTO 与 AuthService.updateMe + PATCH /auth/me + e2e

**Files:**
- Create: `apps/api/src/auth/dto/update-me.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts`（在 `me()` 后加 `updateMe`）
- Modify: `apps/api/src/auth/auth.controller.ts`（加 `PATCH me`）
- Test (modify): `apps/api/test/auth.e2e-spec.ts`（文件末尾、最外层 `describe('Auth')` 内追加一个 describe）

- [ ] **Step 1: 写 e2e 失败测试**

在 `apps/api/test/auth.e2e-spec.ts` 内、`describe('legacy claim 容忍...')` 之后、最外层 `describe('Auth')` 闭合 `})` 之前，插入：

```ts
  describe('PATCH /auth/me', () => {
    let access: string;
    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@lab.local', password: 'admin123' });
      access = login.body.accessToken;
    });

    it('未登录 → 401', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/me')
        .send({ name: '新名字' });
      expect(res.status).toBe(401);
    });

    it('合法 name → 200 且 body.name 更新', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${access}`)
        .send({ name: '管理员-改' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('管理员-改');
      expect(res.body.email).toBe('admin@lab.local');
    });

    it('空 name → 400', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${access}`)
        .send({ name: '' });
      expect(res.status).toBe(400);
    });

    it('whitelist 拦截多余字段:email/labId/roles 不变', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${access}`)
        .send({
          name: '管理员-再改',
          email: 'pwn@evil.com',
          labId: 'fake-id',
          roles: ['PLAIN_USER'],
        });
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('admin@lab.local');
      expect(res.body.roles).toEqual(expect.arrayContaining(['SYS_ADMIN']));
    });
  });
```

- [ ] **Step 2: 跑测试确认失败**

```
cd D:/Project/0417-any-demo/apps/api
pnpm exec jest --config test/jest-e2e.json --runInBand --testPathPattern auth
```

预期：新 4 个 PATCH /auth/me case 全 404（路由不存在）或 401。原 11 case 仍绿。

- [ ] **Step 3: 创建 UpdateMeDto**

写入 `apps/api/src/auth/dto/update-me.dto.ts`：

```ts
import { IsString, MinLength, MaxLength } from 'class-validator';

export class UpdateMeDto {
  @IsString() @MinLength(1) @MaxLength(50) name!: string;
}
```

- [ ] **Step 4: AuthService 加 updateMe**

`apps/api/src/auth/auth.service.ts`：在 `me()` 方法后、`refresh()` 前插入：

```ts
  async updateMe(userId: string, dto: { name: string }) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name },
    });
    return this.me(userId);
  }
```

- [ ] **Step 5: AuthController 加 PATCH /auth/me**

`apps/api/src/auth/auth.controller.ts`：

文件顶部 imports 处加 `Patch`：

```ts
import { Body, Controller, Get, HttpCode, Patch, Post, Req } from '@nestjs/common';
```

再加 `Audit` 装饰器 + DTO import：

```ts
import { UpdateMeDto } from './dto/update-me.dto';
import { Audit } from '../common/decorators/audit.decorator';
```

在 `me()` 路由后追加：

```ts
  @Patch('me')
  @Audit({ action: 'USER_UPDATE_SELF', entityType: 'User' })
  updateMe(@Req() req: any, @Body() dto: UpdateMeDto) {
    return this.auth.updateMe(req.user.sub, dto);
  }
```

- [ ] **Step 6: 跑测试确认通过**

```
cd D:/Project/0417-any-demo/apps/api
pnpm exec jest --config test/jest-e2e.json --runInBand --testPathPattern auth
```

预期：全 15 个 case 绿（原 11 + 新 4）。如果 "whitelist 拦截多余字段" case 失败说明 ValidationPipe 未启用 whitelist，但 `auth.e2e-spec.ts:16` 已经 `useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))`，应该直接通过。

- [ ] **Step 7: 提交**

```
cd D:/Project/0417-any-demo
git add apps/api/src/auth/dto/update-me.dto.ts apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.controller.ts apps/api/test/auth.e2e-spec.ts
git commit -m "feat(api/profile): PATCH /auth/me 自服务改名 + 4 e2e"
```

---

## Task 2: API — AuthService.changePassword + POST /auth/change-password + e2e

**Files:**
- Create: `apps/api/src/auth/dto/change-password.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts`（加 `changePassword`）
- Modify: `apps/api/src/auth/auth.controller.ts`（加 `POST change-password`）
- Test (modify): `apps/api/test/auth.e2e-spec.ts`（再追加一个 describe）

- [ ] **Step 1: 写 e2e 失败测试**

在 `auth.e2e-spec.ts` 末尾、`describe('Auth')` 闭合前再插入：

```ts
  describe('POST /auth/change-password', () => {
    const initialPwd = 'pw-init-1234';
    const newPwd = 'pw-new-5678';
    let userEmail: string;

    beforeAll(async () => {
      userEmail = `pwd-test-${Date.now()}@lab.local`;
      const reg = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: userEmail, name: 'PwdTest', password: initialPwd });
      expect(reg.status).toBe(201);
    });

    async function login(password: string) {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: userEmail, password });
    }

    it('当前密码错 → 401, 密码不变', async () => {
      const lg = await login(initialPwd);
      expect(lg.status).toBe(200);
      const res = await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${lg.body.accessToken}`)
        .send({ currentPassword: 'wrong', newPassword: newPwd });
      expect(res.status).toBe(401);
      const reLogin = await login(initialPwd);
      expect(reLogin.status).toBe(200);
    });

    it('新密码 < 8 → 400', async () => {
      const lg = await login(initialPwd);
      const res = await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${lg.body.accessToken}`)
        .send({ currentPassword: initialPwd, newPassword: 'short' });
      expect(res.status).toBe(400);
    });

    it('成功换密 → 200, 返回新对; 旧 access token 失效; 新密可登录, 旧密不可', async () => {
      // 拿到旧 access
      const lgOld = await login(initialPwd);
      const oldAccess = lgOld.body.accessToken;

      // 换密
      const res = await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${oldAccess}`)
        .send({ currentPassword: initialPwd, newPassword: newPwd });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();

      // 新对带新 ver
      const decodedNew: any = jwt.decode(res.body.accessToken);
      const decodedOld: any = jwt.decode(oldAccess);
      expect(decodedNew.ver).toBe(decodedOld.ver + 1);

      // 用 newAccess 调 /auth/me 200
      const meNew = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`);
      expect(meNew.status).toBe(200);

      // 用 oldAccess 调 /auth/me 401 (ver 失配)
      const meOld = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${oldAccess}`);
      expect(meOld.status).toBe(401);

      // 旧密不可登录,新密可
      const lgWithOld = await login(initialPwd);
      expect(lgWithOld.status).toBe(401);
      const lgWithNew = await login(newPwd);
      expect(lgWithNew.status).toBe(200);
    });
  });
```

> 注：此 describe 用独立邮箱 `pwd-test-${Date.now()}@lab.local`，与 admin/alice 不串味；并避开 `JWT_ALLOW_LEGACY_CLAIMS` 影响（前面 describe 的 `afterEach` 已经 `delete`）。

- [ ] **Step 2: 跑测试确认失败**

```
cd D:/Project/0417-any-demo/apps/api
pnpm exec jest --config test/jest-e2e.json --runInBand --testPathPattern auth
```

预期：新 3 个 case 全 404（POST /auth/change-password 不存在）。

- [ ] **Step 3: 创建 ChangePasswordDto**

`apps/api/src/auth/dto/change-password.dto.ts`：

```ts
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString() @MinLength(1) currentPassword!: string;
  @IsString() @MinLength(8) newPassword!: string;
}
```

- [ ] **Step 4: AuthService 加 changePassword**

`apps/api/src/auth/auth.service.ts`：在 `updateMe` 后插入。

注：现有 `issueTokens` 是 `private`，且需要 `roles` 参数 + 新 `ver`。我们需要：1) compare current；2) 更新 hash + tokenVersion++；3) 取出新 ver；4) 用新 ver 调 `issueTokens`。

```ts
  async changePassword(
    userId: string,
    dto: { currentPassword: string; newPassword: string },
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException();
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
      },
      select: { tokenVersion: true },
    });
    const roles = user.roles.map((ur) => ur.role.code);
    return this.issueTokens(userId, roles, updated.tokenVersion);
  }
```

- [ ] **Step 5: AuthController 加 POST /auth/change-password**

`apps/api/src/auth/auth.controller.ts`：

```ts
import { ChangePasswordDto } from './dto/change-password.dto';
```

在 `updateMe` 后追加：

```ts
  @Post('change-password')
  @HttpCode(200)
  @Audit({ action: 'USER_CHANGE_PASSWORD', entityType: 'User' })
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(req.user.sub, dto);
  }
```

- [ ] **Step 6: 跑测试确认通过**

```
cd D:/Project/0417-any-demo/apps/api
pnpm exec jest --config test/jest-e2e.json --runInBand --testPathPattern auth
```

预期：全 18 个 case 绿（原 11 + Task1 的 4 + 本 task 的 3）。

- [ ] **Step 7: 提交**

```
cd D:/Project/0417-any-demo
git add apps/api/src/auth/dto/change-password.dto.ts apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.controller.ts apps/api/test/auth.e2e-spec.ts
git commit -m "feat(api/profile): POST /auth/change-password (踢其他 session + 当前重发) + 3 e2e"
```

---

## Task 3: Web — auth-store 加 setUser

**Files:**
- Modify: `apps/web/src/lib/auth-store.ts`
- Test (modify): 用既有 `apps/web/src/lib/__tests__/api-client.test.ts` 的 setState 习惯，本 task 不需要单测（store 改动平凡，由后续组件测覆盖）

- [ ] **Step 1: 增加 setUser action**

`apps/web/src/lib/auth-store.ts`：把现有 interface 与 create 都加上 `setUser`：

```ts
'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthTokens, UserSummary } from '@app/shared';

interface AuthState {
  tokens: AuthTokens | null;
  user: UserSummary | null;
  hydrated: boolean;
  setSession: (tokens: AuthTokens, user: UserSummary) => void;
  setTokens: (tokens: AuthTokens) => void;
  setUser: (patch: Partial<UserSummary>) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      tokens: null,
      user: null,
      hydrated: false,
      setSession: (tokens, user) => set({ tokens, user }),
      setTokens: (tokens) => set({ tokens }),
      setUser: (patch) =>
        set((s) => (s.user ? { user: { ...s.user, ...patch } } : {})),
      clear: () => set({ tokens: null, user: null }),
    }),
    {
      name: 'auth-store-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ tokens: s.tokens, user: s.user }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
```

- [ ] **Step 2: tsc 通过**

```
cd D:/Project/0417-any-demo/apps/web
pnpm exec tsc --noEmit
```

预期：clean。

- [ ] **Step 3: vitest 不回归**

```
cd D:/Project/0417-any-demo/apps/web
pnpm exec vitest run
```

预期：17 file / 59 test 仍全绿。

- [ ] **Step 4: 提交**

```
cd D:/Project/0417-any-demo
git add apps/web/src/lib/auth-store.ts
git commit -m "feat(web/profile): auth-store 加 setUser partial 更新"
```

---

## Task 4: Web — lib/api/me.ts API wrapper

**Files:**
- Create: `apps/web/src/lib/api/me.ts`

> 设计说明：只封装"改名"。"改密"组件需要细粒度的 401 字段错误处理（不走 `apiFetch` 的 401→自动 refresh→clear/redirect 流程），所以会在组件内用裸 `fetch` 调用，不走 wrapper。

- [ ] **Step 1: 创建 wrapper 文件**

```ts
import type { UserSummary } from '@app/shared';
import { apiFetch } from '../api-client';

export function updateMyProfile(input: { name: string }, token: string) {
  return apiFetch<UserSummary>('/auth/me', {
    method: 'PATCH',
    token,
    body: input,
  });
}
```

- [ ] **Step 2: tsc 通过**

```
cd D:/Project/0417-any-demo/apps/web
pnpm exec tsc --noEmit
```

预期：clean。

- [ ] **Step 3: 提交**

```
cd D:/Project/0417-any-demo
git add apps/web/src/lib/api/me.ts
git commit -m "feat(web/profile): lib/api/me.ts updateMyProfile wrapper"
```

---

## Task 5: Web — ChangePasswordDialog 组件 + vitest

**Files:**
- Create: `apps/web/src/components/profile/ChangePasswordDialog.tsx`
- Create: `apps/web/src/components/profile/__tests__/ChangePasswordDialog.test.tsx`

- [ ] **Step 1: 写失败测试**

写入 `apps/web/src/components/profile/__tests__/ChangePasswordDialog.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangePasswordDialog } from '../ChangePasswordDialog';
import { useAuth } from '@/lib/auth-store';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('ChangePasswordDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'a1', refreshToken: 'r1' } as any,
      user: { id: 'u1', email: 'a@b', name: 'A', roles: ['SYS_ADMIN'] } as any,
      hydrated: true,
    });
  });

  it('新密码 < 8 显示客户端校验, 不发请求', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ChangePasswordDialog open onOpenChange={vi.fn()} />);
    await user.type(screen.getByTestId('pwd-current'), 'ok-curr-1');
    await user.type(screen.getByTestId('pwd-new'), 'short');
    await user.type(screen.getByTestId('pwd-confirm'), 'short');
    await user.click(screen.getByTestId('pwd-submit'));
    await waitFor(() => {
      expect(screen.getByText(/至少 8/)).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('确认密码不匹配 → 字段错误, 不发请求', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ChangePasswordDialog open onOpenChange={vi.fn()} />);
    await user.type(screen.getByTestId('pwd-current'), 'ok-curr-1');
    await user.type(screen.getByTestId('pwd-new'), 'longenough1');
    await user.type(screen.getByTestId('pwd-confirm'), 'different11');
    await user.click(screen.getByTestId('pwd-submit'));
    await waitFor(() => {
      expect(screen.getByText(/确认密码不一致/)).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('成功 → 调 setTokens 与 onOpenChange(false), 显示 toast', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ accessToken: 'a2', refreshToken: 'r2' }));
    vi.stubGlobal('fetch', fetchMock);
    const onOpenChange = vi.fn();
    render(<ChangePasswordDialog open onOpenChange={onOpenChange} />);
    await user.type(screen.getByTestId('pwd-current'), 'curr-good');
    await user.type(screen.getByTestId('pwd-new'), 'newpass-12');
    await user.type(screen.getByTestId('pwd-confirm'), 'newpass-12');
    await user.click(screen.getByTestId('pwd-submit'));
    await waitFor(() => {
      expect(useAuth.getState().tokens?.accessToken).toBe('a2');
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalled();
  });

  it('401 → 当前密码错字段错误', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauth', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ChangePasswordDialog open onOpenChange={vi.fn()} />);
    await user.type(screen.getByTestId('pwd-current'), 'wrong');
    await user.type(screen.getByTestId('pwd-new'), 'newpass-12');
    await user.type(screen.getByTestId('pwd-confirm'), 'newpass-12');
    await user.click(screen.getByTestId('pwd-submit'));
    await waitFor(() => {
      expect(screen.getByText(/当前密码不正确/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```
cd D:/Project/0417-any-demo/apps/web
pnpm exec vitest run src/components/profile/__tests__/ChangePasswordDialog.test.tsx
```

预期：组件文件不存在 → 编译错。

- [ ] **Step 3: 实现 ChangePasswordDialog**

> 实现说明：**直接用裸 `fetch`** 而非 `apiFetch`/`apiFetchRaw`。原因是 `apiFetch` 在 401 时会自动调 `tryRefresh()`，但本组件需要把 401 解释成"当前密码错"展示成字段错误。走裸 fetch 拿到 res 直接判 status 最干净。

写入 `apps/web/src/components/profile/ChangePasswordDialog.tsx`：

```tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiBaseUrl } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import type { AuthTokens } from '@app/shared';

const schema = z
  .object({
    currentPassword: z.string().min(1, '请输入当前密码'),
    newPassword: z.string().min(8, '至少 8 位'),
    confirmPassword: z.string().min(1, '请确认新密码'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: '确认密码不一致',
  });

type Values = z.infer<typeof schema>;

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const token = useAuth((s) => s.tokens?.accessToken);
  const setTokens = useAuth((s) => s.setTokens);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  async function onSubmit(values: Values) {
    if (!token) return;
    const res = await fetch(`${apiBaseUrl}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    });
    if (res.status === 401) {
      form.setError('currentPassword', { message: '当前密码不正确' });
      return;
    }
    if (!res.ok) {
      toast.error(`修改失败 (${res.status})`);
      return;
    }
    const data = (await res.json()) as AuthTokens;
    setTokens(data);
    toast.success('密码已修改，其他设备需要重新登录');
    form.reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="change-password-dialog"
      >
        <DialogHeader>
          <DialogTitle>修改密码</DialogTitle>
          <DialogDescription>
            修改后将自动退出其他设备的登录状态。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>当前密码</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      data-testid="pwd-current"
                      autoComplete="current-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>新密码</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      data-testid="pwd-new"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>确认新密码</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      data-testid="pwd-confirm"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={form.formState.isSubmitting}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                data-testid="pwd-submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                提交
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

```
cd D:/Project/0417-any-demo/apps/web
pnpm exec vitest run src/components/profile/__tests__/ChangePasswordDialog.test.tsx
```

预期：4/4 ✓。

- [ ] **Step 5: 全量 vitest 不回归**

```
cd D:/Project/0417-any-demo/apps/web
pnpm exec vitest run
```

预期：18 file / 63 test ✓（原 17/59 + 1/4）。

- [ ] **Step 6: tsc 通过**

```
cd D:/Project/0417-any-demo/apps/web
pnpm exec tsc --noEmit
```

- [ ] **Step 7: 提交**

```
cd D:/Project/0417-any-demo
git add apps/web/src/components/profile/ChangePasswordDialog.tsx apps/web/src/components/profile/__tests__/ChangePasswordDialog.test.tsx
git commit -m "feat(web/profile): ChangePasswordDialog + 4 vitest case"
```

---

## Task 6: Web — ProfileSheet 组件 + vitest

**Files:**
- Create: `apps/web/src/components/profile/ProfileSheet.tsx`
- Create: `apps/web/src/components/profile/__tests__/ProfileSheet.test.tsx`

- [ ] **Step 1: 写失败测试**

`apps/web/src/components/profile/__tests__/ProfileSheet.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileSheet } from '../ProfileSheet';
import { useAuth } from '@/lib/auth-store';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('ProfileSheet', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'a1', refreshToken: 'r1' } as any,
      user: {
        id: 'u1',
        email: 'admin@lab.local',
        name: '老名字',
        labId: 'lab-1',
        roles: ['SYS_ADMIN', 'LAB_HEAD'],
      } as any,
      hydrated: true,
    });
  });

  it('渲染基础资料 (email/labId/roles) + name input', () => {
    render(<ProfileSheet open onOpenChange={vi.fn()} />);
    expect(screen.getByText('admin@lab.local')).toBeInTheDocument();
    expect(screen.getByText('lab-1')).toBeInTheDocument();
    expect(screen.getByText('SYS_ADMIN')).toBeInTheDocument();
    expect(screen.getByText('LAB_HEAD')).toBeInTheDocument();
    expect(screen.getByTestId('profile-name-input')).toHaveValue('老名字');
  });

  it('改名提交 → 200 → store.user.name 更新, 显示 toast', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          id: 'u1',
          email: 'admin@lab.local',
          name: '新名字',
          labId: 'lab-1',
          roles: ['SYS_ADMIN', 'LAB_HEAD'],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileSheet open onOpenChange={vi.fn()} />);
    const input = screen.getByTestId('profile-name-input');
    await user.clear(input);
    await user.type(input, '新名字');
    await user.click(screen.getByTestId('profile-save-name'));
    await waitFor(() => {
      expect(useAuth.getState().user?.name).toBe('新名字');
    });
    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalled();
    // body 校验
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ name: '新名字' });
  });

  it('保存按钮在 name 未改时 disabled', () => {
    render(<ProfileSheet open onOpenChange={vi.fn()} />);
    expect(screen.getByTestId('profile-save-name')).toBeDisabled();
  });

  it('点修改密码按钮打开 ChangePasswordDialog', async () => {
    const user = userEvent.setup();
    render(<ProfileSheet open onOpenChange={vi.fn()} />);
    await user.click(screen.getByTestId('profile-change-password-btn'));
    expect(
      await screen.findByTestId('change-password-dialog'),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```
cd D:/Project/0417-any-demo/apps/web
pnpm exec vitest run src/components/profile/__tests__/ProfileSheet.test.tsx
```

预期：组件文件不存在 → 编译错。

- [ ] **Step 3: 实现 ProfileSheet**

`apps/web/src/components/profile/ProfileSheet.tsx`：

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth-store';
import { updateMyProfile } from '@/lib/api/me';
import { ChangePasswordDialog } from './ChangePasswordDialog';

const schema = z.object({
  name: z.string().min(1, '姓名不能为空').max(50, '不超过 50 字'),
});
type Values = z.infer<typeof schema>;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 items-start gap-3 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="col-span-2">{children}</div>
    </div>
  );
}

export function ProfileSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const token = useAuth((s) => s.tokens?.accessToken);
  const [pwdOpen, setPwdOpen] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: user?.name ?? '' },
  });

  useEffect(() => {
    if (open && user) form.reset({ name: user.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.name]);

  if (!user) return null;
  const initials = (user.name || user.email).slice(0, 2).toUpperCase();
  const watchedName = form.watch('name');
  const pristine = watchedName === user.name;

  async function onSubmit(values: Values) {
    if (!token) return;
    try {
      const next = await updateMyProfile({ name: values.name }, token);
      setUser({ name: next.name });
      toast.success('个人信息已更新');
    } catch (e: any) {
      toast.error(e.message ?? '更新失败');
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md"
        data-testid="profile-sheet"
      >
        <SheetHeader>
          <SheetTitle>个人信息</SheetTitle>
          <SheetDescription>查看与维护账号资料</SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <div className="text-base font-medium">{user.name}</div>
            <div className="text-xs text-muted-foreground">{user.email}</div>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="space-y-3">
          <Field label="邮箱">{user.email}</Field>
          <Field label="实验室">
            {user.labId ?? <span className="text-muted-foreground">—</span>}
          </Field>
          <Field label="角色">
            <div className="flex flex-wrap gap-1">
              {user.roles.map((r) => (
                <Badge key={r} variant="secondary">
                  {r}
                </Badge>
              ))}
            </div>
          </Field>
        </div>

        <Separator className="my-4" />

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-3"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>姓名</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="profile-name-input"
                      autoComplete="name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              disabled={pristine || form.formState.isSubmitting}
              data-testid="profile-save-name"
            >
              {form.formState.isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              保存
            </Button>
          </form>
        </Form>

        <Separator className="my-4" />

        <div className="space-y-2">
          <div className="text-sm font-medium">安全</div>
          <Button
            variant="outline"
            onClick={() => setPwdOpen(true)}
            data-testid="profile-change-password-btn"
          >
            修改密码
          </Button>
        </div>

        <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
      </SheetContent>
    </Sheet>
  );
}
```

> 备注：依赖 `@/components/ui/separator`（已存在）。表单字段沿用既有 `admin/users` 页面的 `Form/FormField/FormItem/...` 组合。

- [ ] **Step 4: 跑测试确认通过**

```
cd D:/Project/0417-any-demo/apps/web
pnpm exec vitest run src/components/profile/__tests__/ProfileSheet.test.tsx
```

预期：4/4 ✓。

- [ ] **Step 5: 全量 vitest 不回归**

```
cd D:/Project/0417-any-demo/apps/web
pnpm exec vitest run
```

预期：19 file / 67 test ✓（上一步 18/63 + 1/4）。

- [ ] **Step 6: 提交**

```
cd D:/Project/0417-any-demo
git add apps/web/src/components/profile/ProfileSheet.tsx apps/web/src/components/profile/__tests__/ProfileSheet.test.tsx
git commit -m "feat(web/profile): ProfileSheet 抽屉 (只读资料 + 改名 + 改密入口) + 4 vitest case"
```

---

## Task 7: Web — UserMenu 接入

**Files:**
- Modify: `apps/web/src/components/shell/UserMenu.tsx`

- [ ] **Step 1: 改 UserMenu**

将 `apps/web/src/components/shell/UserMenu.tsx` 整体替换为：

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, User as UserIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth-store';
import { ProfileSheet } from '@/components/profile/ProfileSheet';

export function UserMenu() {
  const user = useAuth((s) => s.user);
  const clear = useAuth((s) => s.clear);
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);

  if (!user) return null;
  const initials = (user.name || user.email).slice(0, 2).toUpperCase();

  function logout() {
    clear();
    router.replace('/login');
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 px-2" data-testid="user-menu" aria-label="用户菜单">
            <Avatar className="h-7 w-7">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="ml-2 hidden text-sm md:inline">{user.email}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs text-muted-foreground">{user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setProfileOpen(true)}
            data-testid="profile-menu-trigger"
          >
            <UserIcon className="mr-2 h-4 w-4" /> 个人信息
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" /> 登出
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}
```

- [ ] **Step 2: tsc 通过**

```
cd D:/Project/0417-any-demo/apps/web
pnpm exec tsc --noEmit
```

- [ ] **Step 3: 全量 vitest 不回归**

```
cd D:/Project/0417-any-demo/apps/web
pnpm exec vitest run
```

预期：19/67 仍全绿。

- [ ] **Step 4: 提交**

```
cd D:/Project/0417-any-demo
git add apps/web/src/components/shell/UserMenu.tsx
git commit -m "feat(web/profile): UserMenu 接入 ProfileSheet, 移除 disabled"
```

---

## Task 8: 最终验收 + 状态备忘

**Files:**
- 无新文件；可选写 `memory/project_profile_status.md`（执行流程外的副产品，可在最后由实施者自行决定）

- [ ] **Step 1: api 全量 e2e**（确认 profile 相关 e2e 全绿 + 不回归其他 e2e）

```
cd D:/Project/0417-any-demo/apps/api
pnpm exec jest --config test/jest-e2e.json --runInBand --testPathPattern auth
```

预期：18 ✓（原 11 + 改名 4 + 改密 3）。

如时间允许跑全量：

```
pnpm exec jest --config test/jest-e2e.json --runInBand
```

预期：原 93（排除既存 requests 14 fail）→ 100（93 + 7 新 case）。

- [ ] **Step 2: web 全量 vitest**

```
cd D:/Project/0417-any-demo/apps/web
pnpm exec vitest run
```

预期：19 file / 67 test ✓。

- [ ] **Step 3: tsc 全栈**

```
cd D:/Project/0417-any-demo/apps/web && pnpm exec tsc --noEmit
cd D:/Project/0417-any-demo/apps/api && pnpm exec tsc --noEmit
```

- [ ] **Step 4: shared + web build**

```
cd D:/Project/0417-any-demo && pnpm --filter @app/shared build
cd D:/Project/0417-any-demo/apps/web && pnpm exec next build
```

预期：shared 与 next build clean；web shared 87.3 kB 持平（路由 size 可能微变，<2 kB 增量都属于本特性新增 bundle）。

- [ ] **Step 5: 手工走查（可在 dev 上做或留给后续）**

启动 web dev + api dev，登录 admin → 头像 → "个人信息" 可点 → 抽屉打开 → 改名生效 → "修改密码" → 各错路径都正确弹错 → 成功后 toast + 抽屉/弹窗关闭 → 在另一无痕窗口 admin 旧 session 下访问 /admin/users 应跳 /login。

- [ ] **Step 6: 更新 memory 索引**（可选，按既有 P0-3 模式）

写 `C:\Users\songyihui\.claude\projects\D--Project-0417-any-demo\memory\project_profile_status.md` 简短状态记录，并在 `MEMORY.md` 加一行索引。

---

## 自检矩阵（执行前过一遍）

| 设计点 | 对应任务 |
|---|---|
| PATCH /auth/me + DTO + 服务 + 路由 | Task 1 |
| 改名 4 e2e（401/200/400/whitelist） | Task 1 Step 1 |
| POST /auth/change-password + DTO + 服务 + 路由 | Task 2 |
| 改密 3 e2e（401/400/成功+踢旧 access+新密登录） | Task 2 Step 1 |
| `tokenVersion++` 后用新 ver 签发新对 | Task 2 Step 4 |
| auth-store.setUser | Task 3 |
| lib/api wrapper | Task 4 |
| ChangePasswordDialog + 4 vitest | Task 5 |
| ProfileSheet + 4 vitest | Task 6 |
| UserMenu 去 disabled + 打开抽屉 | Task 7 |
| Audit `USER_UPDATE_SELF` / `USER_CHANGE_PASSWORD` | Task 1 Step 5 / Task 2 Step 5 |
| 视觉/build/最终验收 | Task 8 |
