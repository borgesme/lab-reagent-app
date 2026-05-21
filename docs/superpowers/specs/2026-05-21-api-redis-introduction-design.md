# apps/api 引入 Redis（第一刀：access jti 黑名单 + 通用限流装饰器）

- 日期：2026-05-21
- 范围：`apps/api`
- 状态：design 完成，待 implementation plan

## 1. 目标

给 `apps/api` 引入 Redis 基础设施层，**首期只解决两件事**：

1. **access token 撤销**：用户登出 / 改密 / 管理员踢人后，旧 access token 立即失效（当前实现仅靠 `tokenVersion` 自增，access TTL 15min 内仍可用）
2. **登录接口限流**：基于 IP 和账号双维度，防止暴力探测；机制做成通用 `@RateLimit()` 装饰器，后续可随时贴到任何 handler 上

显式不做（YAGNI，等真有需要再开新 spec）：

- 通用响应缓存层
- BullMQ 异步任务队列
- 分布式锁 / 幂等键
- refresh token 也搬去 Redis（refresh 继续靠 PG `currentRefreshJti`）

## 2. 现状

- NestJS 10 模块化，已有 `src/common/{filters,guards,interceptors,strategies}/` 同构目录约定
- `docker-compose.yml` 中 `redis:7` 容器已存在，`.env.example` 已留 `REDIS_URL=redis://localhost:6379`，代码完全未消费
- 当前 auth：`tokenVersion` + `currentRefreshJti` 存 PG；access payload 只有 `{sub, roles, ver}`，**无 `jti`**
- 全局响应包装：`{code:HTTP_STATUS, msg, data}`，HTTP 永远 200（`HttpExceptionFilter` + `ResponseInterceptor`）
- 已有 `JWT_ALLOW_LEGACY_CLAIMS` 兼容开关，本次复用

## 3. 架构

```
                ┌───────────────────────────────┐
                │ AppModule                     │
                │  └ RedisModule (@Global)      │── 一份 ioredis 单例
                ├───────────────────────────────┤
HTTP ─► RateLimitGuard ─► JwtAuthGuard ─► (BL check) ─► RolesGuard ─► Controller
              │                              │
              ▼                              ▼
        RedisService                    RedisService
   INCR rl:<scope>:<key>            GET bl:<jti>
   EXPIRE …（仅首次）
              │                              │
              └────────── 失败时 fail-open ──┘
                       warn 日志 + 放行
```

- `RedisModule` 在 `src/common/redis/`，`@Global()`，整个 app 共享一份 ioredis 客户端
- `RateLimitGuard` **全局注册且放在 providers 数组首位**，先于 JwtAuthGuard 执行——只对带 `@RateLimit()` 装饰器的 handler 起作用，未装饰直接放行；这样登录这种 `@Public()` 接口也能在 JWT 验签前拦截，且受保护接口被限流时不浪费 jwt 验签
- `JwtAuthGuard` 在 `super.canActivate()` 通过后多一步：取 `payload.jti` 查 `bl:<jti>`，命中即 401
- 客户端：**ioredis** + 手写 RedisModule（不使用 `@nestjs-modules/ioredis` 等社区包）

## 4. 组件 + 文件清单

### 4.1 新增文件

**`src/common/redis/redis.constants.ts`**
```ts
export const REDIS_KEYS = {
  blacklist: (jti: string) => `bl:${jti}`,
  rateLimit: (scope: string, key: string) => `rl:${scope}:${key}`,
} as const;
```

**`src/common/redis/redis.service.ts`** — 包装 ioredis
- 构造：`ConfigService.getOrThrow('REDIS_URL')` + `new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 1, enableOfflineQueue: false, commandTimeout: 500, keyPrefix: REDIS_KEY_PREFIX })`
- 监听 `'ready'`、`'error'`、`'end'` 事件维护 `private ready: boolean`
- 暴露：`isReady(): boolean`
- 透传薄方法 `get / set / incr / expire / del / ttl`：每个 try/catch，捕获后 pino warn `{component:'redis', op, key, err}`，并：
  - read 类（`get`、`ttl`、`incr`）失败返回 `null`
  - write 类（`set`、`del`、`expire`）失败返回 `false`
- `onModuleDestroy()` → `client.quit()`
- 测试钩子 `__disable() / __enable()`：仅 `process.env.NODE_ENV === 'test'` 可用，调用即把 `ready` 拨成对应值

