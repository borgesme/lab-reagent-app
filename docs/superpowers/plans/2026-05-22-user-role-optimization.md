# 用户与角色优化 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 b.md 5 项用户与角色相关优化(字段裁剪 / 角色源动态化 / 密码 UX / Dashboard 聚合 / 同步测试)

**Architecture:** 后端用 UserView mapper 统一裁剪敏感字段;新增 DashboardModule 聚合四指标;修正 `/requests` / `/reagents` 的 query DTO 和 service 语义;新增 `/alerts/active` 路由。前端 admin/users 把 roles 切扁平 string[]、动态拉 `/roles`、密码字段加 Eye 切换 + zod 二次校验;首页改成单个 useApiQuery。

**Tech Stack:** NestJS / Prisma / class-validator / Jest e2e (后端) + Next.js / React-Hook-Form / Zod / @tanstack/react-query / Vitest / Testing Library (前端) + lucide-react (icon)

**关联文档:** `docs/superpowers/specs/2026-05-22-user-role-optimization-design.md`

---

## File Structure

### 新建
- `apps/api/src/modules/users/users.view.ts` — UserView 类型 + `toUserView` / `toUserViews` mapper
- `apps/api/src/modules/dashboard/dashboard.module.ts`
- `apps/api/src/modules/dashboard/dashboard.controller.ts`
- `apps/api/src/modules/dashboard/dashboard.service.ts`
- `apps/api/test/dashboard.e2e-spec.ts`
- `apps/web/src/components/ui/password-input.tsx` — 带 Eye/EyeOff 切换的 Input 包装
- `apps/web/src/app/(app)/__tests__/page.test.tsx` — Dashboard 页 vitest

### 修改
- `apps/api/src/modules/users/users.service.ts` — 所有出口走 mapper
- `apps/api/test/users.e2e-spec.ts` — 加 sanitize 断言、roles 扁平断言
- `apps/api/src/modules/requests/dto/query-request.dto.ts` — 加 mine + scope
- `apps/api/src/modules/requests/requests.service.ts` — 实现 mine/scope 语义
- `apps/api/test/requests.e2e-spec.ts` — 加 4 个用例
- `apps/api/src/modules/reagents/dto/query-reagent.dto.ts` — 加 controlled
- `apps/api/src/modules/reagents/reagents.service.ts` — controlled 过滤
- `apps/api/test/reagents.e2e-spec.ts` — 加 controlled 用例
- `apps/api/src/modules/alerts/alerts.controller.ts` — 增 `@Controller('alerts') @Get('active')` 路由
- `apps/api/src/modules/alerts/alerts.service.ts` — 增 `listActiveForUser`
- `apps/api/src/modules/alerts/alerts.module.ts` — 注册新 controller
- `apps/api/test/alerts.e2e-spec.ts` — 加 /alerts/active 用例
- `apps/api/src/app.module.ts` — 注册 DashboardModule
- `apps/web/src/app/(app)/admin/users/page.tsx` — UserRow.roles string[]、用 /roles、PasswordInput、二次校验
- `apps/web/src/app/(app)/admin/users/__tests__/page.test.tsx` — fixture 改造 + 新增 2 用例
- `apps/web/src/app/(app)/page.tsx` — 改用 /dashboard/kpi

---

## Task 1: API — UserView mapper + users service 全局裁剪

**Files:**
- Create: `apps/api/src/modules/users/users.view.ts`
- Modify: `apps/api/src/modules/users/users.service.ts`
- Test: `apps/api/test/users.e2e-spec.ts`

- [ ] **Step 1.1: 在 users.e2e-spec.ts 加 sanitize 断言**

打开 `apps/api/test/users.e2e-spec.ts`,在文件末尾 `describe` 块**关闭 `});` 之前**(第 277 行附近)插入下面 3 个用例:

```typescript
  it('GET /users 不返回敏感字段', async () => {
    const r = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(Array.isArray(data)).toBe(true);
    for (const u of data) {
      expect(u).not.toHaveProperty('passwordHash');
      expect(u).not.toHaveProperty('currentRefreshJti');
      expect(u).not.toHaveProperty('tokenVersion');
    }
  });

  it('GET /users 返回 roles 是字符串数组', async () => {
    const r = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(data.length).toBeGreaterThan(0);
    for (const u of data) {
      expect(Array.isArray(u.roles)).toBe(true);
      for (const role of u.roles) {
        expect(typeof role).toBe('string');
      }
    }
  });

  it('POST /users 返回的 view 不含敏感字段', async () => {
    const r = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'sanitize@lab.local',
        name: 'Sanitize',
        password: 'pass1234',
        roles: ['PLAIN_USER'],
      });
    expect(r.status).toBe(201);
    expect(r.body.code).toBe(200);
    expect(r.body.data).not.toHaveProperty('passwordHash');
    expect(r.body.data).not.toHaveProperty('currentRefreshJti');
    expect(r.body.data).not.toHaveProperty('tokenVersion');
    expect(Array.isArray(r.body.data.roles)).toBe(true);
    expect(r.body.data.roles).toEqual(['PLAIN_USER']);

    await prisma.userRole.deleteMany({
      where: { user: { email: 'sanitize@lab.local' } },
    });
    await prisma.user.delete({ where: { email: 'sanitize@lab.local' } });
  });
```

- [ ] **Step 1.2: 运行 users e2e,确认新 3 个用例红**

```powershell
pnpm --filter @app/api test:e2e -- --testPathPattern=users.e2e-spec
```

预期:`不返回敏感字段` / `roles 是字符串数组` / `POST /users 返回的 view 不含敏感字段` 3 用例 fail,旧 14 用例继续通过。

- [ ] **Step 1.3: 创建 UserView mapper**

新建 `apps/api/src/modules/users/users.view.ts`:

