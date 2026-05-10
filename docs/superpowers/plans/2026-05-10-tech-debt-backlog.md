# Tech Debt Backlog Implementation Plan（P8c 收尾后）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 spec `docs/superpowers/specs/2026-05-10-tech-debt-backlog-design.md` 里 13 项待优化（P0×3 / P1×4 / P2×3 / P3×3）全部细化为可执行步骤；每 task 含确切 files / step / 命令 / commit message。完成后 master 在 `8d52ccc` 之上前进 13~14 个 commit，覆盖导出统一、auth rotation+tokenVersion、apiFetch timeout、admin/users UX 与单测、e2e 补全、TanStack Query 试点、RTL 升级。

**Architecture:** 沿用 P8a/P8b/P8c 全部基础设施。前端 `lib/api-client.ts` 抽出 `apiFetchRaw` 提供 Response 通道（修 P0-1）+ 加 `signal/timeout`（P1-1）+ refresh 收尾（P3-3）；后端 `auth.service` 引入 jti rotation（P0-2）与 `tokenVersion` 立即失效（P0-3），均走 prisma migration；`/admin/users` 启用 Combobox + 临时密码复制（P1-3/P1-4）+ 单测（P2-1）；后端 `users.e2e-spec` 补 PATCH/DELETE/reset-password 三路（P2-2）；引入 TanStack Query v5 试点改造 4 reports/* + admin/users（P1-2）；最后 bump RTL 到 v15（P3-1）。**无新增运行时依赖（除 P1-2 的 @tanstack/react-query）**。

**Tech Stack:** Next.js 14.2.3 / React 18.3 / TypeScript 5.4 / Tailwind 3.4 / shadcn/ui / Vitest + RTL 14→15 / Playwright. apps/api: NestJS 10 / Prisma / passport-jwt / bcryptjs. 新增依赖：`@tanstack/react-query@^5`（仅 Task 12）。

**Spec:** `docs/superpowers/specs/2026-05-10-tech-debt-backlog-design.md`

**Prerequisites:**
- master HEAD `8d52ccc`（含 P8c apiFetch 401→refresh→retry 拦截 fix）
- 工作区干净（`git status` clean）
- `pnpm i` 已装；`pnpm -F @app/api exec prisma generate` 跑得通
- 数据库可用（dev DATABASE_URL 指向本地 postgres，已被多个 e2e 用过）

**与原 backlog 的差异校正（调研后发现）：**
- P2-2 不是"新建" `users.e2e-spec.ts`，而是**补全**已有文件（当前 3 用例：create / list / 403）
- P2-3 不是"新建" `api-client.test.ts`，而是**补全**已有文件（当前 2 用例：token attach / 401 throw）
- P0-3 的 `User.tokenVersion` 加在 schema 第 36-59 行 `model User { ... }` 块里
- P1-3 没有现成 shadcn `Combobox`，需自封装 `Popover + Command + Button`（cmdk 已装为 P8a 依赖）
- audit_log.action 是 `String` 不是 enum，`USER_RESET_PASSWORD` 与 `USER_TOKEN_REVOKE` 直接写字符串即可，无需 prisma migration

**任务依赖与并行性：**
- Task 1 → 2（都改 ExportButton.tsx，先 apiFetchRaw 再文件名 fallback）
- Task 1 → 5 → 6（都改 api-client.ts，先抽 apiFetchRaw / 再 clear 收尾 / 再 timeout）
- Task 6 → 7（先实现 timeout 再写单测）
- Task 3 与 Task 4 都改 `auth.service.ts` 的 `issueTokens`，**必须串行**：先 Task 3 写 jti，再 Task 4 加 tokenVersion
- Task 8 → 9 → 10（都改 admin/users/page.tsx；10 的单测要 mock 9 的剪贴板）
- Task 11 独立（仅改 apps/api/test/users.e2e-spec.ts）
- Task 12 改最多文件，建议放最后
- Task 13 升级 RTL，影响所有单测；放在 Task 12 之后、验收之前

---

## File Structure

```
apps/web/src/
├── lib/
│   ├── api-client.ts                          # MODIFY (Task 1, 5, 6)
│   ├── use-api-query.ts                       # NEW    (Task 12)
│   └── __tests__/
│       └── api-client.test.ts                 # MODIFY (Task 7)
├── components/
│   ├── reports/
│   │   ├── ExportButton.tsx                   # MODIFY (Task 1, 2)
│   │   └── useReportData.ts                   # DELETE (Task 12)
│   └── ui/
│       └── combobox.tsx                       # NEW    (Task 8)
└── app/
    └── (app)/
        ├── layout.tsx                         # MODIFY (Task 12)
        ├── admin/users/
        │   ├── page.tsx                       # MODIFY (Task 8, 9, 12)
        │   └── __tests__/
        │       └── page.test.tsx              # NEW    (Task 10)
        └── reports/
            ├── usage-trend/page.tsx           # MODIFY (Task 12)
            ├── inventory-turnover/page.tsx    # MODIFY (Task 12)
            ├── purchase-amount/page.tsx       # MODIFY (Task 12)
            └── controlled-audit/page.tsx      # MODIFY (Task 12)

apps/web/package.json                          # MODIFY (Task 12: +@tanstack/react-query; Task 13: RTL bump)

apps/api/
├── prisma/
│   ├── schema.prisma                          # MODIFY (Task 3 加 currentRefreshJti; Task 4 加 tokenVersion)
│   └── migrations/
│       ├── 20260510*_add_refresh_jti/         # NEW    (Task 3)
│       └── 20260510*_add_token_version/       # NEW    (Task 4)
└── src/
    ├── auth/
    │   └── auth.service.ts                    # MODIFY (Task 3, 4)
    ├── common/strategies/
    │   └── jwt.strategy.ts                    # MODIFY (Task 4)
    └── users/
        └── users.service.ts                   # MODIFY (Task 4)

apps/api/test/
├── auth.e2e-spec.ts                           # MODIFY (Task 3 — 旧 refresh token 应 401)
└── users.e2e-spec.ts                          # MODIFY (Task 4, 11)
```

---

## Task 1: 抽 apiFetchRaw + ExportButton 接入（修 P0-1）

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/components/reports/ExportButton.tsx`

- [ ] **Step 1: 重写 `apps/web/src/lib/api-client.ts`**

把 `apiFetch` 拆成两层：`apiFetchRaw` 返回 `Response`（共享 401→refresh→retry 路径），`apiFetch<T>` 内部调用它后 `.json()`。Blob/Stream 场景调 `apiFetchRaw`。

完整新内容：

```ts
import type { AuthTokens } from '@app/shared';
import { useAuth } from './auth-store';

export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

let refreshInflight: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (refreshInflight) return refreshInflight;
  const refreshToken = useAuth.getState().tokens?.refreshToken;
  if (!refreshToken) return null;
  refreshInflight = (async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as AuthTokens;
      useAuth.getState().setTokens(data);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshInflight = null;
    }
  })();
  return refreshInflight;
}

export interface ApiFetchOpts {
  method?: string;
  body?: any;
  token?: string;
  headers?: Record<string, string>;
}

export async function apiFetchRaw(
  path: string,
  opts: ApiFetchOpts = {},
): Promise<Response> {
  const doFetch = (token?: string) => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${apiBaseUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  };

  let res = await doFetch(opts.token);
  if (res.status === 401 && opts.token) {
    const newToken = await tryRefresh();
    if (newToken) {
      res = await doFetch(newToken);
    } else {
      useAuth.getState().clear();
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
  }
  return res;
}

export async function apiFetch<T = any>(
  path: string,
  opts: ApiFetchOpts = {},
): Promise<T> {
  const res = await apiFetchRaw(path, opts);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : res.json();
}
```

- [ ] **Step 2: ExportButton 改用 apiFetchRaw**

修改 `apps/web/src/components/reports/ExportButton.tsx`，仅改 import 与 `download` 内 fetch 行：

```tsx
// 第 12 行 import 改为：
import { apiFetchRaw } from '@/lib/api-client';

// download 函数体内（原 28-31 行）改为：
    setDownloading(true);
    try {
      const sep = endpoint.includes('?') ? '&' : '?';
      const res = await apiFetchRaw(`${endpoint}${sep}format=${format}`, {
        token: tokens.accessToken,
      });
```

其它行保持不变。删除原本对 `apiBaseUrl` 的 import（只用作拼 URL，apiFetchRaw 内部自己拼）：

```tsx
// 删除原第 12 行：
// import { apiBaseUrl } from '@/lib/api-client';
```

- [ ] **Step 3: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

预期：0 错。

- [ ] **Step 4: 跑 web 单测确认现有用例不破**

```bash
pnpm -F @app/web test
```

预期：48 用例全绿（P8c 基线 48）。

- [ ] **Step 5: 手动验证（可选 — 推到 Task 14 也行）**

设置 `JWT_ACCESS_TTL=30s`，登录后等 30s 让 access 过期，进入 `/reports/usage-trend` 点导出 → DevTools Network 应看到：
- 第一次 `/reports/usage-trend?...&format=csv` 401
- `/auth/refresh` 200
- 第二次 `/reports/usage-trend?...&format=csv` 200 + 文件下载

- [ ] **Step 6: commit**

```bash
git add apps/web/src/lib/api-client.ts apps/web/src/components/reports/ExportButton.tsx
git commit -m "$(cat <<'EOF'
fix(web): ExportButton 走 apiFetchRaw,导出请求支持 401→refresh→retry

抽 apiFetch 为两层:apiFetchRaw 返回 Response 共享 refresh 路径,
apiFetch<T> 内部调它后 .json()。ExportButton 切到 apiFetchRaw。
EOF
)"
```

---

## Task 2: 导出文件名 fallback 用 slug+date（修 P3-2）

**Files:**
- Modify: `apps/web/src/components/reports/ExportButton.tsx`

- [ ] **Step 1: 加 slug 提取逻辑**

修改 `apps/web/src/components/reports/ExportButton.tsx`，把当前 fallback `report.${format}` 改为 `${slug}-${YYYYMMDD}.${format}`。

在 `download` 函数里 `URL.createObjectURL(blob)` 之后、`a.download = ...` 之前插入 slug 计算：

```tsx
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      // slug 提取:取 endpoint 的最后一段 path,去掉 query
      const pathOnly = endpoint.split('?')[0];
      const slug = pathOnly.split('/').filter(Boolean).pop() ?? 'report';
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.href = url;
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ??
        `${slug}-${today}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
```

- [ ] **Step 2: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

预期：0 错。

- [ ] **Step 3: 加单测覆盖 fallback 文件名**

修改或新建 `apps/web/src/components/reports/__tests__/ExportButton.test.tsx`（P8c 已加该测试文件）。在已有 describe 块里追加一个 `it`：

```ts
  it('fallback 文件名使用 endpoint slug + 当天日期', async () => {
    const blob = new Blob(['csv'], { type: 'text/csv' });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(blob, {
        status: 200,
        // 故意不返回 Content-Disposition,触发 fallback
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    (URL as any).createObjectURL = vi.fn(() => 'blob:mock');
    (URL as any).revokeObjectURL = vi.fn();
    const clickSpy = vi.fn();
    const anchorEl = { click: clickSpy, href: '', download: '' } as any;
    vi.spyOn(document, 'createElement').mockReturnValue(anchorEl);

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    useAuth.setState({ tokens: { accessToken: 'x', refreshToken: 'y' } } as any);
    render(<ExportButton endpoint="/reports/usage-trend?range=30d" />);
    await user.click(screen.getByRole('button', { name: /导出/ }));
    await user.click(screen.getByText('导出 CSV'));

    await vi.waitFor(() => {
      expect(anchorEl.download).toMatch(/^usage-trend-\d{8}\.csv$/);
    });
  });
```

注意 imports 顶部确保有：

```ts
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { useAuth } from '@/lib/auth-store';
```

- [ ] **Step 4: 跑该测试**

```bash
pnpm -F @app/web test ExportButton
```

预期：所有 ExportButton 用例通过（含新增 1 个）。

- [ ] **Step 5: commit**

```bash
git add apps/web/src/components/reports/ExportButton.tsx apps/web/src/components/reports/__tests__/ExportButton.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): export fallback 文件名用 endpoint slug + 当天日期

当后端 Content-Disposition 缺失时,从 endpoint 末段取 slug,
拼上 YYYYMMDD,如 usage-trend-20260510.csv。避免多份导出
都叫 report.csv 互相覆盖。
EOF
)"
```

---

## Task 3: refresh token rotation 用 jti（修 P0-2）

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_refresh_jti/migration.sql`（由 prisma migrate dev 自动生成）
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/test/auth.e2e-spec.ts`

- [ ] **Step 1: schema 加 currentRefreshJti 字段**

修改 `apps/api/prisma/schema.prisma` 第 36-59 行 `model User { ... }`，在 `wechatOpenId` 之后加一行：

```prisma
  wechatOpenId    String?       @unique
  currentRefreshJti String?
  createdAt       DateTime      @default(now())
```

- [ ] **Step 2: 跑 prisma migrate dev**

```bash
pnpm -F @app/api exec prisma migrate dev --name add_refresh_jti
```

预期：生成 `apps/api/prisma/migrations/20260510*_add_refresh_jti/migration.sql`，内容含 `ALTER TABLE "User" ADD COLUMN "currentRefreshJti" TEXT;`。Prisma client 自动 regen。

如果 migrate 失败提示数据库不可达：先确认 docker-compose 里 postgres 在跑 / `DATABASE_URL` 设置正确，再重试。

- [ ] **Step 3: auth.service.ts 改 issueTokens 与 refresh**

修改 `apps/api/src/auth/auth.service.ts`：
- 顶部加 `import { randomUUID } from 'crypto';`
- `issueTokens` 改为先生成 jti 再签 refreshToken 并写库：

完整修改后的 `issueTokens` 与 `refresh` 方法：

```ts
  async refresh(token: string) {
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || user.deletedAt) throw new UnauthorizedException();
      // 关键:校验 jti 必须等于 user 当前 currentRefreshJti
      if (!payload.jti || user.currentRefreshJti !== payload.jti) {
        throw new UnauthorizedException();
      }
      return this.issueTokens(payload.sub, payload.roles);
    } catch {
      throw new UnauthorizedException();
    }
  }

  private async issueTokens(sub: string, roles: string[]) {
    const accessToken = await this.jwt.signAsync(
      { sub, roles },
      {
        secret: this.cfg.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: this.cfg.get('JWT_ACCESS_TTL') ?? '15m',
      },
    );
    const jti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { sub, roles, jti },
      {
        secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.cfg.get('JWT_REFRESH_TTL') ?? '7d',
      },
    );
    // 关键:写最新 jti,旧 jti 立即失效
    await this.prisma.user.update({
      where: { id: sub },
      data: { currentRefreshJti: jti },
    });
    return { accessToken, refreshToken };
  }
```

- [ ] **Step 4: typecheck apps/api**

```bash
pnpm -F @app/api exec tsc --noEmit
```

预期：0 错。

- [ ] **Step 5: 跑现有 auth.e2e-spec 确认 happy path 不破**

```bash
pnpm -F @app/api exec jest --config test/jest-e2e.json --testPathPattern auth
```

预期：现有 auth 用例全绿（login / refresh happy path / public guard 等）。

- [ ] **Step 6: 加 rotation e2e 用例**

修改 `apps/api/test/auth.e2e-spec.ts`，在末尾的 `describe('auth', ...)` 块里新增：

```ts
  it('refresh token rotation: 旧 refresh 用一次后再用应 401', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    const oldRefresh = login.body.refreshToken;

    // 第一次 refresh:成功,得新对
    const r1 = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefresh });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(oldRefresh);

    // 同一旧 refresh 再用一次:应 401
    const r2 = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefresh });
    expect(r2.status).toBe(401);

    // 新 refresh 仍可用一次
    const r3 = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: r1.body.refreshToken });
    expect(r3.status).toBe(200);
  });
```

- [ ] **Step 7: 跑该用例**

```bash
pnpm -F @app/api exec jest --config test/jest-e2e.json --testPathPattern auth -t "rotation"
```

预期：通过。

- [ ] **Step 8: commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/auth/auth.service.ts apps/api/test/auth.e2e-spec.ts
git commit -m "$(cat <<'EOF'
feat(api): refresh token rotation via jti(P0-2)

User 表新增 currentRefreshJti;每次 issueTokens 生成 randomUUID
作为 refresh jti 写库;refresh endpoint 校验传入 jti==当前 jti,
旋转后旧 refresh 立即失效。e2e 用例覆盖第二次旧 token 应 401。

修 backlog P0-2:此前任何泄漏的 refresh token 在 7d TTL 内都
能持续换 access token,等同 7d 后门。
EOF
)"
```

---

## Task 4: tokenVersion 立即失效（修 P0-3）

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_token_version/migration.sql`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/common/strategies/jwt.strategy.ts`
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/test/users.e2e-spec.ts`

- [ ] **Step 1: schema 加 tokenVersion**

修改 `apps/api/prisma/schema.prisma` 的 `model User`，在 `currentRefreshJti` 之后加：

```prisma
  currentRefreshJti String?
  tokenVersion    Int           @default(0)
```

- [ ] **Step 2: 跑 prisma migrate dev**

```bash
pnpm -F @app/api exec prisma migrate dev --name add_token_version
```

预期：生成 migration `ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;`。

- [ ] **Step 3: auth.service.ts 把 tokenVersion 写入 payload**

修改 `apps/api/src/auth/auth.service.ts`：
- `login`：保留 `roles = user.roles.map(...)` 之后，把 `user` 完整传入 `issueTokens` 或额外取 `user.tokenVersion`：

```ts
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { roles: { include: { role: true } } },
    });
    if (!user || user.deletedAt) throw new UnauthorizedException();
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException();
    const roles = user.roles.map((ur) => ur.role.code);
    return this.issueTokens(user.id, roles, user.tokenVersion);
  }
```

- `refresh`：从 DB 取最新 tokenVersion，**不**信任 payload 里的旧值；签发新对时用最新：

```ts
  async refresh(token: string) {
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || user.deletedAt) throw new UnauthorizedException();
      if (!payload.jti || user.currentRefreshJti !== payload.jti) {
        throw new UnauthorizedException();
      }
      // tokenVersion 校验:payload 写入时的版本必须等于当前 DB 版本
      if (typeof payload.ver !== 'number' || payload.ver !== user.tokenVersion) {
        throw new UnauthorizedException();
      }
      return this.issueTokens(payload.sub, payload.roles, user.tokenVersion);
    } catch {
      throw new UnauthorizedException();
    }
  }
```

- `issueTokens`：加 `ver` 参数，写入两个 token 的 payload：

```ts
  private async issueTokens(sub: string, roles: string[], ver: number) {
    const accessToken = await this.jwt.signAsync(
      { sub, roles, ver },
      {
        secret: this.cfg.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: this.cfg.get('JWT_ACCESS_TTL') ?? '15m',
      },
    );
    const jti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { sub, roles, ver, jti },
      {
        secret: this.cfg.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.cfg.get('JWT_REFRESH_TTL') ?? '7d',
      },
    );
    await this.prisma.user.update({
      where: { id: sub },
      data: { currentRefreshJti: jti },
    });
    return { accessToken, refreshToken };
  }
```

- [ ] **Step 4: jwt.strategy.ts 校验 ver**

修改 `apps/api/src/common/strategies/jwt.strategy.ts`，把 `validate` 改为异步并查 DB：

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    cfg: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: cfg.getOrThrow('JWT_ACCESS_SECRET'),
    });
  }
  async validate(payload: { sub: string; roles: string[]; ver?: number }) {
    if (typeof payload.ver !== 'number') {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { tokenVersion: true, deletedAt: true },
    });
    if (!user || user.deletedAt || user.tokenVersion !== payload.ver) {
      throw new UnauthorizedException();
    }
    return { sub: payload.sub, roles: payload.roles };
  }
}
```

- [ ] **Step 5: app.module.ts 确保 PrismaService 可注入到 JwtStrategy**

检查 `apps/api/src/app.module.ts`：JwtStrategy 已在 providers 列表（已确认）；PrismaService 通常在 root module 注入或 PrismaModule 全局 export。如果 import 报错"Nest can't resolve dependencies of JwtStrategy"，则把 PrismaModule 加到 imports：

```bash
grep -n "PrismaModule\|JwtStrategy" apps/api/src/app.module.ts
```

确认 PrismaModule 已 imports；若没 export 全局，需在 PrismaModule 上加 `@Global()`：

```bash
cat apps/api/src/prisma/prisma.module.ts
```

如该 module 没 `@Global()`：

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 6: users.service.ts resetPassword 时 tokenVersion++**

修改 `apps/api/src/users/users.service.ts` 的 `resetPassword`：

```ts
  async resetPassword(id: string): Promise<{ tempPassword: string }> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw new NotFoundException();
    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
      },
    });
    return { tempPassword };
  }
```

`softDelete` 也加同样的递增（被删用户当前 token 必须立即失效）：

```ts
  async softDelete(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
    });
  }
```

- [ ] **Step 7: typecheck**

```bash
pnpm -F @app/api exec tsc --noEmit
```

预期：0 错。

- [ ] **Step 8: 加 e2e 验证 reset-password 后旧 token 立即失效**

修改 `apps/api/test/users.e2e-spec.ts`，在末尾追加：

```ts
  it('reset-password 后用户的旧 access token 立即 401', async () => {
    // 用 admin 创建临时用户
    const created = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'dave@lab.local',
        name: 'Dave',
        password: 'pass1234',
        roles: ['PLAIN_USER'],
      });
    expect(created.status).toBe(201);
    const userId = created.body.id;

    // dave 登录拿 token
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'dave@lab.local', password: 'pass1234' });
    const oldAccess = login.body.accessToken;

    // 旧 token 调 /auth/me 应 200
    const before = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${oldAccess}`);
    expect(before.status).toBe(200);

    // admin 重置 dave 密码
    const reset = await request(app.getHttpServer())
      .post(`/users/${userId}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(reset.status).toBe(200);

    // 旧 token 立即失效
    const after = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${oldAccess}`);
    expect(after.status).toBe(401);

    // 清理
    await prisma.userRole.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });
```

- [ ] **Step 9: 跑所有 auth + users e2e**

```bash
pnpm -F @app/api exec jest --config test/jest-e2e.json --testPathPattern "auth|users"
```

预期：全绿。注意：Task 3 的 rotation 用例配合 ver 校验也应继续通过。

- [ ] **Step 10: commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/auth/auth.service.ts apps/api/src/common/strategies/jwt.strategy.ts apps/api/src/users/users.service.ts apps/api/test/users.e2e-spec.ts
git commit -m "$(cat <<'EOF'
feat(api): tokenVersion 让 reset-password / softDelete 立即作废现有 token(P0-3)

User 表新增 tokenVersion(default 0);issueTokens 把 ver 写入两 token
payload;JwtStrategy.validate 异步查 DB 比对;refresh 也校验 ver。
resetPassword 与 softDelete 时 tokenVersion++。e2e 验证 reset
后旧 access 立即 401。

修 backlog P0-3:此前 reset-password 后被踢用户在 access TTL
(15 min)内仍能调任意业务接口。
EOF
)"
```

---

## Task 5: clear() 取消 inflight refresh（修 P3-3）

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: 在 setTokens 之前 check 当前是否仍有 tokens**

修改 `apps/web/src/lib/api-client.ts` 的 `tryRefresh`，在 `useAuth.getState().setTokens(data);` 这一行之前加判断（用户主动 clear 后不再写回新 token）：

```ts
  refreshInflight = (async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as AuthTokens;
      // 若此期间用户已主动 clear / 跳 login,不要再写回
      if (!useAuth.getState().tokens) return null;
      useAuth.getState().setTokens(data);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshInflight = null;
    }
  })();
```

- [ ] **Step 2: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

预期：0 错。

- [ ] **Step 3: 加单测覆盖（在 Task 7 一并加；这里跳过 step 直接 commit）**

> 单测在 Task 7 「apiFetch refresh 单测补全」里统一加，避免一来一回改 `api-client.test.ts`。

- [ ] **Step 4: commit**

```bash
git add apps/web/src/lib/api-client.ts
git commit -m "$(cat <<'EOF'
fix(web): tryRefresh 写 setTokens 前校验当前会话仍未 clear(P3-3)

避免用户主动登出 / 401 跳 login 与 inflight refresh 同时发生时,
后者用旧 refreshToken 拿到的新对覆盖已清空的 store。
EOF
)"
```

---

## Task 6: apiFetch 加 timeout / abort 支持（修 P1-1）

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: ApiFetchOpts 增 signal + 默认 30s timeout**

修改 `apps/web/src/lib/api-client.ts`：在 `ApiFetchOpts` 加 `signal?: AbortSignal`、`timeoutMs?: number`；`apiFetchRaw` 内部用 `AbortSignal.any` 合并外部 signal 与默认 timeout。

完整修改后的 ApiFetchOpts 与 apiFetchRaw：

```ts
export interface ApiFetchOpts {
  method?: string;
  body?: any;
  token?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** 默认 30000ms。传 0 禁用 timeout。 */
  timeoutMs?: number;
}