**`src/common/redis/redis.module.ts`**
```ts
@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
```

**`src/common/decorators/rate-limit.decorator.ts`**
```ts
export const RATE_LIMIT_KEY = 'rateLimit';
export interface RateLimitOptions {
  scope: string;                  // 'auth:login:ip'
  limit: number;                  // 10
  windowSec: number;              // 60
  keyBy?: 'ip' | 'ip+body';       // 默认 'ip'
  bodyField?: string;             // keyBy='ip+body' 时必填
}
export const RateLimit = (opts: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, opts);
```

支持同一 handler 多次装饰：Reflector 用 `getAllAndMerge` 拿到 `RateLimitOptions[]`，guard 内逐条 incr，任一超限即抛 429。

**`src/common/guards/rate-limit.guard.ts`** — 全局守卫
- `canActivate(ctx)`：
  1. `RATE_LIMIT_ENABLED !== '1'` → `return true`
  2. `getAllAndMerge(RATE_LIMIT_KEY, [handler, class])` 取 `RateLimitOptions[]`，空数组 → `return true`
  3. `redis.isReady() === false` → warn `{component:'rateLimit', scope, reason:'redis_down'}`，放行
  4. for each opt：
     - 计算 keyComponent：`keyBy='ip'` → `req.ip || 'unknown'`；`keyBy='ip+body'` → `req.ip + ':' + (req.body?.[opt.bodyField!] ?? '__missing__')`，缺字段时 warn
     - `redisKey = REDIS_KEYS.rateLimit(opt.scope, keyComponent)`
     - `n = await redis.incr(redisKey)`；`n === null` → fail-open 跳过此条
     - `n === 1` → `await redis.expire(redisKey, opt.windowSec)`（失败 warn，仍继续）
     - `n > opt.limit` → `retryAfter = (await redis.ttl(redisKey)) ?? opt.windowSec`；设置 response header `Retry-After: <retryAfter>`；`throw new HttpException('too many requests', 429)`

### 4.2 改动文件

**`src/modules/auth/auth.service.ts`**
- `issueTokens()`：access 也签 `jti = randomUUID()`（refresh 沿用现有 jti）；payload 变为 `{sub, roles, ver, jti}`
- 新增 `async logout(jti: string, exp: number): Promise<{ok: true}>`：
  - `ttl = exp - Math.floor(Date.now()/1000)`；`ttl <= 0` → 直接 `return {ok:true}`
  - `await redis.set(REDIS_KEYS.blacklist(jti), '1', 'EX', ttl)`
  - 写失败仅 warn，仍返回 `{ok:true}`（语义：前端能继续清 token，最坏情况旧 access 在剩余 ≤15min 内仍可用）

**`src/modules/auth/auth.controller.ts`**
- `@Post('login')` 叠两个装饰器：
  - `@RateLimit({ scope:'auth:login:ip',      keyBy:'ip',                          limit:10, windowSec:60 })`
  - `@RateLimit({ scope:'auth:login:account', keyBy:'ip+body', bodyField:'email', limit:5,  windowSec:60 })`
- 新增 `@Post('logout')`：`async logout(@Req() req)` → `authService.logout(req.user.jti, req.user.exp)`
- `@Post('logout')` 上加 `@RateLimit({ scope:'auth:logout:ip', limit:30, windowSec:60 })`

**`src/common/strategies/jwt.strategy.ts`**
- `validate(payload)` 返回值额外带上 `jti`、`exp`，用于后续 guard / logout

**`src/common/guards/jwt.guard.ts`**
- override `canActivate`：先 `await super.canActivate()`；通过后从 `request.user` 取 `jti`
  - 无 `jti`（legacy access）→ 复用 `JWT_ALLOW_LEGACY_CLAIMS` 开关：`'1'` 放行；否则 401
  - `hit = await redis.get(REDIS_KEYS.blacklist(jti))`
    - `hit === '1'` → `throw new UnauthorizedException('token revoked')`
    - `hit === null` 或其他值 → 放行（fail-open + 脏数据兜底）

**`src/app.module.ts`**
- imports 加 `RedisModule`
- providers 数组**最前面**追加 `{ provide: APP_GUARD, useClass: RateLimitGuard }`，使其先于 `JwtAuthGuard` 执行（理由见第 3 节架构说明）