```typescript
import type { User, UserRole, Role, Lab } from '@prisma/client';

type UserRowWithRelations = User & {
  roles: (UserRole & { role: Role })[];
  lab: Lab | null;
};

export interface UserView {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  wechatOpenId: string | null;
  labId: string | null;
  lab: { id: string; name: string; building: string | null } | null;
  roles: string[];
  createdAt: Date;
  updatedAt: Date;
}

export function toUserView(row: UserRowWithRelations): UserView {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    wechatOpenId: row.wechatOpenId,
    labId: row.labId,
    lab: row.lab
      ? { id: row.lab.id, name: row.lab.name, building: row.lab.building }
      : null,
    roles: row.roles.map((ur) => ur.role.code),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toUserViews(rows: UserRowWithRelations[]): UserView[] {
  return rows.map(toUserView);
}
```

- [ ] **Step 1.4: 让 users.service.ts 所有出口走 mapper**

完整替换 `apps/api/src/modules/users/users.service.ts`:

```typescript
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PageQueryDto } from './dto/page-query.dto';
import { RoleCode } from '@prisma/client';
import { toUserView, toUserViews } from './users.view';

const INCLUDE_FOR_VIEW = {
  roles: { include: { role: true } },
  lab: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.user.findMany({
      where: { deletedAt: null },
      include: INCLUDE_FOR_VIEW,
      orderBy: { createdAt: 'desc' },
    });
    return toUserViews(rows);
  }

  async listPaged(q: PageQueryDto) {
    const pageNum = q.pageNum ?? 1;
    const pageSize = q.pageSize ?? 10;
    const where = { deletedAt: null };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: INCLUDE_FOR_VIEW,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: toUserViews(rows), total, pageNum, pageSize };
  }

  async batchDelete(ids: string[]) {
    const existing = await this.prisma.user.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    if (existing.length !== ids.length) {
      const found = new Set(existing.map((u) => u.id));
      const missing = ids.filter((id) => !found.has(id));
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        missing,
      });
    }
    const now = new Date();
    await this.prisma.$transaction(
      ids.map((id) =>
        this.prisma.user.update({
          where: { id },
          data: { deletedAt: now, tokenVersion: { increment: 1 } },
        }),
      ),
    );
    return { deleted: ids.length };
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw new ConflictException('email exists');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const roleRecords = await this.resolveRoles(dto.roles ?? ['PLAIN_USER']);
    const row = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        labId: dto.labId,
        roles: { create: roleRecords.map((r) => ({ roleId: r.id })) },
      },
      include: INCLUDE_FOR_VIEW,
    });
    return toUserView(row);
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw new NotFoundException();
    const data: any = {};
    if (dto.name) data.name = dto.name;
    if (dto.labId) data.labId = dto.labId;
    if (dto.roles) {
      const roleRecords = await this.resolveRoles(dto.roles);
      await this.prisma.userRole.deleteMany({ where: { userId: id } });
      data.roles = { create: roleRecords.map((r) => ({ roleId: r.id })) };
    }
    const row = await this.prisma.user.update({
      where: { id },
      data,
      include: INCLUDE_FOR_VIEW,
    });
    return toUserView(row);
  }

  async softDelete(id: string) {
    const row = await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), tokenVersion: { increment: 1 } },
      include: INCLUDE_FOR_VIEW,
    });
    return toUserView(row);
  }

  async resetPassword(id: string): Promise<{ tempPassword: string }> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw new NotFoundException();
    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    return { tempPassword };
  }

  private generateTempPassword(): string {
    const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    const pickN = (src: string, n: number) =>
      Array.from({ length: n }, () =>
        src[Math.floor(Math.random() * src.length)],
      ).join('');
    return pickN(letters, 4) + pickN(digits, 4);
  }

  private async resolveRoles(codes: RoleCode[]) {
    return this.prisma.role.findMany({ where: { code: { in: codes } } });
  }
}
```

- [ ] **Step 1.5: 跑 users e2e 看全绿**

```powershell
pnpm --filter @app/api test:e2e -- --testPathPattern=users.e2e-spec
```

预期:17 用例全部 PASS(原 14 + 新 3)。

- [ ] **Step 1.6: 跑全量 api e2e,确保没破坏其他 spec**

```powershell
pnpm --filter @app/api test:e2e
```

预期:所有 spec 通过(`requests.e2e-spec.ts` 14 个既存的 fail 不算回归,按 tech-debt 备忘排除)。

- [ ] **Step 1.7: Commit**

```powershell
git add apps/api/src/modules/users/users.view.ts apps/api/src/modules/users/users.service.ts apps/api/test/users.e2e-spec.ts
git commit -m "feat(api): UserView mapper + users service 出口统一裁剪 passwordHash/refreshJti/tokenVersion"
```

---

## Task 2: Web — admin/users roles 切扁平 + /roles 动态拉

**Files:**
- Modify: `apps/web/src/app/(app)/admin/users/page.tsx`
- Test: `apps/web/src/app/(app)/admin/users/__tests__/page.test.tsx`

- [ ] **Step 2.1: 改 page.test.tsx 的 fixture 与 mock**

打开 `apps/web/src/app/(app)/admin/users/__tests__/page.test.tsx`,做 3 处修改:

**①** 把 `usersFixture` 的 roles 改成扁平字符串数组:

```typescript
// 原
roles: [{ role: { code: 'PLAIN_USER' } }],
// 改
roles: ['PLAIN_USER'],
```

**②** 在 `labsFixture` 下方加 rolesFixture:

```typescript
const rolesFixture = [
  { id: 'r1', code: 'PLAIN_USER', name: '普通用户' },
  { id: 'r2', code: 'LAB_HEAD', name: '实验室负责人' },
  { id: 'r3', code: 'REAGENT_ADMIN', name: '试剂管理员' },
  { id: 'r4', code: 'SAFETY_OFFICER', name: '安全员' },
  { id: 'r5', code: 'SYS_ADMIN', name: '系统管理员' },
];
```

**③** 在 `mockApiFetch.mockImplementation` 内,`if (path === '/labs') return labsFixture;` 这一行下面加:

```typescript
      if (path === '/roles') return rolesFixture;
```

- [ ] **Step 2.2: 跑 admin/users vitest 看红**

```powershell
pnpm --filter @app/web test -- src/app/"(app)"/admin/users/__tests__/page.test.tsx
```

