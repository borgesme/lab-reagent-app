# 统一响应包装设计

> 日期: 2026-05-11 · 作者: brainstorm session

## 1. 目标

在 NestJS `/api/v1/*` 全路由上引入统一响应包装 `{ code, msg, data }`：

- `code: number` — `200` 表示成功；`4xx/5xx` 表示业务/系统错误
- `msg: string` — 成功默认 `"ok"`；错误为可显示消息
- `data: T | null` — 成功为业务数据；错误为 `null`

成功与失败 **均以 HTTP 200 返回**，错误语义完全由 `code` 表达。

## 2. 关键决策

| 决策 | 选项 | 说明 |
|---|---|---|
| HTTP 状态语义 | **业务错误 HTTP 200，code 区分** | 与国内主流约定一致；前端不再依赖 `res.ok` |
| 错误码体系 | **只用 HTTP 标准码** (200/400/401/403/404/409/500) | NestJS 内置 Exception 直接映射，DX 好 |
| 下载豁免 | **interceptor 自动识别** | 业务代码零侵入；判定条件见 §3.1 |
| 改造节奏 | **一次性 + 同步测试** | 中间状态不部署 |
| 401 表达 | **HTTP 200 + body.code=401** | 与"全部 200"语义一致 |
| 成功 msg | **默认 "ok" + `@ResponseMsg('xxx')` 装饰器可覆盖** | 装饰器仅在需自定义时使用 |
| 包装范围 | **全局生效**（含 `/health`） | 单一规则，零例外 |
| 401 检测 | **`res.clone()` peek body.code** | 不引入响应头 metadata |

## 3. 架构

### 3.1 ResponseInterceptor（新）

文件：`apps/api/src/common/interceptors/response.interceptor.ts`

注册：`main.ts` 全局 `useGlobalInterceptors`（顺序：`AuditInterceptor` → `ResponseInterceptor`）

行为：

```ts
intercept(ctx, next) {
  return next.handle().pipe(
    map(data => {
      // 自动豁免：保留原始返回
      if (data instanceof StreamableFile) return data;
      if (Buffer.isBuffer(data)) return data;
      if (typeof data === 'string') return data;          // CSV exporter
      const res = ctx.switchToHttp().getResponse();
      if (res.getHeader('content-disposition')) return data;

      // @ResponseMsg('xxx') 覆盖（reflector 读取）
      const msg = this.reflector.get(RESPONSE_MSG_KEY, ctx.getHandler()) ?? 'ok';
      return { code: 200, msg, data: data ?? null };
    })
  );
}
```

**注意**：执行顺序保证 `AuditInterceptor` 在前，则 audit `tap` 拿到的仍是裸 service 返回值，`after.id` 逻辑零改动。

### 3.2 HttpExceptionFilter（新）

文件：`apps/api/src/common/filters/http-exception.filter.ts`

注册：`main.ts` 全局 `useGlobalFilters`

行为：

```ts
catch(exception, host) {
  const res = host.switchToHttp().getResponse();

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const r = exception.getResponse() as any;
    const msg = typeof r === 'string' ? r : (r?.message ?? exception.message);
    // class-validator 的 message 是数组，取首条；或 join('; ')
    const flatMsg = Array.isArray(msg) ? msg.join('; ') : String(msg);
    return res.status(200).json({ code: status, msg: flatMsg, data: null });
  }

  // 非 HttpException：日志 + 500
  this.logger.error(exception);
  res.status(200).json({ code: 500, msg: 'internal error', data: null });
}
```

**HTTP 状态恒为 200**（包括 5xx 业务错误）。

### 3.3 `@ResponseMsg(msg)` 装饰器（新）

文件：`apps/api/src/common/decorators/response-msg.decorator.ts`

简单 metadata setter，ResponseInterceptor 用 reflector 读取。
**默认 controller 无需使用**，仅在需 `msg: "xxx"` 时标记（如 `'created'`、`'updated'`）。

### 3.4 共享类型

文件：`packages/shared/src/api-types.ts`

```ts
export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T | null;
}
```

## 4. Web 端改造

### 4.1 `ApiError`（新）

文件：`apps/web/src/lib/api-error.ts`

```ts
export class ApiError extends Error {
  constructor(public code: number, public msg: string) {
    super(`API ${code}: ${msg}`);
    this.name = 'ApiError';
  }
}
```

### 4.2 `apiFetch` 解包

文件：`apps/web/src/lib/api-client.ts`

