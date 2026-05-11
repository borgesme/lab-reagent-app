# 统一响应包装 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 NestJS `/api/v1/*` 全路由上引入 `{ code, msg, data }` 统一响应包装，业务错误一律 HTTP 200 + code 区分；前端 (web/miniapp) 同步解包；测试全量适配。

**Architecture:** 服务端 = 全局 `ResponseInterceptor`（map data → wrapper） + 全局 `HttpExceptionFilter`（HttpException → HTTP 200 + 错误码 body）；客户端 = `apiFetch` 解包 `data`、`apiFetchRaw` `clone().json()` peek 判 401 触发 refresh；下载接口 `StreamableFile` / `Buffer` / `string` / 含 `Content-Disposition` 头自动豁免。

**Tech Stack:** NestJS 10 / RxJS / Jest + supertest / Next.js / vitest / Taro

参考 spec: `docs/superpowers/specs/2026-05-11-unified-response-wrapper-design.md`

---

### Task 1: shared `ApiResponse<T>` 类型 + e2e 辅助 `expectOk`

**Files:**
- Modify: `packages/shared/src/api-types.ts`
- Create: `apps/api/test/helpers/expect-ok.ts`

- [ ] **Step 1: 在 shared 加 `ApiResponse<T>` 类型**

Modify `packages/shared/src/api-types.ts` (在文件末尾追加):

```ts
export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T | null;
}
```

- [ ] **Step 2: 创建 e2e 辅助**

Create `apps/api/test/helpers/expect-ok.ts`:

```ts
import type { Response as SupertestResponse } from 'supertest';

type Matcher<T> = Partial<T> | ((data: T) => void);

export function expectOk<T = any>(
  res: SupertestResponse,
  matcher?: Matcher<T>,
): T {
  expect(res.status).toBe(200);
  expect(res.body.code).toBe(200);
  expect(res.body.msg).toBeDefined();
  if (matcher !== undefined) {
    if (typeof matcher === 'function') {
      (matcher as (d: T) => void)(res.body.data as T);
    } else {
      expect(res.body.data).toMatchObject(matcher as object);
    }
  }
  return res.body.data as T;
}

export function expectBizError(
  res: SupertestResponse,
  code: number,
  msgMatch?: string | RegExp,
): void {
  expect(res.status).toBe(200);
  expect(res.body.code).toBe(code);
  expect(res.body.data).toBeNull();
  if (msgMatch !== undefined) {
    if (typeof msgMatch === 'string') expect(res.body.msg).toContain(msgMatch);
    else expect(res.body.msg).toMatch(msgMatch);
  }
}
```

- [ ] **Step 3: 构建 shared 包验证类型可被 api 导入**

Run: `pnpm --filter @app/shared build`
Expected: `Build complete`，无 tsc 错。

- [ ] **Step 4: 提交**

```bash
git add packages/shared/src/api-types.ts apps/api/test/helpers/expect-ok.ts
git commit -m "feat(shared): add ApiResponse<T> + e2e expectOk helper"
```

---

### Task 2: `@ResponseMsg` 装饰器

**Files:**
- Create: `apps/api/src/common/decorators/response-msg.decorator.ts`

- [ ] **Step 1: 实现装饰器（无独立单元测试，T3 间接验证）**

Create `apps/api/src/common/decorators/response-msg.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MSG_KEY = 'response:msg';
export const ResponseMsg = (msg: string) => SetMetadata(RESPONSE_MSG_KEY, msg);
```

- [ ] **Step 2: 验证 tsc 不报错**

Run: `pnpm --filter @app/api typecheck` 
Expected: 0 error.

- [ ] **Step 3: 提交**

```bash
git add apps/api/src/common/decorators/response-msg.decorator.ts
git commit -m "feat(api): add @ResponseMsg decorator"
```

---

### Task 3: `ResponseInterceptor` + dedicated e2e