预期:8 个用例多数 fail,因为页面仍然按 `r.role.code` 取嵌套字段、且 ALL_ROLES 写死,渲染时取不到值 / 找不到测试 id。

- [ ] **Step 2.3: 改 admin/users page.tsx**

完整替换 `apps/web/src/app/(app)/admin/users/page.tsx` 中下面三处(其余保留):

**①** 替换 `UserRow` 接口(40 - 46 行):

```typescript
interface UserRow {
  id: string;
  email: string;
  name: string;
  lab?: { id?: string; name: string; building?: string | null } | null;
  labId?: string | null;
  roles?: string[];
}
```

**②** 删除 60 - 65 行 `const ALL_ROLES = [...] as const;`;在它原位置(import 区下方)替换为:

```typescript
interface RoleOption {
  id: string;
  code: string;
  name: string;
}
```

并把它下方两处 `z.array(z.enum(ALL_ROLES))` 改成 `z.array(z.string())`(updateSchema 与 createSchema 各 1 处):

```typescript
const updateSchema = z.object({
  name: z.string().min(1, '姓名必填'),
  labId: z.string().optional(),
  roles: z.array(z.string()).min(1, '至少 1 个角色'),
});

const createSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  name: z.string().min(2, '姓名至少 2 个字'),
  password: z.string().min(8, '密码至少 8 位'),
  labId: z.string().optional(),
  roles: z.array(z.string()).min(1, '至少 1 个角色'),
});
```

**③** 在 `const labsQuery = useApiQuery<LabRow[]>('/labs', { queryKey: ['labs'] });` 行下方,新增:

```typescript
  const rolesQuery = useApiQuery<RoleOption[]>('/roles', {
    queryKey: ['roles'],
  });
  const allRoles = useMemo(
    () => (rolesQuery.data ?? []).map((r) => r.code),
    [rolesQuery.data],
  );
```

**④** 把 `editingDefaults.roles` 这块改成:

```typescript
  const editingDefaults: UpdateValues = useMemo(
    () => ({
      name: editing?.name ?? '',
      labId: editing?.labId ?? editing?.lab?.id ?? '',
      roles: (editing?.roles && editing.roles.length > 0
        ? editing.roles
        : ['PLAIN_USER']) as string[],
    }),
    [editing],
  );
```

**⑤** roles 列渲染改为:

```typescript
    {
      id: 'roles',
      header: '角色',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {(row.original.roles ?? []).map((code) => (
            <Badge key={code} variant="secondary">
              {code}
            </Badge>
          ))}
        </div>
      ),
    },
```

**⑥** 编辑 dialog 的 roles checkbox 块 `{ALL_ROLES.map((r) => { ... })}` 改成:

```typescript
                    {allRoles.map((r) => {
                      const checked = (field.value as string[]).includes(r);
                      return (
                        <label
                          key={r}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const next = v === true
                                ? [...(field.value as string[]), r]
                                : (field.value as string[]).filter(
                                    (x) => x !== r,
                                  );
                              field.onChange(next);
                            }}
                            data-testid={`admin-users-edit-role-${r}`}
                          />
                          {r}
                        </label>
                      );
                    })}
```

**⑦** 创建 dialog 的 roles checkbox 块(testid 形如 `admin-users-create-role-*`)同上,把 `ALL_ROLES` 替换成 `allRoles`。

- [ ] **Step 2.4: 跑 admin/users vitest 看绿**

```powershell
pnpm --filter @app/web test -- src/app/"(app)"/admin/users/__tests__/page.test.tsx
```

预期:8 用例全过(本任务未新增用例,仅 fixture/页面同步)。

- [ ] **Step 2.5: Commit**

```powershell
git add apps/web/src/app/"(app)"/admin/users/page.tsx apps/web/src/app/"(app)"/admin/users/__tests__/page.test.tsx
git commit -m "feat(web): admin/users roles 切扁平 string[] + 角色源切 /api/v1/roles"
```

---

## Task 3: Web — PasswordInput 组件 + 创建表单可见切换与二次校验

**Files:**
- Create: `apps/web/src/components/ui/password-input.tsx`
- Modify: `apps/web/src/app/(app)/admin/users/page.tsx`
- Test: `apps/web/src/app/(app)/admin/users/__tests__/page.test.tsx`

- [ ] **Step 3.1: 在 page.test.tsx 加 2 个用例**

打开 `apps/web/src/app/(app)/admin/users/__tests__/page.test.tsx`,在 describe 块结尾 `});` 之前插入:

```typescript
  it('密码字段默认 type=password,点击 eye 切到 text', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<UsersPage />);
    await waitFor(() => screen.getByText('Alice'));
    await user.click(screen.getByTestId('admin-users-create-btn'));

    const pwd = await screen.findByTestId('admin-users-create-password');
    expect(pwd).toHaveAttribute('type', 'password');

    await user.click(
      screen.getByTestId('admin-users-create-password-toggle'),
    );
    expect(pwd).toHaveAttribute('type', 'text');

    await user.click(
      screen.getByTestId('admin-users-create-password-toggle'),
    );
    expect(pwd).toHaveAttribute('type', 'password');
  });

  it('两次密码不一致 → 不调用 POST /users,显示校验信息', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithQuery(<UsersPage />);
    await waitFor(() => screen.getByText('Alice'));
    await user.click(screen.getByTestId('admin-users-create-btn'));

    await user.type(
      await screen.findByTestId('admin-users-create-email'),
      'bob@lab.local',
    );
    await user.type(screen.getByTestId('admin-users-create-name'), 'Bob');
    await user.type(
      screen.getByTestId('admin-users-create-password'),
      'Bob12345',
    );
    await user.type(
      screen.getByTestId('admin-users-create-password-confirm'),
      'Bob99999',
    );

    await user.click(screen.getByTestId('admin-users-create-submit'));

    await waitFor(() => {
      expect(screen.getByText('两次密码不一致')).toBeInTheDocument();
    });
    const postCalls = mockApiFetch.mock.calls.filter(
      (c) => c[1]?.method === 'POST' && c[0] === '/users',
    );
    expect(postCalls.length).toBe(0);
  });
```