export async function apiFetchRaw(
  path: string,
  opts: ApiFetchOpts = {},
): Promise<Response> {
  const buildSignal = (): AbortSignal | undefined => {
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const signals: AbortSignal[] = [];
    if (opts.signal) signals.push(opts.signal);
    if (timeoutMs > 0) signals.push(AbortSignal.timeout(timeoutMs));
    if (signals.length === 0) return undefined;
    if (signals.length === 1) return signals[0];
    // AbortSignal.any 在 Node 20 / Chrome 116+ 可用
    return (AbortSignal as any).any(signals);
  };

  const doFetch = (token?: string) => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${apiBaseUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: buildSignal(),
    });
  };

  let res = await doFetch(opts.token);
  if (res.status === 401 && opts.token) {
    const newToken = await tryRefresh();
    if (newToken) {
      res = await doFetch(newToken);
    } else {
      useAuth.getState().clear();
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
  }
  return res;
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

预期：0 错。`AbortSignal.any` 与 `AbortSignal.timeout` 在 lib.dom 默认含；若 tsc 报缺类型，确认 `tsconfig.json` 的 `lib` 含 `"DOM"` 与 `"ES2022"` 即可。

- [ ] **Step 3: 跑现有单测**

```bash
pnpm -F @app/web test api-client
```

预期：现有 2 用例继续通过（默认 timeout 30s 远大于 mock 立即 resolve）。

- [ ] **Step 4: commit**

```bash
git add apps/web/src/lib/api-client.ts
git commit -m "$(cat <<'EOF'
feat(web): apiFetchRaw 支持 signal + 30s 默认 timeout(P1-1)

ApiFetchOpts 加 signal 与 timeoutMs(默认 30000)。内部用
AbortSignal.any 合并外部 signal 与 timeout signal。组件
useEffect cleanup 可传 controller.signal 取消未完成请求,避免
后端慢挂时 loading 永久卡死。
EOF
)"
```

---

## Task 7: apiFetch refresh 路径单测补全（修 P2-3）

**Files:**
- Modify: `apps/web/src/lib/__tests__/api-client.test.ts`

> 当前文件仅 2 用例：token attach / 401 throw（无 refresh）。本 task 把 refresh 链路、并发去重、clear 抑制三条 edge case 全部覆盖。

- [ ] **Step 1: 重写 api-client.test.ts**

完整新内容：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, apiFetchRaw } from '../api-client';
import { useAuth } from '../auth-store';

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'a1', refreshToken: 'r1' } as any,
      user: null,
      hydrated: true,
    });
  });

  it('attaches bearer token when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({}));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/health', { token: 'abc' });
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer abc');
  });

  it('throws on non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('err', { status: 500 })),
    );
    await expect(apiFetch('/x', { token: 'abc' })).rejects.toThrow();
  });

  it('401 → refresh 200 → retry 200 → 返回 data', async () => {
    const fetchMock = vi
      .fn()
      // 第 1 次业务请求 401
      .mockResolvedValueOnce(new Response('unauth', { status: 401 }))
      // /auth/refresh 200
      .mockResolvedValueOnce(json({ accessToken: 'a2', refreshToken: 'r2' }))
      // 第 2 次重试 200
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await apiFetch<{ ok: boolean }>('/me', { token: 'a1' });
    expect(data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // 重试时 Authorization 已切到新 token
    const retryHeaders = fetchMock.mock.calls[2][1].headers;
    expect(retryHeaders['Authorization']).toBe('Bearer a2');
    // store 已写新 tokens
    expect(useAuth.getState().tokens?.accessToken).toBe('a2');
  });

  it('401 → refresh 401 → clear store 并跳转 /login', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauth', { status: 401 }))
      .mockResolvedValueOnce(new Response('refresh failed', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      value: {
        get href() {
          return '';
        },
        set href(v: string) {
          hrefSetter(v);
        },
      },
      configurable: true,
    });

    await expect(apiFetch('/me', { token: 'a1' })).rejects.toThrow();
    expect(useAuth.getState().tokens).toBeNull();
    expect(hrefSetter).toHaveBeenCalledWith('/login');
  });

  it('两个并发 401 只触发一次 /auth/refresh', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh'))
        return json({ accessToken: 'a2', refreshToken: 'r2' });
      // 业务请求第一次 401,第二次(重试)200
      const callsForBiz = fetchMock.mock.calls.filter(
        (c) => !String(c[0]).endsWith('/auth/refresh'),
      ).length;
      if (callsForBiz <= 2) return new Response('u', { status: 401 });
      return json({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      apiFetchRaw('/x', { token: 'a1' }),
      apiFetchRaw('/y', { token: 'a1' }),
    ]);
    const refreshCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).endsWith('/auth/refresh'),
    );
    expect(refreshCalls.length).toBe(1);
  });

  it('refresh 期间 store 被 clear,不写回新 tokens(P3-3)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        // 模拟 refresh 网络延迟期间用户主动登出
        useAuth.getState().clear();
        return json({ accessToken: 'a2', refreshToken: 'r2' });
      }
      return new Response('u', { status: 401 });
    });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      configurable: true,
    });

    await expect(apiFetch('/x', { token: 'a1' })).rejects.toThrow();
    // 关键:tokens 仍为 null,refresh 后没被覆盖
    expect(useAuth.getState().tokens).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试**