**Files:**
- Create: `apps/api/src/common/interceptors/response.interceptor.ts`
- Create: `apps/api/test/response-wrapper.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: 写 failing e2e — health 端点应返回包装格式**

Create `apps/api/test/response-wrapper.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { expectOk } from './helpers/expect-ok';

describe('Response wrapper (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health 返回 {code:200, msg, data:{...}}', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expectOk(res, (data: any) => {
      expect(data).toHaveProperty('status');
    });
  });
});
```

- [ ] **Step 2: 跑 → 应该失败（现在 /health 直接返回裸对象）**

Run: `pnpm --filter @app/api test:e2e -- response-wrapper`
Expected: FAIL，`res.body.code` 为 `undefined`。

- [ ] **Step 3: 实现 ResponseInterceptor**

Create `apps/api/src/common/interceptors/response.interceptor.ts`:

```ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import { RESPONSE_MSG_KEY } from '../decorators/response-msg.decorator';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const msg =
      this.reflector.get<string>(RESPONSE_MSG_KEY, ctx.getHandler()) ?? 'ok';
    const res = ctx.switchToHttp().getResponse();

    return next.handle().pipe(
      map((data) => {
        // 自动豁免：文件下载/原始内容透传
        if (data instanceof StreamableFile) return data;
        if (Buffer.isBuffer(data)) return data;
        if (typeof data === 'string') return data;
        if (res.getHeader && res.getHeader('content-disposition')) return data;
        return { code: 200, msg, data: data ?? null };
      }),
    );
  }
}
```

- [ ] **Step 4: 在 app.module.ts 注册 ResponseInterceptor（放在 Audit 前面）**

Modify `apps/api/src/app.module.ts` providers 段：

```ts
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

// 在 providers 数组里，AuditInterceptor 之前：
providers: [
  JwtStrategy,
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
  { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor }, // ← 外层
  { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },     // ← 内层
],
```

**关键**: ResponseInterceptor 必须在 AuditInterceptor **之前**注册。NestJS APP_INTERCEPTOR 的执行顺序：先注册 = 外层。外层 map 后置；内层 tap 先于外层 map 执行 → Audit 看到的是 raw data ✓。

- [ ] **Step 5: 跑 response-wrapper e2e → 应该通过**

Run: `pnpm --filter @app/api test:e2e -- response-wrapper`
Expected: PASS。

- [ ] **Step 6: 跑 audit e2e 确认未受影响**

Run: `pnpm --filter @app/api test:e2e -- audit`
Expected: 仍 PASS（Audit 后置但仍能拿到 entityId）。

- [ ] **Step 7: 提交**

```bash
git add apps/api/src/common/interceptors/response.interceptor.ts \
        apps/api/src/app.module.ts \
        apps/api/test/response-wrapper.e2e-spec.ts