- [ ] **Step 3.2: 跑 vitest 看新 2 用例红**

```powershell
pnpm --filter @app/web test -- src/app/"(app)"/admin/users/__tests__/page.test.tsx
```

预期:新增 2 用例 fail(找不到 `admin-users-create-password-toggle` 等)。

- [ ] **Step 3.3: 创建 PasswordInput 组件**

新建 `apps/web/src/components/ui/password-input.tsx`:

```typescript
'use client';
import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from './input';

export interface PasswordInputProps
  extends Omit<React.ComponentProps<'input'>, 'type'> {
  toggleTestId?: string;
}

export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  PasswordInputProps
>(({ className, toggleTestId, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={cn('pr-10', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? '隐藏密码' : '显示密码'}
        data-testid={toggleTestId}
        className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </button>
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';
```

- [ ] **Step 3.4: 改 admin/users page.tsx — 引入 PasswordInput + passwordConfirm**

**①** 顶部 import 区加:

```typescript
import { PasswordInput } from '@/components/ui/password-input';
```

**②** `createSchema` 改为:

```typescript
const createSchema = z
  .object({
    email: z.string().email('邮箱格式不正确'),
    name: z.string().min(2, '姓名至少 2 个字'),
    password: z.string().min(8, '密码至少 8 位'),
    passwordConfirm: z.string().min(8, '请再次输入密码'),
    labId: z.string().optional(),
    roles: z.array(z.string()).min(1, '至少 1 个角色'),
  })
  .superRefine((val, ctx) => {
    if (val.password !== val.passwordConfirm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['passwordConfirm'],
        message: '两次密码不一致',
      });
    }
  });
```

**③** `createDefaults` 改为:

```typescript
const createDefaults: CreateValues = {
  email: '',
  name: '',
  password: '',
  passwordConfirm: '',
  labId: '',
  roles: ['PLAIN_USER'],
};
```

**④** `onSubmit` body 显式剔除 passwordConfirm:

```typescript
        onSubmit={async (values) => {
          try {
            await apiFetch('/users', {
              method: 'POST',
              token,
              body: {
                email: values.email,
                name: values.name,
                password: values.password,
                labId: values.labId || undefined,
                roles: values.roles,
              },
            });
            ...
```

(原本就只挑这些字段,确认没顺手把 passwordConfirm 加进去就行。)

**⑤** 把创建 dialog 里 `password` 字段的 `<Input type="password" ...>` 替换为:

```typescript
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>初始密码</FormLabel>
                  <FormControl>
                    <PasswordInput
                      data-testid="admin-users-create-password"
                      toggleTestId="admin-users-create-password-toggle"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="passwordConfirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>确认密码</FormLabel>
                  <FormControl>
                    <PasswordInput
                      data-testid="admin-users-create-password-confirm"
                      toggleTestId="admin-users-create-password-confirm-toggle"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
```

- [ ] **Step 3.5: 跑 vitest 看绿**

```powershell
pnpm --filter @app/web test -- src/app/"(app)"/admin/users/__tests__/page.test.tsx
```

预期:10 用例全过(原 8 + 新 2)。

- [ ] **Step 3.6: Commit**

```powershell
git add apps/web/src/components/ui/password-input.tsx apps/web/src/app/"(app)"/admin/users/page.tsx apps/web/src/app/"(app)"/admin/users/__tests__/page.test.tsx
git commit -m "feat(web): admin/users 创建表单加密码可见切换 + 二次密码校验"
```

---

## Task 4: API — /dashboard/kpi 聚合接口

**Files:**
- Create: `apps/api/src/modules/dashboard/dashboard.module.ts`
- Create: `apps/api/src/modules/dashboard/dashboard.controller.ts`
- Create: `apps/api/src/modules/dashboard/dashboard.service.ts`
- Create: `apps/api/test/dashboard.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 4.1: 写 dashboard.e2e-spec.ts(失败用例)**

新建 `apps/api/test/dashboard.e2e-spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { expectOk, expectBizError } from './helpers/expect-ok';