```bash
pnpm -F @app/web test api-client
```

预期：6 用例全过。

如果第 5 个 (`并发`) 不稳定，可能是 mock fetch 计数逻辑过于复杂。回退方案：把 mock 改成 mockImplementation，每次明确返回：

```ts
let bizCallCount = 0;
const fetchMock = vi.fn(async (url: string) => {
  if (url.endsWith('/auth/refresh'))
    return json({ accessToken: 'a2', refreshToken: 'r2' });
  bizCallCount++;
  if (bizCallCount <= 2) return new Response('u', { status: 401 });
  return json({ ok: true });
});
```

- [ ] **Step 3: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

预期：0 错。

- [ ] **Step 4: commit**

```bash
git add apps/web/src/lib/__tests__/api-client.test.ts
git commit -m "$(cat <<'EOF'
test(web): 补全 apiFetch refresh 路径单测(P2-3)

新增 4 个 case:401→refresh 200→retry 200、401→refresh 401→
clear+跳 login、并发 401 refresh 去重、clear 后 refresh 不写回。
覆盖 8d52ccc 与 P3-3 fix 的 edge case。
EOF
)"
```

---

## Task 8: /admin/users 实验室 Combobox（修 P1-3）

**Files:**
- Create: `apps/web/src/components/ui/combobox.tsx`
- Modify: `apps/web/src/app/(app)/admin/users/page.tsx`