**`src/main.ts`**
- 启用 `app.set('trust proxy', 1)`，让 `req.ip` 在反向代理后仍可用

**`src/health/health.controller.ts`**
- 注入 `RedisService`，返回体改为 `{ status:'ok', redis: redisService.isReady() ? 'up' : 'down' }`；redis down 不影响整体 200

### 4.3 env / 配置

`apps/api/.env.example` 增补：
```
REDIS_URL=redis://localhost:6379    # 已存在
REDIS_KEY_PREFIX=lab:                # 新增
REDIS_FAIL_OPEN=1                    # 新增，调试用
RATE_LIMIT_ENABLED=1                 # 新增，整体开关
```

## 5. 数据流

### 5.1 登录（含限流）

```
POST /api/v1/auth/login { email, password }
  → RateLimitGuard:
      读到 2 份 RateLimitOptions (ip + ip+email)
      若 RATE_LIMIT_ENABLED=0 或 redis down → 放行
      对每条 INCR + EXPIRE，任一 > limit 即 429（带 Retry-After header）
  → JwtAuthGuard: @Public() 路由跳过
  → AuthController.login → AuthService.login:
      Prisma 查 user + bcrypt 比对
      issueTokens(sub, roles, ver):
        accessJti  = randomUUID()
        refreshJti = randomUUID()
        access  = sign({sub, roles, ver, jti:accessJti},  TTL=15m)
        refresh = sign({sub, roles, ver, jti:refreshJti}, TTL=7d)
        UPDATE user SET currentRefreshJti = refreshJti
        return { accessToken, refreshToken }
  → ResponseInterceptor 包 {code:200, data:{...}}
```

### 5.2 受保护请求（含黑名单查询）

```
GET /api/v1/users/me  Authorization: Bearer <access>
  → RateLimitGuard: 无装饰器 → 放行（0 次 redis 调用）
  → JwtAuthGuard:
      super.canActivate() 验签 + 写 req.user
      const { jti } = req.user
      if !jti:
        JWT_ALLOW_LEGACY_CLAIMS='1' → 放行；否则 401
      hit = redis.get(REDIS_KEYS.blacklist(jti))
        null（失败或未命中）→ 放行（fail-open）
        '1'  → 401 'token revoked'
        其他 → 放行（脏数据兜底）
  → RolesGuard → Controller
```

### 5.3 logout（写黑名单）

```
POST /api/v1/auth/logout  Authorization: Bearer <access>
  → RateLimitGuard: scope='auth:logout:ip', limit=30, windowSec=60
  → JwtAuthGuard 验签通过, req.user = {sub, roles, ver, jti, exp}
  → AuthController.logout(req)
    → AuthService.logout(req.user.jti, req.user.exp):
        ttl = exp - now
        if ttl <= 0: return {ok:true}
        ok = redis.set(REDIS_KEYS.blacklist(jti), '1', 'EX', ttl)
          true  → 加黑成功
          false → warn 日志，仍 return {ok:true}（接受 ≤15min 安全降级窗口）
  → ResponseInterceptor → {code:200, data:{ok:true}}
```

不动 refresh：完整登出仍需前端同时清除 access + refresh。这是首期边界。

## 6. 错误处理（合并表）

### 6.1 RedisService 内部

| 触发 | 处置 | 调用方观察到 |
|---|---|---|
| 启动连不上 | ioredis 自动重连；`ready=false` | `isReady()===false`，操作返回 null/false |
| 操作时连接断 | catch err，warn 日志 | read → `null`；write → `false` |
| 操作超时（>500ms） | `commandTimeout` 触发 | 同上 |
| `REDIS_URL` 未配 | 启动时抛 `ConfigService.getOrThrow` | API 起不来（明确而非静默） |

设计取舍：RedisService 内部把所有 ioredis 异常吃成 null/false，调用方靠返回值判断。`null` 在黑名单/限流语义下等价于"放行"，可接受；将来做 cache 需要区分时再加 `getStrict()`。

### 6.2 JwtAuthGuard

| Case | 处置 |
|---|---|
| 无 `jti`（legacy） | `JWT_ALLOW_LEGACY_CLAIMS='1'` 放行；否则 401 |
| `redis.get=null` | 放行（fail-open） |
| `redis.get='1'` | 401 `token revoked` |
| `redis.get=other` | 放行（脏数据兜底） |