describe('Dashboard KPI', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let plainToken: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const ar = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = ar.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'kpi-plain@lab.local', name: 'KpiPlain', password: 'pass1234' });
    const pr = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'kpi-plain@lab.local', password: 'pass1234' });
    plainToken = pr.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({
      where: { user: { email: 'kpi-plain@lab.local' } },
    });
    await prisma.user.deleteMany({
      where: { email: 'kpi-plain@lab.local' },
    });
    await app.close();
  });

  it('未登录 → 401', async () => {
    const r = await request(app.getHttpServer()).get('/dashboard/kpi');
    expectBizError(r, 401);
  });

  it('SYS_ADMIN 登录 → 四 key 均为 number', async () => {
    const r = await request(app.getHttpServer())
      .get('/dashboard/kpi')
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(typeof data.pendingApprovals).toBe('number');
    expect(typeof data.myRequests).toBe('number');
    expect(typeof data.stockAlerts).toBe('number');
    expect(typeof data.controlledReagents).toBe('number');
  });

  it('普通用户 → pendingApprovals 为 0', async () => {
    const r = await request(app.getHttpServer())
      .get('/dashboard/kpi')
      .set('Authorization', `Bearer ${plainToken}`);
    const data = expectOk(r);
    expect(data.pendingApprovals).toBe(0);
    expect(typeof data.myRequests).toBe('number');
    expect(typeof data.stockAlerts).toBe('number');
    expect(typeof data.controlledReagents).toBe('number');
  });

  it('controlledReagents 反映 hazardLevel=CONTROLLED 或 controlType 非空且未软删的总数', async () => {
    const expected = await prisma.reagent.count({
      where: {
        deletedAt: null,
        OR: [{ hazardLevel: 'CONTROLLED' }, { controlType: { not: null } }],
      },
    });
    const r = await request(app.getHttpServer())
      .get('/dashboard/kpi')
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(data.controlledReagents).toBe(expected);
  });
});
```

- [ ] **Step 4.2: 跑 dashboard e2e 看红**

```powershell
pnpm --filter @app/api test:e2e -- --testPathPattern=dashboard.e2e-spec
```

预期:`Cannot find module` 或 404(`/dashboard/kpi` 不存在),全部 fail。

- [ ] **Step 4.3: 创建 dashboard service**

新建 `apps/api/src/modules/dashboard/dashboard.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface Kpi {
  pendingApprovals: number;
  myRequests: number;
  stockAlerts: number;
  controlledReagents: number;
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getKpi(actor: { sub: string; roles: string[] }): Promise<Kpi> {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      select: { labId: true },
    });

    const pendingWhere = this.buildPendingApprovalsWhere(actor, user?.labId ?? null);

    const [myRequests, stockAlerts, controlledReagents] =
      await this.prisma.$transaction([
        this.prisma.request.count({
          where: {
            applicantId: actor.sub,
            status: { in: ['DRAFT', 'PENDING', 'APPROVED', 'ISSUED'] },
          },
        }),
        this.prisma.notification.count({
          where: {
            recipientId: actor.sub,
            readAt: null,
            type: {
              in: ['ALERT_LOW_STOCK', 'ALERT_EXPIRING', 'ALERT_RECONCILE'],
            },
          },
        }),
        this.prisma.reagent.count({
          where: {
            deletedAt: null,
            OR: [
              { hazardLevel: 'CONTROLLED' },
              { controlType: { not: null } },
            ],
          },
        }),
      ]);

    const pendingApprovals = pendingWhere
      ? await this.prisma.request.count({ where: pendingWhere })
      : 0;

    return { pendingApprovals, myRequests, stockAlerts, controlledReagents };
  }

  private buildPendingApprovalsWhere(
    actor: { roles: string[] },
    labId: string | null,
  ): Prisma.RequestWhereInput | null {
    if (actor.roles.includes('SYS_ADMIN')) {
      return { status: 'PENDING' };
    }
    if (
      actor.roles.includes('LAB_HEAD') ||
      actor.roles.includes('REAGENT_ADMIN')
    ) {
      if (!labId) return null;
      return { status: 'PENDING', labId };
    }
    return null;
  }
}
```

- [ ] **Step 4.4: 创建 dashboard controller**

新建 `apps/api/src/modules/dashboard/dashboard.controller.ts`:

```typescript
import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('kpi')
  @ApiOperation({ summary: '工作台四指标聚合' })
  kpi(@Req() req: any) {
    return this.dashboard.getKpi({
      sub: req.user.sub,
      roles: req.user.roles ?? [],
    });
  }
}
```

- [ ] **Step 4.5: 创建 dashboard module**

新建 `apps/api/src/modules/dashboard/dashboard.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
```

- [ ] **Step 4.6: 在 app.module.ts 注册**

打开 `apps/api/src/app.module.ts`,在 `import { ReportsModule } from './modules/reports/reports.module';` 行下方加:

```typescript
import { DashboardModule } from './modules/dashboard/dashboard.module';
```

并在 `imports: [...]` 数组里 `ReportsModule,` 后面加 `DashboardModule,`。

- [ ] **Step 4.7: 跑 dashboard e2e 看绿**

```powershell
pnpm --filter @app/api test:e2e -- --testPathPattern=dashboard.e2e-spec
```

预期:4 用例全过。

- [ ] **Step 4.8: 改 web 首页用聚合接口**

完整替换 `apps/web/src/app/(app)/page.tsx`:

```typescript
'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import {
  CheckSquare,
  FileText,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/data/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useApiQuery } from '@/lib/use-api-query';

interface Kpi {
  pendingApprovals: number;
  myRequests: number;
  stockAlerts: number;
  controlledReagents: number;
}

const ZERO: Kpi = {
  pendingApprovals: 0,
  myRequests: 0,
  stockAlerts: 0,
  controlledReagents: 0,
};