- [ ] **Step 1: 自封装 Combobox（Popover + Command）**

创建 `apps/web/src/components/ui/combobox.tsx`：

```tsx
'use client';
import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  testId?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = '请选择',
  searchPlaceholder = '搜索...',
  emptyText = '无匹配项',
  disabled,
  className,
  testId,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          data-testid={testId}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className={cn(!current && 'text-muted-foreground')}>
            {current ? current.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onChange?.(opt.value === value ? '' : opt.value);
                    setOpen(false);
                  }}
                  data-testid={testId ? `${testId}-item-${opt.value}` : undefined}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === opt.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: admin/users/page.tsx 改造**

修改 `apps/web/src/app/(app)/admin/users/page.tsx`：

a. 顶部加 import：

```tsx
import { Combobox } from '@/components/ui/combobox';
```

b. `interface UserRow` 之后加 `Lab` 接口与 fetch labs 状态：

```tsx
interface LabRow {
  id: string;
  name: string;
}
```

c. `UsersPage` 函数体内 `useState` 块下加：

```tsx
  const [labs, setLabs] = useState<LabRow[]>([]);

  useEffect(() => {
    if (!token) return;
    apiFetch<LabRow[]>('/labs', { token })
      .then(setLabs)
      .catch(() => {
        // 静默失败,只是少了下拉选项
      });
  }, [token]);

  const labOptions = useMemo(
    () => [
      { value: '', label: '无实验室' },
      ...labs.map((l) => ({ value: l.id, label: l.name })),
    ],
    [labs],
  );
```

d. 把 dialog 内 `labId` FormField 的 Input 改为 Combobox：

```tsx
            <FormField
              control={form.control}
              name="labId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>实验室</FormLabel>
                  <FormControl>
                    <Combobox
                      options={labOptions}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder="选择实验室"
                      searchPlaceholder="搜索实验室..."
                      emptyText="无匹配实验室"
                      testId="admin-users-edit-lab"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