```ts
export async function apiFetch<T = any>(path, opts): Promise<T> {
  const res = await apiFetchRaw(path, opts);
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`); // 网络/传输级
  if (res.status === 204) return undefined as T;
  const body = (await res.json()) as ApiResponse<T>;
  if (body.code === 200) return body.data as T;
  throw new ApiError(body.code, body.msg);
}
```

### 4.3 `apiFetchRaw` 中 401 改为 peek body

```ts
let res = await doFetch(opts.token);
// 401 现在走 HTTP 200 + body.code=401，需要 clone 后 peek
if (opts.token && res.status === 200) {
  const peek = await res.clone().json().catch(() => null);
  if (peek?.code === 401) {
    const newToken = await tryRefresh();
    if (newToken) {
      res = await doFetch(newToken);
    } else {
      useAuth.getState().clear();
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
  }
}
return res;
```

**注意**：`ChangePasswordDialog` 当前直接使用 raw `fetch`（避开 apiFetch 的 401→refresh 流程），其 401 处理逻辑需改为：检查 `body.code === 401` 而非 `res.status === 401`。

### 4.4 refresh endpoint 本身

`auth/refresh` 也被包装：`body.code === 200` 时 `body.data` 为 `{ accessToken, refreshToken }`。`tryRefresh` 中改 `const data = (await res.json()).data as AuthTokens;`。

## 5. Miniapp 改造

文件：`apps/miniapp/src/lib/api-client.ts`

```ts
const res = await Taro.request<ApiResponse<T>>({...});
if (res.statusCode < 200 || res.statusCode >= 300) {
  throw new Error(`API ${res.statusCode}`);
}
const body = res.data;
if (body.code === 401) {
  clear(); Taro.reLaunch({ url: '/pages/login/index' });
  throw new Error('未登录或会话失效');
}
if (body.code !== 200) throw new Error(body.msg);
return body.data;
```

## 6. 测试改造

### 6.1 API e2e

新增辅助：`apps/api/test/helpers/expect-ok.ts`

```ts
export function expectOk<T>(res: { body: any }, matcher?: Partial<T>) {
  expect(res.body.code).toBe(200);
  if (matcher !== undefined) expect(res.body.data).toMatchObject(matcher);
  return res.body.data as T;
}
export function expectBizError(res, code: number, msgMatch?: string | RegExp) {
  expect(res.body.code).toBe(code);
  if (msgMatch) expect(res.body.msg).toMatch(msgMatch);
}
```

所有 spec：
- `expect(res.body).toMatchObject({...})` → `expectOk(res, {...})`
- `expect(res.body.field)` → `expect(res.body.data.field)` 或先 `const data = expectOk(res)` 再用 `data.field`
- HTTP 状态断言：原 `.expect(401)` 改为先确认 `expect(res.status).toBe(200); expectBizError(res, 401)`

涉及 15 spec / ~88 处断言。

### 6.2 Web vitest

所有 `json({...})` mock 形态：
```ts
// before
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, ... });
// after
const json = (data, code = 200, msg = 'ok') =>
  new Response(JSON.stringify({ code, msg, data }), { status: 200, ... });
```

涉及 ~18 处。`ChangePasswordDialog.test.tsx` 中的 `new Response('unauth', { status: 401 })` 改为 `json(null, 401, '当前密码不正确')`。

## 7. 影响面汇总

| 区域 | 文件/处数 | 风险 |
|---|---|---|
| api ResponseInterceptor 新增 | 1 文件 | 低 |
| api HttpExceptionFilter 新增 | 1 文件 | 低 |
| api @ResponseMsg 装饰器新增 | 1 文件 | 低 |
| api main.ts 注册 | 1 文件 | 低 |
| api AuditInterceptor | 0 改动（依赖顺序） | 低 |
| reports 文件下载 | 0 改动（自动豁免） | 低 |
| shared `ApiResponse<T>` | 1 文件 | 低 |
| web `ApiError` 新增 | 1 文件 | 低 |
| web `apiFetch` 改造 | 1 文件 | 中 |
| web `apiFetchRaw` 401 改 peek | 1 文件 | 中 |
| web `ChangePasswordDialog` 401 字段错 | 1 文件 | 低 |
| miniapp `apiRequest` | 1 文件 | 低 |
| api e2e 断言 | ~88 处 / 15 文件 | 中（量大但机械） |
| web vitest mock 形态 | ~18 处 / 多文件 | 中 |

## 8. 验收标准

完成后必须满足：

1. **api e2e** 全部通过（115+ test，含原有 + 改造后）
2. **web vitest** 全部通过（67+ test）
3. **api/web tsc** 0 错
4. **shared / web build** clean，bundle 大小持平 ±1 kB
5. 手动验证：
   - 登录失败：返回 HTTP 200 + body.code=401
   - 参数校验失败：HTTP 200 + body.code=400
   - 报表 CSV/Excel 下载：HTTP 200 + 原始文件流（**未包装**）
   - 401 自动 refresh：apiFetchRaw 偷看到 code=401 触发 refresh，refresh 成功后重发
   - changePassword 当前密码错：弹 currentPassword 字段错误（不跳 /login）

## 9. 不在范围内

- 错误码扩展为业务码（如 1001=邮箱重复）— 未来需要时再加
- 分页响应包装（list 接口仍裸数组）— 不在本次改造
- 国际化 msg — 仍是后端硬编码英文/中文
- 响应头 X-Biz-Code 等额外元数据 — 不引入
- traceId / 全链路追踪 — 不在本次改造