export default function DashboardPage() {
  const kpiQuery = useApiQuery<Kpi>('/dashboard/kpi', {
    queryKey: ['dashboard', 'kpi'],
  });
  const kpi = kpiQuery.data ?? ZERO;

  useEffect(() => {
    if (kpiQuery.error) {
      toast.error((kpiQuery.error as Error).message ?? '加载工作台失败');
    }
  }, [kpiQuery.error]);

  const cards: Array<{
    label: string;
    value: number;
    href: string;
    icon: React.ReactNode;
  }> = [
    {
      label: '待我审批',
      value: kpi.pendingApprovals,
      href: '/approvals',
      icon: <CheckSquare className="h-5 w-5 text-primary" />,
    },
    {
      label: '我的申请',
      value: kpi.myRequests,
      href: '/my/requests',
      icon: <FileText className="h-5 w-5 text-primary" />,
    },
    {
      label: '库存预警',
      value: kpi.stockAlerts,
      href: '/admin/alerts/config',
      icon: <AlertTriangle className="h-5 w-5 text-destructive" />,
    },
    {
      label: '管控试剂',
      value: kpi.controlledReagents,
      href: '/reagents',
      icon: <ShieldAlert className="h-5 w-5 text-primary" />,
    },
  ];

  return (
    <div data-testid="dashboard-page">
      <PageHeader title="工作台" subtitle="实验室试剂管理中心" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} data-testid={`dashboard-kpi-${c.label}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.label}
              </CardTitle>
              {c.icon}
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{c.value}</div>
              <Link
                href={c.href}
                className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                查看 <ArrowRight className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>快捷入口</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/reagents">试剂百科</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/my/requests">提交申请</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/approvals">待审批</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/reports/usage-trend">报表中心</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4.9: 新建 dashboard 页 vitest**

新建 `apps/web/src/app/(app)/__tests__/page.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from '../page';
import { useAuth } from '@/lib/auth-store';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
  apiFetchRaw: vi.fn(),
  apiBaseUrl: '/api/v1',
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('Dashboard 页', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'u1', email: 'admin@lab.local' } as any,
      hydrated: true,
    });
  });

  it('从 /dashboard/kpi 拉一个聚合接口并把四个值上屏', async () => {
    mockApiFetch.mockResolvedValueOnce({
      pendingApprovals: 3,
      myRequests: 5,
      stockAlerts: 2,
      controlledReagents: 7,
    });
    renderWithQuery(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-kpi-待我审批')).toHaveTextContent(
        '3',
      );
      expect(screen.getByTestId('dashboard-kpi-我的申请')).toHaveTextContent(
        '5',
      );
      expect(screen.getByTestId('dashboard-kpi-库存预警')).toHaveTextContent(
        '2',
      );
      expect(screen.getByTestId('dashboard-kpi-管控试剂')).toHaveTextContent(
        '7',
      );
    });

    const kpiCalls = mockApiFetch.mock.calls.filter((c) =>
      String(c[0]).startsWith('/dashboard/kpi'),
    );
    expect(kpiCalls.length).toBe(1);
  });

  it('接口报错 → toast.error 且四个值兜底为 0', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockRejectedValueOnce(new Error('boom'));
    renderWithQuery(<DashboardPage />);

    await waitFor(() => {
      expect(toast.error as any).toHaveBeenCalled();
    });
    expect(screen.getByTestId('dashboard-kpi-待我审批')).toHaveTextContent('0');
  });
});
```

- [ ] **Step 4.10: 跑 web vitest 看绿**

```powershell
pnpm --filter @app/web test -- src/app/"(app)"/__tests__/page.test.tsx
```

预期:2 用例 PASS。

- [ ] **Step 4.11: 跑全量 api e2e + web vitest 看无回归**

```powershell
pnpm --filter @app/api test:e2e
pnpm --filter @app/web test
```

预期:dashboard 新 4 用例 + users 新 3 用例 + admin/users 10 用例 + dashboard 页 2 用例,全部通过。

- [ ] **Step 4.12: Commit**

```powershell
git add apps/api/src/modules/dashboard apps/api/src/app.module.ts apps/api/test/dashboard.e2e-spec.ts apps/web/src/app/"(app)"/page.tsx apps/web/src/app/"(app)"/__tests__/page.test.tsx
git commit -m "feat(api,web): /dashboard/kpi 聚合 + 首页改用单接口拉四指标"
```

---

## Task 5: API — /requests mine+scope + /reagents controlled + /alerts/active

**Files:**
- Modify: `apps/api/src/modules/requests/dto/query-request.dto.ts`
- Modify: `apps/api/src/modules/requests/requests.service.ts`
- Modify: `apps/api/test/requests.e2e-spec.ts`
- Modify: `apps/api/src/modules/reagents/dto/query-reagent.dto.ts`
- Modify: `apps/api/src/modules/reagents/reagents.service.ts`
- Modify: `apps/api/test/reagents.e2e-spec.ts`
- Modify: `apps/api/src/modules/alerts/alerts.controller.ts`
- Modify: `apps/api/src/modules/alerts/alerts.service.ts`
- Modify: `apps/api/test/alerts.e2e-spec.ts`

### Sub-task 5A: /requests mine + scope

- [ ] **Step 5A.1: 改 query-request.dto.ts**

完整替换 `apps/api/src/modules/requests/dto/query-request.dto.ts`:

```typescript
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { RequestStatus } from '@prisma/client';

export class QueryRequestDto {
  @IsOptional() @IsEnum(RequestStatus) status?: RequestStatus;
  @IsOptional() @IsString() reagentId?: string;
  @IsOptional() @IsString() labId?: string;
  @IsOptional() @IsIn(['0', '1']) mine?: '0' | '1';
  @IsOptional() @IsIn(['approval']) scope?: 'approval';
}
```

- [ ] **Step 5A.2: 改 requests.service.ts list 方法**

替换 `apps/api/src/modules/requests/requests.service.ts` 中的 `list(...)`(22 - 50 行)为:

```typescript
  async list(query: QueryRequestDto, actor: ActorContext) {
    const where: Prisma.RequestWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.reagentId) where.reagentId = query.reagentId;

    if (query.scope === 'approval') {
      where.status = RequestStatus.PENDING;
      if (actor.roles.includes('SYS_ADMIN')) {
        if (query.labId) where.labId = query.labId;
      } else if (
        actor.roles.includes('LAB_HEAD') ||
        actor.roles.includes('REAGENT_ADMIN')
      ) {
        const user = await this.prisma.user.findUnique({
          where: { id: actor.sub },
        });
        if (!user?.labId) throw new ForbiddenException('user has no lab');
        where.labId = user.labId;
      } else {
        throw new ForbiddenException('scope=approval requires reviewer role');
      }
    } else if (query.mine === '1') {
      where.applicantId = actor.sub;
      if (actor.roles.includes('SYS_ADMIN') && query.labId) {
        where.labId = query.labId;
      }
    } else if (actor.roles.includes('SYS_ADMIN')) {
      if (query.labId) where.labId = query.labId;
    } else if (
      actor.roles.includes('LAB_HEAD') ||
      actor.roles.includes('REAGENT_ADMIN')
    ) {
      const user = await this.prisma.user.findUnique({
        where: { id: actor.sub },
      });
      if (!user?.labId) throw new ForbiddenException('user has no lab');
      where.labId = user.labId;
    } else {
      where.applicantId = actor.sub;
    }

    return this.prisma.request.findMany({
      where,
      include: {
        reagent: true,
        stock: true,
        lab: true,
        applicant: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
```

- [ ] **Step 5A.3: 在 requests.e2e-spec.ts 加 4 个用例**

打开 `apps/api/test/requests.e2e-spec.ts`。当前结构:外层 `describe('Requests', ...)` 第 9 行 → 第 747 行,内部有多个嵌套 describe。在**第 746 行(最后一个内嵌 describe 的关闭 `});`)之后、第 747 行(外层 describe 关闭 `});`)之前**,插入一个新 describe:

```typescript
  describe('mine & scope query params', () => {
    it('GET /requests?mine=1 PLAIN_USER 只拿到自己的', async () => {
      const r = await request(app.getHttpServer())
        .get('/requests?mine=1')
        .set('Authorization', `Bearer ${plainToken}`);
      const data = expectOk(r);
      expect(data.every((x: any) => x.applicantId === plainUserId)).toBe(true);
    });

    it('GET /requests?mine=1 SYS_ADMIN 也强制只拿自己', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { email: 'admin@lab.local' },
      });
      const r = await request(app.getHttpServer())
        .get('/requests?mine=1')
        .set('Authorization', `Bearer ${adminToken}`);
      const data = expectOk(r);
      expect(
        data.every((x: any) => x.applicantId === adminUser!.id),
      ).toBe(true);
    });

    it('GET /requests?scope=approval PLAIN_USER → 403', async () => {
      const r = await request(app.getHttpServer())
        .get('/requests?scope=approval')
        .set('Authorization', `Bearer ${plainToken}`);
      expectBizError(r, 403);
    });

    it('GET /requests?scope=approval SYS_ADMIN 仅返 PENDING', async () => {
      const r = await request(app.getHttpServer())
        .get('/requests?scope=approval')
        .set('Authorization', `Bearer ${adminToken}`);
      const data = expectOk(r);
      expect(data.every((x: any) => x.status === 'PENDING')).toBe(true);
    });
  });