```

- [ ] **Step 3: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

预期：0 错。

- [ ] **Step 4: 单测维持现状**

```bash
pnpm -F @app/web test
```

预期：现有用例（含 Task 2 加的 ExportButton fallback、Task 7 加的 4 个新 api-client 用例）全绿。

- [ ] **Step 5: 手测（可推到 Task 14）**

dev 起来后 → /admin/users → DropdownMenu → 编辑某用户 → 实验室字段是 Combobox，点击展开列表 → 搜索 → 选一项 → 提交 → 表刷新显示新实验室名。

- [ ] **Step 6: commit**

```bash
git add apps/web/src/components/ui/combobox.tsx apps/web/src/app/(app)/admin/users/page.tsx
git commit -m "$(cat <<'EOF'
feat(web/p1-3): /admin/users 编辑实验室改用 Combobox(name/搜索)

新增 components/ui/combobox.tsx(Popover+Command 自封装),admin/users
edit dialog 的实验室字段从裸 Input UUID 替换为 Combobox,从 /labs
拉列表显示 name,空选项"无实验室"。
EOF
)"
```

---

## Task 9: 临时密码 toast 加复制按钮（修 P1-4）

**Files:**
- Modify: `apps/web/src/app/(app)/admin/users/page.tsx`

- [ ] **Step 1: 改写 ConfirmDialog 的 onConfirm**

修改 `apps/web/src/app/(app)/admin/users/page.tsx`，把 `ConfirmDialog` 的 `onConfirm` 内 `toast.success(...)` 替换为带 action 的版本，duration 拉到 60s：

```tsx
        onConfirm={async () => {
          if (!resetting) return;
          try {
            const res = await apiFetch<{ tempPassword: string }>(
              `/users/${resetting.id}/reset-password`,
              { method: 'POST', token },
            );
            const tempPassword = res.tempPassword;
            toast.success(`临时密码:${tempPassword}`, {
              duration: 60_000,
              action: {
                label: '复制',
                onClick: () => {
                  navigator.clipboard.writeText(tempPassword).then(
                    () => toast.success('已复制到剪贴板'),
                    () => toast.error('复制失败'),
                  );
                },
              },
            });
            setResetting(null);
          } catch (e: any) {
            toast.error(e.message ?? '重置失败');
            throw e;
          }
        }}
```

- [ ] **Step 2: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

预期：0 错。

- [ ] **Step 3: 单测全套（确保未破其他）**

```bash
pnpm -F @app/web test
```

预期：全绿。Task 10 会专门覆盖此 toast 行为。

- [ ] **Step 4: commit**

```bash
git add apps/web/src/app/(app)/admin/users/page.tsx
git commit -m "$(cat <<'EOF'
feat(web/p1-4): 临时密码 toast 加复制按钮 + 60s duration

reset-password 后显示的 toast 加 action.label='复制',点击调
navigator.clipboard.writeText,二次 toast 反馈成功/失败。
duration 由 30s 提到 60s 给管理员更多时间。
EOF
)"
```

---

## Task 10: /admin/users 编辑 + 重置密码单测（修 P2-1）

**Files:**
- Create: `apps/web/src/app/(app)/admin/users/__tests__/page.test.tsx`

- [ ] **Step 1: 新建单测文件**

创建 `apps/web/src/app/(app)/admin/users/__tests__/page.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UsersPage from '../page';
import { useAuth } from '@/lib/auth-store';

vi.mock('sonner', () => {
  const fn = vi.fn();
  return {
    toast: { success: fn, error: vi.fn() },
    Toaster: () => null,
  };
});

const mockApiFetch = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
  apiFetchRaw: vi.fn(),
  apiBaseUrl: '/api/v1',
}));

const usersFixture = [
  {
    id: 'u1',
    email: 'alice@lab.local',
    name: 'Alice',
    lab: { id: 'lab-1', name: 'Lab A' },
    labId: 'lab-1',
    roles: [{ role: { code: 'PLAIN_USER' } }],
  },
];
const labsFixture = [
  { id: 'lab-1', name: 'Lab A' },
  { id: 'lab-2', name: 'Lab B' },
];