git commit -m "feat(api): add ResponseInterceptor wrapping responses as {code,msg,data}"
```

---

### Task 4: `HttpExceptionFilter`

**Files:**
- Create: `apps/api/src/common/filters/http-exception.filter.ts`
- Modify: `apps/api/test/response-wrapper.e2e-spec.ts` (追加错误用例)
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: 在 response-wrapper.e2e-spec.ts 追加 failing 测试用例**

在 `apps/api/test/response-wrapper.e2e-spec.ts` 中追加（`afterAll` 之前）:

```ts
  it('错误未登录请求 → HTTP 200 + code:401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(401);
    expect(res.body.data).toBeNull();
  });

  it('class-validator 失败 → HTTP 200 + code:400 + msg 拼接', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'not-email', password: '' });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(400);
    expect(typeof res.body.msg).toBe('string');
    expect(res.body.msg.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: 跑 → 应该失败（HTTP 还是 401/400）**

Run: `pnpm --filter @app/api test:e2e -- response-wrapper`
Expected: FAIL，新两个 case `res.status` 不是 200。

- [ ] **Step 3: 实现 HttpExceptionFilter**

Create `apps/api/src/common/filters/http-exception.filter.ts`:

```ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const r = exception.getResponse();
      let msg: string;
      if (typeof r === 'string') {
        msg = r;
      } else if (r && typeof r === 'object') {
        const m = (r as any).message;
        msg = Array.isArray(m) ? m.join('; ') : String(m ?? exception.message);
      } else {
        msg = exception.message;
      }
      return res.status(200).json({ code: status, msg, data: null });
    }

    this.logger.error(exception);
    return res
      .status(200)
      .json({ code: 500, msg: 'internal error', data: null });
  }
}
```

- [ ] **Step 4: 在 main.ts 注册 filter**

Modify `apps/api/src/main.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: true, credentials: true });
  await app.listen(3001);
}
bootstrap();
```

同时把 filter 也在 `response-wrapper.e2e-spec.ts` 的 `beforeAll` 里挂上（要复刻 main.ts 启动配置）：

```ts
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

// beforeAll 中，紧跟 useGlobalPipes 之后：
app.useGlobalFilters(new HttpExceptionFilter());
```

- [ ] **Step 5: 跑 response-wrapper e2e → 应该全部通过**

Run: `pnpm --filter @app/api test:e2e -- response-wrapper`
Expected: 3 个 case 全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/common/filters/http-exception.filter.ts \
        apps/api/src/main.ts \
        apps/api/test/response-wrapper.e2e-spec.ts
git commit -m "feat(api): add HttpExceptionFilter -> HTTP 200 + code/msg body"
```

---

### Task 5: 改造 api e2e batch 1（auth / users / health / labs / notifications / alerts）

**注意：** 此时其他所有 e2e 文件都会因为响应形态改变而失败。本任务只处理 6 个 spec 文件。剩下的在 T6/T7 处理。每个 spec 文件在 `beforeAll` 中也需要挂 `HttpExceptionFilter`。

**Files (Modify):**
- `apps/api/test/auth.e2e-spec.ts`
- `apps/api/test/users.e2e-spec.ts`
- `apps/api/test/health.e2e-spec.ts`
- `apps/api/test/labs.e2e-spec.ts`
- `apps/api/test/notifications.e2e-spec.ts`
- `apps/api/test/alerts.e2e-spec.ts`

- [ ] **Step 1: 跑这 6 个 spec 文件，确认现状失败**

Run: `pnpm --filter @app/api test:e2e -- auth users health labs notifications alerts`
Expected: FAIL（响应形态不匹配）。

- [ ] **Step 2: 在每个 spec 的 app 启动处挂 filter**

每个 spec 文件在 `app.useGlobalPipes(...)` 之后追加：

```ts
app.useGlobalFilters(new HttpExceptionFilter());
```

并加 import:

```ts
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
```

- [ ] **Step 3: 改造断言为 `expectOk` / `expectBizError` 形态**

机械替换规则：
- `expect(res.body).toMatchObject({...})` → `expectOk(res, {...})`
- `expect(res.body).toEqual({...})` → 需先 `const data = expectOk(res)`，再 `expect(data).toEqual({...})`
- `expect(res.body.X)` → `expect(res.body.data.X)`
- `expect(res.status).toBe(400)` / `.expect(400)` → `expectBizError(res, 400, /optional msg/)`，并把 supertest 链式 `.expect(400)` 改为 `.expect(200)`（HTTP 一律 200）
- 401/403 同上：HTTP 200 + biz code

每个 spec 头部加 import:

```ts
import { expectOk, expectBizError } from './helpers/expect-ok';
```

- [ ] **Step 4: 跑这 6 个 spec → 应该全 PASS**

Run: `pnpm --filter @app/api test:e2e -- auth users health labs notifications alerts`
Expected: 全 PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/test/auth.e2e-spec.ts apps/api/test/users.e2e-spec.ts \
        apps/api/test/health.e2e-spec.ts apps/api/test/labs.e2e-spec.ts \
        apps/api/test/notifications.e2e-spec.ts apps/api/test/alerts.e2e-spec.ts
git commit -m "test(api): adapt batch 1 e2e (auth/users/health/labs/notifications/alerts) to wrapped response"
```

---

### Task 6: 改造 api e2e batch 2（reagents / stocks / ledger / purchases）

**Files (Modify):**
- `apps/api/test/reagents.e2e-spec.ts`
- `apps/api/test/stocks.e2e-spec.ts`
- `apps/api/test/ledger.e2e-spec.ts`
- `apps/api/test/purchases.e2e-spec.ts`

- [ ] **Step 1: 在每个 spec 挂 HttpExceptionFilter**

每个 spec 文件在 `app.useGlobalPipes(...)` 之后追加：

```ts
app.useGlobalFilters(new HttpExceptionFilter());
```

并加 import:

```ts
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
```

- [ ] **Step 2: 机械替换断言**

规则：
- `expect(res.body).toMatchObject({...})` → `expectOk(res, {...})`
- `expect(res.body).toEqual({...})` → `const data = expectOk(res); expect(data).toEqual({...})`
- `expect(res.body.X)` → `expect(res.body.data.X)`（或先 `const data = expectOk(res)`）
- `.expect(400)` / `.expect(401)` / `.expect(403)` / `.expect(409)` / `.expect(500)` → `.expect(200)` + `expectBizError(res, <原 status>, /optional msg/)`

每个 spec 头部加 import:

```ts
import { expectOk, expectBizError } from './helpers/expect-ok';
```

- [ ] **Step 3: 跑这 4 个 spec → 应该全 PASS**

Run: `pnpm --filter @app/api test:e2e -- reagents stocks ledger purchases`
Expected: 全 PASS。

- [ ] **Step 4: 提交**

```bash
git add apps/api/test/reagents.e2e-spec.ts apps/api/test/stocks.e2e-spec.ts \
        apps/api/test/ledger.e2e-spec.ts apps/api/test/purchases.e2e-spec.ts
git commit -m "test(api): adapt batch 2 e2e (reagents/stocks/ledger/purchases) to wrapped response"
```

---

### Task 7: 改造 api e2e batch 3（requests / reports / audit / prisma / guards）

**注意：** `reports.e2e-spec.ts` 涉及 CSV/Excel 下载断言 — 这些请求**不**包装（返回原始内容），保留原断言形态（直接读 body 字符串 / Content-Type 检查）。

**Files (Modify):**
- `apps/api/test/requests.e2e-spec.ts`
- `apps/api/test/reports.e2e-spec.ts`
- `apps/api/test/audit.e2e-spec.ts`
- `apps/api/test/prisma.e2e-spec.ts`
- `apps/api/test/guards.e2e-spec.ts`

- [ ] **Step 1: 在每个 spec 挂 HttpExceptionFilter**

每个 spec 文件在 `app.useGlobalPipes(...)` 之后追加：

```ts
app.useGlobalFilters(new HttpExceptionFilter());
```

并加 import:

```ts
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
```

- [ ] **Step 2: 机械替换断言（reports 中 CSV/XLSX 下载断言保留原形态）**

规则：
- `expect(res.body).toMatchObject({...})` → `expectOk(res, {...})`
- `expect(res.body).toEqual({...})` → `const data = expectOk(res); expect(data).toEqual({...})`
- `expect(res.body.X)` → `expect(res.body.data.X)`（或先 `const data = expectOk(res)`）
- `.expect(400)` / `.expect(401)` / `.expect(403)` / `.expect(409)` / `.expect(500)` → `.expect(200)` + `expectBizError(res, <原 status>, /optional msg/)`

每个 spec 头部加 import:

```ts
import { expectOk, expectBizError } from './helpers/expect-ok';
```

reports 中识别 download case 的特征是 `?format=csv` / `?format=xlsx` 或 `Content-Type: text/csv` / `Content-Disposition: attachment`，对这些 case：
- 仍 `expect(res.status).toBe(200)`
- 仍 `expect(res.headers['content-disposition'])` 等头断言
- body 仍为原始内容（不解包 `.data`）

- [ ] **Step 3: 跑全套 api e2e → 全 PASS**

Run: `pnpm --filter @app/api test:e2e`
Expected: 全部 spec 全 PASS（含 response-wrapper + batch 1/2/3 + audit/health 等）。

- [ ] **Step 4: api typecheck**

Run: `pnpm --filter @app/api typecheck`
Expected: 0 error。

- [ ] **Step 5: 提交**

```bash
git add apps/api/test/requests.e2e-spec.ts apps/api/test/reports.e2e-spec.ts \
        apps/api/test/audit.e2e-spec.ts apps/api/test/prisma.e2e-spec.ts \
        apps/api/test/guards.e2e-spec.ts
git commit -m "test(api): adapt batch 3 e2e (requests/reports/audit/prisma/guards) to wrapped response"
```

---

### Task 8: web `ApiError` + `apiFetch` 解包

**Files:**
- Create: `apps/web/src/lib/api-error.ts`
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/lib/__tests__/api-client.test.ts`

- [ ] **Step 1: 在 api-client.test.ts 调整现有断言为新形态（先 failing）**

读现有 `apps/web/src/lib/__tests__/api-client.test.ts`，把所有 `json({...})` mock 改成 `json({ code:200, msg:'ok', data: {...} })` 包装形态；apiFetch 成功 case 期望返回 `data` 字段内容（而非整包）。

具体形如：

```ts
// before
const fetchMock = vi.fn().mockResolvedValueOnce(json({ id: 'u1' }));
const result = await apiFetch('/x', { token: 't' });
expect(result).toEqual({ id: 'u1' });

// after
const fetchMock = vi.fn().mockResolvedValueOnce(
  new Response(JSON.stringify({ code: 200, msg: 'ok', data: { id: 'u1' } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }),
);
const result = await apiFetch('/x', { token: 't' });
expect(result).toEqual({ id: 'u1' });
```

并新增一个 case 验证 code !== 200 抛 `ApiError`：

```ts
it('body.code !== 200 抛 ApiError', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(
    new Response(
      JSON.stringify({ code: 409, msg: 'email already registered', data: null }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  await expect(apiFetch('/x')).rejects.toThrow(/email already registered/);
});
```

- [ ] **Step 2: 跑 → 应该失败**

Run: `pnpm --filter @app/web vitest -- api-client`
Expected: FAIL（apiFetch 当前返回整包而非 .data）。

- [ ] **Step 3: 创建 `ApiError`**

Create `apps/web/src/lib/api-error.ts`:

```ts
export class ApiError extends Error {
  constructor(
    public code: number,
    public msg: string,
  ) {
    super(`API ${code}: ${msg}`);
    this.name = 'ApiError';
  }
}
```

- [ ] **Step 4: 改造 `apiFetch` 解包**

Modify `apps/web/src/lib/api-client.ts` 中 `apiFetch` 函数：

```ts
import type { ApiResponse } from '@app/shared';
import { ApiError } from './api-error';
// (其他 import 不动)

export async function apiFetch<T = any>(
  path: string,
  opts: ApiFetchOpts = {},
): Promise<T> {
  const res = await apiFetchRaw(path, opts);
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
  if (res.status === 204) return undefined as T;
  const body = (await res.json()) as ApiResponse<T>;
  if (body.code === 200) return body.data as T;
  throw new ApiError(body.code, body.msg);
}
```

(其他文件部分保持不变)

- [ ] **Step 5: 跑 → 应该 PASS**

Run: `pnpm --filter @app/web vitest -- api-client`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/lib/api-error.ts apps/web/src/lib/api-client.ts \
        apps/web/src/lib/__tests__/api-client.test.ts
git commit -m "feat(web): apiFetch unwraps {code,msg,data} body, throws ApiError on biz error"
```

---

### Task 9: web `apiFetchRaw` 401 peek + ChangePasswordDialog 401 适配 + vitest mock 改造

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/lib/__tests__/api-client.test.ts` (追加 401 peek case)
- Modify: `apps/web/src/components/profile/ChangePasswordDialog.tsx`
- Modify: `apps/web/src/components/profile/__tests__/ChangePasswordDialog.test.tsx`
- Modify: `apps/web/src/components/profile/__tests__/ProfileSheet.test.tsx`
- Modify: `apps/web/src/app/(app)/admin/users/__tests__/page.test.tsx` (若有 fetch mock)
- 其他存在 fetch mock 的 vitest 文件视情况

- [ ] **Step 1: 在 api-client.test.ts 加 failing case — body.code=401 触发 refresh**

```ts
it('body.code=401 触发 tryRefresh, refresh 成功后用新 token 重试', async () => {
  useAuth.setState({
    tokens: { accessToken: 'old', refreshToken: 'r1' } as any,
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 401, msg: 'expired', data: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    .mockResolvedValueOnce(
      // refresh endpoint 也已包装
      new Response(
        JSON.stringify({
          code: 200,
          msg: 'ok',
          data: { accessToken: 'new', refreshToken: 'r2' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 200, msg: 'ok', data: { ok: true } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  vi.stubGlobal('fetch', fetchMock);

  const r = await apiFetch('/me', { token: 'old' });
  expect(r).toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  // 最后一次用 new token
  const lastCall = fetchMock.mock.calls[2][1] as RequestInit;
  expect((lastCall.headers as any).Authorization).toBe('Bearer new');
});
```

- [ ] **Step 2: 跑 → 应该失败（apiFetchRaw 当前看 res.status=401, 此处是 200）**

Run: `pnpm --filter @app/web vitest -- api-client`
Expected: FAIL。

- [ ] **Step 3: 改造 `apiFetchRaw` 内 401 检测为 peek body.code**

Modify `apps/web/src/lib/api-client.ts` 中 `apiFetchRaw`：

```ts
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
  if (opts.token && res.status === 200) {
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const peek = await res.clone().json().catch(() => null as any);
      if (peek?.code === 401) {
        const newToken = await tryRefresh();
        if (newToken) {
          res = await doFetch(newToken);
        } else {
          useAuth.getState().clear();
          if (typeof window !== 'undefined')
            window.location.href = '/login';
        }
      }
    }
  }
  return res;
}
```

**关键**：只在 `Content-Type: application/json` 时 peek；下载流（CSV/XLSX）不消耗 body。

- [ ] **Step 4: 同时调整 `tryRefresh` 解包 refresh endpoint 也已包装**

在 `tryRefresh` 中：

```ts
// 旧: const data = (await res.json()) as AuthTokens;
const body = await res.json();
if (body?.code !== 200) return null;
const data = body.data as AuthTokens;
```

- [ ] **Step 5: 跑 api-client.test.ts → PASS**

Run: `pnpm --filter @app/web vitest -- api-client`
Expected: PASS（含新 case）。

- [ ] **Step 6: 改造 ChangePasswordDialog 401 处理**

Modify `apps/web/src/components/profile/ChangePasswordDialog.tsx` `onSubmit` 中：

```ts
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
  if (!res.ok) {
    toast.error(`修改失败 (${res.status})`);
    return;
  }
  const body = await res.json();
  if (body.code === 401) {
    form.setError('currentPassword', { message: '当前密码不正确' });
    return;
  }
  if (body.code !== 200) {
    toast.error(body.msg ?? '修改失败');
    return;
  }
  const data = body.data as AuthTokens;
  setTokens(data);
  toast.success('密码已修改，其他设备需要重新登录');
  form.reset();
  onOpenChange(false);
}
```

- [ ] **Step 7: 改造 ChangePasswordDialog.test.tsx 中的 mock 形态**

3 处需要改：

```ts
// "成功" case：
const fetchMock = vi.fn().mockResolvedValueOnce(
  new Response(
    JSON.stringify({
      code: 200,
      msg: 'ok',
      data: { accessToken: 'a2', refreshToken: 'r2' },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ),
);

// "401 当前密码错" case：
const fetchMock = vi.fn().mockResolvedValueOnce(
  new Response(
    JSON.stringify({ code: 401, msg: 'invalid current password', data: null }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ),
);
```

- [ ] **Step 8: 改造 ProfileSheet.test.tsx 中的 mock**

`apps/web/src/components/profile/__tests__/ProfileSheet.test.tsx` 里 "改名 200 成功" 那个 fetchMock：

```ts
const fetchMock = vi.fn().mockResolvedValueOnce(
  new Response(
    JSON.stringify({
      code: 200,
      msg: 'ok',
      data: {
        id: 'u1',
        email: 'admin@lab.local',
        name: '新名字',
        labId: 'lab-1',
        roles: ['SYS_ADMIN', 'LAB_HEAD'],
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ),
);
```

- [ ] **Step 9: 检查其他 vitest mock fetch 是否需要改**

Run: `grep -rn "new Response(JSON.stringify" apps/web/src --include="*.test.*"`

逐一对比每个 mock：
- 若是 mock 业务 api 端点 → 包装为 `{code:200,msg:'ok',data:...}`
- 若是 mock refresh endpoint → 同上
- 若是 mock 错误 status（如 status:401） → 改为 status:200 + body code:401

- [ ] **Step 10: 跑全套 web vitest**

Run: `pnpm --filter @app/web vitest`
Expected: 全套（19+ file / 67+ test）PASS。

- [ ] **Step 11: web typecheck + build**

Run: `pnpm --filter @app/web typecheck && pnpm --filter @app/web build`
Expected: 0 error，build clean。

- [ ] **Step 12: 提交**

```bash
git add apps/web/src/lib/api-client.ts \
        apps/web/src/lib/__tests__/api-client.test.ts \
        apps/web/src/components/profile/ChangePasswordDialog.tsx \
        apps/web/src/components/profile/__tests__/ChangePasswordDialog.test.tsx \
        apps/web/src/components/profile/__tests__/ProfileSheet.test.tsx
# + 任何 step 9 中改到的额外 vitest 文件
git commit -m "feat(web): apiFetchRaw peeks body.code=401 for refresh; ChangePasswordDialog reads wrapped 401; vitest mocks adapt to wrapper"
```

---

### Task 10: miniapp `apiRequest` 适配 + 最终验证 + 收尾

**Files:**
- Modify: `apps/miniapp/src/lib/api-client.ts`

- [ ] **Step 1: 改造 miniapp apiRequest 解包 + code=401 跳 login**

Modify `apps/miniapp/src/lib/api-client.ts`:

```ts
import Taro from '@tarojs/taro';
import type { ApiResponse } from '@app/shared';
import { useAuth } from './auth-store';

export const apiBaseUrl =
  (process.env.TARO_APP_API_BASE as string | undefined) ??
  'http://localhost:3001/api/v1';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function apiRequest<T = any>(
  path: string,
  opts: { method?: Method; data?: any } = {},
): Promise<T> {
  const { tokens, clear } = useAuth.getState();
  const res = await Taro.request<ApiResponse<T>>({
    url: `${apiBaseUrl}${path}`,
    method: opts.method ?? 'GET',
    data: opts.data,
    header: {
      'Content-Type': 'application/json',
      ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    },
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`API ${res.statusCode}`);
  }
  const body = res.data as ApiResponse<T>;
  if (body.code === 401) {
    clear();
    Taro.reLaunch({ url: '/pages/login/index' });
    throw new Error('未登录或会话失效');
  }
  if (body.code !== 200) {
    throw new Error(body.msg || `API code ${body.code}`);
  }
  return body.data as T;
}
```

- [ ] **Step 2: miniapp typecheck**

Run: `pnpm --filter @app/miniapp typecheck`
Expected: 0 error。

- [ ] **Step 3: shared 重新 build（确保所有下游消费类型）**

Run: `pnpm --filter @app/shared build && pnpm --filter @app/api typecheck && pnpm --filter @app/web typecheck && pnpm --filter @app/miniapp typecheck`
Expected: 全 0 error。

- [ ] **Step 4: 跑全套 api e2e（最终回归）**

Run: `pnpm --filter @app/api test:e2e`
Expected: 全套通过。

- [ ] **Step 5: 跑全套 web vitest（最终回归）**

Run: `pnpm --filter @app/web vitest`
Expected: 全套通过。

- [ ] **Step 6: 跑 web build（最终回归）**

Run: `pnpm --filter @app/web build`
Expected: build clean。

- [ ] **Step 7: 手动 smoke 验证**

启动 docker 化 / 本地 api + web，确认下述场景：
1. 登录失败 → toast 显示后端 msg（不是 "HTTP 401: ..."）
2. 参数校验失败（如注册时空 name）→ toast 显示拼接的 message
3. 报表 CSV/Excel 下载 → 文件正常下载（response body 未被包装、Content-Disposition 完整）
4. 401 自动 refresh → 长时间空闲后操作，access token 过期后无感刷新
5. 修改密码当前密码错 → currentPassword 字段红字 "当前密码不正确"（不跳 /login）
6. 修改密码成功 → 本会话保持登录、其他设备失效

- [ ] **Step 8: 提交 + 打 tag**

```bash
git add apps/miniapp/src/lib/api-client.ts
git commit -m "feat(miniapp): apiRequest unwraps {code,msg,data} body, code=401 reLaunch login"
git tag unified-response-complete
```

---

## 影响面执行清单

| Task | 影响面 | 风险 | TDD 失败点 |
|---|---|---|---|
| T1 | shared 1 文件 + test helper | 低 | n/a (type-only) |
| T2 | api decorator 1 文件 | 低 | n/a (trivial) |
| T3 | api ResponseInterceptor + app.module wire | 中 | response-wrapper.e2e:health |
| T4 | api HttpExceptionFilter + main.ts | 中 | response-wrapper.e2e:error cases |
| T5 | api e2e batch 1 (6 spec) | 中（机械） | 各 spec 红 → 转 expectOk |
| T6 | api e2e batch 2 (4 spec) | 中（机械） | 各 spec 红 → 转 expectOk |
| T7 | api e2e batch 3 (5 spec) + reports 下载豁免 | 中 | 各 spec 红 → 转 expectOk |
| T8 | web apiFetch + ApiError | 中 | api-client.test 解包用例 |
| T9 | web apiFetchRaw 401 peek + ChangePassDialog + vitest mock 批量 | 中 | 401 peek case + dialog 401 case |
| T10 | miniapp apiRequest + 全栈验证 + tag | 低 | n/a (最终回归) |

总计 **10 commits**（每 task 一个 commit，T5/T6/T7 可能更多）。

## 验收检查

完成全部 tasks 后必须：

- [ ] `pnpm --filter @app/api test:e2e` 全 PASS（含 response-wrapper.e2e + 15 spec）
- [ ] `pnpm --filter @app/web vitest` 全 PASS（19+ file / 67+ test）
- [ ] `pnpm --filter @app/api typecheck` 0 error
- [ ] `pnpm --filter @app/web typecheck` 0 error
- [ ] `pnpm --filter @app/miniapp typecheck` 0 error
- [ ] `pnpm --filter @app/shared build` clean
- [ ] `pnpm --filter @app/web build` clean，shared bundle ±1 kB
- [ ] 手动 smoke 6 场景通过（T10 Step 7）
- [ ] git tag `unified-response-complete` 已打
- [ ] memory 已更新 `project_unified_response_status.md`