```

- [ ] **Step 5A.4: 跑 requests e2e 看 4 新用例绿(其他既存 fail 不算回归)**

```powershell
pnpm --filter @app/api test:e2e -- --testPathPattern=requests.e2e-spec -t "mine=1|scope=approval"
```

预期:4 用例 PASS。

### Sub-task 5B: /reagents controlled

- [ ] **Step 5B.1: 改 query-reagent.dto.ts**

完整替换 `apps/api/src/modules/reagents/dto/query-reagent.dto.ts`:

```typescript
import { IsIn, IsOptional, IsString } from 'class-validator';

export class QueryReagentDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsIn(['0', '1']) controlled?: '0' | '1';
}
```

- [ ] **Step 5B.2: 改 reagents.service.ts list 方法**

完整替换 `apps/api/src/modules/reagents/reagents.service.ts` 中的 `list(...)`(11 - 24 行)为:

```typescript
  list(query: QueryReagentDto) {
    const and: any[] = [{ deletedAt: null }];
    if (query.q) {
      and.push({
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { cas: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }
    if (query.category) and.push({ category: query.category });
    if (query.controlled === '1') {
      and.push({
        OR: [
          { hazardLevel: 'CONTROLLED' },
          { controlType: { not: null } },
        ],
      });
    }
    return this.prisma.reagent.findMany({
      where: { AND: and },
      orderBy: { name: 'asc' },
    });
  }
```

- [ ] **Step 5B.3: 在 reagents.e2e-spec.ts 加 1 个用例**

打开 `apps/api/test/reagents.e2e-spec.ts`,在文件最后一个 `it('search by name', ...)` 之后(`describe` 块关闭 `});` 之前)加:

```typescript
  it('controlled=1 仅返回受控试剂', async () => {
    await prisma.reagent.upsert({
      where: { id: 'reagent-ctrl-list' },
      update: {},
      create: {
        id: 'reagent-ctrl-list',
        name: 'TestReagent-ControlledList',
        hazardLevel: 'CONTROLLED',
        controlType: 'TOXIC',
        category: '管控',
      },
    });
    const r = await request(app.getHttpServer())
      .get('/reagents?controlled=1')
      .set('Authorization', `Bearer ${adminToken}`);
    const data = expectOk(r);
    expect(data.length).toBeGreaterThan(0);
    expect(
      data.every(
        (x: any) => x.hazardLevel === 'CONTROLLED' || x.controlType != null,
      ),
    ).toBe(true);
  });
```

- [ ] **Step 5B.4: 跑 reagents e2e 看绿**

```powershell
pnpm --filter @app/api test:e2e -- --testPathPattern=reagents.e2e-spec
```

预期:5 用例全过(原 4 + 新 1)。

### Sub-task 5C: /alerts/active

- [ ] **Step 5C.1: 在 alerts.service.ts 加 listActiveForUser**

打开 `apps/api/src/modules/alerts/alerts.service.ts`,在 class 最后一个 method `findReconcileAnomalies` 关闭 `}` 之后(class 关闭 `}` 之前)加:

```typescript
  async listActiveForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: {
        recipientId: userId,
        readAt: null,
        type: {
          in: ['ALERT_LOW_STOCK', 'ALERT_EXPIRING', 'ALERT_RECONCILE'],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        payload: true,
        createdAt: true,
      },
    });
  }
```

- [ ] **Step 5C.2: 在 alerts.controller.ts 加 AlertsActiveController**

完整替换 `apps/api/src/modules/alerts/alerts.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from './config.service';
import { AlertsService } from './alerts.service';
import { UpsertConfigDto } from './dto/upsert-config.dto';
import { QueryConfigDto } from './dto/query-config.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('alerts')
@ApiBearerAuth()
@Controller('lab-reagent-configs')
export class AlertsController {
  constructor(private readonly config: ConfigService) {}