describe('/admin/users page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'tok', refreshToken: 'r' } as any,
      user: { id: 'admin', email: 'admin@lab.local' } as any,
      hydrated: true,
    });
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/users' && (!opts || opts.method === undefined))
        return usersFixture;
      if (path === '/labs') return labsFixture;
      if (opts?.method === 'PATCH') return {};
      if (opts?.method === 'POST' && path.endsWith('/reset-password'))
        return { tempPassword: 'AbCd1234' };
      throw new Error(`unmocked ${opts?.method ?? 'GET'} ${path}`);
    });
  });

  it('编辑用户 → PATCH 调用 + dialog 关闭 + 表刷新', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<UsersPage />);

    await waitFor(() => screen.getByText('Alice'));

    await user.click(screen.getByTestId('admin-users-row-u1-actions'));
    await user.click(screen.getByTestId('admin-users-row-u1-edit'));

    const nameInput = await screen.findByTestId('admin-users-edit-name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Alice Renamed');

    await user.click(screen.getByRole('button', { name: /保存|提交|确认/ }));

    await waitFor(() => {
      const patchCall = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
      expect(patchCall![0]).toBe('/users/u1');
      expect(patchCall![1].body.name).toBe('Alice Renamed');
    });
  });

  it('重置密码 → POST 调用 + toast 含临时密码', async () => {
    const { toast } = await import('sonner');
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<UsersPage />);

    await waitFor(() => screen.getByText('Alice'));
    await user.click(screen.getByTestId('admin-users-row-u1-actions'));
    await user.click(screen.getByTestId('admin-users-row-u1-reset'));

    await user.click(screen.getByRole('button', { name: /确认重置/ }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/users/u1/reset-password',
        expect.objectContaining({ method: 'POST' }),
      );
      expect((toast.success as any).mock.calls.some((c: any[]) =>
        String(c[0]).includes('AbCd1234'),
      )).toBe(true);
    });
  });

  it('PATCH 失败 → toast.error 且 dialog 不关', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockImplementation(async (path: string, opts?: any) => {
      if (path === '/users' && (!opts || !opts.method)) return usersFixture;
      if (path === '/labs') return labsFixture;
      if (opts?.method === 'PATCH')
        throw new Error('API 422: validation failed');
      throw new Error('unmocked');
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<UsersPage />);
    await waitFor(() => screen.getByText('Alice'));

    await user.click(screen.getByTestId('admin-users-row-u1-actions'));
    await user.click(screen.getByTestId('admin-users-row-u1-edit'));
    await user.click(screen.getByRole('button', { name: /保存|提交|确认/ }));

    await waitFor(() => {
      expect((toast.error as any)).toHaveBeenCalled();
      // dialog 应仍打开 — 找得到 nameInput
      expect(screen.queryByTestId('admin-users-edit-name')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: 跑该单测**

```bash
pnpm -F @app/web test admin/users
```

预期：3 个用例全过。如 `pointerEventsCheck` 仍报 jsdom 错，参考 P8c 备注：使用 `userEvent.setup({ pointerEventsCheck: 0 })`（已用）；如 Combobox 在 jsdom 不弹出，可在测试文件顶部 mock：

```ts
vi.mock('@/components/ui/combobox', () => ({
  Combobox: ({ value, onChange, testId }: any) => (
    <input
      data-testid={testId}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));
```

- [ ] **Step 3: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

预期：0 错。

- [ ] **Step 4: commit**

```bash
git add apps/web/src/app/(app)/admin/users/__tests__/page.test.tsx
git commit -m "$(cat <<'EOF'
test(web/p2-1): /admin/users 编辑 + 重置密码 + PATCH 失败 3 链路单测

mock apiFetch 与 sonner.toast,RTL+userEvent 覆盖:
- 编辑提交触发 PATCH /users/:id,body 含改名后 name
- 重置确认触发 POST .../reset-password,toast.success 含临时密码
- PATCH 失败时 toast.error,dialog 不关
EOF
)"
```

---

## Task 11: api/users e2e 补全 PATCH/DELETE/reset-password（修 P2-2）

**Files:**
- Modify: `apps/api/test/users.e2e-spec.ts`

> 当前文件已有 create / list / 403 三个用例 + Task 4 加的 reset-password tokenVersion 用例。本 task 补 PATCH 与 DELETE 的核心场景。

- [ ] **Step 1: 在 users.e2e-spec.ts 末尾加 PATCH 用例**

```ts
  it('admin patches user name + roles', async () => {
    // 用刚才创建的 bob
    const bob = await prisma.user.findUnique({
      where: { email: 'bob@lab.local' },
    });
    expect(bob).toBeTruthy();
    const r = await request(app.getHttpServer())
      .patch(`/users/${bob!.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bob Renamed', roles: ['LAB_HEAD'] });
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('Bob Renamed');

    const fresh = await prisma.user.findUnique({
      where: { id: bob!.id },
      include: { roles: { include: { role: true } } },
    });
    expect(fresh!.roles.map((ur) => ur.role.code)).toEqual(['LAB_HEAD']);
  });

  it('admin patches non-existent user → 404', async () => {
    const r = await request(app.getHttpServer())
      .patch('/users/non-existent-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'X' });
    expect(r.status).toBe(404);
  });

  it('admin deletes(soft) user', async () => {
    const r = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'erin@lab.local',
        name: 'Erin',
        password: 'pass1234',
        roles: ['PLAIN_USER'],
      });
    expect(r.status).toBe(201);
    const erinId = r.body.id;

    const del = await request(app.getHttpServer())
      .delete(`/users/${erinId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);

    const erin = await prisma.user.findUnique({ where: { id: erinId } });
    expect(erin?.deletedAt).not.toBeNull();

    // list 不应再包含 erin
    const list = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.find((u: any) => u.id === erinId)).toBeUndefined();

    // 清理
    await prisma.userRole.deleteMany({ where: { userId: erinId } });
    await prisma.user.delete({ where: { id: erinId } });
  });

  it('admin resets password 返回 8 位字符串', async () => {
    const bob = await prisma.user.findUnique({
      where: { email: 'bob@lab.local' },
    });
    const r = await request(app.getHttpServer())
      .post(`/users/${bob!.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.tempPassword).toMatch(/^[A-Za-z]{4}[0-9]{4}$/);
  });

  it('reset-password 不存在用户 → 404', async () => {
    const r = await request(app.getHttpServer())
      .post('/users/non-existent-id/reset-password')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(404);
  });
```

- [ ] **Step 2: 跑 users.e2e-spec**

```bash
pnpm -F @app/api exec jest --config test/jest-e2e.json --testPathPattern users
```

预期：原有 3 + Task 4 加的 1 + 本 task 5 = 9 用例全绿。

- [ ] **Step 3: 跑全套 e2e（确保未破其他）**

```bash
pnpm -F @app/api exec jest --config test/jest-e2e.json
```

预期：全绿。注意 PATCH 与 DELETE 用例依赖 beforeAll 创建的 bob，跑完不删 bob 由 afterAll 清理（参考文件原有清理逻辑）。

- [ ] **Step 4: commit**

```bash
git add apps/api/test/users.e2e-spec.ts
git commit -m "$(cat <<'EOF'
test(api/p2-2): users e2e 补 PATCH/DELETE/reset-password 5 用例

补全 P8c 加的 reset-password endpoint 与 update/softDelete
的 e2e 覆盖:patch name+roles、patch 不存在 404、softDelete
list 排除、reset-password 8 位格式、reset-password 不存在 404。
EOF
)"
```

---

## Task 12: TanStack Query v5 试点（修 P1-2）

> **风险提示：** 本 task 改 7+ 文件、增 1 依赖、影响 First Load JS（预估 +13 kB gz）。如果 build size 超 P8b/P8c 基线 87.3 kB 太多（>120 kB）应回滚或缩小试点范围。建议在 worktree 上跑：
> ```bash
> git worktree add -b tech-debt/p1-2-tanstack ../tanstack-trial
> cd ../tanstack-trial
> ```

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/lib/use-api-query.ts`
- Modify: `apps/web/src/app/(app)/layout.tsx`
- Modify: `apps/web/src/app/(app)/reports/usage-trend/page.tsx`
- Modify: `apps/web/src/app/(app)/reports/inventory-turnover/page.tsx`
- Modify: `apps/web/src/app/(app)/reports/purchase-amount/page.tsx`
- Modify: `apps/web/src/app/(app)/reports/controlled-audit/page.tsx`
- Modify: `apps/web/src/app/(app)/admin/users/page.tsx`
- Delete: `apps/web/src/components/reports/useReportData.ts`

- [ ] **Step 1: 安装 @tanstack/react-query**

```bash
pnpm -F @app/web add @tanstack/react-query@^5
```

预期：package.json + lockfile 更新。

- [ ] **Step 2: 写 useApiQuery 适配器**

创建 `apps/web/src/lib/use-api-query.ts`：

```ts
'use client';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiFetch } from './api-client';
import { useAuth } from './auth-store';

export interface UseApiQueryOptions<T> {
  /** 显式 key 段。默认 [path, params]。 */
  queryKey?: readonly unknown[];
  /** query string params。null/undefined/'' 自动跳过。 */
  params?: Record<string, string | number | undefined | null>;
  enabled?: boolean;
  staleTime?: number;
  retry?: UseQueryOptions<T>['retry'];
}

function buildPath(path: string, params?: UseApiQueryOptions<any>['params']) {
  if (!params) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/**
 * 默认 staleTime 30s,retry 1。401→refresh 已由 apiFetch 处理。
 * 调用方:const { data, isLoading, error } = useApiQuery<T>('/foo', { params })
 */
export function useApiQuery<T>(
  path: string,
  opts: UseApiQueryOptions<T> = {},
) {
  const token = useAuth((s) => s.tokens?.accessToken);
  const fullPath = buildPath(path, opts.params);
  return useQuery<T>({
    queryKey: opts.queryKey ?? [path, opts.params],
    enabled: !!token && (opts.enabled ?? true),
    staleTime: opts.staleTime ?? 30_000,
    retry: opts.retry ?? 1,
    queryFn: () => apiFetch<T>(fullPath, { token }),
  });
}
```

- [ ] **Step 3: (app)/layout.tsx 包 QueryClientProvider**

修改 `apps/web/src/app/(app)/layout.tsx`：在文件顶部加 imports + 用 QueryClientProvider 包裹 children。

参考 patch（注意 Provider 必须 'use client'）：

```tsx
'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// ...原有 imports

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      {/* 原有 layout 内容 */}
    </QueryClientProvider>
  );
}
```

> ⚠️ 该文件原可能不是 'use client'，且包含 server-side 逻辑。**改前先读全文**：

```bash
cat apps/web/src/app/\(app\)/layout.tsx
```

如果原 layout 是 server component（无 'use client'），新增一个 client wrapper：
- 创建 `apps/web/src/app/(app)/QueryProvider.tsx`（'use client'，含 useState + QueryClient + 返回 `<QueryClientProvider>{children}</QueryClientProvider>`）
- 在 `(app)/layout.tsx` 里 `<QueryProvider>{children}</QueryProvider>` 包一层

请按实际情况选其一。

- [ ] **Step 4: 改造 4 reports/* 页**

每页核心改动：删除 `useState(loading/error/data)` + `useEffect`，改 `const { data, isLoading, error } = useApiQuery<T>(path, { params: { range, startDate, endDate, groupBy } })`。

**`reports/usage-trend/page.tsx`**：把第 12 行 `import { useReportData }` 改为 `import { useApiQuery } from '@/lib/use-api-query';`，把：

```tsx
  const { data, loading, error } = useReportData<UsageTrendResponse>(
    '/reports/usage-trend',
    { range, startDate, endDate, groupBy },
  );
```

改为：

```tsx
  const { data, isLoading: loading, error: queryError } = useApiQuery<UsageTrendResponse>(
    '/reports/usage-trend',
    { params: { range, startDate, endDate, groupBy } },
  );
  const error = queryError ? (queryError as Error).message : null;
```

其他 3 页相同模式：

**`reports/inventory-turnover/page.tsx`** —— 改 `import` + 改钩子调用，参数用 `{ params: { range, startDate, endDate } }`（只有这 3 个）。

**`reports/purchase-amount/page.tsx`** —— `{ params: { range, startDate, endDate, groupBy } }`。

**`reports/controlled-audit/page.tsx`** —— `{ params: { range, startDate, endDate } }`。

> 在改这 4 页前，**逐一 cat 看实际参数**：

```bash
grep -A1 "useReportData<" apps/web/src/app/\(app\)/reports/*/page.tsx
```

按实际 params 调用 `useApiQuery`。

- [ ] **Step 5: 改造 admin/users/page.tsx**

把 `useState<UserRow[]>` + `refresh` callback + `useEffect(refresh)` 删掉，换成 `useQueryClient` + `useApiQuery`：

a. 顶部加 import：

```tsx
import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from '@/lib/use-api-query';
```

b. 函数体内删 `const [data, setData] = ...`、`const [loading, setLoading] = ...`、`refresh` callback、`useEffect(() => refresh())`，替换为：

```tsx
  const qc = useQueryClient();
  const usersQuery = useApiQuery<UserRow[]>('/users', { queryKey: ['users'] });
  const data = usersQuery.data ?? [];
  const loading = usersQuery.isLoading;
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });
```

`labs` 也切到 useApiQuery：

```tsx
  const labsQuery = useApiQuery<LabRow[]>('/labs', { queryKey: ['labs'] });
  const labs = labsQuery.data ?? [];
```

提交后调用 `await refresh()` 仍正常（invalidate 后 useApiQuery 会自动重抓）。

c. 把原 `try { setData(d) } catch(e) { toast.error(e.message ?? '加载失败') }` 的错误处理移交给 query：

```tsx
  useEffect(() => {
    if (usersQuery.error) {
      toast.error((usersQuery.error as Error).message ?? '加载失败');
    }
  }, [usersQuery.error]);
```

- [ ] **Step 6: 删除 useReportData.ts**

```bash
rm apps/web/src/components/reports/useReportData.ts
grep -rn "useReportData" apps/web/src/
```

预期：grep 无结果。如还有引用，按 step 4 模式逐一替换。

- [ ] **Step 7: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

预期：0 错。

- [ ] **Step 8: 跑全套单测**

```bash
pnpm -F @app/web test
```

预期：全绿。Task 10 的 admin/users 单测可能需要补 mock —— TanStack Query 在测试环境需要 QueryClientProvider wrap：

更新 `apps/web/src/app/(app)/admin/users/__tests__/page.test.tsx` 顶部加 helper：

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>,
  );
}
```

把 `render(<UsersPage />)` 全改为 `renderWithQuery(<UsersPage />)`。

- [ ] **Step 9: build 与 bundle 评估**

```bash
rm -rf apps/web/.next
pnpm -F @app/web build
```

预期：22 routes OK；末尾 First Load JS shared 行 ≤ 105 kB（基线 87.3 kB + 13 kB gz @tanstack/react-query + 3 kB 容差 = 105 kB）。

如超 110 kB：
- 检查是否未启用 tree-shake：确认 import 用 named import（`import { useQuery }`）而非 default
- 考虑动态 import QueryDevtools（默认不引）
- 极端情况回滚仅保留 reports/* 试点，admin/users 改回 useState

- [ ] **Step 10: 手测（dev）**

```bash
pnpm -F @app/web dev
```

逐项核对：
- [ ] /reports/usage-trend：切换 preset / groupBy 数据立即更新；DevTools Network 看缓存：30s 内重复切换不再发请求
- [ ] /reports/inventory-turnover：同上
- [ ] /reports/purchase-amount：同上
- [ ] /reports/controlled-audit：同上
- [ ] /admin/users：编辑提交后 invalidateQueries 自动刷新表

- [ ] **Step 11: commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/src/lib/use-api-query.ts apps/web/src/app/\(app\)/layout.tsx apps/web/src/app/\(app\)/QueryProvider.tsx apps/web/src/app/\(app\)/reports apps/web/src/app/\(app\)/admin/users apps/web/src/components/reports
git commit -m "$(cat <<'EOF'
feat(web/p1-2): TanStack Query v5 试点改造 reports/* + admin/users

新增 lib/use-api-query.ts 适配器(默认 staleTime 30s + retry 1);
(app)/layout 包 QueryClientProvider;改造 4 reports 页 + admin/users
切到 useApiQuery,删除 components/reports/useReportData.ts。

bundle 影响: shared 87.3 kB → ~100 kB(@tanstack/react-query +13 kB gz)。
EOF
)"
```

---

## Task 13: 升级 @testing-library/react v14 → v15（修 P3-1）

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: 升级**

```bash
pnpm -F @app/web up @testing-library/react -L
```

预期：14.2.2 → 15.x。

- [ ] **Step 2: 跑全套单测**

```bash
pnpm -F @app/web test 2>&1 | head -80
```

预期：用例数与 Task 12 之后持平（≥ 56），无 `ReactDOMTestUtils.act is deprecated` warning。

如果 v15 引入了破坏性变更（理论上 RTL v15 仅删 `act` 兼容性），常见症状：
- 某测试中 `await waitFor(...)` 行为变更：通常不需改
- 某测试找不到元素：检查 v15 的 `getByRole` 是否更严格，参考 [migration guide](https://github.com/testing-library/react-testing-library/releases/tag/v15.0.0)

- [ ] **Step 3: typecheck**

```bash
pnpm -F @app/web exec tsc --noEmit
```

预期：0 错。

- [ ] **Step 4: commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore(web/p3-1): bump @testing-library/react v14 → v15

v15 不再依赖 ReactDOMTestUtils.act,消除 vitest 输出每个测试
打印的 deprecation warning。
EOF
)"
```

---

## Task 14: 验收

**Files:** 无文件修改；纯运行验收命令。

- [ ] **Step 1: typecheck 双端**

```bash
pnpm -F @app/web exec tsc --noEmit
pnpm -F @app/api exec tsc --noEmit
```

预期：两边 0 错。

- [ ] **Step 2: 单测 web**

```bash
pnpm -F @app/web test
```

预期：≥ 56 用例全绿（基线 P8c 48 + Task 2 ExportButton fallback 1 + Task 7 api-client 4 + Task 10 admin/users 3 = 56；其他 task 未加单测）。

- [ ] **Step 3: e2e api**

```bash
pnpm -F @app/api exec jest --config test/jest-e2e.json
```

预期：全绿。注意 Task 3/4 加的 auth rotation + tokenVersion 用例 + Task 11 加的 5 个 users 用例都在内。

- [ ] **Step 4: build**

```bash
rm -rf apps/web/.next
pnpm -F @app/web build
```

预期：22 routes 全 OK；末尾 First Load JS shared 行 ≤ 105 kB（基线 87.3 + TanStack 13 + 容差 5 ≈ 105；若超 110 kB 见 Task 12 step 9 回滚预案）。

- [ ] **Step 5: docker / dev 手测核心场景**

启 dev：

```bash
pnpm -F @app/api dev
pnpm -F @app/web dev
```

按以下清单逐项核对：

**导出 + token rotation（Task 1, 2, 3）：**
- [ ] 设 `JWT_ACCESS_TTL=30s`, `JWT_REFRESH_TTL=2m`，登录 → 等 30s → /reports/usage-trend 点导出 CSV → DevTools 应看到 401 → /auth/refresh 200 → 重试 200 → 文件下载，文件名形如 `usage-trend-20260510.csv`
- [ ] 同一个浏览器 Tab 等到 access 第二次过期 → 再点导出 → 应再次 refresh 成功（rotation 后新 refresh 仍可用）
- [ ] DevTools Application → localStorage 拷出旧 refresh token → 切到无痕窗口手敲 `curl -X POST .../auth/refresh -d '{"refreshToken":"<旧>"}'` → 应 401（rotation 已让其失效）

**tokenVersion 立即失效（Task 4）：**
- [ ] admin 登录 user A → A 拿 access token X；admin 在 /admin/users 重置 A 密码 → A 浏览器内任意操作（如 /reagents）应立即 401 跳 login

**clear 抑制 inflight（Task 5）：**
- [ ] 难以手测，由 Task 7 的"refresh 期间 store 被 clear"单测覆盖

**timeout（Task 6）：**
- [ ] 后端故意 sleep（在某 controller 加 `await new Promise(r => setTimeout(r, 35_000))`）→ 前端 35s 后应 throw（toast.error）；恢复后端代码

**/admin/users UX（Task 8, 9）：**
- [ ] 编辑 dialog → 实验室 Combobox 展开 → 搜索"Lab" → 选一项 → 提交 → 表 cell 改为新名字
- [ ] 重置密码 → toast 显示临时密码 60s + 复制按钮 → 点复制 → 二次 toast"已复制"; 粘贴到任意输入框验证

**TanStack Query 缓存（Task 12）：**
- [ ] /reports/usage-trend → 切到 /reports/inventory-turnover → 30s 内切回 → DevTools Network 应**不**再请求 usage-trend；超过 30s 切回应重新请求

- [ ] **Step 6: commit history 整理**

```bash
git log 8d52ccc..HEAD --oneline
```

预期：13 个 commit（按 task 切；Task 5 单独 commit；Task 12 一个 commit）：

```
<hash> chore(web/p3-1): bump @testing-library/react v14 → v15
<hash> feat(web/p1-2): TanStack Query v5 试点改造 ...
<hash> test(api/p2-2): users e2e 补 PATCH/DELETE/reset-password 5 用例
<hash> test(web/p2-1): /admin/users 编辑 + 重置密码 ...
<hash> feat(web/p1-4): 临时密码 toast 加复制按钮 ...
<hash> feat(web/p1-3): /admin/users 编辑实验室改用 Combobox ...
<hash> test(web): 补全 apiFetch refresh 路径单测(P2-3)
<hash> feat(web): apiFetchRaw 支持 signal + 30s 默认 timeout(P1-1)
<hash> fix(web): tryRefresh 写 setTokens 前校验当前会话 ... (P3-3)
<hash> feat(api): tokenVersion 让 reset-password ... (P0-3)
<hash> feat(api): refresh token rotation via jti(P0-2)
<hash> feat(web): export fallback 文件名用 endpoint slug ... (P3-2)
<hash> fix(web): ExportButton 走 apiFetchRaw ... (P0-1)
```

- [ ] **Step 7: 写 memory**

写 `C:\Users\songyihui\.claude\projects\D--Project-0417-any-demo\memory\project_techdebt_status.md`：

```markdown
---
name: tech-debt-cleanup 完成
description: 2026-05-10 backlog 13 项全部落地;HEAD/build/单测/e2e 数字快照
type: project
---

P8c 后 backlog(spec: docs/superpowers/specs/2026-05-10-tech-debt-backlog-design.md)
13 项全部完成。

**HEAD:** <commit-hash>(从 8d52ccc 起 13 个 commit)
**vitest web:** ≥ 56 全绿
**jest e2e api:** 全绿(含 auth rotation + tokenVersion 新增 spec + users patch/delete/reset)
**tsc:** web/api 双端 0 错
**build:** 22 routes,shared ~100 kB(基线 87.3 + TanStack +13 = 100)

**核心交付:**
- ExportButton 接 apiFetchRaw → token 过期可自动 refresh
- refresh token rotation(jti) + tokenVersion(立即失效) 双层 auth 加固
- apiFetch 加 30s timeout + signal 透传
- /admin/users 实验室 Combobox + 临时密码复制按钮 + 单测
- TanStack Query v5 试点(reports/* + admin/users)
- @testing-library/react v15 升级
```

更新 `MEMORY.md` 索引加一行指向新 status 文件。

- [ ] **Step 8: 总结输出**

输出给用户：

```
tech-debt-backlog 13 项工程验收完成:
- vitest web ≥ 56 全绿
- jest e2e api 全绿(auth rotation / tokenVersion / users 5 项 e2e 新增)
- tsc 双端 0 错
- next build 22 routes OK,shared ~100 kB(基线 87.3 + TanStack v5 +13)
- 13 commit 按主题分组:导出统一 / auth 收尾 / api-client 稳健 / admin/users UX / 测试补全 / 数据层 / 环境清理
- 是否打 tag tech-debt-cleanup-complete 由用户决定
```

---

## 备注与陷阱

### prisma migrate dev 在 Windows + dev DB 模式

如果 `pnpm -F @app/api exec prisma migrate dev --name xxx` 提示连不上 DB：
- 确认 `apps/api/.env` 或 `.env.local` 有 `DATABASE_URL=postgresql://...`
- 跑 `pnpm db:up`（如有）或 `docker compose up -d postgres`
- 重试

migration 跑完 prisma client 自动 regen；如果手动改了 schema 但 migrate 还没跑，先跑 `pnpm -F @app/api exec prisma generate` 让 IDE TS 不报错。

### JwtStrategy 异步 validate 与 PrismaModule 全局化

Task 4 把 JwtStrategy.validate 从同步改异步并注入 PrismaService。如果 NestJS 启动报"Nest can't resolve dependencies of JwtStrategy (?, +)"，说明 PrismaService 没在 JwtStrategy 所在 module（app.module）的 providers 范围。最干净的做法是给 PrismaModule 标 `@Global()`，让所有 module 直接拿 PrismaService 不需 imports。

### AbortSignal.any 在 jsdom

Vitest 默认 jsdom 环境对 `AbortSignal.any` 支持取决于 Node 版本。Node 20+ 原生支持。如果跑测试时报 `AbortSignal.any is not a function`，可在 `apps/web/vitest.config.ts` 的 setupFiles 加 polyfill 或换用 `AbortController` 手工合并。多数情况下不会触发 — 因为单测 fetch 立即 resolve，timeout 不参与执行路径。

### TanStack Query 与 SSR

Next 14 App Router 下，`(app)/layout.tsx` 如果是 server component，`<QueryClientProvider>` 需要包在 client wrapper 里（参考 Task 12 step 3 的 fallback 方案）。永远不要在 server component 里 `new QueryClient()` —— 每次 render 会创建新实例污染状态。用 `useState(() => new QueryClient(...))` 保证 client 端单例。

### TanStack Query bundle 影响

`@tanstack/react-query` v5 体积约 13 kB gz。如果安装后 First Load JS shared 超过 110 kB（P8b/P8c 基线 87.3 kB），先确认没误装 `@tanstack/react-query-devtools`（生产 build 不应含）。Devtools 只在 dev 用：

```tsx
{process.env.NODE_ENV === 'development' && (
  <ReactQueryDevtools initialIsOpen={false} />
)}
```

如果仍超，回滚仅保留 reports/* 4 页试点，admin/users 改回原裸 apiFetch。

### shadcn Combobox 在 jsdom 不弹出

Task 10 单测中如果 Combobox 不展开，参考 P8c 备注：使用 `userEvent.setup({ pointerEventsCheck: 0 })` 或直接 mock Combobox 为简单 input（见 Task 10 step 2 的 fallback 代码）。

### ExportButton 单测 URL.createObjectURL

参考 P8c 备注，jsdom 不实现 `URL.createObjectURL`，单测里手动注入：

```ts
(URL as any).createObjectURL = vi.fn(() => 'blob:mock');
(URL as any).revokeObjectURL = vi.fn();
```

### sonner toast mock

```ts
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
  Toaster: () => null,
}));
```

如果 toast 带 `action` 选项的复制按钮要在单测点击，可在 mock 里捕获 action 参数：

```ts
const successCalls: any[] = [];
vi.mock('sonner', () => ({
  toast: {
    success: (msg: string, opts?: any) => successCalls.push({ msg, opts }),
    error: vi.fn(),
  },
  Toaster: () => null,
}));
// 测试中:successCalls[0].opts.action.onClick()
```

### git worktree

Task 12 风险大，建议在 worktree 上单独尝试，验证 build size 后再 merge 到 master。命令：

```bash
git worktree add -b tech-debt/p1-2-tanstack ../tanstack-trial
cd ../tanstack-trial
# 跑 task 12 step 1-10
# 验证 OK 后:
git push -u origin tech-debt/p1-2-tanstack
# 在 master 上 merge
```

---

## 不在本 plan 范围

- docker e2e 复测：用户本机环境验证步骤
- 视觉走查：本 plan 由开发完成，仅含 dev 手测；可选打 tag 后跟 P8c 一样让用户跑 docker e2e
- e2e 在 CI 跑：需要更大架构决策，不属"小优化"
- 国际化、暗色主题完整性：未列入需求
- 报表 KPI delta% / trend 数据源、ChartCard 抽象：P8c 之外的功能扩展

---

## 与 backlog spec 的覆盖对照

| Backlog 项 | Plan Task | Files | 备注 |
|---|---|---|---|
| P0-1 ExportButton apiFetch | Task 1 | api-client.ts, ExportButton.tsx | 抽 apiFetchRaw |
| P0-2 refresh rotation | Task 3 | schema, auth.service, auth.e2e | jti 字段 + 校验 |
| P0-3 reset 立即失效 | Task 4 | schema, auth.service, jwt.strategy, users.service, users.e2e | tokenVersion |
| P1-1 timeout/abort | Task 6 | api-client.ts | AbortSignal.any |
| P1-2 TanStack Query | Task 12 | use-api-query.ts, layout, 5 page, useReportData | 试点 |
| P1-3 实验室 Combobox | Task 8 | combobox.tsx, admin/users page | Popover+Command |
| P1-4 临时密码复制 | Task 9 | admin/users page | 60s + action |
| P2-1 /admin/users 单测 | Task 10 | admin/users __tests__ | 3 case |
| P2-2 users.controller e2e | Task 11 | users.e2e-spec | 补 5 case |
| P2-3 apiFetch refresh 单测 | Task 7 | __tests__/api-client | 补 4 case |
| P3-1 RTL v15 | Task 13 | package.json | bump |
| P3-2 导出文件名 fallback | Task 2 | ExportButton.tsx | slug-date.format |
| P3-3 clear 抑制 inflight | Task 5 | api-client.ts | check tokens |

13 项一一覆盖，无遗漏。