### 6.3 RateLimitGuard

| Case | 处置 |
|---|---|
| 无装饰器 / `RATE_LIMIT_ENABLED=0` | 放行，0 次 redis 调用 |
| `redis.isReady=false` | warn + 放行 |
| `incr=null` | 视为放行 |
| `incr=1`，`expire=false` | warn 但放行（极少数情况下 key 可能驻留，影响轻微） |
| `incr > limit` | 429 + `Retry-After` header |
| `keyBy='ip+body'` 缺字段 | 用 `__missing__` 占位 + warn |
| 取不到 IP | fallback 到 `'unknown'`，仍走限流 |

### 6.4 AuthService.logout

| Case | 处置 |
|---|---|
| `ttl<=0` | 不写 redis，返回 `{ok:true}` |
| `redis.set=false` | warn 日志，仍返回 `{ok:true}` |
| 同一 jti 重复 logout | `SET` 幂等，覆盖 |

### 6.5 错误响应统一形态

沿用现有 `HttpExceptionFilter`，HTTP 永远 200，body：

```json
// 429
{ "code": 429, "msg": "too many requests", "data": null }
// 401 被黑
{ "code": 401, "msg": "token revoked", "data": null }
```

`Retry-After` 只通过 HTTP header 返回，**不放 body**。

### 6.6 其他边界

- `bl:` key 用 `SET ... EX ttl`，TTL = access 剩余寿命，无需兜底清理
- `rl:` key 短 TTL 自然消失
- 多实例：INCR / SET 都是 redis 原子，无竞态
- 测试清场：e2e `beforeEach` 调 `redis.flushdb()`（限定 db 0）

## 7. 测试策略

> **注意：apps/api 工程本身没有任何 `*.spec.ts` 单测文件，全部走 e2e（`*.e2e-spec.ts`）。本期沿用此约定，不引入 unit spec。**

### 7.1 e2e（test/jest-e2e.json，需真 redis）

新增 `test/auth-redis.e2e-spec.ts`：

- `beforeAll`：`PING` redis，500ms 超时；失败则 `describe.skip` 整文件并 console.warn
- `beforeEach`：`redis.flushdb()`
- 用例：
  - logout 后旧 access 立即 401 `TOKEN_REVOKED`
  - logout 时 `RedisService.__disable()`：返回 200，旧 access 仍可用（fail-open 验证）
  - login 同 IP 60s 内第 11 次 → 429 + `Retry-After` header
  - login 同 email 60s 内第 6 次 → 429（先于 IP 触发）
  - login 不同 email 同 IP 第 10 次 → 200（IP 桶未满）
  - GET /users/me 无 `@RateLimit`：任意频率都 200
  - access 被黑后，refresh 仍能换出新 access（refresh 不受 access 黑名单影响）

预计 1 个 e2e spec 文件、7 个 it，< 5s 内跑完。

### 7.2 跳过策略

沿用现有"redis 没连上跳过"策略（与 `project_p7_status.md` 的 3 self-skip 一致）。CI 无 redis 时整文件 skip，不爆红；本地 `docker compose up redis` 即可全跑。

### 7.3 不写的测试（YAGNI）

- 不写 unit spec（沿用现有约定）
- 不写 redis 性能 / 吞吐测试
- 不写重连后限流计数器是否归零的测试（redis 实现细节）
- 不写 ioredis-mock 全套替身（真 redis e2e 已够）

## 8. 验收清单

实现完成时必须全部通过：

- `pnpm --filter @app/api test:e2e` 起 redis 时新文件 7/7 pass；不起 redis 时新文件整体 skip，旧 137 个仍绿
- `pnpm --filter @app/api build` 无新增 ts error
- 手动验证：起 redis + curl 登录 → logout → 旧 access 立即 401；连打 11 次登录 → 第 11 次 429
- `.env.example` 同步增补 3 个新变量

## 9. 后续展望（非本期）

- 通用响应缓存：reports / 字典等热读接口
- BullMQ 异步任务队列：导出 Excel / CSV、批量告警扫描
- 分布式锁 / 幂等键：多副本部署时给定时任务和 POST 接口防重
- access + refresh 完整 redis 化 + 移除 PG `currentRefreshJti` 字段

这些功能都会复用本期建立的 `RedisService` 和 `RedisModule`，无需再加 redis 客户端依赖。