  @Post()
  @Roles('LAB_HEAD', 'REAGENT_ADMIN', 'SYS_ADMIN')
  @Audit({ action: 'LAB_REAGENT_CONFIG_UPSERT', entityType: 'LabReagentConfig' })
  @ApiOperation({ summary: '创建实验室-试剂安全库存/到期提醒配置' })
  create(@Body() dto: UpsertConfigDto, @CurrentUser() user: any) {
    return this.config.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: '查询配置列表 (按实验室/试剂筛选)' })
  list(@Query() q: QueryConfigDto, @CurrentUser() user: any) {
    return this.config.list(q, user);
  }

  @Patch(':id')
  @Roles('LAB_HEAD', 'REAGENT_ADMIN', 'SYS_ADMIN')
  @Audit({ action: 'LAB_REAGENT_CONFIG_UPSERT', entityType: 'LabReagentConfig' })
  @ApiOperation({ summary: '更新配置' })
  update(
    @Param('id') id: string,
    @Body() dto: Partial<UpsertConfigDto>,
    @CurrentUser() user: any,
  ) {
    return this.config.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('LAB_HEAD', 'REAGENT_ADMIN', 'SYS_ADMIN')
  @Audit({ action: 'LAB_REAGENT_CONFIG_DELETE', entityType: 'LabReagentConfig' })
  @ApiOperation({ summary: '删除配置' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.config.remove(id, user);
  }
}

@ApiTags('alerts')
@ApiBearerAuth()
@Controller('alerts')
export class AlertsActiveController {
  constructor(private readonly alerts: AlertsService) {}

  @Get('active')
  @ApiOperation({ summary: '当前用户未读的告警通知 (最新 50 条)' })
  active(@Req() req: any) {
    return this.alerts.listActiveForUser(req.user.sub);
  }
}
```

- [ ] **Step 5C.3: 在 alerts.module.ts 注册 AlertsActiveController**

替换 `apps/api/src/modules/alerts/alerts.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConfigService } from './config.service';
import { AlertsService } from './alerts.service';
import { AlertsScheduler } from './alerts.scheduler';
import { AlertsController, AlertsActiveController } from './alerts.controller';

@Module({
  imports: [NotificationsModule],
  providers: [ConfigService, AlertsService, AlertsScheduler],
  controllers: [AlertsController, AlertsActiveController],
  exports: [ConfigService, AlertsService],
})
export class AlertsModule {}
```

- [ ] **Step 5C.4: 在 alerts.e2e-spec.ts 加 1 个 describe**

打开 `apps/api/test/alerts.e2e-spec.ts`。当前结构:第 8 行外层 `describe('Alerts', ...)`,内含两个子 describe — `LabReagentConfig CRUD`(73)和 `AlertsService.runDaily`(117 - 267)。在第 267 行 `AlertsService.runDaily` 的关闭 `});` 之后、第 268 行外层 `});` 之前,插入下面新 describe:

```typescript
  describe('GET /alerts/active', () => {
    it('返回当前用户未读告警 + 标记为已读后消失', async () => {
      const lh = await prisma.user.findUnique({
        where: { email: 'lh-alerts@lab.local' },
      });
      await prisma.notification.deleteMany({
        where: { recipientId: lh!.id },
      });
      await prisma.notification.create({
        data: {
          recipientId: lh!.id,
          labId: 'lab-default',
          type: 'ALERT_LOW_STOCK',
          title: '库存告急',
          body: 'just a test',
          payload: {},
        },
      });

      const r1 = await request(app.getHttpServer())
        .get('/alerts/active')
        .set('Authorization', `Bearer ${labHeadToken}`);
      const data1 = expectOk(r1);
      expect(Array.isArray(data1)).toBe(true);
      expect(data1.length).toBe(1);
      expect(data1[0].type).toBe('ALERT_LOW_STOCK');

      await prisma.notification.updateMany({
        where: { recipientId: lh!.id },
        data: { readAt: new Date() },
      });

      const r2 = await request(app.getHttpServer())
        .get('/alerts/active')
        .set('Authorization', `Bearer ${labHeadToken}`);
      const data2 = expectOk(r2);
      expect(data2.length).toBe(0);
    });

    it('未登录 → 401', async () => {
      const r = await request(app.getHttpServer()).get('/alerts/active');
      expectBizError(r, 401);
    });
  });
```

- [ ] **Step 5C.5: 跑 alerts e2e 看绿**

```powershell
pnpm --filter @app/api test:e2e -- --testPathPattern=alerts.e2e-spec
```

预期:原 ~9 用例 + 新 2 用例 全过。

### 整体收尾

- [ ] **Step 5.X.1: 跑全量 api e2e**

```powershell
pnpm --filter @app/api test:e2e
```

预期:users (17) + dashboard (4) + requests (新 4 用例过,既存 fail 不退化) + reagents (5) + alerts (新 2 过) + 其他 spec 不退化。

- [ ] **Step 5.X.2: 跑全量 web vitest + tsc**

```powershell
pnpm --filter @app/web test
pnpm --filter @app/web exec tsc --noEmit
pnpm --filter @app/web build
```

预期:vitest 67 + 新 4 用例(admin/users 2 + dashboard 页 2)全过;tsc 0 error;build 成功且 shared chunk 87.3 kB 持平。

- [ ] **Step 5.X.3: Commit**

```powershell
git add apps/api/src/modules/requests apps/api/src/modules/reagents apps/api/src/modules/alerts apps/api/test/requests.e2e-spec.ts apps/api/test/reagents.e2e-spec.ts apps/api/test/alerts.e2e-spec.ts
git commit -m "fix(api): /requests mine&scope + /reagents controlled + /alerts/active"
```

- [ ] **Step 5.X.4: 打 tag**

```powershell
git tag -a user-role-opt-complete -m "用户与角色优化 5 commit 完结:UserView mapper / /roles 动态 / 密码二次校验 / /dashboard/kpi 聚合 / 三接口语义修正"
git log --oneline -6
```

预期:看到 5 个 feat/fix commit + 1 个 docs(spec) commit。

---

## 验收清单

完成所有 task 后,跑以下命令,**全部应通过**:

| 命令 | 预期 |
|---|---|
| `pnpm --filter @app/api test:e2e` | users.spec 17 / dashboard.spec 4 / requests.spec 既存 + 新 4 用例过 / reagents.spec 5 / alerts.spec 既存 + 新 2 / 其他 spec 不退化 |
| `pnpm --filter @app/web test` | admin/users 10 / dashboard 页 2 / 其他既存全过(总 +4) |
| `pnpm --filter @app/web exec tsc --noEmit` | 0 error |
| `pnpm --filter @app/web build` | 成功,shared chunk 87.3 kB 持平 |
| `git log --oneline -6` | docs(spec) + 5 个 feat/fix commit |
| `git tag -l user-role-opt-complete` | 存在 |

---

## 回滚

```powershell
git reset --hard HEAD~6   # 回到 spec 之前
git tag -d user-role-opt-complete
```

或单 PR 合并后 `git revert <merge-sha>` 即可。
